"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type { ServiceTicket } from "../../../../src/types/service-ticket";
import type { Project, ProjectStage, StageStaffing } from "../../../../src/types/project";
import type { AppUser } from "../../../../src/types/app-user";

type MyDayItem = {
  kind: "service_ticket" | "project_stage";
  id: string;
  title: string;
  subtitle: string;
  location: string;
  timeText: string;
  statusText: string;
  techText: string;
  helperText?: string;
  secondaryTechText?: string;
  href: string;
};

type PageProps = {
  params: Promise<{ uid: string }>;
};

type UserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role?: string;
  active: boolean;
};

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function formatStageStatus(status: ProjectStage["status"]) {
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

function asArray<T>(x: any): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function includesUid(list: any, uid: string) {
  const arr = asArray<string>(list).filter(Boolean);
  return arr.includes(uid);
}

function stageCrewFallback(project: any, stage: any): StageStaffing | null {
  const staff = stage?.staffing;
  if (staff && typeof staff === "object") return staff as StageStaffing;

  const fallback: StageStaffing = {
    primaryTechnicianId: project?.primaryTechnicianId ?? project?.assignedTechnicianId ?? undefined,
    primaryTechnicianName: project?.primaryTechnicianName ?? project?.assignedTechnicianName ?? undefined,
    secondaryTechnicianId: project?.secondaryTechnicianId ?? undefined,
    secondaryTechnicianName: project?.secondaryTechnicianName ?? undefined,
    helperIds: Array.isArray(project?.helperIds) ? project.helperIds : undefined,
    helperNames: Array.isArray(project?.helperNames) ? project.helperNames : undefined,
  };

  const hasAnything =
    Boolean(fallback.primaryTechnicianId) ||
    Boolean(fallback.secondaryTechnicianId) ||
    (Array.isArray(fallback.helperIds) && fallback.helperIds.length > 0);

  return hasAnything ? fallback : null;
}

export default function AdminMyDayUserPage({ params }: PageProps) {
  const { appUser } = useAuthContext();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");

  const [targetUid, setTargetUid] = useState("");

  const canView = appUser?.role === "admin" || appUser?.role === "dispatcher" || appUser?.role === "manager";

  const dateIso = useMemo(() => {
    const q = (searchParams?.get("date") || "").trim();
    return q || isoTodayLocal();
  }, [searchParams]);

  useEffect(() => {
    async function init() {
      const resolved = await params;
      setTargetUid(resolved.uid);
    }
    init();
  }, [params]);

  useEffect(() => {
    async function load() {
      if (!targetUid) return;

      setLoading(true);
      setError("");

      try {
        const [ticketSnap, projectSnap, userSnap] = await Promise.all([
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
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

            // legacy
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,

            // multi-tech
            primaryTechnicianId: data.primaryTechnicianId ?? undefined,
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

            // project-level defaults
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

        const userItems: UserOption[] = userSnap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: d.uid ?? docSnap.id,
            displayName: d.displayName ?? "Unnamed",
            email: d.email ?? undefined,
            role: d.role ?? undefined,
            active: d.active ?? false,
          };
        });

        setTickets(ticketItems);
        setProjects(projectItems);
        setUsers(userItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load Admin My Day data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [targetUid]);

  const targetUser = useMemo(() => {
    return users.find((u) => u.uid === targetUid) ?? null;
  }, [users, targetUid]);

  const todaysTicketItems = useMemo(() => {
    if (!targetUid) return [];

    return tickets
      .filter((t) => t.active !== false)
      .filter((t) => t.scheduledDate === dateIso)
      .filter((t) => {
        const primaryMatch = (t.primaryTechnicianId || t.assignedTechnicianId || "") === targetUid;
        const secondaryMatch = (t.secondaryTechnicianId || "") === targetUid;
        const helperMatch = includesUid(t.helperIds, targetUid);
        const legacyMatch = (t.assignedTechnicianId || "") === targetUid;
        return primaryMatch || secondaryMatch || helperMatch || legacyMatch;
      })
      .map<MyDayItem>((t) => {
        const helperNames = Array.isArray(t.helperNames) ? t.helperNames : [];
        const helperText =
          helperNames.length > 0
            ? helperNames.length === 1
              ? `Helper: ${helperNames[0]}`
              : `Helpers: ${helperNames.join(", ")}`
            : undefined;

        const secondaryTechText = t.secondaryTechnicianName ? `2nd Tech: ${t.secondaryTechnicianName}` : undefined;

        const timeText = `${t.scheduledStartTime || "—"} - ${t.scheduledEndTime || "—"}`;

        return {
          kind: "service_ticket",
          id: t.id,
          title: t.issueSummary,
          subtitle: t.customerDisplayName,
          location: t.serviceAddressLine1,
          timeText,
          statusText: formatTicketStatus(t.status),
          techText: `Tech: ${t.assignedTechnicianName || "Unassigned"}`,
          helperText,
          secondaryTechText,
          href: `/service-tickets/${t.id}`,
        };
      });
  }, [tickets, targetUid, dateIso]);

  const todaysProjectStageItems = useMemo(() => {
    if (!targetUid) return [];

    const items: MyDayItem[] = [];

    function considerStage(project: any, stageKey: "roughIn" | "topOutVent" | "trimFinish", label: string) {
      const stage = project?.[stageKey] as any;
      const scheduledDate = stage?.scheduledDate || "";
      if (scheduledDate !== dateIso) return;

      const staff = stageCrewFallback(project, stage);
      if (!staff) return;

      const primaryMatch = (staff.primaryTechnicianId || "") === targetUid;
      const secondaryMatch = (staff.secondaryTechnicianId || "") === targetUid;
      const helperMatch = includesUid(staff.helperIds, targetUid);

      if (!primaryMatch && !secondaryMatch && !helperMatch) return;

      const helperNames = Array.isArray(staff.helperNames) ? staff.helperNames : [];
      const helperText =
        helperNames.length > 0
          ? helperNames.length === 1
            ? `Helper: ${helperNames[0]}`
            : `Helpers: ${helperNames.join(", ")}`
          : undefined;

      const secondaryTechText = staff.secondaryTechnicianName ? `2nd Tech: ${staff.secondaryTechnicianName}` : undefined;

      const techName = staff.primaryTechnicianName || project?.assignedTechnicianName || "Unassigned";

      items.push({
        kind: "project_stage",
        id: `${project.id}-${stageKey}`,
        title: `${project.projectName} • ${label}`,
        subtitle: project.customerDisplayName,
        location: project.serviceAddressLine1,
        timeText: "Project Stage",
        statusText: `Stage: ${formatStageStatus(stage?.status || "not_started")}`,
        techText: `Tech: ${techName}`,
        helperText,
        secondaryTechText,
        href: `/projects/${project.id}`,
      });
    }

    for (const p of projects) {
      if (p.active === false) continue;
      considerStage(p as any, "roughIn", "Rough-In");
      considerStage(p as any, "topOutVent", "Top-Out / Vent");
      considerStage(p as any, "trimFinish", "Trim / Finish");
    }

    return items;
  }, [projects, targetUid, dateIso]);

  const allItems = useMemo(() => {
    const merged = [...todaysTicketItems, ...todaysProjectStageItems];

    merged.sort((a, b) => {
      const aKey = a.kind === "service_ticket" ? a.timeText : "99:99";
      const bKey = b.kind === "service_ticket" ? b.timeText : "99:99";
      const byTime = aKey.localeCompare(bKey);
      if (byTime !== 0) return byTime;
      return a.title.localeCompare(b.title);
    });

    return merged;
  }, [todaysTicketItems, todaysProjectStageItems]);

  if (!canView) {
    return (
      <ProtectedPage fallbackTitle="Admin My Day">
        <AppShell appUser={appUser}>
          <p style={{ color: "red" }}>You do not have permission to view Admin My Day.</p>
        </AppShell>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Admin My Day">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Admin: My Day</h1>
            <p style={{ marginTop: "6px", color: "#666" }}>
              Viewing: <strong>{targetUser?.displayName || targetUid || "—"}</strong> • Date: <strong>{dateIso}</strong>
            </p>
            <p style={{ marginTop: "6px", color: "#777", fontSize: "12px" }}>
              UID: {targetUid || "—"} • Role: {targetUser?.role || "—"} • {targetUser?.active ? "Active" : "Inactive"}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link
              href={`/admin/my-day?date=${encodeURIComponent(dateIso)}`}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Back to Picker
            </Link>

            <Link
              href={`/admin/my-day/${encodeURIComponent(targetUid)}?date=${encodeURIComponent(isoTodayLocal())}`}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Jump to Today
            </Link>
          </div>
        </div>

        {loading ? <p style={{ marginTop: "16px" }}>Loading schedule feed...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <div style={{ marginTop: "16px" }}>
            {allItems.length === 0 ? (
              <div style={{ border: "1px dashed #ccc", borderRadius: "12px", padding: "14px", background: "white", color: "#666" }}>
                No work scheduled for this user on {dateIso}.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {allItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    style={{
                      display: "block",
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "12px",
                      background: "white",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>
                      {item.kind === "service_ticket" ? "🔧 " : "📐 "}
                      {item.title}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                      {item.timeText} • {item.statusText}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>{item.subtitle}</div>
                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>{item.location}</div>

                    <div style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>{item.techText}</div>

                    {item.helperText ? (
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>{item.helperText}</div>
                    ) : null}

                    {item.secondaryTechText ? (
                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>{item.secondaryTechText}</div>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}