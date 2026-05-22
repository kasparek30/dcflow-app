// src/lib/process-pending-supplier-invoices.ts
import { adminFirestore } from "./firebase-admin";
import { processSupplierInvoiceOcr } from "./supplier-invoice-ocr-processor";

type PendingInvoiceProcessingResult = {
  invoiceId: string;
  ok: boolean;
  status?: string;
  detectedPoCodes?: string[];
  matchedPoCode?: string | null;
  matchedPoCodes?: string[];
  linked?: number;
  parsedInvoiceNumber?: string | null;
  parsedInvoiceTotal?: number | null;
  parsedLineItemCount?: number;
  materialImport?: unknown;
  materialImports?: unknown[];
  error?: string;
};

export type ProcessPendingSupplierInvoicesResult = {
  found: number;
  processed: number;
  failed: number;
  results: PendingInvoiceProcessingResult[];
};

function clampNumber(
  value: number | string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(min, Math.min(Math.floor(n), max));
}

export async function processPendingSupplierInvoices(options?: {
  limit?: number;
}): Promise<ProcessPendingSupplierInvoicesResult> {
  const limit = clampNumber(options?.limit, 1, 1, 2);

  const pendingSnap = await adminFirestore
    .collection("supplierInvoiceInbox")
    .where("status", "==", "ocr_pending")
    .limit(limit)
    .get();

  const result: ProcessPendingSupplierInvoicesResult = {
    found: pendingSnap.size,
    processed: 0,
    failed: 0,
    results: [],
  };

  for (const invoiceDoc of pendingSnap.docs) {
    const invoiceId = invoiceDoc.id;

    try {
      /*
       * We intentionally leave the document as ocr_pending until processing
       * succeeds. If a hosted request times out, the next scheduled run can
       * retry it. Attachment linking and supplier material import are already
       * designed to avoid duplicates.
       */
      const processed = await processSupplierInvoiceOcr({ invoiceId });

      result.processed += 1;
      result.results.push({
        invoiceId,
        ok: true,
        status: processed.status,
        detectedPoCodes: processed.detectedPoCodes,
        matchedPoCode: processed.matchedPoCode,
        matchedPoCodes: processed.matchedPoCodes,
        linked: processed.linked,
        parsedInvoiceNumber: processed.parsedInvoiceNumber,
        parsedInvoiceTotal: processed.parsedInvoiceTotal,
        parsedLineItemCount: processed.parsedLineItemCount,
        materialImport: processed.materialImport,
        materialImports: processed.materialImports,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Supplier invoice processing failed.";

      result.failed += 1;

      await invoiceDoc.ref.set(
        {
          status: "ocr_failed",
          ocrError: message,
          ocrFailedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      result.results.push({
        invoiceId,
        ok: false,
        error: message,
      });
    }
  }

  return result;
}