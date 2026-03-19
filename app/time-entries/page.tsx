// app/time-entries/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { TimeEntry } from "../../src/types/time-entry";

type PayrollDay = {
  label: string;
  shortLabel: string;
  isoDate: string;
};

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMondayForWeekOffset(weekOffset: number) {
  const today = new Date();
  const base = new Date(today);
  base.setHours(12, 0, 0, 0);
  base.setDate(today.getDate() + weekOffset * 7);

  const day = base.getDay(); // Sun 0 ... Sat 6
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);

  return monday;
}

function buildPayrollWeekDays(weekOffset: number): PayrollDay[] {
  const monday = getMondayForWeekOffset(weekOffset);

  return [
    { label: "Monday", shortLabel: "Mon", isoDate: toIsoDate(monday) },
    {
      label: "Tuesday",
      shortLabel: "Tue",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1)),
    },
    {
      label: "Wednesday",
      shortLabel: "Wed",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2)),
    },
    {
      label: "Thursday",
      shortLabel: "Thu",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3)),
    },
    {
      label: "Friday",
      shortLabel: "Fri",
      isoDate: toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4)),
    },
  ];
}

function firstMeaningfulLine(notes?: string) {
  const raw = String(notes || "").trim();
  if (!raw) return "";
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  // Prefer a human line, not the AUTO_TIME header
  const preferred =
    lines.find((l) => l.startsWith("Customer:")) ||
    lines.find((l) => l.startsWith("Issue:")) ||
    lines.find((l) => l.startsWith("Outcome:")) ||
    lines.find((l) => !l.startsWith("AUTO_TIME_FROM_TRIP:"));

  return preferred || lines[0] || "";
}

function truncateLine(s: string, max = 120) {
  const x = (s || "").trim();
  if (x.length <= max) return x;
  return x.slice(0, max - 1) + "…";
}

function formatCategory(category: TimeEntry["category"]) {
  switch (category) {
    case "service_ticket":
      return "Service Ticket";
    case "project_stage":
      return "Project Stage";
    case "meeting":
      return "Meeting";
    case "shop":
      return "Shop";
    case "office":
      return "Office";
    case "pto":
      return "PTO";
    case "holiday":
      return "Holiday";
    case "manual_other":
      return "Manual Other";
    default:
      return category;
  }
}

function formatPayType(payType: TimeEntry["payType"]) {
  switch (payType) {
    case "regular":
      return "Regular";
    case "overtime":
      return "Overtime";
    case "pto":
      return "PTO";
    case "holiday":
      return "Holiday";
    default:
      return payType;
  }
}

function formatStatus(status: TimeEntry["entryStatus"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "exported":
      return "Exported";
    default:
      return status;
  }
}

function formatDisplayDate(isoDate: string) {
  const safeDate = new Date(`${isoDate}T12:00:00`);
  return safeDate.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

export default function TimeEntriesPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | TimeEntry["entryStatus"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | TimeEntry["category"]>("all");
  const [weekOffset, setWeekOffset] = useState(0);

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadEntries() {
      try {
        const q = query(collection(db, "timeEntries"), orderBy("entryDate", "desc"));
        const snap = await getDocs(q);

        const items: TimeEntry[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            employeeId: data.employeeId ?? "",
            employeeName: data.employeeName ?? "",
            employeeRole: data.employeeRole ?? "",
            laborRoleType: data.laborRoleType ?? undefined,

            entryDate: data.entryDate ?? "",
            weekStartDate: data.weekStartDate ?? "",
            weekEndDate: data.weekEndDate ?? "",

            category: data.category ?? "manual_other",
            hours: typeof data.hours === "number" ? data.hours : 0,
            payType: data.payType ?? "regular",
            billable: data.billable ?? false,
            source: data.source ?? "manual_entry",

            serviceTicketId: data.serviceTicketId ?? undefined,
            projectId: data.projectId ?? undefined,
            projectStageKey: data.projectStageKey ?? undefined,

            linkedTechnicianId: data.linkedTechnicianId ?? undefined,
            linkedTechnicianName: data.linkedTechnicianName ?? undefined,

            notes: data.notes ?? undefined,
            timesheetId: data.timesheetId ?? undefined,

            entryStatus: data.entryStatus ?? "draft",

            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setEntries(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load time entries.");
      } finally {
        setLoading(false);
      }
    }

    loadEntries();
  }, []);

  const payrollWeekDays = useMemo(() => buildPayrollWeekDays(weekOffset), [weekOffset]);
  const weekStart = payrollWeekDays[0]?.isoDate ?? "";
  const weekEnd = payrollWeekDays[4]?.isoDate ?? "";
  const isHistoricalWeek = weekOffset < 0;
  const isCurrentWeek = weekOffset === 0;

  const visibleEntries = useMemo(() => {
    let items = entries;

    if (!canSeeAll && appUser?.uid) {
      items = items.filter((entry) => entry.employeeId === appUser.uid);
    }

    items = items.filter(
      (entry) => entry.entryDate >= weekStart && entry.entryDate <= weekEnd
    );

    if (statusFilter !== "all") {
      items = items.filter((entry) => entry.entryStatus === statusFilter);
    }

    if (categoryFilter !== "all") {
      items = items.filter((entry) => entry.category === categoryFilter);
    }

    return items;
  }, [entries, canSeeAll, appUser?.uid, weekStart, weekEnd, statusFilter, categoryFilter]);

  const entriesByDay = useMemo(() => {
    const result: Record<string, TimeEntry[]> = {};

    for (const day of payrollWeekDays) {
      result[day.isoDate] = [];
    }

    for (const entry of visibleEntries) {
      if (!result[entry.entryDate]) continue;
      result[entry.entryDate].push(entry);
    }

    for (const day of payrollWeekDays) {
      result[day.isoDate].sort((a, b) => a.createdAt?.localeCompare(b.createdAt ?? "") ?? 0);
    }

    return result;
  }, [visibleEntries, payrollWeekDays]);

  const dayTotals = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const day of payrollWeekDays) {
      totals[day.isoDate] = (entriesByDay[day.isoDate] ?? []).reduce(
        (sum, entry) => sum + entry.hours,
        0
      );
    }

    return totals;
  }, [entriesByDay, payrollWeekDays]);

  const weekTotal = useMemo(() => {
    return visibleEntries.reduce((sum, entry) => sum + entry.hours, 0);
  }, [visibleEntries]);

  return (
    <ProtectedPage fallbackTitle="This Week's Time Entries">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>
              {isCurrentWeek ? "This Week’s Time Entries" : "Weekly Time Entries"}
            </h1>
            <p style={{ marginTop: "4px", color: "#666", fontSize: "13px" }}>
              Week of {weekStart} through {weekEnd}
            </p>
            <p style={{ marginTop: "4px", color: "#666", fontSize: "13px" }}>
              {canSeeAll ? "Viewing all employees for this week." : "Viewing your week day by day."}
            </p>
            {isHistoricalWeek ? (
              <p style={{ marginTop: "4px", color: "#8a5a00", fontSize: "13px" }}>
                This is a historical week and is currently read-only.
              </p>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Previous Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              This Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Next Week
            </button>

            {!isHistoricalWeek ? (
              <Link
                href="/time-entries/new"
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "inherit",
                  background: "white",
                  fontWeight: 700,
                }}
              >
                Add Time Entry
              </Link>
            ) : (
              <span
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  color: "#999",
                  background: "#f7f7f7",
                  fontWeight: 700,
                }}
              >
                Read-Only Week
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            background: "#fafafa",
            display: "grid",
            gap: "12px",
            maxWidth: "720px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={{ fontWeight: 700 }}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | TimeEntry["entryStatus"])
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
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="exported">Exported</option>
              </select>
            </div>

            <div>
              <label style={{ fontWeight: 700 }}>Category</label>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as "all" | TimeEntry["category"])
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
                <option value="all">All Categories</option>
                <option value="service_ticket">Service Ticket</option>
                <option value="project_stage">Project Stage</option>
                <option value="meeting">Meeting</option>
                <option value="shop">Shop</option>
                <option value="office">Office</option>
                <option value="pto">PTO</option>
                <option value="holiday">Holiday</option>
                <option value="manual_other">Manual Other</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "#666" }}>
            Showing {visibleEntries.length} entr{visibleEntries.length === 1 ? "y" : "ies"} for this week.
          </div>
        </div>

        {loading ? <p>Loading time entries...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <>
            <div style={{ display: "grid", gap: "16px" }}>
              {payrollWeekDays.map((day) => {
                const dayEntries = entriesByDay[day.isoDate] ?? [];
                const total = dayTotals[day.isoDate] ?? 0;

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "16px",
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginBottom: "12px",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "18px" }}>
                          {day.label} {formatDisplayDate(day.isoDate)}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                          {day.isoDate}
                        </div>
                      </div>

                      <div style={{ fontSize: "13px", color: "#666", fontWeight: 700 }}>
                        Daily Total: {total.toFixed(2)} hr
                      </div>
                    </div>

                    {dayEntries.length === 0 ? (
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
                        No entries for this day.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {dayEntries.map((entry) => (
                          <Link
                            key={entry.id}
                            href={`/time-entries/${entry.id}`}
                            style={{
                              display: "block",
                              border: "1px solid #ddd",
                              borderRadius: "10px",
                              padding: "10px",
                              background: "white",
                              textDecoration: "none",
                              color: "inherit",
                            }}
                          >
                            <div style={{ fontWeight: 800 }}>
                              {canSeeAll ? `${entry.employeeName} • ` : ""}
                              {formatCategory(entry.category)}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                              {entry.hours} hr • {formatPayType(entry.payType)}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                              Billable: {String(entry.billable)} • Status: {formatStatus(entry.entryStatus)}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                              Source: {entry.source === "auto_suggested" ? "Auto-Suggested" : "Manual"}
                            </div>

                            {entry.linkedTechnicianName ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                Linked Technician: {entry.linkedTechnicianName}
                              </div>
                            ) : null}

                            {entry.serviceTicketId ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                Service Ticket ID: {entry.serviceTicketId}
                              </div>
                            ) : null}

                            {entry.projectId ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                Project ID: {entry.projectId}
                                {entry.projectStageKey ? ` • Stage: ${entry.projectStageKey}` : ""}
                              </div>
                            ) : null}

{entry.notes ? (
  <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
    Notes: {truncateLine(firstMeaningfulLine(entry.notes))}
  </div>
) : null}

                            <div style={{ marginTop: "8px", fontSize: "12px", color: "#0a58ca", fontWeight: 700 }}>
                              Open Entry
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "18px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "720px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>Weekly Total</div>
              <div style={{ marginTop: "6px", fontSize: "14px", color: "#444" }}>
                {weekTotal.toFixed(2)} hr
              </div>
              <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                Overtime, PTO, and holiday treatment will be finalized in timesheet processing.
              </div>
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}