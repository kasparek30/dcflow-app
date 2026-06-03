// app/api/cron/backfill-supplyhouse-invoices/route.ts
import { NextResponse } from "next/server";
import { backfillSupplyHouseInvoiceInbox } from "../../../../src/lib/supplier-invoice-inbox-collector";

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

    const refreshParam = String(url.searchParams.get("refresh") || "").toLowerCase();

    const result = await backfillSupplyHouseInvoiceInbox({
      scanLimit: readNumberParam(url.searchParams.get("limit"), 25, 1, 100),
      maxProcess: readNumberParam(url.searchParams.get("maxProcess"), 2, 1, 5),
      refreshExisting:
        refreshParam === "1" ||
        refreshParam === "true" ||
        refreshParam === "yes",
    });

    return NextResponse.json({
      ok: true,
      route: "cron/backfill-supplyhouse-invoices",
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "SupplyHouse invoice backfill failed.",
      },
      { status: 500 },
    );
  }
}
