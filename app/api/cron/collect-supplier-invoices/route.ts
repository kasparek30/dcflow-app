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

function readOptionalNumber(value: string | null) {
  if (value === null || value === "") return null;

  const n = Number(value);

  if (!Number.isFinite(n)) return null;

  return Math.floor(n);
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

    const result = await collectSupplierInvoiceInbox({
      bootstrapUid: readOptionalNumber(url.searchParams.get("bootstrapUid")),
      maxMessagesPerRun: readNumberParam(
        url.searchParams.get("maxMessages"),
        1,
        1,
        5,
      ),
      maxNewInvoicesPerRun: readNumberParam(
        url.searchParams.get("maxNew"),
        1,
        1,
        2,
      ),
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