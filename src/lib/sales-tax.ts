// src/lib/sales-tax.ts

import type {
  SalesTaxPayment,
  SalesTaxSummary,
  UntaxedPurchase,
} from "../types/sales-tax";

export const DEFAULT_USE_TAX_RATE_BPS = 825;

export function safeInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function dollarsToCents(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  const normalized = String(value ?? "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) return 0;

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: unknown) {
  const n = safeInt(cents);
  return (n / 100).toFixed(2);
}

export function formatCents(cents: unknown) {
  const n = safeInt(cents);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n / 100);
}

export function paymentAllocatedCents(payment: SalesTaxPayment) {
  return (
    safeInt(payment.nonTaxableLaborCents) +
    safeInt(payment.nonTaxablePartsCents) +
    safeInt(payment.taxableLabor825Cents) +
    safeInt(payment.taxableParts825Cents) +
    safeInt(payment.cityTax825Cents) +
    safeInt(payment.cityPermitsCents) +
    safeInt(payment.taxableLabor675Cents) +
    safeInt(payment.taxableParts675Cents) +
    safeInt(payment.countyTax675Cents)
  );
}

export function paymentDifferenceCents(payment: SalesTaxPayment) {
  return safeInt(payment.paymentAmountCents) - paymentAllocatedCents(payment);
}

export function isPaymentBalanced(payment: SalesTaxPayment) {
  return paymentDifferenceCents(payment) === 0;
}

export function calculateTaxCents(amountCents: number, rateBps: number) {
  return Math.round((safeInt(amountCents) * safeInt(rateBps)) / 10000);
}

export function buildSalesTaxSummary(
  payments: SalesTaxPayment[],
  purchases: UntaxedPurchase[],
): SalesTaxSummary {
  const summary: SalesTaxSummary = {
    totalSalesCents: 0,
    taxableSalesCents: 0,

    taxableLabor825Cents: 0,
    taxableParts825Cents: 0,
    cityTaxCollectedCents: 0,

    taxableLabor675Cents: 0,
    taxableParts675Cents: 0,
    countyTaxCollectedCents: 0,

    cityPermitsCents: 0,

    taxablePurchasesCents: 0,
    useTaxOnPurchasesCents: 0,

    cityTaxBaseCents: 0,
    countyTaxBaseCents: 0,

    totalTaxCollectedCents: 0,

    balancedPaymentCount: 0,
    reviewedPaymentCount: 0,
    paymentCount: payments.length,
    verifiedPurchaseCount: 0,
    purchaseCount: purchases.length,

    totalAllocationDifferenceCents: 0,
    unbalancedPaymentCount: 0,
  };

  for (const payment of payments) {
    summary.totalSalesCents += safeInt(payment.paymentAmountCents);

    summary.taxableLabor825Cents += safeInt(payment.taxableLabor825Cents);
    summary.taxableParts825Cents += safeInt(payment.taxableParts825Cents);
    summary.cityTaxCollectedCents += safeInt(payment.cityTax825Cents);

    summary.taxableLabor675Cents += safeInt(payment.taxableLabor675Cents);
    summary.taxableParts675Cents += safeInt(payment.taxableParts675Cents);
    summary.countyTaxCollectedCents += safeInt(payment.countyTax675Cents);

    summary.cityPermitsCents += safeInt(payment.cityPermitsCents);

    const difference = paymentDifferenceCents(payment);
    summary.totalAllocationDifferenceCents += difference;

    if (difference === 0) {
      summary.balancedPaymentCount += 1;
    } else {
      summary.unbalancedPaymentCount += 1;
    }

    if (payment.reviewed) {
      summary.reviewedPaymentCount += 1;
    }
  }

  for (const purchase of purchases) {
    if (purchase.verified) {
      summary.verifiedPurchaseCount += 1;
    }

    if (!purchase.taxable) continue;

    const amount = safeInt(purchase.amountCents);
    summary.taxablePurchasesCents += amount;
    summary.useTaxOnPurchasesCents += calculateTaxCents(
      amount,
      purchase.taxRateBps,
    );
  }

  summary.taxableSalesCents =
    summary.taxableLabor825Cents +
    summary.taxableParts825Cents +
    summary.taxableLabor675Cents +
    summary.taxableParts675Cents;

  // Mirrors the existing spreadsheet treatment:
  // City base = 8.25% taxable labor + 8.25% taxable parts + taxable purchases.
  summary.cityTaxBaseCents =
    summary.taxableLabor825Cents +
    summary.taxableParts825Cents +
    summary.taxablePurchasesCents;

  // County base = all taxable sales + taxable purchases.
  summary.countyTaxBaseCents =
    summary.taxableSalesCents + summary.taxablePurchasesCents;

  summary.totalTaxCollectedCents =
    summary.cityTaxCollectedCents + summary.countyTaxCollectedCents;

  return summary;
}

export function monthLabel(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return periodKey;

  const year = Number(match[1]);
  const month = Number(match[2]);

  const d = new Date(year, month - 1, 1);

  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function todayIsoDateLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function currentPeriodKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function csvCell(value: unknown) {
  const s = String(value ?? "");
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}
