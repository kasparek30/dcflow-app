// app/api/purchase-orders/check-inbox/route.ts
import { NextResponse } from "next/server";
import { scanPoInbox } from "../../../../src/lib/po-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice("bearer ".length).trim();
}

export async function POST(req: Request) {
  try {
    const expectedSecret = process.env.PO_INBOX_SCAN_SECRET;
    const providedSecret = getBearerToken(req);

    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing PO_INBOX_SCAN_SECRET." },
        { status: 500 }
      );
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const result = await scanPoInbox();

return NextResponse.json({
  ok: true,
  route: "check-inbox",
  result,
});
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Inbox scan failed.",
      },
      { status: 500 }
    );
  }
}