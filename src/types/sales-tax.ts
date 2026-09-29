// src/types/sales-tax.ts

export type SalesTaxPeriodStatus = "open" | "filed";

export type SalesTaxPeriod = {
  id: string;
  periodKey: string; // YYYY-MM
  year: number;
  month: number;
  status: SalesTaxPeriodStatus;
  useTaxRateBps: number; // 825 = 8.25%

  createdAt?: string | null;
  createdByUid?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedByUid?: string | null;
  updatedByName?: string | null;

  filedAt?: string | null;
  filedByUid?: string | null;
  filedByName?: string | null;
  filingConfirmation?: string | null;
  filingNotes?: string | null;
};

export type SalesTaxPayment = {
  id: string;
  paymentDate: string; // YYYY-MM-DD
  customerName: string;
  customerId?: string | null;
  reference?: string | null;

  // Optional QBO audit trail when a payment row was prefilled by invoice lookup.
  invoiceNumber?: string | null;
  qboInvoiceId?: string | null;
  qboPaymentId?: string | null;
  source?: "manual" | "qbo_invoice_prefill";

  paymentAmountCents: number;

  nonTaxableLaborCents: number;
  nonTaxablePartsCents: number;

  taxableLabor825Cents: number;
  taxableParts825Cents: number;
  cityTax825Cents: number;

  cityPermitsCents: number;

  taxableLabor675Cents: number;
  taxableParts675Cents: number;
  countyTax675Cents: number;

  reviewed: boolean;
  notes?: string | null;

  createdAt?: string | null;
  createdByUid?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedByUid?: string | null;
  updatedByName?: string | null;
};

export type UntaxedPurchase = {
  id: string;
  purchaseDate: string; // YYYY-MM-DD
  vendor: string;
  item: string;
  amountCents: number;

  taxable: boolean;
  taxRateBps: number;
  verified: boolean;

  reference?: string | null;
  notes?: string | null;

  createdAt?: string | null;
  createdByUid?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedByUid?: string | null;
  updatedByName?: string | null;
};

export type SalesTaxSummary = {
  totalSalesCents: number;
  taxableSalesCents: number;

  taxableLabor825Cents: number;
  taxableParts825Cents: number;
  cityTaxCollectedCents: number;

  taxableLabor675Cents: number;
  taxableParts675Cents: number;
  countyTaxCollectedCents: number;

  cityPermitsCents: number;

  taxablePurchasesCents: number;
  useTaxOnPurchasesCents: number;

  cityTaxBaseCents: number;
  countyTaxBaseCents: number;

  totalTaxCollectedCents: number;

  balancedPaymentCount: number;
  reviewedPaymentCount: number;
  paymentCount: number;
  verifiedPurchaseCount: number;
  purchaseCount: number;

  totalAllocationDifferenceCents: number;
  unbalancedPaymentCount: number;
};
