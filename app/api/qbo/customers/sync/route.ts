// app/api/qbo/customers/sync/route.ts
import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../_lib";
import { adminDb } from "../../admin-db";

type AttemptValue = "original" | "refreshed";

type QboAddress = {
  Line1?: string;
  Line2?: string;
  Line3?: string;
  City?: string;
  CountrySubDivisionCode?: string; // state
  PostalCode?: string;
};

type QboCustomer = {
  Id?: string;
  DisplayName?: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  MiddleName?: string;
  Active?: boolean;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  BillAddr?: QboAddress;
  ShipAddr?: QboAddress;
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

    // QBO query pagination
    const max = 200;
    let start = 1;

    const all: QboCustomer[] = [];
    let lastIntuitTid = "";
    let lastAttempt: AttemptValue = "original";

    while (true) {
      const q = encodeURIComponent(
        `select * from Customer startposition ${start} maxresults ${max}`
      );
      const url = `${base}/v3/company/${realmId}/query?query=${q}`;

      const { res, body, intuitTid, attempt } = await qboFetchWithAutoRefresh(url);

      lastIntuitTid = intuitTid || "";
      lastAttempt = normalizeAttempt(attempt);

      if (!res.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "QBO Customer query failed.",
            status: res.status,
            intuit_tid: lastIntuitTid,
            attempt: lastAttempt,
            body,
          },
          { status: 500 }
        );
      }

      const page = asArray<QboCustomer>(body?.QueryResponse?.Customer);
      all.push(...page);

      if (page.length < max) break;
      start += max;
    }

    const db = adminDb();
    const nowIso = new Date().toISOString();

    let totalUpserts = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const c of all) {
      const id = String(c.Id || "").trim();
      if (!id) continue;

      const docRef = db.collection("qboCustomers").doc(id);

      const payload = {
        qboCustomerId: id,

        displayName: c.DisplayName ?? "",
        companyName: c.CompanyName ?? "",
        givenName: c.GivenName ?? "",
        familyName: c.FamilyName ?? "",
        middleName: c.MiddleName ?? "",

        email: c.PrimaryEmailAddr?.Address ?? "",
        phone: c.PrimaryPhone?.FreeFormNumber ?? "",

        billAddrLine1: c.BillAddr?.Line1 ?? "",
        billAddrLine2: c.BillAddr?.Line2 ?? "",
        billAddrCity: c.BillAddr?.City ?? "",
        billAddrState: c.BillAddr?.CountrySubDivisionCode ?? "",
        billAddrPostalCode: c.BillAddr?.PostalCode ?? "",

        shipAddrLine1: c.ShipAddr?.Line1 ?? "",
        shipAddrLine2: c.ShipAddr?.Line2 ?? "",
        shipAddrCity: c.ShipAddr?.City ?? "",
        shipAddrState: c.ShipAddr?.CountrySubDivisionCode ?? "",
        shipAddrPostalCode: c.ShipAddr?.PostalCode ?? "",

        active: typeof c.Active === "boolean" ? c.Active : true,

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
      message: "QBO Customers synced to Firestore.",
      realmId,
      attempt: lastAttempt,
      intuit_tid: lastIntuitTid,
      fetchedCount: all.length,
      upsertedCount: totalUpserts,
      collection: "qboCustomers",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Customer sync failed." },
      { status: 500 }
    );
  }
}
