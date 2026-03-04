// app/api/qbo/disconnect/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(
    new URL("/disconnect?quickbooks=disconnected", request.url)
  );

  const cookieNames = [
    "dcflow_qbo_access_token",
    "dcflow_qbo_refresh_token",
    "dcflow_qbo_realm_id",
    "dcflow_qbo_connected_at",
    "dcflow_qbo_scopes",
    "dcflow_qbo_oauth_state",
  ];

  for (const name of cookieNames) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}