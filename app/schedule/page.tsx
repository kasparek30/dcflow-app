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
import type { EmployeeUnavailability, UnavailabilityType } from "../../src/types/unavailability";
import type { AppUser } from "../../src/types/app-user";

type DayBucket = {
  key: string;
  label: string;
  shortLabel: string;
  isoDate: string;
  dayIndex: number;
};

type ScheduleItem = {
  kind: "service_ticket" | "project_stage" | "unavailable";
  id: string;
  date: string;
  sortTime: string;
  title: string;
  subtitle: string;
  location: string;

  tech: string;

  helperText?: string;
  secondaryTechText?: string;

  status: string;
  href: string;
  timeText: string;
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

function formatUnavailabilityType(t: UnavailabilityType) {
  switch (t) {
    case "sick":
      return "Sick";
    case "pto":
      return "PTO";
    case "holiday":
      return "Holiday";
    case "unpaid":
      return "Unpaid";
    case "other":
      return "Out";
    default:
      return t;
  }
}

function isoInRange(targetIso: string, startIso: string, endIso: string) {
  const start = (startIso || "").trim();
  const end = (endIso || "").trim();

  if (!start) return false;
  if (!end) return targetIso === start;

  const min = start < end ? start : end;
  const max = start < end ? end : start;

  return targetIso >= min && targetIso <= max;
}

function buildCrewTextFromStaffing(staffing: any, fallbackProject: any) {
  const primaryName =
    staffing?.primaryTechnicianName ||
    fallbackProject?.primaryTechnicianName ||
    fallbackProject?.assignedTechnicianName ||
    "Unassigned";

  const secondaryName =
    staffing?.secondaryTechnicianName ||
    fallbackProject?.secondaryTechnicianName ||
    "";

  const helperNamesRaw =
    (Array.isArray(staffing?.helperNames) && staffing.helperNames) ||
    (Array.isArray(fallbackProject?.helperNames) && fallbackProject.helperNames) ||
    [];

  const helperNames = helperNamesRaw.filter(Boolean);

  const helperText =
    helperNames.length > 0
      ? helperNames.length === 1
        ? `Helper: ${helperNames[0]}`
        : `Helpers: ${helperNames.join(", ")}`
      : undefined;

  const secondaryTechText = secondaryName ? `2nd Tech: ${secondaryName}` : undefined;

  return { primaryName, helperText, secondaryTechText };
}

export default function WeeklySchedulePage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unavailability, setUnavailability] = useState<EmployeeUnavailability[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekends, setShowWeekends] = useState(false);

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
    async function loadData() {
      try {
        const [ticketSnap, projectSnap, unavailSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
          getDocs(collection(db, "employeeUnavailability")),
          getDocs(collection(db, "users")),
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

            primaryTechnicianId: data.primaryTechnicianId ?? undefined,
            assignedTechnicianIds: Array.isArray(data.assignedTechnicianIds)
              ? data.assignedTechnicianIds.filter(Boolean)
              : undefined,

            secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
            secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,

            helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,
            helperNames: Array.isArray(data.helperNames) ? data.helperNames.filter(Boolean) : undefined,

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
            roughIn: data.roughIn ?? { status: "not_started", billed: false, billedAmount: 0 },
            topOutVent: data.topOutVent ?? { status: "not_started", billed: false, billedAmount: 0 },
            trimFinish: data.trimFinish ?? { status: "not_started", billed: false, billedAmount: 0 },

            // project-level default crew (optional)
            primaryTechnicianId: data.primaryTechnicianId ?? undefined,
            primaryTechnicianName: data.primaryTechnicianName ?? undefined,
            secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
            secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,
            helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,
            helperNames: Array.isArray(data.helperNames) ? data.helperNames.filter(Boolean) : undefined,

            // legacy
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,

            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          } as any;
        });

        const unavailItems: EmployeeUnavailability[] = unavailSnap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userUid: d.userUid ?? "",
            date: d.date ?? "",
            type: (d.type ?? "other") as UnavailabilityType,
            reason: d.reason ?? undefined,
            active: d.active ?? true,
            createdAt: d.createdAt ?? undefined,
            createdByUid: d.createdByUid ?? undefined,
            updatedAt: d.updatedAt ?? undefined,
            updatedByUid: d.updatedByUid ?? undefined,
          };
        });

        const um: Record<string, string> = {};
        usersSnap.docs.forEach((docSnap) => {
          const d = docSnap.data() as Partial<AppUser> & { displayName?: string; uid?: string };
          const uid = (d.uid ?? docSnap.id) as string;
          um[uid] = (d.displayName ?? "Unnamed") as string;
        });

        setTickets(ticketItems);
        setProjects(projectItems);
        setUnavailability(unavailItems);
        setUserMap(um);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load weekly schedule.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
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

  const scheduledItemsByDay = useMemo(() => {
    const result: Record<string, ScheduleItem[]> = {};
    for (const day of allWeekDays) result[day.isoDate] = [];

    // ✅ Unavailability blocks (single day)
    for (const u of unavailability) {
      if (!u.active) continue;
      if (!u.date || !result[u.date]) continue;

      const name = userMap[u.userUid] || u.userUid;
      const t = formatUnavailabilityType(u.type);
      const reason = u.reason ? ` • ${u.reason}` : "";

      result[u.date].push({
        kind: "unavailable",
        id: `unavail-${u.id}`,
        date: u.date,
        sortTime: "00:00",
        title: `🚫 OUT: ${name}`,
        subtitle: t + reason,
        location: "",
        tech: name,
        status: "Unavailable",
        href: "/admin/unavailability",
        timeText: "Employee Unavailable",
      });
    }

    // Service tickets
    for (const ticket of tickets) {
      if (!ticket.scheduledDate || !result[ticket.scheduledDate]) continue;

      const primaryName = ticket.assignedTechnicianName || "Unassigned";
      const helperNames = Array.isArray(ticket.helperNames) ? ticket.helperNames : [];
      const secondaryName = ticket.secondaryTechnicianName || "";

      const helperText =
        helperNames.length > 0
          ? helperNames.length === 1
            ? `Helper: ${helperNames[0]}`
            : `Helpers: ${helperNames.join(", ")}`
          : undefined;

      const secondaryTechText = secondaryName ? `2nd Tech: ${secondaryName}` : undefined;

      result[ticket.scheduledDate].push({
        kind: "service_ticket",
        id: ticket.id,
        date: ticket.scheduledDate,
        sortTime: ticket.scheduledStartTime || "99:99",
        title: ticket.issueSummary,
        subtitle: ticket.customerDisplayName,
        location: ticket.serviceAddressLine1,
        tech: primaryName,
        helperText,
        secondaryTechText,
        status: formatStatusLabel(ticket.status),
        href: `/service-tickets/${ticket.id}`,
        timeText: `${ticket.scheduledStartTime || "—"} - ${ticket.scheduledEndTime || "—"}`,
      });
    }

    // Projects (stage date range)
    for (const project of projects) {
      const stageEntries = [
        { stageKey: "roughIn", label: "Rough-In", stage: project.roughIn },
        { stageKey: "topOutVent", label: "Top-Out / Vent", stage: project.topOutVent },
        { stageKey: "trimFinish", label: "Trim / Finish", stage: project.trimFinish },
      ] as const;

      for (const entry of stageEntries) {
        const start = (entry.stage as any).scheduledDate as string | undefined;
        if (!start) continue;

        const end = ((entry.stage as any).scheduledEndDate as string | undefined) || start;

        for (const day of allWeekDays) {
          if (!result[day.isoDate]) continue;
          if (!isoInRange(day.isoDate, start, end)) continue;

          const staffing = (entry.stage as any).staffing || null;
          const crew = buildCrewTextFromStaffing(staffing, project as any);

          const timeText =
            end && end !== start ? `Project Stage (${start} → ${end})` : "Project Stage";

          result[day.isoDate].push({
            kind: "project_stage",
            id: `${project.id}-${entry.stageKey}-${day.isoDate}`,
            date: day.isoDate,
            sortTime: "12:00",
            title: `${project.projectName} • ${entry.label}`,
            subtitle: project.customerDisplayName,
            location: project.serviceAddressLine1,
            tech: crew.primaryName,
            helperText: crew.helperText,
            secondaryTechText: crew.secondaryTechText,
            status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(
              project.bidStatus
            )}`,
            href: `/projects/${project.id}`,
            timeText,
          });
        }
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
  }, [tickets, projects, allWeekDays, unavailability, userMap]);

  const unscheduledItems = useMemo(() => {
    const ticketItems: ScheduleItem[] = tickets
      .filter((ticket) => !ticket.scheduledDate)
      .map((ticket) => {
        const primaryName = ticket.assignedTechnicianName || "Unassigned";
        const helperNames = Array.isArray(ticket.helperNames) ? ticket.helperNames : [];
        const secondaryName = ticket.secondaryTechnicianName || "";

        const helperText =
          helperNames.length > 0
            ? helperNames.length === 1
              ? `Helper: ${helperNames[0]}`
              : `Helpers: ${helperNames.join(", ")}`
            : undefined;

        const secondaryTechText = secondaryName ? `2nd Tech: ${secondaryName}` : undefined;

        return {
          kind: "service_ticket",
          id: ticket.id,
          date: "",
          sortTime: "99:99",
          title: ticket.issueSummary,
          subtitle: ticket.customerDisplayName,
          location: ticket.serviceAddressLine1,
          tech: primaryName,
          helperText,
          secondaryTechText,
          status: formatStatusLabel(ticket.status),
          href: `/service-tickets/${ticket.id}`,
          timeText: "Unscheduled",
        };
      });

    const projectItems: ScheduleItem[] = [];

    for (const project of projects) {
      const stageEntries = [
        { stageKey: "roughIn", label: "Rough-In", stage: project.roughIn },
        { stageKey: "topOutVent", label: "Top-Out / Vent", stage: project.topOutVent },
        { stageKey: "trimFinish", label: "Trim / Finish", stage: project.trimFinish },
      ] as const;

      for (const entry of stageEntries) {
        const start = (entry.stage as any).scheduledDate as string | undefined;
        if (start) continue;
        if (entry.stage.status === "complete") continue;

        const staffing = (entry.stage as any).staffing || null;
        const crew = buildCrewTextFromStaffing(staffing, project as any);

        projectItems.push({
          kind: "project_stage",
          id: `${project.id}-${entry.stageKey}-unscheduled`,
          date: "",
          sortTime: "99:99",
          title: `${project.projectName} • ${entry.label}`,
          subtitle: project.customerDisplayName,
          location: project.serviceAddressLine1,
          tech: crew.primaryName,
          helperText: crew.helperText,
          secondaryTechText: crew.secondaryTechText,
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(
            project.bidStatus
          )}`,
          href: `/projects/${project.id}`,
          timeText: "Project Stage Unscheduled",
        });
      }
    }

    return [...ticketItems, ...projectItems];
  }, [tickets, projects]);

  return (
    <ProtectedPage fallbackTitle="Weekly Schedule">
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
            <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Weekly Schedule</h1>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Week of {weekStart} through {weekEnd}
            </p>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Currently showing: {showWeekends ? "Monday–Sunday" : "Monday–Friday"}
            </p>
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

            {isAdmin ? (
              <Link
                href="/admin/unavailability"
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "inherit",
                  background: "white",
                }}
              >
                Employee Out
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? <p>Loading weekly schedule...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${visibleWeekDays.length}, minmax(240px, 1fr))`,
                gap: "12px",
                alignItems: "start",
                overflowX: "auto",
              }}
            >
              {visibleWeekDays.map((day) => {
                const dayItems = scheduledItemsByDay[day.isoDate] ?? [];

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "12px",
                      background: "#fafafa",
                      minHeight: "260px",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "4px" }}>
                      {day.label}
                    </div>

                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>
                      {day.isoDate}
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {dayItems.length === 0 ? (
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
                          No scheduled items
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
                              background: item.kind === "unavailable" ? "#fff5f5" : "white",
                              textDecoration: "none",
                              color: "inherit",
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: "14px" }}>
                              {item.kind === "project_stage"
                                ? "📐 "
                                : item.kind === "unavailable"
                                  ? "🚫 "
                                  : "🔧 "}
                              {item.title}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                              {item.timeText}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                              {item.subtitle}
                            </div>

                            {item.location ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                                {item.location}
                              </div>
                            ) : null}

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                              Tech: {item.tech}
                            </div>

                            {item.helperText ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                {item.helperText}
                              </div>
                            ) : null}

                            {item.secondaryTechText ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                {item.secondaryTechText}
                              </div>
                            ) : null}

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

                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                        {item.location}
                      </div>

                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                        Tech: {item.tech}
                      </div>

                      {item.helperText ? (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                          {item.helperText}
                        </div>
                      ) : null}

                      {item.secondaryTechText ? (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                          {item.secondaryTechText}
                        </div>
                      ) : null}

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