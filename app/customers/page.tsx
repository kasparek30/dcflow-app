// app/customers/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { Customer } from "../../src/types/customer";

function normalizeSearchText(input: string) {
  return (input || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function digitsOnly(input: string) {
  return String(input || "").replace(/\D/g, "");
}

function buildCustomerSearchBlob(c: Customer) {
  const parts: string[] = [];

  // Name
  parts.push(c.displayName || "");

  // Phones + email
  parts.push(c.phonePrimary || "");
  parts.push(c.phoneSecondary || "");
  parts.push(c.email || "");

  // Billing address
  parts.push(c.billingAddressLine1 || "");
  parts.push(c.billingAddressLine2 || "");
  parts.push(c.billingCity || "");
  parts.push(c.billingState || "");
  parts.push(c.billingPostalCode || "");

  // Service addresses (all)
  if (Array.isArray(c.serviceAddresses)) {
    for (const a of c.serviceAddresses) {
      parts.push(a.label || "");
      parts.push(a.addressLine1 || "");
      parts.push(a.addressLine2 || "");
      parts.push(a.city || "");
      parts.push(a.state || "");
      parts.push(a.postalCode || "");
      parts.push(a.notes || "");
    }
  }

  // Add phone digits-only so "9799667783" matches "(979) 966-7783"
  const phoneDigits = [digitsOnly(c.phonePrimary), digitsOnly(c.phoneSecondary || "")]
    .filter(Boolean)
    .join(" ");

  parts.push(phoneDigits);

  return normalizeSearchText(parts.join(" • "));
}

export default function CustomersPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");

  // Search UI
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ✅ New UX: hide list until searching
  const [hideAllUntilSearch, setHideAllUntilSearch] = useState(true);

  // Tune this if you want results to show immediately on 1 character
  const MIN_CHARS_TO_SEARCH = 2;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    async function loadCustomers() {
      try {
        const q = query(collection(db, "customers"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: Customer[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            id: docSnap.id,
            quickbooksCustomerId: data.quickbooksCustomerId ?? undefined,
            source: data.source ?? "dcflow",
            displayName: data.displayName ?? "",
            phonePrimary: data.phonePrimary ?? "",
            phoneSecondary: data.phoneSecondary ?? undefined,
            email: data.email ?? undefined,
            billingAddressLine1: data.billingAddressLine1 ?? "",
            billingAddressLine2: data.billingAddressLine2 ?? undefined,
            billingCity: data.billingCity ?? "",
            billingState: data.billingState ?? "",
            billingPostalCode: data.billingPostalCode ?? "",
            serviceAddresses: Array.isArray(data.serviceAddresses)
              ? data.serviceAddresses.map((addr: any) => ({
                  id: addr.id ?? crypto.randomUUID(),
                  label: addr.label ?? undefined,
                  addressLine1: addr.addressLine1 ?? "",
                  addressLine2: addr.addressLine2 ?? undefined,
                  city: addr.city ?? "",
                  state: addr.state ?? "",
                  postalCode: addr.postalCode ?? "",
                  notes: addr.notes ?? undefined,
                  active: addr.active ?? true,
                  isPrimary: addr.isPrimary ?? false,
                  createdAt: addr.createdAt ?? undefined,
                  updatedAt: addr.updatedAt ?? undefined,
                }))
              : [],
            notes: data.notes ?? undefined,
            active: data.active ?? true,
          };
        });

        setCustomers(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load customers.");
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, []);

  function getDisplayAddress(customer: Customer) {
    const primaryServiceAddress =
      customer.serviceAddresses?.find((addr) => addr.isPrimary) ?? customer.serviceAddresses?.[0];

    if (primaryServiceAddress) {
      return {
        line1: primaryServiceAddress.addressLine1,
        line2: primaryServiceAddress.addressLine2,
        city: primaryServiceAddress.city,
        state: primaryServiceAddress.state,
        postalCode: primaryServiceAddress.postalCode,
        sourceLabel: "Service Address",
      };
    }

    return {
      line1: customer.billingAddressLine1,
      line2: customer.billingAddressLine2,
      city: customer.billingCity,
      state: customer.billingState,
      postalCode: customer.billingPostalCode,
      sourceLabel: "Billing Address",
    };
  }

  // Precompute search blob per customer
  const customersWithSearch = useMemo(() => {
    return customers.map((c) => ({
      customer: c,
      blob: buildCustomerSearchBlob(c),
    }));
  }, [customers]);

  const normalizedQuery = useMemo(() => normalizeSearchText(debouncedSearch), [debouncedSearch]);
  const queryDigits = useMemo(() => digitsOnly(normalizedQuery), [normalizedQuery]);

  // Should we show any list at all?
  const shouldShowResults = useMemo(() => {
    if (!hideAllUntilSearch) return true; // show full list mode
    return normalizedQuery.length >= MIN_CHARS_TO_SEARCH; // show only after typing
  }, [hideAllUntilSearch, normalizedQuery]);

  const filteredCustomers = useMemo(() => {
    // If "show full list" mode:
    if (!hideAllUntilSearch) {
      if (!normalizedQuery) return customers;

      // Still filter if they type, even in full list mode
      return customersWithSearch
        .filter(({ blob, customer }) => {
          if (blob.includes(normalizedQuery)) return true;
          if (queryDigits && digitsOnly(customer.phonePrimary || "").includes(queryDigits)) return true;
          if (queryDigits && digitsOnly(customer.phoneSecondary || "").includes(queryDigits)) return true;
          return false;
        })
        .map((x) => x.customer);
    }

    // Hide-until-search mode:
    if (normalizedQuery.length < MIN_CHARS_TO_SEARCH) return [];

    const matches = customersWithSearch
      .filter(({ blob, customer }) => {
        if (blob.includes(normalizedQuery)) return true;
        if (queryDigits && digitsOnly(customer.phonePrimary || "").includes(queryDigits)) return true;
        if (queryDigits && digitsOnly(customer.phoneSecondary || "").includes(queryDigits)) return true;
        return false;
      })
      .map((x) => x.customer);

    return matches;
  }, [customers, customersWithSearch, hideAllUntilSearch, normalizedQuery, queryDigits]);

  return (
    <ProtectedPage fallbackTitle="Customers">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Customers</h1>

          <Link
            href="/customers/new"
            style={{
              padding: "8px 14px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              background: "white",
              fontWeight: 800,
            }}
          >
            New Customer
          </Link>
        </div>

        {/* Search + controls */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "12px",
            background: "#fafafa",
            marginBottom: "16px",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#666", fontWeight: 800 }}>
            Search customers (name, address, phone, email)
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Try: "Tofel", "314 S Franklin", "La Grange", "9799667783", "gmail"'
              style={{
                flex: 1,
                minWidth: "260px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #ccc",
                background: "white",
              }}
            />

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Clear
            </button>

            <div style={{ alignSelf: "center", fontSize: "12px", color: "#666" }}>
              {hideAllUntilSearch ? (
                <>
                  Results: <strong>{filteredCustomers.length}</strong>
                  {normalizedQuery.length < MIN_CHARS_TO_SEARCH ? (
                    <span style={{ color: "#999" }}> • Type {MIN_CHARS_TO_SEARCH}+ chars</span>
                  ) : null}
                </>
              ) : (
                <>
                  Showing <strong>{filteredCustomers.length}</strong> of <strong>{customers.length}</strong>
                </>
              )}
            </div>
          </div>

          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", color: "#444" }}>
            <input
              type="checkbox"
              checked={hideAllUntilSearch}
              onChange={(e) => setHideAllUntilSearch(e.target.checked)}
            />
            Hide all customers until I start searching (recommended)
          </label>
        </div>

        {loading ? <p>Loading customers...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && customers.length === 0 ? <p>No customers found yet.</p> : null}

        {!loading && !error && customers.length > 0 ? (
          !shouldShowResults ? (
            <div
              style={{
                border: "1px dashed #ccc",
                borderRadius: "12px",
                padding: "12px",
                background: "white",
                color: "#666",
              }}
            >
              Start typing in the search box to find a customer. (Name, address, phone, or email)
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div
              style={{
                border: "1px dashed #ccc",
                borderRadius: "12px",
                padding: "12px",
                background: "white",
                color: "#666",
              }}
            >
              No customers match your search.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {filteredCustomers.map((customer) => {
                const displayAddress = getDisplayAddress(customer);

                return (
                  <Link
                    key={customer.id}
                    href={`/customers/${customer.id}`}
                    style={{
                      display: "block",
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "12px",
                      textDecoration: "none",
                      color: "inherit",
                      background: "white",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{customer.displayName}</div>

                    <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                      {customer.phonePrimary || "—"}
                      {customer.email ? <span style={{ color: "#777" }}> • {customer.email}</span> : null}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "14px", color: "#555" }}>{displayAddress.line1}</div>

                    {displayAddress.line2 ? (
                      <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>{displayAddress.line2}</div>
                    ) : null}

                    <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                      {displayAddress.city}, {displayAddress.state} {displayAddress.postalCode}
                    </div>

                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                      Showing: {displayAddress.sourceLabel}
                    </div>

                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                      Source: {customer.source}
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}