"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { ServiceTicket } from "../../src/types/service-ticket";

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

export default function ServiceTicketsPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "new" | "scheduled" | "in_progress" | "follow_up" | "completed" | "cancelled"
  >("all");
  const [assignedFilter, setAssignedFilter] = useState<"all" | "assigned" | "unassigned">(
    "all"
  );
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "scheduled" | "unscheduled">(
    "all"
  );

  useEffect(() => {
    async function loadTickets() {
      try {
        const q = query(
          collection(db, "serviceTickets"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);

        const items: ServiceTicket[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

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
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load service tickets.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) {
        return false;
      }

      const isAssigned = Boolean(ticket.assignedTechnicianId || ticket.assignedTechnicianName);
      if (assignedFilter === "assigned" && !isAssigned) {
        return false;
      }
      if (assignedFilter === "unassigned" && isAssigned) {
        return false;
      }

      const isScheduled = Boolean(
        ticket.scheduledDate || ticket.scheduledStartTime || ticket.scheduledEndTime
      );
      if (scheduleFilter === "scheduled" && !isScheduled) {
        return false;
      }
      if (scheduleFilter === "unscheduled" && isScheduled) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

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
  }, [tickets, searchText, statusFilter, assignedFilter, scheduleFilter]);

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
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
              Service Tickets
            </h1>
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
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as
                      | "all"
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
                onChange={(e) =>
                  setAssignedFilter(
                    e.target.value as "all" | "assigned" | "unassigned"
                  )
                }
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
                onChange={(e) =>
                  setScheduleFilter(
                    e.target.value as "all" | "scheduled" | "unscheduled"
                  )
                }
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
            <div style={{ fontSize: "13px", color: "#666" }}>
              Showing {filteredTickets.length} of {tickets.length} tickets
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchText("");
                setStatusFilter("all");
                setAssignedFilter("all");
                setScheduleFilter("all");
              }}
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

        {loading ? <p>Loading service tickets...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && filteredTickets.length === 0 ? (
          <p>No matching service tickets found.</p>
        ) : null}

        {!loading && !error && filteredTickets.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredTickets.map((ticket) => (
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
                }}
              >
                <div style={{ fontWeight: 700 }}>{ticket.issueSummary}</div>

                <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                  Customer: {ticket.customerDisplayName}
                </div>

                <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                  {ticket.serviceAddressLine1}
                </div>

                <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                  {ticket.serviceCity}, {ticket.serviceState}{" "}
                  {ticket.servicePostalCode}
                </div>

                <div style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>
                  Status: {getStatusLabel(ticket.status)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Schedule: {getScheduleText(ticket)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Estimated Duration: {ticket.estimatedDurationMinutes} min
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Assigned To: {ticket.assignedTechnicianName || "Unassigned"}
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}