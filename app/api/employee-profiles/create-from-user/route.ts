// app/api/employee-profiles/create-from-user/route.ts
import { NextResponse } from "next/server";
import { doc, getDoc, addDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../../src/lib/firebase";

type Body = {
  userUid?: string;
};

function guessLaborRole(role: string): string {
  const r = (role || "").toLowerCase().trim();
  if (r === "technician") return "technician";
  if (r === "admin") return "admin";
  if (r === "dispatcher") return "dispatcher";
  if (r === "billing") return "billing";
  if (r === "manager") return "manager";
  return "other";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const userUid = String(body.userUid || "").trim();

    if (!userUid) {
      return NextResponse.json({ error: "Missing userUid." }, { status: 400 });
    }

    // Load user doc
    const userRef = doc(db, "users", userUid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const u = userSnap.data();

    const displayName = String(u.displayName || "").trim();
    const email = String(u.email || "").trim();
    const role = String(u.role || "").trim();

    if (!displayName) {
      return NextResponse.json(
        { error: "User has no displayName. Please set it in Admin > Users first." },
        { status: 400 }
      );
    }

    // Prevent duplicates: check if an employee profile already exists for this userUid
    const existingQ = query(
      collection(db, "employeeProfiles"),
      where("userUid", "==", userUid)
    );

    const existingSnap = await getDocs(existingQ);
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

    // IMPORTANT: never write undefined into Firestore (use null)
    const payload = {
      userUid,
      displayName,
      email: email || null,
      phone: null,

      employmentStatus: "current",
      laborRole: guessLaborRole(role),

      defaultPairedTechUid: null,
      qboEmployeeId: null,
      notes: null,

      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const profileRef = await addDoc(collection(db, "employeeProfiles"), payload);

    return NextResponse.json({
      ok: true,
      message: "Employee profile created from user.",
      profileId: profileRef.id,
      existed: false,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create-from-user failed." },
      { status: 500 }
    );
  }
}