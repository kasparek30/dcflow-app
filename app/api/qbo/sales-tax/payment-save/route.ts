// app/api/qbo/sales-tax/payment-save/route.ts

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/src/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFICE_ROLES = new Set(["admin", "billing", "dispatcher", "manager"]);

type PaymentPayload = {
  paymentDate?: string;
  customerName?: string;
  customerId?: string | null;
  reference?: string | null;
  invoiceNumber?: string | null;
  qboInvoiceId?: string | null;
  qboPaymentId?: string | null;
  source?: "manual" | "qbo_invoice_prefill";
  paymentAmountCents?: number;
  nonTaxableLaborCents?: number;
  nonTaxablePartsCents?: number;
  taxableLabor825Cents?: number;
  taxableParts825Cents?: number;
  cityTax825Cents?: number;
  cityPermitsCents?: number;
  taxableLabor675Cents?: number;
  taxableParts675Cents?: number;
  countyTax675Cents?: number;
  reviewed?: boolean;
  notes?: string | null;
};

function safeString(value: unknown) {
  return String(value ?? "").trim();
}

function nullableString(value: unknown) {
  const s = safeString(value);
  return s || null;
}

function safeInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function qboPaymentLockId(qboPaymentId: string) {
  return createHash("sha256").update(qboPaymentId).digest("hex");
}

async function authorizeOfficeUser(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Missing sign-in token." };
  }

  const token = header.slice(7).trim();
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing sign-in token." };
  }

  try {
    const db = adminDb();
    const decoded = await adminAuth().verifyIdToken(token);
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    const role = safeString(userSnap.data()?.role);

    if (!OFFICE_ROLES.has(role)) {
      return {
        ok: false as const,
        status: 403,
        error: "Sales Tax payment changes are limited to office staff.",
      };
    }

    return {
      ok: true as const,
      uid: decoded.uid,
      role,
      displayName: safeString(userSnap.data()?.displayName) || "DCFlow User",
    };
  } catch {
    return { ok: false as const, status: 401, error: "Sign-in token is invalid." };
  }
}

function cleanPaymentPayload(raw: PaymentPayload) {
  const source =
    raw?.source === "qbo_invoice_prefill" ? "qbo_invoice_prefill" : "manual";

  return {
    paymentDate: safeString(raw?.paymentDate),
    customerName: safeString(raw?.customerName),
    customerId: nullableString(raw?.customerId),
    reference: nullableString(raw?.reference),
    invoiceNumber: nullableString(raw?.invoiceNumber),
    qboInvoiceId: nullableString(raw?.qboInvoiceId),
    qboPaymentId: nullableString(raw?.qboPaymentId),
    source,
    paymentAmountCents: safeInt(raw?.paymentAmountCents),
    nonTaxableLaborCents: safeInt(raw?.nonTaxableLaborCents),
    nonTaxablePartsCents: safeInt(raw?.nonTaxablePartsCents),
    taxableLabor825Cents: safeInt(raw?.taxableLabor825Cents),
    taxableParts825Cents: safeInt(raw?.taxableParts825Cents),
    cityTax825Cents: safeInt(raw?.cityTax825Cents),
    cityPermitsCents: safeInt(raw?.cityPermitsCents),
    taxableLabor675Cents: safeInt(raw?.taxableLabor675Cents),
    taxableParts675Cents: safeInt(raw?.taxableParts675Cents),
    countyTax675Cents: safeInt(raw?.countyTax675Cents),
    reviewed: Boolean(raw?.reviewed),
    notes: nullableString(raw?.notes),
  };
}

export async function POST(req: Request) {
  const authz = await authorizeOfficeUser(req);
  if (!authz.ok) {
    return NextResponse.json(
      { ok: false, error: authz.error },
      { status: authz.status },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const periodKey = safeString(body?.periodKey);
    const editingPaymentId = safeString(body?.editingPaymentId) || null;
    const payment = cleanPaymentPayload(body?.payment || {});

    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
      return NextResponse.json(
        { ok: false, error: "Invalid Sales Tax period." },
        { status: 400 },
      );
    }

    if (!payment.paymentDate || !payment.customerName) {
      return NextResponse.json(
        { ok: false, error: "Payment date and customer are required." },
        { status: 400 },
      );
    }

    const db = adminDb();
    const periodRef = db.collection("salesTaxPeriods").doc(periodKey);
    const paymentsCol = periodRef.collection("payments");
    const paymentRef = editingPaymentId
      ? paymentsCol.doc(editingPaymentId)
      : paymentsCol.doc();

    const result = await db.runTransaction(async (transaction) => {
      const periodSnap = await transaction.get(periodRef);
      if (!periodSnap.exists || periodSnap.data()?.status !== "open") {
        throw new Error("This Sales Tax month is filed or unavailable for editing.");
      }

      let existingData: Record<string, any> | null = null;
      if (editingPaymentId) {
        const existingSnap = await transaction.get(paymentRef);
        if (!existingSnap.exists) {
          throw new Error("The Sales Tax payment you are editing no longer exists.");
        }
        existingData = existingSnap.data() || {};
      }

      const oldQboPaymentId = safeString(existingData?.qboPaymentId);
      const newQboPaymentId = safeString(payment.qboPaymentId);

      const oldLockRef = oldQboPaymentId
        ? db
            .collection("salesTaxQboPaymentLocks")
            .doc(qboPaymentLockId(oldQboPaymentId))
        : null;
      const newLockRef = newQboPaymentId
        ? db
            .collection("salesTaxQboPaymentLocks")
            .doc(qboPaymentLockId(newQboPaymentId))
        : null;

      const oldLockSnap = oldLockRef ? await transaction.get(oldLockRef) : null;
      const newLockSnap =
        newLockRef && (!oldLockRef || newLockRef.path !== oldLockRef.path)
          ? await transaction.get(newLockRef)
          : oldLockSnap;

      if (newLockRef && newLockSnap?.exists) {
        const lock = newLockSnap.data() || {};
        const lockedPath = safeString(lock.paymentPath);
        if (lockedPath && lockedPath !== paymentRef.path) {
          const existingPeriod = safeString(lock.periodKey) || "another month";
          const existingCustomer = safeString(lock.customerName);
          const existingReference = safeString(lock.reference);
          throw new Error(
            `This QuickBooks payment has already been added to Sales Tax for ${existingPeriod}${
              existingCustomer ? ` — ${existingCustomer}` : ""
            }${existingReference ? ` — Ref ${existingReference}` : ""}.`,
          );
        }
      }

      const stamp = nowIso();
      const createdAt = safeString(existingData?.createdAt) || stamp;
      const createdByUid = safeString(existingData?.createdByUid) || authz.uid;
      const createdByName =
        safeString(existingData?.createdByName) || authz.displayName;

      transaction.set(paymentRef, {
        ...payment,
        createdAt,
        createdByUid,
        createdByName,
        updatedAt: stamp,
        updatedByUid: authz.uid,
        updatedByName: authz.displayName,
      });

      if (
        oldLockRef &&
        oldQboPaymentId &&
        oldQboPaymentId !== newQboPaymentId &&
        oldLockSnap?.exists &&
        safeString(oldLockSnap.data()?.paymentPath) === paymentRef.path
      ) {
        transaction.delete(oldLockRef);
      }

      if (newLockRef && newQboPaymentId) {
        transaction.set(newLockRef, {
          qboPaymentId: newQboPaymentId,
          periodKey,
          paymentId: paymentRef.id,
          paymentPath: paymentRef.path,
          customerName: payment.customerName,
          reference: payment.reference,
          paymentDate: payment.paymentDate,
          paymentAmountCents: payment.paymentAmountCents,
          updatedAt: stamp,
          updatedByUid: authz.uid,
          updatedByName: authz.displayName,
          createdAt: newLockSnap?.exists
            ? safeString(newLockSnap.data()?.createdAt) || stamp
            : stamp,
        });
      }

      return { paymentId: paymentRef.id };
    });

    return NextResponse.json({
      ok: true,
      paymentId: result.paymentId,
      safeguarded: Boolean(payment.qboPaymentId),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to save Sales Tax payment.";
    const duplicate = message.includes("already been added to Sales Tax");

    return NextResponse.json(
      { ok: false, error: message },
      { status: duplicate ? 409 : 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const authz = await authorizeOfficeUser(req);
  if (!authz.ok) {
    return NextResponse.json(
      { ok: false, error: authz.error },
      { status: authz.status },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const periodKey = safeString(body?.periodKey);
    const paymentId = safeString(body?.paymentId);

    if (!/^\d{4}-\d{2}$/.test(periodKey) || !paymentId) {
      return NextResponse.json(
        { ok: false, error: "Period and payment are required." },
        { status: 400 },
      );
    }

    const db = adminDb();
    const periodRef = db.collection("salesTaxPeriods").doc(periodKey);
    const paymentRef = periodRef.collection("payments").doc(paymentId);

    await db.runTransaction(async (transaction) => {
      const periodSnap = await transaction.get(periodRef);
      if (!periodSnap.exists || periodSnap.data()?.status !== "open") {
        throw new Error("This Sales Tax month is filed or unavailable for editing.");
      }

      const paymentSnap = await transaction.get(paymentRef);
      if (!paymentSnap.exists) return;

      const qboPaymentId = safeString(paymentSnap.data()?.qboPaymentId);
      const lockRef = qboPaymentId
        ? db
            .collection("salesTaxQboPaymentLocks")
            .doc(qboPaymentLockId(qboPaymentId))
        : null;
      const lockSnap = lockRef ? await transaction.get(lockRef) : null;

      transaction.delete(paymentRef);

      if (
        lockRef &&
        lockSnap?.exists &&
        safeString(lockSnap.data()?.paymentPath) === paymentRef.path
      ) {
        transaction.delete(lockRef);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to delete payment.",
      },
      { status: 500 },
    );
  }
}
