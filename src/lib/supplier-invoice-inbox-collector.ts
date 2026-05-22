// src/lib/supplier-invoice-inbox-collector.ts
import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore, adminStorageBucket } from "./firebase-admin";

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

function isSupportedSupplierInvoiceEmail(args: {
  subject: string;
  from: string;
}) {
  const subject = cleanText(args.subject).toLowerCase();
  const from = cleanText(args.from).toLowerCase();

  const invoiceLike =
    subject.includes("invoice") ||
    subject.includes("invoices") ||
    subject.includes("credit");

  const farmers =
    from.includes("farmerslumber.com") ||
    from.includes("farmers lumber") ||
    subject.includes("farmers lumber");

  const moore =
    from.includes("mooresupply") ||
    from.includes("moore supply") ||
    from.includes("billtrust.com") ||
    subject.includes("moore supply");

  return invoiceLike && (farmers || moore);
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

async function savePendingSupplierInvoice(args: {
  subject: string;
  from: string;
  messageId: string;
  uid: number;
  attachments: Attachment[];
}) {
  const invoiceId = safeProcessedEmailId("supplier_invoice", args.messageId);
  const invoiceRef = adminFirestore.collection("supplierInvoiceInbox").doc(invoiceId);

  const existing = await invoiceRef.get();

  if (existing.exists) {
    return {
      created: false,
      invoiceId,
      pdfAttachmentCount: 0,
    };
  }

  const savedAttachments = await savePdfAttachments({
    invoiceId,
    messageId: args.messageId,
    attachments: args.attachments,
  });

  if (savedAttachments.length === 0) {
    return {
      created: false,
      invoiceId,
      pdfAttachmentCount: 0,
    };
  }

  const now = new Date().toISOString();

  await invoiceRef.set({
    status: "ocr_pending",
    sourceType: "supplier_email",
    processingMode: "scheduled_automation",
    emailSubject: args.subject || null,
    emailFrom: args.from || null,
    messageId: args.messageId,
    uid: args.uid,
    detectedPoCodes: [],
    matchedPoCode: null,
    matchedPoCodes: [],
    serviceTicketId: null,
    projectId: null,
    attachmentCount: args.attachments.length,
    pdfAttachmentCount: savedAttachments.length,
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
        attachmentCount: args.attachments.length,
        pdfAttachmentCount: savedAttachments.length,
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

  /*
   * Bootstrap is deliberately a no-scan action.
   * It establishes where future automation begins without touching old email.
   */
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

  console.log(
    `[supplier-collector] Starting scan after UID ${existingCheckpointUid}.`,
  );

  await client.connect();

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
          console.log(`[supplier-collector] Reading envelope for UID ${uid}.`);

          const lightMessage = (await client.fetchOne(
            uid,
            {
              uid: true,
              envelope: true,
              flags: true,
            },
            { uid: true },
          )) as any;

          const envelope = lightMessage?.envelope || {};

          subject = cleanText(envelope.subject);
          from = envelopeAddressToText(envelope.from);
          messageId = cleanText(envelope.messageId) || `uid_${uid}`;

          if (
            !isSupportedSupplierInvoiceEmail({
              subject,
              from,
            })
          ) {
            result.skipped += 1;
            shouldAdvanceCheckpoint = true;

            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: "Skipped: not a supported Farmers/Moore supplier invoice email.",
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

          const attachments = parsed.attachments || [];
          const pdfAttachments = attachments.filter(isPdfAttachment);

          if (pdfAttachments.length === 0) {
            result.skipped += 1;
            shouldAdvanceCheckpoint = true;

            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: "Skipped: supported supplier email had no PDF attachment.",
            });

            continue;
          }

          const saved = await savePendingSupplierInvoice({
            subject,
            from,
            messageId,
            uid,
            attachments,
          });

          if (!saved.created) {
            result.alreadySaved += 1;
            shouldAdvanceCheckpoint = true;

            result.debug.scannedEmails.push({
              uid,
              subject,
              from,
              messageId,
              reason: `Skipped: supplier invoice already exists as ${saved.invoiceId}.`,
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