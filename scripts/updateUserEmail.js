import admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const uid = "nh11ww16gcd7SQdKOQL8xa6uen83"; // ← paste Josh's UID
const newEmail = "josh@dcflow.app"; // ← new email

async function run() {
  try {
    const user = await admin.auth().updateUser(uid, {
      email: newEmail,
    });

    console.log("✅ Email updated:", user.email);
  } catch (err) {
    console.error("❌ Error updating email:", err);
  }
}

run();