export type CustomerSource = "dcflow" | "quickbooks";

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

  createdAt?: string;
  updatedAt?: string;
};

export type Customer = {
  id: string;

  // Future QuickBooks linkage
  quickbooksCustomerId?: string;
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

  // Future service addresses support
  serviceAddresses?: ServiceAddress[];

  notes?: string;
  active: boolean;

  createdAt?: string;
  updatedAt?: string;
};