// app/api/purchase-orders/process-ocr/route.ts
import { NextResponse } from "next/server";
import { adminFirestore, adminStorageBucket } from "../../../../src/lib/firebase-admin";
import { extractTextFromPdfBuffer } from "../../../../src/lib/ocr";

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

    const body = await req.json().catch(() => ({}));
    const poCode = String(body.poCode || "").trim().toUpperCase();

    if (!poCode) {
      return NextResponse.json(
        { ok: false, error: "Missing poCode." },
        { status: 400 }
      );
    }

    const poRef = adminFirestore.collection("purchaseOrders").doc(poCode);
    const poSnap = await poRef.get();

    if (!poSnap.exists) {
      return NextResponse.json(
        { ok: false, error: `PO ${poCode} not found.` },
        { status: 404 }
      );
    }

    const po = poSnap.data() as any;
    const attachments = Array.isArray(po.matchedAttachments)
      ? po.matchedAttachments
      : [];

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    const updatedAttachments = [];

    for (const attachment of attachments) {
      const storagePath = String(attachment.storagePath || "").trim();
      const ocrStatus = String(attachment.extractedMeta?.ocrStatus || "").trim();

      if (!storagePath || ocrStatus !== "pending") {
        skipped += 1;
        updatedAttachments.push(attachment);
        continue;
      }

      try {
        const [buffer] = await adminStorageBucket.file(storagePath).download();
        const ocrText = await extractTextFromPdfBuffer(buffer);

        updatedAttachments.push({
          ...attachment,
          ocrText: ocrText.length > 50000 ? ocrText.slice(0, 50000) : ocrText,
          extractedMeta: {
            ...(attachment.extractedMeta || {}),
            extractionMethod: "google_cloud_vision",
            ocrStatus: ocrText ? "complete" : "empty",
            ocrProcessedAt: new Date().toISOString(),
          },
        });

        processed += 1;
      } catch (err) {
        failed += 1;

        updatedAttachments.push({
          ...attachment,
          extractedMeta: {
            ...(attachment.extractedMeta || {}),
            ocrStatus: "failed",
            ocrError: err instanceof Error ? err.message : "OCR failed.",
            ocrProcessedAt: new Date().toISOString(),
          },
        });
      }
    }

    await poRef.set(
      {
        matchedAttachments: updatedAttachments,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      poCode,
      processed,
      failed,
      skipped,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "OCR route failed.",
      },
      { status: 500 }
    );
  }
}