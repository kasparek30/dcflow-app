// app/api/cron/scan-po-inbox/route.ts
import { NextResponse } from "next/server";
import { scanPoInbox } from "../../../../src/lib/po-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
}

export async function GET(req: Request) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";

    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing CRON_SECRET." },
        { status: 500 }
      );
    }

    if (header !== `Bearer ${expectedSecret}`) {
      return unauthorized();
    }

    const result = await scanPoInbox();

    return NextResponse.json({
      ok: true,
      route: "cron/scan-po-inbox",
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Scheduled PO inbox scan failed.",
      },
      { status: 500 }
    );
  }
}