// src/lib/firebase.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

type FirebaseWebAppConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

function getFirebaseConfig(): FirebaseWebAppConfig {
  const envConfig: FirebaseWebAppConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const hasAllEnvValues =
    !!envConfig.apiKey &&
    !!envConfig.authDomain &&
    !!envConfig.projectId &&
    !!envConfig.storageBucket &&
    !!envConfig.messagingSenderId &&
    !!envConfig.appId;

  if (hasAllEnvValues) {
    return envConfig;
  }

  const appHostingConfigRaw = process.env.FIREBASE_WEBAPP_CONFIG;

  if (appHostingConfigRaw) {
    try {
      const parsed = JSON.parse(appHostingConfigRaw) as FirebaseWebAppConfig;

      const fallbackConfig: FirebaseWebAppConfig = {
        apiKey: parsed.apiKey,
        authDomain: parsed.authDomain,
        projectId: parsed.projectId,
        storageBucket: parsed.storageBucket,
        messagingSenderId: parsed.messagingSenderId,
        appId: parsed.appId,
      };

      const hasAllFallbackValues =
        !!fallbackConfig.apiKey &&
        !!fallbackConfig.authDomain &&
        !!fallbackConfig.projectId &&
        !!fallbackConfig.storageBucket &&
        !!fallbackConfig.messagingSenderId &&
        !!fallbackConfig.appId;

      if (hasAllFallbackValues) {
        return fallbackConfig;
      }
    } catch (error) {
      console.error("Failed to parse FIREBASE_WEBAPP_CONFIG:", error);
    }
  }

  throw new Error(
    "Missing Firebase web app configuration. Provide NEXT_PUBLIC_FIREBASE_* variables or FIREBASE_WEBAPP_CONFIG."
  );
}

const firebaseConfig = getFirebaseConfig();

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;