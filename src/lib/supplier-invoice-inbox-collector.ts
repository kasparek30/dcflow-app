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
  checked: number;
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
    scannedUids: Array<number | string>;
    scannedEmails: CollectorDebugEntry[];
  };
};

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

function clampNumber(
  value: number | string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.floor(n), max));
}

function getLatestUidSubset(uids: number[], limit: number) {
  return [...uids]
    .filter((uid) => Number.isFinite(Number(uid)))
    .sort((a, b) => Number(a) - Number(b))
    .slice(-limit);
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

function isLikelySupportedSupplierInvoiceEmail(args: {
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
    from.includes("billtrust.com") ||
    subject.includes("moore supply");

  return invoiceLike && (farmers || moore);
}

async function parseEmailSource(source: Buffer): Promise<ParsedMail> {
  return simpleParser(source);
}

async function fetchAndParseFullMessage(args: {
  client: ImapFlow;
  uid: number | string | null;
}) {
  const uid = Number(args.uid);

  if (!Number.isFinite(uid)) {
    throw new Error("Cannot fetch full email without a valid UID.");
  }

  const fetched = (await args.client.fetchOne(
    uid,
    {
      uid: true,
      source: true,
    },
    { uid: true },
  )) as any;

  if (!fetched?.source) {
    throw new Error("Fetched email source was empty.");
  }

  return parseEmailSource(fetched.source);
}

async function findExistingSupplierInvoiceByUid(uid: number | string | null) {
  const cleanUid = cleanText(uid);

  if (!cleanUid) {
    return {
      exists: false,
      invoiceId: "",
      status: "",
    };
  }

  const queryValue = Number.isFinite(Number(cleanUid))
    ? Number(cleanUid)
    : cleanUid;

  const snap = await adminFirestore
    .collection("supplierInvoiceInbox")
    .where("uid", "==", queryValue)
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

  const pdfs = args.attachments.filter(isPdfAttachment);
  const saved: SavedSupplierAttachment[] = [];

  for (let index = 0; index < pdfs.length; index += 1) {
    const attachment = pdfs[index];

    const originalName =
      cleanText(attachment.filename) ||
      `supplier-invoice-${index + 1}.pdf`;

    const filename =
      safeFilePart(originalName) || `supplier-invoice-${index + 1}.pdf`;

    const safeMessageId =
      safeFilePart(args.messageId) || `message-${Date.now()}`;

    const attachmentId = `${safeMessageId}_${index + 1}_${filename}`;
    const storagePath = `supplierInvoiceInbox/${args.invoiceId}/attachments/${attachmentId}`;

    const file = bucket.file(storagePath);

    await file.save(attachment.content, {
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
  uid: number | string | null;
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
    uid: args.uid ?? null,
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
        uid: args.uid ?? null,
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

export async function collectSupplierInvoiceInbox(options?: {
  scanLimit?: number;
  maxNewInvoicesPerRun?: number;
}): Promise<SupplierInvoiceCollectionResult> {
  const mailboxName = "INBOX";

  const scanLimit = clampNumber(options?.scanLimit, 100, 1, 200);
  const maxNewInvoicesPerRun = clampNumber(
    options?.maxNewInvoicesPerRun,
    3,
    1,
    10,
  );

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

  const result: SupplierInvoiceCollectionResult = {
    checked: 0,
    eligible: 0,
    saved: 0,
    alreadySaved: 0,
    skipped: 0,
    errors: [],
    pendingInvoiceIds: [],
    debug: {
      scannedMailbox: mailboxName,
      totalMessageCount: 0,
      scannedUidCount: 0,
      scannedUids: [],
      scannedEmails: [],
    },
  };

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
        : [];

      const latestUids = getLatestUidSubset(allUids, scanLimit);

      result.debug.scannedUidCount = latestUids.length;
      result.debug.scannedUids = latestUids;

      if (latestUids.length === 0) {
        return result;
      }

      for await (const lightMessage of client.fetch(latestUids, {
        uid: true,
        envelope: true,
        flags: true,
      })) {
        result.checked += 1;

        const envelope = (lightMessage as any).envelope || {};

        let subject = cleanText(envelope.subject);
        let from = envelopeAddressToText(envelope.from);
        let messageId =
          cleanText(envelope.messageId) ||
          `uid_${lightMessage.uid || "unknown"}`;

        if (
          !isLikelySupportedSupplierInvoiceEmail({
            subject,
            from,
          })
        ) {
          result.skipped += 1;
          result.debug.scannedEmails.push({
            uid: lightMessage.uid || null,
            subject,
            from,
            messageId,
            reason: "Skipped: not a supported Farmers/Moore supplier invoice email.",
          });
          continue;
        }

        result.eligible += 1;

        const existingByUid = await findExistingSupplierInvoiceByUid(
          lightMessage.uid || null,
        );

        if (existingByUid.exists) {
          result.alreadySaved += 1;
          result.debug.scannedEmails.push({
            uid: lightMessage.uid || null,
            subject,
            from,
            messageId,
            reason: `Skipped: supplier invoice already collected as ${existingByUid.invoiceId} with status ${existingByUid.status || "unknown"}.`,
          });
          continue;
        }

        if (result.saved >= maxNewInvoicesPerRun) {
          result.skipped += 1;
          result.debug.scannedEmails.push({
            uid: lightMessage.uid || null,
            subject,
            from,
            messageId,
            reason:
              "Skipped this run: maximum new supplier invoices already collected.",
          });
          continue;
        }

        try {
          const parsed = await fetchAndParseFullMessage({
            client,
            uid: lightMessage.uid || null,
          });

          subject = cleanText(parsed.subject) || subject;
          from = cleanText(parsed.from?.text) || from;
          messageId =
            cleanText(parsed.messageId) ||
            messageId ||
            `uid_${lightMessage.uid || "unknown"}`;

          const attachments = parsed.attachments || [];
          const pdfAttachments = attachments.filter(isPdfAttachment);

          if (pdfAttachments.length === 0) {
            result.skipped += 1;
            result.debug.scannedEmails.push({
              uid: lightMessage.uid || null,
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
            uid: lightMessage.uid || null,
            attachments,
          });

          if (!saved.created) {
            result.alreadySaved += 1;
            result.debug.scannedEmails.push({
              uid: lightMessage.uid || null,
              subject,
              from,
              messageId,
              reason: `Skipped: supplier invoice already exists as ${saved.invoiceId}.`,
            });
            continue;
          }

          result.saved += 1;
          result.pendingInvoiceIds.push(saved.invoiceId);

          result.debug.scannedEmails.push({
            uid: lightMessage.uid || null,
            subject,
            from,
            messageId,
            reason: `Collected ${saved.pdfAttachmentCount} PDF attachment(s) into ${saved.invoiceId}; awaiting OCR processing.`,
          });

          if (lightMessage.uid) {
            await client.messageFlagsAdd(lightMessage.uid, ["\\Seen"], {
              uid: true,
            });
          }
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to collect supplier invoice email.";

          result.errors.push(message);

          result.debug.scannedEmails.push({
            uid: lightMessage.uid || null,
            subject,
            from,
            messageId,
            reason: `Collection error: ${message}`,
          });
        }
      }
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

  return result;
}