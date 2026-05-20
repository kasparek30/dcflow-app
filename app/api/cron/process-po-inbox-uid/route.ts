// app/api/cron/process-po-inbox-uid/route.ts
import { NextResponse } from "next/server";
import { processPoInboxUid } from "../../../../src/lib/po-inbox-uid-processor";

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

    const url = new URL(req.url);
    const uid = url.searchParams.get("uid");

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "Missing uid query parameter." },
        { status: 400 }
      );
    }

    const result = await processPoInboxUid({ uid });

    return NextResponse.json({
      ok: true,
      route: "cron/process-po-inbox-uid",
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "PO inbox UID processing failed.",
      },
      { status: 500 }
    );
  }
}