// app/api/qbo/sales-tax/invoice-lookup/route.ts

import { NextResponse } from "next/server";
import {
  getQboApiBaseUrl,
  getQboCookieValues,
  qboFetchWithAutoRefresh,
} from "../../_lib";
import { adminAuth, adminDb } from "@/src/lib/firebase-admin";

const OFFICE_ROLES = new Set(["admin", "billing", "dispatcher", "manager"]);
const SUPPORTED_TAX_RATES_BPS = [825, 675] as const;

type QboRef = {
  value?: string;
  name?: string;
};

type QboLinkedTxn = {
  TxnId?: string;
  TxnType?: string;
};

type QboPaymentLine = {
  Amount?: number;
  LinkedTxn?: QboLinkedTxn[] | QboLinkedTxn;
};

type QboPayment = {
  Id?: string;
  TxnDate?: string;
  TotalAmt?: number;
  PaymentRefNum?: string;
  CustomerRef?: QboRef;
  Line?: QboPaymentLine[] | QboPaymentLine;
};

type QboInvoiceLine = {
  Id?: string;
  LineNum?: number;
  DetailType?: string;
  Amount?: number;
  Description?: string;
  SalesItemLineDetail?: {
    ItemRef?: QboRef;
    TaxCodeRef?: QboRef;
  };
};

type QboInvoice = {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: QboRef;
  Line?: QboInvoiceLine[] | QboInvoiceLine;
  TxnTaxDetail?: {
    TotalTax?: number;
  };
};

type AllocationCents = {
  nonTaxableLaborCents: number;
  nonTaxablePartsCents: number;
  taxableLabor825Cents: number;
  taxableParts825Cents: number;
  cityTax825Cents: number;
  cityPermitsCents: number;
  taxableLabor675Cents: number;
  taxableParts675Cents: number;
  countyTax675Cents: number;
};

function asArray<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function safeNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toCents(value: unknown) {
  return Math.round(safeNumber(value, 0) * 100);
}

function escapeQboQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function lineKind(line: QboInvoiceLine): "labor" | "parts" | "permit" | "unknown" {
  const haystack = normalize(
    `${line.SalesItemLineDetail?.ItemRef?.name || ""} ${line.Description || ""}`,
  );

  if (/\bpermits?\b/.test(haystack)) return "permit";
  if (/\blabor\b|\blabour\b/.test(haystack)) return "labor";
  if (/\bmaterials?\b|\bparts?\b/.test(haystack)) return "parts";

  return "unknown";
}

function taxState(
  line: QboInvoiceLine,
): "taxable" | "non_taxable" | "unknown" {
  const raw = String(line.SalesItemLineDetail?.TaxCodeRef?.value || "")
    .trim()
    .toUpperCase();

  if (!raw) return "unknown";

  if (
    raw === "NON" ||
    raw.includes("NON-TAX") ||
    raw.includes("NONTAX") ||
    raw.includes("EXEMPT")
  ) {
    return "non_taxable";
  }

  return "taxable";
}

function nearestSupportedRateBps(effectiveRateBps: number | null) {
  if (effectiveRateBps == null) return null;

  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of SUPPORTED_TAX_RATES_BPS) {
    const distance = Math.abs(effectiveRateBps - target);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }

  // One-tenth of a percentage point tolerance accounts for penny rounding
  // on small invoices without treating a materially different rate as 8.25/6.75.
  return bestDistance <= 10 ? best : null;
}

function buildSuggestedAllocation(invoice: QboInvoice) {
  const allocation: AllocationCents = {
    nonTaxableLaborCents: 0,
    nonTaxablePartsCents: 0,
    taxableLabor825Cents: 0,
    taxableParts825Cents: 0,
    cityTax825Cents: 0,
    cityPermitsCents: 0,
    taxableLabor675Cents: 0,
    taxableParts675Cents: 0,
    countyTax675Cents: 0,
  };

  const warnings: string[] = [];
  const unknownLines: string[] = [];
  const salesLines = asArray(invoice.Line).filter((line) =>
    normalize(line.DetailType).includes("salesitemlinedetail"),
  );

  const taxableLines = salesLines.filter((line) => taxState(line) === "taxable");
  const taxableBaseCents = taxableLines.reduce(
    (sum, line) => sum + toCents(line.Amount),
    0,
  );
  const totalTaxCents = toCents(invoice.TxnTaxDetail?.TotalTax);

  const effectiveRateBps =
    taxableBaseCents > 0 && totalTaxCents > 0
      ? Math.round((totalTaxCents / taxableBaseCents) * 10000)
      : null;
  const supportedRateBps = nearestSupportedRateBps(effectiveRateBps);

  for (const line of salesLines) {
    const amountCents = toCents(line.Amount);
    if (amountCents === 0) continue;

    const kind = lineKind(line);
    const state = taxState(line);
    const label =
      line.SalesItemLineDetail?.ItemRef?.name ||
      line.Description ||
      `Line ${line.LineNum || line.Id || "?"}`;

    if (kind === "unknown" || state === "unknown") {
      unknownLines.push(String(label));
      continue;
    }

    if (kind === "permit") {
      if (state === "non_taxable") {
        allocation.cityPermitsCents += amountCents;
      } else {
        unknownLines.push(String(label));
      }
      continue;
    }

    if (state === "non_taxable") {
      if (kind === "labor") allocation.nonTaxableLaborCents += amountCents;
      if (kind === "parts") allocation.nonTaxablePartsCents += amountCents;
      continue;
    }

    if (!supportedRateBps) {
      unknownLines.push(String(label));
      continue;
    }

    if (supportedRateBps === 825) {
      if (kind === "labor") allocation.taxableLabor825Cents += amountCents;
      if (kind === "parts") allocation.taxableParts825Cents += amountCents;
    } else if (supportedRateBps === 675) {
      if (kind === "labor") allocation.taxableLabor675Cents += amountCents;
      if (kind === "parts") allocation.taxableParts675Cents += amountCents;
    }
  }

  if (totalTaxCents > 0) {
    if (supportedRateBps === 825) {
      allocation.cityTax825Cents = totalTaxCents;
    } else if (supportedRateBps === 675) {
      allocation.countyTax675Cents = totalTaxCents;
    } else {
      warnings.push(
        `QuickBooks tax rate could not be safely mapped to 8.25% or 6.75%.`,
      );
    }
  }

  if (unknownLines.length > 0) {
    warnings.push(
      `Manual allocation required for: ${Array.from(new Set(unknownLines)).join(", ")}.`,
    );
  }

  const allocationTotalCents = Object.values(allocation).reduce(
    (sum, value) => sum + value,
    0,
  );
  const invoiceTotalCents = toCents(invoice.TotalAmt);
  const differenceCents = invoiceTotalCents - allocationTotalCents;

  if (Math.abs(differenceCents) > 1) {
    warnings.push(
      `Suggested categories do not fully reconcile to the invoice total (${(
        differenceCents / 100
      ).toFixed(2)} difference).`,
    );
  }

  return {
    allocation,
    safeToAutofill:
      unknownLines.length === 0 &&
      Math.abs(differenceCents) <= 1 &&
      (totalTaxCents === 0 || supportedRateBps !== null),
    effectiveRateBps,
    supportedRateBps,
    warnings,
  };
}

function buildInvoiceLineBreakdown(invoice: QboInvoice) {
  return asArray(invoice.Line)
    .filter((line) =>
      normalize(line.DetailType).includes("salesitemlinedetail"),
    )
    .map((line, index) => ({
      lineId: String(line.Id || `${line.LineNum || index + 1}-${index}`),
      lineNumber:
        line.LineNum == null || !Number.isFinite(Number(line.LineNum))
          ? null
          : Number(line.LineNum),
      itemName: String(line.SalesItemLineDetail?.ItemRef?.name || "").trim(),
      description: String(line.Description || "").trim(),
      amountCents: toCents(line.Amount),
      kind: lineKind(line),
      taxState: taxState(line),
      taxCode: String(
        line.SalesItemLineDetail?.TaxCodeRef?.value || "",
      ).trim(),
    }));
}

async function authorizeOfficeUser(req: Request) {
  const header = String(req.headers.get("authorization") || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
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
    const role = String(userSnap.data()?.role || "").trim();

    if (!OFFICE_ROLES.has(role)) {
      return {
        ok: false as const,
        status: 403,
        error: "Sales Tax QuickBooks lookup is limited to office staff.",
      };
    }

    return { ok: true as const, uid: decoded.uid, role };
  } catch {
    return { ok: false as const, status: 401, error: "Sign-in token is invalid." };
  }
}

async function qboQuery(realmId: string, queryString: string) {
  const base = getQboApiBaseUrl();
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(
    queryString,
  )}`;
  return qboFetchWithAutoRefresh(url);
}

export async function GET(req: Request) {
  const authorization = await authorizeOfficeUser(req);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, error: authorization.error },
      { status: authorization.status },
    );
  }

  try {
    const requestUrl = new URL(req.url);
    const docNumber = String(requestUrl.searchParams.get("docNumber") || "").trim();

    if (!docNumber) {
      return NextResponse.json(
        { ok: false, error: "Enter a QuickBooks invoice number." },
        { status: 400 },
      );
    }

    if (docNumber.length > 40) {
      return NextResponse.json(
        { ok: false, error: "Invoice number is too long." },
        { status: 400 },
      );
    }

    const { realmId } = await getQboCookieValues();
    if (!realmId) {
      return NextResponse.json(
        { ok: false, error: "QuickBooks is not connected." },
        { status: 400 },
      );
    }

    const cleanDocNumber = escapeQboQueryValue(docNumber);
    const invoiceQuery = `select * from Invoice where DocNumber = '${cleanDocNumber}' maxresults 10`;
    const invoiceResult = await qboQuery(realmId, invoiceQuery);

    if (!invoiceResult.res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "QuickBooks invoice lookup failed.",
          qboStatus: invoiceResult.res.status,
          intuit_tid: invoiceResult.intuitTid || "",
        },
        { status: 502 },
      );
    }

    const invoices = asArray<QboInvoice>(
      invoiceResult.body?.QueryResponse?.Invoice,
    ).filter((invoice) => String(invoice.DocNumber || "").trim() === docNumber);

    if (invoices.length === 0) {
      return NextResponse.json(
        { ok: false, error: `Invoice #${docNumber} was not found in QuickBooks.` },
        { status: 404 },
      );
    }

    if (invoices.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          error: `QuickBooks returned more than one invoice with #${docNumber}. Open QuickBooks and confirm the invoice number before continuing.`,
          matches: invoices.map((invoice) => ({
            invoiceId: String(invoice.Id || ""),
            docNumber: String(invoice.DocNumber || ""),
            customerName: String(invoice.CustomerRef?.name || ""),
            invoiceDate: String(invoice.TxnDate || ""),
            totalAmountCents: toCents(invoice.TotalAmt),
          })),
        },
        { status: 409 },
      );
    }

    const invoice = invoices[0];
    const invoiceId = String(invoice.Id || "").trim();
    const customerId = String(invoice.CustomerRef?.value || "").trim();
    const warnings: string[] = [];
    const suggested = buildSuggestedAllocation(invoice);
    const invoiceLines = buildInvoiceLineBreakdown(invoice);
    warnings.push(...suggested.warnings);

    const matchingPayments: Array<{
      paymentId: string;
      paymentDate: string;
      reference: string;
      totalPaymentCents: number;
      appliedToInvoiceCents: number;
    }> = [];

    if (customerId && invoiceId) {
      const cleanCustomerId = escapeQboQueryValue(customerId);
      const paymentQuery = `select * from Payment where CustomerRef = '${cleanCustomerId}' maxresults 1000`;
      const paymentResult = await qboQuery(realmId, paymentQuery);

      if (paymentResult.res.ok) {
        const qboPayments = asArray<QboPayment>(
          paymentResult.body?.QueryResponse?.Payment,
        );

        for (const payment of qboPayments) {
          let appliedCents = 0;

          for (const line of asArray(payment.Line)) {
            const links = asArray(line.LinkedTxn);
            const linkedToInvoice = links.some(
              (link) =>
                String(link.TxnId || "").trim() === invoiceId &&
                normalize(link.TxnType) === "invoice",
            );

            if (linkedToInvoice) {
              appliedCents += toCents(line.Amount);
            }
          }

          if (appliedCents > 0) {
            matchingPayments.push({
              paymentId: String(payment.Id || ""),
              paymentDate: String(payment.TxnDate || ""),
              reference: String(payment.PaymentRefNum || ""),
              totalPaymentCents: toCents(payment.TotalAmt),
              appliedToInvoiceCents: appliedCents,
            });
          }
        }

        matchingPayments.sort((a, b) =>
          a.paymentDate.localeCompare(b.paymentDate),
        );
      } else {
        warnings.push(
          "Invoice loaded, but QuickBooks payments could not be queried. Enter the payment details manually.",
        );
      }
    }

    if (matchingPayments.length === 0) {
      warnings.push(
        "No payment linked to this invoice was found in QuickBooks. Invoice details were loaded, but payment date/amount must be entered manually.",
      );
    } else if (matchingPayments.length > 1) {
      warnings.push(
        "More than one QuickBooks payment is linked to this invoice. Select the payment you are entering before reviewing the allocation.",
      );
    }

    const invoiceTotalCents = toCents(invoice.TotalAmt);

    return NextResponse.json({
      ok: true,
      invoice: {
        invoiceId,
        docNumber: String(invoice.DocNumber || docNumber),
        invoiceDate: String(invoice.TxnDate || ""),
        customerId,
        customerName: String(invoice.CustomerRef?.name || ""),
        totalAmountCents: invoiceTotalCents,
        balanceCents: toCents(invoice.Balance),
        totalTaxCents: toCents(invoice.TxnTaxDetail?.TotalTax),
      },
      invoiceLines,
      payments: matchingPayments,
      suggestedAllocation: {
        ...suggested.allocation,
        safeToAutofill: suggested.safeToAutofill,
        effectiveRateBps: suggested.effectiveRateBps,
        supportedRateBps: suggested.supportedRateBps,
      },
      warnings,
      intuit_tid: invoiceResult.intuitTid || "",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "QuickBooks invoice lookup failed.",
      },
      { status: 500 },
    );
  }
}
