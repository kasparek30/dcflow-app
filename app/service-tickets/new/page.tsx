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

type DcflowUserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role?: string;
  active?: boolean;
};

type EmployeeProfileOption = {
  id: string;
  userUid?: string | null;
  displayName?: string;
  employmentStatus?: string;
  laborRole?: string;
  defaultPairedTechUid?: string | null;
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

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
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

  // ✅ Multi-tech foundation inputs
  const [staffLoading, setStaffLoading] = useState(true);
  const [users, setUsers] = useState<DcflowUserOption[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [primaryTechnicianId, setPrimaryTechnicianId] = useState(""); // uid
  const [assignedTechnicianIds, setAssignedTechnicianIds] = useState<string[]>([]); // uid array
  const [assignmentError, setAssignmentError] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load Customers
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

  // Load Users + Employee Profiles (for default helper pairing)
  useEffect(() => {
    async function loadStaff() {
      setStaffLoading(true);
      setAssignmentError("");

      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const usersItems: DcflowUserOption[] = usersSnap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: docSnap.id,
            displayName: d.displayName ?? "",
            email: d.email ?? undefined,
            role: d.role ?? undefined,
            active: d.active ?? true,
          };
        });

        usersItems.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsers(usersItems);

        const profilesSnap = await getDocs(collection(db, "employeeProfiles"));
        const profileItems: EmployeeProfileOption[] = profilesSnap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userUid: d.userUid ?? null,
            displayName: d.displayName ?? undefined,
            employmentStatus: d.employmentStatus ?? "current",
            laborRole: d.laborRole ?? "other",
            defaultPairedTechUid: d.defaultPairedTechUid ?? null,
          };
        });

        profileItems.sort((a, b) =>
          String(a.displayName || "").localeCompare(String(b.displayName || ""))
        );
        setEmployeeProfiles(profileItems);
      } catch (err: unknown) {
        setAssignmentError(err instanceof Error ? err.message : "Failed to load staff roster.");
      } finally {
        setStaffLoading(false);
      }
    }

    loadStaff();
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

    const activeAddresses = selectedCustomer.serviceAddresses.filter((addr) => addr.active);

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

  // ✅ Current technicians list: require a current employee profile + user.role === technician
  const currentTechnicians = useMemo(() => {
    const currentUids = new Set<string>();

    for (const p of employeeProfiles) {
      if ((p.employmentStatus || "current") !== "current") continue;
      const uid = String(p.userUid || "").trim();
      if (uid) currentUids.add(uid);
    }

    return users
      .filter((u) => u.active !== false)
      .filter((u) => currentUids.has(u.uid))
      .filter((u) => normalizeRole(u.role) === "technician")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, employeeProfiles]);

  // ✅ Default helpers/apprentices for selected tech:
  // helper profiles have defaultPairedTechUid == selected tech uid
  const defaultHelperUids = useMemo(() => {
    const techUid = primaryTechnicianId.trim();
    if (!techUid) return [];

    return employeeProfiles
      .filter((p) => (p.employmentStatus || "current") === "current")
      .filter((p) => ["helper", "apprentice"].includes(normalizeRole(p.laborRole)))
      .filter((p) => String(p.defaultPairedTechUid || "").trim() === techUid)
      .map((p) => String(p.userUid || "").trim())
      .filter(Boolean);
  }, [employeeProfiles, primaryTechnicianId]);

  // Auto-set assigned team whenever primary tech changes
  useEffect(() => {
    const techUid = primaryTechnicianId.trim();
    if (!techUid) {
      setAssignedTechnicianIds([]);
      return;
    }

    const combined = [techUid, ...defaultHelperUids];
    const unique = Array.from(new Set(combined));
    setAssignedTechnicianIds(unique);
  }, [primaryTechnicianId, defaultHelperUids]);

  const assignedTeamNames = useMemo(() => {
    const map = new Map(users.map((u) => [u.uid, u.displayName]));
    return assignedTechnicianIds.map((uid) => map.get(uid) || uid);
  }, [assignedTechnicianIds, users]);

  const primaryTechnician = useMemo(() => {
    const uid = primaryTechnicianId.trim();
    if (!uid) return null;
    return users.find((u) => u.uid === uid) || null;
  }, [primaryTechnicianId, users]);

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

    if (!issueSummary.trim()) {
      setError("Please enter an issue summary.");
      return;
    }

    // ✅ Require primary tech if status indicates it's scheduled/in progress
    // For pilot purposes, you can also require always — but this keeps current flexibility.
    // If you want ALWAYS required, tell me and we’ll lock it.
    if ((status === "scheduled" || status === "in_progress") && !primaryTechnicianId.trim()) {
      setError("Please select a primary technician for scheduled/in-progress tickets.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const primaryUid = primaryTechnicianId.trim() || null;
      const teamUids =
        primaryUid && assignedTechnicianIds.length
          ? assignedTechnicianIds
          : primaryUid
            ? [primaryUid]
            : [];

      const docRef = await addDoc(collection(db, "serviceTickets"), {
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

        serviceAddressId: chosenAddress.id === "billing-fallback" ? null : chosenAddress.id,
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

        // ✅ Keep legacy fields for existing UI compatibility
        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryTechnician ? primaryTechnician.displayName : null,

        // ✅ New multi-tech fields (additive)
        primaryTechnicianId: primaryUid,
        assignedTechnicianIds: teamUids.length ? teamUids : null,

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
                      <div style={{ fontWeight: 700 }}>
                        {selectedCustomer.displayName}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                        {selectedCustomer.phonePrimary || "No phone"}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                        {selectedCustomer.billingAddressLine1}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
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
                <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
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
                        <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                          {customer.phonePrimary || "No phone"}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                          {customer.billingAddressLine1}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
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
                  {selectedCustomer ? "Select a service address" : "Select a customer first"}
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

            {/* ✅ NEW: Assignment section (multi-tech foundation) */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: 0 }}>
                Assignment (Pilot: Tech + Helper)
              </h2>

              {staffLoading ? <p>Loading employee roster...</p> : null}
              {assignmentError ? <p style={{ color: "red" }}>{assignmentError}</p> : null}

              <div style={{ marginTop: "10px" }}>
                <label>Primary Technician</label>
                <select
                  value={primaryTechnicianId}
                  onChange={(e) => {
                    setPrimaryTechnicianId(e.target.value);
                    setError("");
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                >
                  <option value="">— Not assigned yet —</option>
                  {currentTechnicians.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      {t.displayName} {t.email ? `— ${t.email}` : ""}
                    </option>
                  ))}
                </select>

                <div style={{ marginTop: "8px", fontSize: "13px", color: "#555" }}>
                  <strong>Assigned Team:</strong>{" "}
                  {assignedTeamNames.length ? assignedTeamNames.join(", ") : "—"}
                </div>

                <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                  Helpers/apprentices are auto-added based on Employee Profiles pairing
                  (helper.defaultPairedTechUid = technician UID).
                </div>
              </div>
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