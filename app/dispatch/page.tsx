"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type {
  ServiceTicket,
  ServiceTicketStatus,
} from "../../src/types/service-ticket";
import type { AppUser } from "../../src/types/app-user";

type TicketColumn = {
  key: ServiceTicketStatus;
  label: string;
};

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUser["role"];
};

type TicketDraft = {
  status: ServiceTicketStatus;
  assignedTechnicianId: string;
};

const COLUMNS: TicketColumn[] = [
  { key: "new", label: "New" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In Progress" },
  { key: "follow_up", label: "Follow Up" },
  { key: "completed", label: "Completed" },
  { key: "invoiced", label: "Invoiced" },
  { key: "cancelled", label: "Cancelled" },
];

const RECENT_HISTORY_DAYS = 7;

function createEmptyGroupedTickets(): Record<ServiceTicketStatus, ServiceTicket[]> {
  return {
    new: [],
    scheduled: [],
    in_progress: [],
    follow_up: [],
    completed: [],
    invoiced: [],
    cancelled: [],
  };
}

export default function DispatchBoardPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState("");

  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techniciansError, setTechniciansError] = useState("");

  const [drafts, setDrafts] = useState<Record<string, TicketDraft>>({});
  const [savingTicketId, setSavingTicketId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    async function loadTickets() {
      try {
        const snap = await getDocs(collection(db, "serviceTickets"));

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
            status: (data.status ?? "new") as ServiceTicketStatus,
            estimatedDurationMinutes: data.estimatedDurationMinutes ?? 0,
            scheduledDate: data.scheduledDate ?? undefined,
            scheduledStartTime: data.scheduledStartTime ?? undefined,
            scheduledEndTime: data.scheduledEndTime ?? undefined,
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,
            primaryTechnicianId: data.primaryTechnicianId ?? undefined,
            assignedTechnicianIds: Array.isArray(data.assignedTechnicianIds)
              ? data.assignedTechnicianIds
              : undefined,
            secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
            secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,
            helperIds: Array.isArray(data.helperIds) ? data.helperIds : undefined,
            helperNames: Array.isArray(data.helperNames) ? data.helperNames : undefined,
            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        items.sort((a, b) => {
          const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
          const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
          return bTime - aTime;
        });

        setTickets(items);

        const initialDrafts: Record<string, TicketDraft> = {};
        for (const ticket of items) {
          initialDrafts[ticket.id] = {
            status: ticket.status,
            assignedTechnicianId: ticket.assignedTechnicianId ?? "",
          };
        }
        setDrafts(initialDrafts);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load dispatch board.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  useEffect(() => {
    async function loadTechnicians() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: TechnicianOption[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data();

            return {
              uid: data.uid ?? docSnap.id,
              displayName: data.displayName ?? "Unnamed Technician",
              active: data.active ?? false,
              role: data.role ?? "technician",
            };
          })
          .filter((user) => user.role === "technician" && user.active);

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));

        setTechnicians(items);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setTechniciansError(err.message);
        } else {
          setTechniciansError("Failed to load technicians.");
        }
      } finally {
        setTechniciansLoading(false);
      }
    }

    loadTechnicians();
  }, []);

  const groupedTickets = useMemo(() => {
    const cutoffMs = Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000;

    const visibleTickets = tickets.filter((ticket) => {
      if (
        ticket.status !== "completed" &&
        ticket.status !== "cancelled" &&
        ticket.status !== "invoiced"
      ) {
        return true;
      }

      const timestampSource = ticket.updatedAt || ticket.createdAt;
      if (!timestampSource) {
        return false;
      }

      const timestamp = Date.parse(timestampSource);
      if (Number.isNaN(timestamp)) {
        return false;
      }

      return timestamp >= cutoffMs;
    });

    return COLUMNS.reduce<Record<ServiceTicketStatus, ServiceTicket[]>>(
      (acc, column) => {
        acc[column.key] = visibleTickets.filter(
          (ticket) => ticket.status === column.key
        );
        return acc;
      },
      createEmptyGroupedTickets()
    );
  }, [tickets]);

  function handleDraftChange(
    ticketId: string,
    field: keyof TicketDraft,
    value: string
  ) {
    setDrafts((prev) => ({
      ...prev,
      [ticketId]: {
        ...(prev[ticketId] ?? { status: "new", assignedTechnicianId: "" }),
        [field]: value as TicketDraft[keyof TicketDraft],
      },
    }));
  }

  async function handleSaveQuickUpdate(ticket: ServiceTicket) {
    if (ticket.status === "invoiced") {
      setSaveError("Invoiced tickets are locked and cannot be quick-edited from dispatch.");
      setSaveMessage("");
      return;
    }

    const draft = drafts[ticket.id];
    if (!draft) return;

    setSaveError("");
    setSaveMessage("");
    setSavingTicketId(ticket.id);

    try {
      const selectedTechnician =
        technicians.find((tech) => tech.uid === draft.assignedTechnicianId) ?? null;

      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: draft.status,
        assignedTechnicianId: selectedTechnician ? selectedTechnician.uid : null,
        assignedTechnicianName: selectedTechnician
          ? selectedTechnician.displayName
          : null,
        updatedAt: nowIso,
      });

      setTickets((prev) =>
        prev.map((item) =>
          item.id === ticket.id
            ? {
                ...item,
                status: draft.status,
                assignedTechnicianId: selectedTechnician?.uid || undefined,
                assignedTechnicianName:
                  selectedTechnician?.displayName || undefined,
                updatedAt: nowIso,
              }
            : item
        )
      );

      setSaveMessage(`Saved updates for "${ticket.issueSummary}".`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to save quick ticket update.");
      }
    } finally {
      setSavingTicketId("");
    }
  }

  function getScheduleText(ticket: ServiceTicket) {
    if (!ticket.scheduledDate && !ticket.scheduledStartTime && !ticket.scheduledEndTime) {
      return "Unscheduled";
    }

    const datePart = ticket.scheduledDate || "No date";
    const startPart = ticket.scheduledStartTime || "—";
    const endPart = ticket.scheduledEndTime || "—";

    return `${datePart} • ${startPart}-${endPart}`;
  }

  return (
    <ProtectedPage fallbackTitle="Dispatcher Board">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700 }}>
              Dispatcher Board
            </h1>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Completed, Invoiced, and Cancelled only show the last {RECENT_HISTORY_DAYS} days.
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

        {loading ? <p>Loading dispatcher board...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
        {techniciansLoading ? <p>Loading technicians...</p> : null}
        {techniciansError ? <p style={{ color: "red" }}>{techniciansError}</p> : null}
        {saveError ? <p style={{ color: "red" }}>{saveError}</p> : null}
        {saveMessage ? <p style={{ color: "green" }}>{saveMessage}</p> : null}

        {!loading && !error ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(260px, 1fr))`,
              gap: "12px",
              alignItems: "start",
              overflowX: "auto",
            }}
          >
            {COLUMNS.map((column) => (
              <div
                key={column.key}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "12px",
                  background: "#fafafa",
                  minHeight: "220px",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "16px",
                    marginBottom: "10px",
                  }}
                >
                  {column.label} ({groupedTickets[column.key].length})
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  {groupedTickets[column.key].length === 0 ? (
                    <div
                      style={{
                        border: "1px dashed #ccc",
                        borderRadius: "10px",
                        padding: "10px",
                        fontSize: "13px",
                        color: "#777",
                        background: "white",
                      }}
                    >
                      No tickets
                    </div>
                  ) : (
                    groupedTickets[column.key].map((ticket) => {
                      const isLocked = ticket.status === "invoiced";

                      const draft = drafts[ticket.id] ?? {
                        status: ticket.status,
                        assignedTechnicianId: ticket.assignedTechnicianId ?? "",
                      };

                      return (
                        <div
                          key={ticket.id}
                          style={{
                            border: "1px solid #ddd",
                            borderRadius: "10px",
                            padding: "10px",
                            background: "white",
                            opacity: isLocked ? 0.88 : 1,
                          }}
                        >
                          <Link
                            href={`/service-tickets/${ticket.id}`}
                            style={{
                              textDecoration: "none",
                              color: "inherit",
                              display: "block",
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: "14px" }}>
                              {ticket.issueSummary}
                            </div>

                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "12px",
                                color: "#555",
                              }}
                            >
                              {ticket.customerDisplayName}
                            </div>

                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "12px",
                                color: "#555",
                              }}
                            >
                              {ticket.serviceAddressLine1}
                            </div>

                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "12px",
                                color: "#555",
                              }}
                            >
                              {ticket.serviceCity}, {ticket.serviceState}
                            </div>

                            <div
                              style={{
                                marginTop: "6px",
                                fontSize: "12px",
                                color: "#777",
                              }}
                            >
                              Schedule: {getScheduleText(ticket)}
                            </div>
                          </Link>

                          <div
                            style={{
                              marginTop: "8px",
                              fontSize: "12px",
                              color: "#777",
                            }}
                          >
                            ETA: {ticket.estimatedDurationMinutes} min
                          </div>

                          {isLocked ? (
                            <div
                              style={{
                                marginTop: "10px",
                                padding: "8px 10px",
                                border: "1px solid #d6e4d6",
                                borderRadius: "8px",
                                background: "#f6fbf6",
                                fontSize: "12px",
                                color: "#2f5d2f",
                                fontWeight: 600,
                              }}
                            >
                              Locked: this ticket has been invoiced.
                            </div>
                          ) : null}

                          <div style={{ marginTop: "10px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: "12px",
                                marginBottom: "4px",
                              }}
                            >
                              Quick Status
                            </label>
                            <select
                              value={draft.status}
                              onChange={(e) =>
                                handleDraftChange(
                                  ticket.id,
                                  "status",
                                  e.target.value
                                )
                              }
                              disabled={isLocked}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "6px",
                                fontSize: "12px",
                              }}
                            >
                              <option value="new">New</option>
                              <option value="scheduled">Scheduled</option>
                              <option value="in_progress">In Progress</option>
                              <option value="follow_up">Follow Up</option>
                              <option value="completed">Completed</option>
                              <option value="invoiced">Invoiced</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>

                          <div style={{ marginTop: "10px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: "12px",
                                marginBottom: "4px",
                              }}
                            >
                              Assigned Tech
                            </label>
                            <select
                              value={draft.assignedTechnicianId}
                              onChange={(e) =>
                                handleDraftChange(
                                  ticket.id,
                                  "assignedTechnicianId",
                                  e.target.value
                                )
                              }
                              disabled={isLocked}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "6px",
                                fontSize: "12px",
                              }}
                            >
                              <option value="">Unassigned</option>
                              {technicians.map((tech) => (
                                <option key={tech.uid} value={tech.uid}>
                                  {tech.displayName}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSaveQuickUpdate(ticket)}
                            disabled={savingTicketId === ticket.id || isLocked}
                            style={{
                              marginTop: "10px",
                              padding: "8px 10px",
                              border: "1px solid #ccc",
                              borderRadius: "8px",
                              background: "white",
                              cursor: isLocked ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              fontSize: "12px",
                              width: "100%",
                            }}
                          >
                            {savingTicketId === ticket.id
                              ? "Saving..."
                              : isLocked
                                ? "Locked"
                                : "Save Quick Update"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}