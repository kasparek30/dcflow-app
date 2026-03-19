// app/time-entries/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, doc, getDoc } from "firebase/firestore";
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
      return String(payType || "");
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
      return String(status || "");
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

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function firstMeaningfulLine(notes?: string) {
  const raw = safeTrim(notes);
  if (!raw) return "";
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const preferred = lines.find((l) => !l.startsWith("AUTO_TIME_FROM_TRIP:")) || lines[0] || "";
  return preferred;
}

function truncateLine(s: string, max = 80) {
  const x = safeTrim(s);
  if (x.length <= max) return x;
  return x.slice(0, max - 1) + "…";
}

/**
 * ✅ Because your Firestore stores category as:
 * service | project | meeting
 * we treat those as the primary display categories.
 */
function categoryPillLabel(cat: string) {
  const c = safeTrim(cat).toLowerCase();
  if (c === "service") return "service";
  if (c === "project") return "project";
  if (c === "meeting") return "meeting";
  return c || "other";
}

function stageLabel(stage?: string) {
  const s = safeTrim(stage);
  if (!s) return "";
  if (s === "roughIn") return "Rough-In";
  if (s === "topOutVent") return "Top-Out / Vent";
  if (s === "trimFinish") return "Trim / Finish";
  return s;
}

type ServiceTicketMini = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
};

type ProjectMini = {
  id: string;
  projectName: string;
};

export default function TimeEntriesPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | TimeEntry["entryStatus"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [weekOffset, setWeekOffset] = useState(0);

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  // ✅ lookup caches (id -> display)
  const [ticketMiniById, setTicketMiniById] = useState<Record<string, ServiceTicketMini>>({});
  const [projectMiniById, setProjectMiniById] = useState<Record<string, ProjectMini>>({});

  useEffect(() => {
    async function loadEntries() {
      try {
        const q = query(collection(db, "timeEntries"), orderBy("entryDate", "desc"));
        const snap = await getDocs(q);

        const items: TimeEntry[] = snap.docs.map((docSnap) => {
          const data: any = docSnap.data();
          return {
            id: docSnap.id,
            employeeId: data.employeeId ?? "",
            employeeName: data.employeeName ?? "",
            employeeRole: data.employeeRole ?? "",
            laborRoleType: data.laborRoleType ?? undefined,

            entryDate: data.entryDate ?? "",
            weekStartDate: data.weekStartDate ?? "",
            weekEndDate: data.weekEndDate ?? "",

            // IMPORTANT: Firestore uses "service" | "project" | "meeting"
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

    items = items.filter((entry) => entry.entryDate >= weekStart && entry.entryDate <= weekEnd);

    if (statusFilter !== "all") {
      items = items.filter((entry) => entry.entryStatus === statusFilter);
    }

    if (categoryFilter !== "all") {
      items = items.filter((entry) => safeTrim(entry.category).toLowerCase() === safeTrim(categoryFilter).toLowerCase());
    }

    return items;
  }, [entries, canSeeAll, appUser?.uid, weekStart, weekEnd, statusFilter, categoryFilter]);

  // ✅ After visible entries change, hydrate needed display info (serviceTicket + project)
  useEffect(() => {
    async function hydrate() {
      const needTicketIds = new Set<string>();
      const needProjectIds = new Set<string>();

      for (const e of visibleEntries) {
        const cat = safeTrim((e as any).category).toLowerCase();
        if (cat === "service") {
          const tid = safeTrim((e as any).serviceTicketId);
          if (tid && !ticketMiniById[tid]) needTicketIds.add(tid);
        }
        if (cat === "project") {
          const pid = safeTrim((e as any).projectId);
          if (pid && !projectMiniById[pid]) needProjectIds.add(pid);
        }
      }

      if (needTicketIds.size === 0 && needProjectIds.size === 0) return;

      // Fetch in parallel
      const ticketFetches = Array.from(needTicketIds).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "serviceTickets", id));
          if (!snap.exists()) return null;
          const d: any = snap.data();
          return {
            id,
            customerDisplayName: safeTrim(d.customerDisplayName) || "Customer",
            issueSummary: safeTrim(d.issueSummary) || "Service Ticket",
          } as ServiceTicketMini;
        } catch {
          return null;
        }
      });

      const projectFetches = Array.from(needProjectIds).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "projects", id));
          if (!snap.exists()) return null;
          const d: any = snap.data();
          return {
            id,
            projectName: safeTrim(d.projectName) || "Project",
          } as ProjectMini;
        } catch {
          return null;
        }
      });

      const [ticketResults, projectResults] = await Promise.all([
        Promise.all(ticketFetches),
        Promise.all(projectFetches),
      ]);

      const nextTickets: Record<string, ServiceTicketMini> = {};
      for (const t of ticketResults) if (t?.id) nextTickets[t.id] = t;

      const nextProjects: Record<string, ProjectMini> = {};
      for (const p of projectResults) if (p?.id) nextProjects[p.id] = p;

      if (Object.keys(nextTickets).length) {
        setTicketMiniById((prev) => ({ ...prev, ...nextTickets }));
      }
      if (Object.keys(nextProjects).length) {
        setProjectMiniById((prev) => ({ ...prev, ...nextProjects }));
      }
    }

    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntries]);

  const entriesByDay = useMemo(() => {
    const result: Record<string, TimeEntry[]> = {};
    for (const day of payrollWeekDays) result[day.isoDate] = [];
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
      totals[day.isoDate] = (entriesByDay[day.isoDate] ?? []).reduce((sum, entry) => sum + entry.hours, 0);
    }
    return totals;
  }, [entriesByDay, payrollWeekDays]);

  const weekTotal = useMemo(() => visibleEntries.reduce((sum, entry) => sum + entry.hours, 0), [visibleEntries]);

  function renderTitleAndSubtitle(entry: TimeEntry) {
    const cat = safeTrim((entry as any).category).toLowerCase();

    if (cat === "service") {
      const tid = safeTrim((entry as any).serviceTicketId);
      const mini = tid ? ticketMiniById[tid] : null;
      const title = mini?.customerDisplayName || "Service";
      const subtitle = mini?.issueSummary || "";
      return { title, subtitle };
    }

    if (cat === "project") {
      const pid = safeTrim((entry as any).projectId);
      const mini = pid ? projectMiniById[pid] : null;
      const title = mini?.projectName || "Project";
      const stage = stageLabel((entry as any).projectStageKey);
      const subtitle = stage ? `Stage: ${stage}` : "";
      return { title, subtitle };
    }

    if (cat === "meeting") {
      const title = "Meeting";
      const subtitle = truncateLine(firstMeaningfulLine((entry as any).notes), 60);
      return { title, subtitle };
    }

    return { title: safeTrim((entry as any).category) || "Entry", subtitle: "" };
  }

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
                onChange={(e) => setStatusFilter(e.target.value as any)}
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
                onChange={(e) => setCategoryFilter(e.target.value)}
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
                <option value="service">Service</option>
                <option value="project">Project</option>
                <option value="meeting">Meeting</option>
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
                        {dayEntries.map((entry) => {
                          const { title, subtitle } = renderTitleAndSubtitle(entry);
                          const pill = categoryPillLabel(String((entry as any).category || ""));

                          return (
                            <Link
                              key={entry.id}
                              href={`/time-entries/${entry.id}`}
                              style={{
                                display: "block",
                                border: "1px solid #ddd",
                                borderRadius: "14px",
                                padding: "12px",
                                background: "white",
                                textDecoration: "none",
                                color: "inherit",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 950, fontSize: 18, lineHeight: 1.15 }}>
                                    {canSeeAll ? `${entry.employeeName} • ` : ""}
                                    {title}
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 8,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #e6e6e6",
                                        background: "#fafafa",
                                        fontSize: 12,
                                        fontWeight: 900,
                                        textTransform: "lowercase",
                                      }}
                                    >
                                      {pill}
                                    </span>
                                  </div>

                                  {subtitle ? (
                                    <div style={{ marginTop: 8, fontSize: 13, color: "#555", fontWeight: 700 }}>
                                      {subtitle}
                                    </div>
                                  ) : null}
                                </div>

                                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                  <div style={{ fontWeight: 1000, fontSize: 18 }}>{Number(entry.hours).toFixed(2)} hr</div>
                                  <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>{formatPayType(entry.payType)}</div>
                                </div>
                              </div>

                              <div style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
                                Billable: <strong>{String(entry.billable)}</strong> &nbsp;&nbsp;•&nbsp;&nbsp; Status:{" "}
                                <strong>{formatStatus(entry.entryStatus)}</strong>
                              </div>

                              <div style={{ marginTop: 10, fontSize: 12, color: "#0a58ca", fontWeight: 800 }}>
                                Open Entry →
                              </div>
                            </Link>
                          );
                        })}
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