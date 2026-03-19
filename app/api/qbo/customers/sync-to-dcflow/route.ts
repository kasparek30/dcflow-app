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
  CountrySubDivisionCode?: string;
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

function safeStr(x: unknown) {
  return String(x ?? "").trim();
}

function buildDisplayName(c: QboCustomer) {
  const displayName =
    safeStr(c.DisplayName) ||
    safeStr(c.CompanyName) ||
    `${safeStr(c.GivenName)} ${safeStr(c.FamilyName)}`.trim();

  return displayName || `QBO Customer ${safeStr(c.Id) || "Unknown"}`;
}

function normalizePhone(phoneRaw: string) {
  // Keep simple for now — you can add E.164 formatting later if you want.
  return safeStr(phoneRaw);
}

function addressToServiceAddress(addr: QboAddress, label: string, isPrimary: boolean) {
  return {
    id: crypto.randomUUID(),
    label,
    addressLine1: safeStr(addr.Line1),
    addressLine2: safeStr(addr.Line2) || undefined,
    city: safeStr(addr.City),
    state: safeStr(addr.CountrySubDivisionCode),
    postalCode: safeStr(addr.PostalCode),
    notes: undefined,
    active: true,
    isPrimary,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isAddressMeaningful(addr?: QboAddress) {
  if (!addr) return false;
  return Boolean(
    safeStr(addr.Line1) ||
      safeStr(addr.Line2) ||
      safeStr(addr.City) ||
      safeStr(addr.CountrySubDivisionCode) ||
      safeStr(addr.PostalCode)
  );
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

      // ✅ Use QBO ID as the Firestore doc ID (matches your existing pattern)
      const dcId = `qbo_${qboId}`;
      const docRef = db.collection("customers").doc(dcId);

      const displayName = buildDisplayName(c);

      // ✅ Map addresses into the schema your Customer page expects
      const bill = c.BillAddr;
      const ship = c.ShipAddr;

      const billingAddressLine1 = safeStr(bill?.Line1);
      const billingAddressLine2 = safeStr(bill?.Line2) || undefined;
      const billingCity = safeStr(bill?.City);
      const billingState = safeStr(bill?.CountrySubDivisionCode);
      const billingPostalCode = safeStr(bill?.PostalCode);

      // ✅ Build serviceAddresses:
      // Prefer ShipAddr as primary service address, else fall back to BillAddr.
      const serviceAddresses: any[] = [];

      if (isAddressMeaningful(ship)) {
        serviceAddresses.push(addressToServiceAddress(ship!, "Service Address (QBO)", true));
      } else if (isAddressMeaningful(bill)) {
        serviceAddresses.push(addressToServiceAddress(bill!, "Service Address (From Billing)", true));
      }

      const payload = {
        // ✅ DCFlow Customer schema (matches src/types/customer.ts)
        source: "quickbooks",
        displayName,

        phonePrimary: normalizePhone(c.PrimaryPhone?.FreeFormNumber ?? ""),
        phoneSecondary: null,
        email: safeStr(c.PrimaryEmailAddr?.Address) || null,

        billingAddressLine1: billingAddressLine1 || "",
        billingAddressLine2: billingAddressLine2 || null,
        billingCity: billingCity || "",
        billingState: billingState || "",
        billingPostalCode: billingPostalCode || "",

        serviceAddresses: serviceAddresses.length ? serviceAddresses : [],

        notes: null,
        active: typeof c.Active === "boolean" ? c.Active : true,

        // ✅ Linkage field your Customer type uses
        quickbooksCustomerId: qboId,

        // ✅ housekeeping
        realmId,
        lastSyncIntuitTid: lastIntuitTid,
        lastSyncAttempt: lastAttempt,
        updatedAt: nowIso,
        createdAt: nowIso, // ok to set; merge won't overwrite existing if you prefer
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
      message: "Imported QBO customers into DCFlow customers collection (DCFlow schema).",
      realmId,
      attempt: lastAttempt,
      intuit_tid: lastIntuitTid,
      fetchedCount: all.length,
      upsertedCount: totalUpserts,
      collection: "customers",
      idStrategy: "customers/qbo_<qboCustomerId>",
      schema: "dcflow_customer_v1",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Customer import failed." },
      { status: 500 }
    );
  }
}

export {};