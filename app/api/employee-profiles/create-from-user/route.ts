// app/api/employee-profiles/create-from-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../src/lib/firebase-admin";

type Body = {
  userUid?: string;
};

function guessLaborRole(role: string): string {
  const r = (role || "").toLowerCase().trim();
  if (r === "technician") return "technician";
  if (r === "helper") return "helper";
  if (r === "apprentice") return "apprentice";
  if (r === "admin") return "admin";
  if (r === "dispatcher") return "dispatcher";
  if (r === "billing") return "billing";
  if (r === "manager") return "manager";
  return "other";
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const decoded = await adminAuth().verifyIdToken(token);
    const requesterUid = decoded.uid;

    const db = adminDb();

    const requesterSnap = await db.collection("users").doc(requesterUid).get();
    if (!requesterSnap.exists) {
      return NextResponse.json(
        { error: "Requesting admin user record not found." },
        { status: 403 }
      );
    }

    const requester = requesterSnap.data() as any;
    if (String(requester.role || "").toLowerCase() !== "admin") {
      return NextResponse.json(
        { error: "Only admins can create employee profiles." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Body;
    const userUid = String(body.userUid || "").trim();

    if (!userUid) {
      return NextResponse.json(
        { error: "Missing userUid." },
        { status: 400 }
      );
    }

    const userSnap = await db.collection("users").doc(userUid).get();

    if (!userSnap.exists) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const u = userSnap.data() as any;

    const displayName = String(u.displayName || "").trim();
    const email = String(u.email || "").trim();
    const role = String(u.role || "").trim();
    const preferredTechnicianId = String(u.preferredTechnicianId || "").trim();

    if (!displayName) {
      return NextResponse.json(
        {
          error:
            "User has no displayName. Please set it in Admin > Users first.",
        },
        { status: 400 }
      );
    }

    const existingSnap = await db
      .collection("employeeProfiles")
      .where("userUid", "==", userUid)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingId = existingSnap.docs[0].id;
      return NextResponse.json({
        ok: true,
        message: "Employee profile already exists for this user.",
        profileId: existingId,
        existed: true,
      });
    }

    const nowIso = new Date().toISOString();

    const payload = {
      userUid,
      displayName,
      email: email || null,
      phone: null,
      employmentStatus: "current",
      laborRole: guessLaborRole(role),
      defaultPairedTechUid:
        role === "helper" || role === "apprentice"
          ? preferredTechnicianId || null
          : null,
      qboEmployeeId: null,
      qboEmployeeDisplayName: null,
      qboEmployeeHiredDate: null,
      ptoEligibilityDate: null,
      notes: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdByUid: requesterUid,
      updatedByUid: requesterUid,
    };

    const profileRef = await db.collection("employeeProfiles").add(payload);

    return NextResponse.json({
      ok: true,
      message: "Employee profile created from user.",
      profileId: profileRef.id,
      existed: false,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Create-from-user failed.",
      },
      { status: 500 }
    );
  }
}