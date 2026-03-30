// app/projects/[projectId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import EditCalendarRoundedIcon from "@mui/icons-material/EditCalendarRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import NoteAltRoundedIcon from "@mui/icons-material/NoteAltRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";

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
  laborRole?: string;
  defaultPairedTechUid?: string | null;
};

type StageKey = "roughIn" | "topOutVent" | "trimFinish";

type StageAssignmentState = {
  primaryUid: string;
  secondaryUid: string;
  helperUid: string;
  secondaryHelperUid: string;
  useDefaultHelper: boolean;
  overrideEnabled: boolean;
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
  status: string;
  date: string;
  timeWindow: "am" | "pm" | "all_day" | "custom" | string;
  startTime: string;
  endTime: string;
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
  if (!uid || !crew) return false;
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

function getEnabledStages(projectType: string): StageKey[] {
  const t = String(projectType || "").toLowerCase();
  if (t === "new_construction") return ["roughIn", "topOutVent", "trimFinish"];
  if (t === "remodel") return ["roughIn", "trimFinish"];
  if (
    t === "time_materials" ||
    t === "time+materials" ||
    t === "time_and_materials"
  )
    return [];
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

function defaultStageTripDate(
  stageKey: StageKey,
  args: { roughStart: string; topStart: string; trimStart: string }
) {
  const start =
    stageKey === "roughIn"
      ? safeTrim(args.roughStart)
      : stageKey === "topOutVent"
      ? safeTrim(args.topStart)
      : safeTrim(args.trimStart);

  if (start) return start;
  return toIsoDate(new Date());
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

function InfoField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 3,
        height: "100%",
        bgcolor: "background.paper",
      }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.75 }}>
        {value || "—"}
      </Typography>
    </Paper>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: 2,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            {icon}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {title}
              </Typography>
              {subtitle ? (
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              ) : null}
            </Box>
          </Stack>
          {action ? <Stack direction="row" spacing={1} flexWrap="wrap">{action}</Stack> : null}
        </Stack>
      </Box>

      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>{children}</CardContent>
    </Card>
  );
}

function selectMenuProps() {
  return {
    MenuProps: {
      PaperProps: {
        sx: {
          borderRadius: 3,
        },
      },
    },
  };
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const theme = useTheme();
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

  const [projectPrimaryUid, setProjectPrimaryUid] = useState("");
  const [projectSecondaryUid, setProjectSecondaryUid] = useState("");
  const [projectHelperUid, setProjectHelperUid] = useState<string>("");
  const [projectSecondaryHelperUid, setProjectSecondaryHelperUid] = useState<string>("");
  const [projectUseDefaultHelper, setProjectUseDefaultHelper] = useState(true);

  const [roughInAssign, setRoughInAssign] = useState<StageAssignmentState>(emptyStageAssignment());
  const [topOutAssign, setTopOutAssign] = useState<StageAssignmentState>(emptyStageAssignment());
  const [trimAssign, setTrimAssign] = useState<StageAssignmentState>(emptyStageAssignment());

  const [roughInStatus, setRoughInStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [roughInScheduledDate, setRoughInScheduledDate] = useState("");
  const [roughInScheduledEndDate, setRoughInScheduledEndDate] = useState("");
  const [roughInCompletedDate, setRoughInCompletedDate] = useState("");

  const [topOutVentStatus, setTopOutVentStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [topOutVentScheduledDate, setTopOutVentScheduledDate] = useState("");
  const [topOutVentScheduledEndDate, setTopOutVentScheduledEndDate] = useState("");
  const [topOutVentCompletedDate, setTopOutVentCompletedDate] = useState("");

  const [trimFinishStatus, setTrimFinishStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [trimFinishScheduledDate, setTrimFinishScheduledDate] = useState("");
  const [trimFinishScheduledEndDate, setTrimFinishScheduledEndDate] = useState("");
  const [trimFinishCompletedDate, setTrimFinishCompletedDate] = useState("");

  const [internalNotes, setInternalNotes] = useState("");

  const [activeStageTab, setActiveStageTab] = useState<StageKey>("roughIn");

  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [projectTrips, setProjectTrips] = useState<TripDoc[]>([]);

  const [tripModal, setTripModal] = useState<TripModalState>(emptyTripModal());
  const [tripModalBusy, setTripModalBusy] = useState(false);
  const [tripModalErr, setTripModalErr] = useState("");
  const [tripModalOk, setTripModalOk] = useState("");

  const myUid = String(appUser?.uid || "").trim();

  const canEditProject =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const isFieldRole =
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  const helperCandidates = useMemo(() => {
    const candidates: {
      uid: string;
      name: string;
      laborRole: string;
      defaultPairedTechUid?: string | null;
    }[] = [];

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
    const match = helperCandidates.find(
      (h) => String(h.defaultPairedTechUid || "").trim() === uid
    );
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

  function getEffectiveCrewForStage(stageKey: StageKey): {
    primary: string;
    helper: string;
    secondary: string;
    secondaryHelper: string;
  } {
    const stageState =
      stageKey === "roughIn"
        ? roughInAssign
        : stageKey === "topOutVent"
        ? topOutAssign
        : trimAssign;

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
          assignedTechnicianId: data.assignedTechnicianId ?? undefined,
          assignedTechnicianName: data.assignedTechnicianName ?? undefined,
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
          (data.primaryTechnicianId as string | undefined) ||
          item.assignedTechnicianId ||
          "";
        setProjectPrimaryUid(seededProjectPrimary);
        setProjectSecondaryUid((data.secondaryTechnicianId as string | undefined) || "");

        const helperIds: string[] = Array.isArray(data.helperIds)
          ? data.helperIds.filter(Boolean)
          : [];
        setProjectHelperUid(helperIds[0] || "");
        setProjectSecondaryHelperUid(helperIds[1] || "");

        const stageStaffing = (stage: any): StageStaffing | undefined => {
          return stage?.staffing ? stage.staffing : undefined;
        };

        const roughStaff = stageStaffing(item.roughIn);
        const topStaff = stageStaffing(item.topOutVent);
        const trimStaff = stageStaffing(item.trimFinish);

        const pickHelper1 = (staff?: StageStaffing) =>
          Array.isArray(staff?.helperIds) ? staff!.helperIds![0] || "" : "";
        const pickHelper2 = (staff?: StageStaffing) =>
          Array.isArray(staff?.helperIds) ? staff!.helperIds![1] || "" : "";

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
        setProfilesError(
          err instanceof Error ? err.message : "Failed to load employee profiles."
        );
      } finally {
        setProfilesLoading(false);
      }
    }

    loadProfiles();
  }, []);

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
    setProjectSecondaryHelperUid((prev) => (prev ? prev : ""));
  }, [projectPrimaryUid, projectUseDefaultHelper, helperCandidates.length]);

  useEffect(() => {
    if (!roughInAssign.overrideEnabled || !roughInAssign.useDefaultHelper) return;
    const techUid = roughInAssign.primaryUid.trim();
    if (!techUid) {
      setRoughInAssign((p) => ({ ...p, helperUid: "", secondaryHelperUid: "" }));
      return;
    }
    const h = computeDefaultHelperForTech(techUid);
    setRoughInAssign((p) => ({ ...p, helperUid: h || "" }));
  }, [
    roughInAssign.primaryUid,
    roughInAssign.overrideEnabled,
    roughInAssign.useDefaultHelper,
    helperCandidates.length,
  ]);

  useEffect(() => {
    if (!topOutAssign.overrideEnabled || !topOutAssign.useDefaultHelper) return;
    const techUid = topOutAssign.primaryUid.trim();
    if (!techUid) {
      setTopOutAssign((p) => ({ ...p, helperUid: "", secondaryHelperUid: "" }));
      return;
    }
    const h = computeDefaultHelperForTech(techUid);
    setTopOutAssign((p) => ({ ...p, helperUid: h || "" }));
  }, [
    topOutAssign.primaryUid,
    topOutAssign.overrideEnabled,
    topOutAssign.useDefaultHelper,
    helperCandidates.length,
  ]);

  useEffect(() => {
    if (!trimAssign.overrideEnabled || !trimAssign.useDefaultHelper) return;
    const techUid = trimAssign.primaryUid.trim();
    if (!techUid) {
      setTrimAssign((p) => ({ ...p, helperUid: "", secondaryHelperUid: "" }));
      return;
    }
    const h = computeDefaultHelperForTech(techUid);
    setTrimAssign((p) => ({ ...p, helperUid: h || "" }));
  }, [
    trimAssign.primaryUid,
    trimAssign.overrideEnabled,
    trimAssign.useDefaultHelper,
    helperCandidates.length,
  ]);

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

  const enabledStages = useMemo(() => {
    if (!project) return ["roughIn", "topOutVent", "trimFinish"] as StageKey[];
    return getEnabledStages(project.projectType);
  }, [project]);

  const hasStages = enabledStages.length > 0;

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
      map[k].sort((a, b) =>
        `${a.date}_${a.startTime}_${a.id}`.localeCompare(
          `${b.date}_${b.startTime}_${b.id}`
        )
      );
    }

    return map;
  }, [projectTrips]);

  const nonStageProjectTrips = useMemo(() => {
    return projectTrips
      .filter((t) => !String(t.link?.projectStageKey || "").trim())
      .sort((a, b) =>
        `${a.date}_${a.startTime}_${a.id}`.localeCompare(
          `${b.date}_${b.startTime}_${b.id}`
        )
      );
  }, [projectTrips]);

  function canCurrentUserEditTrip(t: TripDoc) {
    if (canEditProject) return true;
    if (!isFieldRole) return false;
    return Boolean(myUid) && isUidOnTripCrew(myUid, t.crew || null);
  }

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
      alert("Only Admin/Dispatcher/Manager can delete trips.");
      return;
    }

    const ok = window.confirm(
      `Permanently delete this trip?\n\n${t.date} • ${formatTripWindow(
        String(t.timeWindow || "")
      )} • ${t.startTime}-${t.endTime}\n\nThis cannot be undone.`
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "trips", t.id));
      setProjectTrips((prev) => prev.filter((x) => x.id !== t.id));
      setTripModal((m) => (m.open && m.tripId === t.id ? emptyTripModal() : m));
    } catch (e: any) {
      alert(e?.message || "Failed to delete trip.");
    }
  }

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
      alert(
        "Stage crew requires a Primary Technician (either stage override or project default)."
      );
      return;
    }

    const helperUid = safeTrim(crew.helper || "");
    const secondaryUid = safeTrim(crew.secondary || "");
    const secondaryHelperUid = safeTrim(crew.secondaryHelper || "");

    const primaryName = findTechName(primaryUid) || "Primary Tech";
    const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
    const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
    const secondaryHelperName = secondaryHelperUid
      ? findHelperName(secondaryHelperUid) || "Helper"
      : null;

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
    const secondaryHelperName = secondaryHelperUid
      ? findHelperName(secondaryHelperUid) || "Helper"
      : null;

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
        [...prev, newTrip].sort((a, b) =>
          `${a.date}_${a.startTime}_${a.id}`.localeCompare(
            `${b.date}_${b.startTime}_${b.id}`
          )
        )
      );
    } catch (e: any) {
      alert(e?.message || "Failed to add trip.");
    }
  }

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

    const primaryUid = safeTrim(values.primaryTechUid || projectPrimaryUid);
    if (!primaryUid) throw new Error("Primary Tech is required.");

    const helperUid = safeTrim(values.helperUid || "");
    const secondaryUid = safeTrim(values.secondaryTechUid || "");
    const secondaryHelperUid = safeTrim(values.secondaryHelperUid || "");

    const primaryName = findTechName(primaryUid) || "Primary Tech";
    const helperName = helperUid ? findHelperName(helperUid) || "Helper" : null;
    const secondaryName = secondaryUid ? findTechName(secondaryUid) || "Secondary Tech" : null;
    const secondaryHelperName = secondaryHelperUid
      ? findHelperName(secondaryHelperUid) || "Helper"
      : null;

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
        `${a.date}_${a.startTime}_${a.id}`.localeCompare(
          `${b.date}_${b.startTime}_${b.id}`
        )
      )
    );
  }

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
      stageKey,
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

    const tw = String(t.timeWindow || "all_day") as "am" | "pm" | "all_day" | "custom";

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

  useEffect(() => {
    if (!tripModal.open) return;
    if (tripModal.timeWindow !== "custom") {
      const { start, end } = windowToTimes(tripModal.timeWindow);
      setTripModal((m) => ({ ...m, startTime: start, endTime: end }));
    }
  }, [tripModal.timeWindow, tripModal.open]);

  async function saveTripModal() {
    if (!project || !tripModal.open) return;

    const mode = tripModal.mode;

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
      const secondaryHelperName = secondaryHelperUid
        ? findHelperName(secondaryHelperUid) || "Helper"
        : null;

      const now = nowIso();

      if (mode === "create") {
        const stageKey = tripModal.stageKey;

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
              `${a.date}_${a.startTime}_${a.id}`.localeCompare(
                `${b.date}_${b.startTime}_${b.id}`
              )
            )
          );

          setTripModalOk("✅ Trip scheduled.");
          setTimeout(() => closeTripModal(), 450);
          return;
        }

        await addProjectTripNoStageFromModal(tripModal);
        setTripModalOk("✅ Trip scheduled.");
        setTimeout(() => closeTripModal(), 450);
        return;
      }

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
      if (
        projectSecondaryHelperUid.trim() &&
        projectSecondaryHelperUid.trim() !== projectHelperUid.trim()
      ) {
        helpers.push(projectSecondaryHelperUid.trim());
      }

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
          secondaryTechnicianName: secondaryUid
            ? findTechName(secondaryUid) || undefined
            : undefined,
          helperIds: helperIds.length ? helperIds : undefined,
          helperNames: helperIds.length
            ? helperIds.map((uid) => findHelperName(uid) || uid)
            : undefined,
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
        secondaryTechnicianName: projSecondary
          ? findTechName(projSecondary) || null
          : null,

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
      setSaveError(
        err instanceof Error ? err.message : "Failed to save project updates."
      );
    } finally {
      setSaving(false);
    }
  }

  const projectPrimaryName = projectPrimaryUid ? findTechName(projectPrimaryUid) : "";
  const projectSecondaryName = projectSecondaryUid ? findTechName(projectSecondaryUid) : "";
  const projectHelperName = projectHelperUid ? findHelperName(projectHelperUid) : "";
  const projectSecondaryHelperName = projectSecondaryHelperUid
    ? findHelperName(projectSecondaryHelperUid)
    : "";

  const activeStageTrips = hasStages ? tripsByStage[activeStageTab] || [] : [];

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

  function statusChipColor(status: string): "default" | "primary" | "success" | "warning" | "error" {
    const s = String(status || "").toLowerCase();
    if (s === "complete") return "success";
    if (s === "in_progress") return "warning";
    if (s === "scheduled") return "primary";
    if (s === "cancelled") return "error";
    return "default";
  }

  function TripRow({
    t,
  }: {
    t: TripDoc;
  }) {
    const canEditThis = canCurrentUserEditTrip(t);
    const cancelled = t.status === "cancelled" || t.active === false;

    const crew = t.crew || {};
    const tech = crew.primaryTechName || "Unassigned";
    const helper = crew.helperName ? ` • Helper: ${crew.helperName}` : "";
    const secondTech = crew.secondaryTechName ? ` • 2nd Tech: ${crew.secondaryTechName}` : "";
    const secondHelper = crew.secondaryHelperName
      ? ` • 2nd Helper: ${crew.secondaryHelperName}`
      : "";

    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 4,
          bgcolor: cancelled
            ? alpha(theme.palette.error.main, 0.04)
            : "background.paper",
        }}
      >
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.25}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {t.date} • {formatTripWindow(String(t.timeWindow || "all_day"))} •{" "}
              {t.startTime}–{t.endTime}
            </Typography>

            <Chip
              label={
                cancelled
                  ? "Cancelled"
                  : (t.status || "planned").replaceAll("_", " ").toUpperCase()
              }
              color={statusChipColor(cancelled ? "cancelled" : t.status)}
              variant={cancelled ? "filled" : "outlined"}
              size="small"
            />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            <strong>Crew:</strong> {tech}
            {helper}
            {secondTech}
            {secondHelper}
          </Typography>

          {t.notes ? (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
              {t.notes}
            </Typography>
          ) : null}

          {t.cancelReason ? (
            <Typography variant="caption" color="text.secondary">
              Cancel reason: {t.cancelReason}
            </Typography>
          ) : null}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              onClick={() => openEditTrip(t)}
              disabled={!canEditThis}
            >
              Edit
            </Button>

            {canEditProject ? (
              <>
                <Button
                  variant="text"
                  color="warning"
                  onClick={() => cancelTrip(t)}
                  disabled={cancelled}
                >
                  Cancel
                </Button>
                <Button
                  variant="text"
                  color="error"
                  onClick={() => removeTrip(t)}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </Stack>

          {!canEditThis ? (
            <Typography variant="caption" color="text.secondary">
              Techs can edit trips they are assigned to. Admin / Dispatcher / Manager can
              edit any trip.
            </Typography>
          ) : null}

          <Typography variant="caption" color="text.disabled">
            Trip ID: {t.id}
          </Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Project Detail">
      <AppShell appUser={appUser}>
        <Dialog
          open={tripModal.open}
          onClose={tripModalBusy ? undefined : closeTripModal}
          fullWidth
          maxWidth="md"
          PaperProps={{
            sx: {
              borderRadius: 4,
            },
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack spacing={0.75}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {tripModal.mode === "edit" ? "Edit / Reschedule Trip" : "Schedule New Trip"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tripModal.stageKey
                  ? `Stage: ${stageLabel(tripModal.stageKey)}`
                  : "Project Trips"}
              </Typography>
            </Stack>
          </DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                }}
              >
                <TextField
                  label="Date"
                  type="date"
                  value={tripModal.date}
                  onChange={(e) =>
                    setTripModal((m) => ({ ...m, date: e.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                  disabled={tripModalBusy}
                  fullWidth
                />

                <FormControl fullWidth>
                  <InputLabel>Time Window</InputLabel>
                  <Select
                    label="Time Window"
                    value={tripModal.timeWindow}
                    onChange={(e) =>
                      setTripModal((m) => ({
                        ...m,
                        timeWindow: e.target.value as any,
                      }))
                    }
                    disabled={tripModalBusy}
                    {...selectMenuProps()}
                  >
                    <MenuItem value="all_day">All Day (8:00–5:00)</MenuItem>
                    <MenuItem value="am">Morning (8:00–12:00)</MenuItem>
                    <MenuItem value="pm">Afternoon (1:00–5:00)</MenuItem>
                    <MenuItem value="custom">Custom</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Start Time"
                  type="time"
                  value={tripModal.startTime}
                  onChange={(e) =>
                    setTripModal((m) => ({ ...m, startTime: e.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                  disabled={tripModalBusy || tripModal.timeWindow !== "custom"}
                  fullWidth
                />

                <TextField
                  label="End Time"
                  type="time"
                  value={tripModal.endTime}
                  onChange={(e) =>
                    setTripModal((m) => ({ ...m, endTime: e.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                  disabled={tripModalBusy || tripModal.timeWindow !== "custom"}
                  fullWidth
                />
              </Box>

              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 4,
                  bgcolor: alpha(theme.palette.primary.main, 0.03),
                }}
              >
                <Stack spacing={2}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Crew
                  </Typography>

                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                      },
                    }}
                  >
                    <FormControl fullWidth>
                      <InputLabel>Primary Tech</InputLabel>
                      <Select
                        label="Primary Tech"
                        value={tripModal.primaryTechUid}
                        onChange={(e) =>
                          setTripModal((m) => ({
                            ...m,
                            primaryTechUid: e.target.value,
                          }))
                        }
                        disabled={tripModalBusy}
                        {...selectMenuProps()}
                      >
                        <MenuItem value="">Select a technician...</MenuItem>
                        {technicians.map((t) => (
                          <MenuItem key={t.uid} value={t.uid}>
                            {t.displayName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl fullWidth>
                      <InputLabel>Helper</InputLabel>
                      <Select
                        label="Helper"
                        value={tripModal.helperUid}
                        onChange={(e) =>
                          setTripModal((m) => ({ ...m, helperUid: e.target.value }))
                        }
                        disabled={tripModalBusy}
                        {...selectMenuProps()}
                      >
                        <MenuItem value="">— None —</MenuItem>
                        {helperCandidates.map((h) => (
                          <MenuItem key={h.uid} value={h.uid}>
                            {h.name} ({h.laborRole})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl fullWidth>
                      <InputLabel>Secondary Tech</InputLabel>
                      <Select
                        label="Secondary Tech"
                        value={tripModal.secondaryTechUid}
                        onChange={(e) =>
                          setTripModal((m) => ({
                            ...m,
                            secondaryTechUid: e.target.value,
                          }))
                        }
                        disabled={tripModalBusy || !tripModal.primaryTechUid}
                        {...selectMenuProps()}
                      >
                        <MenuItem value="">— None —</MenuItem>
                        {technicians
                          .filter((t) => t.uid !== tripModal.primaryTechUid)
                          .map((t) => (
                            <MenuItem key={t.uid} value={t.uid}>
                              {t.displayName}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>

                    <FormControl fullWidth>
                      <InputLabel>Secondary Helper</InputLabel>
                      <Select
                        label="Secondary Helper"
                        value={tripModal.secondaryHelperUid}
                        onChange={(e) =>
                          setTripModal((m) => ({
                            ...m,
                            secondaryHelperUid: e.target.value,
                          }))
                        }
                        disabled={tripModalBusy}
                        {...selectMenuProps()}
                      >
                        <MenuItem value="">— None —</MenuItem>
                        {helperCandidates.map((h) => (
                          <MenuItem key={h.uid} value={h.uid}>
                            {h.name} ({h.laborRole})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  <Typography variant="caption" color="text.secondary">
                    Adjusting crew here ensures trips show correctly on <strong>My Day</strong>{" "}
                    and on the schedule.
                  </Typography>
                </Stack>
              </Paper>

              <TextField
                label="Trip Notes"
                value={tripModal.notes}
                onChange={(e) =>
                  setTripModal((m) => ({ ...m, notes: e.target.value }))
                }
                multiline
                minRows={4}
                disabled={tripModalBusy}
                placeholder="Optional notes for this trip..."
                fullWidth
              />

              {tripModalErr ? <Alert severity="error">{tripModalErr}</Alert> : null}
              {tripModalOk ? <Alert severity="success">{tripModalOk}</Alert> : null}
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            {tripModal.mode === "edit" && canEditProject && tripModal.tripId ? (
              <Button
                color="error"
                onClick={() => {
                  const t = projectTrips.find((x) => x.id === tripModal.tripId);
                  if (t) removeTrip(t);
                }}
                disabled={tripModalBusy}
              >
                Delete
              </Button>
            ) : null}

            <Box sx={{ flex: 1 }} />

            <Button onClick={closeTripModal} disabled={tripModalBusy}>
              Cancel
            </Button>
            <Button variant="contained" onClick={saveTripModal} disabled={tripModalBusy}>
              {tripModalBusy ? "Saving..." : "Save Changes"}
            </Button>
          </DialogActions>
        </Dialog>

        <Box
          sx={{
            minHeight: "100%",
            bgcolor: "background.default",
            px: { xs: 1, sm: 2, md: 3 },
            py: { xs: 2, md: 3 },
          }}
        >
          {loading ? <Typography>Loading project...</Typography> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && !error && project ? (
            <Stack spacing={2.5}>
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 2, sm: 3 },
                  borderRadius: 4,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  background:
                    theme.palette.mode === "light"
                      ? `linear-gradient(180deg, ${alpha(
                          theme.palette.primary.main,
                          0.06
                        )}, ${alpha(theme.palette.primary.main, 0.01)})`
                      : undefined,
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        icon={<WorkRoundedIcon />}
                        label={project.projectType}
                        variant="outlined"
                        size="small"
                      />
                      <Chip
                        label={formatBidStatus(project.bidStatus)}
                        color={statusChipColor(project.bidStatus)}
                        variant="outlined"
                        size="small"
                      />
                    </Stack>

                    <Typography variant="h4" sx={{ fontWeight: 900 }}>
                      {project.projectName}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      Project ID:{" "}
                      <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                        {projectId}
                      </Box>
                    </Typography>
                  </Stack>

                  <Button
                    component={Link}
                    href="/projects"
                    variant="outlined"
                    startIcon={<ArrowBackRoundedIcon />}
                  >
                    Back to Projects
                  </Button>
                </Stack>
              </Paper>

              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                  },
                }}
              >
                <SectionCard
                  title="Customer"
                  subtitle="Linked customer on this project"
                  icon={<GroupRoundedIcon color="primary" />}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                      },
                    }}
                  >
                    <InfoField
                      label="Customer"
                      value={project.customerDisplayName || "—"}
                    />
                    <InfoField label="Customer ID" value={project.customerId || "—"} />
                  </Box>
                </SectionCard>

                <SectionCard
                  title="Project Address"
                  subtitle="Primary service location"
                  icon={<HomeWorkRoundedIcon color="primary" />}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                      },
                    }}
                  >
                    <InfoField label="Label" value={project.serviceAddressLabel || "—"} />
                    <InfoField label="Address 1" value={project.serviceAddressLine1 || "—"} />
                    <InfoField label="Address 2" value={project.serviceAddressLine2 || "—"} />
                    <InfoField
                      label="City / State / ZIP"
                      value={`${project.serviceCity || "—"}, ${project.serviceState || "—"} ${
                        project.servicePostalCode || ""
                      }`}
                    />
                  </Box>
                </SectionCard>
              </Box>

              <SectionCard
                title="Project Overview"
                subtitle="Project defaults are used as stage fallback and can still be overridden per stage or per trip."
                icon={<InfoRoundedIcon color="primary" />}
              >
                <Stack spacing={2}>
                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(3, minmax(0, 1fr))",
                      },
                    }}
                  >
                    <InfoField label="Project Type" value={project.projectType} />
                    <InfoField label="Bid Status" value={formatBidStatus(project.bidStatus)} />
                    <InfoField
                      label="Total Bid"
                      value={`$${Number(project.totalBidAmount || 0).toFixed(2)}`}
                    />
                  </Box>

                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Stack spacing={1.25}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        Default Crew
                      </Typography>

                      <Box
                        sx={{
                          display: "grid",
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                          },
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          <strong>Primary Tech:</strong> {projectPrimaryName || "Unassigned"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Helper:</strong> {projectHelperName || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Secondary Tech:</strong> {projectSecondaryName || "—"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Secondary Helper:</strong> {projectSecondaryHelperName || "—"}
                        </Typography>
                      </Box>

                      <Typography variant="caption" color="text.secondary">
                        You can still override crew per-stage and per-trip.
                      </Typography>
                    </Stack>
                  </Paper>

                  {project.description ? (
                    <>
                      <Divider />
                      <Stack spacing={1}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          Description
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {project.description}
                        </Typography>
                      </Stack>
                    </>
                  ) : null}
                </Stack>
              </SectionCard>

              {hasStages ? (
                <SectionCard
                  title="Stages"
                  subtitle="Stage details and stage trips are managed together."
                  icon={<ConstructionRoundedIcon color="primary" />}
                  action={
                    canEditProject ? (
                      <>
                        <Button
                          variant="outlined"
                          startIcon={<SyncRoundedIcon />}
                          onClick={() => syncStageTrips(activeStageTab)}
                        >
                          Sync Stage Trips
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<EditCalendarRoundedIcon />}
                          onClick={() => openCreateTrip(activeStageTab)}
                        >
                          Schedule New Trip
                        </Button>
                      </>
                    ) : (
                      <Chip label="Read only" variant="outlined" size="small" />
                    )
                  }
                >
                  <Tabs
                    value={activeStageTab}
                    onChange={(_, value) => setActiveStageTab(value)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ mb: 2 }}
                  >
                    {enabledStages.map((k) => (
                      <Tab key={k} value={k} label={stageLabel(k)} />
                    ))}
                  </Tabs>

                  {(() => {
                    const st = stageStateForKey(activeStageTab);
                    const effective = getEffectiveCrewForStage(activeStageTab);

                    const effPrimary = effective.primary
                      ? findTechName(effective.primary)
                      : "Unassigned";
                    const effHelper = effective.helper
                      ? findHelperName(effective.helper)
                      : "—";
                    const effSecondary = effective.secondary
                      ? findTechName(effective.secondary)
                      : "—";
                    const effSecondaryHelper = effective.secondaryHelper
                      ? findHelperName(effective.secondaryHelper)
                      : "—";

                    return (
                      <Stack spacing={2}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: 4,
                            bgcolor: alpha(theme.palette.primary.main, 0.03),
                          }}
                        >
                          <Stack spacing={2}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              justifyContent="space-between"
                              spacing={1}
                              alignItems={{ xs: "flex-start", sm: "center" }}
                            >
                              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                Stage Details
                              </Typography>
                              <Chip
                                label={formatStageStatus(st.status)}
                                color={statusChipColor(st.status)}
                                variant="outlined"
                                size="small"
                              />
                            </Stack>

                            <Box
                              sx={{
                                display: "grid",
                                gap: 2,
                                gridTemplateColumns: {
                                  xs: "1fr",
                                  sm: "repeat(2, minmax(0, 1fr))",
                                  lg: "repeat(4, minmax(0, 1fr))",
                                },
                              }}
                            >
                              <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select
                                  label="Status"
                                  value={st.status}
                                  onChange={(e) => st.setStatus(e.target.value as any)}
                                  disabled={!canEditProject}
                                  {...selectMenuProps()}
                                >
                                  <MenuItem value="not_started">Not Started</MenuItem>
                                  <MenuItem value="scheduled">Scheduled</MenuItem>
                                  <MenuItem value="in_progress">In Progress</MenuItem>
                                  <MenuItem value="complete">Complete</MenuItem>
                                </Select>
                              </FormControl>

                              <TextField
                                label="Scheduled Start"
                                type="date"
                                value={st.start}
                                onChange={(e) => st.setStart(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                disabled={!canEditProject}
                                fullWidth
                              />

                              <TextField
                                label="Scheduled End"
                                type="date"
                                value={st.end}
                                onChange={(e) => st.setEnd(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                disabled={!canEditProject}
                                fullWidth
                              />

                              <TextField
                                label="Completed Date"
                                type="date"
                                value={st.done}
                                onChange={(e) => st.setDone(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                disabled={!canEditProject}
                                fullWidth
                              />
                            </Box>

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
                              <Stack spacing={2}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  justifyContent="space-between"
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                >
                                  <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                      Stage Crew
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {st.assign.overrideEnabled
                                        ? "Using stage override"
                                        : "Using project defaults"}
                                    </Typography>
                                  </Box>

                                  <FormControlLabel
                                    control={
                                      <Switch
                                        checked={st.assign.overrideEnabled}
                                        onChange={(e) =>
                                          st.setAssign((p: any) => ({
                                            ...p,
                                            overrideEnabled: e.target.checked,
                                          }))
                                        }
                                        disabled={!canEditProject}
                                      />
                                    }
                                    label="Override for this stage"
                                  />
                                </Stack>

                                {st.assign.overrideEnabled ? (
                                  <Stack spacing={2}>
                                    <Box
                                      sx={{
                                        display: "grid",
                                        gap: 2,
                                        gridTemplateColumns: {
                                          xs: "1fr",
                                          sm: "repeat(2, minmax(0, 1fr))",
                                        },
                                      }}
                                    >
                                      <FormControl fullWidth>
                                        <InputLabel>Primary Tech</InputLabel>
                                        <Select
                                          label="Primary Tech"
                                          value={st.assign.primaryUid}
                                          onChange={(e) =>
                                            st.setAssign((p: any) => ({
                                              ...p,
                                              primaryUid: e.target.value,
                                            }))
                                          }
                                          disabled={!canEditProject}
                                          {...selectMenuProps()}
                                        >
                                          <MenuItem value="">Unassigned</MenuItem>
                                          {technicians.map((t) => (
                                            <MenuItem key={t.uid} value={t.uid}>
                                              {t.displayName}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>

                                      <FormControl fullWidth>
                                        <InputLabel>Helper</InputLabel>
                                        <Select
                                          label="Helper"
                                          value={st.assign.helperUid}
                                          onChange={(e) =>
                                            st.setAssign((p: any) => ({
                                              ...p,
                                              helperUid: e.target.value,
                                              useDefaultHelper: false,
                                            }))
                                          }
                                          disabled={!canEditProject}
                                          {...selectMenuProps()}
                                        >
                                          <MenuItem value="">— None —</MenuItem>
                                          {helperCandidates.map((h) => (
                                            <MenuItem key={h.uid} value={h.uid}>
                                              {h.name} ({h.laborRole})
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>

                                      <FormControl fullWidth>
                                        <InputLabel>Secondary Tech</InputLabel>
                                        <Select
                                          label="Secondary Tech"
                                          value={st.assign.secondaryUid}
                                          onChange={(e) =>
                                            st.setAssign((p: any) => ({
                                              ...p,
                                              secondaryUid: e.target.value,
                                            }))
                                          }
                                          disabled={!canEditProject || !st.assign.primaryUid}
                                          {...selectMenuProps()}
                                        >
                                          <MenuItem value="">— None —</MenuItem>
                                          {technicians
                                            .filter((t) => t.uid !== st.assign.primaryUid)
                                            .map((t) => (
                                              <MenuItem key={t.uid} value={t.uid}>
                                                {t.displayName}
                                              </MenuItem>
                                            ))}
                                        </Select>
                                      </FormControl>

                                      <FormControl fullWidth>
                                        <InputLabel>Secondary Helper</InputLabel>
                                        <Select
                                          label="Secondary Helper"
                                          value={st.assign.secondaryHelperUid}
                                          onChange={(e) =>
                                            st.setAssign((p: any) => ({
                                              ...p,
                                              secondaryHelperUid: e.target.value,
                                              useDefaultHelper: false,
                                            }))
                                          }
                                          disabled={!canEditProject}
                                          {...selectMenuProps()}
                                        >
                                          <MenuItem value="">— None —</MenuItem>
                                          {helperCandidates.map((h) => (
                                            <MenuItem key={h.uid} value={h.uid}>
                                              {h.name} ({h.laborRole})
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                    </Box>

                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={st.assign.useDefaultHelper}
                                          onChange={(e) =>
                                            st.setAssign((p: any) => ({
                                              ...p,
                                              useDefaultHelper: e.target.checked,
                                            }))
                                          }
                                          disabled={!canEditProject}
                                        />
                                      }
                                      label="Use default helper pairing (recommended)"
                                    />
                                  </Stack>
                                ) : (
                                  <Box
                                    sx={{
                                      display: "grid",
                                      gap: 1.5,
                                      gridTemplateColumns: {
                                        xs: "1fr",
                                        sm: "repeat(2, minmax(0, 1fr))",
                                      },
                                    }}
                                  >
                                    <Typography variant="body2" color="text.secondary">
                                      <strong>Primary:</strong> {effPrimary}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      <strong>Helper:</strong> {effHelper}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      <strong>Secondary:</strong> {effSecondary}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      <strong>Secondary Helper:</strong> {effSecondaryHelper}
                                    </Typography>
                                  </Box>
                                )}
                              </Stack>
                            </Paper>

                            {!canEditProject ? (
                              <Typography variant="caption" color="text.secondary">
                                Stage details are read-only for your role.
                              </Typography>
                            ) : null}
                          </Stack>
                        </Paper>

                        <Paper
                          variant="outlined"
                          sx={{
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: 4,
                          }}
                        >
                          <Stack spacing={2}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1.5}
                              justifyContent="space-between"
                              alignItems={{ xs: "flex-start", sm: "center" }}
                            >
                              <Stack direction="row" spacing={1} alignItems="center">
                                <RouteRoundedIcon color="primary" />
                                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                  Trips
                                </Typography>
                                <Chip
                                  label={activeStageTrips.length}
                                  size="small"
                                  variant="outlined"
                                />
                              </Stack>

                              {canEditProject ? (
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Button
                                    variant="outlined"
                                    onClick={() => addStageTrip(activeStageTab)}
                                  >
                                    Quick Add Trip
                                  </Button>
                                  <Button
                                    variant="contained"
                                    onClick={() => openCreateTrip(activeStageTab)}
                                  >
                                    Schedule New Trip
                                  </Button>
                                </Stack>
                              ) : null}
                            </Stack>

                            {tripsLoading ? <Typography>Loading trips...</Typography> : null}
                            {tripsError ? <Alert severity="error">{tripsError}</Alert> : null}

                            {!tripsLoading && !tripsError && activeStageTrips.length === 0 ? (
                              <Alert severity="info" variant="outlined">
                                No trips created for this stage yet. Use <strong>Sync Stage Trips</strong>{" "}
                                to generate daily schedule blocks.
                              </Alert>
                            ) : null}

                            {!tripsLoading && !tripsError && activeStageTrips.length > 0 ? (
                              <Stack spacing={1.5}>
                                {activeStageTrips.map((t) => (
                                  <TripRow key={t.id} t={t} />
                                ))}
                              </Stack>
                            ) : null}
                          </Stack>
                        </Paper>
                      </Stack>
                    );
                  })()}
                </SectionCard>
              ) : (
                <SectionCard
                  title="Project Trips"
                  subtitle="This project type has no stages. Trips here are the schedule blocks for this project."
                  icon={<RouteRoundedIcon color="primary" />}
                  action={
                    canEditProject ? (
                      <Button
                        variant="contained"
                        onClick={() => openCreateTrip(null)}
                        startIcon={<EditCalendarRoundedIcon />}
                      >
                        Schedule New Trip
                      </Button>
                    ) : null
                  }
                >
                  <Stack spacing={2}>
                    {tripsLoading ? <Typography>Loading trips...</Typography> : null}
                    {tripsError ? <Alert severity="error">{tripsError}</Alert> : null}

                    {!tripsLoading && !tripsError && nonStageProjectTrips.length === 0 ? (
                      <Alert severity="info" variant="outlined">
                        No project trips yet.
                      </Alert>
                    ) : null}

                    {!tripsLoading && !tripsError && nonStageProjectTrips.length > 0 ? (
                      <Stack spacing={1.5}>
                        {nonStageProjectTrips.map((t) => (
                          <TripRow key={t.id} t={t} />
                        ))}
                      </Stack>
                    ) : null}
                  </Stack>
                </SectionCard>
              )}

              <SectionCard
                title="Update Project"
                subtitle="Saves project defaults, stage status/schedule/crew overrides, and internal notes."
                icon={<NoteAltRoundedIcon color="primary" />}
              >
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  {techLoading ? <Typography>Loading technicians...</Typography> : null}
                  {techError ? <Alert severity="error">{techError}</Alert> : null}
                  {profilesLoading ? <Typography>Loading employee profiles...</Typography> : null}
                  {profilesError ? <Alert severity="error">{profilesError}</Alert> : null}
                </Stack>

                <Box component="form" onSubmit={handleSaveUpdates}>
                  <Stack spacing={2}>
                    <Box
                      sx={{
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(2, minmax(0, 1fr))",
                        },
                      }}
                    >
                      <FormControl fullWidth>
                        <InputLabel>Bid Status</InputLabel>
                        <Select
                          label="Bid Status"
                          value={bidStatus}
                          onChange={(e) => setBidStatus(e.target.value as any)}
                          disabled={!canEditProject}
                          {...selectMenuProps()}
                        >
                          <MenuItem value="draft">Draft</MenuItem>
                          <MenuItem value="submitted">Submitted</MenuItem>
                          <MenuItem value="won">Won</MenuItem>
                          <MenuItem value="lost">Lost</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>

                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 4,
                        bgcolor: alpha(theme.palette.primary.main, 0.03),
                      }}
                    >
                      <Stack spacing={2}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          Default Crew (Project-level)
                        </Typography>

                        <Box
                          sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(2, minmax(0, 1fr))",
                            },
                          }}
                        >
                          <FormControl fullWidth>
                            <InputLabel>Primary Technician</InputLabel>
                            <Select
                              label="Primary Technician"
                              value={projectPrimaryUid}
                              onChange={(e) => setProjectPrimaryUid(e.target.value)}
                              disabled={!canEditProject}
                              {...selectMenuProps()}
                            >
                              <MenuItem value="">Unassigned</MenuItem>
                              {technicians.map((t) => (
                                <MenuItem key={t.uid} value={t.uid}>
                                  {t.displayName}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <Box>
                            <FormControl fullWidth>
                              <InputLabel>Helper</InputLabel>
                              <Select
                                label="Helper"
                                value={projectHelperUid}
                                onChange={(e) => {
                                  setProjectUseDefaultHelper(false);
                                  setProjectHelperUid(e.target.value);
                                }}
                                disabled={!canEditProject}
                                {...selectMenuProps()}
                              >
                                <MenuItem value="">— None —</MenuItem>
                                {helperCandidates.map((h) => (
                                  <MenuItem key={h.uid} value={h.uid}>
                                    {h.name} ({h.laborRole})
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>

                            <FormControlLabel
                              sx={{ mt: 1 }}
                              control={
                                <Switch
                                  checked={projectUseDefaultHelper}
                                  onChange={(e) =>
                                    setProjectUseDefaultHelper(e.target.checked)
                                  }
                                  disabled={!canEditProject}
                                />
                              }
                              label="Use default helper pairing (recommended)"
                            />
                          </Box>

                          <FormControl fullWidth>
                            <InputLabel>Secondary Technician</InputLabel>
                            <Select
                              label="Secondary Technician"
                              value={projectSecondaryUid}
                              onChange={(e) => setProjectSecondaryUid(e.target.value)}
                              disabled={!canEditProject || !projectPrimaryUid}
                              {...selectMenuProps()}
                            >
                              <MenuItem value="">— None —</MenuItem>
                              {technicians
                                .filter((t) => t.uid !== projectPrimaryUid)
                                .map((t) => (
                                  <MenuItem key={t.uid} value={t.uid}>
                                    {t.displayName}
                                  </MenuItem>
                                ))}
                            </Select>
                          </FormControl>

                          <FormControl fullWidth>
                            <InputLabel>Secondary Helper</InputLabel>
                            <Select
                              label="Secondary Helper"
                              value={projectSecondaryHelperUid}
                              onChange={(e) =>
                                setProjectSecondaryHelperUid(e.target.value)
                              }
                              disabled={!canEditProject}
                              {...selectMenuProps()}
                            >
                              <MenuItem value="">— None —</MenuItem>
                              {helperCandidates.map((h) => (
                                <MenuItem key={h.uid} value={h.uid}>
                                  {h.name} ({h.laborRole})
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                      </Stack>
                    </Paper>

                    <TextField
                      label="Internal Notes"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      multiline
                      minRows={4}
                      disabled={!canEditProject}
                      placeholder="Internal notes for dispatch / admins..."
                      fullWidth
                    />

                    {saveError ? <Alert severity="error">{saveError}</Alert> : null}
                    {saveSuccess ? <Alert severity="success">{saveSuccess}</Alert> : null}

                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={saving || !canEditProject}
                      >
                        {saving
                          ? "Saving..."
                          : canEditProject
                          ? "Save Project Updates"
                          : "Read Only"}
                      </Button>

                      {!canEditProject ? (
                        <Typography variant="body2" color="text.secondary">
                          Only Admin / Dispatcher / Manager can edit projects.
                        </Typography>
                      ) : null}
                    </Stack>
                  </Stack>
                </Box>
              </SectionCard>

              <SectionCard
                title="System"
                subtitle="Project metadata"
                icon={<CalendarMonthRoundedIcon color="primary" />}
              >
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(3, minmax(0, 1fr))",
                    },
                  }}
                >
                  <InfoField label="Active" value={String(project.active)} />
                  <InfoField label="Created At" value={project.createdAt || "—"} />
                  <InfoField label="Updated At" value={project.updatedAt || "—"} />
                </Box>
              </SectionCard>
            </Stack>
          ) : null}
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}