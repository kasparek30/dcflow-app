// src/lib/supplier-invoice-inbox-collector.ts
import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore, adminStorageBucket } from "./firebase-admin";
import { parseSupplierInvoiceText } from "./supplier-invoice-parser";
import {
  generateSupplyHouseEmailPdfBuffer,
  htmlToPlainText,
} from "./supplyhouse-email-pdf";

type SavedSupplierAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  downloadUrl: string;
  uploadedAt: string;
  extractedText?: string;
  ocrText?: string;
  parsedInvoice?: ReturnType<typeof parseSupplierInvoiceText> | null;
  extractedMeta?: Record<string, unknown> | null;
};

type CollectorDebugEntry = {
  uid: number | string | null;
  subject: string;
  from: string;
  messageId: string;
  reason: string;
};

export type SupplierInvoiceCollectionResult = {
  mode: "bootstrap" | "scan";
  initialized: boolean;
  checkpointStartUid: number | null;
  checkpointEndUid: number | null;
  highestMailboxUid: number | null;
  newUidCount: number;
  checked: number;
  eligible: number;
  saved: number;
  alreadySaved: number;
  skipped: number;
  errors: string[];
  pendingInvoiceIds: string[];
  message: string;
  debug: {
    scannedMailbox: string;
    totalMessageCount: number;
    scannedUidCount: number;
    scannedUids: number[];
    scannedEmails: CollectorDebugEntry[];
  };
};

export type SupplyHouseBackfillResult = {
  scanned: number;
  eligible: number;
  saved: number;
  alreadySaved: number;
  skipped: number;
  errors: string[];
  pendingInvoiceIds: string[];
  debug: {
    scannedMailbox: string;
    totalMessageCount: number;
    scannedUidCount: number;
    scannedUids: number[];
    scannedEmails: CollectorDebugEntry[];
  };
};

const CHECKPOINT_COLLECTION = "systemCounters";
const CHECKPOINT_DOCUMENT = "supplierInvoiceCollector";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }

  return value;
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function mailAddressText(value: unknown) {
  if (!value) return "";

  if (Array.isArray(value)) {
    return value
      .map((item: any) => cleanText(item?.text))
      .filter(Boolean)
      .join(", ");
  }

  return cleanText((value as { text?: unknown })?.text);
}

function safeProcessedEmailId(scope: string, messageId: string) {
  return `${scope}_${messageId.replace(/[^\w.-]/g, "_")}`.slice(0, 1400);
}

function safeFilePart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function readPositiveInteger(
  value: number | string | undefined | null,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value);

  if (!Number.isFinite(n)) return fallback;

  return Math.max(min, Math.min(Math.floor(n), max));
}

function readOptionalUid(value: number | string | undefined | null) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) return null;

  return Math.floor(n);
}

function isPdfAttachment(attachment: Attachment) {
  const contentType = cleanText(attachment.contentType).toLowerCase();
  const filename = cleanText(attachment.filename).toLowerCase();

  return contentType.includes("pdf") || filename.endsWith(".pdf");
}

function buildDownloadUrl(bucketName: string, storagePath: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucketName,
  )}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

function envelopeAddressToText(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((address: any) => {
      const name = cleanText(address?.name);
      const email = cleanText(address?.address);

      if (name && email) return `${name} <${email}>`;

      return name || email;
    })
    .filter(Boolean)
    .join(", ");
}

function getParsedHtml(parsed: ParsedMail) {
  const html = parsed.html;
  return typeof html === "string" ? html : "";
}

function getEmailBodyText(parsed: ParsedMail) {
  const plain = cleanText(parsed.text);
  if (plain) return plain;

  const html = getParsedHtml(parsed);
  if (html) return htmlToPlainText(html);

  return "";
}

function isSupplyHouseSupplierEmail(args: {
  subject: string;
  from: string;
}) {
  const subject = cleanText(args.subject).toLowerCase();
  const from = cleanText(args.from).toLowerCase();

  return (
    from.includes("supplyhouse.com") ||
    subject.includes("supplyhouse.com") ||
    subject.includes("supplyhouse")
  );
}

function isSupportedSupplierInvoiceEmail(args: {
  subject: string;
  from: string;
}) {
  const subject = cleanText(args.subject).toLowerCase();
  const from = cleanText(args.from).toLowerCase();

  const invoiceLike =
    subject.includes("invoice") ||
    subject.includes("invoices") ||
    subject.includes("credit") ||
    subject.includes("order confirmation") ||
    subject.includes("confirmation for your order");

  const farmers =
    from.includes("farmerslumber.com") ||
    from.includes("farmers lumber") ||
    subject.includes("farmers lumber");

  const moore =
    from.includes("mooresupply") ||
    from.includes("moore supply") ||
    from.includes("billtrust.com") ||
    subject.includes("moore supply");

  const supplyHouse = isSupplyHouseSupplierEmail({ subject, from });

  return invoiceLike && (farmers || moore || supplyHouse);
}

function makeBaseResult(args?: {
  mode?: "bootstrap" | "scan";
  initialized?: boolean;
  checkpointStartUid?: number | null;
  checkpointEndUid?: number | null;
  message?: string;
}): SupplierInvoiceCollectionResult {
  return {
    mode: args?.mode || "scan",
    initialized: args?.initialized || false,
    checkpointStartUid: args?.checkpointStartUid ?? null,
    checkpointEndUid: args?.checkpointEndUid ?? null,
    highestMailboxUid: null,
    newUidCount: 0,
    checked: 0,
    eligible: 0,
    saved: 0,
    alreadySaved: 0,
    skipped: 0,
    errors: [],
    pendingInvoiceIds: [],
    message: args?.message || "",
    debug: {
      scannedMailbox: "INBOX",
      totalMessageCount: 0,
      scannedUidCount: 0,
      scannedUids: [],
      scannedEmails: [],
    },
  };
}

function makeBaseBackfillResult(): SupplyHouseBackfillResult {
  return {
    scanned: 0,
    eligible: 0,
    saved: 0,
    alreadySaved: 0,
    skipped: 0,
    errors: [],
    pendingInvoiceIds: [],
    debug: {
      scannedMailbox: "INBOX",
      totalMessageCount: 0,
      scannedUidCount: 0,
      scannedUids: [],
      scannedEmails: [],
    },
  };
}

async function parseEmailSource(source: Buffer): Promise<ParsedMail> {
  return simpleParser(source);
}

async function fetchAndParseFullMessage(args: {
  client: ImapFlow;
  uid: number;
}) {
  console.log(`[supplier-collector] Fetching full source for UID ${args.uid}.`);

  const fetched = (await args.client.fetchOne(
    args.uid,
    {
      uid: true,
      source: true,
    },
    { uid: true },
  )) as any;

  if (!fetched?.source) {
    throw new Error(`Fetched email source was empty for UID ${args.uid}.`);
  }

  const parsed = await parseEmailSource(fetched.source);

  console.log(`[supplier-collector] Parsed full source for UID ${args.uid}.`);

  return parsed;
}

async function fetchLightMessage(args: {
  client: ImapFlow;
  uid: number;
}) {
  const lightMessage = (await args.client.fetchOne(
    args.uid,
    {
      uid: true,
      envelope: true,
      flags: true,
    },
    { uid: true },
  )) as any;

  const envelope = lightMessage?.envelope || {};

  return {
    subject: cleanText(envelope.subject),
    from: envelopeAddressToText(envelope.from),
    messageId: cleanText(envelope.messageId) || `uid_${args.uid}`,
  };
}

async function findExistingSupplierInvoiceByUid(uid: number) {
  const snap = await adminFirestore
    .collection("supplierInvoiceInbox")
    .where("uid", "==", uid)
    .limit(1)
    .get();

  if (snap.empty) {
    return {
      exists: false,
      invoiceId: "",
      status: "",
    };
  }

  const found = snap.docs[0];

  return {
    exists: true,
    invoiceId: found.id,
    status: cleanText(found.data()?.status),
  };
}

async function savePdfAttachments(args: {
  invoiceId: string;
  messageId: string;
  attachments: Attachment[];
}) {
  const now = new Date().toISOString();
  const bucket = adminStorageBucket;
  const bucketName = bucket.name;

  const pdfAttachments = args.attachments.filter(isPdfAttachment);
  const saved: SavedSupplierAttachment[] = [];

  for (let index = 0; index < pdfAttachments.length; index += 1) {
    const attachment = pdfAttachments[index];

    const originalName =
      cleanText(attachment.filename) ||
      `supplier-invoice-${index + 1}.pdf`;

    const filename =
      safeFilePart(originalName) || `supplier-invoice-${index + 1}.pdf`;

    const safeMessageId =
      safeFilePart(args.messageId) || `message-${Date.now()}`;

    const attachmentId = `${safeMessageId}_${index + 1}_${filename}`;

    const storagePath =
      `supplierInvoiceInbox/${args.invoiceId}/attachments/${attachmentId}`;

    console.log(
      `[supplier-collector] Saving PDF ${index + 1}/${pdfAttachments.length} for ${args.invoiceId}.`,
    );

    await bucket.file(storagePath).save(attachment.content, {
      resumable: false,
      metadata: {
        contentType: attachment.contentType || "application/pdf",
        metadata: {
          ownerCode: args.invoiceId,
          messageId: args.messageId,
          originalFilename: originalName,
          uploadedAt: now,
        },
      },
    });

    saved.push({
      id: attachmentId,
      filename: originalName,
      contentType: attachment.contentType || "application/pdf",
      size: attachment.size || attachment.content?.length || 0,
      storagePath,
      downloadUrl: buildDownloadUrl(bucketName, storagePath),
      uploadedAt: now,
      extractedText: "",
      ocrText: "",
      extractedMeta: {
        extractionMethod: "pending_native_unpdf",
        ocrStatus: "pending",
      },
    });
  }

  return saved;
}

async function saveSupplyHouseEmailPdfAttachment(args: {
  invoiceId: string;
  subject: string;
  from: string;
  to?: string | null;
  messageId: string;
  receivedAt?: string | null;
  bodyText: string;
}) {
  const now = new Date().toISOString();
  const bucket = adminStorageBucket;
  const bucketName = bucket.name;

  const parsedInvoice = parseSupplierInvoiceText(args.bodyText);
  const poCode = cleanText(parsedInvoice.poCode).toUpperCase();
  const orderNumber = cleanText(parsedInvoice.invoiceNumber) || "order";

  const safeMessageId = safeFilePart(args.messageId) || `message-${Date.now()}`;
  const filename =
    safeFilePart(
      `SupplyHouse Invoice ${orderNumber}${poCode ? ` - PO ${poCode}` : ""}.pdf`,
    ) || `SupplyHouse-Invoice-${orderNumber}.pdf`;

  const attachmentId = `${safeMessageId}_supplyhouse_email_${filename}`;
  const storagePath =
    `supplierInvoiceInbox/${args.invoiceId}/attachments/${attachmentId}`;

  const pdfBuffer = await generateSupplyHouseEmailPdfBuffer({
    subject: args.subject,
    from: args.from,
    to: args.to || null,
    messageId: args.messageId,
    receivedAt: args.receivedAt || null,
    bodyText: args.bodyText,
  });

  await bucket.file(storagePath).save(pdfBuffer, {
    resumable: false,
    metadata: {
      contentType: "application/pdf",
      metadata: {
        ownerCode: args.invoiceId,
        messageId: args.messageId,
        originalFilename: filename,
        source: "email_body_generated_pdf",
        vendorName: "SUPPLYHOUSE",
        poCode,
        orderNumber,
        uploadedAt: now,
      },
    },
  });

  const shortText =
    args.bodyText.length > 50000 ? args.bodyText.slice(0, 50000) : args.bodyText;

  return {
    id: attachmentId,
    filename,
    contentType: "application/pdf",
    size: pdfBuffer.length,
    storagePath,
    downloadUrl: buildDownloadUrl(bucketName, storagePath),
    uploadedAt: now,
    extractedText: shortText,
    ocrText: shortText,
    parsedInvoice,
    extractedMeta: {
      extractionMethod: "email_body_generated_pdf",
      ocrStatus: shortText ? "complete" : "empty",
      ocrProcessedAt: now,
      source: "email_body",
      generatedPdf: true,
      supplierParser: "supplyhouse_email_body",
      detectedPoCodes: poCode ? [poCode] : [],
      orderNumber,
    },
  } as SavedSupplierAttachment;
}

async function savePendingSupplierInvoice(args: {
  subject: string;
  from: string;
  messageId: string;
  uid: number;
  attachments: Attachment[];
  emailBodyText?: string;
  emailBodyHtml?: string;
  supplierHint?: "supplyhouse" | null;
  receivedAt?: string | null;
  to?: string | null;
}) {
  const invoiceId = safeProcessedEmailId("supplier_invoice", args.messageId);
  const invoiceRef = adminFirestore.collection("supplierInvoiceInbox").doc(invoiceId);

  const existing = await invoiceRef.get();

  if (existing.exists) {
    return {
      created: false,
      invoiceId,
      pdfAttachmentCount: 0,
      generatedEmailPdfCount: 0,
    };
  }

  let savedAttachments = await savePdfAttachments({
    invoiceId,
    messageId: args.messageId,
    attachments: args.attachments,
  });

  let generatedEmailPdfCount = 0;

  const bodyText = cleanText(args.emailBodyText);
  if (savedAttachments.length === 0 && args.supplierHint === "supplyhouse" && bodyText) {
    const generatedAttachment = await saveSupplyHouseEmailPdfAttachment({
      invoiceId,
      subject: args.subject,
      from: args.from,
      to: args.to || null,
      messageId: args.messageId,
      receivedAt: args.receivedAt || null,
      bodyText,
    });

    savedAttachments = [generatedAttachment];
    generatedEmailPdfCount = 1;
  }

  if (savedAttachments.length === 0) {
    return {
      created: false,
      invoiceId,
      pdfAttachmentCount: 0,
      generatedEmailPdfCount: 0,
    };
  }

  const now = new Date().toISOString();
  const parsedFromBody = bodyText ? parseSupplierInvoiceText(bodyText) : null;

  await invoiceRef.set({
    status: "ocr_pending",
    sourceType:
      generatedEmailPdfCount > 0 ? "supplier_email_body" : "supplier_email",
    processingMode: "scheduled_automation",
    supplierHint: args.supplierHint || null,
    emailSubject: args.subject || null,
    emailFrom: args.from || null,
    emailTo: args.to || null,
    emailBodyText: bodyText || null,
    emailBodyHtml:
      args.emailBodyHtml && args.emailBodyHtml.length <= 100000
        ? args.emailBodyHtml
        : null,
    messageId: args.messageId,
    uid: args.uid,
    detectedPoCodes: parsedFromBody?.poCode ? [parsedFromBody.poCode] : [],
    matchedPoCode: null,
    matchedPoCodes: [],
    serviceTicketId: null,
    projectId: null,
    attachmentCount: args.attachments.length + generatedEmailPdfCount,
    pdfAttachmentCount: savedAttachments.length,
    generatedEmailPdfCount,
    attachments: savedAttachments,
    createdAt: now,
    updatedAt: now,
    createdAtServer: FieldValue.serverTimestamp(),
  });

  await adminFirestore
    .collection("poInboxProcessedEmails")
    .doc(invoiceId)
    .set(
      {
        scope: "supplierInvoiceInbox",
        invoiceId,
        messageId: args.messageId,
        subject: args.subject,
        from: args.from,
        uid: args.uid,
        supplierHint: args.supplierHint || null,
        attachmentCount: args.attachments.length,
        pdfAttachmentCount: savedAttachments.length,
        generatedEmailPdfCount,
        collectionStatus: "ocr_pending",
        processedAt: now,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return {
    created: true,
    invoiceId,
    pdfAttachmentCount: savedAttachments.length,
    generatedEmailPdfCount,
  };
}

async function writeCheckpoint(args: {
  lastScannedUid: number;
  initialized?: boolean;
}) {
  const now = new Date().toISOString();

  await adminFirestore
    .collection(CHECKPOINT_COLLECTION)
    .doc(CHECKPOINT_DOCUMENT)
    .set(
      {
        lastScannedUid: args.lastScannedUid,
        updatedAt: now,
        ...(args.initialized
          ? {
              initializedAt: now,
              initializedBy: "bootstrap_route",
            }
          : {
              lastSuccessfulAdvanceAt: now,
            }),
      },
      { merge: true },
    );
}

async function makeImapClient() {
  const client = new ImapFlow({
    host: requiredEnv("PO_INBOX_HOST"),
    port: Number(requiredEnv("PO_INBOX_PORT")),
    secure: String(process.env.PO_INBOX_SECURE || "true") === "true",
    auth: {
      user: requiredEnv("PO_INBOX_USER"),
      pass: requiredEnv("PO_INBOX_PASSWORD"),
    },
    logger: false,
  });

  await client.connect();

  return client;
}

async function collectParsedSupplierEmail(args: {
  parsed: ParsedMail;
  subject: string;
  from: string;
  messageId: string;
  uid: number;
  supplierHint?: "supplyhouse" | null;
}) {
  const html = getParsedHtml(args.parsed);
  const bodyText = getEmailBodyText(args.parsed);
  const attachments = args.parsed.attachments || [];

  const saved = await savePendingSupplierInvoice({
    subject: cleanText(args.parsed.subject) || args.subject,
    from: mailAddressText(args.parsed.from) || args.from,
    to: mailAddressText(args.parsed.to) || null,
    messageId:
      cleanText(args.parsed.messageId) ||
      args.messageId ||
      `uid_${args.uid}`,
    uid: args.uid,
    attachments,
    emailBodyText: bodyText,
    emailBodyHtml: html,
    supplierHint: args.supplierHint || null,
    receivedAt: args.parsed.date?.toISOString() || null,
  });

  return saved;
}

export async function collectSupplierInvoiceInbox(options?: {
  bootstrapUid?: number | string | null;
  maxMessagesPerRun?: number | string;
  maxNewInvoicesPerRun?: number | string;
}): Promise<SupplierInvoiceCollectionResult> {
  const bootstrapUid = readOptionalUid(options?.bootstrapUid);

  const checkpointRef = adminFirestore
    .collection(CHECKPOINT_COLLECTION)
    .doc(CHECKPOINT_DOCUMENT);

  const checkpointSnap = await checkpointRef.get();
  const existingCheckpointUid = checkpointSnap.exists
    ? readOptionalUid(checkpointSnap.data()?.lastScannedUid)
    : null;

  if (bootstrapUid !== null) {
    if (existingCheckpointUid !== null) {
      return makeBaseResult({
        mode: "bootstrap",
        initialized: false,
        checkpointStartUid: existingCheckpointUid,
        checkpointEndUid: existingCheckpointUid,
        message: `Checkpoint already exists at UID ${existingCheckpointUid}; it was not changed.`,
      });
    }

    await writeCheckpoint({
      lastScannedUid: bootstrapUid,
      initialized: true,
    });

    return makeBaseResult({
      mode: "bootstrap",
      initialized: true,
      checkpointStartUid: bootstrapUid,
      checkpointEndUid: bootstrapUid,
      message: `Supplier invoice collector initialized at UID ${bootstrapUid}. Only newer emails will be collected automatically.`,
    });
  }

  if (existingCheckpointUid === null) {
    throw new Error(
      "Supplier invoice collector is not initialized. Run the collector once with bootstrapUid=149 before enabling scheduled collection.",
    );
  }

  const maxMessagesPerRun = readPositiveInteger(
    options?.maxMessagesPerRun,
    1,
    1,
    5,
  );

  const maxNewInvoicesPerRun = readPositiveInteger(
    options?.maxNewInvoicesPerRun,
    1,
    1,
    2,
  );

  const result = makeBaseResult({
    mode: "scan",
    initialized: true,
    checkpointStartUid: existingCheckpointUid,
    checkpointEndUid: existingCheckpointUid,
    message: "Supplier invoice scan completed.",
  });

  const mailboxName = "INBOX";
  const client = await makeImapClient();

  console.log(
    `[supplier-collector] Starting scan after UID ${existingCheckpointUid}.`,
  );

  try {
    const lock = await client.getMailboxLock(mailboxName);

    try {
      result.debug.totalMessageCount =
        client.mailbox && typeof client.mailbox === "object"
          ? Number(client.mailbox.exists || 0)
          : 0;

      const allUidsRaw = await client.search({ all: true });

      const allUids = Array.isArray(allUidsRaw)
        ? allUidsRaw
            .map((uid) => Number(uid))
            .filter((uid) => Number.isFinite(uid))
            .sort((a, b) => a - b)
        : [];

      result.highestMailboxUid =
        allUids.length > 0 ? allUids[allUids.length - 1] : existingCheckpointUid;

      const newUids = allUids.filter((uid) => uid > existingCheckpointUid);
      result.newUidCount = newUids.length;

      const selectedUids = newUids.slice(0, maxMessagesPerRun);
      result.debug.scannedUidCount = selectedUids.length;
      result.debug.scannedUids = selectedUids;

      if (selectedUids.length === 0) {
        result.message = `No new mailbox messages found after UID ${existingCheckpointUid}.`;
        return result;
      }

      let lastAdvancedUid = existingCheckpointUid;

      for (const uid of selectedUids) {
        result.checked += 1;

        let subject = "";
        let from = "";
        let messageId = `uid_${uid}`;
        let shouldAdvanceCheckpoint = false;
        let shouldStopRun = false;

        try {
          const light = await fetchLightMessage({ client, uid });
          subject = light.subject;
          from = light.from;
          messageId = light.messageId;

          if (!isSupportedSupplierInvoiceEmail({ subject, from })) {
            result.skipped += 1;
            shouldAdvanceCheckpoint = true;

            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: "Skipped: not a supported supplier invoice email.",
            });

            continue;
          }

          result.eligible += 1;

          const existingByUid = await findExistingSupplierInvoiceByUid(uid);

          if (existingByUid.exists) {
            result.alreadySaved += 1;
            shouldAdvanceCheckpoint = true;

            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: `Skipped: supplier invoice already collected as ${existingByUid.invoiceId} with status ${existingByUid.status || "unknown"}.`,
            });

            continue;
          }

          if (result.saved >= maxNewInvoicesPerRun) {
            result.skipped += 1;
            shouldStopRun = true;

            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: "Deferred: maximum new supplier invoices collected this run.",
            });

            continue;
          }

          const parsed = await fetchAndParseFullMessage({
            client,
            uid,
          });

          subject = cleanText(parsed.subject) || subject;
          from = cleanText(parsed.from?.text) || from;
          messageId =
            cleanText(parsed.messageId) ||
            messageId ||
            `uid_${uid}`;

          const supplierHint = isSupplyHouseSupplierEmail({ subject, from })
            ? "supplyhouse"
            : null;

          const saved = await collectParsedSupplierEmail({
            parsed,
            subject,
            from,
            messageId,
            uid,
            supplierHint,
          });

          if (!saved.created) {
            result.alreadySaved += 1;
            shouldAdvanceCheckpoint = true;

            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: `Skipped: supplier invoice already exists as ${saved.invoiceId}, or no collectable PDF/email snapshot could be saved.`,
            });

            continue;
          }

          result.saved += 1;
          result.pendingInvoiceIds.push(saved.invoiceId);
          shouldAdvanceCheckpoint = true;

          result.debug.scannedEmails.push({
            uid,
            subject,
            from,
            messageId,
            reason: `Collected ${saved.pdfAttachmentCount} PDF attachment(s) into ${saved.invoiceId}; awaiting OCR processing.`,
          });

          await client.messageFlagsAdd(uid, ["\\Seen"], {
            uid: true,
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to collect supplier invoice email.";

          result.errors.push(message);
          shouldStopRun = true;

          result.debug.scannedEmails.push({
            uid,
            subject,
            from,
            messageId,
            reason: `Collection error: ${message}`,
          });
        } finally {
          if (shouldAdvanceCheckpoint) {
            await writeCheckpoint({
              lastScannedUid: uid,
            });

            lastAdvancedUid = uid;
            result.checkpointEndUid = uid;

            console.log(`[supplier-collector] Advanced checkpoint to UID ${uid}.`);
          }
        }

        if (shouldStopRun) {
          break;
        }
      }

      result.checkpointEndUid = lastAdvancedUid;

      return result;
    } finally {
      lock.release();
    }
  } finally {
    try {
      if ((client as any).usable !== false) {
        await client.logout();
      }
    } catch (err) {
      console.warn("Supplier invoice collector logout warning:", err);
    }
  }
}

export async function backfillSupplyHouseInvoiceInbox(options?: {
  scanLimit?: number | string;
  maxProcess?: number | string;
}): Promise<SupplyHouseBackfillResult> {
  const scanLimit = readPositiveInteger(options?.scanLimit, 25, 1, 100);
  const maxProcess = readPositiveInteger(options?.maxProcess, 2, 1, 5);

  const result = makeBaseBackfillResult();
  const mailboxName = "INBOX";
  const client = await makeImapClient();

  try {
    const lock = await client.getMailboxLock(mailboxName);

    try {
      result.debug.totalMessageCount =
        client.mailbox && typeof client.mailbox === "object"
          ? Number(client.mailbox.exists || 0)
          : 0;

      const allUidsRaw = await client.search({ all: true });

      const selectedUids = Array.isArray(allUidsRaw)
        ? allUidsRaw
            .map((uid) => Number(uid))
            .filter((uid) => Number.isFinite(uid))
            .sort((a, b) => b - a)
            .slice(0, scanLimit)
        : [];

      result.debug.scannedUidCount = selectedUids.length;
      result.debug.scannedUids = selectedUids;

      for (const uid of selectedUids) {
        result.scanned += 1;

        let subject = "";
        let from = "";
        let messageId = `uid_${uid}`;

        try {
          const light = await fetchLightMessage({ client, uid });
          subject = light.subject;
          from = light.from;
          messageId = light.messageId;

          if (!isSupplyHouseSupplierEmail({ subject, from })) {
            result.skipped += 1;
            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: "Skipped: not a SupplyHouse email.",
            });
            continue;
          }

          if (!isSupportedSupplierInvoiceEmail({ subject, from })) {
            result.skipped += 1;
            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: "Skipped: SupplyHouse email was not invoice/order-like.",
            });
            continue;
          }

          result.eligible += 1;

          const existingByUid = await findExistingSupplierInvoiceByUid(uid);

          if (existingByUid.exists) {
            result.alreadySaved += 1;
            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: `Skipped: already collected as ${existingByUid.invoiceId} with status ${existingByUid.status || "unknown"}.`,
            });
            continue;
          }

          if (result.saved >= maxProcess) {
            result.skipped += 1;
            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: "Deferred: maxProcess reached for this backfill run.",
            });
            break;
          }

          const parsed = await fetchAndParseFullMessage({ client, uid });

          subject = cleanText(parsed.subject) || subject;
          from = cleanText(parsed.from?.text) || from;
          messageId =
            cleanText(parsed.messageId) ||
            messageId ||
            `uid_${uid}`;

          const saved = await collectParsedSupplierEmail({
            parsed,
            subject,
            from,
            messageId,
            uid,
            supplierHint: "supplyhouse",
          });

          if (!saved.created) {
            result.alreadySaved += 1;
            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: `Skipped: already exists as ${saved.invoiceId}, or no collectable email snapshot could be saved.`,
            });
            continue;
          }

          result.saved += 1;
          result.pendingInvoiceIds.push(saved.invoiceId);

          result.debug.scannedEmails.push({
            uid,
            subject,
            from,
            messageId,
            reason: `Backfilled SupplyHouse invoice into ${saved.invoiceId}; awaiting processor.`,
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to backfill SupplyHouse invoice email.";

          result.errors.push(message);
          result.debug.scannedEmails.push({
            uid,
            subject,
            from,
            messageId,
            reason: `Backfill error: ${message}`,
          });
        }
      }

      return result;
    } finally {
      lock.release();
    }
  } finally {
    try {
      if ((client as any).usable !== false) {
        await client.logout();
      }
    } catch (err) {
      console.warn("SupplyHouse backfill logout warning:", err);
    }
  }
}
