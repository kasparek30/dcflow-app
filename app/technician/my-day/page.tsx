"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceTicket } from "../../../src/types/service-ticket";
import type { Project, ProjectStage, StageStaffing } from "../../../src/types/project";
import type { AppUser } from "../../../src/types/app-user";

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

function isoInRange(targetIso: string, startIso: string, endIso: string) {
  return targetIso >= startIso && targetIso <= endIso;
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

type UserLite = {
  uid: string;
  displayName: string;
  role: AppUser["role"];
  active: boolean;
};

type EmployeeProfileLite = {
  userUid: string;
  laborRole?: string;
  employmentStatus?: string;
  defaultPairedTechUid?: string | null;
};

export default function TechnicianMyDayPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [profiles, setProfiles] = useState<EmployeeProfileLite[]>([]);
  const [error, setError] = useState("");

  const [pairingBanner, setPairingBanner] = useState<{
    kind: "override" | "default" | "none";
    techUid?: string;
    techName?: string;
    note?: string;
  } | null>(null);

  const todayIso = useMemo(() => isoTodayLocal(), []);
  const myUid = appUser?.uid || "";

  function findUserName(uid: string) {
    const u = users.find((x) => x.uid === uid);
    return u?.displayName || uid;
  }

  function normalizeRole(s?: string) {
    return (s || "").trim().toLowerCase();
  }

  const isHelperLike =
    appUser?.role === "helper" || appUser?.role === "apprentice";

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      setPairingBanner(null);

      try {
        const [ticketSnap, projectSnap, usersSnap, profileSnap] = await Promise.all([
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
          getDocs(collection(db, "users")),
          getDocs(collection(db, "employeeProfiles")),
        ]);

        const userItems: UserLite[] = usersSnap.docs.map((d) => {
          const data = d.data();
          return {
            uid: data.uid ?? d.id,
            displayName: data.displayName ?? "Unnamed",
            role: data.role ?? "technician",
            active: data.active ?? true,
          };
        });
        setUsers(userItems);

        const profileItems: EmployeeProfileLite[] = profileSnap.docs
          .map((d) => {
            const data = d.data();
            const userUid = String(data.userUid ?? "").trim();
            if (!userUid) return null;
            return {
              userUid,
              laborRole: data.laborRole ?? undefined,
              employmentStatus: data.employmentStatus ?? undefined,
              defaultPairedTechUid: data.defaultPairedTechUid ?? null,
            };
          })
          .filter(Boolean) as EmployeeProfileLite[];
        setProfiles(profileItems);

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
        setTickets(ticketItems);

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

            primaryTechnicianId: data.primaryTechnicianId ?? undefined,
            primaryTechnicianName: data.primaryTechnicianName ?? undefined,
            secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
            secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,
            helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,
            helperNames: Array.isArray(data.helperNames) ? data.helperNames.filter(Boolean) : undefined,

            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,

            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          } as any;
        });
        setProjects(projectItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load My Day data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ✅ Determine helper pairing for today (override > default > none)
  const effectivePairedTechUid = useMemo(() => {
    if (!myUid) return "";

    if (!isHelperLike) return ""; // only used for helper/apprentice

    // 1) daily override (if any)
    // We'll fetch via a separate effect and store banner; this memo returns from banner if set.
    if (pairingBanner?.techUid) return pairingBanner.techUid;

    // 2) default from employee profile
    const myProfile = profiles.find((p) => p.userUid === myUid);
    const defaultTechUid = String(myProfile?.defaultPairedTechUid ?? "").trim();
    return defaultTechUid;
  }, [myUid, isHelperLike, pairingBanner, profiles]);

  // ✅ Fetch today’s override for this helper
  useEffect(() => {
    async function loadOverride() {
      if (!myUid) return;
      if (!isHelperLike) return;

      try {
        const qRef = query(
          collection(db, "dailyCrewOverrides"),
          where("helperUid", "==", myUid),
          where("date", "==", todayIso),
          where("active", "==", true),
          limit(1)
        );

        const snap = await getDocs(qRef);

        if (snap.empty) {
          // no override; banner will be set later from default pairing
          const myProfile = profiles.find((p) => p.userUid === myUid);
          const defaultTechUid = String(myProfile?.defaultPairedTechUid ?? "").trim();
          if (defaultTechUid) {
            setPairingBanner({
              kind: "default",
              techUid: defaultTechUid,
              techName: "", // filled later when users loaded
            });
          } else {
            setPairingBanner({ kind: "none" });
          }
          return;
        }

        const data = snap.docs[0].data();
        const assignedTechUid = String(data.assignedTechUid ?? "").trim();
        const note = String(data.note ?? "").trim();

        if (!assignedTechUid) {
          setPairingBanner({ kind: "none" });
          return;
        }

        setPairingBanner({
          kind: "override",
          techUid: assignedTechUid,
          techName: "",
          note: note || undefined,
        });
      } catch (err: unknown) {
        // If rules block this collection, you’ll see it here
        setError(err instanceof Error ? err.message : "Failed to load crew override.");
      }
    }

    loadOverride();
  }, [myUid, isHelperLike, todayIso, profiles]);

  // ✅ Improve banner with names once users are loaded
  const banner = useMemo(() => {
    if (!isHelperLike) return null;
    if (!pairingBanner) return null;

    if (pairingBanner.kind === "none") {
      return {
        title: "⚠️ Pairing Notice",
        message:
          "No paired technician found for today. Ask an admin to set your default pairing in Employee Profiles, or create a Daily Crew Override for today.",
      };
    }

    const techUid = pairingBanner.techUid || "";
    const techName = techUid ? findUserName(techUid) : "Unknown";

    if (pairingBanner.kind === "override") {
      return {
        title: "✅ Override Active",
        message: `Today you are paired with: ${techName}${pairingBanner.note ? ` • Note: ${pairingBanner.note}` : ""}`,
      };
    }

    return {
      title: "✅ Pairing Active",
      message: `Today you are paired with your default technician: ${techName}`,
    };
  }, [isHelperLike, pairingBanner, users]);

  // ✅ Tickets for today:
  // - If technician: show items assigned to YOU (primary/secondary/helper/legacy)
  // - If helper: show items assigned to YOU OR assigned to your paired tech today
  const todaysTicketItems = useMemo(() => {
    if (!myUid) return [];

    const pairedTechUid = isHelperLike ? effectivePairedTechUid : "";

    return tickets
      .filter((t) => t.active !== false)
      .filter((t) => t.scheduledDate === todayIso)
      .filter((t) => {
        const primaryUid = (t.primaryTechnicianId || t.assignedTechnicianId || "") as string;
        const secondaryUid = (t.secondaryTechnicianId || "") as string;

        const isMine =
          primaryUid === myUid ||
          secondaryUid === myUid ||
          includesUid(t.helperIds, myUid) ||
          (t.assignedTechnicianId || "") === myUid;

        const isPairedTech =
          pairedTechUid
            ? primaryUid === pairedTechUid || secondaryUid === pairedTechUid
            : false;

        return isMine || isPairedTech;
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
  }, [tickets, myUid, todayIso, isHelperLike, effectivePairedTechUid]);

  // ✅ Project stages for today (range aware), same pairing logic as tickets
  const todaysProjectStageItems = useMemo(() => {
    if (!myUid) return [];
    const pairedTechUid = isHelperLike ? effectivePairedTechUid : "";

    const items: MyDayItem[] = [];

    function considerStage(
      project: any,
      stageKey: "roughIn" | "topOutVent" | "trimFinish",
      label: string
    ) {
      const stage = project?.[stageKey] as any;

      const start = (stage?.scheduledDate || "") as string;
      if (!start) return;

      const end = (stage?.scheduledEndDate || start) as string;
      if (!isoInRange(todayIso, start, end)) return;

      const staff = stageCrewFallback(project, stage);
      if (!staff) return;

      const primaryUid = String(staff.primaryTechnicianId || "");
      const secondaryUid = String(staff.secondaryTechnicianId || "");

      const isMine =
        primaryUid === myUid ||
        secondaryUid === myUid ||
        includesUid(staff.helperIds, myUid);

      const isPairedTech =
        pairedTechUid ? primaryUid === pairedTechUid || secondaryUid === pairedTechUid : false;

      if (!isMine && !isPairedTech) return;

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
        staff.primaryTechnicianName || project?.assignedTechnicianName || "Unassigned";

      const timeText = end !== start ? `Project Stage (${start} → ${end})` : "Project Stage";

      items.push({
        kind: "project_stage",
        id: `${project.id}-${stageKey}-${todayIso}`,
        title: `${project.projectName} • ${label}`,
        subtitle: project.customerDisplayName,
        location: project.serviceAddressLine1,
        timeText,
        statusText: `Stage: ${formatStageStatus(stage?.status || "not_started")}`,
        techText: `Tech: ${techName}`,
        helperText,
        secondaryTechText,
        href: `/projects/${project.id}`,
      });
    }

    for (const p of projects) {
      if ((p as any).active === false) continue;
      considerStage(p as any, "roughIn", "Rough-In");
      considerStage(p as any, "topOutVent", "Top-Out / Vent");
      considerStage(p as any, "trimFinish", "Trim / Finish");
    }

    return items;
  }, [projects, myUid, todayIso, isHelperLike, effectivePairedTechUid]);

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

        {banner ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              background: "#fafafa",
            }}
          >
            <div style={{ fontWeight: 800 }}>{banner.title}</div>
            <div style={{ marginTop: "6px", color: "#555", fontSize: "13px" }}>
              {banner.message}
            </div>
          </div>
        ) : null}

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