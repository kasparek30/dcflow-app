// src/lib/import-supplier-materials-to-trip.ts
// Supplier imports only ADD new supplier lines. Existing technician material
// entries are never replaced by an out-of-date copy of the trip document.
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase-admin";
import type { ParsedSupplierInvoice } from "./supplier-invoice-parser";
import { resyncServiceTicketBillingFromTrips } from "./resync-service-ticket-billing";
import { recordServiceTicketActivity } from "./service-ticket-activity";

type TripMaterial = {
  id?: string;
  name: string;
  qty: number;
  unit?: string;
  notes?: string;
  imported?: boolean;
  source?: "manual" | "supplier_invoice";
  poCode?: string;
  supplierName?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceId?: string;
  supplierLineKey?: string;
  supplierSku?: string | null;
  unitCost?: number | null;
  lineTotal?: number | null;
  reviewStatus?: "pending" | "edited" | "approved";
  importedAt?: string;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function makeLineKey(args: {
  supplierInvoiceId: string;
  invoiceNumber?: string | null;
  lineNumber?: number | null;
  sku?: string | null;
  description?: string | null;
  extension?: number | null;
}) {
  return [
    args.supplierInvoiceId,
    args.invoiceNumber || "no_invoice",
    args.lineNumber ?? "no_line",
    args.sku || "no_sku",
    clean(args.description).toLowerCase(),
    args.extension ?? "no_total",
  ].join("__");
}

async function safelyRecordActivity(
  args: Parameters<typeof recordServiceTicketActivity>[0],
) {
  try {
    return await recordServiceTicketActivity(args);
  } catch (err) {
    console.warn("Failed to record service ticket activity:", err);
    return { logged: false, reason: "Activity log write failed." };
  }
}

export async function importSupplierMaterialsToTrip(args: {
  poCode: string;
  supplierInvoiceId: string;
  parsedInvoice: ParsedSupplierInvoice | null;
}) {
  const poCode = clean(args.poCode).toUpperCase();
  if (!poCode) return { imported: 0, skipped: 0, reason: "Missing PO code." };
  if (!args.parsedInvoice?.lineItems?.length) {
    return { imported: 0, skipped: 0, reason: "No parsed line items." };
  }

  const poRef = adminFirestore.collection("purchaseOrders").doc(poCode);
  const poSnap = await poRef.get();
  if (!poSnap.exists) {
    return { imported: 0, skipped: 0, reason: `PO ${poCode} not found.` };
  }

  const po = poSnap.data() as any;
  const tripId = clean(po.tripId);
  const serviceTicketId = clean(po.serviceTicketId);
  const projectId = clean(po.projectId);
  const sourceType = clean(po.sourceType).toLowerCase();
  if (!tripId) {
    return { imported: 0, skipped: 0, reason: `PO ${poCode} is missing tripId.` };
  }

  const tripRef = adminFirestore.collection("trips").doc(tripId);
  const now = new Date().toISOString();

  // The transaction rereads the CURRENT trip and retries when a technician
  // closes the trip (or another invoice importer runs) at the same time.
  // A read + later set() was previously able to erase those newer notes.
  const result = await adminFirestore.runTransaction(async (tx) => {
    const currentSnap = await tx.get(tripRef);
    if (!currentSnap.exists) {
      return { missing: true, importedLines: [] as TripMaterial[], skipped: 0 };
    }

    const trip = currentSnap.data() as any;
    const existingMaterials: TripMaterial[] = Array.isArray(trip.materials)
      ? trip.materials
      : [];
    const existingKeys = new Set(
      existingMaterials.map((m) => clean(m?.supplierLineKey)).filter(Boolean),
    );
    const importedLines: TripMaterial[] = [];
    let skipped = 0;

    for (const line of args.parsedInvoice!.lineItems) {
      const description = clean(line.description);
      if (!description) {
        skipped += 1;
        continue;
      }

      const supplierLineKey = makeLineKey({
        supplierInvoiceId: args.supplierInvoiceId,
        invoiceNumber: args.parsedInvoice!.invoiceNumber,
        lineNumber: line.lineNumber,
        sku: line.sku,
        description,
        extension: line.extension,
      });
      if (existingKeys.has(supplierLineKey)) {
        skipped += 1;
        continue;
      }
      existingKeys.add(supplierLineKey);

      importedLines.push({
        id: supplierLineKey,
        name: description,
        qty: Number(line.shippedQty || line.orderedQty || line.units || 1),
        unit: line.unitOfMeasure || undefined,
        notes: [
          args.parsedInvoice!.vendorName || "Supplier invoice",
          args.parsedInvoice!.invoiceNumber
            ? `Invoice #${args.parsedInvoice!.invoiceNumber}`
            : "",
          `PO ${poCode}`,
          line.sku ? `SKU ${line.sku}` : "",
        ]
          .filter(Boolean)
          .join(" • "),
        imported: true,
        source: "supplier_invoice",
        poCode,
        supplierName: args.parsedInvoice!.vendorName,
        supplierInvoiceNumber: args.parsedInvoice!.invoiceNumber,
        supplierInvoiceId: args.supplierInvoiceId,
        supplierLineKey,
        supplierSku: line.sku,
        unitCost: line.unitPrice,
        lineTotal: line.extension,
        reviewStatus: "pending",
        importedAt: now,
      });
    }

    if (importedLines.length > 0) {
      // Preserve technician-entered lines in their own field for legacy trips
      // created before the separate manual-materials field was introduced.
      // Never overwrite an existing field (including an intentionally empty one).
      const manualMaterialsBackup = existingMaterials
        .filter((item) => !item?.imported && item?.source !== "supplier_invoice")
        .map((item) => {
          const qty = Number(item.qty);
          const unit = clean(item.unit);
          const note = clean(item.notes);
          const name = String(item.name || "").trim();
          if (!name) return "";
          const prefix = Number.isFinite(qty) && qty > 1 ? `${qty} of ` : "";
          return `${prefix}${name}${unit ? ` (${unit})` : ""}${note ? ` — ${note}` : ""}`;
        })
        .filter(Boolean)
        .join("\n");
      tx.update(tripRef, {
        // Keep EVERY current technician note and every previously imported PO.
        materials: [...existingMaterials, ...importedLines],
        ...(trip.manualMaterialsNotes === undefined
          ? { manualMaterialsNotes: manualMaterialsBackup }
          : {}),
        // noMaterialsUsed belongs to the technician; a supplier purchase is
        // not evidence that those parts were installed on this trip.
        supplierMaterialImportStatus: "needs_review",
        supplierMaterialImportedAt: now,
        updatedAt: now,
      });
      tx.set(
        poRef,
        {
          importedMaterialCount: FieldValue.increment(importedLines.length),
          supplierMaterialsImportedAt: now,
          supplierMaterialsTripId: tripId,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    return { missing: false, importedLines, skipped };
  });

  if (result.missing) {
    return { imported: 0, skipped: 0, reason: `Trip ${tripId} not found.` };
  }

  const imported = result.importedLines.length;
  const skipped = result.skipped;
  const billingResync = serviceTicketId
    ? await resyncServiceTicketBillingFromTrips({ serviceTicketId })
    : projectId
      ? {
          resynced: false,
          reason: "Project PO materials were appended to the trip. Project billing resync is not automated yet.",
        }
      : {
          resynced: false,
          reason: "PO is missing serviceTicketId/projectId; billing packet was not resynced.",
        };

  if (serviceTicketId) {
    await safelyRecordActivity({
      serviceTicketId,
      type: "supplier_materials_imported",
      title: imported > 0 ? "Supplier materials imported" : "Supplier materials already imported",
      description: imported > 0
        ? `${imported} material item${imported === 1 ? "" : "s"} imported from ${args.parsedInvoice.vendorName || "supplier invoice"}.`
        : `${args.parsedInvoice.vendorName || "Supplier invoice"}${args.parsedInvoice.invoiceNumber ? ` • Invoice #${args.parsedInvoice.invoiceNumber}` : ""} • PO ${poCode}`,
      details: [
        `PO: ${poCode}`,
        args.parsedInvoice.invoiceNumber ? `Invoice #: ${args.parsedInvoice.invoiceNumber}` : "",
        args.parsedInvoice.vendorName ? `Vendor: ${args.parsedInvoice.vendorName}` : "",
        `Trip ID: ${tripId}`,
        `Imported material count: ${imported}`,
        `Skipped duplicate line items: ${skipped}`,
        ...result.importedLines.slice(0, 10).map((item) => {
          const qty = Number(item.qty || 0);
          return `${Number.isFinite(qty) && qty > 0 ? `${qty} ` : ""}${item.name}${item.supplierSku ? ` • SKU ${item.supplierSku}` : ""}`;
        }),
      ],
    });

    await safelyRecordActivity({
      serviceTicketId,
      type: billingResync.resynced ? "billing_resynced" : "billing_resync_skipped",
      title: billingResync.resynced
        ? "Billing packet resynced after supplier import"
        : "Billing packet resync skipped",
      description: billingResync.reason || null,
      details: [
        `PO: ${poCode}`,
        `Trip ID: ${tripId}`,
        typeof (billingResync as any).materialCount === "number"
          ? `Billing material count: ${(billingResync as any).materialCount}`
          : "",
      ],
    });
  }

  return {
    imported,
    skipped,
    tripId,
    serviceTicketId: serviceTicketId || null,
    projectId: projectId || null,
    sourceType: sourceType || null,
    billingResync,
    reason: imported > 0
      ? "Supplier materials appended to trip without replacing technician notes."
      : "No new supplier materials to append.",
  };
}
