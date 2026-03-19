// app/api/qbo/customers/update-from-dcflow/route.ts
import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../_lib";
import { adminDb } from "../../admin-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QboAddress = {
  Line1?: string;
  Line2?: string;
  Line3?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
};

function safeStr(x: unknown) {
  return String(x ?? "").trim();
}

/**
 * Supports both schemas:
 * - New QBO import: billAddrLine1, shipAddrLine1, phone, qboCustomerId
 * - Legacy DCFlow UI: billingAddressLine1, phonePrimary, quickbooksCustomerId, serviceAddresses[]
 */
function getQboCustomerIdFromDc(d: any) {
  return safeStr(d?.qboCustomerId) || safeStr(d?.quickbooksCustomerId);
}

function getDcEmail(d: any) {
  return safeStr(d?.email);
}

function getDcPhone(d: any) {
  return safeStr(d?.phone) || safeStr(d?.phonePrimary);
}

function getDcDisplayName(d: any) {
  return safeStr(d?.displayName || d?.customerDisplayName);
}

function buildBillAddrFromDc(d: any): QboAddress | null {
  // Prefer new import fields
  const Line1 = safeStr(d?.billAddrLine1) || safeStr(d?.billingAddressLine1);
  const Line2 = safeStr(d?.billAddrLine2) || safeStr(d?.billingAddressLine2);
  const Line3 = safeStr(d?.billAddrLine3);
  const City = safeStr(d?.billAddrCity) || safeStr(d?.billingCity);
  const CountrySubDivisionCode = safeStr(d?.billAddrState) || safeStr(d?.billingState);
  const PostalCode = safeStr(d?.billAddrPostalCode) || safeStr(d?.billingPostalCode);

  const hasAny = Line1 || Line2 || Line3 || City || CountrySubDivisionCode || PostalCode;
  if (!hasAny) return null;

  return {
    ...(Line1 ? { Line1 } : {}),
    ...(Line2 ? { Line2 } : {}),
    ...(Line3 ? { Line3 } : {}),
    ...(City ? { City } : {}),
    ...(CountrySubDivisionCode ? { CountrySubDivisionCode } : {}),
    ...(PostalCode ? { PostalCode } : {}),
  };
}

function pickPrimaryServiceAddress(d: any): any | null {
  const arr = Array.isArray(d?.serviceAddresses) ? d.serviceAddresses : [];
  if (!arr.length) return null;

  // Prefer explicit primary, else first active, else first
  const primary = arr.find((a: any) => a?.active !== false && a?.isPrimary);
  if (primary) return primary;

  const active = arr.find((a: any) => a?.active !== false);
  return active || arr[0] || null;
}

/**
 * ShipAddr strategy:
 * - If you have flat shipAddr* fields (QBO import), use them.
 * - Else, use the customer's primary service address (legacy UI), if present.
 * - Else, don't send ShipAddr (prevents wiping QBO).
 */
function buildShipAddrFromDc(d: any): QboAddress | null {
  const flatLine1 = safeStr(d?.shipAddrLine1);
  const flatLine2 = safeStr(d?.shipAddrLine2);
  const flatLine3 = safeStr(d?.shipAddrLine3);
  const flatCity = safeStr(d?.shipAddrCity);
  const flatState = safeStr(d?.shipAddrState);
  const flatPostal = safeStr(d?.shipAddrPostalCode);

  const flatHasAny = flatLine1 || flatLine2 || flatLine3 || flatCity || flatState || flatPostal;
  if (flatHasAny) {
    return {
      ...(flatLine1 ? { Line1: flatLine1 } : {}),
      ...(flatLine2 ? { Line2: flatLine2 } : {}),
      ...(flatLine3 ? { Line3: flatLine3 } : {}),
      ...(flatCity ? { City: flatCity } : {}),
      ...(flatState ? { CountrySubDivisionCode: flatState } : {}),
      ...(flatPostal ? { PostalCode: flatPostal } : {}),
    };
  }

  const svc = pickPrimaryServiceAddress(d);
  if (!svc) return null;

  const Line1 = safeStr(svc?.addressLine1);
  const Line2 = safeStr(svc?.addressLine2);
  const City = safeStr(svc?.city);
  const CountrySubDivisionCode = safeStr(svc?.state);
  const PostalCode = safeStr(svc?.postalCode);

  const hasAny = Line1 || Line2 || City || CountrySubDivisionCode || PostalCode;
  if (!hasAny) return null;

  return {
    ...(Line1 ? { Line1 } : {}),
    ...(Line2 ? { Line2 } : {}),
    ...(City ? { City } : {}),
    ...(CountrySubDivisionCode ? { CountrySubDivisionCode } : {}),
    ...(PostalCode ? { PostalCode } : {}),
  };
}

export async function POST(req: Request) {
  try {
    const { realmId } = await getQboCookieValues();
    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // REQUIRED:
    const dcCustomerId = safeStr(body?.dcCustomerId);
    if (!dcCustomerId) {
      return NextResponse.json({ error: "Missing dcCustomerId." }, { status: 400 });
    }

    // OPTIONAL: allow explicitly changing name in QBO from DCFlow
    const updateName = Boolean(body?.updateName);

    const db = adminDb();
    const docRef = db.collection("customers").doc(dcCustomerId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "DCFlow customer not found." }, { status: 404 });
    }

    const d = snap.data() as any;

    const qboCustomerId = getQboCustomerIdFromDc(d);
    if (!qboCustomerId) {
      return NextResponse.json(
        { error: "Customer is missing qboCustomerId/quickbooksCustomerId (not linked to QBO)." },
        { status: 400 }
      );
    }

    const base = getQboApiBaseUrl();

    // 1) Fetch QBO Customer so we can get SyncToken (required for update)
    const getUrl = `${base}/v3/company/${realmId}/customer/${qboCustomerId}`;

    const getResObj = await qboFetchWithAutoRefresh(getUrl);
    const getRes = getResObj.res;
    const getJson = getResObj.body;
    const intuitTid = getResObj.intuitTid || "";
    const attempt = (getResObj.attempt === "refreshed" ? "refreshed" : "original") as
      | "original"
      | "refreshed";

    if (!getRes.ok) {
      await docRef.set(
        {
          qboSyncStatus: "error",
          qboLastSyncError: "Failed to fetch QBO customer (SyncToken lookup).",
          qboLastSyncAttempt: attempt,
          qboLastSyncIntuitTid: intuitTid,
          qboLastSyncedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch QBO customer before update.",
          status: getRes.status,
          intuit_tid: intuitTid,
          attempt,
          body: getJson,
        },
        { status: 500 }
      );
    }

    const qboCustomer = getJson?.Customer;
    const syncToken = safeStr(qboCustomer?.SyncToken);

    if (!syncToken) {
      return NextResponse.json(
        { error: "QBO customer SyncToken missing (unexpected)." },
        { status: 500 }
      );
    }

    // 2) Build sparse update payload
    const dcEmail = getDcEmail(d);
    const dcPhone = getDcPhone(d);
    const dcDisplayName = getDcDisplayName(d);

    const BillAddr = buildBillAddrFromDc(d);
    const ShipAddr = buildShipAddrFromDc(d);

    const updatePayload: any = {
      sparse: true,
      Id: qboCustomerId,
      SyncToken: syncToken,

      ...(dcEmail ? { PrimaryEmailAddr: { Address: dcEmail } } : {}),
      ...(dcPhone ? { PrimaryPhone: { FreeFormNumber: dcPhone } } : {}),

      ...(BillAddr ? { BillAddr } : {}),
      ...(ShipAddr ? { ShipAddr } : {}),

      ...(updateName && dcDisplayName ? { DisplayName: dcDisplayName } : {}),
    };

    // 3) Send update to QBO
    const updateUrl = `${base}/v3/company/${realmId}/customer?operation=update`;

    const { res: upRes, body: upBody, intuitTid: upTid, attempt: upAttempt } =
      await qboFetchWithAutoRefresh(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

    const nowIso = new Date().toISOString();

    if (!upRes.ok) {
      await docRef.set(
        {
          qboSyncStatus: "error",
          qboLastSyncError: "QBO customer update failed.",
          qboLastSyncAttempt: upAttempt === "refreshed" ? "refreshed" : "original",
          qboLastSyncIntuitTid: upTid || "",
          qboLastSyncedAt: nowIso,
          qboLastUpdatePayload: updatePayload, // remove later if you want
        },
        { merge: true }
      );

      return NextResponse.json(
        {
          ok: false,
          error: "QBO customer update failed.",
          status: upRes.status,
          intuit_tid: upTid || "",
          attempt: upAttempt,
          body: upBody,
        },
        { status: 500 }
      );
    }

    // 4) Mark Firestore as synced
    await docRef.set(
      {
        qboSyncStatus: "synced",
        qboLastSyncedAt: nowIso,
        qboLastSyncAttempt: upAttempt === "refreshed" ? "refreshed" : "original",
        qboLastSyncIntuitTid: upTid || "",
        qboLastSyncError: null,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      message: "Updated QBO customer from DCFlow customer record.",
      dcCustomerId,
      qboCustomerId,
      realmId,
      intuit_tid: upTid || "",
      attempt: upAttempt === "refreshed" ? "refreshed" : "original",
      sent: {
        email: Boolean(dcEmail),
        phone: Boolean(dcPhone),
        billAddr: Boolean(BillAddr),
        shipAddr: Boolean(ShipAddr),
        displayName: Boolean(updateName && dcDisplayName),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Customer update failed." },
      { status: 500 }
    );
  }
}

// Force TS to treat this as a module in any weird editor/compile edge-cases
export {};