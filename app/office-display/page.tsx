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

function formatDateToIsoLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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

export default function OfficeDisplayPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekends, setShowWeekends] = useState(false);

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [ticketSnap, projectSnap] = await Promise.all([
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
        ]);

        const ticketItems: ServiceTicket[] = ticketSnap.docs.map((docSnap) => {
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

        const projectItems: Project[] = projectSnap.docs.map((docSnap) => {
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
            projectName: data.projectName ?? "",
            projectType: data.projectType ?? "other",
            description: data.description ?? undefined,
            bidStatus: data.bidStatus ?? "draft",
            totalBidAmount: data.totalBidAmount ?? 0,
            roughIn: data.roughIn ?? {
              status: "not_started",
              billed: false,
              billedAmount: 0,
            },
            topOutVent: data.topOutVent ?? {
              status: "not_started",
              billed: false,
              billedAmount: 0,
            },
            trimFinish: data.trimFinish ?? {
              status: "not_started",
              billed: false,
              billedAmount: 0,
            },
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

        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load office display.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
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

  const weekStart = allWeekDays[0]?.isoDate ?? "";
  const weekEnd = allWeekDays[6]?.isoDate ?? "";

  const itemsByDay = useMemo(() => {
    const result: Record<string, DisplayItem[]> = {};

    for (const day of allWeekDays) {
      result[day.isoDate] = [];
    }

    for (const ticket of tickets) {
      if (!ticket.scheduledDate || !result[ticket.scheduledDate]) continue;

      result[ticket.scheduledDate].push({
        kind: "service_ticket",
        id: ticket.id,
        title: ticket.issueSummary,
        subtitle: ticket.customerDisplayName,
        location: ticket.serviceAddressLine1,
        tech: ticket.assignedTechnicianName || "Unassigned",
        status: formatStatusLabel(ticket.status),
        timeText: `${ticket.scheduledStartTime || "—"} - ${ticket.scheduledEndTime || "—"}`,
        date: ticket.scheduledDate,
        sortTime: ticket.scheduledStartTime || "99:99",
      });
    }

    for (const project of projects) {
      const stageEntries = [
        {
          stageKey: "roughIn",
          label: "Rough-In",
          stage: project.roughIn,
        },
        {
          stageKey: "topOutVent",
          label: "Top-Out / Vent",
          stage: project.topOutVent,
        },
        {
          stageKey: "trimFinish",
          label: "Trim / Finish",
          stage: project.trimFinish,
        },
      ] as const;

      for (const entry of stageEntries) {
        const date = entry.stage.scheduledDate;
        if (!date || !result[date]) continue;

        result[date].push({
          kind: "project_stage",
          id: `${project.id}-${entry.stageKey}`,
          title: `${project.projectName} • ${entry.label}`,
          subtitle: project.customerDisplayName,
          location: project.serviceAddressLine1,
          tech: project.assignedTechnicianName || "Unassigned",
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(
            project.bidStatus
          )}`,
          timeText: "Project Stage",
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
      .filter((ticket) => !ticket.scheduledDate)
      .map((ticket) => ({
        kind: "service_ticket",
        id: ticket.id,
        title: ticket.issueSummary,
        subtitle: ticket.customerDisplayName,
        location: ticket.serviceAddressLine1,
        tech: ticket.assignedTechnicianName || "Unassigned",
        status: formatStatusLabel(ticket.status),
        timeText: "Unscheduled",
        date: "",
        sortTime: "99:99",
      }));

    const projectItems: DisplayItem[] = [];

    for (const project of projects) {
      const stageEntries = [
        {
          stageKey: "roughIn",
          label: "Rough-In",
          stage: project.roughIn,
        },
        {
          stageKey: "topOutVent",
          label: "Top-Out / Vent",
          stage: project.topOutVent,
        },
        {
          stageKey: "trimFinish",
          label: "Trim / Finish",
          stage: project.trimFinish,
        },
      ] as const;

      for (const entry of stageEntries) {
        if (entry.stage.scheduledDate) continue;
        if (entry.stage.status === "complete") continue;

        projectItems.push({
          kind: "project_stage",
          id: `${project.id}-${entry.stageKey}-unscheduled`,
          title: `${project.projectName} • ${entry.label}`,
          subtitle: project.customerDisplayName,
          location: project.serviceAddressLine1,
          tech: project.assignedTechnicianName || "Unassigned",
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(
            project.bidStatus
          )}`,
          timeText: "Project Stage Unscheduled",
          date: "",
          sortTime: "99:99",
        });
      }
    }

    return [...ticketItems, ...projectItems];
  }, [tickets, projects]);

  return (
    <ProtectedPage fallbackTitle="Office Display">
      <main
        style={{
          minHeight: "100vh",
          background: "#0f172a",
          color: "white",
          padding: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 800, margin: 0 }}>
              DCFlow Office Display
            </h1>
            <p style={{ marginTop: "8px", fontSize: "14px", color: "#cbd5e1" }}>
              Week of {weekStart} through {weekEnd}
            </p>
            <p style={{ marginTop: "6px", fontSize: "13px", color: "#94a3b8" }}>
              View: {showWeekends ? "Monday–Sunday" : "Monday–Friday"} • Auto-refresh every 30 seconds
            </p>
            <p style={{ marginTop: "6px", fontSize: "13px", color: "#94a3b8" }}>
              Last updated: {lastUpdated || "—"}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              style={{
                padding: "10px 14px",
                border: "1px solid #334155",
                borderRadius: "10px",
                background: "#111827",
                color: "white",
                cursor: "pointer",
              }}
            >
              Previous Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              style={{
                padding: "10px 14px",
                border: "1px solid #334155",
                borderRadius: "10px",
                background: "#111827",
                color: "white",
                cursor: "pointer",
              }}
            >
              This Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              style={{
                padding: "10px 14px",
                border: "1px solid #334155",
                borderRadius: "10px",
                background: "#111827",
                color: "white",
                cursor: "pointer",
              }}
            >
              Next Week
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowWeekends((prev) => !prev)}
                style={{
                  padding: "10px 14px",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  background: "#111827",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                {showWeekends ? "Hide Weekends" : "Show Weekends"}
              </button>
            ) : null}
          </div>
        </div>

        {loading ? <p style={{ color: "#cbd5e1" }}>Loading office display...</p> : null}
        {error ? <p style={{ color: "#fca5a5" }}>{error}</p> : null}

        {!loading && !error ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${visibleWeekDays.length}, minmax(260px, 1fr))`,
                gap: "12px",
                alignItems: "start",
                overflowX: "auto",
              }}
            >
              {visibleWeekDays.map((day) => {
                const dayItems = itemsByDay[day.isoDate] ?? [];

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      border: "1px solid #334155",
                      borderRadius: "14px",
                      padding: "12px",
                      background: "#111827",
                      minHeight: "320px",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: "18px", marginBottom: "4px" }}>
                      {day.label}
                    </div>

                    <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
                      {day.isoDate}
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {dayItems.length === 0 ? (
                        <div
                          style={{
                            border: "1px dashed #334155",
                            borderRadius: "10px",
                            padding: "12px",
                            fontSize: "14px",
                            color: "#94a3b8",
                            background: "#0b1220",
                          }}
                        >
                          No scheduled work
                        </div>
                      ) : (
                        dayItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              border: "1px solid #334155",
                              borderRadius: "12px",
                              padding: "12px",
                              background: "#0b1220",
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: "15px" }}>
                              {item.kind === "project_stage" ? "📐 " : "🔧 "}
                              {item.title}
                            </div>

                            <div style={{ marginTop: "6px", fontSize: "13px", color: "#cbd5e1" }}>
                              {item.timeText}
                            </div>

                            <div style={{ marginTop: "6px", fontSize: "13px", color: "#cbd5e1" }}>
                              {item.subtitle}
                            </div>

                            <div style={{ marginTop: "6px", fontSize: "13px", color: "#cbd5e1" }}>
                              {item.location}
                            </div>

                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#94a3b8" }}>
                              Tech: {item.tech}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#94a3b8" }}>
                              Status: {item.status}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "18px",
                border: "1px solid #334155",
                borderRadius: "14px",
                padding: "16px",
                background: "#111827",
              }}
            >
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  margin: 0,
                  marginBottom: "12px",
                }}
              >
                Unscheduled Work
              </h2>

              {unscheduledItems.length === 0 ? (
                <p style={{ color: "#94a3b8", margin: 0 }}>No unscheduled work.</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {unscheduledItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #334155",
                        borderRadius: "12px",
                        padding: "12px",
                        background: "#0b1220",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "15px" }}>
                        {item.kind === "project_stage" ? "📐 " : "🔧 "}
                        {item.title}
                      </div>

                      <div style={{ marginTop: "6px", fontSize: "13px", color: "#cbd5e1" }}>
                        {item.subtitle}
                      </div>

                      <div style={{ marginTop: "6px", fontSize: "13px", color: "#cbd5e1" }}>
                        {item.location}
                      </div>

                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#94a3b8" }}>
                        Tech: {item.tech}
                      </div>

                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#94a3b8" }}>
                        Status: {item.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </ProtectedPage>
  );
}