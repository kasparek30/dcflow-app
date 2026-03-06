// app/api/qbo/employees/sync/route.ts
import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../_lib";
import { adminDb } from "../../admin-db";

type AttemptValue = "original" | "refreshed";

type QboEmployee = {
  Id?: string;
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  MiddleName?: string;
  Active?: boolean;
  HiredDate?: string;
  ReleasedDate?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
};

function asArray<T>(x: unknown): T[] {
  if (!x) return [];
  return Array.isArray(x) ? (x as T[]) : [x as T];
}

function normalizeAttempt(value: unknown): AttemptValue {
  return value === "refreshed" ? "refreshed" : "original";
}

export async function POST() {
  try {
    const { realmId } = await getQboCookieValues();
    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const base = getQboApiBaseUrl();

    const max = 200;
    let start = 1;

    const all: QboEmployee[] = [];
    let lastIntuitTid = "";
    let lastAttempt: AttemptValue = "original";

    while (true) {
      const q = encodeURIComponent(
        `select * from Employee startposition ${start} maxresults ${max}`
      );
      const url = `${base}/v3/company/${realmId}/query?query=${q}`;

      const { res, body, intuitTid, attempt } = await qboFetchWithAutoRefresh(url);

      lastIntuitTid = intuitTid || "";
      lastAttempt = normalizeAttempt(attempt);

      if (!res.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "QBO Employee query failed.",
            status: res.status,
            intuit_tid: lastIntuitTid,
            attempt: lastAttempt,
            body,
          },
          { status: 500 }
        );
      }

      const page = asArray<QboEmployee>(body?.QueryResponse?.Employee);
      all.push(...page);

      if (page.length < max) break;
      start += max;
    }

    const db = adminDb();
    const nowIso = new Date().toISOString();

    let totalUpserts = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const e of all) {
      const id = String(e.Id || "").trim();
      if (!id) continue;

      const docRef = db.collection("qboEmployees").doc(id);

      const payload = {
        qboEmployeeId: id,
        displayName: e.DisplayName ?? "",
        givenName: e.GivenName ?? "",
        familyName: e.FamilyName ?? "",
        middleName: e.MiddleName ?? "",
        email: e.PrimaryEmailAddr?.Address ?? "",
        phone: e.PrimaryPhone?.FreeFormNumber ?? "",
        hiredDate: e.HiredDate ?? "",
        releasedDate: e.ReleasedDate ?? "",
        active: typeof e.Active === "boolean" ? e.Active : true,

        source: "quickbooks",
        realmId,
        lastSyncIntuitTid: lastIntuitTid,
        updatedAt: nowIso,
        firstSeenAt: nowIso,
      };

      batch.set(docRef, payload, { merge: true });

      batchCount += 1;
      totalUpserts += 1;

      if (batchCount >= 450) {
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
      message: "QBO Employees synced to Firestore.",
      realmId,
      attempt: lastAttempt,
      intuit_tid: lastIntuitTid,
      fetchedCount: all.length,
      upsertedCount: totalUpserts,
      collection: "qboEmployees",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Employee sync failed." },
      { status: 500 }
    );
  }
}