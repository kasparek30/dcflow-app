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
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grow,
  IconButton,
  InputLabel,
  ListItemIcon,
  MenuItem,
  MenuList,
  Paper,
  Popper,
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
import AccessTimeFilledRoundedIcon from "@mui/icons-material/AccessTimeFilledRounded";
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
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import AddressAutocompleteField from "../../../components/AddressAutocompleteField";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import {
  generatePurchaseOrderForProjectTrip,
  type PurchaseOrderRecord,
} from "../../../src/lib/purchase-orders";
import {
  queueProjectTripTimeEntryWrites,
  upsertProjectTripTimeEntriesForCrew,
} from "../../../src/lib/project-trip-time-entries";
import type { AppUser } from "../../../src/types/app-user";
import type {
  Project,
  ProjectBillingPeriod,
  ProjectOfficeStatus,
  StageStaffing,
} from "../../../src/types/project";
import {
  buildBillingTabLabel,
  createOpenBillingPeriod,
  getCurrentOpenBillingPeriod,
  getEffectiveProjectOfficeStatus,
  getNextBillingSequence,
  getProjectBillingPeriods,
  getProjectBillingSummary,
  getTripCloseoutHours as getTripCloseoutHoursFromBilling,
  getTripMaterialsSummary,
  getUnbilledCompletedTrips,
  isTimeMaterialsProject,
  summarizeBillingPeriodTrips,
} from "../../../src/lib/project-billing";
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
  | "purchase_order_created"
  | "trip_created"
  | "trip_updated"
  | "trip_cancelled"
  | "trip_deleted"
  | "trip_started"
  | "trip_paused"
  | "trip_resumed"
  | "trip_closeout_saved"
  | "trip_labor_resynced"
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

type PauseBlock = {
  startAt: string;
  endAt: string | null;
};

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
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;
  closeout?: any;
  closeoutHours?: number | null;
  materialsUsedToday?: string | null;
  billingPeriodId?: string | null;
  billingPeriodSequence?: number | null;
  billingPeriodLabel?: string | null;
  billingPeriodStatus?: string | null;
  readyToBillAt?: string | null;
  invoicedAt?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

type PurchaseOrderAttachment = {
  id?: string;
  filename?: string;
  contentType?: string;
  size?: number;
  storagePath?: string;
  downloadUrl?: string;
  uploadedAt?: string;
  parsedInvoice?: any;
  extractedMeta?: Record<string, unknown> | null;
};

type ProjectPurchaseOrder = PurchaseOrderRecord & {
  matchedAttachments?: PurchaseOrderAttachment[];
  invoiceAttachmentCount?: number | null;
  invoicePdfAttachmentCount?: number | null;
  parsedInvoiceNumber?: string | null;
  parsedInvoiceTotal?: number | null;
  parsedLineItems?: any[];
  importedMaterialCount?: number;
  supplierMaterialsImportedAt?: string | null;
  invoiceEmailSubject?: string | null;
  invoiceEmailFrom?: string | null;
  invoiceEmailMatchedAt?: string | null;
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

type ProjectOfficeDialogState = {
  open: boolean;
  nextStatus: ProjectOfficeStatus | null;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceNotes: string;
  reopenReason: string;
  saving: boolean;
  error: string;
};

type TmInvoiceDialogState = {
  open: boolean;
  periodId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceNotes: string;
  saving: boolean;
  error: string;
};

type StageBillingAction = "ready_to_bill" | "invoiced" | "reopen";

type StageBillingDialogState = {
  open: boolean;
  stageKey: StageKey | null;
  action: StageBillingAction | null;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceNotes: string;
  saving: boolean;
  error: string;
};

type BasicsDraft = {
  customerId: string;
  projectName: string;
  projectType: EditableProjectType;
  description: string;
  active: boolean;
  bidStatus: "draft" | "submitted" | "won" | "lost";
  totalBidAmount: string;
};

type AddressBidDraft = {
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string;
};

type GoogleAddressSelectionLike = {
  placeId?: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  source?: string;
};

type CrewNotesDraft = {
  primaryUid: string;
  secondaryUid: string;
  helperUid: string;
  secondaryHelperUid: string;
  useDefaultHelper: boolean;
  internalNotes: string;
};

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const cleanedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefinedDeep(v)]);

    return Object.fromEntries(cleanedEntries) as T;
  }

  return value;
}

function formatBillingPeriodStatus(status?: ProjectBillingPeriod["status"] | null) {
  if (status === "invoiced") return "Invoiced";
  if (status === "ready_to_bill") return "Ready to Bill";
  return "Open";
}

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

function emptyProjectOfficeDialog(): ProjectOfficeDialogState {
  return {
    open: false,
    nextStatus: null,
    invoiceNumber: "",
    invoiceDate: toIsoDate(new Date()),
    invoiceNotes: "",
    reopenReason: "",
    saving: false,
    error: "",
  };
}

function emptyTmInvoiceDialog(): TmInvoiceDialogState {
  return {
    open: false,
    periodId: null,
    invoiceNumber: "",
    invoiceDate: toIsoDate(new Date()),
    invoiceNotes: "",
    saving: false,
    error: "",
  };
}

function emptyStageBillingDialog(): StageBillingDialogState {
  return {
    open: false,
    stageKey: null,
    action: null,
    invoiceNumber: "",
    invoiceDate: toIsoDate(new Date()),
    invoiceNotes: "",
    saving: false,
    error: "",
  };
}

function getProjectOfficeStatus(project?: Project | null): ProjectOfficeStatus {
  const raw = safeTrim((project as any)?.projectOfficeStatus) as ProjectOfficeStatus;
  if (
    raw === "active_work" ||
    raw === "field_complete" ||
    raw === "ready_to_invoice" ||
    raw === "invoiced" ||
    raw === "closed"
  ) {
    return raw;
  }
  return "active_work";
}

function isProjectOfficeLocked(project?: Project | null) {
  const status = getProjectOfficeStatus(project);
  return status === "invoiced" || status === "closed";
}

function formatProjectOfficeStatus(status: ProjectOfficeStatus) {
  switch (status) {
    case "field_complete":
      return "Field Complete";
    case "ready_to_invoice":
      return "Ready to Invoice";
    case "invoiced":
      return "Invoiced";
    case "closed":
      return "Closed";
    case "active_work":
    default:
      return "Active Work";
  }
}

function projectOfficeStatusColor(
  status: ProjectOfficeStatus,
): "default" | "primary" | "success" | "warning" | "info" {
  switch (status) {
    case "field_complete":
      return "info";
    case "ready_to_invoice":
      return "warning";
    case "invoiced":
    case "closed":
      return "success";
    case "active_work":
    default:
      return "primary";
  }
}

function projectOfficeStatusHelper(status: ProjectOfficeStatus) {
  switch (status) {
    case "field_complete":
      return "Field work is marked complete. Office review is next.";
    case "ready_to_invoice":
      return "Office review is complete. This project is ready for final billing.";
    case "invoiced":
      return "Final invoice has been recorded. Project is locked for history unless reopened.";
    case "closed":
      return "Project is fully closed and historical.";
    case "active_work":
    default:
      return "Project is still open for field work, scheduling, and closeouts.";
  }
}

function projectOfficeStatusActionLabel(status: ProjectOfficeStatus) {
  switch (status) {
    case "field_complete":
      return "Mark Field Complete";
    case "ready_to_invoice":
      return "Mark Ready to Invoice";
    case "invoiced":
      return "Mark Invoiced";
    case "closed":
      return "Mark Closed";
    case "active_work":
    default:
      return "Reopen Active Work";
  }
}

function projectOfficeStatusDialogTitle(status?: ProjectOfficeStatus | null) {
  if (!status) return "Update Project Status";
  return projectOfficeStatusActionLabel(status);
}

function parseIsoMs(value?: string | null) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

function minutesBetweenMs(aMs: number, bMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.max(0, Math.round((bMs - aMs) / 60000));
}

function sumPausedMinutes(pauseBlocks?: PauseBlock[] | null, referenceEndMs?: number) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return 0;
  const endMs = Number.isFinite(referenceEndMs) ? Number(referenceEndMs) : Date.now();
  return pauseBlocks.reduce((sum, block) => {
    const startMs = parseIsoMs(block?.startAt || null);
    const stopMs = block?.endAt ? parseIsoMs(block.endAt) : endMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) return sum;
    return sum + minutesBetweenMs(startMs, stopMs);
  }, 0);
}

function getTimerDrivenHoursForTrip(t?: TripDoc | null) {
  if (!t) return null;
  const startMs = parseIsoMs(t.actualStartAt || t.startedAt || null);
  const endMs = parseIsoMs(t.actualEndAt || t.completedAt || null);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const grossMinutes = minutesBetweenMs(startMs, endMs);
  const pausedMinutes = sumPausedMinutes(t.pauseBlocks || null, endMs);
  const liveMinutes = Math.max(0, grossMinutes - pausedMinutes);
  if (liveMinutes <= 0) return null;
  return (Math.round((liveMinutes / 60) * 4) / 4).toFixed(2);
}

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

function safeTrim(x: any) {
  return String(x || "").trim();
}

function buildInlineAddress(
  line1?: string,
  line2?: string,
  city?: string,
  state?: string,
  postal?: string,
) {
  return [line1, line2, city, state, postal]
    .map((x) => safeTrim(x))
    .filter(Boolean)
    .join(", ");
}

function buildCityStatePostalLine(city?: string, state?: string, postal?: string) {
  const statePostal = [safeTrim(state), safeTrim(postal)].filter(Boolean).join(" ");
  return [safeTrim(city), statePostal].filter(Boolean).join(", ");
}

function buildGoogleMapsEmbedSrc(address: string, apiKey: string) {
  const cleanAddress = safeTrim(address);
  const cleanKey = safeTrim(apiKey);
  if (!cleanAddress || !cleanKey) return "";

  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
    cleanKey,
  )}&q=${encodeURIComponent(cleanAddress)}&zoom=17&maptype=satellite`;
}

function buildGoogleMapsSearchUrl(address: string) {
  const cleanAddress = safeTrim(address);
  if (!cleanAddress) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddress)}`;
}

function buildAppleMapsSearchUrl(address: string) {
  const cleanAddress = safeTrim(address);
  if (!cleanAddress) return "";
  return `https://maps.apple.com/?q=${encodeURIComponent(cleanAddress)}`;
}

function prefersAppleMaps() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOS || isTouchMac;
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

function getStageBillingStatus(stage?: any): "not_ready" | "ready_to_bill" | "invoiced" {
  const raw = safeTrim(stage?.billingStatus).toLowerCase();
  if (raw === "invoiced") return "invoiced";
  if (raw === "ready_to_bill") return "ready_to_bill";
  if (stage?.billed === true) return "invoiced";
  return "not_ready";
}

function formatStageBillingStatus(status: "not_ready" | "ready_to_bill" | "invoiced") {
  if (status === "invoiced") return "Invoiced";
  if (status === "ready_to_bill") return "Ready to Bill";
  return "Not Ready";
}

function stageBillingStatusColor(
  status: "not_ready" | "ready_to_bill" | "invoiced",
): "default" | "success" | "warning" {
  if (status === "invoiced") return "success";
  if (status === "ready_to_bill") return "warning";
  return "default";
}

function getStageBillingMeta(projectType?: string | null, stageKey?: StageKey | null) {
  const type = safeTrim(projectType).toLowerCase();

  if (type === "new_construction") {
    if (stageKey === "roughIn") return { sequence: 1, total: 3, percent: 25, label: "Billing 1" };
    if (stageKey === "topOutVent") return { sequence: 2, total: 3, percent: 50, label: "Billing 2" };
    if (stageKey === "trimFinish") return { sequence: 3, total: 3, percent: 25, label: "Billing 3" };
  }

  if (type === "remodel") {
    if (stageKey === "roughIn") return { sequence: 1, total: 2, percent: 50, label: "Billing 1" };
    if (stageKey === "trimFinish") return { sequence: 2, total: 2, percent: 50, label: "Billing 2" };
  }

  return { sequence: 0, total: 0, percent: 0, label: "Stage Billing" };
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

function formatTripDate(dateIso?: string | null) {
  const raw = safeTrim(dateIso);
  if (!raw) return "No date";

  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? fromIsoDate(raw) : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday} • ${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
}

function formatTripScheduleLine(t: TripDoc) {
  return `${formatTripDate(t.date)} • ${formatTripWindow(String(t.timeWindow || "all_day"))} • ${t.startTime || "--:--"}–${t.endTime || "--:--"}`;
}

function formatPoStatus(status?: string | null) {
  const s = safeTrim(status).toLowerCase();
  if (s === "matched") return "Matched";
  if (s === "cancelled") return "Cancelled";
  if (s === "closed") return "Closed";
  return "Open";
}

function poStatusColor(
  status?: string | null,
): "default" | "primary" | "success" | "warning" | "error" {
  const s = safeTrim(status).toLowerCase();
  if (s === "matched") return "success";
  if (s === "open") return "primary";
  if (s === "cancelled") return "error";
  if (s === "closed") return "default";
  return "default";
}

function getPoMatchedAttachments(po?: ProjectPurchaseOrder | null) {
  return Array.isArray(po?.matchedAttachments) ? po.matchedAttachments : [];
}

function getLatestPoAttachment(po?: ProjectPurchaseOrder | null) {
  const attachments = getPoMatchedAttachments(po);
  return attachments[attachments.length - 1] || null;
}

function formatPoTripContext(po: ProjectPurchaseOrder) {
  if (po.projectStageKey === "roughIn") return "Rough-In";
  if (po.projectStageKey === "topOutVent") return "Top-Out / Vent";
  if (po.projectStageKey === "trimFinish") return "Trim / Finish";
  if (po.billingPeriodLabel) return po.billingPeriodLabel;
  return "Project Trip";
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
    case "trip_labor_resynced":
      return "success";
    case "attachment_removed":
    case "trip_paused":
    case "trip_cancelled":
      return "warning";
    case "purchase_order_created":
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
    case "purchase_order_created":
      return "Purchase Order Created";
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
    case "trip_labor_resynced":
      return "Labor Resynced";
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
        borderRadius: 1,
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
        borderRadius: 1,
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
        borderRadius: 1,
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

function CloseoutDetailBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 4,
        height: "100%",
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.025),
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
              color: "primary.main",
              flex: "0 0 auto",
            }}
          >
            {icon}
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {title}
          </Typography>
        </Stack>
        {children}
      </Stack>
    </Paper>
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

  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(true);
  const [purchaseOrdersError, setPurchaseOrdersError] = useState("");
  const [purchaseOrders, setPurchaseOrders] = useState<ProjectPurchaseOrder[]>([]);
  const [poActionBusyTripId, setPoActionBusyTripId] = useState<string | null>(null);
  const [poActionError, setPoActionError] = useState("");
  const [poActionSuccess, setPoActionSuccess] = useState("");

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
  const [closeoutDetailsTripId, setCloseoutDetailsTripId] = useState<string | null>(null);
  const [projectOfficeDialog, setProjectOfficeDialog] = useState<ProjectOfficeDialogState>(emptyProjectOfficeDialog());
  const [tmInvoiceDialog, setTmInvoiceDialog] = useState<TmInvoiceDialogState>(emptyTmInvoiceDialog());
  const [stageBillingDialog, setStageBillingDialog] = useState<StageBillingDialogState>(emptyStageBillingDialog());
  const [activeTmBillingTab, setActiveTmBillingTab] = useState<string>("current");
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
    bidStatus: "draft",
    totalBidAmount: "0",
  });

  const [addressBidDraft, setAddressBidDraft] = useState<AddressBidDraft>({
    serviceAddressLine1: "",
    serviceAddressLine2: "",
    serviceCity: "",
    serviceState: "TX",
    servicePostalCode: "",
  });
  const [projectAddressSearch, setProjectAddressSearch] = useState("");
  const [projectAddressSource, setProjectAddressSource] = useState<string>("manual");

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

  const isTmProject = isTimeMaterialsProject(project?.projectType);
  const projectOfficeStatus = useMemo(
    () => getEffectiveProjectOfficeStatus(project, projectTrips),
    [project, projectTrips],
  );
  const projectOfficeLocked = projectOfficeStatus === "invoiced" || projectOfficeStatus === "closed";
  const projectFieldWorkLocked = projectOfficeLocked || projectOfficeStatus === "field_complete";
  const projectHasStageBilling = getEnabledStages(project?.projectType || "").length > 0;
  const stagedProjectBillingComplete =
    projectHasStageBilling &&
    getEnabledStages(project?.projectType || "").every((stageKey) =>
      getStageBillingStatus((project as any)?.[stageKey]) === "invoiced",
    );
const canUpdateProjectOfficeStatus = canEditProject && !isTmProject && !projectHasStageBilling;
const canCloseProject = canEditProject && (projectOfficeStatus === "invoiced" || stagedProjectBillingComplete);
const canReopenClosedProject = canEditProject && projectOfficeStatus === "closed";

const canMarkTmReadyToBill =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "technician";
  const canMarkTmFieldComplete = canMarkTmReadyToBill;
  const canInvoiceTmPeriods = canEditProject;

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

  const purchaseOrdersByTrip = useMemo(() => {
  const map = new Map<string, ProjectPurchaseOrder[]>();

  for (const po of purchaseOrders) {
    const tripId = safeTrim(po.tripId);
    if (!tripId) continue;

    const existing = map.get(tripId) || [];
    existing.push(po);
    map.set(tripId, existing);
  }

  for (const [, items] of map) {
    items.sort((a, b) =>
      `${a.createdAt || ""}_${a.poCode}`.localeCompare(`${b.createdAt || ""}_${b.poCode}`),
    );
  }

  return map;
}, [purchaseOrders]);

  const projectPoPrefixPreview = useMemo(() => {
    if (isTmProject) return "T";
    return "P";
  }, [isTmProject]);

  const projectBillingSummary = useMemo(() => {
    const summary = getProjectBillingSummary(projectTrips, project);
    const completedTrips = projectTrips.filter(
      (trip) => String(trip.status || "").toLowerCase() === "complete" && trip.active !== false,
    );

    const needsTimeEntryReview = completedTrips.some((trip) => {
      const closeout = (trip.closeout || {}) as any;
      return safeTrim(closeout.timeEntrySyncStatus) !== "synced";
    });

    return {
      ...summary,
      needsTimeEntryReview,
    };
  }, [projectTrips, project]);

  const tmBillingPeriods = useMemo(() => getProjectBillingPeriods(project), [project]);
  const currentOpenTmPeriod = useMemo(() => getCurrentOpenBillingPeriod(project), [project]);
  const unbilledCompletedTmTrips = useMemo<TripDoc[]>(
    () =>
      isTmProject
        ? projectTrips.filter((trip) => {
            const status = String(trip.status || "").toLowerCase();
            if (status !== "complete") return false;
            if (trip.active === false) return false;
            if (safeTrim(trip.billingPeriodId)) return false;
            return true;
          })
        : [],
    [isTmProject, projectTrips],
  );

  const tmBillingTabs = useMemo(() => {
    if (!isTmProject) return [] as Array<{
      key: string;
      label: string;
      period: ProjectBillingPeriod | null;
      trips: TripDoc[];
      summary: ReturnType<typeof summarizeBillingPeriodTrips>;
      isCurrentOpen: boolean;
    }>;

    const frozenTabs = tmBillingPeriods
      .filter((period) => period.status !== "open")
      .map((period) => {
        const periodTrips = projectTrips.filter((trip) => safeTrim(trip.billingPeriodId) === period.id);
        return {
          key: period.id,
          label: buildBillingTabLabel(period, false),
          period,
          trips: periodTrips,
          summary: summarizeBillingPeriodTrips(periodTrips),
          isCurrentOpen: false,
        };
      });

    const shouldShowCurrentPeriod =
      projectOfficeStatus !== "invoiced" && projectOfficeStatus !== "closed";

    if (!shouldShowCurrentPeriod) {
      return frozenTabs;
    }

    const currentTrips = unbilledCompletedTmTrips;
    return [
      {
        key: "current",
        label: "Current Period",
        period: currentOpenTmPeriod,
        trips: currentTrips,
        summary: summarizeBillingPeriodTrips(currentTrips),
        isCurrentOpen: true,
      },
      ...frozenTabs,
    ];
  }, [isTmProject, tmBillingPeriods, currentOpenTmPeriod, unbilledCompletedTmTrips, projectTrips, projectOfficeStatus]);

  const activeTmBillingTabData = useMemo(() => {
    if (!tmBillingTabs.length) return null;
    return tmBillingTabs.find((tab) => tab.key === activeTmBillingTab) || tmBillingTabs[0];
  }, [tmBillingTabs, activeTmBillingTab]);

  useEffect(() => {
    if (!tmBillingTabs.length) return;
    if (!tmBillingTabs.some((tab) => tab.key === activeTmBillingTab)) {
      setActiveTmBillingTab(tmBillingTabs[0].key);
    }
  }, [tmBillingTabs, activeTmBillingTab]);

  const closeoutDetailsTrip = useMemo(() => {
    if (!closeoutDetailsTripId) return null;
    return projectTrips.find((trip) => trip.id === closeoutDetailsTripId) || null;
  }, [closeoutDetailsTripId, projectTrips]);

  const previewStageAmounts = useMemo(() => {
    return buildStageBilledAmounts(
      (editingBasics
        ? basicsDraft.projectType
        : (project?.projectType as EditableProjectType)) || "new_construction",
      Number(editingBasics ? basicsDraft.totalBidAmount : project?.totalBidAmount || 0),
    );
  }, [editingBasics, basicsDraft.projectType, basicsDraft.totalBidAmount, project?.projectType, project?.totalBidAmount]);

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const locationPreviewLine1 = editingAddressBid
    ? safeTrim(addressBidDraft.serviceAddressLine1)
    : safeTrim(project?.serviceAddressLine1);
  const locationPreviewLine2 = editingAddressBid
    ? safeTrim(addressBidDraft.serviceAddressLine2)
    : safeTrim(project?.serviceAddressLine2);
  const locationPreviewCity = editingAddressBid
    ? safeTrim(addressBidDraft.serviceCity)
    : safeTrim(project?.serviceCity);
  const locationPreviewState = editingAddressBid
    ? safeTrim(addressBidDraft.serviceState)
    : safeTrim(project?.serviceState);
  const locationPreviewPostalCode = editingAddressBid
    ? safeTrim(addressBidDraft.servicePostalCode)
    : safeTrim(project?.servicePostalCode);

  const locationPreviewAddress = useMemo(
    () =>
      buildInlineAddress(
        locationPreviewLine1,
        locationPreviewLine2,
        locationPreviewCity,
        locationPreviewState,
        locationPreviewPostalCode,
      ),
    [
      locationPreviewLine1,
      locationPreviewLine2,
      locationPreviewCity,
      locationPreviewState,
      locationPreviewPostalCode,
    ],
  );

  const locationPreviewCityStatePostal = useMemo(
    () => buildCityStatePostalLine(locationPreviewCity, locationPreviewState, locationPreviewPostalCode),
    [locationPreviewCity, locationPreviewState, locationPreviewPostalCode],
  );

  const locationPreviewEmbedSrc = useMemo(
    () => buildGoogleMapsEmbedSrc(locationPreviewAddress, googleMapsApiKey),
    [locationPreviewAddress, googleMapsApiKey],
  );

  const locationPreviewGoogleMapsUrl = useMemo(
    () => buildGoogleMapsSearchUrl(locationPreviewAddress),
    [locationPreviewAddress],
  );

  function openLocationInPreferredMaps() {
    const targetUrl = prefersAppleMaps()
      ? buildAppleMapsSearchUrl(locationPreviewAddress)
      : locationPreviewGoogleMapsUrl;

    if (!targetUrl || typeof window === "undefined") return;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

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

  function canCurrentUserViewTrip(t: TripDoc) {
    if (canEditProject) return true;
    if (!isFieldRole) return false;
    return Boolean(myUid) && isUidOnTripCrew(myUid, t.crew || null);
  }

  function getProjectStage(stageKey?: StageKey | null) {
    if (!project || !stageKey) return null;
    if (stageKey === "roughIn") return project.roughIn;
    if (stageKey === "topOutVent") return project.topOutVent;
    return project.trimFinish;
  }

  function getProjectStageBillingStatus(stageKey?: StageKey | null) {
    return getStageBillingStatus(getProjectStage(stageKey));
  }

  function isFrozenStageBilling(stageKey?: StageKey | null) {
    if (!projectHasStageBilling || !stageKey) return false;
    const status = getProjectStageBillingStatus(stageKey);
    return status === "ready_to_bill" || status === "invoiced";
  }

  function isFrozenTmBillingTrip(t: TripDoc) {
    if (!isTmProject) return false;
    const status = safeTrim(t.billingPeriodStatus).toLowerCase();
    return status === "ready_to_bill" || status === "invoiced";
  }

  function isFrozenStageBillingTrip(t: TripDoc) {
    const stageKey = safeTrim(t.link?.projectStageKey || "") as StageKey | "";
    return Boolean(stageKey) && isFrozenStageBilling(stageKey as StageKey);
  }

  function isFrozenProjectBillingTrip(t: TripDoc) {
    return isFrozenTmBillingTrip(t) || isFrozenStageBillingTrip(t);
  }

  function canCurrentUserEditTrip(t: TripDoc) {
    if (projectFieldWorkLocked || isFrozenProjectBillingTrip(t)) return false;
    if (canEditProject) return true;
    if (String(t.status || "").toLowerCase() === "complete") return false;
    if (!isFieldRole) return false;
    return Boolean(myUid) && isUidOnTripCrew(myUid, t.crew || null);
  }

  function canCurrentUserOperateTrip(t: TripDoc) {
    if (projectFieldWorkLocked || isFrozenProjectBillingTrip(t)) return false;
    if (canEditProject) return true;
    if (String(t.status || "").toLowerCase() === "complete") return false;
    if (!isFieldRole) return false;
    return Boolean(myUid) && isUidOnTripCrew(myUid, t.crew || null);
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
      bidStatus: p.bidStatus || "draft",
      totalBidAmount: String(Number(p.totalBidAmount ?? 0)),
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
    });

    setProjectAddressSearch(
      buildInlineAddress(
        p.serviceAddressLine1,
        p.serviceAddressLine2,
        p.serviceCity,
        p.serviceState,
        p.servicePostalCode,
      ),
    );
    setProjectAddressSource(safeTrim((p as any)?.serviceAddressSource) || "manual");
  }

  function markProjectAddressManual() {
    setProjectAddressSource((current) =>
      current === "google_places" ? "manual" : current,
    );
  }

  function handleProjectGoogleAddressSelected(selection: GoogleAddressSelectionLike) {
    setProjectAddressSearch(selection.formattedAddress || "");
    setAddressBidDraft((prev) => ({
      ...prev,
      serviceAddressLine1: selection.addressLine1 || "",
      serviceAddressLine2: selection.addressLine2 || "",
      serviceCity: selection.city || "",
      serviceState: selection.state || "",
      servicePostalCode: selection.postalCode || "",
    }));
    setProjectAddressSource("google_places");
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
          projectOfficeStatus: data.projectOfficeStatus ?? undefined,
          billingPeriods: Array.isArray(data.billingPeriods) ? data.billingPeriods : undefined,
          currentBillingPeriodId: data.currentBillingPeriodId ?? undefined,
          fieldCompletedAt: data.fieldCompletedAt ?? undefined,
          fieldCompletedByUid: data.fieldCompletedByUid ?? undefined,
          fieldCompletedByName: data.fieldCompletedByName ?? undefined,
          readyToInvoiceAt: data.readyToInvoiceAt ?? undefined,
          readyToInvoiceByUid: data.readyToInvoiceByUid ?? undefined,
          readyToInvoiceByName: data.readyToInvoiceByName ?? undefined,
          invoicedAt: data.invoicedAt ?? undefined,
          invoicedByUid: data.invoicedByUid ?? undefined,
          invoicedByName: data.invoicedByName ?? undefined,
          invoiceNumber: data.invoiceNumber ?? undefined,
          invoiceDate: data.invoiceDate ?? undefined,
          invoiceNotes: data.invoiceNotes ?? undefined,
          closedAt: data.closedAt ?? undefined,
          closedByUid: data.closedByUid ?? undefined,
          closedByName: data.closedByName ?? undefined,
          reopenedAt: data.reopenedAt ?? undefined,
          reopenedByUid: data.reopenedByUid ?? undefined,
          reopenedByName: data.reopenedByName ?? undefined,
          reopenReason: data.reopenReason ?? undefined,
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
            startedAt: d.startedAt ?? d.actualStartAt ?? null,
            pausedAt: d.pausedAt ?? null,
            completedAt: d.completedAt ?? null,
            actualStartAt: d.actualStartAt ?? d.startedAt ?? null,
            actualEndAt: d.actualEndAt ?? d.completedAt ?? null,
            pauseBlocks: Array.isArray(d.pauseBlocks) ? d.pauseBlocks : null,
            closeout: d.closeout ?? null,
            closeoutHours: typeof d.closeoutHours === "number" ? d.closeoutHours : null,
            materialsUsedToday: d.materialsUsedToday ?? d.materialsSummary ?? null,
            billingPeriodId: d.billingPeriodId ?? null,
            billingPeriodSequence:
              typeof d.billingPeriodSequence === "number" ? d.billingPeriodSequence : null,
            billingPeriodLabel: d.billingPeriodLabel ?? null,
            billingPeriodStatus: d.billingPeriodStatus ?? null,
            readyToBillAt: d.readyToBillAt ?? null,
            invoicedAt: d.invoicedAt ?? null,
            invoiceNumber: d.invoiceNumber ?? null,
            invoiceDate: d.invoiceDate ?? null,
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

    async function loadProjectPurchaseOrders() {
      setPurchaseOrdersLoading(true);
      setPurchaseOrdersError("");

      try {
        const snap = await getDocs(
          query(collection(db, "purchaseOrders"), where("projectId", "==", projectId)),
        );

        const items: ProjectPurchaseOrder[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            ...(data as PurchaseOrderRecord),
            poCode: data.poCode || docSnap.id,
            matchedAttachments: Array.isArray(data.matchedAttachments)
              ? data.matchedAttachments
              : [],
            invoiceAttachmentCount:
              typeof data.invoiceAttachmentCount === "number"
                ? data.invoiceAttachmentCount
                : null,
            invoicePdfAttachmentCount:
              typeof data.invoicePdfAttachmentCount === "number"
                ? data.invoicePdfAttachmentCount
                : null,
            parsedInvoiceNumber: data.parsedInvoiceNumber ?? null,
            parsedInvoiceTotal:
              typeof data.parsedInvoiceTotal === "number"
                ? data.parsedInvoiceTotal
                : null,
            parsedLineItems: Array.isArray(data.parsedLineItems)
              ? data.parsedLineItems
              : [],
            importedMaterialCount:
              typeof data.importedMaterialCount === "number"
                ? data.importedMaterialCount
                : 0,
            supplierMaterialsImportedAt: data.supplierMaterialsImportedAt ?? null,
            invoiceEmailSubject: data.invoiceEmailSubject ?? null,
            invoiceEmailFrom: data.invoiceEmailFrom ?? null,
            invoiceEmailMatchedAt: data.invoiceEmailMatchedAt ?? null,
          } as ProjectPurchaseOrder;
        });

        items.sort((a, b) =>
          `${b.createdAt || ""}_${b.poCode}`.localeCompare(`${a.createdAt || ""}_${a.poCode}`),
        );

        setPurchaseOrders(items);
      } catch (err: any) {
        setPurchaseOrdersError(err?.message || "Failed to load project purchase orders.");
      } finally {
        setPurchaseOrdersLoading(false);
      }
    }

    loadProjectPurchaseOrders();
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
      const totalBid = Number(basicsDraft.totalBidAmount) || 0;
      const nextRoughIn = {
        ...(project.roughIn as any),
        billedAmount: previewStageAmounts.roughIn,
      };
      const nextTopOutVent = {
        ...(project.topOutVent as any),
        billedAmount: previewStageAmounts.topOutVent,
      };
      const nextTrimFinish = {
        ...(project.trimFinish as any),
        billedAmount: previewStageAmounts.trimFinish,
      };

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
      if (project.bidStatus !== basicsDraft.bidStatus) {
        details.push(
          `Bid status: ${formatBidStatus(project.bidStatus)} → ${formatBidStatus(basicsDraft.bidStatus)}`,
        );
      }
      if (Number(project.totalBidAmount || 0) !== totalBid) {
        details.push(
          `Total bid: ${formatCurrency(project.totalBidAmount)} → ${formatCurrency(totalBid)}`,
        );
      }

      await updateDoc(doc(db, "projects", project.id), {
        customerId: basicsDraft.customerId.trim(),
        customerDisplayName:
          selectedCustomerRecord?.displayName || project.customerDisplayName || null,
        projectName: basicsDraft.projectName.trim(),
        projectType: basicsDraft.projectType,
        description: basicsDraft.description.trim() || null,
        active: basicsDraft.active,
        bidStatus: basicsDraft.bidStatus,
        totalBidAmount: totalBid,
        roughIn: nextRoughIn,
        topOutVent: nextTopOutVent,
        trimFinish: nextTrimFinish,
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
        bidStatus: basicsDraft.bidStatus,
        totalBidAmount: totalBid,
        roughIn: nextRoughIn,
        topOutVent: nextTopOutVent,
        trimFinish: nextTrimFinish,
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
      setBasicsSaveSuccess("✅ Project basics and bid saved.");
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

      await updateDoc(doc(db, "projects", project.id), {
        serviceAddressLabel: null,
        serviceAddressLine1: addressBidDraft.serviceAddressLine1.trim(),
        serviceAddressLine2: addressBidDraft.serviceAddressLine2.trim() || null,
        serviceCity: addressBidDraft.serviceCity.trim(),
        serviceState: addressBidDraft.serviceState.trim().toUpperCase(),
        servicePostalCode: addressBidDraft.servicePostalCode.trim(),
        serviceAddressSource: projectAddressSource || null,
        updatedAt: now,
      });

      mergeProjectState({
        serviceAddressLabel: undefined,
        serviceAddressLine1: addressBidDraft.serviceAddressLine1.trim(),
        serviceAddressLine2: addressBidDraft.serviceAddressLine2.trim() || undefined,
        serviceCity: addressBidDraft.serviceCity.trim(),
        serviceState: addressBidDraft.serviceState.trim().toUpperCase(),
        servicePostalCode: addressBidDraft.servicePostalCode.trim(),
        serviceAddressSource: projectAddressSource || undefined,
        updatedAt: now,
      });

      if (details.length > 0) {
        void recordProjectActivity({
          type: "project_updated",
          title: "Job site updated",
          description: `${details.length} change${details.length === 1 ? "" : "s"} saved.`,
          details,
        });
      }

      setEditingAddressBid(false);
      setAddressBidSaveSuccess("✅ Job site saved.");
    } catch (err: unknown) {
      setAddressBidSaveError(
        err instanceof Error ? err.message : "Failed to save job site.",
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
    if (projectFieldWorkLocked) {
      alert("This project is field-complete, invoiced, or closed. Reopen active work before scheduling or changing trips.");
      return;
    }
    if (isFrozenStageBilling(stageKey)) {
      alert(`${stageLabel(stageKey)} is already ready to bill or invoiced. Reopen that stage billing before scheduling or changing trips.`);
      return;
    }
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
          startedAt: d.startedAt ?? d.actualStartAt ?? null,
          pausedAt: d.pausedAt ?? null,
          completedAt: d.completedAt ?? null,
          closeout: d.closeout ?? null,
          closeoutHours: typeof d.closeoutHours === "number" ? d.closeoutHours : null,
          materialsUsedToday: d.materialsUsedToday ?? d.materialsSummary ?? null,
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
    if (projectFieldWorkLocked) {
      alert("This project is field-complete, invoiced, or closed. Reopen active work before scheduling or changing trips.");
      return;
    }
    if (isFrozenStageBilling(stageKey)) {
      alert(`${stageLabel(stageKey)} is already ready to bill or invoiced. Reopen that stage billing before scheduling or changing trips.`);
      return;
    }
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
    if (projectFieldWorkLocked) {
      alert("This project is field-complete, invoiced, or closed. Reopen active work before scheduling or changing trips.");
      return;
    }
    if (stageKey && isFrozenStageBilling(stageKey)) {
      alert(`${stageLabel(stageKey)} is already ready to bill or invoiced. Reopen that stage billing before scheduling or changing trips.`);
      return;
    }

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

        if (hasStages && stageKey && isFrozenStageBilling(stageKey)) {
          throw new Error(`${stageLabel(stageKey)} is already ready to bill or invoiced. Reopen that stage billing before scheduling or changing trips.`);
        }

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
    const timerHours = getTimerDrivenHoursForTrip(t);
    if (timerHours) return timerHours;

    const start = safeTrim(t.startTime);
    const end = safeTrim(t.endTime);

    if (start && end && end > start) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      if (diff > 0) {
        return (Math.round((diff / 60) * 4) / 4).toFixed(2);
      }
    }

    return "1.00";
  }

  function openCloseoutModal(t: TripDoc) {
    const hasStage = Boolean(safeTrim(t.link?.projectStageKey || ""));
    setCloseoutModal({
      open: true,
      tripId: t.id,
      outcome: hasStage ? "done_today" : isTmProject ? "done_today" : "complete_project",
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
      setCloseoutModal((prev) => ({
        ...prev,
        error: "You do not have permission to close out this trip.",
      }));
      return;
    }

    const hoursWorked = Number(closeoutModal.hoursWorkedToday || 0);
    if (Number.isNaN(hoursWorked) || hoursWorked <= 0) {
      setCloseoutModal((prev) => ({
        ...prev,
        error: "Enter a valid hours value greater than 0.",
      }));
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
        closeoutHours: hoursWorked,
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

        if (isTmProject) {
          projectPatch.projectOfficeStatus = "field_complete";
          projectPatch.fieldCompletedAt = now;
          projectPatch.fieldCompletedByUid = myUid || null;
          projectPatch.fieldCompletedByName = actorDisplayName || null;
          projectPatch.active = true;
        } else {
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

          projectPatch.projectOfficeStatus = "field_complete";
          projectPatch.fieldCompletedAt = now;
          projectPatch.fieldCompletedByUid = myUid || null;
          projectPatch.fieldCompletedByName = actorDisplayName || null;
          projectPatch.active = true;

          setRoughInStatus(enabled.includes("roughIn") ? "complete" : roughInStatus);
          setTopOutVentStatus(enabled.includes("topOutVent") ? "complete" : topOutVentStatus);
          setTrimFinishStatus(enabled.includes("trimFinish") ? "complete" : trimFinishStatus);

          if (enabled.includes("roughIn")) setRoughInCompletedDate(completeDate);
          if (enabled.includes("topOutVent")) setTopOutVentCompletedDate(completeDate);
          if (enabled.includes("trimFinish")) setTrimFinishCompletedDate(completeDate);
        }
      }

      if (isTmProject && closeoutModal.outcome === "done_today") {
        if (projectOfficeStatus === "field_complete") {
          projectPatch.projectOfficeStatus = "field_complete";
        } else if (projectOfficeStatus === "ready_to_invoice") {
          projectPatch.projectOfficeStatus = "ready_to_invoice";
        } else {
          projectPatch.projectOfficeStatus = "active_work";
        }
      }

      const batch = writeBatch(db);

      const synced = await queueProjectTripTimeEntryWrites(batch, {
        trip: {
          ...t,
          ...tripPatch,
        },
        projectId: project.id,
        projectStageKey: stageKey || null,
        hours: hoursWorked,
        notes: workNotes || null,
        actorUid: myUid || null,
        actorName: actorDisplayName || null,
        source: "project_trip_closeout",
      });

      tripPatch.closeout = {
        ...(tripPatch.closeout || {}),
        timeEntrySyncStatus: "synced",
        timeEntrySyncMode: "automatic_closeout",
        timeEntryMemberCount: synced.memberCount,
        timeEntrySyncedAt: now,
        timeEntrySyncedByUid: myUid || null,
        timeEntrySyncedByName: actorDisplayName || null,
      };

const cleanTripPatch = stripUndefinedDeep(tripPatch);
const cleanProjectPatch = stripUndefinedDeep(projectPatch);

batch.update(doc(db, "trips", t.id), cleanTripPatch as any);

if (Object.keys(cleanProjectPatch).length > 1) {
  batch.update(doc(db, "projects", project.id), cleanProjectPatch as any);
}

await batch.commit();

setProjectTrips((prev) =>
  prev.map((x) =>
    x.id === t.id
      ? {
          ...x,
          ...cleanTripPatch,
        }
      : x,
  ),
);

if (Object.keys(cleanProjectPatch).length > 1) {
  mergeProjectState(cleanProjectPatch);
} else {
  mergeProjectState({ updatedAt: now });
}

      const details: string[] = [];
      details.push(`Outcome: ${closeoutModal.outcome.replaceAll("_", " ")}`);
      details.push(
        `More work needed after today: ${
          closeoutModal.needsMoreWork === "yes" ? "Yes" : "No"
        }`,
      );
      details.push(`Hours worked today: ${hoursWorked}`);
      details.push(`Time entries synced: ${synced.memberCount}`);
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

  function summarizeStageBillingTrips(stageKey: StageKey) {
    const trips = tripsByStage[stageKey] || [];
    const relevantTrips = trips.filter((trip) => {
      const status = safeTrim(trip.status).toLowerCase();
      return status !== "cancelled" && trip.active !== false;
    });
    const completedTrips = relevantTrips.filter((trip) => safeTrim(trip.status).toLowerCase() === "complete");
    const openTrips = relevantTrips.filter((trip) => safeTrim(trip.status).toLowerCase() !== "complete");
    const totalHours = completedTrips.reduce((sum, trip) => sum + getCloseoutHours(trip)!, 0);
    const materialsCount = completedTrips.reduce((sum, trip) => {
      return getTripMaterialsSummary(trip) ? sum + 1 : sum;
    }, 0);
    const needsTimeEntryReview = completedTrips.some((trip) => {
      const closeout = (trip.closeout || {}) as any;
      return safeTrim(closeout.timeEntrySyncStatus) !== "synced";
    });

    return {
      totalTrips: relevantTrips.length,
      completedTrips: completedTrips.length,
      openTrips: openTrips.length,
      totalHours: Number(totalHours.toFixed(2)),
      materialsCount,
      needsTimeEntryReview,
    };
  }

  function openStageBillingDialog(stageKey: StageKey, action: StageBillingAction) {
    if (!project || !canEditProject) return;
    const stage = getProjectStage(stageKey) as any;
    setStageBillingDialog({
      open: true,
      stageKey,
      action,
      invoiceNumber: safeTrim(stage?.invoiceNumber || ""),
      invoiceDate: safeTrim(stage?.invoiceDate || toIsoDate(new Date())),
      invoiceNotes: safeTrim(stage?.invoiceNotes || ""),
      saving: false,
      error: "",
    });
  }

  function closeStageBillingDialog() {
    if (stageBillingDialog.saving) return;
    setStageBillingDialog(emptyStageBillingDialog());
  }

  async function saveStageBillingStatus() {
    if (!project || !stageBillingDialog.stageKey || !stageBillingDialog.action || !canEditProject) return;

    const stageKey = stageBillingDialog.stageKey;
    const action = stageBillingDialog.action;
    const currentStage = getProjectStage(stageKey) as any;
    if (!currentStage) return;

    const invoiceDate = safeTrim(stageBillingDialog.invoiceDate);
    const invoiceNumber = safeTrim(stageBillingDialog.invoiceNumber);
    const invoiceNotes = safeTrim(stageBillingDialog.invoiceNotes);

    if (action === "invoiced" && !invoiceDate) {
      setStageBillingDialog((prev) => ({ ...prev, error: "Invoice date is required." }));
      return;
    }

    setStageBillingDialog((prev) => ({ ...prev, saving: true, error: "" }));

    try {
      const now = nowIso();
      const previousStatus = getStageBillingStatus(currentStage);
      const billingMeta = getStageBillingMeta(project.projectType, stageKey);
      const fallbackAmounts = buildStageBilledAmounts(
        project.projectType as EditableProjectType,
        Number(project.totalBidAmount || 0),
      );
      const fallbackAmount = Number((fallbackAmounts as any)[stageKey] || 0);
      const nextStage: Record<string, any> = {
        ...(currentStage || {}),
      };

      if (action === "ready_to_bill") {
        nextStage.billingStatus = "ready_to_bill";
        nextStage.readyToBillAt = now;
        nextStage.readyToBillByUid = myUid || null;
        nextStage.readyToBillByName = actorDisplayName || null;
        nextStage.billed = false;
        nextStage.billedAmount = Number(nextStage.billedAmount || fallbackAmount || 0);
      }

      if (action === "invoiced") {
        nextStage.billingStatus = "invoiced";
        nextStage.readyToBillAt = nextStage.readyToBillAt || now;
        nextStage.readyToBillByUid = nextStage.readyToBillByUid || myUid || null;
        nextStage.readyToBillByName = nextStage.readyToBillByName || actorDisplayName || null;
        nextStage.invoicedAt = now;
        nextStage.invoicedByUid = myUid || null;
        nextStage.invoicedByName = actorDisplayName || null;
        nextStage.invoiceNumber = invoiceNumber || null;
        nextStage.invoiceDate = invoiceDate;
        nextStage.invoiceNotes = invoiceNotes || null;
        nextStage.billed = true;
        nextStage.billedAmount = Number(nextStage.billedAmount || fallbackAmount || 0);
      }

      if (action === "reopen") {
        nextStage.billingStatus = "not_ready";
        nextStage.readyToBillAt = null;
        nextStage.readyToBillByUid = null;
        nextStage.readyToBillByName = null;
        nextStage.invoicedAt = null;
        nextStage.invoicedByUid = null;
        nextStage.invoicedByName = null;
        nextStage.invoiceNumber = null;
        nextStage.invoiceDate = null;
        nextStage.invoiceNotes = null;
        nextStage.billed = false;
      }

      const patch = stripUndefinedDeep({
        [stageKey]: nextStage,
        active: true,
        projectOfficeStatus: projectOfficeStatus === "closed" ? "active_work" : projectOfficeStatus,
        updatedAt: now,
      });

      await updateDoc(doc(db, "projects", project.id), patch as any);
      mergeProjectState(patch);

      void recordProjectActivity({
        type: "project_updated",
        title: `${stageLabel(stageKey)} billing updated`,
        description: `${formatStageBillingStatus(previousStatus)} → ${formatStageBillingStatus(getStageBillingStatus(nextStage))}`,
        details: [
          `${billingMeta.label}${billingMeta.percent ? ` • ${billingMeta.percent}%` : ""}`,
          `Updated by: ${actorDisplayName}`,
          ...(action === "invoiced" && invoiceNumber ? [`Invoice #: ${invoiceNumber}`] : []),
          ...(action === "invoiced" && invoiceDate ? [`Invoice date: ${invoiceDate}`] : []),
          ...(invoiceNotes ? [`Invoice notes: ${invoiceNotes}`] : []),
        ],
      });

      setStageBillingDialog(emptyStageBillingDialog());
    } catch (err: any) {
      setStageBillingDialog((prev) => ({
        ...prev,
        saving: false,
        error: err?.message || "Failed to update stage billing.",
      }));
    }
  }

  function openTmInvoiceDialog(periodId: string) {
    const period = tmBillingPeriods.find((item) => item.id === periodId) || null;
    if (!period) return;
    setTmInvoiceDialog({
      open: true,
      periodId,
      invoiceNumber: safeTrim(period.invoiceNumber || ""),
      invoiceDate: safeTrim(period.invoiceDate || toIsoDate(new Date())),
      invoiceNotes: safeTrim(period.invoiceNotes || ""),
      saving: false,
      error: "",
    });
  }

  function closeTmInvoiceDialog() {
    if (tmInvoiceDialog.saving) return;
    setTmInvoiceDialog(emptyTmInvoiceDialog());
  }

  async function markTmProjectFieldComplete() {
    if (!project || !isTmProject || !canMarkTmFieldComplete) return;

    try {
      const now = nowIso();
      const nextStatus: ProjectOfficeStatus = projectBillingSummary.readyPeriods > 0 ? "ready_to_invoice" : "field_complete";
      const patch: Record<string, any> = {
        projectOfficeStatus: nextStatus,
        fieldCompletedAt: now,
        fieldCompletedByUid: myUid || null,
        fieldCompletedByName: actorDisplayName || null,
        active: true,
        updatedAt: now,
      };

      await updateDoc(doc(db, "projects", project.id), patch as any);
      mergeProjectState(patch);

      void recordProjectActivity({
        type: "project_updated",
        title: "T&M project marked field complete",
        description: projectBillingSummary.unbilledCompletedTrips > 0
          ? `${projectBillingSummary.unbilledCompletedTrips} unbilled completed trip(s) still need review.`
          : "No more field work is expected for this project.",
        details: [
          `Updated by: ${actorDisplayName}`,
          `Office status: ${formatProjectOfficeStatus(nextStatus)}`,
        ],
      });
    } catch (err: any) {
      alert(err?.message || "Failed to mark project field complete.");
    }
  }

  async function markTmCurrentPeriodReadyToBill() {
    if (!project || !isTmProject || !canMarkTmReadyToBill) return;

    const eligibleTrips = getUnbilledCompletedTrips(projectTrips);
    if (!eligibleTrips.length) {
      alert("There are no completed unbilled T&M trips ready to freeze into a billing period.");
      return;
    }

    try {
      const now = nowIso();
      const existingPeriods = getProjectBillingPeriods(project);
      const openPeriod = getCurrentOpenBillingPeriod(project) || createOpenBillingPeriod({
        project,
        actorUid: myUid || null,
        actorName: actorDisplayName || null,
        openedAt: now,
      });
      const summary = summarizeBillingPeriodTrips(eligibleTrips);

      const frozenPeriod: ProjectBillingPeriod = {
        ...openPeriod,
        label: openPeriod.label || `Billing ${openPeriod.sequence}`,
        status: "ready_to_bill",
        readyToBillAt: now,
        readyToBillByUid: myUid || undefined,
        readyToBillByName: actorDisplayName || undefined,
        tripIds: summary.tripIds,
        tripCount: summary.tripCount,
        totalHours: summary.totalHours,
        materialsCount: summary.materialsCount,
        dateFrom: summary.dateFrom,
        dateTo: summary.dateTo,
      };

      const nextPeriods = existingPeriods
        .filter((period) => period.id !== frozenPeriod.id)
        .concat(frozenPeriod)
        .sort((a, b) => a.sequence - b.sequence);

      let currentBillingPeriodId: string | null = null;
      if (!project.fieldCompletedAt) {
        const nextOpen = createOpenBillingPeriod({
          project: { ...(project as any), billingPeriods: nextPeriods } as Project,
          actorUid: myUid || null,
          actorName: actorDisplayName || null,
          openedAt: now,
        });
        nextPeriods.push(nextOpen);
        currentBillingPeriodId = nextOpen.id;
      }

      const batch = writeBatch(db);
      batch.update(doc(db, "projects", project.id), {
        billingPeriods: nextPeriods,
        currentBillingPeriodId: currentBillingPeriodId,
        projectOfficeStatus: "ready_to_invoice",
        readyToInvoiceAt: now,
        readyToInvoiceByUid: myUid || null,
        readyToInvoiceByName: actorDisplayName || null,
        updatedAt: now,
      } as any);

      for (const trip of eligibleTrips) {
        batch.update(doc(db, "trips", trip.id), {
          billingPeriodId: frozenPeriod.id,
          billingPeriodSequence: frozenPeriod.sequence,
          billingPeriodLabel: frozenPeriod.label,
          billingPeriodStatus: "ready_to_bill",
          readyToBillAt: now,
          updatedAt: now,
          updatedByUid: myUid || null,
        } as any);
      }

      await batch.commit();

      setProjectTrips((prev) =>
        prev.map((trip) =>
          summary.tripIds.includes(trip.id)
            ? {
                ...trip,
                billingPeriodId: frozenPeriod.id,
                billingPeriodSequence: frozenPeriod.sequence,
                billingPeriodLabel: frozenPeriod.label,
                billingPeriodStatus: "ready_to_bill",
                readyToBillAt: now,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : trip,
        ),
      );

      mergeProjectState({
        billingPeriods: nextPeriods,
        currentBillingPeriodId: currentBillingPeriodId || undefined,
        projectOfficeStatus: "ready_to_invoice",
        readyToInvoiceAt: now,
        readyToInvoiceByUid: myUid || undefined,
        readyToInvoiceByName: actorDisplayName || undefined,
        updatedAt: now,
      });
      setActiveTmBillingTab(frozenPeriod.id);

      void recordProjectActivity({
        type: "project_updated",
        title: "T&M billing period marked ready to bill",
        description: `${summary.tripCount} trip(s) frozen into ${frozenPeriod.label || `Billing ${frozenPeriod.sequence}`}.`,
        details: [
          `Hours: ${summary.totalHours.toFixed(2)}`,
          `Materials notes: ${summary.materialsCount}`,
          ...(summary.dateFrom ? [`Date range: ${summary.dateFrom}${summary.dateTo && summary.dateTo !== summary.dateFrom ? ` → ${summary.dateTo}` : ""}`] : []),
        ],
      });
    } catch (err: any) {
      alert(err?.message || "Failed to mark the current T&M period ready to bill.");
    }
  }

  async function reopenTmBillingPeriod(periodId: string) {
    if (!project || !isTmProject || !canInvoiceTmPeriods) return;

    const period = tmBillingPeriods.find((item) => item.id === periodId) || null;
    if (!period || period.status !== "ready_to_bill") return;

    const currentOpenSummary = activeTmBillingTabData?.isCurrentOpen ? activeTmBillingTabData.summary : tmBillingTabs.find((tab) => tab.isCurrentOpen)?.summary;
    if (currentOpenSummary && currentOpenSummary.tripCount > 0) {
      alert("There is already later work accumulated in the current open period. Invoice or clear that work before reopening this frozen billing period.");
      return;
    }

    try {
      const now = nowIso();
      const reopenedPeriod: ProjectBillingPeriod = {
        ...period,
        status: "open",
        readyToBillAt: undefined,
        readyToBillByUid: undefined,
        readyToBillByName: undefined,
      };
      const nextPeriods = tmBillingPeriods
        .filter((item) => item.id !== periodId)
        .filter((item) => item.status !== "open")
        .concat(reopenedPeriod)
        .sort((a, b) => a.sequence - b.sequence);

      const nextStatus: ProjectOfficeStatus = project.fieldCompletedAt ? "field_complete" : "active_work";

      const batch = writeBatch(db);
      batch.update(doc(db, "projects", project.id), {
        billingPeriods: nextPeriods,
        currentBillingPeriodId: reopenedPeriod.id,
        projectOfficeStatus: nextStatus,
        updatedAt: now,
      } as any);

      const periodTrips = projectTrips.filter((trip) => safeTrim(trip.billingPeriodId) === periodId);
      for (const trip of periodTrips) {
        batch.update(doc(db, "trips", trip.id), {
          billingPeriodStatus: "open",
          readyToBillAt: null,
          updatedAt: now,
          updatedByUid: myUid || null,
        } as any);
      }

      await batch.commit();

      setProjectTrips((prev) =>
        prev.map((trip) =>
          safeTrim(trip.billingPeriodId) === periodId
            ? {
                ...trip,
                billingPeriodStatus: "open",
                readyToBillAt: null,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : trip,
        ),
      );
      mergeProjectState({
        billingPeriods: nextPeriods,
        currentBillingPeriodId: reopenedPeriod.id,
        projectOfficeStatus: nextStatus,
        updatedAt: now,
      });
      setActiveTmBillingTab("current");

      void recordProjectActivity({
        type: "project_updated",
        title: "T&M billing period reopened",
        description: `${reopenedPeriod.label || `Billing ${reopenedPeriod.sequence}`} is open again for billing changes.`,
        details: [`Updated by: ${actorDisplayName}`],
      });
    } catch (err: any) {
      alert(err?.message || "Failed to reopen the billing period.");
    }
  }

  async function saveTmBillingPeriodInvoice() {
    if (!project || !isTmProject || !tmInvoiceDialog.periodId || !canInvoiceTmPeriods) return;

    const period = tmBillingPeriods.find((item) => item.id === tmInvoiceDialog.periodId) || null;
    if (!period || period.status !== "ready_to_bill") return;

    const invoiceDate = safeTrim(tmInvoiceDialog.invoiceDate);
    if (!invoiceDate) {
      setTmInvoiceDialog((prev) => ({ ...prev, error: "Invoice date is required." }));
      return;
    }

    setTmInvoiceDialog((prev) => ({ ...prev, saving: true, error: "" }));

    try {
      const now = nowIso();
      const invoiceNumber = safeTrim(tmInvoiceDialog.invoiceNumber);
      const invoiceNotes = safeTrim(tmInvoiceDialog.invoiceNotes);
      const periodTrips = projectTrips.filter((trip) => safeTrim(trip.billingPeriodId) === period.id);
      const invoicedPeriod: ProjectBillingPeriod = {
        ...period,
        status: "invoiced",
        invoicedAt: now,
        invoicedByUid: myUid || undefined,
        invoicedByName: actorDisplayName || undefined,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate,
        invoiceNotes: invoiceNotes || undefined,
      };

      const nextPeriods = tmBillingPeriods
        .map((item) => (item.id === invoicedPeriod.id ? invoicedPeriod : item))
        .sort((a, b) => a.sequence - b.sequence);

      const remainingReadyPeriods = nextPeriods.filter((item) => item.status === "ready_to_bill");
      const remainingUnbilledTrips = getUnbilledCompletedTrips(
        projectTrips.filter((trip) => safeTrim(trip.billingPeriodId) !== period.id),
      );
      const hasOpenPeriod = nextPeriods.some((item) => item.status === "open");

      let nextStatus: ProjectOfficeStatus = "active_work";
      let nextActive = true;
      const projectPatch: Record<string, any> = {
        billingPeriods: nextPeriods,
        updatedAt: now,
      };

      if (remainingReadyPeriods.length > 0) {
        nextStatus = "ready_to_invoice";
      } else if (project.fieldCompletedAt) {
        if (!hasOpenPeriod && remainingUnbilledTrips.length === 0) {
          nextStatus = "invoiced";
          nextActive = false;
          projectPatch.invoicedAt = now;
          projectPatch.invoicedByUid = myUid || null;
          projectPatch.invoicedByName = actorDisplayName || null;
          projectPatch.invoiceNumber = invoiceNumber || null;
          projectPatch.invoiceDate = invoiceDate;
          projectPatch.invoiceNotes = invoiceNotes || null;
        } else {
          nextStatus = "field_complete";
        }
      }

      projectPatch.projectOfficeStatus = nextStatus;
      projectPatch.active = nextActive;

      const batch = writeBatch(db);
      batch.update(doc(db, "projects", project.id), projectPatch as any);
      for (const trip of periodTrips) {
        batch.update(doc(db, "trips", trip.id), {
          billingPeriodStatus: "invoiced",
          invoicedAt: now,
          invoiceNumber: invoiceNumber || null,
          invoiceDate,
          updatedAt: now,
          updatedByUid: myUid || null,
        } as any);
      }

      await batch.commit();

      setProjectTrips((prev) =>
        prev.map((trip) =>
          safeTrim(trip.billingPeriodId) === period.id
            ? {
                ...trip,
                billingPeriodStatus: "invoiced",
                invoicedAt: now,
                invoiceNumber: invoiceNumber || null,
                invoiceDate,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : trip,
        ),
      );
      mergeProjectState({
        ...projectPatch,
      });
      setActiveTmBillingTab(period.id);
      setTmInvoiceDialog(emptyTmInvoiceDialog());

      void recordProjectActivity({
        type: "project_updated",
        title: "T&M billing period invoiced",
        description: `${period.label || `Billing ${period.sequence}`} recorded as invoiced.`,
        details: [
          ...(invoiceNumber ? [`Invoice #: ${invoiceNumber}`] : []),
          `Invoice date: ${invoiceDate}`,
          ...(invoiceNotes ? [`Invoice notes: ${invoiceNotes}`] : []),
          `Trips in period: ${periodTrips.length}`,
        ],
      });
    } catch (err: any) {
      setTmInvoiceDialog((prev) => ({
        ...prev,
        saving: false,
        error: err?.message || "Failed to mark the billing period invoiced.",
      }));
    }
  }

  async function syncProjectTripTimeEntries(t: TripDoc) {
    if (!project) return;

    if (!canEditProject) {
      alert("Only Admin/Dispatcher/Manager can resync labor hours for this trip.");
      return;
    }

    const status = String(t.status || "").toLowerCase();
    if (status !== "complete") {
      alert("Only completed project trips can resync labor hours.");
      return;
    }

    const closeoutHours = Number(
      (t.closeout as any)?.hoursWorkedToday ??
        (t.closeout as any)?.closeoutHours ??
        t.closeoutHours ??
        0,
    );

    const estimatedHours = Number(estimateTripHours(t));
    const hours =
      Number.isFinite(closeoutHours) && closeoutHours > 0 ? closeoutHours : estimatedHours;

    if (!Number.isFinite(hours) || hours <= 0) {
      alert("This trip does not have valid hours to resync.");
      return;
    }

    const ok = window.confirm(
      `Resync labor hours for all assigned crew on this completed project trip?\n\nHours: ${hours.toFixed(
        2,
      )}\n\nThis is a safety repair action. It will update existing time entries and create missing ones. It will not duplicate entries.`,
    );

    if (!ok) return;

    setTripActionBusyId(t.id);

    try {
      const now = nowIso();
      const stageKey = safeTrim(t.link?.projectStageKey || "") as StageKey | "";
      const notes =
        safeTrim((t.closeout as any)?.workNotes) ||
        safeTrim(t.notes) ||
        "";

      const synced = await upsertProjectTripTimeEntriesForCrew({
        trip: t,
        projectId: project.id,
        projectStageKey: stageKey || null,
        hours,
        notes: notes || null,
        actorUid: myUid || null,
        actorName: actorDisplayName || null,
        source: "project_trip_manual_sync",
      });

      const nextCloseout = {
        ...((t.closeout && typeof t.closeout === "object" ? t.closeout : {}) as any),
        timeEntrySyncStatus: "synced",
        timeEntrySyncMode: "manual_resync",
        timeEntryMemberCount: synced.memberCount,
        timeEntrySyncedAt: now,
        timeEntrySyncedByUid: myUid || null,
        timeEntrySyncedByName: actorDisplayName || null,
      };

      await updateDoc(doc(db, "trips", t.id), {
        closeout: nextCloseout,
        updatedAt: now,
        updatedByUid: myUid || null,
      } as any);

      setProjectTrips((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? {
                ...x,
                closeout: nextCloseout,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : x,
        ),
      );

      void recordProjectActivity({
        type: "trip_labor_resynced",
        title: "Project trip labor hours resynced",
        description: formatTripScheduleLine(t),
        details: [
          `Crew entries updated/created: ${synced.memberCount}`,
          `Hours: ${hours.toFixed(2)}`,
          stageKey ? `Stage: ${stageLabel(stageKey)}` : "Project Trip",
        ],
      });

      alert(
        `✅ Labor hours resynced.\n\nCrew entries updated/created: ${synced.memberCount}`,
      );
    } catch (err: any) {
      alert(err?.message || "Failed to resync labor hours.");
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

  function getCloseoutHours(t?: TripDoc | null) {
    const n = Number(getTripCloseoutHoursFromBilling(t || null));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function getCloseoutSavedSummary(t: TripDoc) {
    const hours = getCloseoutHours(t);
    const outcome = safeTrim((t.closeout as any)?.outcome).replaceAll("_", " ");
    if (outcome && hours != null) return `${outcome} • ${hours.toFixed(2)}h`;
    if (hours != null) return `${hours.toFixed(2)}h`;
    return "Closeout saved";
  }

  function getCloseoutSubmittedBy(t?: TripDoc | null) {
    if (!t) return "Unknown user";
    return safeTrim((t.closeout as any)?.savedByName) || "Unknown user";
  }

  function getCloseoutWorkSummary(t?: TripDoc | null) {
    if (!t) return "—";
    return (
      safeTrim((t.closeout as any)?.workNotes) ||
      safeTrim(t.notes) ||
      "No work summary saved."
    );
  }

  function getCloseoutMaterials(t?: TripDoc | null) {
    if (!t) return "—";
    return (
      safeTrim((t.closeout as any)?.materialsUsedToday) ||
      safeTrim(t.materialsUsedToday) ||
      "No materials recorded."
    );
  }

  function getCloseoutTimeEntryStatus(t?: TripDoc | null) {
    if (!t) return "Not available";
    const closeout = (t.closeout || {}) as any;
    const status = safeTrim(closeout.timeEntrySyncStatus);
    const mode = safeTrim(closeout.timeEntrySyncMode);
    const count = Number(closeout.timeEntryMemberCount || 0);
    const countSuffix = count > 0 ? ` (${count} crew)` : "";

    if (status === "synced" && mode === "manual_resync") {
      return `Resynced${countSuffix}`;
    }
    if (status === "synced") {
      return `Synced automatically${countSuffix}`;
    }
    if (String(t.status || "").toLowerCase() === "complete") {
      return "Not stamped — use Resync Labor Hours if needed";
    }
    return "Not available";
  }

  function openCloseoutDetails(t: TripDoc) {
    if (!canCurrentUserViewTrip(t)) return;
    setCloseoutDetailsTripId(t.id);
  }

  function closeCloseoutDetails() {
    setCloseoutDetailsTripId(null);
  }

function openProjectOfficeDialog(nextStatus: ProjectOfficeStatus) {
  if (!project) return;

  const canOpen =
    nextStatus === "closed"
      ? canCloseProject
      : nextStatus === "active_work" && projectOfficeStatus === "closed"
        ? canReopenClosedProject
        : canUpdateProjectOfficeStatus;

  if (!canOpen) return;

  setProjectOfficeDialog({
    open: true,
    nextStatus,
    invoiceNumber: safeTrim((project as any).invoiceNumber || ""),
    invoiceDate: safeTrim((project as any).invoiceDate || toIsoDate(new Date())),
    invoiceNotes: safeTrim((project as any).invoiceNotes || ""),
    reopenReason: "",
    saving: false,
    error: "",
  });
}

  function closeProjectOfficeDialog() {
    if (projectOfficeDialog.saving) return;
    setProjectOfficeDialog(emptyProjectOfficeDialog());
  }

  async function saveProjectOfficeStatus() {
if (!project || !projectOfficeDialog.nextStatus) return;

const nextStatus = projectOfficeDialog.nextStatus;

const canSave =
  nextStatus === "closed"
    ? canCloseProject
    : nextStatus === "active_work" && projectOfficeStatus === "closed"
      ? canReopenClosedProject
      : canUpdateProjectOfficeStatus;

if (!canSave) return;
    const invoiceNumber = safeTrim(projectOfficeDialog.invoiceNumber);
    const invoiceDate = safeTrim(projectOfficeDialog.invoiceDate);
    const invoiceNotes = safeTrim(projectOfficeDialog.invoiceNotes);
    const reopenReason = safeTrim(projectOfficeDialog.reopenReason);

    if (nextStatus === "invoiced" && !invoiceDate) {
      setProjectOfficeDialog((prev) => ({ ...prev, error: "Invoice date is required." }));
      return;
    }

    if (nextStatus === "active_work" && !reopenReason) {
      setProjectOfficeDialog((prev) => ({ ...prev, error: "Enter a brief reopen reason." }));
      return;
    }

    setProjectOfficeDialog((prev) => ({ ...prev, saving: true, error: "" }));

    try {
      const now = nowIso();
      const previousStatus = getProjectOfficeStatus(project);
      const patch: Record<string, any> = {
        projectOfficeStatus: nextStatus,
        updatedAt: now,
      };

if (nextStatus === "active_work") {
  patch.active = true;
  patch.reopenedAt = now;
  patch.reopenedByUid = myUid || null;
  patch.reopenedByName = actorDisplayName || null;
  patch.reopenReason = reopenReason || null;
  patch.closedAt = null;
  patch.closedByUid = null;
  patch.closedByName = null;
}

      if (nextStatus === "field_complete") {
        patch.active = true;
        patch.fieldCompletedAt = now;
        patch.fieldCompletedByUid = myUid || null;
        patch.fieldCompletedByName = actorDisplayName || null;
      }

      if (nextStatus === "ready_to_invoice") {
        patch.active = true;
        patch.fieldCompletedAt = (project as any).fieldCompletedAt || now;
        patch.fieldCompletedByUid = (project as any).fieldCompletedByUid || myUid || null;
        patch.fieldCompletedByName = (project as any).fieldCompletedByName || actorDisplayName || null;
        patch.readyToInvoiceAt = now;
        patch.readyToInvoiceByUid = myUid || null;
        patch.readyToInvoiceByName = actorDisplayName || null;
      }

      if (nextStatus === "invoiced") {
        patch.active = false;
        patch.fieldCompletedAt = (project as any).fieldCompletedAt || now;
        patch.fieldCompletedByUid = (project as any).fieldCompletedByUid || myUid || null;
        patch.fieldCompletedByName = (project as any).fieldCompletedByName || actorDisplayName || null;
        patch.readyToInvoiceAt = (project as any).readyToInvoiceAt || now;
        patch.readyToInvoiceByUid = (project as any).readyToInvoiceByUid || myUid || null;
        patch.readyToInvoiceByName = (project as any).readyToInvoiceByName || actorDisplayName || null;
        patch.invoicedAt = now;
        patch.invoicedByUid = myUid || null;
        patch.invoicedByName = actorDisplayName || null;
        patch.invoiceNumber = invoiceNumber || null;
        patch.invoiceDate = invoiceDate || null;
        patch.invoiceNotes = invoiceNotes || null;
      }

      if (nextStatus === "closed") {
        patch.active = false;
        patch.closedAt = now;
        patch.closedByUid = myUid || null;
        patch.closedByName = actorDisplayName || null;
      }

      await updateDoc(doc(db, "projects", project.id), patch as any);

      mergeProjectState(patch);

      void recordProjectActivity({
        type: "project_updated",
        title: "Project office status updated",
        description: `${formatProjectOfficeStatus(previousStatus)} → ${formatProjectOfficeStatus(nextStatus)}`,
        details: [
          `Updated by: ${actorDisplayName}`,
          ...(nextStatus === "invoiced" && invoiceNumber ? [`Invoice #: ${invoiceNumber}`] : []),
          ...(nextStatus === "invoiced" && invoiceDate ? [`Invoice date: ${invoiceDate}`] : []),
          ...(nextStatus === "active_work" && reopenReason ? [`Reopen reason: ${reopenReason}`] : []),
          ...(invoiceNotes ? [`Invoice notes: ${invoiceNotes}`] : []),
        ],
      });

      setProjectOfficeDialog(emptyProjectOfficeDialog());
    } catch (err: any) {
      setProjectOfficeDialog((prev) => ({
        ...prev,
        saving: false,
        error: err?.message || "Failed to update project office status.",
      }));
    }
  }

    async function copyPoCode(poCode: string) {
    const code = safeTrim(poCode).toUpperCase();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setPoActionSuccess(`✅ Copied ${code}.`);
    } catch {
      setPoActionSuccess("");
      alert(`PO Code: ${code}`);
    }
  }

  async function openProjectPoPdf(po: ProjectPurchaseOrder) {
    const attachment = getLatestPoAttachment(po);

    if (!attachment) {
      alert("No invoice PDF is attached to this PO yet.");
      return;
    }

    try {
      const storagePath = safeTrim(attachment.storagePath);

      if (!storagePath) {
        throw new Error("This invoice PDF is missing its Firebase Storage path.");
      }

      const storage = getStorage();
      const url = await getDownloadURL(storageRef(storage, storagePath));

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      alert(err?.message || "Could not open invoice PDF. Check Firebase Storage permissions.");
    }
  }

  async function generateProjectPoForTrip(t: TripDoc) {
    if (!project) return;

    if (!canEditProject) {
      alert("Only Admin/Dispatcher/Manager can generate project POs.");
      return;
    }

    if (projectFieldWorkLocked || isFrozenProjectBillingTrip(t)) {
      alert("This project/trip is locked for billing. Reopen it before generating another PO.");
      return;
    }

    const status = safeTrim(t.status).toLowerCase();
    if (status === "complete" || status === "completed" || status === "cancelled" || t.active === false) {
      alert("PO numbers cannot be generated for completed or cancelled trips.");
      return;
    }

    const existingForTrip = purchaseOrdersByTrip.get(t.id) || [];
    if (existingForTrip.length > 0) {
      const ok = window.confirm(
        `This trip already has ${existingForTrip.length} PO${existingForTrip.length === 1 ? "" : "s"}.\n\nCreate another PO for this trip?`,
      );
      if (!ok) return;
    }

    setPoActionBusyTripId(t.id);
    setPoActionError("");
    setPoActionSuccess("");

    try {
      const record = await generatePurchaseOrderForProjectTrip({
        db,
        tripId: t.id,
        requestedByUid: myUid || null,
        requestedByName: actorDisplayName || null,
      });

      const nextPo = {
        ...(record as ProjectPurchaseOrder),
        matchedAttachments: [],
        invoiceAttachmentCount: 0,
        invoicePdfAttachmentCount: 0,
        parsedLineItems: [],
        importedMaterialCount: 0,
      };

      setPurchaseOrders((prev) =>
        [nextPo, ...prev.filter((item) => item.poCode !== nextPo.poCode)].sort((a, b) =>
          `${b.createdAt || ""}_${b.poCode}`.localeCompare(`${a.createdAt || ""}_${a.poCode}`),
        ),
      );

      setPoActionSuccess(`✅ Project PO ${record.poCode} generated.`);

      void recordProjectActivity({
        type: "purchase_order_created",
        title: "Project PO created",
        description: `${record.poCode} generated for ${formatPoTripContext(nextPo)}.`,
        details: [
          `PO: ${record.poCode}`,
          `Trip: ${formatTripScheduleLine(t)}`,
          `Source: ${formatPoTripContext(nextPo)}`,
          `Requested by: ${actorDisplayName}`,
        ],
      });
    } catch (err: any) {
      setPoActionError(err?.message || "Failed to generate project PO.");
    } finally {
      setPoActionBusyTripId(null);
    }
  }

  function TripActionRow({ t }: { t: TripDoc }) {
    const canOperate = canCurrentUserOperateTrip(t);
    const canView = canCurrentUserViewTrip(t);
    const busy = tripActionBusyId === t.id || closeoutModal.saving;
    const timerState = String(t.timerState || "idle").toLowerCase();
    const status = String(t.status || "").toLowerCase();
    const cancelled = status === "cancelled" || t.active === false;
    const [completedMenuAnchorEl, setCompletedMenuAnchorEl] = useState<HTMLElement | null>(null);
    const completedMenuOpen = Boolean(completedMenuAnchorEl);

    function openCompletedTripMenu(event: React.MouseEvent<HTMLElement>) {
      event.stopPropagation();
      setCompletedMenuAnchorEl(event.currentTarget);
    }

    function closeCompletedTripMenu() {
      setCompletedMenuAnchorEl(null);
    }

    if (cancelled) return null;

    if (status === "complete") {
      return (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Button
            variant="outlined"
            startIcon={<OpenInNewRoundedIcon />}
            onClick={() => openCloseoutDetails(t)}
            disabled={!canView || busy}
            sx={{ borderRadius: 99, alignSelf: { xs: "stretch", sm: "flex-start" } }}
          >
            View Closeout
          </Button>

          {canEditProject ? (
            <Box sx={{ alignSelf: { xs: "flex-end", sm: "center" } }}>
              <IconButton
                aria-label="Completed trip actions"
                onClick={openCompletedTripMenu}
                disabled={busy}
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                }}
              >
                <MoreVertRoundedIcon />
              </IconButton>

              <Popper
                open={completedMenuOpen}
                anchorEl={completedMenuAnchorEl}
                placement="bottom-end"
                transition
                disablePortal
                modifiers={[
                  {
                    name: "offset",
                    options: {
                      offset: [0, 8],
                    },
                  },
                  {
                    name: "preventOverflow",
                    options: {
                      padding: 8,
                    },
                  },
                ]}
                sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
              >
                {({ TransitionProps }) => (
                  <Grow {...TransitionProps} style={{ transformOrigin: "right top" }}>
                    <Paper
                      elevation={6}
                      sx={{
                        borderRadius: 1,
                        minWidth: 230,
                        overflow: "hidden",
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <ClickAwayListener onClickAway={closeCompletedTripMenu}>
                        <MenuList autoFocusItem={completedMenuOpen} dense={false}>
                          <MenuItem
                            disabled={!canCurrentUserEditTrip(t)}
                            onClick={() => {
                              closeCompletedTripMenu();
                              openEditTrip(t);
                            }}
                          >
                            <ListItemIcon>
                              <OpenInNewRoundedIcon fontSize="small" />
                            </ListItemIcon>
                            Open Trip
                          </MenuItem>

                          <MenuItem
                            disabled={!canEditProject || projectFieldWorkLocked || isFrozenProjectBillingTrip(t) || tripActionBusyId === t.id}
                            onClick={() => {
                              closeCompletedTripMenu();
                              void syncProjectTripTimeEntries(t);
                            }}
                          >
                            <ListItemIcon>
                              <AccessTimeFilledRoundedIcon fontSize="small" />
                            </ListItemIcon>
                            Resync Labor Hours
                          </MenuItem>

                          <MenuItem
                            disabled={!canEditProject || projectFieldWorkLocked || isFrozenProjectBillingTrip(t) || tripActionBusyId === t.id}
                            onClick={() => {
                              closeCompletedTripMenu();
                              void applyTripLifecycleAction(t, "reopen");
                            }}
                          >
                            <ListItemIcon>
                              <RefreshRoundedIcon fontSize="small" />
                            </ListItemIcon>
                            Reopen Trip
                          </MenuItem>

                          <Divider />

                          <MenuItem
                            disabled={!canEditProject || projectFieldWorkLocked || isFrozenProjectBillingTrip(t) || tripActionBusyId === t.id}
                            onClick={() => {
                              closeCompletedTripMenu();
                              void removeTrip(t);
                            }}
                            sx={{ color: "error.main" }}
                          >
                            <ListItemIcon sx={{ color: "error.main" }}>
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </ListItemIcon>
                            Delete Trip
                          </MenuItem>
                        </MenuList>
                      </ClickAwayListener>
                    </Paper>
                  </Grow>
                )}
              </Popper>
            </Box>
          ) : null}
        </Stack>
      );
    }

    return (
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {timerState === "idle" ? (
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

          {timerState === "running" ? (
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

          {timerState === "paused" ? (
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
    const tripPurchaseOrders = purchaseOrdersByTrip.get(t.id) || [];
    const poBusy = poActionBusyTripId === t.id;

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
          borderRadius: 1,
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
                  {formatTripScheduleLine(t)}
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
                {isTmProject && safeTrim(t.billingPeriodLabel) ? (
                  <Chip
                    label={`${safeTrim(t.billingPeriodLabel)} • ${safeTrim(t.billingPeriodStatus || "open").replaceAll("_", " ")}`}
                    variant="outlined"
                    size="small"
                  />
                ) : null}
              </Stack>
            </Stack>

            <TripActionRow t={t} />

                        <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: alpha(theme.palette.primary.main, 0.025),
              }}
            >
              <Stack spacing={1.25}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  justifyContent="space-between"
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      Purchase Orders
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isTmProject
                        ? "T&M project POs use T### codes."
                        : "Bid project POs use P### codes."}
                    </Typography>
                  </Box>

                  {canEditProject && String(t.status || "").toLowerCase() !== "complete" && !cancelled ? (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ReceiptLongRoundedIcon />}
                      onClick={() => generateProjectPoForTrip(t)}
                      disabled={poBusy || projectFieldWorkLocked || isFrozenProjectBillingTrip(t)}
                      sx={{ borderRadius: 99 }}
                    >
                      {poBusy ? "Generating..." : `Generate PO #`}
                    </Button>
                  ) : null}
                </Stack>

                {tripPurchaseOrders.length > 0 ? (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {tripPurchaseOrders.map((po) => {
                      const attachment = getLatestPoAttachment(po);
                      return (
                        <Chip
                          key={po.poCode}
                          label={`${po.poCode} • ${formatPoStatus(po.status)}`}
                          color={poStatusColor(po.status)}
                          variant={po.status === "matched" ? "filled" : "outlined"}
                          icon={<ReceiptLongRoundedIcon />}
                          onClick={() => copyPoCode(po.poCode)}
                          onDelete={
                            attachment
                              ? () => {
                                  void openProjectPoPdf(po);
                                }
                              : undefined
                          }
                          deleteIcon={attachment ? <OpenInNewRoundedIcon /> : undefined}
                          sx={{
                            borderRadius: 99,
                            fontWeight: 800,
                          }}
                        />
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No POs generated for this trip yet.
                  </Typography>
                )}
              </Stack>
            </Paper>

            {String(t.status || "").toLowerCase() === "complete" &&
            (t.closeout || (typeof t.closeoutHours === "number" && t.closeoutHours > 0)) ? (
              <Alert
                severity="info"
                variant="outlined"
                icon={<InfoRoundedIcon fontSize="inherit" />}
                sx={{ borderRadius: 1 }}
              >
                Last closeout saved: {getCloseoutSavedSummary(t)}
              </Alert>
            ) : null}

            {t.cancelReason ? (
              <Typography variant="caption" color="text.secondary">
                Cancel reason: {t.cancelReason}
              </Typography>
            ) : null}

            {String(t.status || "").toLowerCase() !== "complete" ? (
              <>
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
              </>
            ) : null}

            {!canEditThis ? (
              <Typography variant="caption" color="text.secondary">
                {String(t.status || "").toLowerCase() === "complete" && canCurrentUserViewTrip(t)
                  ? "Completed trips are read-only for field crew. Use View Closeout to review what was submitted."
                  : "Techs can operate trips they are assigned to. Admin / Dispatcher / Manager can act on any project trip from this desktop card."}
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
              borderRadius: 1,
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
                    This saves the project closeout and automatically creates/updates time entries for all assigned crew.
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
                          {formatTripScheduleLine(t)}
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
                          label={`Complete ${stageKey ? stageLabel(stageKey) : "Stage"}`}
                        />
                      ) : null}
                      <FormControlLabel
                        value="complete_project"
                        control={<Radio />}
                        label={isTmProject ? "No more field work expected" : "Complete entire project"}
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
                    inputProps={{ min: 0.25, step: "0.25" }}
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
                    These hours start from the trip timer when available, but the tech can adjust them before saving. They are then saved for all assigned project-trip crew.
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
          open={Boolean(closeoutDetailsTrip)}
          onClose={closeCloseoutDetails}
          fullWidth
          maxWidth="md"
          PaperProps={{
            sx: {
              borderRadius: 4,
            },
          }}
        >
          <DialogTitle sx={{ pb: 1.25 }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: -0.2 }}>
                  Trip Closeout
                </Typography>
                {closeoutDetailsTrip ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Submitted by {getCloseoutSubmittedBy(closeoutDetailsTrip)}
                    {getCloseoutHours(closeoutDetailsTrip) != null
                      ? ` • ${getCloseoutHours(closeoutDetailsTrip)?.toFixed(2)}h saved`
                      : ""}
                  </Typography>
                ) : null}
              </Box>

              <IconButton aria-label="Close closeout details" onClick={closeCloseoutDetails}>
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
          </DialogTitle>

          <DialogContent dividers>
            {closeoutDetailsTrip ? (
              <Stack spacing={2}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 4,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  }}
                >
                  <Stack spacing={0.75}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {formatTripScheduleLine(closeoutDetailsTrip)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {closeoutDetailsTrip.link?.projectStageKey
                        ? stageLabel(closeoutDetailsTrip.link.projectStageKey as StageKey)
                        : "Project Trip"}
                    </Typography>
                  </Stack>
                </Paper>

                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      xs: "1fr",
                      md: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
                    },
                  }}
                >
                  <CloseoutDetailBlock
                    icon={<DescriptionRoundedIcon fontSize="small" />}
                    title="Work Summary"
                  >
                    <Typography variant="body2" color="text.secondary">
                      {getCloseoutWorkSummary(closeoutDetailsTrip)}
                    </Typography>
                  </CloseoutDetailBlock>

                  <CloseoutDetailBlock icon={<GroupRoundedIcon fontSize="small" />} title="Crew">
                    <Stack spacing={0.75}>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Tech:</strong> {closeoutDetailsTrip.crew?.primaryTechName || "Unassigned"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Helper:</strong> {closeoutDetailsTrip.crew?.helperName || "—"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>2nd Tech:</strong> {closeoutDetailsTrip.crew?.secondaryTechName || "—"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>2nd Helper:</strong>{" "}
                        {closeoutDetailsTrip.crew?.secondaryHelperName || "—"}
                      </Typography>
                    </Stack>
                  </CloseoutDetailBlock>

                  <CloseoutDetailBlock
                    icon={<AccessTimeFilledRoundedIcon fontSize="small" />}
                    title="Time Summary"
                  >
                    <Stack spacing={0.75}>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Total labor:</strong>{" "}
                        {getCloseoutHours(closeoutDetailsTrip) != null
                          ? `${getCloseoutHours(closeoutDetailsTrip)?.toFixed(2)}h`
                          : "—"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Time entries:</strong> {getCloseoutTimeEntryStatus(closeoutDetailsTrip)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Saved:</strong>{" "}
                        {formatDateTime((closeoutDetailsTrip.closeout as any)?.savedAt)}
                      </Typography>
                    </Stack>
                  </CloseoutDetailBlock>

                  <CloseoutDetailBlock icon={<InfoRoundedIcon fontSize="small" />} title="Notes">
                    <Stack spacing={1}>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Outcome:</strong>{" "}
                        {safeTrim((closeoutDetailsTrip.closeout as any)?.outcome)
                          ? safeTrim((closeoutDetailsTrip.closeout as any)?.outcome).replaceAll("_", " ")
                          : "—"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>More work needed:</strong>{" "}
                        {safeTrim((closeoutDetailsTrip.closeout as any)?.needsMoreWork) === "yes"
                          ? "Yes"
                          : "No"}
                      </Typography>
                      <Divider />
                      <Typography variant="body2" color="text.secondary">
                        <strong>Materials:</strong> {getCloseoutMaterials(closeoutDetailsTrip)}
                      </Typography>
                    </Stack>
                  </CloseoutDetailBlock>
                </Box>
              </Stack>
            ) : null}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeCloseoutDetails}>Close</Button>
            {closeoutDetailsTrip && canCurrentUserEditTrip(closeoutDetailsTrip) ? (
              <Button
                variant="outlined"
                startIcon={<OpenInNewRoundedIcon />}
                onClick={() => {
                  const t = closeoutDetailsTrip;
                  closeCloseoutDetails();
                  openEditTrip(t);
                }}
                sx={{ borderRadius: 99 }}
              >
                Open Trip
              </Button>
            ) : null}
          </DialogActions>
        </Dialog>

        <Dialog
          open={projectOfficeDialog.open}
          onClose={projectOfficeDialog.saving ? undefined : closeProjectOfficeDialog}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: { borderRadius: 1 },
          }}
        >
          <DialogTitle sx={{ fontWeight: 900 }}>
            {projectOfficeStatusDialogTitle(projectOfficeDialog.nextStatus)}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              {projectOfficeDialog.nextStatus ? (
                <Alert severity="info" variant="outlined" sx={{ borderRadius: 1 }}>
                  {formatProjectOfficeStatus(projectOfficeStatus)} → {formatProjectOfficeStatus(projectOfficeDialog.nextStatus)}
                </Alert>
              ) : null}

              {projectOfficeDialog.nextStatus === "field_complete" ? (
                <Typography variant="body2" color="text.secondary">
                  Field work will be marked complete. This means no additional field trips are expected unless the project is reopened.
                </Typography>
              ) : null}

              {projectOfficeDialog.nextStatus === "ready_to_invoice" ? (
                <Typography variant="body2" color="text.secondary">
                  This moves the project into the front-office billing queue. Review closeouts, labor, materials, and notes before confirming.
                </Typography>
              ) : null}

              {projectOfficeDialog.nextStatus === "invoiced" ? (
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    This records the project as invoiced and locks it from normal scheduling and trip edits.
                  </Typography>
                  <TextField
                    label="Invoice #"
                    value={projectOfficeDialog.invoiceNumber}
                    onChange={(e) =>
                      setProjectOfficeDialog((prev) => ({ ...prev, invoiceNumber: e.target.value }))
                    }
                    fullWidth
                  />
                  <TextField
                    label="Invoice Date"
                    type="date"
                    value={projectOfficeDialog.invoiceDate}
                    onChange={(e) =>
                      setProjectOfficeDialog((prev) => ({ ...prev, invoiceDate: e.target.value }))
                    }
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                  <TextField
                    label="Invoice Notes"
                    value={projectOfficeDialog.invoiceNotes}
                    onChange={(e) =>
                      setProjectOfficeDialog((prev) => ({ ...prev, invoiceNotes: e.target.value }))
                    }
                    multiline
                    minRows={3}
                    fullWidth
                  />
                </Stack>
              ) : null}

              {projectOfficeDialog.nextStatus === "closed" ? (
                <Typography variant="body2" color="text.secondary">
                  This closes the project as historical. It can still be reopened by office staff if needed.
                </Typography>
              ) : null}

              {projectOfficeDialog.nextStatus === "active_work" ? (
                <TextField
                  label="Reopen Reason"
                  value={projectOfficeDialog.reopenReason}
                  onChange={(e) =>
                    setProjectOfficeDialog((prev) => ({ ...prev, reopenReason: e.target.value }))
                  }
                  placeholder="Example: Additional work requested / billing correction needed"
                  multiline
                  minRows={3}
                  fullWidth
                />
              ) : null}

              {projectOfficeDialog.error ? (
                <Alert severity="error">{projectOfficeDialog.error}</Alert>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeProjectOfficeDialog} disabled={projectOfficeDialog.saving}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={saveProjectOfficeStatus}
              disabled={projectOfficeDialog.saving}
              sx={{ borderRadius: 99, boxShadow: "none" }}
            >
              {projectOfficeDialog.saving ? "Saving..." : "Confirm"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={stageBillingDialog.open}
          onClose={stageBillingDialog.saving ? undefined : closeStageBillingDialog}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: { borderRadius: 1 },
          }}
        >
          <DialogTitle sx={{ fontWeight: 900 }}>
            {stageBillingDialog.stageKey && stageBillingDialog.action === "ready_to_bill"
              ? `Mark ${stageLabel(stageBillingDialog.stageKey)} Ready to Bill`
              : stageBillingDialog.stageKey && stageBillingDialog.action === "invoiced"
                ? `Record ${stageLabel(stageBillingDialog.stageKey)} Invoice`
                : stageBillingDialog.stageKey && stageBillingDialog.action === "reopen"
                  ? `Reopen ${stageLabel(stageBillingDialog.stageKey)} Billing`
                  : "Update Stage Billing"}
          </DialogTitle>
          <DialogContent dividers>
            {stageBillingDialog.stageKey ? (
              <Stack spacing={2}>
                <Alert severity="info" variant="outlined" sx={{ borderRadius: 1 }}>
                  This updates only the selected stage billing status. The overall project remains active until all required stages are invoiced and the project is closed.
                </Alert>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
                  <Stack spacing={0.75}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {stageLabel(stageBillingDialog.stageKey)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {(() => {
                        const meta = getStageBillingMeta(project?.projectType, stageBillingDialog.stageKey);
                        return `${meta.label}${meta.total ? ` of ${meta.total}` : ""}${meta.percent ? ` • ${meta.percent}% of bid` : ""}`;
                      })()}
                    </Typography>
                  </Stack>
                </Paper>

                {stageBillingDialog.action === "ready_to_bill" ? (
                  <Typography variant="body2" color="text.secondary">
                    This freezes this stage for office billing review. Stage trips and closeouts remain viewable, but normal trip edits should be reopened before changes are made.
                  </Typography>
                ) : null}

                {stageBillingDialog.action === "invoiced" ? (
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                      Record the invoice information for this stage only.
                    </Typography>
                    <TextField
                      label="Invoice #"
                      value={stageBillingDialog.invoiceNumber}
                      onChange={(e) =>
                        setStageBillingDialog((prev) => ({ ...prev, invoiceNumber: e.target.value }))
                      }
                      fullWidth
                    />
                    <TextField
                      label="Invoice Date"
                      type="date"
                      value={stageBillingDialog.invoiceDate}
                      onChange={(e) =>
                        setStageBillingDialog((prev) => ({ ...prev, invoiceDate: e.target.value }))
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <TextField
                      label="Invoice Notes"
                      value={stageBillingDialog.invoiceNotes}
                      onChange={(e) =>
                        setStageBillingDialog((prev) => ({ ...prev, invoiceNotes: e.target.value }))
                      }
                      multiline
                      minRows={3}
                      fullWidth
                    />
                  </Stack>
                ) : null}

                {stageBillingDialog.action === "reopen" ? (
                  <Typography variant="body2" color="text.secondary">
                    This reopens the selected stage billing status so office staff can make corrections. It does not delete trips or closeouts.
                  </Typography>
                ) : null}

                {stageBillingDialog.error ? <Alert severity="error">{stageBillingDialog.error}</Alert> : null}
              </Stack>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeStageBillingDialog} disabled={stageBillingDialog.saving}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={saveStageBillingStatus}
              disabled={stageBillingDialog.saving}
              sx={{ borderRadius: 99, boxShadow: "none" }}
            >
              {stageBillingDialog.saving ? "Saving..." : "Confirm"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={tmInvoiceDialog.open}
          onClose={tmInvoiceDialog.saving ? undefined : closeTmInvoiceDialog}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: { borderRadius: 1 },
          }}
        >
          <DialogTitle sx={{ fontWeight: 900 }}>Record T&M Billing Period Invoice</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Alert severity="info" variant="outlined" sx={{ borderRadius: 1 }}>
                This records the selected frozen T&M billing period as invoiced. Techs and helpers cannot do this step.
              </Alert>
              <TextField
                label="Invoice #"
                value={tmInvoiceDialog.invoiceNumber}
                onChange={(e) =>
                  setTmInvoiceDialog((prev) => ({ ...prev, invoiceNumber: e.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Invoice Date"
                type="date"
                value={tmInvoiceDialog.invoiceDate}
                onChange={(e) =>
                  setTmInvoiceDialog((prev) => ({ ...prev, invoiceDate: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Invoice Notes"
                value={tmInvoiceDialog.invoiceNotes}
                onChange={(e) =>
                  setTmInvoiceDialog((prev) => ({ ...prev, invoiceNotes: e.target.value }))
                }
                multiline
                minRows={3}
                fullWidth
              />
              {tmInvoiceDialog.error ? <Alert severity="error">{tmInvoiceDialog.error}</Alert> : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeTmInvoiceDialog} disabled={tmInvoiceDialog.saving}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={saveTmBillingPeriodInvoice}
              disabled={tmInvoiceDialog.saving}
              sx={{ borderRadius: 99, boxShadow: "none" }}
            >
              {tmInvoiceDialog.saving ? "Saving..." : "Save Invoice"}
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
                  borderRadius: 1,
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

                    {canCloseProject ? (
                      <Button
                        color="success"
                        variant="contained"
                        startIcon={<PaidRoundedIcon />}
                        onClick={() => openProjectOfficeDialog("closed")}
                        sx={{ borderRadius: 99, boxShadow: "none" }}
                      >
                        Close Project
                      </Button>
                    ) : null}

                    {canReopenClosedProject ? (
                      <Button
                        variant="outlined"
                        startIcon={<RefreshRoundedIcon />}
                        onClick={() => openProjectOfficeDialog("active_work")}
                        sx={{ borderRadius: 99 }}
                      >
                        Reopen Project
                      </Button>
                    ) : null}

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

              <SectionCard
                title="Project Basics"
                subtitle="Customer, project details, bid status, pricing, and stage billing breakdown."
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

                        <FormControl fullWidth>
                          <InputLabel>Bid Status</InputLabel>
                          <Select
                            label="Bid Status"
                            value={basicsDraft.bidStatus}
                            onChange={(e) =>
                              setBasicsDraft((prev) => ({
                                ...prev,
                                bidStatus: e.target.value as Project["bidStatus"],
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
                          value={basicsDraft.totalBidAmount}
                          onChange={(e) =>
                            setBasicsDraft((prev) => ({
                              ...prev,
                              totalBidAmount: e.target.value,
                            }))
                          }
                          fullWidth
                        />

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
                            Bid Breakdown Preview
                          </Typography>

                          {basicsDraft.projectType !== "time_materials" ? (
                            <Box
                              sx={{
                                display: "grid",
                                gap: 1.5,
                                gridTemplateColumns: {
                                  xs: "1fr",
                                  md: "repeat(3, minmax(0, 1fr))",
                                },
                              }}
                            >
                              <InfoField
                                label="Rough-In"
                                value={formatCurrency(previewStageAmounts.roughIn)}
                              />
                              <InfoField
                                label="Top-Out / Vent"
                                value={formatCurrency(previewStageAmounts.topOutVent)}
                              />
                              <InfoField
                                label="Trim / Finish"
                                value={formatCurrency(previewStageAmounts.trimFinish)}
                              />
                            </Box>
                          ) : (
                            <Alert severity="info" variant="outlined">
                              Time + Materials does not use fixed stage bid splits.
                            </Alert>
                          )}
                        </Stack>
                      </Paper>
                    </>
                  ) : (
                    <Stack spacing={2}>
                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                            lg: "repeat(3, minmax(0, 1fr))",
                          },
                        }}
                      >
                        <InfoField label="Customer / Contractor" value={project.customerDisplayName || "—"} />
                        <InfoField label="Project Name" value={project.projectName || "—"} />
                        <InfoField label="Project Type" value={formatProjectType(project.projectType)} />
                        <InfoField label="Status" value={project.active ? "Active" : "Inactive"} />
                        <InfoField label="Bid Status" value={formatBidStatus(project.bidStatus)} />
                        <InfoField label="Total Bid" value={formatCurrency(project.totalBidAmount)} />
                        <Box sx={{ gridColumn: { xs: "1 / -1", lg: "1 / -1" } }}>
                          <InfoField label="Description" value={project.description || "—"} />
                        </Box>
                      </Box>

                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 1,
                          bgcolor: alpha(theme.palette.primary.main, 0.03),
                        }}
                      >
                        <Stack spacing={1.5}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            Bid Breakdown
                          </Typography>

                          {project.projectType !== "time_materials" ? (
                            <Box
                              sx={{
                                display: "grid",
                                gap: 1.5,
                                gridTemplateColumns: {
                                  xs: "1fr",
                                  md: "repeat(3, minmax(0, 1fr))",
                                },
                              }}
                            >
                              <InfoField
                                label="Rough-In"
                                value={formatCurrency(project.roughIn?.billedAmount || 0)}
                              />
                              <InfoField
                                label="Top-Out / Vent"
                                value={formatCurrency(project.topOutVent?.billedAmount || 0)}
                              />
                              <InfoField
                                label="Trim / Finish"
                                value={formatCurrency(project.trimFinish?.billedAmount || 0)}
                              />
                            </Box>
                          ) : (
                            <Alert severity="info" variant="outlined">
                              Time + Materials does not use fixed stage bid splits.
                            </Alert>
                          )}
                        </Stack>
                      </Paper>
                    </Stack>
                  )}
                </Stack>
              </SectionCard>

              <SectionCard
                title="Job Site"
                subtitle="Address-first layout with Google map preview and a smart maps handoff for the field."
                icon={<MapRoundedIcon color="primary" />}
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
                      <AddressAutocompleteField
                        label="Search job site address"
                        value={projectAddressSearch}
                        onChange={(value) => {
                          setProjectAddressSearch(value);
                          markProjectAddressManual();
                        }}
                        onSelectAddress={handleProjectGoogleAddressSelected}
                        helperText="Start typing to search for a real address, or keep editing manually below."
                        placeholder="Start typing the project job site address..."
                        disabled={addressBidSaveBusy}
                      />

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          size="small"
                          label={
                            projectAddressSource === "google_places"
                              ? "Google suggested"
                              : "Manual entry"
                          }
                          color={projectAddressSource === "google_places" ? "primary" : "default"}
                          variant={projectAddressSource === "google_places" ? "filled" : "outlined"}
                          sx={{ borderRadius: 99, fontWeight: 700 }}
                        />
                      </Stack>

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
                          onChange={(e) => {
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceAddressLine1: e.target.value,
                            }));
                            markProjectAddressManual();
                          }}
                          fullWidth
                        />

                        <TextField
                          label="Address Line 2"
                          value={addressBidDraft.serviceAddressLine2}
                          onChange={(e) => {
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceAddressLine2: e.target.value,
                            }));
                            markProjectAddressManual();
                          }}
                          fullWidth
                        />

                        <TextField
                          label="City"
                          value={addressBidDraft.serviceCity}
                          onChange={(e) => {
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceCity: e.target.value,
                            }));
                            markProjectAddressManual();
                          }}
                          fullWidth
                        />

                        <TextField
                          label="State"
                          value={addressBidDraft.serviceState}
                          onChange={(e) => {
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              serviceState: e.target.value,
                            }));
                            markProjectAddressManual();
                          }}
                          fullWidth
                        />

                        <TextField
                          label="ZIP"
                          value={addressBidDraft.servicePostalCode}
                          onChange={(e) => {
                            setAddressBidDraft((prev) => ({
                              ...prev,
                              servicePostalCode: e.target.value,
                            }));
                            markProjectAddressManual();
                          }}
                          fullWidth
                        />
                      </Box>
                    </>
                  ) : null}

                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: {
                        xs: "1fr",
                        lg: "minmax(0, 1.5fr) minmax(320px, 0.9fr)",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        position: "relative",
                        minHeight: { xs: 260, md: 340 },
                        borderRadius: 1,
                        overflow: "hidden",
                        border: `1px solid ${theme.palette.divider}`,
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                      }}
                    >
                      {locationPreviewEmbedSrc ? (
                        <Box
                          component="iframe"
                          title="Job site map preview"
                          src={locationPreviewEmbedSrc}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          sx={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            border: 0,
                          }}
                        />
                      ) : (
                        <Stack
                          spacing={1}
                          alignItems="center"
                          justifyContent="center"
                          sx={{
                            position: "absolute",
                            inset: 0,
                            px: 3,
                            textAlign: "center",
                          }}
                        >
                          <MapRoundedIcon color="primary" sx={{ fontSize: 40 }} />
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            Map preview unavailable
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Save a complete address to show the Google map preview here.
                          </Typography>
                        </Stack>
                      )}
                    </Box>

                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2.25,
                        borderRadius: 1,
                        height: "100%",
                      }}
                    >
                      <Stack spacing={1.5} height="100%">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: "50%",
                              display: "grid",
                              placeItems: "center",
                              bgcolor: alpha(theme.palette.primary.main, 0.12),
                              color: "primary.main",
                              flex: "0 0 auto",
                            }}
                          >
                            <HomeWorkRoundedIcon fontSize="small" />
                          </Box>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                              Location Details
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Cleaner job-site view with a direct maps handoff.
                            </Typography>
                          </Box>
                        </Stack>

                        <Divider />

                        <Box>
                          <Typography variant="body1" sx={{ fontWeight: 700 }}>
                            {locationPreviewLine1 || "No address saved"}
                          </Typography>
                          {locationPreviewLine2 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {locationPreviewLine2}
                            </Typography>
                          ) : null}
                          {locationPreviewCityStatePostal ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {locationPreviewCityStatePostal}
                            </Typography>
                          ) : null}
                        </Box>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>

                          {locationPreviewGoogleMapsUrl ? (
                            <Button
                              component="a"
                              href={locationPreviewGoogleMapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              variant="outlined"
                              startIcon={<MapRoundedIcon />}
                              sx={{ borderRadius: 99 }}
                            >
                              Open Web Map
                            </Button>
                          ) : null}
                        </Stack>

                        <Typography variant="caption" color="text.secondary" sx={{ mt: "auto" }}>
                          Uses Google Maps for the embedded preview. The main button opens Apple Maps on iPhone/iPad and Google Maps elsewhere.
                        </Typography>
                      </Stack>
                    </Paper>
                  </Box>
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

                            <SectionCard
                title="Project Purchase Orders"
                subtitle="Project POs generated from project trips. Bid projects use P###. Time + Materials projects use T###."
                icon={<ReceiptLongRoundedIcon color="primary" />}
              >
                <Stack spacing={2}>
                  {poActionError ? <Alert severity="error">{poActionError}</Alert> : null}
                  {poActionSuccess ? <Alert severity="success">{poActionSuccess}</Alert> : null}
                  {purchaseOrdersError ? <Alert severity="error">{purchaseOrdersError}</Alert> : null}

                  {purchaseOrdersLoading ? (
                    <Typography color="text.secondary">Loading project purchase orders...</Typography>
                  ) : purchaseOrders.length === 0 ? (
                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 1 }}>
                      No project POs have been generated yet. Generate a PO from a project trip card when material is being ordered for this project.
                    </Alert>
                  ) : (
                    <Stack spacing={1.5}>
                      {purchaseOrders.map((po) => {
                        const attachment = getLatestPoAttachment(po);
                        const matched = safeTrim(po.status).toLowerCase() === "matched";

                        return (
                          <Paper
                            key={po.poCode}
                            variant="outlined"
                            sx={{
                              p: 2,
                              borderRadius: 1,
                              bgcolor: matched
                                ? alpha(theme.palette.success.main, 0.04)
                                : "background.paper",
                            }}
                          >
                            <Stack
                              direction={{ xs: "column", md: "row" }}
                              spacing={1.5}
                              justifyContent="space-between"
                              alignItems={{ xs: "stretch", md: "center" }}
                            >
                              <Stack spacing={0.75}>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Chip
                                    icon={<ReceiptLongRoundedIcon />}
                                    label={po.poCode}
                                    color="primary"
                                    variant="filled"
                                    size="small"
                                    sx={{ fontWeight: 900 }}
                                  />
                                  <Chip
                                    label={formatPoStatus(po.status)}
                                    color={poStatusColor(po.status)}
                                    variant={matched ? "filled" : "outlined"}
                                    size="small"
                                  />
                                  <Chip
                                    label={formatPoTripContext(po)}
                                    variant="outlined"
                                    size="small"
                                  />
                                </Stack>

                                <Typography variant="body2" color="text.secondary">
                                  Trip ID:{" "}
                                  <Box component="span" sx={{ fontFamily: "monospace" }}>
                                    {po.tripId}
                                  </Box>
                                </Typography>

                                {po.parsedInvoiceNumber ? (
                                  <Typography variant="body2" color="text.secondary">
                                    Invoice #{po.parsedInvoiceNumber}
                                    {typeof po.parsedInvoiceTotal === "number"
                                      ? ` • ${formatCurrency(po.parsedInvoiceTotal)}`
                                      : ""}
                                  </Typography>
                                ) : null}

                                {typeof po.importedMaterialCount === "number" && po.importedMaterialCount > 0 ? (
                                  <Typography variant="caption" color="text.secondary">
                                    Imported materials: {po.importedMaterialCount}
                                  </Typography>
                                ) : null}
                              </Stack>

                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<ContentCopyRoundedIcon />}
                                  onClick={() => copyPoCode(po.poCode)}
                                  sx={{ borderRadius: 99 }}
                                >
                                  Copy PO
                                </Button>

                                {attachment ? (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<OpenInNewRoundedIcon />}
                                    onClick={() => openProjectPoPdf(po)}
                                    sx={{ borderRadius: 99 }}
                                  >
                                    Open PDF
                                  </Button>
                                ) : null}
                              </Stack>
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}
                </Stack>
              </SectionCard>

                            <SectionCard
                title="Project Closeout & Billing"
                subtitle={projectHasStageBilling ? "Stage-based projects bill one stage at a time. Use each stage tab to mark Ready to Bill or Invoiced." : "Track field completion, office review, invoice readiness, and final project closure."}
                icon={<PaidRoundedIcon color="primary" />}
                action={
                  canUpdateProjectOfficeStatus ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {projectOfficeStatus === "active_work" ? (
                        <>
                          <Button
                            variant="outlined"
                            onClick={() => openProjectOfficeDialog("field_complete")}
                            sx={{ borderRadius: 99 }}
                          >
                            Mark Field Complete
                          </Button>
                          <Button
                            variant="contained"
                            onClick={() => openProjectOfficeDialog("ready_to_invoice")}
                            sx={{ borderRadius: 99, boxShadow: "none" }}
                          >
                            Mark Ready to Invoice
                          </Button>
                        </>
                      ) : null}

                      {projectOfficeStatus === "field_complete" ? (
                        <>
                          <Button
                            variant="contained"
                            onClick={() => openProjectOfficeDialog("ready_to_invoice")}
                            sx={{ borderRadius: 99, boxShadow: "none" }}
                          >
                            Mark Ready to Invoice
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => openProjectOfficeDialog("active_work")}
                            sx={{ borderRadius: 99 }}
                          >
                            Reopen Active Work
                          </Button>
                        </>
                      ) : null}

                      {projectOfficeStatus === "ready_to_invoice" ? (
                        <>
                          <Button
                            variant="contained"
                            onClick={() => openProjectOfficeDialog("invoiced")}
                            sx={{ borderRadius: 99, boxShadow: "none" }}
                          >
                            Mark Invoiced
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => openProjectOfficeDialog("active_work")}
                            sx={{ borderRadius: 99 }}
                          >
                            Reopen Active Work
                          </Button>
                        </>
                      ) : null}
                    </Stack>
                  ) : null
                }
              >
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip
                      label={formatProjectOfficeStatus(projectOfficeStatus)}
                      color={projectOfficeStatusColor(projectOfficeStatus)}
                      variant="filled"
                      sx={{ fontWeight: 800 }}
                    />
                    {projectFieldWorkLocked ? (
                      <Chip label={projectOfficeLocked ? "Locked history" : "Field work locked"} variant="outlined" size="small" />
                    ) : null}
                    {projectBillingSummary.openTrips > 0 ? (
                      <Chip
                        label={`${projectBillingSummary.openTrips} open trip${projectBillingSummary.openTrips === 1 ? "" : "s"}`}
                        color="warning"
                        variant="outlined"
                        size="small"
                      />
                    ) : (
                      <Chip label="No open trips" color="success" variant="outlined" size="small" />
                    )}
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {projectHasStageBilling
                      ? "This is an overview for the whole project. New Construction and Remodel billing actions live on each stage tab so one stage can be billed without closing the project."
                      : projectOfficeStatusHelper(projectOfficeStatus)}
                  </Typography>

                  {projectHasStageBilling ? (
                    <Box
                      sx={{
                        display: "grid",
                        gap: 1.5,
                        gridTemplateColumns: {
                          xs: "1fr",
                          md: `repeat(${Math.max(1, getEnabledStages(project.projectType).length)}, minmax(0, 1fr))`,
                        },
                      }}
                    >
                      {getEnabledStages(project.projectType).map((stageKey) => {
                        const stage = (project as any)[stageKey];
                        const status = getStageBillingStatus(stage);
                        const meta = getStageBillingMeta(project.projectType, stageKey);
                        return (
                          <Paper key={stageKey} variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                            <Stack spacing={0.75}>
                              <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                  {stageLabel(stageKey)}
                                </Typography>
                                <Chip
                                  label={formatStageBillingStatus(status)}
                                  color={stageBillingStatusColor(status)}
                                  variant={status === "not_ready" ? "outlined" : "filled"}
                                  size="small"
                                />
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {meta.label}{meta.percent ? ` • ${meta.percent}%` : ""}
                              </Typography>
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Box>
                  ) : null}

                  {projectFieldWorkLocked ? (
                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 1 }}>
                      This project is locked from normal scheduling and trip edits. Reopen active work if additional field work or corrections are needed.
                    </Alert>
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
                    <InfoField label="Office Status" value={formatProjectOfficeStatus(projectOfficeStatus)} />
                    <InfoField
                      label="Trip Review"
                      value={`${projectBillingSummary.completedTrips}/${projectBillingSummary.totalTrips} completed`}
                    />
                    <InfoField
                      label="Labor Captured"
                      value={`${projectBillingSummary.totalLaborHours.toFixed(2)}h`}
                    />
                    <InfoField
                      label="Time Entries"
                      value={
                        projectBillingSummary.completedTrips === 0
                          ? "No completed trips"
                          : projectBillingSummary.needsTimeEntryReview
                            ? "Needs review"
                            : "Synced"
                      }
                    />
                    <InfoField
                      label="Ready To Invoice"
                      value={(project as any).readyToInvoiceAt ? formatDateTime((project as any).readyToInvoiceAt) : "—"}
                    />
                    <InfoField
                      label="Invoice #"
                      value={(project as any).invoiceNumber || "—"}
                    />
                    <InfoField
                      label="Invoice Date"
                      value={(project as any).invoiceDate || "—"}
                    />
                    <InfoField
                      label="Invoiced At"
                      value={(project as any).invoicedAt ? formatDateTime((project as any).invoicedAt) : "—"}
                    />
                  </Box>
                </Stack>
              </SectionCard>

              {hasStages ? (
                <SectionCard
                  title="Stages"
                  subtitle="Stage details and stage trips are managed together."
                  icon={<ConstructionRoundedIcon color="primary" />}
                  action={
                    canEditProject && !projectFieldWorkLocked && !isFrozenStageBilling(activeStageTab) ? (
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
                    const activeStage = getProjectStage(activeStageTab) as any;
                    const activeStageBillingStatus = getStageBillingStatus(activeStage);
                    const activeStageBillingMeta = getStageBillingMeta(project.projectType, activeStageTab);
                    const activeStageBillingSummary = summarizeStageBillingTrips(activeStageTab);
                    const activeStageBillingAmount = Number(activeStage?.billedAmount || (previewStageAmounts as any)[activeStageTab] || 0);
                    const activeStageBillingFrozen = isFrozenStageBilling(activeStageTab);

                    return (
                      <Stack spacing={2}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: 1,
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

                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
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
                            borderRadius: 1,
                            bgcolor: alpha(theme.palette.warning.main, 0.035),
                          }}
                        >
                          <Stack spacing={2}>
                            <Stack
                              direction={{ xs: "column", md: "row" }}
                              spacing={1.5}
                              justifyContent="space-between"
                              alignItems={{ xs: "flex-start", md: "center" }}
                            >
                              <Box>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                  <PaidRoundedIcon color="primary" />
                                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                    Stage Billing
                                  </Typography>
                                  <Chip
                                    label={formatStageBillingStatus(activeStageBillingStatus)}
                                    color={stageBillingStatusColor(activeStageBillingStatus)}
                                    variant={activeStageBillingStatus === "not_ready" ? "outlined" : "filled"}
                                    size="small"
                                  />
                                </Stack>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                                  {activeStageBillingMeta.label}{activeStageBillingMeta.total ? ` of ${activeStageBillingMeta.total}` : ""}
                                  {activeStageBillingMeta.percent ? ` • ${activeStageBillingMeta.percent}% of bid` : ""}
                                </Typography>
                              </Box>

                              {canEditProject ? (
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {activeStageBillingStatus === "not_ready" ? (
                                    <Button
                                      variant="contained"
                                      color="warning"
                                      onClick={() => openStageBillingDialog(activeStageTab, "ready_to_bill")}
                                      disabled={activeStage.status !== "complete"}
                                      sx={{ borderRadius: 99, boxShadow: "none" }}
                                    >
                                      Mark Ready to Bill
                                    </Button>
                                  ) : null}

                                  {activeStageBillingStatus === "ready_to_bill" ? (
                                    <>
                                      <Button
                                        variant="contained"
                                        color="success"
                                        onClick={() => openStageBillingDialog(activeStageTab, "invoiced")}
                                        sx={{ borderRadius: 99, boxShadow: "none" }}
                                      >
                                        Record Invoiced
                                      </Button>
                                      <Button
                                        variant="outlined"
                                        onClick={() => openStageBillingDialog(activeStageTab, "reopen")}
                                        sx={{ borderRadius: 99 }}
                                      >
                                        Reopen Stage Billing
                                      </Button>
                                    </>
                                  ) : null}

                                  {activeStageBillingStatus === "invoiced" ? (
                                    <Button
                                      variant="outlined"
                                      onClick={() => openStageBillingDialog(activeStageTab, "reopen")}
                                      sx={{ borderRadius: 99 }}
                                    >
                                      Reopen Stage Billing
                                    </Button>
                                  ) : null}
                                </Stack>
                              ) : null}
                            </Stack>

                            {activeStage.status !== "complete" && activeStageBillingStatus === "not_ready" ? (
                              <Alert severity="info" variant="outlined" sx={{ borderRadius: 1 }}>
                                Complete this stage before marking it ready to bill.
                              </Alert>
                            ) : null}

                            {activeStageBillingFrozen ? (
                              <Alert severity="warning" variant="outlined" sx={{ borderRadius: 1 }}>
                                This stage billing is frozen. Reopen stage billing before changing trips or closeouts for this stage.
                              </Alert>
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
                              <InfoField label="Base Amount" value={formatCurrency(activeStageBillingAmount)} />
                              <InfoField label="Completed Trips" value={`${activeStageBillingSummary.completedTrips}/${activeStageBillingSummary.totalTrips}`} />
                              <InfoField label="Labor Captured" value={`${activeStageBillingSummary.totalHours.toFixed(2)}h`} />
                              <InfoField label="Materials Notes" value={activeStageBillingSummary.materialsCount} />
                              <InfoField
                                label="Time Entries"
                                value={
                                  activeStageBillingSummary.completedTrips === 0
                                    ? "No completed trips"
                                    : activeStageBillingSummary.needsTimeEntryReview
                                      ? "Needs review"
                                      : "Synced"
                                }
                              />
                              <InfoField
                                label="Ready To Bill"
                                value={activeStage?.readyToBillAt ? formatDateTime(activeStage.readyToBillAt) : "—"}
                              />
                              <InfoField label="Invoice #" value={activeStage?.invoiceNumber || "—"} />
                              <InfoField label="Invoice Date" value={activeStage?.invoiceDate || "—"} />
                            </Box>
                          </Stack>
                        </Paper>

                        <Paper
                          variant="outlined"
                          sx={{
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: 1,
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

                              {canEditProject && !projectFieldWorkLocked && !activeStageBillingFrozen ? (
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
                <>
                  {isTmProject ? (
                    <SectionCard
                      title="T&M Billing Periods"
                      subtitle="Freeze accumulated completed trips and materials into billing periods without itemizing every line for the field crew."
                      icon={<PaidRoundedIcon color="primary" />}
                      action={
                        canMarkTmFieldComplete ? (
                          <Button
                            variant="outlined"
                            onClick={() => void markTmProjectFieldComplete()}
                            sx={{ borderRadius: 99 }}
                          >
                            Mark Field Complete
                          </Button>
                        ) : null
                      }
                    >
                      <Stack spacing={2}>
                        <Alert severity="info" variant="outlined">
                          Completed T&M trips stay in the <strong>Current Period</strong> until someone marks <strong>Ready To Bill</strong>. That freezes the period for office billing and, unless the project is field complete, automatically starts a fresh current period for future accumulated work.
                        </Alert>

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
                          <InfoField label="Current Office Status" value={formatProjectOfficeStatus(projectOfficeStatus)} />
                          <InfoField label="Unbilled Completed Trips" value={projectBillingSummary.unbilledCompletedTrips} />
                          <InfoField label="Unbilled Labor" value={`${projectBillingSummary.unbilledCompletedHours.toFixed(2)}h`} />
                          <InfoField label="Unbilled Materials Notes" value={projectBillingSummary.unbilledMaterialsCount} />
                        </Box>

                        <Tabs
                          value={activeTmBillingTabData?.key || false}
                          onChange={(_, value) => setActiveTmBillingTab(value)}
                          variant="scrollable"
                          scrollButtons="auto"
                        >
                          {tmBillingTabs.map((tab) => (
                            <Tab key={tab.key} value={tab.key} label={tab.label} />
                          ))}
                        </Tabs>

                        {activeTmBillingTabData ? (
                          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 4 }}>
                            <Stack spacing={2}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                justifyContent="space-between"
                                alignItems={{ xs: "flex-start", sm: "center" }}
                              >
                                <Box>
                                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                    {activeTmBillingTabData.label}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {activeTmBillingTabData.isCurrentOpen
                                      ? "This tab shows completed T&M trips and materials that will be captured the next time Ready To Bill is used."
                                      : activeTmBillingTabData.period?.status === "invoiced"
                                        ? "This historical billing period is frozen and invoiced."
                                        : "This frozen billing period is ready for office billing review."}
                                  </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                  <Chip
                                    label={
                                      activeTmBillingTabData.isCurrentOpen
                                        ? "Open"
                                        : formatBillingPeriodStatus(activeTmBillingTabData.period?.status)
                                    }
                                    color={
                                      activeTmBillingTabData.isCurrentOpen
                                        ? "primary"
                                        : activeTmBillingTabData.period?.status === "invoiced"
                                          ? "success"
                                          : "warning"
                                    }
                                    variant="filled"
                                    size="small"
                                  />
                                  {activeTmBillingTabData.period?.invoiceNumber ? (
                                    <Chip label={`Invoice #${activeTmBillingTabData.period.invoiceNumber}`} size="small" variant="outlined" />
                                  ) : null}
                                </Stack>
                              </Stack>

                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {activeTmBillingTabData.isCurrentOpen && canMarkTmReadyToBill ? (
                                  <Button
                                    variant="contained"
                                    color="warning"
                                    onClick={() => void markTmCurrentPeriodReadyToBill()}
                                    disabled={activeTmBillingTabData.summary.tripCount === 0}
                                    sx={{ borderRadius: 99, boxShadow: "none" }}
                                  >
                                    Mark Current Period Ready to Bill
                                  </Button>
                                ) : null}

                                {!activeTmBillingTabData.isCurrentOpen &&
                                activeTmBillingTabData.period?.status === "ready_to_bill" &&
                                canInvoiceTmPeriods ? (
                                  <Button
                                    variant="contained"
                                    color="success"
                                    onClick={() => openTmInvoiceDialog(activeTmBillingTabData.period!.id)}
                                    sx={{ borderRadius: 99, boxShadow: "none" }}
                                  >
                                    Record Invoiced
                                  </Button>
                                ) : null}

                                {!activeTmBillingTabData.isCurrentOpen &&
                                activeTmBillingTabData.period?.status === "ready_to_bill" &&
                                canInvoiceTmPeriods ? (
                                  <Button
                                    variant="outlined"
                                    onClick={() => void reopenTmBillingPeriod(activeTmBillingTabData.period!.id)}
                                    sx={{ borderRadius: 99 }}
                                  >
                                    Reopen Frozen Period
                                  </Button>
                                ) : null}
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
                                <InfoField label="Trips" value={activeTmBillingTabData.summary.tripCount} />
                                <InfoField label="Labor Hours" value={`${activeTmBillingTabData.summary.totalHours.toFixed(2)}h`} />
                                <InfoField label="Materials Notes" value={activeTmBillingTabData.summary.materialsCount} />
                                <InfoField
                                  label="Date Range"
                                  value={
                                    activeTmBillingTabData.summary.dateFrom
                                      ? `${activeTmBillingTabData.summary.dateFrom}${activeTmBillingTabData.summary.dateTo && activeTmBillingTabData.summary.dateTo !== activeTmBillingTabData.summary.dateFrom ? ` → ${activeTmBillingTabData.summary.dateTo}` : ""}`
                                      : "—"
                                  }
                                />
                              </Box>

                              {activeTmBillingTabData.trips.length === 0 ? (
                                <Alert severity="info" variant="outlined">
                                  {activeTmBillingTabData.isCurrentOpen
                                    ? "No completed unbilled trips are sitting in the current period right now."
                                    : "No trips were captured in this billing period."}
                                </Alert>
                              ) : (
                                <Stack spacing={1.5}>
                                  {activeTmBillingTabData.trips.map((trip) => (
                                    <Card key={`${activeTmBillingTabData.key}-${trip.id}`} sx={{ borderRadius: 1, boxShadow: "none", border: `1px solid ${theme.palette.divider}` }}>
                                      <CardContent sx={{ p: 2 }}>
                                        <Stack spacing={1}>
                                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                              {formatTripScheduleLine(trip)}
                                            </Typography>
                                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                              <Chip label={`${(getCloseoutHours(trip) || 0).toFixed(2)}h`} size="small" variant="outlined" />
                                              {getTripMaterialsSummary(trip) ? <Chip label="Materials noted" size="small" variant="outlined" /> : null}
                                            </Stack>
                                          </Stack>
                                          <Typography variant="body2" color="text.secondary">
                                            {safeTrim(trip.crew?.primaryTechName) || "Unassigned"}
                                            {safeTrim(trip.crew?.helperName) ? ` • Helper: ${safeTrim(trip.crew?.helperName)}` : ""}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            <strong>Work:</strong> {getCloseoutWorkSummary(trip)}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            <strong>Materials:</strong> {getCloseoutMaterials(trip)}
                                          </Typography>
                                        </Stack>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </Stack>
                              )}
                            </Stack>
                          </Paper>
                        ) : null}
                      </Stack>
                    </SectionCard>
                  ) : null}

                <SectionCard
                  title={isTmProject ? "Project Trips" : "Project Trips"}
                  subtitle="This project type does not use stages. Trips are managed directly here."
                  icon={<RouteRoundedIcon color="primary" />}
                  action={
                    canEditProject && !projectFieldWorkLocked ? (
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
                </>
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
                                borderRadius: 1,
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
                            borderRadius: 1,
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
                                    borderRadius: 1,
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