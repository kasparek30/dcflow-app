// app/schedule/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  SwipeableDrawer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ViewWeekRoundedIcon from "@mui/icons-material/ViewWeekRounded";
import ViewDayRoundedIcon from "@mui/icons-material/ViewDayRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import SharedTripCard from "../../components/trips/SharedTripCard";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";

type ViewMode = "week" | "month" | "day";

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

type TripLink = {
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type TripConfirmedEntry = {
  hours: number;
  note?: string | null;
  confirmedAt: string;
};

type DispatchOverrideInfo = {
  enabled: boolean;
  reason: string | null;
  createdAt: string;
  createdByUid: string | null;
  createdByName: string | null;
  conflictTypes: string[];
  conflictTripIds: string[];
};

type TripDoc = {
  id: string;
  active: boolean;
  type?: "service" | "project" | string;
  status?: string;
  date?: string;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string;
  endTime?: string;
  crew?: TripCrew | null;
  link?: TripLink | null;
  outcome?: string | null;
  readyToBillAt?: string | null;
  confirmedBy?: Record<string, TripConfirmedEntry> | null;
  dispatchOverride?: DispatchOverrideInfo | null;
  createdAt?: string;
  updatedAt?: string;
};

type TechRow = {
  uid: string;
  name: string;
};

type EmployeeOption = {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
};

type HelperOption = {
  uid: string;
  name: string;
  laborRole: string;
  defaultPairedTechUid?: string | null;
};

type TicketSummary = {
  id: string;
  issueSummary: string;
  customerDisplayName: string;
  serviceAddressLine1: string;
  serviceCity: string;
};

type ProjectSummary = {
  id: string;
  name: string;
};

type ProjectStageOption = {
  key: string;
  label: string;
  status: string;
};

type TechFilterValue = "ALL" | "UNASSIGNED" | string;
type AddTripType = "service" | "project";
type HalfDaySlotKey = "am" | "pm";
type SlotKey = HalfDaySlotKey | "all_day";
type MeetingRoleFilter =
  | "all"
  | "technician"
  | "helper"
  | "apprentice"
  | "manager"
  | "dispatcher"
  | "admin";

type MonthAvailabilityMode = "leads" | "helpers" | "all_field";
type MonthAvailabilityStatus = "open" | "booked" | "partial" | "pto" | "other";

type CompanyHoliday = {
  id: string;
  date: string;
  name: string;
  active: boolean;
};

type PtoDay = {
  uid: string;
  employeeName: string;
  date: string;
  hours?: number | null;
  requestId: string;
  reason?: string | null;
};

type CompanyEvent = {
  id: string;
  active: boolean;
  type: "meeting" | string;
  title: string;
  date: string;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  appliesToRoles?: string[] | null;
  appliesToUids?: string[] | null;
  appliesToNames?: string[] | null;
  includeAllEmployees?: boolean;
  blocksSchedule?: boolean;
  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

type MeetingTimeEntryLite = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  entryDate: string;
  weekStartDate: string;
  weekEndDate: string;
  timesheetId?: string | null;
  entryStatus?: string;
};

type PickerItem = {
  id: string;
  label: string;
  sublabel?: string;
  metaRight?: string;
  metaLeft?: string;
  preview?: string;
  estimatedHours?: number | null;
  ticketStatus?: string | null;
  projectStageOptions?: ProjectStageOption[];
};

type AddSlotConflictSummary = {
  hardMessages: string[];
  softMessages: string[];
  softTripIds: string[];
};

type StaffCoverageDoc = {
  id: string;
  active: boolean;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  laborRoleType?: string | null;
  workType: "dispatch" | "billing" | "office" | "admin" | "shop" | "other" | string;
  date: string;
  startTime: string;
  endTime: string;
  scheduledHours: number;
  status: "scheduled" | "clocked_in" | "completed" | "cancelled" | string;
  notes?: string | null;
};

type TripHelperSlot = "helper" | "secondaryHelper" | "add";

type TripHelperEntry = {
  slot: Exclude<TripHelperSlot, "add">;
  uid: string;
  name: string;
};

const MEETING_ELIGIBLE_ROLES = [
  "technician",
  "helper",
  "apprentice",
  "manager",
  "dispatcher",
  "admin",
] as const;

const MEETING_ROLE_FILTERS: Array<{ value: MeetingRoleFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "technician", label: "Techs" },
  { value: "helper", label: "Helpers" },
  { value: "apprentice", label: "Apprentices" },
  { value: "manager", label: "Managers" },
  { value: "dispatcher", label: "Dispatch" },
  { value: "admin", label: "Admins" },
];

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

function isWeekend(d: Date) {
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}

function startOfWorkWeek(d: Date) {
  const wd = d.getDay();
  const diffToMon = (wd + 6) % 7;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - diffToMon);
  return out;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function workWeekDays(weekStartMonday: Date) {
  return [0, 1, 2, 3, 4].map((i) => addDays(weekStartMonday, i));
}

function formatDow(d: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function formatShort(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateLong(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "Choose a date";

  const d = fromIsoDate(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function nowIso() {
  return new Date().toISOString();
}

function todayIsoLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toIsoDate(d);
}

function normalizeStatus(s?: string) {
  return (s || "").trim().toLowerCase();
}

function normalizeRole(role?: string | null) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function isMeetingEligibleRole(role?: string | null) {
  return MEETING_ELIGIBLE_ROLES.includes(normalizeRole(role) as (typeof MEETING_ELIGIBLE_ROLES)[number]);
}

function formatRoleLabel(role?: string | null) {
  const raw = normalizeRole(role);
  if (!raw) return "Employee";
  return raw
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function uniqueTrimmedStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeTicketStatus(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "")
    .replaceAll("-", "_");
}

function ticketIsSchedulableByStatus(d: any) {
  const st = normalizeTicketStatus(d?.status);
  return st === "new" || st === "followup" || st === "follow_up";
}

function normalizeProjectStatusValue(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

function projectIsSchedulableByStatus(d: any) {
  const active = typeof d?.active === "boolean" ? d.active : true;
  if (!active) return false;

  const statusValues = [
    d?.status,
    d?.projectStatus,
    d?.officeStatus,
    d?.workflowStatus,
    d?.lifecycleStatus,
    d?.fieldStatus,
    d?.billingStatus,
    d?.invoiceStatus,
    d?.billing?.status,
    d?.billing?.invoiceStatus,
  ]
    .map(normalizeProjectStatusValue)
    .filter(Boolean);

  const closedStatuses = new Set([
    "invoiced",
    "invoice_created",
    "invoice_sent",
    "paid",
    "closed",
    "archived",
    "cancelled",
    "canceled",
    "complete",
    "completed",
    "project_complete",
    "field_complete",
    "ready_to_invoice",
    "ready_to_bill",
    "billed",
  ]);

  if (statusValues.some((status) => closedStatuses.has(status))) return false;

  // When old project documents do not have a status yet, keep active=true projects visible.
  return true;
}


function normalizeProjectType(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

function normalizeStageStatus(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_")
    .replaceAll("/", "_");
}

function stageKeyAliases(stageKey: string) {
  const key = String(stageKey || "").trim();

  const known: Record<string, string[]> = {
    roughIn: ["roughIn", "rough_in", "rough-in", "rough", "roughInStage"],
    topOutVent: [
      "topOutVent",
      "top_out_vent",
      "top-out-vent",
      "topOut",
      "top_out",
      "top-out",
      "vent",
      "topOutVentStage",
    ],
    trimFinish: [
      "trimFinish",
      "trim_finish",
      "trim-finish",
      "trim",
      "finish",
      "trimFinishStage",
    ],
  };

  const baseAliases = known[key] || [key];

  return Array.from(
    new Set(
      [
        ...baseAliases,
        key,
        key.replaceAll("_", ""),
        key.replaceAll("-", ""),
        key.replaceAll("_", "-"),
        key.replaceAll("-", "_"),
      ].filter(Boolean)
    )
  );
}

function getObjectValueByStageAlias(source: any, stageKey: string) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;

  const aliases = stageKeyAliases(stageKey);

  for (const alias of aliases) {
    if (source?.[alias]) return source[alias];
  }

  return null;
}

function findArrayEntryByStageAlias(source: any, stageKey: string) {
  if (!Array.isArray(source)) return null;

  const aliases = new Set(
    stageKeyAliases(stageKey).map((value) => normalizeStageStatus(value))
  );

  return (
    source.find((item) => {
      const candidates = [
        item?.key,
        item?.id,
        item?.stageKey,
        item?.projectStageKey,
        item?.stage,
        item?.name,
        item?.label,
        item?.title,
      ];

      return candidates
        .map((value) => normalizeStageStatus(value))
        .filter(Boolean)
        .some((value) => aliases.has(value));
    }) || null
  );
}

function getStageScopedData(projectData: any, stageKey: string) {
  // Project Detail stores the canonical staged-project objects directly on the
  // project doc as roughIn / topOutVent / trimFinish. Keep those top-level
  // objects first so Schedule reads the same source of truth.
  const directStage = getObjectValueByStageAlias(projectData, stageKey);

  const stage =
    directStage ||
    getObjectValueByStageAlias(projectData?.stages, stageKey) ||
    findArrayEntryByStageAlias(projectData?.stages, stageKey) ||
    getObjectValueByStageAlias(projectData?.projectStages, stageKey) ||
    findArrayEntryByStageAlias(projectData?.projectStages, stageKey) ||
    null;

  const stageBilling =
    directStage?.billing ||
    directStage ||
    getObjectValueByStageAlias(projectData?.stageBilling, stageKey) ||
    getObjectValueByStageAlias(projectData?.stageBillings, stageKey) ||
    getObjectValueByStageAlias(projectData?.billingStages, stageKey) ||
    getObjectValueByStageAlias(projectData?.billing?.stages, stageKey) ||
    getObjectValueByStageAlias(projectData?.billing?.stageBilling, stageKey) ||
    getObjectValueByStageAlias(projectData?.billing?.stageBillings, stageKey) ||
    getObjectValueByStageAlias(projectData?.stageCloseouts, stageKey) ||
    getObjectValueByStageAlias(projectData?.closeouts, stageKey) ||
    findArrayEntryByStageAlias(projectData?.stageBilling, stageKey) ||
    findArrayEntryByStageAlias(projectData?.stageBillings, stageKey) ||
    findArrayEntryByStageAlias(projectData?.billingStages, stageKey) ||
    findArrayEntryByStageAlias(projectData?.billing?.stages, stageKey) ||
    findArrayEntryByStageAlias(projectData?.billing?.stageBilling, stageKey) ||
    findArrayEntryByStageAlias(projectData?.billing?.stageBillings, stageKey) ||
    findArrayEntryByStageAlias(projectData?.stageCloseouts, stageKey) ||
    findArrayEntryByStageAlias(projectData?.closeouts, stageKey) ||
    null;

  return { stage, stageBilling };
}

function stageStatusMapValue(mapPath: any, stageKey: string) {
  if (!mapPath || typeof mapPath !== "object" || Array.isArray(mapPath)) return "";

  for (const alias of stageKeyAliases(stageKey)) {
    const value = mapPath?.[alias];
    if (String(value || "").trim()) return value;
  }

  return "";
}

function isOpenProjectStageStatus(value: any) {
  const status = normalizeStageStatus(value);

  if (!status) return true;

  const closedStatuses = new Set([
    "complete",
    "completed",
    "field_complete",
    "ready_to_invoice",
    "ready_to_bill",
    "invoiced",
    "invoice_created",
    "invoice_sent",
    "paid",
    "closed",
    "archived",
    "cancelled",
    "canceled",
    "billed",
  ]);

  return !closedStatuses.has(status);
}

function projectStageLabel(stageKey: string) {
  const key = String(stageKey || "").trim();

  const labels: Record<string, string> = {
    roughIn: "Rough-In",
    topOutVent: "Top-Out / Vent",
    trimFinish: "Trim / Finish",
    billingPeriod: "Billing Period",
    currentBillingPeriod: "Current Billing Period",
  };

  if (labels[key]) return labels[key];

  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function stageStatusFromProjectData(projectData: any, stageKey: string) {
  const key = String(stageKey || "").trim();
  if (!key) return "not_started";

  const { stage, stageBilling } = getStageScopedData(projectData, key);

  // Match Project Detail behavior: stage billingStatus / billed state freezes a
  // stage even when the field-work status remains not_started/scheduled.
  const billingCandidates = [
    stage?.billingStatus,
    stage?.invoiceStatus,
    stage?.billing?.status,
    stage?.billing?.billingStatus,
    stage?.billing?.invoiceStatus,

    stageBilling?.billingStatus,
    stageBilling?.invoiceStatus,
    stageBilling?.status,
    stageBilling?.stageStatus,
    stageBilling?.workflowStatus,
    stageBilling?.fieldStatus,
    stageBilling?.closeoutStatus,

    stageStatusMapValue(projectData?.stageBillingStatuses, key),
    stageStatusMapValue(projectData?.stageBillingStatus, key),
    stageStatusMapValue(projectData?.billing?.stageBillingStatus, key),
    stageStatusMapValue(projectData?.billing?.stageInvoiceStatus, key),

    projectData?.[`${key}BillingStatus`],
    projectData?.[`${key}InvoiceStatus`],
  ];

  const billingStatus = billingCandidates
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (billingStatus) return billingStatus;

  if (stage?.billed === true || stageBilling?.billed === true) return "invoiced";

  const billingMarkers = [
    stage?.readyToBillAt,
    stage?.invoicedAt,
    stage?.invoiceDate,
    stage?.invoiceNumber,
    stage?.invoiceId,
    stage?.billing?.readyToBillAt,
    stage?.billing?.invoicedAt,
    stage?.billing?.invoiceDate,
    stage?.billing?.invoiceNumber,
    stage?.billing?.invoiceId,
    stageBilling?.readyToBillAt,
    stageBilling?.invoicedAt,
    stageBilling?.invoiceDate,
    stageBilling?.invoiceNumber,
    stageBilling?.invoiceId,
    stageStatusMapValue(projectData?.billing?.stageInvoicedAt, key),
    stageStatusMapValue(projectData?.billing?.stageInvoiceDate, key),
    stageStatusMapValue(projectData?.billing?.stageInvoiceNumber, key),
  ];

  if (billingMarkers.some((value) => String(value || "").trim())) return "invoiced";

  const fieldCandidates = [
    stage?.status,
    stage?.stageStatus,
    stage?.workflowStatus,
    stage?.fieldStatus,
    stage?.closeoutStatus,

    stageStatusMapValue(projectData?.stageStatuses, key),
    stageStatusMapValue(projectData?.stageStatus, key),
    stageStatusMapValue(projectData?.stagesStatus, key),
    stageStatusMapValue(projectData?.stageWorkflowStatus, key),
    stageStatusMapValue(projectData?.billing?.stageStatuses, key),
    stageStatusMapValue(projectData?.billing?.stageStatus, key),

    projectData?.[`${key}Status`],
  ];

  const fieldStatus = fieldCandidates
    .map((value) => String(value || "").trim())
    .find(Boolean);

  if (fieldStatus) return fieldStatus;

  const completedMarkers = [
    stage?.completedAt,
    stage?.completedDate,
    stage?.fieldCompletedAt,
    stage?.fieldCompletedDate,
    stageBilling?.completedAt,
    stageBilling?.completedDate,
    stageStatusMapValue(projectData?.stageCompletedAt, key),
    stageStatusMapValue(projectData?.stageCompletedDate, key),
  ];

  if (completedMarkers.some((value) => String(value || "").trim())) return "complete";

  return "not_started";
}

function extractProjectStageOptions(projectData: any): ProjectStageOption[] {
  const type = normalizeProjectType(
    projectData?.projectType ??
      projectData?.type ??
      projectData?.jobType ??
      projectData?.billingType ??
      projectData?.contractType
  );

  const knownStageKeys =
    type === "new_construction" || type === "newconstruction"
      ? ["roughIn", "topOutVent", "trimFinish"]
      : type === "remodel"
        ? ["roughIn", "trimFinish"]
        : [] as string[];

  const stageKeysFromObject =
    projectData?.stages && typeof projectData.stages === "object" && !Array.isArray(projectData.stages)
      ? Object.keys(projectData.stages)
      : [];

  const billingPeriods =
    Array.isArray(projectData?.billingPeriods)
      ? projectData.billingPeriods
      : Array.isArray(projectData?.billing?.periods)
        ? projectData.billing.periods
        : [];

  if (
    type === "time_materials" ||
    type === "time_and_materials" ||
    type === "t_m" ||
    type === "tm"
  ) {
    const periodOptions = billingPeriods
      .map((period: any, index: number) => {
        const key = String(period?.id ?? period?.key ?? period?.billingPeriodId ?? `billingPeriod_${index + 1}`).trim();
        const label = String(period?.label ?? period?.name ?? period?.title ?? `Billing Period ${index + 1}`).trim();
        const status = String(period?.status ?? period?.billingStatus ?? "open").trim() || "open";

        if (!key || !isOpenProjectStageStatus(status)) return null;

        return {
          key,
          label,
          status,
        } satisfies ProjectStageOption;
      })
      .filter(Boolean) as ProjectStageOption[];

    if (periodOptions.length) return periodOptions;

    return [
      {
        key: "currentBillingPeriod",
        label: "Current Billing Period",
        status: "open",
      },
    ];
  }

  const stageKeys = Array.from(
    new Set([
      ...knownStageKeys,
      ...stageKeysFromObject,
    ])
  ).filter(Boolean);

  return stageKeys
    .map((stageKey) => {
      const { stage: stageData } = getStageScopedData(projectData, stageKey);
      const status = stageStatusFromProjectData(projectData, stageKey);

      if (!isOpenProjectStageStatus(status)) return null;

      return {
        key: stageKey,
        label: String(stageData?.label ?? stageData?.name ?? stageData?.title ?? projectStageLabel(stageKey)).trim(),
        status,
      } satisfies ProjectStageOption;
    })
    .filter(Boolean) as ProjectStageOption[];
}

function projectStageStatusLabel(status: string) {
  const normalized = normalizeStageStatus(status);
  if (!normalized || normalized === "not_started") return "Not Started";
  if (normalized === "in_progress") return "In Progress";
  if (normalized === "scheduled") return "Scheduled";
  if (normalized === "open") return "Open";

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isCompletedStatus(status?: string) {
  const s = normalizeStatus(status);
  return s === "complete" || s === "completed";
}

function isInProgressStatus(status?: string) {
  return normalizeStatus(status) === "in_progress";
}

function isPlannedStatus(status?: string) {
  return normalizeStatus(status) === "planned";
}

function primaryTechUid(t: TripDoc) {
  return String(t.crew?.primaryTechUid || "").trim();
}

function isTechOnTrip(t: TripDoc, techUid: string) {
  const uid = String(techUid || "").trim();
  if (!uid) return false;
  const primary = String(t.crew?.primaryTechUid || "").trim();
  const secondary = String(t.crew?.secondaryTechUid || "").trim();
  return primary === uid || secondary === uid;
}

function isEmployeeOnTrip(t: TripDoc, employeeUid: string) {
  const uid = String(employeeUid || "").trim();
  if (!uid) return false;

  return [
    t.crew?.primaryTechUid,
    t.crew?.helperUid,
    t.crew?.secondaryTechUid,
    t.crew?.secondaryHelperUid,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .includes(uid);
}

function tripRowUids(t: TripDoc): string[] {
  const uids = [
    String(t.crew?.primaryTechUid || "").trim(),
    String(t.crew?.secondaryTechUid || "").trim(),
  ].filter(Boolean);
  return Array.from(new Set(uids));
}

function formatWindowLabel(w?: string) {
  const x = (w || "").toLowerCase();
  if (x === "am") return "AM";
  if (x === "pm") return "PM";
  if (x === "all_day") return "All Day";
  if (x === "custom") return "Custom";
  return w || "—";
}

function parseHHMM(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return { hh, mm };
}

function minutesFromHHMM(hhmm?: string) {
  const p = parseHHMM(hhmm);
  if (!p) return null;
  return p.hh * 60 + p.mm;
}

function formatTime12h(hhmm?: string) {
  const p = parseHHMM(hhmm);
  if (!p) return "—";
  let hh = p.hh;
  const mm = p.mm;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mm === 0) return `${hh}${ampm}`;
  return `${hh}:${pad2(mm)}${ampm}`;
}

function compactTimeLabel(start?: string | null, end?: string | null) {
  const s = String(start || "").trim();
  const e = String(end || "").trim();

  if (!s || !e) return "";

  const sParsed = parseHHMM(s);
  const eParsed = parseHHMM(e);
  if (!sParsed || !eParsed) return "";

  const startText = formatTime12h(s);
  const endText = formatTime12h(e);

  const startHasMinutes = sParsed.mm !== 0;
  const endHasMinutes = eParsed.mm !== 0;

  const startCompact = startHasMinutes
    ? startText.replace("AM", "").replace("PM", "")
    : startText.replace(":00", "").replace("AM", "").replace("PM", "");

  const endCompact = endHasMinutes ? endText : endText.replace(":00", "");

  return `${startCompact}–${endCompact}`;
}

function meetingChipLabel(e: CompanyEvent) {
  const w = String(e.timeWindow || "").toLowerCase();

  if (w === "all_day") return `${e.title} • All Day`;
  if (w === "am") return `${e.title} • AM`;
  if (w === "pm") return `${e.title} • PM`;

  if (w === "custom" && e.startTime && e.endTime) {
    return `${e.title} • ${compactTimeLabel(e.startTime, e.endTime)}`;
  }

  return e.title;
}

function getPtoSummaryForDate(
  dateIso: string,
  ptoByUidByDate: Record<string, Record<string, PtoDay>>
) {
  let count = 0;
  let totalHours = 0;

  for (const uid of Object.keys(ptoByUidByDate)) {
    const day = ptoByUidByDate[uid]?.[dateIso];
    if (!day) continue;

    count += 1;
    const hrs = Number(day.hours);
    if (Number.isFinite(hrs) && hrs > 0) totalHours += hrs;
  }

  return {
    count,
    totalHours,
  };
}

function formatTimeRangeForCard(t: TripDoc) {
  const w = (t.timeWindow || "").toLowerCase();
  if (w === "all_day") return "All Day";
  if (w === "am") return "AM";
  if (w === "pm") return "PM";

  const compact = compactTimeLabel(t.startTime, t.endTime);
  if (compact) return compact;

  return formatWindowLabel(t.timeWindow);
}

function compareTripTime(a: TripDoc, b: TripDoc) {
  const aKey = `${a.startTime || "99:99"}_${a.endTime || "99:99"}_${a.id}`;
  const bKey = `${b.startTime || "99:99"}_${b.endTime || "99:99"}_${b.id}`;
  return aKey.localeCompare(bKey);
}

function nextWorkday(d: Date) {
  let cur = addDays(d, 1);
  while (isWeekend(cur)) cur = addDays(cur, 1);
  return cur;
}

function prevWorkday(d: Date) {
  let cur = addDays(d, -1);
  while (isWeekend(cur)) cur = addDays(cur, -1);
  return cur;
}

function getPayrollWeekBounds(entryDateIso: string) {
  const [y, m, d] = entryDateIso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);

  const wd = dt.getDay();
  const diffToMon = (wd + 6) % 7;
  const weekStart = new Date(dt);
  weekStart.setDate(weekStart.getDate() - diffToMon);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return { weekStartDate: toIsoDate(weekStart), weekEndDate: toIsoDate(weekEnd) };
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

function defaultMeetingHours(window: string, startTime?: string | null, endTime?: string | null) {
  const w = String(window || "").toLowerCase();
  if (w === "all_day") return 8;
  if (w === "am") return 4;
  if (w === "pm") return 4;

  const sMin = minutesFromHHMM(String(startTime || "")) ?? null;
  const eMin = minutesFromHHMM(String(endTime || "")) ?? null;
  if (sMin != null && eMin != null && eMin > sMin) {
    return Math.round(((eMin - sMin) / 60) * 4) / 4;
  }
  return 1;
}

function isLockedWeeklyTimesheetStatus(status?: string) {
  const s = String(status || "").toLowerCase().trim();
  return s === "submitted" || s === "approved" || s === "exported_to_quickbooks" || s === "exported";
}

function monthCalendarWorkWeeks(anchor: Date) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  const firstOfMonth = new Date(y, m, 1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const lastOfMonth = new Date(y, m + 1, 0);
  lastOfMonth.setHours(0, 0, 0, 0);

  const gridStart = startOfWorkWeek(firstOfMonth);

  let gridEnd = new Date(lastOfMonth);
  const wd = gridEnd.getDay();
  const diffToFri = (5 - wd + 7) % 7;
  gridEnd = addDays(gridEnd, diffToFri);

  const weeks: Array<Array<Date | null>> = [];
  let cur = new Date(gridStart);

  while (cur <= gridEnd) {
    const row: Array<Date | null> = [];
    for (let i = 0; i < 5; i++) {
      const d = addDays(cur, i);
      row.push(d.getMonth() === m ? d : null);
    }
    weeks.push(row);
    cur = addDays(cur, 7);
  }

  return weeks;
}

const SLOT_AM_START = 8 * 60;
const SLOT_AM_END = 12 * 60;
const SLOT_PM_START = 13 * 60;
const SLOT_PM_END = 17 * 60;

function tripBlocksSlot(t: TripDoc, slot: HalfDaySlotKey) {
  const w = String(t.timeWindow || "").toLowerCase();
  if (t.active === false) return false;
  if (normalizeStatus(t.status) === "cancelled") return false;

  if (w === "all_day") return true;
  if (w === "am") return slot === "am";
  if (w === "pm") return slot === "pm";

  const stMin = minutesFromHHMM(t.startTime) ?? null;
  const etMin = minutesFromHHMM(t.endTime) ?? null;
  if (stMin == null || etMin == null || etMin <= stMin) return true;

  const [slotStart, slotEnd] =
    slot === "am" ? [SLOT_AM_START, SLOT_AM_END] : [SLOT_PM_START, SLOT_PM_END];

  return stMin < slotEnd && etMin > slotStart;
}

function eventBlocksSlot(e: CompanyEvent, slot: HalfDaySlotKey) {
  if (!e.active || !e.blocksSchedule) return false;

  const w = String(e.timeWindow || "").toLowerCase();
  if (w === "all_day") return true;
  if (w === "am") return slot === "am";
  if (w === "pm") return slot === "pm";

  const stMin = minutesFromHHMM(String(e.startTime || "")) ?? null;
  const etMin = minutesFromHHMM(String(e.endTime || "")) ?? null;
  if (stMin == null || etMin == null || etMin <= stMin) return true;

  const [slotStart, slotEnd] =
    slot === "am" ? [SLOT_AM_START, SLOT_AM_END] : [SLOT_PM_START, SLOT_PM_END];

  return stMin < slotEnd && etMin > slotStart;
}

function selectedSlotsForWindow(
  windowValue: string,
  startTime?: string | null,
  endTime?: string | null
): HalfDaySlotKey[] {
  const w = String(windowValue || "").toLowerCase();

  if (w === "all_day") return ["am", "pm"];
  if (w === "am" || w === "pm") return [w];

  const stMin = minutesFromHHMM(String(startTime || "")) ?? null;
  const etMin = minutesFromHHMM(String(endTime || "")) ?? null;
  if (stMin == null || etMin == null || etMin <= stMin) return ["am", "pm"];

  const slots: HalfDaySlotKey[] = [];
  if (stMin < SLOT_AM_END && etMin > SLOT_AM_START) slots.push("am");
  if (stMin < SLOT_PM_END && etMin > SLOT_PM_START) slots.push("pm");

  return slots.length ? slots : ["am", "pm"];
}

function tripBlocksMeetingWindow(
  t: TripDoc,
  windowValue: string,
  startTime?: string | null,
  endTime?: string | null
) {
  return selectedSlotsForWindow(windowValue, startTime, endTime).some((slot) => tripBlocksSlot(t, slot));
}

function eventBlocksMeetingWindow(
  e: CompanyEvent,
  windowValue: string,
  startTime?: string | null,
  endTime?: string | null
) {
  return selectedSlotsForWindow(windowValue, startTime, endTime).some((slot) => eventBlocksSlot(e, slot));
}

function looksApprovedPto(d: any) {
  const status = String(d.status ?? d.requestStatus ?? "").toLowerCase().trim();
  const approvedBool = Boolean(d.approved ?? d.isApproved ?? false);
  return approvedBool || status === "approved";
}

function extractEmployeeUid(d: any) {
  return String(d.employeeId ?? d.employeeUid ?? d.uid ?? d.userId ?? "").trim();
}

function extractEmployeeName(d: any) {
  return String(d.employeeName ?? d.displayName ?? d.name ?? "").trim();
}

function extractPtoDates(d: any): string[] {
  const single = String(d.date ?? d.ptoDate ?? d.day ?? d.requestDate ?? "").trim();
  if (single && /^\d{4}-\d{2}-\d{2}$/.test(single)) return [single];

  const start = String(d.startDate ?? d.fromDate ?? d.start ?? "").trim();
  const end = String(d.endDate ?? d.toDate ?? d.end ?? "").trim();

  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const s = fromIsoDate(start);
    const e = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? fromIsoDate(end) : s;

    const out: string[] = [];
    const cur = new Date(s);
    cur.setHours(0, 0, 0, 0);
    const endDt = new Date(e);
    endDt.setHours(0, 0, 0, 0);

    while (cur <= endDt) {
      out.push(toIsoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  return [];
}

function eventAppliesToUid(e: CompanyEvent, uid?: string | null, role?: string | null) {
  const cleanUid = String(uid || "").trim();
  const attendeeUids = uniqueTrimmedStrings(e.appliesToUids || []);
  if (attendeeUids.length > 0) {
    if (!cleanUid) return false;
    return attendeeUids.includes(cleanUid);
  }

  const roles = uniqueTrimmedStrings(e.appliesToRoles || []).map((item) => normalizeRole(item));
  if (roles.length === 0) return true;
  return roles.includes(normalizeRole(role));
}

function splitTripsBySlot(cellTrips: TripDoc[]) {
  const am: TripDoc[] = [];
  const pm: TripDoc[] = [];

  for (const t of cellTrips) {
    const w = String(t.timeWindow || "").toLowerCase();
    if (w === "pm") {
      pm.push(t);
      continue;
    }
    if (w === "am" || w === "all_day") {
      am.push(t);
      continue;
    }

    const stMin = minutesFromHHMM(t.startTime) ?? null;
    if (stMin == null) {
      am.push(t);
      continue;
    }
    if (stMin >= SLOT_PM_START) pm.push(t);
    else am.push(t);
  }

  am.sort(compareTripTime);
  pm.sort(compareTripTime);

  const amIds = new Set(am.map((x) => x.id));
  return { amTrips: am, pmTrips: pm.filter((x) => !amIds.has(x.id)) };
}

function computeCellAvailability(args: {
  rowKey: string;
  iso: string;
  cellTrips: TripDoc[];
  eventsByDate: Record<string, CompanyEvent[]>;
  holidayByDate: Record<string, CompanyHoliday>;
  ptoByUidByDate: Record<string, Record<string, PtoDay>>;
}) {
  const { rowKey, iso, cellTrips, eventsByDate, holidayByDate, ptoByUidByDate } = args;
  const meetings =
    rowKey === "UNASSIGNED"
      ? []
      : (eventsByDate[iso] || []).filter((event) => eventAppliesToUid(event, rowKey, "technician"));

  const holiday = Boolean(holidayByDate[iso]);
  const pto = rowKey !== "UNASSIGNED" ? Boolean(ptoByUidByDate[rowKey]?.[iso]) : false;

  const amHardTrip = cellTrips.some(
    (trip) => tripBlocksSlot(trip, "am") && isInProgressStatus(trip.status)
  );
  const pmHardTrip = cellTrips.some(
    (trip) => tripBlocksSlot(trip, "pm") && isInProgressStatus(trip.status)
  );

  const amSoftTrip = cellTrips.some(
    (trip) => tripBlocksSlot(trip, "am") && isPlannedStatus(trip.status)
  );
  const pmSoftTrip = cellTrips.some(
    (trip) => tripBlocksSlot(trip, "pm") && isPlannedStatus(trip.status)
  );

  const amMeeting = meetings.some((event) => eventBlocksSlot(event, "am"));
  const pmMeeting = meetings.some((event) => eventBlocksSlot(event, "pm"));

  const amHardBusy = holiday || pto || amMeeting || amHardTrip;
  const pmHardBusy = holiday || pto || pmMeeting || pmHardTrip;

  const amSoftBusy = !amHardBusy && amSoftTrip;
  const pmSoftBusy = !pmHardBusy && pmSoftTrip;

return {
  amHardBusy,
  pmHardBusy,
  amSoftBusy,
  pmSoftBusy,
  allHardBusy: amHardBusy || pmHardBusy,
  allDayHardBusy: amHardBusy || pmHardBusy,
  allDaySoftBusy: !(amHardBusy || pmHardBusy) && (amSoftTrip || pmSoftTrip),
  meetings,
};
}

function slotsForQuickSlot(slot: SlotKey): HalfDaySlotKey[] {
  return slot === "all_day" ? ["am", "pm"] : [slot];
}

function formatSlotLabel(slot: SlotKey) {
  if (slot === "all_day") return "All Day";
  if (slot === "am") return "AM";
  if (slot === "pm") return "PM";
  return slot;
}

function formatSlotForMessage(slot: SlotKey) {
  return slot === "all_day" ? "All Day" : slot.toUpperCase();
}

function computeAddSlotConflict(args: {
  techUid: string;
  helperUids?: string[];
  employeeNamesByUid?: Record<string, string>;
  employeeRolesByUid?: Record<string, string>;
  dateIso: string;
  slot: SlotKey;
  trips: TripDoc[];
  holidayByDate: Record<string, CompanyHoliday>;
  ptoByUidByDate: Record<string, Record<string, PtoDay>>;
  eventsByDate: Record<string, CompanyEvent[]>;
}) {
  const hard = new Set<string>();
  const soft = new Set<string>();
  const softTripIds = new Set<string>();

  const {
    techUid,
    helperUids = [],
    employeeNamesByUid = {},
    employeeRolesByUid = {},
    dateIso,
    slot,
    trips,
    holidayByDate,
    ptoByUidByDate,
    eventsByDate,
  } = args;

  const crewUids = uniqueTrimmedStrings([techUid, ...helperUids]);
  const halfDaySlots = slotsForQuickSlot(slot);

  const holiday = holidayByDate[dateIso];
  if (holiday) {
    hard.add(`That date is a company holiday (${holiday.name}).`);
  }

  for (const uid of crewUids) {
    const employeeName = employeeNamesByUid[uid] || uid;
    const employeeRole = employeeRolesByUid[uid] || "employee";

    const pto = ptoByUidByDate[uid]?.[dateIso];
    if (pto) {
      hard.add(`${employeeName} is on approved PTO for ${dateIso}.`);
    }

    const meetings = (eventsByDate[dateIso] || []).filter((event) =>
      eventAppliesToUid(event, uid, employeeRole)
    );

    const meetingBlock = meetings.some((event) =>
      halfDaySlots.some((halfDaySlot) => eventBlocksSlot(event, halfDaySlot))
    );

    if (meetingBlock) {
      hard.add(`${employeeName} is blocked by a company meeting/event during ${formatSlotForMessage(slot)}.`);
    }

    const overlappingTrips = trips.filter(
      (trip) =>
        trip.active !== false &&
        String(trip.date || "").trim() === dateIso &&
        isEmployeeOnTrip(trip, uid) &&
        halfDaySlots.some((halfDaySlot) => tripBlocksSlot(trip, halfDaySlot))
    );

    for (const trip of overlappingTrips) {
      const status = normalizeStatus(trip.status);
      const detail = `${formatTimeRangeForCard(trip)}`;

      if (status === "in_progress") {
        hard.add(`${employeeName} already has an in-progress trip during ${formatSlotForMessage(slot)} (${detail}).`);
      } else if (status === "planned") {
        soft.add(`${employeeName} already has a planned trip during ${formatSlotForMessage(slot)} (${detail}). Dispatch Override can be used if needed.`);
        softTripIds.add(trip.id);
      }
    }
  }

  return {
    hardMessages: Array.from(hard),
    softMessages: Array.from(soft),
    softTripIds: Array.from(softTripIds),
  } satisfies AddSlotConflictSummary;
}


function tripSlotKeyForConflict(trip: TripDoc): SlotKey {
  const w = String(trip.timeWindow || "").toLowerCase();

  if (w === "am" || w === "pm" || w === "all_day") return w;

  const selectedSlots = selectedSlotsForWindow(w, trip.startTime, trip.endTime);
  if (selectedSlots.length > 1) return "all_day";
  return selectedSlots[0] || "all_day";
}

function tripTimeRangeMinutes(trip: TripDoc) {
  const startFromField = minutesFromHHMM(trip.startTime);
  const endFromField = minutesFromHHMM(trip.endTime);

  if (startFromField != null && endFromField != null && endFromField > startFromField) {
    return {
      start: startFromField,
      end: endFromField,
      isExact: true,
    };
  }

  const w = String(trip.timeWindow || "").toLowerCase();
  if (w === "am") {
    return { start: SLOT_AM_START, end: SLOT_AM_END, isExact: false };
  }
  if (w === "pm") {
    return { start: SLOT_PM_START, end: SLOT_PM_END, isExact: false };
  }

  return { start: SLOT_AM_START, end: SLOT_PM_END, isExact: false };
}

function tripsOverlapByExactTime(a: TripDoc, b: TripDoc) {
  const aRange = tripTimeRangeMinutes(a);
  const bRange = tripTimeRangeMinutes(b);
  return aRange.start < bRange.end && aRange.end > bRange.start;
}

function tripBlocksEventWindowByExactTime(
  trip: TripDoc,
  windowValue: string,
  startTime?: string | null,
  endTime?: string | null
) {
  const tripRange = tripTimeRangeMinutes(trip);
  const w = String(windowValue || "").toLowerCase();

  if (w === "all_day") return true;

  if (w === "am") {
    return tripRange.start < SLOT_AM_END && tripRange.end > SLOT_AM_START;
  }

  if (w === "pm") {
    return tripRange.start < SLOT_PM_END && tripRange.end > SLOT_PM_START;
  }

  const eventStart = minutesFromHHMM(String(startTime || ""));
  const eventEnd = minutesFromHHMM(String(endTime || ""));
  if (eventStart == null || eventEnd == null || eventEnd <= eventStart) {
    return true;
  }

  return tripRange.start < eventEnd && tripRange.end > eventStart;
}

function tripHelperEntries(trip: TripDoc): TripHelperEntry[] {
  const entries: TripHelperEntry[] = [];

  const helperUid = String(trip.crew?.helperUid || "").trim();
  if (helperUid) {
    entries.push({
      slot: "helper",
      uid: helperUid,
      name: String(trip.crew?.helperName || "Helper").trim() || "Helper",
    });
  }

  const secondaryHelperUid = String(trip.crew?.secondaryHelperUid || "").trim();
  if (secondaryHelperUid) {
    entries.push({
      slot: "secondaryHelper",
      uid: secondaryHelperUid,
      name: String(trip.crew?.secondaryHelperName || "Helper").trim() || "Helper",
    });
  }

  return entries;
}

function crewWithHelperAssigned(
  crew: TripCrew | null | undefined,
  slot: TripHelperSlot,
  helper: HelperOption
): TripCrew {
  const next: TripCrew = { ...(crew || {}) };

  const targetSlot: Exclude<TripHelperSlot, "add"> =
    slot === "add"
      ? String(next.helperUid || "").trim()
        ? "secondaryHelper"
        : "helper"
      : slot;

  if (targetSlot === "helper") {
    next.helperUid = helper.uid;
    next.helperName = helper.name;
  } else {
    next.secondaryHelperUid = helper.uid;
    next.secondaryHelperName = helper.name;
  }

  return next;
}

function crewWithHelperRemoved(
  crew: TripCrew | null | undefined,
  slot: Exclude<TripHelperSlot, "add">
): TripCrew {
  const next: TripCrew = { ...(crew || {}) };

  if (slot === "helper") {
    if (String(next.secondaryHelperUid || "").trim()) {
      next.helperUid = next.secondaryHelperUid || null;
      next.helperName = next.secondaryHelperName || null;
      next.secondaryHelperUid = null;
      next.secondaryHelperName = null;
    } else {
      next.helperUid = null;
      next.helperName = null;
    }
  } else {
    next.secondaryHelperUid = null;
    next.secondaryHelperName = null;
  }

  return next;
}

function helperIsAlreadyOnTrip(trip: TripDoc, helperUid: string) {
  const uid = String(helperUid || "").trim();
  if (!uid) return false;
  return tripHelperEntries(trip).some((entry) => entry.uid === uid);
}

function InfoChip({
  icon,
  label,
  color = "default",
}: {
  icon?: React.ReactElement | undefined;
  label: string;
  color?: "default" | "primary" | "secondary" | "warning" | "success";
}) {
  return (
    <Chip
      size="small"
      icon={icon}
      label={label}
      color={color}
      variant="outlined"
      sx={{ borderRadius: 1.5, fontWeight: 500 }}
    />
  );
}

function ScheduleSlotButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<AddRoundedIcon />}
      onClick={onClick}
      sx={{
        alignSelf: "flex-start",
        minHeight: 36,
        px: 1.5,
        borderRadius: 5,
        fontWeight: 500,
        textTransform: "none",
        borderColor: alpha("#47B8FF", 0.28),
        color: "text.primary",
        backgroundColor: "transparent",
        "&:hover": {
          borderColor: alpha("#47B8FF", 0.42),
          backgroundColor: alpha("#47B8FF", 0.08),
        },
      }}
    >
      {label}
    </Button>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box>
      <Typography
        variant="h6"
        sx={{
          fontSize: { xs: "1rem", md: "1.05rem" },
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </Typography>
      {subtitle ? (
        <Typography
          sx={{
            mt: 0.5,
            color: "text.secondary",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

function staffCoverageWorkTypeLabel(workType?: string | null) {
  const w = String(workType || "").toLowerCase();
  if (w === "dispatch") return "Dispatch";
  if (w === "billing") return "Billing";
  if (w === "office") return "Office";
  if (w === "admin") return "Admin";
  if (w === "shop") return "Shop";
  return "Staff";
}

function initialsForName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function splitPickerSublabel(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { customer: "", address: "" };
  }

  const parts = raw
    .split(" — ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return { customer: raw, address: "" };
  }

  return {
    customer: parts[0],
    address: parts.slice(1).join(" — "),
  };
}

export default function SchedulePage() {
  const theme = useTheme();
  const router = useRouter();
  const { appUser } = useAuthContext();

  const canSeeAll =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "office_display";

  const canEditSchedule =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const [view, setView] = useState<ViewMode>("week");
  const [anchorIso, setAnchorIso] = useState<string>(() => todayIsoLocal());

  const [isMobile, setIsMobile] = useState(false);
  const [schedulePrefsReady, setSchedulePrefsReady] = useState(false);
  const todayIso = useMemo(() => todayIsoLocal(), []);

  const [techFilter, setTechFilter] = useState<TechFilterValue>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [hideCompleted, setHideCompleted] = useState<boolean>(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [monthAvailabilityMode, setMonthAvailabilityMode] = useState<MonthAvailabilityMode>("leads");

  const [loading, setLoading] = useState(true);

  const [techsLoading, setTechsLoading] = useState(true);
  const [techsError, setTechsError] = useState("");
  const [techs, setTechs] = useState<TechRow[]>([]);
  const [helpers, setHelpers] = useState<HelperOption[]>([]);
  const [meetingEmployees, setMeetingEmployees] = useState<EmployeeOption[]>([]);

  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState("");
  const [trips, setTrips] = useState<TripDoc[]>([]);

  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [holidaysError, setHolidaysError] = useState("");
  const [holidayByDate, setHolidayByDate] = useState<Record<string, CompanyHoliday>>({});

  const [ptoLoading, setPtoLoading] = useState(true);
  const [ptoError, setPtoError] = useState("");
  const [ptoByUidByDate, setPtoByUidByDate] = useState<Record<string, Record<string, PtoDay>>>({});
  const [ptoNamesByDate, setPtoNamesByDate] = useState<Record<string, string[]>>({});

  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [eventsByDate, setEventsByDate] = useState<Record<string, CompanyEvent[]>>({});

  const [ticketMap, setTicketMap] = useState<Record<string, TicketSummary>>({});
  const [projectMap, setProjectMap] = useState<Record<string, ProjectSummary>>({});

  const [quickScheduleOpen, setQuickScheduleOpen] = useState(false);
  const [quickScheduleTechUid, setQuickScheduleTechUid] = useState("");
  const [quickScheduleDateIso, setQuickScheduleDateIso] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addTechUid, setAddTechUid] = useState("");
  const [addDateIso, setAddDateIso] = useState("");
  const [addSlot, setAddSlot] = useState<SlotKey>("am");
  const [addTripType, setAddTripType] = useState<AddTripType>("service");
  const [addSearch, setAddSearch] = useState("");
  const [addSelectedId, setAddSelectedId] = useState("");
  const [addAdvancedId, setAddAdvancedId] = useState("");
  const [addProjectStageKey, setAddProjectStageKey] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addDispatchOverrideEnabled, setAddDispatchOverrideEnabled] =
    useState(false);
  const [addDispatchOverrideReason, setAddDispatchOverrideReason] =
    useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);
  const [mobileNotesOpen, setMobileNotesOpen] = useState(false);

  const [openTicketsLoading, setOpenTicketsLoading] = useState(false);
  const [openTicketsErr, setOpenTicketsErr] = useState("");
  const [openTicketItems, setOpenTicketItems] = useState<PickerItem[]>([]);

  const [openProjectsLoading, setOpenProjectsLoading] = useState(false);
  const [openProjectsErr, setOpenProjectsErr] = useState("");
  const [openProjectItems, setOpenProjectItems] = useState<PickerItem[]>([]);

  const [meetOpen, setMeetOpen] = useState(false);
  const [editingMeetId, setEditingMeetId] = useState<string | null>(null);
  const [editingMeetOriginalDate, setEditingMeetOriginalDate] = useState<string>("");
  const [meetDateIso, setMeetDateIso] = useState("");
  const [meetTitle, setMeetTitle] = useState("");
  const [meetWindow, setMeetWindow] = useState<"all_day" | "am" | "pm" | "custom">("am");
  const [meetStart, setMeetStart] = useState("08:00");
  const [meetEnd, setMeetEnd] = useState("09:00");
  const [meetLocation, setMeetLocation] = useState("");
  const [meetNotes, setMeetNotes] = useState("");
  const [meetBlocks, setMeetBlocks] = useState(true);
  const [meetIncludeAll, setMeetIncludeAll] = useState(true);
  const [meetAppliesToUids, setMeetAppliesToUids] = useState<string[]>([]);
  const [meetAttendeeSearch, setMeetAttendeeSearch] = useState("");
  const [meetRoleFilter, setMeetRoleFilter] = useState<MeetingRoleFilter>("all");
  const [meetSaving, setMeetSaving] = useState(false);
  const [meetErr, setMeetErr] = useState("");
  const [meetMsg, setMeetMsg] = useState("");

  const [staffCoverageLoading, setStaffCoverageLoading] = useState(true);
  const [staffCoverageError, setStaffCoverageError] = useState("");
  const [staffCoverageByDate, setStaffCoverageByDate] = useState<
    Record<string, StaffCoverageDoc[]>
  >({});

  const [addScheduleAnchorEl, setAddScheduleAnchorEl] = useState<HTMLElement | null>(null);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockDateIso, setBlockDateIso] = useState("");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockWindow, setBlockWindow] = useState<"all_day" | "am" | "pm" | "custom">("am");
  const [blockStart, setBlockStart] = useState("08:00");
  const [blockEnd, setBlockEnd] = useState("09:00");
  const [blockNotes, setBlockNotes] = useState("");
  const [blockIncludeAll, setBlockIncludeAll] = useState(false);
  const [blockAppliesToUids, setBlockAppliesToUids] = useState<string[]>([]);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockErr, setBlockErr] = useState("");

  const [helperEditOpen, setHelperEditOpen] = useState(false);
  const [helperEditTripId, setHelperEditTripId] = useState("");
  const [helperEditSlot, setHelperEditSlot] = useState<TripHelperSlot>("add");
  const [helperEditSaving, setHelperEditSaving] = useState(false);
  const [helperEditErr, setHelperEditErr] = useState("");

  const addScheduleMenuOpen = Boolean(addScheduleAnchorEl);

  const allMeetingEmployeeUids = useMemo(
    () => meetingEmployees.map((employee) => employee.uid),
    [meetingEmployees]
  );

  const filteredMeetingEmployees = useMemo(() => {
    const q = meetAttendeeSearch.trim().toLowerCase();

    return meetingEmployees.filter((employee) => {
      if (meetRoleFilter !== "all" && normalizeRole(employee.role) !== meetRoleFilter) return false;

      if (!q) return true;

      const haystack = `${employee.displayName} ${employee.role} ${formatRoleLabel(employee.role)}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [meetingEmployees, meetAttendeeSearch, meetRoleFilter]);

  const selectedMeetingEmployees = useMemo(() => {
    const selected = new Set(meetAppliesToUids);
    return meetingEmployees.filter((employee) => selected.has(employee.uid));
  }, [meetingEmployees, meetAppliesToUids]);

  const helperEditTrip = useMemo(() => {
    const id = String(helperEditTripId || "").trim();
    if (!id) return null;
    return trips.find((trip) => trip.id === id) || null;
  }, [helperEditTripId, trips]);

  const helperEditEntries = useMemo(() => {
    if (!helperEditTrip) return [] as TripHelperEntry[];
    return tripHelperEntries(helperEditTrip);
  }, [helperEditTrip]);

  const helperEditExistingEntry = useMemo(() => {
    if (!helperEditTrip || helperEditSlot === "add") return null;
    return helperEditEntries.find((entry) => entry.slot === helperEditSlot) || null;
  }, [helperEditTrip, helperEditSlot, helperEditEntries]);

  const selectedBlockEmployees = useMemo(() => {
    const selected = new Set(blockAppliesToUids);
    return meetingEmployees.filter((employee) => selected.has(employee.uid));
  }, [meetingEmployees, blockAppliesToUids]);

  const employeeNamesByUid = useMemo(() => {
  const out: Record<string, string> = {};

  for (const tech of techs) {
    out[tech.uid] = tech.name;
  }

  for (const helper of helpers) {
    out[helper.uid] = helper.name;
  }

  return out;
}, [techs, helpers]);

const employeeRolesByUid = useMemo(() => {
  const out: Record<string, string> = {};

  for (const tech of techs) {
    out[tech.uid] = "technician";
  }

  for (const helper of helpers) {
    out[helper.uid] = helper.laborRole || "helper";
  }

  return out;
}, [techs, helpers]);

const defaultHelpersForAddTech = useMemo(() => {
  if (!addTechUid) return [] as HelperOption[];

  return helpers
    .filter(
      (helper) =>
        String(helper.defaultPairedTechUid || "").trim() === String(addTechUid || "").trim()
    )
    .slice(0, 2);
}, [helpers, addTechUid]);

const unavailableDefaultHelpersForAddTrip = useMemo(() => {
  const dateIso = String(addDateIso || "").trim();
  if (!dateIso) return [] as HelperOption[];

  return defaultHelpersForAddTech.filter((helper) =>
    Boolean(ptoByUidByDate[helper.uid]?.[dateIso])
  );
}, [addDateIso, defaultHelpersForAddTech, ptoByUidByDate]);

const availableDefaultHelpersForAddTrip = useMemo(() => {
  const unavailable = new Set(unavailableDefaultHelpersForAddTrip.map((helper) => helper.uid));
  return defaultHelpersForAddTech.filter((helper) => !unavailable.has(helper.uid)).slice(0, 2);
}, [defaultHelpersForAddTech, unavailableDefaultHelpersForAddTrip]);

const unavailableDefaultHelperMessage = unavailableDefaultHelpersForAddTrip.length
  ? `${unavailableDefaultHelpersForAddTrip
      .map((helper) => helper.name)
      .join(", ")} ${
      unavailableDefaultHelpersForAddTrip.length === 1 ? "is" : "are"
    } unavailable for ${addDateIso}. Removed from the default crew for this trip.`
  : "";

const addPrimaryHelper = availableDefaultHelpersForAddTrip[0] || null;
const addSecondaryHelper = availableDefaultHelpersForAddTrip[1] || null;

const selectedAddPickerItem = useMemo(() => {
  const id = String(addSelectedId || addAdvancedId || "").trim();
  if (!id) return null;

  const base = addTripType === "service" ? openTicketItems : openProjectItems;
  return base.find((item) => item.id === id) || null;
}, [addSelectedId, addAdvancedId, addTripType, openTicketItems, openProjectItems]);

const selectedProjectStageOptions = useMemo(() => {
  if (addTripType !== "project") return [] as ProjectStageOption[];
  return selectedAddPickerItem?.projectStageOptions || [];
}, [addTripType, selectedAddPickerItem]);

const selectedProjectStage = useMemo(() => {
  if (addTripType !== "project") return null;
  return selectedProjectStageOptions.find((stage) => stage.key === addProjectStageKey) || null;
}, [addTripType, selectedProjectStageOptions, addProjectStageKey]);

const selectedProjectUsesFieldStages = useMemo(() => {
  if (addTripType !== "project") return false;

  return selectedProjectStageOptions.some((stage) =>
    ["roughIn", "topOutVent", "trimFinish"].includes(
      String(stage.key || "").trim(),
    ),
  );
}, [addTripType, selectedProjectStageOptions]);

const addEstimateHours = addTripType === "service" ? selectedAddPickerItem?.estimatedHours ?? null : null;
const addShouldRecommendAllDay =
  addTripType === "service" &&
  typeof addEstimateHours === "number" &&
  addEstimateHours >= 6 &&
  addSlot !== "all_day";

  const meetingConflictSummary = useMemo(() => {
    const empty = { hardMessages: [] as string[], softMessages: [] as string[], conflictEmployeeUids: [] as string[] };
    if (!meetOpen || !/^\d{4}-\d{2}-\d{2}$/.test(String(meetDateIso || ""))) return empty;

    const attendeeUids = uniqueTrimmedStrings(meetAppliesToUids).filter((uid) =>
      allMeetingEmployeeUids.includes(uid)
    );
    if (attendeeUids.length === 0) return empty;

    const hard = new Set<string>();
    const soft = new Set<string>();
    const conflictUids = new Set<string>();

    const holiday = holidayByDate[meetDateIso];
    if (holiday) {
      hard.add(`That date is a company holiday (${holiday.name}).`);
      attendeeUids.forEach((uid) => conflictUids.add(uid));
    }

    const employeeMap = new Map<string, EmployeeOption>(meetingEmployees.map((employee) => [employee.uid, employee]));

    for (const uid of attendeeUids) {
      const employee = employeeMap.get(uid);
      const name = employee?.displayName || uid;
      const role = employee?.role || "employee";

      const pto = ptoByUidByDate[uid]?.[meetDateIso];
      if (pto) {
        soft.add(`${name} has approved PTO on ${formatDateLong(meetDateIso)}.`);
        conflictUids.add(uid);
      }

      const overlappingTrips = trips.filter(
        (trip) =>
          trip.active !== false &&
          normalizeStatus(trip.status) !== "cancelled" &&
          String(trip.date || "").trim() === meetDateIso &&
          isEmployeeOnTrip(trip, uid) &&
          tripBlocksMeetingWindow(trip, meetWindow, meetStart, meetEnd)
      );

      for (const trip of overlappingTrips) {
        const detail = formatTimeRangeForCard(trip);
        if (isInProgressStatus(trip.status)) {
          hard.add(`${name} already has an in-progress trip during this meeting window (${detail}).`);
        } else if (isPlannedStatus(trip.status)) {
          soft.add(`${name} already has a planned trip during this meeting window (${detail}).`);
        }
        conflictUids.add(uid);
      }

      const overlappingEvents = (eventsByDate[meetDateIso] || []).filter(
        (event) =>
          event.id !== editingMeetId &&
          event.active !== false &&
          event.blocksSchedule !== false &&
          eventAppliesToUid(event, uid, role) &&
          eventBlocksMeetingWindow(event, meetWindow, meetStart, meetEnd)
      );

      for (const event of overlappingEvents) {
        soft.add(`${name} already has ${meetingChipLabel(event)} on the schedule.`);
        conflictUids.add(uid);
      }
    }

    return {
      hardMessages: Array.from(hard),
      softMessages: Array.from(soft),
      conflictEmployeeUids: Array.from(conflictUids),
    };
  }, [
    meetOpen,
    meetDateIso,
    meetAppliesToUids,
    allMeetingEmployeeUids,
    holidayByDate,
    meetingEmployees,
    ptoByUidByDate,
    trips,
    meetWindow,
    meetStart,
    meetEnd,
    eventsByDate,
    editingMeetId,
  ]);

const addSlotConflicts = useMemo(() => {
  if (!addOpen || !addTechUid || !addDateIso) {
    return {
      hardMessages: [],
      softMessages: [],
      softTripIds: [],
    } satisfies AddSlotConflictSummary;
  }

  return computeAddSlotConflict({
    techUid: addTechUid,
    helperUids: [addPrimaryHelper?.uid, addSecondaryHelper?.uid].filter(Boolean) as string[],
    employeeNamesByUid,
    employeeRolesByUid,
    dateIso: addDateIso,
    slot: addSlot,
    trips,
    holidayByDate,
    ptoByUidByDate,
    eventsByDate,
  });
}, [
  addOpen,
  addTechUid,
  addDateIso,
  addSlot,
  addPrimaryHelper?.uid,
  addSecondaryHelper?.uid,
  employeeNamesByUid,
  employeeRolesByUid,
  trips,
  holidayByDate,
  ptoByUidByDate,
  eventsByDate,
]);

  useEffect(() => {
    if (addTripType !== "project") {
      if (addProjectStageKey) setAddProjectStageKey("");
      return;
    }

    if (!selectedProjectStageOptions.length) {
      if (addProjectStageKey) setAddProjectStageKey("");
      return;
    }

    if (!selectedProjectStageOptions.some((stage) => stage.key === addProjectStageKey)) {
      setAddProjectStageKey("");
    }
  }, [addTripType, selectedProjectStageOptions, addProjectStageKey]);

  useEffect(() => {
    if (addSlotConflicts.softMessages.length === 0) {
      setAddDispatchOverrideEnabled(false);
      setAddDispatchOverrideReason("");
    }
  }, [addSlotConflicts.softMessages.length]);

  function setMeetingAttendees(nextUids: Array<string | null | undefined>) {
    const allowed = new Set(allMeetingEmployeeUids);
    const cleaned = uniqueTrimmedStrings(nextUids).filter((uid) => allowed.has(uid));
    setMeetAppliesToUids(cleaned);
    setMeetIncludeAll(
      allMeetingEmployeeUids.length > 0 && allMeetingEmployeeUids.every((uid) => cleaned.includes(uid))
    );
  }

  function deriveMeetingUidsFromEvent(event: CompanyEvent) {
    const explicit = uniqueTrimmedStrings(event.appliesToUids || []);
    if (explicit.length > 0) return explicit;

    const roles = uniqueTrimmedStrings(event.appliesToRoles || []).map((role) => normalizeRole(role));
    if (roles.length > 0) {
      return meetingEmployees
        .filter((employee) => roles.includes(normalizeRole(employee.role)))
        .map((employee) => employee.uid);
    }

    return allMeetingEmployeeUids;
  }

  async function loadOpenTicketsIfNeeded() {
    setOpenTicketsLoading(true);
    setOpenTicketsErr("");

    try {
      const scheduledTicketIds = new Set<string>();

      try {
        const startIso = todayIsoLocal();
        const endDt = addDays(fromIsoDate(startIso), 90);
        const endIso = toIsoDate(endDt);

        const tripsSnap = await getDocs(
          query(
            collection(db, "trips"),
            where("active", "==", true),
            where("type", "==", "service"),
            where("date", ">=", startIso),
            where("date", "<=", endIso),
            orderBy("date", "asc"),
            limit(1500)
          )
        );

        tripsSnap.docs.forEach((ds) => {
          const t = ds.data() as any;
          const tripStatus = String(t?.status || "").toLowerCase().trim();
          const active = typeof t?.active === "boolean" ? t.active : true;
          if (!active) return;
          if (tripStatus === "cancelled" || tripStatus === "canceled") return;
          const stid = String(t?.link?.serviceTicketId || "").trim();
          if (!stid) return;
          scheduledTicketIds.add(stid);
        });
      } catch {
        // ignore pre-check issues
      }

      const snap = await getDocs(
        query(collection(db, "serviceTickets"), orderBy("createdAt", "desc"), limit(400))
      );

      const items: PickerItem[] = snap.docs
        .map((ds) => {
          const d = ds.data() as any;
          const id = ds.id;
          const active = typeof d.active === "boolean" ? d.active : true;
          if (!active) return null;
          if (!ticketIsSchedulableByStatus(d)) return null;
          if (scheduledTicketIds.has(id)) return null;

          const issue = String(d.issueSummary ?? d.summary ?? "Service Ticket").trim();
          const customer = String(d.customerDisplayName ?? d.customerName ?? "").trim();
          const line1 = String(d.serviceAddressLine1 ?? "").trim();
          const city = String(d.serviceCity ?? "").trim();

const estHoursCandidates = [
  d.estimatedHours,
  d.estimatedDurationHours,
  d.estimatedDuration,
  d.estimatedDurationHrs,
  d.estimatedHoursNeeded,
  d.estimatedLaborHours,
  d.estHours,
  d.durationHours,
  d.durationHrs,
  d.scheduling?.estimatedHours,
  d.scheduling?.estimatedDurationHours,
  d.ticketOverview?.estimatedHours,
  d.ticketOverview?.estimatedDurationHours,
  d.overview?.estimatedHours,
  d.overview?.estimatedDurationHours,
];

const estHoursDirect = estHoursCandidates
  .map((value) => Number(value))
  .find((value) => Number.isFinite(value) && value > 0);

const estMinutesCandidates = [
  d.estimatedDurationMinutes,
  d.estimatedMinutes,
  d.durationMinutes,
  d.scheduling?.estimatedDurationMinutes,
  d.scheduling?.estimatedMinutes,
  d.ticketOverview?.estimatedDurationMinutes,
  d.overview?.estimatedDurationMinutes,
];

const estMinutesDirect = estMinutesCandidates
  .map((value) => Number(value))
  .find((value) => Number.isFinite(value) && value > 0);

const estHours =
  typeof estHoursDirect === "number"
    ? estHoursDirect
    : typeof estMinutesDirect === "number"
      ? Math.round((estMinutesDirect / 60) * 10) / 10
      : null;
          const detailsRaw =
            d.issueDetails ??
            d.details ??
            d.description ??
            d.problemDescription ??
            d.notes ??
            null;

          const details = String(detailsRaw ?? "").trim();
          const preview = details.length > 0 ? (details.length > 140 ? `${details.slice(0, 139)}…` : details) : "";

          const label = issue || "Service Ticket";
          const sub = `${customer || "Customer"}${line1 ? ` — ${line1}` : ""}${city ? `, ${city}` : ""}`;

          const stNorm = normalizeTicketStatus(d?.status);
          const statusLabel = stNorm === "followup" || stNorm === "follow_up" ? "Follow Up" : "New";

          return {
            id,
            label,
            sublabel: sub,
            metaLeft: statusLabel,
            metaRight: estHours ? `Est. ${estHours} hr${estHours === 1 ? "" : "s"}` : "Est. —",
            preview,
            estimatedHours: estHours,
            ticketStatus: stNorm,
          } as PickerItem;
        })
        .filter(Boolean) as PickerItem[];

      setOpenTicketItems(items);
    } catch (e: any) {
      setOpenTicketsErr(e?.message || "Failed to load schedulable service tickets.");
      setOpenTicketItems([]);
    } finally {
      setOpenTicketsLoading(false);
    }
  }

  async function loadOpenProjectsIfNeeded() {
  setOpenProjectsLoading(true);
  setOpenProjectsErr("");

  try {
    const snap = await getDocs(query(collection(db, "projects"), orderBy("updatedAt", "desc"), limit(250)));

    const items: PickerItem[] = snap.docs
      .map((ds) => {
        const d = ds.data() as any;
        const id = ds.id;
        if (!projectIsSchedulableByStatus(d)) return null;

        const stageOptions = extractProjectStageOptions(d);
        if (stageOptions.length === 0) return null;

        const name = String(d.projectName ?? d.name ?? d.title ?? "Project").trim();
        const customer = String(d.customerDisplayName ?? "").trim();
        const line1 = String(d.serviceAddressLine1 ?? "").trim();
        const city = String(d.serviceCity ?? "").trim();

        return {
          id,
          label: name || "Project",
          sublabel: `${customer || "Customer"}${line1 ? ` — ${line1}` : ""}${city ? `, ${city}` : ""}`,
          metaLeft: "Project",
          metaRight: `${stageOptions.length} open stage${stageOptions.length === 1 ? "" : "s"}`,
          projectStageOptions: stageOptions,
        } as PickerItem;
      })
      .filter(Boolean) as PickerItem[];

    setOpenProjectItems(items);
  } catch (e: any) {
    setOpenProjectsErr(e?.message || "Failed to load projects.");
    setOpenProjectItems([]);
  } finally {
    setOpenProjectsLoading(false);
  }
}

  function findTechName(uid: string) {
    const t = techs.find((x) => x.uid === uid);
    return t?.name || "";
  }

function slotDefaults(slot: SlotKey) {
  if (slot === "am") {
    return { timeWindow: "am" as const, startTime: "08:00", endTime: "12:00" };
  }

  if (slot === "pm") {
    return { timeWindow: "pm" as const, startTime: "13:00", endTime: "17:00" };
  }

  return { timeWindow: "all_day" as const, startTime: "08:00", endTime: "17:00" };
}

  function openAddModal(args: { techUid: string; dateIso: string; slot: SlotKey }) {
    setAddErr("");
    setAddTechUid(args.techUid);
    setAddDateIso(args.dateIso);
    setAddSlot(args.slot);
    setAddTripType("service");
    setAddSearch("");
    setAddSelectedId("");
    setAddAdvancedId("");
    setAddProjectStageKey("");
    setAddNotes("");
    setAddDispatchOverrideEnabled(false);
    setAddDispatchOverrideReason("");
    setMobileAdvancedOpen(false);
    setMobileNotesOpen(false);
    setAddOpen(true);
    loadOpenTicketsIfNeeded();
  }

  function openQuickScheduleModal(args: { techUid: string; dateIso: string }) {
    const techUid = String(args.techUid || "").trim();
    const dateIso = String(args.dateIso || "").trim();

    if (dateIso && holidayByDate[dateIso]) {
      return;
    }

    if (techUid && dateIso && ptoByUidByDate[techUid]?.[dateIso]) {
      return;
    }

    setQuickScheduleTechUid(techUid);
    setQuickScheduleDateIso(dateIso);
    setQuickScheduleOpen(true);
  }

  function closeQuickScheduleModal() {
    setQuickScheduleOpen(false);
  }

  function chooseQuickScheduleSlot(slot: SlotKey) {
    const techUid = String(quickScheduleTechUid || "").trim();
    const dateIso = String(quickScheduleDateIso || "").trim();
    if (!techUid || !dateIso) return;

    closeQuickScheduleModal();
    openAddModal({ techUid, dateIso, slot });
  }

  function closeAddModal() {
    if (addSaving) return;
    setAddOpen(false);
    setAddErr("");
    setAddSaving(false);
    setAddSearch("");
    setAddSelectedId("");
    setAddAdvancedId("");
    setAddProjectStageKey("");
    setAddNotes("");
    setAddDispatchOverrideEnabled(false);
    setAddDispatchOverrideReason("");
    setMobileAdvancedOpen(false);
    setMobileNotesOpen(false);
  }

  function selectAddPickerItem(itemId: string) {
    setAddSelectedId(itemId);
    setAddAdvancedId("");
    setAddProjectStageKey("");
  }

  function currentPickerItems(): PickerItem[] {
    const base = addTripType === "service" ? openTicketItems : openProjectItems;
    const q = addSearch.trim().toLowerCase();
    if (!q) return base.slice(0, 60);

    return base
      .filter((x) => {
        const haystack = `${x.label || ""} ${x.sublabel || ""} ${x.id || ""}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 80);
  }

  async function submitAddTrip() {
    if (!canEditSchedule) {
      setAddErr("Only Admin/Dispatcher/Manager can schedule trips.");
      return;
    }

    const techUid = String(addTechUid || "").trim();
    const dateIso = String(addDateIso || "").trim();

    if (!techUid) return setAddErr("Missing technician.");
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return setAddErr("Missing/invalid date.");
    if (dateIso < todayIso) return setAddErr("You can’t schedule trips in the past.");

    const chosenId = String(addSelectedId || "").trim();
    const advancedId = String(addAdvancedId || "").trim();
    const linkId = chosenId || advancedId;

    if (!linkId) {
      return setAddErr(addTripType === "service" ? "Choose an open Service Ticket." : "Choose a Project.");
    }

    let verifiedProjectStage: ProjectStageOption | null = selectedProjectStage;

if (addTripType === "project") {
  if (advancedId && !chosenId) {
    return setAddErr("Choose the project from the list so DCFlow can verify its open stages.");
  }

  if (!addProjectStageKey) {
    return setAddErr("Choose an open project stage before scheduling this project trip.");
  }

  if (!selectedProjectStageOptions.some((stage) => stage.key === addProjectStageKey)) {
    return setAddErr("That project stage is not open for scheduling. Choose another stage.");
  }

  try {
    const liveProjectSnap = await getDoc(doc(db, "projects", linkId));

    if (!liveProjectSnap.exists()) {
      return setAddErr("That project could not be found.");
    }

    const liveStageOptions = extractProjectStageOptions(liveProjectSnap.data() as any);
    verifiedProjectStage =
      liveStageOptions.find((stage) => stage.key === addProjectStageKey) || null;

    if (!verifiedProjectStage) {
      setOpenProjectItems((prev) =>
        prev
          .map((item) =>
            item.id === linkId
              ? {
                  ...item,
                  projectStageOptions: liveStageOptions,
                  metaRight: `${liveStageOptions.length} open stage${liveStageOptions.length === 1 ? "" : "s"}`,
                }
              : item
          )
          .filter((item) => item.id !== linkId || (item.projectStageOptions || []).length > 0)
      );

      return setAddErr("That project stage is already complete, invoiced, or closed. Choose another open stage.");
    }
  } catch (e: any) {
    return setAddErr(e?.message || "Could not verify the project stage before scheduling.");
  }
}

const liveDefaultHelpers = helpers
  .filter(
    (helper) =>
      String(helper.defaultPairedTechUid || "").trim() === techUid
  )
  .slice(0, 2);

const liveAvailableDefaultHelpers = liveDefaultHelpers.filter(
  (helper) => !ptoByUidByDate[helper.uid]?.[dateIso]
);

const liveHelperUid = liveAvailableDefaultHelpers[0]?.uid || "";
const liveSecondaryHelperUid = liveAvailableDefaultHelpers[1]?.uid || "";

const liveConflicts = computeAddSlotConflict({
  techUid,
  helperUids: [liveHelperUid, liveSecondaryHelperUid].filter(Boolean),
  employeeNamesByUid,
  employeeRolesByUid,
  dateIso,
  slot: addSlot,
  trips,
  holidayByDate,
  ptoByUidByDate,
  eventsByDate,
});

    if (liveConflicts.hardMessages.length > 0) {
      return setAddErr(liveConflicts.hardMessages[0]);
    }

    if (liveConflicts.softMessages.length > 0) {
      if (!addDispatchOverrideEnabled) {
        return setAddErr("This slot already has a planned trip. Enable Dispatch Override to continue.");
      }

      if (!addDispatchOverrideReason.trim()) {
        return setAddErr("Dispatch Override reason is required.");
      }
    }

    setAddSaving(true);
    setAddErr("");

    try {
const now = nowIso();
const techName = findTechName(techUid) || "Technician";
const slot = slotDefaults(addSlot);

const estimatedDurationMinutes =
  addTripType === "service" && typeof selectedAddPickerItem?.estimatedHours === "number"
    ? Math.round(selectedAddPickerItem.estimatedHours * 60)
    : null;

const helperUid = liveHelperUid || "";
const helperName = helperUid ? employeeNamesByUid[helperUid] || "Unnamed Helper" : null;

const secondaryHelperUid = liveSecondaryHelperUid || "";
const secondaryHelperName = secondaryHelperUid
  ? employeeNamesByUid[secondaryHelperUid] || "Unnamed Helper"
  : null;

      const canonicalProjectStageKey =
        addTripType === "project" && selectedProjectUsesFieldStages
          ? addProjectStageKey
          : null;

      const dispatchOverride =
        liveConflicts.softMessages.length > 0
          ? ({
              enabled: true,
              reason: addDispatchOverrideReason.trim(),
              createdAt: now,
              createdByUid: appUser?.uid || null,
              createdByName: appUser?.displayName || null,
              conflictTypes: ["scheduled_overlap"],
              conflictTripIds: liveConflicts.softTripIds,
            } satisfies DispatchOverrideInfo)
          : null;

      const payload: any = {
        active: true,
        type: addTripType,
        status: "planned",
date: dateIso,
timeWindow: slot.timeWindow,
startTime: slot.startTime,
endTime: slot.endTime,
estimatedDurationMinutes,
dispatchOverride,
crew: {
  primaryTechUid: techUid,
  primaryTechName: techName,
  helperUid: helperUid || null,
  helperName,
  secondaryTechUid: null,
  secondaryTechName: null,
  secondaryHelperUid: secondaryHelperUid || null,
  secondaryHelperName,
},
crewConfirmed: null,
timerState: "not_started",
actualStartAt: null,
actualEndAt: null,
startedByUid: null,
endedByUid: null,
pauseBlocks: [],
actualMinutes: null,
        link: {
          serviceTicketId: addTripType === "service" ? linkId : null,
          projectId: addTripType === "project" ? linkId : null,
          projectStageKey: canonicalProjectStageKey,
          stageKey: canonicalProjectStageKey,
        },
        projectStageKey: canonicalProjectStageKey,
        notes: addNotes.trim() || null,
        cancelReason: null,
        createdAt: now,
        createdByUid: appUser?.uid || null,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

const created = await addDoc(collection(db, "trips"), payload);

if (addTripType === "service") {
  const selectedTicket = selectedAddPickerItem;
  const ticketStatus = normalizeTicketStatus(selectedTicket?.ticketStatus);
  const nextStatus = ticketStatus === "followup" || ticketStatus === "follow_up" ? "follow_up" : "scheduled";

  const helperIds = Array.from(new Set([helperUid, secondaryHelperUid].filter(Boolean)));
  const helperNames = helperIds
    .map((uid) => employeeNamesByUid[uid] || "Unnamed Helper")
    .filter(Boolean);

  const assignedTechnicianIds = Array.from(
    new Set([techUid, helperUid, secondaryHelperUid].filter(Boolean))
  );

  await updateDoc(doc(db, "serviceTickets", linkId), {
    status: nextStatus,
    assignedTechnicianId: techUid,
    assignedTechnicianName: techName,
    primaryTechnicianId: techUid,
    secondaryTechnicianId: null,
    secondaryTechnicianName: null,
    helperIds: helperIds.length ? helperIds : null,
    helperNames: helperNames.length ? helperNames : null,
    assignedTechnicianIds,
    updatedAt: now,
  });
}

if (addTripType === "project") {
  const projectUpdatePayload: any = {
    updatedAt: now,
  };

  if (canonicalProjectStageKey) {
    projectUpdatePayload[
      `${canonicalProjectStageKey}.scheduledTripIds`
    ] = arrayUnion(created.id);
    projectUpdatePayload[
      `${canonicalProjectStageKey}.lastScheduledTripId`
    ] = created.id;

    if (
      normalizeStageStatus(verifiedProjectStage?.status) !== "in_progress"
    ) {
      projectUpdatePayload[`${canonicalProjectStageKey}.status`] =
        "scheduled";
    }
  }

  await updateDoc(doc(db, "projects", linkId), projectUpdatePayload);
}

const newTrip: TripDoc = { id: created.id, ...(payload as any) };
setTrips((prev) => [...prev, newTrip].sort(compareTripTime));

closeAddModal();
    } catch (e: any) {
      setAddErr(e?.message || "Failed to add trip.");
    } finally {
      setAddSaving(false);
    }
  }


  function openHelperEditDialog(args: { tripId: string; slot: TripHelperSlot }) {
    setHelperEditTripId(args.tripId);
    setHelperEditSlot(args.slot);
    setHelperEditErr("");
    setHelperEditSaving(false);
    setHelperEditOpen(true);
  }

  function closeHelperEditDialog() {
    if (helperEditSaving) return;
    setHelperEditOpen(false);
    setHelperEditTripId("");
    setHelperEditSlot("add");
    setHelperEditErr("");
    setHelperEditSaving(false);
  }

  function helperConflictMessagesForTrip(trip: TripDoc, helperUid: string) {
    const dateIso = String(trip.date || "").trim();
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return { hardMessages: ["This trip is missing a valid date."], softMessages: [] as string[] };
    }

    const uid = String(helperUid || "").trim();
    const employeeName = employeeNamesByUid[uid] || uid || "Helper";
    const employeeRole = employeeRolesByUid[uid] || "employee";
    const hard = new Set<string>();
    const soft = new Set<string>();

    const holiday = holidayByDate[dateIso];
    if (holiday) {
      hard.add(`That date is a company holiday (${holiday.name}).`);
    }

    const pto = ptoByUidByDate[uid]?.[dateIso];
    if (pto) {
      hard.add(`${employeeName} is on approved PTO for ${dateIso}.`);
    }

    const overlappingEvents = (eventsByDate[dateIso] || []).filter(
      (event) =>
        eventAppliesToUid(event, uid, employeeRole) &&
        tripBlocksEventWindowByExactTime(trip, event.timeWindow || "all_day", event.startTime, event.endTime)
    );

    for (const event of overlappingEvents) {
      hard.add(`${employeeName} is blocked by ${meetingChipLabel(event)}.`);
    }

    const overlappingTrips = trips.filter(
      (existingTrip) =>
        existingTrip.id !== trip.id &&
        existingTrip.active !== false &&
        normalizeStatus(existingTrip.status) !== "cancelled" &&
        String(existingTrip.date || "").trim() === dateIso &&
        isEmployeeOnTrip(existingTrip, uid) &&
        tripsOverlapByExactTime(trip, existingTrip)
    );

    for (const existingTrip of overlappingTrips) {
      const status = normalizeStatus(existingTrip.status);
      const detail = formatTimeRangeForCard(existingTrip);

      if (status === "in_progress") {
        hard.add(`${employeeName} already has an overlapping in-progress trip (${detail}).`);
      } else if (status === "planned") {
        soft.add(`${employeeName} already has an overlapping planned trip (${detail}).`);
      }
    }

    const targetLeadUid = String(trip.crew?.primaryTechUid || "").trim();

    const otherDayAssignments = trips.filter(
      (existingTrip) =>
        existingTrip.id !== trip.id &&
        existingTrip.active !== false &&
        normalizeStatus(existingTrip.status) !== "cancelled" &&
        String(existingTrip.date || "").trim() === dateIso &&
        isEmployeeOnTrip(existingTrip, uid) &&
        !tripsOverlapByExactTime(trip, existingTrip)
    );

    for (const existingTrip of otherDayAssignments) {
      const existingLeadUid = String(existingTrip.crew?.primaryTechUid || "").trim();

      if (targetLeadUid && existingLeadUid === targetLeadUid) {
        continue;
      }

      const leadName = existingTrip.crew?.primaryTechName || "another crew";
      const detail = formatTimeRangeForCard(existingTrip);
      hard.add(`${employeeName} is already assigned to ${leadName} on another trip that day (${detail}).`);
    }

    return {
      hardMessages: Array.from(hard),
      softMessages: Array.from(soft),
    };
  }

  function helperUnavailableReasonForTrip(trip: TripDoc, helper: HelperOption) {
    if (helperIsAlreadyOnTrip(trip, helper.uid)) {
      return "Already on this trip";
    }

    const conflicts = helperConflictMessagesForTrip(trip, helper.uid);
    return conflicts.hardMessages[0] || conflicts.softMessages[0] || "";
  }

  function serviceTicketCrewUpdatePayload(nextCrew: TripCrew) {
    const primaryTechUid = String(nextCrew.primaryTechUid || "").trim();
    const helperIds = uniqueTrimmedStrings([
      nextCrew.helperUid,
      nextCrew.secondaryHelperUid,
    ]);

    const helperNames = helperIds
      .map((uid) => employeeNamesByUid[uid] || "")
      .filter(Boolean);

    const assignedTechnicianIds = uniqueTrimmedStrings([
      primaryTechUid,
      nextCrew.secondaryTechUid,
      ...helperIds,
    ]);

    return {
      helperIds: helperIds.length ? helperIds : null,
      helperNames: helperNames.length ? helperNames : null,
      assignedTechnicianIds,
      updatedAt: nowIso(),
    };
  }

  async function syncServiceTicketCrewFromTrip(trip: TripDoc, nextCrew: TripCrew) {
    const serviceTicketId = String(trip.link?.serviceTicketId || "").trim();
    if (!serviceTicketId) return;

    await updateDoc(doc(db, "serviceTickets", serviceTicketId), serviceTicketCrewUpdatePayload(nextCrew));
  }

  async function assignHelperToTrip(helper: HelperOption) {
    if (!helperEditTrip) return;
    if (!canEditSchedule) {
      setHelperEditErr("Only Admin/Dispatcher/Manager can update scheduled helpers.");
      return;
    }

    if (!isPlannedStatus(helperEditTrip.status)) {
      setHelperEditErr("Helper quick edits are only available before the trip has started.");
      return;
    }

    const existingEntries = tripHelperEntries(helperEditTrip);
    if (helperEditSlot === "add" && existingEntries.length >= 2) {
      setHelperEditErr("This trip already has two helpers assigned.");
      return;
    }

    if (helperIsAlreadyOnTrip(helperEditTrip, helper.uid)) {
      setHelperEditErr(`${helper.name} is already assigned to this trip.`);
      return;
    }

    const conflicts = helperConflictMessagesForTrip(helperEditTrip, helper.uid);
    if (conflicts.hardMessages.length > 0) {
      setHelperEditErr(conflicts.hardMessages[0]);
      return;
    }

    if (conflicts.softMessages.length > 0) {
      setHelperEditErr(conflicts.softMessages[0]);
      return;
    }

    const nextCrew = crewWithHelperAssigned(helperEditTrip.crew, helperEditSlot, helper);
    const now = nowIso();

    setHelperEditSaving(true);
    setHelperEditErr("");

    try {
      await updateDoc(doc(db, "trips", helperEditTrip.id), {
        crew: nextCrew,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      });

      await syncServiceTicketCrewFromTrip(helperEditTrip, nextCrew);

      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === helperEditTrip.id
            ? {
                ...trip,
                crew: nextCrew,
                updatedAt: now,
              }
            : trip
        )
      );

      closeHelperEditDialog();
    } catch (e: any) {
      setHelperEditErr(e?.message || "Failed to update helper assignment.");
    } finally {
      setHelperEditSaving(false);
    }
  }

  async function removeHelperFromTrip() {
    if (!helperEditTrip || helperEditSlot === "add") return;

    if (!canEditSchedule) {
      setHelperEditErr("Only Admin/Dispatcher/Manager can update scheduled helpers.");
      return;
    }

    if (!isPlannedStatus(helperEditTrip.status)) {
      setHelperEditErr("Helper quick edits are only available before the trip has started.");
      return;
    }

    const nextCrew = crewWithHelperRemoved(helperEditTrip.crew, helperEditSlot);
    const now = nowIso();

    setHelperEditSaving(true);
    setHelperEditErr("");

    try {
      await updateDoc(doc(db, "trips", helperEditTrip.id), {
        crew: nextCrew,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      });

      await syncServiceTicketCrewFromTrip(helperEditTrip, nextCrew);

      setTrips((prev) =>
        prev.map((trip) =>
          trip.id === helperEditTrip.id
            ? {
                ...trip,
                crew: nextCrew,
                updatedAt: now,
              }
            : trip
        )
      );

      closeHelperEditDialog();
    } catch (e: any) {
      setHelperEditErr(e?.message || "Failed to remove helper.");
    } finally {
      setHelperEditSaving(false);
    }
  }

  function renderTripHelperChips(trip: TripDoc) {
    const entries = tripHelperEntries(trip);
    const editable = canEditSchedule && isPlannedStatus(trip.status);
    const canAddHelper = editable && entries.length < 2;

    if (entries.length === 0 && !canAddHelper) return null;

    return (
      <Stack
        direction="row"
        spacing={0.75}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        onClick={(event) => event.stopPropagation()}
        sx={{ pl: { xs: "66px", md: "64px" } }}
      >
        <GroupsRoundedIcon
          titleAccess="Helpers"
          sx={{
            fontSize: 17,
            color: "text.secondary",
            mr: 0.25,
            flexShrink: 0,
          }}
        />

        {entries.map((entry) => (
          <Chip
            key={`${trip.id}_${entry.slot}_${entry.uid}`}
            size="small"
            label={entry.name}
            variant="outlined"
            clickable={editable}
            onClick={
              editable
                ? (event) => {
                    event.stopPropagation();
                    openHelperEditDialog({ tripId: trip.id, slot: entry.slot });
                  }
                : undefined
            }
            sx={{
              height: 26,
              borderRadius: 999,
              fontWeight: 800,
              maxWidth: 140,
              "& .MuiChip-label": {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          />
        ))}

        {canAddHelper ? (
          <Chip
            size="small"
            icon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
            label="Add"
            color="primary"
            variant="outlined"
            clickable
            onClick={(event) => {
              event.stopPropagation();
              openHelperEditDialog({ tripId: trip.id, slot: "add" });
            }}
            sx={{
              height: 26,
              borderRadius: 999,
              fontWeight: 850,
            }}
          />
        ) : null}
      </Stack>
    );
  }

  function resetMeetingForm() {
    setEditingMeetId(null);
    setEditingMeetOriginalDate("");
    setMeetDateIso("");
    setMeetTitle("");
    setMeetWindow("am");
    setMeetStart("08:00");
    setMeetEnd("09:00");
    setMeetLocation("");
    setMeetNotes("");
    setMeetBlocks(true);
    setMeetIncludeAll(true);
    setMeetAppliesToUids(allMeetingEmployeeUids);
    setMeetAttendeeSearch("");
    setMeetRoleFilter("all");
    setMeetErr("");
    setMeetMsg("");
  }

  function openMeetingModal(defaultDateIso: string) {
    resetMeetingForm();
    setMeetDateIso(defaultDateIso);
    setMeetOpen(true);
  }

  function closeAddScheduleMenu() {
    setAddScheduleAnchorEl(null);
  }

  function openAddScheduleMenu(event: React.MouseEvent<HTMLElement>) {
    setAddScheduleAnchorEl(event.currentTarget);
  }

  function handleAddMeetingFromMenu() {
    closeAddScheduleMenu();
    openMeetingModal(range.startIso);
  }

  function handleAddStaffCoverageFromMenu() {
    closeAddScheduleMenu();
    router.push("/admin/staff-coverage");
  }

  function resetManualBlockForm(defaultDateIso = range.startIso) {
    setBlockDateIso(defaultDateIso);
    setBlockTitle("");
    setBlockWindow("am");
    setBlockStart("08:00");
    setBlockEnd("09:00");
    setBlockNotes("");
    setBlockIncludeAll(false);
    setBlockAppliesToUids([]);
    setBlockErr("");
  }

  function openManualBlockModal(defaultDateIso: string) {
    resetManualBlockForm(defaultDateIso);
    setBlockOpen(true);
  }

  function handleAddManualBlockFromMenu() {
    closeAddScheduleMenu();
    openManualBlockModal(range.startIso);
  }

  function closeManualBlockModal() {
    if (blockSaving) return;
    setBlockOpen(false);
    setBlockSaving(false);
    setBlockErr("");
  }

  function setManualBlockAttendees(nextUids: Array<string | null | undefined>) {
    const allowed = new Set(allMeetingEmployeeUids);
    const cleaned = uniqueTrimmedStrings(nextUids).filter((uid) => allowed.has(uid));
    setBlockAppliesToUids(cleaned);
    setBlockIncludeAll(
      allMeetingEmployeeUids.length > 0 && allMeetingEmployeeUids.every((uid) => cleaned.includes(uid))
    );
  }

  async function submitManualBlock() {
    if (!canEditSchedule) {
      setBlockErr("Only Admin/Dispatcher/Manager can add manual schedule blocks.");
      return;
    }

    const dateIso = String(blockDateIso || "").trim();
    const title = String(blockTitle || "").trim();
    const attendeeUids = uniqueTrimmedStrings(blockAppliesToUids).filter((uid) => allMeetingEmployeeUids.includes(uid));

    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return setBlockErr("Missing/invalid date.");
    if (!title) return setBlockErr("Block title is required.");
    if (attendeeUids.length === 0) return setBlockErr("Select at least one employee to block.");

    if (blockWindow === "custom") {
      const sMin = minutesFromHHMM(blockStart);
      const eMin = minutesFromHHMM(blockEnd);
      if (sMin == null || eMin == null || eMin <= sMin) {
        return setBlockErr("Custom block end time must be after start time.");
      }
    }

    const attendeeNames = attendeeUids.map((uid) => {
      const employee = meetingEmployees.find((item) => item.uid === uid);
      return employee?.displayName || uid;
    });

    const now = nowIso();
    setBlockSaving(true);
    setBlockErr("");

    try {
      const payload: any = {
        active: true,
        type: "manual_block",
        title,
        date: dateIso,
        timeWindow: blockWindow,
        startTime: blockWindow === "custom" ? blockStart : null,
        endTime: blockWindow === "custom" ? blockEnd : null,
        location: null,
        notes: blockNotes.trim() || null,
        appliesToRoles: [],
        appliesToUids: attendeeUids,
        appliesToNames: attendeeNames,
        includeAllEmployees:
          allMeetingEmployeeUids.length > 0 && allMeetingEmployeeUids.every((uid) => attendeeUids.includes(uid)),
        blocksSchedule: true,
        createdAt: now,
        createdByUid: appUser?.uid || null,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

      const created = await addDoc(collection(db, "companyEvents"), payload);
      const newEvent: CompanyEvent = { id: created.id, ...(payload as any) };

      setEventsByDate((prev) => {
        const next = { ...prev };
        const list = [...(next[dateIso] || [])];
        list.push(newEvent);
        next[dateIso] = list;
        return next;
      });

      closeManualBlockModal();
    } catch (e: any) {
      setBlockErr(e?.message || "Failed to add manual block.");
    } finally {
      setBlockSaving(false);
    }
  }

  function openEditMeetingModal(e: CompanyEvent) {
    resetMeetingForm();
    const derivedUids = deriveMeetingUidsFromEvent(e);

    setEditingMeetId(e.id);
    setEditingMeetOriginalDate(e.date);
    setMeetDateIso(e.date);
    setMeetTitle(String(e.title || ""));
    const w = String(e.timeWindow || "am").toLowerCase();
    setMeetWindow(w === "all_day" ? "all_day" : w === "pm" ? "pm" : w === "custom" ? "custom" : "am");

    if (w === "custom") {
      setMeetStart(String(e.startTime || "08:00"));
      setMeetEnd(String(e.endTime || "09:00"));
    } else if (w === "pm") {
      setMeetStart("13:00");
      setMeetEnd("14:00");
    } else if (w === "all_day") {
      setMeetStart("08:00");
      setMeetEnd("17:00");
    } else {
      setMeetStart("08:00");
      setMeetEnd("09:00");
    }

    setMeetLocation(String(e.location || ""));
    setMeetNotes(String(e.notes || ""));
    setMeetBlocks(Boolean(e.blocksSchedule ?? true));
    setMeetAppliesToUids(derivedUids);
    setMeetIncludeAll(
      allMeetingEmployeeUids.length > 0 && allMeetingEmployeeUids.every((uid) => derivedUids.includes(uid))
    );
    setMeetOpen(true);
  }

  function closeMeetingModal() {
    if (meetSaving) return;
    setMeetOpen(false);
    setMeetSaving(false);
    setMeetErr("");
    setMeetMsg("");
  }

  useEffect(() => {
    if (!meetOpen || editingMeetId) return;
    if (!meetIncludeAll) return;
    if (allMeetingEmployeeUids.length === 0) return;
    if (meetAppliesToUids.length === allMeetingEmployeeUids.length) return;
    setMeetAppliesToUids(allMeetingEmployeeUids);
  }, [meetOpen, editingMeetId, meetIncludeAll, allMeetingEmployeeUids, meetAppliesToUids.length]);

  async function getMeetingTimeEntries(eventId: string): Promise<MeetingTimeEntryLite[]> {
    const snap = await getDocs(query(collection(db, "timeEntries"), where("companyEventId", "==", eventId)));
    return snap.docs.map((ds) => {
      const d = ds.data() as any;
      return {
        id: ds.id,
        employeeId: String(d.employeeId ?? ""),
        employeeName: String(d.employeeName ?? ""),
        employeeRole: String(d.employeeRole ?? ""),
        entryDate: String(d.entryDate ?? ""),
        weekStartDate: String(d.weekStartDate ?? ""),
        weekEndDate: String(d.weekEndDate ?? ""),
        timesheetId: d.timesheetId ?? null,
        entryStatus: d.entryStatus ?? "draft",
      };
    });
  }

  async function assertMeetingEntriesNotLocked(entries: MeetingTimeEntryLite[]) {
    const locked: Array<{ employeeName: string; weekStartDate: string; status: string }> = [];

    await Promise.all(
      entries.map(async (entry) => {
        const wsId = buildWeeklyTimesheetId(entry.employeeId, entry.weekStartDate);
        try {
          const tsSnap = await getDoc(doc(db, "weeklyTimesheets", wsId));
          if (!tsSnap.exists()) return;
          const d = tsSnap.data() as any;
          const status = String(d.status ?? "").toLowerCase().trim();
          if (isLockedWeeklyTimesheetStatus(status)) {
            locked.push({ employeeName: entry.employeeName || entry.employeeId, weekStartDate: entry.weekStartDate, status });
          }
        } catch {
          // ignore timesheet check read errors here
        }
      })
    );

    if (locked.length) {
      const first = locked[0];
      const more = locked.length > 1 ? ` (+${locked.length - 1} more)` : "";
      throw new Error(
        `This meeting cannot be changed because it has time entries in a locked weekly timesheet. Example: ${first.employeeName} • week ${first.weekStartDate} • status ${first.status}${more}`
      );
    }
  }

  async function assertWeeklyTimesheetsUnlockedForAttendees(args: {
    attendeeUids: string[];
    dateIso: string;
    attendeeLabels?: Record<string, string>;
  }) {
    const { attendeeUids, dateIso, attendeeLabels = {} } = args;
    const { weekStartDate } = getPayrollWeekBounds(dateIso);

    const locked: Array<{ employeeName: string; weekStartDate: string; status: string }> = [];

    await Promise.all(
      uniqueTrimmedStrings(attendeeUids).map(async (uid) => {
        try {
          const tsSnap = await getDoc(doc(db, "weeklyTimesheets", buildWeeklyTimesheetId(uid, weekStartDate)));
          if (!tsSnap.exists()) return;
          const data = tsSnap.data() as any;
          const status = String(data.status ?? "").toLowerCase().trim();
          if (isLockedWeeklyTimesheetStatus(status)) {
            locked.push({
              employeeName: attendeeLabels[uid] || String(data.employeeName ?? uid),
              weekStartDate,
              status,
            });
          }
        } catch {
          // ignore timesheet read issues here
        }
      })
    );

    if (locked.length) {
      const first = locked[0];
      const more = locked.length > 1 ? ` (+${locked.length - 1} more)` : "";
      throw new Error(
        `This meeting cannot be saved because one or more attendees already have a locked weekly timesheet for week ${first.weekStartDate}. Example: ${first.employeeName} • status ${first.status}${more}`
      );
    }
  }

  async function createPaidMeetingEntries(args: {
    eventId: string;
    dateIso: string;
    title: string;
    timeWindow: string;
    startTime?: string | null;
    endTime?: string | null;
    location?: string | null;
    attendeeUids: string[];
    attendeeNamesByUid?: Record<string, string>;
    createdByUid: string | null;
  }) {
    const {
      eventId,
      dateIso,
      title,
      timeWindow,
      startTime,
      endTime,
      location,
      attendeeUids,
      attendeeNamesByUid = {},
      createdByUid,
    } = args;

    const cleanedAttendeeUids = uniqueTrimmedStrings(attendeeUids);
    if (cleanedAttendeeUids.length === 0) return;

    const now = nowIso();
    const hours = defaultMeetingHours(timeWindow, startTime, endTime);
    const { weekStartDate, weekEndDate } = getPayrollWeekBounds(dateIso);

    const usersSnap = await getDocs(collection(db, "users"));
    const userMap = new Map<string, { displayName: string; role: string; active: boolean }>();
    usersSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const uid = String(data.uid ?? docSnap.id);
      userMap.set(uid, {
        displayName: String(data.displayName ?? attendeeNamesByUid[uid] ?? uid),
        role: String(data.role ?? "employee"),
        active: Boolean(data.active ?? false),
      });
    });

    const batch = writeBatch(db);

    for (const uid of cleanedAttendeeUids) {
      const user = userMap.get(uid);
      const employeeName = user?.displayName || attendeeNamesByUid[uid] || uid;
      const employeeRole = user?.role || "employee";
      const timesheetId = buildWeeklyTimesheetId(uid, weekStartDate);
      const timeEntryId = `meeting_${eventId}_${uid}`;

      batch.set(
        doc(db, "weeklyTimesheets", timesheetId),
        {
          employeeId: uid,
          employeeName,
          employeeRole,
          weekStartDate,
          weekEndDate,
          status: "draft",
          submittedAt: null,
          submittedByUid: null,
          createdAt: now,
          createdByUid,
          updatedAt: now,
          updatedByUid: createdByUid,
        },
        { merge: true }
      );

      batch.set(
        doc(db, "timeEntries", timeEntryId),
        {
          employeeId: uid,
          employeeName,
          employeeRole,
          entryDate: dateIso,
          weekStartDate,
          weekEndDate,
          timesheetId,
          category: "meeting",
          payType: "regular",
          billable: false,
          source: "company_meeting",
          hours,
          hoursSource: hours,
          hoursLocked: true,
          companyEventId: eventId,
          title,
          location: location || null,
          entryStatus: "draft",
          notes: null,
          createdAt: now,
          createdByUid,
          updatedAt: now,
          updatedByUid: createdByUid,
        },
        { merge: true }
      );
    }

    await batch.commit();
  }

  async function updateMeetingAndEntries(args: {
    eventId: string;
    originalDateIso: string;
    payload: any;
  }) {
    const { eventId, originalDateIso, payload } = args;
    const entries = await getMeetingTimeEntries(eventId);
    await assertMeetingEntriesNotLocked(entries);

    const attendeeUids = uniqueTrimmedStrings(payload.appliesToUids || []);
    const attendeeNames = uniqueTrimmedStrings(payload.appliesToNames || []);
    const attendeeNamesByUid = attendeeUids.reduce<Record<string, string>>((acc, uid, index) => {
      acc[uid] = attendeeNames[index] || uid;
      return acc;
    }, {});

    await assertWeeklyTimesheetsUnlockedForAttendees({
      attendeeUids,
      dateIso: payload.date,
      attendeeLabels: attendeeNamesByUid,
    });

    const now = nowIso();
    await updateDoc(doc(db, "companyEvents", eventId), {
      ...payload,
      updatedAt: now,
      updatedByUid: appUser?.uid || null,
    });

    const hours = defaultMeetingHours(payload.timeWindow, payload.startTime, payload.endTime);
    const { weekStartDate, weekEndDate } = getPayrollWeekBounds(payload.date);
    const batch = writeBatch(db);

    const existingByEmployeeId = new Map(entries.map((entry) => [entry.employeeId, entry]));
    const existingEmployeeIds = new Set(existingByEmployeeId.keys());
    const nextEmployeeIds = new Set(attendeeUids);

    const usersSnap = await getDocs(collection(db, "users"));
    const userMap = new Map<string, { displayName: string; role: string }>();
    usersSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const uid = String(data.uid ?? docSnap.id);
      userMap.set(uid, {
        displayName: String(data.displayName ?? attendeeNamesByUid[uid] ?? uid),
        role: String(data.role ?? "employee"),
      });
    });

    for (const entry of entries) {
      if (!nextEmployeeIds.has(entry.employeeId)) {
        batch.delete(doc(db, "timeEntries", entry.id));
      }
    }

    for (const uid of attendeeUids) {
      const existing = existingByEmployeeId.get(uid);
      const user = userMap.get(uid);
      const employeeName = user?.displayName || attendeeNamesByUid[uid] || existing?.employeeName || uid;
      const employeeRole = user?.role || existing?.employeeRole || "employee";
      const timesheetId = buildWeeklyTimesheetId(uid, weekStartDate);
      const timeEntryId = existing?.id || `meeting_${eventId}_${uid}`;

      batch.set(
        doc(db, "weeklyTimesheets", timesheetId),
        {
          employeeId: uid,
          employeeName,
          employeeRole,
          weekStartDate,
          weekEndDate,
          status: "draft",
          submittedAt: null,
          submittedByUid: null,
          updatedAt: now,
          updatedByUid: appUser?.uid || null,
        },
        { merge: true }
      );

      batch.set(
        doc(db, "timeEntries", timeEntryId),
        {
          employeeId: uid,
          employeeName,
          employeeRole,
          entryDate: payload.date,
          weekStartDate,
          weekEndDate,
          timesheetId,
          category: "meeting",
          payType: "regular",
          billable: false,
          source: "company_meeting",
          hours,
          hoursSource: hours,
          hoursLocked: true,
          companyEventId: eventId,
          title: payload.title,
          location: payload.location || null,
          entryStatus: "draft",
          notes: null,
          updatedAt: now,
          updatedByUid: appUser?.uid || null,
          ...(existingEmployeeIds.has(uid)
            ? {}
            : {
                createdAt: now,
                createdByUid: appUser?.uid || null,
              }),
        },
        { merge: true }
      );
    }

    await batch.commit();

    const updatedEvent: CompanyEvent = {
      id: eventId,
      active: true,
      type: "meeting",
      title: String(payload.title || "Meeting"),
      date: String(payload.date || ""),
      timeWindow: payload.timeWindow ?? "am",
      startTime: payload.startTime ?? null,
      endTime: payload.endTime ?? null,
      location: payload.location ?? null,
      notes: payload.notes ?? null,
      appliesToRoles: payload.appliesToRoles ?? null,
      appliesToUids: payload.appliesToUids ?? null,
      appliesToNames: payload.appliesToNames ?? null,
      includeAllEmployees: Boolean(payload.includeAllEmployees),
      blocksSchedule: Boolean(payload.blocksSchedule),
      updatedAt: now,
      updatedByUid: appUser?.uid || null,
    };

    setEventsByDate((prev) => {
      const next = { ...prev };
      const oldList = [...(next[originalDateIso] || [])].filter((event) => event.id !== eventId);
      if (oldList.length) next[originalDateIso] = oldList;
      else delete next[originalDateIso];

      const newList = [...(next[updatedEvent.date] || [])].filter((event) => event.id !== eventId);
      newList.push(updatedEvent);
      next[updatedEvent.date] = newList;

      return next;
    });
  }

  async function deleteMeetingAndEntries(eventId: string, dateIso: string) {
    const entries = await getMeetingTimeEntries(eventId);
    await assertMeetingEntriesNotLocked(entries);

    const now = nowIso();
    await updateDoc(doc(db, "companyEvents", eventId), {
      active: false,
      updatedAt: now,
      updatedByUid: appUser?.uid || null,
    });

    const batch = writeBatch(db);
    for (const entry of entries) {
      batch.delete(doc(db, "timeEntries", entry.id));
    }
    await batch.commit();

    setEventsByDate((prev) => {
      const next = { ...prev };
      const list = [...(next[dateIso] || [])].filter((event) => event.id !== eventId);
      if (list.length) next[dateIso] = list;
      else delete next[dateIso];
      return next;
    });
  }

  async function submitMeeting() {
    if (!canEditSchedule) {
      setMeetErr("Only Admin/Dispatcher/Manager can schedule meetings.");
      return;
    }

    setMeetErr("");
    setMeetMsg("");

    const dateIso = String(meetDateIso || "").trim();
    const title = String(meetTitle || "").trim();
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return setMeetErr("Missing/invalid date.");
    if (!title) return setMeetErr("Meeting title is required.");

    const attendeeUids = uniqueTrimmedStrings(meetAppliesToUids).filter((uid) => allMeetingEmployeeUids.includes(uid));
    if (attendeeUids.length === 0) {
      return setMeetErr("Select at least one employee for this meeting.");
    }

    if (holidayByDate[dateIso]) return setMeetErr(`That date is a company holiday (${holidayByDate[dateIso].name}).`);

    if (meetingConflictSummary.hardMessages.length > 0) {
      return setMeetErr(meetingConflictSummary.hardMessages[0]);
    }

    if (meetWindow === "custom") {
      const st = String(meetStart || "").trim();
      const et = String(meetEnd || "").trim();
      if (!/^\d{2}:\d{2}$/.test(st) || !/^\d{2}:\d{2}$/.test(et)) return setMeetErr("Custom start/end must be HH:mm.");
      const sMin = minutesFromHHMM(st);
      const eMin = minutesFromHHMM(et);
      if (sMin == null || eMin == null || eMin <= sMin) return setMeetErr("End time must be after start time.");
    }

    const attendeeNames = attendeeUids.map((uid) => {
      const employee = meetingEmployees.find((item) => item.uid === uid);
      return employee?.displayName || uid;
    });

    const attendeeNamesByUid = attendeeUids.reduce<Record<string, string>>((acc, uid, index) => {
      acc[uid] = attendeeNames[index] || uid;
      return acc;
    }, {});

    setMeetSaving(true);

    try {
      const now = nowIso();

      const payload: any = {
        active: true,
        type: "meeting",
        title,
        date: dateIso,
        timeWindow: meetWindow,
        startTime: meetWindow === "custom" ? meetStart : null,
        endTime: meetWindow === "custom" ? meetEnd : null,
        location: meetLocation.trim() || null,
        notes: meetNotes.trim() || null,
        appliesToRoles: [],
        appliesToUids: attendeeUids,
        appliesToNames: attendeeNames,
        includeAllEmployees:
          allMeetingEmployeeUids.length > 0 && allMeetingEmployeeUids.every((uid) => attendeeUids.includes(uid)),
        blocksSchedule: Boolean(meetBlocks),
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

      await assertWeeklyTimesheetsUnlockedForAttendees({
        attendeeUids,
        dateIso,
        attendeeLabels: attendeeNamesByUid,
      });

      if (editingMeetId) {
        await updateMeetingAndEntries({
          eventId: editingMeetId,
          originalDateIso: editingMeetOriginalDate || dateIso,
          payload,
        });
        closeMeetingModal();
        return;
      }

      const createPayload: any = {
        ...payload,
        createdAt: now,
        createdByUid: appUser?.uid || null,
      };

      const created = await addDoc(collection(db, "companyEvents"), createPayload);

      await createPaidMeetingEntries({
        eventId: created.id,
        dateIso: createPayload.date,
        title: createPayload.title,
        timeWindow: createPayload.timeWindow,
        startTime: createPayload.startTime,
        endTime: createPayload.endTime,
        location: createPayload.location,
        attendeeUids: createPayload.appliesToUids || [],
        attendeeNamesByUid,
        createdByUid: appUser?.uid || null,
      });

      const newEvent: CompanyEvent = { id: created.id, ...(createPayload as any) };
      setEventsByDate((prev) => {
        const next = { ...prev };
        const list = [...(next[dateIso] || [])];
        list.push(newEvent);
        next[dateIso] = list;
        return next;
      });

      closeMeetingModal();
    } catch (e: any) {
      setMeetErr(e?.message || "Failed to schedule/update meeting.");
    } finally {
      setMeetSaving(false);
    }
  }

  async function handleDeleteMeeting() {
    if (!canEditSchedule || !editingMeetId) return;
    const ok = window.confirm("Delete this meeting? This will remove the schedule block and delete the meeting time entries.");
    if (!ok) return;

    setMeetSaving(true);
    setMeetErr("");

    try {
      await deleteMeetingAndEntries(editingMeetId, editingMeetOriginalDate || meetDateIso);
      closeMeetingModal();
    } catch (e: any) {
      setMeetErr(e?.message || "Failed to delete meeting.");
    } finally {
      setMeetSaving(false);
    }
  }

  useEffect(() => {
  if (typeof window === "undefined") return;

  const mq = window.matchMedia("(max-width: 860px)");
  const mobileNow = Boolean(mq.matches);
  const defaultView: ViewMode = mobileNow ? "day" : "week";

  setIsMobile(mobileNow);

  try {
    const url = new URL(window.location.href);
    const v = (url.searchParams.get("view") || "").toLowerCase();
    const d = (url.searchParams.get("date") || "").trim();

    if (v === "day" || v === "week") {
      setView(v);
      if (v === "day" && !d) setAnchorIso(todayIsoLocal());
    } else if (v === "month") {
      // Month view is intentionally hidden from the main Schedule UI.
      // Old / bookmarked month URLs are routed to Week view instead.
      setView("week");
    } else {
      setView(defaultView);
      setAnchorIso(todayIsoLocal());
    }

    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAnchorIso(d);

    const hide = url.searchParams.get("hideCompleted");
    if (hide === "0") setHideCompleted(false);

    const tf = url.searchParams.get("tech");
    if (tf) setTechFilter(tf);

    const sf = url.searchParams.get("status");
    if (sf) setStatusFilter(sf);
  } catch {
    setView(defaultView);
    setAnchorIso(todayIsoLocal());
  } finally {
    setSchedulePrefsReady(true);
  }

  const apply = () => setIsMobile(Boolean(mq.matches));

  try {
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  } catch {
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }
}, []);

  useEffect(() => {
    if (!schedulePrefsReady) return;

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      url.searchParams.set("date", anchorIso);
      url.searchParams.set("hideCompleted", hideCompleted ? "1" : "0");
      url.searchParams.set("tech", techFilter);
      url.searchParams.set("status", statusFilter);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore history update issues
    }
  }, [schedulePrefsReady, view, anchorIso, hideCompleted, techFilter, statusFilter]);

  const anchorDate = useMemo(() => fromIsoDate(anchorIso), [anchorIso]);

  const range = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      d.setHours(0, 0, 0, 0);
      const iso = toIsoDate(d);
      return { startIso: iso, endIso: iso };
    }

    if (view === "month") {
      const y = anchorDate.getFullYear();
      const m = anchorDate.getMonth();
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      first.setHours(0, 0, 0, 0);
      last.setHours(0, 0, 0, 0);
      return { startIso: toIsoDate(first), endIso: toIsoDate(last) };
    }

    const weekStart = startOfWorkWeek(anchorDate);
    const weekDays = workWeekDays(weekStart);
    return { startIso: toIsoDate(weekDays[0]), endIso: toIsoDate(weekDays[weekDays.length - 1]) };
  }, [view, anchorIso, anchorDate]);

useEffect(() => {
  async function loadUsers() {
    setTechsLoading(true);
    setTechsError("");

    try {
      const [usersSnap, profilesSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "employeeProfiles")),
      ]);

      const allUsers: EmployeeOption[] = usersSnap.docs
        .map((ds) => {
          const d = ds.data() as any;
          return {
            uid: String(d.uid ?? ds.id),
            displayName: String(d.displayName ?? "Unnamed"),
            role: String(d.role ?? ""),
            active: Boolean(d.active ?? false),
          };
        })
        .filter((item) => item.active);

      const techItems: TechRow[] = allUsers
        .filter((item) => normalizeRole(item.role) === "technician")
        .map((item) => ({ uid: item.uid, name: item.displayName }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const legacyPairingByUserUid = new Map(
        profilesSnap.docs
          .map((ds) => {
            const profile = ds.data() as any;
            return [
              String(profile.userUid || "").trim(),
              String(profile.defaultPairedTechUid || "").trim() || null,
            ] as const;
          })
          .filter(([uid]) => Boolean(uid))
      );

      const helperItems: HelperOption[] = usersSnap.docs
        .map((ds) => {
          const user = ds.data() as any;
          const uid = String(user.uid ?? ds.id).trim();
          const role = normalizeRole(user.role);
          const preferredTechnicianId =
            String(user.preferredTechnicianId || "").trim() ||
            legacyPairingByUserUid.get(uid) ||
            null;

          return {
            uid,
            name: String(user.displayName || "Unnamed"),
            laborRole: role,
            defaultPairedTechUid: preferredTechnicianId,
            active: Boolean(user.active ?? false),
          };
        })
        .filter(
          (helper) =>
            helper.active &&
            helper.uid &&
            (helper.laborRole === "helper" || helper.laborRole === "apprentice")
        )
        .map(({ active: _active, ...helper }) => helper)
        .sort((a, b) => a.name.localeCompare(b.name));

      const meetingEligibleUsers = allUsers
        .filter((item) => isMeetingEligibleRole(item.role))
        .sort((a, b) => {
          const byName = a.displayName.localeCompare(b.displayName);
          if (byName !== 0) return byName;
          return formatRoleLabel(a.role).localeCompare(formatRoleLabel(b.role));
        });

      setTechs(techItems);
      setHelpers(helperItems);
      setMeetingEmployees(meetingEligibleUsers);
    } catch (e: any) {
      setTechsError(e?.message || "Failed to load employees.");
      setTechs([]);
      setHelpers([]);
      setMeetingEmployees([]);
    } finally {
      setTechsLoading(false);
    }
  }

  loadUsers();
}, []);

  useEffect(() => {
    async function loadHolidays() {
      setHolidaysLoading(true);
      setHolidaysError("");

      try {
        let snap;
        try {
          snap = await getDocs(query(collection(db, "companyHolidays"), where("active", "==", true)));
        } catch {
          snap = await getDocs(collection(db, "companyHolidays"));
        }

        const map: Record<string, CompanyHoliday> = {};
        for (const ds of snap.docs) {
          const d = ds.data() as any;
          const active = typeof d.active === "boolean" ? d.active : true;
          if (!active) continue;

          const rawDate = String(d.date ?? d.holidayDate ?? d.holiday_date ?? "").trim();
          if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) continue;
          if (rawDate < range.startIso || rawDate > range.endIso) continue;

          map[rawDate] = {
            id: ds.id,
            date: rawDate,
            name: String(d.name ?? d.title ?? "Holiday"),
            active: true,
          };
        }

        setHolidayByDate(map);
      } catch (e: any) {
        setHolidaysError(e?.message || "Failed to load company holidays.");
        setHolidayByDate({});
      } finally {
        setHolidaysLoading(false);
      }
    }

    loadHolidays();
  }, [range.startIso, range.endIso]);

  useEffect(() => {
    async function loadPto() {
      setPtoLoading(true);
      setPtoError("");

      try {
        const snap = await getDocs(collection(db, "ptoRequests"));

        const byUid: Record<string, Record<string, PtoDay>> = {};
        const namesByDate: Record<string, Set<string>> = {};

        for (const ds of snap.docs) {
          const d = ds.data() as any;
          if (!looksApprovedPto(d)) continue;

          const uid = extractEmployeeUid(d);
          if (!uid) continue;

          const dates = extractPtoDates(d);
          if (dates.length === 0) continue;

          const employeeName = extractEmployeeName(d) || findTechName(uid) || uid;
          const hours = d.hours ?? d.hoursPaid ?? d.requestedHours ?? null;
          const reason = d.reason ?? d.notes ?? d.note ?? null;

          for (const date of dates) {
            if (date < range.startIso || date > range.endIso) continue;

            if (!byUid[uid]) byUid[uid] = {};
            byUid[uid][date] = {
              uid,
              employeeName,
              date,
              hours: Number.isFinite(Number(hours)) ? Number(hours) : null,
              requestId: ds.id,
              reason: reason ? String(reason) : null,
            };

            if (!namesByDate[date]) namesByDate[date] = new Set<string>();
            namesByDate[date].add(employeeName);
          }
        }

        const outNames: Record<string, string[]> = {};
        for (const date of Object.keys(namesByDate)) {
          outNames[date] = Array.from(namesByDate[date].values()).sort((a, b) => a.localeCompare(b));
        }

        setPtoByUidByDate(byUid);
        setPtoNamesByDate(outNames);
      } catch (e: any) {
        setPtoError(e?.message || "Failed to load PTO requests.");
        setPtoByUidByDate({});
        setPtoNamesByDate({});
      } finally {
        setPtoLoading(false);
      }
    }

    loadPto();
  }, [range.startIso, range.endIso, techs.map((tech) => tech.uid).join("|")]);

  useEffect(() => {
    async function loadEvents() {
      setEventsLoading(true);
      setEventsError("");

      try {
        let snap;
        try {
          snap = await getDocs(
            query(
              collection(db, "companyEvents"),
              where("active", "==", true),
              where("date", ">=", range.startIso),
              where("date", "<=", range.endIso),
              orderBy("date", "asc")
            )
          );
        } catch {
          snap = await getDocs(collection(db, "companyEvents"));
        }

        const map: Record<string, CompanyEvent[]> = {};
        for (const ds of snap.docs) {
          const d = ds.data() as any;
          const date = String(d.date || "").trim();
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          if (date < range.startIso || date > range.endIso) continue;

          const ev: CompanyEvent = {
            id: ds.id,
            active: typeof d.active === "boolean" ? d.active : true,
            type: String(d.type ?? "meeting"),
            title: String(d.title ?? d.name ?? "Meeting"),
            date,
            timeWindow: d.timeWindow ?? "am",
            startTime: d.startTime ?? null,
            endTime: d.endTime ?? null,
            location: d.location ?? null,
            notes: d.notes ?? null,
            appliesToRoles: Array.isArray(d.appliesToRoles) ? d.appliesToRoles : null,
            appliesToUids: Array.isArray(d.appliesToUids) ? d.appliesToUids : null,
            appliesToNames: Array.isArray(d.appliesToNames) ? d.appliesToNames : null,
            includeAllEmployees: Boolean(d.includeAllEmployees),
            blocksSchedule: typeof d.blocksSchedule === "boolean" ? d.blocksSchedule : true,
            createdAt: d.createdAt ?? undefined,
            createdByUid: d.createdByUid ?? null,
            updatedAt: d.updatedAt ?? undefined,
            updatedByUid: d.updatedByUid ?? null,
          };

          if (!ev.active) continue;
          if (!map[date]) map[date] = [];
          map[date].push(ev);
        }

        setEventsByDate(map);
      } catch (e: any) {
        setEventsError(e?.message || "Failed to load meetings/events.");
        setEventsByDate({});
      } finally {
        setEventsLoading(false);
      }
    }

    loadEvents();
  }, [range.startIso, range.endIso]);

  useEffect(() => {
    async function loadTrips() {
      setTripsLoading(true);
      setTripsError("");

      try {
        const qTrips = query(
          collection(db, "trips"),
          where("active", "==", true),
          where("date", ">=", range.startIso),
          where("date", "<=", range.endIso),
          orderBy("date", "asc"),
          orderBy("startTime", "asc")
        );

        const snap = await getDocs(qTrips);
        const items: TripDoc[] = snap.docs.map((ds) => {
          const d = ds.data() as any;
          return {
            id: ds.id,
            active: typeof d.active === "boolean" ? d.active : true,
            type: d.type ?? undefined,
            status: d.status ?? undefined,
            date: d.date ?? undefined,
            timeWindow: d.timeWindow ?? undefined,
            startTime: d.startTime ?? undefined,
            endTime: d.endTime ?? undefined,
            crew: d.crew ?? null,
            link: d.link ?? null,
            outcome: d.outcome ?? null,
            readyToBillAt: d.readyToBillAt ?? null,
            confirmedBy: d.confirmedBy ?? null,
            dispatchOverride: d.dispatchOverride ?? null,
            createdAt: d.createdAt ?? undefined,
            updatedAt: d.updatedAt ?? undefined,
          };
        });

        setTrips(items);
      } catch (e: any) {
        setTripsError(e?.message || "Failed to load trips.");
      } finally {
        setTripsLoading(false);
      }
    }

    loadTrips();
  }, [range.startIso, range.endIso]);

useEffect(() => {
  setLoading(
    tripsLoading ||
      techsLoading ||
      holidaysLoading ||
      ptoLoading ||
      eventsLoading ||
      staffCoverageLoading
  );
}, [
  tripsLoading,
  techsLoading,
  holidaysLoading,
  ptoLoading,
  eventsLoading,
  staffCoverageLoading,
]);

  const serviceTicketIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const trip of trips) {
      const id = String(trip.link?.serviceTicketId || "").trim();
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [trips]);

  const projectIdsInRange = useMemo(() => {
    const set = new Set<string>();
    for (const trip of trips) {
      const id = String(trip.link?.projectId || "").trim();
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [trips]);

  useEffect(() => {
    let cancelled = false;

    async function loadTicketSummaries() {
      if (serviceTicketIdsInRange.length === 0) return;
      const missing = serviceTicketIdsInRange.filter((id) => !ticketMap[id]);
      if (missing.length === 0) return;

      const next: Record<string, TicketSummary> = {};
      try {
        await Promise.all(
          missing.map(async (id) => {
            const snap = await getDoc(doc(db, "serviceTickets", id));
            if (!snap.exists()) return;
            const d = snap.data() as any;
            next[id] = {
              id,
              issueSummary: String(d.issueSummary ?? "Service Ticket"),
              customerDisplayName: String(d.customerDisplayName ?? ""),
              serviceAddressLine1: String(d.serviceAddressLine1 ?? ""),
              serviceCity: String(d.serviceCity ?? ""),
            };
          })
        );
      } catch {
        // ignore ticket summary read issues
      }

      if (!cancelled && Object.keys(next).length) setTicketMap((prev) => ({ ...prev, ...next }));
    }

    loadTicketSummaries();
    return () => {
      cancelled = true;
    };
  }, [serviceTicketIdsInRange.join("|")]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectSummaries() {
      if (projectIdsInRange.length === 0) return;
      const missing = projectIdsInRange.filter((id) => !projectMap[id]);
      if (missing.length === 0) return;

      const next: Record<string, ProjectSummary> = {};
      try {
        await Promise.all(
          missing.map(async (id) => {
            const snap = await getDoc(doc(db, "projects", id));
            if (!snap.exists()) return;
            const d = snap.data() as any;
            next[id] = { id, name: String(d.name ?? d.projectName ?? d.title ?? "Project") };
          })
        );
      } catch {
        // ignore project summary read issues
      }

      if (!cancelled && Object.keys(next).length) setProjectMap((prev) => ({ ...prev, ...next }));
    }

    loadProjectSummaries();
    return () => {
      cancelled = true;
    };
  }, [projectIdsInRange.join("|")]);

  useEffect(() => {
  async function loadStaffCoverage() {
    setStaffCoverageLoading(true);
    setStaffCoverageError("");

    try {
      const snap = await getDocs(collection(db, "staffCoverage"));

      const map: Record<string, StaffCoverageDoc[]> = {};

      for (const ds of snap.docs) {
        const d = ds.data() as any;

        const active = typeof d.active === "boolean" ? d.active : true;
        if (!active) continue;

        const status = String(d.status || "scheduled").toLowerCase();
        if (status === "cancelled") continue;

        const date = String(d.date || "").trim();
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (date < range.startIso || date > range.endIso) continue;

        const item: StaffCoverageDoc = {
          id: ds.id,
          active,
          employeeId: String(d.employeeId || ""),
          employeeName: String(d.employeeName || "Employee"),
          employeeRole: String(d.employeeRole || ""),
          laborRoleType: d.laborRoleType ?? null,
          workType: d.workType ?? "office",
          date,
          startTime: String(d.startTime || ""),
          endTime: String(d.endTime || ""),
          scheduledHours:
            typeof d.scheduledHours === "number" ? d.scheduledHours : 0,
          status: d.status ?? "scheduled",
          notes: d.notes ?? null,
        };

        if (!map[date]) map[date] = [];
        map[date].push(item);
      }

      for (const date of Object.keys(map)) {
        map[date].sort((a, b) => {
          const byTime = a.startTime.localeCompare(b.startTime);
          if (byTime !== 0) return byTime;
          return a.employeeName.localeCompare(b.employeeName);
        });
      }

      setStaffCoverageByDate(map);
    } catch (e: any) {
      setStaffCoverageError(e?.message || "Failed to load staff coverage.");
      setStaffCoverageByDate({});
    } finally {
      setStaffCoverageLoading(false);
    }
  }

  loadStaffCoverage();
}, [range.startIso, range.endIso]);

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const s = normalizeStatus(trip.status);
      if (hideCompleted && isCompletedStatus(s)) return false;

      if (statusFilter !== "ALL" && normalizeStatus(statusFilter) !== s) return false;

      if (techFilter === "ALL") return true;

      if (techFilter === "UNASSIGNED") {
        const hasPrimary = Boolean(String(trip.crew?.primaryTechUid || "").trim());
        const hasSecondary = Boolean(String(trip.crew?.secondaryTechUid || "").trim());
        return !(hasPrimary || hasSecondary);
      }

      return isTechOnTrip(trip, techFilter);
    });
  }, [trips, hideCompleted, statusFilter, techFilter]);

  const rows = useMemo(() => {
    const out: Array<{ key: string; label: string; uid: string | null }> = [];

    const unassignedHasTrips = filteredTrips.some((trip) => !primaryTechUid(trip));
    if (unassignedHasTrips || techFilter === "UNASSIGNED") {
      out.push({ key: "UNASSIGNED", label: "Unassigned", uid: null });
    }

    if (techFilter !== "ALL" && techFilter !== "UNASSIGNED") {
      const match = techs.find((tech) => tech.uid === techFilter);
      if (match) out.push({ key: match.uid, label: match.name, uid: match.uid });
      return out;
    }

    for (const tech of techs) out.push({ key: tech.uid, label: tech.name, uid: tech.uid });
    return out;
  }, [techs, filteredTrips, techFilter]);

  const grid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();

    for (const trip of filteredTrips) {
      const d = String(trip.date || "").trim();
      if (!d) continue;

      const rowUids = tripRowUids(trip);
      const targets = rowUids.length ? rowUids : ["UNASSIGNED"];

      for (const uid of targets) {
        if (!out.has(uid)) out.set(uid, new Map());
        const byDate = out.get(uid)!;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(trip);
      }
    }

    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort(compareTripTime);
        byDate.set(d, list);
      }
    }

    return out;
  }, [filteredTrips]);

  const fullGrid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();

    for (const trip of trips) {
      const d = String(trip.date || "").trim();
      if (!d) continue;

      const rowUids = tripRowUids(trip);
      const targets = rowUids.length ? rowUids : ["UNASSIGNED"];

      for (const uid of targets) {
        if (!out.has(uid)) out.set(uid, new Map());
        const byDate = out.get(uid)!;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(trip);
      }
    }

    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort(compareTripTime);
        byDate.set(d, list);
      }
    }

    return out;
  }, [trips]);

  const quickScheduleAvailability = useMemo(() => {
    const rowKey = String(quickScheduleTechUid || "").trim();
    const iso = String(quickScheduleDateIso || "").trim();

    if (!rowKey || !iso || rowKey === "UNASSIGNED") return null;

    const availabilityTrips = fullGrid.get(rowKey)?.get(iso) || [];

    return computeCellAvailability({
      rowKey,
      iso,
      cellTrips: availabilityTrips,
      eventsByDate,
      holidayByDate,
      ptoByUidByDate,
    });
  }, [
    quickScheduleTechUid,
    quickScheduleDateIso,
    fullGrid,
    eventsByDate,
    holidayByDate,
    ptoByUidByDate,
  ]);

  const quickScheduleIsPast = quickScheduleDateIso ? quickScheduleDateIso < todayIso : false;

  function goPrev() {
    if (view === "day") {
      setAnchorIso(toIsoDate(prevWorkday(fromIsoDate(anchorIso))));
      return;
    }
    if (view === "month") {
      const prev = addMonths(fromIsoDate(anchorIso), -1);
      setAnchorIso(toIsoDate(new Date(prev.getFullYear(), prev.getMonth(), 1)));
      return;
    }
    setAnchorIso(toIsoDate(addDays(startOfWorkWeek(fromIsoDate(anchorIso)), -7)));
  }

  function goNext() {
    if (view === "day") {
      setAnchorIso(toIsoDate(nextWorkday(fromIsoDate(anchorIso))));
      return;
    }
    if (view === "month") {
      const next = addMonths(fromIsoDate(anchorIso), 1);
      setAnchorIso(toIsoDate(new Date(next.getFullYear(), next.getMonth(), 1)));
      return;
    }
    setAnchorIso(toIsoDate(addDays(startOfWorkWeek(fromIsoDate(anchorIso)), 7)));
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);

    if (view === "day") {
      setAnchorIso(toIsoDate(d));
      return;
    }
    if (view === "month") {
      setAnchorIso(toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)));
      return;
    }
    setAnchorIso(toIsoDate(startOfWorkWeek(d)));
  }

  const daysForWeekOrDay = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      d.setHours(0, 0, 0, 0);
      return [d];
    }
    return workWeekDays(startOfWorkWeek(anchorDate));
  }, [view, anchorIso, anchorDate]);

  const monthWeeks = useMemo(() => {
    if (view !== "month") return [];
    return monthCalendarWorkWeeks(anchorDate);
  }, [view, anchorDate]);

  function switchScheduleView(nextView: ViewMode) {
    setView(nextView);

    if (nextView === "day") {
      setAnchorIso(todayIsoLocal());
    }
  }

  const todayButtonLabel = view === "day" ? "Today" : view === "week" ? "This Week" : "This Month";

  const titleText = useMemo(() => {
    if (view === "day") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Day (${formatDow(d)} ${formatShort(d)})`;
    }
    if (view === "month") {
      const d = fromIsoDate(anchorIso);
      return `Schedule • Month (${d.getMonth() + 1}/${d.getFullYear()})`;
    }
    const d0 = daysForWeekOrDay[0];
    const d1 = daysForWeekOrDay[daysForWeekOrDay.length - 1];
    return `Schedule • Week (${formatShort(d0)} – ${formatShort(d1)})`;
  }, [view, anchorIso, daysForWeekOrDay]);

  const hasActiveScheduleFilters =
    techFilter !== "ALL" || statusFilter !== "ALL" || hideCompleted !== true;

  function renderHolidayBadge(iso: string) {
    const holiday = holidayByDate[iso];
    if (!holiday) return null;
    return (
      <InfoChip
        icon={<CelebrationRoundedIcon sx={{ fontSize: 16 }} />}
        label={holiday.name}
        color="warning"
      />
    );
  }

  function renderPtoBadgeSmall(dateIso: string) {
    const summary = getPtoSummaryForDate(dateIso, ptoByUidByDate);
    if (summary.count === 0) return null;

    const label =
      summary.totalHours > 0
        ? `PTO • ${summary.count} • ${summary.totalHours}h`
        : `PTO • ${summary.count}`;

    return (
      <Chip
        size="small"
        icon={<BeachAccessRoundedIcon sx={{ fontSize: 16 }} />}
        label={label}
        color="secondary"
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          fontWeight: 500,
        }}
      />
    );
  }

  function renderMeetingsBadgeSmall(dateIso: string) {
    const list = eventsByDate[dateIso] || [];
    if (!list.length) return null;

    if (list.length === 1) {
      const meeting = list[0];
      const clickable = canEditSchedule;

      return (
        <Chip
          size="small"
          icon={<CampaignRoundedIcon sx={{ fontSize: 16 }} />}
          label={meetingChipLabel(meeting)}
          color="success"
          variant="outlined"
          clickable={clickable}
          onClick={clickable ? () => openEditMeetingModal(meeting) : undefined}
          sx={{
            borderRadius: 1.5,
            fontWeight: 500,
            maxWidth: 320,
            cursor: clickable ? "pointer" : "default",
            "& .MuiChip-label": {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          }}
        />
      );
    }

    return (
      <Chip
        size="small"
        icon={<CampaignRoundedIcon sx={{ fontSize: 16 }} />}
        label={`${list.length} meetings`}
        color="success"
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          fontWeight: 500,
        }}
      />
    );
  }

  function renderStaffCoverageBadgeSmall(dateIso: string) {
  const list = staffCoverageByDate[dateIso] || [];
  if (!list.length) return null;

  if (list.length === 1) {
    const item = list[0];

    return (
      <Chip
        size="small"
        icon={<SupportAgentRoundedIcon sx={{ fontSize: 16 }} />}
        label={`${staffCoverageWorkTypeLabel(item.workType)} • ${item.employeeName}`}
        color="info"
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          fontWeight: 500,
          maxWidth: 320,
          "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        }}
      />
    );
  }

  return (
    <Chip
      size="small"
      icon={<SupportAgentRoundedIcon sx={{ fontSize: 16 }} />}
      label={`${list.length} staff coverage`}
      color="info"
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        fontWeight: 500,
      }}
    />
  );
}

function renderStaffCoverageCards(dateIso: string) {
  const list = staffCoverageByDate[dateIso] || [];
  if (!list.length) return null;

  // return (
  //   <Paper
  //     elevation={0}
  //     sx={{
  //       p: 1.25,
  //       borderRadius: 2,
  //       border: `1px solid ${alpha(theme.palette.info.main, 0.22)}`,
  //       backgroundColor: alpha(theme.palette.info.main, 0.06),
  //     }}
  //   >
  //     <Stack spacing={0.75}>
  //       <Typography
  //         variant="caption"
  //         sx={{
  //           fontWeight: 800,
  //           color: "text.secondary",
  //           letterSpacing: "0.04em",
  //           textTransform: "uppercase",
  //         }}
  //       >
  //         Office / Dispatch Coverage
  //       </Typography>

  //       {list.map((item) => (
  //         <Stack
  //           key={item.id}
  //           direction="row"
  //           spacing={1}
  //           alignItems="center"
  //           justifyContent="space-between"
  //         >
  //           <Box sx={{ minWidth: 0 }}>
  //             <Typography variant="body2" sx={{ fontWeight: 800 }}>
  //               {item.employeeName}
  //             </Typography>

  //             <Typography variant="caption" color="text.secondary">
  //               {staffCoverageWorkTypeLabel(item.workType)} •{" "}
  //               {compactTimeLabel(item.startTime, item.endTime)} •{" "}
  //               {Number(item.scheduledHours || 0).toFixed(2)}h
  //             </Typography>
  //           </Box>

  //           <Chip
  //             size="small"
  //             label={item.status || "scheduled"}
  //             variant="outlined"
  //             sx={{ borderRadius: 1.5 }}
  //           />
  //         </Stack>
  //       ))}
  //     </Stack>
  //   </Paper>
  // );
}

  function renderTripCard(
    trip: TripDoc,
    opts?: { showTechName?: boolean; keyValue?: string }
  ) {
    const type = (trip.type || "").toLowerCase();
    const isService = type === "service";
    const isProject = type === "project";

    const ticketId = String(trip.link?.serviceTicketId || "").trim();
    const ticket = ticketId ? ticketMap[ticketId] : undefined;

    const projectId = String(trip.link?.projectId || "").trim();
    const project = projectId ? projectMap[projectId] : undefined;

    const title = isService
      ? ticket?.issueSummary || "Service Ticket"
      : isProject
        ? project?.name || "Project"
        : "Trip";

    const timeText = formatTimeRangeForCard(trip);

    const customerLine =
      isService && ticket
        ? `${ticket.customerDisplayName || "Customer"} — ${ticket.serviceAddressLine1 || ""}${ticket.serviceCity ? `, ${ticket.serviceCity}` : ""}`
        : "";

    const showTechName = Boolean(opts?.showTechName);
    const techName = trip.crew?.primaryTechName || "";
    const cardStatus = isPlannedStatus(trip.status) ? undefined : trip.status;

    const cardKey =
      opts?.keyValue ||
      `${trip.id}_${String(trip.date || "")}_${String(trip.startTime || "")}_${String(trip.endTime || "")}`;

    return (
      <SharedTripCard
        key={cardKey}
        title={title}
        status={cardStatus}
        tripType={trip.type}
        cardBorderRadius={1}
        subtitle={timeText}
        projectStageLabel={
          isProject
            ? projectStageLabel(
                String(trip.link?.projectStageKey || "").trim() ||
                  String((trip as any).projectStageKey || "").trim(),
              )
            : undefined
        }
        customerLine={customerLine || undefined}
        titleMeta={showTechName && techName ? techName : undefined}
        crewChips={renderTripHelperChips(trip)}
        trailingContent={
          trip.dispatchOverride?.enabled ? (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label="Override"
              sx={{ height: 24, borderRadius: 999, fontWeight: 800 }}
            />
          ) : undefined
        }
        onClick={() => openTripFromSchedule(trip)}
      />
    );
  }

  function openTripFromSchedule(trip: TripDoc) {
    if (trip.link?.serviceTicketId) {
      router.push(`/service-tickets/${trip.link.serviceTicketId}`);
      return;
    }
    if (trip.link?.projectId) {
      router.push(`/projects/${trip.link.projectId}`);
      return;
    }
    router.push("/schedule");
  }

  function tripDisplayInfo(trip: TripDoc) {
    const type = (trip.type || "").toLowerCase();
    const isService = type === "service";
    const isProject = type === "project";

    const ticketId = String(trip.link?.serviceTicketId || "").trim();
    const ticket = ticketId ? ticketMap[ticketId] : undefined;

    const projectId = String(trip.link?.projectId || "").trim();
    const project = projectId ? projectMap[projectId] : undefined;

    const title = isService
      ? ticket?.issueSummary || "Service Ticket"
      : isProject
        ? project?.name || "Project"
        : "Trip";

    const customerLine =
      isService && ticket
        ? `${ticket.customerDisplayName || "Customer"}${ticket.serviceAddressLine1 ? ` • ${ticket.serviceAddressLine1}` : ""}${ticket.serviceCity ? `, ${ticket.serviceCity}` : ""}`
        : isProject
          ? "Project"
          : "";

    return {
      title,
      customerLine,
      timeText: formatTimeRangeForCard(trip),
    };
  }

  function renderCompactTripHelperChips(trip: TripDoc) {
    const entries = tripHelperEntries(trip);
    const editable = canEditSchedule && isPlannedStatus(trip.status);
    const canAddHelper = editable && entries.length < 2;

    if (entries.length === 0 && !canAddHelper) return null;

    return (
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        onClick={(event) => event.stopPropagation()}
      >
        <GroupsRoundedIcon
          titleAccess="Helpers"
          sx={{ fontSize: 14, color: "text.secondary", flexShrink: 0 }}
        />

        {entries.map((entry) => (
          <Chip
            key={`compact_${trip.id}_${entry.slot}_${entry.uid}`}
            size="small"
            label={entry.name}
            variant="outlined"
            clickable={editable}
            onClick={
              editable
                ? (event) => {
                    event.stopPropagation();
                    openHelperEditDialog({ tripId: trip.id, slot: entry.slot });
                  }
                : undefined
            }
            sx={{
              height: 22,
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 850,
              maxWidth: 108,
              "& .MuiChip-label": {
                px: 0.75,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }}
          />
        ))}

        {canAddHelper ? (
          <Chip
            size="small"
            icon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
            label="Add"
            color="primary"
            variant="outlined"
            clickable
            onClick={(event) => {
              event.stopPropagation();
              openHelperEditDialog({ tripId: trip.id, slot: "add" });
            }}
            sx={{
              height: 22,
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 850,
              "& .MuiChip-label": { px: 0.65 },
            }}
          />
        ) : null}
      </Stack>
    );
  }

  function renderCompactWeekTripBlock(trip: TripDoc, keyValue: string) {
    const info = tripDisplayInfo(trip);
    const cardStatus = isPlannedStatus(trip.status) ? "" : String(trip.status || "");

    return (
      <Paper
        key={keyValue}
        elevation={0}
        onClick={() => openTripFromSchedule(trip)}
        sx={{
          p: 0.9,
          borderRadius: 1,
          border: `1px solid ${alpha("#FFFFFF", 0.09)}`,
          bgcolor: alpha("#FFFFFF", 0.025),
          cursor: "pointer",
          transition: "border-color 160ms ease, background-color 160ms ease",
          "&:hover": {
            borderColor: alpha(theme.palette.primary.main, 0.32),
            bgcolor: alpha(theme.palette.primary.main, 0.055),
          },
        }}
      >
        <Stack spacing={0.6}>
          <Stack direction="row" spacing={0.6} alignItems="flex-start" justifyContent="space-between" sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 900,
                lineHeight: 1.15,
                minWidth: 0,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {info.title}
            </Typography>

            {cardStatus ? (
              <Chip
                size="small"
                label={cardStatus}
                variant="outlined"
                sx={{
                  height: 20,
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 850,
                  flexShrink: 0,
                  maxWidth: 76,
                  "& .MuiChip-label": { px: 0.65, overflow: "hidden", textOverflow: "ellipsis" },
                }}
              />
            ) : null}
          </Stack>

          <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
            <ScheduleRoundedIcon sx={{ fontSize: 14, color: "text.secondary", flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }} noWrap>
              {info.timeText}
            </Typography>
            {trip.dispatchOverride?.enabled ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label="Override"
                sx={{ height: 19, borderRadius: 999, fontSize: 9.5, fontWeight: 850 }}
              />
            ) : null}
          </Stack>

          {info.customerLine ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 650 }} noWrap>
              {info.customerLine}
            </Typography>
          ) : null}

          {renderCompactTripHelperChips(trip)}
        </Stack>
      </Paper>
    );
  }

  function renderDesktopDaySchedule() {
    const d = daysForWeekOrDay[0] || fromIsoDate(anchorIso);
    const iso = toIsoDate(d);
    const isTodayCell = iso === todayIso;
    const holiday = holidayByDate[iso];
    const isPast = iso < todayIso;

    return (
      <Box>
        <SectionHeader
          title="Day schedule"
          subtitle="Clean row view for dispatch. Use Schedule to add or override a time window."
        />

        <Stack spacing={1.15} sx={{ mt: 1.5 }}>
          <Paper
            elevation={0}
            sx={{
              px: 1.75,
              py: 1.25,
              borderRadius: 2.25,
              border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
              backgroundColor: isTodayCell
                ? alpha(theme.palette.primary.main, 0.06)
                : "background.paper",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
                {formatDow(d)} • {formatDateLong(iso)}
              </Typography>

              {isTodayCell ? (
                <Chip
                  size="small"
                  label="Today"
                  color="primary"
                  sx={{ height: 22, borderRadius: 999, fontWeight: 800 }}
                />
              ) : null}

              {renderHolidayBadge(iso)}
              {renderPtoBadgeSmall(iso)}
              {renderMeetingsBadgeSmall(iso)}
              {renderStaffCoverageBadgeSmall(iso)}
            </Stack>
          </Paper>

          {renderStaffCoverageCards(iso)}

          {rows.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No matching technicians or trips.
              </Typography>
            </Paper>
          ) : null}

          {rows.map((r) => {
            const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;
            const cellTrips = grid.get(rowKey)?.get(iso) || [];
            const availabilityTrips = fullGrid.get(rowKey)?.get(iso) || [];
            const pto = rowKey !== "UNASSIGNED" ? ptoByUidByDate[rowKey]?.[iso] : null;
            const availability = computeCellAvailability({
              rowKey,
              iso,
              cellTrips: availabilityTrips,
              eventsByDate,
              holidayByDate,
              ptoByUidByDate,
            });
            const { amTrips, pmTrips } = splitTripsBySlot(cellTrips);
            const orderedTrips = [...amTrips, ...pmTrips.filter((trip) => !amTrips.some((amTrip) => amTrip.id === trip.id))];
            const canShowScheduleAction =
              canEditSchedule &&
              rowKey !== "UNASSIGNED" &&
              !isPast &&
              !pto &&
              !holiday;

            return (
              <Paper
                key={`desktop_day_${rowKey}_${iso}`}
                elevation={0}
                sx={{
                  borderRadius: 2.25,
                  overflow: "hidden",
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: isTodayCell
                    ? alpha(theme.palette.primary.main, 0.045)
                    : holiday
                      ? alpha(theme.palette.warning.main, 0.06)
                      : pto
                        ? alpha(theme.palette.secondary.main, 0.06)
                        : availability.meetings.length
                          ? alpha(theme.palette.success.main, 0.035)
                          : "background.paper",
                }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="stretch"
                  sx={{ px: 1.75, py: 1.25 }}
                >
                  <Stack
                    direction="row"
                    spacing={1.25}
                    alignItems="center"
                    sx={{ width: 260, minWidth: 260 }}
                  >
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 999,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        bgcolor: alpha(theme.palette.primary.main, 0.18),
                        color: "primary.light",
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                        fontSize: 14,
                        fontWeight: 900,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {initialsForName(r.label)}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 850 }} noWrap>
                        {r.label}
                      </Typography>
                      {pto ? (
                        <Typography variant="caption" color="secondary.main" noWrap>
                          PTO approved{pto.hours ? ` • ${pto.hours}h` : ""}
                        </Typography>
                      ) : availability.meetings.length ? (
                        <Typography variant="caption" color="success.main" noWrap>
                          Meeting block
                        </Typography>
                      ) : null}
                    </Box>
                  </Stack>

                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    {holiday ? <Alert severity="warning" variant="outlined" sx={{ mb: 1 }}>{holiday.name}</Alert> : null}

                    {orderedTrips.length ? (
                      <Stack spacing={1}>
                        {orderedTrips.map((trip) =>
                          renderTripCard(trip, {
                            keyValue: `desktop_day_${iso}_${rowKey}_${trip.id}`,
                          })
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1.4 }}>
                        {holiday ? "Holiday" : pto ? "PTO" : availability.meetings.length ? "Meeting(s)" : "Open"}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ width: 160, flexShrink: 0, display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
                    {canShowScheduleAction ? (
                      <ScheduleSlotButton
                        label="Schedule"
                        onClick={() => openQuickScheduleModal({ techUid: rowKey, dateIso: iso })}
                      />
                    ) : null}
                  </Box>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Box>
    );
  }

  function setAddTripTypeAndLoad(nextType: AddTripType) {
    setAddTripType(nextType);
    setAddSearch("");
    setAddSelectedId("");
    setAddAdvancedId("");
    setAddProjectStageKey("");
    if (nextType === "service") loadOpenTicketsIfNeeded();
    else loadOpenProjectsIfNeeded();
  }

  function renderMobilePickerCard(item: PickerItem) {
    const selected = addSelectedId === item.id;
    const sub = splitPickerSublabel(item.sublabel);

    return (
      <Paper
        key={item.id}
        elevation={0}
        onClick={() => selectAddPickerItem(item.id)}
        sx={{
          position: "relative",
          p: 1.55,
          borderRadius: 2.5,
          cursor: "pointer",
          border: `1px solid ${
            selected ? theme.palette.primary.main : alpha("#FFFFFF", 0.1)
          }`,
          bgcolor: selected
            ? alpha(theme.palette.primary.main, 0.08)
            : alpha("#FFFFFF", 0.025),
          boxShadow: selected
            ? `0 0 0 1px ${alpha(theme.palette.primary.main, 0.38)}`
            : "none",
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: 999,
              mt: 3.4,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              border: `2px solid ${selected ? theme.palette.primary.main : alpha("#FFFFFF", 0.28)}`,
              bgcolor: selected ? theme.palette.primary.main : "transparent",
              color: selected ? theme.palette.primary.contrastText : "transparent",
              fontSize: 15,
              fontWeight: 900,
            }}
          >
            ✓
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack
              direction="row"
              spacing={1}
              justifyContent="space-between"
              alignItems="flex-start"
              sx={{ mb: 0.85 }}
            >
              <Chip
                size="small"
                label={item.metaLeft || (addTripType === "service" ? "New" : "Project")}
                color="primary"
                variant="outlined"
                sx={{ height: 24, borderRadius: 999, fontWeight: 800 }}
              />

              {item.metaRight ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ pt: 0.35, fontWeight: 800, whiteSpace: "nowrap" }}
                >
                  {item.metaRight}
                </Typography>
              ) : null}
            </Stack>

            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 900,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                mb: 0.7,
              }}
            >
              {item.label}
            </Typography>

            {sub.customer ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }} noWrap>
                {sub.customer}
              </Typography>
            ) : null}

            {sub.address ? (
              <Typography variant="body2" color="text.secondary" noWrap>
                {sub.address}
              </Typography>
            ) : null}

            {item.preview ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 0.85,
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {item.preview}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </Paper>
    );
  }

  function renderMobileAddTripContent() {
    const pickerItems = currentPickerItems();
    const ticketCount = addTripType === "service" ? openTicketItems.length : openProjectItems.length;
    const isLoadingPicker = addTripType === "service" ? openTicketsLoading : openProjectsLoading;
    const pickerErr = addTripType === "service" ? openTicketsErr : openProjectsErr;

    return (
      <>
        <DialogTitle
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            px: 2,
            pt: 1.25,
            pb: 1.5,
            bgcolor: "background.paper",
            borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 4,
              borderRadius: 999,
              mx: "auto",
              mb: 1.5,
              bgcolor: alpha("#FFFFFF", 0.22),
            }}
          />

          <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: "-0.03em" }}>
            Schedule Trip
          </Typography>

          <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mt: 1.35 }}>
            <Chip
              label={findTechName(addTechUid) || addTechUid || "Tech"}
              color="primary"
              variant="outlined"
              sx={{ borderRadius: 999, fontWeight: 800 }}
            />
            <Chip
              label={addPrimaryHelper?.name ? `Helper: ${addPrimaryHelper.name}` : "No helper"}
              color={addPrimaryHelper?.name ? "success" : "warning"}
              variant="outlined"
              sx={{ borderRadius: 999, fontWeight: 800 }}
            />
            <Chip
              label={`${addDateIso || "Date"} • ${formatSlotLabel(addSlot)}`}
              variant="outlined"
              sx={{ borderRadius: 999, fontWeight: 800 }}
            />
            {addTripType === "project" && selectedProjectStage ? (
              <Chip
                label={`Stage: ${selectedProjectStage.label}`}
                color="warning"
                variant="outlined"
                sx={{ borderRadius: 999, fontWeight: 800 }}
              />
            ) : null}
          </Stack>
        </DialogTitle>

        <DialogContent
          dividers={false}
          sx={{
            px: 2,
            py: 1.75,
            bgcolor: "background.default",
          }}
        >
          <Stack spacing={1.5}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 0.8,
                p: 0.5,
                borderRadius: 2.25,
                border: `1px solid ${alpha("#FFFFFF", 0.1)}`,
                bgcolor: alpha("#FFFFFF", 0.025),
              }}
            >
              <Button
                variant={addTripType === "service" ? "contained" : "text"}
                onClick={() => setAddTripTypeAndLoad("service")}
                disabled={addSaving}
                sx={{ borderRadius: 1.75, minHeight: 44, textTransform: "none", fontWeight: 850 }}
              >
                Service Ticket
              </Button>
              <Button
                variant={addTripType === "project" ? "contained" : "text"}
                onClick={() => setAddTripTypeAndLoad("project")}
                disabled={addSaving}
                sx={{ borderRadius: 1.75, minHeight: 44, textTransform: "none", fontWeight: 850 }}
              >
                Project
              </Button>
            </Box>

            <TextField
              placeholder={addTripType === "service" ? "Search open tickets..." : "Search projects..."}
              value={addSearch}
              onChange={(event) => setAddSearch(event.target.value)}
              disabled={addSaving}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon />
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2.25,
                  minHeight: 56,
                  bgcolor: alpha("#FFFFFF", 0.025),
                },
              }}
            />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                {addTripType === "service" ? "Open Tickets" : "Projects"}
              </Typography>
              <Chip
                size="small"
                label={isLoadingPicker ? "Loading..." : ticketCount}
                variant="outlined"
                sx={{ borderRadius: 999, fontWeight: 800 }}
              />
            </Stack>

            {pickerErr ? <Alert severity="error" variant="outlined">{pickerErr}</Alert> : null}
            {addErr ? <Alert severity="error" variant="outlined">{addErr}</Alert> : null}

            {addShouldRecommendAllDay ? (
              <Alert
                severity="warning"
                variant="outlined"
                action={
                  <Button color="warning" size="small" onClick={() => setAddSlot("all_day")} disabled={addSaving}>
                    All Day
                  </Button>
                }
              >
                Estimated at {addEstimateHours} hours. All Day is recommended.
              </Alert>
            ) : null}

            {unavailableDefaultHelperMessage ? (
              <Alert severity="warning" variant="outlined">
                {unavailableDefaultHelperMessage}
              </Alert>
            ) : null}

            {addSlotConflicts.hardMessages.length > 0 ? (
              <Alert severity="error" variant="outlined">
                {addSlotConflicts.hardMessages[0]}
              </Alert>
            ) : null}

            {addSlotConflicts.softMessages.length > 0 && addSlotConflicts.hardMessages.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.25, bgcolor: alpha(theme.palette.warning.main, 0.06) }}>
                <Stack spacing={1.1}>
                  <Alert severity="warning" variant="outlined">
                    {addSlotConflicts.softMessages[0]}
                  </Alert>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={addDispatchOverrideEnabled}
                        onChange={(event) => setAddDispatchOverrideEnabled(event.target.checked)}
                      />
                    }
                    label="Dispatch Override this planned overlap"
                  />
                  {addDispatchOverrideEnabled ? (
                    <TextField
                      label="Override Reason"
                      value={addDispatchOverrideReason}
                      onChange={(event) => setAddDispatchOverrideReason(event.target.value)}
                      placeholder="Example: emergency callback, customer timed request..."
                      multiline
                      minRows={2}
                      fullWidth
                    />
                  ) : null}
                </Stack>
              </Paper>
            ) : null}

            {pickerItems.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.25, bgcolor: alpha("#FFFFFF", 0.025) }}>
                <Typography variant="body2" color="text.secondary">
                  No matches found.
                </Typography>
              </Paper>
            ) : (
              <Stack spacing={1.15}>{pickerItems.map(renderMobilePickerCard)}</Stack>
            )}

            {addTripType === "project" && selectedAddPickerItem ? (
              <FormControl fullWidth required error={!addProjectStageKey}>
                <InputLabel>Project Stage</InputLabel>
                <Select
                  label="Project Stage"
                  value={addProjectStageKey}
                  onChange={(event: SelectChangeEvent) => setAddProjectStageKey(event.target.value)}
                  disabled={addSaving || selectedProjectStageOptions.length === 0}
                >
                  {selectedProjectStageOptions.map((stage) => (
                    <MenuItem key={stage.key} value={stage.key}>
                      {stage.label} • {projectStageStatusLabel(stage.status)}
                    </MenuItem>
                  ))}
                </Select>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, px: 0.25 }}>
                  Completed project stages are hidden.
                </Typography>
              </FormControl>
            ) : null}

            <Paper
              variant="outlined"
              onClick={() => setMobileAdvancedOpen((open) => !open)}
              sx={{
                p: 1.35,
                borderRadius: 2.25,
                cursor: "pointer",
                bgcolor: alpha("#FFFFFF", 0.025),
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 850 }}>
                    Can’t find the {addTripType === "service" ? "ticket" : "project"}?
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Search by advanced ID
                  </Typography>
                </Box>
                <Typography color="text.secondary">{mobileAdvancedOpen ? "⌃" : "⌄"}</Typography>
              </Stack>
            </Paper>

            {mobileAdvancedOpen ? (
              <TextField
                label="Advanced ID"
                placeholder={addTripType === "service" ? "Service Ticket ID..." : "Project ID..."}
                value={addAdvancedId}
                onChange={(event) => {
                  setAddAdvancedId(event.target.value);
                  setAddProjectStageKey("");
                }}
                disabled={addSaving}
                helperText="Only use this when the item does not appear in the list."
                fullWidth
              />
            ) : null}

            <Button
              variant="outlined"
              onClick={() => setMobileNotesOpen((open) => !open)}
              sx={{ borderRadius: 2.25, minHeight: 46, textTransform: "none", fontWeight: 800 }}
            >
              {mobileNotesOpen ? "Hide Dispatch Note" : "Add Dispatch Note"}
            </Button>

            {mobileNotesOpen ? (
              <TextField
                label="Dispatch Note"
                value={addNotes}
                onChange={(event) => setAddNotes(event.target.value)}
                disabled={addSaving}
                multiline
                minRows={3}
                fullWidth
                placeholder="Optional note for the crew..."
              />
            ) : null}
          </Stack>
        </DialogContent>
      </>
    );
  }

  const monthWeeksSafe = useMemo(() => (view === "month" ? monthWeeks : []), [view, monthWeeks]);

  const monthWorkdayDates = useMemo(() => {
    if (view !== "month") return [] as Date[];
    return monthWeeksSafe.flat().filter(Boolean) as Date[];
  }, [view, monthWeeksSafe]);

  const monthAvailabilityEmployees = useMemo(() => {
    const leadItems = techs.map((tech) => ({
      uid: tech.uid,
      name: tech.name,
      role: "technician",
      initials: initialsForName(tech.name),
      group: "Lead",
    }));

    const helperItems = helpers.map((helper) => ({
      uid: helper.uid,
      name: helper.name,
      role: helper.laborRole || "helper",
      initials: initialsForName(helper.name),
      group: formatRoleLabel(helper.laborRole || "helper"),
    }));

    let items =
      monthAvailabilityMode === "helpers"
        ? helperItems
        : monthAvailabilityMode === "all_field"
          ? [...leadItems, ...helperItems]
          : leadItems;

    if (monthAvailabilityMode === "leads" && techFilter !== "ALL" && techFilter !== "UNASSIGNED") {
      items = items.filter((item) => item.uid === techFilter);
    }

    return items.sort((a, b) => {
      const byGroup = a.group.localeCompare(b.group);
      if (monthAvailabilityMode === "all_field" && byGroup !== 0) return byGroup;
      return a.name.localeCompare(b.name);
    });
  }, [techs, helpers, monthAvailabilityMode, techFilter]);

  const monthAvailabilityByEmployee = useMemo(() => {
    const out: Record<
      string,
      Record<
        string,
        {
          status: MonthAvailabilityStatus;
          label: string;
          detail: string;
          amBooked: boolean;
          pmBooked: boolean;
          tripCount: number;
        }
      >
    > = {};

    for (const employee of monthAvailabilityEmployees) {
      out[employee.uid] = {};

      for (const date of monthWorkdayDates) {
        const iso = toIsoDate(date);
        const holiday = holidayByDate[iso];
        const pto = ptoByUidByDate[employee.uid]?.[iso];
        const employeeEvents = (eventsByDate[iso] || []).filter((event) =>
          eventAppliesToUid(event, employee.uid, employee.role)
        );
        const blockingEvent = employeeEvents.find((event) => event.blocksSchedule !== false);

        const employeeTrips = trips.filter(
          (trip) =>
            trip.active !== false &&
            normalizeStatus(trip.status) !== "cancelled" &&
            normalizeStatus(trip.status) !== "canceled" &&
            String(trip.date || "").trim() === iso &&
            isEmployeeOnTrip(trip, employee.uid)
        );

        const amBooked = employeeTrips.some((trip) => tripBlocksSlot(trip, "am"));
        const pmBooked = employeeTrips.some((trip) => tripBlocksSlot(trip, "pm"));
        const tripCount = employeeTrips.length;

        let status: MonthAvailabilityStatus = "open";
        let label = "Open";
        let detail = "No trips scheduled";

        if (holiday) {
          status = "other";
          label = "Holiday";
          detail = holiday.name;
        } else if (pto) {
          status = "pto";
          label = "PTO";
          detail = pto.hours ? `${pto.hours}h approved` : "Approved PTO";
        } else if (blockingEvent) {
          status = "other";
          label = "Other";
          detail = meetingChipLabel(blockingEvent);
        } else if (amBooked && pmBooked) {
          status = "booked";
          label = "Booked";
          detail = `${tripCount} trip${tripCount === 1 ? "" : "s"}`;
        } else if (amBooked || pmBooked) {
          status = "partial";
          label = "Partial";
          detail = amBooked ? "AM booked / PM open" : "AM open / PM booked";
        }

        out[employee.uid][iso] = {
          status,
          label,
          detail,
          amBooked,
          pmBooked,
          tripCount,
        };
      }
    }

    return out;
  }, [monthAvailabilityEmployees, monthWorkdayDates, trips, holidayByDate, ptoByUidByDate, eventsByDate]);

  const monthOverviewByDate = useMemo(() => {
    const out: Record<
      string,
      { open: number; booked: number; partial: number; pto: number; other: number; total: number }
    > = {};

    for (const date of monthWorkdayDates) {
      const iso = toIsoDate(date);
      const summary = { open: 0, booked: 0, partial: 0, pto: 0, other: 0, total: monthAvailabilityEmployees.length };

      for (const employee of monthAvailabilityEmployees) {
        const status = monthAvailabilityByEmployee[employee.uid]?.[iso]?.status || "open";
        summary[status] += 1;
      }

      out[iso] = summary;
    }

    return out;
  }, [monthWorkdayDates, monthAvailabilityEmployees, monthAvailabilityByEmployee]);

  function monthStatusChip(status: MonthAvailabilityStatus, label: string, size: "small" | "medium" = "small") {
    const tone =
      status === "open"
        ? {
            color: theme.palette.success.light,
            border: alpha(theme.palette.success.main, 0.32),
            bg: alpha(theme.palette.success.main, 0.08),
          }
        : status === "booked"
          ? {
              color: theme.palette.primary.light,
              border: alpha(theme.palette.primary.main, 0.34),
              bg: alpha(theme.palette.primary.main, 0.1),
            }
          : status === "partial"
            ? {
                color: theme.palette.warning.light,
                border: alpha(theme.palette.warning.main, 0.36),
                bg: alpha(theme.palette.warning.main, 0.1),
              }
            : status === "pto"
              ? {
                  color: theme.palette.error.light,
                  border: alpha(theme.palette.error.main, 0.36),
                  bg: alpha(theme.palette.error.main, 0.09),
                }
              : {
                  color: theme.palette.text.secondary,
                  border: alpha("#FFFFFF", 0.16),
                  bg: alpha("#FFFFFF", 0.05),
                };

    return (
      <Chip
        size={size}
        label={label}
        variant="outlined"
        sx={{
          height: size === "small" ? 24 : 30,
          borderRadius: 1.5,
          fontWeight: 850,
          color: tone.color,
          borderColor: tone.border,
          bgcolor: tone.bg,
          "& .MuiChip-label": { px: size === "small" ? 1 : 1.25 },
        }}
      />
    );
  }

  function goToScheduleDay(dateIso: string) {
    setView("day");
    setAnchorIso(dateIso);
  }

  function renderMonthAvailabilityDayTile(date: Date) {
    const iso = toIsoDate(date);
    const summary = monthOverviewByDate[iso] || { open: 0, booked: 0, partial: 0, pto: 0, other: 0, total: 0 };
    const isTodayCell = iso === todayIso;
    const holiday = holidayByDate[iso];

    return (
      <Paper
        variant="outlined"
        onClick={() => goToScheduleDay(iso)}
        sx={{
          p: 1.15,
          minHeight: 132,
          height: "100%",
          borderRadius: 1,
          cursor: "pointer",
          borderColor: isTodayCell ? alpha(theme.palette.primary.main, 0.65) : alpha("#FFFFFF", 0.09),
          bgcolor: isTodayCell
            ? alpha(theme.palette.primary.main, 0.08)
            : holiday
              ? alpha(theme.palette.warning.main, 0.055)
              : alpha("#FFFFFF", 0.025),
          boxShadow: isTodayCell ? `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.35)}` : "none",
          "&:hover": {
            borderColor: alpha(theme.palette.primary.main, 0.45),
            bgcolor: alpha(theme.palette.primary.main, 0.055),
          },
        }}
      >
        <Stack spacing={0.9} sx={{ height: "100%" }}>
          <Stack direction="row" spacing={0.75} alignItems="flex-start" justifyContent="space-between">
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900 }}>
                {formatDow(date)}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 950 }}>
                {formatShort(date)}
              </Typography>
            </Box>
            {isTodayCell ? (
              <Chip size="small" label="Today" color="primary" sx={{ height: 20, borderRadius: 999, fontWeight: 850 }} />
            ) : holiday ? (
              <Chip size="small" label="Holiday" color="warning" variant="outlined" sx={{ height: 20, borderRadius: 999, fontWeight: 850 }} />
            ) : null}
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.65 }}>
            {monthStatusChip("open", `Open ${summary.open}`)}
            {monthStatusChip("booked", `Booked ${summary.booked}`)}
            {monthStatusChip("partial", `Partial ${summary.partial}`)}
            {monthStatusChip("pto", `PTO ${summary.pto}`)}
          </Box>

          <Box sx={{ mt: "auto" }}>
            {summary.other ? monthStatusChip("other", `Other ${summary.other}`) : (
              <Typography variant="caption" color="text.secondary">
                {summary.total} total tracked
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>
    );
  }

  function renderWeeklyAvailabilityMatrix(week: Array<Date | null>, weekIndex: number) {
    const realDates = week.filter(Boolean) as Date[];
    const weekTitle = realDates.length ? `Week of ${formatDateLong(toIsoDate(realDates[0]))}` : `Week ${weekIndex + 1}`;
    const matrixMinWidth = 760;

    return (
      <Paper
        key={`availability_week_${weekIndex}`}
        elevation={0}
        sx={{
          borderRadius: 2,
          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          bgcolor: alpha("#FFFFFF", 0.025),
          overflow: "hidden",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
          sx={{ p: 1.25, borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}` }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
              {weekTitle}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Team availability shown in a Monday–Friday calendar row.
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {monthStatusChip("open", "Open")}
            {monthStatusChip("booked", "Booked")}
            {monthStatusChip("partial", "Partial")}
            {monthStatusChip("pto", "PTO")}
            {monthStatusChip("other", "Other")}
          </Stack>
        </Stack>

        <TableContainer sx={{ maxWidth: "100%", overflowX: "auto" }}>
          <Table sx={{ minWidth: matrixMinWidth, tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    width: 190,
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    bgcolor: "background.paper",
                    borderRight: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    fontWeight: 900,
                  }}
                >
                  Team Member
                </TableCell>
                {week.map((date, dayIndex) => {
                  if (!date) {
                    return (
                      <TableCell key={`matrix_empty_head_${weekIndex}_${dayIndex}`} align="center" sx={{ width: 112, opacity: 0.35 }}>
                        —
                      </TableCell>
                    );
                  }

                  const iso = toIsoDate(date);
                  const isTodayCell = iso === todayIso;
                  return (
                    <TableCell
                      key={`matrix_head_${iso}`}
                      align="center"
                      sx={{
                        width: 112,
                        bgcolor: isTodayCell ? alpha(theme.palette.primary.main, 0.12) : alpha("#FFFFFF", 0.015),
                        borderLeft: isTodayCell ? `1px solid ${alpha(theme.palette.primary.main, 0.35)}` : undefined,
                        borderRight: isTodayCell ? `1px solid ${alpha(theme.palette.primary.main, 0.35)}` : undefined,
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 900 }}>
                        {formatDow(date)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {formatShort(date)}
                      </Typography>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>

            <TableBody>
              {monthAvailabilityEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={1 + week.length}>
                    <Typography variant="body2" color="text.secondary">
                      No employees found for this view.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                monthAvailabilityEmployees.map((employee) => (
                  <TableRow key={`availability_${weekIndex}_${employee.uid}`} hover>
                    <TableCell
                      sx={{
                        width: 190,
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        bgcolor: "background.paper",
                        borderRight: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                            bgcolor: alpha(theme.palette.primary.main, 0.18),
                            color: "primary.light",
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
                            fontSize: 12,
                            fontWeight: 950,
                          }}
                        >
                          {employee.initials}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
                            {employee.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {employee.group}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>

                    {week.map((date, dayIndex) => {
                      if (!date) {
                        return (
                          <TableCell key={`empty_availability_${weekIndex}_${employee.uid}_${dayIndex}`} align="center" sx={{ opacity: 0.35 }}>
                            —
                          </TableCell>
                        );
                      }

                      const iso = toIsoDate(date);
                      const cell = monthAvailabilityByEmployee[employee.uid]?.[iso];
                      const isTodayCell = iso === todayIso;

                      return (
                        <TableCell
                          key={`availability_${employee.uid}_${iso}`}
                          align="center"
                          onClick={() => goToScheduleDay(iso)}
                          sx={{
                            width: 112,
                            cursor: "pointer",
                            bgcolor: isTodayCell ? alpha(theme.palette.primary.main, 0.08) : "transparent",
                            borderLeft: isTodayCell ? `1px solid ${alpha(theme.palette.primary.main, 0.35)}` : undefined,
                            borderRight: isTodayCell ? `1px solid ${alpha(theme.palette.primary.main, 0.35)}` : undefined,
                            "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.055) },
                          }}
                        >
                          <Stack spacing={0.45} alignItems="center">
                            {monthStatusChip(cell?.status || "open", cell?.label || "Open")}
                            {cell?.status === "partial" ? (
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {cell.amBooked ? "AM busy" : "PM busy"}
                              </Typography>
                            ) : cell?.tripCount ? (
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {cell.tripCount} trip{cell.tripCount === 1 ? "" : "s"}
                              </Typography>
                            ) : cell?.detail && cell.status !== "open" ? (
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 96 }}>
                                {cell.detail}
                              </Typography>
                            ) : null}
                          </Stack>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  function renderMonthAvailabilityView() {
    return (
      <Box>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.25}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
        >
          <SectionHeader
            title="Monthly Availability"
            subtitle="Calendar-style capacity overview. Click a date to open the detailed Day schedule."
          />

          <ToggleButtonGroup
            exclusive
            size="small"
            value={monthAvailabilityMode}
            onChange={(_, next) => {
              if (next) setMonthAvailabilityMode(next as MonthAvailabilityMode);
            }}
            sx={{
              bgcolor: alpha("#FFFFFF", 0.035),
              borderRadius: 2,
              width: { xs: "100%", md: "auto" },
              "& .MuiToggleButton-root": {
                px: 1.75,
                textTransform: "none",
                fontWeight: 850,
              },
            }}
          >
            <ToggleButton value="leads">Leads</ToggleButton>
            <ToggleButton value="helpers">Helpers</ToggleButton>
            <ToggleButton value="all_field">All Field</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack spacing={2.25} sx={{ mt: 1.5 }}>
          <Paper
            elevation={0}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
              bgcolor: alpha("#FFFFFF", 0.025),
              overflow: "hidden",
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                  Month Calendar
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  {monthAvailabilityEmployees.length} employee{monthAvailabilityEmployees.length === 1 ? "" : "s"} tracked
                </Typography>
              </Stack>

              <Box sx={{ overflowX: "auto", pb: 0.5 }}>
                <Box sx={{ minWidth: 860 }}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(150px, 1fr))",
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      borderBottom: "none",
                      borderRadius: "8px 8px 0 0",
                      overflow: "hidden",
                    }}
                  >
                    {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                      <Box
                        key={`month_header_${day}`}
                        sx={{
                          px: 1.25,
                          py: 0.9,
                          bgcolor: alpha("#FFFFFF", 0.035),
                          borderRight: day !== "Fri" ? `1px solid ${alpha("#FFFFFF", 0.08)}` : "none",
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 950, color: "text.secondary" }}>
                          {day}
                        </Typography>
                      </Box>
                    ))}
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(150px, 1fr))",
                      borderLeft: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      borderTop: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    }}
                  >
                    {monthWeeksSafe.map((week, weekIndex) =>
                      week.map((date, dayIndex) => (
                        <Box
                          key={`month_calendar_${weekIndex}_${dayIndex}`}
                          sx={{
                            minHeight: 154,
                            p: 0.75,
                            borderRight: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                            borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                            bgcolor: date ? "transparent" : alpha("#FFFFFF", 0.015),
                          }}
                        >
                          {date ? renderMonthAvailabilityDayTile(date) : null}
                        </Box>
                      ))
                    )}
                  </Box>
                </Box>
              </Box>
            </Stack>
          </Paper>

          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                  Team Availability by Week
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Same calendar rhythm as the month above, with employee rows for who is open, booked, partial, or out.
                </Typography>
              </Box>
            </Stack>

            {monthWeeksSafe.map((week, weekIndex) => renderWeeklyAvailabilityMatrix(week, weekIndex))}
          </Stack>
        </Stack>
      </Box>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Schedule">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1600, mx: "auto" }}>
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.5, md: 1.75 },
                borderRadius: 2.5,
                border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                bgcolor: alpha("#FFFFFF", 0.025),
              }}
            >
              <Stack
                direction={{ xs: "column", lg: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", lg: "center" }}
                justifyContent="space-between"
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CalendarMonthRoundedIcon sx={{ color: "primary.light" }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="h5"
                        sx={{
                          fontSize: { xs: "1.35rem", md: "1.55rem" },
                          lineHeight: 1.1,
                          fontWeight: 900,
                          letterSpacing: "-0.03em",
                        }}
                      >
                        Schedule
                      </Typography>
                      <Typography
                        sx={{
                          mt: 0.35,
                          color: "text.secondary",
                          fontSize: { xs: 12.5, md: 13.5 },
                          fontWeight: 650,
                        }}
                      >
                        {titleText.replace("Schedule • ", "")}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>

                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  justifyContent="flex-end"
                  sx={{ width: { xs: "100%", lg: "auto" } }}
                >
                  <Stack direction="row" spacing={1} sx={{ justifyContent: { xs: "space-between", sm: "flex-start" } }}>
                    <IconButton onClick={goPrev} sx={{ borderRadius: 1.5 }}>
                      <ChevronLeftRoundedIcon />
                    </IconButton>

                    <Button variant="outlined" onClick={goToday} startIcon={<TodayRoundedIcon />}>
                      {todayButtonLabel}
                    </Button>

                    <IconButton onClick={goNext} sx={{ borderRadius: 1.5 }}>
                      <ChevronRightRoundedIcon />
                    </IconButton>
                  </Stack>

                  <Button
                    variant={filtersOpen || hasActiveScheduleFilters ? "contained" : "outlined"}
                    color={hasActiveScheduleFilters ? "primary" : "inherit"}
                    startIcon={<FilterListRoundedIcon />}
                    onClick={() => setFiltersOpen((open) => !open)}
                  >
                    Filter{hasActiveScheduleFilters ? "s" : ""}
                  </Button>

                  {canEditSchedule ? (
                    <Button
                      variant="contained"
                      startIcon={<AddRoundedIcon />}
                      endIcon={<KeyboardArrowDownRoundedIcon />}
                      onClick={openAddScheduleMenu}
                    >
                      Add Schedule
                    </Button>
                  ) : null}

                  <ToggleButtonGroup
                    exclusive
                    value={view}
                    onChange={(_, next) => {
                      if (next) switchScheduleView(next as ViewMode);
                    }}
                    size="small"
                    sx={{
                      bgcolor: alpha("#FFFFFF", 0.025),
                      borderRadius: 1.5,
                      alignSelf: { xs: "stretch", sm: "center" },
                    }}
                  >
                    <ToggleButton value="day" sx={{ flex: { xs: 1, sm: "unset" } }}>
                      <ViewDayRoundedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                      Day
                    </ToggleButton>
                    <ToggleButton value="week" sx={{ flex: { xs: 1, sm: "unset" } }}>
                      <ViewWeekRoundedIcon sx={{ mr: 0.75, fontSize: 18 }} />
                      Week
                    </ToggleButton>
                    {/* Month view is hidden for now. Day and Week are the primary dispatch views. */}
                  </ToggleButtonGroup>
                </Stack>
              </Stack>
            </Paper>

            {filtersOpen ? (
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2.25,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  bgcolor: alpha("#FFFFFF", 0.025),
                }}
              >
                <SectionHeader
                  title="Filters"
                  subtitle="Refine the schedule by technician, status, and completion state."
                />

                <Box sx={{ mt: 1.5 }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1.5}
                      alignItems={{ xs: "stretch", md: "center" }}
                    >
                      <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel>Technician</InputLabel>
                        <Select
                          label="Technician"
                          value={techFilter}
                          onChange={(e: SelectChangeEvent) => setTechFilter(e.target.value)}
                        >
                          <MenuItem value="ALL">All</MenuItem>
                          <MenuItem value="UNASSIGNED">Unassigned</MenuItem>
                          {techs.map((tech) => (
                            <MenuItem key={tech.uid} value={tech.uid}>
                              {tech.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Status</InputLabel>
                        <Select
                          label="Status"
                          value={statusFilter}
                          onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}
                        >
                          <MenuItem value="ALL">All</MenuItem>
                          <MenuItem value="planned">planned</MenuItem>
                          <MenuItem value="in_progress">in_progress</MenuItem>
                          <MenuItem value="complete">complete</MenuItem>
                          <MenuItem value="cancelled">cancelled</MenuItem>
                        </Select>
                      </FormControl>

                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={hideCompleted}
                            onChange={(e) => setHideCompleted(e.target.checked)}
                          />
                        }
                        label="Hide completed"
                      />

                      <Box sx={{ flex: 1 }} />

                      <Chip
                        label={`Showing ${filteredTrips.length} trip(s)`}
                        variant="outlined"
                        sx={{ borderRadius: 1.5 }}
                      />
                    </Stack>
                  </Stack>
                </Box>
              </Paper>
            ) : null}

            {(techsError ||
  tripsError ||
  holidaysError ||
  ptoError ||
  eventsError ||
  staffCoverageError) && (
              <Stack spacing={1}>
                {techsError ? <Alert severity="error">{techsError}</Alert> : null}
                {tripsError ? <Alert severity="error">{tripsError}</Alert> : null}
                {holidaysError ? <Alert severity="error">{holidaysError}</Alert> : null}
                {ptoError ? <Alert severity="error">{ptoError}</Alert> : null}
                {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}
                {staffCoverageError ? <Alert severity="error">{staffCoverageError}</Alert> : null}
              </Stack>
            )}

            {loading ? (
              <Box sx={{ py: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Loading schedule...
                </Typography>
              </Box>
            ) : null}

            {!loading && view === "month" ? renderMonthAvailabilityView() : null}

            {!loading && view !== "month" ? (
              <>
                {isMobile ? (
                  <Stack spacing={1.5}>
                    {daysForWeekOrDay.map((d) => {
                      const iso = toIsoDate(d);
                      const isTodayCell = iso === todayIso;
                      const holiday = holidayByDate[iso];

                      return (
                        <Card
                          key={iso}
                          elevation={0}
                          sx={{
                            borderRadius: 1,
                            border: isTodayCell ? `2px solid ${alpha(theme.palette.primary.main, 0.72)}` : undefined,
                            bgcolor: isTodayCell ? alpha(theme.palette.primary.main, 0.08) : undefined,
                          }}
                        >
                          <Box sx={{ px: { xs: 2, md: 2.5 }, pt: { xs: 2, md: 2.5 }, pb: 1.5 }}>
                            <Stack spacing={1}>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography
                                  variant="h6"
                                  sx={{
                                    fontSize: { xs: "1rem", md: "1.05rem" },
                                    fontWeight: 800,
                                    letterSpacing: "-0.02em",
                                  }}
                                >
                                  {formatDow(d)} • {iso}
                                </Typography>

                                {isTodayCell ? (
                                  <Chip
                                    size="small"
                                    label="Today"
                                    color="primary"
                                    variant="filled"
                                    sx={{ height: 22, borderRadius: 1.5, fontWeight: 700 }}
                                  />
                                ) : null}
                              </Stack>

                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                {renderHolidayBadge(iso)}
                                {renderPtoBadgeSmall(iso)}
                                {renderMeetingsBadgeSmall(iso)}
                                {renderStaffCoverageBadgeSmall(iso)}
                              </Stack>
                            </Stack>
                          </Box>

                          <Box sx={{ p: { xs: 2, md: 2.5 }, pt: 0 }}>
                            <Stack spacing={1.5}>
                              {renderStaffCoverageCards(iso)}

                              {rows.map((r) => {
                                const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;
                                const cellTrips = grid.get(rowKey)?.get(iso) || [];
                                const availabilityTrips = fullGrid.get(rowKey)?.get(iso) || [];
                                const pto = rowKey !== "UNASSIGNED" ? ptoByUidByDate[rowKey]?.[iso] : null;
                                const availability = computeCellAvailability({
                                  rowKey,
                                  iso,
                                  cellTrips: availabilityTrips,
                                  eventsByDate,
                                  holidayByDate,
                                  ptoByUidByDate,
                                });
                                const { amTrips, pmTrips } = splitTripsBySlot(cellTrips);
                                const isPast = iso < todayIso;

                                const canShowScheduleAction =
                                  canEditSchedule &&
                                  rowKey !== "UNASSIGNED" &&
                                  !isPast &&
                                  !pto &&
                                  !holiday;

                                return (
                                  <Card
                                    key={`${rowKey}_${iso}`}
                                    variant="outlined"
                                    sx={{
                                      borderRadius: 1,
                                      boxShadow: "none",
                                      bgcolor: isTodayCell
                                        ? alpha(theme.palette.primary.main, 0.08)
                                        : holiday
                                          ? alpha(theme.palette.warning.main, 0.08)
                                          : pto
                                            ? alpha(theme.palette.secondary.main, 0.08)
                                            : availability.meetings.length
                                              ? alpha(theme.palette.success.main, 0.05)
                                              : "background.paper",
                                      borderColor: isTodayCell ? alpha(theme.palette.primary.main, 0.72) : undefined,
                                    }}
                                  >
                                    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                                      <Stack spacing={1.25}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                          <GroupsRoundedIcon sx={{ fontSize: 18, color: "primary.light" }} />
                                          <Typography variant="subtitle1">{r.label}</Typography>
                                        </Stack>

                                        {holiday ? <Alert severity="warning" variant="outlined">{holiday.name}</Alert> : null}

                                        {pto ? (
                                          <Chip
                                            size="small"
                                            icon={<BeachAccessRoundedIcon sx={{ fontSize: 16 }} />}
                                            label={`PTO approved${pto.hours ? ` • ${pto.hours}h` : ""}`}
                                            color="secondary"
                                            variant="outlined"
                                            sx={{
                                              borderRadius: 1.5,
                                              width: "fit-content",
                                              fontWeight: 500,
                                            }}
                                          />
                                        ) : null}

                                        {canShowScheduleAction ? (
                                          <ScheduleSlotButton
                                            label="Schedule"
                                            onClick={() =>
                                              openQuickScheduleModal({ techUid: rowKey, dateIso: iso })
                                            }
                                          />
                                        ) : null}

                                        {amTrips.length ? (
                                          <Stack spacing={1}>
                                            {amTrips.map((trip) =>
                                              renderTripCard(trip, {
                                                keyValue: `mobile_am_${iso}_${rowKey}_${trip.id}`,
                                              })
                                            )}
                                          </Stack>
                                        ) : null}

                                        {pmTrips.length ? (
                                          <Stack spacing={1}>
                                            {pmTrips.map((trip) =>
                                              renderTripCard(trip, {
                                                keyValue: `mobile_pm_${iso}_${rowKey}_${trip.id}`,
                                              })
                                            )}
                                          </Stack>
                                        ) : null}

                                        {amTrips.length === 0 && pmTrips.length === 0 ? (
                                          <Typography variant="caption" color="text.secondary">
                                            {holiday ? "Holiday" : pto ? "PTO" : availability.meetings.length ? "Meeting(s)" : "—"}
                                          </Typography>
                                        ) : null}
                                      </Stack>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </Stack>
                          </Box>
                        </Card>
                      );
                    })}
                  </Stack>
                ) : view === "day" ? (
                  renderDesktopDaySchedule()
                ) : (
                  <Box>
                    <SectionHeader
                      title="Week route board"
                      subtitle="Compact desktop board for route visibility. Click a trip for full details."
                    />

                    <Box sx={{ mt: 1.5 }}>
                      <TableContainer
                        component={Paper}
                        variant="outlined"
                        sx={{
                          borderRadius: 1,
                          boxShadow: "none",
                          maxWidth: "100%",
                          overflowX: "auto",
                        }}
                      >
                        <Table sx={{ minWidth: Math.max(920, 200 + daysForWeekOrDay.length * 235), tableLayout: "fixed" }}>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ width: 200, fontWeight: 600 }}>Technician</TableCell>

                              {daysForWeekOrDay.map((d) => {
                                const iso = toIsoDate(d);
                                const isTodayCell = iso === todayIso;
                                const holiday = holidayByDate[iso];
                                return (
                                  <TableCell
                                    key={iso}
                                    sx={{
                                      minWidth: 235,
                                      width: 235,
                                      fontWeight: 600,
                                      bgcolor: isTodayCell
                                        ? alpha(theme.palette.primary.main, 0.12)
                                        : holiday
                                          ? alpha(theme.palette.warning.main, 0.08)
                                          : alpha("#FFFFFF", 0.02),
                                      boxShadow: isTodayCell
                                        ? `inset 0 0 0 2px ${alpha(theme.palette.primary.main, 0.72)}`
                                        : undefined,
                                    }}
                                  >
                                    <Stack spacing={0.75}>
                                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Typography variant="subtitle2">{formatDow(d)}</Typography>
                                        {isTodayCell ? (
                                          <Chip
                                            size="small"
                                            label="Today"
                                            color="primary"
                                            variant="filled"
                                            sx={{ height: 22, borderRadius: 1.5, fontWeight: 700 }}
                                          />
                                        ) : null}
                                      </Stack>
                                      <Typography variant="caption" color="text.secondary">
                                        {iso}
                                      </Typography>
                                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                        {renderHolidayBadge(iso)}
                                        {renderPtoBadgeSmall(iso)}
                                        {renderMeetingsBadgeSmall(iso)}
                                        {renderStaffCoverageBadgeSmall(iso)}
                                      </Stack>
                                    </Stack>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          </TableHead>

                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={1 + daysForWeekOrDay.length}>
                                  <Typography variant="body2" color="text.secondary">
                                    No matching technicians or trips.
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              rows.map((r) => {
                                const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;

                                return (
                                  <TableRow key={r.key}>
                                    <TableCell sx={{ verticalAlign: "top", width: 200 }}>
                                      <Stack direction="row" spacing={1} alignItems="center">
                                        <GroupsRoundedIcon sx={{ fontSize: 18, color: "primary.light" }} />
                                        <Typography variant="subtitle2">{r.label}</Typography>
                                      </Stack>
                                    </TableCell>

                                    {daysForWeekOrDay.map((d) => {
                                      const iso = toIsoDate(d);
                                      const isTodayCell = iso === todayIso;
                                      const cellTrips = grid.get(rowKey)?.get(iso) || [];
                                      const availabilityTrips = fullGrid.get(rowKey)?.get(iso) || [];
                                      const holiday = holidayByDate[iso];
                                      const pto = rowKey !== "UNASSIGNED" ? ptoByUidByDate[rowKey]?.[iso] : null;
                                      const availability = computeCellAvailability({
                                        rowKey,
                                        iso,
                                        cellTrips: availabilityTrips,
                                        eventsByDate,
                                        holidayByDate,
                                        ptoByUidByDate,
                                      });
                                      const { amTrips, pmTrips } = splitTripsBySlot(cellTrips);
                                      const isPast = iso < todayIso;

                                      const canShowScheduleAction =
                                        canEditSchedule &&
                                        rowKey !== "UNASSIGNED" &&
                                        !isPast &&
                                        !pto &&
                                        !holiday;

                                      return (
                                        <TableCell
                                          key={`${r.key}_${iso}`}
                                          sx={{
                                            verticalAlign: "top",
                                            bgcolor: isTodayCell
                                              ? alpha(theme.palette.primary.main, 0.08)
                                              : holiday
                                                ? alpha(theme.palette.warning.main, 0.08)
                                                : pto
                                                  ? alpha(theme.palette.secondary.main, 0.08)
                                                  : availability.meetings.length
                                                    ? alpha(theme.palette.success.main, 0.05)
                                                    : "transparent",
                                            boxShadow: isTodayCell
                                              ? `inset 0 0 0 2px ${alpha(theme.palette.primary.main, 0.72)}`
                                              : undefined,
                                          }}
                                        >
                                          <Stack spacing={1}>
                                            {holiday ? <Alert severity="warning" variant="outlined">{holiday.name}</Alert> : null}

                                            {pto ? (
                                              <Chip
                                                size="small"
                                                icon={<BeachAccessRoundedIcon sx={{ fontSize: 16 }} />}
                                                label={`PTO approved${pto.hours ? ` • ${pto.hours}h` : ""}`}
                                                color="secondary"
                                                variant="outlined"
                                                sx={{
                                                  borderRadius: 1.5,
                                                  width: "fit-content",
                                                  fontWeight: 500,
                                                }}
                                              />
                                            ) : null}

                                            {canShowScheduleAction ? (
                                              <ScheduleSlotButton
                                                label="Schedule"
                                                onClick={() =>
                                                  openQuickScheduleModal({ techUid: rowKey, dateIso: iso })
                                                }
                                              />
                                            ) : null}

                                            {amTrips.length ? (
                                              <Stack spacing={0.85}>
                                                {amTrips.map((trip) =>
                                                  renderCompactWeekTripBlock(
                                                    trip,
                                                    `desk_am_${iso}_${rowKey}_${trip.id}`
                                                  )
                                                )}
                                              </Stack>
                                            ) : null}

                                            {pmTrips.length ? (
                                              <Stack spacing={0.85}>
                                                {pmTrips.map((trip) =>
                                                  renderCompactWeekTripBlock(
                                                    trip,
                                                    `desk_pm_${iso}_${rowKey}_${trip.id}`
                                                  )
                                                )}
                                              </Stack>
                                            ) : null}

                                            {amTrips.length === 0 && pmTrips.length === 0 ? (
                                              <Typography variant="caption" color="text.secondary">
                                                {holiday ? "Holiday" : pto ? "PTO" : availability.meetings.length ? "Meeting(s)" : "—"}
                                              </Typography>
                                            ) : null}
                                          </Stack>
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  </Box>
                )}
              </>
            ) : null}

            {!canSeeAll ? (
              <Alert severity="info" variant="outlined">
                Role-based schedule visibility can be tightened later if you want more restricted access.
              </Alert>
            ) : null}
          </Stack>
        </Box>

        <Menu
          anchorEl={addScheduleAnchorEl}
          open={addScheduleMenuOpen}
          onClose={closeAddScheduleMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          PaperProps={{
            sx: {
              mt: 1,
              minWidth: 230,
              borderRadius: 2,
              border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
              bgcolor: "background.paper",
              backgroundImage: "none",
            },
          }}
        >
          <MenuItem onClick={handleAddMeetingFromMenu}>
            <ListItemIcon>
              <EventNoteRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Meeting" secondary="Create a company meeting" />
          </MenuItem>

          <MenuItem onClick={handleAddStaffCoverageFromMenu}>
            <ListItemIcon>
              <SupportAgentRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Staff Coverage" secondary="Schedule office / dispatch coverage" />
          </MenuItem>

          <MenuItem onClick={handleAddManualBlockFromMenu}>
            <ListItemIcon>
              <BlockRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Manual Block" secondary="Block time without payroll entries" />
          </MenuItem>
        </Menu>

        <SwipeableDrawer
          anchor="bottom"
          open={quickScheduleOpen}
          onOpen={() => setQuickScheduleOpen(true)}
          onClose={closeQuickScheduleModal}
          disableSwipeToOpen={false}
          PaperProps={{
            sx: {
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              backgroundColor: "background.paper",
              backgroundImage: "none",
              pb: "calc(12px + env(safe-area-inset-bottom))",
            },
          }}
        >
          <Box sx={{ px: 2, pt: 1.25, pb: 2 }}>
            <Box
              sx={{
                width: 42,
                height: 4,
                borderRadius: 999,
                mx: "auto",
                mb: 2,
                bgcolor: alpha("#FFFFFF", 0.2),
              }}
            />

            <Stack spacing={1.35}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: "-0.02em" }}>
                  Schedule for
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: "-0.02em" }}>
                  {findTechName(quickScheduleTechUid) || "Technician"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {quickScheduleDateIso ? formatDateLong(quickScheduleDateIso) : "Choose a time window."}
                </Typography>
              </Box>

              {[
                {
                  slot: "am" as SlotKey,
                  title: "AM",
                  subtitle: "Morning",
                  disabled: quickScheduleIsPast || Boolean(quickScheduleAvailability?.amHardBusy),
                  action: quickScheduleAvailability?.amSoftBusy ? "Override AM" : "Add AM",
                },
                {
                  slot: "pm" as SlotKey,
                  title: "PM",
                  subtitle: "Afternoon",
                  disabled: quickScheduleIsPast || Boolean(quickScheduleAvailability?.pmHardBusy),
                  action: quickScheduleAvailability?.pmSoftBusy ? "Override PM" : "Add PM",
                },
                {
                  slot: "all_day" as SlotKey,
                  title: "All Day",
                  subtitle: "Full day",
                  disabled: quickScheduleIsPast || Boolean(quickScheduleAvailability?.allDayHardBusy),
                  action: quickScheduleAvailability?.allDaySoftBusy ? "Override All Day" : "Add All Day",
                },
              ].map((option) => (
                <Button
                  key={option.slot}
                  fullWidth
                  variant="outlined"
                  disabled={option.disabled}
                  onClick={() => chooseQuickScheduleSlot(option.slot)}
                  sx={{
                    justifyContent: "space-between",
                    minHeight: 68,
                    borderRadius: 2,
                    px: 1.5,
                    textTransform: "none",
                    borderColor: alpha("#FFFFFF", 0.1),
                    bgcolor: alpha("#FFFFFF", 0.025),
                    "&:hover": {
                      borderColor: alpha(theme.palette.primary.main, 0.28),
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                    },
                  }}
                >
                  <Box sx={{ textAlign: "left", minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 850, color: "text.primary" }}>
                      {option.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.subtitle}
                    </Typography>
                  </Box>

                  <Typography
                    variant="body2"
                    sx={{
                      color: option.action.startsWith("Override")
                        ? "warning.main"
                        : "primary.light",
                      fontWeight: 850,
                    }}
                  >
                    {option.disabled ? "Unavailable" : option.action}
                  </Typography>
                </Button>
              ))}

              <Button
                fullWidth
                variant="outlined"
                disabled
                sx={{
                  justifyContent: "space-between",
                  minHeight: 68,
                  borderRadius: 2,
                  px: 1.5,
                  textTransform: "none",
                  borderColor: alpha("#FFFFFF", 0.08),
                }}
              >
                <Box sx={{ textAlign: "left", minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 850, color: "text.primary" }}>
                    Custom Time
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Coming soon
                  </Typography>
                </Box>

                <Typography variant="body2" sx={{ fontWeight: 850 }}>
                  —
                </Typography>
              </Button>

              {quickScheduleIsPast ? (
                <Alert severity="info" variant="outlined">
                  Past dates cannot be scheduled.
                </Alert>
              ) : null}

              <Button
                fullWidth
                variant="outlined"
                onClick={closeQuickScheduleModal}
                sx={{ mt: 0.5, minHeight: 48, borderRadius: 2, textTransform: "none" }}
              >
                Cancel
              </Button>
            </Stack>
          </Box>
        </SwipeableDrawer>

        <Dialog
          open={addOpen}
          onClose={closeAddModal}
          fullScreen={isMobile}
          fullWidth
          maxWidth="md"
          PaperProps={{
            sx: {
              borderRadius: isMobile ? 0 : 2,
              bgcolor: "background.paper",
              backgroundImage: "none",
              overflow: "hidden",
            },
          }}
        >
          {isMobile ? (
            renderMobileAddTripContent()
          ) : (
            <>

          <DialogTitle>Schedule Trip</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
<Paper
  variant="outlined"
  sx={{
    p: 1.5,
    borderRadius: 2,
    backgroundColor: alpha(theme.palette.primary.main, 0.04),
  }}
>
  <Stack spacing={0.75}>
    <Typography variant="body2" color="text.secondary">
      Tech: <strong>{findTechName(addTechUid) || addTechUid}</strong>
    </Typography>

    <Typography variant="body2" color="text.secondary">
      Helper: <strong>{addPrimaryHelper?.name || "—"}</strong>
    </Typography>

    {unavailableDefaultHelperMessage ? (
      <Alert severity="warning" variant="outlined" sx={{ mt: 0.5 }}>
        {unavailableDefaultHelperMessage}
      </Alert>
    ) : null}

    {addSecondaryHelper ? (
      <Typography variant="body2" color="text.secondary">
        Additional Helper: <strong>{addSecondaryHelper.name}</strong>
      </Typography>
    ) : null}

    <Typography variant="body2" color="text.secondary">
      Date: <strong>{addDateIso}</strong> • Window: <strong>{formatSlotLabel(addSlot)}</strong>
    </Typography>

    {addTripType === "project" && selectedProjectStage ? (
      <Typography variant="body2" color="text.secondary">
        Project Stage: <strong>{selectedProjectStage.label}</strong>
      </Typography>
    ) : null}
  </Stack>
</Paper>

              <FormControl fullWidth>
                <InputLabel>Trip Type</InputLabel>
                <Select
                  label="Trip Type"
                  value={addTripType}
                  onChange={(e: SelectChangeEvent) => {
                    const v = e.target.value as AddTripType;
                    setAddTripType(v);
                    setAddSearch("");
                    setAddSelectedId("");
                    setAddAdvancedId("");
                    setAddProjectStageKey("");
                    if (v === "service") loadOpenTicketsIfNeeded();
                    else loadOpenProjectsIfNeeded();
                  }}
                  disabled={addSaving}
                >
                  <MenuItem value="service">Service Ticket</MenuItem>
                  <MenuItem value="project">Project</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label={addTripType === "service" ? "Open Service Ticket" : "Project"}
                placeholder={
                  addTripType === "service"
                    ? "Search by issue, customer, address…"
                    : "Search by project name, customer, address…"
                }
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                disabled={addSaving}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon />
                    </InputAdornment>
                  ),
                }}
              />

              <Paper variant="outlined" sx={{ borderRadius: 1, overflow: "hidden" }}>
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                    borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  }}
                >
                  <Typography variant="subtitle2">
                    {addTripType === "service" ? "Open Tickets" : "Projects"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {addTripType === "service"
                      ? openTicketsLoading
                        ? "Loading…"
                        : openTicketItems.length
                      : openProjectsLoading
                        ? "Loading…"
                        : openProjectItems.length}
                  </Typography>
                </Box>

                {openTicketsErr && addTripType === "service" ? <Alert severity="error">{openTicketsErr}</Alert> : null}
                {openProjectsErr && addTripType === "project" ? <Alert severity="error">{openProjectsErr}</Alert> : null}

                <Box sx={{ maxHeight: 320, overflow: "auto" }}>
                  {currentPickerItems().length === 0 ? (
                    <Box sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        No matches.
                      </Typography>
                    </Box>
                  ) : (
                    currentPickerItems().map((it) => {
                      const selected = addSelectedId === it.id;
                      return (
                        <Box
                          key={it.id}
                          onClick={() => selectAddPickerItem(it.id)}
                          sx={{
                            px: 1.5,
                            py: 1.25,
                            cursor: "pointer",
                            borderBottom: `1px solid ${alpha("#FFFFFF", 0.06)}`,
                            bgcolor: selected ? alpha(theme.palette.primary.main, 0.12) : "transparent",
                            borderLeft: selected ? `4px solid ${theme.palette.primary.main}` : "4px solid transparent",
                          }}
                        >
                          <Stack spacing={0.75}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                  {it.metaLeft ? (
                                    <Chip
                                      size="small"
                                      label={it.metaLeft}
                                      color="primary"
                                      variant="outlined"
                                      sx={{ height: 22 }}
                                    />
                                  ) : null}

                                  <Typography variant="subtitle2" noWrap>
                                    {it.label}
                                  </Typography>
                                </Stack>
                              </Box>

                              <Stack direction="row" spacing={1} alignItems="center">
                                {it.metaRight ? (
                                  <Typography variant="caption" color="text.primary">
                                    {it.metaRight}
                                  </Typography>
                                ) : null}
                                <Typography variant="caption" color="text.secondary">
                                  {it.id}
                                </Typography>
                              </Stack>
                            </Stack>

                            {it.sublabel ? (
                              <Typography variant="caption" color="text.secondary">
                                {it.sublabel}
                              </Typography>
                            ) : null}

                            {it.preview ? (
                              <Typography variant="caption" sx={{ color: alpha("#FFFFFF", 0.72) }}>
                                {it.preview}
                              </Typography>
                            ) : null}
                          </Stack>
                        </Box>
                      );
                    })
                  )}
                </Box>
              </Paper>

              {addTripType === "project" && selectedAddPickerItem ? (
                <FormControl fullWidth required error={!addProjectStageKey}>
                  <InputLabel>Project Stage</InputLabel>
                  <Select
                    label="Project Stage"
                    value={addProjectStageKey}
                    onChange={(e: SelectChangeEvent) => setAddProjectStageKey(e.target.value)}
                    disabled={addSaving || selectedProjectStageOptions.length === 0}
                  >
                    {selectedProjectStageOptions.map((stage) => (
                      <MenuItem key={stage.key} value={stage.key}>
                        {stage.label} • {projectStageStatusLabel(stage.status)}
                      </MenuItem>
                    ))}
                  </Select>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, px: 0.25 }}>
                    Completed project stages are hidden and cannot be scheduled.
                  </Typography>
                </FormControl>
              ) : null}

              {addShouldRecommendAllDay ? (
                <Alert
                  severity="warning"
                  variant="outlined"
                  action={
                    <Button
                      color="warning"
                      size="small"
                      onClick={() => setAddSlot("all_day")}
                      disabled={addSaving}
                    >
                      Switch to All Day
                    </Button>
                  }
                >
                  This ticket is estimated at {addEstimateHours} hours. All Day is recommended so it blocks both AM and PM for the crew.
                </Alert>
              ) : null}

              <TextField
                label="Advanced ID (optional)"
                placeholder={addTripType === "service" ? "Service Ticket ID…" : "Project ID…"}
                value={addAdvancedId}
                onChange={(e) => {
                  setAddAdvancedId(e.target.value);
                  setAddProjectStageKey("");
                }}
                disabled={addSaving}
                helperText="Only use if you need to schedule something not in the list."
              />

              <TextField
                label="Notes (optional)"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                disabled={addSaving}
                multiline
                minRows={3}
                placeholder="Optional dispatch note…"
              />

              {addSlotConflicts.hardMessages.length > 0 ? (
                <Alert severity="error" variant="outlined">
                  {addSlotConflicts.hardMessages[0]}
                </Alert>
              ) : null}

              {addSlotConflicts.softMessages.length > 0 &&
              addSlotConflicts.hardMessages.length === 0 ? (
                <Stack spacing={1.25}>
                  <Alert severity="warning" variant="outlined">
                    {addSlotConflicts.softMessages[0]}
                  </Alert>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={addDispatchOverrideEnabled}
                        onChange={(e) => setAddDispatchOverrideEnabled(e.target.checked)}
                      />
                    }
                    label="Dispatch Override this planned overlap"
                  />

                  {addDispatchOverrideEnabled ? (
                    <TextField
                      label="Dispatch Override Reason"
                      value={addDispatchOverrideReason}
                      onChange={(e) => setAddDispatchOverrideReason(e.target.value)}
                      placeholder="Example: emergency callback, VIP customer, short diagnostic visit, etc."
                      multiline
                      minRows={2}
                    />
                  ) : null}
                </Stack>
              ) : null}

              {addErr ? <Alert severity="error">{addErr}</Alert> : null}
            </Stack>
          </DialogContent>
            </>
          )}

          <DialogActions
            sx={{
              position: isMobile ? "sticky" : "static",
              bottom: 0,
              zIndex: 3,
              gap: 1,
              px: isMobile ? 2 : undefined,
              py: isMobile ? 1.5 : undefined,
              bgcolor: "background.paper",
              borderTop: isMobile ? `1px solid ${alpha("#FFFFFF", 0.1)}` : "none",
              "& > :not(style) ~ :not(style)": { ml: 0 },
            }}
          >
            <Button
              onClick={closeAddModal}
              disabled={addSaving}
              fullWidth={isMobile}
              sx={{ borderRadius: isMobile ? 2 : undefined, minHeight: isMobile ? 48 : undefined }}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAddTrip}
              disabled={
                addSaving ||
                !Boolean(String(addSelectedId || addAdvancedId || "").trim()) ||
                (addTripType === "project" && !Boolean(addProjectStageKey)) ||
                addSlotConflicts.hardMessages.length > 0 ||
                (addSlotConflicts.softMessages.length > 0 &&
                  (!addDispatchOverrideEnabled ||
                    !Boolean(addDispatchOverrideReason.trim())))
              }
              variant="contained"
              fullWidth={isMobile}
              sx={{ borderRadius: isMobile ? 2 : undefined, minHeight: isMobile ? 48 : undefined, fontWeight: 850 }}
            >
              {addSaving ? "Scheduling…" : "Schedule Trip"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={helperEditOpen}
          onClose={closeHelperEditDialog}
          fullScreen={isMobile}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              borderRadius: isMobile ? 0 : 2,
              backgroundImage: "none",
            },
          }}
        >
          <DialogTitle>
            {helperEditSlot === "add" ? "Add Helper" : "Edit Helper"}
          </DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              {helperEditTrip ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  }}
                >
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                      {helperEditTrip.link?.serviceTicketId
                        ? ticketMap[String(helperEditTrip.link.serviceTicketId || "")]?.issueSummary || "Service Ticket"
                        : helperEditTrip.link?.projectId
                          ? projectMap[String(helperEditTrip.link.projectId || "")]?.name || "Project"
                          : "Trip"}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      {formatDateLong(String(helperEditTrip.date || ""))} • {formatTimeRangeForCard(helperEditTrip)}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      Lead: <strong>{helperEditTrip.crew?.primaryTechName || "—"}</strong>
                    </Typography>

                    {helperEditExistingEntry ? (
                      <Typography variant="body2" color="text.secondary">
                        Current helper: <strong>{helperEditExistingEntry.name}</strong>
                      </Typography>
                    ) : null}
                  </Stack>
                </Paper>
              ) : null}

              {helperEditErr ? <Alert severity="error" variant="outlined">{helperEditErr}</Alert> : null}

              {helperEditTrip && !isPlannedStatus(helperEditTrip.status) ? (
                <Alert severity="info" variant="outlined">
                  Helper quick edits are locked after a trip has started.
                </Alert>
              ) : null}

              {helperEditExistingEntry ? (
                <Button
                  color="error"
                  variant="outlined"
                  disabled={helperEditSaving || !helperEditTrip || !isPlannedStatus(helperEditTrip.status)}
                  onClick={removeHelperFromTrip}
                  sx={{ borderRadius: 2, minHeight: 44, textTransform: "none", fontWeight: 850 }}
                >
                  Remove {helperEditExistingEntry.name}
                </Button>
              ) : null}

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1 }}>
                  {helperEditExistingEntry ? "Reassign to" : "Choose helper"}
                </Typography>

                <Stack spacing={1}>
                  {helpers.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No active helpers or apprentices found.
                    </Typography>
                  ) : (
                    helpers.map((helper) => {
                      const unavailableReason = helperEditTrip
                        ? helperUnavailableReasonForTrip(helperEditTrip, helper)
                        : "";

                      const disabled =
                        helperEditSaving ||
                        !helperEditTrip ||
                        !isPlannedStatus(helperEditTrip.status) ||
                        Boolean(unavailableReason);

                      return (
                        <Button
                          key={helper.uid}
                          variant="outlined"
                          disabled={disabled}
                          onClick={() => assignHelperToTrip(helper)}
                          sx={{
                            justifyContent: "space-between",
                            minHeight: 48,
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: 800,
                            gap: 1.5,
                          }}
                        >
                          <span>{helper.name}</span>
                          <Typography
                            component="span"
                            variant="caption"
                            color={unavailableReason ? "error.main" : "text.secondary"}
                            sx={{
                              textAlign: "right",
                              maxWidth: { xs: 190, sm: 260 },
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {unavailableReason || formatRoleLabel(helper.laborRole)}
                          </Typography>
                        </Button>
                      );
                    })
                  )}
                </Stack>
              </Box>

              <Typography variant="caption" color="text.secondary">
                PTO, company holiday, meeting, in-progress trip, and planned-trip conflicts are checked before saving.
              </Typography>
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={closeHelperEditDialog} disabled={helperEditSaving}>
              Close
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={blockOpen}
          onClose={closeManualBlockModal}
          fullScreen={isMobile}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              borderRadius: isMobile ? 0 : 2,
              backgroundImage: "none",
            },
          }}
        >
          <DialogTitle>Manual Schedule Block</DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Use this to block one or more employees on the schedule without creating meeting payroll entries.
              </Typography>

              {blockErr ? <Alert severity="error">{blockErr}</Alert> : null}

              <TextField
                label="Date"
                type="date"
                value={blockDateIso}
                onChange={(e) => setBlockDateIso(e.target.value)}
                disabled={blockSaving}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                helperText={blockDateIso ? formatDateLong(blockDateIso) : "Choose a date."}
              />

              <TextField
                label="Block Title"
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                disabled={blockSaving}
                placeholder="Training, shop work, unavailable, etc."
                required
              />

              <FormControl fullWidth>
                <InputLabel>Time Window</InputLabel>
                <Select
                  label="Time Window"
                  value={blockWindow}
                  onChange={(e: SelectChangeEvent) => setBlockWindow(e.target.value as "all_day" | "am" | "pm" | "custom")}
                  disabled={blockSaving}
                >
                  <MenuItem value="am">AM</MenuItem>
                  <MenuItem value="pm">PM</MenuItem>
                  <MenuItem value="all_day">All Day</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>

              {blockWindow === "custom" ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    label="Start"
                    type="time"
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
                    disabled={blockSaving}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                  />
                  <TextField
                    label="End"
                    type="time"
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
                    disabled={blockSaving}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                  />
                </Stack>
              ) : null}

              <Paper variant="outlined" sx={{ borderRadius: 1, overflow: "hidden" }}>
                <Box sx={{ px: 1.5, py: 1.25, borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}` }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Typography variant="subtitle2">Employees to block</Typography>
                    <Chip
                      size="small"
                      label={`${blockAppliesToUids.length} selected`}
                      color={blockAppliesToUids.length === 0 ? "warning" : "default"}
                      variant="outlined"
                      sx={{ borderRadius: 1.5 }}
                    />
                  </Stack>

                  <FormControlLabel
                    sx={{ mt: 0.75 }}
                    control={
                      <Checkbox
                        checked={blockIncludeAll}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setManualBlockAttendees(allMeetingEmployeeUids);
                          } else {
                            setBlockIncludeAll(false);
                            setBlockAppliesToUids([]);
                          }
                        }}
                        disabled={blockSaving || allMeetingEmployeeUids.length === 0}
                      />
                    }
                    label="Block all active employees"
                  />
                </Box>

                <Box sx={{ maxHeight: 260, overflow: "auto" }}>
                  {meetingEmployees.map((employee) => {
                    const checked = blockAppliesToUids.includes(employee.uid);
                    return (
                      <Box
                        key={employee.uid}
                        sx={{
                          px: 1.5,
                          py: 1.1,
                          borderBottom: `1px solid ${alpha("#FFFFFF", 0.06)}`,
                        }}
                      >
                        <FormControlLabel
                          sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
                          control={
                            <Checkbox
                              checked={checked}
                              disabled={blockSaving}
                              onChange={() => {
                                const next = checked
                                  ? blockAppliesToUids.filter((uid) => uid !== employee.uid)
                                  : [...blockAppliesToUids, employee.uid];
                                setManualBlockAttendees(next);
                              }}
                            />
                          }
                          label={
                            <Box sx={{ pt: 0.35 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {employee.displayName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatRoleLabel(employee.role)}
                              </Typography>
                            </Box>
                          }
                        />
                      </Box>
                    );
                  })}
                </Box>
              </Paper>

              <TextField
                label="Notes (optional)"
                value={blockNotes}
                onChange={(e) => setBlockNotes(e.target.value)}
                disabled={blockSaving}
                multiline
                minRows={3}
                placeholder="Reason for the block..."
              />

              {selectedBlockEmployees.length ? (
                <Typography variant="caption" color="text.secondary">
                  This will block {selectedBlockEmployees.length} employee(s) on Schedule. No meeting time entries will be created.
                </Typography>
              ) : null}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={closeManualBlockModal} disabled={blockSaving}>
              Cancel
            </Button>
            <Button
              onClick={submitManualBlock}
              disabled={blockSaving || !blockTitle.trim() || blockAppliesToUids.length === 0}
              variant="contained"
            >
              {blockSaving ? "Saving…" : "Add Block"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={meetOpen}
          onClose={closeMeetingModal}
          fullScreen={isMobile}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              borderRadius: isMobile ? 0 : 1,
              maxHeight: isMobile ? "100%" : "calc(100% - 64px)",
            },
          }}
        >
          <DialogTitle
            sx={{
              position: isMobile ? "sticky" : "static",
              top: 0,
              zIndex: 2,
              bgcolor: "background.paper",
              borderBottom: isMobile ? `1px solid ${alpha("#FFFFFF", 0.1)}` : "none",
            }}
          >
            {editingMeetId ? "Edit Company Meeting" : "Schedule Company Meeting"}
          </DialogTitle>

          <DialogContent dividers sx={{ pb: isMobile ? 2 : undefined }}>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                This meeting will appear on Schedule and My Day for the selected employees only.
              </Typography>

              {meetErr ? <Alert severity="error">{meetErr}</Alert> : null}
              {meetMsg ? <Alert severity="success">{meetMsg}</Alert> : null}

              <Stack spacing={1}>
                <TextField
                  label="Date"
                  type="date"
                  value={meetDateIso}
                  onChange={(e) => setMeetDateIso(e.target.value)}
                  disabled={meetSaving}
                  fullWidth
                  required
                  InputLabelProps={{ shrink: true }}
                  helperText={meetDateIso ? formatDateLong(meetDateIso) : "Choose a date from the calendar picker."}
                />
              </Stack>

              <TextField
                label="Title"
                value={meetTitle}
                onChange={(e) => setMeetTitle(e.target.value)}
                disabled={meetSaving}
                placeholder="Weekly Safety Meeting"
                required
              />

              <FormControl fullWidth>
                <InputLabel>Time Window</InputLabel>
                <Select
                  label="Time Window"
                  value={meetWindow}
                  onChange={(e: SelectChangeEvent) => setMeetWindow(e.target.value as "all_day" | "am" | "pm" | "custom")}
                  disabled={meetSaving}
                >
                  <MenuItem value="am">AM</MenuItem>
                  <MenuItem value="pm">PM</MenuItem>
                  <MenuItem value="all_day">All Day</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>

              {meetWindow === "custom" ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    label="Start"
                    type="time"
                    value={meetStart}
                    onChange={(e) => setMeetStart(e.target.value)}
                    disabled={meetSaving}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                  />
                  <TextField
                    label="End"
                    type="time"
                    value={meetEnd}
                    onChange={(e) => setMeetEnd(e.target.value)}
                    disabled={meetSaving}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                  />
                </Stack>
              ) : null}

              <TextField
                label="Location (optional)"
                value={meetLocation}
                onChange={(e) => setMeetLocation(e.target.value)}
                disabled={meetSaving}
                placeholder="Office"
              />

              <TextField
                label="Notes (optional)"
                value={meetNotes}
                onChange={(e) => setMeetNotes(e.target.value)}
                disabled={meetSaving}
                multiline
                minRows={3}
                placeholder="Anything everyone should know…"
              />

              <Paper variant="outlined" sx={{ borderRadius: 1, overflow: "hidden" }}>
                <Box sx={{ px: 1.5, py: 1.25, borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}` }}>
                  <Stack spacing={1.25}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "flex-start", sm: "center" }}
                      justifyContent="space-between"
                    >
                      <Typography variant="subtitle2">Invite employees</Typography>
                      <Chip
                        size="small"
                        label={`${meetAppliesToUids.length} selected`}
                        color={meetAppliesToUids.length === 0 ? "warning" : "default"}
                        variant="outlined"
                        sx={{ borderRadius: 1.5 }}
                      />
                    </Stack>

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={meetIncludeAll}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMeetingAttendees(allMeetingEmployeeUids);
                            } else {
                              setMeetIncludeAll(false);
                            }
                          }}
                          disabled={meetSaving || allMeetingEmployeeUids.length === 0}
                        />
                      }
                      label="Invite all active employees"
                    />

                    <TextField
                      size="small"
                      label="Search employees"
                      value={meetAttendeeSearch}
                      onChange={(e) => setMeetAttendeeSearch(e.target.value)}
                      disabled={meetSaving}
                      placeholder="Search by name or role…"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchRoundedIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Stack>
                </Box>

                <Box sx={{ maxHeight: 280, overflow: "auto" }}>
                  {filteredMeetingEmployees.length === 0 ? (
                    <Box sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        No employees match that search.
                      </Typography>
                    </Box>
                  ) : (
                    filteredMeetingEmployees.map((employee) => {
                      const checked = meetAppliesToUids.includes(employee.uid);
                      const hasConflict = meetingConflictSummary.conflictEmployeeUids.includes(employee.uid);
                      return (
                        <Box
                          key={employee.uid}
                          sx={{
                            px: 1.5,
                            py: 1.1,
                            borderBottom: `1px solid ${alpha("#FFFFFF", 0.06)}`,
                            bgcolor: hasConflict ? alpha(theme.palette.warning.main, 0.08) : "transparent",
                          }}
                        >
                          <FormControlLabel
                            sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
                            control={
                              <Checkbox
                                checked={checked}
                                disabled={meetSaving}
                                onChange={() => {
                                  const next = checked
                                    ? meetAppliesToUids.filter((uid) => uid !== employee.uid)
                                    : [...meetAppliesToUids, employee.uid];
                                  setMeetingAttendees(next);
                                }}
                              />
                            }
                            label={
                              <Box sx={{ pt: 0.35 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {employee.displayName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {formatRoleLabel(employee.role)}
                                </Typography>
                              </Box>
                            }
                          />
                        </Box>
                      );
                    })
                  )}
                </Box>
              </Paper>

              <Paper variant="outlined" sx={{ borderRadius: 1, p: 1.5 }}>
                <Stack spacing={1}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Typography variant="subtitle2">Schedule check</Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={meetingConflictSummary.hardMessages.length ? "error" : meetingConflictSummary.softMessages.length ? "warning" : "success"}
                      label={
                        meetingConflictSummary.hardMessages.length
                          ? `${meetingConflictSummary.hardMessages.length} blocker(s)`
                          : meetingConflictSummary.softMessages.length
                            ? `${meetingConflictSummary.softMessages.length} warning(s)`
                            : "No conflicts found"
                      }
                      sx={{ borderRadius: 1.5 }}
                    />
                  </Stack>

                  <Typography variant="caption" color="text.secondary">
                    {meetDateIso ? formatDateLong(meetDateIso) : "Choose a date"} • {formatWindowLabel(meetWindow)}
                    {meetWindow === "custom" ? ` • ${formatTime12h(meetStart)}–${formatTime12h(meetEnd)}` : ""}
                  </Typography>

                  {meetingConflictSummary.hardMessages.length === 0 && meetingConflictSummary.softMessages.length === 0 ? (
                    <Alert severity="success" variant="outlined">
                      No PTO, meeting, holiday, or trip conflicts found for the selected employees.
                    </Alert>
                  ) : null}

                  {meetingConflictSummary.hardMessages.slice(0, 4).map((message) => (
                    <Alert key={message} severity="error" variant="outlined">
                      {message}
                    </Alert>
                  ))}

                  {meetingConflictSummary.softMessages.slice(0, 5).map((message) => (
                    <Alert key={message} severity="warning" variant="outlined">
                      {message}
                    </Alert>
                  ))}

                  {meetingConflictSummary.hardMessages.length + meetingConflictSummary.softMessages.length > 5 ? (
                    <Typography variant="caption" color="text.secondary">
                      +{meetingConflictSummary.hardMessages.length + meetingConflictSummary.softMessages.length - 5} more schedule warning(s).
                    </Typography>
                  ) : null}
                </Stack>
              </Paper>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={meetBlocks}
                    onChange={(e) => setMeetBlocks(e.target.checked)}
                    disabled={meetSaving}
                  />
                }
                label="Block schedule during this meeting"
              />

              {editingMeetId ? (
                <Typography variant="caption" color="text.secondary">
                  Edits are blocked if linked weekly timesheets are submitted, approved, or exported.
                </Typography>
              ) : null}
            </Stack>
          </DialogContent>

          <DialogActions
            sx={{
              justifyContent: "space-between",
              position: isMobile ? "sticky" : "static",
              bottom: 0,
              zIndex: 2,
              bgcolor: "background.paper",
              borderTop: isMobile ? `1px solid ${alpha("#FFFFFF", 0.1)}` : "none",
              px: isMobile ? 2 : undefined,
              py: isMobile ? 1.5 : undefined,
            }}
          >
            <Box>
              {editingMeetId ? (
                <Button
                  onClick={handleDeleteMeeting}
                  disabled={meetSaving}
                  color="error"
                  startIcon={<DeleteRoundedIcon />}
                >
                  Delete
                </Button>
              ) : null}
            </Box>

            <Stack direction="row" spacing={1}>
              <Button onClick={closeMeetingModal} disabled={meetSaving}>
                Cancel
              </Button>
              <Button
                onClick={submitMeeting}
                disabled={meetSaving || meetingConflictSummary.hardMessages.length > 0}
                variant="contained"
              >
                {meetSaving ? "Saving…" : editingMeetId ? "Save Changes" : "Schedule Meeting"}
              </Button>
            </Stack>
          </DialogActions>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}