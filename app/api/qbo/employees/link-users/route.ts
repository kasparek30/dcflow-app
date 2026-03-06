// app/api/qbo/employees/link-users/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "../../../qbo/admin-db";

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(dateIso: string, days: number): string {
  // dateIso = YYYY-MM-DD
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function POST() {
  try {
    const db = adminDb();

    const eligibilityDays = Number(process.env.PTO_ELIGIBILITY_DAYS || "365");

    // Pull qboEmployees
    const qboSnap = await db.collection("qboEmployees").get();
    const qboEmployees = qboSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

    // Build lookup by email
    const qboByEmail = new Map<string, any>();
    for (const e of qboEmployees) {
      const email = typeof e.email === "string" ? normalizeEmail(e.email) : "";
      if (email) qboByEmail.set(email, e);
    }

    // Pull DCFlow users
    const usersSnap = await db.collection("users").get();
    const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() })) as any[];

    let matched = 0;
    let updated = 0;
    let skippedNoEmail = 0;
    let skippedNoMatch = 0;

    let batch = db.batch();
    let batchCount = 0;

    const nowIso = new Date().toISOString();

    const results: any[] = [];

    for (const u of users) {
      const uid = String(u.uid || "");
      const userEmail = typeof u.email === "string" ? normalizeEmail(u.email) : "";

      if (!userEmail) {
        skippedNoEmail += 1;
        results.push({ uid, email: "", status: "skipped_no_email" });
        continue;
      }

      const match = qboByEmail.get(userEmail);

      if (!match) {
        skippedNoMatch += 1;
        results.push({ uid, email: userEmail, status: "skipped_no_qbo_match" });
        continue;
      }

      matched += 1;

      const qboEmployeeId = String(match.qboEmployeeId || match.id || "");
      const hiredDate = typeof match.hiredDate === "string" ? match.hiredDate : "";
      const eligibleDate = hiredDate ? addDaysIso(hiredDate, eligibilityDays) : "";

      const userRef = db.collection("users").doc(uid);

      batch.set(
        userRef,
        {
          qboEmployeeId,
          qboEmployeeDisplayName: match.displayName || "",
          qboEmployeeHiredDate: hiredDate || "",
          ptoEligibilityDate: eligibleDate || "",
          qboLinkedBy: "email",
          qboLinkedAt: nowIso,
        },
        { merge: true }
      );

      batchCount += 1;
      updated += 1;

      results.push({
        uid,
        email: userEmail,
        status: "linked",
        qboEmployeeId,
        hiredDate,
        ptoEligibilityDate: eligibleDate,
      });

      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      message: "Linked DCFlow users to QBO employees by email.",
      totals: {
        qboEmployees: qboEmployees.length,
        users: users.length,
        matched,
        updated,
        skippedNoEmail,
        skippedNoMatch,
      },
      sample: results.slice(0, 25),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Link users failed." },
      { status: 500 }
    );
  }
}