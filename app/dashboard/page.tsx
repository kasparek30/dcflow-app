// app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
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
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import PauseCircleRoundedIcon from "@mui/icons-material/PauseCircleRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import PlumbingRoundedIcon from "@mui/icons-material/PlumbingRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

declare global {
  interface Window {
    google?: any;
    __dcflowGoogleMapsPromise?: Promise<any>;
  }
}

function loadGoogleMapsScript(apiKey: string) {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Google Maps can only load in the browser."),
    );
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (window.__dcflowGoogleMapsPromise) {
    return window.__dcflowGoogleMapsPromise;
  }

  window.__dcflowGoogleMapsPromise = new Promise<any>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-dcflow-google-maps="true"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google));
      existingScript.addEventListener("error", () =>
        reject(new Error("Failed to load Google Maps.")),
      );
      return;
    }

    const script = document.createElement("script");
    script.setAttribute("data-dcflow-google-maps", "true");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&v=weekly`;

    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Failed to load Google Maps."));

    document.head.appendChild(script);
  });

  return window.__dcflowGoogleMapsPromise;
}

type DashboardTicketItem = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
  serviceAddressLine1?: string;
  serviceCity?: string;
  serviceState?: string;
  updatedAt?: string | null;
  assignedTechnicianName?: string;
  assignedHelperName?: string;
  readyToBillAt?: string | null;
  status?: string;
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

type TripLink = {
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type PauseBlock = {
  startAt?: string | null;
  endAt?: string | null;
};

type StaffUnpaidTimeType = "lunch" | "personal" | "other";

type StaffUnpaidTimeBlock = {
  id?: string | null;
  type: StaffUnpaidTimeType;
  startAt: string;
  endAt: string;
  minutes: number;
  note?: string | null;
};

type StaffUnpaidTimeBlockDraft = {
  id: string;
  type: StaffUnpaidTimeType;
  startTime: string;
  endTime: string;
  note: string;
};

type TripDocLite = {
  id: string;
  active?: boolean | null;
  type?: "service" | "project" | string;
  status?: string | null;
  timerState?: string | null;
  date?: string;
  timeWindow?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  updatedAt?: string | null;
  crew?: TripCrew | null;
  crewConfirmed?: TripCrew | null;
  link?: TripLink | null;
};

type ProjectTripDocLite = TripDocLite & {
  completedAt?: string | null;
  startedAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;
  notes?: string | null;
  materialsSummary?: string | null;
  materialsUsedToday?: string | null;
  closeout?: {
    outcome?: string | null;
    needsMoreWork?: "yes" | "no" | string | null;
    hoursWorkedToday?: number | null;
    workNotes?: string | null;
    materialsUsedToday?: string | null;
    savedAt?: string | null;
    savedByName?: string | null;
  } | null;
  billingPeriodId?: string | null;
  billingPeriodSequence?: number | null;
  billingPeriodLabel?: string | null;
  billingPeriodStatus?: string | null;
  readyToBillAt?: string | null;
};

type ActiveWorkItem = {
  id: string;
  tripId: string;
  pinNumber?: number;
  itemType: "service" | "project";
  href: string;
  title: string;
  subtitle: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  updatedAt?: string | null;
  status?: string | null;
  timerState?: string | null;
  assignedTechnicianName?: string;
  assignedHelperName?: string;
  secondaryTechnicianName?: string;
  secondaryHelperName?: string;
};

type ProjectOfficeStatus =
  "active_work" | "field_complete" | "ready_to_invoice" | "invoiced" | "closed";

type ProjectBillingPeriodStatus = "open" | "ready_to_bill" | "invoiced";

type ProjectBillingPeriodLite = {
  id: string;
  sequence: number;
  label?: string | null;
  status?: ProjectBillingPeriodStatus | string | null;
  readyToBillAt?: string | null;
  readyToBillByUid?: string | null;
  readyToBillByName?: string | null;
  totalHours?: number | null;
  materialsCount?: number | null;
  tripCount?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  invoicedAt?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
};

type ProjectStageBillingLite = {
  billingStatus?: "not_ready" | "ready_to_bill" | "invoiced" | string | null;
  readyToBillAt?: string | null;
  readyToBillByName?: string | null;
  invoicedAt?: string | null;
  invoiceNumber?: string | null;
};

type DashboardProjectDoc = {
  id: string;
  active?: boolean | null;
  projectName?: string | null;
  customerDisplayName?: string | null;
  projectType?: string | null;
  serviceAddressLine1?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  servicePostalCode?: string | null;
  projectOfficeStatus?: ProjectOfficeStatus | string | null;
  fieldCompletedAt?: string | null;
  readyToInvoiceAt?: string | null;
  readyToInvoiceByName?: string | null;
  currentBillingPeriodId?: string | null;
  billingPeriods?: ProjectBillingPeriodLite[] | null;
  roughIn?: ProjectStageBillingLite | null;
  topOutVent?: ProjectStageBillingLite | null;
  trimFinish?: ProjectStageBillingLite | null;
  invoiceNumber?: string | null;
};

type ProjectFollowUpItem = {
  projectId: string;
  href: string;
  projectName: string;
  customerDisplayName: string;
  projectTypeLabel: string;
  stageLabel: string;
  addressLine: string;
  flaggedTripDate: string;
  flaggedAt?: string | null;
  flaggedByName: string;
  workSummary: string;
  hasScheduledReturn: boolean;
  hasLaterCompletedWork: boolean;
};

type ReadyInvoiceProjectItem = {
  projectId: string;
  href: string;
  billingHref: string;
  projectName: string;
  customerDisplayName: string;
  projectTypeLabel: string;
  billingLabel: string;
  readyAt?: string | null;
  readyByName?: string | null;
  totalHours: number;
  materialsCount: number;
  tripCount: number;
  invoiceNumber?: string | null;
};

type DashboardMaterialOrderDoc = {
  id: string;
  materialOrderCode?: string | null;
  customerDisplayName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  requestSummary?: string | null;
  status?: string | null;
  targetPickupDate?: string | null;
  pickup?: {
    status?: string | null;
    pickedUpAt?: string | null;
    pickedUpByName?: string | null;
  } | null;
  billing?: {
    status?: string | null;
    readyToBillAt?: string | null;
    readyToBillByName?: string | null;
    qboInvoiceNumber?: string | null;
    qboInvoiceId?: string | null;
    invoiceNumber?: string | null;
    invoiceId?: string | null;
    invoicedAt?: string | null;
  } | null;
  poNumbers?: string[] | null;
  purchaseOrders?: Array<{
    poNumber?: string | null;
    supplierName?: string | null;
    supplierInvoiceNumber?: string | null;
  }> | null;
  supplierInvoices?: Array<{
    poNumber?: string | null;
    supplierName?: string | null;
    invoiceNumber?: string | null;
    total?: number | null;
  }> | null;
  supplierCostTotal?: number | null;
  customerPriceTotal?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PendingMaterialOrderItem = {
  id: string;
  href: string;
  customerDisplayName: string;
  requestSummary: string;
  statusLabel: string;
  statusTone: "warning" | "success" | "info" | "primary" | "default";
  urgencyRank: number;
  updatedAt?: string | null;
};

type DashboardStaffCoverageItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  workType: string;
  date: string;
  startTime: string;
  endTime: string;
  scheduledHours: number;
  unpaidBreakMinutes: number;
  lunchStartAt?: string | null;
  lunchEndAt?: string | null;
  unpaidTimeBlocks?: StaffUnpaidTimeBlock[] | null;
  status: string;
  active: boolean;
  linkedTimeEntryId?: string | null;
  linkedWeeklyTimesheetId?: string | null;
  confirmedAt?: string | null;
  confirmedByUid?: string | null;
  notes?: string | null;
};

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function normalizeStatus(status?: string | null) {
  return safeTrim(status).toLowerCase();
}

function normalizeOfficeStatus(status?: string | null): ProjectOfficeStatus {
  const normalized = safeTrim(status).toLowerCase();
  if (
    normalized === "field_complete" ||
    normalized === "ready_to_invoice" ||
    normalized === "invoiced" ||
    normalized === "closed"
  ) {
    return normalized;
  }
  return "active_work";
}

function todayIsoLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseFlexibleDateMs(value?: string | null) {
  const raw = safeTrim(value);
  if (!raw) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00`).getTime();
  }
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function formatWhen(value?: string | null) {
  const raw = safeTrim(value);
  if (!raw) return "—";

  const ms = parseFlexibleDateMs(raw);
  if (!Number.isFinite(ms)) return raw;

  return new Date(ms).toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(value?: string | null) {
  const raw = safeTrim(value);
  if (!raw) return "—";

  const ms = parseFlexibleDateMs(raw);
  if (!Number.isFinite(ms)) return raw;

  return new Date(ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function parseHHMM(hhmm: string) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function minutesFromHHMM(hhmm: string) {
  const parsed = parseHHMM(hhmm);
  if (!parsed) return null;
  return parsed.hh * 60 + parsed.mm;
}

function formatTime12h(hhmm?: string | null) {
  const parsed = parseHHMM(String(hhmm || ""));
  if (!parsed) return "—";

  let hh = parsed.hh;
  const suffix = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;

  return parsed.mm === 0
    ? `${hh}${suffix}`
    : `${hh}:${String(parsed.mm).padStart(2, "0")}${suffix}`;
}

function formatIsoTime12h(value?: string | null) {
  const raw = safeTrim(value);
  if (!raw) return "";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildLocalIsoFromDateAndTime(dateIso: string, hhmm: string) {
  const parsed = parseHHMM(hhmm);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;

  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(
    year,
    month - 1,
    day,
    parsed.hh,
    parsed.mm,
    0,
    0,
  ).toISOString();
}

function calculatePaidStaffHours(
  startTime: string,
  endTime: string,
  unpaidBreakMinutes: number,
) {
  const start = minutesFromHHMM(startTime);
  const end = minutesFromHHMM(endTime);
  if (start == null || end == null || end <= start) return null;

  const paidMinutes = Math.max(0, end - start - unpaidBreakMinutes);
  return Math.round((paidMinutes / 60) * 100) / 100;
}

function calculateTimeBlockMinutes(startTime: string, endTime: string) {
  const start = minutesFromHHMM(startTime);
  const end = minutesFromHHMM(endTime);
  if (start == null || end == null || end <= start) return null;
  return end - start;
}

function isTimeBlockInsideShift(
  shiftStartTime: string,
  shiftEndTime: string,
  blockStartTime: string,
  blockEndTime: string,
) {
  const shiftStart = minutesFromHHMM(shiftStartTime);
  const shiftEnd = minutesFromHHMM(shiftEndTime);
  const blockStart = minutesFromHHMM(blockStartTime);
  const blockEnd = minutesFromHHMM(blockEndTime);

  if (
    shiftStart == null ||
    shiftEnd == null ||
    blockStart == null ||
    blockEnd == null
  ) {
    return false;
  }

  return (
    blockStart >= shiftStart &&
    blockEnd <= shiftEnd &&
    blockEnd > blockStart
  );
}

function unpaidTimeTypeLabel(type?: StaffUnpaidTimeType | string | null) {
  const normalized = safeTrim(type).toLowerCase();
  if (normalized === "lunch") return "Lunch";
  if (normalized === "personal") return "Personal / Out of Office";
  return "Other Unpaid Time";
}

function formatMinutesDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (hours > 0 && mins > 0) return `${hours} hr ${mins} min`;
  if (hours > 0) return `${hours} hr`;
  return `${mins} min`;
}

function coerceStaffUnpaidTimeBlocks(input: unknown): StaffUnpaidTimeBlock[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry: any) => {
      const typeRaw = safeTrim(entry?.type).toLowerCase();
      const type: StaffUnpaidTimeType =
        typeRaw === "lunch"
          ? "lunch"
          : typeRaw === "personal" || typeRaw === "out_of_office"
            ? "personal"
            : "other";

      return {
        id: safeTrim(entry?.id) || null,
        type,
        startAt: safeTrim(entry?.startAt),
        endAt: safeTrim(entry?.endAt),
        minutes: Number(entry?.minutes || 0),
        note: safeTrim(entry?.note) || null,
      } satisfies StaffUnpaidTimeBlock;
    })
    .filter(
      (entry) =>
        Boolean(entry.startAt) &&
        Boolean(entry.endAt) &&
        Number.isFinite(entry.minutes) &&
        entry.minutes > 0,
    );
}

function buildLegacyUnpaidTimeBlocks(
  item: DashboardStaffCoverageItem,
): StaffUnpaidTimeBlockDraft[] {
  const existing = coerceStaffUnpaidTimeBlocks(item.unpaidTimeBlocks);

  if (existing.length > 0) {
    return existing.map((block, index) => ({
      id: safeTrim(block.id) || `existing_${index}_${Date.now()}`,
      type: block.type,
      startTime: new Date(block.startAt).toTimeString().slice(0, 5),
      endTime: new Date(block.endAt).toTimeString().slice(0, 5),
      note: safeTrim(block.note),
    }));
  }

  if (item.lunchStartAt && item.lunchEndAt) {
    return [
      {
        id: `legacy_lunch_${Date.now()}`,
        type: "lunch",
        startTime: new Date(item.lunchStartAt).toTimeString().slice(0, 5),
        endTime: new Date(item.lunchEndAt).toTimeString().slice(0, 5),
        note: "",
      },
    ];
  }

  const legacyMinutes = Number(item.unpaidBreakMinutes || 0);
  if (legacyMinutes > 0) {
    const fallbackStart = "12:00";
    const startMinutes = minutesFromHHMM(fallbackStart) || 720;
    const endMinutes = Math.min(23 * 60 + 59, startMinutes + legacyMinutes);
    const fallbackEnd = `${String(Math.floor(endMinutes / 60)).padStart(
      2,
      "0",
    )}:${String(endMinutes % 60).padStart(2, "0")}`;

    return [
      {
        id: `legacy_unpaid_${Date.now()}`,
        type: "lunch",
        startTime: fallbackStart,
        endTime: fallbackEnd,
        note: "",
      },
    ];
  }

  return [];
}

function buildUnpaidTimeSummary(
  unpaidBreakMinutes: number,
  unpaidTimeBlocks?: StaffUnpaidTimeBlock[] | null,
  lunchStartAt?: string | null,
  lunchEndAt?: string | null,
) {
  const blocks = coerceStaffUnpaidTimeBlocks(unpaidTimeBlocks);

  if (blocks.length > 0) {
    const typeCounts = blocks.reduce(
      (acc, block) => {
        acc[block.type] = (acc[block.type] || 0) + 1;
        return acc;
      },
      {} as Record<StaffUnpaidTimeType, number>,
    );

    const labels = (Object.keys(typeCounts) as StaffUnpaidTimeType[]).map(
      (type) =>
        `${typeCounts[type]} ${unpaidTimeTypeLabel(type).toLowerCase()}`,
    );

    return `${formatMinutesDuration(unpaidBreakMinutes)} unpaid • ${labels.join(
      ", ",
    )}`;
  }

  if (unpaidBreakMinutes <= 0) return "No unpaid time";

  const lunchStart = lunchStartAt ? formatIsoTime12h(lunchStartAt) : "";
  const lunchEnd = lunchEndAt ? formatIsoTime12h(lunchEndAt) : "";

  return lunchStart && lunchEnd
    ? `${lunchStart}–${lunchEnd} • ${formatMinutesDuration(
        unpaidBreakMinutes,
      )} unpaid`
    : `${formatMinutesDuration(unpaidBreakMinutes)} unpaid`;
}

function buildStaffAdjustmentNotes(
  existingNotes: string,
  item: DashboardStaffCoverageItem,
  actualStartTime: string,
  actualEndTime: string,
  unpaidBreakMinutes: number,
  paidHours: number,
  adjustmentNote: string,
  unpaidBlocks: StaffUnpaidTimeBlockDraft[],
) {
  const unpaidLines =
    unpaidBlocks.length > 0
      ? unpaidBlocks.map((block) => {
          const minutes =
            calculateTimeBlockMinutes(block.startTime, block.endTime) || 0;
          const note = safeTrim(block.note);
          return `${unpaidTimeTypeLabel(block.type)}: ${formatTime12h(
            block.startTime,
          )}–${formatTime12h(block.endTime)} (${formatMinutesDuration(
            minutes,
          )})${note ? ` — ${note}` : ""}`;
        })
      : ["Unpaid time: none"];

  const adjustmentLines = [
    "Staff adjustment:",
    `Scheduled: ${formatTime12h(item.startTime)}–${formatTime12h(
      item.endTime,
    )} (${item.scheduledHours.toFixed(2)} paid hrs)`,
    `Actual: ${formatTime12h(actualStartTime)}–${formatTime12h(
      actualEndTime,
    )} (${paidHours.toFixed(2)} paid hrs)`,
    unpaidBreakMinutes > 0
      ? `Total unpaid time: ${formatMinutesDuration(unpaidBreakMinutes)}`
      : "Total unpaid time: none",
    ...unpaidLines,
    adjustmentNote ? `Reason: ${adjustmentNote}` : "",
  ].filter(Boolean);

  return [safeTrim(existingNotes), adjustmentLines.join("\n")]
    .filter(Boolean)
    .join("\n\n");
}

function labelForStaffWorkType(workType?: string | null) {
  const normalized = safeTrim(workType).toLowerCase();

  if (normalized === "dispatch") return "Dispatch Coverage";
  if (normalized === "billing") return "Billing";
  if (normalized === "office") return "Office";
  if (normalized === "admin") return "Admin";
  if (normalized === "shop") return "Shop";
  if (normalized === "other") return "Other";

  return "Staff Coverage";
}

function isLockedWeeklyTimesheetStatus(status?: string | null) {
  const s = safeTrim(status).toLowerCase();
  return (
    s === "submitted" ||
    s === "approved" ||
    s === "exported" ||
    s === "exported_to_quickbooks"
  );
}

function isStaffCoverageVisibleForConfirmation(
  item: DashboardStaffCoverageItem,
) {
  if (item.active === false) return false;

  const status = safeTrim(item.status).toLowerCase();
  if (status === "cancelled" || status === "completed") return false;
  if (item.confirmedAt) return false;

  // Show past shifts and today's shift. Future shifts remain hidden.
  return item.date <= todayIsoLocal();
}

function canQuickConfirmStaffCoverage(item: DashboardStaffCoverageItem) {
  if (!isStaffCoverageVisibleForConfirmation(item)) return false;

  const today = todayIsoLocal();

  // Past shifts can always use the scheduled-hours quick confirmation.
  if (item.date < today) return true;

  // Today's one-click confirmation becomes available after the scheduled end.
  const endMinutes = minutesFromHHMM(item.endTime);
  if (endMinutes == null) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return nowMinutes >= endMinutes;
}

function currentTimeHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

function hasMaterialOrderInvoiceSignal(order: DashboardMaterialOrderDoc) {
  const billing = (order.billing || {}) as Record<string, unknown>;

  return Boolean(
    safeTrim(billing.qboInvoiceNumber) ||
    safeTrim(billing.qboInvoiceId) ||
    safeTrim(billing.invoiceNumber) ||
    safeTrim(billing.invoiceId) ||
    safeTrim(billing.invoicedAt),
  );
}

function getPendingMaterialOrderStatus(order: DashboardMaterialOrderDoc) {
  const orderStatus = normalizeStatus(order.status);
  const billingStatus = normalizeStatus(order.billing?.status);
  const pickupStatus = normalizeStatus(order.pickup?.status);
  const hasPo =
    (Array.isArray(order.poNumbers) && order.poNumbers.length > 0) ||
    (Array.isArray(order.purchaseOrders) && order.purchaseOrders.length > 0);
  const isInvoiced =
    orderStatus === "invoiced" ||
    billingStatus === "invoiced" ||
    hasMaterialOrderInvoiceSignal(order);
  const isPickedUp =
    orderStatus === "picked_up" || pickupStatus === "picked_up";

  if (
    orderStatus === "cancelled" ||
    orderStatus === "closed" ||
    billingStatus === "closed"
  ) {
    return null;
  }

  if (isInvoiced && isPickedUp) {
    return null;
  }

  if (isInvoiced && !isPickedUp) {
    return {
      label: "Billed — Waiting for Pickup",
      tone: "success" as const,
      rank: 1,
    };
  }

  if (billingStatus === "ready_to_bill" || orderStatus === "ready_to_bill") {
    return {
      label: "Needs Invoice",
      tone: "warning" as const,
      rank: 2,
    };
  }

  if (isPickedUp) {
    return {
      label: "Picked Up — Needs Invoice",
      tone: "warning" as const,
      rank: 3,
    };
  }

  if (
    orderStatus === "ready_for_pickup" ||
    pickupStatus === "ready_for_pickup"
  ) {
    return {
      label: "Ready for Pickup",
      tone: "success" as const,
      rank: 4,
    };
  }

  if (orderStatus === "received" || pickupStatus === "received") {
    return {
      label: "Received — Prep for Pickup",
      tone: "info" as const,
      rank: 5,
    };
  }

  if (orderStatus === "ordered") {
    return {
      label: "Waiting for Delivery",
      tone: "primary" as const,
      rank: 6,
    };
  }

  if (orderStatus === "po_created" || hasPo) {
    return {
      label: "Needs Ordering",
      tone: "primary" as const,
      rank: 7,
    };
  }

  return {
    label: "Needs PO",
    tone: "warning" as const,
    rank: 8,
  };
}

function ticketSort(a: DashboardTicketItem, b: DashboardTicketItem) {
  const aTs = safeTrim(a.readyToBillAt || a.updatedAt);
  const bTs = safeTrim(b.readyToBillAt || b.updatedAt);
  return bTs.localeCompare(aTs);
}

function statusSort(a: ActiveWorkItem, b: ActiveWorkItem) {
  const aTs = safeTrim(a.updatedAt);
  const bTs = safeTrim(b.updatedAt);
  return bTs.localeCompare(aTs);
}

function buildAddress(item: {
  addressLine1?: string;
  city?: string;
  state?: string;
}) {
  return [
    safeTrim(item.addressLine1),
    safeTrim(item.city),
    safeTrim(item.state),
  ]
    .filter(Boolean)
    .join(", ");
}

function buildInlineAddress(
  line1?: string | null,
  line2?: string | null,
  city?: string | null,
  state?: string | null,
  postal?: string | null,
) {
  return [line1, line2, city, state, postal]
    .map(safeTrim)
    .filter(Boolean)
    .join(", ");
}

function buildAssignedPeople(item: {
  assignedTechnicianName?: string;
  assignedHelperName?: string;
  secondaryTechnicianName?: string;
  secondaryHelperName?: string;
}) {
  return [
    safeTrim(item.assignedTechnicianName),
    safeTrim(item.assignedHelperName),
    safeTrim(item.secondaryTechnicianName),
    safeTrim(item.secondaryHelperName),
  ]
    .filter(Boolean)
    .join(" + ");
}

function hasMappableAddress(item: ActiveWorkItem) {
  return Boolean(buildAddress(item));
}

function hasAssignedCrew(item: ActiveWorkItem) {
  return Boolean(buildAssignedPeople(item));
}

function isFieldVisibleStatus(
  status?: string | null,
  timerState?: string | null,
) {
  const normalized = normalizeStatus(status);
  const normalizedTimer = normalizeStatus(timerState);

  return (
    ["in_progress", "paused", "dispatched", "assigned", "on_site"].includes(
      normalized,
    ) || ["running", "paused"].includes(normalizedTimer)
  );
}

function isFieldVisibleItem(item: ActiveWorkItem) {
  return (
    isFieldVisibleStatus(item.status, item.timerState) &&
    hasAssignedCrew(item) &&
    hasMappableAddress(item)
  );
}

function getStaticMapItems(items: ActiveWorkItem[]) {
  return items.filter(isFieldVisibleItem).slice(0, 6);
}

function withPinNumbers(items: ActiveWorkItem[]) {
  const pinItems = getStaticMapItems(items);
  const pinById = new Map(pinItems.map((item, index) => [item.id, index + 1]));

  return items.map((item) => ({
    ...item,
    pinNumber: pinById.get(item.id),
  }));
}

function getMapItemLabel(item: ActiveWorkItem) {
  const title =
    safeTrim(item.title) ||
    (item.itemType === "project" ? "Project" : "Service Ticket");
  const subtitle = safeTrim(item.subtitle);
  return subtitle ? `${title} — ${subtitle}` : title;
}

function buildStaticMapUrl(
  items: ActiveWorkItem[],
  options?: { variant?: "card" | "modal" },
) {
  const apiKey = safeTrim(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  if (!apiKey) return "";

  const variant = options?.variant || "card";
  const mapItems = getStaticMapItems(items);

  if (mapItems.length === 0) return "";

  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams();

  // Google Static Maps standard image size tops out at 640px per side.
  // Use supported dimensions and scale=2 so the browser receives a crisp image
  // without triggering the odd cropped/letterboxed rendering we saw with 1400px.
  params.set("size", variant === "modal" ? "640x420" : "640x300");
  params.set("scale", "2");
  params.set("maptype", "roadmap");

  const addresses = mapItems.map((item) => buildAddress(item)).filter(Boolean);

  if (addresses.length === 1) {
    params.set("center", addresses[0]);
    params.set("zoom", variant === "modal" ? "10" : "11");
  } else {
    addresses.forEach((address) => params.append("visible", address));
  }

  mapItems.forEach((item, index) => {
    const address = buildAddress(item);
    if (!address) return;

    const label = String(item.pinNumber || index + 1);
    params.append(
      "markers",
      `size:mid|color:0x1a73e8|label:${label}|${address}`,
    );
  });

  // Prevent stale browser/Google image caching while crews change or while we
  // are tuning map behavior in development.
  params.set(
    "dcflowMapVersion",
    `${variant}-${mapItems.map((item) => `${item.id}:${item.pinNumber || ""}:${buildAddress(item)}`).join("|")}`,
  );

  params.set("key", apiKey);
  return `${base}?${params.toString()}`;
}

function formatProjectType(projectType?: string | null) {
  const normalized = safeTrim(projectType).toLowerCase();
  if (normalized === "new_construction") return "New Construction";
  if (normalized === "remodel") return "Remodel";
  if (normalized === "time_materials" || normalized === "time+materials")
    return "Time + Materials";
  return "Project";
}

function stageLabel(stageKey?: string | null) {
  const key = safeTrim(stageKey);
  if (key === "roughIn") return "Rough-In";
  if (key === "topOutVent") return "Top-Out / Vent";
  if (key === "trimFinish") return "Trim / Finish";
  if (key === "tm_work") return "T&M Work";
  return key || "Project";
}

function coerceBillingPeriods(input: unknown): ProjectBillingPeriodLite[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry: any) => ({
      id: safeTrim(entry?.id),
      sequence: Number(entry?.sequence || 0),
      label: safeTrim(entry?.label) || undefined,
      status: safeTrim(entry?.status) || undefined,
      readyToBillAt: safeTrim(entry?.readyToBillAt) || undefined,
      readyToBillByUid: safeTrim(entry?.readyToBillByUid) || undefined,
      readyToBillByName: safeTrim(entry?.readyToBillByName) || undefined,
      totalHours: Number(entry?.totalHours || 0),
      materialsCount: Number(entry?.materialsCount || 0),
      tripCount: Number(entry?.tripCount || 0),
      dateFrom: safeTrim(entry?.dateFrom) || undefined,
      dateTo: safeTrim(entry?.dateTo) || undefined,
      invoicedAt: safeTrim(entry?.invoicedAt) || undefined,
      invoiceNumber: safeTrim(entry?.invoiceNumber) || undefined,
      invoiceDate: safeTrim(entry?.invoiceDate) || undefined,
    }))
    .filter((entry) => entry.id);
}

function getReadyBillingPeriod(project: DashboardProjectDoc) {
  const periods = coerceBillingPeriods(project.billingPeriods);
  return (
    periods
      .filter((period) => normalizeStatus(period.status) === "ready_to_bill")
      .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))[0] || null
  );
}

function getReadyStageBilling(project: DashboardProjectDoc) {
  const candidates = [
    { key: "roughIn", label: "Rough-In", stage: project.roughIn },
    { key: "topOutVent", label: "Top-Out / Vent", stage: project.topOutVent },
    { key: "trimFinish", label: "Trim / Finish", stage: project.trimFinish },
  ] as const;

  return (
    candidates
      .filter(
        (candidate) =>
          normalizeStatus(candidate.stage?.billingStatus) === "ready_to_bill",
      )
      .sort((a, b) => {
        const aMs = parseFlexibleDateMs(a.stage?.readyToBillAt) || 0;
        const bMs = parseFlexibleDateMs(b.stage?.readyToBillAt) || 0;
        return aMs - bMs;
      })[0] || null
  );
}

function compareTripSequence(
  a: Pick<ProjectTripDocLite, "id" | "date" | "startTime">,
  b: Pick<ProjectTripDocLite, "id" | "date" | "startTime">,
) {
  const aKey = `${safeTrim(a.date)}_${safeTrim(a.startTime) || "00:00"}_${safeTrim(a.id)}`;
  const bKey = `${safeTrim(b.date)}_${safeTrim(b.startTime) || "00:00"}_${safeTrim(b.id)}`;
  return aKey.localeCompare(bKey);
}

function getFollowUpFlag(trip?: ProjectTripDocLite | null) {
  return safeTrim(trip?.closeout?.needsMoreWork).toLowerCase() === "yes";
}

function getFollowUpWorkSummary(trip?: ProjectTripDocLite | null) {
  return (
    safeTrim(trip?.closeout?.workNotes) ||
    safeTrim(trip?.notes) ||
    "Field reported more work is still needed."
  );
}

function getMaterialsText(trip?: ProjectTripDocLite | null) {
  return (
    safeTrim(trip?.closeout?.materialsUsedToday) ||
    safeTrim(trip?.materialsUsedToday) ||
    safeTrim(trip?.materialsSummary)
  );
}

function parseIsoMs(iso?: string | null) {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

function minutesBetweenMs(aMs: number, bMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.max(0, Math.round((bMs - aMs) / 60000));
}

function sumPausedMinutes(
  pauseBlocks?: PauseBlock[] | null,
  referenceEndMs?: number,
) {
  if (!Array.isArray(pauseBlocks) || pauseBlocks.length === 0) return 0;
  const endMs = Number.isFinite(referenceEndMs)
    ? Number(referenceEndMs)
    : Date.now();

  return pauseBlocks.reduce((sum, block) => {
    const startMs = parseIsoMs(block?.startAt || null);
    const stopMs = block?.endAt ? parseIsoMs(block.endAt) : endMs;
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(stopMs) ||
      stopMs <= startMs
    )
      return sum;
    return sum + minutesBetweenMs(startMs, stopMs);
  }, 0);
}

function getTimerDrivenHoursForTrip(trip?: ProjectTripDocLite | null) {
  if (!trip) return null;
  const startMs = parseIsoMs(trip.actualStartAt || trip.startedAt || null);
  const endMs = parseIsoMs(trip.actualEndAt || trip.completedAt || null);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
    return null;

  const grossMinutes = minutesBetweenMs(startMs, endMs);
  const pausedMinutes = sumPausedMinutes(trip.pauseBlocks || null, endMs);
  const liveMinutes = Math.max(0, grossMinutes - pausedMinutes);
  if (liveMinutes <= 0) return null;

  return Math.round((liveMinutes / 60) * 4) / 4;
}

function getCloseoutHoursForTrip(trip?: ProjectTripDocLite | null) {
  const direct = Number(trip?.closeout?.hoursWorkedToday || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const timerDriven = getTimerDrivenHoursForTrip(trip);
  if (Number.isFinite(timerDriven || NaN) && Number(timerDriven) > 0) {
    return Number(timerDriven);
  }

  return 0;
}

function buildProjectFollowUpItems(
  projects: DashboardProjectDoc[],
  projectTrips: ProjectTripDocLite[],
) {
  const projectMap = new Map<string, DashboardProjectDoc>();
  projects.forEach((project) => projectMap.set(project.id, project));

  const flaggedTripsByProject = new Map<string, ProjectTripDocLite>();

  projectTrips
    .filter((trip) => safeTrim(trip.link?.projectId))
    .filter((trip) => normalizeStatus(trip.status) === "complete")
    .filter((trip) => getFollowUpFlag(trip))
    .forEach((trip) => {
      const projectId = safeTrim(trip.link?.projectId);
      const current = flaggedTripsByProject.get(projectId);
      if (!current) {
        flaggedTripsByProject.set(projectId, trip);
        return;
      }

      const currentStamp =
        parseFlexibleDateMs(current.closeout?.savedAt) ||
        parseFlexibleDateMs(current.completedAt) ||
        parseFlexibleDateMs(current.date) ||
        0;
      const nextStamp =
        parseFlexibleDateMs(trip.closeout?.savedAt) ||
        parseFlexibleDateMs(trip.completedAt) ||
        parseFlexibleDateMs(trip.date) ||
        0;

      if (nextStamp >= currentStamp) {
        flaggedTripsByProject.set(projectId, trip);
      }
    });

  const items: ProjectFollowUpItem[] = [];

  flaggedTripsByProject.forEach((flaggedTrip, projectId) => {
    const project = projectMap.get(projectId);
    if (!project) return;

    const officeStatus = normalizeOfficeStatus(project.projectOfficeStatus);
    const readyBillingPeriod = getReadyBillingPeriod(project);

    // Once a project/stage is field-complete, ready to invoice, invoiced, closed,
    // or has a ready billing period, an older "needs another day" closeout is no longer actionable.
    if (
      officeStatus === "field_complete" ||
      officeStatus === "ready_to_invoice" ||
      officeStatus === "closed" ||
      officeStatus === "invoiced"
    ) {
      return;
    }
    if (project.fieldCompletedAt) return;
    if (readyBillingPeriod) return;

    const laterTrips = projectTrips.filter((trip) => {
      if (safeTrim(trip.link?.projectId) !== projectId) return false;
      if (safeTrim(trip.id) === safeTrim(flaggedTrip.id)) return false;
      if (normalizeStatus(trip.status) === "cancelled") return false;
      return compareTripSequence(trip, flaggedTrip) > 0;
    });

    const hasLaterCompletedWork = laterTrips.some((trip) => {
      const status = normalizeStatus(trip.status);
      const timerState = normalizeStatus(trip.timerState);
      const billingStatus = normalizeStatus(trip.billingPeriodStatus);

      return (
        status === "complete" ||
        status === "completed" ||
        timerState === "complete" ||
        billingStatus === "ready_to_bill" ||
        Boolean(safeTrim(trip.readyToBillAt))
      );
    });

    // Example: a first trip says "needs another day", then Jacob comes back,
    // completes the stage, and marks more work needed = no. That old flag should disappear.
    if (hasLaterCompletedWork) return;

    const hasScheduledReturn = laterTrips.some((trip) => {
      const status = normalizeStatus(trip.status);
      const timerState = normalizeStatus(trip.timerState);

      return (
        [
          "planned",
          "scheduled",
          "assigned",
          "dispatched",
          "in_progress",
          "paused",
        ].includes(status) || ["running", "paused"].includes(timerState)
      );
    });

    items.push({
      projectId,
      href: `/projects/${projectId}`,
      projectName: safeTrim(project.projectName) || "Project",
      customerDisplayName: safeTrim(project.customerDisplayName) || "Customer",
      projectTypeLabel: formatProjectType(project.projectType),
      stageLabel: safeTrim(flaggedTrip.link?.projectStageKey)
        ? stageLabel(flaggedTrip.link?.projectStageKey)
        : safeTrim(project.projectType).toLowerCase() === "time_materials"
          ? "Time + Materials"
          : "Project",
      addressLine: buildInlineAddress(
        project.serviceAddressLine1,
        null,
        project.serviceCity,
        project.serviceState,
        project.servicePostalCode,
      ),
      flaggedTripDate: safeTrim(flaggedTrip.date) || todayIsoLocal(),
      flaggedAt:
        safeTrim(flaggedTrip.closeout?.savedAt) ||
        safeTrim(flaggedTrip.completedAt) ||
        safeTrim(flaggedTrip.updatedAt) ||
        undefined,
      flaggedByName: safeTrim(flaggedTrip.closeout?.savedByName) || "Field",
      workSummary: getFollowUpWorkSummary(flaggedTrip),
      hasScheduledReturn,
      hasLaterCompletedWork,
    });
  });

  return items.sort((a, b) => {
    if (a.hasScheduledReturn !== b.hasScheduledReturn) {
      return a.hasScheduledReturn ? 1 : -1;
    }
    const aMs = parseFlexibleDateMs(a.flaggedAt || a.flaggedTripDate) || 0;
    const bMs = parseFlexibleDateMs(b.flaggedAt || b.flaggedTripDate) || 0;
    return aMs - bMs;
  });
}

function buildReadyInvoiceItems(
  projects: DashboardProjectDoc[],
  projectTrips: ProjectTripDocLite[],
) {
  const items = projects
    .map((project) => {
      const officeStatus = normalizeOfficeStatus(project.projectOfficeStatus);
      if (officeStatus === "closed" || officeStatus === "invoiced") return null;

      const projectType = safeTrim(project.projectType).toLowerCase();
      const isTmProject =
        projectType === "time_materials" ||
        projectType === "time+materials" ||
        projectType === "time_and_materials";
      const isStageBilledProject =
        projectType === "new_construction" || projectType === "remodel";

      const readyPeriod = isTmProject ? getReadyBillingPeriod(project) : null;
      const readyStage = isStageBilledProject
        ? getReadyStageBilling(project)
        : null;

      // Current billing records are the source of truth. Historical trip
      // readyToBillAt timestamps and completed closeouts remain on the trip for
      // audit/history, but must not put an already-invoiced project back into
      // the dashboard queue.
      const isReadyToInvoice = isTmProject
        ? Boolean(readyPeriod)
        : isStageBilledProject
          ? Boolean(readyStage)
          : officeStatus === "ready_to_invoice";

      if (!isReadyToInvoice) return null;

      const relatedTrips = projectTrips.filter(
        (trip) => safeTrim(trip.link?.projectId) === safeTrim(project.id),
      );

      const periodTrips = readyPeriod
        ? relatedTrips.filter(
            (trip) =>
              safeTrim(trip.billingPeriodId) === safeTrim(readyPeriod.id),
          )
        : readyStage
          ? relatedTrips.filter(
              (trip) =>
                safeTrim(trip.link?.projectStageKey) === readyStage.key,
            )
          : relatedTrips.filter(
              (trip) => normalizeStatus(trip.status) === "complete",
            );

      const totalHours = readyPeriod
        ? Number(readyPeriod.totalHours || 0)
        : periodTrips.reduce(
            (sum, trip) => sum + getCloseoutHoursForTrip(trip),
            0,
          );

      const materialsCount = readyPeriod
        ? Number(readyPeriod.materialsCount || 0)
        : periodTrips.reduce(
            (sum, trip) => (getMaterialsText(trip) ? sum + 1 : sum),
            0,
          );

      const tripCount = readyPeriod
        ? Number(readyPeriod.tripCount || 0)
        : periodTrips.length;

      const billingLabel = readyPeriod
        ? safeTrim(readyPeriod.label) || `Billing ${readyPeriod.sequence || 1}`
        : readyStage
          ? readyStage.label
          : "Project Billing";

      return {
        projectId: project.id,
        href: `/projects/${project.id}`,
        billingHref: `/projects/${project.id}#project-billing`,
        projectName: safeTrim(project.projectName) || "Project",
        customerDisplayName:
          safeTrim(project.customerDisplayName) || "Customer",
        projectTypeLabel: formatProjectType(project.projectType),
        billingLabel,
        readyAt:
          safeTrim(readyPeriod?.readyToBillAt) ||
          safeTrim(readyStage?.stage?.readyToBillAt) ||
          safeTrim(project.readyToInvoiceAt) ||
          undefined,
        readyByName:
          safeTrim(readyPeriod?.readyToBillByName) ||
          safeTrim(readyStage?.stage?.readyToBillByName) ||
          safeTrim(project.readyToInvoiceByName) ||
          undefined,
        totalHours,
        materialsCount,
        tripCount,
        invoiceNumber: safeTrim(project.invoiceNumber) || undefined,
      } satisfies ReadyInvoiceProjectItem;
    })
    .filter(Boolean) as ReadyInvoiceProjectItem[];

  return items.sort((a, b) => {
    const aMs = parseFlexibleDateMs(a.readyAt) || 0;
    const bMs = parseFlexibleDateMs(b.readyAt) || 0;
    return aMs - bMs;
  });
}

function buildPendingMaterialOrderItems(
  materialOrders: DashboardMaterialOrderDoc[],
) {
  return materialOrders
    .map((order) => {
      const statusMeta = getPendingMaterialOrderStatus(order);
      if (!statusMeta) return null;

      return {
        id: order.id,
        href: `/material-orders/${order.id}`,
        customerDisplayName: safeTrim(order.customerDisplayName) || "Customer",
        requestSummary: safeTrim(order.requestSummary) || "Material Order",
        statusLabel: statusMeta.label,
        statusTone: statusMeta.tone,
        urgencyRank: statusMeta.rank,
        updatedAt:
          safeTrim(order.updatedAt) || safeTrim(order.createdAt) || undefined,
      } satisfies PendingMaterialOrderItem;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const left = a as PendingMaterialOrderItem;
      const right = b as PendingMaterialOrderItem;

      if (left.urgencyRank !== right.urgencyRank) {
        return left.urgencyRank - right.urgencyRank;
      }

      const aMs = parseFlexibleDateMs(left.updatedAt) || 0;
      const bMs = parseFlexibleDateMs(right.updatedAt) || 0;
      return bMs - aMs;
    }) as PendingMaterialOrderItem[];
}

function getFieldStatusMeta(
  status?: string | null,
  timerState?: string | null,
) {
  const normalized = normalizeStatus(status);
  const normalizedTimer = normalizeStatus(timerState);

  if (normalized === "paused" || normalizedTimer === "paused") {
    return {
      label: "Paused",
      color: "warning" as const,
      icon: <PauseCircleRoundedIcon sx={{ fontSize: 14 }} />,
    };
  }

  if (
    normalized === "dispatched" ||
    normalized === "assigned" ||
    normalized === "on_site"
  ) {
    return {
      label: "Assigned Today",
      color: "info" as const,
      icon: <AssignmentRoundedIcon sx={{ fontSize: 14 }} />,
    };
  }

  return {
    label: "In Progress",
    color: "success" as const,
    icon: <PlayCircleRoundedIcon sx={{ fontSize: 14 }} />,
  };
}

function SectionCard({
  title,
  subtitle,
  icon,
  count,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  accent: "primary" | "warning" | "neutral" | "success";
  children: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1.2,
        border: (theme) =>
          `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2, md: 2.5 },
          "&:last-child": { pb: { xs: 2, md: 2.5 } },
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={2}
          >
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={(theme) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor:
                    accent === "warning"
                      ? alpha(theme.palette.warning.main, 0.14)
                      : accent === "primary"
                        ? alpha(theme.palette.primary.main, 0.14)
                        : accent === "success"
                          ? alpha(theme.palette.success.main, 0.14)
                          : alpha(theme.palette.text.primary, 0.08),
                  color:
                    accent === "warning"
                      ? theme.palette.warning.main
                      : accent === "primary"
                        ? theme.palette.primary.main
                        : accent === "success"
                          ? theme.palette.success.main
                          : theme.palette.text.primary,
                })}
              >
                {icon}
              </Box>

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              </Box>
            </Stack>

            <Chip
              size="small"
              label={count}
              color={accent === "neutral" ? "default" : accent}
              variant={accent === "neutral" ? "outlined" : "filled"}
              sx={{ fontWeight: 800, minWidth: 36 }}
            />
          </Stack>

          <Divider />
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function TicketRow({
  item,
  mode,
}: {
  item: DashboardTicketItem;
  mode: "follow_up" | "review";
}) {
  const address = [
    safeTrim(item.serviceAddressLine1),
    safeTrim(item.serviceCity),
    safeTrim(item.serviceState),
  ]
    .filter(Boolean)
    .join(", ");
  const assignedPeople = [
    safeTrim(item.assignedTechnicianName),
    safeTrim(item.assignedHelperName),
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <Box sx={{ py: 1.5 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {item.customerDisplayName || "Customer"}
            </Typography>

            <Chip
              size="small"
              label={mode === "review" ? "Needs Review" : "Follow-Up"}
              color={mode === "review" ? "primary" : "warning"}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>

          <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 600 }}>
            {item.issueSummary || "Service Ticket"}
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 0.85 }}
          >
            {address ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PlaceRoundedIcon
                  sx={{ fontSize: 16, color: "text.secondary" }}
                />
                <Typography variant="body2" color="text.secondary">
                  {address}
                </Typography>
              </Stack>
            ) : null}

            {assignedPeople ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PersonRoundedIcon
                  sx={{ fontSize: 16, color: "text.secondary" }}
                />
                <Typography variant="body2" color="text.secondary">
                  {assignedPeople}
                </Typography>
              </Stack>
            ) : null}

            <Stack direction="row" spacing={0.5} alignItems="center">
              <AccessTimeRoundedIcon
                sx={{ fontSize: 16, color: "text.secondary" }}
              />
              <Typography variant="body2" color="text.secondary">
                {mode === "review"
                  ? `Ready ${formatWhen(item.readyToBillAt || item.updatedAt)}`
                  : `Updated ${formatWhen(item.updatedAt)}`}
              </Typography>
            </Stack>
          </Stack>
        </Box>

        <Button
          component={Link}
          href={`/service-tickets/${item.id}`}
          variant={mode === "review" ? "contained" : "outlined"}
          color={mode === "review" ? "primary" : "warning"}
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ borderRadius: 999, flexShrink: 0 }}
        >
          Open Ticket
        </Button>
      </Stack>
    </Box>
  );
}

function ProjectFollowUpRow({ item }: { item: ProjectFollowUpItem }) {
  return (
    <Box sx={{ py: 1.25 }}>
      <Stack spacing={1.1}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.2}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={800} noWrap>
              {item.projectName}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {item.customerDisplayName}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label="Needs Another Day"
              color="warning"
              variant="filled"
              sx={{ fontWeight: 800 }}
            />
            <Chip
              size="small"
              label={item.hasScheduledReturn ? "Scheduled" : "Unscheduled"}
              color={item.hasScheduledReturn ? "success" : "warning"}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            icon={<ConstructionRoundedIcon sx={{ fontSize: 14 }} />}
            label={`${item.projectTypeLabel} • ${item.stageLabel}`}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
          <Chip
            size="small"
            icon={<AccessTimeRoundedIcon sx={{ fontSize: 14 }} />}
            label={`Flagged ${formatDateOnly(item.flaggedAt || item.flaggedTripDate)} by ${item.flaggedByName}`}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {item.workSummary}
        </Typography>

        {item.addressLine ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <PlaceRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              {item.addressLine}
            </Typography>
          </Stack>
        ) : null}

        <Button
          component={Link}
          href={item.href}
          variant="outlined"
          color="warning"
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ borderRadius: 999, alignSelf: "flex-start" }}
        >
          Open Project
        </Button>
      </Stack>
    </Box>
  );
}

function ReadyInvoiceProjectRow({ item }: { item: ReadyInvoiceProjectItem }) {
  return (
    <Box sx={{ py: 1.25 }}>
      <Stack spacing={1.1}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.2}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={800} noWrap>
              {item.projectName}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {item.customerDisplayName}
            </Typography>
          </Box>

          <Chip
            size="small"
            label="Ready to Invoice"
            color="success"
            variant="filled"
            sx={{ fontWeight: 800 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            icon={<ConstructionRoundedIcon sx={{ fontSize: 14 }} />}
            label={`${item.projectTypeLabel} • ${item.billingLabel}`}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
          <Chip
            size="small"
            icon={<AccessTimeRoundedIcon sx={{ fontSize: 14 }} />}
            label={`Ready ${formatDateOnly(item.readyAt)}${item.readyByName ? ` by ${item.readyByName}` : ""}`}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={`${item.totalHours.toFixed(2)} hrs`}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
          <Chip
            size="small"
            label={`${item.tripCount} trip${item.tripCount === 1 ? "" : "s"}`}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
          <Chip
            size="small"
            label={
              item.materialsCount > 0
                ? `${item.materialsCount} material note${item.materialsCount === 1 ? "" : "s"}`
                : "No materials"
            }
            color={item.materialsCount > 0 ? "warning" : "default"}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
          {item.invoiceNumber ? (
            <Chip
              size="small"
              label={`Invoice #${item.invoiceNumber}`}
              color="success"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          ) : null}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            component={Link}
            href={item.billingHref}
            variant="contained"
            color="success"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{ borderRadius: 999, boxShadow: "none" }}
          >
            Open Billing
          </Button>
          <Button
            component={Link}
            href={item.href}
            variant="outlined"
            color="success"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{ borderRadius: 999 }}
          >
            Open Project
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function PendingMaterialOrderRow({ item }: { item: PendingMaterialOrderItem }) {
  return (
    <Box sx={{ py: 1.25 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.2}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Typography variant="subtitle1" fontWeight={800} noWrap>
              {item.customerDisplayName}
            </Typography>

            <Chip
              size="small"
              label={item.statusLabel}
              color={item.statusTone}
              variant={item.statusTone === "default" ? "outlined" : "filled"}
              sx={{ fontWeight: 800 }}
            />
          </Stack>

          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ mt: 0.35 }}
          >
            {item.requestSummary}
          </Typography>
        </Box>

        <Button
          component={Link}
          href={item.href}
          variant="outlined"
          color="primary"
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ borderRadius: 999, flexShrink: 0 }}
        >
          Open Order
        </Button>
      </Stack>
    </Box>
  );
}

function ActiveWorkRow({ item }: { item: ActiveWorkItem }) {
  const statusMeta = getFieldStatusMeta(item.status, item.timerState);
  const address = buildAddress(item);
  const assignedPeople = buildAssignedPeople(item);

  return (
    <Box
      sx={{
        borderRadius: 1.2,
        border: (theme) =>
          `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: (theme) => alpha(theme.palette.common.white, 0.02),
        px: 1.5,
        py: 1.5,
      }}
    >
      <Stack spacing={1.2}>
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          spacing={1.5}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
            >
              <Typography variant="subtitle2" fontWeight={800}>
                {item.title ||
                  (item.itemType === "project"
                    ? "Active Project Trip"
                    : "Active Service Ticket")}
              </Typography>

              {item.pinNumber ? (
                <Chip
                  size="small"
                  label={`Pin ${item.pinNumber}`}
                  color="primary"
                  variant="filled"
                  sx={{ fontWeight: 900 }}
                />
              ) : null}

              <Chip
                size="small"
                icon={
                  item.itemType === "project" ? (
                    <ConstructionRoundedIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <PlumbingRoundedIcon sx={{ fontSize: 14 }} />
                  )
                }
                label={item.itemType === "project" ? "Project" : "Service"}
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            </Stack>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.25 }}
            >
              {item.subtitle ||
                (item.itemType === "project" ? "Project" : "Customer")}
            </Typography>
          </Box>

          <Chip
            size="small"
            icon={statusMeta.icon}
            label={statusMeta.label}
            color={statusMeta.color}
            variant="outlined"
            sx={{ fontWeight: 700, flexShrink: 0 }}
          />
        </Stack>

        <Stack spacing={0.8}>
          {assignedPeople ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <EngineeringRoundedIcon
                sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }}
              />
              <Typography variant="body2" color="text.secondary">
                <Box
                  component="span"
                  sx={{ fontWeight: 700, color: "text.primary" }}
                >
                  Crew:
                </Box>{" "}
                {assignedPeople}
              </Typography>
            </Stack>
          ) : null}

          {address ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <PlaceRoundedIcon
                sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }}
              />
              <Typography variant="body2" color="text.secondary">
                <Box
                  component="span"
                  sx={{ fontWeight: 700, color: "text.primary" }}
                >
                  Address:
                </Box>{" "}
                {address}
              </Typography>
            </Stack>
          ) : null}

          <Stack direction="row" spacing={0.75} alignItems="flex-start">
            <AccessTimeRoundedIcon
              sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }}
            />
            <Typography variant="body2" color="text.secondary">
              <Box
                component="span"
                sx={{ fontWeight: 700, color: "text.primary" }}
              >
                Updated:
              </Box>{" "}
              {formatWhen(item.updatedAt)}
            </Typography>
          </Stack>
        </Stack>

        <Button
          component={Link}
          href={item.href}
          variant="text"
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{
            alignSelf: "flex-start",
            px: 0,
            minWidth: 0,
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          {item.itemType === "project" ? "Open Project" : "Open Ticket"}
        </Button>
      </Stack>
    </Box>
  );
}

function escapeMapHtml(value: unknown) {
  return safeTrim(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getInteractiveMapInfoHtml(item: ActiveWorkItem) {
  const pin = item.pinNumber ? `Pin ${item.pinNumber}` : "Active Job";
  const title = safeTrim(item.title) || "Active Field Work";
  const subtitle = safeTrim(item.subtitle);
  const address = buildAddress(item);
  const crew = buildAssignedPeople(item);
  const openLabel =
    item.itemType === "project" ? "Open Project" : "Open Ticket";

  return `
    <div style="font-family: Roboto, Arial, sans-serif; min-width: 220px; max-width: 300px; color: #111827;">
      <div style="font-size: 11px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px;">${escapeMapHtml(pin)}</div>
      <div style="font-size: 15px; font-weight: 900; line-height: 1.2; margin-bottom: 4px;">${escapeMapHtml(title)}</div>
      ${subtitle ? `<div style="font-size: 13px; margin-bottom: 8px; color: #374151;">${escapeMapHtml(subtitle)}</div>` : ""}
      ${crew ? `<div style="font-size: 12px; margin-bottom: 5px;"><strong>Crew:</strong> ${escapeMapHtml(crew)}</div>` : ""}
      ${address ? `<div style="font-size: 12px; margin-bottom: 10px;"><strong>Address:</strong> ${escapeMapHtml(address)}</div>` : ""}
      <a href="${escapeMapHtml(item.href)}" style="display: inline-flex; align-items: center; border-radius: 999px; background: #2563eb; color: white; font-size: 12px; font-weight: 800; padding: 7px 10px; text-decoration: none;">${escapeMapHtml(openLabel)}</a>
    </div>
  `;
}

function InteractiveLiveFieldMap({ items }: { items: ActiveWorkItem[] }) {
  const theme = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const positionsRef = useRef<Map<string, any>>(new Map());
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapError, setMapError] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>(
    items[0]?.id || "",
  );

  const apiKey = safeTrim(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const itemKey = useMemo(
    () =>
      items
        .map(
          (item) => `${item.id}:${item.pinNumber || ""}:${buildAddress(item)}`,
        )
        .join("|"),
    [items],
  );

  const openInfoWindow = (item: ActiveWorkItem) => {
    const googleMaps = window.google?.maps;
    const marker = markersRef.current.get(item.id);
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;

    if (!googleMaps || !marker || !map || !infoWindow) return;

    const position =
      positionsRef.current.get(item.id) || marker.getPosition?.();
    if (position) {
      map.panTo(position);
      const currentZoom = Number(map.getZoom?.() || 0);
      if (!Number.isFinite(currentZoom) || currentZoom < 12) {
        map.setZoom(12);
      }
    }

    infoWindow.setContent(getInteractiveMapInfoHtml(item));
    infoWindow.open({ map, anchor: marker });
    setSelectedItemId(item.id);
  };

  useEffect(() => {
    setSelectedItemId((current) => current || items[0]?.id || "");
  }, [items]);

  useEffect(() => {
    let cancelled = false;

    async function setupMap() {
      if (!apiKey) {
        setMapStatus("error");
        setMapError("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
        return;
      }

      if (!mapContainerRef.current) return;

      setMapStatus("loading");
      setMapError("");

      try {
        await loadGoogleMapsScript(apiKey);
        if (cancelled || !mapContainerRef.current) return;

        const googleMaps = window.google?.maps;
        if (!googleMaps) {
          throw new Error("Google Maps JavaScript API did not initialize.");
        }

        if (!mapRef.current) {
          mapRef.current = new googleMaps.Map(mapContainerRef.current, {
            center: { lat: 29.9055, lng: -96.8766 },
            zoom: 10,
            mapTypeControl: false,
            fullscreenControl: true,
            streetViewControl: false,
            clickableIcons: false,
          });
          geocoderRef.current = new googleMaps.Geocoder();
          infoWindowRef.current = new googleMaps.InfoWindow();
        }

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current.clear();
        positionsRef.current.clear();

        const geocoder = geocoderRef.current;
        const map = mapRef.current;
        const bounds = new googleMaps.LatLngBounds();
        const geocodedItems: ActiveWorkItem[] = [];

        for (const item of items) {
          const address = buildAddress(item);
          if (!address) continue;

          try {
            const result = await new Promise<any>((resolve, reject) => {
              geocoder.geocode(
                { address },
                (results: any[], status: string) => {
                  if (status === "OK" && results?.[0]) {
                    resolve(results[0]);
                    return;
                  }
                  reject(new Error(status || "GEOCODE_FAILED"));
                },
              );
            });

            if (cancelled) return;

            const position = result.geometry.location;
            const marker = new googleMaps.Marker({
              map,
              position,
              label: String(item.pinNumber || geocodedItems.length + 1),
              title: getMapItemLabel(item),
              animation: googleMaps.Animation.DROP,
            });

            marker.addListener("click", () => openInfoWindow(item));
            markersRef.current.set(item.id, marker);
            positionsRef.current.set(item.id, position);
            bounds.extend(position);
            geocodedItems.push(item);
          } catch (err) {
            console.warn(
              "Failed to geocode active field address",
              address,
              err,
            );
          }
        }

        if (geocodedItems.length === 0) {
          throw new Error(
            "No active field addresses could be placed on the interactive map.",
          );
        }

        if (geocodedItems.length === 1) {
          const onlyPosition = positionsRef.current.get(geocodedItems[0].id);
          map.setCenter(onlyPosition);
          map.setZoom(12);
        } else {
          map.fitBounds(bounds, 72);
        }

        window.setTimeout(() => {
          if (cancelled) return;
          googleMaps.event.trigger(map, "resize");
          if (geocodedItems.length > 1) {
            map.fitBounds(bounds, 72);
          }
        }, 120);

        setMapStatus("ready");

        const selected =
          geocodedItems.find((item) => item.id === selectedItemId) ||
          geocodedItems[0];
        if (selected) {
          window.setTimeout(() => openInfoWindow(selected), 275);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setMapStatus("error");
        setMapError(
          err instanceof Error
            ? err.message
            : "Failed to load interactive map.",
        );
      }
    }

    void setupMap();

    return () => {
      cancelled = true;
    };
  }, [apiKey, itemKey]);

  return (
    <Stack spacing={1.25}>
      <Box
        sx={{
          position: "relative",
          borderRadius: 1.2,
          overflow: "hidden",
          border: `1px solid ${alpha(theme.palette.common.white, 0.1)}`,
          backgroundColor: alpha(theme.palette.common.white, 0.03),
          minHeight: { xs: 320, sm: 390, md: 460 },
        }}
      >
        <Box
          ref={mapContainerRef}
          sx={{
            width: "100%",
            minHeight: { xs: 320, sm: 390, md: 460 },
            "& .gm-style-iw button": {
              display: "flex !important",
            },
          }}
        />

        {mapStatus === "loading" ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              backgroundColor: alpha(theme.palette.background.paper, 0.72),
              backdropFilter: "blur(3px)",
            }}
          >
            <Stack spacing={1} alignItems="center">
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Loading interactive crew map…
              </Typography>
            </Stack>
          </Box>
        ) : null}
      </Box>

      {mapStatus === "error" ? (
        <Alert severity="warning" variant="outlined" sx={{ borderRadius: 3 }}>
          {mapError || "The interactive map could not load."} Make sure the same
          API key has Maps JavaScript API enabled.
        </Alert>
      ) : null}

      {items.length > 0 ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {items.map((item) => (
            <Chip
              key={`interactive_pin_legend_${item.id}`}
              clickable
              size="small"
              color={selectedItemId === item.id ? "primary" : "default"}
              variant={selectedItemId === item.id ? "filled" : "outlined"}
              onClick={() => openInfoWindow(item)}
              label={`${item.pinNumber || "—"} · ${getMapItemLabel(item)}`}
              sx={{
                borderRadius: 999,
                fontWeight: 800,
                maxWidth: "100%",
                "& .MuiChip-label": {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              }}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function AreaSnapshotCard({ activeItems }: { activeItems: ActiveWorkItem[] }) {
  const theme = useTheme();
  const [mapOpen, setMapOpen] = useState(false);

  const visibleFieldItems = useMemo(
    () => withPinNumbers(activeItems).filter((item) => Boolean(item.pinNumber)),
    [activeItems],
  );
  const mapUrl = useMemo(
    () => buildStaticMapUrl(visibleFieldItems),
    [visibleFieldItems],
  );

  return (
    <>
      <Box
        sx={{
          borderRadius: 1.2,
          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
          overflow: "hidden",
          backgroundColor: alpha(theme.palette.common.white, 0.03),
        }}
      >
        {mapUrl ? (
          <Box sx={{ position: "relative" }}>
            <Box
              component="img"
              src={mapUrl}
              alt="Active field work area snapshot"
              sx={{
                display: "block",
                width: "100%",
                aspectRatio: "640 / 300",
                height: "auto",
                objectFit: "contain",
                backgroundColor: "#d8ead7",
              }}
            />

            <Box
              sx={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(180deg, ${alpha(theme.palette.common.black, 0.12)} 0%, ${alpha(
                  theme.palette.common.black,
                  0,
                )} 38%, ${alpha(theme.palette.common.black, 0.16)} 100%)`,
                pointerEvents: "none",
              }}
            />

            <Tooltip title="Expand live field map">
              <IconButton
                size="small"
                onClick={() => setMapOpen(true)}
                aria-label="Expand live field map"
                sx={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 34,
                  height: 34,
                  color: "text.primary",
                  backgroundColor: alpha(theme.palette.background.paper, 0.82),
                  border: `1px solid ${alpha(theme.palette.common.white, 0.14)}`,
                  backdropFilter: "blur(8px)",
                  "&:hover": {
                    backgroundColor: alpha(theme.palette.primary.main, 0.22),
                    borderColor: alpha(theme.palette.primary.main, 0.45),
                  },
                }}
              >
                <OpenInFullRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box
            sx={{
              height: 180,
              display: "grid",
              placeItems: "center",
              px: 2,
              textAlign: "center",
            }}
          >
            <Stack spacing={1} alignItems="center">
              <MyLocationRoundedIcon sx={{ color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                Add a Google Maps API key and active field addresses to show the
                live area snapshot.
              </Typography>
            </Stack>
          </Box>
        )}
      </Box>

      <Dialog
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            borderRadius: 1.4,
            border: `1px solid ${alpha(theme.palette.common.white, 0.1)}`,
            backgroundImage: "none",
            backgroundColor: "background.paper",
            overflow: "hidden",
          },
        }}
        BackdropProps={{
          sx: {
            backgroundColor: alpha(theme.palette.common.black, 0.72),
            backdropFilter: "blur(4px)",
          },
        }}
      >
        <DialogTitle
          sx={{
            px: { xs: 2, md: 3 },
            pt: { xs: 2, md: 2.5 },
            pb: 1.5,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="flex-start"
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: 2.2,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: alpha(theme.palette.primary.main, 0.14),
                  color: theme.palette.primary.main,
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                }}
              >
                <MyLocationRoundedIcon />
              </Box>

              <Box>
                <Typography
                  variant="h6"
                  fontWeight={900}
                  sx={{ letterSpacing: "-0.02em" }}
                >
                  Live Field Work Map
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.25 }}
                >
                  Real-time view of active crews and project trips in the field.
                </Typography>
              </Box>
            </Stack>

            <Tooltip title="Close">
              <IconButton
                onClick={() => setMapOpen(false)}
                aria-label="Close live field map"
                sx={{
                  color: "text.secondary",
                  border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                  "&:hover": {
                    color: "text.primary",
                    backgroundColor: alpha(theme.palette.common.white, 0.06),
                  },
                }}
              >
                <CloseRoundedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>

        <DialogContent
          sx={{
            px: { xs: 2, md: 3 },
            pb: { xs: 2, md: 3 },
          }}
        >
          <Stack spacing={2}>
            {visibleFieldItems.length > 0 ? (
              <InteractiveLiveFieldMap items={visibleFieldItems} />
            ) : (
              <Alert
                severity="info"
                variant="outlined"
                sx={{ borderRadius: 3 }}
              >
                The expanded map will appear once a Google Maps API key and
                active field addresses are available.
              </Alert>
            )}

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1.5}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={900}>
                  Active Crews
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Crew details shown from the same live field work feed used by
                  the dashboard card.
                </Typography>
              </Box>

              <Chip
                size="small"
                label={`${activeItems.length} crew${activeItems.length === 1 ? "" : "s"}`}
                color={activeItems.length > 0 ? "primary" : "default"}
                variant={activeItems.length > 0 ? "filled" : "outlined"}
                sx={{ fontWeight: 800, flexShrink: 0 }}
              />
            </Stack>

            {activeItems.length === 0 ? (
              <Alert
                severity="info"
                variant="outlined"
                sx={{ borderRadius: 3 }}
              >
                No active field work is showing right now.
              </Alert>
            ) : (
              <Stack spacing={1.25}>
                {activeItems.map((item) => (
                  <ActiveWorkRow key={`modal_${item.id}`} item={item} />
                ))}
              </Stack>
            )}

            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="outlined"
                onClick={() => setMapOpen(false)}
                sx={{ borderRadius: 999 }}
              >
                Close
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LiveFieldWorkSection({
  activeItems,
}: {
  activeItems: ActiveWorkItem[];
}) {
  const pinnedActiveItems = useMemo(
    () => withPinNumbers(activeItems),
    [activeItems],
  );

  return (
    <SectionCard
      title="Live Field Work"
      subtitle="Compact visibility into active service and project trips and who is assigned in the field."
      icon={<MyLocationRoundedIcon />}
      count={activeItems.length}
      accent="neutral"
    >
      <Stack spacing={1.25}>
        {activeItems.length === 0 ? (
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
            No active field work is showing right now.
          </Alert>
        ) : (
          <>
            <AreaSnapshotCard activeItems={pinnedActiveItems} />

            <Stack spacing={1.25}>
              {pinnedActiveItems.map((item) => (
                <ActiveWorkRow key={item.id} item={item} />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </SectionCard>
  );
}

function MyStaffHoursSection({
  items,
  confirmingId,
  message,
  error,
  onConfirm,
  onEditActual,
}: {
  items: DashboardStaffCoverageItem[];
  confirmingId: string;
  message: string;
  error: string;
  onConfirm: (item: DashboardStaffCoverageItem) => void;
  onEditActual: (item: DashboardStaffCoverageItem) => void;
}) {
  const unconfirmedCount = items.filter(
    (item) => !item.confirmedAt && item.status !== "completed",
  ).length;

  return (
    <SectionCard
      title="My Staff Hours"
      subtitle="Review and confirm scheduled office, dispatch, billing, or admin coverage."
      icon={<SupportAgentRoundedIcon />}
      count={unconfirmedCount}
      accent={unconfirmedCount > 0 ? "primary" : "success"}
    >
      <Stack spacing={1.25}>
        {error ? (
          <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
            {error}
          </Alert>
        ) : null}

        {message ? (
          <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
            {message}
          </Alert>
        ) : null}

        {items.length === 0 ? (
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
            No staff coverage is currently scheduled for you.
          </Alert>
        ) : (
          <Stack spacing={1.25}>
            {items.map((item) => {
              const confirmed =
                Boolean(item.confirmedAt) || item.status === "completed";
              const isToday = item.date === todayIsoLocal();
              const quickConfirmAvailable = canQuickConfirmStaffCoverage(item);

              return (
                <Box
                  key={item.id}
                  sx={{
                    borderRadius: 1.2,
                    border: (theme) =>
                      `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                    backgroundColor: (theme) =>
                      alpha(theme.palette.common.white, 0.02),
                    px: 1.5,
                    py: 1.5,
                  }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.25}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Typography variant="subtitle2" fontWeight={900}>
                          {labelForStaffWorkType(item.workType)}
                        </Typography>

                        <Chip
                          size="small"
                          label={confirmed ? "Confirmed" : "Needs Confirmation"}
                          color={confirmed ? "success" : "warning"}
                          variant={confirmed ? "filled" : "outlined"}
                          sx={{ fontWeight: 800 }}
                        />
                      </Stack>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {item.date} • {formatTime12h(item.startTime)}–
                        {formatTime12h(item.endTime)} •{" "}
                        {item.scheduledHours.toFixed(2)} paid hrs
                        {` • ${buildUnpaidTimeSummary(
                          item.unpaidBreakMinutes,
                          item.unpaidTimeBlocks,
                          item.lunchStartAt,
                          item.lunchEndAt,
                        )}`}
                      </Typography>

                      {isToday && !quickConfirmAvailable ? (
                        <Typography
                          variant="body2"
                          color="info.main"
                          sx={{ mt: 0.65, fontWeight: 700 }}
                        >
                          Today’s shift is available now. Use Edit Actual when
                          you finish for the day; one-click confirmation unlocks
                          after {formatTime12h(item.endTime)}.
                        </Typography>
                      ) : null}

                      {item.notes ? (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          {item.notes}
                        </Typography>
                      ) : null}
                    </Box>

                    {!confirmed ? (
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{ flexShrink: 0 }}
                      >
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => onEditActual(item)}
                          disabled={confirmingId === item.id}
                          sx={{ borderRadius: 999 }}
                        >
                          Edit Actual
                        </Button>
                        <Tooltip
                          title={
                            quickConfirmAvailable
                              ? "Confirm the scheduled shift as shown"
                              : `Available after ${formatTime12h(
                                  item.endTime,
                                )}; use Edit Actual to finish earlier`
                          }
                        >
                          <span>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => onConfirm(item)}
                              disabled={
                                confirmingId === item.id ||
                                !quickConfirmAvailable
                              }
                              sx={{ borderRadius: 999 }}
                            >
                              {confirmingId === item.id
                                ? "Confirming..."
                                : quickConfirmAvailable
                                  ? "Confirm Hours"
                                  : "Confirm After Shift"}
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    ) : (
                      <Button
                        component={Link}
                        href="/weekly-timesheet"
                        variant="outlined"
                        size="small"
                        sx={{ borderRadius: 999, flexShrink: 0 }}
                      >
                        Review Timesheet
                      </Button>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Stack>
    </SectionCard>
  );
}

export default function DashboardPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [reviewTickets, setReviewTickets] = useState<DashboardTicketItem[]>([]);
  const [followUpTickets, setFollowUpTickets] = useState<DashboardTicketItem[]>(
    [],
  );
  const [activeItems, setActiveItems] = useState<ActiveWorkItem[]>([]);
  const [dashboardProjects, setDashboardProjects] = useState<
    DashboardProjectDoc[]
  >([]);
  const [dashboardProjectTrips, setDashboardProjectTrips] = useState<
    ProjectTripDocLite[]
  >([]);
  const [dashboardMaterialOrders, setDashboardMaterialOrders] = useState<
    DashboardMaterialOrderDoc[]
  >([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [myStaffCoverage, setMyStaffCoverage] = useState<
    DashboardStaffCoverageItem[]
  >([]);
  const [confirmingStaffCoverageId, setConfirmingStaffCoverageId] =
    useState("");
  const [staffCoverageMessage, setStaffCoverageMessage] = useState("");
  const [staffCoverageError, setStaffCoverageError] = useState("");
  const [staffEditItem, setStaffEditItem] =
    useState<DashboardStaffCoverageItem | null>(null);
  const [staffEditStartTime, setStaffEditStartTime] = useState("08:00");
  const [staffEditEndTime, setStaffEditEndTime] = useState("17:00");
  const [staffEditUnpaidTimeBlocks, setStaffEditUnpaidTimeBlocks] = useState<
    StaffUnpaidTimeBlockDraft[]
  >([]);
  const [staffEditNote, setStaffEditNote] = useState("");
  const [savingStaffEdit, setSavingStaffEdit] = useState(false);

  useEffect(() => {
    setDashboardLoading(true);

    const unsubFollowUp = onSnapshot(
      query(
        collection(db, "serviceTickets"),
        where("status", "==", "follow_up"),
        limit(50),
      ),
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName:
                safeTrim(data.customerDisplayName) || "Customer",
              issueSummary: safeTrim(data.issueSummary) || "Service Ticket",
              serviceAddressLine1:
                safeTrim(data.serviceAddressLine1) || undefined,
              serviceCity: safeTrim(data.serviceCity) || undefined,
              serviceState: safeTrim(data.serviceState) || undefined,
              updatedAt: safeTrim(data.updatedAt) || undefined,
              assignedTechnicianName:
                safeTrim(data.assignedTechnicianName) || undefined,
              assignedHelperName:
                safeTrim(data.assignedHelperName) || undefined,
              status: safeTrim(data.status) || undefined,
            } satisfies DashboardTicketItem;
          })
          .sort(ticketSort);
        setFollowUpTickets(items);
      },
      () => setFollowUpTickets([]),
    );

    const unsubReview = onSnapshot(
      query(
        collection(db, "serviceTickets"),
        where("billing.status", "==", "ready_to_bill"),
        limit(50),
      ),
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName:
                safeTrim(data.customerDisplayName) || "Customer",
              issueSummary: safeTrim(data.issueSummary) || "Service Ticket",
              serviceAddressLine1:
                safeTrim(data.serviceAddressLine1) || undefined,
              serviceCity: safeTrim(data.serviceCity) || undefined,
              serviceState: safeTrim(data.serviceState) || undefined,
              updatedAt: safeTrim(data.updatedAt) || undefined,
              readyToBillAt: safeTrim(data.billing?.readyToBillAt) || undefined,
              assignedTechnicianName:
                safeTrim(data.assignedTechnicianName) || undefined,
              assignedHelperName:
                safeTrim(data.assignedHelperName) || undefined,
              status: safeTrim(data.status) || undefined,
            } satisfies DashboardTicketItem;
          })
          .sort(ticketSort);
        setReviewTickets(items);
      },
      () => setReviewTickets([]),
    );

    const unsubMaterialOrders = onSnapshot(
      query(collection(db, "materialOrders"), limit(200)),
      (snap) => {
        const items = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            id: docSnap.id,
            materialOrderCode: safeTrim(data.materialOrderCode) || undefined,
            customerDisplayName:
              safeTrim(data.customerDisplayName) || "Customer",
            contactName: safeTrim(data.contactName) || undefined,
            contactPhone: safeTrim(data.contactPhone) || undefined,
            requestSummary: safeTrim(data.requestSummary) || "Material Order",
            status: safeTrim(data.status) || undefined,
            targetPickupDate: safeTrim(data.targetPickupDate) || undefined,
            pickup: data.pickup ?? null,
            billing: data.billing ?? null,
            poNumbers: Array.isArray(data.poNumbers) ? data.poNumbers : [],
            purchaseOrders: Array.isArray(data.purchaseOrders)
              ? data.purchaseOrders
              : [],
            supplierInvoices: Array.isArray(data.supplierInvoices)
              ? data.supplierInvoices
              : [],
            supplierCostTotal:
              typeof data.supplierCostTotal === "number"
                ? data.supplierCostTotal
                : null,
            customerPriceTotal:
              typeof data.customerPriceTotal === "number"
                ? data.customerPriceTotal
                : null,
            createdAt: safeTrim(data.createdAt) || undefined,
            updatedAt: safeTrim(data.updatedAt) || undefined,
          } satisfies DashboardMaterialOrderDoc;
        });

        setDashboardMaterialOrders(items);
      },
      () => setDashboardMaterialOrders([]),
    );

    const unsubProjects = onSnapshot(
      query(collection(db, "projects"), limit(300)),
      (snap) => {
        const items = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            active: typeof data.active === "boolean" ? data.active : true,
            projectName: safeTrim(data.projectName) || "Project",
            customerDisplayName:
              safeTrim(data.customerDisplayName) || "Customer",
            projectType: safeTrim(data.projectType) || "other",
            serviceAddressLine1:
              safeTrim(data.serviceAddressLine1) || undefined,
            serviceCity: safeTrim(data.serviceCity) || undefined,
            serviceState: safeTrim(data.serviceState) || undefined,
            servicePostalCode: safeTrim(data.servicePostalCode) || undefined,
            projectOfficeStatus:
              safeTrim(data.projectOfficeStatus) || undefined,
            fieldCompletedAt: safeTrim(data.fieldCompletedAt) || undefined,
            readyToInvoiceAt: safeTrim(data.readyToInvoiceAt) || undefined,
            readyToInvoiceByName:
              safeTrim(data.readyToInvoiceByName) || undefined,
            currentBillingPeriodId:
              safeTrim(data.currentBillingPeriodId) || undefined,
            billingPeriods: coerceBillingPeriods(data.billingPeriods),
            roughIn: data.roughIn ?? null,
            topOutVent: data.topOutVent ?? null,
            trimFinish: data.trimFinish ?? null,
            invoiceNumber: safeTrim(data.invoiceNumber) || undefined,
          } satisfies DashboardProjectDoc;
        });
        setDashboardProjects(items);
      },
      () => setDashboardProjects([]),
    );

    const unsubProjectTrips = onSnapshot(
      query(
        collection(db, "trips"),
        where("type", "==", "project"),
        limit(1000),
      ),
      (snap) => {
        const items = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            active: typeof data.active === "boolean" ? data.active : true,
            type: data.type ?? "project",
            status: safeTrim(data.status) || undefined,
            timerState: safeTrim(data.timerState) || undefined,
            date: safeTrim(data.date) || undefined,
            timeWindow: safeTrim(data.timeWindow) || undefined,
            startTime: safeTrim(data.startTime) || undefined,
            endTime: safeTrim(data.endTime) || undefined,
            updatedAt: safeTrim(data.updatedAt) || undefined,
            crew: data.crew ?? null,
            crewConfirmed: data.crewConfirmed ?? null,
            link: data.link ?? null,
            completedAt:
              safeTrim(data.completedAt) ||
              safeTrim(data.actualEndAt) ||
              undefined,
            startedAt:
              safeTrim(data.startedAt) ||
              safeTrim(data.actualStartAt) ||
              undefined,
            actualStartAt: safeTrim(data.actualStartAt) || undefined,
            actualEndAt: safeTrim(data.actualEndAt) || undefined,
            pauseBlocks: Array.isArray(data.pauseBlocks)
              ? data.pauseBlocks
              : null,
            notes: safeTrim(data.notes) || undefined,
            materialsSummary: safeTrim(data.materialsSummary) || undefined,
            materialsUsedToday: safeTrim(data.materialsUsedToday) || undefined,
            closeout: data.closeout ?? null,
            billingPeriodId: safeTrim(data.billingPeriodId) || undefined,
            billingPeriodSequence:
              typeof data.billingPeriodSequence === "number"
                ? data.billingPeriodSequence
                : undefined,
            billingPeriodLabel: safeTrim(data.billingPeriodLabel) || undefined,
            billingPeriodStatus:
              safeTrim(data.billingPeriodStatus) || undefined,
            readyToBillAt: safeTrim(data.readyToBillAt) || undefined,
          } satisfies ProjectTripDocLite;
        });
        setDashboardProjectTrips(items);
      },
      () => setDashboardProjectTrips([]),
    );

    const unsubActiveTrips = onSnapshot(
      query(collection(db, "trips"), limit(2000)),
      async (snap) => {
        const visibleTrips = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
          .filter((trip) => trip.active !== false)
          .filter((trip) => isFieldVisibleStatus(trip.status, trip.timerState));

        const items = await Promise.all(
          visibleTrips.map(async (trip) => {
            const type =
              safeTrim(trip.type).toLowerCase() === "project"
                ? "project"
                : "service";
            const crew = (trip.crewConfirmed || trip.crew || {}) as TripCrew;
            const serviceTicketId = safeTrim(
              trip.link?.serviceTicketId || trip.serviceTicketId,
            );
            const projectId = safeTrim(trip.link?.projectId || trip.projectId);

            if (type === "service" && serviceTicketId) {
              try {
                const serviceTicketSnap = await getDoc(
                  doc(db, "serviceTickets", serviceTicketId),
                );
                const data = serviceTicketSnap.exists()
                  ? (serviceTicketSnap.data() as any)
                  : {};

                return {
                  id: `service_${trip.id}`,
                  tripId: trip.id,
                  itemType: "service" as const,
                  href: `/service-tickets/${serviceTicketId}`,
                  title: safeTrim(data.customerDisplayName) || "Service Ticket",
                  subtitle: safeTrim(data.issueSummary) || "Service Work",
                  addressLine1: safeTrim(data.serviceAddressLine1) || undefined,
                  city: safeTrim(data.serviceCity) || undefined,
                  state: safeTrim(data.serviceState) || undefined,
                  updatedAt:
                    safeTrim(
                      trip.updatedAt ||
                        trip.actualStartAt ||
                        trip.startedAt ||
                        data.updatedAt,
                    ) || undefined,
                  status: safeTrim(trip.status) || undefined,
                  timerState: safeTrim(trip.timerState) || undefined,
                  assignedTechnicianName:
                    safeTrim(crew.primaryTechName) ||
                    safeTrim(data.assignedTechnicianName) ||
                    undefined,
                  assignedHelperName:
                    safeTrim(crew.helperName) ||
                    safeTrim(data.assignedHelperName) ||
                    undefined,
                  secondaryTechnicianName:
                    safeTrim(crew.secondaryTechName) || undefined,
                  secondaryHelperName:
                    safeTrim(crew.secondaryHelperName) || undefined,
                } satisfies ActiveWorkItem;
              } catch {
                return null;
              }
            }

            if (type === "project" && projectId) {
              try {
                const projectSnap = await getDoc(
                  doc(db, "projects", projectId),
                );
                const data = projectSnap.exists()
                  ? (projectSnap.data() as any)
                  : {};
                const projectName =
                  safeTrim(data.projectName) || "Project Trip";
                const customerDisplayName =
                  safeTrim(data.customerDisplayName) || "Project";

                return {
                  id: `project_${trip.id}`,
                  tripId: trip.id,
                  itemType: "project" as const,
                  href: `/projects/${projectId}`,
                  title: projectName,
                  subtitle: `${customerDisplayName}${safeTrim(trip.link?.projectStageKey) ? ` • ${stageLabel(trip.link?.projectStageKey)}` : ""}`,
                  addressLine1: safeTrim(data.serviceAddressLine1) || undefined,
                  city: safeTrim(data.serviceCity) || undefined,
                  state: safeTrim(data.serviceState) || undefined,
                  updatedAt:
                    safeTrim(
                      trip.updatedAt ||
                        trip.actualStartAt ||
                        trip.startedAt ||
                        data.updatedAt,
                    ) || undefined,
                  status: safeTrim(trip.status) || undefined,
                  timerState: safeTrim(trip.timerState) || undefined,
                  assignedTechnicianName:
                    safeTrim(crew.primaryTechName) || undefined,
                  assignedHelperName: safeTrim(crew.helperName) || undefined,
                  secondaryTechnicianName:
                    safeTrim(crew.secondaryTechName) || undefined,
                  secondaryHelperName:
                    safeTrim(crew.secondaryHelperName) || undefined,
                } satisfies ActiveWorkItem;
              } catch {
                return null;
              }
            }

            return null;
          }),
        );

        setActiveItems(
          (items.filter(Boolean) as ActiveWorkItem[]).sort(statusSort),
        );
        setDashboardLoading(false);
      },
      () => {
        setActiveItems([]);
        setDashboardLoading(false);
      },
    );

    return () => {
      unsubFollowUp();
      unsubReview();
      unsubMaterialOrders();
      unsubProjects();
      unsubProjectTrips();
      unsubActiveTrips();
    };
  }, []);

  useEffect(() => {
    if (!appUser?.uid) {
      setMyStaffCoverage([]);
      return;
    }

    const unsubStaffCoverage = onSnapshot(
      query(
        collection(db, "staffCoverage"),
        where("employeeId", "==", appUser.uid),
        where("active", "==", true),
        limit(50),
      ),
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;

            return {
              id: docSnap.id,
              employeeId: safeTrim(data.employeeId),
              employeeName: safeTrim(data.employeeName) || "Employee",
              employeeRole: safeTrim(data.employeeRole),
              workType: safeTrim(data.workType) || "office",
              date: safeTrim(data.date),
              startTime: safeTrim(data.startTime),
              endTime: safeTrim(data.endTime),
              scheduledHours:
                typeof data.scheduledHours === "number"
                  ? data.scheduledHours
                  : 0,
              unpaidBreakMinutes:
                typeof data.unpaidBreakMinutes === "number"
                  ? data.unpaidBreakMinutes
                  : 0,
              lunchStartAt: safeTrim(data.lunchStartAt) || null,
              lunchEndAt: safeTrim(data.lunchEndAt) || null,
              unpaidTimeBlocks: coerceStaffUnpaidTimeBlocks(
                data.unpaidTimeBlocks,
              ),
              status: safeTrim(data.status) || "scheduled",
              active: data.active !== false,
              linkedTimeEntryId: safeTrim(data.linkedTimeEntryId) || null,
              linkedWeeklyTimesheetId:
                safeTrim(data.linkedWeeklyTimesheetId) || null,
              confirmedAt: safeTrim(data.confirmedAt) || null,
              confirmedByUid: safeTrim(data.confirmedByUid) || null,
              notes: safeTrim(data.notes) || null,
            } satisfies DashboardStaffCoverageItem;
          })
          .filter(isStaffCoverageVisibleForConfirmation)
          .sort((a, b) => {
            const byDate = a.date.localeCompare(b.date);
            if (byDate !== 0) return byDate;
            return a.startTime.localeCompare(b.startTime);
          });

        setMyStaffCoverage(items);
      },
      () => setMyStaffCoverage([]),
    );

    return () => unsubStaffCoverage();
  }, [appUser?.uid]);

  const staffEditCalculatedUnpaidMinutes = useMemo(() => {
    let total = 0;

    for (const block of staffEditUnpaidTimeBlocks) {
      const minutes = calculateTimeBlockMinutes(
        block.startTime,
        block.endTime,
      );
      if (minutes == null) return null;
      total += minutes;
    }

    return total;
  }, [staffEditUnpaidTimeBlocks]);

  const staffEditPaidHours = useMemo(() => {
    if (!staffEditItem || staffEditCalculatedUnpaidMinutes == null) return null;
    return calculatePaidStaffHours(
      staffEditStartTime,
      staffEditEndTime,
      staffEditCalculatedUnpaidMinutes,
    );
  }, [
    staffEditCalculatedUnpaidMinutes,
    staffEditEndTime,
    staffEditItem,
    staffEditStartTime,
  ]);

  function handleOpenStaffActualEdit(item: DashboardStaffCoverageItem) {
    setStaffCoverageError("");
    setStaffCoverageMessage("");
    setStaffEditItem(item);
    setStaffEditStartTime(item.startTime || "08:00");

    const today = todayIsoLocal();
    const scheduledEndMinutes = minutesFromHHMM(item.endTime);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const shouldDefaultEndToNow =
      item.date === today &&
      scheduledEndMinutes != null &&
      nowMinutes < scheduledEndMinutes;

    setStaffEditEndTime(
      shouldDefaultEndToNow ? currentTimeHHMM() : item.endTime || "17:00",
    );
    setStaffEditUnpaidTimeBlocks(buildLegacyUnpaidTimeBlocks(item));
    setStaffEditNote("");
  }

  function handleCloseStaffActualEdit() {
    if (savingStaffEdit) return;
    setStaffEditItem(null);
    setStaffEditNote("");
    setStaffEditUnpaidTimeBlocks([]);
  }

  function handleAddStaffUnpaidTimeBlock() {
    setStaffEditUnpaidTimeBlocks((current) => [
      ...current,
      {
        id: `unpaid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: "personal",
        startTime: "08:45",
        endTime: "09:00",
        note: "",
      },
    ]);
  }

  function handleUpdateStaffUnpaidTimeBlock(
    id: string,
    patch: Partial<StaffUnpaidTimeBlockDraft>,
  ) {
    setStaffEditUnpaidTimeBlocks((current) =>
      current.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    );
  }

  function handleRemoveStaffUnpaidTimeBlock(id: string) {
    setStaffEditUnpaidTimeBlocks((current) =>
      current.filter((block) => block.id !== id),
    );
  }

  async function handleSaveStaffActualEdit() {
    if (!appUser?.uid) {
      setStaffCoverageError("Missing signed-in user.");
      return;
    }

    if (!staffEditItem) return;

    if (!isStaffCoverageVisibleForConfirmation(staffEditItem)) {
      setStaffCoverageError(
        "This shift is not available for confirmation yet.",
      );
      return;
    }

    const unpaidBreakMinutes = staffEditCalculatedUnpaidMinutes;

    if (unpaidBreakMinutes == null) {
      setStaffCoverageError(
        "Each unpaid time block must have a back-in time after its out time.",
      );
      return;
    }

    const invalidBlock = staffEditUnpaidTimeBlocks.find(
      (block) =>
        !isTimeBlockInsideShift(
          staffEditStartTime,
          staffEditEndTime,
          block.startTime,
          block.endTime,
        ),
    );

    if (invalidBlock) {
      setStaffCoverageError(
        `${unpaidTimeTypeLabel(
          invalidBlock.type,
        )} must fall inside the actual work shift.`,
      );
      return;
    }

    const sortedBlocks = [...staffEditUnpaidTimeBlocks].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
    for (let index = 1; index < sortedBlocks.length; index += 1) {
      const previousEnd = minutesFromHHMM(sortedBlocks[index - 1].endTime);
      const currentStart = minutesFromHHMM(sortedBlocks[index].startTime);
      if (
        previousEnd != null &&
        currentStart != null &&
        currentStart < previousEnd
      ) {
        setStaffCoverageError("Unpaid time blocks cannot overlap.");
        return;
      }
    }

    const paidHours = calculatePaidStaffHours(
      staffEditStartTime,
      staffEditEndTime,
      unpaidBreakMinutes,
    );

    if (paidHours == null || paidHours <= 0) {
      setStaffCoverageError("Actual end time must be after actual start time.");
      return;
    }

    const actualStartAt = buildLocalIsoFromDateAndTime(
      staffEditItem.date,
      staffEditStartTime,
    );
    const actualEndAt = buildLocalIsoFromDateAndTime(
      staffEditItem.date,
      staffEditEndTime,
    );

    if (!actualStartAt || !actualEndAt) {
      setStaffCoverageError("Enter a valid actual start and end time.");
      return;
    }

    const unpaidTimeBlocks: StaffUnpaidTimeBlock[] =
      staffEditUnpaidTimeBlocks.map((block) => {
        const startAt = buildLocalIsoFromDateAndTime(
          staffEditItem.date,
          block.startTime,
        );
        const endAt = buildLocalIsoFromDateAndTime(
          staffEditItem.date,
          block.endTime,
        );
        const minutes =
          calculateTimeBlockMinutes(block.startTime, block.endTime) || 0;

        if (!startAt || !endAt) {
          throw new Error("Enter valid times for every unpaid time block.");
        }

        return {
          id: block.id,
          type: block.type,
          startAt,
          endAt,
          minutes,
          note: safeTrim(block.note) || null,
        };
      });

    const lunchBlock =
      unpaidTimeBlocks.find((block) => block.type === "lunch") || null;
    const lunchStartAt = lunchBlock?.startAt || null;
    const lunchEndAt = lunchBlock?.endAt || null;

    setSavingStaffEdit(true);
    setStaffCoverageError("");
    setStaffCoverageMessage("");

    try {
      const now = new Date().toISOString();

      if (staffEditItem.linkedWeeklyTimesheetId) {
        const timesheetSnap = await getDoc(
          doc(db, "weeklyTimesheets", staffEditItem.linkedWeeklyTimesheetId),
        );

        if (
          timesheetSnap.exists() &&
          isLockedWeeklyTimesheetStatus((timesheetSnap.data() as any).status)
        ) {
          throw new Error(
            "This weekly timesheet has already been submitted or locked. Ask an admin to reject/unlock it before editing hours.",
          );
        }
      }

      const linkedTimeEntryId =
        safeTrim(staffEditItem.linkedTimeEntryId) ||
        `staff_${staffEditItem.id}`;
      const timeEntryRef = doc(db, "timeEntries", linkedTimeEntryId);
      const timeEntrySnap = await getDoc(timeEntryRef);
      const existingTimeEntry = timeEntrySnap.exists()
        ? (timeEntrySnap.data() as any)
        : {};
      const nextNotes = buildStaffAdjustmentNotes(
        safeTrim(existingTimeEntry.notes),
        staffEditItem,
        staffEditStartTime,
        staffEditEndTime,
        unpaidBreakMinutes,
        paidHours,
        staffEditNote.trim(),
        staffEditUnpaidTimeBlocks,
      );

      const batch = writeBatch(db);

      batch.update(doc(db, "staffCoverage", staffEditItem.id), {
        status: "completed",
        linkedTimeEntryId,
        actualStartAt,
        actualEndAt,
        actualHours: paidHours,
        unpaidBreakMinutes,
        lunchStartAt,
        lunchEndAt,
        unpaidTimeBlocks,
        confirmedAt: now,
        confirmedByUid: appUser.uid,
        adjustedAt: now,
        adjustedByUid: appUser.uid,
        adjustedByName: appUser.displayName || null,
        adjustmentNote: staffEditNote.trim() || null,
        updatedAt: now,
        updatedByUid: appUser.uid,
        updatedByName: appUser.displayName || null,
      });

      batch.set(
        timeEntryRef,
        {
          employeeId: staffEditItem.employeeId,
          employeeName: staffEditItem.employeeName,
          employeeRole: staffEditItem.employeeRole,
          entryDate: staffEditItem.date,
          category: "office",
          payType: "regular",
          billable: false,
          source: "staff_adjusted",
          entryStatus: "draft",
          staffCoverageId: staffEditItem.id,
          workType: staffEditItem.workType,
          scheduledStartTime: staffEditItem.startTime,
          scheduledEndTime: staffEditItem.endTime,
          hours: paidHours,
          hoursSource: paidHours,
          actualStartAt,
          actualEndAt,
          unpaidBreakMinutes,
          lunchStartAt,
          lunchEndAt,
          unpaidTimeBlocks,
          confirmedAt: now,
          confirmedByUid: appUser.uid,
          adjustedAt: now,
          adjustedByUid: appUser.uid,
          notes: nextNotes || null,
          createdAt: safeTrim(existingTimeEntry.createdAt) || now,
          updatedAt: now,
          updatedByUid: appUser.uid,
        },
        { merge: true },
      );

      await batch.commit();

      setStaffCoverageMessage("Actual staff hours saved and confirmed.");
      setStaffEditItem(null);
      setStaffEditNote("");
      setStaffEditUnpaidTimeBlocks([]);
    } catch (err: unknown) {
      setStaffCoverageError(
        err instanceof Error
          ? err.message
          : "Failed to save actual staff hours.",
      );
    } finally {
      setSavingStaffEdit(false);
    }
  }

  async function handleConfirmStaffCoverage(item: DashboardStaffCoverageItem) {
    if (!appUser?.uid) {
      setStaffCoverageError("Missing signed-in user.");
      return;
    }

    if (!canQuickConfirmStaffCoverage(item)) {
      setStaffCoverageError(
        `One-click confirmation becomes available after ${formatTime12h(
          item.endTime,
        )}. Use Edit Actual to finish and confirm the shift earlier.`,
      );
      return;
    }

    setConfirmingStaffCoverageId(item.id);
    setStaffCoverageError("");
    setStaffCoverageMessage("");

    try {
      const now = new Date().toISOString();

      if (item.linkedWeeklyTimesheetId) {
        const timesheetSnap = await getDoc(
          doc(db, "weeklyTimesheets", item.linkedWeeklyTimesheetId),
        );

        if (
          timesheetSnap.exists() &&
          isLockedWeeklyTimesheetStatus((timesheetSnap.data() as any).status)
        ) {
          throw new Error(
            "This weekly timesheet has already been submitted or locked. Ask an admin to reject/unlock it before confirming hours.",
          );
        }
      }

      const actualStartAt = buildLocalIsoFromDateAndTime(
        item.date,
        item.startTime,
      );
      const actualEndAt = buildLocalIsoFromDateAndTime(item.date, item.endTime);
      const linkedTimeEntryId =
        safeTrim(item.linkedTimeEntryId) || `staff_${item.id}`;
      const timeEntryRef = doc(db, "timeEntries", linkedTimeEntryId);
      const timeEntrySnap = await getDoc(timeEntryRef);
      const existingTimeEntry = timeEntrySnap.exists()
        ? (timeEntrySnap.data() as any)
        : {};

      const batch = writeBatch(db);

      batch.update(doc(db, "staffCoverage", item.id), {
        status: "completed",
        linkedTimeEntryId,
        actualStartAt,
        actualEndAt,
        unpaidBreakMinutes: item.unpaidBreakMinutes,
        lunchStartAt: item.lunchStartAt || null,
        lunchEndAt: item.lunchEndAt || null,
        unpaidTimeBlocks: coerceStaffUnpaidTimeBlocks(item.unpaidTimeBlocks),
        confirmedAt: now,
        confirmedByUid: appUser.uid,
        updatedAt: now,
        updatedByUid: appUser.uid,
        updatedByName: appUser.displayName || null,
      });

      batch.set(
        timeEntryRef,
        {
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          employeeRole: item.employeeRole,
          entryDate: item.date,
          category: "office",
          payType: "regular",
          billable: false,
          source: "staff_confirmed",
          entryStatus: "draft",
          staffCoverageId: item.id,
          workType: item.workType,
          scheduledStartTime: item.startTime,
          scheduledEndTime: item.endTime,
          hours: item.scheduledHours,
          hoursSource: item.scheduledHours,
          actualStartAt,
          actualEndAt,
          unpaidBreakMinutes: item.unpaidBreakMinutes,
          lunchStartAt: item.lunchStartAt || null,
          lunchEndAt: item.lunchEndAt || null,
          unpaidTimeBlocks: coerceStaffUnpaidTimeBlocks(
            item.unpaidTimeBlocks,
          ),
          confirmedAt: now,
          confirmedByUid: appUser.uid,
          createdAt: safeTrim(existingTimeEntry.createdAt) || now,
          updatedAt: now,
          updatedByUid: appUser.uid,
        },
        { merge: true },
      );

      await batch.commit();

      setStaffCoverageMessage("Staff hours confirmed.");
    } catch (err: unknown) {
      setStaffCoverageError(
        err instanceof Error ? err.message : "Failed to confirm staff hours.",
      );
    } finally {
      setConfirmingStaffCoverageId("");
    }
  }

  const projectFollowUps = useMemo(
    () => buildProjectFollowUpItems(dashboardProjects, dashboardProjectTrips),
    [dashboardProjects, dashboardProjectTrips],
  );

  const readyInvoiceProjects = useMemo(
    () => buildReadyInvoiceItems(dashboardProjects, dashboardProjectTrips),
    [dashboardProjects, dashboardProjectTrips],
  );

  const pendingMaterialOrders = useMemo(
    () => buildPendingMaterialOrderItems(dashboardMaterialOrders),
    [dashboardMaterialOrders],
  );

  const projectAttentionCount =
    projectFollowUps.length + readyInvoiceProjects.length;

  const attentionCount = useMemo(() => {
    return new Set([
      ...followUpTickets.map((x) => `ticket_fu_${x.id}`),
      ...reviewTickets.map((x) => `ticket_rev_${x.id}`),
      ...projectFollowUps.map((x) => `project_fu_${x.projectId}`),
      ...readyInvoiceProjects.map((x) => `project_bill_${x.projectId}`),
      ...pendingMaterialOrders.map((x) => `material_pending_${x.id}`),
    ]).size;
  }, [
    followUpTickets,
    reviewTickets,
    projectFollowUps,
    readyInvoiceProjects,
    pendingMaterialOrders,
  ]);

  const visibleCardCount = useMemo(() => {
    return (
      reviewTickets.length +
      followUpTickets.length +
      activeItems.length +
      projectFollowUps.length +
      readyInvoiceProjects.length +
      pendingMaterialOrders.length
    );
  }, [
    reviewTickets.length,
    followUpTickets.length,
    activeItems.length,
    projectFollowUps.length,
    readyInvoiceProjects.length,
    pendingMaterialOrders.length,
  ]);

  return (
    <ProtectedPage
      fallbackTitle="Dashboard"
      allowedRoles={[
        "admin",
        "dispatcher",
        "manager",
        "billing",
        "office_display",
      ]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={3}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 1.2,
                border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                backgroundColor: "background.paper",
              }}
            >
              <CardContent
                sx={{
                  p: { xs: 2.25, md: 3 },
                  "&:last-child": { pb: { xs: 2.25, md: 3 } },
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                >
                  <Stack spacing={1.25}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Chip
                        icon={<DashboardRoundedIcon sx={{ fontSize: 16 }} />}
                        label="Dashboard"
                        size="small"
                        sx={{
                          borderRadius: 999,
                          fontWeight: 700,
                          backgroundColor: alpha(
                            theme.palette.primary.main,
                            0.14,
                          ),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.24)}`,
                          color: theme.palette.primary.main,
                        }}
                      />

                      <Chip
                        label={`${attentionCount} need attention`}
                        size="small"
                        color={attentionCount > 0 ? "warning" : "default"}
                        variant={attentionCount > 0 ? "filled" : "outlined"}
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />

                      <Chip
                        label={`${activeItems.length} active in field`}
                        size="small"
                        color={activeItems.length > 0 ? "success" : "default"}
                        variant={activeItems.length > 0 ? "filled" : "outlined"}
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />

                      <Chip
                        label={`${projectAttentionCount} project queue${projectAttentionCount === 1 ? "" : "s"}`}
                        size="small"
                        color={projectAttentionCount > 0 ? "info" : "default"}
                        variant={
                          projectAttentionCount > 0 ? "filled" : "outlined"
                        }
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />

                      <Chip
                        label={`${pendingMaterialOrders.length} material order${pendingMaterialOrders.length === 1 ? "" : "s"}`}
                        size="small"
                        color={
                          pendingMaterialOrders.length > 0
                            ? "success"
                            : "default"
                        }
                        variant={
                          pendingMaterialOrders.length > 0
                            ? "filled"
                            : "outlined"
                        }
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />
                    </Stack>

                    <Box>
                      <Typography
                        variant="h4"
                        sx={{
                          fontSize: { xs: "1.8rem", md: "2.35rem" },
                          lineHeight: 1.05,
                          fontWeight: 800,
                          letterSpacing: "-0.035em",
                        }}
                      >
                        Office attention center
                      </Typography>

                      <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mt: 1, maxWidth: 940 }}
                      >
                        This dashboard keeps office action items front and
                        center while also giving dispatch a compact view of live
                        field work, project follow-ups, billing-ready projects,
                        pending material orders, current assignments, and active
                        trip status across service and project work.
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      component={Link}
                      href="/service-tickets"
                      variant="outlined"
                      endIcon={<ArrowForwardRoundedIcon />}
                      sx={{ borderRadius: 999 }}
                    >
                      Open Service Tickets
                    </Button>
                    <Button
                      component={Link}
                      href="/material-orders"
                      variant="outlined"
                      endIcon={<ArrowForwardRoundedIcon />}
                      sx={{ borderRadius: 999 }}
                    >
                      Open Material Orders
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            {dashboardLoading ? (
              <Alert
                severity="info"
                variant="outlined"
                sx={{ borderRadius: 3 }}
                icon={<CircularProgress size={18} />}
              >
                Loading dashboard queues...
              </Alert>
            ) : null}

            {attentionCount === 0 &&
            activeItems.length === 0 &&
            !dashboardLoading ? (
              <Alert
                severity="success"
                variant="outlined"
                sx={{ borderRadius: 3 }}
              >
                Nice — there are no current office attention items or active
                field jobs showing right now.
              </Alert>
            ) : null}

            <Box sx={{ display: { xs: "block", xl: "none" } }}>
              <LiveFieldWorkSection activeItems={activeItems} />
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  xl: "minmax(0, 1.35fr) minmax(360px, 0.95fr)",
                },
                alignItems: "start",
              }}
            >
              <Stack spacing={2}>
                {myStaffCoverage.length > 0 ? (
                  <MyStaffHoursSection
                    items={myStaffCoverage}
                    confirmingId={confirmingStaffCoverageId}
                    message={staffCoverageMessage}
                    error={staffCoverageError}
                    onConfirm={handleConfirmStaffCoverage}
                    onEditActual={handleOpenStaffActualEdit}
                  />
                ) : null}

                {reviewTickets.length > 0 ? (
                  <SectionCard
                    title="Needs Review"
                    subtitle="Completed service work that is ready for office review and billing follow-through."
                    icon={<AssignmentTurnedInRoundedIcon />}
                    count={reviewTickets.length}
                    accent="primary"
                  >
                    <Stack
                      divider={
                        <Divider
                          flexItem
                          sx={{ borderColor: alpha("#FFFFFF", 0.08) }}
                        />
                      }
                    >
                      {reviewTickets.map((item) => (
                        <TicketRow key={item.id} item={item} mode="review" />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {pendingMaterialOrders.length > 0 ? (
                  <SectionCard
                    title="Pending Material Orders"
                    subtitle="Materials-only orders still waiting on delivery, pickup, billing, or invoicing."
                    icon={<Inventory2RoundedIcon />}
                    count={pendingMaterialOrders.length}
                    accent="success"
                  >
                    <Stack
                      divider={
                        <Divider
                          flexItem
                          sx={{ borderColor: alpha("#FFFFFF", 0.08) }}
                        />
                      }
                    >
                      {pendingMaterialOrders.map((item) => (
                        <PendingMaterialOrderRow key={item.id} item={item} />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {followUpTickets.length > 0 ? (
                  <SectionCard
                    title="Follow-Up Needed"
                    subtitle="Service tickets that still need a return trip, scheduling, or next-step action."
                    icon={<AutorenewRoundedIcon />}
                    count={followUpTickets.length}
                    accent="warning"
                  >
                    <Stack
                      divider={
                        <Divider
                          flexItem
                          sx={{ borderColor: alpha("#FFFFFF", 0.08) }}
                        />
                      }
                    >
                      {followUpTickets.map((item) => (
                        <TicketRow key={item.id} item={item} mode="follow_up" />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {reviewTickets.length === 0 &&
                followUpTickets.length === 0 &&
                pendingMaterialOrders.length === 0 ? (
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1.2,
                      border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={1.25}>
                        <Typography variant="h6" fontWeight={800}>
                          Billing and service workflow is clear
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          There are no current service tickets or pending
                          material orders in the office review queues.
                        </Typography>

                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                        >
                          <Button
                            component={Link}
                            href="/service-tickets"
                            variant="contained"
                            startIcon={<ReceiptLongRoundedIcon />}
                            sx={{ borderRadius: 999, alignSelf: "flex-start" }}
                          >
                            Manage Service Workflow
                          </Button>
                          <Button
                            component={Link}
                            href="/material-orders"
                            variant="outlined"
                            startIcon={<Inventory2RoundedIcon />}
                            sx={{ borderRadius: 999, alignSelf: "flex-start" }}
                          >
                            Manage Material Orders
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}
              </Stack>

              <Stack spacing={2}>
                <Box sx={{ display: { xs: "none", xl: "block" } }}>
                  <LiveFieldWorkSection activeItems={activeItems} />
                </Box>

                <SectionCard
                  title="Today at a Glance"
                  subtitle="Quick counts from what is currently surfaced on this dashboard."
                  icon={<DashboardRoundedIcon />}
                  count={visibleCardCount}
                  accent="neutral"
                >
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1.25,
                      gridTemplateColumns: "1fr 1fr",
                    }}
                  >
                    {[
                      { label: "Active Now", value: activeItems.length },
                      { label: "Needs Review", value: reviewTickets.length },
                      { label: "Follow-Up", value: followUpTickets.length },
                      {
                        label: "Project Follow-Ups",
                        value: projectFollowUps.length,
                      },
                      {
                        label: "Ready To Invoice",
                        value: readyInvoiceProjects.length,
                      },
                      {
                        label: "Pending Materials",
                        value: pendingMaterialOrders.length,
                      },
                      { label: "Attention Total", value: attentionCount },
                    ].map((item) => (
                      <Box
                        key={item.label}
                        sx={{
                          borderRadius: 1.2,
                          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                          backgroundColor: alpha(
                            theme.palette.common.white,
                            0.02,
                          ),
                          px: 1.5,
                          py: 1.5,
                        }}
                      >
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 800,
                            lineHeight: 1,
                            letterSpacing: "-0.03em",
                          }}
                        >
                          {item.value}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </SectionCard>
              </Stack>
            </Box>

            <Dialog
              open={Boolean(staffEditItem)}
              onClose={handleCloseStaffActualEdit}
              fullWidth
              maxWidth="sm"
              PaperProps={{
                sx: {
                  borderRadius: 1.4,
                  border: `1px solid ${alpha(theme.palette.common.white, 0.1)}`,
                  backgroundImage: "none",
                  backgroundColor: "background.paper",
                },
              }}
            >
              <DialogTitle>
                <Stack spacing={0.75}>
                  <Typography variant="h6" fontWeight={900}>
                    Edit Actual Staff Hours
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Confirm the actual time worked when it differs from the
                    scheduled staff coverage.
                  </Typography>
                </Stack>
              </DialogTitle>

              <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                  {staffEditItem ? (
                    <Alert
                      severity="info"
                      variant="outlined"
                      sx={{ borderRadius: 3 }}
                    >
                      Scheduled {labelForStaffWorkType(staffEditItem.workType)}{" "}
                      on {staffEditItem.date}:{" "}
                      {formatTime12h(staffEditItem.startTime)}–
                      {formatTime12h(staffEditItem.endTime)} •{" "}
                      {staffEditItem.scheduledHours.toFixed(2)} paid hrs
                    </Alert>
                  ) : null}

                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    }}
                  >
                    <TextField
                      label="Actual Start"
                      type="time"
                      value={staffEditStartTime}
                      onChange={(event) =>
                        setStaffEditStartTime(event.target.value)
                      }
                      disabled={savingStaffEdit}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />

                    <TextField
                      label="Actual End"
                      type="time"
                      value={staffEditEndTime}
                      onChange={(event) =>
                        setStaffEditEndTime(event.target.value)
                      }
                      disabled={savingStaffEdit}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Box>

                  <Box
                    sx={{
                      borderRadius: 1.2,
                      border: (theme) =>
                        `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      backgroundColor: (theme) =>
                        alpha(theme.palette.common.white, 0.02),
                      p: 1.5,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={{ xs: "stretch", sm: "center" }}
                        justifyContent="space-between"
                      >
                        <Box>
                          <Typography variant="subtitle2" fontWeight={900}>
                            Unpaid Time
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Add lunch, personal/out-of-office time, or another
                            unpaid occurrence during the shift.
                          </Typography>
                        </Box>

                        <Button
                          variant="outlined"
                          size="small"
                          onClick={handleAddStaffUnpaidTimeBlock}
                          disabled={savingStaffEdit}
                          sx={{ borderRadius: 999, flexShrink: 0 }}
                        >
                          + Add Unpaid Time
                        </Button>
                      </Stack>

                      {staffEditUnpaidTimeBlocks.length === 0 ? (
                        <Alert
                          severity="success"
                          variant="outlined"
                          sx={{ borderRadius: 3 }}
                        >
                          No unpaid time will be deducted from this shift.
                        </Alert>
                      ) : (
                        <Stack spacing={1.25}>
                          {staffEditUnpaidTimeBlocks.map((block, index) => {
                            const blockMinutes = calculateTimeBlockMinutes(
                              block.startTime,
                              block.endTime,
                            );

                            return (
                              <Box
                                key={block.id}
                                sx={{
                                  borderRadius: 1.2,
                                  border: (theme) =>
                                    `1px solid ${alpha(
                                      theme.palette.common.white,
                                      0.08,
                                    )}`,
                                  p: 1.25,
                                }}
                              >
                                <Stack spacing={1.25}>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    justifyContent="space-between"
                                  >
                                    <Typography
                                      variant="subtitle2"
                                      fontWeight={800}
                                    >
                                      Unpaid Time #{index + 1}
                                    </Typography>

                                    <Stack
                                      direction="row"
                                      spacing={0.75}
                                      alignItems="center"
                                    >
                                      <Chip
                                        size="small"
                                        label={
                                          blockMinutes == null
                                            ? "Invalid time"
                                            : formatMinutesDuration(blockMinutes)
                                        }
                                        color={
                                          blockMinutes == null
                                            ? "warning"
                                            : "default"
                                        }
                                        variant="outlined"
                                        sx={{ fontWeight: 800 }}
                                      />
                                      <Button
                                        color="error"
                                        size="small"
                                        onClick={() =>
                                          handleRemoveStaffUnpaidTimeBlock(
                                            block.id,
                                          )
                                        }
                                        disabled={savingStaffEdit}
                                        sx={{ borderRadius: 999 }}
                                      >
                                        Remove
                                      </Button>
                                    </Stack>
                                  </Stack>

                                  <FormControl fullWidth>
                                    <InputLabel>Type</InputLabel>
                                    <Select
                                      label="Type"
                                      value={block.type}
                                      onChange={(event) =>
                                        handleUpdateStaffUnpaidTimeBlock(
                                          block.id,
                                          {
                                            type: event.target
                                              .value as StaffUnpaidTimeType,
                                          },
                                        )
                                      }
                                      disabled={savingStaffEdit}
                                    >
                                      <MenuItem value="lunch">Lunch</MenuItem>
                                      <MenuItem value="personal">
                                        Personal / Out of Office
                                      </MenuItem>
                                      <MenuItem value="other">
                                        Other Unpaid Time
                                      </MenuItem>
                                    </Select>
                                  </FormControl>

                                  <Box
                                    sx={{
                                      display: "grid",
                                      gap: 1.5,
                                      gridTemplateColumns: {
                                        xs: "1fr",
                                        sm: "1fr 1fr",
                                      },
                                    }}
                                  >
                                    <TextField
                                      label="Out"
                                      type="time"
                                      value={block.startTime}
                                      onChange={(event) =>
                                        handleUpdateStaffUnpaidTimeBlock(
                                          block.id,
                                          {
                                            startTime: event.target.value,
                                          },
                                        )
                                      }
                                      disabled={savingStaffEdit}
                                      InputLabelProps={{ shrink: true }}
                                      fullWidth
                                    />

                                    <TextField
                                      label="Back In"
                                      type="time"
                                      value={block.endTime}
                                      onChange={(event) =>
                                        handleUpdateStaffUnpaidTimeBlock(
                                          block.id,
                                          {
                                            endTime: event.target.value,
                                          },
                                        )
                                      }
                                      disabled={savingStaffEdit}
                                      InputLabelProps={{ shrink: true }}
                                      fullWidth
                                    />
                                  </Box>

                                  <TextField
                                    label="Block Note (optional)"
                                    value={block.note}
                                    onChange={(event) =>
                                      handleUpdateStaffUnpaidTimeBlock(
                                        block.id,
                                        { note: event.target.value },
                                      )
                                    }
                                    disabled={savingStaffEdit}
                                    placeholder={
                                      block.type === "personal"
                                        ? "Example: personal appointment"
                                        : "Optional detail"
                                    }
                                    fullWidth
                                  />
                                </Stack>
                              </Box>
                            );
                          })}
                        </Stack>
                      )}
                    </Stack>
                  </Box>

                  <TextField
                    label="Reason / Note"
                    value={staffEditNote}
                    onChange={(event) => setStaffEditNote(event.target.value)}
                    disabled={savingStaffEdit}
                    multiline
                    minRows={3}
                    placeholder="Optional overall note about why the actual shift differed from schedule."
                    fullWidth
                  />

                  <Chip
                    icon={<AccessTimeRoundedIcon />}
                    label={
                      staffEditPaidHours == null
                        ? "Enter a valid actual time range"
                        : `${staffEditPaidHours.toFixed(2)} paid hours${
                            Number(staffEditCalculatedUnpaidMinutes || 0) > 0
                              ? ` • ${formatMinutesDuration(
                                  Number(staffEditCalculatedUnpaidMinutes || 0),
                                )} unpaid`
                              : " • no unpaid time"
                          }`
                    }
                    color={staffEditPaidHours ? "primary" : "default"}
                    variant={staffEditPaidHours ? "filled" : "outlined"}
                    sx={{ alignSelf: "flex-start", fontWeight: 800 }}
                  />
                </Stack>
              </DialogContent>

              <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button
                  onClick={handleCloseStaffActualEdit}
                  disabled={savingStaffEdit}
                  variant="outlined"
                  sx={{ borderRadius: 999 }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveStaffActualEdit}
                  disabled={
                    savingStaffEdit || !staffEditItem || !staffEditPaidHours
                  }
                  variant="contained"
                  sx={{ borderRadius: 999 }}
                >
                  {savingStaffEdit ? "Saving..." : "Save Actual Hours"}
                </Button>
              </DialogActions>
            </Dialog>

            {projectFollowUps.length > 0 || readyInvoiceProjects.length > 0 ? (
              <SectionCard
                title="Projects Attention Center"
                subtitle="Project follow-ups from field closeouts and billing-ready projects that need office action."
                icon={<ConstructionRoundedIcon />}
                count={projectAttentionCount}
                accent="warning"
              >
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" },
                  }}
                >
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1.2,
                      border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      backgroundColor: alpha(theme.palette.common.white, 0.02),
                    }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={1.5}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <AutorenewRoundedIcon color="warning" />
                            <Box>
                              <Typography variant="subtitle1" fontWeight={800}>
                                Project Follow-Ups
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                “Needs another day” signals from completed
                                project trip closeouts.
                              </Typography>
                            </Box>
                          </Stack>
                          <Chip
                            size="small"
                            label={projectFollowUps.length}
                            color={
                              projectFollowUps.length > 0
                                ? "warning"
                                : "default"
                            }
                            variant={
                              projectFollowUps.length > 0
                                ? "filled"
                                : "outlined"
                            }
                            sx={{ fontWeight: 800 }}
                          />
                        </Stack>

                        {projectFollowUps.length === 0 ? (
                          <Alert
                            severity="success"
                            variant="outlined"
                            sx={{ borderRadius: 3 }}
                          >
                            No project follow-ups need attention right now.
                          </Alert>
                        ) : (
                          <Stack
                            divider={
                              <Divider
                                flexItem
                                sx={{ borderColor: alpha("#FFFFFF", 0.08) }}
                              />
                            }
                          >
                            {projectFollowUps.map((item) => (
                              <ProjectFollowUpRow
                                key={item.projectId}
                                item={item}
                              />
                            ))}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1.2,
                      border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      backgroundColor: alpha(theme.palette.common.white, 0.02),
                    }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={1.5}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <ReceiptLongRoundedIcon color="success" />
                            <Box>
                              <Typography variant="subtitle1" fontWeight={800}>
                                Ready to Invoice Projects
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Current project billing work that is ready for
                                office invoicing.
                              </Typography>
                            </Box>
                          </Stack>
                          <Chip
                            size="small"
                            label={readyInvoiceProjects.length}
                            color={
                              readyInvoiceProjects.length > 0
                                ? "success"
                                : "default"
                            }
                            variant={
                              readyInvoiceProjects.length > 0
                                ? "filled"
                                : "outlined"
                            }
                            sx={{ fontWeight: 800 }}
                          />
                        </Stack>

                        {readyInvoiceProjects.length === 0 ? (
                          <Alert
                            severity="success"
                            variant="outlined"
                            sx={{ borderRadius: 3 }}
                          >
                            No projects are waiting to be invoiced right now.
                          </Alert>
                        ) : (
                          <Stack
                            divider={
                              <Divider
                                flexItem
                                sx={{ borderColor: alpha("#FFFFFF", 0.08) }}
                              />
                            }
                          >
                            {readyInvoiceProjects.map((item) => (
                              <ReadyInvoiceProjectRow
                                key={item.projectId}
                                item={item}
                              />
                            ))}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>
              </SectionCard>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}
