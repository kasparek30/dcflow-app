// app/api/supplier-invoices/process-ocr/route.ts
import { NextResponse } from "next/server";
import { processSupplierInvoiceOcr } from "../../../../src/lib/supplier-invoice-ocr-processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice("bearer ".length).trim();
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
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
      return unauthorized();
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body.invoiceId || "").trim();

    if (!invoiceId) {
      return NextResponse.json(
        { ok: false, error: "Missing invoiceId." },
        { status: 400 }
      );
    }

    const result = await processSupplierInvoiceOcr({ invoiceId });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Supplier invoice OCR processing failed.",
      },
      { status: 500 }
    );
  }
}