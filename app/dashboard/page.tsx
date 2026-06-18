// app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
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

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

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
  | "active_work"
  | "field_complete"
  | "ready_to_invoice"
  | "invoiced"
  | "closed";

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
    orderStatus === "invoiced" || billingStatus === "invoiced" || hasMaterialOrderInvoiceSignal(order);
  const isPickedUp = orderStatus === "picked_up" || pickupStatus === "picked_up";

  if (orderStatus === "cancelled" || orderStatus === "closed" || billingStatus === "closed") {
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

  if (orderStatus === "ready_for_pickup" || pickupStatus === "ready_for_pickup") {
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

function buildAddress(item: { addressLine1?: string; city?: string; state?: string }) {
  return [safeTrim(item.addressLine1), safeTrim(item.city), safeTrim(item.state)]
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

function isFieldVisibleStatus(status?: string | null, timerState?: string | null) {
  const normalized = normalizeStatus(status);
  const normalizedTimer = normalizeStatus(timerState);

  return (
    ["in_progress", "paused", "dispatched", "assigned", "on_site"].includes(normalized) ||
    ["running", "paused"].includes(normalizedTimer)
  );
}

function isFieldVisibleItem(item: ActiveWorkItem) {
  return (
    isFieldVisibleStatus(item.status, item.timerState) &&
    hasAssignedCrew(item) &&
    hasMappableAddress(item)
  );
}

function buildStaticMapUrl(items: ActiveWorkItem[]) {
  const apiKey = safeTrim(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  if (!apiKey) return "";

  const addresses = items
    .filter(isFieldVisibleItem)
    .map((item) => buildAddress(item))
    .filter(Boolean)
    .slice(0, 6);

  if (addresses.length === 0) return "";

  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams();

  params.set("size", "1400x320");
  params.set("scale", "2");
  params.set("maptype", "roadmap");

  if (addresses.length === 1) {
    params.set("center", addresses[0]);
    params.set("zoom", "11");
  } else {
    addresses.forEach((address) => params.append("visible", address));
  }

  addresses.forEach((address, index) => {
    const label = String(index + 1);
    params.append("markers", `size:mid|color:0x1a73e8|label:${label}|${address}`);
  });

  params.set("key", apiKey);
  return `${base}?${params.toString()}`;
}

function formatProjectType(projectType?: string | null) {
  const normalized = safeTrim(projectType).toLowerCase();
  if (normalized === "new_construction") return "New Construction";
  if (normalized === "remodel") return "Remodel";
  if (normalized === "time_materials" || normalized === "time+materials") return "Time + Materials";
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

function getTimerDrivenHoursForTrip(trip?: ProjectTripDocLite | null) {
  if (!trip) return null;
  const startMs = parseIsoMs(trip.actualStartAt || trip.startedAt || null);
  const endMs = parseIsoMs(trip.actualEndAt || trip.completedAt || null);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

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
    if (officeStatus === "closed" || officeStatus === "invoiced") return;
    if (project.fieldCompletedAt) return;

    const laterTrips = projectTrips.filter((trip) => {
      if (safeTrim(trip.link?.projectId) !== projectId) return false;
      if (safeTrim(trip.id) === safeTrim(flaggedTrip.id)) return false;
      if (normalizeStatus(trip.status) === "cancelled") return false;
      return compareTripSequence(trip, flaggedTrip) > 0;
    });

    const hasScheduledReturn = laterTrips.length > 0;
    const hasLaterCompletedWork = laterTrips.some((trip) =>
      ["complete", "in_progress", "paused"].includes(normalizeStatus(trip.status)) ||
      ["running", "paused"].includes(normalizeStatus(trip.timerState)),
    );

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
    .filter((project) => normalizeOfficeStatus(project.projectOfficeStatus) === "ready_to_invoice")
    .map((project) => {
      const readyPeriod = getReadyBillingPeriod(project);
      const relatedTrips = projectTrips.filter(
        (trip) => safeTrim(trip.link?.projectId) === safeTrim(project.id),
      );

      const periodTrips = readyPeriod
        ? relatedTrips.filter(
            (trip) => safeTrim(trip.billingPeriodId) === safeTrim(readyPeriod.id),
          )
        : relatedTrips.filter((trip) => normalizeStatus(trip.status) === "complete");

      const totalHours = readyPeriod
        ? Number(readyPeriod.totalHours || 0)
        : periodTrips.reduce((sum, trip) => sum + getCloseoutHoursForTrip(trip), 0);

      const materialsCount = readyPeriod
        ? Number(readyPeriod.materialsCount || 0)
        : periodTrips.reduce((sum, trip) => (getMaterialsText(trip) ? sum + 1 : sum), 0);

      const tripCount = readyPeriod ? Number(readyPeriod.tripCount || 0) : periodTrips.length;

      const billingLabel = readyPeriod
        ? safeTrim(readyPeriod.label) || `Billing ${readyPeriod.sequence || 1}`
        : safeTrim(project.projectType).toLowerCase() === "time_materials"
          ? "Current Billing"
          : "Project Billing";

      return {
        projectId: project.id,
        href: `/projects/${project.id}`,
        billingHref: `/projects/${project.id}#project-billing`,
        projectName: safeTrim(project.projectName) || "Project",
        customerDisplayName: safeTrim(project.customerDisplayName) || "Customer",
        projectTypeLabel: formatProjectType(project.projectType),
        billingLabel,
        readyAt:
          safeTrim(readyPeriod?.readyToBillAt) ||
          safeTrim(project.readyToInvoiceAt) ||
          undefined,
        readyByName:
          safeTrim(readyPeriod?.readyToBillByName) ||
          safeTrim(project.readyToInvoiceByName) ||
          undefined,
        totalHours,
        materialsCount,
        tripCount,
        invoiceNumber: safeTrim(project.invoiceNumber) || undefined,
      } satisfies ReadyInvoiceProjectItem;
    });

  return items.sort((a, b) => {
    const aMs = parseFlexibleDateMs(a.readyAt) || 0;
    const bMs = parseFlexibleDateMs(b.readyAt) || 0;
    return aMs - bMs;
  });
}

function buildPendingMaterialOrderItems(materialOrders: DashboardMaterialOrderDoc[]) {
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
        updatedAt: safeTrim(order.updatedAt) || safeTrim(order.createdAt) || undefined,
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

function getFieldStatusMeta(status?: string | null, timerState?: string | null) {
  const normalized = normalizeStatus(status);
  const normalizedTimer = normalizeStatus(timerState);

  if (normalized === "paused" || normalizedTimer === "paused") {
    return {
      label: "Paused",
      color: "warning" as const,
      icon: <PauseCircleRoundedIcon sx={{ fontSize: 14 }} />,
    };
  }

  if (normalized === "dispatched" || normalized === "assigned" || normalized === "on_site") {
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
        border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
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

function TicketRow({ item, mode }: { item: DashboardTicketItem; mode: "follow_up" | "review" }) {
  const address = [safeTrim(item.serviceAddressLine1), safeTrim(item.serviceCity), safeTrim(item.serviceState)]
    .filter(Boolean)
    .join(", ");
  const assignedPeople = [safeTrim(item.assignedTechnicianName), safeTrim(item.assignedHelperName)]
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
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
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

          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.85 }}>
            {address ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PlaceRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {address}
                </Typography>
              </Stack>
            ) : null}

            {assignedPeople ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PersonRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {assignedPeople}
                </Typography>
              </Stack>
            ) : null}

            <Stack direction="row" spacing={0.5} alignItems="center">
              <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
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
            <Chip size="small" label="Needs Another Day" color="warning" variant="filled" sx={{ fontWeight: 800 }} />
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

          <Chip size="small" label="Ready to Invoice" color="success" variant="filled" sx={{ fontWeight: 800 }} />
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
          <Chip size="small" label={`${item.totalHours.toFixed(2)} hrs`} variant="outlined" sx={{ fontWeight: 700 }} />
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
            <Chip size="small" label={`Invoice #${item.invoiceNumber}`} color="success" variant="outlined" sx={{ fontWeight: 700 }} />
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
          <Button component={Link} href={item.href} variant="outlined" color="success" endIcon={<ArrowForwardRoundedIcon />} sx={{ borderRadius: 999 }}>
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
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
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

          <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.35 }}>
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
        border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: (theme) => alpha(theme.palette.common.white, 0.02),
        px: 1.5,
        py: 1.5,
      }}
    >
      <Stack spacing={1.2}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2" fontWeight={800}>
                {item.title || (item.itemType === "project" ? "Active Project Trip" : "Active Service Ticket")}
              </Typography>

              <Chip
                size="small"
                icon={item.itemType === "project" ? <ConstructionRoundedIcon sx={{ fontSize: 14 }} /> : <PlumbingRoundedIcon sx={{ fontSize: 14 }} />}
                label={item.itemType === "project" ? "Project" : "Service"}
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {item.subtitle || (item.itemType === "project" ? "Project" : "Customer")}
            </Typography>
          </Box>

          <Chip size="small" icon={statusMeta.icon} label={statusMeta.label} color={statusMeta.color} variant="outlined" sx={{ fontWeight: 700, flexShrink: 0 }} />
        </Stack>

        <Stack spacing={0.8}>
          {assignedPeople ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <EngineeringRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
              <Typography variant="body2" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Crew:
                </Box>{" "}
                {assignedPeople}
              </Typography>
            </Stack>
          ) : null}

          {address ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <PlaceRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
              <Typography variant="body2" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Address:
                </Box>{" "}
                {address}
              </Typography>
            </Stack>
          ) : null}

          <Stack direction="row" spacing={0.75} alignItems="flex-start">
            <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
            <Typography variant="body2" color="text.secondary">
              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
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
          sx={{ alignSelf: "flex-start", px: 0, minWidth: 0, borderRadius: 999, fontWeight: 700 }}
        >
          {item.itemType === "project" ? "Open Project" : "Open Ticket"}
        </Button>
      </Stack>
    </Box>
  );
}

function AreaSnapshotCard({ activeItems }: { activeItems: ActiveWorkItem[] }) {
  const theme = useTheme();
  const visibleFieldItems = useMemo(() => activeItems.filter(isFieldVisibleItem), [activeItems]);
  const mapUrl = useMemo(() => buildStaticMapUrl(visibleFieldItems), [visibleFieldItems]);

  return (
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
            sx={{ display: "block", width: "100%", height: { xs: 180, md: 220 }, objectFit: "cover" }}
          />

          <Box
            sx={{
              position: "absolute",
              left: 12,
              bottom: 12,
              borderRadius: 999,
              px: 1.25,
              py: 0.75,
              backgroundColor: alpha(theme.palette.background.paper, 0.86),
              backdropFilter: "blur(6px)",
              border: `1px solid ${alpha(theme.palette.common.white, 0.12)}`,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <MyLocationRoundedIcon sx={{ fontSize: 16, color: "primary.main" }} />
              <Typography variant="caption" sx={{ fontWeight: 800 }}>
                {visibleFieldItems.length} live field location{visibleFieldItems.length === 1 ? "" : "s"}
              </Typography>
            </Stack>
          </Box>
        </Box>
      ) : (
        <Box sx={{ height: 180, display: "grid", placeItems: "center", px: 2, textAlign: "center" }}>
          <Stack spacing={1} alignItems="center">
            <MyLocationRoundedIcon sx={{ color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              Add a Google Maps API key and active field addresses to show the live area snapshot.
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

function LiveFieldWorkSection({ activeItems }: { activeItems: ActiveWorkItem[] }) {
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
            <AreaSnapshotCard activeItems={activeItems} />

            <Stack spacing={1.25}>
              {activeItems.map((item) => (
                <ActiveWorkRow key={item.id} item={item} />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </SectionCard>
  );
}

export default function DashboardPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [reviewTickets, setReviewTickets] = useState<DashboardTicketItem[]>([]);
  const [followUpTickets, setFollowUpTickets] = useState<DashboardTicketItem[]>([]);
  const [activeItems, setActiveItems] = useState<ActiveWorkItem[]>([]);
  const [dashboardProjects, setDashboardProjects] = useState<DashboardProjectDoc[]>([]);
  const [dashboardProjectTrips, setDashboardProjectTrips] = useState<ProjectTripDocLite[]>([]);
  const [dashboardMaterialOrders, setDashboardMaterialOrders] = useState<DashboardMaterialOrderDoc[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    setDashboardLoading(true);

    const unsubFollowUp = onSnapshot(
      query(collection(db, "serviceTickets"), where("status", "==", "follow_up"), limit(50)),
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName: safeTrim(data.customerDisplayName) || "Customer",
              issueSummary: safeTrim(data.issueSummary) || "Service Ticket",
              serviceAddressLine1: safeTrim(data.serviceAddressLine1) || undefined,
              serviceCity: safeTrim(data.serviceCity) || undefined,
              serviceState: safeTrim(data.serviceState) || undefined,
              updatedAt: safeTrim(data.updatedAt) || undefined,
              assignedTechnicianName: safeTrim(data.assignedTechnicianName) || undefined,
              assignedHelperName: safeTrim(data.assignedHelperName) || undefined,
              status: safeTrim(data.status) || undefined,
            } satisfies DashboardTicketItem;
          })
          .sort(ticketSort);
        setFollowUpTickets(items);
      },
      () => setFollowUpTickets([]),
    );

    const unsubReview = onSnapshot(
      query(collection(db, "serviceTickets"), where("billing.status", "==", "ready_to_bill"), limit(50)),
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName: safeTrim(data.customerDisplayName) || "Customer",
              issueSummary: safeTrim(data.issueSummary) || "Service Ticket",
              serviceAddressLine1: safeTrim(data.serviceAddressLine1) || undefined,
              serviceCity: safeTrim(data.serviceCity) || undefined,
              serviceState: safeTrim(data.serviceState) || undefined,
              updatedAt: safeTrim(data.updatedAt) || undefined,
              readyToBillAt: safeTrim(data.billing?.readyToBillAt) || undefined,
              assignedTechnicianName: safeTrim(data.assignedTechnicianName) || undefined,
              assignedHelperName: safeTrim(data.assignedHelperName) || undefined,
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
            customerDisplayName: safeTrim(data.customerDisplayName) || "Customer",
            contactName: safeTrim(data.contactName) || undefined,
            contactPhone: safeTrim(data.contactPhone) || undefined,
            requestSummary: safeTrim(data.requestSummary) || "Material Order",
            status: safeTrim(data.status) || undefined,
            targetPickupDate: safeTrim(data.targetPickupDate) || undefined,
            pickup: data.pickup ?? null,
            billing: data.billing ?? null,
            poNumbers: Array.isArray(data.poNumbers) ? data.poNumbers : [],
            purchaseOrders: Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [],
            supplierInvoices: Array.isArray(data.supplierInvoices) ? data.supplierInvoices : [],
            supplierCostTotal: typeof data.supplierCostTotal === "number" ? data.supplierCostTotal : null,
            customerPriceTotal: typeof data.customerPriceTotal === "number" ? data.customerPriceTotal : null,
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
            customerDisplayName: safeTrim(data.customerDisplayName) || "Customer",
            projectType: safeTrim(data.projectType) || "other",
            serviceAddressLine1: safeTrim(data.serviceAddressLine1) || undefined,
            serviceCity: safeTrim(data.serviceCity) || undefined,
            serviceState: safeTrim(data.serviceState) || undefined,
            servicePostalCode: safeTrim(data.servicePostalCode) || undefined,
            projectOfficeStatus: safeTrim(data.projectOfficeStatus) || undefined,
            fieldCompletedAt: safeTrim(data.fieldCompletedAt) || undefined,
            readyToInvoiceAt: safeTrim(data.readyToInvoiceAt) || undefined,
            readyToInvoiceByName: safeTrim(data.readyToInvoiceByName) || undefined,
            currentBillingPeriodId: safeTrim(data.currentBillingPeriodId) || undefined,
            billingPeriods: coerceBillingPeriods(data.billingPeriods),
            invoiceNumber: safeTrim(data.invoiceNumber) || undefined,
          } satisfies DashboardProjectDoc;
        });
        setDashboardProjects(items);
      },
      () => setDashboardProjects([]),
    );

    const unsubProjectTrips = onSnapshot(
      query(collection(db, "trips"), where("type", "==", "project"), limit(1000)),
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
            completedAt: safeTrim(data.completedAt) || safeTrim(data.actualEndAt) || undefined,
            startedAt: safeTrim(data.startedAt) || safeTrim(data.actualStartAt) || undefined,
            actualStartAt: safeTrim(data.actualStartAt) || undefined,
            actualEndAt: safeTrim(data.actualEndAt) || undefined,
            pauseBlocks: Array.isArray(data.pauseBlocks) ? data.pauseBlocks : null,
            notes: safeTrim(data.notes) || undefined,
            materialsSummary: safeTrim(data.materialsSummary) || undefined,
            materialsUsedToday: safeTrim(data.materialsUsedToday) || undefined,
            closeout: data.closeout ?? null,
            billingPeriodId: safeTrim(data.billingPeriodId) || undefined,
            billingPeriodSequence: typeof data.billingPeriodSequence === "number" ? data.billingPeriodSequence : undefined,
            billingPeriodLabel: safeTrim(data.billingPeriodLabel) || undefined,
            billingPeriodStatus: safeTrim(data.billingPeriodStatus) || undefined,
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
            const type = safeTrim(trip.type).toLowerCase() === "project" ? "project" : "service";
            const crew = ((trip.crewConfirmed || trip.crew) || {}) as TripCrew;
            const serviceTicketId = safeTrim(trip.link?.serviceTicketId || trip.serviceTicketId);
            const projectId = safeTrim(trip.link?.projectId || trip.projectId);

            if (type === "service" && serviceTicketId) {
              try {
                const serviceTicketSnap = await getDoc(doc(db, "serviceTickets", serviceTicketId));
                const data = serviceTicketSnap.exists() ? (serviceTicketSnap.data() as any) : {};

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
                  updatedAt: safeTrim(trip.updatedAt || trip.actualStartAt || trip.startedAt || data.updatedAt) || undefined,
                  status: safeTrim(trip.status) || undefined,
                  timerState: safeTrim(trip.timerState) || undefined,
                  assignedTechnicianName: safeTrim(crew.primaryTechName) || safeTrim(data.assignedTechnicianName) || undefined,
                  assignedHelperName: safeTrim(crew.helperName) || safeTrim(data.assignedHelperName) || undefined,
                  secondaryTechnicianName: safeTrim(crew.secondaryTechName) || undefined,
                  secondaryHelperName: safeTrim(crew.secondaryHelperName) || undefined,
                } satisfies ActiveWorkItem;
              } catch {
                return null;
              }
            }

            if (type === "project" && projectId) {
              try {
                const projectSnap = await getDoc(doc(db, "projects", projectId));
                const data = projectSnap.exists() ? (projectSnap.data() as any) : {};
                const projectName = safeTrim(data.projectName) || "Project Trip";
                const customerDisplayName = safeTrim(data.customerDisplayName) || "Project";

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
                  updatedAt: safeTrim(trip.updatedAt || trip.actualStartAt || trip.startedAt || data.updatedAt) || undefined,
                  status: safeTrim(trip.status) || undefined,
                  timerState: safeTrim(trip.timerState) || undefined,
                  assignedTechnicianName: safeTrim(crew.primaryTechName) || undefined,
                  assignedHelperName: safeTrim(crew.helperName) || undefined,
                  secondaryTechnicianName: safeTrim(crew.secondaryTechName) || undefined,
                  secondaryHelperName: safeTrim(crew.secondaryHelperName) || undefined,
                } satisfies ActiveWorkItem;
              } catch {
                return null;
              }
            }

            return null;
          }),
        );

        setActiveItems((items.filter(Boolean) as ActiveWorkItem[]).sort(statusSort));
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

  const projectAttentionCount = projectFollowUps.length + readyInvoiceProjects.length;

  const attentionCount = useMemo(() => {
    return new Set([
      ...followUpTickets.map((x) => `ticket_fu_${x.id}`),
      ...reviewTickets.map((x) => `ticket_rev_${x.id}`),
      ...projectFollowUps.map((x) => `project_fu_${x.projectId}`),
      ...readyInvoiceProjects.map((x) => `project_bill_${x.projectId}`),
      ...pendingMaterialOrders.map((x) => `material_pending_${x.id}`),
    ]).size;
  }, [followUpTickets, reviewTickets, projectFollowUps, readyInvoiceProjects, pendingMaterialOrders]);

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
      allowedRoles={["admin", "dispatcher", "manager", "billing", "office_display"]}
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
              <CardContent sx={{ p: { xs: 2.25, md: 3 }, "&:last-child": { pb: { xs: 2.25, md: 3 } } }}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                >
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip
                        icon={<DashboardRoundedIcon sx={{ fontSize: 16 }} />}
                        label="Dashboard"
                        size="small"
                        sx={{
                          borderRadius: 999,
                          fontWeight: 700,
                          backgroundColor: alpha(theme.palette.primary.main, 0.14),
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
                        variant={projectAttentionCount > 0 ? "filled" : "outlined"}
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />

                      <Chip
                        label={`${pendingMaterialOrders.length} material order${pendingMaterialOrders.length === 1 ? "" : "s"}`}
                        size="small"
                        color={pendingMaterialOrders.length > 0 ? "success" : "default"}
                        variant={pendingMaterialOrders.length > 0 ? "filled" : "outlined"}
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

                      <Typography variant="body1" color="text.secondary" sx={{ mt: 1, maxWidth: 940 }}>
                        This dashboard keeps office action items front and center while also giving dispatch a compact
                        view of live field work, project follow-ups, billing-ready projects, pending material orders,
                        current assignments, and active trip status across service and project work.
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button component={Link} href="/service-tickets" variant="outlined" endIcon={<ArrowForwardRoundedIcon />} sx={{ borderRadius: 999 }}>
                      Open Service Tickets
                    </Button>
                    <Button component={Link} href="/material-orders" variant="outlined" endIcon={<ArrowForwardRoundedIcon />} sx={{ borderRadius: 999 }}>
                      Open Material Orders
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            {dashboardLoading ? (
              <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }} icon={<CircularProgress size={18} />}>
                Loading dashboard queues...
              </Alert>
            ) : null}

            {attentionCount === 0 && activeItems.length === 0 && !dashboardLoading ? (
              <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                Nice — there are no current office attention items or active field jobs showing right now.
              </Alert>
            ) : null}

            <Box sx={{ display: { xs: "block", xl: "none" } }}>
              <LiveFieldWorkSection activeItems={activeItems} />
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.35fr) minmax(360px, 0.95fr)" },
                alignItems: "start",
              }}
            >
              <Stack spacing={2}>
                {reviewTickets.length > 0 ? (
                  <SectionCard
                    title="Needs Review"
                    subtitle="Completed service work that is ready for office review and billing follow-through."
                    icon={<AssignmentTurnedInRoundedIcon />}
                    count={reviewTickets.length}
                    accent="primary"
                  >
                    <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
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
                    <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
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
                    <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
                      {followUpTickets.map((item) => (
                        <TicketRow key={item.id} item={item} mode="follow_up" />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {reviewTickets.length === 0 && followUpTickets.length === 0 && pendingMaterialOrders.length === 0 ? (
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
                          There are no current service tickets or pending material orders in the office review queues.
                        </Typography>

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
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
                  <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: "1fr 1fr" }}>
                    {[
                      { label: "Active Now", value: activeItems.length },
                      { label: "Needs Review", value: reviewTickets.length },
                      { label: "Follow-Up", value: followUpTickets.length },
                      { label: "Project Follow-Ups", value: projectFollowUps.length },
                      { label: "Ready To Invoice", value: readyInvoiceProjects.length },
                      { label: "Pending Materials", value: pendingMaterialOrders.length },
                      { label: "Attention Total", value: attentionCount },
                    ].map((item) => (
                      <Box
                        key={item.label}
                        sx={{
                          borderRadius: 1.2,
                          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                          backgroundColor: alpha(theme.palette.common.white, 0.02),
                          px: 1.5,
                          py: 1.5,
                        }}
                      >
                        <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em" }}>
                          {item.value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </SectionCard>
              </Stack>
            </Box>

            {projectFollowUps.length > 0 || readyInvoiceProjects.length > 0 ? (
              <SectionCard
                title="Projects Attention Center"
                subtitle="Project follow-ups from field closeouts and billing-ready projects that need office action."
                icon={<ConstructionRoundedIcon />}
                count={projectAttentionCount}
                accent="warning"
              >
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" } }}>
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
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                          <Stack direction="row" spacing={1} alignItems="center">
                            <AutorenewRoundedIcon color="warning" />
                            <Box>
                              <Typography variant="subtitle1" fontWeight={800}>
                                Project Follow-Ups
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                “Needs another day” signals from completed project trip closeouts.
                              </Typography>
                            </Box>
                          </Stack>
                          <Chip
                            size="small"
                            label={projectFollowUps.length}
                            color={projectFollowUps.length > 0 ? "warning" : "default"}
                            variant={projectFollowUps.length > 0 ? "filled" : "outlined"}
                            sx={{ fontWeight: 800 }}
                          />
                        </Stack>

                        {projectFollowUps.length === 0 ? (
                          <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                            No project follow-ups need attention right now.
                          </Alert>
                        ) : (
                          <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
                            {projectFollowUps.map((item) => (
                              <ProjectFollowUpRow key={item.projectId} item={item} />
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
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                          <Stack direction="row" spacing={1} alignItems="center">
                            <ReceiptLongRoundedIcon color="success" />
                            <Box>
                              <Typography variant="subtitle1" fontWeight={800}>
                                Ready to Invoice Projects
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Current project billing work that is ready for office invoicing.
                              </Typography>
                            </Box>
                          </Stack>
                          <Chip
                            size="small"
                            label={readyInvoiceProjects.length}
                            color={readyInvoiceProjects.length > 0 ? "success" : "default"}
                            variant={readyInvoiceProjects.length > 0 ? "filled" : "outlined"}
                            sx={{ fontWeight: 800 }}
                          />
                        </Stack>

                        {readyInvoiceProjects.length === 0 ? (
                          <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                            No projects are waiting to be invoiced right now.
                          </Alert>
                        ) : (
                          <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
                            {readyInvoiceProjects.map((item) => (
                              <ReadyInvoiceProjectRow key={item.projectId} item={item} />
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
