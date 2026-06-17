// src/types/material-order.ts

export type MaterialOrderStatus =
  | "draft"
  | "po_created"
  | "ordered"
  | "received"
  | "ready_for_pickup"
  | "picked_up"
  | "ready_to_bill"
  | "invoiced"
  | "cancelled";

export type MaterialOrderBillingStatus =
  | "not_ready"
  | "ready_to_bill"
  | "creating_invoice"
  | "invoice_failed"
  | "invoiced";

export type MaterialOrderLineSource =
  | "manual"
  | "purchase_order"
  | "supplier_invoice";

export type MaterialOrderPickupStatus =
  | "not_ready"
  | "ready_for_pickup"
  | "picked_up";

export type MaterialOrderPickupLocationType =
  | "office_pickup"
  | "customer_site"
  | "other";

export type MaterialOrderPurchaseOrderLink = {
  poNumber: string; // Example: M001A
  supplierName?: string;

  generatedAt?: string;
  generatedByUid?: string;
  generatedByName?: string;

  supplierInvoiceId?: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceMatchedAt?: string;

  totalCost?: number;
};

export type MaterialOrderSupplierInvoice = {
  id?: string;

  poNumber?: string;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;

  subtotal?: number;
  tax?: number;
  freight?: number;
  total?: number;

  storagePath?: string;
  downloadUrl?: string;

  importedAt?: string;
  importedBy?: "system" | "manual";
};

export type MaterialOrderLineItem = {
  id: string;

  source: MaterialOrderLineSource;

  poNumber?: string;
  supplierName?: string;
  supplierInvoiceId?: string;
  supplierInvoiceNumber?: string;

  description: string;

  quantity?: number;
  unitCost?: number;
  totalCost?: number;

  customerUnitPrice?: number;
  customerTotalPrice?: number;

  taxable?: boolean;

  notes?: string;
};

export type MaterialOrderPickup = {
  status: MaterialOrderPickupStatus;

  readyForPickupAt?: string;
  readyForPickupByUid?: string;
  readyForPickupByName?: string;

  pickedUpAt?: string;
  pickedUpByName?: string;

  markedPickedUpByUid?: string;
  markedPickedUpByName?: string;

  pickupNotes?: string;
};

export type MaterialOrderBilling = {
  status: MaterialOrderBillingStatus;

  readyToBillAt?: string;
  readyToBillByUid?: string;
  readyToBillByName?: string;

  qboInvoiceId?: string;
  qboInvoiceNumber?: string;
  qboInvoiceUrl?: string;

  invoicedAt?: string;
  invoiceFailedAt?: string;
  invoiceError?: string;
};

export type MaterialOrder = {
  id: string;

  // Billing party / customer account
  customerId: string;
  customerDisplayName: string;

  // Contact/requester for this specific material order
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;

  // Optional address context only.
  // Many material orders will be picked up from the office and do not need a service address.
  serviceAddressId?: string;
  serviceAddressLabel?: string;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string;
  serviceCity?: string;
  serviceState?: string;
  servicePostalCode?: string;

  // Pickup / delivery context
  pickupLocationType?: MaterialOrderPickupLocationType;
  pickupLocationNotes?: string;

  // Request
  requestSummary: string;
  requestDetails?: string;
  internalNotes?: string;

  // Flow state
  status: MaterialOrderStatus;
  active: boolean;

  // Pickup planning
  targetPickupDate?: string; // YYYY-MM-DD
  pickup: MaterialOrderPickup;

  // PO / supplier invoice / materials
  poNumbers?: string[];
  purchaseOrders?: MaterialOrderPurchaseOrderLink[];
  supplierInvoices?: MaterialOrderSupplierInvoice[];
  lineItems?: MaterialOrderLineItem[];

  // Totals
  supplierCostTotal?: number;
  customerPriceTotal?: number;

  // Billing
  billing: MaterialOrderBilling;

  // Future PO numbering support
  materialOrderCode?: string | null; // Example: M001
  materialOrderNumber?: number | null;
  nextPoIndex?: number;

  // Employee / user tracking
  createdByUid: string;
  createdByName?: string;

  orderedByUid?: string;
  orderedByName?: string;
  orderedAt?: string;

  receivedByUid?: string;
  receivedByName?: string;
  receivedAt?: string;

  updatedByUid?: string;
  updatedByName?: string;

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
};