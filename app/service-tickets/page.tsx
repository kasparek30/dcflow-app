// app/service-tickets/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { ServiceTicket } from "../../src/types/service-ticket";

type StatusFilter =
  | "all"
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "cancelled";

function getStatusLabel(status: ServiceTicket["status"]) {
  switch (status) {
    case "new":
      return "New";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "follow_up":
      return "Follow Up";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function getScheduleText(ticket: ServiceTicket) {
  if (!ticket.scheduledDate && !ticket.scheduledStartTime && !ticket.scheduledEndTime) {
    return "Unscheduled";
  }

  const datePart = ticket.scheduledDate || "No date";
  const startPart = ticket.scheduledStartTime || "—";
  const endPart = ticket.scheduledEndTime || "—";

  return `${datePart} • ${startPart} - ${endPart}`;
}

function normalize(s: unknown) {
  return String(s || "").trim().toLowerCase();
}

function isAssigned(ticket: ServiceTicket) {
  return Boolean(ticket.assignedTechnicianId || ticket.assignedTechnicianName);
}

function statusRankForSort(status: string) {
  // Your desired “work queue” feel:
  // Unassigned/new on top handled separately, then:
  // follow_up -> scheduled -> in_progress -> completed -> cancelled
  const s = normalize(status);
  if (s === "new") return 0;
  if (s === "follow_up") return 1;
  if (s === "scheduled") return 2;
  if (s === "in_progress") return 3;
  if (s === "completed") return 4;
  if (s === "cancelled") return 5;
  return 99;
}

function safeStr(x: unknown) {
  return String(x ?? "");
}

export default function ServiceTicketsPage() {
  const { appUser } = useAuthContext();

  const role = String(appUser?.role || "");
  const isFieldUser = role === "technician" || role === "helper" || role === "apprentice";

  const defaultStatus: StatusFilter = isFieldUser ? "new" : "all";
  const defaultHideCompleted = isFieldUser ? true : false;

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");

  // ✅ default status filter for techs = New
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(defaultStatus);

  const [assignedFilter, setAssignedFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "scheduled" | "unscheduled">("all");

  // ✅ new toggles
  const [hideCompleted, setHideCompleted] = useState<boolean>(defaultHideCompleted);
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);

  useEffect(() => {
    async function loadTickets() {
      try {
        const q = query(collection(db, "serviceTickets"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const items: ServiceTicket[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            id: docSnap.id,
            customerId: data.customerId ?? "",
            customerDisplayName: data.customerDisplayName ?? "",
            serviceAddressId: data.serviceAddressId ?? undefined,
            serviceAddressLabel: data.serviceAddressLabel ?? undefined,
            serviceAddressLine1: data.serviceAddressLine1 ?? "",
            serviceAddressLine2: data.serviceAddressLine2 ?? undefined,
            serviceCity: data.serviceCity ?? "",
            serviceState: data.serviceState ?? "",
            servicePostalCode: data.servicePostalCode ?? "",
            issueSummary: data.issueSummary ?? "",
            issueDetails: data.issueDetails ?? undefined,
            status: data.status ?? "new",
            estimatedDurationMinutes: data.estimatedDurationMinutes ?? 0,
            scheduledDate: data.scheduledDate ?? undefined,
            scheduledStartTime: data.scheduledStartTime ?? undefined,
            scheduledEndTime: data.scheduledEndTime ?? undefined,
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,
            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setTickets(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load service tickets.");
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const base = tickets.filter((ticket) => {
      const s = normalize(ticket.status);

      // ✅ hide completed (and cancelled) convenience
      if (hideCompleted && (s === "completed" || s === "cancelled")) return false;

      // ✅ Available tickets toggle:
      // - unassigned
      // - status in [new, scheduled] (you can extend later)
      // - not completed/cancelled
      if (availableOnly) {
        const assigned = isAssigned(ticket);
        if (assigned) return false;
        if (!(s === "new" || s === "scheduled")) return false;
      }

      // status filter
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;

      // assigned filter
      const assigned = isAssigned(ticket);
      if (assignedFilter === "assigned" && !assigned) return false;
      if (assignedFilter === "unassigned" && assigned) return false;

      // schedule filter
      const scheduled = Boolean(ticket.scheduledDate || ticket.scheduledStartTime || ticket.scheduledEndTime);
      if (scheduleFilter === "scheduled" && !scheduled) return false;
      if (scheduleFilter === "unscheduled" && scheduled) return false;

      // search
      if (!normalizedSearch) return true;

      const haystack = [
        ticket.issueSummary,
        ticket.issueDetails,
        ticket.customerDisplayName,
        ticket.serviceAddressLabel,
        ticket.serviceAddressLine1,
        ticket.serviceAddressLine2,
        ticket.serviceCity,
        ticket.serviceState,
        ticket.servicePostalCode,
        ticket.assignedTechnicianName,
        ticket.assignedTechnicianId,
        ticket.scheduledDate,
        ticket.scheduledStartTime,
        ticket.scheduledEndTime,
        ticket.internalNotes,
        ticket.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    // ✅ Sort rules:
    // 1) Unassigned first
    // 2) New before anything else
    // 3) Then by status rank
    // 4) Then createdAt desc fallback (we don't have a real date object; string compare ok-ish for ISO)
    const sorted = [...base].sort((a, b) => {
      const aAssigned = isAssigned(a);
      const bAssigned = isAssigned(b);

      if (aAssigned !== bAssigned) return aAssigned ? 1 : -1; // unassigned first

      const aStatus = normalize(a.status);
      const bStatus = normalize(b.status);

      const aIsNew = aStatus === "new";
      const bIsNew = bStatus === "new";
      if (aIsNew !== bIsNew) return aIsNew ? -1 : 1;

      const ra = statusRankForSort(aStatus);
      const rb = statusRankForSort(bStatus);
      if (ra !== rb) return ra - rb;

      const ac = safeStr(a.createdAt);
      const bc = safeStr(b.createdAt);
      // newer first
      return bc.localeCompare(ac);
    });

    return sorted;
  }, [
    tickets,
    searchText,
    statusFilter,
    assignedFilter,
    scheduleFilter,
    hideCompleted,
    availableOnly,
  ]);

  function clearFilters() {
    setSearchText("");
    setAssignedFilter("all");
    setScheduleFilter("all");

    // Important: reset to role-based defaults
    setStatusFilter(defaultStatus);
    setHideCompleted(defaultHideCompleted);

    // keep availableOnly off unless you want it sticky
    setAvailableOnly(false);
  }

  return (
    <ProtectedPage fallbackTitle="Service Tickets">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Service Tickets</h1>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Search by customer, issue, address, technician, status, or schedule.
            </p>
          </div>

          <Link
            href="/service-tickets/new"
            style={{
              padding: "8px 14px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            New Service Ticket
          </Link>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            background: "#fafafa",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <div>
              <label>Search</label>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Issue, customer, address, tech, date..."
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="follow_up">Follow Up</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label>Assignment</label>
              <select
                value={assignedFilter}
                onChange={(e) => setAssignedFilter(e.target.value as "all" | "assigned" | "unassigned")}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              >
                <option value="all">All Tickets</option>
                <option value="assigned">Assigned Only</option>
                <option value="unassigned">Unassigned Only</option>
              </select>
            </div>

            <div>
              <label>Schedule</label>
              <select
                value={scheduleFilter}
                onChange={(e) => setScheduleFilter(e.target.value as "all" | "scheduled" | "unscheduled")}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px",
                  marginTop: "4px",
                }}
              >
                <option value="all">All Tickets</option>
                <option value="scheduled">Scheduled Only</option>
                <option value="unscheduled">Unscheduled Only</option>
              </select>
            </div>
          </div>

          {/* ✅ new quick toggles row */}
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                />
                <span style={{ fontSize: "13px" }}>Available Tickets</span>
              </label>

              <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={hideCompleted}
                  onChange={(e) => setHideCompleted(e.target.checked)}
                />
                <span style={{ fontSize: "13px" }}>Hide completed</span>
              </label>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "13px", color: "#666" }}>
                Showing {filteredTickets.length} of {tickets.length}
              </div>

              <button
                type="button"
                onClick={clearFilters}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {loading ? <p>Loading service tickets...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && filteredTickets.length === 0 ? <p>No matching service tickets found.</p> : null}

        {!loading && !error && filteredTickets.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredTickets.map((ticket) => {
              const assigned = isAssigned(ticket);
              const statusText = getStatusLabel(ticket.status);

              return (
                <Link
                  key={ticket.id}
                  href={`/service-tickets/${ticket.id}`}
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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 800 }}>{ticket.issueSummary}</div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {!assigned ? (
                        <div
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid #d8e6ff",
                            background: "#eef5ff",
                            color: "#1b4fbf",
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Unassigned
                        </div>
                      ) : null}

                      <div
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #eee",
                          background: "#fafafa",
                          color: "#444",
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {statusText}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "6px", fontSize: "14px", color: "#555" }}>
                    Customer: {ticket.customerDisplayName || "—"}
                  </div>

                  <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                    {ticket.serviceAddressLine1 || "—"}
                  </div>

                  <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                    {ticket.serviceCity || "—"}, {ticket.serviceState || "—"} {ticket.servicePostalCode || ""}
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>
                    Schedule: {getScheduleText(ticket)}
                  </div>

                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                    Estimated Duration: {ticket.estimatedDurationMinutes} min
                  </div>

                  {/* Keep “Assigned To” but make it clean (no big badge) */}
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                    Assigned To: {ticket.assignedTechnicianName || (assigned ? "Assigned" : "—")}
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