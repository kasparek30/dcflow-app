// src/lib/po-inbox.ts
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

type PoInboxScannedEmailDebug = {
  uid: number | string | null;
  subject: string;
  from: string;
  messageId: string;
  detectedPoCodes: string[];
  reason: string;
};

type SupplierInvoiceOcrRunResult = {
  invoiceId: string;
  ok: boolean;
  status?: string;
  matchedPoCode?: string | null;
  parsedInvoiceNumber?: string | null;
  parsedInvoiceTotal?: number | null;
  parsedLineItemCount?: number;
  materialImport?: unknown;
  error?: string;
};

type PoInboxScanResult = {
  checked: number;
  matched: number;
  unmatched: number;
  skipped: number;
  errors: string[];
  matches: Array<{
    poCode: string;
    subject: string;
    from: string;
    messageId: string;
    attachmentCount: number;
  }>;
  supplierInvoiceOcrRuns: SupplierInvoiceOcrRunResult[];
  debug: {
    scannedMailbox: string;
    totalMessageCount: number;
    scannedUidCount: number;
    scannedUids: Array<number | string>;
    scannedEmails: PoInboxScannedEmailDebug[];
  };
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable: ${name}`);
  return value;
}

function extractPoCodes(text: string) {
  const source = String(text || "").toUpperCase();
  const matches = source.match(/\bS\d{3,}[A-Z]{1,2}\b/g) || [];
  return Array.from(new Set(matches));
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function htmlToSearchableText(value: ParsedMail["html"]) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return "";
}

async function parseEmailSource(source: Buffer): Promise<ParsedMail> {
  return simpleParser(source);
}

function getLatestUidSubset(uids: number[], limit: number) {
  return [...uids]
    .filter((uid) => Number.isFinite(Number(uid)))
    .sort((a, b) => Number(a) - Number(b))
    .slice(-limit);
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

async function savePdfAttachmentsForPo(args: {
  poCode: string;
  messageId: string;
  attachments: Attachment[];
}) {
  return savePdfAttachments({
    storageRoot: `purchaseOrders/${args.poCode}/invoices`,
    ownerCode: args.poCode,
    messageId: args.messageId,
    attachments: args.attachments,
  });
}

async function runSupplierInvoiceOcr(invoiceId: string): Promise<SupplierInvoiceOcrRunResult> {
  try {
    const result = await processSupplierInvoiceOcr({ invoiceId });

    return {
      invoiceId,
      ok: true,
      status: result.status,
      matchedPoCode: result.matchedPoCode,
      parsedInvoiceNumber: result.parsedInvoiceNumber,
      parsedInvoiceTotal: result.parsedInvoiceTotal,
      parsedLineItemCount: result.parsedLineItemCount,
      materialImport: result.materialImport,
    };
  } catch (err) {
    return {
      invoiceId,
      ok: false,
      error: err instanceof Error ? err.message : "Supplier invoice OCR failed.",
    };
  }
}

async function saveUnmatchedSupplierInvoice(args: {
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
      attachments: [],
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
    attachments: savedAttachments,
  };
}

export async function scanPoInbox(): Promise<PoInboxScanResult> {
  const mailboxName = "INBOX";
  const scanLimit = 10;

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

  const result: PoInboxScanResult = {
    checked: 0,
    matched: 0,
    unmatched: 0,
    skipped: 0,
    errors: [],
    matches: [],
    supplierInvoiceOcrRuns: [],
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
        ? allUidsRaw.map((uid) => Number(uid)).filter((uid) => Number.isFinite(uid))
        : [];

      const latestUids = getLatestUidSubset(allUids, scanLimit);

      result.debug.scannedUidCount = latestUids.length;
      result.debug.scannedUids = latestUids;

      if (latestUids.length === 0) {
        return result;
      }

      for await (const message of client.fetch(latestUids, {
        uid: true,
        envelope: true,
        flags: true,
        source: true,
      })) {
        result.checked += 1;

        let subject = "";
        let from = "";
        let messageId = `${message.uid || "unknown"}-${Date.now()}`;
        let detectedPoCodes: string[] = [];

        try {
          if (!message.source) {
            result.skipped += 1;
            result.debug.scannedEmails.push({
              uid: message.uid || null,
              subject,
              from,
              messageId,
              detectedPoCodes,
              reason: "Skipped: message source was empty.",
            });
            continue;
          }

          const parsed = await parseEmailSource(message.source);

          subject = cleanText(parsed.subject);
          from = cleanText(parsed.from?.text);
          messageId =
            cleanText(parsed.messageId) || `${message.uid || "unknown"}-${Date.now()}`;

          const allAttachments = parsed.attachments || [];
          const pdfAttachments = allAttachments.filter(isPdfAttachment);

          const attachmentFilenames = allAttachments.map(
            (attachment: Attachment) => attachment.filename || ""
          );

          const textToSearch = [
            subject,
            from,
            parsed.text || "",
            htmlToSearchableText(parsed.html),
            ...attachmentFilenames,
          ].join("\n");

          detectedPoCodes = extractPoCodes(textToSearch);

          if (detectedPoCodes.length === 0) {
            if (pdfAttachments.length > 0) {
              const unmatched = await saveUnmatchedSupplierInvoice({
                subject,
                from,
                messageId,
                uid: message.uid || null,
                attachments: allAttachments,
              });

              let ocrRun: SupplierInvoiceOcrRunResult | null = null;

              if (unmatched.created) {
                ocrRun = await runSupplierInvoiceOcr(unmatched.invoiceId);
                result.supplierInvoiceOcrRuns.push(ocrRun);
              } else {
                const existingInvoiceSnap = await adminFirestore
                  .collection("supplierInvoiceInbox")
                  .doc(unmatched.invoiceId)
                  .get();

                const existingStatus = String(existingInvoiceSnap.data()?.status || "").trim();

                if (
                  existingStatus === "ocr_pending" ||
                  existingStatus === "needs_review" ||
                  existingStatus === "ocr_failed"
                ) {
                  ocrRun = await runSupplierInvoiceOcr(unmatched.invoiceId);
                  result.supplierInvoiceOcrRuns.push(ocrRun);
                }
              }

              if (unmatched.created) {
                result.unmatched += 1;
                result.debug.scannedEmails.push({
                  uid: message.uid || null,
                  subject,
                  from,
                  messageId,
                  detectedPoCodes,
                  reason: `Saved unmatched supplier invoice ${unmatched.invoiceId} with ${
                    unmatched.attachments.length
                  } PDF attachment(s). ${
                    ocrRun
                      ? `OCR status: ${ocrRun.ok ? ocrRun.status || "complete" : `failed - ${ocrRun.error}`}.`
                      : "OCR skipped because invoice is already finalized."
                  }`,
                });

                if (message.uid) {
                  await client.messageFlagsAdd(message.uid, ["\\Seen"], {
                    uid: true,
                  });
                }
              } else {
                result.skipped += 1;
                result.debug.scannedEmails.push({
                  uid: message.uid || null,
                  subject,
                  from,
                  messageId,
                  detectedPoCodes,
                  reason: `Skipped: unmatched supplier invoice already exists as ${unmatched.invoiceId}. ${
                    ocrRun
                      ? `OCR status: ${ocrRun.ok ? ocrRun.status || "complete" : `failed - ${ocrRun.error}`}.`
                      : "OCR skipped because invoice is already finalized."
                  }`,
                });
              }

              continue;
            }

            result.skipped += 1;
            result.debug.scannedEmails.push({
              uid: message.uid || null,
              subject,
              from,
              messageId,
              detectedPoCodes,
              reason: "Skipped: no PO code detected and no PDF attachment found.",
            });
            continue;
          }

          let messageHadMatch = false;
          const messageReasons: string[] = [];

          for (const poCode of detectedPoCodes) {
            const poRef = adminFirestore.collection("purchaseOrders").doc(poCode);
            const poSnap = await poRef.get();

            if (!poSnap.exists) {
              result.skipped += 1;
              messageReasons.push(
                `PO ${poCode} detected but no purchaseOrders/${poCode} doc exists.`
              );
              continue;
            }

            const processedRef = adminFirestore
              .collection("poInboxProcessedEmails")
              .doc(safeProcessedEmailId(poCode, messageId));

            const processedSnap = await processedRef.get();

            if (processedSnap.exists) {
              result.skipped += 1;
              messageReasons.push(`PO ${poCode} already processed for this email.`);
              continue;
            }

            const now = new Date().toISOString();

            const savedAttachments = await savePdfAttachmentsForPo({
              poCode,
              messageId,
              attachments: allAttachments,
            });

            await adminFirestore.runTransaction(async (tx) => {
              const livePo = await tx.get(poRef);
              if (!livePo.exists) return;

              tx.set(
                poRef,
                {
                  status: "matched",
                  vendorName: from || null,
                  invoiceEmailMessageId: messageId,
                  invoiceEmailSubject: subject || null,
                  invoiceEmailFrom: from || null,
                  invoiceEmailMatchedAt: now,
                  invoiceAttachmentCount: allAttachments.length,
                  invoicePdfAttachmentCount: savedAttachments.length,
                  matchedAttachments: savedAttachments,
                  matchedAttachmentIds: savedAttachments.map((a) => a.id),
                  updatedAt: now,
                },
                { merge: true }
              );

              tx.set(processedRef, {
                poCode,
                messageId,
                subject,
                from,
                uid: message.uid || null,
                attachmentCount: allAttachments.length,
                pdfAttachmentCount: savedAttachments.length,
                savedAttachments,
                processedAt: now,
                createdAt: FieldValue.serverTimestamp(),
              });
            });

            result.matched += 1;
            messageHadMatch = true;
            messageReasons.push(
              `Matched PO ${poCode}. Saved ${savedAttachments.length} PDF attachment(s).`
            );

            result.matches.push({
              poCode,
              subject,
              from,
              messageId,
              attachmentCount: savedAttachments.length,
            });
          }

          if (messageHadMatch && message.uid) {
            await client.messageFlagsAdd(message.uid, ["\\Seen"], {
              uid: true,
            });
          }

          result.debug.scannedEmails.push({
            uid: message.uid || null,
            subject,
            from,
            messageId,
            detectedPoCodes,
            reason: messageReasons.join(" ") || "Processed.",
          });
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to process inbox message.";

          result.errors.push(errorMessage);

          result.debug.scannedEmails.push({
            uid: null,
            subject,
            from,
            messageId,
            detectedPoCodes,
            reason: `Error: ${errorMessage}`,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch (err) {
      console.warn("PO inbox logout warning:", err);
    }
  }

  return result;
}