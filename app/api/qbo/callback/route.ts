// app/api/qbo/callback/route.ts
import { NextRequest, NextResponse } from "next/server";

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

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const realmId = searchParams.get("realmId");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/settings/integrations/quickbooks?error=${encodeURIComponent(error)}`,
          request.url
        )
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations/quickbooks?error=Missing%20code%20or%20state",
          request.url
        )
      );
    }

    const savedState = request.cookies.get("dcflow_qbo_oauth_state")?.value;

    if (!savedState || savedState !== state) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations/quickbooks?error=OAuth%20state%20mismatch",
          request.url
        )
      );
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );

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
          `/settings/integrations/quickbooks?error=${encodeURIComponent(
            "Token exchange failed"
          )}`,
          request.url
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
          request.url
        )
      );
    }

    const connectedAt = new Date().toISOString();
    const redirectResponse = NextResponse.redirect(
      new URL("/settings/integrations/quickbooks?success=1", request.url)
    );

    redirectResponse.cookies.set("dcflow_qbo_access_token", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn || 60 * 60,
    });

    redirectResponse.cookies.set("dcflow_qbo_refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
    });

    redirectResponse.cookies.set("dcflow_qbo_realm_id", realmId || "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
    });

    redirectResponse.cookies.set("dcflow_qbo_connected_at", connectedAt, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
    });

    redirectResponse.cookies.set(
      "dcflow_qbo_scopes",
      process.env.QBO_SCOPES || "com.intuit.quickbooks.accounting",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: refreshExpiresIn || 60 * 60 * 24 * 100,
      }
    );

    redirectResponse.cookies.set("dcflow_qbo_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return redirectResponse;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "QuickBooks callback failed.";

    return NextResponse.redirect(
      new URL(
        `/settings/integrations/quickbooks?error=${encodeURIComponent(message)}`,
        request.url
      )
    );
  }
}