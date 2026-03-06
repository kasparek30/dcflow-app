// src/lib/firebase-admin.ts

import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  // In Firebase App Hosting, Application Default Credentials are available.
  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
  });
}

export function adminDb() {
  getAdminApp();
  return getFirestore();
}