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

function buildInlineAddress(line1?: string, line2?: string, city?: string, state?: string, postal?: string) {
  const parts = [line1, line2, city, state, postal].map((x) => safeStr(x)).filter(Boolean);
  return parts.join(", ");
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

  // ✅ UI: view-first, expand panels only on click
  const [isEditMode, setIsEditMode] = useState(false);
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [showAddServiceAddress, setShowAddServiceAddress] = useState(false);
  const [showAddCallLog, setShowAddCallLog] = useState(false);

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

        // NOTE: two schemas may exist. Normalize into your Customer type.
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
          safeStr((data as any).email) || "";

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

        // Seed edit controls (but keep view-only until "Edit" clicked)
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
  // ✅ Enter/Exit Edit Mode
  // -----------------------------
  function enterEditMode() {
    if (!customer) return;
    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setIsEditMode(true);

    // re-seed from current customer (safe)
    setEditDisplayName(customer.displayName || "");
    setEditPhonePrimary(customer.phonePrimary || "");
    setEditPhoneSecondary(customer.phoneSecondary || "");
    setEditEmail(customer.email || "");
    setEditBillLine1(customer.billingAddressLine1 || "");
    setEditBillLine2(customer.billingAddressLine2 || "");
    setEditBillCity(customer.billingCity || "");
    setEditBillState(customer.billingState || "");
    setEditBillPostal(customer.billingPostalCode || "");
  }

  function cancelEditMode() {
    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setIsEditMode(false);
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
        // Canonical (Customer type)
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

        // Back-compat mirror fields (for older code paths)
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
              updatedAt: now,
            }
          : prev
      );

      setEditOk(syncToQboAfter ? "✅ Saved in DCFlow. Syncing to QBO..." : "✅ Saved in DCFlow.");
      setIsEditMode(false);

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

      // reset + collapse
      setServiceLabel("");
      setServiceAddressLine1("");
      setServiceAddressLine2("");
      setServiceCity("");
      setServiceState("");
      setServicePostalCode("");
      setServiceNotes("");
      setServiceIsPrimary(false);
      setShowAddServiceAddress(false);
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

      // reset + collapse
      setCallType("new_information");
      setDirection("inbound");
      setCallSummary("");
      setCallDetails("");
      setVisibleToTech(false);
      setUpdatesTicketNotes(false);
      setFollowUpNeeded(false);
      setFollowUpNote("");
      setShowAddCallLog(false);
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

      // reset + collapse + go
      setIssueSummary("");
      setIssueDetails("");
      setEstimatedDurationMinutes("60");
      setShowCreateTicket(false);

      router.push(`/service-tickets/${created.id}`);
    } catch (err: unknown) {
      setTicketError(err instanceof Error ? err.message : "Failed to create service ticket.");
    } finally {
      setTicketSaving(false);
    }
  }

  // -----------------------------
  // View helpers
  // -----------------------------
  const qboStatus = useMemo(() => {
    const d = rawCustomer || {};
    const linked =
      safeStr(d.qboCustomerId) || safeStr(d.quickbooksCustomerId);

    return {
      linkedId: linked,
      syncStatus: safeStr(d.qboSyncStatus) || "",
      lastSyncedAt: safeStr(d.qboLastSyncedAt) || "",
      lastError: safeStr(d.qboLastSyncError) || "",
      lastTid: safeStr(d.qboLastSyncIntuitTid) || "",
    };
  }, [rawCustomer]);

  const billingInline = useMemo(() => {
    return buildInlineAddress(
      customer?.billingAddressLine1,
      customer?.billingAddressLine2,
      customer?.billingCity,
      customer?.billingState,
      customer?.billingPostalCode
    );
  }, [customer]);

  const billingMapsUrl = useMemo(() => {
    const full = buildInlineAddress(
      customer?.billingAddressLine1,
      customer?.billingAddressLine2,
      customer?.billingCity,
      customer?.billingState,
      customer?.billingPostalCode
    );
    return full ? buildMapsUrl(full) : "";
  }, [customer]);

  // lightweight “panel” component style
  const panelStyle = {
    border: "1px solid #e6e6e6",
    borderRadius: 12,
    padding: 12,
    background: "white",
  } as const;

  const actionBtnStyle = (primary?: boolean) =>
    ({
      padding: "10px 14px",
      borderRadius: 12,
      border: primary ? "1px solid #1f6b1f" : "1px solid #ccc",
      background: primary ? "#1f8f3a" : "white",
      color: primary ? "white" : "inherit",
      cursor: "pointer",
      fontWeight: primary ? 1000 : 900,
    } as const);

  return (
    <ProtectedPage fallbackTitle="Customer Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading customer...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && customer ? (
          <div style={{ display: "grid", gap: 18 }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 1000, margin: 0 }}>{customer.displayName}</h1>
                <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                  Customer ID: {customerId}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => router.push("/customers")}
                  style={actionBtnStyle(false)}
                >
                  Back to Customers
                </button>

                {canCreateTicket ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateTicket((v) => !v);
                      setTicketError("");
                      // close other panels to keep page clean
                      setShowAddServiceAddress(false);
                      setShowAddCallLog(false);
                      setIsEditMode(false);
                    }}
                    style={actionBtnStyle(true)}
                  >
                    + Create Ticket
                  </button>
                ) : null}

                {canEditCustomer ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditMode) cancelEditMode();
                      else enterEditMode();
                      setShowCreateTicket(false);
                      setShowAddServiceAddress(false);
                      setShowAddCallLog(false);
                    }}
                    style={actionBtnStyle(false)}
                  >
                    {isEditMode ? "Cancel Edit" : "Edit Customer"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Contact + Billing (VIEW) */}
            {!isEditMode ? (
              <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#fafafa" }}>
                <div style={{ display: "grid", gap: 12, maxWidth: 980 }}>
                  <div style={panelStyle}>
                    <div style={{ fontWeight: 1000, marginBottom: 8 }}>Contact</div>

                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#777", fontWeight: 900 }}>Primary Phone</div>
                        <div style={{ marginTop: 4, fontWeight: 900 }}>{customer.phonePrimary || "—"}</div>

                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {customer.phonePrimary ? (
                            <a
                              href={`tel:${customer.phonePrimary}`}
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
                          {customer.phonePrimary ? (
                            <a
                              href={`sms:${customer.phonePrimary}`}
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
                        <div style={{ fontSize: 12, color: "#777", fontWeight: 900 }}>Email</div>
                        <div style={{ marginTop: 4, fontWeight: 900 }}>{customer.email || "—"}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, color: "#777", fontWeight: 900 }}>Secondary Phone</div>
                        <div style={{ marginTop: 4, fontWeight: 900 }}>{customer.phoneSecondary || "—"}</div>
                      </div>
                    </div>
                  </div>

                  <div style={panelStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 1000 }}>Billing Address</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#555", fontWeight: 800 }}>
                          {billingInline || "—"}
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
                  </div>

                  <div style={panelStyle}>
                    <div style={{ fontWeight: 1000 }}>QuickBooks</div>
                    <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                      <div>
                        <strong>Linked:</strong>{" "}
                        {qboStatus.linkedId ? `Yes (${qboStatus.linkedId})` : "No"}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <strong>Status:</strong> {qboStatus.syncStatus || "—"}
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

                    {qboSyncErr ? <div style={{ marginTop: 10, color: "red" }}>{qboSyncErr}</div> : null}
                    {qboSyncOk ? <div style={{ marginTop: 10, color: "green" }}>{qboSyncOk}</div> : null}
                  </div>
                </div>
              </div>
            ) : (
              /* EDIT MODE (explicit toggle) */
              <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 1000 }}>Edit Customer</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                      Changes are saved to DCFlow only unless you choose “Save & Sync”.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={cancelEditMode}
                      disabled={editSaving || qboSyncing}
                      style={actionBtnStyle(false)}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveCustomerEdits(false)}
                      disabled={!canEditCustomer || editSaving}
                      style={actionBtnStyle(false)}
                    >
                      {editSaving ? "Saving..." : "Save"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveCustomerEdits(true)}
                      disabled={!canEditCustomer || editSaving || qboSyncing}
                      style={actionBtnStyle(true)}
                      title="Save in DCFlow, then push changes to QBO"
                    >
                      {qboSyncing ? "Syncing..." : "Save & Sync"}
                    </button>
                  </div>
                </div>

                {editErr ? <div style={{ marginTop: 10, color: "red" }}>{editErr}</div> : null}
                {editOk ? <div style={{ marginTop: 10, color: "green" }}>{editOk}</div> : null}

                <div style={{ marginTop: 14, display: "grid", gap: 12, maxWidth: 980 }}>
                  <div style={panelStyle}>
                    <div style={{ fontWeight: 1000, marginBottom: 10 }}>Contact</div>

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
                          }}
                        />
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
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={panelStyle}>
                    <div style={{ fontWeight: 1000, marginBottom: 10 }}>Billing Address</div>

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
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Collapsible: Create Ticket */}
            {showCreateTicket ? (
              <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 1000 }}>Create Service Ticket</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                      This form is hidden until you click “Create Ticket”.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCreateTicket(false)}
                    style={actionBtnStyle(false)}
                  >
                    Close
                  </button>
                </div>

                {!canCreateTicket ? (
                  <div style={{ marginTop: 12, fontSize: 13, color: "#777" }}>
                    Only Admin / Dispatcher / Manager can create service tickets.
                  </div>
                ) : (
                  <form
                    onSubmit={handleCreateServiceTicket}
                    style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 900 }}
                  >
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr" }}>
                      <div>
                        <label style={{ fontWeight: 900 }}>Issue Summary</label>
                        <input
                          value={issueSummary}
                          onChange={(e) => setIssueSummary(e.target.value)}
                          required
                          placeholder='Example: "Clogged kitchen sink"'
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
                        <label style={{ fontWeight: 900 }}>Estimated Duration (minutes)</label>
                        <input
                          type="number"
                          min={1}
                          value={estimatedDurationMinutes}
                          onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
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
                    </div>

                    <div>
                      <label style={{ fontWeight: 900 }}>Issue Details (optional)</label>
                      <textarea
                        value={issueDetails}
                        onChange={(e) => setIssueDetails(e.target.value)}
                        rows={3}
                        placeholder="Helpful details for dispatch/tech…"
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
                      <label style={{ fontWeight: 900 }}>Address for this ticket</label>
                      <select
                        value={selectedAddressKey}
                        onChange={(e) => setSelectedAddressKey(e.target.value)}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: 10,
                          marginTop: 6,
                          borderRadius: 12,
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
                            {a.addressLine2 ? `, ${a.addressLine2}` : ""} • {a.city}, {a.state} {a.postalCode}
                          </div>
                        );
                      })()}
                    </div>

                    {ticketError ? <div style={{ color: "red" }}>{ticketError}</div> : null}

                    <button
                      type="submit"
                      disabled={ticketSaving}
                      style={actionBtnStyle(true)}
                    >
                      {ticketSaving ? "Creating..." : "Create Ticket"}
                    </button>
                  </form>
                )}
              </div>
            ) : null}

            {/* Service Addresses (view) + add button */}
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>Service Addresses</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                    Add form stays hidden until clicked.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddServiceAddress((v) => !v);
                    setServiceAddressError("");
                    setShowCreateTicket(false);
                    setShowAddCallLog(false);
                    setIsEditMode(false);
                  }}
                  style={actionBtnStyle(false)}
                >
                  {showAddServiceAddress ? "Close" : "+ Add Address"}
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                {customer.serviceAddresses && customer.serviceAddresses.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {customer.serviceAddresses
                      .filter((a) => a.active !== false)
                      .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)))
                      .map((addr) => {
                        const fullAddr = buildInlineAddress(
                          addr.addressLine1,
                          addr.addressLine2,
                          addr.city,
                          addr.state,
                          addr.postalCode
                        );
                        const maps = fullAddr ? buildMapsUrl(fullAddr) : "";

                        return (
                          <div
                            key={addr.id}
                            style={{
                              border: "1px solid #eee",
                              borderRadius: 12,
                              padding: 12,
                              background: "white",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontWeight: 1000 }}>
                                  {addr.label || "Service Address"}
                                  {addr.isPrimary ? " (Primary)" : ""}
                                </div>
                                <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                                  {fullAddr || "—"}
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
                  <div
                    style={{
                      border: "1px dashed #ccc",
                      borderRadius: 12,
                      padding: 12,
                      background: "white",
                      color: "#666",
                      fontSize: 13,
                    }}
                  >
                    No service addresses yet.
                  </div>
                )}
              </div>

              {showAddServiceAddress ? (
                <div style={{ marginTop: 14, ...panelStyle }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 1000 }}>Add Service Address</div>
                    <button type="button" onClick={() => setShowAddServiceAddress(false)} style={actionBtnStyle(false)}>
                      Close
                    </button>
                  </div>

                  <form
                    onSubmit={handleAddServiceAddress}
                    style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 760 }}
                  >
                    <div>
                      <label style={{ fontWeight: 900 }}>Label</label>
                      <input
                        value={serviceLabel}
                        onChange={(e) => setServiceLabel(e.target.value)}
                        placeholder="Home, Rental, Shop..."
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
                      <label style={{ fontWeight: 900 }}>Address Line 1</label>
                      <input
                        value={serviceAddressLine1}
                        onChange={(e) => setServiceAddressLine1(e.target.value)}
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
                      <label style={{ fontWeight: 900 }}>Address Line 2</label>
                      <input
                        value={serviceAddressLine2}
                        onChange={(e) => setServiceAddressLine2(e.target.value)}
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

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 10 }}>
                      <div>
                        <label style={{ fontWeight: 900 }}>City</label>
                        <input
                          value={serviceCity}
                          onChange={(e) => setServiceCity(e.target.value)}
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
                        <label style={{ fontWeight: 900 }}>State</label>
                        <input
                          value={serviceState}
                          onChange={(e) => setServiceState(e.target.value)}
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
                        <label style={{ fontWeight: 900 }}>Postal Code</label>
                        <input
                          value={servicePostalCode}
                          onChange={(e) => setServicePostalCode(e.target.value)}
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
                    </div>

                    <div>
                      <label style={{ fontWeight: 900 }}>Notes</label>
                      <textarea
                        value={serviceNotes}
                        onChange={(e) => setServiceNotes(e.target.value)}
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
                        checked={serviceIsPrimary}
                        onChange={(e) => setServiceIsPrimary(e.target.checked)}
                      />
                      <span style={{ fontWeight: 900 }}>Set as primary service address</span>
                    </label>

                    {serviceAddressError ? <div style={{ color: "red" }}>{serviceAddressError}</div> : null}

                    <button type="submit" disabled={savingAddress} style={actionBtnStyle(true)}>
                      {savingAddress ? "Saving..." : "Add Address"}
                    </button>
                  </form>
                </div>
              ) : null}
            </div>

            {/* Call Logs (add collapsed) + history always visible */}
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>Call Logs</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                    Add form stays hidden until clicked.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddCallLog((v) => !v);
                    setNewCallLogError("");
                    setShowCreateTicket(false);
                    setShowAddServiceAddress(false);
                    setIsEditMode(false);
                  }}
                  style={actionBtnStyle(false)}
                >
                  {showAddCallLog ? "Close" : "+ Add Call Log"}
                </button>
              </div>

              {showAddCallLog ? (
                <div style={{ marginTop: 14, ...panelStyle }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 1000 }}>Add Call Log</div>
                    <button type="button" onClick={() => setShowAddCallLog(false)} style={actionBtnStyle(false)}>
                      Close
                    </button>
                  </div>

                  <form onSubmit={handleAddCallLog} style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 760 }}>
                    <div>
                      <label style={{ fontWeight: 900 }}>Call Type</label>
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
                      <label style={{ fontWeight: 900 }}>Direction</label>
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
                      <label style={{ fontWeight: 900 }}>Summary</label>
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
                      <label style={{ fontWeight: 900 }}>Details</label>
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
                        <label style={{ fontWeight: 900 }}>Follow-up Note</label>
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

                    {newCallLogError ? <div style={{ color: "red" }}>{newCallLogError}</div> : null}

                    <button type="submit" disabled={savingCallLog} style={actionBtnStyle(true)}>
                      {savingCallLog ? "Saving..." : "Add Call Log"}
                    </button>
                  </form>
                </div>
              ) : null}

              {/* Call History */}
              <div style={{ marginTop: 14 }}>
                {callLogsLoading ? <p>Loading call history...</p> : null}
                {callLogError ? <p style={{ color: "red" }}>{callLogError}</p> : null}

                {!callLogsLoading && !callLogError && callLogs.length === 0 ? (
                  <div
                    style={{
                      border: "1px dashed #ccc",
                      borderRadius: 12,
                      padding: 12,
                      background: "white",
                      color: "#666",
                      fontSize: 13,
                    }}
                  >
                    No call logs yet.
                  </div>
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
                        <div style={{ fontWeight: 1000 }}>{log.summary}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                          {log.callType} • {log.direction}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>
                          {log.details || "No additional details."}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                          Visible to Tech: {String(log.visibleToTech)} • Follow-up: {String(log.followUpNeeded)}
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
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}