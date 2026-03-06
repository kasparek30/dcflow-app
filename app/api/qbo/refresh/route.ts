// app/api/qbo/refresh/route.ts
import { NextResponse } from "next/server";
import { refreshQboAccessToken, getQboCookieValues } from "../_lib";

export async function GET() {
  try {
    const { refreshToken, realmId } = await getQboCookieValues();

    if (!refreshToken || !realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing refresh token or realmId)." },
        { status: 400 }
      );
    }

    const result = await refreshQboAccessToken();

    return NextResponse.json({
      ok: true,
      message: "Access token refreshed.",
      expiresIn: result.expiresIn,
      refreshTokenRotated: Boolean(result.refreshToken),
      intuit_tid: result.intuitTid || "",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed." },
      { status: 500 }
    );
  }
}