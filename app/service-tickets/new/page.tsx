"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceAddress } from "../../../src/types/customer";

type CustomerOption = {
  id: string;
  displayName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  email?: string;
  billingAddressLine1: string;
  billingAddressLine2?: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  serviceAddresses: ServiceAddress[];
};

function getCustomerSearchText(customer: CustomerOption) {
  return [
    customer.displayName,
    customer.phonePrimary,
    customer.phoneSecondary,
    customer.email,
    customer.billingAddressLine1,
    customer.billingAddressLine2,
    customer.billingCity,
    customer.billingState,
    customer.billingPostalCode,
    ...customer.serviceAddresses.flatMap((addr) => [
      addr.label,
      addr.addressLine1,
      addr.addressLine2,
      addr.city,
      addr.state,
      addr.postalCode,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function NewServiceTicketPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [customersLoading, setCustomersLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersError, setCustomersError] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedServiceAddressId, setSelectedServiceAddressId] = useState("");

  const [issueSummary, setIssueSummary] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [status, setStatus] = useState<
    "new" | "scheduled" | "in_progress" | "follow_up" | "completed" | "cancelled"
  >("new");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("60");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        const snap = await getDocs(collection(db, "customers"));

        const items: CustomerOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
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
          };
        });

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setCustomers(items);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setCustomersError(err.message);
        } else {
          setCustomersError("Failed to load customers.");
        }
      } finally {
        setCustomersLoading(false);
      }
    }

    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!search) {
      return customers.slice(0, 12);
    }

    return customers
      .filter((customer) => getCustomerSearchText(customer).includes(search))
      .slice(0, 20);
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const availableServiceAddresses = useMemo(() => {
    if (!selectedCustomer) return [];

    const activeAddresses = selectedCustomer.serviceAddresses.filter(
      (addr) => addr.active
    );

    if (activeAddresses.length === 0) {
      return [
        {
          id: "billing-fallback",
          label: "Billing Address",
          addressLine1: selectedCustomer.billingAddressLine1,
          addressLine2: selectedCustomer.billingAddressLine2,
          city: selectedCustomer.billingCity,
          state: selectedCustomer.billingState,
          postalCode: selectedCustomer.billingPostalCode,
          active: true,
          isPrimary: true,
        },
      ];
    }

    const sorted = [...activeAddresses].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return 0;
    });

    return sorted;
  }, [selectedCustomer]);

  useEffect(() => {
    if (availableServiceAddresses.length > 0) {
      setSelectedServiceAddressId(availableServiceAddresses[0].id);
    } else {
      setSelectedServiceAddressId("");
    }
  }, [availableServiceAddresses]);

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setError("");
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomerId("");
    setSelectedServiceAddressId("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedCustomer) {
      setError("Please search for and select a customer.");
      return;
    }

    const chosenAddress =
      availableServiceAddresses.find((addr) => addr.id === selectedServiceAddressId) ??
      availableServiceAddresses[0];

    if (!chosenAddress) {
      setError("Please select a service address.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const docRef = await addDoc(collection(db, "serviceTickets"), {
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

        serviceAddressId:
          chosenAddress.id === "billing-fallback" ? null : chosenAddress.id,
        serviceAddressLabel: chosenAddress.label ?? null,
        serviceAddressLine1: chosenAddress.addressLine1,
        serviceAddressLine2: chosenAddress.addressLine2 ?? null,
        serviceCity: chosenAddress.city,
        serviceState: chosenAddress.state,
        servicePostalCode: chosenAddress.postalCode,

        issueSummary: issueSummary.trim(),
        issueDetails: issueDetails.trim() || null,

        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),

        scheduledDate: scheduledDate || null,
        scheduledStartTime: scheduledStartTime || null,
        scheduledEndTime: scheduledEndTime || null,

        assignedTechnicianId: null,
        assignedTechnicianName: null,

        internalNotes: internalNotes.trim() || null,

        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      router.push(`/service-tickets/${docRef.id}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create service ticket.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Service Ticket">
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>
          New Service Ticket
        </h1>

        {customersLoading ? <p>Loading customers...</p> : null}
        {customersError ? <p style={{ color: "red" }}>{customersError}</p> : null}

        {!customersLoading && !customersError ? (
          <form
            onSubmit={handleSubmit}
            style={{ display: "grid", gap: "12px", maxWidth: "900px" }}
          >
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginTop: 0,
                  marginBottom: "12px",
                }}
              >
                Customer Lookup
              </h2>

              <div>
                <label>Search Customer</label>
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search by name, phone, email, address..."
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                />
              </div>

              {selectedCustomer ? (
                <div
                  style={{
                    marginTop: "12px",
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: "12px",
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{selectedCustomer.displayName}</div>
                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "13px",
                          color: "#555",
                        }}
                      >
                        {selectedCustomer.phonePrimary || "No phone"}
                      </div>
                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "13px",
                          color: "#555",
                        }}
                      >
                        {selectedCustomer.billingAddressLine1}
                      </div>
                      <div
                        style={{
                          marginTop: "4px",
                          fontSize: "13px",
                          color: "#555",
                        }}
                      >
                        {selectedCustomer.billingCity}, {selectedCustomer.billingState}{" "}
                        {selectedCustomer.billingPostalCode}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearSelectedCustomer}
                      style={{
                        padding: "8px 12px",
                        border: "1px solid #ccc",
                        borderRadius: "10px",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      Change Customer
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: "12px",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {filteredCustomers.length === 0 ? (
                    <div
                      style={{
                        border: "1px dashed #ccc",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "white",
                        color: "#666",
                        fontSize: "13px",
                      }}
                    >
                      No matching customers found.
                    </div>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => handleSelectCustomer(customer.id)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          border: "1px solid #ddd",
                          borderRadius: "10px",
                          padding: "10px",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{customer.displayName}</div>
                        <div
                          style={{
                            marginTop: "4px",
                            fontSize: "13px",
                            color: "#555",
                          }}
                        >
                          {customer.phonePrimary || "No phone"}
                        </div>
                        <div
                          style={{
                            marginTop: "4px",
                            fontSize: "13px",
                            color: "#555",
                          }}
                        >
                          {customer.billingAddressLine1}
                        </div>
                        <div
                          style={{
                            marginTop: "4px",
                            fontSize: "13px",
                            color: "#555",
                          }}
                        >
                          {customer.billingCity}, {customer.billingState}{" "}
                          {customer.billingPostalCode}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label>Service Address</label>
              <select
                value={selectedServiceAddressId}
                onChange={(e) => setSelectedServiceAddressId(e.target.value)}
                required
                disabled={!selectedCustomer}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              >
                <option value="">
                  {selectedCustomer
                    ? "Select a service address"
                    : "Select a customer first"}
                </option>
                {availableServiceAddresses.map((addr) => (
                  <option key={addr.id} value={addr.id}>
                    {addr.label ? `${addr.label} - ` : ""}
                    {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
                    {addr.isPrimary ? " (Primary)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Issue Summary</label>
              <input
                value={issueSummary}
                onChange={(e) => setIssueSummary(e.target.value)}
                required
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              />
            </div>

            <div>
              <label>Issue Details</label>
              <textarea
                value={issueDetails}
                onChange={(e) => setIssueDetails(e.target.value)}
                rows={4}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              />
            </div>

            <div>
              <label>Status</label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target.value as
                      | "new"
                      | "scheduled"
                      | "in_progress"
                      | "follow_up"
                      | "completed"
                      | "cancelled"
                  )
                }
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              >
                <option value="new">New</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="follow_up">Follow Up</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label>Estimated Job Duration (minutes)</label>
              <input
                type="number"
                min="1"
                value={estimatedDurationMinutes}
                onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
                required
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              />
            </div>

            <div>
              <label>Scheduled Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              />
            </div>

            <div>
              <label>Scheduled Start Time</label>
              <input
                type="time"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              />
            </div>

            <div>
              <label>Scheduled End Time</label>
              <input
                type="time"
                value={scheduledEndTime}
                onChange={(e) => setScheduledEndTime(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              />
            </div>

            <div>
              <label>Internal Notes</label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={3}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              />
            </div>

            {error ? <p style={{ color: "red" }}>{error}</p> : null}

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 16px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
                fontWeight: 600,
                width: "fit-content",
              }}
            >
              {saving ? "Saving..." : "Create Service Ticket"}
            </button>
          </form>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}