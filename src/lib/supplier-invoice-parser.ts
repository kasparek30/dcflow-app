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
  return (
    String(text || "")
      .match(/\b[SPT]\d{3,}[A-Z]{1,2}\b/i)?.[0]
      ?.toUpperCase() || null
  );
}

function overlapsAnySpan(
  index: number,
  length: number,
  spans: Array<{ start: number; end: number }>,
) {
  const start = index;
  const end = index + length;

  return spans.some((span) => start < span.end && end > span.start);
}

function sortLineItems(items: ParsedSupplierInvoiceLineItem[]) {
  return [...items].sort((a, b) => {
    const lineA =
      typeof a.lineNumber === "number" ? a.lineNumber : Number.MAX_SAFE_INTEGER;
    const lineB =
      typeof b.lineNumber === "number" ? b.lineNumber : Number.MAX_SAFE_INTEGER;

    return lineA - lineB;
  });
}

function parseFarmersLineItems(flat: string) {
  const items: ParsedSupplierInvoiceLineItem[] = [];

  const lineSection =
    flat.split(
      "LINE SHIPPED ORDERED UM SKU DESCRIPTION SUGG UNITS PRICE/ PER EXTENSION",
    )[1] || "";

  if (!lineSection) return items;

  const stopSection =
    lineSection.split("I understand that")[0] || lineSection;

  const occupiedSpans: Array<{ start: number; end: number }> = [];

  /*
   * Farmers full row format with a populated SUGG column:
   *
   * 1 2 2 EA 2408YP 2x4x8 #2&BTR YELLOW PINE 4.19 2 3.771 /EA 7.54CN
   *
   * line / shipped / ordered / unit / sku / description /
   * suggested price / units / unit price / price per / extension
   */
  const fullPattern =
    /(\d+)\s+(\d+)\s+(\d+)\s+([A-Z]+)\s+([A-Z0-9.-]+)\s+(.+?)\s+([0-9]*\.[0-9]{2})\s+(\d+(?:\.\d+)?)\s+([0-9]+\.[0-9]+)\s*\/([A-Z]+)\s+([0-9]+\.[0-9]{2})[A-Z]*/gi;

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

  /*
   * Farmers full row format where the SUGG column is blank:
   *
   * 2 1 1 BG 7193378 J-HOOK POLY ALLOY BLACK 1/2IN 1 3.99 /BG 3.99N
   * 3 1 1 BG 7193386 J-HOOK POLY ALLOY BLACK 3/4IN 1 4.79 /BG 4.79N
   *
   * line / shipped / ordered / unit / sku / description /
   * units / unit price / price per / extension
   *
   * This pattern is evaluated after the populated-SUGG pattern.
   * Any overlapping match is ignored so populated-SUGG rows are not duplicated.
   */
  const fullWithoutSuggestedPricePattern =
    /(\d+)\s+(\d+)\s+(\d+)\s+([A-Z]+)\s+([A-Z0-9.-]+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([0-9]+\.[0-9]+)\s*\/([A-Z]+)\s+([0-9]+\.[0-9]{2})[A-Z]*/gi;

  for (const match of stopSection.matchAll(fullWithoutSuggestedPricePattern)) {
    const index = match.index ?? -1;

    if (
      index >= 0 &&
      overlapsAnySpan(index, match[0].length, occupiedSpans)
    ) {
      continue;
    }

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
      suggestedPrice: null,
      units: toNumber(match[7]),
      unitPrice: toNumber(match[8]),
      pricePer: match[9] || null,
      extension: toNumber(match[10]),
      rawLine: clean(match[0]),
    });
  }

  /*
   * Older/alternate Farmers row format where shipped and ordered are not
   * separately represented in the extracted row:
   *
   * 1 5 EA 8111486 1/2 CPVC CAP .69 5 0.621 /EA 3.11
   *
   * This can accidentally match inside one of the full-format rows,
   * so all already occupied spans are skipped.
   */
  const shortPattern =
    /(\d+)\s+(\d+)\s+([A-Z]+)\s+([A-Z0-9.-]+)\s+(.+?)\s+([0-9]*\.[0-9]{2})\s+(\d+(?:\.\d+)?)\s+([0-9]+\.[0-9]+)\s*\/([A-Z]+)\s+([0-9]+\.[0-9]{2})[A-Z]*/gi;

  for (const match of stopSection.matchAll(shortPattern)) {
    const index = match.index ?? -1;

    if (
      index >= 0 &&
      overlapsAnySpan(index, match[0].length, occupiedSpans)
    ) {
      continue;
    }

    if (index >= 0) {
      occupiedSpans.push({
        start: index,
        end: index + match[0].length,
      });
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

  return sortLineItems(items);
}

function parseMooreInvoiceNumber(flat: string) {
  return (
    flat.match(
      /\bINVOICE\s*(?:NUMBER|NO\.?|#)?\s*:?\s*([A-Z0-9.-]{5,})\b/i,
    )?.[1] ||
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

    if (match?.[1]) {
      return toNumber(match[1]);
    }
  }

  return null;
}

function parseMooreLineItems(source: string) {
  const items: ParsedSupplierInvoiceLineItem[] = [];

  const lines = String(source || "")
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean);

  /*
   * Moore invoices normally extract vertically rather than as horizontal
   * material rows. This recognizes the real Moore layout already validated
   * from the production T001B invoice.
   */
  const flat = clean(source);

  const itemNumber =
    flat.match(/\bITEM\s+NUMBER\s+([A-Z0-9./-]+)\b/i)?.[1] || null;

  const descriptionMatch = flat.match(
    /\bPRODUCT\s+DESCRIPTION\s+(.+?)\s+QTY\s+ORDERED\b/i,
  );

  const description = descriptionMatch ? clean(descriptionMatch[1]) : "";

  const orderedMatch = flat.match(
    /\bQTY\s+ORDERED\s+([0-9]+(?:\.[0-9]+)?)\s*([A-Z]+)\b/i,
  );

  const shippedMatch = flat.match(
    /\bQTY\s+SHIPPED\s+([0-9]+(?:\.[0-9]+)?)\s*([A-Z]+)\b/i,
  );

  const unitPriceMatch = flat.match(
    /\bUNIT\s+PRICE\s+([0-9,]+\.[0-9]+)\b/i,
  );

  const netAmountMatch = flat.match(
    /\bNET\s+AMOUNT\s+([0-9,]+\.[0-9]{2})\b/i,
  );

  if (
    itemNumber &&
    description &&
    netAmountMatch?.[1]
  ) {
    const unitOfMeasure =
      shippedMatch?.[2]?.toUpperCase() ||
      orderedMatch?.[2]?.toUpperCase() ||
      null;

    items.push({
      lineNumber: 1,
      shippedQty: toNumber(shippedMatch?.[1]),
      orderedQty: toNumber(orderedMatch?.[1]),
      unitOfMeasure,
      sku: itemNumber,
      description,
      suggestedPrice: null,
      units: toNumber(shippedMatch?.[1] || orderedMatch?.[1]),
      unitPrice: toNumber(unitPriceMatch?.[1]),
      pricePer: unitOfMeasure,
      extension: toNumber(netAmountMatch[1]),
      rawLine: clean(
        [
          itemNumber,
          description,
          shippedMatch?.[1] || orderedMatch?.[1] || "",
          unitOfMeasure || "",
          unitPriceMatch?.[1] || "",
          netAmountMatch[1],
        ]
          .filter(Boolean)
          .join(" "),
      ),
    });

    return items;
  }

  /*
   * Fallback for any Moore PDF that extracts as horizontal row text rather
   * than the currently validated vertical format.
   */
  const rejectLine =
    /\b(INVOICE|CUSTOMER|ACCOUNT|SHIP\s+TO|SOLD\s+TO|TOTAL|SUBTOTAL|TAX|TERMS|PAGE|REMIT|MOORE\s+SUPPLY|BRANCH|ORDER\s+DATE|INVOICE\s+DATE|CUSTOMER\s+P\.?O\.?)\b/i;

  for (const line of lines) {
    if (rejectLine.test(line)) continue;

    const amountMatches = Array.from(
      line.matchAll(/-?\$?\d[\d,]*\.\d{2}/g),
    );

    if (amountMatches.length === 0) continue;

    const extensionMatch = amountMatches[amountMatches.length - 1];
    const extension = toNumber(extensionMatch[0]);

    if (extension == null) continue;

    const unitPriceMatchFromLine =
      amountMatches.length >= 2
        ? amountMatches[amountMatches.length - 2]
        : null;

    const unitPrice = unitPriceMatchFromLine
      ? toNumber(unitPriceMatchFromLine[0])
      : null;

    const priceTailStart =
      unitPriceMatchFromLine?.index ??
      extensionMatch.index ??
      Math.max(0, line.length - extensionMatch[0].length);

    const beforePrices = clean(line.slice(0, priceTailStart));
    const tokens = beforePrices.split(/\s+/g).filter(Boolean);

    if (tokens.length < 3) continue;

    let lineNumber: number | null = null;
    let qty: number | null = null;
    let unitOfMeasure: string | null = null;
    let sku: string | null = null;
    let fallbackDescription = "";

    let cursor = 0;

    if (/^\d+$/.test(tokens[0]) && tokens.length >= 5) {
      lineNumber = toNumber(tokens[0]);
      cursor = 1;
    }

    const qtyIndex = tokens.findIndex((token, index) => {
      if (index < cursor) return false;
      return /^\d+(?:\.\d+)?$/.test(token);
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

      return (
        /[0-9]/.test(token) &&
        /^[A-Z0-9./-]+$/i.test(token)
      );
    });

    if (skuIndex >= 0) {
      sku = tokens[skuIndex];
      fallbackDescription = clean(tokens.slice(skuIndex + 1).join(" "));
    } else {
      fallbackDescription = clean(tokens.slice(cursor).join(" "));
    }

    if (!fallbackDescription || fallbackDescription.length < 3) continue;

    items.push({
      lineNumber,
      shippedQty: qty,
      orderedQty: qty,
      unitOfMeasure,
      sku,
      description: fallbackDescription,
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


function decodeHtmlEntitiesForParsing(value: string) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    });
}

function htmlToTextForParsing(value: string) {
  const raw = String(value || "");

  return decodeHtmlEntitiesForParsing(
    raw
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|table|tbody|thead|h1|h2|h3|h4|h5|li)>/gi, "\n")
      .replace(/<\/td>/gi, " ")
      .replace(/<\/th>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean)
    .join("\n");
}

function parseSupplyHouseInvoiceNumber(flat: string) {
  return (
    flat.match(/\bInvoice\s+of\s+Order\s*#\s*([0-9]+)/i)?.[1] ||
    flat.match(/\bOrder\s*#\s*([0-9]+)/i)?.[1] ||
    flat.match(/\bInvoice\s*#\s*([0-9]+)/i)?.[1] ||
    null
  );
}

function parseSupplyHouseTotal(flat: string) {
  const patterns = [
    /\bOrder\s+Total:\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bTotal\s+Payments:\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bSubtotal:\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
    /\bTotal\s*\$?\s*([0-9,]+\.[0-9]{2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (match?.[1]) return toNumber(match[1]);
  }

  return null;
}

function parseSupplyHouseLineItems(source: string) {
  const items: ParsedSupplierInvoiceLineItem[] = [];
  const htmlSource = String(source || "");

  function addItem(args: {
    rowText: string;
    lineNumber: number;
  }) {
    const rowText = clean(args.rowText);
    const sku = rowText.match(/\bSKU:\s*([A-Z0-9.-]+)/i)?.[1] || null;
    if (!sku) return;

    const description = clean(rowText.split(/\bSKU:/i)[0]);
    if (!description) return;

    const brand =
      rowText.match(/\bBrand:\s*(.+?)(?=\s+\$[0-9,]+\.[0-9]{2}|$)/i)?.[1] ||
      null;

    const moneyMatches = Array.from(rowText.matchAll(/\$?\s*[0-9,]+\.[0-9]{2}/g));
    if (moneyMatches.length === 0) return;

    const unitPriceMatch = moneyMatches[0];
    const extensionMatch = moneyMatches[moneyMatches.length - 1];

    const unitPrice = toNumber(unitPriceMatch[0]);
    const extension = toNumber(extensionMatch[0]);

    const firstEnd = (unitPriceMatch.index ?? 0) + unitPriceMatch[0].length;
    const lastStart = extensionMatch.index ?? rowText.length;
    const betweenPrices = rowText.slice(firstEnd, lastStart);
    const qty =
      toNumber(betweenPrices.match(/\b([0-9]+(?:\.[0-9]+)?)\b/)?.[1]) || 1;

    items.push({
      lineNumber: args.lineNumber,
      shippedQty: qty,
      orderedQty: qty,
      unitOfMeasure: "EA",
      sku,
      description,
      suggestedPrice: null,
      units: qty,
      unitPrice,
      pricePer: "EA",
      extension,
      rawLine: clean(
        [
          description,
          `SKU: ${sku}`,
          brand ? `Brand: ${clean(brand)}` : "",
          unitPrice != null ? `$${unitPrice.toFixed(2)}` : "",
          qty,
          extension != null ? `$${extension.toFixed(2)}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      ),
    });
  }

  const htmlRows = Array.from(
    htmlSource.matchAll(/<tr\b[\s\S]*?\bSKU:\s*[A-Z0-9.-]+[\s\S]*?<\/tr>/gi),
  );

  htmlRows.forEach((match, index) => {
    addItem({
      rowText: htmlToTextForParsing(match[0]),
      lineNumber: index + 1,
    });
  });

  if (items.length > 0) return items;

  const text = htmlToTextForParsing(source);
  const orderSection =
    text.split(/Order Summary/i)[1]?.split(/Subtotal:/i)[0] ||
    text.split(/Item\s+Price\s+Qty\s+Total/i)[1]?.split(/Subtotal:/i)[0] ||
    text;

  const pattern =
    /(.+?)\s+SKU:\s*([A-Z0-9.-]+)\s+Brand:\s*(.+?)\s+\$([0-9,]+\.[0-9]{2})\s+([0-9]+(?:\.[0-9]+)?)\s+\$([0-9,]+\.[0-9]{2})/gi;

  let lineNumber = 1;

  for (const match of orderSection.matchAll(pattern)) {
    const description = clean(match[1]);
    const sku = clean(match[2]);
    const brand = clean(match[3]);
    const unitPrice = toNumber(match[4]);
    const qty = toNumber(match[5]) || 1;
    const extension = toNumber(match[6]);

    if (!description || !sku) continue;

    items.push({
      lineNumber,
      shippedQty: qty,
      orderedQty: qty,
      unitOfMeasure: "EA",
      sku,
      description,
      suggestedPrice: null,
      units: qty,
      unitPrice,
      pricePer: "EA",
      extension,
      rawLine: clean(
        [
          description,
          `SKU: ${sku}`,
          brand ? `Brand: ${brand}` : "",
          unitPrice != null ? `$${unitPrice.toFixed(2)}` : "",
          qty,
          extension != null ? `$${extension.toFixed(2)}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      ),
    });

    lineNumber += 1;
  }

  return items;
}

export function parseSupplierInvoiceText(
  text: string,
): ParsedSupplierInvoice {
  const source = String(text || "");
  const textForParsing = htmlToTextForParsing(source);
  const flat = clean(textForParsing || source);
  const upper = flat.toUpperCase();
  const sourceUpper = source.toUpperCase();

  const isFarmers = upper.includes("FARMERS LUMBER COMPANY");
  const isMoore = upper.includes("MOORE SUPPLY");
  const isSupplyHouse =
    upper.includes("SUPPLYHOUSE") ||
    sourceUpper.includes("SUPPLYHOUSE.COM") ||
    sourceUpper.includes("SUPPLYHOUSE");

  const genericPoCode = extractDcflowPoCode(flat);

  const customerPoValue =
    flat.match(
      /\bCUSTOMER\s+P\.?\s*O\.?\s*(?:NUMBER|NO\.?|#|:)?\s*([A-Z0-9.-]+)/i,
    )?.[1] ||
    flat.match(
      /\bCUSTOMER\s+PO\s*(?:NUMBER|NO\.?|#|:)?\s*([A-Z0-9.-]+)/i,
    )?.[1] ||
    flat.match(/\bPO\s*#:\s*([A-Z0-9.-]+)/i)?.[1] ||
    flat.match(/\bPO\s*#\s*([A-Z0-9.-]+)/i)?.[1] ||
    null;

  const customerPoCode = customerPoValue
    ? extractDcflowPoCode(customerPoValue)
    : null;

  const poCode = customerPoCode || genericPoCode;

  const farmersInvoiceNumber =
    flat.match(/INVOICE:\s*([0-9]+)/i)?.[1] ||
    flat.match(/\b([0-9]{5,})\s*INVOICE:/i)?.[1] ||
    flat.match(/\b([0-9]{5,})INVOICE:/i)?.[1] ||
    flat.match(/\bINVOICE\s*#?\s*([0-9]{4,})\b/i)?.[1] ||
    null;

  const invoiceNumber = isSupplyHouse
    ? parseSupplyHouseInvoiceNumber(flat) || farmersInvoiceNumber
    : isMoore
      ? parseMooreInvoiceNumber(flat) || farmersInvoiceNumber
      : farmersInvoiceNumber;

  const vendorName = isFarmers
    ? "FARMERS LUMBER COMPANY"
    : isMoore
      ? "MOORE SUPPLY"
      : isSupplyHouse
        ? "SUPPLYHOUSE"
        : null;

  const customerName =
    flat.includes("DANIEL CERNOCH PLUMBING") ||
    flat.includes("DANIEL CERNOCH PLBG")
      ? "DANIEL CERNOCH PLUMBING"
      : null;

  const purchasedBy =
    flat.match(/\(([A-Z0-9 .'-]+)\)\s+[0-9]+\.[0-9]{2}/i)?.[1] ||
    flat.match(/\bORDERED\s+BY\s+([A-Z0-9 .'-]+?)\s+(?:SHIPPED|SALESPERSON|ORDER\s+WRITER)\b/i)?.[1] ||
    null;

  const dueDate =
    flat.match(/\bDUE DATE:\s*([0-9/.-]+)\b/i)?.[1] ||
    flat.match(/\bDUE\s+DATE\s*([0-9/.-]+)\b/i)?.[1] ||
    null;

  const farmersAmountCharged =
    flat.match(
      /\*\*\s*AMOUNT CHARGED TO STORE ACCOUNT\s*\*\*\s*([0-9]+\.[0-9]{2})/i,
    )?.[1] || null;

  const total = isSupplyHouse
    ? parseSupplyHouseTotal(flat)
    : isMoore
      ? parseMooreTotal(flat)
      : toNumber(farmersAmountCharged);

  const lineItems = isSupplyHouse
    ? parseSupplyHouseLineItems(source)
    : isMoore
      ? parseMooreLineItems(source)
      : parseFarmersLineItems(flat);

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

