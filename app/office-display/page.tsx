// app/office-display/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { ServiceTicket } from "../../src/types/service-ticket";
import type { Project } from "../../src/types/project";

type DayBucket = {
  key: string;
  label: string;
  shortLabel: string;
  isoDate: string;
  dayIndex: number;
};

type DisplayItem = {
  kind: "service_ticket" | "project_stage";
  id: string;
  title: string;
  subtitle: string;
  location: string;
  tech: string;
  status: string;
  timeText: string;
  date: string;
  sortTime: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateToIsoLocal(date: Date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function getStartOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day);
  return copy;
}

function buildWeekDays(baseDate: Date): DayBucket[] {
  const start = getStartOfWeek(baseDate);
  const labels = [
    ["Sunday", "Sun"],
    ["Monday", "Mon"],
    ["Tuesday", "Tue"],
    ["Wednesday", "Wed"],
    ["Thursday", "Thu"],
    ["Friday", "Fri"],
    ["Saturday", "Sat"],
  ] as const;

  return labels.map(([label, shortLabel], index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);

    return {
      key: shortLabel.toLowerCase(),
      label,
      shortLabel,
      isoDate: formatDateToIsoLocal(current),
      dayIndex: index,
    };
  });
}

function formatStatusLabel(status: ServiceTicket["status"]) {
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

function formatProjectBidStatus(status: Project["bidStatus"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    default:
      return status;
  }
}

function formatProjectStageStatus(status: Project["roughIn"]["status"]) {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "complete":
      return "Complete";
    default:
      return status;
  }
}

function safeOneLine(x: unknown) {
  return String(x ?? "").replace(/\s+/g, " ").trim();
}

function nowClock() {
  const d = new Date();
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad2(mm)} ${ampm}`;
}

// ---------- UI helpers (TV palette) ----------
function pillStyle(kind: "good" | "warn" | "info" | "neutral" | "bad") {
  // Deep navy baseline with soft “glass” — emerald accent
  if (kind === "good") return { bg: "rgba(16,185,129,0.16)", br: "rgba(16,185,129,0.35)", fg: "#a7f3d0" };
  if (kind === "warn") return { bg: "rgba(245,158,11,0.16)", br: "rgba(245,158,11,0.35)", fg: "#fde68a" };
  if (kind === "bad") return { bg: "rgba(239,68,68,0.16)", br: "rgba(239,68,68,0.35)", fg: "#fecaca" };
  if (kind === "info") return { bg: "rgba(96,165,250,0.16)", br: "rgba(96,165,250,0.35)", fg: "#bfdbfe" };
  return { bg: "rgba(148,163,184,0.14)", br: "rgba(148,163,184,0.30)", fg: "#e2e8f0" };
}

function statusToPillKind(label: string) {
  const s = String(label || "").toLowerCase();
  if (s.includes("in progress")) return "info";
  if (s.includes("scheduled")) return "warn";
  if (s.includes("follow up")) return "warn";
  if (s.includes("completed") || s.includes("complete")) return "neutral";
  if (s.includes("cancel")) return "bad";
  if (s.includes("won")) return "good";
  if (s.includes("new")) return "neutral";
  return "neutral";
}

export default function OfficeDisplayPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [clock, setClock] = useState(() => nowClock());

  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekends, setShowWeekends] = useState(false);

  const isAdmin = appUser?.role === "admin";

  // Live clock (TV feels “alive”)
  useEffect(() => {
    const id = window.setInterval(() => setClock(nowClock()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Data load + refresh
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [ticketSnap, projectSnap] = await Promise.all([
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
        ]);

        const ticketItems: ServiceTicket[] = ticketSnap.docs.map((docSnap) => {
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

        const projectItems: Project[] = projectSnap.docs.map((docSnap) => {
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
            projectName: data.projectName ?? "",
            projectType: data.projectType ?? "other",
            description: data.description ?? undefined,
            bidStatus: data.bidStatus ?? "draft",
            totalBidAmount: data.totalBidAmount ?? 0,
            roughIn: data.roughIn ?? { status: "not_started", billed: false, billedAmount: 0 },
            topOutVent: data.topOutVent ?? { status: "not_started", billed: false, billedAmount: 0 },
            trimFinish: data.trimFinish ?? { status: "not_started", billed: false, billedAmount: 0 },
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,
            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        if (!isMounted) return;

        setTickets(ticketItems);
        setProjects(projectItems);
        setError("");
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load office display.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    const intervalId = window.setInterval(() => {
      loadData();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const currentWeekBaseDate = useMemo(() => {
    const today = new Date();
    const shifted = new Date(today);
    shifted.setDate(today.getDate() + weekOffset * 7);
    return shifted;
  }, [weekOffset]);

  const allWeekDays = useMemo(() => buildWeekDays(currentWeekBaseDate), [currentWeekBaseDate]);

  const visibleWeekDays = useMemo(() => {
    if (showWeekends) return allWeekDays;
    return allWeekDays.filter((day) => day.dayIndex >= 1 && day.dayIndex <= 5);
  }, [allWeekDays, showWeekends]);

  const todayIso = useMemo(() => formatDateToIsoLocal(new Date()), []);

  const weekStart = allWeekDays[0]?.isoDate ?? "";
  const weekEnd = allWeekDays[6]?.isoDate ?? "";

  const itemsByDay = useMemo(() => {
    const result: Record<string, DisplayItem[]> = {};
    for (const day of allWeekDays) result[day.isoDate] = [];

    for (const ticket of tickets) {
      if (!ticket.active) continue;
      if (!ticket.scheduledDate || !result[ticket.scheduledDate]) continue;

      const title = safeOneLine(ticket.issueSummary) || "Service Ticket";
      const subtitle = safeOneLine(ticket.customerDisplayName);
      const location = safeOneLine(ticket.serviceAddressLine1);
      const tech = safeOneLine(ticket.assignedTechnicianName) || "Unassigned";

      const start = safeOneLine(ticket.scheduledStartTime) || "—";
      const end = safeOneLine(ticket.scheduledEndTime) || "—";

      result[ticket.scheduledDate].push({
        kind: "service_ticket",
        id: ticket.id,
        title,
        subtitle,
        location,
        tech,
        status: formatStatusLabel(ticket.status),
        timeText: `${start}–${end}`,
        date: ticket.scheduledDate,
        sortTime: start || "99:99",
      });
    }

    for (const project of projects) {
      if (!project.active) continue;

      const stageEntries = [
        { stageKey: "roughIn", label: "Rough-In", stage: project.roughIn },
        { stageKey: "topOutVent", label: "Top-Out / Vent", stage: project.topOutVent },
        { stageKey: "trimFinish", label: "Trim / Finish", stage: project.trimFinish },
      ] as const;

      for (const entry of stageEntries) {
        const date = (entry.stage as any)?.scheduledDate;
        if (!date || !result[date]) continue;

        const title = `${safeOneLine(project.projectName) || "Project"} • ${entry.label}`;
        const subtitle = safeOneLine(project.customerDisplayName);
        const location = safeOneLine(project.serviceAddressLine1);
        const tech = safeOneLine(project.assignedTechnicianName) || "Unassigned";

        result[date].push({
          kind: "project_stage",
          id: `${project.id}-${entry.stageKey}`,
          title,
          subtitle,
          location,
          tech,
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(project.bidStatus)}`,
          timeText: "Stage",
          date,
          sortTime: "12:00",
        });
      }
    }

    for (const day of allWeekDays) {
      result[day.isoDate].sort((a, b) => {
        const byTime = a.sortTime.localeCompare(b.sortTime);
        if (byTime !== 0) return byTime;
        return a.title.localeCompare(b.title);
      });
    }

    return result;
  }, [tickets, projects, allWeekDays]);

  const unscheduledItems = useMemo(() => {
    const ticketItems: DisplayItem[] = tickets
      .filter((ticket) => ticket.active && !ticket.scheduledDate && String(ticket.status || "").toLowerCase() !== "completed")
      .map((ticket) => ({
        kind: "service_ticket",
        id: ticket.id,
        title: safeOneLine(ticket.issueSummary) || "Service Ticket",
        subtitle: safeOneLine(ticket.customerDisplayName),
        location: safeOneLine(ticket.serviceAddressLine1),
        tech: safeOneLine(ticket.assignedTechnicianName) || "Unassigned",
        status: formatStatusLabel(ticket.status),
        timeText: "Unscheduled",
        date: "",
        sortTime: "99:99",
      }));

    const projectItems: DisplayItem[] = [];

    for (const project of projects) {
      if (!project.active) continue;

      const stageEntries = [
        { stageKey: "roughIn", label: "Rough-In", stage: project.roughIn },
        { stageKey: "topOutVent", label: "Top-Out / Vent", stage: project.topOutVent },
        { stageKey: "trimFinish", label: "Trim / Finish", stage: project.trimFinish },
      ] as const;

      for (const entry of stageEntries) {
        const stage: any = entry.stage;
        if (stage?.scheduledDate) continue;
        if (stage?.status === "complete") continue;

        projectItems.push({
          kind: "project_stage",
          id: `${project.id}-${entry.stageKey}-unscheduled`,
          title: `${safeOneLine(project.projectName) || "Project"} • ${entry.label}`,
          subtitle: safeOneLine(project.customerDisplayName),
          location: safeOneLine(project.serviceAddressLine1),
          tech: safeOneLine(project.assignedTechnicianName) || "Unassigned",
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(project.bidStatus)}`,
          timeText: "Unscheduled Stage",
          date: "",
          sortTime: "99:99",
        });
      }
    }

    const out = [...ticketItems, ...projectItems];
    out.sort((a, b) => {
      const byKind = a.kind.localeCompare(b.kind);
      if (byKind !== 0) return byKind;
      return a.title.localeCompare(b.title);
    });
    return out;
  }, [tickets, projects]);

  const headerSubtle = "rgba(226,232,240,0.75)";
  const headerMuted = "rgba(148,163,184,0.85)";

  return (
    <ProtectedPage fallbackTitle="Office Display">
      <main
        style={{
          minHeight: "100vh",
          color: "white",
          padding: 22,
          // “Login screen” vibe: deep navy + subtle gradient glow
          background:
            "radial-gradient(1200px 800px at 20% 10%, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.00) 55%), radial-gradient(900px 700px at 85% 20%, rgba(96,165,250,0.18) 0%, rgba(96,165,250,0.00) 55%), linear-gradient(180deg, #0b1220 0%, #0f172a 60%, #0b1220 100%)",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 18,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 34, fontWeight: 950, letterSpacing: 0.2 }}>
                DCFlow • Office Display
              </div>

              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(16,185,129,0.35)",
                  background: "rgba(16,185,129,0.14)",
                  color: "#a7f3d0",
                  whiteSpace: "nowrap",
                }}
              >
                ⏱ {clock}
              </div>

              <div style={{ fontSize: 14, color: headerMuted, fontWeight: 800 }}>
                Auto-refresh: 30s • Updated: {lastUpdated || "—"}
              </div>
            </div>

            <div style={{ fontSize: 15, color: headerSubtle, fontWeight: 800 }}>
              Week of <span style={{ color: "white", fontWeight: 900 }}>{weekStart}</span> –{" "}
              <span style={{ color: "white", fontWeight: 900 }}>{weekEnd}</span> • View:{" "}
              <span style={{ color: "white", fontWeight: 900 }}>
                {showWeekends ? "Mon–Sun" : "Mon–Fri"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              style={{
                padding: "12px 14px",
                border: "1px solid rgba(148,163,184,0.35)",
                borderRadius: 14,
                background: "rgba(15,23,42,0.55)",
                color: "white",
                cursor: "pointer",
                fontWeight: 900,
                backdropFilter: "blur(10px)",
              }}
            >
              ← Previous
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              style={{
                padding: "12px 14px",
                border: "1px solid rgba(16,185,129,0.35)",
                borderRadius: 14,
                background: "rgba(16,185,129,0.14)",
                color: "white",
                cursor: "pointer",
                fontWeight: 950,
                backdropFilter: "blur(10px)",
              }}
            >
              This Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              style={{
                padding: "12px 14px",
                border: "1px solid rgba(148,163,184,0.35)",
                borderRadius: 14,
                background: "rgba(15,23,42,0.55)",
                color: "white",
                cursor: "pointer",
                fontWeight: 900,
                backdropFilter: "blur(10px)",
              }}
            >
              Next →
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowWeekends((prev) => !prev)}
                style={{
                  padding: "12px 14px",
                  border: "1px solid rgba(96,165,250,0.35)",
                  borderRadius: 14,
                  background: "rgba(96,165,250,0.14)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                  backdropFilter: "blur(10px)",
                }}
              >
                {showWeekends ? "Hide Weekends" : "Show Weekends"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Loading / Error */}
        {loading ? (
          <div
            style={{
              border: "1px solid rgba(148,163,184,0.28)",
              borderRadius: 18,
              background: "rgba(15,23,42,0.55)",
              padding: 16,
              color: "rgba(226,232,240,0.9)",
              fontWeight: 850,
              backdropFilter: "blur(10px)",
            }}
          >
            Loading office display…
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 18,
              background: "rgba(239,68,68,0.10)",
              padding: 16,
              color: "#fecaca",
              fontWeight: 900,
              backdropFilter: "blur(10px)",
            }}
          >
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            {/* Week grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${visibleWeekDays.length}, minmax(290px, 1fr))`,
                gap: 14,
                alignItems: "start",
                overflowX: "auto",
                paddingBottom: 6,
              }}
            >
              {visibleWeekDays.map((day) => {
                const dayItems = itemsByDay[day.isoDate] ?? [];
                const isToday = day.isoDate === todayIso;

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      borderRadius: 18,
                      border: isToday
                        ? "1px solid rgba(16,185,129,0.55)"
                        : "1px solid rgba(148,163,184,0.22)",
                      background: isToday
                        ? "linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(15,23,42,0.62) 45%, rgba(15,23,42,0.55) 100%)"
                        : "rgba(15,23,42,0.55)",
                      padding: 14,
                      minHeight: 360,
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                      <div style={{ fontWeight: 950, fontSize: 22, letterSpacing: 0.2 }}>
                        {day.shortLabel}
                        {isToday ? <span style={{ marginLeft: 10, fontSize: 14, color: "#a7f3d0", fontWeight: 950 }}>• TODAY</span> : null}
                      </div>
                      <div style={{ fontSize: 13, color: headerMuted, fontWeight: 850 }}>{day.isoDate}</div>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                      {dayItems.length === 0 ? (
                        <div
                          style={{
                            border: "1px dashed rgba(148,163,184,0.28)",
                            borderRadius: 14,
                            padding: 14,
                            fontSize: 16,
                            color: "rgba(148,163,184,0.95)",
                            background: "rgba(2,6,23,0.25)",
                            fontWeight: 900,
                          }}
                        >
                          No scheduled work
                        </div>
                      ) : (
                        dayItems.map((item) => {
                          const kindIcon = item.kind === "project_stage" ? "📐" : "🔧";
                          const statusKind = statusToPillKind(item.status);
                          const statusPill = pillStyle(statusKind);

                          const techPill = pillStyle(item.tech === "Unassigned" ? "warn" : "good");

                          return (
                            <div
                              key={item.id}
                              style={{
                                borderRadius: 16,
                                border: "1px solid rgba(148,163,184,0.18)",
                                background: "rgba(2,6,23,0.30)",
                                padding: 14,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ fontSize: 18, fontWeight: 950, lineHeight: 1.2 }}>
                                  {kindIcon} {item.title}
                                </div>

                                <div
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    border: `1px solid ${statusPill.br}`,
                                    background: statusPill.bg,
                                    color: statusPill.fg,
                                    fontWeight: 950,
                                    fontSize: 13,
                                    whiteSpace: "nowrap",
                                    alignSelf: "flex-start",
                                  }}
                                >
                                  {item.status}
                                </div>
                              </div>

                              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                <div
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    border: "1px solid rgba(96,165,250,0.35)",
                                    background: "rgba(96,165,250,0.12)",
                                    color: "#bfdbfe",
                                    fontWeight: 950,
                                    fontSize: 13,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  ⏰ {item.timeText}
                                </div>

                                <div
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    border: `1px solid ${techPill.br}`,
                                    background: techPill.bg,
                                    color: techPill.fg,
                                    fontWeight: 950,
                                    fontSize: 13,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  👤 {item.tech}
                                </div>
                              </div>

                              {/* Keep these lines calmer + readable (TV-friendly) */}
                              <div style={{ marginTop: 10, fontSize: 15, color: "rgba(226,232,240,0.92)", fontWeight: 850 }}>
                                {item.subtitle}
                              </div>

                              {item.location ? (
                                <div style={{ marginTop: 6, fontSize: 14, color: "rgba(148,163,184,0.95)", fontWeight: 800 }}>
                                  📍 {item.location}
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unscheduled section */}
            <div
              style={{
                marginTop: 18,
                borderRadius: 18,
                border: "1px solid rgba(148,163,184,0.22)",
                background: "rgba(15,23,42,0.55)",
                padding: 16,
                backdropFilter: "blur(12px)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontSize: 22, fontWeight: 950 }}>Unscheduled Work</div>
                <div style={{ fontSize: 14, color: headerMuted, fontWeight: 850 }}>
                  Count: <span style={{ color: "white", fontWeight: 950 }}>{unscheduledItems.length}</span>
                </div>
              </div>

              {unscheduledItems.length === 0 ? (
                <div
                  style={{
                    marginTop: 12,
                    border: "1px dashed rgba(148,163,184,0.28)",
                    borderRadius: 14,
                    padding: 14,
                    fontSize: 16,
                    color: "rgba(148,163,184,0.95)",
                    background: "rgba(2,6,23,0.25)",
                    fontWeight: 900,
                  }}
                >
                  No unscheduled work.
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(320px, 1fr))",
                    gap: 12,
                  }}
                >
                  {unscheduledItems.slice(0, 30).map((item) => {
                    const kindIcon = item.kind === "project_stage" ? "📐" : "🔧";
                    const statusPill = pillStyle(statusToPillKind(item.status));
                    const techPill = pillStyle(item.tech === "Unassigned" ? "warn" : "good");

                    return (
                      <div
                        key={item.id}
                        style={{
                          borderRadius: 16,
                          border: "1px solid rgba(148,163,184,0.18)",
                          background: "rgba(2,6,23,0.30)",
                          padding: 14,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 18, fontWeight: 950, lineHeight: 1.2 }}>
                            {kindIcon} {item.title}
                          </div>
                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: `1px solid ${statusPill.br}`,
                              background: statusPill.bg,
                              color: statusPill.fg,
                              fontWeight: 950,
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.status}
                          </div>
                        </div>

                        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: "1px solid rgba(245,158,11,0.35)",
                              background: "rgba(245,158,11,0.12)",
                              color: "#fde68a",
                              fontWeight: 950,
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            ⏳ {item.timeText}
                          </div>

                          <div
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: `1px solid ${techPill.br}`,
                              background: techPill.bg,
                              color: techPill.fg,
                              fontWeight: 950,
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            👤 {item.tech}
                          </div>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 15, color: "rgba(226,232,240,0.92)", fontWeight: 850 }}>
                          {item.subtitle}
                        </div>

                        {item.location ? (
                          <div style={{ marginTop: 6, fontSize: 14, color: "rgba(148,163,184,0.95)", fontWeight: 800 }}>
                            📍 {item.location}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {unscheduledItems.length > 30 ? (
                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px dashed rgba(148,163,184,0.28)",
                        background: "rgba(2,6,23,0.22)",
                        padding: 14,
                        color: "rgba(226,232,240,0.85)",
                        fontWeight: 900,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 120,
                      }}
                    >
                      +{unscheduledItems.length - 30} more…
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </ProtectedPage>
  );
}