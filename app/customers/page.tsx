"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { Customer } from "../../src/types/customer";

export default function CustomersPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        const q = query(collection(db, "customers"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: Customer[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

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
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load customers.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, []);

  function getDisplayAddress(customer: Customer) {
    const primaryServiceAddress =
      customer.serviceAddresses?.find((addr) => addr.isPrimary) ??
      customer.serviceAddresses?.[0];

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

  return (
    <ProtectedPage fallbackTitle="Customers">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Customers</h1>

          <Link
            href="/customers/new"
            style={{
              padding: "8px 14px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
            }}
          >
            New Customer
          </Link>
        </div>

        {loading ? <p>Loading customers...</p> : null}

        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && customers.length === 0 ? (
          <p>No customers found yet.</p>
        ) : null}

        {!loading && !error && customers.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {customers.map((customer) => {
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
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{customer.displayName}</div>

                  <div
                    style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}
                  >
                    {customer.phonePrimary}
                  </div>

                  <div
                    style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}
                  >
                    {displayAddress.line1}
                  </div>

                  {displayAddress.line2 ? (
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "14px",
                        color: "#555",
                      }}
                    >
                      {displayAddress.line2}
                    </div>
                  ) : null}

                  <div
                    style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}
                  >
                    {displayAddress.city}, {displayAddress.state}{" "}
                    {displayAddress.postalCode}
                  </div>

                  <div
                    style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}
                  >
                    Showing: {displayAddress.sourceLabel}
                  </div>

                  <div
                    style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}
                  >
                    Source: {customer.source}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}