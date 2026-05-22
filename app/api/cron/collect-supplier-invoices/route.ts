// app/api/cron/collect-supplier-invoices/route.ts
import { NextResponse } from "next/server";
import { collectSupplierInvoiceInbox } from "../../../../src/lib/supplier-invoice-inbox-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized." },
    { status: 401 },
  );
}

function readNumberParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(min, Math.min(Math.floor(n), max));
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

    const scanLimit = readNumberParam(
      url.searchParams.get("limit"),
      100,
      1,
      200,
    );

    const maxNewInvoicesPerRun = readNumberParam(
      url.searchParams.get("maxNew"),
      3,
      1,
      10,
    );

    const result = await collectSupplierInvoiceInbox({
      scanLimit,
      maxNewInvoicesPerRun,
    });

    return NextResponse.json({
      ok: true,
      route: "cron/collect-supplier-invoices",
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Scheduled supplier invoice collection failed.",
      },
      { status: 500 },
    );
  }
}