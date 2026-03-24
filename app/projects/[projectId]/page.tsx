// app/projects/[projectId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  setDoc,
  writeBatch,
  deleteDoc,
  addDoc,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { Project, StageStaffing } from "../../../src/types/project";
import type { AppUser } from "../../../src/types/app-user";

type ProjectDetailPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUser["role"];
};

type EmployeeProfileOption = {
  id: string;
  userUid?: string | null;
  displayName?: string;
  employmentStatus?: string;
  laborRole?: string; // helper/apprentice/technician/etc
  defaultPairedTechUid?: string | null;
};

type StageKey = "roughIn" | "topOutVent" | "trimFinish";

type StageAssignmentState = {
  primaryUid: string;
  secondaryUid: string;
  helperUid: string; // single helper (simpler + consistent with trip crew)
  secondaryHelperUid: string; // second helper
  useDefaultHelper: boolean;
  overrideEnabled: boolean; // if false -> stage uses project defaults (no staffing saved)
};

function emptyStageAssignment(): StageAssignmentState {
  return {
    primaryUid: "",
    secondaryUid: "",
    helperUid: "",
    secondaryHelperUid: "",
    useDefaultHelper: true,
    overrideEnabled: false,
  };
}

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

function formatBidStatus(status: Project["bidStatus"]) {
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

function formatStageStatus(status: Project["roughIn"]["status"]) {
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromIsoDate(iso: string) {
  const [y, m, day] = iso.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, day || 1);
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function dateRangeIso(startIso: string, endIso: string) {
  const start = fromIsoDate(startIso);
  const end = fromIsoDate(endIso);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const out: string[] = [];
  let cur = new Date(start);
  while (cur <= end) {
    out.push(toIsoDate(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

type TripCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;
  helperUid?: string | null;
  helperName?: string | null;
  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;
  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
};

type TripDoc = {
  id: string;
  active: boolean;
  type: "service" | "project" | string;
  status: string; // planned | in_progress | complete | cancelled
  date: string; // YYYY-MM-DD
  timeWindow: "am" | "pm" | "all_day" | "custom" | string;
  startTime: string; // "08:00"
  endTime: string; // "17:00"
  crew?: TripCrew | null;
  link?: {
    projectId?: string | null;
    projectStageKey?: string | null;
    serviceTicketId?: string | null;
  } | null;
  notes?: string | null;
  cancelReason?: string | null;
  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

function isUidOnTripCrew(uid: string, crew?: TripCrew | null) {
  if (!uid) return false;
  if (!crew) return false;
  return (
    (crew.primaryTechUid || "") === uid ||
    (crew.helperUid || "") === uid ||
    (crew.secondaryTechUid || "") === uid ||
    (crew.secondaryHelperUid || "") === uid
  );
}

function stageLabel(stageKey: StageKey) {
  if (stageKey === "roughIn") return "Rough-In";
  if (stageKey === "topOutVent") return "Top-Out / Vent";
  return "Trim / Finish";
}

function stageScheduledStart(project: Project, stageKey: StageKey) {
  const stage =
    stageKey === "roughIn"
      ? project.roughIn
      : stageKey === "topOutVent"
      ? project.topOutVent
      : project.trimFinish;
  return String(stage.scheduledDate || "").trim();
}

function stageScheduledEnd(project: Project, stageKey: StageKey) {
  const stage: any =
    stageKey === "roughIn"
      ? project.roughIn
      : stageKey === "topOutVent"
      ? project.topOutVent
      : project.trimFinish;
  return String(stage.scheduledEndDate || "").trim();
}

function getEnabledStages(projectType: string): StageKey[] {
  const t = String(projectType || "").toLowerCase();
  if (t === "new_construction") return ["roughIn", "topOutVent", "trimFinish"];
  if (t === "remodel") return ["roughIn", "trimFinish"]; // 2 stages
  if (t === "time_materials" || t === "time+materials" || t === "time_and_materials") return [];
  return ["roughIn", "topOutVent", "trimFinish"];
}

function safeTrim(x: any) {
  return String(x || "").trim();
}

function formatTripWindow(w: string) {
  const x = String(w || "").toLowerCase();
  if (x === "am") return "AM";
  if (x === "pm") return "PM";
  if (x === "all_day") return "All Day";
  if (x === "custom") return "Custom";
  return w;
}

function windowToTimes(window: string) {
  const w = String(window || "").toLowerCase();
  if (w === "am") return { start: "08:00", end: "12:00" };
  if (w === "pm") return { start: "13:00", end: "17:00" };
  if (w === "all_day") return { start: "08:00", end: "17:00" };
  return { start: "09:00", end: "10:00" };
}

function makeProjectTripId(projectId: string, stageKey: StageKey, dateIso: string) {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `proj_${projectId}_${stageKey}_${dateIso}_${suffix}`;
}

function defaultStageTripDate(stageKey: StageKey, args: { roughStart: string; topStart: string; trimStart: string }) {
  const start =
    stageKey === "roughIn"
      ? safeTrim(args.roughStart)
      : stageKey === "topOutVent"
      ? safeTrim(args.topStart)
      : safeTrim(args.trimStart);

  if (start) return start;
  return toIsoDate(new Date());
}

// -----------------------------
// UI bits (consistent DCFlow vibe)
// -----------------------------
const UI = {
  pageBg: "#ffffff",
  cardBg: "#ffffff",
  cardBorder: "rgba(15, 23, 42, 0.10)",
  softShadow: "0 12px 30px rgba(2, 6, 23, 0.08)",
  title: "#0b1220",
  sub: "rgba(2, 6, 23, 0.65)",
  faint: "rgba(2, 6, 23, 0.45)",
  primary: "#1e40ff",
  primaryDark: "#1636d8",
  primarySoft: "rgba(30, 64, 255, 0.10)",
  danger: "#ef4444",
  dangerDark: "#dc2626",
  dangerSoft: "rgba(239, 68, 68, 0.10)",
  surface: "rgba(2, 6, 23, 0.03)",
  surface2: "rgba(2, 6, 23, 0.045)",
  focusRing: "0 0 0 4px rgba(30, 64, 255, 0.16)",
};

function Card({
  children,
  title,
  right,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${UI.cardBorder}`,
        borderRadius: 16,
        background: UI.cardBg,
        boxShadow: UI.softShadow,
        overflow: "hidden",
      }}
    >
      {title ? (
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${UI.cardBorder}`,
            background: "linear-gradient(180deg, rgba(30,64,255,0.06), rgba(255,255,255,0.00))",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, color: UI.title, fontSize: 15 }}>{title}</div>
            {subtitle ? (
              <div style={{ marginTop: 4, fontSize: 12, color: UI.sub, fontWeight: 700 }}>{subtitle}</div>
            ) : null}
          </div>
          {right ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{right}</div> : null}
        </div>
      ) : null}

      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant,
  type,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "soft" | "softDanger";
  type?: "button" | "submit";
  title?: string;
}) {
  const v = variant || "ghost";
  const styles: Record<string, any> = {
    primary: {
      border: `1px solid ${UI.primaryDark}`,
      background: UI.primary,
      color: "white",
    },
    ghost: {
      border: `1px solid ${UI.cardBorder}`,
      background: "white",
      color: UI.title,
    },
    soft: {
      border: `1px solid rgba(30,64,255,0.20)`,
      background: UI.primarySoft,
      color: UI.primaryDark,
    },
    danger: {
      border: `1px solid ${UI.dangerDark}`,
      background: UI.danger,
      color: "white",
    },
    softDanger: {
      border: `1px solid rgba(239,68,68,0.25)`,
      background: UI.dangerSoft,
      color: UI.dangerDark,
    },
  };

  return (
    <button
      type={type || "button"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        fontWeight: 950,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...styles[v],
      }}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 900, color: UI.sub }}>{children}</div>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${UI.cardBorder}`,
        outline: "none",
        ...(props.style || {}),
      }}
      onFocus={(e) => {
        (e.currentTarget as any).style.boxShadow = UI.focusRing;
        props.onFocus?.(e as any);
      }}
      onBlur={(e) => {
        (e.currentTarget as any).style.boxShadow = "none";
        props.onBlur?.(e as any);
      }}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${UI.cardBorder}`,
        outline: "none",
        background: "white",
        ...(props.style || {}),
      }}
      onFocus={(e) => {
        (e.currentTarget as any).style.boxShadow = UI.focusRing;
        props.onFocus?.(e as any);
      }}
      onBlur={(e) => {
        (e.currentTarget as any).style.boxShadow = "none";
        props.onBlur?.(e as any);
      }}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${UI.cardBorder}`,
        outline: "none",
        ...(props.style || {}),
      }}
      onFocus={(e) => {
        (e.currentTarget as any).style.boxShadow = UI.focusRing;
        props.onFocus?.(e as any);
      }}
      onBlur={(e) => {
        (e.currentTarget as any).style.boxShadow = "none";
        props.onBlur?.(e as any);
      }}
    />
  );
}

type TripModalMode = "create" | "edit";

type TripModalState = {
  open: boolean;
  mode: TripModalMode;
  stageKey: StageKey | null;
  tripId: string | null;

  date: string;
  timeWindow: "am" | "pm" | "all_day" | "custom";
  startTime: string;
  endTime: string;
  notes: string;

  primaryTechUid: string;
  helperUid: string;
  secondaryTechUid: string;
  secondaryHelperUid: string;
};

function emptyTripModal(): TripModalState {
  return {
    open: false,
    mode: "create",
    stageKey: null,
    tripId: null,
    date: "",
    timeWindow: "all_day",
    startTime: "08:00",
    endTime: "17:00",
    notes: "",
    primaryTechUid: "",
    helperUid: "",
    secondaryTechUid: "",
    secondaryHelperUid: "",
  };
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  const [techLoading, setTechLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techError, setTechError] = useState("");

  const [profilesLoading, setProfilesLoading] = useState(true);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [profilesError, setProfilesError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [bidStatus, setBidStatus] = useState<"draft" | "submitted" | "won" | "lost">("draft");

  // ✅ Project-level default crew (fallback)
  const [projectPrimaryUid, setProjectPrimaryUid] = useState("");
  const [projectSecondaryUid, setProjectSecondaryUid] = useState("");
  const [projectHelperUid, setProjectHelperUid] = useState<string>("");
  const [projectSecondaryHelperUid, setProjectSecondaryHelperUid] = useState<string>("");
  const [projectUseDefaultHelper, setProjectUseDefaultHelper] = useState(true);

  // ✅ Stage-level crew (override)
  const [roughInAssign, setRoughInAssign] = useState<StageAssignmentState>(emptyStageAssignment());
  const [topOutAssign, setTopOutAssign] = useState<StageAssignmentState>(emptyStageAssignment());
  const [trimAssign, setTrimAssign] = useState<StageAssignmentState>(emptyStageAssignment());

  const [roughInStatus, setRoughInStatus] = useState<"not_started" | "scheduled" | "in_progress" | "complete">(
    "not_started"
  );
  const [roughInScheduledDate, setRoughInScheduledDate] = useState("");
  const [roughInScheduledEndDate, setRoughInScheduledEndDate] = useState("");
  const [roughInCompletedDate, setRoughInCompletedDate] = useState("");

  const [topOutVentStatus, setTopOutVentStatus] = useState<"not_started" | "scheduled" | "in_progress" | "complete">(
    "not_started"
  );
  const [topOutVentScheduledDate, setTopOutVentScheduledDate] = useState("");
  const [topOutVentScheduledEndDate, setTopOutVentScheduledEndDate] = useState("");
  const [topOutVentCompletedDate, setTopOutVentCompletedDate] = useState("");

  const [trimFinishStatus, setTrimFinishStatus] = useState<"not_started" | "scheduled" | "in_progress" | "complete">(
    "not_started"
  );
  const [trimFinishScheduledDate, setTrimFinishScheduledDate] = useState("");
  const [trimFinishScheduledEndDate, setTrimFinishScheduledEndDate] = useState("");
  const [trimFinishCompletedDate, setTrimFinishCompletedDate] = useState("");

  const [internalNotes, setInternalNotes] = useState("");

  // ✅ Stage tab UX
  const [activeStageTab, setActiveStageTab] = useState<StageKey>("roughIn");

  // ✅ Project trips
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [projectTrips, setProjectTrips] = useState<TripDoc[]>([]);

  // ✅ Trip modal (edit + create)
  const [tripModal, setTripModal] = useState<TripModalState>(emptyTripModal());
  const [tripModalBusy, setTripModalBusy] = useState(false);
  const [tripModalErr, setTripModalErr] = useState("");
  const [tripModalOk, setTripModalOk] = useState("");

  const myUid = String(appUser?.uid || "").trim();

  // ✅ Editing permissions
  const canEditProject = appUser?.role === "admin" || appUser?.role === "dispatcher" || appUser?.role === "manager";
  const isFieldRole = appUser?.role === "technician" || appUser?.role === "helper" || appUser?.role === "apprentice";

  // -----------------------------
  // Helpers: profiles + pairing
  // -----------------------------
  const helperCandidates = useMemo(() => {
    const candidates: { uid: string; name: string; laborRole: string; defaultPairedTechUid?: string | null }[] = [];

    for (const p of employeeProfiles) {
      if ((p.employmentStatus || "current").toLowerCase() !== "current") continue;
      const labor = normalizeRole(p.laborRole);
      if (labor !== "helper" && labor !== "apprentice") continue;

      const uid = String(p.userUid || "").trim();
      if (!uid) continue;

      candidates.push({
        uid,
        name: p.displayName || "Unnamed",
        laborRole: labor,
        defaultPairedTechUid: p.defaultPairedTechUid ?? null,
      });
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));
    return candidates;
  }, [employeeProfiles]);

  function computeDefaultHelperForTech(techUid: string) {
    const uid = techUid.trim();
    if (!uid) return "";
    const match = helperCandidates.find((h) => String(h.defaultPairedTechUid || "").trim() === uid);
    return match?.uid || "";
  }

  function findTechName(uid: string) {
    const tech = technicians.find((t) => t.uid === uid);
    return tech?.displayName || "";
  }

  function findHelperName(uid: string) {
    const h = helperCandidates.find((x) => x.uid === uid);
    return h?.name || "";
  }

  // -----------------------------
  // Effective Crew per stage
  // -----------------------------
  function getEffectiveCrewForStage(stageKey: StageKey): {
    primary: string;
    helper: string;
    secondary: string;
    secondaryHelper: string;
  } {
    const stageState =
      stageKey === "roughIn" ? roughInAssign : stageKey === "topOutVent" ? topOutAssign : trimAssign;

    if (stageState.overrideEnabled) {
      return {
        primary: stageState.primaryUid,
        helper: stageState.helperUid,
        secondary: stageState.secondaryUid,
        secondaryHelper: stageState.secondaryHelperUid,
      };
    }

    return {
      primary: projectPrimaryUid,
      helper: projectHelperUid,
      secondary: projectSecondaryUid,
      secondaryHelper: projectSecondaryHelperUid,
    };
  }

  // -----------------------------
  // Load Project
  // -----------------------------
  useEffect(() => {
    async function loadProject() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.projectId;
        setProjectId(id);

        const projectRef = doc(db, "projects", id);
        const snap = await getDoc(projectRef);

        if (!snap.exists()) {
          setError("Project not found.");
          setLoading(false);
          return;
        }

        const data = snap.data() as any;

        const item: Project = {
          id: snap.id,
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

          // legacy
          assignedTechnicianId: data.assignedTechnicianId ?? undefined,
          assignedTechnicianName: data.assignedTechnicianName ?? undefined,

          // project default crew
          primaryTechnicianId: data.primaryTechnicianId ?? undefined,
          primaryTechnicianName: data.primaryTechnicianName ?? undefined,
          secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
          secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,
          helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,
          helperNames: Array.isArray(data.helperNames) ? data.helperNames.filter(Boolean) : undefined,

          internalNotes: data.internalNotes ?? undefined,
          active: data.active ?? true,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        } as any;

        setProject(item);
        setBidStatus(item.bidStatus);

        // seed project default crew
        const seededProjectPrimary = (data.primaryTechnicianId as string | undefined) || item.assignedTechnicianId || "";
        setProjectPrimaryUid(seededProjectPrimary);
        setProjectSecondaryUid((data.secondaryTechnicianId as string | undefined) || "");

        // helpers: convert old array -> first/second
        const helperIds: string[] = Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : [];
        setProjectHelperUid(helperIds[0] || "");
        setProjectSecondaryHelperUid(helperIds[1] || "");

        const stageStaffing = (stage: any): StageStaffing | undefined => {
          return stage?.staffing ? stage.staffing : undefined;
        };

        const roughStaff = stageStaffing(item.roughIn);
        const topStaff = stageStaffing(item.topOutVent);
        const trimStaff = stageStaffing(item.trimFinish);

        const pickHelper1 = (staff?: StageStaffing) => (Array.isArray(staff?.helperIds) ? staff!.helperIds![0] || "" : "");
        const pickHelper2 = (staff?: StageStaffing) => (Array.isArray(staff?.helperIds) ? staff!.helperIds![1] || "" : "");

        setRoughInAssign({
          primaryUid: roughStaff?.primaryTechnicianId || "",
          secondaryUid: roughStaff?.secondaryTechnicianId || "",
          helperUid: pickHelper1(roughStaff),
          secondaryHelperUid: pickHelper2(roughStaff),
          useDefaultHelper: true,
          overrideEnabled: Boolean(roughStaff),
        });

        setTopOutAssign({
          primaryUid: topStaff?.primaryTechnicianId || "",
          secondaryUid: topStaff?.secondaryTechnicianId || "",
          helperUid: pickHelper1(topStaff),
          secondaryHelperUid: pickHelper2(topStaff),
          useDefaultHelper: true,
          overrideEnabled: Boolean(topStaff),
        });

        setTrimAssign({
          primaryUid: trimStaff?.primaryTechnicianId || "",
          secondaryUid: trimStaff?.secondaryTechnicianId || "",
          helperUid: pickHelper1(trimStaff),
          secondaryHelperUid: pickHelper2(trimStaff),
          useDefaultHelper: true,
          overrideEnabled: Boolean(trimStaff),
        });

        setRoughInStatus(item.roughIn.status);
        setRoughInScheduledDate(item.roughIn.scheduledDate ?? "");
        setRoughInScheduledEndDate((item.roughIn as any).scheduledEndDate ?? "");
        setRoughInCompletedDate(item.roughIn.completedDate ?? "");

        setTopOutVentStatus(item.topOutVent.status);
        setTopOutVentScheduledDate(item.topOutVent.scheduledDate ?? "");
        setTopOutVentScheduledEndDate((item.topOutVent as any).scheduledEndDate ?? "");
        setTopOutVentCompletedDate(item.topOutVent.completedDate ?? "");

        setTrimFinishStatus(item.trimFinish.status);
        setTrimFinishScheduledDate(item.trimFinish.scheduledDate ?? "");
        setTrimFinishScheduledEndDate((item.trimFinish as any).scheduledEndDate ?? "");
        setTrimFinishCompletedDate(item.trimFinish.completedDate ?? "");

        setInternalNotes(item.internalNotes ?? "");

        // default active stage tab based on project type
        const enabled = getEnabledStages(item.projectType);
        if (enabled.length > 0) setActiveStageTab(enabled[0]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load project.");
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [params]);

  // -----------------------------
  // Load Technicians
  // -----------------------------
  useEffect(() => {
    async function loadTechnicians() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: TechnicianOption[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              uid: data.uid ?? docSnap.id,
              displayName: data.displayName ?? "Unnamed Technician",
              active: data.active ?? false,
              role: data.role ?? "technician",
            };
          })
          .filter((user) => user.role === "technician" && user.active);

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setTechnicians(items);
      } catch (err: unknown) {
        setTechError(err instanceof Error ? err.message : "Failed to load technicians.");
      } finally {
        setTechLoading(false);
      }
    }

    loadTechnicians();
  }, []);

  // -----------------------------
  // Load Employee Profiles
  // -----------------------------
  useEffect(() => {
    async function loadProfiles() {
      setProfilesLoading(true);
      setProfilesError("");

      try {
        const snap = await getDocs(collection(db, "employeeProfiles"));
        const items: EmployeeProfileOption[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;
          return {
            id: docSnap.id,
            userUid: d.userUid ?? null,
            displayName: d.displayName ?? undefined,
            employmentStatus: d.employmentStatus ?? "current",
            laborRole: d.laborRole ?? "other",
            defaultPairedTechUid: d.defaultPairedTechUid ?? null,
          };
        });

        setEmployeeProfiles(items);
      } catch (err: unknown) {
        setProfilesError(err instanceof Error ? err.message : "Failed to load employee profiles.");
      } finally {
        setProfilesLoading(false);
      }
    }

    loadProfiles();
  }, []);

  // -----------------------------
  // Auto default helper pairing (project-level)
  // -----------------------------
  useEffect(() => {
    if (!projectUseDefaultHelper) return;

    const techUid = projectPrimaryUid.trim();
    if (!techUid) {
      setProjectHelperUid("");
      setProjectSecondaryHelperUid("");
      return;
    }

    const defaultHelper = computeDefaultHelperForTech(techUid);
    setProjectHelperUid(defaultHelper || "");
    // leave secondary helper alone unless empty
    setProjectSecondaryHelperUid((prev) => (prev ? prev : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPrimaryUid, projectUseDefaultHelper, helperCandidates.length]);

  // -----------------------------
  // Auto default helper pairing (stage-level)
  // -----------------------------
  useEffect(() => {
    if (!roughInAssign.overrideEnabled || !roughInAssign.useDefaultHelper) return;
    const techUid = roughInAssign.primaryUid.trim();
    if (!techUid) {
      setRoughInAssign((p) => ({ ...p, helperUid: "", secondaryHelperUid: "" }));
      return;
    }
    const h = computeDefaultHelperForTech(techUid);
    setRoughInAssign((p) => ({ ...p, helperUid: h || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roughInAssign.primaryUid, roughInAssign.overrideEnabled, roughInAssign.useDefaultHelper, helperCandidates.length]);

  useEffect(() => {
    if (!topOutAssign.overrideEnabled || !topOutAssign.useDefaultHelper) return;
    const techUid = topOutAssign.primaryUid.trim();
    if (!techUid) {
      setTopOutAssign((p) => ({ ...p, helperUid: "", secondaryHelperUid: "" }));
      return;
    }
    const h = computeDefaultHelperForTech(techUid);
    setTopOutAssign((p) => ({ ...p, helperUid: h || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topOutAssign.primaryUid, topOutAssign.overrideEnabled, topOutAssign.useDefaultHelper, helperCandidates.length]);

  useEffect(() => {
    if (!trimAssign.overrideEnabled || !trimAssign.useDefaultHelper) return;
    const techUid = trimAssign.primaryUid.trim();
    if (!techUid) {
      setTrimAssign((p) => ({ ...p, helperUid: "", secondaryHelperUid: "" }));
      return;
    }
    const h = computeDefaultHelperForTech(techUid);
    setTrimAssign((p) => ({ ...p, helperUid: h || "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimAssign.primaryUid, trimAssign.overrideEnabled, trimAssign.useDefaultHelper, helperCandidates.length]);

  // -----------------------------
  // Load Project Trips (linked to projectId)
  // -----------------------------
  useEffect(() => {
    async function loadProjectTrips() {
      if (!projectId) return;
      setTripsLoading(true);
      setTripsError("");

      try {
        const qTrips = query(
          collection(db, "trips"),
          where("link.projectId", "==", projectId),
          orderBy("date", "asc"),
          orderBy("startTime", "asc")
        );

        const snap = await getDocs(qTrips);
        const items: TripDoc[] = snap.docs.map((ds) => {
          const d = ds.data() as any;
          return {
            id: ds.id,
            active: typeof d.active === "boolean" ? d.active : true,
            type: d.type ?? "project",
            status: d.status ?? "planned",
            date: d.date ?? "",
            timeWindow: d.timeWindow ?? "all_day",
            startTime: d.startTime ?? "08:00",
            endTime: d.endTime ?? "17:00",
            crew: d.crew ?? null,
            link: d.link ?? null,
            notes: d.notes ?? null,
            cancelReason: d.cancelReason ?? null,
            createdAt: d.createdAt ?? undefined,
            createdByUid: d.createdByUid ?? null,
            updatedAt: d.updatedAt ?? undefined,
            updatedByUid: d.updatedByUid ?? null,
          };
        });

        setProjectTrips(items);
      } catch (e: any) {
        setTripsError(e?.message || "Failed to load project trips.");
      } finally {
        setTripsLoading(false);
      }
    }

    loadProjectTrips();
  }, [projectId]);

  // -----------------------------
  // Stage filtering based on project type
  // -----------------------------
  const enabledStages = useMemo(() => {
    if (!project) return ["roughIn", "topOutVent", "trimFinish"] as StageKey[];
    return getEnabledStages(project.projectType);
  }, [project]);

  const hasStages = enabledStages.length > 0;

  // -----------------------------
  // Trips grouped by stage
  // -----------------------------
  const tripsByStage = useMemo(() => {
    const map: Record<StageKey, TripDoc[]> = {
      roughIn: [],
      topOutVent: [],
      trimFinish: [],
    };

    for (const t of projectTrips) {
      const stageKey = String(t.link?.projectStageKey || "").trim() as StageKey;
      if (stageKey === "roughIn" || stageKey === "topOutVent" || stageKey === "trimFinish") {
        map[stageKey].push(t);
      }
    }

    for (const k of Object.keys(map) as StageKey[]) {
      map[k].sort((a, b) => `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`));
    }

    return map;
  }, [projectTrips]);

  const nonStageProjectTrips = useMemo(() => {
    return projectTrips
      .filter((t) => !String(t.link?.projectStageKey || "").trim())
      .sort((a, b) => `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`));
  }, [projectTrips]);

  function canCurrentUserEditTrip(t: TripDoc) {
    if (canEditProject) return true;
    if (!isFieldRole) return false;
    return Boolean(myUid) && isUidOnTripCrew(myUid, t.crew || null);
  }

  // -----------------------------
  // Trip actions: cancel + delete
  // -----------------------------
  async function cancelTrip(t: TripDoc) {
    if (!project) return;

    if (!canEditProject) {
      alert("Only Admin/Dispatcher/Manager can cancel project trips.");
      return;
    }

    const reason = window.prompt("Cancel this trip? Enter a cancel reason (required):", "");
    if (reason == null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      alert("Cancel reason is required.");
      return;
    }

    try {
      const now = nowIso();

      await updateDoc(doc(db, "trips", t.id), {
        status: "cancelled",
        active: false,
        cancelReason: trimmed,
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      setProjectTrips((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? { ...x, status: "cancelled", active: false, cancelReason: trimmed, updatedAt: now, updatedByUid: myUid || null }
            : x
        )
      );
    } catch (e: any) {
      alert(e?.message || "Failed to cancel trip.");
    }
  }

  async function removeTrip(t: TripDoc) {
    if (!project) return;

    if (!canEditProject) {
      alert("Only Admin/Dispatcher/Manager can delete trips.");
      return;
    }

    const ok = window.confirm(
      `Permanently delete this trip?\n\n${t.date} • ${formatTripWindow(String(t.timeWindow || ""))} • ${t.startTime}-${t.endTime}\n\nThis cannot be undone.`
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "trips", t.id));
      setProjectTrips((prev) => prev.filter((x) => x.id !== t.id));
      // if modal open on this trip, close it
      setTripModal((m) => (m.open && m.tripId === t.id ? emptyTripModal() : m));
    } catch (e: any) {
      alert(e?.message || "Failed to delete trip.");
    }
  }

  // -----------------------------
  // Sync Stage Trips: create missing daily all-day trips
  // (does NOT overwrite existing trips)
  // -----------------------------
  async function syncStageTrips(stageKey: StageKey) {
    if (!project) return;
    if (!canEditProject) return;

    const start =
      stageKey === "roughIn"
        ? roughInScheduledDate.trim()
        : stageKey === "topOutVent"
        ? topOutVentScheduledDate.trim()
        : trimFinishScheduledDate.trim();

    const endRaw =
      stageKey === "roughIn"
        ? roughInScheduledEndDate.trim()
        : stageKey === "topOutVent"
        ? topOutVentScheduledEndDate.trim()
        : trimFinishScheduledEndDate.trim();

    const end = endRaw || start;

    if (!start) {
      alert("Set a Scheduled Start Date for this stage first.");
      return;
    }

    const dates = dateRangeIso(start, end);
    if (dates.length === 0) {
      alert("Invalid stage date range.");
      return;
    }

    const crew = getEffectiveCrewForStage(stageKey);

    const primaryUid = crew.primary.trim();
    if (!primaryUid) {
      alert("Stage crew requires a Primary Technician (either stage override or project default).");
      return;
    }

    const helperUid = safeTrim(crew.helper || "");
    const secondaryUid = safeTrim(crew.secondary || "");
    const secondaryHelperUid = safeTrim(crew.secondaryHelper || "");

    const primaryName = findTechName(primaryUid) || "Primary Tech";
    const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
    const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
    const secondaryHelperName = secondaryHelperUid ? findHelperName(secondaryHelperUid) || "Helper" : null;

    const batchMax = 450;
    let batch = writeBatch(db);
    let batchCount = 0;

    let created = 0;
    let skipped = 0;

    const createdAt = nowIso();
    const createdByUid = myUid || null;

    for (const dateIso of dates) {
      const tripId = `proj_${project.id}_${stageKey}_${dateIso}`;
      const ref = doc(db, "trips", tripId);

      const existsSnap = await getDoc(ref);
      if (existsSnap.exists()) {
        skipped += 1;
        continue;
      }

      const payload = {
        active: true,
        type: "project",
        status: "planned",

        date: dateIso,
        timeWindow: "all_day",
        startTime: "08:00",
        endTime: "17:00",

        crew: {
          primaryTechUid: primaryUid,
          primaryTechName: primaryName,
          helperUid: helperUid || null,
          helperName: helperName,
          secondaryTechUid: secondaryUid || null,
          secondaryTechName: secondaryName,
          secondaryHelperUid: secondaryHelperUid || null,
          secondaryHelperName: secondaryHelperName,
        },

        link: {
          projectId: project.id,
          projectStageKey: stageKey,
          serviceTicketId: null,
        },

        notes: null,
        cancelReason: null,

        createdAt,
        createdByUid,
        updatedAt: createdAt,
        updatedByUid: createdByUid,
      };

      batch.set(ref, payload, { merge: true });
      batchCount += 1;
      created += 1;

      if (batchCount >= batchMax) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    alert(`✅ Stage trips synced.\nCreated: ${created}\nSkipped (already existed): ${skipped}`);

    // reload trips quickly
    try {
      setTripsLoading(true);
      const qTrips = query(
        collection(db, "trips"),
        where("link.projectId", "==", project.id),
        orderBy("date", "asc"),
        orderBy("startTime", "asc")
      );
      const snap = await getDocs(qTrips);
      const items: TripDoc[] = snap.docs.map((ds) => {
        const d = ds.data() as any;
        return {
          id: ds.id,
          active: typeof d.active === "boolean" ? d.active : true,
          type: d.type ?? "project",
          status: d.status ?? "planned",
          date: d.date ?? "",
          timeWindow: d.timeWindow ?? "all_day",
          startTime: d.startTime ?? "08:00",
          endTime: d.endTime ?? "17:00",
          crew: d.crew ?? null,
          link: d.link ?? null,
          notes: d.notes ?? null,
          cancelReason: d.cancelReason ?? null,
          createdAt: d.createdAt ?? undefined,
          createdByUid: d.createdByUid ?? null,
          updatedAt: d.updatedAt ?? undefined,
          updatedByUid: d.updatedByUid ?? null,
        };
      });
      setProjectTrips(items);
    } catch (e: any) {
      setTripsError(e?.message || "Failed to reload trips after sync.");
    } finally {
      setTripsLoading(false);
    }
  }

  // -----------------------------
  // Add Stage Trip (single, using effective crew)
  // -----------------------------
  async function addStageTrip(stageKey: StageKey) {
    if (!project) return;
    if (!canEditProject) {
      alert("Only Admin/Dispatcher/Manager can add project trips.");
      return;
    }

    const dateIso = defaultStageTripDate(stageKey, {
      roughStart: roughInScheduledDate,
      topStart: topOutVentScheduledDate,
      trimStart: trimFinishScheduledDate,
    });

    const crew = getEffectiveCrewForStage(stageKey);
    const primaryUid = safeTrim(crew.primary);
    if (!primaryUid) {
      alert("Stage crew requires a Primary Technician (stage override or project default).");
      return;
    }

    const helperUid = safeTrim(crew.helper || "");
    const secondaryUid = safeTrim(crew.secondary || "");
    const secondaryHelperUid = safeTrim(crew.secondaryHelper || "");

    const primaryName = findTechName(primaryUid) || "Primary Tech";
    const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
    const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
    const secondaryHelperName = secondaryHelperUid ? findHelperName(secondaryHelperUid) || "Helper" : null;

    const now = nowIso();
    const id = makeProjectTripId(project.id, stageKey, dateIso);

    const payload: any = {
      active: true,
      type: "project",
      status: "planned",

      date: dateIso,
      timeWindow: "all_day",
      startTime: "08:00",
      endTime: "17:00",

      crew: {
        primaryTechUid: primaryUid,
        primaryTechName: primaryName,
        helperUid: helperUid || null,
        helperName: helperName,
        secondaryTechUid: secondaryUid || null,
        secondaryTechName: secondaryName,
        secondaryHelperUid: secondaryHelperUid || null,
        secondaryHelperName: secondaryHelperName,
      },

      link: {
        projectId: project.id,
        projectStageKey: stageKey,
        serviceTicketId: null,
      },

      notes: null,
      cancelReason: null,

      createdAt: now,
      createdByUid: myUid || null,
      updatedAt: now,
      updatedByUid: myUid || null,
    };

    try {
      await setDoc(doc(db, "trips", id), payload, { merge: false });
      const newTrip: TripDoc = { id, ...(payload as any) };
      setProjectTrips((prev) =>
        [...prev, newTrip].sort((a, b) => `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`))
      );
    } catch (e: any) {
      alert(e?.message || "Failed to add trip.");
    }
  }

  // -----------------------------
  // Project Trips (no stages / time+materials): add trip (uses project defaults)
  // -----------------------------
  async function addProjectTripNoStageFromModal(values: TripModalState) {
    if (!project) return;
    if (!canEditProject) {
      alert("Only Admin/Dispatcher/Manager can add project trips.");
      return;
    }

    const date = safeTrim(values.date);
    const st = safeTrim(values.startTime);
    const et = safeTrim(values.endTime);

    if (!date) throw new Error("Trip date is required.");
    if (!st || !et) throw new Error("Start and end times are required.");
    if (et <= st) throw new Error("End time must be after start time.");

    // require at least a primary tech
    const primaryUid = safeTrim(values.primaryTechUid || projectPrimaryUid);
    if (!primaryUid) throw new Error("Primary Tech is required.");

    const helperUid = safeTrim(values.helperUid || "");
    const secondaryUid = safeTrim(values.secondaryTechUid || "");
    const secondaryHelperUid = safeTrim(values.secondaryHelperUid || "");

    const primaryName = findTechName(primaryUid) || "Primary Tech";
    const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
    const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
    const secondaryHelperName = secondaryHelperUid ? findHelperName(secondaryHelperUid) || "Helper" : null;

    const now = nowIso();

    const payload = {
      active: true,
      type: "project",
      status: "planned",

      date,
      timeWindow: values.timeWindow,
      startTime: st,
      endTime: et,

      crew: {
        primaryTechUid: primaryUid,
        primaryTechName: primaryName,
        helperUid: helperUid || null,
        helperName: helperName,
        secondaryTechUid: secondaryUid || null,
        secondaryTechName: secondaryName,
        secondaryHelperUid: secondaryHelperUid || null,
        secondaryHelperName: secondaryHelperName,
      },

      link: {
        projectId: project.id,
        projectStageKey: null,
        serviceTicketId: null,
      },

      notes: safeTrim(values.notes) || null,
      cancelReason: null,

      createdAt: now,
      createdByUid: myUid || null,
      updatedAt: now,
      updatedByUid: myUid || null,
    };

    const createdRef = await addDoc(collection(db, "trips"), payload as any);
    setProjectTrips((prev) =>
      [...prev, { id: createdRef.id, ...(payload as any) }].sort((a, b) =>
        `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`)
      )
    );
  }

  // -----------------------------
  // Trip Modal open helpers
  // -----------------------------
  function openCreateTrip(stageKey: StageKey | null) {
    if (!project) return;

    const defaults =
      stageKey && hasStages
        ? getEffectiveCrewForStage(stageKey)
        : {
            primary: projectPrimaryUid,
            helper: projectHelperUid,
            secondary: projectSecondaryUid,
            secondaryHelper: projectSecondaryHelperUid,
          };

    const tw: "all_day" = "all_day";
    const times = windowToTimes(tw);

    const date =
      stageKey && hasStages
        ? defaultStageTripDate(stageKey, {
            roughStart: roughInScheduledDate,
            topStart: topOutVentScheduledDate,
            trimStart: trimFinishScheduledDate,
          })
        : toIsoDate(new Date());

    setTripModalErr("");
    setTripModalOk("");
    setTripModal({
      open: true,
      mode: "create",
      stageKey: stageKey,
      tripId: null,
      date,
      timeWindow: tw,
      startTime: times.start,
      endTime: times.end,
      notes: "",
      primaryTechUid: safeTrim(defaults.primary),
      helperUid: safeTrim(defaults.helper),
      secondaryTechUid: safeTrim(defaults.secondary),
      secondaryHelperUid: safeTrim(defaults.secondaryHelper),
    });
  }

  function openEditTrip(t: TripDoc) {
    setTripModalErr("");
    setTripModalOk("");

    const tw = (String(t.timeWindow || "all_day") as any) as "am" | "pm" | "all_day" | "custom";

    setTripModal({
      open: true,
      mode: "edit",
      stageKey: (String(t.link?.projectStageKey || "").trim() as StageKey) || null,
      tripId: t.id,
      date: t.date || "",
      timeWindow: tw,
      startTime: t.startTime || "08:00",
      endTime: t.endTime || "17:00",
      notes: String(t.notes || ""),
      primaryTechUid: safeTrim(t.crew?.primaryTechUid || ""),
      helperUid: safeTrim(t.crew?.helperUid || ""),
      secondaryTechUid: safeTrim(t.crew?.secondaryTechUid || ""),
      secondaryHelperUid: safeTrim(t.crew?.secondaryHelperUid || ""),
    });
  }

  function closeTripModal() {
    setTripModal(emptyTripModal());
    setTripModalBusy(false);
    setTripModalErr("");
    setTripModalOk("");
  }

  // keep times in sync when window changes away from custom
  useEffect(() => {
    if (!tripModal.open) return;
    if (tripModal.timeWindow !== "custom") {
      const { start, end } = windowToTimes(tripModal.timeWindow);
      setTripModal((m) => ({ ...m, startTime: start, endTime: end }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripModal.timeWindow]);

  // -----------------------------
  // Save modal (create or edit)
  // -----------------------------
  async function saveTripModal() {
    if (!project) return;
    if (!tripModal.open) return;

    const mode = tripModal.mode;

    // permission: edit requires either canEditProject OR on-crew tech
    if (mode === "edit") {
      const existing = projectTrips.find((x) => x.id === tripModal.tripId);
      if (!existing) {
        setTripModalErr("Trip not found in state.");
        return;
      }
      if (!canCurrentUserEditTrip(existing)) {
        setTripModalErr("You do not have permission to edit this trip.");
        return;
      }
    } else {
      if (!canEditProject) {
        setTripModalErr("Only Admin/Dispatcher/Manager can schedule trips.");
        return;
      }
    }

    setTripModalErr("");
    setTripModalOk("");
    setTripModalBusy(true);

    try {
      const date = safeTrim(tripModal.date);
      if (!date) throw new Error("Trip date is required.");

      const st = safeTrim(tripModal.startTime);
      const et = safeTrim(tripModal.endTime);
      if (!st || !et) throw new Error("Start and end times are required.");
      if (et <= st) throw new Error("End time must be after start time.");

      const primaryUid = safeTrim(tripModal.primaryTechUid);
      if (!primaryUid) throw new Error("Primary Tech is required.");

      const helperUid = safeTrim(tripModal.helperUid);
      const secondaryUid = safeTrim(tripModal.secondaryTechUid);
      const secondaryHelperUid = safeTrim(tripModal.secondaryHelperUid);

      const primaryName = findTechName(primaryUid) || "Primary Tech";
      const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
      const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
      const secondaryHelperName = secondaryHelperUid ? findHelperName(secondaryHelperUid) || "Helper" : null;

      const now = nowIso();

      if (mode === "create") {
        const stageKey = tripModal.stageKey;

        // staged project types: create stage trip doc
        if (hasStages && stageKey) {
          const id = makeProjectTripId(project.id, stageKey, date);

          const payload: any = {
            active: true,
            type: "project",
            status: "planned",
            date,
            timeWindow: tripModal.timeWindow,
            startTime: st,
            endTime: et,
            crew: {
              primaryTechUid: primaryUid,
              primaryTechName: primaryName,
              helperUid: helperUid || null,
              helperName: helperName,
              secondaryTechUid: secondaryUid || null,
              secondaryTechName: secondaryName,
              secondaryHelperUid: secondaryHelperUid || null,
              secondaryHelperName: secondaryHelperName,
            },
            link: {
              projectId: project.id,
              projectStageKey: stageKey,
              serviceTicketId: null,
            },
            notes: safeTrim(tripModal.notes) || null,
            cancelReason: null,
            createdAt: now,
            createdByUid: myUid || null,
            updatedAt: now,
            updatedByUid: myUid || null,
          };

          await setDoc(doc(db, "trips", id), payload, { merge: false });

          const newTrip: TripDoc = { id, ...(payload as any) };
          setProjectTrips((prev) =>
            [...prev, newTrip].sort((a, b) =>
              `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`)
            )
          );

          setTripModalOk("✅ Trip scheduled.");
          setTimeout(() => closeTripModal(), 450);
          return;
        }

        // no-stage projects
        await addProjectTripNoStageFromModal(tripModal);
        setTripModalOk("✅ Trip scheduled.");
        setTimeout(() => closeTripModal(), 450);
        return;
      }

      // EDIT mode
      const tripId = safeTrim(tripModal.tripId);
      if (!tripId) throw new Error("Missing trip id.");

      await updateDoc(doc(db, "trips", tripId), {
        date,
        timeWindow: tripModal.timeWindow,
        startTime: st,
        endTime: et,
        notes: safeTrim(tripModal.notes) || null,
        crew: {
          primaryTechUid: primaryUid,
          primaryTechName: primaryName,
          helperUid: helperUid || null,
          helperName: helperName,
          secondaryTechUid: secondaryUid || null,
          secondaryTechName: secondaryName,
          secondaryHelperUid: secondaryHelperUid || null,
          secondaryHelperName: secondaryHelperName,
        },
        updatedAt: now,
        updatedByUid: myUid || null,
      } as any);

      setProjectTrips((prev) =>
        prev.map((x) =>
          x.id === tripId
            ? {
                ...x,
                date,
                timeWindow: tripModal.timeWindow,
                startTime: st,
                endTime: et,
                notes: safeTrim(tripModal.notes) || null,
                crew: {
                  primaryTechUid: primaryUid,
                  primaryTechName: primaryName,
                  helperUid: helperUid || null,
                  helperName: helperName,
                  secondaryTechUid: secondaryUid || null,
                  secondaryTechName: secondaryName,
                  secondaryHelperUid: secondaryHelperUid || null,
                  secondaryHelperName: secondaryHelperName,
                },
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : x
        )
      );

      setTripModalOk("✅ Trip updated.");
      setTimeout(() => closeTripModal(), 450);
    } catch (e: any) {
      setTripModalErr(e?.message || "Failed to save trip.");
    } finally {
      setTripModalBusy(false);
    }
  }

  // -----------------------------
  // Save Project Updates
  // -----------------------------
  async function handleSaveUpdates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!project) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const now = nowIso();

      const projPrimary = projectPrimaryUid.trim() || null;
      const projSecondary = projectSecondaryUid.trim() || null;

      const helpers: string[] = [];
      if (projectHelperUid.trim()) helpers.push(projectHelperUid.trim());
      if (projectSecondaryHelperUid.trim() && projectSecondaryHelperUid.trim() !== projectHelperUid.trim())
        helpers.push(projectSecondaryHelperUid.trim());

      const helperNames = helpers.map((uid) => findHelperName(uid) || uid);

      function buildStageStaffingPayload(stage: StageAssignmentState): StageStaffing | null {
        if (!stage.overrideEnabled) return null;

        const primaryUid = stage.primaryUid.trim();
        const secondaryUid = stage.secondaryUid.trim();
        const h1 = stage.helperUid.trim();
        const h2 = stage.secondaryHelperUid.trim();

        const helperIds: string[] = [];
        if (h1) helperIds.push(h1);
        if (h2 && h2 !== h1) helperIds.push(h2);

        const staffing: StageStaffing = {
          primaryTechnicianId: primaryUid || undefined,
          primaryTechnicianName: primaryUid ? findTechName(primaryUid) || undefined : undefined,
          secondaryTechnicianId: secondaryUid || undefined,
          secondaryTechnicianName: secondaryUid ? findTechName(secondaryUid) || undefined : undefined,
          helperIds: helperIds.length ? helperIds : undefined,
          helperNames: helperIds.length ? helperIds.map((uid) => findHelperName(uid) || uid) : undefined,
        };

        return staffing;
      }

      const roughStaff = buildStageStaffingPayload(roughInAssign);
      const topStaff = buildStageStaffingPayload(topOutAssign);
      const trimStaff = buildStageStaffingPayload(trimAssign);

      function staffingToFirestore(staff: StageStaffing | null) {
        if (!staff) return null;
        return {
          primaryTechnicianId: staff.primaryTechnicianId || null,
          primaryTechnicianName: staff.primaryTechnicianName || null,
          secondaryTechnicianId: staff.secondaryTechnicianId || null,
          secondaryTechnicianName: staff.secondaryTechnicianName || null,
          helperIds: staff.helperIds && staff.helperIds.length ? staff.helperIds : null,
          helperNames: staff.helperNames && staff.helperNames.length ? staff.helperNames : null,
        };
      }

      const nextRoughIn: any = {
        ...project.roughIn,
        status: roughInStatus,
        scheduledDate: roughInScheduledDate || null,
        scheduledEndDate: roughInScheduledEndDate || null,
        completedDate: roughInCompletedDate || null,
        staffing: staffingToFirestore(roughStaff),
      };

      const nextTopOut: any = {
        ...project.topOutVent,
        status: topOutVentStatus,
        scheduledDate: topOutVentScheduledDate || null,
        scheduledEndDate: topOutVentScheduledEndDate || null,
        completedDate: topOutVentCompletedDate || null,
        staffing: staffingToFirestore(topStaff),
      };

      const nextTrim: any = {
        ...project.trimFinish,
        status: trimFinishStatus,
        scheduledDate: trimFinishScheduledDate || null,
        scheduledEndDate: trimFinishScheduledEndDate || null,
        completedDate: trimFinishCompletedDate || null,
        staffing: staffingToFirestore(trimStaff),
      };

      await updateDoc(doc(db, "projects", project.id), {
        bidStatus,

        primaryTechnicianId: projPrimary,
        primaryTechnicianName: projPrimary ? findTechName(projPrimary) || null : null,
        secondaryTechnicianId: projSecondary,
        secondaryTechnicianName: projSecondary ? findTechName(projSecondary) || null : null,

        helperIds: helpers.length ? helpers : null,
        helperNames: helperNames.length ? helperNames : null,

        assignedTechnicianId: projPrimary,
        assignedTechnicianName: projPrimary ? findTechName(projPrimary) || null : null,

        roughIn: nextRoughIn,
        topOutVent: nextTopOut,
        trimFinish: nextTrim,

        internalNotes: internalNotes.trim() || null,
        updatedAt: now,
      });

      setProject((prev) =>
        prev
          ? ({
              ...prev,
              bidStatus,
              roughIn: nextRoughIn,
              topOutVent: nextTopOut,
              trimFinish: nextTrim,
              updatedAt: now,
            } as any)
          : prev
      );
      setSaveSuccess("✅ Project updates saved.");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save project updates.");
    } finally {
      setSaving(false);
    }
  }

  // Snapshot display helpers
  const projectPrimaryName = projectPrimaryUid ? findTechName(projectPrimaryUid) : "";
  const projectSecondaryName = projectSecondaryUid ? findTechName(projectSecondaryUid) : "";
  const projectHelperName = projectHelperUid ? findHelperName(projectHelperUid) : "";
  const projectSecondaryHelperName = projectSecondaryHelperUid ? findHelperName(projectSecondaryHelperUid) : "";

  const activeStageTrips = hasStages ? tripsByStage[activeStageTab] || [] : [];
  const activeStageEffectiveCrew = hasStages ? getEffectiveCrewForStage(activeStageTab) : null;

  // -----------------------------
  // Stage tab rendering helpers (editable stage info lives here)
  // -----------------------------
  function stageStateForKey(stageKey: StageKey) {
    if (stageKey === "roughIn") {
      return {
        status: roughInStatus,
        setStatus: setRoughInStatus,
        start: roughInScheduledDate,
        setStart: setRoughInScheduledDate,
        end: roughInScheduledEndDate,
        setEnd: setRoughInScheduledEndDate,
        done: roughInCompletedDate,
        setDone: setRoughInCompletedDate,
        assign: roughInAssign,
        setAssign: setRoughInAssign,
      };
    }
    if (stageKey === "topOutVent") {
      return {
        status: topOutVentStatus,
        setStatus: setTopOutVentStatus,
        start: topOutVentScheduledDate,
        setStart: setTopOutVentScheduledDate,
        end: topOutVentScheduledEndDate,
        setEnd: setTopOutVentScheduledEndDate,
        done: topOutVentCompletedDate,
        setDone: setTopOutVentCompletedDate,
        assign: topOutAssign,
        setAssign: setTopOutAssign,
      };
    }
    return {
      status: trimFinishStatus,
      setStatus: setTrimFinishStatus,
      start: trimFinishScheduledDate,
      setStart: setTrimFinishScheduledDate,
      end: trimFinishScheduledEndDate,
      setEnd: setTrimFinishScheduledEndDate,
      done: trimFinishCompletedDate,
      setDone: setTrimFinishCompletedDate,
      assign: trimAssign,
      setAssign: setTrimAssign,
    };
  }

  // -----------------------------
  // Modal UI
  // -----------------------------
  const TripModal = tripModal.open ? (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={closeTripModal}
        style={{ position: "absolute", inset: 0, background: "rgba(2,6,23,0.55)" }}
      />

      <div
        style={{
          position: "relative",
          width: "min(920px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 24px)",
          overflow: "auto",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "white",
          boxShadow: "0 20px 70px rgba(2,6,23,0.35)",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: `1px solid ${UI.cardBorder}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
            background: "linear-gradient(180deg, rgba(30,64,255,0.08), rgba(255,255,255,0))",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 1000, color: UI.title }}>
              {tripModal.mode === "edit" ? "Edit / Reschedule Trip" : "Schedule New Trip"}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: UI.sub, fontWeight: 800 }}>
              {tripModal.stageKey ? (
                <>
                  Stage: <strong>{stageLabel(tripModal.stageKey)}</strong>
                </>
              ) : (
                <>Project Trips</>
              )}
            </div>
          </div>

          <Button variant="ghost" onClick={closeTripModal}>
            Close
          </Button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(2, minmax(260px, 1fr))",
              }}
            >
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={tripModal.date}
                  onChange={(e) => setTripModal((m) => ({ ...m, date: e.target.value }))}
                  disabled={tripModalBusy}
                />
              </div>

              <div>
                <Label>Time Window</Label>
                <Select
                  value={tripModal.timeWindow}
                  onChange={(e) => setTripModal((m) => ({ ...m, timeWindow: e.target.value as any }))}
                  disabled={tripModalBusy}
                >
                  <option value="all_day">All Day (8:00–5:00)</option>
                  <option value="am">Morning (8:00–12:00)</option>
                  <option value="pm">Afternoon (1:00–5:00)</option>
                  <option value="custom">Custom</option>
                </Select>
              </div>

              <div>
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={tripModal.startTime}
                  onChange={(e) => setTripModal((m) => ({ ...m, startTime: e.target.value }))}
                  disabled={tripModalBusy || tripModal.timeWindow !== "custom"}
                  style={{
                    background: tripModal.timeWindow === "custom" ? "white" : UI.surface,
                  }}
                />
              </div>

              <div>
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={tripModal.endTime}
                  onChange={(e) => setTripModal((m) => ({ ...m, endTime: e.target.value }))}
                  disabled={tripModalBusy || tripModal.timeWindow !== "custom"}
                  style={{
                    background: tripModal.timeWindow === "custom" ? "white" : UI.surface,
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 4 }}>
              <div
                style={{
                  border: `1px solid ${UI.cardBorder}`,
                  borderRadius: 14,
                  padding: 12,
                  background: UI.surface,
                }}
              >
                <div style={{ fontWeight: 1000, color: UI.title, marginBottom: 10 }}>Crew</div>

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(2, minmax(260px, 1fr))",
                  }}
                >
                  <div>
                    <Label>Primary Tech</Label>
                    <Select
                      value={tripModal.primaryTechUid}
                      onChange={(e) => setTripModal((m) => ({ ...m, primaryTechUid: e.target.value }))}
                      disabled={tripModalBusy}
                    >
                      <option value="">Select a technician...</option>
                      {technicians.map((t) => (
                        <option key={t.uid} value={t.uid}>
                          {t.displayName}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label>Helper</Label>
                    <Select
                      value={tripModal.helperUid}
                      onChange={(e) => setTripModal((m) => ({ ...m, helperUid: e.target.value }))}
                      disabled={tripModalBusy}
                    >
                      <option value="">— None —</option>
                      {helperCandidates.map((h) => (
                        <option key={h.uid} value={h.uid}>
                          {h.name} ({h.laborRole})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label>Secondary Tech</Label>
                    <Select
                      value={tripModal.secondaryTechUid}
                      onChange={(e) => setTripModal((m) => ({ ...m, secondaryTechUid: e.target.value }))}
                      disabled={tripModalBusy || !tripModal.primaryTechUid}
                    >
                      <option value="">— None —</option>
                      {technicians
                        .filter((t) => t.uid !== tripModal.primaryTechUid)
                        .map((t) => (
                          <option key={t.uid} value={t.uid}>
                            {t.displayName}
                          </option>
                        ))}
                    </Select>
                  </div>

                  <div>
                    <Label>Secondary Helper</Label>
                    <Select
                      value={tripModal.secondaryHelperUid}
                      onChange={(e) => setTripModal((m) => ({ ...m, secondaryHelperUid: e.target.value }))}
                      disabled={tripModalBusy}
                    >
                      <option value="">— None —</option>
                      {helperCandidates.map((h) => (
                        <option key={h.uid} value={h.uid}>
                          {h.name} ({h.laborRole})
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: UI.faint, fontWeight: 700 }}>
                  Tip: adjusting crew here ensures trips show correctly on <strong>My Day</strong> and the schedule.
                </div>
              </div>
            </div>

            <div>
              <Label>Trip Notes</Label>
              <Textarea
                value={tripModal.notes}
                onChange={(e) => setTripModal((m) => ({ ...m, notes: e.target.value }))}
                rows={4}
                disabled={tripModalBusy}
                placeholder="Optional notes for this trip..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="primary" onClick={saveTripModal} disabled={tripModalBusy}>
                  {tripModalBusy ? "Saving..." : "Save Changes"}
                </Button>

                {tripModal.mode === "edit" && canEditProject && tripModal.tripId ? (
                  <Button
                    variant="softDanger"
                    onClick={() => {
                      const t = projectTrips.find((x) => x.id === tripModal.tripId);
                      if (t) removeTrip(t);
                    }}
                    disabled={tripModalBusy}
                    title="Delete trip"
                  >
                    Delete
                  </Button>
                ) : null}

                <Button variant="ghost" onClick={closeTripModal} disabled={tripModalBusy}>
                  Cancel
                </Button>
              </div>

              <div style={{ minWidth: 0 }}>
                {tripModalErr ? <div style={{ color: UI.dangerDark, fontWeight: 900, fontSize: 13 }}>{tripModalErr}</div> : null}
                {tripModalOk ? <div style={{ color: "#15803d", fontWeight: 900, fontSize: 13 }}>{tripModalOk}</div> : null}
              </div>
            </div>

            {tripModal.mode === "edit" ? (
              <div style={{ marginTop: 6, fontSize: 12, color: UI.faint }}>
                This modal is intentionally separate from “Schedule New Trip” so rescheduling never feels like it’s using the same fields.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <ProtectedPage fallbackTitle="Project Detail">
      <AppShell appUser={appUser}>
        {TripModal}

        {loading ? <p>Loading project...</p> : null}
        {error ? <p style={{ color: UI.dangerDark, fontWeight: 900 }}>{error}</p> : null}

        {!loading && !error && project ? (
          <div style={{ display: "grid", gap: 16 }}>
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 24, fontWeight: 1000, margin: 0, color: UI.title }}>{project.projectName}</h1>
                <div style={{ marginTop: 6, color: UI.sub, fontWeight: 800, fontSize: 12 }}>
                  Project ID: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{projectId}</span>
                </div>
              </div>

              <Link
                href="/projects"
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${UI.cardBorder}`,
                  borderRadius: 12,
                  textDecoration: "none",
                  color: UI.title,
                  fontWeight: 950,
                  background: "white",
                }}
              >
                Back to Projects
              </Link>
            </div>

            {/* Customer + Address */}
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(320px, 1fr))" }}>
              <Card title="Customer">
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 14 }}>
                    <strong>Customer:</strong> {project.customerDisplayName || "—"}
                  </div>
                  <div style={{ fontSize: 13, color: UI.sub }}>
                    <strong>Customer ID:</strong> {project.customerId || "—"}
                  </div>
                </div>
              </Card>

              <Card title="Project Address">
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, color: UI.sub }}>
                    <strong>Label:</strong> {project.serviceAddressLabel || "—"}
                  </div>
                  <div style={{ fontSize: 14 }}>{project.serviceAddressLine1 || "—"}</div>
                  {project.serviceAddressLine2 ? <div style={{ fontSize: 14 }}>{project.serviceAddressLine2}</div> : null}
                  <div style={{ fontSize: 14 }}>
                    {project.serviceCity || "—"}, {project.serviceState || "—"} {project.servicePostalCode || ""}
                  </div>
                </div>
              </Card>
            </div>

            {/* Project Overview (tight) */}
            <Card
              title="Project Overview"
              subtitle="Defaults are used as stage fallback, and can be overridden per stage or per trip."
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(240px, 1fr))" }}>
                  <div style={{ border: `1px solid ${UI.cardBorder}`, borderRadius: 14, padding: 12, background: UI.surface }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: UI.sub }}>Project Type</div>
                    <div style={{ marginTop: 6, fontWeight: 1000, color: UI.title }}>{project.projectType}</div>
                  </div>

                  <div style={{ border: `1px solid ${UI.cardBorder}`, borderRadius: 14, padding: 12, background: UI.surface }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: UI.sub }}>Bid Status</div>
                    <div style={{ marginTop: 6, fontWeight: 1000, color: UI.title }}>{formatBidStatus(project.bidStatus)}</div>
                  </div>

                  <div style={{ border: `1px solid ${UI.cardBorder}`, borderRadius: 14, padding: 12, background: UI.surface }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: UI.sub }}>Total Bid</div>
                    <div style={{ marginTop: 6, fontWeight: 1000, color: UI.title }}>${Number(project.totalBidAmount || 0).toFixed(2)}</div>
                  </div>
                </div>

                <div style={{ border: `1px solid ${UI.cardBorder}`, borderRadius: 14, padding: 12, background: "white" }}>
                  <div style={{ fontWeight: 1000, color: UI.title, marginBottom: 8 }}>Default Crew</div>

                  <div style={{ display: "grid", gap: 6, color: UI.sub, fontSize: 13 }}>
                    <div>
                      <strong>Primary Tech:</strong> {projectPrimaryName || "Unassigned"}
                    </div>
                    <div>
                      <strong>Helper:</strong> {projectHelperName || "—"}
                    </div>
                    <div>
                      <strong>Secondary Tech:</strong> {projectSecondaryName || "—"}
                    </div>
                    <div>
                      <strong>Secondary Helper:</strong> {projectSecondaryHelperName || "—"}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: UI.faint }}>
                    Note: you can still override crew per-stage <em>and</em> per-trip (via Edit / Reschedule).
                  </div>
                </div>

                {project.description ? (
                  <div style={{ borderTop: `1px solid ${UI.cardBorder}`, paddingTop: 10 }}>
                    <div style={{ fontWeight: 1000, color: UI.title, marginBottom: 6 }}>Description</div>
                    <div style={{ color: UI.sub, fontSize: 14 }}>{project.description}</div>
                  </div>
                ) : null}
              </div>
            </Card>

            {/* Stages (tabs) OR Project Trips for no-stage */}
            {hasStages ? (
              <Card
                title="Stages"
                subtitle="Stage info + trips live together. Crew can be overridden per stage, and also adjusted per trip in the Edit modal."
                right={
                  canEditProject ? (
                    <>
                      <Button variant="soft" onClick={() => syncStageTrips(activeStageTab)}>
                        🔄 Sync Stage Trips
                      </Button>
                      <Button variant="primary" onClick={() => openCreateTrip(activeStageTab)}>
                        + Schedule New Trip
                      </Button>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: UI.sub, fontWeight: 800 }}>
                      Read-only (Admin/Dispatcher/Manager can edit)
                    </div>
                  )
                }
              >
                {/* Stage Tabs */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {enabledStages.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setActiveStageTab(k)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 999,
                        border: `1px solid ${UI.cardBorder}`,
                        background: activeStageTab === k ? UI.primarySoft : "white",
                        color: activeStageTab === k ? UI.primaryDark : UI.title,
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      {stageLabel(k)}
                    </button>
                  ))}
                </div>

                {/* Stage details + trips */}
                {(() => {
                  const st = stageStateForKey(activeStageTab);
                  const effective = getEffectiveCrewForStage(activeStageTab);

                  const effPrimary = effective.primary ? findTechName(effective.primary) : "Unassigned";
                  const effHelper = effective.helper ? findHelperName(effective.helper) : "—";
                  const effSecondary = effective.secondary ? findTechName(effective.secondary) : "—";
                  const effSecondaryHelper = effective.secondaryHelper ? findHelperName(effective.secondaryHelper) : "—";

                  return (
                    <div style={{ display: "grid", gap: 12 }}>
                      <div
                        style={{
                          border: `1px solid ${UI.cardBorder}`,
                          borderRadius: 16,
                          padding: 14,
                          background: UI.surface,
                        }}
                      >
                        <div style={{ fontWeight: 1000, color: UI.title, marginBottom: 10 }}>Stage Details</div>

                        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(240px, 1fr))" }}>
                          <div>
                            <Label>Status</Label>
                            <Select
                              value={st.status}
                              onChange={(e) => st.setStatus(e.target.value as any)}
                              disabled={!canEditProject}
                            >
                              <option value="not_started">Not Started</option>
                              <option value="scheduled">Scheduled</option>
                              <option value="in_progress">In Progress</option>
                              <option value="complete">Complete</option>
                            </Select>
                          </div>

                          <div>
                            <Label>Scheduled Start</Label>
                            <Input
                              type="date"
                              value={st.start}
                              onChange={(e) => st.setStart(e.target.value)}
                              disabled={!canEditProject}
                            />
                          </div>

                          <div>
                            <Label>Scheduled End</Label>
                            <Input
                              type="date"
                              value={st.end}
                              onChange={(e) => st.setEnd(e.target.value)}
                              disabled={!canEditProject}
                            />
                          </div>

                          <div>
                            <Label>Completed Date</Label>
                            <Input
                              type="date"
                              value={st.done}
                              onChange={(e) => st.setDone(e.target.value)}
                              disabled={!canEditProject}
                            />
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <div style={{ border: `1px solid ${UI.cardBorder}`, borderRadius: 14, padding: 12, background: "white" }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                                <div style={{ fontWeight: 1000, color: UI.title }}>
                                  Stage Crew{" "}
                                  <span style={{ color: UI.sub, fontWeight: 800, fontSize: 12 }}>
                                    ({st.assign.overrideEnabled ? "override" : "using project defaults"})
                                  </span>
                                </div>

                                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: UI.sub, fontWeight: 900 }}>
                                  <input
                                    type="checkbox"
                                    checked={st.assign.overrideEnabled}
                                    onChange={(e) => st.setAssign((p: any) => ({ ...p, overrideEnabled: e.target.checked }))}
                                    disabled={!canEditProject}
                                  />
                                  Override for this stage
                                </label>
                              </div>

                              {st.assign.overrideEnabled ? (
                                <div style={{ marginTop: 12, display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(240px, 1fr))" }}>
                                  <div>
                                    <Label>Primary Tech</Label>
                                    <Select
                                      value={st.assign.primaryUid}
                                      onChange={(e) => st.setAssign((p: any) => ({ ...p, primaryUid: e.target.value }))}
                                      disabled={!canEditProject}
                                    >
                                      <option value="">Unassigned</option>
                                      {technicians.map((t) => (
                                        <option key={t.uid} value={t.uid}>
                                          {t.displayName}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>

                                  <div>
                                    <Label>Helper</Label>
                                    <Select
                                      value={st.assign.helperUid}
                                      onChange={(e) => st.setAssign((p: any) => ({ ...p, helperUid: e.target.value, useDefaultHelper: false }))}
                                      disabled={!canEditProject}
                                    >
                                      <option value="">— None —</option>
                                      {helperCandidates.map((h) => (
                                        <option key={h.uid} value={h.uid}>
                                          {h.name} ({h.laborRole})
                                        </option>
                                      ))}
                                    </Select>
                                  </div>

                                  <div>
                                    <Label>Secondary Tech</Label>
                                    <Select
                                      value={st.assign.secondaryUid}
                                      onChange={(e) => st.setAssign((p: any) => ({ ...p, secondaryUid: e.target.value }))}
                                      disabled={!canEditProject || !st.assign.primaryUid}
                                    >
                                      <option value="">— None —</option>
                                      {technicians
                                        .filter((t) => t.uid !== st.assign.primaryUid)
                                        .map((t) => (
                                          <option key={t.uid} value={t.uid}>
                                            {t.displayName}
                                          </option>
                                        ))}
                                    </Select>
                                  </div>

                                  <div>
                                    <Label>Secondary Helper</Label>
                                    <Select
                                      value={st.assign.secondaryHelperUid}
                                      onChange={(e) =>
                                        st.setAssign((p: any) => ({ ...p, secondaryHelperUid: e.target.value, useDefaultHelper: false }))
                                      }
                                      disabled={!canEditProject}
                                    >
                                      <option value="">— None —</option>
                                      {helperCandidates.map((h) => (
                                        <option key={h.uid} value={h.uid}>
                                          {h.name} ({h.laborRole})
                                        </option>
                                      ))}
                                    </Select>
                                  </div>

                                  <div style={{ gridColumn: "span 2" }}>
                                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: UI.sub, fontWeight: 900 }}>
                                      <input
                                        type="checkbox"
                                        checked={st.assign.useDefaultHelper}
                                        onChange={(e) => st.setAssign((p: any) => ({ ...p, useDefaultHelper: e.target.checked }))}
                                        disabled={!canEditProject}
                                      />
                                      Use default helper pairing (recommended)
                                    </label>
                                    <div style={{ marginTop: 6, fontSize: 12, color: UI.faint }}>
                                      If enabled, helper may auto-fill based on the stage primary tech.
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ marginTop: 10, fontSize: 13, color: UI.sub }}>
                                  <div>
                                    Primary: <strong>{effPrimary}</strong> • Helper: <strong>{effHelper}</strong>
                                  </div>
                                  <div style={{ marginTop: 4 }}>
                                    Secondary: <strong>{effSecondary}</strong> • Secondary Helper: <strong>{effSecondaryHelper}</strong>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {!canEditProject ? (
                          <div style={{ marginTop: 10, fontSize: 12, color: UI.faint }}>
                            Stage details are read-only for your role.
                          </div>
                        ) : null}
                      </div>

                      {/* Trips */}
                      <div
                        style={{
                          border: `1px solid ${UI.cardBorder}`,
                          borderRadius: 16,
                          padding: 14,
                          background: "white",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ fontWeight: 1000, color: UI.title }}>
                            Trips <span style={{ color: UI.sub, fontWeight: 800 }}>({activeStageTrips.length})</span>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {canEditProject ? (
                              <>
                                <Button variant="soft" onClick={() => addStageTrip(activeStageTab)}>
                                  + Quick Add Trip
                                </Button>
                                <Button variant="primary" onClick={() => openCreateTrip(activeStageTab)}>
                                  + Schedule New Trip
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {tripsLoading ? <p style={{ marginTop: 10 }}>Loading trips...</p> : null}
                        {tripsError ? <p style={{ marginTop: 10, color: UI.dangerDark, fontWeight: 900 }}>{tripsError}</p> : null}

                        {!tripsLoading && !tripsError && activeStageTrips.length === 0 ? (
                          <div
                            style={{
                              marginTop: 12,
                              border: `1px dashed ${UI.cardBorder}`,
                              borderRadius: 14,
                              padding: 12,
                              background: UI.surface,
                              color: UI.sub,
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          >
                            No trips created for this stage yet. Click <strong>Sync Stage Trips</strong> to generate daily schedule blocks.
                          </div>
                        ) : null}

                        {!tripsLoading && !tripsError && activeStageTrips.length > 0 ? (
                          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                            {activeStageTrips.map((t) => {
                              const canEditThis = canCurrentUserEditTrip(t);
                              const cancelled = t.status === "cancelled" || t.active === false;

                              const crew = t.crew || {};
                              const tech = crew.primaryTechName || "Unassigned";
                              const helper = crew.helperName ? ` • Helper: ${crew.helperName}` : "";
                              const secondTech = crew.secondaryTechName ? ` • 2nd Tech: ${crew.secondaryTechName}` : "";
                              const secondHelper = crew.secondaryHelperName ? ` • 2nd Helper: ${crew.secondaryHelperName}` : "";

                              return (
                                <div
                                  key={t.id}
                                  style={{
                                    border: `1px solid ${UI.cardBorder}`,
                                    borderRadius: 16,
                                    padding: 14,
                                    background: cancelled ? UI.surface : "white",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                                    <div style={{ fontWeight: 1000, color: UI.title }}>
                                      🗓 {t.date} • {formatTripWindow(String(t.timeWindow || "all_day"))} • {t.startTime}–{t.endTime}
                                    </div>

                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 1000,
                                        padding: "6px 10px",
                                        borderRadius: 999,
                                        border: `1px solid ${UI.cardBorder}`,
                                        background: cancelled ? UI.dangerSoft : UI.primarySoft,
                                        color: cancelled ? UI.dangerDark : UI.primaryDark,
                                      }}
                                    >
                                      {cancelled ? "CANCELLED" : (t.status || "planned").replaceAll("_", " ").toUpperCase()}
                                    </div>
                                  </div>

                                  <div style={{ marginTop: 8, fontSize: 13, color: UI.sub }}>
                                    Crew: <strong>{tech}</strong>
                                    {helper}
                                    {secondTech}
                                    {secondHelper}
                                  </div>

                                  {t.notes ? (
                                    <div style={{ marginTop: 8, fontSize: 13, color: UI.sub, whiteSpace: "pre-wrap" }}>{t.notes}</div>
                                  ) : null}

                                  {t.cancelReason ? (
                                    <div style={{ marginTop: 8, fontSize: 12, color: UI.faint }}>
                                      Cancel reason: {t.cancelReason}
                                    </div>
                                  ) : null}

                                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <Button variant="soft" onClick={() => openEditTrip(t)} disabled={!canEditThis}>
                                      Edit
                                    </Button>

                                    {canEditProject ? (
                                      <>
                                        <Button variant="ghost" onClick={() => cancelTrip(t)} disabled={cancelled}>
                                          Cancel
                                        </Button>

                                        <Button variant="softDanger" onClick={() => removeTrip(t)}>
                                          Delete
                                        </Button>
                                      </>
                                    ) : null}

                                    {!canEditThis ? (
                                      <div style={{ fontSize: 12, color: UI.faint, fontWeight: 700 }}>
                                        Techs can edit trips they are assigned to. Admin/Dispatcher/Manager can edit any trip.
                                      </div>
                                    ) : null}
                                  </div>

                                  <div style={{ marginTop: 10, fontSize: 11, color: "rgba(2,6,23,0.35)" }}>Trip ID: {t.id}</div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
              </Card>
            ) : (
              <Card
                title="Project Trips"
                subtitle="This project type has no stages. Trips here are the schedule blocks for this project."
                right={
                  canEditProject ? (
                    <Button variant="primary" onClick={() => openCreateTrip(null)}>
                      + Schedule New Trip
                    </Button>
                  ) : null
                }
              >
                {tripsLoading ? <p>Loading trips...</p> : null}
                {tripsError ? <p style={{ color: UI.dangerDark, fontWeight: 900 }}>{tripsError}</p> : null}

                {!tripsLoading && !tripsError && nonStageProjectTrips.length === 0 ? (
                  <div
                    style={{
                      marginTop: 10,
                      border: `1px dashed ${UI.cardBorder}`,
                      borderRadius: 14,
                      padding: 12,
                      background: UI.surface,
                      color: UI.sub,
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    No project trips yet.
                  </div>
                ) : null}

                {!tripsLoading && !tripsError && nonStageProjectTrips.length > 0 ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {nonStageProjectTrips.map((t) => {
                      const canEditThis = canCurrentUserEditTrip(t);
                      const cancelled = t.status === "cancelled" || t.active === false;

                      const crew = t.crew || {};
                      const tech = crew.primaryTechName || "Unassigned";
                      const helper = crew.helperName ? ` • Helper: ${crew.helperName}` : "";
                      const secondTech = crew.secondaryTechName ? ` • 2nd Tech: ${crew.secondaryTechName}` : "";
                      const secondHelper = crew.secondaryHelperName ? ` • 2nd Helper: ${crew.secondaryHelperName}` : "";

                      return (
                        <div
                          key={t.id}
                          style={{
                            border: `1px solid ${UI.cardBorder}`,
                            borderRadius: 16,
                            padding: 14,
                            background: cancelled ? UI.surface : "white",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                            <div style={{ fontWeight: 1000, color: UI.title }}>
                              🗓 {t.date} • {formatTripWindow(String(t.timeWindow || "all_day"))} • {t.startTime}–{t.endTime}
                            </div>

                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 1000,
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: `1px solid ${UI.cardBorder}`,
                                background: cancelled ? UI.dangerSoft : UI.primarySoft,
                                color: cancelled ? UI.dangerDark : UI.primaryDark,
                              }}
                            >
                              {cancelled ? "CANCELLED" : (t.status || "planned").replaceAll("_", " ").toUpperCase()}
                            </div>
                          </div>

                          <div style={{ marginTop: 8, fontSize: 13, color: UI.sub }}>
                            Crew: <strong>{tech}</strong>
                            {helper}
                            {secondTech}
                            {secondHelper}
                          </div>

                          {t.notes ? (
                            <div style={{ marginTop: 8, fontSize: 13, color: UI.sub, whiteSpace: "pre-wrap" }}>{t.notes}</div>
                          ) : null}

                          {t.cancelReason ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: UI.faint }}>
                              Cancel reason: {t.cancelReason}
                            </div>
                          ) : null}

                          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button variant="soft" onClick={() => openEditTrip(t)} disabled={!canEditThis}>
                              Edit
                            </Button>

                            {canEditProject ? (
                              <>
                                <Button variant="ghost" onClick={() => cancelTrip(t)} disabled={cancelled}>
                                  Cancel
                                </Button>

                                <Button variant="softDanger" onClick={() => removeTrip(t)}>
                                  Delete
                                </Button>
                              </>
                            ) : null}
                          </div>

                          <div style={{ marginTop: 10, fontSize: 11, color: "rgba(2,6,23,0.35)" }}>Trip ID: {t.id}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </Card>
            )}

            {/* Update Project (tight + still saves stage fields too) */}
            <Card title="Update Project" subtitle="This saves project defaults, stage status/schedule/crew overrides, and internal notes.">
              {techLoading ? <p>Loading technicians...</p> : null}
              {techError ? <p style={{ color: UI.dangerDark, fontWeight: 900 }}>{techError}</p> : null}
              {profilesLoading ? <p>Loading employee profiles...</p> : null}
              {profilesError ? <p style={{ color: UI.dangerDark, fontWeight: 900 }}>{profilesError}</p> : null}

              <form onSubmit={handleSaveUpdates} style={{ display: "grid", gap: 12, maxWidth: 980 }}>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(260px, 1fr))" }}>
                  <div>
                    <Label>Bid Status</Label>
                    <Select value={bidStatus} onChange={(e) => setBidStatus(e.target.value as any)} disabled={!canEditProject}>
                      <option value="draft">Draft</option>
                      <option value="submitted">Submitted</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </Select>
                  </div>

                  <div />
                </div>

                <div
                  style={{
                    border: `1px solid ${UI.cardBorder}`,
                    borderRadius: 16,
                    padding: 14,
                    background: UI.surface,
                  }}
                >
                  <div style={{ fontWeight: 1000, color: UI.title, marginBottom: 10 }}>Default Crew (Project-level)</div>

                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(260px, 1fr))" }}>
                    <div>
                      <Label>Primary Technician</Label>
                      <Select
                        value={projectPrimaryUid}
                        onChange={(e) => setProjectPrimaryUid(e.target.value)}
                        disabled={!canEditProject}
                      >
                        <option value="">Unassigned</option>
                        {technicians.map((t) => (
                          <option key={t.uid} value={t.uid}>
                            {t.displayName}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <Label>Helper</Label>
                      <Select
                        value={projectHelperUid}
                        onChange={(e) => {
                          setProjectUseDefaultHelper(false);
                          setProjectHelperUid(e.target.value);
                        }}
                        disabled={!canEditProject}
                      >
                        <option value="">— None —</option>
                        {helperCandidates.map((h) => (
                          <option key={h.uid} value={h.uid}>
                            {h.name} ({h.laborRole})
                          </option>
                        ))}
                      </Select>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 12, color: UI.sub, fontWeight: 900 }}>
                        <input
                          type="checkbox"
                          checked={projectUseDefaultHelper}
                          onChange={(e) => setProjectUseDefaultHelper(e.target.checked)}
                          disabled={!canEditProject}
                        />
                        Use default helper pairing (recommended)
                      </label>
                    </div>

                    <div>
                      <Label>Secondary Technician</Label>
                      <Select
                        value={projectSecondaryUid}
                        onChange={(e) => setProjectSecondaryUid(e.target.value)}
                        disabled={!canEditProject || !projectPrimaryUid}
                      >
                        <option value="">— None —</option>
                        {technicians
                          .filter((t) => t.uid !== projectPrimaryUid)
                          .map((t) => (
                            <option key={t.uid} value={t.uid}>
                              {t.displayName}
                            </option>
                          ))}
                      </Select>
                    </div>

                    <div>
                      <Label>Secondary Helper</Label>
                      <Select
                        value={projectSecondaryHelperUid}
                        onChange={(e) => setProjectSecondaryHelperUid(e.target.value)}
                        disabled={!canEditProject}
                      >
                        <option value="">— None —</option>
                        {helperCandidates.map((h) => (
                          <option key={h.uid} value={h.uid}>
                            {h.name} ({h.laborRole})
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Internal Notes</Label>
                  <Textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    disabled={!canEditProject}
                    placeholder="Internal notes for dispatch/admins..."
                  />
                </div>

                {saveError ? <div style={{ color: UI.dangerDark, fontWeight: 900 }}>{saveError}</div> : null}
                {saveSuccess ? <div style={{ color: "#15803d", fontWeight: 900 }}>{saveSuccess}</div> : null}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <Button type="submit" variant="primary" disabled={saving || !canEditProject}>
                    {saving ? "Saving..." : canEditProject ? "Save Project Updates" : "Read Only"}
                  </Button>

                  {!canEditProject ? (
                    <div style={{ fontSize: 12, color: UI.faint, fontWeight: 800 }}>
                      Only Admin/Dispatcher/Manager can edit projects.
                    </div>
                  ) : null}
                </div>
              </form>
            </Card>

            {/* System */}
            <Card title="System">
              <div style={{ display: "grid", gap: 6, fontSize: 13, color: UI.sub }}>
                <div>
                  <strong>Active:</strong> {String(project.active)}
                </div>
                <div>
                  <strong>Created At:</strong> {project.createdAt || "—"}
                </div>
                <div>
                  <strong>Updated At:</strong> {project.updatedAt || "—"}
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}