// app/api/qbo/test/route.ts
import { NextResponse } from "next/server";
import { getQboApiBaseUrl, getQboCookieValues, qboFetchWithAutoRefresh } from "../_lib";

export async function GET() {
  try {
    const { realmId } = await getQboCookieValues();

    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const base = getQboApiBaseUrl();

    // CompanyInfo endpoint (safe “hello world” for QBO Accounting API)
    const url = `${base}/v3/company/${realmId}/companyinfo/${realmId}`;

    const { res, body, intuitTid, attempt } = await qboFetchWithAutoRefresh(url);

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: res.status,
          attempt,
          intuit_tid: intuitTid || "",
          body,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      attempt, // "original" or "refreshed"
      intuit_tid: intuitTid || "",
      companyInfoPreview: body?.CompanyInfo || body,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test call failed." },
      { status: 500 }
    );
  }
}