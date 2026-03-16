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
  helperUids: string[];
  useDefaultHelper: boolean;
  overrideEnabled: boolean; // if false -> stage uses project defaults (no staffing saved)
};

function emptyStageAssignment(): StageAssignmentState {
  return {
    primaryUid: "",
    secondaryUid: "",
    helperUids: [],
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
  const [projectHelperUids, setProjectHelperUids] = useState<string[]>([]);
  const [projectUseDefaultHelper, setProjectUseDefaultHelper] = useState(true);

  // ✅ Stage-level crew (override)
  const [roughInAssign, setRoughInAssign] = useState<StageAssignmentState>(emptyStageAssignment());
  const [topOutAssign, setTopOutAssign] = useState<StageAssignmentState>(emptyStageAssignment());
  const [trimAssign, setTrimAssign] = useState<StageAssignmentState>(emptyStageAssignment());

  const [roughInStatus, setRoughInStatus] = useState<"not_started" | "scheduled" | "in_progress" | "complete">("not_started");
  const [roughInScheduledDate, setRoughInScheduledDate] = useState("");
  const [roughInScheduledEndDate, setRoughInScheduledEndDate] = useState("");
  const [roughInCompletedDate, setRoughInCompletedDate] = useState("");

  const [topOutVentStatus, setTopOutVentStatus] = useState<"not_started" | "scheduled" | "in_progress" | "complete">("not_started");
  const [topOutVentScheduledDate, setTopOutVentScheduledDate] = useState("");
  const [topOutVentScheduledEndDate, setTopOutVentScheduledEndDate] = useState("");
  const [topOutVentCompletedDate, setTopOutVentCompletedDate] = useState("");

  const [trimFinishStatus, setTrimFinishStatus] = useState<"not_started" | "scheduled" | "in_progress" | "complete">("not_started");
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

  // ✅ Trip edit modal-ish
  const [editTripId, setEditTripId] = useState<string | null>(null);
  const [editTripSaving, setEditTripSaving] = useState(false);
  const [editTripErr, setEditTripErr] = useState("");
  const [editTripOk, setEditTripOk] = useState("");

  const [editTripDate, setEditTripDate] = useState<string>("");
  const [editTripTimeWindow, setEditTripTimeWindow] = useState<"am" | "pm" | "all_day" | "custom">("all_day");
  const [editTripStartTime, setEditTripStartTime] = useState<string>("08:00");
  const [editTripEndTime, setEditTripEndTime] = useState<string>("17:00");
  const [editTripNotes, setEditTripNotes] = useState<string>("");

  // ✅ Create trip for time+materials / no-stage projects
  const [createTripDate, setCreateTripDate] = useState<string>("");
  const [createTripTimeWindow, setCreateTripTimeWindow] = useState<"am" | "pm" | "all_day" | "custom">("all_day");
  const [createTripStartTime, setCreateTripStartTime] = useState<string>("08:00");
  const [createTripEndTime, setCreateTripEndTime] = useState<string>("17:00");
  const [createTripNotes, setCreateTripNotes] = useState<string>("");

  const myUid = String(appUser?.uid || "").trim();

  // ✅ Editing permissions
  const canEditProject =
    appUser?.role === "admin" || appUser?.role === "dispatcher" || appUser?.role === "manager";

  const isFieldRole =
    appUser?.role === "technician" || appUser?.role === "helper" || appUser?.role === "apprentice";

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

  function computeDefaultHelpersForTech(techUid: string) {
    const uid = techUid.trim();
    if (!uid) return [];
    return employeeProfiles
      .filter((p) => (p.employmentStatus || "current").toLowerCase() === "current")
      .filter((p) => ["helper", "apprentice"].includes(normalizeRole(p.laborRole)))
      .filter((p) => String(p.defaultPairedTechUid || "").trim() === uid)
      .map((p) => String(p.userUid || "").trim())
      .filter(Boolean);
  }

  function helperNamesFromUids(uids: string[]) {
    const profileMap = new Map<string, string>();
    for (const p of employeeProfiles) {
      const uid = String(p.userUid || "").trim();
      if (!uid) continue;
      if (p.displayName) profileMap.set(uid, p.displayName);
    }
    return uids.map((uid) => profileMap.get(uid) || uid);
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
  function getEffectiveCrewForStage(stageKey: StageKey): { primary: string; secondary: string; helpers: string[] } {
    const stageState =
      stageKey === "roughIn" ? roughInAssign : stageKey === "topOutVent" ? topOutAssign : trimAssign;

    if (stageState.overrideEnabled) {
      return {
        primary: stageState.primaryUid,
        secondary: stageState.secondaryUid,
        helpers: stageState.helperUids,
      };
    }

    return {
      primary: projectPrimaryUid,
      secondary: projectSecondaryUid,
      helpers: projectHelperUids,
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

        const seededProjectPrimary =
          (data.primaryTechnicianId as string | undefined) || item.assignedTechnicianId || "";
        setProjectPrimaryUid(seededProjectPrimary);
        setProjectSecondaryUid((data.secondaryTechnicianId as string | undefined) || "");
        setProjectHelperUids(Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : []);

        const stageStaffing = (stage: any): StageStaffing | undefined => {
          return stage?.staffing ? stage.staffing : undefined;
        };

        const roughStaff = stageStaffing(item.roughIn);
        const topStaff = stageStaffing(item.topOutVent);
        const trimStaff = stageStaffing(item.trimFinish);

        setRoughInAssign({
          primaryUid: roughStaff?.primaryTechnicianId || "",
          secondaryUid: roughStaff?.secondaryTechnicianId || "",
          helperUids: Array.isArray(roughStaff?.helperIds) ? roughStaff!.helperIds! : [],
          useDefaultHelper: true,
          overrideEnabled: Boolean(roughStaff),
        });

        setTopOutAssign({
          primaryUid: topStaff?.primaryTechnicianId || "",
          secondaryUid: topStaff?.secondaryTechnicianId || "",
          helperUids: Array.isArray(topStaff?.helperIds) ? topStaff!.helperIds! : [],
          useDefaultHelper: true,
          overrideEnabled: Boolean(topStaff),
        });

        setTrimAssign({
          primaryUid: trimStaff?.primaryTechnicianId || "",
          secondaryUid: trimStaff?.secondaryTechnicianId || "",
          helperUids: Array.isArray(trimStaff?.helperIds) ? trimStaff!.helperIds! : [],
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
  // Auto default helpers (project-level)
  // -----------------------------
  useEffect(() => {
    if (!projectUseDefaultHelper) return;

    const techUid = projectPrimaryUid.trim();
    if (!techUid) {
      setProjectHelperUids([]);
      return;
    }

    setProjectHelperUids(Array.from(new Set(computeDefaultHelpersForTech(techUid))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPrimaryUid, projectUseDefaultHelper, employeeProfiles]);

  // -----------------------------
  // Auto default helpers (stage-level)
  // -----------------------------
  useEffect(() => {
    if (!roughInAssign.overrideEnabled || !roughInAssign.useDefaultHelper) return;
    const techUid = roughInAssign.primaryUid.trim();
    if (!techUid) {
      setRoughInAssign((p) => ({ ...p, helperUids: [] }));
      return;
    }
    setRoughInAssign((p) => ({ ...p, helperUids: Array.from(new Set(computeDefaultHelpersForTech(techUid))) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roughInAssign.primaryUid, roughInAssign.overrideEnabled, roughInAssign.useDefaultHelper, employeeProfiles]);

  useEffect(() => {
    if (!topOutAssign.overrideEnabled || !topOutAssign.useDefaultHelper) return;
    const techUid = topOutAssign.primaryUid.trim();
    if (!techUid) {
      setTopOutAssign((p) => ({ ...p, helperUids: [] }));
      return;
    }
    setTopOutAssign((p) => ({ ...p, helperUids: Array.from(new Set(computeDefaultHelpersForTech(techUid))) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topOutAssign.primaryUid, topOutAssign.overrideEnabled, topOutAssign.useDefaultHelper, employeeProfiles]);

  useEffect(() => {
    if (!trimAssign.overrideEnabled || !trimAssign.useDefaultHelper) return;
    const techUid = trimAssign.primaryUid.trim();
    if (!techUid) {
      setTrimAssign((p) => ({ ...p, helperUids: [] }));
      return;
    }
    setTrimAssign((p) => ({ ...p, helperUids: Array.from(new Set(computeDefaultHelpersForTech(techUid))) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimAssign.primaryUid, trimAssign.overrideEnabled, trimAssign.useDefaultHelper, employeeProfiles]);

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
  // Trips grouped by stage (only relevant stages)
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
    // For time+materials (or any project where stageKey is missing/null)
    return projectTrips
      .filter((t) => !String(t.link?.projectStageKey || "").trim())
      .sort((a, b) => `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`));
  }, [projectTrips]);

  // -----------------------------
  // Sync Stage Trips: create missing daily all-day trips
  // (does NOT overwrite existing trips)
  // -----------------------------
  async function syncStageTrips(stageKey: StageKey) {
    if (!project) return;
    if (!canEditProject) return;

    // stage schedule source is your editable form state
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

    const secondaryUid = crew.secondary.trim();
    const helpers = crew.helpers || [];

    const helperUid = helpers[0] || "";
    const secondaryHelperUid = helpers[1] || "";

    const primaryName = findTechName(primaryUid) || "Primary Tech";
    const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
    const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
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

      // Check if it already exists (so we do NOT overwrite manual edits)
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

  function safeTrim(x: any) {
  return String(x || "").trim();
}

function defaultStageTripDate(stageKey: StageKey) {
  const start =
    stageKey === "roughIn"
      ? safeTrim(roughInScheduledDate)
      : stageKey === "topOutVent"
        ? safeTrim(topOutVentScheduledDate)
        : safeTrim(trimFinishScheduledDate);

  // fallback: today
  if (start) return start;
  return toIsoDate(new Date());
}

function makeProjectTripId(projectId: string, stageKey: StageKey, dateIso: string) {
  // Unique enough to allow multiple trips on same date if needed
  const suffix = Math.random().toString(36).slice(2, 7);
  return `proj_${projectId}_${stageKey}_${dateIso}_${suffix}`;
}

async function addStageTrip(stageKey: StageKey) {
  if (!project) return;
  if (!canEditProject) {
    alert("Only Admin/Dispatcher/Manager can add project trips.");
    return;
  }

  const dateIso = defaultStageTripDate(stageKey);

  // Use effective crew for stage
  const crew = getEffectiveCrewForStage(stageKey);

  const primaryUid = safeTrim(crew.primary);
  if (!primaryUid) {
    alert("Stage crew requires a Primary Technician (stage override or project default).");
    return;
  }

  const secondaryUid = safeTrim(crew.secondary);
  const helpers = Array.isArray(crew.helpers) ? crew.helpers : [];

  const helperUid = safeTrim(helpers[0] || "");
  const secondaryHelperUid = safeTrim(helpers[1] || "");

  const primaryName = findTechName(primaryUid) || "Primary Tech";
  const secondaryName = secondaryUid ? (findTechName(secondaryUid) || "Secondary Tech") : null;
  const helperName = helperUid ? (findHelperName(helperUid) || "Helper") : null;
  const secondaryHelperName = secondaryHelperUid ? (findHelperName(secondaryHelperUid) || "Helper") : null;

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
    // Create doc without overwriting anything else
    await setDoc(doc(db, "trips", id), payload, { merge: false });

    // Update local state (keeps UI snappy)
    const newTrip: TripDoc = { id, ...(payload as any) };
    setProjectTrips((prev) => [...prev, newTrip].sort((a, b) => `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`)));

    // If you're currently viewing that stage, it will show immediately
  } catch (e: any) {
    alert(e?.message || "Failed to add trip.");
  }
}

  // -----------------------------
  // Trip edit / cancel
  // -----------------------------
  function canCurrentUserEditTrip(t: TripDoc) {
    if (canEditProject) return true;
    if (!isFieldRole) return false;
    return Boolean(myUid) && isUidOnTripCrew(myUid, t.crew || null);
  }

  function openEditTrip(t: TripDoc) {
    setEditTripErr("");
    setEditTripOk("");
    setEditTripId(t.id);

    setEditTripDate(t.date || "");
    const tw = (String(t.timeWindow || "all_day") as any) as "am" | "pm" | "all_day" | "custom";
    setEditTripTimeWindow(tw);
    setEditTripStartTime(t.startTime || "08:00");
    setEditTripEndTime(t.endTime || "17:00");
    setEditTripNotes(String(t.notes || ""));
  }

  function closeEditTrip() {
    setEditTripId(null);
    setEditTripErr("");
    setEditTripOk("");
    setEditTripSaving(false);
  }

  async function saveTripEdits() {
    if (!editTripId) return;

    const t = projectTrips.find((x) => x.id === editTripId);
    if (!t) return;

    if (!canCurrentUserEditTrip(t)) {
      alert("You do not have permission to edit this trip.");
      return;
    }

    setEditTripErr("");
    setEditTripOk("");
    setEditTripSaving(true);

    try {
      const now = nowIso();

      const date = editTripDate.trim();
      if (!date) {
        setEditTripErr("Trip date is required.");
        return;
      }

      const st = editTripStartTime.trim();
      const et = editTripEndTime.trim();
      if (!st || !et) {
        setEditTripErr("Start and end times are required.");
        return;
      }
      if (et <= st) {
        setEditTripErr("End time must be after start time.");
        return;
      }

      await updateDoc(doc(db, "trips", editTripId), {
        date,
        timeWindow: editTripTimeWindow,
        startTime: st,
        endTime: et,
        notes: editTripNotes.trim() || null,
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      setProjectTrips((prev) =>
        prev.map((x) =>
          x.id === editTripId
            ? {
                ...x,
                date,
                timeWindow: editTripTimeWindow,
                startTime: st,
                endTime: et,
                notes: editTripNotes.trim() || null,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : x
        )
      );

      setEditTripOk("✅ Trip updated.");
      setTimeout(() => closeEditTrip(), 600);
    } catch (e: any) {
      setEditTripErr(e?.message || "Failed to update trip.");
    } finally {
      setEditTripSaving(false);
    }
  }

  async function cancelTrip(t: TripDoc) {
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
            ? {
                ...x,
                status: "cancelled",
                active: false,
                cancelReason: trimmed,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
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
    alert("Only Admin/Dispatcher/Manager can remove project trips.");
    return;
  }

  const ok = window.confirm(
    `Permanently delete this trip?\n\n${t.date} • ${String(t.timeWindow || "").replaceAll("_", " ")} • ${t.startTime}-${t.endTime}\n\nThis cannot be undone.`
  );
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "trips", t.id));
    setProjectTrips((prev) => prev.filter((x) => x.id !== t.id));

    // If the edit modal is open for this trip, close it
    if (editTripId === t.id) closeEditTrip();
  } catch (e: any) {
    alert(e?.message || "Failed to remove trip.");
  }
}

  // -----------------------------
  // Add Project Trip (no stages / time+materials)
  // -----------------------------
  async function addProjectTripNoStage() {
    if (!project) return;
    if (!canEditProject) {
      alert("Only Admin/Dispatcher/Manager can add project trips.");
      return;
    }

    const date = createTripDate.trim();
    if (!date) {
      alert("Trip date is required.");
      return;
    }

    const st = createTripStartTime.trim();
    const et = createTripEndTime.trim();
    if (!st || !et) {
      alert("Start and end times are required.");
      return;
    }
    if (et <= st) {
      alert("End time must be after start time.");
      return;
    }

    const primaryUid = projectPrimaryUid.trim();
    if (!primaryUid) {
      alert("Set a Project Default Primary Technician first.");
      return;
    }

    const secondaryUid = projectSecondaryUid.trim();
    const helpers = projectHelperUids || [];
    const helperUid = helpers[0] || "";
    const secondaryHelperUid = helpers[1] || "";

    const primaryName = findTechName(primaryUid) || "Primary Tech";
    const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
    const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
    const secondaryHelperName = secondaryHelperUid ? findHelperName(secondaryHelperUid) || "Helper" : null;

    try {
      const now = nowIso();

      const payload = {
        active: true,
        type: "project",
        status: "planned",

        date,
        timeWindow: createTripTimeWindow,
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

        notes: createTripNotes.trim() || null,
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

      setCreateTripNotes("");
    } catch (e: any) {
      alert(e?.message || "Failed to add project trip.");
    }
  }

  // -----------------------------
  // UI helpers (helpers toggles)
  // -----------------------------
  function toggleHelperForProject(uid: string) {
    setProjectUseDefaultHelper(false);
    setProjectHelperUids((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  function toggleHelperForStage(stage: StageKey, uid: string) {
    if (stage === "roughIn") {
      setRoughInAssign((p) => {
        const next = p.helperUids.includes(uid) ? p.helperUids.filter((x) => x !== uid) : [...p.helperUids, uid];
        return { ...p, helperUids: next, useDefaultHelper: false };
      });
      return;
    }
    if (stage === "topOutVent") {
      setTopOutAssign((p) => {
        const next = p.helperUids.includes(uid) ? p.helperUids.filter((x) => x !== uid) : [...p.helperUids, uid];
        return { ...p, helperUids: next, useDefaultHelper: false };
      });
      return;
    }
    setTrimAssign((p) => {
      const next = p.helperUids.includes(uid) ? p.helperUids.filter((x) => x !== uid) : [...p.helperUids, uid];
      return { ...p, helperUids: next, useDefaultHelper: false };
    });
  }

  // -----------------------------
  // Save Project Updates (keeps your existing behavior)
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
      const projHelpers = projectHelperUids;

      const projHelperNames = projHelpers.length ? helperNamesFromUids(projHelpers) : [];

      function buildStageStaffingPayload(stage: StageAssignmentState): StageStaffing | null {
        if (!stage.overrideEnabled) return null;

        const primaryUid = stage.primaryUid.trim();
        const secondaryUid = stage.secondaryUid.trim();
        const helpers = stage.helperUids;

        const primaryName = primaryUid ? findTechName(primaryUid) : "";
        const secondaryName = secondaryUid ? findTechName(secondaryUid) : "";
        const names = helpers.length ? helperNamesFromUids(helpers) : [];

        const staffing: StageStaffing = {
          primaryTechnicianId: primaryUid || undefined,
          primaryTechnicianName: primaryName || undefined,
          secondaryTechnicianId: secondaryUid || undefined,
          secondaryTechnicianName: secondaryName || undefined,
          helperIds: helpers.length ? helpers : undefined,
          helperNames: helpers.length ? names : undefined,
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
        helperIds: projHelpers.length ? projHelpers : null,
        helperNames: projHelpers.length ? projHelperNames : null,

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
      setSaveSuccess("Project updates saved successfully.");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save project updates.");
    } finally {
      setSaving(false);
    }
  }

  // Snapshot display helpers
  const projectHelperNames = useMemo(() => helperNamesFromUids(projectHelperUids), [projectHelperUids, employeeProfiles]);
  const projectPrimaryName = projectPrimaryUid ? findTechName(projectPrimaryUid) : "";
  const projectSecondaryName = projectSecondaryUid ? findTechName(projectSecondaryUid) : "";

  const stageSummary = useMemo(() => {
    function stageLine(stageKey: StageKey) {
      const crew = getEffectiveCrewForStage(stageKey);
      const primary = crew.primary ? findTechName(crew.primary) : "Unassigned";
      const secondary = crew.secondary ? findTechName(crew.secondary) : "—";
      const helpers = crew.helpers.length ? helperNamesFromUids(crew.helpers).join(", ") : "—";
      const overridden =
        stageKey === "roughIn"
          ? roughInAssign.overrideEnabled
          : stageKey === "topOutVent"
          ? topOutAssign.overrideEnabled
          : trimAssign.overrideEnabled;

      return { primary, secondary, helpers, overridden };
    }

    return {
      roughIn: stageLine("roughIn"),
      topOutVent: stageLine("topOutVent"),
      trimFinish: stageLine("trimFinish"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPrimaryUid, projectSecondaryUid, projectHelperUids, roughInAssign, topOutAssign, trimAssign, technicians, employeeProfiles]);

  const activeStageTrips = tripsByStage[activeStageTab] || [];

  const stageCards = useMemo(() => {
    if (!project) return [];
    const cards: Array<{ key: StageKey; label: string; stage: any }> = [];

    if (enabledStages.includes("roughIn")) cards.push({ key: "roughIn", label: "Rough-In", stage: project.roughIn });
    if (enabledStages.includes("topOutVent")) cards.push({ key: "topOutVent", label: "Top-Out / Vent", stage: project.topOutVent });
    if (enabledStages.includes("trimFinish")) cards.push({ key: "trimFinish", label: "Trim / Finish", stage: project.trimFinish });

    return cards;
  }, [project, enabledStages]);

  return (
    <ProtectedPage fallbackTitle="Project Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading project...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && project ? (
          <div style={{ display: "grid", gap: "18px" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>{project.projectName}</h1>
                <p style={{ marginTop: "6px", color: "#666" }}>Project ID: {projectId}</p>
              </div>

              <Link
                href="/projects"
                style={{
                  padding: "8px 14px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                Back to Projects
              </Link>
            </div>

            {/* Customer */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>Customer</h2>
              <p>
                <strong>Customer Name:</strong> {project.customerDisplayName}
              </p>
              <p>
                <strong>Customer ID:</strong> {project.customerId}
              </p>
            </div>

            {/* Address */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>Project Address</h2>
              <p>
                <strong>Label:</strong> {project.serviceAddressLabel || "—"}
              </p>
              <p>{project.serviceAddressLine1}</p>
              <p>{project.serviceAddressLine2 || ""}</p>
              <p>
                {project.serviceCity}, {project.serviceState} {project.servicePostalCode}
              </p>
            </div>

            {/* Overview */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>Project Overview</h2>
              <p>
                <strong>Project Type:</strong> {project.projectType}
              </p>
              <p>
                <strong>Bid Status:</strong> {formatBidStatus(project.bidStatus)}
              </p>
              <p>
                <strong>Total Bid:</strong> ${project.totalBidAmount.toFixed(2)}
              </p>

              <p style={{ marginTop: "10px", marginBottom: "6px", fontWeight: 700 }}>Default Crew</p>
              <p>
                <strong>Primary Tech:</strong> {projectPrimaryName || "Unassigned"}
              </p>
              <p>
                <strong>Secondary Tech:</strong> {projectSecondaryName || "—"}
              </p>
              <p>
                <strong>Helper/Apprentice:</strong> {projectHelperNames.length ? projectHelperNames.join(", ") : "—"}
              </p>

              <p style={{ marginTop: "10px" }}>
                <strong>Description:</strong>
              </p>
              <p>{project.description || "No description yet."}</p>
            </div>

            {/* Stage summaries (only for staged project types) */}
            {hasStages ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(3, stageCards.length)}, minmax(240px, 1fr))`,
                  gap: "12px",
                }}
              >
                {stageCards.map(({ key, label, stage }) => {
                  const sum = stageSummary[key];
                  const start = stage.scheduledDate || "";
                  const end = (stage as any).scheduledEndDate || "";
                  const scheduleText = start ? (end && end !== start ? `${start} → ${end}` : start) : "—";

                  return (
                    <div key={key} style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
                      <h3 style={{ marginTop: 0, marginBottom: "10px" }}>{label}</h3>
                      <p>
                        <strong>Status:</strong> {formatStageStatus(stage.status)}
                      </p>
                      <p>
                        <strong>Scheduled:</strong> {scheduleText}
                      </p>
                      <p>
                        <strong>Completed:</strong> {stage.completedDate || "—"}
                      </p>

                      <div style={{ marginTop: "10px", borderTop: "1px solid #eee", paddingTop: "10px" }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: "13px" }}>
                          {sum.overridden ? "Stage Crew (override)" : "Stage Crew (using default)"}
                        </p>
                        <p style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                          <strong>Primary:</strong> {sum.primary}
                          <br />
                          <strong>Secondary:</strong> {sum.secondary}
                          <br />
                          <strong>Helpers:</strong> {sum.helpers}
                        </p>

<div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
  <button
    type="button"
    onClick={() => setActiveStageTab(key as StageKey)}
    style={{
      padding: "8px 12px",
      border: "1px solid #ccc",
      borderRadius: "10px",
      background: "white",
      cursor: "pointer",
      fontWeight: 900,
    }}
  >
    Open {label} Details →
  </button>

  <button
    type="button"
    onClick={() => addStageTrip(key as StageKey)}
    disabled={!canEditProject}
    style={{
      padding: "8px 12px",
      border: "1px solid #2e7d32",
      borderRadius: "10px",
      background: canEditProject ? "#eaffea" : "#f5f5f5",
      cursor: canEditProject ? "pointer" : "not-allowed",
      fontWeight: 900,
    }}
  >
    + Add Trip
  </button>
</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Stage Tabs (Trips live here) */}
            {hasStages ? (
              <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px", background: "#fafafa" }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                  {enabledStages.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setActiveStageTab(k)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: "1px solid #ccc",
                        background: activeStageTab === k ? "white" : "#f5f5f5",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      {stageLabel(k)}
                    </button>
                  ))}
                </div>

                <div style={{ border: "1px solid #eee", borderRadius: "12px", padding: "12px", background: "white" }}>
 <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
  <button
    type="button"
    onClick={() => syncStageTrips(activeStageTab)}
    disabled={!canEditProject}
    style={{
      padding: "10px 14px",
      border: "1px solid #ccc",
      borderRadius: "12px",
      background: canEditProject ? "white" : "#f5f5f5",
      cursor: canEditProject ? "pointer" : "not-allowed",
      fontWeight: 900,
      whiteSpace: "nowrap",
    }}
  >
    🔄 Sync Stage Trips
  </button>

  <button
    type="button"
    onClick={() => addStageTrip(activeStageTab)}
    disabled={!canEditProject}
    style={{
      padding: "10px 14px",
      border: "1px solid #2e7d32",
      borderRadius: "12px",
      background: canEditProject ? "#eaffea" : "#f5f5f5",
      cursor: canEditProject ? "pointer" : "not-allowed",
      fontWeight: 900,
      whiteSpace: "nowrap",
    }}
  >
    + Add Trip
  </button>
</div>

                  <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
                    <div style={{ borderTop: "1px solid #eee", paddingTop: "10px" }}>
                      <div style={{ fontWeight: 900, fontSize: "13px" }}>Stage Schedule</div>
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                        Start: <strong>{stageScheduledStart(project, activeStageTab) || "—"}</strong> • End:{" "}
                        <strong>{stageScheduledEnd(project, activeStageTab) || "—"}</strong>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid #eee", paddingTop: "10px" }}>
                      <div style={{ fontWeight: 900, fontSize: "13px" }}>Stage Crew (effective)</div>
                      {(() => {
                        const crew = getEffectiveCrewForStage(activeStageTab);
                        const primary = crew.primary ? findTechName(crew.primary) : "Unassigned";
                        const secondary = crew.secondary ? findTechName(crew.secondary) : "—";
                        const helpers = crew.helpers.length ? helperNamesFromUids(crew.helpers).join(", ") : "—";
                        return (
                          <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                            Primary: <strong>{primary}</strong> • Secondary: <strong>{secondary}</strong> • Helpers:{" "}
                            <strong>{helpers}</strong>
                          </div>
                        );
                      })()}
                    </div>

                    <div style={{ borderTop: "1px solid #eee", paddingTop: "10px" }}>
                      <div style={{ fontWeight: 900, fontSize: "13px" }}>Trips ({activeStageTrips.length})</div>

                      {tripsLoading ? <p style={{ marginTop: 8 }}>Loading trips...</p> : null}
                      {tripsError ? <p style={{ marginTop: 8, color: "red" }}>{tripsError}</p> : null}

                      {!tripsLoading && !tripsError && activeStageTrips.length === 0 ? (
                        <div style={{ marginTop: "10px", border: "1px dashed #ccc", borderRadius: "12px", padding: "12px", background: "#fafafa", color: "#666" }}>
                          No trips created for this stage yet. Click <strong>Sync Stage Trips</strong> to generate the daily schedule blocks.
                        </div>
                      ) : null}

                      {!tripsLoading && !tripsError && activeStageTrips.length > 0 ? (
                        <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
                          {activeStageTrips.map((t) => {
                            const canEditThis = canCurrentUserEditTrip(t);
                            const cancelled = t.status === "cancelled" || t.active === false;

                            const tech = t.crew?.primaryTechName || "Unassigned";
                            const helper = t.crew?.helperName ? ` • Helper: ${t.crew?.helperName}` : "";
                            const secondTech = t.crew?.secondaryTechName ? ` • 2nd Tech: ${t.crew?.secondaryTechName}` : "";
                            const secondHelper = t.crew?.secondaryHelperName ? ` • 2nd Helper: ${t.crew?.secondaryHelperName}` : "";

                            return (
                              <div
                                key={t.id}
                                style={{
                                  border: "1px solid #eee",
                                  borderRadius: "12px",
                                  padding: "12px",
                                  background: cancelled ? "#fafafa" : "white",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                                  <div style={{ fontWeight: 900 }}>
                                    🗓 {t.date} • {String(t.timeWindow || "all_day").replaceAll("_", " ")} • {t.startTime}–{t.endTime}
                                  </div>
                                  <div style={{ fontSize: "12px", color: "#666", fontWeight: 800 }}>
                                    {cancelled ? "CANCELLED" : (t.status || "planned").replaceAll("_", " ").toUpperCase()}
                                  </div>
                                </div>

                                <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                                  Crew: <strong>{tech}</strong>
                                  {helper}
                                  {secondTech}
                                  {secondHelper}
                                </div>

                                {t.notes ? (
                                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#555", whiteSpace: "pre-wrap" }}>
                                    {t.notes}
                                  </div>
                                ) : null}

                                {t.cancelReason ? (
                                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                                    Cancel reason: {t.cancelReason}
                                  </div>
                                ) : null}

 <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
  <button
    type="button"
    onClick={() => openEditTrip(t)}
    disabled={!canEditThis}
    style={{
      padding: "8px 12px",
      border: "1px solid #ccc",
      borderRadius: "10px",
      background: "white",
      cursor: canEditThis ? "pointer" : "not-allowed",
      fontWeight: 900,
    }}
  >
    Edit / Reschedule
  </button>

  {canEditProject ? (
    <>
      <button
        type="button"
        onClick={() => cancelTrip(t)}
        disabled={cancelled}
        style={{
          padding: "8px 12px",
          border: "1px solid #ccc",
          borderRadius: "10px",
          background: "white",
          cursor: cancelled ? "not-allowed" : "pointer",
          fontWeight: 900,
        }}
      >
        Cancel
      </button>

      <button
        type="button"
        onClick={() => removeTrip(t)}
        style={{
          padding: "8px 10px",
          border: "1px solid #ddd",
          borderRadius: "10px",
          background: "white",
          cursor: "pointer",
          fontWeight: 900,
        }}
        title="Remove trip"
        aria-label="Remove trip"
      >
        🗑️
      </button>
    </>
  ) : null}
</div>

                                {!canEditThis ? (
                                  <div style={{ marginTop: "8px", fontSize: "12px", color: "#999" }}>
                                    Only Admin/Dispatcher/Manager can edit any trip. Techs can edit trips they are assigned to.
                                  </div>
                                ) : null}

                                <div style={{ marginTop: "8px", fontSize: "11px", color: "#999" }}>Trip ID: {t.id}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {/* Edit Trip Modal-ish */}
                      {editTripId ? (
                        <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: "12px" }}>
                          <div style={{ fontWeight: 900, marginBottom: "10px" }}>Edit / Reschedule Trip</div>

                          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                            <div>
                              <label style={{ fontWeight: 800, fontSize: "12px" }}>Date</label>
                              <input
                                type="date"
                                value={editTripDate}
                                onChange={(e) => setEditTripDate(e.target.value)}
                                disabled={editTripSaving}
                                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                              />
                            </div>

                            <div>
                              <label style={{ fontWeight: 800, fontSize: "12px" }}>Time Window</label>
                              <select
                                value={editTripTimeWindow}
                                onChange={(e) => setEditTripTimeWindow(e.target.value as any)}
                                disabled={editTripSaving}
                                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                              >
                                <option value="all_day">All Day</option>
                                <option value="am">AM</option>
                                <option value="pm">PM</option>
                                <option value="custom">Custom</option>
                              </select>
                            </div>

                            <div>
                              <label style={{ fontWeight: 800, fontSize: "12px" }}>Start Time</label>
                              <input
                                type="time"
                                value={editTripStartTime}
                                onChange={(e) => setEditTripStartTime(e.target.value)}
                                disabled={editTripSaving}
                                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                              />
                            </div>

                            <div>
                              <label style={{ fontWeight: 800, fontSize: "12px" }}>End Time</label>
                              <input
                                type="time"
                                value={editTripEndTime}
                                onChange={(e) => setEditTripEndTime(e.target.value)}
                                disabled={editTripSaving}
                                style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                              />
                            </div>
                          </div>

                          <div style={{ marginTop: "10px" }}>
                            <label style={{ fontWeight: 800, fontSize: "12px" }}>Notes (optional)</label>
                            <textarea
                              value={editTripNotes}
                              onChange={(e) => setEditTripNotes(e.target.value)}
                              rows={3}
                              disabled={editTripSaving}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "8px",
                                borderRadius: "10px",
                                border: "1px solid #ccc",
                                marginTop: "4px",
                              }}
                            />
                          </div>

                          <div style={{ display: "flex", gap: "10px", marginTop: "12px", alignItems: "center", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={saveTripEdits}
                              disabled={editTripSaving}
                              style={{
                                padding: "10px 14px",
                                borderRadius: "10px",
                                border: "1px solid #ccc",
                                background: "white",
                                cursor: "pointer",
                                fontWeight: 900,
                              }}
                            >
                              {editTripSaving ? "Saving..." : "Save Trip Changes"}
                            </button>

                            <button
                              type="button"
                              onClick={closeEditTrip}
                              disabled={editTripSaving}
                              style={{
                                padding: "10px 14px",
                                borderRadius: "10px",
                                border: "1px solid #ccc",
                                background: "white",
                                cursor: "pointer",
                                fontWeight: 800,
                              }}
                            >
                              Close
                            </button>

                            {editTripErr ? <span style={{ color: "red", fontSize: "13px" }}>{editTripErr}</span> : null}
                            {editTripOk ? <span style={{ color: "green", fontSize: "13px" }}>{editTripOk}</span> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Time+Materials (no stages): Project Trips */}
            {!hasStages ? (
              <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px", background: "#fafafa" }}>
                <div style={{ fontWeight: 900, fontSize: "16px" }}>Project Trips</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                  This project type has no stages. Trips here are day-by-day schedule blocks (and later can be the basis for time+materials tracking).
                </div>

                <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Add Trip</div>

                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                    <div>
                      <label style={{ fontWeight: 800, fontSize: 12 }}>Date</label>
                      <input
                        type="date"
                        value={createTripDate}
                        onChange={(e) => setCreateTripDate(e.target.value)}
                        disabled={!canEditProject}
                        style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 800, fontSize: 12 }}>Time Window</label>
                      <select
                        value={createTripTimeWindow}
                        onChange={(e) => setCreateTripTimeWindow(e.target.value as any)}
                        disabled={!canEditProject}
                        style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                      >
                        <option value="all_day">All Day</option>
                        <option value="am">AM</option>
                        <option value="pm">PM</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontWeight: 800, fontSize: 12 }}>Start Time</label>
                      <input
                        type="time"
                        value={createTripStartTime}
                        onChange={(e) => setCreateTripStartTime(e.target.value)}
                        disabled={!canEditProject}
                        style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontWeight: 800, fontSize: 12 }}>End Time</label>
                      <input
                        type="time"
                        value={createTripEndTime}
                        onChange={(e) => setCreateTripEndTime(e.target.value)}
                        disabled={!canEditProject}
                        style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontWeight: 800, fontSize: 12 }}>Notes (optional)</label>
                    <textarea
                      value={createTripNotes}
                      onChange={(e) => setCreateTripNotes(e.target.value)}
                      rows={3}
                      disabled={!canEditProject}
                      style={{ display: "block", width: "100%", padding: 8, marginTop: 4, borderRadius: 10, border: "1px solid #ccc" }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={addProjectTripNoStage}
                    disabled={!canEditProject}
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      background: canEditProject ? "white" : "#f5f5f5",
                      cursor: canEditProject ? "pointer" : "not-allowed",
                      fontWeight: 900,
                    }}
                  >
                    + Add Trip
                  </button>

                  {!canEditProject ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
                      Only Admin/Dispatcher/Manager can add trips.
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>Trips ({nonStageProjectTrips.length})</div>

                  {tripsLoading ? <p style={{ marginTop: 8 }}>Loading trips...</p> : null}
                  {tripsError ? <p style={{ marginTop: 8, color: "red" }}>{tripsError}</p> : null}

                  {!tripsLoading && !tripsError && nonStageProjectTrips.length === 0 ? (
                    <div style={{ marginTop: 10, border: "1px dashed #ccc", borderRadius: 12, padding: 12, background: "white", color: "#666" }}>
                      No project trips yet.
                    </div>
                  ) : null}

                  {!tripsLoading && !tripsError && nonStageProjectTrips.length > 0 ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {nonStageProjectTrips.map((t) => {
                        const canEditThis = canCurrentUserEditTrip(t);
                        const cancelled = t.status === "cancelled" || t.active === false;

                        return (
                          <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: cancelled ? "#fafafa" : "white" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 900 }}>
                                🗓 {t.date} • {String(t.timeWindow || "all_day").replaceAll("_", " ")} • {t.startTime}–{t.endTime}
                              </div>
                              <div style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>
                                {cancelled ? "CANCELLED" : (t.status || "planned").replaceAll("_", " ").toUpperCase()}
                              </div>
                            </div>

                            {t.notes ? (
                              <div style={{ marginTop: 6, fontSize: 12, color: "#555", whiteSpace: "pre-wrap" }}>{t.notes}</div>
                            ) : null}

                            {t.cancelReason ? (
                              <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>Cancel reason: {t.cancelReason}</div>
                            ) : null}

                            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => openEditTrip(t)}
                                disabled={!canEditThis}
                                style={{
                                  padding: "8px 12px",
                                  border: "1px solid #ccc",
                                  borderRadius: 10,
                                  background: "white",
                                  cursor: canEditThis ? "pointer" : "not-allowed",
                                  fontWeight: 900,
                                }}
                              >
                                Edit / Reschedule
                              </button>

                              {canEditProject ? (
                                <button
                                  type="button"
                                  onClick={() => cancelTrip(t)}
                                  disabled={cancelled}
                                  style={{
                                    padding: "8px 12px",
                                    border: "1px solid #ccc",
                                    borderRadius: 10,
                                    background: "white",
                                    cursor: cancelled ? "not-allowed" : "pointer",
                                    fontWeight: 900,
                                  }}
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>

                            <div style={{ marginTop: 8, fontSize: 11, color: "#999" }}>Trip ID: {t.id}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Update Project */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>Update Project</h2>

              {techLoading ? <p>Loading technicians...</p> : null}
              {techError ? <p style={{ color: "red" }}>{techError}</p> : null}
              {profilesLoading ? <p>Loading employee profiles...</p> : null}
              {profilesError ? <p style={{ color: "red" }}>{profilesError}</p> : null}

              <form onSubmit={handleSaveUpdates} style={{ display: "grid", gap: "12px", maxWidth: "900px" }}>
                <div>
                  <label>Bid Status</label>
                  <select
                    value={bidStatus}
                    onChange={(e) => setBidStatus(e.target.value as any)}
                    disabled={!canEditProject}
                    style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                  >
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                {/* Project default crew */}
                <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px", background: "#fafafa" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Default Crew (Project-level)</h3>

                  <div>
                    <label>Primary Technician</label>
                    <select
                      value={projectPrimaryUid}
                      onChange={(e) => setProjectPrimaryUid(e.target.value)}
                      disabled={!canEditProject}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    >
                      <option value="">Unassigned</option>
                      {technicians.map((tech) => (
                        <option key={tech.uid} value={tech.uid}>
                          {tech.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Secondary Technician (Optional)</label>
                    <select
                      value={projectSecondaryUid}
                      onChange={(e) => setProjectSecondaryUid(e.target.value)}
                      disabled={!canEditProject || !projectPrimaryUid}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    >
                      <option value="">— None —</option>
                      {technicians
                        .filter((t) => t.uid !== projectPrimaryUid)
                        .map((tech) => (
                          <option key={tech.uid} value={tech.uid}>
                            {tech.displayName}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
                    <label style={{ display: "block", fontWeight: 700 }}>Helper / Apprentice</label>

                    <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
                      <input
                        type="checkbox"
                        checked={projectUseDefaultHelper}
                        onChange={(e) => setProjectUseDefaultHelper(e.target.checked)}
                        disabled={!canEditProject}
                      />
                      Use default helper pairing (recommended)
                    </label>

                    <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                      {helperCandidates.length === 0 ? (
                        <p style={{ fontSize: "12px", color: "#666" }}>
                          No helper/apprentice profiles found. Set laborRole + pairing in Employee Profiles.
                        </p>
                      ) : (
                        helperCandidates.map((h) => {
                          const checked = projectHelperUids.includes(h.uid);
                          return (
                            <label
                              key={h.uid}
                              style={{
                                display: "flex",
                                gap: "10px",
                                alignItems: "center",
                                border: "1px solid #eee",
                                borderRadius: "10px",
                                padding: "8px",
                                background: "white",
                              }}
                            >
                              <input type="checkbox" checked={checked} onChange={() => toggleHelperForProject(h.uid)} disabled={!canEditProject} />
                              <div style={{ fontSize: "13px" }}>
                                <strong>{h.name}</strong> <span style={{ color: "#777" }}>({h.laborRole})</span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Stage controls (only show enabled stages) */}
                {hasStages ? (
                  <>
                    {/* Rough-In */}
                    {enabledStages.includes("roughIn") ? (
                      <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px" }}>
                        <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Rough-In</h3>

                        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                          <input
                            type="checkbox"
                            checked={roughInAssign.overrideEnabled}
                            onChange={(e) => setRoughInAssign((p) => ({ ...p, overrideEnabled: e.target.checked }))}
                            disabled={!canEditProject}
                          />
                          Override staffing for this stage (otherwise uses project default crew)
                        </label>

                        {roughInAssign.overrideEnabled ? (
                          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                            <div>
                              <label>Stage Primary Technician</label>
                              <select
                                value={roughInAssign.primaryUid}
                                onChange={(e) => setRoughInAssign((p) => ({ ...p, primaryUid: e.target.value }))}
                                disabled={!canEditProject}
                                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                              >
                                <option value="">Unassigned</option>
                                {technicians.map((tech) => (
                                  <option key={tech.uid} value={tech.uid}>
                                    {tech.displayName}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label>Stage Secondary Technician (Optional)</label>
                              <select
                                value={roughInAssign.secondaryUid}
                                onChange={(e) => setRoughInAssign((p) => ({ ...p, secondaryUid: e.target.value }))}
                                disabled={!canEditProject || !roughInAssign.primaryUid}
                                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                              >
                                <option value="">— None —</option>
                                {technicians
                                  .filter((t) => t.uid !== roughInAssign.primaryUid)
                                  .map((tech) => (
                                    <option key={tech.uid} value={tech.uid}>
                                      {tech.displayName}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
                              <label style={{ display: "block", fontWeight: 700 }}>Stage Helpers</label>

                              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={roughInAssign.useDefaultHelper}
                                  onChange={(e) => setRoughInAssign((p) => ({ ...p, useDefaultHelper: e.target.checked }))}
                                  disabled={!canEditProject}
                                />
                                Use default helper pairing (recommended)
                              </label>

                              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                                {helperCandidates.map((h) => {
                                  const checked = roughInAssign.helperUids.includes(h.uid);
                                  return (
                                    <label
                                      key={h.uid}
                                      style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "center",
                                        border: "1px solid #eee",
                                        borderRadius: 10,
                                        padding: 8,
                                        background: "white",
                                      }}
                                    >
                                      <input type="checkbox" checked={checked} onChange={() => toggleHelperForStage("roughIn", h.uid)} disabled={!canEditProject} />
                                      <div style={{ fontSize: 13 }}>
                                        <strong>{h.name}</strong> <span style={{ color: "#777" }}>({h.laborRole})</span>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <label>Status</label>
                          <select
                            value={roughInStatus}
                            onChange={(e) => setRoughInStatus(e.target.value as any)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          >
                            <option value="not_started">Not Started</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="in_progress">In Progress</option>
                            <option value="complete">Complete</option>
                          </select>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Scheduled Start Date</label>
                          <input
                            type="date"
                            value={roughInScheduledDate}
                            onChange={(e) => setRoughInScheduledDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Scheduled End Date (optional)</label>
                          <input
                            type="date"
                            value={roughInScheduledEndDate}
                            onChange={(e) => setRoughInScheduledEndDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Completed Date</label>
                          <input
                            type="date"
                            value={roughInCompletedDate}
                            onChange={(e) => setRoughInCompletedDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Top-Out / Vent */}
                    {enabledStages.includes("topOutVent") ? (
                      <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px" }}>
                        <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Top-Out / Vent</h3>

                        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                          <input
                            type="checkbox"
                            checked={topOutAssign.overrideEnabled}
                            onChange={(e) => setTopOutAssign((p) => ({ ...p, overrideEnabled: e.target.checked }))}
                            disabled={!canEditProject}
                          />
                          Override staffing for this stage (otherwise uses project default crew)
                        </label>

                        {topOutAssign.overrideEnabled ? (
                          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                            <div>
                              <label>Stage Primary Technician</label>
                              <select
                                value={topOutAssign.primaryUid}
                                onChange={(e) => setTopOutAssign((p) => ({ ...p, primaryUid: e.target.value }))}
                                disabled={!canEditProject}
                                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                              >
                                <option value="">Unassigned</option>
                                {technicians.map((tech) => (
                                  <option key={tech.uid} value={tech.uid}>
                                    {tech.displayName}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label>Stage Secondary Technician (Optional)</label>
                              <select
                                value={topOutAssign.secondaryUid}
                                onChange={(e) => setTopOutAssign((p) => ({ ...p, secondaryUid: e.target.value }))}
                                disabled={!canEditProject || !topOutAssign.primaryUid}
                                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                              >
                                <option value="">— None —</option>
                                {technicians
                                  .filter((t) => t.uid !== topOutAssign.primaryUid)
                                  .map((tech) => (
                                    <option key={tech.uid} value={tech.uid}>
                                      {tech.displayName}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
                              <label style={{ display: "block", fontWeight: 700 }}>Stage Helpers</label>

                              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={topOutAssign.useDefaultHelper}
                                  onChange={(e) => setTopOutAssign((p) => ({ ...p, useDefaultHelper: e.target.checked }))}
                                  disabled={!canEditProject}
                                />
                                Use default helper pairing (recommended)
                              </label>

                              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                                {helperCandidates.map((h) => {
                                  const checked = topOutAssign.helperUids.includes(h.uid);
                                  return (
                                    <label
                                      key={h.uid}
                                      style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "center",
                                        border: "1px solid #eee",
                                        borderRadius: 10,
                                        padding: 8,
                                        background: "white",
                                      }}
                                    >
                                      <input type="checkbox" checked={checked} onChange={() => toggleHelperForStage("topOutVent", h.uid)} disabled={!canEditProject} />
                                      <div style={{ fontSize: 13 }}>
                                        <strong>{h.name}</strong> <span style={{ color: "#777" }}>({h.laborRole})</span>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <label>Status</label>
                          <select
                            value={topOutVentStatus}
                            onChange={(e) => setTopOutVentStatus(e.target.value as any)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          >
                            <option value="not_started">Not Started</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="in_progress">In Progress</option>
                            <option value="complete">Complete</option>
                          </select>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Scheduled Start Date</label>
                          <input
                            type="date"
                            value={topOutVentScheduledDate}
                            onChange={(e) => setTopOutVentScheduledDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Scheduled End Date (optional)</label>
                          <input
                            type="date"
                            value={topOutVentScheduledEndDate}
                            onChange={(e) => setTopOutVentScheduledEndDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Completed Date</label>
                          <input
                            type="date"
                            value={topOutVentCompletedDate}
                            onChange={(e) => setTopOutVentCompletedDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Trim / Finish */}
                    {enabledStages.includes("trimFinish") ? (
                      <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px" }}>
                        <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Trim / Finish</h3>

                        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                          <input
                            type="checkbox"
                            checked={trimAssign.overrideEnabled}
                            onChange={(e) => setTrimAssign((p) => ({ ...p, overrideEnabled: e.target.checked }))}
                            disabled={!canEditProject}
                          />
                          Override staffing for this stage (otherwise uses project default crew)
                        </label>

                        {trimAssign.overrideEnabled ? (
                          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                            <div>
                              <label>Stage Primary Technician</label>
                              <select
                                value={trimAssign.primaryUid}
                                onChange={(e) => setTrimAssign((p) => ({ ...p, primaryUid: e.target.value }))}
                                disabled={!canEditProject}
                                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                              >
                                <option value="">Unassigned</option>
                                {technicians.map((tech) => (
                                  <option key={tech.uid} value={tech.uid}>
                                    {tech.displayName}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label>Stage Secondary Technician (Optional)</label>
                              <select
                                value={trimAssign.secondaryUid}
                                onChange={(e) => setTrimAssign((p) => ({ ...p, secondaryUid: e.target.value }))}
                                disabled={!canEditProject || !trimAssign.primaryUid}
                                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                              >
                                <option value="">— None —</option>
                                {technicians
                                  .filter((t) => t.uid !== trimAssign.primaryUid)
                                  .map((tech) => (
                                    <option key={tech.uid} value={tech.uid}>
                                      {tech.displayName}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div style={{ borderTop: "1px solid #eee", paddingTop: 10 }}>
                              <label style={{ display: "block", fontWeight: 700 }}>Stage Helpers</label>

                              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={trimAssign.useDefaultHelper}
                                  onChange={(e) => setTrimAssign((p) => ({ ...p, useDefaultHelper: e.target.checked }))}
                                  disabled={!canEditProject}
                                />
                                Use default helper pairing (recommended)
                              </label>

                              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                                {helperCandidates.map((h) => {
                                  const checked = trimAssign.helperUids.includes(h.uid);
                                  return (
                                    <label
                                      key={h.uid}
                                      style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "center",
                                        border: "1px solid #eee",
                                        borderRadius: 10,
                                        padding: 8,
                                        background: "white",
                                      }}
                                    >
                                      <input type="checkbox" checked={checked} onChange={() => toggleHelperForStage("trimFinish", h.uid)} disabled={!canEditProject} />
                                      <div style={{ fontSize: 13 }}>
                                        <strong>{h.name}</strong> <span style={{ color: "#777" }}>({h.laborRole})</span>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <label>Status</label>
                          <select
                            value={trimFinishStatus}
                            onChange={(e) => setTrimFinishStatus(e.target.value as any)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          >
                            <option value="not_started">Not Started</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="in_progress">In Progress</option>
                            <option value="complete">Complete</option>
                          </select>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Scheduled Start Date</label>
                          <input
                            type="date"
                            value={trimFinishScheduledDate}
                            onChange={(e) => setTrimFinishScheduledDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Scheduled End Date (optional)</label>
                          <input
                            type="date"
                            value={trimFinishScheduledEndDate}
                            onChange={(e) => setTrimFinishScheduledEndDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <label>Completed Date</label>
                          <input
                            type="date"
                            value={trimFinishCompletedDate}
                            onChange={(e) => setTrimFinishCompletedDate(e.target.value)}
                            disabled={!canEditProject}
                            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div>
                  <label>Internal Notes</label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    disabled={!canEditProject}
                    style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                  />
                </div>

                {saveError ? <p style={{ color: "red" }}>{saveError}</p> : null}
                {saveSuccess ? <p style={{ color: "green" }}>{saveSuccess}</p> : null}

                <button
                  type="submit"
                  disabled={saving || !canEditProject}
                  style={{
                    padding: "10px 16px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    width: "fit-content",
                  }}
                >
                  {saving ? "Saving..." : canEditProject ? "Save Project Updates" : "Read Only"}
                </button>
              </form>
            </div>

            {/* System */}
            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>System</h2>
              <p>
                <strong>Active:</strong> {String(project.active)}
              </p>
              <p>
                <strong>Created At:</strong> {project.createdAt || "—"}
              </p>
              <p>
                <strong>Updated At:</strong> {project.updatedAt || "—"}
              </p>
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}