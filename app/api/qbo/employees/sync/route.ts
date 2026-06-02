// app/api/qbo/employees/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
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

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildEmployeeQuery(start: number, max: number, includeInactive: boolean) {
  // QBO commonly hides inactive name-list entities unless explicitly requested.
  // This keeps the default clean, while allowing the UI's "show inactive" workflow
  // to refresh a complete employee list when needed.
  if (includeInactive) {
    return `select * from Employee where Active in (true, false) startposition ${start} maxresults ${max}`;
  }

  return `select * from Employee where Active = true startposition ${start} maxresults ${max}`;
}

export async function POST(req: NextRequest) {
  try {
    const { realmId } = await getQboCookieValues();

    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const includeInactive =
      req.nextUrl.searchParams.get("includeInactive") === "1" ||
      req.nextUrl.searchParams.get("includeInactive") === "true";

    const base = getQboApiBaseUrl();

    const max = 200;
    let start = 1;

    const all: QboEmployee[] = [];
    let lastIntuitTid = "";
    let lastAttempt: AttemptValue = "original";

    while (true) {
      const rawQuery = buildEmployeeQuery(start, max, includeInactive);
      const q = encodeURIComponent(rawQuery);
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
            query: rawQuery,
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
    let activeCount = 0;
    let inactiveCount = 0;

    let batch = db.batch();
    let batchCount = 0;

    for (const e of all) {
      const id = String(e.Id || "").trim();
      if (!id) continue;

      const isActive = typeof e.Active === "boolean" ? e.Active : true;

      if (isActive) activeCount += 1;
      else inactiveCount += 1;

      const docRef = db.collection("qboEmployees").doc(id);

      const payload = {
        qboEmployeeId: id,

        displayName: normalizeName(e.DisplayName),
        givenName: normalizeName(e.GivenName),
        familyName: normalizeName(e.FamilyName),
        middleName: normalizeName(e.MiddleName),

        email: normalizeEmail(e.PrimaryEmailAddr?.Address),
        phone: normalizeName(e.PrimaryPhone?.FreeFormNumber),

        hiredDate: normalizeName(e.HiredDate),
        releasedDate: normalizeName(e.ReleasedDate),
        active: isActive,

        source: "quickbooks",
        realmId,
        lastSyncIntuitTid: lastIntuitTid,
        updatedAt: nowIso,

        // Keep the original firstSeenAt after the first sync.
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
      message: includeInactive
        ? "QBO Employees synced to Firestore, including inactive employees."
        : "Active QBO Employees synced to Firestore.",
      realmId,
      attempt: lastAttempt,
      intuit_tid: lastIntuitTid,
      includeInactive,
      fetchedCount: all.length,
      activeCount,
      inactiveCount,
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