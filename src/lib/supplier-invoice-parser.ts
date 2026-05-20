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

function parseFarmersLineItems(flat: string) {
  const items: ParsedSupplierInvoiceLineItem[] = [];

  const lineSection =
    flat.split("LINE SHIPPED ORDERED UM SKU DESCRIPTION SUGG UNITS PRICE/ PER EXTENSION")[1] ||
    "";

  if (!lineSection) return items;

  const stopSection = lineSection.split("I understand that")[0] || lineSection;

  const patterns = [
    // Full format:
    // 1 1 1 EA 5149729 8X1-1.4 CABINET SCREW 12.99 1 11.691 /EA 11.69
    /(\d+)\s+(\d+)\s+(\d+)\s+([A-Z]+)\s+([A-Z0-9.-]+)\s+(.+?)\s+([0-9]+\.[0-9]{2})\s+(\d+)\s+([0-9]+\.[0-9]+)\s*\/([A-Z]+)\s+([0-9]+\.[0-9]{2})[A-Z]*/gi,

    // Short Farmers format:
    // 1 5 EA 8111486 1/2 CPVC CAP .69 5 0.621 /EA 3.11
    /(\d+)\s+(\d+)\s+([A-Z]+)\s+([A-Z0-9.-]+)\s+(.+?)\s+([0-9]*\.[0-9]{2})\s+(\d+)\s+([0-9]+\.[0-9]+)\s*\/([A-Z]+)\s+([0-9]+\.[0-9]{2})[A-Z]*/gi,
  ];

  for (const pattern of patterns) {
    for (const match of stopSection.matchAll(pattern)) {
      if (match.length === 12) {
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
          rawLine: clean(match[0]),
        });
      }

      if (match.length === 11) {
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
    }
  }

  const seen = new Set<string>();

  return items.filter((item) => {
    const key = [
      item.lineNumber,
      item.sku,
      item.description,
      item.extension,
      item.rawLine,
    ].join("__");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseSupplierInvoiceText(text: string): ParsedSupplierInvoice {
  const source = String(text || "");
  const flat = clean(source);

  const poCode = flat.match(/\bS\d{3,}[A-Z]{1,2}\b/i)?.[0]?.toUpperCase() || null;

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