// app/service-tickets/[ticketId]/visits/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from "firebase/firestore";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type { AppUser } from "../../../../src/types/app-user";
import type {
  ServiceTicketVisit,
  ServiceTicketVisitOutcome,
} from "../../../../src/types/service-ticket-visit";

type Props = {
  params: Promise<{ ticketId: string }>;
};

type ServiceTicketLite = {
  id: string;
  customerId: string;
  customerDisplayName: string;
  issueSummary: string;
  status: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  serviceAddressLine1?: string;
};

function formatDateLabel(isoDate: string) {
  const safe = new Date(`${isoDate}T12:00:00`);
  return safe.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function formatOutcome(outcome: ServiceTicketVisitOutcome) {
  switch (outcome) {
    case "completed":
      return "Completed";
    case "follow_up":
      return "Follow Up";
    case "cancelled":
      return "Cancelled";
    case "partial_complete":
      return "Partial Complete";
    default:
      return outcome;
  }
}

export default function ServiceTicketVisitsPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [ticketId, setTicketId] = useState("");
  const [ticket, setTicket] = useState<ServiceTicketLite | null>(null);
  const [visits, setVisits] = useState<ServiceTicketVisit[]>([]);
  const [techUsers, setTechUsers] = useState<AppUser[]>([]);
  const [supportUsers, setSupportUsers] = useState<AppUser[]>([]);

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const todayIso = new Date().toISOString().slice(0, 10);

  const [visitDate, setVisitDate] = useState(todayIso);
  const [leadTechnicianId, setLeadTechnicianId] = useState("");
  const [supportUserId, setSupportUserId] = useState("");

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [hoursWorked, setHoursWorked] = useState(1);
  const [billableHours, setBillableHours] = useState(1);

  const [materialsSummary, setMaterialsSummary] = useState("");
  const [materialsCost, setMaterialsCost] = useState(0);

  const [outcome, setOutcome] = useState<ServiceTicketVisitOutcome>("completed");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function loadPage() {
      try {
        const resolved = await params;
        const nextTicketId = resolved.ticketId;
        setTicketId(nextTicketId);

        const [ticketSnap, visitsSnap, usersSnap] = await Promise.all([
          getDoc(doc(db, "serviceTickets", nextTicketId)),
          getDocs(query(collection(db, "serviceTicketVisits"))),
          getDocs(query(collection(db, "users"))),
        ]);

        if (!ticketSnap.exists()) {
          setError("Service ticket not found.");
          setLoading(false);
          return;
        }

        const ticketData = ticketSnap.data();

        const ticketItem: ServiceTicketLite = {
          id: ticketSnap.id,
          customerId: ticketData.customerId ?? "",
          customerDisplayName: ticketData.customerDisplayName ?? "",
          issueSummary: ticketData.issueSummary ?? "",
          status: ticketData.status ?? "new",
          assignedTechnicianId: ticketData.assignedTechnicianId ?? undefined,
          assignedTechnicianName: ticketData.assignedTechnicianName ?? undefined,
          serviceAddressLine1: ticketData.serviceAddressLine1 ?? undefined,
        };

        const allUsers: AppUser[] = usersSnap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            uid: data.uid ?? docSnap.id,
            displayName: data.displayName ?? "Unnamed User",
            email: data.email ?? "",
            role: data.role ?? "technician",
            active: data.active ?? true,
            laborRoleType: data.laborRoleType ?? undefined,
            preferredTechnicianId: data.preferredTechnicianId ?? null,
            preferredTechnicianName: data.preferredTechnicianName ?? null,
            holidayEligible: data.holidayEligible ?? undefined,
            defaultDailyHolidayHours: data.defaultDailyHolidayHours ?? undefined,
          };
        });

        const nextTechUsers = allUsers
          .filter((u) => u.active && u.role === "technician")
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        const nextSupportUsers = allUsers
          .filter(
            (u) => u.active && (u.role === "helper" || u.role === "apprentice")
          )
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        const nextVisits: ServiceTicketVisit[] = visitsSnap.docs
          .map((docSnap) => {
            const data = docSnap.data();

            return {
              id: docSnap.id,
              serviceTicketId: data.serviceTicketId ?? "",
              customerId: data.customerId ?? undefined,
              customerDisplayName: data.customerDisplayName ?? undefined,
              visitDate: data.visitDate ?? "",
              leadTechnicianId: data.leadTechnicianId ?? "",
              leadTechnicianName: data.leadTechnicianName ?? "",
              supportUserId: data.supportUserId ?? undefined,
              supportUserName: data.supportUserName ?? undefined,
              startTime: data.startTime ?? undefined,
              endTime: data.endTime ?? undefined,
              hoursWorked: typeof data.hoursWorked === "number" ? data.hoursWorked : 0,
              billableHours:
                typeof data.billableHours === "number" ? data.billableHours : 0,
              materialsSummary: data.materialsSummary ?? undefined,
              materialsCost:
                typeof data.materialsCost === "number" ? data.materialsCost : 0,
              outcome: data.outcome ?? "completed",
              notes: data.notes ?? undefined,
              createdAt: data.createdAt ?? undefined,
              updatedAt: data.updatedAt ?? undefined,
            };
          })
          .filter((visit) => visit.serviceTicketId === nextTicketId)
          .sort((a, b) => {
            const byDate = b.visitDate.localeCompare(a.visitDate);
            if (byDate !== 0) return byDate;
            return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
          });

        setTicket(ticketItem);
        setVisits(nextVisits);
        setTechUsers(nextTechUsers);
        setSupportUsers(nextSupportUsers);

        setLeadTechnicianId(ticketItem.assignedTechnicianId ?? "");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load ticket visits."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [params]);

  const selectedLeadTech = useMemo(() => {
    return techUsers.find((u) => u.uid === leadTechnicianId) ?? null;
  }, [techUsers, leadTechnicianId]);

  const selectedSupportUser = useMemo(() => {
    return supportUsers.find((u) => u.uid === supportUserId) ?? null;
  }, [supportUsers, supportUserId]);

  const totals = useMemo(() => {
    const totalHoursWorked = visits.reduce((sum, visit) => sum + visit.hoursWorked, 0);
    const totalBillableHours = visits.reduce(
      (sum, visit) => sum + visit.billableHours,
      0
    );
    const totalMaterialsCost = visits.reduce(
      (sum, visit) => sum + (visit.materialsCost ?? 0),
      0
    );

    return {
      totalHoursWorked,
      totalBillableHours,
      totalMaterialsCost,
    };
  }, [visits]);

  async function handleAddVisit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!ticket) {
      setError("Missing ticket context.");
      return;
    }

    if (!visitDate) {
      setError("Visit date is required.");
      return;
    }

    if (!selectedLeadTech) {
      setError("Lead technician is required.");
      return;
    }

    if (hoursWorked <= 0) {
      setError("Hours worked must be greater than 0.");
      return;
    }

    if (billableHours < 0) {
      setError("Billable hours cannot be negative.");
      return;
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const visitPayload = {
        serviceTicketId: ticket.id,
        customerId: ticket.customerId || null,
        customerDisplayName: ticket.customerDisplayName || null,

        visitDate,

        leadTechnicianId: selectedLeadTech.uid,
        leadTechnicianName: selectedLeadTech.displayName,

        supportUserId: selectedSupportUser?.uid || null,
        supportUserName: selectedSupportUser?.displayName || null,

        startTime: startTime || null,
        endTime: endTime || null,

        hoursWorked,
        billableHours,

        materialsSummary: materialsSummary.trim() || null,
        materialsCost,

        outcome,
        notes: notes.trim() || null,

        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const docRef = await addDoc(collection(db, "serviceTicketVisits"), visitPayload);

      if (
        outcome === "follow_up" ||
        outcome === "completed" ||
        outcome === "cancelled"
      ) {
        await updateDoc(doc(db, "serviceTickets", ticket.id), {
          status: outcome,
          assignedTechnicianId: selectedLeadTech.uid,
          assignedTechnicianName: selectedLeadTech.displayName,
          updatedAt: nowIso,
        });

        setTicket({
          ...ticket,
          status: outcome,
          assignedTechnicianId: selectedLeadTech.uid,
          assignedTechnicianName: selectedLeadTech.displayName,
        });
      }

      const newVisit: ServiceTicketVisit = {
        id: docRef.id,
        serviceTicketId: ticket.id,
        customerId: ticket.customerId || undefined,
        customerDisplayName: ticket.customerDisplayName || undefined,
        visitDate,
        leadTechnicianId: selectedLeadTech.uid,
        leadTechnicianName: selectedLeadTech.displayName,
        supportUserId: selectedSupportUser?.uid || undefined,
        supportUserName: selectedSupportUser?.displayName || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        hoursWorked,
        billableHours,
        materialsSummary: materialsSummary.trim() || undefined,
        materialsCost,
        outcome,
        notes: notes.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setVisits((prev) =>
        [newVisit, ...prev].sort((a, b) => {
          const byDate = b.visitDate.localeCompare(a.visitDate);
          if (byDate !== 0) return byDate;
          return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
        })
      );

      setVisitDate(todayIso);
      setStartTime("");
      setEndTime("");
      setHoursWorked(1);
      setBillableHours(1);
      setMaterialsSummary("");
      setMaterialsCost(0);
      setOutcome("completed");
      setNotes("");
      setSupportUserId("");

      setSaveMsg("Visit session added.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add visit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Service Ticket Visits">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              Service Ticket Visits
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Track each actual trip separately for payroll, while rolling labor/materials up into one ticket.
            </p>
          </div>

          <Link
            href={ticketId ? `/service-tickets/${ticketId}` : "/service-tickets"}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
              height: "fit-content",
            }}
          >
            Back to Ticket
          </Link>
        </div>

        {loading ? <p style={{ marginTop: "16px" }}>Loading ticket visits...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ marginTop: "16px", color: "green" }}>{saveMsg}</p> : null}

        {!loading && ticket ? (
          <>
            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "900px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                {ticket.issueSummary}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Customer: {ticket.customerDisplayName || "—"}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                Ticket Status: {ticket.status}
              </div>
              {ticket.serviceAddressLine1 ? (
                <div style={{ fontSize: "13px", color: "#555" }}>
                  Address: {ticket.serviceAddressLine1}
                </div>
              ) : null}
              <div style={{ fontSize: "12px", color: "#666" }}>
                Ticket ID: {ticket.id}
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "900px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                Ticket Roll-Up Totals
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Total Hours Worked: {totals.totalHoursWorked.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Total Billable Hours: {totals.totalBillableHours.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: "#444" }}>
                Total Materials Cost: ${totals.totalMaterialsCost.toFixed(2)}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Billing can later use these accumulated visit totals to create one invoice for the customer.
              </div>
            </div>

            <form
              onSubmit={handleAddVisit}
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "900px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: "18px" }}>
                Add Visit Session
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Visit Date</label>
                  <input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700 }}>Outcome</label>
                  <select
                    value={outcome}
                    onChange={(e) =>
                      setOutcome(e.target.value as ServiceTicketVisitOutcome)
                    }
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  >
                    <option value="completed">Completed</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="partial_complete">Partial Complete</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Lead Technician</label>
                  <select
                    value={leadTechnicianId}
                    onChange={(e) => setLeadTechnicianId(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  >
                    <option value="">Select technician</option>
                    {techUsers.map((user) => (
                      <option key={user.uid} value={user.uid}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 700 }}>
                    Support Helper / Apprentice
                  </label>
                  <select
                    value={supportUserId}
                    onChange={(e) => setSupportUserId(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  >
                    <option value="">No support user</option>
                    {supportUsers.map((user) => (
                      <option key={user.uid} value={user.uid}>
                        {user.displayName} ({user.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700 }}>End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Hours Worked</label>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={hoursWorked}
                    onChange={(e) => setHoursWorked(Number(e.target.value))}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700 }}>Billable Hours</label>
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={billableHours}
                    onChange={(e) => setBillableHours(Number(e.target.value))}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontWeight: 700 }}>Materials Summary</label>
                  <input
                    value={materialsSummary}
                    onChange={(e) => setMaterialsSummary(e.target.value)}
                    placeholder="Supply line, flange, disposal, faucet..."
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700 }}>Materials Cost</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={materialsCost}
                    onChange={(e) => setMaterialsCost(Number(e.target.value))}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>Visit Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                  }}
                />
              </div>

              <div style={{ fontSize: "12px", color: "#666" }}>
                Each visit is stored separately for payroll timing, while billable labor/materials accumulate under the same ticket for one final bill.
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                  width: "fit-content",
                  fontWeight: 800,
                }}
              >
                {saving ? "Saving..." : "Add Visit Session"}
              </button>
            </form>

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "900px",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: "18px", marginBottom: "12px" }}>
                Visit History
              </div>

              {visits.length === 0 ? (
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
                  No visits recorded yet.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {visits.map((visit) => (
                    <div
                      key={visit.id}
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "white",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {formatDateLabel(visit.visitDate)} • {formatOutcome(visit.outcome)}
                      </div>

                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                        Lead Tech: {visit.leadTechnicianName}
                      </div>

                      {visit.supportUserName ? (
                        <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                          Support: {visit.supportUserName}
                        </div>
                      ) : null}

                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                        Hours Worked: {visit.hoursWorked.toFixed(2)} • Billable Hours:{" "}
                        {visit.billableHours.toFixed(2)}
                      </div>

                      {(visit.startTime || visit.endTime) ? (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                          Time Window: {visit.startTime || "—"} - {visit.endTime || "—"}
                        </div>
                      ) : null}

                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                        Materials Cost: ${(visit.materialsCost ?? 0).toFixed(2)}
                      </div>

                      {visit.materialsSummary ? (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                          Materials: {visit.materialsSummary}
                        </div>
                      ) : null}

                      {visit.notes ? (
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                          Notes: {visit.notes}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}