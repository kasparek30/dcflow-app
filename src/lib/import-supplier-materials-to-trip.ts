// src/lib/import-supplier-materials-to-trip.ts
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
  return String(value || "").replace(/\s+/g, " ").trim();
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

async function safelyRecordActivity(args: Parameters<typeof recordServiceTicketActivity>[0]) {
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

  if (!poCode) {
    return { imported: 0, skipped: 0, reason: "Missing PO code." };
  }

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
  const tripSnap = await tripRef.get();

  if (!tripSnap.exists) {
    return { imported: 0, skipped: 0, reason: `Trip ${tripId} not found.` };
  }

  const trip = tripSnap.data() as any;
  const existingMaterials: TripMaterial[] = Array.isArray(trip.materials)
    ? trip.materials
    : [];

  const existingKeys = new Set(
    existingMaterials
      .map((m) => clean((m as any).supplierLineKey))
      .filter(Boolean)
  );

  const now = new Date().toISOString();
  const nextMaterialsToAppend: TripMaterial[] = [];
  let skipped = 0;

  for (const line of args.parsedInvoice.lineItems) {
    const description = clean(line.description);
    if (!description) {
      skipped += 1;
      continue;
    }

    const supplierLineKey = makeLineKey({
      supplierInvoiceId: args.supplierInvoiceId,
      invoiceNumber: args.parsedInvoice.invoiceNumber,
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

    nextMaterialsToAppend.push({
      id: supplierLineKey,
      name: description,
      qty: Number(line.shippedQty || line.orderedQty || line.units || 1),
      unit: line.unitOfMeasure || undefined,
      notes: [
        args.parsedInvoice.vendorName || "Supplier invoice",
        args.parsedInvoice.invoiceNumber
          ? `Invoice #${args.parsedInvoice.invoiceNumber}`
          : "",
        poCode ? `PO ${poCode}` : "",
        line.sku ? `SKU ${line.sku}` : "",
      ]
        .filter(Boolean)
        .join(" • "),
      imported: true,
      source: "supplier_invoice",
      poCode,
      supplierName: args.parsedInvoice.vendorName,
      supplierInvoiceNumber: args.parsedInvoice.invoiceNumber,
      supplierInvoiceId: args.supplierInvoiceId,
      supplierLineKey,
      supplierSku: line.sku,
      unitCost: line.unitPrice,
      lineTotal: line.extension,
      reviewStatus: "pending",
      importedAt: now,
    });
  }

  if (nextMaterialsToAppend.length === 0) {
    const billingResync = serviceTicketId
  ? await resyncServiceTicketBillingFromTrips({ serviceTicketId })
  : projectId
    ? {
        resynced: false,
        reason:
          "Project PO materials were appended to the trip. Project billing resync is not automated yet.",
      }
    : {
        resynced: false,
        reason: "PO is missing serviceTicketId/projectId; billing packet was not resynced.",
      };

    if (serviceTicketId) {
      await safelyRecordActivity({
        serviceTicketId,
        type: "supplier_materials_imported",
        title: "Supplier materials already imported",
        description: `${args.parsedInvoice.vendorName || "Supplier invoice"}${
          args.parsedInvoice.invoiceNumber ? ` • Invoice #${args.parsedInvoice.invoiceNumber}` : ""
        } • PO ${poCode}`,
        details: [
          `PO: ${poCode}`,
          args.parsedInvoice.invoiceNumber
            ? `Invoice #: ${args.parsedInvoice.invoiceNumber}`
            : "",
          args.parsedInvoice.vendorName ? `Vendor: ${args.parsedInvoice.vendorName}` : "",
          `Skipped duplicate line items: ${skipped}`,
          `Trip ID: ${tripId}`,
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
          "No new material rows were added.",
        ],
      });
    }

    return {
      imported: 0,
      skipped,
      tripId,
      serviceTicketId: serviceTicketId || null,
      projectId: projectId || null,
      sourceType: sourceType || null,
      billingResync,
      reason: "No new supplier materials to append.",
    };
  }

  await tripRef.set(
    {
      materials: [...existingMaterials, ...nextMaterialsToAppend],
      noMaterialsUsed: false,
      supplierMaterialImportStatus: "needs_review",
      supplierMaterialImportedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await poRef.set(
    {
      importedMaterialCount: FieldValue.increment(nextMaterialsToAppend.length),
      supplierMaterialsImportedAt: now,
      supplierMaterialsTripId: tripId,
      updatedAt: now,
    },
    { merge: true }
  );

  const billingResync = serviceTicketId
  ? await resyncServiceTicketBillingFromTrips({ serviceTicketId })
  : projectId
    ? {
        resynced: false,
        reason:
          "Project PO materials were appended to the trip. Project billing resync is not automated yet.",
      }
    : {
        resynced: false,
        reason: "PO is missing serviceTicketId/projectId; billing packet was not resynced.",
      };

  if (serviceTicketId) {
    await safelyRecordActivity({
      serviceTicketId,
      type: "supplier_materials_imported",
      title: "Supplier materials imported",
      description: `${nextMaterialsToAppend.length} material item${
        nextMaterialsToAppend.length === 1 ? "" : "s"
      } imported from ${args.parsedInvoice.vendorName || "supplier invoice"}.`,
      details: [
        `PO: ${poCode}`,
        args.parsedInvoice.invoiceNumber ? `Invoice #: ${args.parsedInvoice.invoiceNumber}` : "",
        args.parsedInvoice.vendorName ? `Vendor: ${args.parsedInvoice.vendorName}` : "",
        `Trip ID: ${tripId}`,
        `Imported material count: ${nextMaterialsToAppend.length}`,
        ...nextMaterialsToAppend.slice(0, 10).map((item) => {
          const qty = Number(item.qty || 0);
          const qtyText = Number.isFinite(qty) && qty > 0 ? `${qty} ` : "";
          return `${qtyText}${item.name}${item.supplierSku ? ` • SKU ${item.supplierSku}` : ""}`;
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
    imported: nextMaterialsToAppend.length,
    skipped,
    tripId,
    serviceTicketId: serviceTicketId || null,
    projectId: projectId || null,
    sourceType: sourceType || null,
    billingResync,
    reason: "Supplier materials appended to trip.",
  };
}