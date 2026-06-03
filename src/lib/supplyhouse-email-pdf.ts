// src/lib/supplyhouse-email-pdf.ts
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

type SupplyHousePdfItem = {
  description: string;
  sku: string | null;
  brand: string | null;
  imageUrl: string | null;
  unitPrice: number | null;
  qty: number | null;
  lineTotal: number | null;
};

type SupplyHousePdfSummary = {
  vendorName: string;
  orderNumber: string | null;
  poCode: string | null;
  orderDate: string | null;
  orderTotal: number | null;
  subject: string;
  from: string;
  to: string | null;
  receivedAt: string | null;
  messageId: string | null;
  items: SupplyHousePdfItem[];
};

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function money(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  return `$${value.toFixed(2)}`;
}

function toNumber(value: string | null | undefined) {
  if (!value) return null;

  const cleaned = value.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);

  return Number.isFinite(n) ? n : null;
}

function normalizeSupplyHouseAssetUrls(value: string) {
  return String(value || "")
    .replace(/http:\/\/s3\.supplyhouse\.com/gi, "https://s3.supplyhouse.com")
    .replace(/http:\/\/www\.supplyhouse\.com/gi, "https://www.supplyhouse.com")
    .replace(/http:\/\/supplyhouse\.com/gi, "https://supplyhouse.com");
}

export function decodeBasicHtmlEntities(value: string) {
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

export function htmlToPlainText(htmlOrText: unknown) {
  const raw = String(htmlOrText || "");
  if (!raw) return "";

  const withBreaks = raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|table|tbody|thead|h1|h2|h3|h4|h5|li)>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<\/th>/gi, "  ")
    .replace(/<[^>]+>/g, " ");

  return decodeBasicHtmlEntities(withBreaks)
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean)
    .join("\n");
}

function stripTags(value: string) {
  return decodeBasicHtmlEntities(
    String(value || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirst(source: string, pattern: RegExp) {
  return clean(source.match(pattern)?.[1] || "") || null;
}

function extractSupplyHouseItemsFromHtml(bodyHtml: string) {
  const html = normalizeSupplyHouseAssetUrls(String(bodyHtml || ""));
  const items: SupplyHousePdfItem[] = [];

  const rowPattern =
    /<tr[^>]*>\s*<td[^>]*>\s*<a[^>]*>\s*<img[^>]*src=["']([^"']+)["'][\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?SKU:\s*([^<\s]+)[\s\S]*?Brand:\s*([^<]+)<\/span>[\s\S]*?<\/td>\s*<td[^>]*>\s*\$?\s*([0-9,]+\.[0-9]{2})\s*<\/td>\s*<td[^>]*>\s*([0-9.]+)\s*<\/td>\s*<td[^>]*>\s*\$?\s*([0-9,]+\.[0-9]{2})\s*<\/td>\s*<\/tr>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const imageUrl = normalizeSupplyHouseAssetUrls(clean(match[1]));
    const description = stripTags(match[2]);
    const sku = clean(match[3]) || null;
    const brand = stripTags(match[4]) || null;
    const unitPrice = toNumber(match[5]);
    const qty = toNumber(match[6]);
    const lineTotal = toNumber(match[7]);

    if (!description || !sku) continue;

    items.push({
      description,
      sku,
      brand,
      imageUrl: imageUrl || null,
      unitPrice,
      qty,
      lineTotal,
    });
  }

  return items;
}

function cleanDescriptionFromTextLine(value: string) {
  return clean(
    String(value || "")
      .replace(/\[https?:\/\/[^\]]+\]/gi, " ")
      .replace(/https?:\/\/\S+/gi, " "),
  );
}

function extractSupplyHouseItemsFromText(bodyText: string) {
  const source = normalizeSupplyHouseAssetUrls(String(bodyText || ""));
  const lines = source
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean);

  const items: SupplyHousePdfItem[] = [];
  const imageUrl =
    source.match(
      /https?:\/\/s3\.supplyhouse\.com\/images\/products\/small\/[^\]\s"')]+/i,
    )?.[0] || null;

  for (let i = 0; i < lines.length; i += 1) {
    const skuMatch = lines[i].match(/\bSKU:\s*([A-Z0-9.-]+)\b/i);
    if (!skuMatch) continue;

    const sku = clean(skuMatch[1]) || null;
    const brand =
      lines[i].match(/\bBrand:\s*([A-Z0-9 .'-]+)\b/i)?.[1]?.trim() || null;

    let description = "";

    for (let lookBack = i - 1; lookBack >= Math.max(0, i - 4); lookBack -= 1) {
      const possible = cleanDescriptionFromTextLine(lines[lookBack]);

      if (
        possible &&
        !/^item\s+price\s+qty\s+total$/i.test(possible) &&
        !/^order summary$/i.test(possible) &&
        !/^https?:\/\//i.test(possible)
      ) {
        description = possible;
        break;
      }
    }

    let unitPrice: number | null = null;
    let qty: number | null = null;
    let lineTotal: number | null = null;

    for (let lookAhead = i + 1; lookAhead <= Math.min(lines.length - 1, i + 4); lookAhead += 1) {
      const priceLine = lines[lookAhead];
      const priceMatch = priceLine.match(
        /\$?\s*([0-9,]+\.[0-9]{2})\s+([0-9.]+)\s+\$?\s*([0-9,]+\.[0-9]{2})/,
      );

      if (priceMatch) {
        unitPrice = toNumber(priceMatch[1]);
        qty = toNumber(priceMatch[2]);
        lineTotal = toNumber(priceMatch[3]);
        break;
      }
    }

    if (!description && sku) {
      description = `SupplyHouse item ${sku}`;
    }

    if (!sku || !description) continue;

    items.push({
      description,
      sku,
      brand,
      imageUrl: imageUrl ? normalizeSupplyHouseAssetUrls(imageUrl) : null,
      unitPrice,
      qty,
      lineTotal,
    });
  }

  return items;
}

function parseSupplyHouseSummary(args: {
  subject: string;
  from: string;
  to?: string | null;
  messageId?: string | null;
  receivedAt?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
}): SupplyHousePdfSummary {
  const bodyText = String(args.bodyText || "");
  const bodyHtml = String(args.bodyHtml || "");
  const flat = clean(`${args.subject || ""} ${bodyText}`);

  const orderNumber =
    extractFirst(flat, /\bInvoice\s+of\s+Order\s*#\s*([0-9]+)/i) ||
    extractFirst(flat, /\bOrder\s*#\s*([0-9]+)/i) ||
    extractFirst(args.subject, /\bInvoice\s*#\s*([0-9]+)/i);

  const poCode =
    extractFirst(flat, /\bPO\s*#:\s*([SPT]\d{3,}[A-Z]{1,2})\b/i)?.toUpperCase() ||
    extractFirst(flat, /\bPO\s*#\s*([SPT]\d{3,}[A-Z]{1,2})\b/i)?.toUpperCase() ||
    null;

  const orderDate =
    extractFirst(flat, /\bOrder\s+Date:\s*([0-9/.-]+)/i) ||
    extractFirst(flat, /\bORDER\s+DATE:\s*([0-9/.-]+)/i);

  const orderTotal =
    toNumber(extractFirst(flat, /\bOrder\s+Total:\s*\$?\s*([0-9,]+\.[0-9]{2})/i)) ??
    toNumber(extractFirst(flat, /\bTotal\s+Payments:\s*\$?\s*([0-9,]+\.[0-9]{2})/i)) ??
    toNumber(extractFirst(flat, /\bTotal:\s*\$?\s*([0-9,]+\.[0-9]{2})/i));

  const htmlItems = extractSupplyHouseItemsFromHtml(bodyHtml);
  const textItems = htmlItems.length ? [] : extractSupplyHouseItemsFromText(bodyText);
  const items = htmlItems.length ? htmlItems : textItems;

  return {
    vendorName: "SUPPLYHOUSE",
    orderNumber,
    poCode,
    orderDate,
    orderTotal,
    subject: clean(args.subject) || "SupplyHouse invoice",
    from: clean(args.from) || "customerservice@supplyhouse.com",
    to: clean(args.to) || null,
    receivedAt: clean(args.receivedAt) || null,
    messageId: clean(args.messageId) || null,
    items,
  };
}

function wrapText(args: {
  text: string;
  font: PDFFont;
  fontSize: number;
  maxWidth: number;
}) {
  const words = String(args.text || "").split(/\s+/g).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    const width = args.font.widthOfTextAtSize(next, args.fontSize);

    if (width <= args.maxWidth || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);

  return lines.length ? lines : [""];
}

async function fetchImageBytes(url: string) {
  const normalizedUrl = normalizeSupplyHouseAssetUrls(clean(url));
  if (!normalizedUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "DCFlow/1.0 Supplier Invoice Snapshot",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    const arrayBuffer = await response.arrayBuffer();

    return {
      bytes: new Uint8Array(arrayBuffer),
      contentType,
      url: normalizedUrl,
    };
  } catch (err) {
    console.warn("SupplyHouse product image fetch failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function embedImageFromUrl(pdfDoc: PDFDocument, url: string | null) {
  if (!url) return null;

  const fetched = await fetchImageBytes(url);
  if (!fetched) return null;

  try {
    const lowerUrl = fetched.url.toLowerCase();
    const contentType = fetched.contentType.toLowerCase();

    if (contentType.includes("png") || lowerUrl.endsWith(".png")) {
      return await pdfDoc.embedPng(fetched.bytes);
    }

    if (
      contentType.includes("jpeg") ||
      contentType.includes("jpg") ||
      lowerUrl.endsWith(".jpg") ||
      lowerUrl.endsWith(".jpeg")
    ) {
      return await pdfDoc.embedJpg(fetched.bytes);
    }

    return null;
  } catch (err) {
    console.warn("SupplyHouse product image embed failed:", err);
    return null;
  }
}

async function buildItemImages(pdfDoc: PDFDocument, items: SupplyHousePdfItem[]) {
  const imageMap = new Map<number, PDFImage>();

  for (let index = 0; index < items.length; index += 1) {
    const image = await embedImageFromUrl(pdfDoc, items[index].imageUrl);
    if (image) imageMap.set(index, image);
  }

  return imageMap;
}

export async function generateSupplyHouseEmailPdfBuffer(args: {
  subject: string;
  from: string;
  to?: string | null;
  messageId?: string | null;
  receivedAt?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
}) {
  const summary = parseSupplyHouseSummary(args);

  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const itemImages = await buildItemImages(pdfDoc, summary.items);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 42;
  const marginTop = 42;
  const marginBottom = 42;
  const usableWidth = pageWidth - marginX * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginTop;

  function addPageIfNeeded(heightNeeded: number) {
    if (y - heightNeeded >= marginBottom) return;

    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - marginTop;
  }

  function drawText(
    text: string,
    x: number,
    yPos: number,
    options?: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
    },
  ) {
    page.drawText(String(text || ""), {
      x,
      y: yPos,
      size: options?.size || 10,
      font: options?.font || regular,
      color: options?.color || rgb(0.13, 0.13, 0.13),
      maxWidth: options?.maxWidth,
    });
  }

  function drawWrapped(
    text: string,
    options?: {
      x?: number;
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
      lineGap?: number;
    },
  ) {
    const x = options?.x ?? marginX;
    const size = options?.size || 10;
    const font = options?.font || regular;
    const color = options?.color || rgb(0.13, 0.13, 0.13);
    const maxWidth = options?.maxWidth || usableWidth;
    const lineGap = options?.lineGap ?? 4;

    const lines = wrapText({
      text,
      font,
      fontSize: size,
      maxWidth,
    });

    for (const line of lines) {
      addPageIfNeeded(size + lineGap);
      drawText(line, x, y, {
        font,
        size,
        color,
        maxWidth,
      });
      y -= size + lineGap;
    }
  }

  function drawRule(color = rgb(0.82, 0.84, 0.86)) {
    addPageIfNeeded(12);
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1,
      color,
    });
    y -= 14;
  }

  function drawLabelValue(label: string, value: string, x: number, yPos: number, width: number) {
    drawText(label, x, yPos, {
      font: bold,
      size: 8,
      color: rgb(0.32, 0.36, 0.42),
      maxWidth: width,
    });

    drawText(value || "—", x, yPos - 13, {
      font: regular,
      size: 10,
      color: rgb(0.08, 0.09, 0.11),
      maxWidth: width,
    });
  }

  function drawCardBox(height: number) {
    addPageIfNeeded(height + 16);

    page.drawRectangle({
      x: marginX,
      y: y - height,
      width: usableWidth,
      height,
      borderWidth: 1,
      borderColor: rgb(0.82, 0.84, 0.86),
      color: rgb(0.98, 0.99, 1),
    });
  }

  // Header
  page.drawRectangle({
    x: 0,
    y: pageHeight - 98,
    width: pageWidth,
    height: 98,
    color: rgb(0.08, 0.20, 0.32),
  });

  drawText("DCFlow Supplier Invoice Snapshot", marginX, pageHeight - 44, {
    font: bold,
    size: 18,
    color: rgb(1, 1, 1),
  });

  drawText("SUPPLYHOUSE", marginX, pageHeight - 68, {
    font: bold,
    size: 12,
    color: rgb(0.75, 0.88, 1),
  });

  drawText(`Generated from supplier email`, marginX, pageHeight - 84, {
    font: regular,
    size: 9,
    color: rgb(0.84, 0.90, 0.96),
  });

  y = pageHeight - 126;

  // Summary card
  drawCardBox(118);

  drawLabelValue(
    "INVOICE / ORDER",
    summary.orderNumber ? `#${summary.orderNumber}` : "—",
    marginX + 16,
    y - 24,
    135,
  );

  drawLabelValue("PO CODE", summary.poCode || "—", marginX + 165, y - 24, 100);
  drawLabelValue("ORDER DATE", summary.orderDate || "—", marginX + 285, y - 24, 100);
  drawLabelValue("TOTAL", money(summary.orderTotal), marginX + 405, y - 24, 100);

  drawText("Source Email", marginX + 16, y - 74, {
    font: bold,
    size: 9,
    color: rgb(0.32, 0.36, 0.42),
  });

  drawText(`From: ${summary.from}`, marginX + 16, y - 89, {
    size: 8,
    color: rgb(0.18, 0.20, 0.24),
    maxWidth: usableWidth - 32,
  });

  drawText(`Subject: ${summary.subject}`, marginX + 16, y - 103, {
    size: 8,
    color: rgb(0.18, 0.20, 0.24),
    maxWidth: usableWidth - 32,
  });

  y -= 142;

  drawWrapped("Materials", {
    font: bold,
    size: 15,
    color: rgb(0.08, 0.20, 0.32),
    lineGap: 6,
  });

  drawRule();

  if (summary.items.length === 0) {
    drawWrapped("No material line items were detected in the SupplyHouse email body.", {
      size: 10,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  summary.items.forEach((item, index) => {
    const cardHeight = 118;
    drawCardBox(cardHeight);

    const cardTop = y;
    const image = itemImages.get(index);
    const imageBoxX = marginX + 16;
    const imageBoxY = cardTop - 94;
    const imageBoxSize = 72;

    page.drawRectangle({
      x: imageBoxX,
      y: imageBoxY,
      width: imageBoxSize,
      height: imageBoxSize,
      borderWidth: 1,
      borderColor: rgb(0.86, 0.88, 0.90),
      color: rgb(1, 1, 1),
    });

    if (image) {
      const scale = Math.min(
        imageBoxSize / image.width,
        imageBoxSize / image.height,
      );
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      page.drawImage(image, {
        x: imageBoxX + (imageBoxSize - drawWidth) / 2,
        y: imageBoxY + (imageBoxSize - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      });
    } else {
      drawText("No image", imageBoxX + 15, imageBoxY + 33, {
        size: 8,
        color: rgb(0.55, 0.55, 0.55),
      });
    }

    const textX = marginX + 106;
    const textWidth = usableWidth - 128;

    const descLines = wrapText({
      text: item.description,
      font: bold,
      fontSize: 11,
      maxWidth: textWidth - 95,
    });

    let lineY = cardTop - 24;

    descLines.slice(0, 2).forEach((line) => {
      drawText(line, textX, lineY, {
        font: bold,
        size: 11,
        color: rgb(0.08, 0.09, 0.11),
        maxWidth: textWidth - 95,
      });
      lineY -= 15;
    });

    drawText(money(item.lineTotal), marginX + usableWidth - 85, cardTop - 24, {
      font: bold,
      size: 11,
      color: rgb(0.08, 0.09, 0.11),
      maxWidth: 80,
    });

    drawText(`SKU: ${item.sku || "—"}`, textX, lineY - 4, {
      size: 9,
      color: rgb(0.28, 0.31, 0.36),
      maxWidth: textWidth,
    });

    drawText(`Brand: ${item.brand || "—"}`, textX, lineY - 20, {
      size: 9,
      color: rgb(0.28, 0.31, 0.36),
      maxWidth: textWidth,
    });

    drawText(`Qty: ${item.qty ?? "—"}`, textX, lineY - 42, {
      font: bold,
      size: 9,
      color: rgb(0.08, 0.20, 0.32),
      maxWidth: 90,
    });

    drawText(`Unit Price: ${money(item.unitPrice)}`, textX + 88, lineY - 42, {
      font: bold,
      size: 9,
      color: rgb(0.08, 0.20, 0.32),
      maxWidth: 130,
    });

    y -= cardHeight + 12;
  });

  y -= 8;
  drawRule();

  drawText("Order Total", marginX, y, {
    font: bold,
    size: 11,
    color: rgb(0.08, 0.09, 0.11),
  });

  drawText(money(summary.orderTotal), pageWidth - marginX - 90, y, {
    font: bold,
    size: 11,
    color: rgb(0.08, 0.09, 0.11),
    maxWidth: 90,
  });

  y -= 26;

  drawRule(rgb(0.90, 0.90, 0.90));

  drawWrapped(`Message ID: ${summary.messageId || "—"}`, {
    size: 7,
    color: rgb(0.45, 0.45, 0.45),
    lineGap: 3,
  });

  if (summary.receivedAt) {
    drawWrapped(`Received: ${summary.receivedAt}`, {
      size: 7,
      color: rgb(0.45, 0.45, 0.45),
      lineGap: 3,
    });
  }

  console.log("SupplyHouse email PDF render mode: pdf_lib_structured_snapshot");

  return Buffer.from(await pdfDoc.save());
}