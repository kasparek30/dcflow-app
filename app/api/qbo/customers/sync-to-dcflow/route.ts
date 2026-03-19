// app/api/qbo/customers/sync-to-dcflow/route.ts
import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../_lib";
import { adminDb } from "../../admin-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  Mobile?: { FreeFormNumber?: string };

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

function dcCustomerIdFromQboId(qboId: string) {
  return `qbo_${qboId}`;
}

function safeStr(x: unknown) {
  return String(x ?? "").trim();
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
      const qboId = safeStr(c.Id);
      if (!qboId) continue;

      const dcId = dcCustomerIdFromQboId(qboId);
      const docRef = db.collection("customers").doc(dcId);

      const displayName =
        safeStr(c.DisplayName) ||
        safeStr(c.CompanyName) ||
        `${safeStr(c.GivenName)} ${safeStr(c.FamilyName)}`.trim() ||
        `QBO Customer ${qboId}`;

      const phone =
        safeStr(c.PrimaryPhone?.FreeFormNumber) ||
        safeStr(c.Mobile?.FreeFormNumber) ||
        "";

      const payload = {
        // DCFlow display
        customerDisplayName: displayName,
        displayName,

        // QBO link
        qboCustomerId: qboId,
        qboDisplayName: safeStr(c.DisplayName) || displayName,
        realmId,

        // Contact
        email: safeStr(c.PrimaryEmailAddr?.Address),
        phone,

        // Billing address (v1 flat)
        billAddrLine1: safeStr(c.BillAddr?.Line1),
        billAddrLine2: safeStr(c.BillAddr?.Line2),
        billAddrLine3: safeStr(c.BillAddr?.Line3),
        billAddrCity: safeStr(c.BillAddr?.City),
        billAddrState: safeStr(c.BillAddr?.CountrySubDivisionCode),
        billAddrPostalCode: safeStr(c.BillAddr?.PostalCode),

        // Shipping address (v1 flat)
        shipAddrLine1: safeStr(c.ShipAddr?.Line1),
        shipAddrLine2: safeStr(c.ShipAddr?.Line2),
        shipAddrLine3: safeStr(c.ShipAddr?.Line3),
        shipAddrCity: safeStr(c.ShipAddr?.City),
        shipAddrState: safeStr(c.ShipAddr?.CountrySubDivisionCode),
        shipAddrPostalCode: safeStr(c.ShipAddr?.PostalCode),

        active: typeof c.Active === "boolean" ? c.Active : true,

        // sync metadata
        qboSyncStatus: "synced",
        qboLastSyncedAt: nowIso,
        qboLastSyncAttempt: lastAttempt,
        qboLastSyncIntuitTid: lastIntuitTid,

        source: "qbo_import",
        updatedAt: nowIso,

        // NOTE: leaving this as-is (it will overwrite). If you want "only set once"
        // we can convert to a transaction-based firstSeenAt later.
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
      message: "Imported QBO customers into DCFlow customers collection.",
      realmId,
      attempt: lastAttempt,
      intuit_tid: lastIntuitTid,
      fetchedCount: all.length,
      upsertedCount: totalUpserts,
      collection: "customers",
      idStrategy: "customers/qbo_<qboCustomerId>",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Customer import failed." },
      { status: 500 }
    );
  }
}

export {};