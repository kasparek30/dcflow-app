// src/lib/po-inbox-uid-processor.ts
import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore, adminStorageBucket } from "./firebase-admin";
import { processSupplierInvoiceOcr } from "./supplier-invoice-ocr-processor";

type SavedPoAttachment = {
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

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
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

function isPdfAttachment(attachment: Attachment) {
  const contentType = String(attachment.contentType || "").toLowerCase();
  const filename = String(attachment.filename || "").toLowerCase();
  return contentType.includes("pdf") || filename.endsWith(".pdf");
}

function buildDownloadUrl(bucketName: string, storagePath: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucketName
  )}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

async function parseEmailSource(source: Buffer): Promise<ParsedMail> {
  return simpleParser(source);
}

async function savePdfAttachments(args: {
  storageRoot: string;
  ownerCode: string;
  messageId: string;
  attachments: Attachment[];
}) {
  const now = new Date().toISOString();
  const bucket = adminStorageBucket;
  const bucketName = bucket.name;

  const pdfs = (args.attachments || []).filter(isPdfAttachment);
  const saved: SavedPoAttachment[] = [];

  for (let i = 0; i < pdfs.length; i += 1) {
    const attachment = pdfs[i];
    const originalName =
      cleanText(attachment.filename) || `invoice-${args.ownerCode}-${i + 1}.pdf`;

    const filename = safeFilePart(originalName) || `invoice-${i + 1}.pdf`;
    const safeMessageId = safeFilePart(args.messageId) || `message-${Date.now()}`;
    const attachmentId = `${safeMessageId}_${i + 1}_${filename}`;

    const storagePath = `${args.storageRoot}/${attachmentId}`;
    const file = bucket.file(storagePath);

    await file.save(attachment.content, {
      resumable: false,
      metadata: {
        contentType: attachment.contentType || "application/pdf",
        metadata: {
          ownerCode: args.ownerCode,
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

async function saveSupplierInvoiceFromParsedEmail(args: {
  subject: string;
  from: string;
  messageId: string;
  uid: number | string | null;
  attachments: Attachment[];
}) {
  const invoiceId = safeProcessedEmailId("supplier_invoice", args.messageId);
  const now = new Date().toISOString();

  const invoiceRef = adminFirestore.collection("supplierInvoiceInbox").doc(invoiceId);
  const existing = await invoiceRef.get();

  if (existing.exists) {
    return {
      created: false,
      invoiceId,
      attachmentCount: 0,
      pdfAttachmentCount: 0,
    };
  }

  const savedAttachments = await savePdfAttachments({
    storageRoot: `supplierInvoiceInbox/${invoiceId}/attachments`,
    ownerCode: invoiceId,
    messageId: args.messageId,
    attachments: args.attachments,
  });

  await invoiceRef.set({
    status: "ocr_pending",
    sourceType: "supplier_email",
    emailSubject: args.subject || null,
    emailFrom: args.from || null,
    messageId: args.messageId,
    uid: args.uid || null,
    detectedPoCodes: [],
    matchedPoCode: null,
    serviceTicketId: null,
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
    .set({
      scope: "supplierInvoiceInbox",
      invoiceId,
      messageId: args.messageId,
      subject: args.subject,
      from: args.from,
      uid: args.uid || null,
      attachmentCount: args.attachments.length,
      pdfAttachmentCount: savedAttachments.length,
      processedAt: now,
      createdAt: FieldValue.serverTimestamp(),
    });

  return {
    created: true,
    invoiceId,
    attachmentCount: args.attachments.length,
    pdfAttachmentCount: savedAttachments.length,
  };
}

export async function processPoInboxUid(args: { uid: string | number }) {
  const mailboxName = "INBOX";
  const uid = Number(args.uid);

  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error("Invalid UID.");
  }

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

  let invoiceId: string | null = null;
  let savedResult: Awaited<ReturnType<typeof saveSupplierInvoiceFromParsedEmail>> | null =
    null;

  await client.connect();

  try {
    const lock = await client.getMailboxLock(mailboxName);

    try {
      const fetched = (await client.fetchOne(
        uid,
        {
          uid: true,
          source: true,
        },
        { uid: true }
      )) as any;

      if (!fetched?.source) {
        throw new Error(`UID ${uid} source was empty.`);
      }

      const parsed = await parseEmailSource(fetched.source);

      const subject = cleanText(parsed.subject);
      const from = cleanText(parsed.from?.text);
      const messageId = cleanText(parsed.messageId) || `uid_${uid}`;

      savedResult = await saveSupplierInvoiceFromParsedEmail({
        subject,
        from,
        messageId,
        uid,
        attachments: parsed.attachments || [],
      });

      invoiceId = savedResult.invoiceId;
    } finally {
      lock.release();
    }
  } finally {
    try {
      if ((client as any).usable !== false) {
        await client.logout();
      }
    } catch (err) {
      console.warn("PO inbox UID logout warning:", err);
    }
  }

  if (!invoiceId) {
    throw new Error("Invoice was not saved.");
  }

  const ocrResult = await processSupplierInvoiceOcr({ invoiceId });

  return {
    uid,
    invoiceId,
    saved: savedResult,
    ocrResult,
  };
}