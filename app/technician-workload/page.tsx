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
import type { AppUser } from "../../src/types/app-user";

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUser["role"];
};

type WorkItem = {
  id: string;
  kind: "service_ticket" | "project_stage";
  title: string;
  customer: string;
  location: string;
  date?: string;
  timeText: string;
  status: string;
  href: string;
  sortDate: string;
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

function getEndOfWeek(date: Date) {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function formatTicketStatus(status: ServiceTicket["status"]) {
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

export default function TechnicianWorkloadPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    async function loadData() {
      try {
        const [usersSnap, ticketsSnap, projectsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
        ]);

        const techItems: TechnicianOption[] = usersSnap.docs
          .map((docSnap) => {
            const data = docSnap.data();

            return {
              uid: data.uid ?? docSnap.id,
              displayName: data.displayName ?? "Unnamed Technician",
              active: data.active ?? false,
              role: data.role ?? "technician",
            };
          })
          .filter((user) => user.role === "technician" && user.active)
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        const ticketItems: ServiceTicket[] = ticketsSnap.docs.map((docSnap) => {
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

        const projectItems: Project[] = projectsSnap.docs.map((docSnap) => {
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

        setTechnicians(techItems);
        setTickets(ticketItems);
        setProjects(projectItems);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load technician workload.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const weekBaseDate = useMemo(() => {
    const today = new Date();
    const shifted = new Date(today);
    shifted.setDate(today.getDate() + weekOffset * 7);
    return shifted;
  }, [weekOffset]);

  const weekStart = useMemo(() => formatDateToIsoLocal(getStartOfWeek(weekBaseDate)), [weekBaseDate]);
  const weekEnd = useMemo(() => formatDateToIsoLocal(getEndOfWeek(weekBaseDate)), [weekBaseDate]);

  const workloadByTech = useMemo(() => {
    const result: Record<string, WorkItem[]> = {};

    for (const tech of technicians) {
      result[tech.uid] = [];
    }

    for (const ticket of tickets) {
      if (!ticket.assignedTechnicianId) continue;
      if (!result[ticket.assignedTechnicianId]) continue;

      const inWeek =
        !!ticket.scheduledDate &&
        ticket.scheduledDate >= weekStart &&
        ticket.scheduledDate <= weekEnd;

      const unscheduledAssigned = !ticket.scheduledDate;

      if (!inWeek && !unscheduledAssigned) continue;

      result[ticket.assignedTechnicianId].push({
        id: `ticket-${ticket.id}`,
        kind: "service_ticket",
        title: ticket.issueSummary,
        customer: ticket.customerDisplayName,
        location: ticket.serviceAddressLine1,
        date: ticket.scheduledDate,
        timeText: ticket.scheduledDate
          ? `${ticket.scheduledDate} • ${ticket.scheduledStartTime || "—"} - ${ticket.scheduledEndTime || "—"}`
          : "Unscheduled",
        status: formatTicketStatus(ticket.status),
        href: `/service-tickets/${ticket.id}`,
        sortDate: ticket.scheduledDate || "9999-99-99",
        sortTime: ticket.scheduledStartTime || "99:99",
      });
    }

    for (const project of projects) {
      if (!project.assignedTechnicianId) continue;
      if (!result[project.assignedTechnicianId]) continue;

      const stages = [
        {
          key: "roughIn",
          label: "Rough-In",
          stage: project.roughIn,
        },
        {
          key: "topOutVent",
          label: "Top-Out / Vent",
          stage: project.topOutVent,
        },
        {
          key: "trimFinish",
          label: "Trim / Finish",
          stage: project.trimFinish,
        },
      ] as const;

      for (const entry of stages) {
        if (entry.stage.status === "complete") continue;

        const inWeek =
          !!entry.stage.scheduledDate &&
          entry.stage.scheduledDate >= weekStart &&
          entry.stage.scheduledDate <= weekEnd;

        const unscheduledAssigned = !entry.stage.scheduledDate;

        if (!inWeek && !unscheduledAssigned) continue;

        result[project.assignedTechnicianId].push({
          id: `project-${project.id}-${entry.key}`,
          kind: "project_stage",
          title: `${project.projectName} • ${entry.label}`,
          customer: project.customerDisplayName,
          location: project.serviceAddressLine1,
          date: entry.stage.scheduledDate,
          timeText: entry.stage.scheduledDate
            ? `${entry.stage.scheduledDate} • Project Stage`
            : "Project Stage Unscheduled",
          status: `${formatProjectStageStatus(entry.stage.status)} • ${formatProjectBidStatus(
            project.bidStatus
          )}`,
          href: `/projects/${project.id}`,
          sortDate: entry.stage.scheduledDate || "9999-99-99",
          sortTime: "12:00",
        });
      }
    }

    for (const tech of technicians) {
      result[tech.uid].sort((a, b) => {
        const byDate = a.sortDate.localeCompare(b.sortDate);
        if (byDate !== 0) return byDate;
        const byTime = a.sortTime.localeCompare(b.sortTime);
        if (byTime !== 0) return byTime;
        return a.title.localeCompare(b.title);
      });
    }

    return result;
  }, [technicians, tickets, projects, weekStart, weekEnd]);

  return (
    <ProtectedPage fallbackTitle="Technician Workload">
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
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
              Technician Workload
            </h1>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Week of {weekStart} through {weekEnd}
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
          </div>
        </div>

        {loading ? <p>Loading technician workload...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && technicians.length === 0 ? (
          <p>No active technicians found.</p>
        ) : null}

        {!loading && !error && technicians.length > 0 ? (
          <div style={{ display: "grid", gap: "16px" }}>
            {technicians.map((tech) => {
              const items = workloadByTech[tech.uid] ?? [];

              return (
                <div
                  key={tech.uid}
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
                      marginBottom: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "18px" }}>
                      {tech.displayName}
                    </div>
                    <div style={{ fontSize: "13px", color: "#666" }}>
                      {items.length} assigned item{items.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  {items.length === 0 ? (
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
                      No assigned work for this week.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {items.map((item) => (
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

                          <div
                            style={{
                              marginTop: "4px",
                              fontSize: "12px",
                              color: "#555",
                            }}
                          >
                            {item.timeText}
                          </div>

                          <div
                            style={{
                              marginTop: "4px",
                              fontSize: "12px",
                              color: "#555",
                            }}
                          >
                            Customer: {item.customer}
                          </div>

                          <div
                            style={{
                              marginTop: "4px",
                              fontSize: "12px",
                              color: "#555",
                            }}
                          >
                            {item.location}
                          </div>

                          <div
                            style={{
                              marginTop: "4px",
                              fontSize: "12px",
                              color: "#777",
                            }}
                          >
                            Status: {item.status}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}