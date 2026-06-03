// src/lib/supplyhouse-email-pdf.ts
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function sanitizeEmailHtmlForRendering(html: string) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
}

function buildPrintableEmailHtml(args: {
  subject: string;
  from: string;
  to?: string | null;
  messageId?: string | null;
  receivedAt?: string | null;
  bodyHtml: string;
}) {
  const sanitizedBody = sanitizeEmailHtmlForRendering(args.bodyHtml);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(clean(args.subject) || "SupplyHouse Email Invoice")}</title>
  <style>
    @page { size: Letter; margin: 0.35in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #ffffff;
      color: #1f1f1f;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .dcflow-capture-header {
      border: 1px solid #d0d7de;
      border-radius: 10px;
      padding: 12px 14px;
      margin: 0 0 14px 0;
      background: #f6f8fa;
      page-break-inside: avoid;
    }
    .dcflow-capture-title {
      font-size: 14px;
      font-weight: 700;
      color: #0b3558;
      margin-bottom: 8px;
    }
    .dcflow-capture-meta {
      font-size: 11px;
      line-height: 1.45;
      color: #374151;
      word-break: break-word;
    }
    .dcflow-capture-meta strong { color: #111827; }
    .dcflow-email-body {
      width: 100%;
      overflow: visible;
    }
    .dcflow-email-body img {
      max-width: 100%;
      height: auto;
    }
    .dcflow-email-body table {
      max-width: 100%;
    }
    a { color: inherit; }
  </style>
</head>
<body>
  <div class="dcflow-capture-header">
    <div class="dcflow-capture-title">DCFlow Supplier Email PDF Snapshot</div>
    <div class="dcflow-capture-meta"><strong>Subject:</strong> ${escapeHtml(clean(args.subject) || "—")}</div>
    <div class="dcflow-capture-meta"><strong>From:</strong> ${escapeHtml(clean(args.from) || "—")}</div>
    ${clean(args.to) ? `<div class="dcflow-capture-meta"><strong>To:</strong> ${escapeHtml(clean(args.to))}</div>` : ""}
    ${clean(args.receivedAt) ? `<div class="dcflow-capture-meta"><strong>Received:</strong> ${escapeHtml(clean(args.receivedAt))}</div>` : ""}
    ${clean(args.messageId) ? `<div class="dcflow-capture-meta"><strong>Message ID:</strong> ${escapeHtml(clean(args.messageId))}</div>` : ""}
  </div>
  <div class="dcflow-email-body">
    ${sanitizedBody}
  </div>
</body>
</html>`;
}

async function tryRenderHtmlToPdfBuffer(args: {
  subject: string;
  from: string;
  to?: string | null;
  messageId?: string | null;
  receivedAt?: string | null;
  bodyHtml?: string | null;
}) {
  const bodyHtml = String(args.bodyHtml || "").trim();
  if (!bodyHtml) return null;

  let browser: any = null;

  try {
    const puppeteerModule = await import("puppeteer");
    const puppeteer = puppeteerModule.default || puppeteerModule;

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=none",
      ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(25000);
    page.setDefaultTimeout(25000);

    await page.setViewport({
      width: 900,
      height: 1200,
      deviceScaleFactor: 1,
    });

    const printableHtml = buildPrintableEmailHtml({
      subject: args.subject,
      from: args.from,
      to: args.to || null,
      messageId: args.messageId || null,
      receivedAt: args.receivedAt || null,
      bodyHtml,
    });

    await page.setContent(printableHtml, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0.35in",
        right: "0.35in",
        bottom: "0.35in",
        left: "0.35in",
      },
    });

    return Buffer.from(pdf);
  } catch (err) {
    console.warn("SupplyHouse HTML email PDF rendering failed; falling back to text PDF.", err);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn("SupplyHouse PDF browser close warning:", closeErr);
      }
    }
  }
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

async function generateFallbackTextPdfBuffer(args: {
  subject: string;
  from: string;
  to?: string | null;
  messageId?: string | null;
  receivedAt?: string | null;
  bodyText: string;
}) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  const marginTop = 48;
  const marginBottom = 48;
  const pageWidth = 612;
  const pageHeight = 792;
  const usableWidth = pageWidth - marginX * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginTop;

  function addPageIfNeeded(heightNeeded: number) {
    if (y - heightNeeded >= marginBottom) return;
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - marginTop;
  }

  function drawLine(
    text: string,
    options?: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      lineGap?: number;
    },
  ) {
    const size = options?.size || 10;
    const font = options?.font || regular;
    const color = options?.color || rgb(0.13, 0.13, 0.13);
    const lineGap = options?.lineGap ?? 4;

    const wrapped = wrapText({
      text,
      font,
      fontSize: size,
      maxWidth: usableWidth,
    });

    for (const wrappedLine of wrapped) {
      addPageIfNeeded(size + lineGap);
      page.drawText(wrappedLine, {
        x: marginX,
        y,
        size,
        font,
        color,
      });
      y -= size + lineGap;
    }
  }

  function drawSpacer(points = 8) {
    addPageIfNeeded(points);
    y -= points;
  }

  function drawRule() {
    addPageIfNeeded(10);
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1,
      color: rgb(0.82, 0.82, 0.82),
    });
    y -= 12;
  }

  drawLine("SUPPLYHOUSE EMAIL INVOICE SNAPSHOT", {
    font: bold,
    size: 15,
    color: rgb(0.10, 0.24, 0.42),
    lineGap: 5,
  });
  drawLine("Generated by DCFlow from the supplier email body.", {
    size: 9,
    color: rgb(0.40, 0.40, 0.40),
  });
  drawSpacer(4);
  drawRule();

  drawLine(`Subject: ${clean(args.subject) || "—"}`, { font: bold, size: 10 });
  drawLine(`From: ${clean(args.from) || "—"}`, { size: 9 });
  if (clean(args.to)) drawLine(`To: ${clean(args.to)}`, { size: 9 });
  if (clean(args.receivedAt)) drawLine(`Received: ${clean(args.receivedAt)}`, { size: 9 });
  if (clean(args.messageId)) drawLine(`Message ID: ${clean(args.messageId)}`, { size: 8, color: rgb(0.45, 0.45, 0.45) });

  drawSpacer(8);
  drawRule();
  drawLine("EMAIL BODY", { font: bold, size: 11, color: rgb(0.10, 0.24, 0.42) });
  drawSpacer(4);

  const bodyLines = String(args.bodyText || "")
    .split(/\r?\n/g)
    .map((line) => clean(line))
    .filter(Boolean);

  for (const line of bodyLines) {
    drawLine(line, { size: 9, lineGap: 3 });
  }

  return Buffer.from(await pdfDoc.save());
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
  const renderedHtmlPdf = await tryRenderHtmlToPdfBuffer({
    subject: args.subject,
    from: args.from,
    to: args.to || null,
    messageId: args.messageId || null,
    receivedAt: args.receivedAt || null,
    bodyHtml: args.bodyHtml || null,
  });

  if (renderedHtmlPdf) {
    return renderedHtmlPdf;
  }

  return generateFallbackTextPdfBuffer({
    subject: args.subject,
    from: args.from,
    to: args.to || null,
    messageId: args.messageId || null,
    receivedAt: args.receivedAt || null,
    bodyText: args.bodyText,
  });
}
