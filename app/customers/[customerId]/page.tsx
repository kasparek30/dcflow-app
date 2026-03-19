// app/customers/[customerId]/page.tsx
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

function safeStr(x: unknown) {
  return String(x ?? "").trim();
}

function isAppleDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function buildMapsUrl(address: string) {
  const q = encodeURIComponent(address);
  if (isAppleDevice()) return `https://maps.apple.com/?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { appUser } = useAuthContext();
  const router = useRouter();

  const canCreateTicket =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const canEditCustomer =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "billing";

  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [rawCustomer, setRawCustomer] = useState<any>(null);
  const [error, setError] = useState("");

  // ✅ Editable customer fields (Contact + Billing)
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editOk, setEditOk] = useState("");

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhonePrimary, setEditPhonePrimary] = useState("");
  const [editPhoneSecondary, setEditPhoneSecondary] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [editBillLine1, setEditBillLine1] = useState("");
  const [editBillLine2, setEditBillLine2] = useState("");
  const [editBillCity, setEditBillCity] = useState("");
  const [editBillState, setEditBillState] = useState("");
  const [editBillPostal, setEditBillPostal] = useState("");

  // ✅ QBO sync UI
  const [qboSyncing, setQboSyncing] = useState(false);
  const [qboSyncErr, setQboSyncErr] = useState("");
  const [qboSyncOk, setQboSyncOk] = useState("");

  // ✅ Add Service Address state
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

  // ✅ Call logs
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

  // ✅ Create Ticket state
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [issueSummary, setIssueSummary] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("60");
  const [selectedAddressKey, setSelectedAddressKey] = useState("");

  // -----------------------------
  // Load Customer
  // -----------------------------
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
        setRawCustomer(data);

        // NOTE: Your app currently has two schemas in the wild.
        // Old schema: displayName, phonePrimary, billingAddressLine1, etc.
        // New QBO schema: customerDisplayName/displayName, phone/email, billAddrLine1, etc.
        const displayName =
          safeStr((data as any).displayName) ||
          safeStr((data as any).customerDisplayName) ||
          safeStr((data as any).qboDisplayName) ||
          "";

        const phonePrimary =
          safeStr((data as any).phonePrimary) ||
          safeStr((data as any).phone) ||
          "";

        const phoneSecondary = safeStr((data as any).phoneSecondary) || "";

        const email =
          safeStr((data as any).email) ||
          "";

        const billingAddressLine1 =
          safeStr((data as any).billingAddressLine1) ||
          safeStr((data as any).billAddrLine1) ||
          "";

        const billingAddressLine2 =
          safeStr((data as any).billingAddressLine2) ||
          safeStr((data as any).billAddrLine2) ||
          safeStr((data as any).billAddrLine3) ||
          "";

        const billingCity =
          safeStr((data as any).billingCity) ||
          safeStr((data as any).billAddrCity) ||
          "";

        const billingState =
          safeStr((data as any).billingState) ||
          safeStr((data as any).billAddrState) ||
          "";

        const billingPostalCode =
          safeStr((data as any).billingPostalCode) ||
          safeStr((data as any).billAddrPostalCode) ||
          "";

        const item: Customer = {
          id: snap.id,
          quickbooksCustomerId: (data as any).quickbooksCustomerId ?? (data as any).qboCustomerId ?? undefined,
          source: (data as any).source ?? "dcflow",
          displayName,
          phonePrimary,
          phoneSecondary: phoneSecondary || undefined,
          email: email || undefined,

          billingAddressLine1,
          billingAddressLine2: billingAddressLine2 || undefined,
          billingCity,
          billingState,
          billingPostalCode,

          serviceAddresses: Array.isArray((data as any).serviceAddresses)
            ? (data as any).serviceAddresses.map((addr: any) => ({
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

          notes: (data as any).notes ?? undefined,
          active: (data as any).active ?? true,
        };

        setCustomer(item);

        // Seed edit controls
        setEditDisplayName(item.displayName || "");
        setEditPhonePrimary(item.phonePrimary || "");
        setEditPhoneSecondary(item.phoneSecondary || "");
        setEditEmail(item.email || "");

        setEditBillLine1(item.billingAddressLine1 || "");
        setEditBillLine2(item.billingAddressLine2 || "");
        setEditBillCity(item.billingCity || "");
        setEditBillState(item.billingState || "");
        setEditBillPostal(item.billingPostalCode || "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load customer.");
      } finally {
        setLoading(false);
      }
    }

    loadCustomer();
  }, [params]);

  // -----------------------------
  // Load Call Logs
  // -----------------------------
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
        setCallLogError(err instanceof Error ? err.message : "Failed to load call logs.");
      } finally {
        setCallLogsLoading(false);
      }
    }

    loadCallLogs();
  }, [params]);

  // -----------------------------
  // Address choices for ticket creation
  // -----------------------------
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

  useEffect(() => {
    if (!selectedAddressKey && addressChoices.length) {
      const primary = addressChoices.find((a) => a.source === "service" && a.isPrimary);
      setSelectedAddressKey(primary?.key || addressChoices[0].key);
    }
  }, [addressChoices, selectedAddressKey]);

  function getAddressFromKey(key: string): AddressChoice | null {
    return addressChoices.find((a) => a.key === key) || null;
  }

  // -----------------------------
  // ✅ Save customer edits (DCFlow)
  // -----------------------------
  async function handleSaveCustomerEdits(syncToQboAfter: boolean) {
    if (!customer) return;
    if (!canEditCustomer) {
      setEditErr("You do not have permission to edit customers.");
      return;
    }

    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setEditSaving(true);

    try {
      const now = nowIso();

      const payload: any = {
        // Old schema (what this page reads)
        displayName: safeStr(editDisplayName),
        phonePrimary: safeStr(editPhonePrimary),
        phoneSecondary: safeStr(editPhoneSecondary) || null,
        email: safeStr(editEmail) || null,

        billingAddressLine1: safeStr(editBillLine1),
        billingAddressLine2: safeStr(editBillLine2) || null,
        billingCity: safeStr(editBillCity),
        billingState: safeStr(editBillState),
        billingPostalCode: safeStr(editBillPostal),

        updatedAt: now,

        // New QBO schema mirrors (so everything stays consistent going forward)
        customerDisplayName: safeStr(editDisplayName),
        phone: safeStr(editPhonePrimary),
        billAddrLine1: safeStr(editBillLine1),
        billAddrLine2: safeStr(editBillLine2),
        billAddrCity: safeStr(editBillCity),
        billAddrState: safeStr(editBillState),
        billAddrPostalCode: safeStr(editBillPostal),
      };

      await updateDoc(doc(db, "customers", customer.id), payload);

      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              displayName: safeStr(editDisplayName),
              phonePrimary: safeStr(editPhonePrimary),
              phoneSecondary: safeStr(editPhoneSecondary) || undefined,
              email: safeStr(editEmail) || undefined,
              billingAddressLine1: safeStr(editBillLine1),
              billingAddressLine2: safeStr(editBillLine2) || undefined,
              billingCity: safeStr(editBillCity),
              billingState: safeStr(editBillState),
              billingPostalCode: safeStr(editBillPostal),
            }
          : prev
      );

      setEditOk(syncToQboAfter ? "✅ Saved in DCFlow. Syncing to QBO..." : "✅ Saved in DCFlow.");

      if (syncToQboAfter) {
        await handleSyncToQbo({ updateName: true });
      }
    } catch (err: unknown) {
      setEditErr(err instanceof Error ? err.message : "Failed to save customer.");
    } finally {
      setEditSaving(false);
    }
  }

  // -----------------------------
  // ✅ Sync customer to QBO (Option B)
  // -----------------------------
  async function handleSyncToQbo(opts?: { updateName?: boolean }) {
    if (!customer) return;

    // We consider the customer "QBO-linked" if either field exists.
    const qboLinkedId =
      safeStr((rawCustomer as any)?.qboCustomerId) ||
      safeStr((rawCustomer as any)?.quickbooksCustomerId) ||
      safeStr((customer as any)?.quickbooksCustomerId);

    if (!qboLinkedId) {
      setQboSyncErr("This customer is not linked to QuickBooks yet.");
      return;
    }

    setQboSyncErr("");
    setQboSyncOk("");
    setQboSyncing(true);

    try {
      const res = await fetch("/api/qbo/customers/update-from-dcflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // IMPORTANT: API expects the DCFlow doc id; it reads qboCustomerId inside the doc.
        // Our save step writes qbo-friendly fields, but if your API only reads qboCustomerId,
        // make sure your customer doc has it (your sync route writes it).
        body: JSON.stringify({
          dcCustomerId: customer.id,
          updateName: Boolean(opts?.updateName),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setQboSyncErr(data?.error || "Failed to sync customer to QBO.");
        return;
      }

      setQboSyncOk("✅ Synced to QBO.");
    } catch (err: unknown) {
      setQboSyncErr(err instanceof Error ? err.message : "Failed to sync to QBO.");
    } finally {
      setQboSyncing(false);
    }
  }

  // -----------------------------
  // Add Service Address
  // -----------------------------
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
      setServiceAddressError(err instanceof Error ? err.message : "Failed to add service address.");
    } finally {
      setSavingAddress(false);
    }
  }

  // -----------------------------
  // Add Call Log
  // -----------------------------
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
      setNewCallLogError(err instanceof Error ? err.message : "Failed to save call log.");
    } finally {
      setSavingCallLog(false);
    }
  }

  // -----------------------------
  // Create Service Ticket
  // -----------------------------
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

      const serviceAddressId =
        addr.source === "service" ? addr.key.replace("service:", "") : null;

      const payload = {
        customerId: customer.id,
        customerDisplayName: customer.displayName || "",

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
      router.push(`/service-tickets/${created.id}`);
    } catch (err: unknown) {
      setTicketError(err instanceof Error ? err.message : "Failed to create service ticket.");
    } finally {
      setTicketSaving(false);
    }
  }

  // -----------------------------
  // Render helpers
  // -----------------------------
  const qboStatus = useMemo(() => {
    const d = rawCustomer || {};
    const linked =
      safeStr(d.qboCustomerId) ||
      safeStr(d.quickbooksCustomerId) ||
      safeStr(d.qboCustomerId || d.qboCustomerId);

    return {
      linkedId: linked,
      syncStatus: safeStr(d.qboSyncStatus) || "",
      lastSyncedAt: safeStr(d.qboLastSyncedAt) || "",
      lastError: safeStr(d.qboLastSyncError) || "",
      lastTid: safeStr(d.qboLastSyncIntuitTid) || "",
    };
  }, [rawCustomer]);

  const billingFull = useMemo(() => {
    const line1 = safeStr(editBillLine1);
    const line2 = safeStr(editBillLine2);
    const city = safeStr(editBillCity);
    const st = safeStr(editBillState);
    const zip = safeStr(editBillPostal);

    const parts = [
      line1,
      line2 ? line2 : "",
      `${city}${city && st ? ", " : ""}${st} ${zip}`.trim(),
    ].filter(Boolean);

    return parts.join(" • ");
  }, [editBillLine1, editBillLine2, editBillCity, editBillState, editBillPostal]);

  const billingMapsUrl = useMemo(() => {
    const full = [editBillLine1, editBillLine2, editBillCity, editBillState, editBillPostal]
      .map((x) => safeStr(x))
      .filter(Boolean)
      .join(", ");
    return full ? buildMapsUrl(full) : "";
  }, [editBillLine1, editBillLine2, editBillCity, editBillState, editBillPostal]);

  return (
    <ProtectedPage fallbackTitle="Customer Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading customer...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && customer ? (
          <div style={{ display: "grid", gap: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
                  {customer.displayName}
                </h1>
                <p style={{ marginTop: "6px", color: "#666" }}>
                  Customer ID: {customerId}
                </p>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => router.push("/customers")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  Back to Customers
                </button>
              </div>
            </div>

            {/* ✅ Edit + Sync panel */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 1000, margin: 0 }}>Customer Info</h2>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                    Edit in DCFlow and (optionally) sync to QBO.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => handleSaveCustomerEdits(false)}
                    disabled={!canEditCustomer || editSaving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: canEditCustomer ? "pointer" : "not-allowed",
                      fontWeight: 900,
                    }}
                  >
                    {editSaving ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveCustomerEdits(true)}
                    disabled={!canEditCustomer || editSaving || qboSyncing}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #1f6b1f",
                      background: "#1f8f3a",
                      color: "white",
                      cursor: canEditCustomer ? "pointer" : "not-allowed",
                      fontWeight: 1000,
                    }}
                    title="Save in DCFlow, then push changes to QBO"
                  >
                    {qboSyncing ? "Syncing..." : "Save & Sync to QBO"}
                  </button>
                </div>
              </div>

              {editErr ? <div style={{ marginTop: 10, color: "red" }}>{editErr}</div> : null}
              {editOk ? <div style={{ marginTop: 10, color: "green" }}>{editOk}</div> : null}
              {qboSyncErr ? <div style={{ marginTop: 10, color: "red" }}>{qboSyncErr}</div> : null}
              {qboSyncOk ? <div style={{ marginTop: 10, color: "green" }}>{qboSyncOk}</div> : null}

              <div style={{ marginTop: 14, display: "grid", gap: 12, maxWidth: 980 }}>
                <div
                  style={{
                    border: "1px solid #e6e6e6",
                    borderRadius: 12,
                    padding: 12,
                    background: "white",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 950 }}>Contact</div>

                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                    <div>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>Customer Name</label>
                      <input
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>Email</label>
                      <input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>Primary Phone</label>
                      <input
                        value={editPhonePrimary}
                        onChange={(e) => setEditPhonePrimary(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {editPhonePrimary ? (
                          <a
                            href={`tel:${editPhonePrimary}`}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              background: "white",
                              textDecoration: "none",
                              color: "inherit",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            📞 Call
                          </a>
                        ) : null}
                        {editPhonePrimary ? (
                          <a
                            href={`sms:${editPhonePrimary}`}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              background: "white",
                              textDecoration: "none",
                              color: "inherit",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            💬 Text
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>Secondary Phone</label>
                      <input
                        value={editPhoneSecondary}
                        onChange={(e) => setEditPhoneSecondary(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #e6e6e6",
                    borderRadius: 12,
                    padding: 12,
                    background: "white",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 950 }}>Billing Address</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                        {billingFull || "—"}
                      </div>
                    </div>

                    {billingMapsUrl ? (
                      <a
                        href={billingMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          background: "white",
                          textDecoration: "none",
                          color: "inherit",
                          fontWeight: 900,
                          height: "fit-content",
                        }}
                      >
                        📍 Open in Maps
                      </a>
                    ) : null}
                  </div>

                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>Address Line 1</label>
                      <input
                        value={editBillLine1}
                        onChange={(e) => setEditBillLine1(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>Address Line 2</label>
                      <input
                        value={editBillLine2}
                        onChange={(e) => setEditBillLine2(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>City</label>
                      <input
                        value={editBillCity}
                        onChange={(e) => setEditBillCity(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>State</label>
                      <input
                        value={editBillState}
                        onChange={(e) => setEditBillState(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 900, fontSize: 12 }}>Postal Code</label>
                      <input
                        value={editBillPostal}
                        onChange={(e) => setEditBillPostal(e.target.value)}
                        disabled={!canEditCustomer || editSaving}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                          marginTop: 6,
                          background: !canEditCustomer ? "#f1f1f1" : "white",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #e6e6e6",
                    borderRadius: 12,
                    padding: 12,
                    background: "white",
                  }}
                >
                  <div style={{ fontWeight: 950 }}>QuickBooks Sync Status</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                    <div>
                      <strong>Linked:</strong>{" "}
                      {qboStatus.linkedId ? `Yes (${qboStatus.linkedId})` : "No"}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <strong>Status:</strong>{" "}
                      {qboStatus.syncStatus || "—"}
                      {qboStatus.lastSyncedAt ? ` • Last sync: ${qboStatus.lastSyncedAt}` : ""}
                    </div>
                    {qboStatus.lastError ? (
                      <div style={{ marginTop: 6, color: "red" }}>
                        <strong>Last Error:</strong> {qboStatus.lastError}
                      </div>
                    ) : null}
                    {qboStatus.lastTid ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                        Intuit TID: {qboStatus.lastTid}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleSyncToQbo({ updateName: true })}
                      disabled={!canEditCustomer || qboSyncing}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #ccc",
                        background: "white",
                        cursor: canEditCustomer ? "pointer" : "not-allowed",
                        fontWeight: 900,
                      }}
                    >
                      {qboSyncing ? "Syncing..." : "Sync Now"}
                    </button>
                  </div>
                </div>
              </div>
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

            {/* Service Addresses */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "10px" }}>
                Service Addresses
              </h2>

              {customer.serviceAddresses && customer.serviceAddresses.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {customer.serviceAddresses.map((addr) => {
                    const fullAddr = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode]
                      .map((x) => safeStr(x))
                      .filter(Boolean)
                      .join(", ");
                    const maps = fullAddr ? buildMapsUrl(fullAddr) : "";

                    return (
                      <div
                        key={addr.id}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: "12px",
                          padding: "12px",
                          background: "white",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {addr.label || "Service Address"}{addr.isPrimary ? " (Primary)" : ""}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                              {addr.addressLine1}
                              {addr.addressLine2 ? `, ${addr.addressLine2}` : ""} • {addr.city}, {addr.state}{" "}
                              {addr.postalCode}
                            </div>
                            {addr.notes ? (
                              <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                                Notes: {addr.notes}
                              </div>
                            ) : null}
                          </div>

                          {maps ? (
                            <a
                              href={maps}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                border: "1px solid #ccc",
                                background: "white",
                                textDecoration: "none",
                                color: "inherit",
                                fontWeight: 900,
                                height: "fit-content",
                              }}
                            >
                              📍 Maps
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>No service addresses added yet.</p>
              )}

              {/* Add Service Address */}
              <div
                style={{
                  marginTop: "16px",
                  borderTop: "1px solid #eee",
                  paddingTop: "16px",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 900, marginBottom: "10px" }}>
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
                        padding: "10px",
                        marginTop: "6px",
                        borderRadius: 12,
                        border: "1px solid #ccc",
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
                        padding: "10px",
                        marginTop: "6px",
                        borderRadius: 12,
                        border: "1px solid #ccc",
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
                        padding: "10px",
                        marginTop: "6px",
                        borderRadius: 12,
                        border: "1px solid #ccc",
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 10 }}>
                    <div>
                      <label>City</label>
                      <input
                        value={serviceCity}
                        onChange={(e) => setServiceCity(e.target.value)}
                        required
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px",
                          marginTop: "6px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
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
                          padding: "10px",
                          marginTop: "6px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
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
                          padding: "10px",
                          marginTop: "6px",
                          borderRadius: 12,
                          border: "1px solid #ccc",
                        }}
                      />
                    </div>
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
                        padding: "10px",
                        marginTop: "6px",
                        borderRadius: 12,
                        border: "1px solid #ccc",
                      }}
                    />
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={serviceIsPrimary}
                      onChange={(e) => setServiceIsPrimary(e.target.checked)}
                    />
                    <span style={{ fontWeight: 900 }}>Set as primary service address</span>
                  </label>

                  {serviceAddressError ? <p style={{ color: "red" }}>{serviceAddressError}</p> : null}

                  <button
                    type="submit"
                    disabled={savingAddress}
                    style={{
                      padding: "10px 16px",
                      border: "1px solid #ccc",
                      borderRadius: 12,
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                      width: "fit-content",
                    }}
                  >
                    {savingAddress ? "Saving..." : "Add Service Address"}
                  </button>
                </form>
              </div>
            </div>

            {/* Add Call Log */}
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
                Add Call Log
              </h2>

              <form
                onSubmit={handleAddCallLog}
                style={{ display: "grid", gap: 10, maxWidth: 700 }}
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
                      padding: 10,
                      marginTop: 6,
                      borderRadius: 12,
                      border: "1px solid #ccc",
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
                      padding: 10,
                      marginTop: 6,
                      borderRadius: 12,
                      border: "1px solid #ccc",
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
                      padding: 10,
                      marginTop: 6,
                      borderRadius: 12,
                      border: "1px solid #ccc",
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
                      padding: 10,
                      marginTop: 6,
                      borderRadius: 12,
                      border: "1px solid #ccc",
                    }}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={visibleToTech}
                    onChange={(e) => setVisibleToTech(e.target.checked)}
                  />
                  <span style={{ fontWeight: 900 }}>Visible to technician</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={updatesTicketNotes}
                    onChange={(e) => setUpdatesTicketNotes(e.target.checked)}
                  />
                  <span style={{ fontWeight: 900 }}>Updates ticket notes</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={followUpNeeded}
                    onChange={(e) => setFollowUpNeeded(e.target.checked)}
                  />
                  <span style={{ fontWeight: 900 }}>Follow-up needed</span>
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
                        padding: 10,
                        marginTop: 6,
                        borderRadius: 12,
                        border: "1px solid #ccc",
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
                    borderRadius: 12,
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                    width: "fit-content",
                  }}
                >
                  {savingCallLog ? "Saving..." : "Add Call Log"}
                </button>
              </form>
            </div>

            {/* Call History */}
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
                Call History
              </h2>

              {callLogsLoading ? <p>Loading call history...</p> : null}
              {callLogError ? <p style={{ color: "red" }}>{callLogError}</p> : null}

              {!callLogsLoading && !callLogError && callLogs.length === 0 ? (
                <p>No call logs yet.</p>
              ) : null}

              {!callLogsLoading && !callLogError && callLogs.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {callLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 12,
                        padding: 12,
                        background: "white",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{log.summary}</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                        {log.callType} • {log.direction}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                        {log.details || "No additional details."}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                        Visible to Tech: {String(log.visibleToTech)} | Follow-up Needed:{" "}
                        {String(log.followUpNeeded)}
                      </div>
                      {log.followUpNote ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                          Follow-up Note: {log.followUpNote}
                        </div>
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