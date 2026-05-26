// scripts/updateUserEmail.js
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  DCFlow Auth Email Update Script
  --------------------------------
  Safe workflow:
  - Confirms the Firebase Auth user by UID
  - Confirms the current email before making changes
  - Confirms the new email is not already being used
  - Updates Firebase Authentication email
  - Updates existing users/{uid} document only if it exists
  - Updates matching employeeProfiles documents only if they exist
  - Preserves the existing Firebase UID
*/

// Keep this file local only. Never commit it to GitHub.
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ Missing serviceAccountKey.json in the same folder as this script.");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "dcflow",
  });
}

const db = admin.firestore();
const auth = admin.auth();

// ------------------------------------------------------
// CHANGE ONLY THESE THREE VALUES FOR EACH USER UPDATE
// ------------------------------------------------------

const uid = "KKMGxPSoK5gLEfpzu9r0QFIyPEl2";
const expectedCurrentEmail = "craig.dcplumbing@gmail.com";
const newEmail = "craig@dcflow.app";

// Set this to true first to verify the account before changing anything.
// After the preview looks correct, change it to false and run again.
const previewOnly = false;

// ------------------------------------------------------

async function confirmNewEmailIsAvailable() {
  try {
    const existingUser = await auth.getUserByEmail(newEmail);

    if (existingUser.uid !== uid) {
      throw new Error(
        `The new email ${newEmail} is already assigned to another Firebase Auth user with UID ${existingUser.uid}.`
      );
    }
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return;
    }

    throw error;
  }
}

async function run() {
  try {
    console.log("--------------------------------------------------");
    console.log("DCFlow authenticated user email update");
    console.log("--------------------------------------------------");

    const authUser = await auth.getUser(uid);
    const currentAuthEmail = authUser.email || "";

    console.log(`UID:           ${uid}`);
    console.log(`Current email: ${currentAuthEmail}`);
    console.log(`New email:     ${newEmail}`);
    console.log("");

    if (
      currentAuthEmail.trim().toLowerCase() !==
      expectedCurrentEmail.trim().toLowerCase()
    ) {
      throw new Error(
        `Safety stop: UID ${uid} currently belongs to ${currentAuthEmail}, not ${expectedCurrentEmail}. No changes were made.`
      );
    }

    await confirmNewEmailIsAvailable();

    const userDocRef = db.collection("users").doc(uid);
    const userDocSnap = await userDocRef.get();

    const employeeProfilesSnap = await db
      .collection("employeeProfiles")
      .where("userUid", "==", uid)
      .get();

    console.log(
      `users/{uid} document: ${
        userDocSnap.exists ? "Found" : "Not found"
      }`
    );
    console.log(
      `employeeProfiles matches: ${employeeProfilesSnap.size}`
    );
    console.log("");

    if (previewOnly) {
      console.log("✅ Preview only. No changes were made.");
      console.log(
        "Confirm the UID, current email, new email, and matching records above."
      );
      console.log(
        "Then change previewOnly to false and run the script again."
      );
      return;
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const updatedAuthUser = await auth.updateUser(uid, {
      email: newEmail,
    });

    console.log(
      `✅ Firebase Authentication email updated: ${updatedAuthUser.email}`
    );

    if (userDocSnap.exists) {
      await userDocRef.update({
        email: newEmail,
        updatedAt: timestamp,
      });

      console.log("✅ Existing users/{uid} document updated");
    } else {
      console.log(
        "ℹ️ No users/{uid} document found. Nothing was created automatically."
      );
    }

    if (!employeeProfilesSnap.empty) {
      const batch = db.batch();

      employeeProfilesSnap.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          email: newEmail,
          updatedAt: timestamp,
        });
      });

      await batch.commit();

      console.log(
        `✅ employeeProfiles documents updated: ${employeeProfilesSnap.size}`
      );
    } else {
      console.log(
        "ℹ️ No matching employeeProfiles documents found. Nothing was created automatically."
      );
    }

    const verificationUser = await auth.getUser(uid);

    console.log("");
    console.log("--------------------------------------------------");
    console.log("Update complete");
    console.log("--------------------------------------------------");
    console.log(`Verified Auth email: ${verificationUser.email}`);
    console.log(
      "The user's UID was preserved, so related DCFlow history and permissions remain attached to the same account."
    );
  } catch (error) {
    console.error("");
    console.error("❌ Email update failed.");
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

run();