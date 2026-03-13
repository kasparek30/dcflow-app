// app/api/qbo/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../admin-db"; // ✅ adjust if your admin-db path differs

function getPublicBaseUrl(request: NextRequest): string {
  const envBase = process.env.APP_BASE_URL;
  if (envBase && envBase.startsWith("http")) return envBase;

  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) return `${proto}://${host}`;

  return "https://dcflow.app";
}

function nowIso() {
  return new Date().toISOString();
}

function isoPlusSeconds(seconds: number) {
  const d = new Date();
  d.setSeconds(d.getSeconds() + Math.max(0, Number(seconds) || 0));
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const tokenUrl =
      process.env.QBO_TOKEN_URL ||
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        {
          error:
            "Missing QBO_CLIENT_ID, QBO_CLIENT_SECRET, or QBO_REDIRECT_URI in environment variables.",
        },
        { status: 500 }
      );
    }

    const baseUrl = getPublicBaseUrl(request);

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const realmId = (searchParams.get("realmId") || "").trim();
    const oauthError = searchParams.get("error");

    if (oauthError) {
      return NextResponse.redirect(
        new URL(
          `/settings/integrations/quickbooks?error=${encodeURIComponent(oauthError)}`,
          baseUrl
        )
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations/quickbooks?error=Missing%20code%20or%20state",
          baseUrl
        )
      );
    }

    const savedState = request.cookies.get("dcflow_qbo_oauth_state")?.value;
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations/quickbooks?error=OAuth%20state%20mismatch",
          baseUrl
        )
      );
    }

    if (!realmId) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations/quickbooks?error=Missing%20realmId%20from%20Intuit",
          baseUrl
        )
      );
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
      cache: "no-store",
    });

    const rawText = await tokenResponse.text();

    let tokenBody:
      | {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          x_refresh_token_expires_in?: number;
          token_type?: string;
        }
      | { [key: string]: unknown };

    try {
      tokenBody = JSON.parse(rawText);
    } catch {
      tokenBody = { raw: rawText };
    }

    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        new URL(
          `/settings/integrations/quickbooks?error=${encodeURIComponent("Token exchange failed")}`,
          baseUrl
        )
      );
    }

    const accessToken =
      "access_token" in tokenBody && typeof tokenBody.access_token === "string"
        ? tokenBody.access_token
        : "";
    const refreshToken =
      "refresh_token" in tokenBody && typeof tokenBody.refresh_token === "string"
        ? tokenBody.refresh_token
        : "";
    const expiresIn =
      "expires_in" in tokenBody && typeof tokenBody.expires_in === "number"
        ? tokenBody.expires_in
        : 0;
    const refreshExpiresIn =
      "x_refresh_token_expires_in" in tokenBody &&
      typeof tokenBody.x_refresh_token_expires_in === "number"
        ? tokenBody.x_refresh_token_expires_in
        : 0;

    if (!accessToken || !refreshToken) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations/quickbooks?error=Missing%20tokens%20from%20Intuit",
          baseUrl
        )
      );
    }

    const connectedAt = nowIso();
    const scopes = process.env.QBO_SCOPES || "com.intuit.quickbooks.accounting";

    // ✅ SAVE SHARED COMPANY-WIDE CONNECTION
    const db = adminDb();
    await db.collection("integrations").doc("qbo").set(
      {
        realmId,
        accessToken,
        refreshToken,
        expiresAt: isoPlusSeconds(expiresIn || 3600),
        refreshTokenExpiresAt: refreshExpiresIn ? isoPlusSeconds(refreshExpiresIn) : null,
        scopes,
        connectedAt,
        updatedAt: connectedAt,
        source: "qbo_oauth_callback",
      },
      { merge: true }
    );

    const redirectResponse = NextResponse.redirect(
      new URL("/settings/integrations/quickbooks?success=1", baseUrl)
    );

    // Keep cookies (harmless + still useful for admin UI if anything still reads them)
    const cookieBase = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    };

    redirectResponse.cookies.set("dcflow_qbo_access_token", accessToken, {
      ...cookieBase,
      maxAge: expiresIn || 60 * 60,
    });

    redirectResponse.cookies.set("dcflow_qbo_refresh_token", refreshToken, {
      ...cookieBase,
      maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
    });

    redirectResponse.cookies.set("dcflow_qbo_realm_id", realmId, {
      ...cookieBase,
      maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
    });

    redirectResponse.cookies.set("dcflow_qbo_connected_at", connectedAt, {
      ...cookieBase,
      maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
    });

    redirectResponse.cookies.set("dcflow_qbo_scopes", scopes, {
      ...cookieBase,
      maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
    });

    // clear one-time state cookie
    redirectResponse.cookies.set("dcflow_qbo_oauth_state", "", {
      ...cookieBase,
      maxAge: 0,
    });

    return redirectResponse;
  } catch (err: unknown) {
    const baseUrl =
      process.env.APP_BASE_URL?.startsWith("http")
        ? process.env.APP_BASE_URL
        : "https://dcflow.app";

    const message =
      err instanceof Error ? err.message : "QuickBooks callback failed.";

    return NextResponse.redirect(
      new URL(
        `/settings/integrations/quickbooks?error=${encodeURIComponent(message)}`,
        baseUrl
      )
    );
  }
}