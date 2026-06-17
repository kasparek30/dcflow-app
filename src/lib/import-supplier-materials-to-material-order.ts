// src/lib/import-supplier-materials-to-material-order.ts
import { adminFirestore } from "./firebase-admin";

type ParsedSupplierInvoiceLike = {
  vendorName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  poCode?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  freight?: number | null;
  total?: number | null;
  lineItems?: Array<Record<string, unknown>>;
};

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeIdPart(value: unknown) {
  return clean(value)
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function getLineDescription(line: Record<string, unknown>) {
  return (
    clean(line.description) ||
    clean(line.name) ||
    clean(line.item) ||
    clean(line.product) ||
    clean(line.sku) ||
    clean(line.supplierSku) ||
    "Imported supplier line"
  );
}

function getLineQuantity(line: Record<string, unknown>) {
  return (
    num(line.quantity) ??
    num(line.qty) ??
    num(line.orderedQty) ??
    num(line.shippedQty) ??
    1
  );
}

function getLineUnitCost(line: Record<string, unknown>) {
  return (
    num(line.unitCost) ??
    num(line.unitPrice) ??
    num(line.price) ??
    num(line.rate) ??
    null
  );
}

function getLineTotal(line: Record<string, unknown>, quantity: number, unitCost: number | null) {
  return (
    num(line.lineTotal) ??
    num(line.total) ??
    num(line.amount) ??
    (unitCost !== null ? Math.round(quantity * unitCost * 100) / 100 : null)
  );
}

function buildImportedLineItems(args: {
  poCode: string;
  supplierInvoiceId: string;
  parsedInvoice: ParsedSupplierInvoiceLike | null;
}) {
  const parsed = args.parsedInvoice;
  const lines = Array.isArray(parsed?.lineItems) ? parsed.lineItems : [];

  return lines
    .map((line, index) => {
      const description = getLineDescription(line);
      const quantity = getLineQuantity(line);
      const unitCost = getLineUnitCost(line);
      const totalCost = getLineTotal(line, quantity, unitCost);

      const stableId =
        safeIdPart(
          [
            "supplier",
            args.poCode,
            args.supplierInvoiceId,
            index + 1,
            parsed?.invoiceNumber || "",
            description,
          ].join("_")
        ) || `supplier_${args.poCode}_${args.supplierInvoiceId}_${index + 1}`;

      return {
        id: stableId,
        source: "supplier_invoice" as const,

        poNumber: args.poCode,
        supplierName: parsed?.vendorName || null,
        supplierInvoiceId: args.supplierInvoiceId,
        supplierInvoiceNumber: parsed?.invoiceNumber || null,

        description,

        quantity,
        unitCost,
        totalCost,

        customerUnitPrice: null,
        customerTotalPrice: null,

        taxable: null,

        notes: clean(line.notes) || clean(line.sku) || clean(line.supplierSku) || null,
      };
    })
    .filter((line) => clean(line.description));
}

function upsertSupplierInvoice(args: {
  existing: unknown;
  poCode: string;
  supplierInvoiceId: string;
  parsedInvoice: ParsedSupplierInvoiceLike | null;
  importedAt: string;
}) {
  const existingInvoices = Array.isArray(args.existing) ? args.existing : [];

  const incoming = {
    id: args.supplierInvoiceId,
    poNumber: args.poCode,
    supplierName: args.parsedInvoice?.vendorName || null,
    invoiceNumber: args.parsedInvoice?.invoiceNumber || null,
    invoiceDate: args.parsedInvoice?.invoiceDate || null,

    subtotal: args.parsedInvoice?.subtotal ?? null,
    tax: args.parsedInvoice?.tax ?? null,
    freight: args.parsedInvoice?.freight ?? null,
    total: args.parsedInvoice?.total ?? null,

    storagePath: null,
    downloadUrl: null,

    importedAt: args.importedAt,
    importedBy: "system" as const,
  };

  const incomingInvoiceNumber = clean(args.parsedInvoice?.invoiceNumber);

  const filtered = existingInvoices.filter((invoice: any) => {
    const sameId = clean(invoice?.id) && clean(invoice.id) === args.supplierInvoiceId;
    const samePoAndInvoice =
      clean(invoice?.poNumber).toUpperCase() === args.poCode &&
      incomingInvoiceNumber &&
      clean(invoice?.invoiceNumber) === incomingInvoiceNumber;

    return !sameId && !samePoAndInvoice;
  });

  return [...filtered, incoming];
}

function replaceImportedLineItemsForInvoice(args: {
  existing: unknown;
  poCode: string;
  supplierInvoiceId: string;
  importedLines: Array<Record<string, unknown>>;
}) {
  const existingLines = Array.isArray(args.existing) ? args.existing : [];

  const filtered = existingLines.filter((line: any) => {
    const source = clean(line?.source);
    const sameInvoice = clean(line?.supplierInvoiceId) === args.supplierInvoiceId;
    const samePo = clean(line?.poNumber).toUpperCase() === args.poCode;

    return !(source === "supplier_invoice" && sameInvoice && samePo);
  });

  return [...filtered, ...args.importedLines];
}

function updatePurchaseOrderLinks(args: {
  existing: unknown;
  poCode: string;
  supplierInvoiceId: string;
  parsedInvoice: ParsedSupplierInvoiceLike | null;
  matchedAt: string;
}) {
  const links = Array.isArray(args.existing) ? args.existing : [];
  const poCodeUpper = args.poCode.toUpperCase();

  return links.map((link: any) => {
    if (clean(link?.poNumber).toUpperCase() !== poCodeUpper) return link;

    return {
      ...link,
      supplierName: args.parsedInvoice?.vendorName || link.supplierName || null,
      supplierInvoiceId: args.supplierInvoiceId,
      supplierInvoiceNumber: args.parsedInvoice?.invoiceNumber || null,
      supplierInvoiceMatchedAt: args.matchedAt,
      totalCost: args.parsedInvoice?.total ?? link.totalCost ?? null,
    };
  });
}

function computeSupplierCostTotal(args: {
  supplierInvoices: unknown;
  lineItems: unknown;
}) {
  const invoices = Array.isArray(args.supplierInvoices) ? args.supplierInvoices : [];
  const invoiceTotal = invoices.reduce((sum, invoice: any) => {
    const value = num(invoice?.total);
    return sum + (value ?? 0);
  }, 0);

  if (invoiceTotal > 0) {
    return Math.round(invoiceTotal * 100) / 100;
  }

  const lines = Array.isArray(args.lineItems) ? args.lineItems : [];
  const lineTotal = lines.reduce((sum, line: any) => {
    const value = num(line?.totalCost);
    return sum + (value ?? 0);
  }, 0);

  if (lineTotal > 0) {
    return Math.round(lineTotal * 100) / 100;
  }

  return null;
}

function getNextStatus(currentStatus: unknown) {
  const status = clean(currentStatus).toLowerCase();

  if (status === "cancelled" || status === "invoiced" || status === "ready_to_bill") {
    return status;
  }

  if (status === "ready_for_pickup" || status === "picked_up") {
    return status;
  }

  return "received";
}

export async function importSupplierMaterialsToMaterialOrder(args: {
  poCode: string;
  supplierInvoiceId: string;
  parsedInvoice: ParsedSupplierInvoiceLike | null;
}) {
  const poCode = clean(args.poCode).toUpperCase();
  const supplierInvoiceId = clean(args.supplierInvoiceId);

  if (!poCode) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing PO code.",
      materialOrderId: null,
      importedLineCount: 0,
    };
  }

  if (!supplierInvoiceId) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing supplier invoice ID.",
      materialOrderId: null,
      importedLineCount: 0,
    };
  }

  const poRef = adminFirestore.collection("purchaseOrders").doc(poCode);
  const poSnap = await poRef.get();

  if (!poSnap.exists) {
    return {
      ok: false,
      skipped: true,
      reason: `PO ${poCode} not found.`,
      materialOrderId: null,
      importedLineCount: 0,
    };
  }

  const po = poSnap.data() as any;

  if (clean(po.sourceType).toLowerCase() !== "material_order") {
    return {
      ok: false,
      skipped: true,
      reason: `PO ${poCode} is not a material order PO.`,
      materialOrderId: null,
      importedLineCount: 0,
    };
  }

  const materialOrderId = clean(po.materialOrderId);

  if (!materialOrderId) {
    return {
      ok: false,
      skipped: true,
      reason: `PO ${poCode} is missing materialOrderId.`,
      materialOrderId: null,
      importedLineCount: 0,
    };
  }

  const materialOrderRef = adminFirestore.collection("materialOrders").doc(materialOrderId);
  const materialOrderSnap = await materialOrderRef.get();

  if (!materialOrderSnap.exists) {
    return {
      ok: false,
      skipped: true,
      reason: `materialOrders/${materialOrderId} not found.`,
      materialOrderId,
      importedLineCount: 0,
    };
  }

  const materialOrder = materialOrderSnap.data() as any;
  const now = new Date().toISOString();

  const importedLines = buildImportedLineItems({
    poCode,
    supplierInvoiceId,
    parsedInvoice: args.parsedInvoice,
  });

  const nextSupplierInvoices = upsertSupplierInvoice({
    existing: materialOrder.supplierInvoices,
    poCode,
    supplierInvoiceId,
    parsedInvoice: args.parsedInvoice,
    importedAt: now,
  });

  const nextLineItems = replaceImportedLineItemsForInvoice({
    existing: materialOrder.lineItems,
    poCode,
    supplierInvoiceId,
    importedLines,
  });

  const nextPurchaseOrders = updatePurchaseOrderLinks({
    existing: materialOrder.purchaseOrders,
    poCode,
    supplierInvoiceId,
    parsedInvoice: args.parsedInvoice,
    matchedAt: now,
  });

  const supplierCostTotal = computeSupplierCostTotal({
    supplierInvoices: nextSupplierInvoices,
    lineItems: nextLineItems,
  });

  const nextStatus = getNextStatus(materialOrder.status);

  await materialOrderRef.set(
    {
      status: nextStatus,
      supplierInvoices: nextSupplierInvoices,
      lineItems: nextLineItems,
      purchaseOrders: nextPurchaseOrders,
      supplierCostTotal,
      updatedAt: now,
      lastSupplierInvoiceImportAt: now,
      lastSupplierInvoiceImportPoCode: poCode,
      lastSupplierInvoiceImportId: supplierInvoiceId,
    },
    { merge: true }
  );

  return {
    ok: true,
    skipped: false,
    reason: "Supplier invoice imported to material order.",
    materialOrderId,
    poCode,
    supplierInvoiceId,
    importedLineCount: importedLines.length,
    supplierInvoiceNumber: args.parsedInvoice?.invoiceNumber || null,
    supplierInvoiceTotal: args.parsedInvoice?.total ?? null,
  };
}