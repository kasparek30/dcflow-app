import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// put your service account json in /scripts or another safe local folder
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "dcflow",
});

const uid = "1DoBPWuTiSQutEnhwLlqdz66Ya53";
const newEmail = "kenn@dcflow.app";

async function run() {
  try {
    const user = await admin.auth().updateUser(uid, {
      email: newEmail,
    });

    console.log("✅ Auth email updated:", user.email);

    // Update users/{uid}
    await admin.firestore().collection("users").doc(uid).set(
      {
        email: newEmail,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log("✅ users/{uid} updated");

    // Update employeeProfiles where userUid == uid
    const profileSnap = await admin
      .firestore()
      .collection("employeeProfiles")
      .where("userUid", "==", uid)
      .get();

    if (!profileSnap.empty) {
      const batch = admin.firestore().batch();

      profileSnap.docs.forEach((docSnap) => {
        batch.set(
          docSnap.ref,
          {
            email: newEmail,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      });

      await batch.commit();
      console.log(`✅ employeeProfiles updated: ${profileSnap.size}`);
    } else {
      console.log("ℹ️ No matching employeeProfiles found");
    }
  } catch (err) {
    console.error("❌ Error updating email:", err);
  }
}

run();