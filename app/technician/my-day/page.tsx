"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceTicket } from "../../../src/types/service-ticket";
import type { Project, ProjectStage, StageStaffing } from "../../../src/types/project";

type DailyCrewOverride = {
  id: string;
  date: string; // "YYYY-MM-DD"
  helperUid: string;
  assignedTechUid: string;
  active: boolean;
  note?: string;
};

type MyDayItem =
  | {
      kind: "service_ticket";
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
    }
  | {
      kind: "project_stage";
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
  // stage staffing wins
  const staff = stage?.staffing;
  if (staff && typeof staff === "object") return staff as StageStaffing;

  // fallback to project-level default crew
  const fallback: StageStaffing = {
    primaryTechnicianId:
      project?.primaryTechnicianId ?? project?.assignedTechnicianId ?? undefined,
    primaryTechnicianName:
      project?.primaryTechnicianName ?? project?.assignedTechnicianName ?? undefined,
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

export default function TechnicianMyDayPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [overrideForMe, setOverrideForMe] = useState<DailyCrewOverride | null>(null);
  const [usersByUid, setUsersByUid] = useState<Record<string, { displayName: string; role: string }>>(
    {}
  );
  const [error, setError] = useState("");

  const todayIso = useMemo(() => isoTodayLocal(), []);
  const myUid = appUser?.uid || "";

  const pairedTechUid = useMemo(() => {
    // ✅ override wins
    if (overrideForMe?.active && overrideForMe.assignedTechUid) {
      return overrideForMe.assignedTechUid;
    }

    // ✅ fallback to default pairing if you store it on appUser (some setups do)
    // otherwise My Day will still work via "helperIds on tickets/projects" once assigned.
    return "";
  }, [overrideForMe]);

  const pairedTechName = useMemo(() => {
    if (!pairedTechUid) return "";
    return usersByUid[pairedTechUid]?.displayName || pairedTechUid;
  }, [pairedTechUid, usersByUid]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const [ticketSnap, projectSnap, overridesSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
          getDocs(collection(db, "dailyCrewOverrides")),
          getDocs(collection(db, "users")),
        ]);

        // Users map for name lookup (Jacob/Josh/etc)
        const userMap: Record<string, { displayName: string; role: string }> = {};
        for (const d of usersSnap.docs) {
          const data = d.data();
          const uid = (data.uid ?? d.id) as string;
          userMap[uid] = {
            displayName: (data.displayName ?? "Unnamed") as string,
            role: (data.role ?? "unknown") as string,
          };
        }
        setUsersByUid(userMap);

        // Pull override for THIS helper for TODAY
        if (myUid) {
          const overrides: DailyCrewOverride[] = overridesSnap.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              date: (data.date ?? "") as string,
              helperUid: (data.helperUid ?? "") as string,
              assignedTechUid: (data.assignedTechUid ?? "") as string,
              active: Boolean(data.active ?? true),
              note: (data.note ?? undefined) as string | undefined,
            };
          });

          const found = overrides.find(
            (o) => o.active && o.date === todayIso && o.helperUid === myUid
          );

          setOverrideForMe(found ?? null);
        } else {
          setOverrideForMe(null);
        }

        // Tickets
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
            helperNames: Array.isArray(data.helperNames)
              ? data.helperNames.filter(Boolean)
              : undefined,

            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        // Projects
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

            // project defaults
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

        setTickets(ticketItems);
        setProjects(projectItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load My Day data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [myUid, todayIso]);

  // ✅ Helper logic:
  // If I'm a helper/apprentice:
  // - If override exists: show the paired tech's tickets/projects for today
  // - Otherwise: show tickets/projects where I'm explicitly on helperIds
  const isHelperRole =
    appUser?.role === "helper" || appUser?.role === "apprentice";

  const todaysTicketItems = useMemo(() => {
    if (!myUid) return [];

    return tickets
      .filter((t) => t.active !== false)
      .filter((t) => t.scheduledDate === todayIso)
      .filter((t) => {
        // If helper + has paired tech override, show paired tech schedule
        if (isHelperRole && pairedTechUid) {
          const techUid = t.primaryTechnicianId || t.assignedTechnicianId || "";
          return techUid === pairedTechUid;
        }

        // Otherwise show anything directly assigned to me (tech/helper)
        const primaryMatch = (t.primaryTechnicianId || t.assignedTechnicianId || "") === myUid;
        const secondaryMatch = (t.secondaryTechnicianId || "") === myUid;
        const helperMatch = includesUid(t.helperIds, myUid);
        const legacyMatch = (t.assignedTechnicianId || "") === myUid;
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

        const secondaryTechText = t.secondaryTechnicianName
          ? `2nd Tech: ${t.secondaryTechnicianName}`
          : undefined;

        const timeText = `${t.scheduledStartTime || "—"} - ${t.scheduledEndTime || "—"}`;

        const techName =
          t.assignedTechnicianName ||
          usersByUid[t.primaryTechnicianId || t.assignedTechnicianId || ""]?.displayName ||
          "Unassigned";

        return {
          kind: "service_ticket",
          id: t.id,
          title: t.issueSummary,
          subtitle: t.customerDisplayName,
          location: t.serviceAddressLine1,
          timeText,
          statusText: formatTicketStatus(t.status),
          techText: `Tech: ${techName}`,
          helperText,
          secondaryTechText,
          href: `/service-tickets/${t.id}`,
        };
      });
  }, [tickets, myUid, todayIso, isHelperRole, pairedTechUid, usersByUid]);

  const todaysProjectStageItems = useMemo(() => {
    if (!myUid) return [];

    const items: MyDayItem[] = [];

    function considerStage(
      project: any,
      stageKey: "roughIn" | "topOutVent" | "trimFinish",
      label: string
    ) {
      const stage = project?.[stageKey] as any;
      const scheduledDate = stage?.scheduledDate || "";
      if (scheduledDate !== todayIso) return;

      const staff = stageCrewFallback(project, stage);
      if (!staff) return;

      if (isHelperRole && pairedTechUid) {
        return (staff.primaryTechnicianId || "") === pairedTechUid;
      }

      const primaryMatch = (staff.primaryTechnicianId || "") === myUid;
      const secondaryMatch = (staff.secondaryTechnicianId || "") === myUid;
      const helperMatch = includesUid(staff.helperIds, myUid);

      if (!primaryMatch && !secondaryMatch && !helperMatch) return;

      const helperNames = Array.isArray(staff.helperNames) ? staff.helperNames : [];
      const helperText =
        helperNames.length > 0
          ? helperNames.length === 1
            ? `Helper: ${helperNames[0]}`
            : `Helpers: ${helperNames.join(", ")}`
          : undefined;

      const secondaryTechText = staff.secondaryTechnicianName
        ? `2nd Tech: ${staff.secondaryTechnicianName}`
        : undefined;

      const techName =
        staff.primaryTechnicianName ||
        usersByUid[staff.primaryTechnicianId || ""]?.displayName ||
        project?.assignedTechnicianName ||
        "Unassigned";

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
  }, [projects, myUid, todayIso, isHelperRole, pairedTechUid, usersByUid]);

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

  return (
    <ProtectedPage fallbackTitle="My Day">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>My Day</h1>
            <p style={{ marginTop: "6px", color: "#666" }}>
              Today: <strong>{todayIso}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link
              href="/schedule"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Weekly Schedule
            </Link>
            <Link
              href="/time-entries"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Time Entries
            </Link>
          </div>
        </div>

        {/* ✅ Pairing banner */}
        <div style={{ marginTop: "14px" }}>
          {isHelperRole ? (
            overrideForMe?.active ? (
              <div
                style={{
                  border: "1px solid #cce5cc",
                  background: "#f3fff3",
                  borderRadius: "12px",
                  padding: "12px",
                  color: "#1f6b1f",
                }}
              >
                ✅ Daily Override Active<br />
                Today you are paired with: <strong>{pairedTechName || pairedTechUid}</strong>
                {overrideForMe.note ? (
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#2a7b2a" }}>
                    Note: {overrideForMe.note}
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                style={{
                  border: "1px solid #eee",
                  background: "#fafafa",
                  borderRadius: "12px",
                  padding: "12px",
                  color: "#555",
                }}
              >
                ✅ Pairing Active<br />
                {pairedTechUid ? (
                  <>
                    Today you are paired with: <strong>{pairedTechName || pairedTechUid}</strong>
                  </>
                ) : (
                  <>Today you are paired with your default technician (no override found).</>
                )}
              </div>
            )
          ) : null}
        </div>

        {loading ? <p style={{ marginTop: "16px" }}>Loading your day...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <div style={{ marginTop: "16px" }}>
            {allItems.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #ccc",
                  borderRadius: "12px",
                  padding: "14px",
                  background: "white",
                  color: "#666",
                }}
              >
                No work scheduled for you today.
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

                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                      {item.subtitle}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                      {item.location}
                    </div>

                    <div style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>
                      {item.techText}
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