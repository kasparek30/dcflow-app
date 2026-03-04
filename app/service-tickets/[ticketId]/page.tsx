"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceTicket } from "../../../src/types/service-ticket";
import type { AppUser } from "../../../src/types/app-user";

type ServiceTicketDetailPageProps = {
  params: Promise<{
    ticketId: string;
  }>;
};

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUser["role"];
};

export default function ServiceTicketDetailPage({
  params,
}: ServiceTicketDetailPageProps) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState("");
  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [error, setError] = useState("");

  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techniciansError, setTechniciansError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [status, setStatus] = useState<
    "new" | "scheduled" | "in_progress" | "follow_up" | "completed" | "cancelled"
  >("new");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("60");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [selectedTechnicianUid, setSelectedTechnicianUid] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    async function loadTicket() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.ticketId;
        setTicketId(id);

        const ticketRef = doc(db, "serviceTickets", id);
        const snap = await getDoc(ticketRef);

        if (!snap.exists()) {
          setError("Service ticket not found.");
          setLoading(false);
          return;
        }

        const data = snap.data();

        const item: ServiceTicket = {
          id: snap.id,
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

        setTicket(item);

        setStatus(item.status);
        setEstimatedDurationMinutes(String(item.estimatedDurationMinutes || 60));
        setScheduledDate(item.scheduledDate ?? "");
        setScheduledStartTime(item.scheduledStartTime ?? "");
        setScheduledEndTime(item.scheduledEndTime ?? "");
        setSelectedTechnicianUid(item.assignedTechnicianId ?? "");
        setInternalNotes(item.internalNotes ?? "");
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load service ticket.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadTicket();
  }, [params]);

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

  const selectedTechnician = useMemo(() => {
    return technicians.find((tech) => tech.uid === selectedTechnicianUid) ?? null;
  }, [technicians, selectedTechnicianUid]);

  async function handleSaveUpdates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!ticket) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        scheduledDate: scheduledDate || null,
        scheduledStartTime: scheduledStartTime || null,
        scheduledEndTime: scheduledEndTime || null,
        assignedTechnicianId: selectedTechnician ? selectedTechnician.uid : null,
        assignedTechnicianName: selectedTechnician
          ? selectedTechnician.displayName
          : null,
        internalNotes: internalNotes.trim() || null,
        updatedAt: nowIso,
      });

      setTicket({
        ...ticket,
        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),
        scheduledDate: scheduledDate || undefined,
        scheduledStartTime: scheduledStartTime || undefined,
        scheduledEndTime: scheduledEndTime || undefined,
        assignedTechnicianId: selectedTechnician?.uid || undefined,
        assignedTechnicianName: selectedTechnician?.displayName || undefined,
        internalNotes: internalNotes.trim() || undefined,
        updatedAt: nowIso,
      });

      setSaveSuccess("Ticket updates saved successfully.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to save ticket updates.");
      }
    } finally {
      setSaving(false);
    }
  }

  function getStatusLabel(value: ServiceTicket["status"]) {
    switch (value) {
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
        return value;
    }
  }

  function getScheduleSummary() {
    if (!ticket) return "—";

    if (!ticket.scheduledDate && !ticket.scheduledStartTime && !ticket.scheduledEndTime) {
      return "Not scheduled yet";
    }

    const datePart = ticket.scheduledDate || "No date";
    const startPart = ticket.scheduledStartTime || "—";
    const endPart = ticket.scheduledEndTime || "—";

    return `${datePart} • ${startPart} - ${endPart}`;
  }

  return (
    <ProtectedPage fallbackTitle="Service Ticket Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading service ticket...</p> : null}

        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && ticket ? (
          <div style={{ display: "grid", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 700 }}>
                  {ticket.issueSummary}
                </h1>
                <p style={{ marginTop: "6px", color: "#666" }}>
                  Ticket ID: {ticketId}
                </p>
              </div>

              <Link
                href="/service-tickets"
                style={{
                  padding: "8px 14px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                Back to Tickets
              </Link>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Customer
              </h2>
              <p>
                <strong>Customer Name:</strong> {ticket.customerDisplayName}
              </p>
              <p>
                <strong>Customer ID:</strong> {ticket.customerId}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Service Address
              </h2>
              <p>
                <strong>Label:</strong> {ticket.serviceAddressLabel || "—"}
              </p>
              <p>{ticket.serviceAddressLine1 || "—"}</p>
              <p>{ticket.serviceAddressLine2 || ""}</p>
              <p>
                {ticket.serviceCity}, {ticket.serviceState} {ticket.servicePostalCode}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Ticket Overview
              </h2>
              <p>
                <strong>Current Status:</strong> {getStatusLabel(ticket.status)}
              </p>
              <p>
                <strong>Estimated Duration:</strong> {ticket.estimatedDurationMinutes} minutes
              </p>
              <p>
                <strong>Schedule:</strong> {getScheduleSummary()}
              </p>
              <p style={{ marginTop: "10px" }}>
                <strong>Issue Details:</strong>
              </p>
              <p>{ticket.issueDetails || "No additional issue details."}</p>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>
                Update Ticket
              </h2>

              {techniciansLoading ? <p>Loading technicians...</p> : null}
              {techniciansError ? (
                <p style={{ color: "red", marginBottom: "12px" }}>{techniciansError}</p>
              ) : null}

              <form
                onSubmit={handleSaveUpdates}
                style={{ display: "grid", gap: "12px", maxWidth: "800px" }}
              >
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
                  <label>Assigned Technician</label>
                  <select
                    value={selectedTechnicianUid}
                    onChange={(e) => setSelectedTechnicianUid(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
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

                <div>
                  <label>Internal Notes</label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                {saveError ? <p style={{ color: "red" }}>{saveError}</p> : null}
                {saveSuccess ? <p style={{ color: "green" }}>{saveSuccess}</p> : null}

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
                  {saving ? "Saving..." : "Save Ticket Updates"}
                </button>
              </form>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Assignment Snapshot
              </h2>
              <p>
                <strong>Assigned Technician:</strong>{" "}
                {ticket.assignedTechnicianName || "Not assigned yet"}
              </p>
              <p>
                <strong>Assigned Technician ID:</strong> {ticket.assignedTechnicianId || "—"}
              </p>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                System
              </h2>
              <p>
                <strong>Active:</strong> {String(ticket.active)}
              </p>
              <p>
                <strong>Created At:</strong> {ticket.createdAt || "—"}
              </p>
              <p>
                <strong>Updated At:</strong> {ticket.updatedAt || "—"}
              </p>
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}