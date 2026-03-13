// app/api/qbo/refresh/route.ts
import { NextResponse } from "next/server";
import { forceRefreshSharedQboTokens } from "../_lib";

export async function GET() {
  try {
    const result = await forceRefreshSharedQboTokens();

    return NextResponse.json({
      ok: true,
      message: "QBO tokens refreshed (shared company connection).",
      realmId: result.realmId,
      expiresAt: result.expiresAt,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Refresh failed." },
      { status: 500 }
    );
  }
}