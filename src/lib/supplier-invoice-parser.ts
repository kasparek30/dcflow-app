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

function extractDcflowPoCode(text: string) {
  return String(text || "").match(/\b[SPT]\d{3,}[A-Z]{1,2}\b/i)?.[0]?.toUpperCase() || null;
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

function parseMooreInvoiceNumber(flat: string) {
  return (
    flat.match(/\bINVOICE\s*(?:NUMBER|NO\.?|#)?\s*:?\s*([A-Z0-9.-]{5,})\b/i)?.[1] ||
    flat.match(/\bINVOICE\s+([A-Z][0-9][A-Z0-9.-]{5,})\b/i)?.[1] ||
    flat.match(/\b([A-Z][0-9]{5,}[A-Z0-9.-]*)\b/)?.[1] ||
    null
  );
}

function parseMooreTotal(flat: string) {
  const patterns = [
    /\bNET\s+AMOUNT\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bAMOUNT\s+DUE\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bINVOICE\s+TOTAL\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bTOTAL\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (match?.[1]) return toNumber(match[1]);
  }

  return null;
}

function parseMooreLineItems(source: string) {
  const items: ParsedSupplierInvoiceLineItem[] = [];
  const lines = String(source || "")
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean);

  const rejectLine =
    /\b(INVOICE|CUSTOMER|ACCOUNT|SHIP\s+TO|SOLD\s+TO|TOTAL|SUBTOTAL|TAX|TERMS|PAGE|REMIT|MOORE\s+SUPPLY|BRANCH|ORDER\s+DATE|INVOICE\s+DATE|CUSTOMER\s+P\.?O\.?)\b/i;

  for (const line of lines) {
    if (rejectLine.test(line)) continue;

    const amountMatches = Array.from(line.matchAll(/-?\$?\d[\d,]*\.\d{2}/g));
    if (amountMatches.length === 0) continue;

    const extensionMatch = amountMatches[amountMatches.length - 1];
    const extension = toNumber(extensionMatch[0]);

    if (extension == null) continue;

    const unitPriceMatch =
      amountMatches.length >= 2 ? amountMatches[amountMatches.length - 2] : null;
    const unitPrice = unitPriceMatch ? toNumber(unitPriceMatch[0]) : null;

    const priceTailStart =
      unitPriceMatch?.index ?? extensionMatch.index ?? Math.max(0, line.length - extensionMatch[0].length);

    const beforePrices = clean(line.slice(0, priceTailStart));
    const tokens = beforePrices.split(/\s+/g).filter(Boolean);

    if (tokens.length < 3) continue;

    let lineNumber: number | null = null;
    let qty: number | null = null;
    let unitOfMeasure: string | null = null;
    let sku: string | null = null;
    let description = "";

    let cursor = 0;

    if (/^\d+$/.test(tokens[0]) && tokens.length >= 5) {
      lineNumber = toNumber(tokens[0]);
      cursor = 1;
    }

    const qtyIndex = tokens.findIndex((token, index) => {
      if (index < cursor) return false;
      return /^\d+(\.\d+)?$/.test(token);
    });

    if (qtyIndex >= 0) {
      qty = toNumber(tokens[qtyIndex]);
      cursor = qtyIndex + 1;
    }

    if (tokens[cursor] && /^[A-Z]{1,5}$/i.test(tokens[cursor])) {
      unitOfMeasure = tokens[cursor].toUpperCase();
      cursor += 1;
    }

    const skuIndex = tokens.findIndex((token, index) => {
      if (index < cursor) return false;
      return /[0-9]/.test(token) && /^[A-Z0-9./-]+$/i.test(token);
    });

    if (skuIndex >= 0) {
      sku = tokens[skuIndex];
      description = clean(tokens.slice(skuIndex + 1).join(" "));
    } else {
      description = clean(tokens.slice(cursor).join(" "));
    }

    if (!description || description.length < 3) continue;

    items.push({
      lineNumber,
      shippedQty: qty,
      orderedQty: qty,
      unitOfMeasure,
      sku,
      description,
      suggestedPrice: null,
      units: qty,
      unitPrice,
      pricePer: unitOfMeasure,
      extension,
      rawLine: line,
    });
  }

  return items;
}

export function parseSupplierInvoiceText(text: string): ParsedSupplierInvoice {
  const source = String(text || "");
  const flat = clean(source);
  const upper = flat.toUpperCase();

  const isFarmers = upper.includes("FARMERS LUMBER COMPANY");
  const isMoore = upper.includes("MOORE SUPPLY");

  const genericPoCode = extractDcflowPoCode(flat);

  const customerPoValue =
    flat.match(/\bCUSTOMER\s+P\.?\s*O\.?\s*(?:NUMBER|NO\.?|#|:)?\s*([A-Z0-9.-]+)/i)?.[1] ||
    flat.match(/\bCUSTOMER\s+PO\s*(?:NUMBER|NO\.?|#|:)?\s*([A-Z0-9.-]+)/i)?.[1] ||
    null;

  const customerPoCode = customerPoValue ? extractDcflowPoCode(customerPoValue) : null;
  const poCode = customerPoCode || genericPoCode;

  const farmersInvoiceNumber =
    flat.match(/INVOICE:\s*([0-9]+)/i)?.[1] ||
    flat.match(/\b([0-9]{5,})\s*INVOICE:/i)?.[1] ||
    flat.match(/\b([0-9]{5,})INVOICE:/i)?.[1] ||
    flat.match(/\bINVOICE\s*#?\s*([0-9]{4,})\b/i)?.[1] ||
    null;

  const invoiceNumber = isMoore
    ? parseMooreInvoiceNumber(flat) || farmersInvoiceNumber
    : farmersInvoiceNumber;

  const vendorName = isFarmers
    ? "FARMERS LUMBER COMPANY"
    : isMoore
      ? "MOORE SUPPLY"
      : null;

  const customerName = flat.includes("DANIEL CERNOCH PLUMBING")
    ? "DANIEL CERNOCH PLUMBING"
    : null;

  const purchasedBy =
    flat.match(/\(([A-Z0-9 .'-]+)\)\s+[0-9]+\.[0-9]{2}/i)?.[1] || null;

  const dueDate =
    flat.match(/\bDUE DATE:\s*([0-9/.-]+)\b/i)?.[1] ||
    flat.match(/\bDUE\s+DATE\s*([0-9/.-]+)\b/i)?.[1] ||
    null;

  const farmersAmountCharged =
    flat.match(/\*\*\s*AMOUNT CHARGED TO STORE ACCOUNT\s*\*\*\s*([0-9]+\.[0-9]{2})/i)?.[1] ||
    null;

  const total = isMoore ? parseMooreTotal(flat) : toNumber(farmersAmountCharged);

  const lineItems = isMoore ? parseMooreLineItems(source) : parseFarmersLineItems(flat);

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