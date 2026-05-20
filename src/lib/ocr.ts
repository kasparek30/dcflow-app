// src/lib/ocr.ts
import vision from "@google-cloud/vision";
import { extractText, getDocumentProxy } from "unpdf";

function getPrivateKeyFromEnv(raw?: string) {
  if (!raw) return undefined;
  return raw.replace(/\\n/g, "\n");
}

function getVisionClient() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);

    return new vision.ImageAnnotatorClient({
      projectId: parsed.project_id,
      credentials: {
        client_email: parsed.client_email,
        private_key: getPrivateKeyFromEnv(parsed.private_key),
      },
    });
  }

  return new vision.ImageAnnotatorClient();
}

async function extractNativeTextFromPdfBuffer(buffer: Buffer) {
  try {
    const documentProxy = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(documentProxy, { mergePages: true });

    return String(text || "").trim();
  } catch (err) {
    console.warn("Native PDF extraction failed:", err);
    return "";
  }
}

async function extractVisionTextFromPdfBuffer(buffer: Buffer) {
  try {
    const client = getVisionClient();

    const [result] = await client.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            mimeType: "application/pdf",
            content: buffer,
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    });

    const responses = result.responses?.[0]?.responses || [];

    return responses
      .map((page) => String(page.fullTextAnnotation?.text || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
  } catch (err) {
    console.error("Google Vision OCR failed:", err);
    return "";
  }
}

export async function extractTextFromPdfBuffer(buffer: Buffer) {
  const nativeText = await extractNativeTextFromPdfBuffer(buffer);

  if (nativeText) {
    console.log("PDF extraction method: native unpdf");
    return nativeText;
  }

  const visionText = await extractVisionTextFromPdfBuffer(buffer);

  if (visionText) {
    console.log("PDF extraction method: Google Vision OCR");
    return visionText;
  }

  return "";
}