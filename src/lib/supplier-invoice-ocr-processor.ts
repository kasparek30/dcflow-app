// src/lib/supplier-invoice-ocr-processor.ts
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore, adminStorageBucket } from "./firebase-admin";
import { extractTextFromPdfBuffer } from "./ocr";
import { parseSupplierInvoiceText } from "./supplier-invoice-parser";
import { importSupplierMaterialsToTrip } from "./import-supplier-materials-to-trip";

type SavedAttachment = {
  id?: string;
  filename?: string;
  contentType?: string;
  size?: number;
  storagePath?: string;
  downloadUrl?: string;
  uploadedAt?: string;
  extractedText?: string;
  ocrText?: string;
  parsedInvoice?: ReturnType<typeof parseSupplierInvoiceText> | null;
  extractedMeta?: Record<string, unknown> | null;
};

function extractPoCodes(text: string) {
  const source = String(text || "").toUpperCase();
  const matches = source.match(/\bS\d{3,}[A-Z]{1,2}\b/g) || [];
  return Array.from(new Set(matches));
}

async function appendAttachmentToPurchaseOrder(args: {
  poCode: string;
  invoiceId: string;
  invoiceData: Record<string, unknown>;
  attachment: SavedAttachment;
  ocrText: string;
  parsedInvoice: ReturnType<typeof parseSupplierInvoiceText> | null;
}) {
  const now = new Date().toISOString();

  const poRef = adminFirestore.collection("purchaseOrders").doc(args.poCode);
  const poSnap = await poRef.get();

  if (!poSnap.exists) {
    return { ok: false, reason: `PO ${args.poCode} not found.` };
  }

  const po = poSnap.data() as any;
  const existingAttachments = Array.isArray(po.matchedAttachments)
    ? po.matchedAttachments
    : [];

  const incomingAttachmentId = String(args.attachment.id || "");
  const alreadyAttached = existingAttachments.some(
    (existing: any) => String(existing.id || "") === incomingAttachmentId
  );

  if (alreadyAttached) {
    return { ok: true, reason: "Attachment already linked." };
  }

  const nextAttachments = [
    ...existingAttachments,
    {
      ...args.attachment,
      ocrText:
        args.ocrText.length > 50000 ? args.ocrText.slice(0, 50000) : args.ocrText,
      parsedInvoice: args.parsedInvoice,
      extractedMeta: {
        ...(args.attachment.extractedMeta || {}),
        extractionMethod: "native_unpdf",
        ocrStatus: args.ocrText ? "complete" : "empty",
        ocrProcessedAt: now,
        sourceSupplierInvoiceId: args.invoiceId,
      },
    },
  ];

  await poRef.set(
    {
      status: "matched",
      vendorName:
        args.parsedInvoice?.vendorName ||
        String(args.invoiceData.emailFrom || "").trim() ||
        po.vendorName ||
        null,
      invoiceEmailMessageId:
        String(args.invoiceData.messageId || "").trim() ||
        po.invoiceEmailMessageId ||
        null,
      invoiceEmailSubject:
        String(args.invoiceData.emailSubject || "").trim() ||
        po.invoiceEmailSubject ||
        null,
      invoiceEmailFrom:
        String(args.invoiceData.emailFrom || "").trim() ||
        po.invoiceEmailFrom ||
        null,
      invoiceEmailMatchedAt: now,
      invoiceAttachmentCount: nextAttachments.length,
      invoicePdfAttachmentCount: nextAttachments.length,
      matchedAttachments: nextAttachments,
      matchedAttachmentIds: nextAttachments.map((a: any) => String(a.id || "")),
      supplierInvoiceInboxIds: FieldValue.arrayUnion(args.invoiceId),
      parsedInvoice: args.parsedInvoice,
      parsedInvoiceNumber: args.parsedInvoice?.invoiceNumber || null,
      parsedInvoiceTotal: args.parsedInvoice?.total ?? null,
      parsedLineItems: args.parsedInvoice?.lineItems || [],
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, reason: "Attachment linked to PO." };
}

export async function processSupplierInvoiceOcr(args: { invoiceId: string }) {
  const invoiceId = String(args.invoiceId || "").trim();

  if (!invoiceId) {
    throw new Error("Missing invoiceId.");
  }

  const invoiceRef = adminFirestore.collection("supplierInvoiceInbox").doc(invoiceId);
  const invoiceSnap = await invoiceRef.get();

  if (!invoiceSnap.exists) {
    throw new Error(`supplierInvoiceInbox/${invoiceId} not found.`);
  }

  const invoice = invoiceSnap.data() as any;
  const attachments: SavedAttachment[] = Array.isArray(invoice.attachments)
    ? invoice.attachments
    : [];

  const now = new Date().toISOString();

  let processed = 0;
  let failed = 0;
  let linked = 0;
  const detectedPoCodes = new Set<string>();
  const updatedAttachments: SavedAttachment[] = [];
  let parsedInvoice: ReturnType<typeof parseSupplierInvoiceText> | null = null;

  for (const attachment of attachments) {
    const storagePath = String(attachment.storagePath || "").trim();

    if (!storagePath) {
      updatedAttachments.push({
        ...attachment,
        extractedMeta: {
          ...(attachment.extractedMeta || {}),
          ocrStatus: "failed",
          ocrError: "Missing storagePath.",
          ocrProcessedAt: now,
        },
      });
      failed += 1;
      continue;
    }

    try {
      const [buffer] = await adminStorageBucket.file(storagePath).download();
      const ocrText = await extractTextFromPdfBuffer(buffer);
      const poCodes = extractPoCodes(ocrText);

      const parsed = parseSupplierInvoiceText(ocrText);
      parsedInvoice = parsed;

      poCodes.forEach((code) => detectedPoCodes.add(code));
      if (parsed.poCode) detectedPoCodes.add(parsed.poCode);

      updatedAttachments.push({
        ...attachment,
        ocrText: ocrText.length > 50000 ? ocrText.slice(0, 50000) : ocrText,
        parsedInvoice: parsed,
        extractedMeta: {
          ...(attachment.extractedMeta || {}),
          extractionMethod: "native_unpdf",
          ocrStatus: ocrText ? "complete" : "empty",
          ocrProcessedAt: now,
          detectedPoCodes: Array.from(new Set([...poCodes, parsed.poCode].filter(Boolean))),
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
          ocrProcessedAt: now,
        },
      });
    }
  }

  const poCodes = Array.from(detectedPoCodes);

  let matchedPoCode: string | null = null;
  let linkReason: string | null = null;
  let materialImport: Awaited<ReturnType<typeof importSupplierMaterialsToTrip>> | null =
    null;

  if (poCodes.length > 0 && updatedAttachments.length > 0) {
    for (const poCode of poCodes) {
      const linkResult = await appendAttachmentToPurchaseOrder({
        poCode,
        invoiceId,
        invoiceData: invoice,
        attachment: updatedAttachments[0],
        ocrText: String(updatedAttachments[0].ocrText || ""),
        parsedInvoice,
      });

      if (linkResult.ok) {
        matchedPoCode = poCode;
        linked += 1;
        linkReason = linkResult.reason;

        materialImport = await importSupplierMaterialsToTrip({
          poCode,
          supplierInvoiceId: invoiceId,
          parsedInvoice,
        });

        break;
      }

      linkReason = linkResult.reason;
    }
  }

  const nextStatus = matchedPoCode
    ? "matched"
    : poCodes.length > 0
      ? "needs_review"
      : "ocr_complete_unmatched";

  await invoiceRef.set(
    {
      status: nextStatus,
      attachments: updatedAttachments,
      detectedPoCodes: poCodes,
      matchedPoCode,
      parsedInvoice,
      parsedInvoiceNumber: parsedInvoice?.invoiceNumber || null,
      parsedInvoiceTotal: parsedInvoice?.total ?? null,
      parsedLineItems: parsedInvoice?.lineItems || [],
      materialImport,
      ocrProcessedAt: now,
      linkReason,
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    ok: true,
    invoiceId,
    processed,
    failed,
    detectedPoCodes: poCodes,
    matchedPoCode,
    linked,
    status: nextStatus,
    linkReason,
    parsedInvoiceNumber: parsedInvoice?.invoiceNumber || null,
    parsedInvoiceTotal: parsedInvoice?.total ?? null,
    parsedLineItemCount: parsedInvoice?.lineItems.length || 0,
    materialImport,
  };
}