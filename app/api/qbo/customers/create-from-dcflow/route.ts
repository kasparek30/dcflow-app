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

  const primary = arr.find((a: any) => a?.active !== false && a?.isPrimary);
  if (primary) return primary;

  const active = arr.find((a: any) => a?.active !== false);
  return active || arr[0] || null;
}

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
    const dcCustomerId = safeStr(body?.dcCustomerId);

    if (!dcCustomerId) {
      return NextResponse.json({ error: "Missing dcCustomerId." }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection("customers").doc(dcCustomerId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "DCFlow customer not found." }, { status: 404 });
    }

    const d = snap.data() as any;
    const existingQboCustomerId = getQboCustomerIdFromDc(d);

    if (existingQboCustomerId) {
      return NextResponse.json({
        ok: true,
        alreadyLinked: true,
        dcCustomerId,
        qboCustomerId: existingQboCustomerId,
        message: "Customer is already linked to QuickBooks.",
      });
    }

    const dcDisplayName = getDcDisplayName(d);
    const dcEmail = getDcEmail(d);
    const dcPhone = getDcPhone(d);
    const BillAddr = buildBillAddrFromDc(d);
    const ShipAddr = buildShipAddrFromDc(d);

    const fallbackDisplayName = `DCFlow Customer ${dcCustomerId.slice(-6)}`;
    const DisplayName = dcDisplayName || fallbackDisplayName;

    const createPayload: any = {
      DisplayName,
      ...(dcEmail ? { PrimaryEmailAddr: { Address: dcEmail } } : {}),
      ...(dcPhone ? { PrimaryPhone: { FreeFormNumber: dcPhone } } : {}),
      ...(BillAddr ? { BillAddr } : {}),
      ...(ShipAddr ? { ShipAddr } : {}),
    };

    const base = getQboApiBaseUrl();
    const createUrl = `${base}/v3/company/${realmId}/customer`;

    const { res, body: qboBody, intuitTid, attempt } = await qboFetchWithAutoRefresh(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPayload),
    });

    const nowIso = new Date().toISOString();

    if (!res.ok) {
      await docRef.set(
        {
          quickbooksSyncStatus: "error",
          qboSyncStatus: "error",

          quickbooksLastError: "QBO customer create failed.",
          qboLastSyncError: "QBO customer create failed.",

          lastQuickbooksSyncAt: nowIso,
          qboLastSyncedAt: nowIso,

          qboLastSyncAttempt: attempt === "refreshed" ? "refreshed" : "original",
          qboLastSyncIntuitTid: intuitTid || "",
          qboLastCreatePayload: createPayload,
        },
        { merge: true }
      );

      return NextResponse.json(
        {
          ok: false,
          error: "QBO customer create failed.",
          status: res.status,
          intuit_tid: intuitTid || "",
          attempt,
          body: qboBody,
        },
        { status: 500 }
      );
    }

    const createdCustomer = qboBody?.Customer;
    const newQboCustomerId = safeStr(createdCustomer?.Id);

    if (!newQboCustomerId) {
      await docRef.set(
        {
          quickbooksSyncStatus: "error",
          qboSyncStatus: "error",

          quickbooksLastError: "QBO create succeeded but returned no customer ID.",
          qboLastSyncError: "QBO create succeeded but returned no customer ID.",

          lastQuickbooksSyncAt: nowIso,
          qboLastSyncedAt: nowIso,

          qboLastSyncAttempt: attempt === "refreshed" ? "refreshed" : "original",
          qboLastSyncIntuitTid: intuitTid || "",
        },
        { merge: true }
      );

      return NextResponse.json(
        { error: "QBO create succeeded but returned no customer ID." },
        { status: 500 }
      );
    }

    await docRef.set(
      {
        quickbooksCustomerId: newQboCustomerId,
        qboCustomerId: newQboCustomerId,

        quickbooksSyncStatus: "synced",
        qboSyncStatus: "synced",

        lastQuickbooksSyncAt: nowIso,
        qboLastSyncedAt: nowIso,

        quickbooksLastError: null,
        qboLastSyncError: null,

        qboLastSyncAttempt: attempt === "refreshed" ? "refreshed" : "original",
        qboLastSyncIntuitTid: intuitTid || "",

        updatedAt: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      message: "Created QBO customer from DCFlow customer record.",
      dcCustomerId,
      qboCustomerId: newQboCustomerId,
      realmId,
      intuit_tid: intuitTid || "",
      attempt: attempt === "refreshed" ? "refreshed" : "original",
      sent: {
        displayName: Boolean(DisplayName),
        email: Boolean(dcEmail),
        phone: Boolean(dcPhone),
        billAddr: Boolean(BillAddr),
        shipAddr: Boolean(ShipAddr),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Customer create failed." },
      { status: 500 }
    );
  }
}

export {};