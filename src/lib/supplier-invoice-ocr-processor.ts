// src/lib/supplier-invoice-ocr-processor.ts
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore, adminStorageBucket } from "./firebase-admin";
import {
  extractTextFromPdfBuffer,
  splitPdfIntoSinglePageBuffers,
} from "./ocr";
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

type LinkableInvoiceAttachment = {
  poCode: string;
  attachment: SavedAttachment;
  ocrText: string;
  parsedInvoice: ReturnType<typeof parseSupplierInvoiceText> | null;
  sourceKind: "standard_pdf" | "moore_batch_page";
  pageNumber?: number | null;
};

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractPoCodes(text: string) {
  const source = String(text || "").toUpperCase();
  const matches = source.match(/\b[SPT]\d{3,}[A-Z]{1,2}\b/g) || [];
  return Array.from(new Set(matches));
}

function safeFilePart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140);
}

function buildDownloadUrl(bucketName: string, storagePath: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucketName
  )}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

function isMooreInvoiceText(text: string, parsed?: ReturnType<typeof parseSupplierInvoiceText> | null) {
  const source = String(text || "").toUpperCase();
  return parsed?.vendorName === "MOORE SUPPLY" || source.includes("MOORE SUPPLY");
}

async function purchaseOrderExists(poCode: string) {
  const poSnap = await adminFirestore.collection("purchaseOrders").doc(poCode).get();
  return poSnap.exists;
}

async function saveMoorePageAttachmentToPurchaseOrderStorage(args: {
  poCode: string;
  invoiceId: string;
  sourceAttachment: SavedAttachment;
  pageNumber: number;
  pageBuffer: Buffer;
  pageText: string;
  parsedInvoice: ReturnType<typeof parseSupplierInvoiceText> | null;
}) {
  const now = new Date().toISOString();
  const bucket = adminStorageBucket;
  const bucketName = bucket.name;

  const invoiceNumber = clean(args.parsedInvoice?.invoiceNumber) || `page-${args.pageNumber}`;
  const baseFilename =
    safeFilePart(`moore_${invoiceNumber}_PO_${args.poCode}_page_${args.pageNumber}.pdf`) ||
    `moore_PO_${args.poCode}_page_${args.pageNumber}.pdf`;

  const sourceId =
    safeFilePart(args.sourceAttachment.id || args.sourceAttachment.filename || args.invoiceId) ||
    "moore_batch";

  const attachmentId =
    safeFilePart(`${args.invoiceId}_${args.poCode}_page_${args.pageNumber}_${invoiceNumber}`) ||
    `${args.poCode}_page_${args.pageNumber}_${Date.now()}`;

  const storagePath = `purchaseOrders/${args.poCode}/invoices/${sourceId}_${attachmentId}_${baseFilename}`;
  const file = bucket.file(storagePath);

  await file.save(args.pageBuffer, {
    resumable: false,
    metadata: {
      contentType: "application/pdf",
      metadata: {
        ownerCode: args.poCode,
        messageId: String(args.invoiceId || ""),
        sourceSupplierInvoiceId: args.invoiceId,
        sourceAttachmentId: String(args.sourceAttachment.id || ""),
        sourceAttachmentFilename: String(args.sourceAttachment.filename || ""),
        vendorName: "MOORE SUPPLY",
        invoiceNumber,
        pageNumber: String(args.pageNumber),
        uploadedAt: now,
      },
    },
  });

  return {
    id: attachmentId,
    filename: baseFilename,
    contentType: "application/pdf",
    size: args.pageBuffer.length,
    storagePath,
    downloadUrl: buildDownloadUrl(bucketName, storagePath),
    uploadedAt: now,
    ocrText: args.pageText.length > 50000 ? args.pageText.slice(0, 50000) : args.pageText,
    parsedInvoice: args.parsedInvoice,
    extractedMeta: {
      extractionMethod: "native_unpdf",
      ocrStatus: args.pageText ? "complete" : "empty",
      ocrProcessedAt: now,
      sourceSupplierInvoiceId: args.invoiceId,
      sourceAttachmentId: args.sourceAttachment.id || null,
      supplierParser: "moore_batch_page",
      pageNumber: args.pageNumber,
      matchedPoCode: args.poCode,
    },
  } as SavedAttachment;
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
        extractionMethod:
          String(args.attachment.extractedMeta?.supplierParser || "") === "moore_batch_page"
            ? "native_unpdf_page_split"
            : "native_unpdf",
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
      matchedInvoiceId: args.invoiceId,
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
  const matchedPoCodes = new Set<string>();
  const updatedAttachments: SavedAttachment[] = [];
  const linkableAttachments: LinkableInvoiceAttachment[] = [];

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
      const fullText = await extractTextFromPdfBuffer(buffer);
      const fullParsed = parseSupplierInvoiceText(fullText);
      parsedInvoice = fullParsed;

      const contextText = [
        invoice.emailFrom || "",
        invoice.emailSubject || "",
        attachment.filename || "",
        fullText,
      ].join("\n");

      const isMoore = isMooreInvoiceText(contextText, fullParsed);

      if (isMoore) {
        const pageBuffers = await splitPdfIntoSinglePageBuffers(buffer);
        let mooreMatchedPageCount = 0;
        let mooreDetectedPagePoCount = 0;

        for (let pageIndex = 0; pageIndex < pageBuffers.length; pageIndex += 1) {
          const pageNumber = pageIndex + 1;
          const pageBuffer = pageBuffers[pageIndex];

          const pageText = await extractTextFromPdfBuffer(pageBuffer);
          const pageParsed = parseSupplierInvoiceText(pageText);
          const pagePoCodes = Array.from(
            new Set([
              ...extractPoCodes(pageText),
              pageParsed.poCode || "",
            ].filter(Boolean))
          );

          pagePoCodes.forEach((code) => detectedPoCodes.add(code));

          if (pagePoCodes.length === 0) {
            continue;
          }

          mooreDetectedPagePoCount += 1;

          for (const poCode of pagePoCodes) {
            if (!(await purchaseOrderExists(poCode))) {
              continue;
            }

            const pageAttachment = await saveMoorePageAttachmentToPurchaseOrderStorage({
              poCode,
              invoiceId,
              sourceAttachment: attachment,
              pageNumber,
              pageBuffer,
              pageText,
              parsedInvoice: pageParsed,
            });

            linkableAttachments.push({
              poCode,
              attachment: pageAttachment,
              ocrText: pageText,
              parsedInvoice: pageParsed,
              sourceKind: "moore_batch_page",
              pageNumber,
            });

            mooreMatchedPageCount += 1;
            break;
          }
        }

        updatedAttachments.push({
          ...attachment,
          ocrText: fullText.length > 50000 ? fullText.slice(0, 50000) : fullText,
          parsedInvoice: fullParsed,
          extractedMeta: {
            ...(attachment.extractedMeta || {}),
            extractionMethod: "native_unpdf",
            ocrStatus: fullText ? "complete" : "empty",
            ocrProcessedAt: now,
            supplierParser: "moore_batch",
            pageCount: pageBuffers.length,
            detectedPoCodes: Array.from(detectedPoCodes),
            mooreDetectedPagePoCount,
            mooreMatchedPageCount,
            note:
              "Moore batch PDFs are split by page. Only pages with a matching DCFlow PO are attached to purchase orders.",
          },
        });

        processed += pageBuffers.length;
        continue;
      }

      const poCodes = Array.from(
        new Set([
          ...extractPoCodes(fullText),
          fullParsed.poCode || "",
        ].filter(Boolean))
      );

      poCodes.forEach((code) => detectedPoCodes.add(code));

      const updatedAttachment: SavedAttachment = {
        ...attachment,
        ocrText: fullText.length > 50000 ? fullText.slice(0, 50000) : fullText,
        parsedInvoice: fullParsed,
        extractedMeta: {
          ...(attachment.extractedMeta || {}),
          extractionMethod: "native_unpdf",
          ocrStatus: fullText ? "complete" : "empty",
          ocrProcessedAt: now,
          detectedPoCodes: poCodes,
        },
      };

      updatedAttachments.push(updatedAttachment);

      for (const poCode of poCodes) {
        linkableAttachments.push({
          poCode,
          attachment: updatedAttachment,
          ocrText: fullText,
          parsedInvoice: fullParsed,
          sourceKind: "standard_pdf",
          pageNumber: null,
        });
      }

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

  let matchedPoCode: string | null = null;
  let linkReason: string | null = null;
  let materialImport: Awaited<ReturnType<typeof importSupplierMaterialsToTrip>> | null =
    null;
  const materialImports: Array<{
    poCode: string;
    result: Awaited<ReturnType<typeof importSupplierMaterialsToTrip>>;
  }> = [];

  for (const item of linkableAttachments) {
    const linkResult = await appendAttachmentToPurchaseOrder({
      poCode: item.poCode,
      invoiceId,
      invoiceData: invoice,
      attachment: item.attachment,
      ocrText: item.ocrText,
      parsedInvoice: item.parsedInvoice,
    });

    if (linkResult.ok) {
      if (!matchedPoCode) matchedPoCode = item.poCode;
      matchedPoCodes.add(item.poCode);
      linked += 1;
      linkReason = linkResult.reason;

      const importResult = await importSupplierMaterialsToTrip({
        poCode: item.poCode,
        supplierInvoiceId: invoiceId,
        parsedInvoice: item.parsedInvoice,
      });

      materialImport = importResult;
      materialImports.push({
        poCode: item.poCode,
        result: importResult,
      });
    } else {
      linkReason = linkResult.reason;
    }
  }

  const poCodes = Array.from(detectedPoCodes);
  const matchedPoCodeList = Array.from(matchedPoCodes);

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
      matchedPoCodes: matchedPoCodeList,
      parsedInvoice,
      parsedInvoiceNumber: parsedInvoice?.invoiceNumber || null,
      parsedInvoiceTotal: parsedInvoice?.total ?? null,
      parsedLineItems: parsedInvoice?.lineItems || [],
      materialImport,
      materialImports,
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
    matchedPoCodes: matchedPoCodeList,
    linked,
    status: nextStatus,
    linkReason,
    parsedInvoiceNumber: parsedInvoice?.invoiceNumber || null,
    parsedInvoiceTotal: parsedInvoice?.total ?? null,
    parsedLineItemCount: parsedInvoice?.lineItems.length || 0,
    materialImport,
    materialImports,
  };
}