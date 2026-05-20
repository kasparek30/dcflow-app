// src/lib/supplier-invoice-parser.ts

export type ParsedSupplierInvoiceLineItem = {
  lineNumber: number | null;
  shippedQty: number | null;
  orderedQty: number | null;
  unitOfMeasure: string | null;
  sku: string | null;
  description: string;
  suggestedPrice: number | null;
  units: number | null;
  unitPrice: number | null;
  pricePer: string | null;
  extension: number | null;
  rawLine: string;
};

export type ParsedSupplierInvoice = {
  vendorName: string | null;
  invoiceNumber: string | null;
  poCode: string | null;
  customerName: string | null;
  purchasedBy: string | null;
  dueDate: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  total: number | null;
  lineItems: ParsedSupplierInvoiceLineItem[];
  rawTextPreview: string;
};

function toNumber(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function overlapsAnySpan(index: number, length: number, spans: Array<{ start: number; end: number }>) {
  const start = index;
  const end = index + length;

  return spans.some((span) => start < span.end && end > span.start);
}

function parseFarmersLineItems(flat: string) {
  const items: ParsedSupplierInvoiceLineItem[] = [];

  const lineSection =
    flat.split("LINE SHIPPED ORDERED UM SKU DESCRIPTION SUGG UNITS PRICE/ PER EXTENSION")[1] ||
    "";

  if (!lineSection) return items;

  const stopSection = lineSection.split("I understand that")[0] || lineSection;

  const occupiedSpans: Array<{ start: number; end: number }> = [];

  // Full Farmers format:
  // 2 1 1 EA 7059157 BLUE CLASSIC CHALK REEL & CHALK 7.99 1 7.191 /EA 7.19CN
  const fullPattern =
    /(\d+)\s+(\d+)\s+(\d+)\s+([A-Z]+)\s+([A-Z0-9.-]+)\s+(.+?)\s+([0-9]*\.[0-9]{2})\s+(\d+)\s+([0-9]+\.[0-9]+)\s*\/([A-Z]+)\s+([0-9]+\.[0-9]{2})[A-Z]*/gi;

  for (const match of stopSection.matchAll(fullPattern)) {
    const index = match.index ?? -1;
    const raw = clean(match[0]);

    if (index >= 0) {
      occupiedSpans.push({
        start: index,
        end: index + match[0].length,
      });
    }

    items.push({
      lineNumber: toNumber(match[1]),
      shippedQty: toNumber(match[2]),
      orderedQty: toNumber(match[3]),
      unitOfMeasure: match[4] || null,
      sku: match[5] || null,
      description: clean(match[6]),
      suggestedPrice: toNumber(match[7]),
      units: toNumber(match[8]),
      unitPrice: toNumber(match[9]),
      pricePer: match[10] || null,
      extension: toNumber(match[11]),
      rawLine: raw,
    });
  }

  // Short Farmers format:
  // 1 5 EA 8111486 1/2 CPVC CAP .69 5 0.621 /EA 3.11
  //
  // Important:
  // This can accidentally match inside a full-format row, so we skip matches
  // that overlap a previously matched full-format row.
  const shortPattern =
    /(\d+)\s+(\d+)\s+([A-Z]+)\s+([A-Z0-9.-]+)\s+(.+?)\s+([0-9]*\.[0-9]{2})\s+(\d+)\s+([0-9]+\.[0-9]+)\s*\/([A-Z]+)\s+([0-9]+\.[0-9]{2})[A-Z]*/gi;

  for (const match of stopSection.matchAll(shortPattern)) {
    const index = match.index ?? -1;

    if (index >= 0 && overlapsAnySpan(index, match[0].length, occupiedSpans)) {
      continue;
    }

    items.push({
      lineNumber: toNumber(match[1]),
      shippedQty: toNumber(match[2]),
      orderedQty: toNumber(match[2]),
      unitOfMeasure: match[3] || null,
      sku: match[4] || null,
      description: clean(match[5]),
      suggestedPrice: toNumber(match[6]),
      units: toNumber(match[7]),
      unitPrice: toNumber(match[8]),
      pricePer: match[9] || null,
      extension: toNumber(match[10]),
      rawLine: clean(match[0]),
    });
  }

  return items;
}

export function parseSupplierInvoiceText(text: string): ParsedSupplierInvoice {
  const source = String(text || "");
  const flat = clean(source);

  const poCode = flat.match(/\b[SPT]\d{3,}[A-Z]{1,2}\b/i)?.[0]?.toUpperCase() || null;

  const invoiceNumber =
    flat.match(/INVOICE:\s*([0-9]+)/i)?.[1] ||
    flat.match(/\b([0-9]{5,})\s*INVOICE:/i)?.[1] ||
    flat.match(/\b([0-9]{5,})INVOICE:/i)?.[1] ||
    flat.match(/\bINVOICE\s*#?\s*([0-9]{4,})\b/i)?.[1] ||
    null;

  const vendorName = flat.includes("FARMERS LUMBER COMPANY")
    ? "FARMERS LUMBER COMPANY"
    : null;

  const customerName = flat.includes("DANIEL CERNOCH PLUMBING")
    ? "DANIEL CERNOCH PLUMBING"
    : null;

  const purchasedBy =
    flat.match(/\(([A-Z0-9 .'-]+)\)\s+[0-9]+\.[0-9]{2}/i)?.[1] || null;

  const dueDate = flat.match(/\bDUE DATE:\s*([0-9/.-]+)\b/i)?.[1] || null;

  const amountCharged =
    flat.match(/\*\*\s*AMOUNT CHARGED TO STORE ACCOUNT\s*\*\*\s*([0-9]+\.[0-9]{2})/i)?.[1] ||
    null;

  const total = toNumber(amountCharged);

  const lineItems = parseFarmersLineItems(flat);

  return {
    vendorName,
    invoiceNumber,
    poCode,
    customerName,
    purchasedBy,
    dueDate,
    subtotal: total,
    taxAmount: 0,
    total,
    lineItems,
    rawTextPreview: source.slice(0, 2000),
  };
}