// src/lib/customer-search-index.ts

export type CustomerIndexServiceAddress = {
  id?: string | null;
  label?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  active?: boolean | null;
  isPrimary?: boolean | null;
  source?: string | null;
};

export type CustomerIndexInput = {
  displayName?: string | null;
  customerDisplayName?: string | null;
  qboDisplayName?: string | null;
  phonePrimary?: string | null;
  phone?: string | null;
  phoneSecondary?: string | null;
  email?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billAddrLine1?: string | null;
  billAddrLine2?: string | null;
  billAddrLine3?: string | null;
  billAddrCity?: string | null;
  billAddrState?: string | null;
  billAddrPostalCode?: string | null;
  quickbooksCustomerId?: string | null;
  qboCustomerId?: string | null;
  active?: boolean | null;
  serviceAddresses?: CustomerIndexServiceAddress[] | null;
};

function safeStr(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeCustomerSearchValue(value: unknown) {
  return safeStr(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function customerDigitsOnly(value: unknown) {
  return safeStr(value).replace(/\D/g, "");
}

function unique(values: string[], max = 250) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const clean = normalizeCustomerSearchValue(value);
    if (!clean) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= max) break;
  }

  return out;
}

function tokenize(values: Array<unknown>, max = 250) {
  const tokens: string[] = [];

  for (const value of values) {
    const normalized = normalizeCustomerSearchValue(value);
    if (!normalized) continue;

    tokens.push(normalized);
    tokens.push(...normalized.split(" ").filter((token) => token.length >= 2));
  }

  return unique(tokens, max);
}

function buildPrefixesForToken(token: string) {
  const normalized = normalizeCustomerSearchValue(token).replace(/\s+/g, "");
  const prefixes: string[] = [];

  if (!normalized || normalized.length < 2) return prefixes;

  const maxLength = Math.min(normalized.length, 24);

  for (let i = 2; i <= maxLength; i += 1) {
    prefixes.push(normalized.slice(0, i));
  }

  return prefixes;
}

function buildPrefixes(values: Array<unknown>, max = 250) {
  const prefixes: string[] = [];
  const tokens = tokenize(values, max);

  for (const token of tokens) {
    prefixes.push(...buildPrefixesForToken(token));
  }

  return unique(prefixes, max);
}

export function looksLikePoBox(value?: string | null) {
  const normalized = normalizeCustomerSearchValue(value);
  if (!normalized) return false;

  return (
    /\bp\s*\.?\s*o\s*\.?\s*box\b/i.test(normalized) ||
    /\bpost\s+office\s+box\b/i.test(normalized) ||
    /\bpo\s+box\b/i.test(normalized)
  );
}

function serviceAddressLooksBillingLike(addr: CustomerIndexServiceAddress) {
  const source = normalizeCustomerSearchValue(addr.source);
  const label = normalizeCustomerSearchValue(addr.label);
  const notes = normalizeCustomerSearchValue(addr.notes);

  return (
    source === "qbo_bill" ||
    source === "billing" ||
    source === "mailing" ||
    label.includes("billing") ||
    label.includes("mailing") ||
    notes.includes("billing address") ||
    notes.includes("mailing address")
  );
}

export function isUsableCustomerServiceAddress(addr: CustomerIndexServiceAddress) {
  if (!addr) return false;
  if (addr.active === false) return false;
  if (serviceAddressLooksBillingLike(addr)) return false;

  const line1 = safeStr(addr.addressLine1);
  if (!line1) return false;

  const fullAddress = [
    addr.addressLine1,
    addr.addressLine2,
    addr.city,
    addr.state,
    addr.postalCode,
  ]
    .map((value) => safeStr(value))
    .filter(Boolean)
    .join(" ");

  return !looksLikePoBox(fullAddress);
}

function getBillingValues(customer: CustomerIndexInput) {
  return {
    billingAddressLine1: safeStr(customer.billingAddressLine1) || safeStr(customer.billAddrLine1),
    billingAddressLine2:
      safeStr(customer.billingAddressLine2) ||
      safeStr(customer.billAddrLine2) ||
      safeStr(customer.billAddrLine3),
    billingCity: safeStr(customer.billingCity) || safeStr(customer.billAddrCity),
    billingState: safeStr(customer.billingState) || safeStr(customer.billAddrState),
    billingPostalCode:
      safeStr(customer.billingPostalCode) || safeStr(customer.billAddrPostalCode),
  };
}

function getNameValues(customer: CustomerIndexInput) {
  const displayName =
    safeStr(customer.displayName) ||
    safeStr(customer.customerDisplayName) ||
    safeStr(customer.qboDisplayName);

  return {
    displayName,
    customerDisplayName: safeStr(customer.customerDisplayName) || displayName,
    qboDisplayName: safeStr(customer.qboDisplayName),
  };
}

function getPhoneTokens(customer: CustomerIndexInput) {
  const primary = customerDigitsOnly(customer.phonePrimary || customer.phone);
  const secondary = customerDigitsOnly(customer.phoneSecondary);
  const values = [primary, secondary].filter(Boolean);
  const tokens: string[] = [];

  for (const value of values) {
    tokens.push(value);
    if (value.length >= 7) tokens.push(value.slice(-7));
    if (value.length >= 4) tokens.push(value.slice(-4));
  }

  return unique(tokens, 50);
}

export function buildCustomerIndexPayload(customer: CustomerIndexInput) {
  const names = getNameValues(customer);
  const billing = getBillingValues(customer);
  const serviceAddresses = Array.isArray(customer.serviceAddresses)
    ? customer.serviceAddresses
    : [];

  const usableServiceAddresses = serviceAddresses.filter(isUsableCustomerServiceAddress);
  const activeServiceAddressCount = usableServiceAddresses.length;
  const hasServiceAddress = activeServiceAddressCount > 0;
  const isActive = customer.active !== false;
  const billingAddressText = [
    billing.billingAddressLine1,
    billing.billingAddressLine2,
    billing.billingCity,
    billing.billingState,
    billing.billingPostalCode,
  ]
    .filter(Boolean)
    .join(" ");
  const hasBillingAddress = Boolean(normalizeCustomerSearchValue(billingAddressText));
  const qboLinked = Boolean(safeStr(customer.quickbooksCustomerId) || safeStr(customer.qboCustomerId));

  const serviceAddressValues = usableServiceAddresses.flatMap((addr) => [
    addr.label,
    addr.addressLine1,
    addr.addressLine2,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.notes,
  ]);

  const nameValues = [names.displayName, names.customerDisplayName, names.qboDisplayName];
  const phoneValues = [customer.phonePrimary, customer.phone, customer.phoneSecondary];
  const emailValues = [customer.email];
  const billingValues = [
    billing.billingAddressLine1,
    billing.billingAddressLine2,
    billing.billingCity,
    billing.billingState,
    billing.billingPostalCode,
  ];

  const customerSearchTokens = tokenize(nameValues);
  const nameSearchTokens = customerSearchTokens;
  const emailSearchTokens = tokenize(emailValues);
  const billingAddressSearchTokens = tokenize(billingValues);
  const serviceAddressSearchTokens = tokenize(serviceAddressValues);
  const phoneSearchTokens = getPhoneTokens(customer);

  const searchTokens = unique(
    [
      ...customerSearchTokens,
      ...emailSearchTokens,
      ...billingAddressSearchTokens,
      ...serviceAddressSearchTokens,
      ...phoneSearchTokens,
    ],
    500,
  );

  const customerSearchPrefixes = buildPrefixes(nameValues);
  const billingAddressSearchPrefixes = buildPrefixes(billingValues);
  const serviceAddressSearchPrefixes = buildPrefixes(serviceAddressValues);
  const searchPrefixes = unique(
    [
      ...customerSearchPrefixes,
      ...billingAddressSearchPrefixes,
      ...serviceAddressSearchPrefixes,
      ...buildPrefixes(emailValues),
    ],
    500,
  );

  const phoneDigits = customerDigitsOnly(customer.phonePrimary || customer.phone || customer.phoneSecondary);

  return {
    displayNameLower: normalizeCustomerSearchValue(names.displayName),
    customerDisplayNameLower: normalizeCustomerSearchValue(names.customerDisplayName),
    qboDisplayNameLower: normalizeCustomerSearchValue(names.qboDisplayName),
    emailLower: normalizeCustomerSearchValue(customer.email),
    billingAddressLine1Lower: normalizeCustomerSearchValue(billing.billingAddressLine1),
    billingCityLower: normalizeCustomerSearchValue(billing.billingCity),
    phoneDigits,

    searchTokens,
    customerSearchTokens,
    nameSearchTokens,
    billingAddressSearchTokens,
    serviceAddressSearchTokens,
    emailSearchTokens,
    phoneSearchTokens,

    searchPrefixes,
    customerSearchPrefixes,
    billingAddressSearchPrefixes,
    serviceAddressSearchPrefixes,

    activeServiceAddressCount,
    serviceAddressCount: activeServiceAddressCount,
    serviceLocationCount: activeServiceAddressCount,
    hasServiceAddress,
    hasServiceLocation: hasServiceAddress,
    needsServiceAddress: isActive && !hasServiceAddress,
    billingOnly: isActive && !hasServiceAddress && hasBillingAddress,
    isMultiProperty: activeServiceAddressCount > 1,
    qboLinked,
    customerIndexUpdatedAt: new Date().toISOString(),
  };
}
