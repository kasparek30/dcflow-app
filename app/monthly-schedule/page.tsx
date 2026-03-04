"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { ServiceTicket } from "../../src/types/service-ticket";
import type { Project } from "../../src/types/project";

type CalendarDay = {
  isoDate: string;
  dayNumber: number;
  weekday: number;
};

type ScheduleItem = {
  kind: "service_ticket" | "project_stage";
  id: string;
  title: string;
  subtitle: string;
  tech: string;
  status: string;
  timeText: string;
  href: string;
};

function formatDateToIsoLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthLabel(baseDate: Date) {
  return baseDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function buildMonthDays(baseDate: Date): CalendarDay[] {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const days: CalendarDay[] = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const current = new Date(year, month, day);
    days.push({
      isoDate: formatDateToIsoLocal(current),
      dayNumber: day,
      weekday: current.getDay(),
    });
  }

  return days;
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

export default function MonthlySchedulePage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  const [monthOffset, setMonthOffset] = useState(0);
  const [showWeekends, setShowWeekends] = useState(false);

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
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

        setTickets(ticketItems);
        setProjects(projectItems);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load monthly schedule.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const currentMonthBaseDate = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const allMonthDays = useMemo(() => buildMonthDays(currentMonthBaseDate), [currentMonthBaseDate]);

  const visibleMonthDays = useMemo(() => {
    if (showWeekends) return allMonthDays;
    return allMonthDays.filter((day) => day.weekday >= 1 && day.weekday <= 5);
  }, [allMonthDays, showWeekends]);

  const itemsByDate = useMemo(() => {
    const result: Record<string, ScheduleItem[]> = {};

    for (const day of allMonthDays) {
      result[day.isoDate] = [];
    }

    for (const ticket of tickets) {
      if (!ticket.scheduledDate || !result[ticket.scheduledDate]) continue;

      result[ticket.scheduledDate].push({
        kind: "service_ticket",
        id: ticket.id,
        title: ticket.issueSummary,
        subtitle: ticket.customerDisplayName,
        tech: ticket.assignedTechnicianName || "Unassigned",
        status: formatStatusLabel(ticket.status),
        timeText: `${ticket.scheduledStartTime || "—"} - ${ticket.scheduledEndTime || "—"}`,
        href: `/service-tickets/${ticket.id}`,
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
          tech: project.assignedTechnicianName || "Unassigned",
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(
            project.bidStatus
          )}`,
          timeText: "Project Stage",
          href: `/projects/${project.id}`,
        });
      }
    }

    for (const day of allMonthDays) {
      result[day.isoDate].sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [tickets, projects, allMonthDays]);

  const unscheduledItems = useMemo(() => {
    const ticketItems: ScheduleItem[] = tickets
      .filter((ticket) => !ticket.scheduledDate)
      .map((ticket) => ({
        kind: "service_ticket",
        id: ticket.id,
        title: ticket.issueSummary,
        subtitle: ticket.customerDisplayName,
        tech: ticket.assignedTechnicianName || "Unassigned",
        status: formatStatusLabel(ticket.status),
        timeText: "Unscheduled",
        href: `/service-tickets/${ticket.id}`,
      }));

    const projectItems: ScheduleItem[] = [];

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
          tech: project.assignedTechnicianName || "Unassigned",
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(
            project.bidStatus
          )}`,
          timeText: "Project Stage Unscheduled",
          href: `/projects/${project.id}`,
        });
      }
    }

    return [...ticketItems, ...projectItems];
  }, [tickets, projects]);

  return (
    <ProtectedPage fallbackTitle="Monthly Schedule">
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
            <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Monthly Schedule</h1>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              {getMonthLabel(currentMonthBaseDate)}
            </p>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Currently showing: {showWeekends ? "Monday–Sunday" : "Monday–Friday"}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setMonthOffset((prev) => prev - 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Last Month
            </button>

            <button
              type="button"
              onClick={() => setMonthOffset(0)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              This Month
            </button>

            <button
              type="button"
              onClick={() => setMonthOffset((prev) => prev + 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Next Month
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowWeekends((prev) => !prev)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                {showWeekends ? "Hide Weekends" : "Show Weekends"}
              </button>
            ) : null}

            <Link
              href="/service-tickets/new"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              New Service Ticket
            </Link>
          </div>
        </div>

        {loading ? <p>Loading monthly schedule...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(220px, 1fr))",
                gap: "12px",
                alignItems: "start",
              }}
            >
              {visibleMonthDays.map((day) => {
                const dayItems = itemsByDate[day.isoDate] ?? [];

                return (
                  <div
                    key={day.isoDate}
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
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: "8px",
                        marginBottom: "6px",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "16px" }}>
                        {day.dayNumber}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {day.isoDate}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      {dayItems.length === 0 ? (
                        <div
                          style={{
                            border: "1px dashed #ccc",
                            borderRadius: "10px",
                            padding: "10px",
                            fontSize: "12px",
                            color: "#777",
                            background: "white",
                          }}
                        >
                          No work
                        </div>
                      ) : (
                        dayItems.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
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
                            <div style={{ fontWeight: 700, fontSize: "13px" }}>
                              {item.kind === "project_stage" ? "📐 " : "🔧 "}
                              {item.title}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                              {item.timeText}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                              {item.subtitle}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                              Tech: {item.tech}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                              Status: {item.status}
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "20px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Unscheduled Work
              </h2>

              {unscheduledItems.length === 0 ? (
                <p style={{ color: "#666" }}>No unscheduled work.</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {unscheduledItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
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
                      <div style={{ fontWeight: 700, fontSize: "14px" }}>
                        {item.kind === "project_stage" ? "📐 " : "🔧 "}
                        {item.title}
                      </div>

                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                        {item.subtitle}
                      </div>

                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                        Tech: {item.tech}
                      </div>

                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                        Status: {item.status}
                      </div>
                    </Link>
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