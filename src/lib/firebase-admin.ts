// src/lib/firebase-admin.ts
import * as admin from "firebase-admin";

function getPrivateKeyFromEnv(raw?: string) {
  if (!raw) return undefined;
  // Handles keys pasted with \n in env vars
  return raw.replace(/\\n/g, "\n");
}

export function adminDb() {
  if (admin.apps.length === 0) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT ||
      "dcflow";

    // ✅ Option A (local dev + explicit secrets): FIREBASE_SERVICE_ACCOUNT_JSON
    // Put the whole JSON string in env (recommended for App Hosting secrets too).
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    // ✅ Option B (local dev): GOOGLE_APPLICATION_CREDENTIALS points to a JSON file
    // (No code needed—Google SDK will pick it up via ADC)

    if (serviceAccountJson) {
      const parsed = JSON.parse(serviceAccountJson);

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: getPrivateKeyFromEnv(parsed.private_key),
        }),
        projectId: parsed.project_id,
      });
    } else {
      // ✅ Production on Google (App Hosting / Cloud Run): uses Application Default Credentials automatically
      // ✅ Local dev: works if GOOGLE_APPLICATION_CREDENTIALS is set
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
    }
  }

  return admin.firestore();
}