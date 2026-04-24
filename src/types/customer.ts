// src/types/customer.ts
export type CustomerSource = "dcflow" | "quickbooks";

export type AddressSource =
  | "manual"
  | "google_places"
  | "qbo_ship"
  | "qbo_bill"
  | "legacy";

export type QuickbooksSyncStatus = "not_linked" | "synced" | "pending" | "error";

export type ServiceAddress = {
  id: string;
  label?: string; // Home, Rental House, Shop, Lake House, etc.

  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;

  notes?: string;
  active: boolean;
  isPrimary?: boolean;

  // Optional source tracking for future QBO/DCFlow sync logic
  source?: AddressSource;

  createdAt?: string;
  updatedAt?: string;
};

export type Customer = {
  id: string;

  // QuickBooks linkage
  quickbooksCustomerId?: string;
  quickbooksSyncStatus?: QuickbooksSyncStatus;
  lastQuickbooksSyncAt?: string;
  quickbooksLastError?: string;

  source: CustomerSource;

  displayName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  email?: string;

  // Billing address (can be PO Box)
  billingAddressLine1: string;
  billingAddressLine2?: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;

  // Optional source tracking for billing address origin
  billingAddressSource?: Exclude<AddressSource, "qbo_ship">;

  // Service addresses
  serviceAddresses?: ServiceAddress[];

  notes?: string;
  active: boolean;

  createdAt?: string;
  updatedAt?: string;
};