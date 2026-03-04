// app/api/qbo/connect/route.ts
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const scopes = process.env.QBO_SCOPES || "com.intuit.quickbooks.accounting";
  const authBaseUrl =
    process.env.QBO_AUTH_BASE_URL || "https://appcenter.intuit.com/connect/oauth2";

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Missing QBO_CLIENT_ID or QBO_REDIRECT_URI in environment variables.",
      },
      { status: 500 }
    );
  }

  const state = randomUUID();

  const authUrl = new URL(authBaseUrl);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());

  response.cookies.set("dcflow_qbo_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}