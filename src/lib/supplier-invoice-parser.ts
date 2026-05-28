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

function upper(value: string | null | undefined) {
  return clean(value).toUpperCase();
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
  // Moore invoices list NET AMOUNT once per line item. AMOUNT DUE and SUBTOTAL
  // represent the full page/invoice and must be preferred for multi-item invoices.
  const patterns = [
    /\bAMOUNT\s+DUE\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bSUBTOTAL\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bINVOICE\s+TOTAL\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bNET\s+AMOUNT\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bTOTAL\s*:?\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (match?.[1]) return toNumber(match[1]);
  }

  return null;
}

function parseMooreOrderedBy(source: string) {
  const lines = String(source || "")
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean);

  const index = lines.findIndex((line) => upper(line) === "ORDERED BY");
  return index >= 0 ? clean(lines[index + 1]) || null : null;
}

function findLineSequence(lines: string[], labels: string[], startAt = 0) {
  const expected = labels.map((label) => upper(label));

  for (let index = Math.max(0, startAt); index <= lines.length - expected.length; index += 1) {
    const matches = expected.every((label, offset) => upper(lines[index + offset]) === label);
    if (matches) return index;
  }

  return -1;
}

function findSectionEnd(lines: string[], labels: string[], startAt = 0) {
  const expected = labels.map((label) => upper(label));

  for (let index = Math.max(0, startAt); index <= lines.length - expected.length; index += 1) {
    const matches = expected.every((label, offset) => {
      const value = upper(lines[index + offset]);
      return (
        value === label ||
        value.startsWith(`${label} `) ||
        value.startsWith(`${label}:`)
      );
    });

    if (matches) return index;
  }

  return -1;
}

function sectionBetween(
  lines: string[],
  startLabels: string[],
  endLabels: string[],
) {
  const startIndex = findLineSequence(lines, startLabels);
  if (startIndex < 0) return [] as string[];

  const contentStart = startIndex + startLabels.length;
  const endIndex = findSectionEnd(lines, endLabels, contentStart);

  if (endIndex < 0) return lines.slice(contentStart);
  return lines.slice(contentStart, endIndex);
}

function parseMooreQtyUnit(value?: string | null) {
  const match = clean(value).match(/^(-?\d+(?:\.\d+)?)\s*([A-Z]+)?$/i);

  return {
    qty: match?.[1] ? toNumber(match[1]) : null,
    unit: match?.[2] ? match[2].toUpperCase() : null,
  };
}

function groupMooreDescriptions(descriptionLines: string[], itemCount: number) {
  if (itemCount <= 1) {
    return descriptionLines.length ? [clean(descriptionLines.join(" "))] : [];
  }

  const groups: string[][] = [];
  let current: string[] = [];

  for (let index = 0; index < descriptionLines.length; index += 1) {
    const line = descriptionLines[index];
    current.push(line);

    if (/^YOUR\s*#/i.test(line)) {
      if (index + 1 < descriptionLines.length) {
        current.push(descriptionLines[index + 1]);
        index += 1;
      }

      groups.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    if (groups.length < itemCount) {
      groups.push(current);
    } else if (groups.length > 0) {
      groups[groups.length - 1].push(...current);
    }
  }

  const descriptions = groups.map((group) => clean(group.join(" "))).filter(Boolean);

  if (descriptions.length === itemCount) return descriptions;

  // The real Moore PDFs include a "Your #" marker per row. If a future PDF
  // does not, avoid guessing which description belongs to which material row.
  if (itemCount > 1) return [];

  return descriptions;
}

function parseMooreLineItems(source: string) {
  const lines = String(source || "")
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean);

  const itemNumbers = sectionBetween(lines, ["ITEM", "NUMBER"], ["PRODUCT DESCRIPTION"])
    .map((line) => clean(line))
    .filter((line) => /^[A-Z0-9./-]*\d[A-Z0-9./-]*$/i.test(line));

  const descriptionLines = sectionBetween(lines, ["PRODUCT DESCRIPTION"], ["QTY", "ORDERED"]);
  const orderedLines = sectionBetween(lines, ["QTY", "ORDERED"], ["QTY", "SHIPPED"]);
  const shippedLines = sectionBetween(lines, ["QTY", "SHIPPED"], ["UNIT PRICE"]);
  const unitPriceLines = sectionBetween(lines, ["UNIT PRICE"], ["UNIT"]);
  const unitLines = sectionBetween(lines, ["UNIT"], ["NET AMOUNT"]);
  const netAmountLines = sectionBetween(lines, ["NET AMOUNT"], ["INVOICE TERMS"]);

  const itemCount = Math.max(
    itemNumbers.length,
    orderedLines.length,
    shippedLines.length,
    unitPriceLines.length,
    unitLines.length,
    netAmountLines.length,
  );

  if (itemCount === 0) return [] as ParsedSupplierInvoiceLineItem[];

  const descriptions = groupMooreDescriptions(descriptionLines, itemCount);
  if (descriptions.length !== itemCount) return [] as ParsedSupplierInvoiceLineItem[];

  const items: ParsedSupplierInvoiceLineItem[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const description = clean(descriptions[index]);
    const ordered = parseMooreQtyUnit(orderedLines[index]);
    const shipped = parseMooreQtyUnit(shippedLines[index]);
    const unitOfMeasure = upper(unitLines[index]) || shipped.unit || ordered.unit || null;
    const sku = clean(itemNumbers[index]) || null;
    const extension = toNumber(netAmountLines[index]);
    const unitPrice = toNumber(unitPriceLines[index]);

    if (!description || extension == null) continue;

    items.push({
      lineNumber: index + 1,
      shippedQty: shipped.qty,
      orderedQty: ordered.qty,
      unitOfMeasure,
      sku,
      description,
      suggestedPrice: null,
      units: shipped.qty ?? ordered.qty,
      unitPrice,
      pricePer: unitOfMeasure,
      extension,
      rawLine: clean(
        [
          sku,
          description,
          shippedLines[index],
          unitPriceLines[index],
          unitOfMeasure,
          netAmountLines[index],
        ]
          .filter(Boolean)
          .join(" | "),
      ),
    });
  }

  return items;
}

export function parseSupplierInvoiceText(text: string): ParsedSupplierInvoice {
  const source = String(text || "");
  const flat = clean(source);
  const normalized = upper(flat);

  const isFarmers = normalized.includes("FARMERS LUMBER COMPANY");
  const isMoore = normalized.includes("MOORE SUPPLY");

  const poCode = extractDcflowPoCode(flat);

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

  const customerName = normalized.includes("DANIEL CERNOCH PLUMBING")
    ? "DANIEL CERNOCH PLUMBING"
    : normalized.includes("DANIEL CERNOCH PLBG")
      ? "DANIEL CERNOCH PLBG 715"
      : null;

  const purchasedBy = isMoore
    ? parseMooreOrderedBy(source)
    : flat.match(/\(([A-Z0-9 .'-]+)\)\s+[0-9]+\.[0-9]{2}/i)?.[1] || null;

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
