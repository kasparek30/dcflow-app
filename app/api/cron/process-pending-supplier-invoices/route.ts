// app/api/cron/process-pending-supplier-invoices/route.ts
import { NextResponse } from "next/server";
import { processPendingSupplierInvoices } from "../../../../src/lib/process-pending-supplier-invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized." },
    { status: 401 },
  );
}

function readLimit(value: string | null) {
  const n = Number(value);

  if (!Number.isFinite(n)) return 1;

  return Math.max(1, Math.min(Math.floor(n), 2));
}

export async function GET(req: Request) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";

    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing CRON_SECRET." },
        { status: 500 },
      );
    }

    if (header !== `Bearer ${expectedSecret}`) {
      return unauthorized();
    }

    const url = new URL(req.url);

    const result = await processPendingSupplierInvoices({
      limit: readLimit(url.searchParams.get("limit")),
    });

    return NextResponse.json({
      ok: true,
      route: "cron/process-pending-supplier-invoices",
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Scheduled pending supplier invoice processing failed.",
      },
      { status: 500 },
    );
  }
}