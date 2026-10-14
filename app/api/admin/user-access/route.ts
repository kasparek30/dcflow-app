// app/api/admin/user-access/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../src/lib/firebase-admin";

export const runtime = "nodejs";

type AccessRequest = { uid?: unknown; active?: unknown };

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const token = authorization.slice(7).trim();
    const auth = adminAuth();
    // checkRevoked also denies disabled accounts and revoked sessions.
    const caller = await auth.verifyIdToken(token, true);
    const db = adminDb();
    const callerDoc = await db.collection("users").doc(caller.uid).get();
    if (!callerDoc.exists || callerDoc.get("active") !== true || callerDoc.get("role") !== "admin") {
      return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    }

    const body = (await request.json()) as AccessRequest;
    if (typeof body.uid !== "string" || !body.uid.trim() || typeof body.active !== "boolean") {
      return NextResponse.json({ error: "A valid user ID and active value are required." }, { status: 400 });
    }

    const uid = body.uid.trim();
    const activate = body.active;
    if (uid === caller.uid) {
      return NextResponse.json({ error: "You cannot change your own account access." }, { status: 400 });
    }

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "DCFlow user record not found." }, { status: 404 });
    }
    // Ensure this Firebase Auth UID exists before writing any Firestore data.
    await auth.getUser(uid);

    // Profiles are identified by userUid in the existing employee profile editor.
    const profileQuery = await db.collection("employeeProfiles").where("userUid", "==", uid).get();
    const profileRefs = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const profile of profileQuery.docs) profileRefs.set(profile.id, profile.ref);
    const explicitProfileId = userDoc.get("employeeProfileId");
    if (typeof explicitProfileId === "string" && explicitProfileId.trim()) {
      const explicitRef = db.collection("employeeProfiles").doc(explicitProfileId);
      const explicitSnap = await explicitRef.get();
      if (explicitSnap.exists && explicitSnap.get("userUid") === uid) {
        profileRefs.set(explicitSnap.id, explicitRef);
      }
    }

    const now = new Date().toISOString();
    // Disable Firebase Auth first. Revoking refresh tokens blocks token refresh;
    // Firestore security rules and APIs must also check active status for existing ID tokens.
    await auth.updateUser(uid, { disabled: !activate });
    if (!activate) await auth.revokeRefreshTokens(uid);

    const batch = db.batch();
    batch.update(userRef, {
      active: activate,
      ...(activate ? {} : {
        showOnSchedule: false,
        fieldAssignable: false,
        staffCoverageEligible: false,
      }),
      updatedAt: now,
      accountAccessUpdatedAt: now,
      accountAccessUpdatedBy: caller.uid,
    });

    for (const profileRef of profileRefs.values()) {
      batch.update(profileRef, {
        ...(activate ? { employmentStatus: "current" } : {
          employmentStatus: "inactive",
          showOnSchedule: false,
          fieldAssignable: false,
          staffCoverageEligible: false,
        }),
        updatedAt: now,
      });
    }
    await batch.commit();

    return NextResponse.json({
      ok: true,
      active: activate,
      profilesUpdated: profileRefs.size,
      message: activate
        ? "DCFlow login reactivated. Scheduling eligibility remains unchanged."
        : "DCFlow login deactivated and scheduling disabled. Historical records are preserved.",
    });
  } catch (error: unknown) {
    console.error("User account access update failed:", error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code.includes("auth/id-token-") || code.includes("auth/user-disabled") || code.includes("auth/user-not-found")) {
      return NextResponse.json({ error: "Invalid, expired, disabled, or missing Firebase account." }, { status: 401 });
    }
    return NextResponse.json({ error: "Account change failed. Verify Auth and Firestore account states before retrying." }, { status: 500 });
  }
}
