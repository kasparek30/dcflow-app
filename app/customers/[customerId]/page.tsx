"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { Customer } from "../../../src/types/customer";

type CustomerDetailPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

type CallLogItem = {
  id: string;
  customerId: string;
  ticketId?: string;
  callType:
    | "new_information"
    | "status_check"
    | "reschedule"
    | "billing"
    | "general";
  direction: "inbound" | "outbound";
  summary: string;
  details?: string;
  visibleToTech: boolean;
  updatesTicketNotes: boolean;
  followUpNeeded: boolean;
  followUpNote?: string;
  status: "logged";
  callOccurredAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type AddressChoice = {
  key: string; // "service:<id>" or "billing"
  label: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  source: "service" | "billing";
  isPrimary?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { appUser } = useAuthContext();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState("");

  const [savingAddress, setSavingAddress] = useState(false);
  const [serviceAddressError, setServiceAddressError] = useState("");

  const [serviceLabel, setServiceLabel] = useState("");
  const [serviceAddressLine1, setServiceAddressLine1] = useState("");
  const [serviceAddressLine2, setServiceAddressLine2] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [serviceState, setServiceState] = useState("");
  const [servicePostalCode, setServicePostalCode] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceIsPrimary, setServiceIsPrimary] = useState(false);

  const [callLogsLoading, setCallLogsLoading] = useState(true);
  const [callLogs, setCallLogs] = useState<CallLogItem[]>([]);
  const [callLogError, setCallLogError] = useState("");

  const [savingCallLog, setSavingCallLog] = useState(false);
  const [newCallLogError, setNewCallLogError] = useState("");

  const [callType, setCallType] = useState<
    "new_information" | "status_check" | "reschedule" | "billing" | "general"
  >("new_information");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [callSummary, setCallSummary] = useState("");
  const [callDetails, setCallDetails] = useState("");
  const [visibleToTech, setVisibleToTech] = useState(false);
  const [updatesTicketNotes, setUpdatesTicketNotes] = useState(false);
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");

  // ✅ New Service Ticket state
  const canCreateTicket =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [issueSummary, setIssueSummary] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("60");
  const [selectedAddressKey, setSelectedAddressKey] = useState("");

  useEffect(() => {
    async function loadCustomer() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.customerId;
        setCustomerId(id);

        const customerRef = doc(db, "customers", id);
        const snap = await getDoc(customerRef);

        if (!snap.exists()) {
          setError("Customer not found.");
          setLoading(false);
          return;
        }

        const data = snap.data();

        const item: Customer = {
          id: snap.id,
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

        setCustomer(item);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load customer.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadCustomer();
  }, [params]);

  useEffect(() => {
    async function loadCallLogs() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.customerId;

        const q = query(collection(db, "callLogs"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const items: CallLogItem[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data();

            return {
              id: docSnap.id,
              customerId: data.customerId ?? "",
              ticketId: data.ticketId ?? undefined,
              callType: data.callType ?? "general",
              direction: data.direction ?? "inbound",
              summary: data.summary ?? "",
              details: data.details ?? undefined,
              visibleToTech: data.visibleToTech ?? false,
              updatesTicketNotes: data.updatesTicketNotes ?? false,
              followUpNeeded: data.followUpNeeded ?? false,
              followUpNote: data.followUpNote ?? undefined,
              status: "logged" as const,
              callOccurredAt: data.callOccurredAt ?? undefined,
              createdAt: data.createdAt ?? undefined,
              updatedAt: data.updatedAt ?? undefined,
            };
          })
          .filter((item) => item.customerId === id);

        setCallLogs(items);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setCallLogError(err.message);
        } else {
          setCallLogError("Failed to load call logs.");
        }
      } finally {
        setCallLogsLoading(false);
      }
    }

    loadCallLogs();
  }, [params]);

  const addressChoices = useMemo((): AddressChoice[] => {
    if (!customer) return [];

    const services =
      (customer.serviceAddresses || [])
        .filter((a) => a.active !== false)
        .map((a) => ({
          key: `service:${a.id}`,
          label: `${a.label || "Service Address"}${a.isPrimary ? " (Primary)" : ""}`,
          addressLine1: a.addressLine1 || "",
          addressLine2: a.addressLine2 || undefined,
          city: a.city || "",
          state: a.state || "",
          postalCode: a.postalCode || "",
          source: "service" as const,
          isPrimary: Boolean(a.isPrimary),
        })) || [];

    services.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.label.localeCompare(b.label));

    const billing: AddressChoice = {
      key: "billing",
      label: "Billing Address",
      addressLine1: customer.billingAddressLine1 || "",
      addressLine2: customer.billingAddressLine2 || undefined,
      city: customer.billingCity || "",
      state: customer.billingState || "",
      postalCode: customer.billingPostalCode || "",
      source: "billing",
    };

    return [...services, billing];
  }, [customer]);

  // choose default address on load
  useEffect(() => {
    if (!selectedAddressKey && addressChoices.length) {
      const primary = addressChoices.find((a) => a.source === "service" && a.isPrimary);
      setSelectedAddressKey(primary?.key || addressChoices[0].key);
    }
  }, [addressChoices, selectedAddressKey]);

  function getAddressFromKey(key: string): AddressChoice | null {
    return addressChoices.find((a) => a.key === key) || null;
  }

  async function handleAddServiceAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!customer) return;

    setServiceAddressError("");
    setSavingAddress(true);

    try {
      const nextAddressForState = {
        id: crypto.randomUUID(),
        label: serviceLabel.trim() || undefined,
        addressLine1: serviceAddressLine1.trim(),
        addressLine2: serviceAddressLine2.trim() || undefined,
        city: serviceCity.trim(),
        state: serviceState.trim(),
        postalCode: servicePostalCode.trim(),
        notes: serviceNotes.trim() || undefined,
        active: true,
        isPrimary: serviceIsPrimary,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      let existingAddressesForState = customer.serviceAddresses ?? [];

      if (serviceIsPrimary) {
        existingAddressesForState = existingAddressesForState.map((addr) => ({
          ...addr,
          isPrimary: false,
        }));
      }

      const updatedAddressesForState = [...existingAddressesForState, nextAddressForState];

      const updatedAddressesForFirestore = updatedAddressesForState.map((addr) => ({
        ...addr,
        label: addr.label ?? null,
        addressLine2: addr.addressLine2 ?? null,
        notes: addr.notes ?? null,
      }));

      await updateDoc(doc(db, "customers", customer.id), {
        serviceAddresses: updatedAddressesForFirestore,
        updatedAt: nowIso(),
      });

      setCustomer({
        ...customer,
        serviceAddresses: updatedAddressesForState,
      });

      setServiceLabel("");
      setServiceAddressLine1("");
      setServiceAddressLine2("");
      setServiceCity("");
      setServiceState("");
      setServicePostalCode("");
      setServiceNotes("");
      setServiceIsPrimary(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServiceAddressError(err.message);
      } else {
        setServiceAddressError("Failed to add service address.");
      }
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleAddCallLog(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!customer) return;

    setNewCallLogError("");
    setSavingCallLog(true);

    try {
      const now = nowIso();

      const docRef = await addDoc(collection(db, "callLogs"), {
        customerId: customer.id,
        ticketId: null,
        callType,
        direction,
        summary: callSummary.trim(),
        details: callDetails.trim() || null,
        visibleToTech,
        updatesTicketNotes,
        followUpNeeded,
        followUpNote: followUpNote.trim() || null,
        status: "logged",
        callOccurredAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const newItem: CallLogItem = {
        id: docRef.id,
        customerId: customer.id,
        ticketId: undefined,
        callType,
        direction,
        summary: callSummary.trim(),
        details: callDetails.trim() || undefined,
        visibleToTech,
        updatesTicketNotes,
        followUpNeeded,
        followUpNote: followUpNote.trim() || undefined,
        status: "logged",
        callOccurredAt: now,
        createdAt: now,
        updatedAt: now,
      };

      setCallLogs((prev) => [newItem, ...prev]);

      setCallType("new_information");
      setDirection("inbound");
      setCallSummary("");
      setCallDetails("");
      setVisibleToTech(false);
      setUpdatesTicketNotes(false);
      setFollowUpNeeded(false);
      setFollowUpNote("");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setNewCallLogError(err.message);
      } else {
        setNewCallLogError("Failed to save call log.");
      }
    } finally {
      setSavingCallLog(false);
    }
  }

  // ✅ Create Service Ticket from customer
  async function handleCreateServiceTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customer) return;
    if (!canCreateTicket) {
      setTicketError("You do not have permission to create service tickets.");
      return;
    }

    setTicketError("");
    setTicketSaving(true);

    try {
      const now = nowIso();

      const sum = issueSummary.trim();
      if (!sum) {
        setTicketError("Issue Summary is required.");
        return;
      }

      const addr = getAddressFromKey(selectedAddressKey);
      if (!addr) {
        setTicketError("Please choose a service/billing address.");
        return;
      }

      const minutes = Math.max(1, Number(estimatedDurationMinutes || "60"));

      // If they selected a specific service address, try to store serviceAddressId
      const serviceAddressId =
        addr.source === "service" ? addr.key.replace("service:", "") : null;

      const payload = {
        customerId: customer.id,
        customerDisplayName: customer.displayName || "",

        // Address snapshot on ticket (so tech always sees it even if customer changes later)
        serviceAddressId: serviceAddressId,
        serviceAddressLabel: addr.source === "service" ? addr.label : "Billing Address",
        serviceAddressLine1: addr.addressLine1 || "",
        serviceAddressLine2: addr.addressLine2 || null,
        serviceCity: addr.city || "",
        serviceState: addr.state || "",
        servicePostalCode: addr.postalCode || "",

        issueSummary: sum,
        issueDetails: issueDetails.trim() || null,

        status: "new",
        estimatedDurationMinutes: minutes,

        // staffing defaults
        assignedTechnicianId: null,
        assignedTechnicianName: null,
        primaryTechnicianId: null,
        secondaryTechnicianId: null,
        secondaryTechnicianName: null,
        helperIds: null,
        helperNames: null,
        assignedTechnicianIds: null,

        internalNotes: null,
        active: true,

        createdAt: now,
        updatedAt: now,
      };

      const created = await addDoc(collection(db, "serviceTickets"), payload);

      // redirect to the ticket
      router.push(`/service-tickets/${created.id}`);
    } catch (err: unknown) {
      setTicketError(err instanceof Error ? err.message : "Failed to create service ticket.");
    } finally {
      setTicketSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Customer Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading customer...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && customer ? (
          <div style={{ display: "grid", gap: "18px" }}>
            <div>
              <h1 style={{ fontSize: "24px", fontWeight: 700 }}>
                {customer.displayName}
              </h1>
              <p style={{ marginTop: "6px", color: "#666" }}>
                Customer ID: {customerId}
              </p>
            </div>

            {/* ✅ Create Service Ticket */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "10px" }}>
                Create Service Ticket
              </h2>

              {!canCreateTicket ? (
                <div style={{ fontSize: 13, color: "#777" }}>
                  Only Admin / Dispatcher / Manager can create service tickets.
                </div>
              ) : (
                <form
                  onSubmit={handleCreateServiceTicket}
                  style={{ display: "grid", gap: "10px", maxWidth: "900px" }}
                >
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr" }}>
                    <div>
                      <label style={{ fontWeight: 700 }}>Issue Summary</label>
                      <input
                        value={issueSummary}
                        onChange={(e) => setIssueSummary(e.target.value)}
                        required
                        placeholder='Example: "Clogged kitchen sink" or "No hot water"'
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px",
                          marginTop: "6px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 700 }}>Estimated Duration (minutes)</label>
                      <input
                        type="number"
                        min={1}
                        value={estimatedDurationMinutes}
                        onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px",
                          marginTop: "6px",
                          borderRadius: "10px",
                          border: "1px solid #ccc",
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontWeight: 700 }}>Issue Details (optional)</label>
                    <textarea
                      value={issueDetails}
                      onChange={(e) => setIssueDetails(e.target.value)}
                      rows={3}
                      placeholder="Anything helpful for dispatch/tech…"
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px",
                        marginTop: "6px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontWeight: 700 }}>Address for this ticket</label>
                    <select
                      value={selectedAddressKey}
                      onChange={(e) => setSelectedAddressKey(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px",
                        marginTop: "6px",
                        borderRadius: "10px",
                        border: "1px solid #ccc",
                      }}
                    >
                      {addressChoices.length === 0 ? (
                        <option value="">No addresses found</option>
                      ) : (
                        addressChoices.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label} — {a.addressLine1}, {a.city}
                          </option>
                        ))
                      )}
                    </select>

                    {(() => {
                      const a = getAddressFromKey(selectedAddressKey);
                      if (!a) return null;
                      return (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                          Using: <strong>{a.addressLine1}</strong>
                          {a.addressLine2 ? `, ${a.addressLine2}` : ""} • {a.city}, {a.state}{" "}
                          {a.postalCode}
                        </div>
                      );
                    })()}
                  </div>

                  {ticketError ? <div style={{ color: "red" }}>{ticketError}</div> : null}

                  <button
                    type="submit"
                    disabled={ticketSaving}
                    style={{
                      padding: "10px 16px",
                      border: "1px solid #ccc",
                      borderRadius: "10px",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                      width: "fit-content",
                    }}
                  >
                    {ticketSaving ? "Creating..." : "Create Ticket"}
                  </button>
                </form>
              )}
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                Contact
              </h2>
              <p>
                <strong>Primary Phone:</strong> {customer.phonePrimary || "—"}
              </p>
              <p>
                <strong>Secondary Phone:</strong>{" "}
                {customer.phoneSecondary || "—"}
              </p>
              <p>
                <strong>Email:</strong> {customer.email || "—"}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                Billing Address
              </h2>
              <p>{customer.billingAddressLine1 || "—"}</p>
              <p>{customer.billingAddressLine2 || ""}</p>
              <p>
                {customer.billingCity}, {customer.billingState}{" "}
                {customer.billingPostalCode}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                Service Addresses
              </h2>

              {customer.serviceAddresses && customer.serviceAddresses.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {customer.serviceAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: "10px",
                        padding: "10px",
                      }}
                    >
                      <p>
                        <strong>{addr.label || "Service Address"}</strong>
                        {addr.isPrimary ? " (Primary)" : ""}
                      </p>
                      <p>{addr.addressLine1}</p>
                      <p>{addr.addressLine2 || ""}</p>
                      <p>
                        {addr.city}, {addr.state} {addr.postalCode}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No service addresses added yet.</p>
              )}

              <div
                style={{
                  marginTop: "16px",
                  borderTop: "1px solid #eee",
                  paddingTop: "16px",
                }}
              >
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    marginBottom: "10px",
                  }}
                >
                  Add Service Address
                </h3>

                <form
                  onSubmit={handleAddServiceAddress}
                  style={{ display: "grid", gap: "10px", maxWidth: "700px" }}
                >
                  <div>
                    <label>Label</label>
                    <input
                      value={serviceLabel}
                      onChange={(e) => setServiceLabel(e.target.value)}
                      placeholder="Home, Rental House, Shop, Lake House..."
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>

                  <div>
                    <label>Address Line 1</label>
                    <input
                      value={serviceAddressLine1}
                      onChange={(e) => setServiceAddressLine1(e.target.value)}
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
                    <label>Address Line 2</label>
                    <input
                      value={serviceAddressLine2}
                      onChange={(e) => setServiceAddressLine2(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>

                  <div>
                    <label>City</label>
                    <input
                      value={serviceCity}
                      onChange={(e) => setServiceCity(e.target.value)}
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
                    <label>State</label>
                    <input
                      value={serviceState}
                      onChange={(e) => setServiceState(e.target.value)}
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
                    <label>Postal Code</label>
                    <input
                      value={servicePostalCode}
                      onChange={(e) => setServicePostalCode(e.target.value)}
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
                    <label>Notes</label>
                    <textarea
                      value={serviceNotes}
                      onChange={(e) => setServiceNotes(e.target.value)}
                      rows={3}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={serviceIsPrimary}
                      onChange={(e) => setServiceIsPrimary(e.target.checked)}
                    />
                    Set as primary service address
                  </label>

                  {serviceAddressError ? (
                    <p style={{ color: "red" }}>{serviceAddressError}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={savingAddress}
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
                    {savingAddress ? "Saving..." : "Add Service Address"}
                  </button>
                </form>
              </div>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                DCFlow / QuickBooks
              </h2>
              <p>
                <strong>Source:</strong> {customer.source}
              </p>
              <p>
                <strong>QuickBooks Customer ID:</strong>{" "}
                {customer.quickbooksCustomerId || "Not linked yet"}
              </p>
              <p>
                <strong>Active:</strong> {String(customer.active)}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                Notes
              </h2>
              <p>{customer.notes || "No notes yet."}</p>
            </div>

            {/* Add Call Log */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                Add Call Log
              </h2>

              <form
                onSubmit={handleAddCallLog}
                style={{ display: "grid", gap: "10px", maxWidth: "700px" }}
              >
                <div>
                  <label>Call Type</label>
                  <select
                    value={callType}
                    onChange={(e) =>
                      setCallType(
                        e.target.value as
                          | "new_information"
                          | "status_check"
                          | "reschedule"
                          | "billing"
                          | "general"
                      )
                    }
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  >
                    <option value="new_information">New Information</option>
                    <option value="status_check">Status Check</option>
                    <option value="reschedule">Reschedule</option>
                    <option value="billing">Billing</option>
                    <option value="general">General</option>
                  </select>
                </div>

                <div>
                  <label>Direction</label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  >
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                  </select>
                </div>

                <div>
                  <label>Summary</label>
                  <input
                    value={callSummary}
                    onChange={(e) => setCallSummary(e.target.value)}
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
                  <label>Details</label>
                  <textarea
                    value={callDetails}
                    onChange={(e) => setCallDetails(e.target.value)}
                    rows={3}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={visibleToTech}
                    onChange={(e) => setVisibleToTech(e.target.checked)}
                  />
                  Visible to technician
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={updatesTicketNotes}
                    onChange={(e) => setUpdatesTicketNotes(e.target.checked)}
                  />
                  Updates ticket notes
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={followUpNeeded}
                    onChange={(e) => setFollowUpNeeded(e.target.checked)}
                  />
                  Follow-up needed
                </label>

                {followUpNeeded ? (
                  <div>
                    <label>Follow-up Note</label>
                    <input
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>
                ) : null}

                {newCallLogError ? <p style={{ color: "red" }}>{newCallLogError}</p> : null}

                <button
                  type="submit"
                  disabled={savingCallLog}
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
                  {savingCallLog ? "Saving..." : "Add Call Log"}
                </button>
              </form>
            </div>

            {/* Call History */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                Call History
              </h2>

              {callLogsLoading ? <p>Loading call history...</p> : null}
              {callLogError ? <p style={{ color: "red" }}>{callLogError}</p> : null}

              {!callLogsLoading && !callLogError && callLogs.length === 0 ? (
                <p>No call logs yet.</p>
              ) : null}

              {!callLogsLoading && !callLogError && callLogs.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {callLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: "10px",
                        padding: "10px",
                      }}
                    >
                      <p>
                        <strong>{log.summary}</strong>
                      </p>
                      <p style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                        {log.callType} • {log.direction}
                      </p>
                      <p style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                        {log.details || "No additional details."}
                      </p>
                      <p style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                        Visible to Tech: {String(log.visibleToTech)} | Follow-up Needed:{" "}
                        {String(log.followUpNeeded)}
                      </p>
                      {log.followUpNote ? (
                        <p style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                          Follow-up Note: {log.followUpNote}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}