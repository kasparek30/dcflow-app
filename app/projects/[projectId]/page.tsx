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
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Autocomplete,
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
  FormLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
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
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import EditCalendarRoundedIcon from "@mui/icons-material/EditCalendarRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import NoteAltRoundedIcon from "@mui/icons-material/NoteAltRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";
import type { Project, StageStaffing } from "../../../src/types/project";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";

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

type CustomerOption = {
  id: string;
  displayName: string;
  phonePrimary?: string;
};

type EditableProjectType =
  | "new_construction"
  | "remodel"
  | "time_materials"
  | "other";

type PlanFileMeta = {
  name: string;
  url: string;
  path: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  uploadedByUid: string | null;
};

type ProjectActivityType =
  | "project_updated"
  | "trip_created"
  | "trip_updated"
  | "trip_cancelled"
  | "trip_deleted"
  | "trip_started"
  | "trip_paused"
  | "trip_resumed"
  | "trip_closeout_saved"
  | "trip_reopened"
  | "trip_notes_saved"
  | "attachment_added"
  | "attachment_removed";

type ProjectActivityEntry = {
  id: string;
  type: ProjectActivityType;
  title: string;
  description?: string | null;
  details?: string[];
  createdAt: string;
  createdByUid?: string | null;
  createdByName?: string | null;
  createdByRole?: string | null;
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

type TripTimerState = "idle" | "running" | "paused" | "stopped";

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
  timerState?: TripTimerState | string | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  closeout?: any;
  materialsUsedToday?: string | null;
  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

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

type CloseoutOutcome = "done_today" | "complete_stage" | "complete_project";

type CloseoutNeedsWork = "no" | "yes";

type TripCloseoutModalState = {
  open: boolean;
  tripId: string | null;
  outcome: CloseoutOutcome;
  needsMoreWork: CloseoutNeedsWork;
  hoursWorkedToday: string;
  workNotes: string;
  materialsUsedToday: string;
  saving: boolean;
  error: string;
};

type BasicsDraft = {
  customerId: string;
  projectName: string;
  projectType: EditableProjectType;
  description: string;
  active: boolean;
};

type AddressBidDraft = {
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string;
  bidStatus: "draft" | "submitted" | "won" | "lost";
  totalBidAmount: string;
};

type CrewNotesDraft = {
  primaryUid: string;
  secondaryUid: string;
  helperUid: string;
  secondaryHelperUid: string;
  useDefaultHelper: boolean;
  internalNotes: string;
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

function emptyCloseoutModal(): TripCloseoutModalState {
  return {
    open: false,
    tripId: null,
    outcome: "done_today",
    needsMoreWork: "no",
    hoursWorkedToday: "",
    workNotes: "",
    materialsUsedToday: "",
    saving: false,
    error: "",
  };
}

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

function safeTrim(x: any) {
  return String(x || "").trim();
}

function nowIso() {
  return new Date().toISOString();
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

function formatProjectType(projectType?: string) {
  const t = String(projectType || "").toLowerCase();
  if (t === "new_construction") return "New Construction";
  if (t === "remodel") return "Remodel";
  if (t === "time_materials") return "Time + Materials";
  return "Other";
}

function money2(n: number) {
  return Number((Number(n) || 0).toFixed(2));
}

function formatCurrency(value?: number) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildStageBilledAmounts(projectType: EditableProjectType, totalBid: number) {
  const bid = Number(totalBid) || 0;

  if (projectType === "new_construction") {
    return {
      roughIn: money2(bid * 0.25),
      topOutVent: money2(bid * 0.5),
      trimFinish: money2(bid * 0.25),
    };
  }

  if (projectType === "remodel") {
    return {
      roughIn: money2(bid * 0.5),
      topOutVent: 0,
      trimFinish: money2(bid * 0.5),
    };
  }

  return {
    roughIn: 0,
    topOutVent: 0,
    trimFinish: 0,
  };
}

function formatFileSize(bytes?: number) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function formatDateTime(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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

function stageLabel(stageKey: StageKey) {
  if (stageKey === "roughIn") return "Rough-In";
  if (stageKey === "topOutVent") return "Top-Out / Vent";
  return "Trim / Finish";
}

function getEnabledStages(projectType: string): StageKey[] {
  const t = String(projectType || "").toLowerCase();
  if (t === "new_construction") return ["roughIn", "topOutVent", "trimFinish"];
  if (t === "remodel") return ["roughIn", "trimFinish"];
  if (t === "time_materials" || t === "time+materials" || t === "time_and_materials") {
    return [];
  }
  return ["roughIn", "topOutVent", "trimFinish"];
}

function makeProjectTripId(projectId: string, stageKey: StageKey, dateIso: string) {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `proj_${projectId}_${stageKey}_${dateIso}_${suffix}`;
}

function defaultStageTripDate(
  stageKey: StageKey,
  args: { roughStart: string; topStart: string; trimStart: string },
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

function makeUploadKey() {
  return Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

function isUidOnTripCrew(uid: string, crew?: TripCrew | null) {
  if (!uid || !crew) return false;
  return (
    (crew.primaryTechUid || "") === uid ||
    (crew.helperUid || "") === uid ||
    (crew.secondaryTechUid || "") === uid ||
    (crew.secondaryHelperUid || "") === uid
  );
}

function statusChipColor(
  status: string,
): "default" | "primary" | "success" | "warning" | "error" {
  const s = String(status || "").toLowerCase();
  if (s === "complete" || s === "won" || s === "resolved") return "success";
  if (s === "in_progress" || s === "draft") return "warning";
  if (s === "scheduled" || s === "submitted" || s === "planned") return "primary";
  if (s === "cancelled" || s === "lost") return "error";
  return "default";
}

function activityTypeColor(
  type: ProjectActivityType,
): "default" | "primary" | "success" | "warning" | "error" {
  switch (type) {
    case "attachment_added":
    case "trip_closeout_saved":
      return "success";
    case "attachment_removed":
    case "trip_paused":
    case "trip_cancelled":
      return "warning";
    case "trip_created":
    case "trip_updated":
    case "trip_started":
    case "trip_resumed":
      return "primary";
    case "trip_deleted":
      return "error";
    case "trip_reopened":
    case "trip_notes_saved":
    case "project_updated":
    default:
      return "default";
  }
}

function activityTypeLabel(type: ProjectActivityType) {
  switch (type) {
    case "attachment_added":
      return "Attachment Added";
    case "attachment_removed":
      return "Attachment Removed";
    case "trip_created":
      return "Trip Created";
    case "trip_updated":
      return "Trip Updated";
    case "trip_cancelled":
      return "Trip Cancelled";
    case "trip_deleted":
      return "Trip Deleted";
    case "trip_started":
      return "Trip Started";
    case "trip_paused":
      return "Trip Paused";
    case "trip_resumed":
      return "Trip Resumed";
    case "trip_closeout_saved":
      return "Closeout Saved";
    case "trip_reopened":
      return "Trip Reopened";
    case "trip_notes_saved":
      return "Notes Saved";
    case "project_updated":
    default:
      return "Project Updated";
  }
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

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
}) {
  return (
    <Card
      sx={{
        borderRadius: 4,
        boxShadow: "none",
        border: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ mt: 1, fontWeight: 800 }}>
          {value}
        </Typography>
        {helper ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {helper}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
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

export default function ProjectDetailPage() {
 const router = useRouter();
const routeParams = useParams<{ projectId: string }>();
const routeProjectId =
  typeof routeParams?.projectId === "string" ? routeParams.projectId : "";

const theme = useTheme();
const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  const [customersLoading, setCustomersLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersError, setCustomersError] = useState("");

  const [techLoading, setTechLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techError, setTechError] = useState("");

  const [profilesLoading, setProfilesLoading] = useState(true);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [profilesError, setProfilesError] = useState("");

  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [projectTrips, setProjectTrips] = useState<TripDoc[]>([]);

  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [activityLogs, setActivityLogs] = useState<ProjectActivityEntry[]>([]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [existingPlanFiles, setExistingPlanFiles] = useState<PlanFileMeta[]>([]);
  const [pendingPlanFiles, setPendingPlanFiles] = useState<File[]>([]);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [attachmentsStatus, setAttachmentsStatus] = useState("");
  const [attachmentsError, setAttachmentsError] = useState("");
  const [attachmentsSuccess, setAttachmentsSuccess] = useState("");

  const [tripModal, setTripModal] = useState<TripModalState>(emptyTripModal());
  const [tripModalBusy, setTripModalBusy] = useState(false);
  const [tripModalErr, setTripModalErr] = useState("");
  const [tripModalOk, setTripModalOk] = useState("");

  const [closeoutModal, setCloseoutModal] = useState<TripCloseoutModalState>(emptyCloseoutModal());
  const [tripActionBusyId, setTripActionBusyId] = useState<string | null>(null);
  const [tripNoteDrafts, setTripNoteDrafts] = useState<Record<string, string>>({});

  const [editingBasics, setEditingBasics] = useState(false);
  const [editingAddressBid, setEditingAddressBid] = useState(false);
  const [editingCrewNotes, setEditingCrewNotes] = useState(false);

  const [basicsDraft, setBasicsDraft] = useState<BasicsDraft>({
    customerId: "",
    projectName: "",
    projectType: "new_construction",
    description: "",
    active: true,
  });

  const [addressBidDraft, setAddressBidDraft] = useState<AddressBidDraft>({
    serviceAddressLine1: "",
    serviceAddressLine2: "",
    serviceCity: "",
    serviceState: "TX",
    servicePostalCode: "",
    bidStatus: "draft",
    totalBidAmount: "0",
  });

  const [crewNotesDraft, setCrewNotesDraft] = useState<CrewNotesDraft>({
    primaryUid: "",
    secondaryUid: "",
    helperUid: "",
    secondaryHelperUid: "",
    useDefaultHelper: true,
    internalNotes: "",
  });

  const [basicsSaveBusy, setBasicsSaveBusy] = useState(false);
  const [basicsSaveError, setBasicsSaveError] = useState("");
  const [basicsSaveSuccess, setBasicsSaveSuccess] = useState("");

  const [addressBidSaveBusy, setAddressBidSaveBusy] = useState(false);
  const [addressBidSaveError, setAddressBidSaveError] = useState("");
  const [addressBidSaveSuccess, setAddressBidSaveSuccess] = useState("");

  const [crewNotesSaveBusy, setCrewNotesSaveBusy] = useState(false);
  const [crewNotesSaveError, setCrewNotesSaveError] = useState("");
  const [crewNotesSaveSuccess, setCrewNotesSaveSuccess] = useState("");

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

  const [stageSaveBusy, setStageSaveBusy] = useState(false);
  const [stageSaveError, setStageSaveError] = useState("");
  const [stageSaveSuccess, setStageSaveSuccess] = useState("");

  const [activeStageTab, setActiveStageTab] = useState<StageKey>("roughIn");

  const myUid = String(appUser?.uid || "").trim();
  const actorDisplayName =
    ((appUser as any)?.displayName as string | undefined) ||
    ((appUser as any)?.email as string | undefined) ||
    "Unknown User";

  const canEditProject =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const canDeleteProject =
    appUser?.role === "admin" || appUser?.role === "manager";

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

  const selectedCustomerFromProject = useMemo(() => {
    return customers.find((customer) => customer.id === (project?.customerId || "")) ?? null;
  }, [customers, project?.customerId]);

  const selectedCustomerFromDraft = useMemo(() => {
    return customers.find((customer) => customer.id === basicsDraft.customerId) ?? null;
  }, [customers, basicsDraft.customerId]);

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
        `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`),
      );
    }

    return map;
  }, [projectTrips]);

  const nonStageProjectTrips = useMemo(() => {
    return projectTrips
      .filter((t) => !String(t.link?.projectStageKey || "").trim())
      .sort((a, b) =>
        `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`),
      );
  }, [projectTrips]);

  const activeStageTrips = hasStages ? tripsByStage[activeStageTab] || [] : [];

  const previewStageAmounts = useMemo(() => {
    return buildStageBilledAmounts(
      editingAddressBid ? addressBidDraft.bidStatus && basicsDraft.projectType ? basicsDraft.projectType : (project?.projectType as EditableProjectType) || "new_construction" : (project?.projectType as EditableProjectType) || "new_construction",
      Number(editingAddressBid ? addressBidDraft.totalBidAmount : project?.totalBidAmount || 0),
    );
  }, [
    editingAddressBid,
    addressBidDraft.totalBidAmount,
    basicsDraft.projectType,
    project?.projectType,
    project?.totalBidAmount,
  ]);

  function mergeProjectState(patch: any) {
    setProject((prev) => (prev ? ({ ...prev, ...patch } as any) : prev));
  }

  function computeDefaultHelperForTech(techUid: string) {
    const uid = techUid.trim();
    if (!uid) return "";
    const match = helperCandidates.find(
      (h) => String(h.defaultPairedTechUid || "").trim() === uid,
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

  function getSavedProjectCrew() {
    const primaryUid =
      safeTrim((project as any)?.primaryTechnicianId || (project as any)?.assignedTechnicianId || "");
    const secondaryUid = safeTrim((project as any)?.secondaryTechnicianId || "");
    const helperIds = Array.isArray((project as any)?.helperIds)
      ? ((project as any).helperIds as string[]).filter(Boolean)
      : [];

    return {
      primaryUid,
      secondaryUid,
      helperUid: helperIds[0] || "",
      secondaryHelperUid: helperIds[1] || "",
    };
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

    const savedProjectCrew = getSavedProjectCrew();
    return {
      primary: savedProjectCrew.primaryUid,
      helper: savedProjectCrew.helperUid,
      secondary: savedProjectCrew.secondaryUid,
      secondaryHelper: savedProjectCrew.secondaryHelperUid,
    };
  }

  function buildCrewActivityDetails(input: {
    primaryName: string;
    helperName?: string | null;
    secondaryName?: string | null;
    secondaryHelperName?: string | null;
  }) {
    const details: string[] = [];
    details.push(`Primary Tech: ${input.primaryName}`);
    if (input.helperName) details.push(`Helper: ${input.helperName}`);
    if (input.secondaryName) details.push(`Secondary Tech: ${input.secondaryName}`);
    if (input.secondaryHelperName) details.push(`Secondary Helper: ${input.secondaryHelperName}`);
    return details;
  }

  function canCurrentUserEditTrip(t: TripDoc) {
    if (canEditProject) return true;
    if (!isFieldRole) return false;
    return Boolean(myUid) && isUidOnTripCrew(myUid, t.crew || null);
  }

  function canCurrentUserOperateTrip(t: TripDoc) {
    return canCurrentUserEditTrip(t);
  }

  function resetBasicsDraftFromProject(source?: Project | null) {
    const p = source ?? project;
    if (!p) return;

    setBasicsDraft({
      customerId: p.customerId || "",
      projectName: p.projectName || "",
      projectType: ((p.projectType as EditableProjectType) || "new_construction"),
      description: p.description || "",
      active: Boolean(p.active),
    });
  }

  function resetAddressBidDraftFromProject(source?: Project | null) {
    const p = source ?? project;
    if (!p) return;

    setAddressBidDraft({
      serviceAddressLine1: p.serviceAddressLine1 || "",
      serviceAddressLine2: p.serviceAddressLine2 || "",
      serviceCity: p.serviceCity || "",
      serviceState: p.serviceState || "TX",
      servicePostalCode: p.servicePostalCode || "",
      bidStatus: p.bidStatus || "draft",
      totalBidAmount: String(Number(p.totalBidAmount ?? 0)),
    });
  }

  function resetCrewNotesDraftFromProject(source?: Project | null) {
    const p = source ?? project;
    if (!p) return;

    const helperIds = Array.isArray((p as any).helperIds)
      ? ((p as any).helperIds as string[]).filter(Boolean)
      : [];

    setCrewNotesDraft({
      primaryUid: safeTrim((p as any).primaryTechnicianId || (p as any).assignedTechnicianId || ""),
      secondaryUid: safeTrim((p as any).secondaryTechnicianId || ""),
      helperUid: helperIds[0] || "",
      secondaryHelperUid: helperIds[1] || "",
      useDefaultHelper: true,
      internalNotes: p.internalNotes || "",
    });
  }

  async function recordProjectActivity(input: {
    type: ProjectActivityType;
    title: string;
    description?: string;
    details?: string[];
  }) {
    if (!projectId) return;

    const payload = {
      type: input.type,
      title: input.title,
      description: input.description || null,
      details: (input.details || []).filter(Boolean).slice(0, 20),
      createdAt: nowIso(),
      createdByUid: myUid || null,
      createdByName: actorDisplayName || null,
      createdByRole: appUser?.role || null,
    };

    try {
      const ref = await addDoc(collection(db, "projects", projectId, "activity"), payload as any);
      setActivityLogs((prev) => [{ id: ref.id, ...(payload as any) }, ...prev]);
    } catch (err) {
      console.error("Failed to record project activity", err);
    }
  }

useEffect(() => {
  async function loadProject() {
    if (!routeProjectId) {
      setLoading(false);
      setError("Project not found.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setProjectId(routeProjectId);

      const projectRef = doc(db, "projects", routeProjectId);
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

      const planFiles: PlanFileMeta[] = Array.isArray(data.planFiles)
        ? data.planFiles.map((file: any) => ({
            name: file?.name ?? "Unnamed file",
            url: file?.url ?? "",
            path: file?.path ?? "",
            size: Number(file?.size ?? 0),
            contentType: file?.contentType ?? "application/octet-stream",
            uploadedAt: file?.uploadedAt ?? "",
            uploadedByUid: file?.uploadedByUid ?? null,
          }))
        : [];

      setProject(item);
      setExistingPlanFiles(planFiles);

      resetBasicsDraftFromProject(item);
      resetAddressBidDraftFromProject(item);
      resetCrewNotesDraftFromProject(item);

      const stageStaffing = (stage: any): StageStaffing | undefined => {
        return stage?.staffing ? stage.staffing : undefined;
      };

      const roughStaff = stageStaffing(item.roughIn);
      const topStaff = stageStaffing(item.topOutVent);
      const trimStaff = stageStaffing(item.trimFinish);

      const pickHelper1 = (staff?: StageStaffing) =>
        Array.isArray(staff?.helperIds) ? staff.helperIds[0] || "" : "";
      const pickHelper2 = (staff?: StageStaffing) =>
        Array.isArray(staff?.helperIds) ? staff.helperIds[1] || "" : "";

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

      const enabled = getEnabledStages(item.projectType);
      if (enabled.length > 0) setActiveStageTab(enabled[0]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }

  loadProject();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [routeProjectId]);

  useEffect(() => {
    async function loadCustomers() {
      try {
        setCustomersLoading(true);
        setCustomersError("");

        const snap = await getDocs(collection(db, "customers"));
        const items: CustomerOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            displayName: data.displayName ?? "Unnamed Customer",
            phonePrimary: data.phonePrimary ?? "",
          };
        });

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setCustomers(items);
      } catch (err: unknown) {
        setCustomersError(err instanceof Error ? err.message : "Failed to load customers.");
      } finally {
        setCustomersLoading(false);
      }
    }

    loadCustomers();
  }, []);

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
          err instanceof Error ? err.message : "Failed to load employee profiles.",
        );
      } finally {
        setProfilesLoading(false);
      }
    }

    loadProfiles();
  }, []);

  useEffect(() => {
    if (!projectId) return;

    async function loadProjectTrips() {
      setTripsLoading(true);
      setTripsError("");

      try {
        const qTrips = query(
          collection(db, "trips"),
          where("link.projectId", "==", projectId),
          orderBy("date", "asc"),
          orderBy("startTime", "asc"),
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
            timerState: d.timerState ?? "idle",
            startedAt: d.startedAt ?? null,
            pausedAt: d.pausedAt ?? null,
            completedAt: d.completedAt ?? null,
            closeout: d.closeout ?? null,
            materialsUsedToday: d.materialsUsedToday ?? null,
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

  useEffect(() => {
    if (!projectId) return;

    async function loadActivity() {
      setActivityLoading(true);
      setActivityError("");

      try {
        const snap = await getDocs(
          query(collection(db, "projects", projectId, "activity"), orderBy("createdAt", "desc")),
        );

        const items: ProjectActivityEntry[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            type: data.type ?? "project_updated",
            title: data.title ?? "Activity",
            description: data.description ?? null,
            details: Array.isArray(data.details) ? data.details.filter(Boolean) : [],
            createdAt: data.createdAt ?? "",
            createdByUid: data.createdByUid ?? null,
            createdByName: data.createdByName ?? null,
            createdByRole: data.createdByRole ?? null,
          };
        });

        setActivityLogs(items);
      } catch (err: unknown) {
        setActivityError(
          err instanceof Error ? err.message : "Failed to load project activity.",
        );
      } finally {
        setActivityLoading(false);
      }
    }

    loadActivity();
  }, [projectId]);

  useEffect(() => {
    if (!crewNotesDraft.useDefaultHelper) return;
    const techUid = crewNotesDraft.primaryUid.trim();
    if (!techUid) {
      setCrewNotesDraft((prev) => ({
        ...prev,
        helperUid: "",
        secondaryHelperUid: prev.secondaryHelperUid || "",
      }));
      return;
    }

    const defaultHelper = computeDefaultHelperForTech(techUid);
    setCrewNotesDraft((prev) => ({
      ...prev,
      helperUid: defaultHelper || "",
    }));
  }, [crewNotesDraft.primaryUid, crewNotesDraft.useDefaultHelper, helperCandidates.length]);

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
    if (enabledStages.length === 0) return;
    if (!enabledStages.includes(activeStageTab)) {
      setActiveStageTab(enabledStages[0]);
    }
  }, [enabledStages, activeStageTab]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const trip of projectTrips) {
      next[trip.id] = trip.notes || "";
    }
    setTripNoteDrafts(next);
  }, [projectTrips]);

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

  async function handleSaveBasicsSection() {
    if (!project) return;

    if (!basicsDraft.customerId.trim()) {
      setBasicsSaveError("Please select a customer / contractor.");
      return;
    }

    if (!basicsDraft.projectName.trim()) {
      setBasicsSaveError("Project name is required.");
      return;
    }

    setBasicsSaveBusy(true);
    setBasicsSaveError("");
    setBasicsSaveSuccess("");

    try {
      const now = nowIso();
      const selectedCustomerRecord =
        customers.find((customer) => customer.id === basicsDraft.customerId.trim()) ?? null;

      const details: string[] = [];

      if ((project.customerId || "") !== basicsDraft.customerId.trim()) {
        details.push(
          `Customer: ${project.customerDisplayName || "—"} → ${selectedCustomerRecord?.displayName || "—"}`,
        );
      }
      if ((project.projectName || "") !== basicsDraft.projectName.trim()) {
        details.push("Project name updated");
      }
      if (String(project.projectType || "") !== basicsDraft.projectType) {
        details.push(
          `Project type: ${formatProjectType(project.projectType)} → ${formatProjectType(basicsDraft.projectType)}`,
        );
      }
      if ((project.description || "") !== basicsDraft.description.trim()) {
        details.push("Description updated");
      }
      if (Boolean(project.active) !== basicsDraft.active) {
        details.push(`Project marked ${basicsDraft.active ? "active" : "inactive"}`);
      }

      await updateDoc(doc(db, "projects", project.id), {
        customerId: basicsDraft.customerId.trim(),
        customerDisplayName:
          selectedCustomerRecord?.displayName || project.customerDisplayName || null,
        projectName: basicsDraft.projectName.trim(),
        projectType: basicsDraft.projectType,
        description: basicsDraft.description.trim() || null,
        active: basicsDraft.active,
        updatedAt: now,
      });

      mergeProjectState({
        customerId: basicsDraft.customerId.trim(),
        customerDisplayName:
          selectedCustomerRecord?.displayName || project.customerDisplayName,
        projectName: basicsDraft.projectName.trim(),
        projectType: basicsDraft.projectType,
        description: basicsDraft.description.trim() || undefined,
        active: basicsDraft.active,
        updatedAt: now,
      });

      if (details.length > 0) {
        void recordProjectActivity({
          type: "project_updated",
          title: "Project basics updated",
          description: `${details.length} change${details.length === 1 ? "" : "s"} saved.`,
          details,
        });
      }

      setEditingBasics(false);
      setBasicsSaveSuccess("✅ Project basics saved.");
    } catch (err: unknown) {
      setBasicsSaveError(
        err instanceof Error ? err.message : "Failed to save project basics.",
      );
    } finally {
      setBasicsSaveBusy(false);
    }
  }

  async function handleSaveAddressBidSection() {
    if (!project) return;

    if (
      !addressBidDraft.serviceAddressLine1.trim() ||
      !addressBidDraft.serviceCity.trim() ||
      !addressBidDraft.serviceState.trim() ||
      !addressBidDraft.servicePostalCode.trim()
    ) {
      setAddressBidSaveError("Complete the job site address before saving.");
      return;
    }

    setAddressBidSaveBusy(true);
    setAddressBidSaveError("");
    setAddressBidSaveSuccess("");

    try {
      const now = nowIso();
      const totalBid = Number(addressBidDraft.totalBidAmount) || 0;
      const stageAmounts = buildStageBilledAmounts(
        (project?.projectType as EditableProjectType) || "new_construction",
        totalBid,
      );

      const details: string[] = [];

      if (
        (project.serviceAddressLine1 || "") !== addressBidDraft.serviceAddressLine1.trim() ||
        (project.serviceAddressLine2 || "") !== (addressBidDraft.serviceAddressLine2.trim() || "") ||
        (project.serviceCity || "") !== addressBidDraft.serviceCity.trim() ||
        (project.serviceState || "") !== addressBidDraft.serviceState.trim().toUpperCase() ||
        (project.servicePostalCode || "") !== addressBidDraft.servicePostalCode.trim()
      ) {
        details.push("Job site address updated");
      }

      if (project.bidStatus !== addressBidDraft.bidStatus) {
        details.push(
          `Bid status: ${formatBidStatus(project.bidStatus)} → ${formatBidStatus(addressBidDraft.bidStatus)}`,
        );
      }

      if (Number(project.totalBidAmount || 0) !== totalBid) {
        details.push(
          `Total bid: ${formatCurrency(project.totalBidAmount)} → ${formatCurrency(totalBid)}`,
        );
      }

      const nextRoughIn = {
        ...(project.roughIn as any),
        billedAmount: stageAmounts.roughIn,
      };
      const nextTopOutVent = {
        ...(project.topOutVent as any),
        billedAmount: stageAmounts.topOutVent,
      };
      const nextTrimFinish = {
        ...(project.trimFinish as any),
        billedAmount: stageAmounts.trimFinish,
      };

      await updateDoc(doc(db, "projects", project.id), {
        serviceAddressLabel: null,
        serviceAddressLine1: addressBidDraft.serviceAddressLine1.trim(),
        serviceAddressLine2: addressBidDraft.serviceAddressLine2.trim() || null,
        serviceCity: addressBidDraft.serviceCity.trim(),
        serviceState: addressBidDraft.serviceState.trim().toUpperCase(),
        servicePostalCode: addressBidDraft.servicePostalCode.trim(),
        bidStatus: addressBidDraft.bidStatus,
        totalBidAmount: totalBid,
        roughIn: nextRoughIn,
        topOutVent: nextTopOutVent,
        trimFinish: nextTrimFinish,
        updatedAt: now,
      });

      mergeProjectState({
        serviceAddressLabel: undefined,
        serviceAddressLine1: addressBidDraft.serviceAddressLine1.trim(),
        serviceAddressLine2: addressBidDraft.serviceAddressLine2.trim() || undefined,
        serviceCity: addressBidDraft.serviceCity.trim(),
        serviceState: addressBidDraft.serviceState.trim().toUpperCase(),
        servicePostalCode: addressBidDraft.servicePostalCode.trim(),
        bidStatus: addressBidDraft.bidStatus,
        totalBidAmount: totalBid,
        roughIn: nextRoughIn,
        topOutVent: nextTopOutVent,
        trimFinish: nextTrimFinish,
        updatedAt: now,
      });

      if (details.length > 0) {
        void recordProjectActivity({
          type: "project_updated",
          title: "Address / bid updated",
          description: `${details.length} change${details.length === 1 ? "" : "s"} saved.`,
          details,
        });
      }

      setEditingAddressBid(false);
      setAddressBidSaveSuccess("✅ Address / bid saved.");
    } catch (err: unknown) {
      setAddressBidSaveError(
        err instanceof Error ? err.message : "Failed to save address / bid.",
      );
    } finally {
      setAddressBidSaveBusy(false);
    }
  }

  async function handleSaveCrewNotesSection() {
    if (!project) return;

    setCrewNotesSaveBusy(true);
    setCrewNotesSaveError("");
    setCrewNotesSaveSuccess("");

    try {
      const now = nowIso();

      const projPrimary = crewNotesDraft.primaryUid.trim() || null;
      const projSecondary = crewNotesDraft.secondaryUid.trim() || null;

      const helpers: string[] = [];
      if (crewNotesDraft.helperUid.trim()) helpers.push(crewNotesDraft.helperUid.trim());
      if (
        crewNotesDraft.secondaryHelperUid.trim() &&
        crewNotesDraft.secondaryHelperUid.trim() !== crewNotesDraft.helperUid.trim()
      ) {
        helpers.push(crewNotesDraft.secondaryHelperUid.trim());
      }

      const helperNames = helpers.map((uid) => findHelperName(uid) || uid);

      const details: string[] = [];

      if ((project.primaryTechnicianId || project.assignedTechnicianId || "") !== (projPrimary || "")) {
        details.push(
          `Primary Tech: ${project.primaryTechnicianName || "Unassigned"} → ${projPrimary ? findTechName(projPrimary) : "Unassigned"}`,
        );
      }

      if ((project.secondaryTechnicianId || "") !== (projSecondary || "")) {
        details.push(
          `Secondary Tech updated to ${projSecondary ? findTechName(projSecondary) : "None"}`,
        );
      }

      const oldHelpers = Array.isArray(project.helperNames) ? project.helperNames.join(", ") : "";
      const newHelpers = helperNames.join(", ");
      if (oldHelpers !== newHelpers) {
        details.push("Helper assignments updated");
      }

      if ((project.internalNotes || "") !== (crewNotesDraft.internalNotes.trim() || "")) {
        details.push("Internal notes updated");
      }

      await updateDoc(doc(db, "projects", project.id), {
        primaryTechnicianId: projPrimary,
        primaryTechnicianName: projPrimary ? findTechName(projPrimary) || null : null,
        secondaryTechnicianId: projSecondary,
        secondaryTechnicianName: projSecondary ? findTechName(projSecondary) || null : null,
        helperIds: helpers.length ? helpers : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianId: projPrimary,
        assignedTechnicianName: projPrimary ? findTechName(projPrimary) || null : null,
        internalNotes: crewNotesDraft.internalNotes.trim() || null,
        updatedAt: now,
      });

      mergeProjectState({
        primaryTechnicianId: projPrimary || undefined,
        primaryTechnicianName: projPrimary ? findTechName(projPrimary) || undefined : undefined,
        secondaryTechnicianId: projSecondary || undefined,
        secondaryTechnicianName: projSecondary
          ? findTechName(projSecondary) || undefined
          : undefined,
        helperIds: helpers.length ? helpers : undefined,
        helperNames: helperNames.length ? helperNames : undefined,
        assignedTechnicianId: projPrimary || undefined,
        assignedTechnicianName: projPrimary ? findTechName(projPrimary) || undefined : undefined,
        internalNotes: crewNotesDraft.internalNotes.trim() || undefined,
        updatedAt: now,
      });

      if (details.length > 0) {
        void recordProjectActivity({
          type: "project_updated",
          title: "Crew / notes updated",
          description: `${details.length} change${details.length === 1 ? "" : "s"} saved.`,
          details,
        });
      }

      setEditingCrewNotes(false);
      setCrewNotesSaveSuccess("✅ Crew / notes saved.");
    } catch (err: unknown) {
      setCrewNotesSaveError(
        err instanceof Error ? err.message : "Failed to save crew / notes.",
      );
    } finally {
      setCrewNotesSaveBusy(false);
    }
  }

  async function handleSaveStageSection(stageKey: StageKey) {
    if (!project) return;

    setStageSaveBusy(true);
    setStageSaveError("");
    setStageSaveSuccess("");

    try {
      const now = nowIso();

      function buildStageStaffingPayload(stage: StageAssignmentState): StageStaffing | null {
        if (!stage.overrideEnabled) return null;

        const primaryUid = stage.primaryUid.trim();
        const secondaryUid = stage.secondaryUid.trim();
        const h1 = stage.helperUid.trim();
        const h2 = stage.secondaryHelperUid.trim();

        const helperIds: string[] = [];
        if (h1) helperIds.push(h1);
        if (h2 && h2 !== h1) helperIds.push(h2);

        return {
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
      }

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

      const stageState = stageStateForKey(stageKey);

      const originalStage =
        stageKey === "roughIn"
          ? project.roughIn
          : stageKey === "topOutVent"
            ? project.topOutVent
            : project.trimFinish;

      const nextStaff = buildStageStaffingPayload(stageState.assign);
      const nextStage = {
        ...(originalStage as any),
        status: stageState.status,
        scheduledDate: stageState.start || null,
        scheduledEndDate: stageState.end || null,
        completedDate: stageState.done || null,
        staffing: staffingToFirestore(nextStaff),
      };

      const details: string[] = [];

      if ((originalStage.status || "") !== stageState.status) {
        details.push(
          `${stageLabel(stageKey)} status: ${formatStageStatus(originalStage.status)} → ${formatStageStatus(stageState.status)}`,
        );
      }
      if ((originalStage.scheduledDate || "") !== (stageState.start || "")) {
        details.push(`${stageLabel(stageKey)} scheduled start updated`);
      }
      if (((originalStage as any).scheduledEndDate || "") !== (stageState.end || "")) {
        details.push(`${stageLabel(stageKey)} scheduled end updated`);
      }
      if ((originalStage.completedDate || "") !== (stageState.done || "")) {
        details.push(`${stageLabel(stageKey)} completed date updated`);
      }
      if (
        JSON.stringify((originalStage as any).staffing ?? null) !==
        JSON.stringify(nextStage.staffing ?? null)
      ) {
        details.push(`${stageLabel(stageKey)} crew override updated`);
      }

      await updateDoc(doc(db, "projects", project.id), {
        [stageKey]: nextStage,
        updatedAt: now,
      } as any);

      mergeProjectState({
        [stageKey]: nextStage,
        updatedAt: now,
      });

      if (details.length > 0) {
        void recordProjectActivity({
          type: "project_updated",
          title: `${stageLabel(stageKey)} updated`,
          description: `${details.length} change${details.length === 1 ? "" : "s"} saved.`,
          details,
        });
      }

      setStageSaveSuccess(`✅ ${stageLabel(stageKey)} saved.`);
    } catch (err: unknown) {
      setStageSaveError(
        err instanceof Error ? err.message : "Failed to save stage updates.",
      );
    } finally {
      setStageSaveBusy(false);
    }
  }

  function onPickPlanFiles(files: FileList | null) {
    if (!files) return;
    setAttachmentsError("");
    setAttachmentsSuccess("");
    setAttachmentsStatus("");
    setPendingPlanFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingPlanAt(index: number) {
    setPendingPlanFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadSelectedPlanFiles() {
    if (!project || !pendingPlanFiles.length || !canEditProject) return;

    setAttachmentsBusy(true);
    setAttachmentsError("");
    setAttachmentsSuccess("");
    setAttachmentsStatus("Preparing uploads...");

    const storage = getStorage();
    const uploadedMeta: PlanFileMeta[] = [];

    try {
      for (let i = 0; i < pendingPlanFiles.length; i += 1) {
        const file = pendingPlanFiles[i];
        setAttachmentsStatus(`Uploading ${i + 1}/${pendingPlanFiles.length}: ${file.name}`);

        const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
        const path = `projectPlans/${project.id}/${makeUploadKey()}_${safeName}`;
        const ref = storageRef(storage, path);

        await uploadBytes(ref, file, {
          contentType: file.type || "application/octet-stream",
        });

        const url = await getDownloadURL(ref);

        uploadedMeta.push({
          name: file.name,
          url,
          path,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          uploadedAt: nowIso(),
          uploadedByUid: appUser?.uid || null,
        });
      }

      const nextPlanFiles = [...existingPlanFiles, ...uploadedMeta];
      const updatedAt = nowIso();

      await updateDoc(doc(db, "projects", project.id), {
        planFiles: nextPlanFiles,
        updatedAt,
      });

      setExistingPlanFiles(nextPlanFiles);
      setPendingPlanFiles([]);
      setAttachmentsStatus("");
      setAttachmentsSuccess("✅ Attachments uploaded.");
      mergeProjectState({ updatedAt });

      void recordProjectActivity({
        type: "attachment_added",
        title: uploadedMeta.length === 1 ? "Attachment uploaded" : "Attachments uploaded",
        description: `${uploadedMeta.length} attachment${uploadedMeta.length === 1 ? "" : "s"} added to the project.`,
        details: uploadedMeta.map((file) => file.name),
      });
    } catch (err: unknown) {
      setAttachmentsError(
        err instanceof Error ? err.message : "Failed to upload attachments.",
      );
    } finally {
      setAttachmentsBusy(false);
    }
  }

  async function removeExistingPlan(file: PlanFileMeta) {
    if (!project || !canEditProject) return;

    const ok = window.confirm(`Remove attachment "${file.name}" from this project?`);
    if (!ok) return;

    setAttachmentsBusy(true);
    setAttachmentsError("");
    setAttachmentsSuccess("");
    setAttachmentsStatus(`Removing ${file.name}...`);

    try {
      if (file.path) {
        const storage = getStorage();
        await deleteObject(storageRef(storage, file.path));
      }

      const nextPlanFiles = existingPlanFiles.filter((item) => item.path !== file.path);
      const updatedAt = nowIso();

      await updateDoc(doc(db, "projects", project.id), {
        planFiles: nextPlanFiles,
        updatedAt,
      });

      setExistingPlanFiles(nextPlanFiles);
      setAttachmentsStatus("");
      setAttachmentsSuccess("✅ Attachment removed.");
      mergeProjectState({ updatedAt });

      void recordProjectActivity({
        type: "attachment_removed",
        title: "Attachment removed",
        description: file.name,
        details: [`Removed by ${actorDisplayName}`],
      });
    } catch (err: unknown) {
      setAttachmentsError(
        err instanceof Error ? err.message : "Failed to remove attachment.",
      );
    } finally {
      setAttachmentsBusy(false);
    }
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
        timerState: "stopped",
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
                timerState: "stopped",
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : x,
        ),
      );

      void recordProjectActivity({
        type: "trip_cancelled",
        title: "Trip cancelled",
        description: `${t.date} • ${formatTripWindow(String(t.timeWindow || ""))} • ${t.startTime}-${t.endTime}`,
        details: [
          t.link?.projectStageKey ? `Stage: ${stageLabel(t.link.projectStageKey as StageKey)}` : "Project Trip",
          `Reason: ${trimmed}`,
        ],
      });
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
        String(t.timeWindow || ""),
      )} • ${t.startTime}-${t.endTime}\n\nThis cannot be undone.`,
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "trips", t.id));
      setProjectTrips((prev) => prev.filter((x) => x.id !== t.id));
      setTripModal((m) => (m.open && m.tripId === t.id ? emptyTripModal() : m));

      void recordProjectActivity({
        type: "trip_deleted",
        title: "Trip deleted",
        description: `${t.date} • ${formatTripWindow(String(t.timeWindow || ""))} • ${t.startTime}-${t.endTime}`,
        details: [
          t.link?.projectStageKey ? `Stage: ${stageLabel(t.link.projectStageKey as StageKey)}` : "Project Trip",
        ],
      });
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
        "Stage crew requires a Primary Technician (either stage override or project default).",
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
        timerState: "idle",
        startedAt: null,
        pausedAt: null,
        completedAt: null,
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
        orderBy("startTime", "asc"),
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
          timerState: d.timerState ?? "idle",
          startedAt: d.startedAt ?? null,
          pausedAt: d.pausedAt ?? null,
          completedAt: d.completedAt ?? null,
          closeout: d.closeout ?? null,
          materialsUsedToday: d.materialsUsedToday ?? null,
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

    void recordProjectActivity({
      type: "trip_created",
      title: "Stage trips synced",
      description: `${stageLabel(stageKey)} • Created: ${created} • Skipped: ${skipped}`,
      details: [
        `Date range: ${start}${end && end !== start ? ` → ${end}` : ""}`,
        `Primary Tech: ${primaryName}`,
        ...(helperName ? [`Helper: ${helperName}`] : []),
      ],
    });
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
      timerState: "idle",
      startedAt: null,
      pausedAt: null,
      completedAt: null,
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
          `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`),
        ),
      );

      void recordProjectActivity({
        type: "trip_created",
        title: "Stage trip added",
        description: `${dateIso} • All Day • ${stageLabel(stageKey)}`,
        details: buildCrewActivityDetails({
          primaryName,
          helperName,
          secondaryName,
          secondaryHelperName,
        }),
      });
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

    const savedProjectCrew = getSavedProjectCrew();
    const primaryUid = safeTrim(values.primaryTechUid || savedProjectCrew.primaryUid);
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
      timerState: "idle",
      startedAt: null,
      pausedAt: null,
      completedAt: null,
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
        `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`),
      ),
    );

    void recordProjectActivity({
      type: "trip_created",
      title: "Project trip scheduled",
      description: `${date} • ${formatTripWindow(values.timeWindow)} • ${st}-${et}`,
      details: buildCrewActivityDetails({
        primaryName,
        helperName,
        secondaryName,
        secondaryHelperName,
      }),
    });
  }

  function openCreateTrip(stageKey: StageKey | null) {
    if (!project) return;

    const defaults =
      stageKey && hasStages
        ? getEffectiveCrewForStage(stageKey)
        : (() => {
            const savedProjectCrew = getSavedProjectCrew();
            return {
              primary: savedProjectCrew.primaryUid,
              helper: savedProjectCrew.helperUid,
              secondary: savedProjectCrew.secondaryUid,
              secondaryHelper: savedProjectCrew.secondaryHelperUid,
            };
          })();

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
            timerState: "idle",
            startedAt: null,
            pausedAt: null,
            completedAt: null,
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
              `${a.date}_${a.startTime}_${a.id}`.localeCompare(`${b.date}_${b.startTime}_${b.id}`),
            ),
          );

          void recordProjectActivity({
            type: "trip_created",
            title: "Stage trip scheduled",
            description: `${date} • ${formatTripWindow(tripModal.timeWindow)} • ${st}-${et}`,
            details: [
              `Stage: ${stageLabel(stageKey)}`,
              ...buildCrewActivityDetails({
                primaryName,
                helperName,
                secondaryName,
                secondaryHelperName,
              }),
            ],
          });

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
            : x,
        ),
      );

      const existingTrip = projectTrips.find((x) => x.id === tripId);
      void recordProjectActivity({
        type: "trip_updated",
        title: "Trip updated",
        description: `${date} • ${formatTripWindow(tripModal.timeWindow)} • ${st}-${et}`,
        details: [
          existingTrip?.link?.projectStageKey
            ? `Stage: ${stageLabel(existingTrip.link.projectStageKey as StageKey)}`
            : "Project Trip",
          ...buildCrewActivityDetails({
            primaryName,
            helperName,
            secondaryName,
            secondaryHelperName,
          }),
        ],
      });

      setTripModalOk("✅ Trip updated.");
      setTimeout(() => closeTripModal(), 450);
    } catch (e: any) {
      setTripModalErr(e?.message || "Failed to save trip.");
    } finally {
      setTripModalBusy(false);
    }
  }

  async function saveTripNotes(t: TripDoc) {
    if (!canCurrentUserOperateTrip(t)) return;

    const noteValue = safeTrim(tripNoteDrafts[t.id] ?? t.notes ?? "");
    setTripActionBusyId(t.id);

    try {
      const now = nowIso();

      await updateDoc(doc(db, "trips", t.id), {
        notes: noteValue || null,
        updatedAt: now,
        updatedByUid: myUid || null,
      } as any);

      setProjectTrips((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                notes: noteValue || null,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : x,
        ),
      );

      void recordProjectActivity({
        type: "trip_notes_saved",
        title: "Trip notes saved",
        description: `${t.date} • ${formatTripWindow(String(t.timeWindow || ""))} • ${t.startTime}-${t.endTime}`,
        details: noteValue ? [noteValue] : ["Notes cleared"],
      });
    } catch (err: any) {
      alert(err?.message || "Failed to save trip notes.");
    } finally {
      setTripActionBusyId(null);
    }
  }

  async function applyTripLifecycleAction(
    t: TripDoc,
    action: "start" | "pause" | "resume" | "reopen",
  ) {
    if (!canCurrentUserOperateTrip(t)) return;

    setTripActionBusyId(t.id);

    try {
      const now = nowIso();
      let patch: Record<string, any> = {
        updatedAt: now,
        updatedByUid: myUid || null,
      };

      let activityType: ProjectActivityType = "trip_updated";
      let activityTitle = "Trip updated";

      if (action === "start") {
        patch = {
          ...patch,
          status: "in_progress",
          timerState: "running",
          startedAt: t.startedAt || now,
          pausedAt: null,
          active: true,
        };
        activityType = "trip_started";
        activityTitle = "Trip started";
      }

      if (action === "pause") {
        patch = {
          ...patch,
          status: "in_progress",
          timerState: "paused",
          pausedAt: now,
        };
        activityType = "trip_paused";
        activityTitle = "Trip paused";
      }

      if (action === "resume") {
        patch = {
          ...patch,
          status: "in_progress",
          timerState: "running",
          pausedAt: null,
          active: true,
        };
        activityType = "trip_resumed";
        activityTitle = "Trip resumed";
      }

      if (action === "reopen") {
        patch = {
          ...patch,
          status: "planned",
          timerState: "idle",
          completedAt: null,
          pausedAt: null,
          active: true,
          closeout: null,
        };
        activityType = "trip_reopened";
        activityTitle = "Trip reopened";
      }

      await updateDoc(doc(db, "trips", t.id), patch as any);

      setProjectTrips((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                ...patch,
              }
            : x,
        ),
      );

      const details: string[] = [];
      if (t.link?.projectStageKey) {
        details.push(`Stage: ${stageLabel(t.link.projectStageKey as StageKey)}`);
      } else {
        details.push("Project Trip");
      }
      details.push(`Primary Tech: ${t.crew?.primaryTechName || "Unassigned"}`);

      void recordProjectActivity({
        type: activityType,
        title: activityTitle,
        description: `${t.date} • ${formatTripWindow(String(t.timeWindow || ""))} • ${t.startTime}-${t.endTime}`,
        details,
      });
    } catch (err: any) {
      alert(err?.message || "Failed to update trip.");
    } finally {
      setTripActionBusyId(null);
    }
  }

  function estimateTripHours(t: TripDoc) {
    const start = safeTrim(t.startTime);
    const end = safeTrim(t.endTime);

    if (start && end && end > start) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff > 0) {
        return (diff / 60).toFixed(2);
      }
    }

    return "1.00";
  }

  function openCloseoutModal(t: TripDoc) {
    const hasStage = Boolean(safeTrim(t.link?.projectStageKey || ""));
    setCloseoutModal({
      open: true,
      tripId: t.id,
      outcome: hasStage ? "done_today" : "complete_project",
      needsMoreWork: "no",
      hoursWorkedToday: estimateTripHours(t),
      workNotes: safeTrim(tripNoteDrafts[t.id] ?? t.notes ?? ""),
      materialsUsedToday: safeTrim(t.materialsUsedToday || ""),
      saving: false,
      error: "",
    });
  }

  function closeCloseoutDialog() {
    setCloseoutModal(emptyCloseoutModal());
  }

  async function saveProjectTripCloseout() {
    if (!project || !closeoutModal.tripId) return;

    const t = projectTrips.find((trip) => trip.id === closeoutModal.tripId);
    if (!t) {
      setCloseoutModal((prev) => ({ ...prev, error: "Trip not found." }));
      return;
    }

    if (!canCurrentUserOperateTrip(t)) {
      setCloseoutModal((prev) => ({ ...prev, error: "You do not have permission to close out this trip." }));
      return;
    }

    const hoursWorked = Number(closeoutModal.hoursWorkedToday || 0);
    if (Number.isNaN(hoursWorked) || hoursWorked < 0) {
      setCloseoutModal((prev) => ({ ...prev, error: "Enter a valid hours value." }));
      return;
    }

    setCloseoutModal((prev) => ({ ...prev, saving: true, error: "" }));
    setTripActionBusyId(t.id);

    try {
      const now = nowIso();
      const workNotes = safeTrim(closeoutModal.workNotes);
      const materials = safeTrim(closeoutModal.materialsUsedToday);

      const tripPatch: Record<string, any> = {
        status: "complete",
        timerState: "stopped",
        completedAt: now,
        pausedAt: null,
        active: true,
        notes: workNotes || null,
        materialsUsedToday: materials || null,
        closeout: {
          outcome: closeoutModal.outcome,
          needsMoreWork: closeoutModal.needsMoreWork,
          hoursWorkedToday: hoursWorked,
          workNotes: workNotes || null,
          materialsUsedToday: materials || null,
          savedAt: now,
          savedByUid: myUid || null,
          savedByName: actorDisplayName || null,
        },
        updatedAt: now,
        updatedByUid: myUid || null,
      };

      await updateDoc(doc(db, "trips", t.id), tripPatch as any);

      setProjectTrips((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                ...tripPatch,
              }
            : x,
        ),
      );

      const stageKey = safeTrim(t.link?.projectStageKey || "") as StageKey | "";
      const enabled = getEnabledStages(project.projectType);
      const projectPatch: Record<string, any> = {
        updatedAt: now,
      };

      if (stageKey) {
        const currentStage =
          stageKey === "roughIn"
            ? project.roughIn
            : stageKey === "topOutVent"
              ? project.topOutVent
              : project.trimFinish;

        if (closeoutModal.outcome === "done_today") {
          if (currentStage.status === "not_started" || currentStage.status === "scheduled") {
            const nextStage = {
              ...(currentStage as any),
              status: "in_progress",
            };
            projectPatch[stageKey] = nextStage;

            if (stageKey === "roughIn") setRoughInStatus("in_progress");
            if (stageKey === "topOutVent") setTopOutVentStatus("in_progress");
            if (stageKey === "trimFinish") setTrimFinishStatus("in_progress");
          }
        }

        if (closeoutModal.outcome === "complete_stage") {
          const completeDate = t.date || toIsoDate(new Date());
          const nextStage = {
            ...(currentStage as any),
            status: "complete",
            completedDate: completeDate,
          };
          projectPatch[stageKey] = nextStage;

          if (stageKey === "roughIn") {
            setRoughInStatus("complete");
            setRoughInCompletedDate(completeDate);
          }
          if (stageKey === "topOutVent") {
            setTopOutVentStatus("complete");
            setTopOutVentCompletedDate(completeDate);
          }
          if (stageKey === "trimFinish") {
            setTrimFinishStatus("complete");
            setTrimFinishCompletedDate(completeDate);
          }
        }
      }

      if (closeoutModal.outcome === "complete_project") {
        const completeDate = t.date || toIsoDate(new Date());

        for (const key of enabled) {
          const baseStage =
            key === "roughIn"
              ? projectPatch.roughIn || project.roughIn
              : key === "topOutVent"
                ? projectPatch.topOutVent || project.topOutVent
                : projectPatch.trimFinish || project.trimFinish;

          projectPatch[key] = {
            ...(baseStage as any),
            status: "complete",
            completedDate: completeDate,
          };
        }

        setRoughInStatus(enabled.includes("roughIn") ? "complete" : roughInStatus);
        setTopOutVentStatus(enabled.includes("topOutVent") ? "complete" : topOutVentStatus);
        setTrimFinishStatus(enabled.includes("trimFinish") ? "complete" : trimFinishStatus);

        if (enabled.includes("roughIn")) setRoughInCompletedDate(completeDate);
        if (enabled.includes("topOutVent")) setTopOutVentCompletedDate(completeDate);
        if (enabled.includes("trimFinish")) setTrimFinishCompletedDate(completeDate);
      }

      if (Object.keys(projectPatch).length > 1) {
        await updateDoc(doc(db, "projects", project.id), projectPatch as any);
        mergeProjectState(projectPatch);
      } else {
        mergeProjectState({ updatedAt: now });
      }

      const details: string[] = [];
      details.push(`Outcome: ${closeoutModal.outcome.replaceAll("_", " ")}`);
      details.push(`More work needed after today: ${closeoutModal.needsMoreWork === "yes" ? "Yes" : "No"}`);
      details.push(`Hours worked today: ${hoursWorked}`);
      if (stageKey) details.push(`Stage: ${stageLabel(stageKey)}`);
      if (workNotes) details.push(`Work notes: ${workNotes}`);
      if (materials) details.push(`Materials: ${materials}`);

      void recordProjectActivity({
        type: "trip_closeout_saved",
        title: "Project trip closeout saved",
        description: `${t.date} • ${formatTripWindow(String(t.timeWindow || ""))} • ${t.startTime}-${t.endTime}`,
        details,
      });

      setCloseoutModal(emptyCloseoutModal());
    } catch (err: any) {
      setCloseoutModal((prev) => ({
        ...prev,
        saving: false,
        error: err?.message || "Failed to save closeout.",
      }));
    } finally {
      setTripActionBusyId(null);
    }
  }

  async function handleDeleteProject() {
    if (!project) return;
    if (!canDeleteProject) return;

    setDeleteBusy(true);
    setDeleteError("");

    try {
      const tripsSnap = await getDocs(
        query(collection(db, "trips"), where("link.projectId", "==", project.id)),
      );

      const batchMax = 450;
      let batch = writeBatch(db);
      let count = 0;

      for (const tripDoc of tripsSnap.docs) {
        batch.delete(tripDoc.ref);
        count += 1;

        if (count >= batchMax) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      const activitySnap = await getDocs(collection(db, "projects", project.id, "activity"));
      let activityBatch = writeBatch(db);
      let activityCount = 0;

      for (const activityDoc of activitySnap.docs) {
        activityBatch.delete(activityDoc.ref);
        activityCount += 1;

        if (activityCount >= batchMax) {
          await activityBatch.commit();
          activityBatch = writeBatch(db);
          activityCount = 0;
        }
      }

      if (activityCount > 0) {
        await activityBatch.commit();
      }

      await deleteDoc(doc(db, "projects", project.id));

      setDeleteDialogOpen(false);
      router.push("/projects");
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete project.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  function timerChipLabel(timerState?: string | null) {
    const state = String(timerState || "idle").toLowerCase();
    if (state === "running") return "Timer: running";
    if (state === "paused") return "Timer: paused";
    if (state === "stopped") return "Timer: stopped";
    return "Timer: idle";
  }

  function TripActionRow({ t }: { t: TripDoc }) {
    const canOperate = canCurrentUserOperateTrip(t);
    const busy = tripActionBusyId === t.id || closeoutModal.saving;
    const timerState = String(t.timerState || "idle").toLowerCase();
    const status = String(t.status || "").toLowerCase();
    const cancelled = status === "cancelled" || t.active === false;

    if (cancelled) return null;

    return (
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {status === "complete" ? (
            <Button
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => applyTripLifecycleAction(t, "reopen")}
              disabled={!canOperate || busy}
              sx={{ borderRadius: 99 }}
            >
              Reopen
            </Button>
          ) : null}

          {status !== "complete" && timerState === "idle" ? (
            <Button
              variant="outlined"
              startIcon={<PlayArrowRoundedIcon />}
              onClick={() => applyTripLifecycleAction(t, "start")}
              disabled={!canOperate || busy}
              sx={{ borderRadius: 99 }}
            >
              Start Trip
            </Button>
          ) : null}

          {status !== "complete" && timerState === "running" ? (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<PauseRoundedIcon />}
              onClick={() => applyTripLifecycleAction(t, "pause")}
              disabled={!canOperate || busy}
              sx={{ borderRadius: 99 }}
            >
              Pause
            </Button>
          ) : null}

          {status !== "complete" && timerState === "paused" ? (
            <Button
              variant="outlined"
              startIcon={<PlayArrowRoundedIcon />}
              onClick={() => applyTripLifecycleAction(t, "resume")}
              disabled={!canOperate || busy}
              sx={{ borderRadius: 99 }}
            >
              Resume
            </Button>
          ) : null}

          {status !== "complete" ? (
            <Button
              variant="contained"
              color="warning"
              startIcon={<StopRoundedIcon />}
              onClick={() => openCloseoutModal(t)}
              disabled={!canOperate || busy}
              sx={{
                borderRadius: 99,
                boxShadow: "none",
              }}
            >
              Finish Day
            </Button>
          ) : null}
        </Stack>

        <Button
          variant="outlined"
          startIcon={<OpenInNewRoundedIcon />}
          onClick={() => openEditTrip(t)}
          disabled={!canCurrentUserEditTrip(t) || busy}
          sx={{ borderRadius: 99, alignSelf: "flex-start" }}
        >
          Open Trip
        </Button>
      </Stack>
    );
  }

  function TripRow({ t }: { t: TripDoc }) {
    const canEditThis = canCurrentUserEditTrip(t);
    const canOperateThis = canCurrentUserOperateTrip(t);
    const cancelled = t.status === "cancelled" || t.active === false;
    const busy = tripActionBusyId === t.id || closeoutModal.saving;
    const noteValue = tripNoteDrafts[t.id] ?? t.notes ?? "";

    const crew = t.crew || {};
    const tech = crew.primaryTechName || "Unassigned";
    const helper = crew.helperName ? ` • Helper: ${crew.helperName}` : "";
    const secondTech = crew.secondaryTechName ? ` • 2nd Tech: ${crew.secondaryTechName}` : "";
    const secondHelper = crew.secondaryHelperName
      ? ` • 2nd Helper: ${crew.secondaryHelperName}`
      : "";

    const isActiveTrip =
      String(t.status || "").toLowerCase() === "in_progress" ||
      String(t.timerState || "").toLowerCase() === "running" ||
      String(t.timerState || "").toLowerCase() === "paused";

    return (
      <Card
        sx={{
          borderRadius: 4,
          boxShadow: "none",
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: cancelled
            ? alpha(theme.palette.error.main, 0.04)
            : isActiveTrip
              ? alpha(theme.palette.success.main, 0.04)
              : "background.paper",
        }}
      >
        <CardContent sx={{ p: 2 }}>
          <Stack spacing={1.75}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.25}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  {t.date} • {formatTripWindow(String(t.timeWindow || "all_day"))} •{" "}
                  {t.startTime}–{t.endTime}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Crew: {tech}
                  {helper}
                  {secondTech}
                  {secondHelper}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
                <Chip
                  label={timerChipLabel(t.timerState)}
                  variant="outlined"
                  size="small"
                />
              </Stack>
            </Stack>

            <TripActionRow t={t} />

            {t.closeout ? (
              <Alert severity="info" variant="outlined">
                Last closeout saved: {String(t.closeout.outcome || "").replaceAll("_", " ")}
              </Alert>
            ) : null}

            {t.cancelReason ? (
              <Typography variant="caption" color="text.secondary">
                Cancel reason: {t.cancelReason}
              </Typography>
            ) : null}

            <TextField
              label="Work Notes"
              value={noteValue}
              onChange={(e) =>
                setTripNoteDrafts((prev) => ({
                  ...prev,
                  [t.id]: e.target.value,
                }))
              }
              multiline
              minRows={3}
              disabled={!canOperateThis || busy}
              fullWidth
            />

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                startIcon={<SaveRoundedIcon />}
                onClick={() => saveTripNotes(t)}
                disabled={!canOperateThis || busy}
                sx={{ borderRadius: 99 }}
              >
                Save Notes
              </Button>

              {canEditProject ? (
                <>
                  <Button
                    variant="text"
                    color="warning"
                    onClick={() => cancelTrip(t)}
                    disabled={cancelled || busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="text"
                    color="error"
                    onClick={() => removeTrip(t)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                </>
              ) : null}
            </Stack>

            {!canEditThis ? (
              <Typography variant="caption" color="text.secondary">
                Techs can operate trips they are assigned to. Admin / Dispatcher / Manager can act on any project trip from this desktop card.
              </Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
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
                  onChange={(e) => setTripModal((m) => ({ ...m, date: e.target.value }))}
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
                  onChange={(e) => setTripModal((m) => ({ ...m, startTime: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  disabled={tripModalBusy || tripModal.timeWindow !== "custom"}
                  fullWidth
                />

                <TextField
                  label="End Time"
                  type="time"
                  value={tripModal.endTime}
                  onChange={(e) => setTripModal((m) => ({ ...m, endTime: e.target.value }))}
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
                        onChange={(e) => setTripModal((m) => ({ ...m, helperUid: e.target.value }))}
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
                </Stack>
              </Paper>

              <TextField
                label="Trip Notes"
                value={tripModal.notes}
                onChange={(e) => setTripModal((m) => ({ ...m, notes: e.target.value }))}
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
            <Button
              variant="contained"
              onClick={saveTripModal}
              disabled={tripModalBusy}
              sx={{ borderRadius: 99, boxShadow: "none" }}
            >
              {tripModalBusy ? "Saving..." : "Save Changes"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={closeoutModal.open}
          onClose={closeoutModal.saving ? undefined : closeCloseoutDialog}
          fullWidth
          maxWidth="md"
          PaperProps={{
            sx: { borderRadius: 4 },
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Finish Project Day
            </Typography>
          </DialogTitle>

          <DialogContent dividers>
            {(() => {
              const t = projectTrips.find((trip) => trip.id === closeoutModal.tripId) || null;
              const stageKey = safeTrim(t?.link?.projectStageKey || "") as StageKey | "";
              const hasStageOption = Boolean(stageKey);

              return (
                <Stack spacing={2.25}>
                  <Alert severity="info" variant="outlined">
                    This saves the project closeout from desktop and updates the trip / project state in one step.
                  </Alert>

                  {t ? (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 4,
                      }}
                    >
                      <Stack spacing={0.5}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          {project?.projectName || "Project"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {stageKey ? stageLabel(stageKey) : "Project Trip"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t.date} • {formatTripWindow(String(t.timeWindow || ""))} • {t.startTime}-{t.endTime}
                        </Typography>
                      </Stack>
                    </Paper>
                  ) : null}

                  <Box>
                    <FormLabel sx={{ mb: 1, display: "block", fontWeight: 700 }}>
                      What are you saving for today?
                    </FormLabel>
                    <RadioGroup
                      value={closeoutModal.outcome}
                      onChange={(e) =>
                        setCloseoutModal((prev) => ({
                          ...prev,
                          outcome: e.target.value as CloseoutOutcome,
                        }))
                      }
                    >
                      <FormControlLabel
                        value="done_today"
                        control={<Radio />}
                        label="Done for today"
                      />
                      {hasStageOption ? (
                        <FormControlLabel
                          value="complete_stage"
                          control={<Radio />}
label={`Complete ${stageKey ? stageLabel(stageKey) : "Stage"}`}                        />
                      ) : null}
                      <FormControlLabel
                        value="complete_project"
                        control={<Radio />}
                        label="Complete entire project"
                      />
                    </RadioGroup>
                  </Box>

                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <FormLabel sx={{ fontWeight: 700 }}>
                        Is more work still needed after today?
                      </FormLabel>
                      <RadioGroup
                        value={closeoutModal.needsMoreWork}
                        onChange={(e) =>
                          setCloseoutModal((prev) => ({
                            ...prev,
                            needsMoreWork: e.target.value as CloseoutNeedsWork,
                          }))
                        }
                      >
                        <FormControlLabel value="no" control={<Radio />} label="No" />
                        <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                      </RadioGroup>
                    </Stack>
                  </Paper>

                  <TextField
                    label="Hours Worked Today"
                    type="number"
                    inputProps={{ min: 0, step: "0.25" }}
                    value={closeoutModal.hoursWorkedToday}
                    onChange={(e) =>
                      setCloseoutModal((prev) => ({
                        ...prev,
                        hoursWorkedToday: e.target.value,
                      }))
                    }
                    fullWidth
                  />

                  <Typography variant="body2" color="text.secondary">
                    These hours are saved with the trip closeout on desktop.
                  </Typography>

                  <TextField
                    label="Work Notes"
                    value={closeoutModal.workNotes}
                    onChange={(e) =>
                      setCloseoutModal((prev) => ({
                        ...prev,
                        workNotes: e.target.value,
                      }))
                    }
                    multiline
                    minRows={4}
                    fullWidth
                  />

                  <TextField
                    label="Materials Used Today"
                    value={closeoutModal.materialsUsedToday}
                    onChange={(e) =>
                      setCloseoutModal((prev) => ({
                        ...prev,
                        materialsUsedToday: e.target.value,
                      }))
                    }
                    multiline
                    minRows={4}
                    fullWidth
                  />

                  <Typography variant="body2" color="text.secondary">
                    Keep materials simple and natural-language. No line items required.
                  </Typography>

                  {closeoutModal.error ? (
                    <Alert severity="error">{closeoutModal.error}</Alert>
                  ) : null}
                </Stack>
              );
            })()}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeCloseoutDialog} disabled={closeoutModal.saving}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              onClick={saveProjectTripCloseout}
              disabled={closeoutModal.saving}
              sx={{ borderRadius: 99, boxShadow: "none" }}
            >
              {closeoutModal.saving ? "Saving..." : "Save Closeout"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={deleteDialogOpen}
          onClose={deleteBusy ? undefined : () => setDeleteDialogOpen(false)}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: { borderRadius: 4 },
          }}
        >
          <DialogTitle sx={{ fontWeight: 800 }}>Delete Project?</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Alert severity="warning">
                This will permanently delete this project, all linked project trips, and its activity log.
                This action cannot be undone.
              </Alert>

              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {project?.projectName || "Untitled Project"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {project?.customerDisplayName || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {project?.serviceAddressLine1 || "No address"}
                </Typography>
              </Box>

              {deleteError ? <Alert severity="error">{deleteError}</Alert> : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={handleDeleteProject}
              disabled={deleteBusy}
              sx={{ borderRadius: 99, boxShadow: "none" }}
            >
              {deleteBusy ? "Deleting..." : "Delete Project"}
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
                          0.06,
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
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        icon={<WorkRoundedIcon />}
                        label={formatProjectType(project.projectType)}
                        variant="filled"
                        color="primary"
                        size="small"
                      />
                      <Chip
                        icon={<PaidRoundedIcon />}
                        label={formatBidStatus(project.bidStatus)}
                        color={statusChipColor(project.bidStatus)}
                        variant="filled"
                        size="small"
                      />
                      <Chip
                        label={project.active ? "Active" : "Inactive"}
                        color={project.active ? "success" : "default"}
                        variant={project.active ? "filled" : "outlined"}
                        size="small"
                      />
                    </Stack>

                    <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -0.4 }}>
                      {project.projectName || "Untitled Project"}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      Project ID:{" "}
                      <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                        {projectId}
                      </Box>
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      component={Link}
                      href="/projects"
                      variant="outlined"
                      startIcon={<ArrowBackRoundedIcon />}
                      sx={{ borderRadius: 99 }}
                    >
                      Back to Projects
                    </Button>

                    {canDeleteProject ? (
                      <Button
                        color="error"
                        variant="outlined"
                        startIcon={<DeleteForeverRoundedIcon />}
                        onClick={() => {
                          setDeleteError("");
                          setDeleteDialogOpen(true);
                        }}
                        sx={{ borderRadius: 99 }}
                      >
                        Delete Project
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>
              </Paper>

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
                <MetricCard label="Customer" value={project.customerDisplayName || "—"} />
                <MetricCard label="Project Type" value={formatProjectType(project.projectType)} />
                <MetricCard label="Bid Status" value={formatBidStatus(project.bidStatus)} />
                <MetricCard label="Total Bid" value={formatCurrency(project.totalBidAmount)} />
              </Box>

              <SectionCard
                title="Project Basics"
                subtitle="Customer, project name, type, description, and active status."
                icon={<InfoRoundedIcon color="primary" />}
                action={
                  canEditProject ? (
                    editingBasics ? (
                      <>
                        <Button
                          variant="text"
                          onClick={() => {
                            resetBasicsDraftFromProject();
                            setBasicsSaveError("");
                            setBasicsSaveSuccess("");
                            setEditingBasics(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="contained"
                          onClick={handleSaveBasicsSection}
                          disabled={basicsSaveBusy}
                          sx={{ borderRadius: 99, boxShadow: "none" }}
                        >
                          {basicsSaveBusy ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : (
                      <IconButton
                        onClick={() => {
                          resetBasicsDraftFromProject();
                          setBasicsSaveError("");
                          setBasicsSaveSuccess("");
                          setEditingBasics(true);
                        }}
                      >
                        <EditRoundedIcon />
                      </IconButton>
                    )
                  ) : null
                }
              >
                <Stack spacing={2}>
                  {customersError ? <Alert severity="error">{customersError}</Alert> : null}
                  {basicsSaveError ? <Alert severity="error">{basicsSaveError}</Alert> : null}
                  {basicsSaveSuccess ? <Alert severity="success">{basicsSaveSuccess}</Alert> : null}

                  {editingBasics ? (
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
                      <Autocomplete
                        options={customers}
                        loading={customersLoading}
                        value={selectedCustomerFromDraft}
                        onChange={(_, value) =>
                          setBasicsDraft((prev) => ({
                            ...prev,
                            customerId: value?.id || "",
                          }))
                        }
                        filterOptions={(options, state) => {
                          const q = state.inputValue.trim().toLowerCase();
                          if (!q) return options.slice(0, 25);
                          return options
                            .filter((opt) =>
                              `${opt.displayName} ${opt.phonePrimary || ""}`
                                .toLowerCase()
                                .includes(q),
                            )
                            .slice(0, 25);
                        }}
                        getOptionLabel={(option) => option.displayName || ""}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Customer / Contractor"
                            placeholder="Search customer by name or phone..."
                          />
                        )}
                      />

                      <TextField
                        label="Project Name"
                        value={basicsDraft.projectName}
                        onChange={(e) =>
                          setBasicsDraft((prev) => ({
                            ...prev,
                            projectName: e.target.value,
                          }))
                        }
                        fullWidth
                      />

                      <TextField
                        select
                        label="Project Type"
                        value={basicsDraft.projectType}
                        onChange={(e) =>
                          setBasicsDraft((prev) => ({
                            ...prev,
                            projectType: e.target.value as EditableProjectType,
                          }))
                        }
                        fullWidth
                      >
                        <MenuItem value="new_construction">New Construction</MenuItem>
                        <MenuItem value="remodel">Remodel</MenuItem>
                        <MenuItem value="time_materials">Time + Materials</MenuItem>
                        <MenuItem value="other">Other</MenuItem>
                      </TextField>

                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={basicsDraft.active}
                              onChange={(e) =>
                                setBasicsDraft((prev) => ({
                                  ...prev,
                                  active: e.target.checked,
                                }))
                              }
                            />
                          }
                          label={basicsDraft.active ? "Project is active" : "Project is inactive"}
                        />
                      </Box>

                      <Box sx={{ gridColumn: { xs: "1 / -1", md: "1 / -1" } }}>
                        <TextField
                          label="Description"
                          value={basicsDraft.description}
                          onChange={(e) =>
                            setBasicsDraft((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          multiline
                          minRows={4}
                          fullWidth
                        />
                      </Box>
                    </Box>
                  ) : (
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
                      <InfoField label="Customer / Contractor" value={project.customerDisplayName || "—"} />
                      <InfoField label="Project Name" value={project.projectName || "—"} />
                      <InfoField label="Project Type" value={formatProjectType(project.projectType)} />
                      <InfoField label="Status" value={project.active ? "Active" : "Inactive"} />
                      <Box sx={{ gridColumn: { xs: "1 / -1", sm: "1 / -1" } }}>
                        <InfoField label="Description" value={project.description || "—"} />
                      </Box>
                    </Box>
                  )}
                </Stack>
              </SectionCard>

              <SectionCard
                title="Job Site & Bid"
                subtitle="Address, bid status, and total bid."
                icon={<HomeWorkRoundedIcon color="primary" />}
                action={
                  canEditProject ? (
                    editingAddressBid ? (
                      <>
                        <Button
                          variant="text"
                          onClick={() => {
                            resetAddressBidDraftFromProject();
                            setAddressBidSaveError("");
                            setAddressBidSaveSuccess("");
                            setEditingAddressBid(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="contained"
                          onClick={handleSaveAddressBidSection}
                          disabled={addressBidSaveBusy}
                          sx={{ borderRadius: 99, boxShadow: "none" }}
                        >
                          {addressBidSaveBusy ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : (
                      <IconButton
                        onClick={() => {
                          resetAddressBidDraftFromProject();
                          setAddressBidSaveError("");
                          setAddressBidSaveSuccess("");
                          setEditingAddressBid(true);
                        }}
                      >
                        <EditRoundedIcon />
                      </IconButton>
                    )
                  ) : null
                }
              >
                <Stack spacing={2}>
                  {addressBidSaveError ? (
                    <Alert severity="error">{addressBidSaveError}</Alert>
                  ) : null}
                  {addressBidSaveSuccess ? (
                    <Alert severity="success">{addressBidSaveSuccess}</Alert>
                  ) : null}

                  {editingAddressBid ? (
                    <>
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
                        <TextField
                          label="Street Address"
                          value={addressBidDraft.serviceAddressLine1}
                          onChange={(e) =>
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceAddressLine1: e.target.value,
                            }))
                          }
                          fullWidth
                        />

                        <TextField
                          label="Address Line 2"
                          value={addressBidDraft.serviceAddressLine2}
                          onChange={(e) =>
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceAddressLine2: e.target.value,
                            }))
                          }
                          fullWidth
                        />

                        <TextField
                          label="City"
                          value={addressBidDraft.serviceCity}
                          onChange={(e) =>
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceCity: e.target.value,
                            }))
                          }
                          fullWidth
                        />

                        <TextField
                          label="State"
                          value={addressBidDraft.serviceState}
                          onChange={(e) =>
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceState: e.target.value,
                            }))
                          }
                          fullWidth
                        />

                        <TextField
                          label="ZIP"
                          value={addressBidDraft.servicePostalCode}
                          onChange={(e) =>
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              servicePostalCode: e.target.value,
                            }))
                          }
                          fullWidth
                        />

                        <FormControl fullWidth>
                          <InputLabel>Bid Status</InputLabel>
                          <Select
                            label="Bid Status"
                            value={addressBidDraft.bidStatus}
                            onChange={(e) =>
                              setAddressBidDraft((prev) => ({
                                ...prev,
                                bidStatus: e.target.value as any,
                              }))
                            }
                            {...selectMenuProps()}
                          >
                            <MenuItem value="draft">Draft</MenuItem>
                            <MenuItem value="submitted">Submitted</MenuItem>
                            <MenuItem value="won">Won</MenuItem>
                            <MenuItem value="lost">Lost</MenuItem>
                          </Select>
                        </FormControl>

                        <TextField
                          label="Total Bid Amount"
                          type="number"
                          inputProps={{ min: 0, step: "0.01" }}
                          value={addressBidDraft.totalBidAmount}
                          onChange={(e) =>
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              totalBidAmount: e.target.value,
                            }))
                          }
                          fullWidth
                        />
                      </Box>

                      <Box
                        sx={{
                          display: "grid",
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: "1fr",
                            md:
                              project.projectType === "time_materials"
                                ? "1fr"
                                : "repeat(3, minmax(0, 1fr))",
                          },
                        }}
                      >
                        {project.projectType !== "time_materials" ? (
                          <>
                            <InfoField
                              label="Rough-In Preview"
                              value={formatCurrency(previewStageAmounts.roughIn)}
                            />
                            <InfoField
                              label="Top-Out / Vent Preview"
                              value={formatCurrency(previewStageAmounts.topOutVent)}
                            />
                            <InfoField
                              label="Trim / Finish Preview"
                              value={formatCurrency(previewStageAmounts.trimFinish)}
                            />
                          </>
                        ) : (
                          <Alert severity="info" variant="outlined">
                            Time + Materials does not use stage billing splits.
                          </Alert>
                        )}
                      </Box>
                    </>
                  ) : (
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
                      <InfoField label="Address 1" value={project.serviceAddressLine1 || "—"} />
                      <InfoField label="Address 2" value={project.serviceAddressLine2 || "—"} />
                      <InfoField
                        label="City / State / ZIP"
                        value={`${project.serviceCity || "—"}, ${project.serviceState || "—"} ${project.servicePostalCode || ""}`}
                      />
                      <InfoField label="Bid Status" value={formatBidStatus(project.bidStatus)} />
                      <InfoField label="Total Bid" value={formatCurrency(project.totalBidAmount)} />
                    </Box>
                  )}
                </Stack>
              </SectionCard>

              <SectionCard
                title="Default Crew & Notes"
                subtitle="Project-level crew defaults and internal notes."
                icon={<GroupRoundedIcon color="primary" />}
                action={
                  canEditProject ? (
                    editingCrewNotes ? (
                      <>
                        <Button
                          variant="text"
                          onClick={() => {
                            resetCrewNotesDraftFromProject();
                            setCrewNotesSaveError("");
                            setCrewNotesSaveSuccess("");
                            setEditingCrewNotes(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="contained"
                          onClick={handleSaveCrewNotesSection}
                          disabled={crewNotesSaveBusy}
                          sx={{ borderRadius: 99, boxShadow: "none" }}
                        >
                          {crewNotesSaveBusy ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : (
                      <IconButton
                        onClick={() => {
                          resetCrewNotesDraftFromProject();
                          setCrewNotesSaveError("");
                          setCrewNotesSaveSuccess("");
                          setEditingCrewNotes(true);
                        }}
                      >
                        <EditRoundedIcon />
                      </IconButton>
                    )
                  ) : null
                }
              >
                <Stack spacing={2}>
                  {techError ? <Alert severity="error">{techError}</Alert> : null}
                  {profilesError ? <Alert severity="error">{profilesError}</Alert> : null}
                  {crewNotesSaveError ? <Alert severity="error">{crewNotesSaveError}</Alert> : null}
                  {crewNotesSaveSuccess ? <Alert severity="success">{crewNotesSaveSuccess}</Alert> : null}

                  {editingCrewNotes ? (
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
                          value={crewNotesDraft.primaryUid}
                          onChange={(e) =>
                            setCrewNotesDraft((prev) => ({
                              ...prev,
                              primaryUid: e.target.value,
                            }))
                          }
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
                            value={crewNotesDraft.helperUid}
                            onChange={(e) =>
                              setCrewNotesDraft((prev) => ({
                                ...prev,
                                helperUid: e.target.value,
                                useDefaultHelper: false,
                              }))
                            }
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
                              checked={crewNotesDraft.useDefaultHelper}
                              onChange={(e) =>
                                setCrewNotesDraft((prev) => ({
                                  ...prev,
                                  useDefaultHelper: e.target.checked,
                                }))
                              }
                            />
                          }
                          label="Use default helper pairing (recommended)"
                        />
                      </Box>

                      <FormControl fullWidth>
                        <InputLabel>Secondary Technician</InputLabel>
                        <Select
                          label="Secondary Technician"
                          value={crewNotesDraft.secondaryUid}
                          onChange={(e) =>
                            setCrewNotesDraft((prev) => ({
                              ...prev,
                              secondaryUid: e.target.value,
                            }))
                          }
                          disabled={!crewNotesDraft.primaryUid}
                          {...selectMenuProps()}
                        >
                          <MenuItem value="">— None —</MenuItem>
                          {technicians
                            .filter((t) => t.uid !== crewNotesDraft.primaryUid)
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
                          value={crewNotesDraft.secondaryHelperUid}
                          onChange={(e) =>
                            setCrewNotesDraft((prev) => ({
                              ...prev,
                              secondaryHelperUid: e.target.value,
                            }))
                          }
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

                      <Box sx={{ gridColumn: { xs: "1 / -1", sm: "1 / -1" } }}>
                        <TextField
                          label="Internal Notes"
                          value={crewNotesDraft.internalNotes}
                          onChange={(e) =>
                            setCrewNotesDraft((prev) => ({
                              ...prev,
                              internalNotes: e.target.value,
                            }))
                          }
                          multiline
                          minRows={4}
                          placeholder="Internal notes for dispatch / admins..."
                          fullWidth
                        />
                      </Box>
                    </Box>
                  ) : (
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
                        label="Primary Tech"
                        value={project.primaryTechnicianName || project.assignedTechnicianName || "Unassigned"}
                      />
                      <InfoField
                        label="Helper"
                        value={(Array.isArray(project.helperNames) ? project.helperNames[0] : "") || "—"}
                      />
                      <InfoField
                        label="Secondary Tech"
                        value={project.secondaryTechnicianName || "—"}
                      />
                      <InfoField
                        label="Secondary Helper"
                        value={(Array.isArray(project.helperNames) ? project.helperNames[1] : "") || "—"}
                      />
                      <Box sx={{ gridColumn: { xs: "1 / -1", sm: "1 / -1" } }}>
                        <InfoField label="Internal Notes" value={project.internalNotes || "—"} />
                      </Box>
                    </Box>
                  )}
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
                          sx={{ borderRadius: 99 }}
                        >
                          Sync Stage Trips
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<EditCalendarRoundedIcon />}
                          onClick={() => openCreateTrip(activeStageTab)}
                          sx={{ borderRadius: 99, boxShadow: "none" }}
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
                    const effHelper = effective.helper ? findHelperName(effective.helper) : "—";
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
                                {stageLabel(activeStageTab)}
                              </Typography>

                              {canEditProject ? (
                                <Button
                                  variant="contained"
                                  onClick={() => handleSaveStageSection(activeStageTab)}
                                  disabled={stageSaveBusy}
                                  sx={{ borderRadius: 99, boxShadow: "none" }}
                                >
                                  {stageSaveBusy ? "Saving..." : "Save Stage"}
                                </Button>
                              ) : null}
                            </Stack>

                            {stageSaveError ? (
                              <Alert severity="error">{stageSaveError}</Alert>
                            ) : null}
                            {stageSaveSuccess ? (
                              <Alert severity="success">{stageSaveSuccess}</Alert>
                            ) : null}

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
                                  Stage Trips
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
                                    sx={{ borderRadius: 99 }}
                                  >
                                    Quick Add Trip
                                  </Button>
                                  <Button
                                    variant="contained"
                                    onClick={() => openCreateTrip(activeStageTab)}
                                    sx={{ borderRadius: 99, boxShadow: "none" }}
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
                                No trips created for this stage yet.
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
                  subtitle="This project type does not use stages. Trips are managed directly here."
                  icon={<RouteRoundedIcon color="primary" />}
                  action={
                    canEditProject ? (
                      <Button
                        variant="contained"
                        onClick={() => openCreateTrip(null)}
                        startIcon={<EditCalendarRoundedIcon />}
                        sx={{ borderRadius: 99, boxShadow: "none" }}
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
                title="Plans / Attachments"
                subtitle="Review existing files, upload more plans later, or remove files from the project."
                icon={<AttachFileRoundedIcon color="primary" />}
                action={
                  canEditProject ? (
                    <>
                      <Button
                        component="label"
                        variant="outlined"
                        startIcon={<AttachFileRoundedIcon />}
                        disabled={attachmentsBusy}
                        sx={{ borderRadius: 99 }}
                      >
                        Add Files
                        <input
                          hidden
                          type="file"
                          multiple
                          onChange={(e) => onPickPlanFiles(e.target.files)}
                        />
                      </Button>
                      <Button
                        variant="contained"
                        onClick={uploadSelectedPlanFiles}
                        disabled={!pendingPlanFiles.length || attachmentsBusy}
                        sx={{ borderRadius: 99, boxShadow: "none" }}
                      >
                        {attachmentsBusy ? "Working..." : "Upload Selected"}
                      </Button>
                    </>
                  ) : (
                    <Chip
                      label={`${existingPlanFiles.length} File${existingPlanFiles.length === 1 ? "" : "s"}`}
                      variant="outlined"
                      size="small"
                    />
                  )
                }
              >
                <Stack spacing={2}>
                  {attachmentsError ? <Alert severity="error">{attachmentsError}</Alert> : null}
                  {attachmentsSuccess ? <Alert severity="success">{attachmentsSuccess}</Alert> : null}
                  {attachmentsStatus ? <Alert severity="info">{attachmentsStatus}</Alert> : null}

                  {pendingPlanFiles.length > 0 ? (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 4,
                        bgcolor: alpha(theme.palette.primary.main, 0.03),
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          Selected to upload
                        </Typography>

                        <Stack spacing={1.25}>
                          {pendingPlanFiles.map((file, index) => (
                            <Card
                              key={`${file.name}-${index}`}
                              sx={{
                                borderRadius: 3,
                                boxShadow: "none",
                                border: `1px solid ${theme.palette.divider}`,
                              }}
                            >
                              <CardContent sx={{ p: 2 }}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1.5}
                                  justifyContent="space-between"
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                >
                                  <Stack direction="row" spacing={1.25} alignItems="center">
                                    <DescriptionRoundedIcon color="action" />
                                    <Box>
                                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                        {file.name}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        {formatFileSize(file.size)} • {file.type || "file"}
                                      </Typography>
                                    </Box>
                                  </Stack>

                                  <Button
                                    variant="outlined"
                                    color="inherit"
                                    startIcon={<DeleteOutlineRoundedIcon />}
                                    onClick={() => removePendingPlanAt(index)}
                                    disabled={attachmentsBusy}
                                    sx={{ borderRadius: 99 }}
                                  >
                                    Remove
                                  </Button>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      </Stack>
                    </Paper>
                  ) : null}

                  {existingPlanFiles.length === 0 ? (
                    <Alert severity="info" variant="outlined">
                      No attachments uploaded yet.
                    </Alert>
                  ) : (
                    <Stack spacing={1.25}>
                      {existingPlanFiles.map((file) => (
                        <Card
                          key={file.path || `${file.name}-${file.uploadedAt}`}
                          sx={{
                            borderRadius: 3,
                            boxShadow: "none",
                            border: `1px solid ${theme.palette.divider}`,
                          }}
                        >
                          <CardContent sx={{ p: 2 }}>
                            <Stack spacing={1.5}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1.5}
                                justifyContent="space-between"
                                alignItems={{ xs: "flex-start", sm: "center" }}
                              >
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                  <DescriptionRoundedIcon color="action" />
                                  <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      {file.name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {formatFileSize(file.size)} •{" "}
                                      {file.contentType || "file"}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Uploaded {formatDateTime(file.uploadedAt)}
                                    </Typography>
                                  </Box>
                                </Stack>

                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Button
                                    component="a"
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    variant="outlined"
                                    startIcon={<OpenInNewRoundedIcon />}
                                    sx={{ borderRadius: 99 }}
                                  >
                                    Open
                                  </Button>

                                  {canEditProject ? (
                                    <Button
                                      variant="outlined"
                                      color="error"
                                      startIcon={<DeleteOutlineRoundedIcon />}
                                      onClick={() => removeExistingPlan(file)}
                                      disabled={attachmentsBusy}
                                      sx={{ borderRadius: 99 }}
                                    >
                                      Remove
                                    </Button>
                                  ) : null}
                                </Stack>
                              </Stack>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </SectionCard>

              <SectionCard
                title="Activity & System"
                subtitle="Project history and metadata live at the bottom of the page."
                icon={<HistoryRoundedIcon color="primary" />}
              >
                <Box
                  sx={{
                    display: "grid",
                    gap: 3,
                    gridTemplateColumns: {
                      xs: "1fr",
                      lg: "minmax(0, 2fr) minmax(300px, 1fr)",
                    },
                  }}
                >
                  <Box>
                    <Stack spacing={2}>
                      {activityLoading ? <Typography>Loading activity...</Typography> : null}
                      {activityError ? <Alert severity="error">{activityError}</Alert> : null}

                      {!activityLoading && !activityError && activityLogs.length === 0 ? (
                        <Alert severity="info" variant="outlined">
                          No activity recorded yet for this project.
                        </Alert>
                      ) : null}

                      {!activityLoading && !activityError && activityLogs.length > 0 ? (
                        <Box
                          sx={{
                            position: "relative",
                            pl: 3.5,
                            "&::before": {
                              content: '""',
                              position: "absolute",
                              left: 13,
                              top: 8,
                              bottom: 8,
                              width: "2px",
                              bgcolor: "divider",
                            },
                          }}
                        >
                          <Stack spacing={2}>
                            {activityLogs.map((entry) => (
                              <Box key={entry.id} sx={{ position: "relative" }}>
                                <Box
                                  sx={{
                                    position: "absolute",
                                    left: -22,
                                    top: 10,
                                    width: 12,
                                    height: 12,
                                    borderRadius: "50%",
                                    bgcolor: (theme) => {
                                      const color = activityTypeColor(entry.type);
                                      if (color === "primary") return theme.palette.primary.main;
                                      if (color === "success") return theme.palette.success.main;
                                      if (color === "warning") return theme.palette.warning.main;
                                      if (color === "error") return theme.palette.error.main;
                                      return theme.palette.text.disabled;
                                    },
                                    boxShadow: `0 0 0 4px ${alpha(theme.palette.background.paper, 1)}`,
                                  }}
                                />

                                <Card
                                  sx={{
                                    borderRadius: 4,
                                    boxShadow: "none",
                                    border: `1px solid ${theme.palette.divider}`,
                                  }}
                                >
                                  <CardContent sx={{ p: 2 }}>
                                    <Stack spacing={1.25}>
                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1}
                                        justifyContent="space-between"
                                        alignItems={{ xs: "flex-start", sm: "center" }}
                                      >
                                        <Box>
                                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                            {entry.title}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            {entry.createdByName || "Unknown user"} •{" "}
                                            {formatDateTime(entry.createdAt)}
                                          </Typography>
                                        </Box>

                                        <Chip
                                          label={activityTypeLabel(entry.type)}
                                          color={activityTypeColor(entry.type)}
                                          variant="outlined"
                                          size="small"
                                        />
                                      </Stack>

                                      {entry.description ? (
                                        <Typography variant="body2" color="text.secondary">
                                          {entry.description}
                                        </Typography>
                                      ) : null}

                                      {entry.details && entry.details.length > 0 ? (
                                        <Stack spacing={0.75}>
                                          {entry.details.map((detail, index) => (
                                            <Typography
                                              key={`${entry.id}-${index}`}
                                              variant="body2"
                                              color="text.secondary"
                                            >
                                              • {detail}
                                            </Typography>
                                          ))}
                                        </Stack>
                                      ) : null}
                                    </Stack>
                                  </CardContent>
                                </Card>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      ) : null}
                    </Stack>
                  </Box>

                  <Stack spacing={2}>
                    <InfoField label="Project ID" value={projectId} />
                    <InfoField label="Active" value={String(project.active)} />
                    <InfoField label="Created At" value={project.createdAt || "—"} />
                    <InfoField label="Updated At" value={project.updatedAt || "—"} />
                    <InfoField label="Customer ID" value={project.customerId || "—"} />
                  </Stack>
                </Box>
              </SectionCard>
            </Stack>
          ) : null}
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}