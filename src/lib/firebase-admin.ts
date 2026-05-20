// src/lib/firebase-admin.ts
import * as admin from "firebase-admin";

function getPrivateKeyFromEnv(raw?: string) {
  if (!raw) return undefined;
  return raw.replace(/\\n/g, "\n");
}

function getOrInitAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    "dcflow";

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.appspot.com`;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);

    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: getPrivateKeyFromEnv(parsed.private_key),
      }),
      projectId: parsed.project_id,
      storageBucket,
    });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
    storageBucket,
  });
}

export function adminApp() {
  return getOrInitAdminApp();
}

export function adminDb() {
  return admin.firestore(adminApp());
}

export function adminAuth() {
  return admin.auth(adminApp());
}

export function adminStorage() {
  return admin.storage(adminApp());
}

export const adminFirestore = adminDb();
export const adminStorageBucket = adminStorage().bucket();