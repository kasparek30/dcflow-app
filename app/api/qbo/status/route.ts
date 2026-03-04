// app/api/qbo/status/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();

  const refreshToken = cookieStore.get("dcflow_qbo_refresh_token")?.value;
  const realmId = cookieStore.get("dcflow_qbo_realm_id")?.value;
  const connectedAt = cookieStore.get("dcflow_qbo_connected_at")?.value;
  const scopes = cookieStore.get("dcflow_qbo_scopes")?.value;

  return NextResponse.json({
    connected: Boolean(refreshToken),
    realmId: realmId || "",
    connectedAt: connectedAt || "",
    scopes: scopes || "",
  });
}