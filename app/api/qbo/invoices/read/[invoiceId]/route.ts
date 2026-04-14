import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../../_lib";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { realmId } = await getQboCookieValues();

    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const { invoiceId } = await context.params;
    const cleanInvoiceId = String(invoiceId || "").trim();

    if (!cleanInvoiceId) {
      return NextResponse.json(
        { error: "Missing invoiceId." },
        { status: 400 }
      );
    }

    const base = getQboApiBaseUrl();
    const url = `${base}/v3/company/${realmId}/invoice/${encodeURIComponent(
      cleanInvoiceId
    )}`;

    const { res, body, intuitTid, attempt } = await qboFetchWithAutoRefresh(url);

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Failed to read QBO invoice.",
          status: res.status,
          intuit_tid: intuitTid || "",
          attempt: attempt || "original",
          qboBody: body,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      invoiceId: cleanInvoiceId,
      intuit_tid: intuitTid || "",
      attempt: attempt || "original",
      qboBody: body,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to read invoice.",
      },
      { status: 500 }
    );
  }
}