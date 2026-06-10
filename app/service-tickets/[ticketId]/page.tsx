// app/service-tickets/[ticketId]/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
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
  CardHeader,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import AddHomeRoundedIcon from "@mui/icons-material/AddHomeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import MovieRoundedIcon from "@mui/icons-material/MovieRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import AddressAutocompleteField from "../../../components/AddressAutocompleteField";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { getPayrollWeekBounds } from "../../../src/lib/payroll";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import {
  type CompanyHolidayLite,
  type CrewMemberSelection,
  type PtoRequestLite,
  type TripDocLite,
  getHolidayNamesForDate,
  normalizeCompanyHoliday,
  windowToTimes as availabilityWindowToTimes,
} from "../../../src/lib/trip-availability";
import {
  canCancelTrip,
  canEditTripSchedule,
  canFinishTrip,
  canPauseTrip,
  canResumeTrip,
  canStartTrip,
  formatLifecycleTripStatus,
  hasInProgressTrips,
  hasOpenTrips,
  isTicketTerminal,
  normalizeTripStatus,
} from "../../../src/lib/service-ticket-lifecycle";
import type { AppUser } from "../../../src/types/app-user";
import { generatePurchaseOrderForTrip } from "../../../src/lib/purchase-orders";
import type {
  ServiceTicket,
  ServiceTicketStatus,
} from "../../../src/types/service-ticket";
import ServiceTicketLocationCard from "../../../components/service-tickets/ServiceTicketLocationCard";

type Props = {
  params: Promise<{ ticketId: string }>;
};

type TicketStatus = ServiceTicketStatus;

type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

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

type PauseBlock = {
  startAt: string;
  endAt: string | null;
};

type TripMaterial = {
  id?: string;
  name: string;
  qty: number;
  unit?: string;
  notes?: string;
  imported?: boolean;
  source?: "manual" | "supplier_invoice";
  poCode?: string;
  supplierName?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceId?: string;
  supplierLineKey?: string;
  supplierSku?: string | null;
  unitCost?: number | null;
  lineTotal?: number | null;
  reviewStatus?: "pending" | "edited" | "approved";
  importedAt?: string;
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
  type: "service" | "project";
  status: string;
  date: string;
  timeWindow: TripTimeWindow | string;
  startTime: string;
  endTime: string;
  crew?: TripCrew | null;
  crewConfirmed?: TripCrew | null;
  dispatchOverride?: DispatchOverrideInfo | null;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  };
  notes?: string | null;
  cancelReason?: string | null;
  timerState?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  startedByUid?: string | null;
  endedByUid?: string | null;
  pauseBlocks?: PauseBlock[];
  actualMinutes?: number | null;
  billableHours?: number | null;
  workNotes?: string | null;
  resolutionNotes?: string | null;
  followUpNotes?: string | null;
  materials?: TripMaterial[] | null;
  noMaterialsUsed?: boolean | null;
  outcome?: "resolved" | "follow_up" | string | null;
  readyToBillAt?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;
};

type BillingPacket = {
  status:
    | "not_ready"
    | "ready_to_bill"
    | "creating_invoice"
    | "invoice_failed"
    | "invoiced";
  readyToBillAt: string | null;
  readyToBillTripId: string | null;
  resolutionNotes: string | null;
  workNotes: string | null;
  labor: {
    totalHours: number;
    byCrew: Array<{
      uid: string;
      name: string;
      role: "technician";
      hours: number;
    }>;
  };
  materials: TripMaterial[];
  materialsSummary?: string | null;
  materialsAmount?: number | null;
  photos: Array<{ url: string; caption?: string }>;
  invoiceSource?: "manual" | "qbo" | null;
  qboInvoiceId?: string | null;
  qboDocNumber?: string | null;
  qboInvoiceUrl?: string | null;
  qboSyncedAt?: string | null;
  qboInvoiceStatus?: string | null;
  invoiceError?: string | null;
  updatedAt: string;
};

type FollowUpClosure = {
  status: "closed_without_return_visit";
  reasonCode: string;
  reasonLabel: string;
  note: string;
  sourceTripId: string | null;
  closedAt: string;
  closedByUid: string | null;
  closedByName: string | null;
  closedByRole: string | null;
};

type TicketWithBilling = ServiceTicket & {
  serviceAddressId?: string | null;
  billing?: BillingPacket | null;
  followUpClosure?: FollowUpClosure | null;
};

type PurchaseOrderAttachment = {
  id: string;
  filename: string;
  contentType?: string;
  size?: number;
  storagePath?: string;
  downloadUrl?: string;
  uploadedAt?: string;
};

type PurchaseOrderLite = {
  id: string;
  poCode: string;
  poIndex?: number;
  poSuffix?: string;
  status: "open" | "matched" | "cancelled" | "closed" | string;
  serviceTicketId: string;
  tripId: string;
  requestedByUid?: string | null;
  requestedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  vendorName?: string | null;
  matchedInvoiceId?: string | null;
  matchedAttachmentIds?: string[];
  invoiceEmailMessageId?: string | null;
  invoiceEmailSubject?: string | null;
  invoiceEmailFrom?: string | null;
  invoiceEmailMatchedAt?: string | null;
  invoiceAttachmentCount?: number;
  invoicePdfAttachmentCount?: number;
  matchedAttachments?: PurchaseOrderAttachment[];
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

type CustomerServiceAddressOption = {
  id: string;
  label?: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  notes?: string | null;
  active?: boolean;
  isPrimary?: boolean;
  source?: string | null;
  createdAt?: string;
  updatedAt?: string;
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

type FinishMode = "none" | "follow_up" | "resolved";

type ExistingTimeEntry = {
  hours?: number;
  hoursLocked?: boolean;
  createdAt?: string;
  createdByUid?: string | null;
};

type DispatchConflictSummary = {
  hardMessages: string[];
  softMessages: string[];
  softTripIds: string[];
  softConflictTypes: string[];
};

type ServiceTicketActivityEntry = {
  id: string;
  type?: string;
  title?: string;
  description?: string | null;
  details?: string[];
  createdAt?: string;
  createdByName?: string | null;
  createdByRole?: string | null;
};

type ServiceTicketAttachmentPhase =
  | "customer_sent"
  | "before_visit"
  | "during_visit"
  | "after_visit";

type ServiceTicketAttachmentFileType = "image" | "video" | "pdf" | "other";

type ServiceTicketAttachment = {
  id: string;
  fileName: string;
  originalFileName?: string | null;
  fileType: ServiceTicketAttachmentFileType;
  contentType?: string | null;
  size?: number | null;
  storagePath?: string | null;
  downloadUrl?: string | null;
  note?: string | null;
  phase: ServiceTicketAttachmentPhase;
  tripId?: string | null;
  active?: boolean;
  uploadedAt?: string;
  uploadedByUid?: string | null;
  uploadedByName?: string | null;
  uploadedByRole?: string | null;
  deletedAt?: string | null;
  deletedByUid?: string | null;
};

type SeparateServiceRequestChoice = "no" | "yes";

type MobileCompletionResult = {
  mode: "resolved" | "follow_up";
  originalTicketId: string;
  newTicketId?: string | null;
  newTicketSummary?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeDateLike(value: any): string | null {
  if (!value) return null;

  if (typeof value === "string") return value;

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? value.toISOString() : null;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    const time = date.getTime();
    return Number.isFinite(time) ? date.toISOString() : null;
  }

  if (typeof value?.toDate === "function") {
    try {
      const date = value.toDate();
      const time = date?.getTime?.();
      return Number.isFinite(time) ? date.toISOString() : null;
    } catch {
      return null;
    }
  }

  const seconds = Number(value?.seconds);
  const nanoseconds = Number(value?.nanoseconds || 0);
  if (Number.isFinite(seconds)) {
    const date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
    const time = date.getTime();
    return Number.isFinite(time) ? date.toISOString() : null;
  }

  return null;
}

function normalizeBillingPacket(value: any): BillingPacket | null {
  if (!value || typeof value !== "object") return null;

  return {
    ...value,
    readyToBillAt: normalizeDateLike(value.readyToBillAt),
    qboSyncedAt: normalizeDateLike(value.qboSyncedAt),
    updatedAt: normalizeDateLike(value.updatedAt) || nowIso(),
  } as BillingPacket;
}

const FOLLOW_UP_CLOSURE_REASONS = [
  {
    code: "customer_declined",
    label: "Customer declined additional service",
  },
  {
    code: "other_contractor",
    label: "Customer had another contractor complete work",
  },
  {
    code: "issue_no_longer_requires_service",
    label: "Customer reports issue no longer requires service",
  },
  {
    code: "unable_to_proceed",
    label: "Unable to proceed / customer unresponsive",
  },
  {
    code: "other",
    label: "Other",
  },
] as const;

function normalizeFollowUpClosure(value: any): FollowUpClosure | null {
  if (!value || typeof value !== "object") return null;
  if (String(value.status || "").trim() !== "closed_without_return_visit") return null;

  return {
    status: "closed_without_return_visit",
    reasonCode: String(value.reasonCode || "other"),
    reasonLabel: String(value.reasonLabel || "Other"),
    note: String(value.note || ""),
    sourceTripId: value.sourceTripId ? String(value.sourceTripId) : null,
    closedAt: normalizeDateLike(value.closedAt) || nowIso(),
    closedByUid: value.closedByUid ? String(value.closedByUid) : null,
    closedByName: value.closedByName ? String(value.closedByName) : null,
    closedByRole: value.closedByRole ? String(value.closedByRole) : null,
  };
}

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatActivityDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hhmmLocal(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function addMinutes(date: Date, mins: number) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}

function roundToHalf(hours: number) {
  return Math.round(hours * 2) / 2;
}

function normalizeRole(role?: string) {
  return String(role || "").trim().toLowerCase();
}

function safeStr(x: unknown) {
  return String(x ?? "").trim();
}

function middleTruncate(value: unknown, front = 8, back = 5) {
  const text = safeStr(value);
  if (!text) return "";
  if (text.length <= front + back + 1) return text;
  return `${text.slice(0, front)}…${text.slice(-back)}`;
}

function getAttachmentFileType(
  contentType?: string | null,
  fileName?: string | null
): ServiceTicketAttachmentFileType {
  const type = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "other";
}

function formatAttachmentPhase(value?: string | null) {
  switch (String(value || "").trim().toLowerCase()) {
    case "customer_sent":
      return "Customer Sent";
    case "before_visit":
      return "Before Visit";
    case "during_visit":
      return "During Visit";
    case "after_visit":
      return "After Visit";
    default:
      return "Attachment";
  }
}

function formatBytes(value?: number | null) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeStorageFileName(fileName: string) {
  const clean = String(fileName || "attachment")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return clean.slice(0, 120) || "attachment";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id_${Math.random().toString(36).slice(2, 11)}`;
}

function buildInlineAddress(
  line1?: string | null,
  line2?: string | null,
  city?: string | null,
  state?: string | null,
  postal?: string | null
) {
  return [line1, line2, city, state, postal]
    .map((x) => safeStr(x))
    .filter(Boolean)
    .join(", ");
}

function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((x) => stripUndefined(x)) as unknown as T;
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as unknown as T;
  }
  return obj;
}

function formatTicketStatus(value?: string) {
  switch (String(value || "").toLowerCase()) {
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
    case "invoiced":
      return "Invoiced";
    case "cancelled":
      return "Cancelled";
    default:
      return value || "—";
  }
}

function formatBillingPacketStatus(value?: string) {
  switch (String(value || "").toLowerCase()) {
    case "not_ready":
      return "Not Ready";
    case "ready_to_bill":
      return "Ready to Bill";
    case "creating_invoice":
      return "Creating Invoice";
    case "invoice_failed":
      return "Invoice Failed";
    case "invoiced":
      return "Invoiced";
    default:
      return value || "—";
  }
}

function formatPurchaseOrderStatus(value?: string) {
  switch (String(value || "open").toLowerCase()) {
    case "matched":
      return "Matched";
    case "closed":
      return "Closed";
    case "cancelled":
      return "Cancelled";
    case "open":
    default:
      return "Open";
  }
}

function getPurchaseOrderTone(
  value?: string
): "default" | "success" | "warning" | "error" | "info" {
  const v = String(value || "open").toLowerCase();
  if (v === "matched" || v === "closed") return "success";
  if (v === "cancelled") return "error";
  return "warning";
}

function formatPurchaseOrderDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function canGeneratePoForTripDetail(trip?: TripDoc | null) {
  if (!trip) return false;
  if (String(trip.type || "").toLowerCase() !== "service") return false;

  const status = String(trip.status || "").toLowerCase().trim();
  return status !== "complete" && status !== "completed" && status !== "cancelled";
}

function getBillingTone(
  value?: string
): "default" | "success" | "warning" | "error" | "info" {
  const v = String(value || "").toLowerCase();
  if (v === "invoiced") return "success";
  if (v === "ready_to_bill") return "warning";
  if (v === "creating_invoice") return "info";
  if (v === "invoice_failed") return "error";
  return "default";
}

function formatSingleMaterialLine(material?: TripMaterial | null) {
  const name = String(material?.name || "").trim();
  if (!name) return "";

  const qty = Number(material?.qty ?? 0);
  const unit = String(material?.unit || "").trim();
  const notes = String(material?.notes || "").trim();

  let line = name;

  if ((Number.isFinite(qty) && qty > 1) || unit) {
    const qtyPrefix = Number.isFinite(qty) && qty > 0 ? `${qty} of ` : "";
    line = `${qtyPrefix}${name}${unit ? ` (${unit})` : ""}`;
  }

  if (notes) {
    line = `${line} — ${notes}`;
  }

  return line;
}

function getImportedMaterialChips(materials?: TripMaterial[] | null) {
  const items = Array.isArray(materials) ? materials : [];

  return items.filter(
    (material) => material?.imported || material?.source === "supplier_invoice"
  );
}

function buildMaterialsSummaryFromLines(materials?: TripMaterial[] | null) {
  const items = Array.isArray(materials) ? materials : [];
  return items.map((m) => formatSingleMaterialLine(m)).filter(Boolean).join(", ");
}

function materialLinesToText(materials?: TripMaterial[] | null) {
  const items = Array.isArray(materials) ? materials : [];
  return items.map((m) => formatSingleMaterialLine(m)).filter(Boolean).join("\n");
}

function parseMaterialsText(value?: string, existingMaterials?: TripMaterial[] | null) {
  const existingImported = (Array.isArray(existingMaterials) ? existingMaterials : []).filter(
    (material) => material?.imported || material?.source === "supplier_invoice"
  );

  const manualLines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const importedLineText = new Set(
    existingImported.map((material) => formatSingleMaterialLine(material).trim())
  );

  const manualMaterials = manualLines
    .filter((line) => !importedLineText.has(line))
    .map((line) => ({
      name: line,
      qty: 1,
      source: "manual" as const,
    } satisfies TripMaterial));

  return [...existingImported, ...manualMaterials];
}

function getPreviewText(value?: string | null, maxLength = 220) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function getHelperPayrollSummary(trip: Pick<TripDoc, "crew" | "crewConfirmed">) {
  const assignedHelpers = [
    String(trip.crew?.helperName || "").trim(),
    String(trip.crew?.secondaryHelperName || "").trim(),
  ].filter(Boolean);

  const confirmedHelpers = [
    String(trip.crewConfirmed?.helperName || "").trim(),
    String(trip.crewConfirmed?.secondaryHelperName || "").trim(),
  ].filter(Boolean);

  if (assignedHelpers.length === 0) {
    return "No helper assigned";
  }

  if (confirmedHelpers.length === 0) {
    return "No";
  }

  return `Yes — ${confirmedHelpers.join(", ")}`;
}

function mergeTripMaterials(trips: TripDoc[]) {
  return trips
    .flatMap((trip) => (Array.isArray(trip.materials) ? trip.materials : []))
    .filter((item) => String(item?.name || "").trim());
}

function getDefaultBillableHours(actualMinutes: number) {
  const safeMinutes = Math.max(0, Number(actualMinutes || 0));
  return Math.max(1, roundToHalf(safeMinutes / 60));
}

function getStoredOrComputedBillableHours(
  trip: Pick<TripDoc, "billableHours" | "actualMinutes">
) {
  const stored = Number(trip.billableHours);
  if (Number.isFinite(stored) && stored > 0) {
    return roundToHalf(stored);
  }
  return getDefaultBillableHours(Number(trip.actualMinutes || 0));
}

function buildBillingPacketFromResolvedTrips(args: {
  trips: TripDoc[];
  fallbackUpdatedAt: string;
}) {
  const completedTrips = args.trips.filter(
    (trip) => normalizeTripStatus(trip.status) === "complete"
  );

  const resolvedTrips = completedTrips.filter(
    (trip) => String(trip.outcome || "").trim().toLowerCase() === "resolved"
  );

  if (completedTrips.length === 0 || resolvedTrips.length === 0) {
    return null;
  }

  const totalHours = completedTrips.reduce(
    (sum, trip) => sum + getStoredOrComputedBillableHours(trip),
    0
  );

  const materials = mergeTripMaterials(completedTrips);
  const materialsSummary = buildMaterialsSummaryFromLines(materials) || null;

  const uniqueResolutionNotes = Array.from(
    new Set(
      resolvedTrips
        .map((trip) => String(trip.resolutionNotes || "").trim())
        .filter(Boolean)
    )
  );

  const uniqueWorkNotes = Array.from(
    new Set(
      completedTrips
        .map((trip) => String(trip.workNotes || "").trim())
        .filter(Boolean)
    )
  );

  const latestResolvedTrip = [...resolvedTrips].sort((a, b) => {
    const timeDiff = getTripSortTime(b) - getTripSortTime(a);
    if (timeDiff !== 0) return timeDiff;

    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    return String(b.id || "").localeCompare(String(a.id || ""));
  })[0];

  return {
    status: "ready_to_bill" as const,
    readyToBillAt:
      latestResolvedTrip?.readyToBillAt ||
      latestResolvedTrip?.updatedAt ||
      args.fallbackUpdatedAt,
    readyToBillTripId: latestResolvedTrip?.id || null,
    resolutionNotes: uniqueResolutionNotes.join("\n\n") || null,
    workNotes: uniqueWorkNotes.join("\n\n") || null,
    labor: {
      totalHours: roundToHalf(totalHours),
      byCrew: [],
    },
    materials,
    materialsSummary,
    materialsAmount: null,
    photos: [],
    invoiceSource: null,
    qboInvoiceId: null,
    qboDocNumber: null,
    qboInvoiceUrl: null,
    qboSyncedAt: null,
    qboInvoiceStatus: null,
    invoiceError: null,
    updatedAt: args.fallbackUpdatedAt,
  };
}

function buildBillingPacketFromClosedFollowUp(args: {
  trips: TripDoc[];
  fallbackUpdatedAt: string;
  reasonLabel: string;
  closureNote: string;
}) {
  const completedTrips = args.trips.filter(
    (trip) => normalizeTripStatus(trip.status) === "complete"
  );

  const latestCompletedTrip = getLatestCompletedTripForLifecycle(args.trips);
  const latestOutcome = String(latestCompletedTrip?.outcome || "")
    .trim()
    .toLowerCase();

  if (
    completedTrips.length === 0 ||
    !latestCompletedTrip ||
    latestOutcome !== "follow_up"
  ) {
    return null;
  }

  const totalHours = completedTrips.reduce(
    (sum, trip) => sum + getStoredOrComputedBillableHours(trip),
    0
  );

  const materials = mergeTripMaterials(completedTrips);
  const materialsSummary = buildMaterialsSummaryFromLines(materials) || null;

  const uniqueWorkNotes = Array.from(
    new Set(
      completedTrips
        .map((trip) => String(trip.workNotes || "").trim())
        .filter(Boolean)
    )
  );

  return {
    status: "ready_to_bill" as const,
    readyToBillAt: args.fallbackUpdatedAt,
    readyToBillTripId: latestCompletedTrip.id,
    resolutionNotes: [
      `Follow-up closed without return visit — ${args.reasonLabel}.`,
      args.closureNote.trim(),
    ]
      .filter(Boolean)
      .join("\n\n"),
    workNotes: uniqueWorkNotes.join("\n\n") || null,
    labor: {
      totalHours: roundToHalf(totalHours),
      byCrew: [],
    },
    materials,
    materialsSummary,
    materialsAmount: null,
    photos: [],
    invoiceSource: null,
    qboInvoiceId: null,
    qboDocNumber: null,
    qboInvoiceUrl: null,
    qboSyncedAt: null,
    qboInvoiceStatus: null,
    invoiceError: null,
    updatedAt: args.fallbackUpdatedAt,
  };
}

function validateTripMaterialsCapture(args: {
  materials: TripMaterial[];
  noMaterialsUsed: boolean;
}) {
  const cleaned = (args.materials || [])
    .map((m) =>
      stripUndefined({
        ...m,
        name: String(m.name || "").trim(),
        qty: Number(m.qty),
        unit: String(m.unit || "").trim() || undefined,
        notes: String(m.notes || "").trim() || undefined,
      })
    )
    .filter((m) => m.name);

  for (const m of cleaned) {
    if (!Number.isFinite(m.qty) || m.qty <= 0) {
      return {
        ok: false as const,
        message: `Material "${m.name}" must have qty > 0.`,
      };
    }
  }

  if (!args.noMaterialsUsed && cleaned.length < 1) {
    return {
      ok: false as const,
      message: "Enter materials used or check No materials used.",
    };
  }

  return { ok: true as const, cleaned };
}

function formatTripWindow(value?: string) {
  if (value === "am") return "AM";
  if (value === "pm") return "PM";
  if (value === "all_day") return "All Day";
  if (value === "custom") return "Custom";
  return value || "—";
}

function windowToTimes(window: TripTimeWindow) {
  if (window === "am") return { start: "08:00", end: "12:00" };
  if (window === "pm") return { start: "13:00", end: "17:00" };
  if (window === "all_day") return { start: "08:00", end: "17:00" };
  return { start: "09:00", end: "10:00" };
}

function minutesBetweenIso(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function sumPausedMinutes(blocks?: PauseBlock[], openPauseEndIso?: string) {
  if (!Array.isArray(blocks)) return 0;

  let total = 0;

  for (const block of blocks) {
    if (!block?.startAt) continue;

    const effectiveEnd = block.endAt || openPauseEndIso;
    if (!effectiveEnd) continue;

    total += minutesBetweenIso(block.startAt, effectiveEnd);
  }

  return total;
}

function isUidOnTripCrew(uid: string, crew?: TripCrew | null) {
  if (!uid || !crew) return false;
  return (
    crew.primaryTechUid === uid ||
    crew.helperUid === uid ||
    crew.secondaryTechUid === uid ||
    crew.secondaryHelperUid === uid
  );
}

function crewMembersFromTrip(trip: {
  crewConfirmed?: TripCrew | null;
  crew?: TripCrew | null;
}) {
  const crew = trip.crewConfirmed || trip.crew || {};
  const out: Array<{ uid: string; name: string; role: "technician" | "helper" }> =
    [];

  if (crew.primaryTechUid) {
    out.push({
      uid: crew.primaryTechUid,
      name: crew.primaryTechName || "Primary Tech",
      role: "technician",
    });
  }

  if (crew.helperUid) {
    out.push({
      uid: crew.helperUid,
      name: crew.helperName || "Helper",
      role: "helper",
    });
  }

  if (crew.secondaryTechUid) {
    out.push({
      uid: crew.secondaryTechUid,
      name: crew.secondaryTechName || "Secondary Tech",
      role: "technician",
    });
  }

  if (crew.secondaryHelperUid) {
    out.push({
      uid: crew.secondaryHelperUid,
      name: crew.secondaryHelperName || "Secondary Helper",
      role: "helper",
    });
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    if (!x.uid || seen.has(x.uid)) return false;
    seen.add(x.uid);
    return true;
  });
}

function isOpenTripRecord(tripLike: {
  active?: boolean | null;
  status?: string | null;
}) {
  if (tripLike.active === false) return false;
  const status = normalizeTripStatus(tripLike.status);
  return status === "planned" || status === "in_progress";
}

function isRunningTripRecord(tripLike: {
  active?: boolean | null;
  status?: string | null;
  timerState?: string | null;
}) {
  if (tripLike.active === false) return false;
  const status = normalizeTripStatus(tripLike.status);
  const timerState = String(tripLike.timerState || "").trim().toLowerCase();
  return status === "in_progress" && timerState === "running";
}

function getTripSortTime(
  trip: Pick<
    TripDoc,
    | "actualEndAt"
    | "readyToBillAt"
    | "updatedAt"
    | "date"
    | "endTime"
    | "startTime"
    | "id"
  >
) {
  const directTime = Date.parse(
    String(trip.actualEndAt || trip.readyToBillAt || trip.updatedAt || "")
  );

  if (Number.isFinite(directTime)) {
    return directTime;
  }

  const date = String(trip.date || "").trim();
  const time = String(trip.endTime || trip.startTime || "00:00").trim();

  const dateTime = Date.parse(`${date}T${time || "00:00"}:00`);
  if (Number.isFinite(dateTime)) {
    return dateTime;
  }

  return 0;
}

function getLatestCompletedTripForLifecycle(trips: TripDoc[]) {
  const completedTrips = trips.filter(
    (trip) => normalizeTripStatus(trip.status) === "complete"
  );

  return (
    [...completedTrips].sort((a, b) => {
      const timeDiff = getTripSortTime(b) - getTripSortTime(a);
      if (timeDiff !== 0) return timeDiff;

      const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateDiff !== 0) return dateDiff;

      const startDiff = String(b.startTime || "").localeCompare(
        String(a.startTime || "")
      );
      if (startDiff !== 0) return startDiff;

      return String(b.id || "").localeCompare(String(a.id || ""));
    })[0] || null
  );
}

function getLocalManualTicketStatusError(args: {
  nextStatus: TicketStatus;
  currentStatus: TicketStatus;
  trips: TripDoc[];
}) {
  const nextStatus = String(args.nextStatus || "").trim().toLowerCase();

  if (nextStatus === "invoiced") {
    return "Use the billing packet to mark this ticket invoiced.";
  }

  if (nextStatus === "completed") {
    const openTrips = args.trips
      .filter((trip) => trip.active !== false)
      .filter((trip) => {
        const status = normalizeTripStatus(trip.status);
        return status === "planned" || status === "in_progress";
      });

    if (openTrips.length > 0) {
      return "Completed cannot be set while this ticket still has an open trip.";
    }

    const latestCompletedTrip = getLatestCompletedTripForLifecycle(args.trips);

    if (!latestCompletedTrip) {
      return "Completed cannot be set until this ticket has a completed trip.";
    }

    const latestOutcome = String(
      latestCompletedTrip.outcome ||
        (latestCompletedTrip.readyToBillAt ? "resolved" : "")
    )
      .trim()
      .toLowerCase();

    if (latestOutcome === "follow_up") {
      return "The latest completed trip requires Follow Up. If the customer no longer needs a return visit, use “Close Follow-Up — Ready to Bill” in the Billing Packet section.";
    }
  }

  return "";
}

function normalizeTripTimerState(trip?: TripDoc | null) {
  const timer = String(trip?.timerState || "").toLowerCase().trim();
  const status = String(trip?.status || "").toLowerCase().trim();

  if (timer === "running" || timer === "paused" || timer === "complete") return timer;
  if (status === "in_progress") return "running";
  if (
    status === "complete" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return "complete";
  }

  return "not_started";
}

function isTripRunning(trip?: TripDoc | null) {
  return normalizeTripTimerState(trip) === "running";
}

function isTripPaused(trip?: TripDoc | null) {
  return normalizeTripTimerState(trip) === "paused";
}

function canCurrentUserQuickStartTrip(args: {
  trip: TripDoc;
  role?: AppUser["role"];
  uid: string;
  canStartTripRole: boolean;
}) {
  const { trip, role, uid, canStartTripRole } = args;

  if (!canStartTripRole || !uid) return false;
  if (isTripRunning(trip) || isTripPaused(trip)) return false;

  const status = String(trip.status || "").toLowerCase().trim();
  if (status === "cancelled" || status === "complete" || status === "completed") {
    return false;
  }

  if (role === "admin") return true;
  return isUidOnTripCrew(uid, trip.crew || null);
}

function crewUidsFromCrew(crew?: TripCrew | null) {
  return Array.from(
    new Set(
      [
        String(crew?.primaryTechUid || "").trim(),
        String(crew?.helperUid || "").trim(),
        String(crew?.secondaryTechUid || "").trim(),
        String(crew?.secondaryHelperUid || "").trim(),
      ].filter(Boolean)
    )
  );
}

function dateFallsWithinPto(date: string, request: PtoRequestLite) {
  return date >= String(request.startDate || "") && date <= String(request.endDate || "");
}

function tripHasCrewUidGeneric(trip: any, uid: string) {
  if (!uid) return false;
  return (
    String(trip?.crew?.primaryTechUid || "").trim() === uid ||
    String(trip?.crew?.helperUid || "").trim() === uid ||
    String(trip?.crew?.secondaryTechUid || "").trim() === uid ||
    String(trip?.crew?.secondaryHelperUid || "").trim() === uid
  );
}

function isPlannedTripLikeStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase() === "planned";
}

function isInProgressTripLikeStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase() === "in_progress";
}

function getTripRangeLite(trip: any) {
  const timeWindow = String(trip?.timeWindow || "").toLowerCase().trim();
  if (timeWindow === "am") return { start: "08:00", end: "12:00" };
  if (timeWindow === "pm") return { start: "13:00", end: "17:00" };
  if (timeWindow === "all_day") return { start: "08:00", end: "17:00" };
  return {
    start: String(trip?.startTime || ""),
    end: String(trip?.endTime || ""),
  };
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

function formatTime12h(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [hhRaw, mmRaw] = hhmm.split(":").map((x) => Number(x));
  let hh = hhRaw;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mmRaw === 0) return `${hh}${ampm}`;
  return `${hh}:${String(mmRaw).padStart(2, "0")}${ampm}`;
}

function collectDispatchOverrideConflicts(args: {
  members: CrewMemberSelection[];
  date: string;
  timeWindow: TripTimeWindow;
  startTime: string;
  endTime: string;
  dayTrips: TripDocLite[];
  ptoRequests: PtoRequestLite[];
  holidayNames: string[];
  holidayOverrideEnabled: boolean;
  excludeTripId?: string | null;
}) {
  const hard = new Set<string>();
  const soft = new Set<string>();
  const softTripIds = new Set<string>();
  const softConflictTypes = new Set<string>();

  const selectedRange =
    args.timeWindow === "custom"
      ? {
          start: String(args.startTime || ""),
          end: String(args.endTime || ""),
        }
      : availabilityWindowToTimes(args.timeWindow);

  if (args.holidayNames.length > 0 && !args.holidayOverrideEnabled) {
    hard.add(`Selected day is a company holiday (${args.holidayNames.join(", ")}).`);
  }

  for (const member of args.members) {
    const approvedPto = args.ptoRequests.find(
      (request) =>
        String(request.employeeId || "").trim() === member.uid &&
        String(request.status || "").trim().toLowerCase() === "approved" &&
        dateFallsWithinPto(args.date, request)
    );

    if (approvedPto) {
      hard.add(
        `${member.name} has approved PTO (${approvedPto.startDate} to ${approvedPto.endDate}).`
      );
    }

    for (const trip of args.dayTrips || []) {
      if (!trip || trip.active === false) continue;
      if (args.excludeTripId && String((trip as any).id || "") === args.excludeTripId) continue;
      if (!tripHasCrewUidGeneric(trip, member.uid)) continue;

      const status = String((trip as any).status || "").trim().toLowerCase();
      if (status !== "planned" && status !== "in_progress") continue;

      const tripRange = getTripRangeLite(trip);
      if (
        !rangesOverlap(
          selectedRange.start,
          selectedRange.end,
          tripRange.start,
          tripRange.end
        )
      ) {
        continue;
      }

      const detail = `${formatTime12h(tripRange.start)}–${formatTime12h(tripRange.end)}`;

      if (isInProgressTripLikeStatus((trip as any).status)) {
        soft.add(
          `${member.name} is currently on an in-progress trip (${detail}). Dispatch Override can schedule this as the next planned trip; it will not start until the current trip is completed or paused.`
        );
        softTripIds.add(String((trip as any).id || ""));
        softConflictTypes.add("in_progress_overlap");
      } else if (isPlannedTripLikeStatus((trip as any).status)) {
        soft.add(
          `${member.name} already has a scheduled trip (${detail}). Dispatch Override can be used if needed.`
        );
        softTripIds.add(String((trip as any).id || ""));
        softConflictTypes.add("scheduled_overlap");
      }
    }
  }

  return {
    hardMessages: Array.from(hard),
    softMessages: Array.from(soft),
    softTripIds: Array.from(softTripIds).filter(Boolean),
    softConflictTypes: Array.from(softConflictTypes),
  } satisfies DispatchConflictSummary;
}

function getOptionAvailabilityLabel(args: {
  baseLabel: string;
  uid: string;
  name: string;
  role: "technician" | "helper";
  date: string;
  timeWindow: TripTimeWindow;
  startTime: string;
  endTime: string;
  holidayNames: string[];
  holidayOverrideEnabled: boolean;
  ptoRequests: PtoRequestLite[];
  dayTrips: TripDocLite[];
  excludeTripId?: string | null;
}) {
  const selectedRange =
    args.timeWindow === "custom"
      ? {
          start: String(args.startTime || ""),
          end: String(args.endTime || ""),
        }
      : availabilityWindowToTimes(args.timeWindow);

  if (args.holidayNames.length > 0 && !args.holidayOverrideEnabled) {
    return {
      label: `${args.baseLabel} — Holiday`,
      disabled: true,
    };
  }

  const approvedPto = args.ptoRequests.find(
    (request) =>
      String(request.employeeId || "").trim() === args.uid &&
      String(request.status || "").trim().toLowerCase() === "approved" &&
      dateFallsWithinPto(args.date, request)
  );

  if (approvedPto) {
    return {
      label: `${args.baseLabel} — PTO`,
      disabled: true,
    };
  }

  for (const trip of args.dayTrips || []) {
    if (!trip || trip.active === false) continue;
    if (args.excludeTripId && String((trip as any).id || "") === args.excludeTripId) continue;
    if (!tripHasCrewUidGeneric(trip, args.uid)) continue;

    const status = String((trip as any).status || "").trim().toLowerCase();
    if (status !== "planned" && status !== "in_progress") continue;

    const tripRange = getTripRangeLite(trip);
    if (
      !rangesOverlap(
        selectedRange.start,
        selectedRange.end,
        tripRange.start,
        tripRange.end
      )
    ) {
      continue;
    }

    if (status === "in_progress") {
      return {
        label: `${args.baseLabel} — In Progress (override allowed)`,
        disabled: false,
      };
    }

    return {
      label: `${args.baseLabel} — Scheduled overlap (override allowed)`,
      disabled: false,
    };
  }

  return {
    label: args.baseLabel,
    disabled: false,
  };
}

async function findOpenTripsForTicketId(
  serviceTicketId: string,
  excludeTripId?: string
) {
  if (!serviceTicketId) return [];

  const queriesToRun = [
    query(collection(db, "trips"), where("link.serviceTicketId", "==", serviceTicketId)),
    query(collection(db, "trips"), where("serviceTicketId", "==", serviceTicketId)),
  ];

  const snaps = await Promise.all(
    queriesToRun.map(async (qTrips) => {
      try {
        return await getDocs(qTrips);
      } catch {
        return null;
      }
    })
  );

  const byId = new Map<
    string,
    {
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      timerState: string;
    }
  >();

  for (const snap of snaps) {
    if (!snap) continue;

    for (const docSnap of snap.docs) {
      if (excludeTripId && docSnap.id === excludeTripId) continue;

      const data = docSnap.data() as any;
      if (!isOpenTripRecord(data)) continue;

      byId.set(docSnap.id, {
        id: docSnap.id,
        date: String(data.date || ""),
        startTime: String(data.startTime || ""),
        endTime: String(data.endTime || ""),
        status: String(data.status || ""),
        timerState: String(data.timerState || ""),
      });
    }
  }

  return Array.from(byId.values());
}

async function findRunningTripsForCrewUids(args: {
  crewUids: string[];
  excludeTripId?: string;
}) {
  const cleanUids = Array.from(new Set((args.crewUids || []).filter(Boolean)));
  if (cleanUids.length === 0) return [];

  const fieldPaths = [
    "crew.primaryTechUid",
    "crew.helperUid",
    "crew.secondaryTechUid",
    "crew.secondaryHelperUid",
    "primaryTechUid",
    "helperUid",
    "secondaryTechUid",
    "secondaryHelperUid",
  ];

  const queryPromises: Promise<any>[] = [];

  for (const uid of cleanUids) {
    for (const fieldPath of fieldPaths) {
      queryPromises.push(
        getDocs(
          query(collection(db, "trips"), where(fieldPath as any, "==", uid))
        ).catch(() => null)
      );
    }
  }

  const snaps = await Promise.all(queryPromises);

  const byId = new Map<
    string,
    {
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      timerState: string;
      primaryName: string;
      summary: string;
    }
  >();

  for (const snap of snaps) {
    if (!snap) continue;

    for (const docSnap of snap.docs) {
      if (args.excludeTripId && docSnap.id === args.excludeTripId) continue;

      const data = docSnap.data() as any;
      if (!isRunningTripRecord(data)) continue;

      const crew = (data.crew || {}) as TripCrew;
      const primaryName =
        crew.primaryTechName ||
        data.primaryTechName ||
        data.primaryTechnicianName ||
        "Assigned Tech";

      byId.set(docSnap.id, {
        id: docSnap.id,
        date: String(data.date || ""),
        startTime: String(data.startTime || ""),
        endTime: String(data.endTime || ""),
        status: String(data.status || ""),
        timerState: String(data.timerState || ""),
        primaryName,
        summary: `${String(data.date || "No date")} • ${String(
          data.startTime || "—"
        )}-${String(data.endTime || "—")} • ${primaryName} • Trip ${docSnap.id}`,
      });
    }
  }

  return Array.from(byId.values());
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

async function upsertWeeklyTimesheetHeader(args: {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  weekStartDate: string;
  weekEndDate: string;
  createdByUid: string | null;
}) {
  const now = nowIso();
  const timesheetId = buildWeeklyTimesheetId(args.employeeId, args.weekStartDate);

  await setDoc(
    doc(db, "weeklyTimesheets", timesheetId),
    stripUndefined({
      employeeId: args.employeeId,
      employeeName: args.employeeName,
      employeeRole: args.employeeRole,
      weekStartDate: args.weekStartDate,
      weekEndDate: args.weekEndDate,
      status: "draft",
      createdAt: now,
      createdByUid: args.createdByUid || null,
      updatedAt: now,
      updatedByUid: args.createdByUid || null,
    }),
    { merge: true }
  );

  return timesheetId;
}

async function upsertTimeEntryFromTrip(args: {
  trip: TripDoc;
  member: { uid: string; name: string; role: "technician" | "helper" };
  entryDate: string;
  hoursGenerated: number;
  weekStartDate: string;
  weekEndDate: string;
  timesheetId: string;
  createdByUid: string | null;
  displayTitle: string;
  displaySubtitle: string;
  outcomeLabel: string;
  addressShort?: string;
}) {
  const now = nowIso();
  const timeEntryId = `trip_${args.trip.id}_${args.member.uid}`;
  const ref = doc(db, "timeEntries", timeEntryId);
  const existingSnap = await getDoc(ref);
  const existing = existingSnap.exists()
    ? (existingSnap.data() as ExistingTimeEntry)
    : null;
  const hoursLocked = Boolean(existing?.hoursLocked);
  const hoursToWrite = hoursLocked
    ? Number(existing?.hours ?? args.hoursGenerated)
    : args.hoursGenerated;

  const noteLines: string[] = [];
  if (args.displayTitle) noteLines.push(`Title: ${args.displayTitle}`);
  if (args.displaySubtitle) noteLines.push(`Detail: ${args.displaySubtitle}`);
  if (args.addressShort) noteLines.push(`Address: ${args.addressShort}`);
  if (args.outcomeLabel) noteLines.push(`Outcome: ${args.outcomeLabel}`);
  noteLines.push(`Trip: ${args.trip.id}`);

  await setDoc(
    ref,
    stripUndefined({
      employeeId: args.member.uid,
      employeeName: args.member.name,
      employeeRole: args.member.role,
      entryDate: args.entryDate,
      weekStartDate: args.weekStartDate,
      weekEndDate: args.weekEndDate,
      timesheetId: args.timesheetId,
      category: args.trip.type === "project" ? "project_stage" : "service_ticket",
      payType: "regular",
      billable: true,
      source: "trip_completion",
      hours: hoursToWrite,
      hoursSource: args.hoursGenerated,
      hoursLocked,
      tripId: args.trip.id,
      serviceTicketId: args.trip.link?.serviceTicketId || null,
      projectId: args.trip.link?.projectId || null,
      projectStageKey: args.trip.link?.projectStageKey || null,
      displayTitle: args.displayTitle || null,
      displaySubtitle: args.displaySubtitle || null,
      outcome: args.outcomeLabel.toLowerCase().replaceAll(" ", "_"),
      entryStatus: "draft",
      notes: noteLines.join("\n"),
      createdAt: existingSnap.exists() ? existing?.createdAt ?? now : now,
      createdByUid: existingSnap.exists()
        ? existing?.createdByUid ?? null
        : args.createdByUid || null,
      updatedAt: now,
      updatedByUid: args.createdByUid || null,
    }),
    { merge: true }
  );
}

function getTicketTone(
  status?: string
): "default" | "success" | "warning" | "error" | "info" {
  const s = String(status || "").toLowerCase();
  if (s === "invoiced") return "success";
  if (s === "completed") return "success";
  if (s === "in_progress") return "info";
  if (s === "scheduled" || s === "follow_up") return "warning";
  if (s === "cancelled") return "error";
  return "default";
}

function getTripTone(
  status?: string
): "default" | "success" | "warning" | "error" | "info" {
  const s = normalizeTripStatus(status);
  if (s === "complete") return "success";
  if (s === "in_progress") return "info";
  if (s === "planned") return "warning";
  if (s === "cancelled") return "error";
  return "default";
}

function Section(props: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 1.2,
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <CardHeader
        avatar={props.icon}
        action={props.action}
        sx={{
          minWidth: 0,
          "& .MuiCardHeader-content": { minWidth: 0 },
          "& .MuiCardHeader-action": {
            minWidth: 0,
            ml: 1,
          },
        }}
        title={
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ overflowWrap: "anywhere" }}
          >
            {props.title}
          </Typography>
        }
      />
      <Divider />
      <CardContent sx={{ minWidth: 0 }}>{props.children}</CardContent>
    </Card>
  );
}

export default function ServiceTicketDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const canDispatch =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const canWorkTrip =
    appUser?.role === "admin" ||
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  const canStartTripRole =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "technician";

  const canBill =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "billing";

  const canAddTicketAttachments =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  const canDeleteTicketAttachments =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const isFieldUser =
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  const myUid = appUser?.uid || "";

  const [mobileFinishTripId, setMobileFinishTripId] = useState<string | null>(null);
  const [mobileFinishMode, setMobileFinishMode] = useState<FinishMode>("none");
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());

  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState("");
  const [ticket, setTicket] = useState<TicketWithBilling | null>(null);
  const [error, setError] = useState("");
  const [activityEntries, setActivityEntries] = useState<ServiceTicketActivityEntry[]>([]);
  const [attachments, setAttachments] = useState<ServiceTicketAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentErr, setAttachmentErr] = useState("");
  const [attachmentOk, setAttachmentOk] = useState("");
  const [attachmentPhase, setAttachmentPhase] =
    useState<ServiceTicketAttachmentPhase>("customer_sent");
  const [attachmentNote, setAttachmentNote] = useState("");
  const [attachmentMenuAnchorEl, setAttachmentMenuAnchorEl] =
    useState<HTMLElement | null>(null);
  const attachmentCameraInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMediaInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [separateRequestChoiceByTrip, setSeparateRequestChoiceByTrip] = useState<
    Record<string, SeparateServiceRequestChoice>
  >({});
  const [separateRequestDescriptionByTrip, setSeparateRequestDescriptionByTrip] =
    useState<Record<string, string>>({});
  const [mobileCompletionResult, setMobileCompletionResult] =
    useState<MobileCompletionResult | null>(null);

  const isInvoicedTicket = ticket?.status === "invoiced";

  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [ptoRequests, setPtoRequests] = useState<PtoRequestLite[]>([]);
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHolidayLite[]>([]);
  const [availabilityTripsByDate, setAvailabilityTripsByDate] = useState<
    Record<string, TripDocLite[]>
  >({});
  const [tripHolidayOverride, setTripHolidayOverride] = useState(false);
  const [editTripHolidayOverride, setEditTripHolidayOverride] = useState(false);
  const [tripDispatchOverrideEnabled, setTripDispatchOverrideEnabled] =
    useState(false);
  const [tripDispatchOverrideReason, setTripDispatchOverrideReason] =
    useState("");
  const [editTripDispatchOverrideEnabled, setEditTripDispatchOverrideEnabled] =
    useState(false);
  const [editTripDispatchOverrideReason, setEditTripDispatchOverrideReason] =
    useState("");

  const [trips, setTrips] = useState<TripDoc[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderLite[]>([]);
  const [poGenerating, setPoGenerating] = useState(false);
  const [poError, setPoError] = useState("");
  const [poOk, setPoOk] = useState("");
  const [tripActionSaving, setTripActionSaving] = useState<Record<string, boolean>>(
    {}
  );
  const [tripActionError, setTripActionError] = useState<Record<string, string>>({});
  const [tripActionSuccess, setTripActionSuccess] = useState<Record<string, string>>(
    {}
  );
  const [tripWorkNotes, setTripWorkNotes] = useState<Record<string, string>>({});
  const [tripResolutionNotes, setTripResolutionNotes] = useState<Record<string, string>>(
    {}
  );
  const [tripFollowUpNotes, setTripFollowUpNotes] = useState<Record<string, string>>(
    {}
  );
  const [tripMaterials, setTripMaterials] = useState<Record<string, TripMaterial[]>>(
    {}
  );
  const [tripMaterialsText, setTripMaterialsText] = useState<Record<string, string>>(
    {}
  );
  const [tripNoMaterialsUsed, setTripNoMaterialsUsed] = useState<
    Record<string, boolean>
  >({});
  const [finishModeByTrip, setFinishModeByTrip] = useState<Record<string, FinishMode>>(
    {}
  );
  const [hoursOverrideByTrip, setHoursOverrideByTrip] = useState<
    Record<string, number>
  >({});
  const [helperConfirmedByTrip, setHelperConfirmedByTrip] = useState<
    Record<string, boolean>
  >({});

  const [ticketStatusEdit, setTicketStatusEdit] = useState<TicketStatus>("new");
  const [ticketEstimatedHoursEdit, setTicketEstimatedHoursEdit] = useState("4");
  const [ticketIssueSummaryEdit, setTicketIssueSummaryEdit] = useState("");
  const [ticketIssueDetailsEdit, setTicketIssueDetailsEdit] = useState("");
  const [ticketEditSaving, setTicketEditSaving] = useState(false);
  const [ticketEditErr, setTicketEditErr] = useState("");
  const [ticketEditOk, setTicketEditOk] = useState("");

  const [customerServiceAddresses, setCustomerServiceAddresses] = useState<
    CustomerServiceAddressOption[]
  >([]);
  const [showEditLocationDialog, setShowEditLocationDialog] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationErr, setLocationErr] = useState("");
  const [locationOk, setLocationOk] = useState("");
  const [selectedServiceAddressId, setSelectedServiceAddressId] = useState("");
  const [quickAddMode, setQuickAddMode] = useState(false);
  const [quickServiceLabel, setQuickServiceLabel] = useState("");
  const [quickServiceAddressSearch, setQuickServiceAddressSearch] = useState("");
  const [quickServiceAddressLine1, setQuickServiceAddressLine1] = useState("");
  const [quickServiceAddressLine2, setQuickServiceAddressLine2] = useState("");
  const [quickServiceCity, setQuickServiceCity] = useState("");
  const [quickServiceState, setQuickServiceState] = useState("");
  const [quickServicePostalCode, setQuickServicePostalCode] = useState("");
  const [quickServiceNotes, setQuickServiceNotes] = useState("");
  const [quickServiceAddressSource, setQuickServiceAddressSource] =
    useState("manual");

  const [tripDate, setTripDate] = useState(isoTodayLocal());
  const [tripTimeWindow, setTripTimeWindow] = useState<TripTimeWindow>("am");
  const [tripStartTime, setTripStartTime] = useState("08:00");
  const [tripEndTime, setTripEndTime] = useState("12:00");
  const [tripPrimaryTechUid, setTripPrimaryTechUid] = useState("");
  const [tripSecondaryTechUid, setTripSecondaryTechUid] = useState("");
  const [tripUseDefaultHelper, setTripUseDefaultHelper] = useState(true);
  const [tripHelperUid, setTripHelperUid] = useState("");
  const [tripSecondaryHelperUid, setTripSecondaryHelperUid] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [, setTripSaving] = useState(false);
  const [, setTripSaveError] = useState("");
  const [, setTripSaveSuccess] = useState("");

  const [editTripId, setEditTripId] = useState<string | null>(null);
  const [editTripDate, setEditTripDate] = useState(isoTodayLocal());
  const [editTripTimeWindow, setEditTripTimeWindow] = useState<TripTimeWindow>("am");
  const [editTripStartTime, setEditTripStartTime] = useState("08:00");
  const [editTripEndTime, setEditTripEndTime] = useState("12:00");
  const [editTripNotes, setEditTripNotes] = useState("");
  const [editTripSaving, setEditTripSaving] = useState(false);
  const [editTripErr, setEditTripErr] = useState("");
  const [editTripPrimaryTechUid, setEditTripPrimaryTechUid] = useState("");
  const [editTripSecondaryTechUid, setEditTripSecondaryTechUid] = useState("");
  const [editTripUseDefaultHelper, setEditTripUseDefaultHelper] = useState(true);
  const [editTripHelperUid, setEditTripHelperUid] = useState("");
  const [editTripSecondaryHelperUid, setEditTripSecondaryHelperUid] = useState("");

  const [billingSaving, setBillingSaving] = useState(false);
  const [billingErr, setBillingErr] = useState("");
  const [billingOk, setBillingOk] = useState("");
  const [billingMaterialsSummaryEdit, setBillingMaterialsSummaryEdit] = useState("");
  const [billingMaterialsAmountEdit, setBillingMaterialsAmountEdit] = useState("");
  const [showCloseFollowUpDialog, setShowCloseFollowUpDialog] = useState(false);
  const [closeFollowUpReason, setCloseFollowUpReason] = useState("customer_declined");
  const [closeFollowUpNote, setCloseFollowUpNote] = useState("");
  const [closeFollowUpSaving, setCloseFollowUpSaving] = useState(false);
  const [closeFollowUpErr, setCloseFollowUpErr] = useState("");

  const helperCandidates = useMemo(() => {
    const items = employeeProfiles
      .filter(
        (p) => String(p.employmentStatus || "current").toLowerCase() === "current"
      )
      .filter((p) => {
        const labor = normalizeRole(p.laborRole);
        return labor === "helper" || labor === "apprentice";
      })
      .map((p) => ({
        uid: String(p.userUid || "").trim(),
        name: p.displayName || "Unnamed",
        laborRole: normalizeRole(p.laborRole),
        defaultPairedTechUid: p.defaultPairedTechUid ?? null,
      }))
      .filter((p) => p.uid);

    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [employeeProfiles]);

  const defaultHelperForPrimary = useMemo(() => {
    const techUid = tripPrimaryTechUid.trim();
    if (!techUid) return "";
    return (
      helperCandidates.find(
        (h) => String(h.defaultPairedTechUid || "").trim() === techUid
      )?.uid || ""
    );
  }, [tripPrimaryTechUid, helperCandidates]);

  const defaultHelperForEditPrimary = useMemo(() => {
    const techUid = editTripPrimaryTechUid.trim();
    if (!techUid) return "";
    return (
      helperCandidates.find(
        (h) => String(h.defaultPairedTechUid || "").trim() === techUid
      )?.uid || ""
    );
  }, [editTripPrimaryTechUid, helperCandidates]);

  const scheduleHolidayNames = useMemo(
    () => getHolidayNamesForDate(companyHolidays, tripDate),
    [companyHolidays, tripDate]
  );

  const editHolidayNames = useMemo(
    () => getHolidayNamesForDate(companyHolidays, editTripDate),
    [companyHolidays, editTripDate]
  );

  useEffect(() => {
    if (!editTripUseDefaultHelper) return;
    if (!editTripPrimaryTechUid.trim()) {
      setEditTripHelperUid("");
      return;
    }
    setEditTripHelperUid(defaultHelperForEditPrimary);
  }, [editTripUseDefaultHelper, editTripPrimaryTechUid, defaultHelperForEditPrimary]);

  useEffect(() => {
    if (!ticket?.billing) {
      setBillingMaterialsSummaryEdit("");
      setBillingMaterialsAmountEdit("");
      return;
    }

    const summary =
      String(ticket.billing.materialsSummary || "").trim() ||
      buildMaterialsSummaryFromLines(ticket.billing.materials);

    setBillingMaterialsSummaryEdit(summary);

    const amount =
      typeof ticket.billing.materialsAmount === "number" &&
      Number.isFinite(ticket.billing.materialsAmount)
        ? String(ticket.billing.materialsAmount)
        : "";

    setBillingMaterialsAmountEdit(amount);
  }, [ticket?.billing]);

  useEffect(() => {
    async function loadAll() {
      try {
        const resolved = await params;
        const id = resolved.ticketId;
        setTicketId(id);

        const ticketSnap = await getDoc(doc(db, "serviceTickets", id));
        if (!ticketSnap.exists()) {
          setError("Service ticket not found.");
          setLoading(false);
          return;
        }

        const d = ticketSnap.data() as any;
        const nextTicket: TicketWithBilling = {
          id: ticketSnap.id,
          customerId: d.customerId ?? "",
          customerDisplayName: d.customerDisplayName ?? "",
          serviceAddressId: d.serviceAddressId ?? null,
          serviceAddressLabel: d.serviceAddressLabel ?? undefined,
          serviceAddressLine1: d.serviceAddressLine1 ?? "",
          serviceAddressLine2: d.serviceAddressLine2 ?? undefined,
          serviceCity: d.serviceCity ?? "",
          serviceState: d.serviceState ?? "",
          servicePostalCode: d.servicePostalCode ?? "",
          issueSummary: d.issueSummary ?? "",
          issueDetails: d.issueDetails ?? undefined,
          status: (d.status ?? "new") as ServiceTicketStatus,
          estimatedDurationMinutes: d.estimatedDurationMinutes ?? 60,
          assignedTechnicianId: d.assignedTechnicianId ?? undefined,
          assignedTechnicianName: d.assignedTechnicianName ?? undefined,
          primaryTechnicianId: d.primaryTechnicianId ?? undefined,
          assignedTechnicianIds: Array.isArray(d.assignedTechnicianIds)
            ? d.assignedTechnicianIds
            : undefined,
          secondaryTechnicianId: d.secondaryTechnicianId ?? undefined,
          secondaryTechnicianName: d.secondaryTechnicianName ?? undefined,
          helperIds: Array.isArray(d.helperIds) ? d.helperIds : undefined,
          helperNames: Array.isArray(d.helperNames) ? d.helperNames : undefined,
          active: d.active ?? true,
          createdAt: d.createdAt ?? undefined,
          updatedAt: d.updatedAt ?? undefined,
          billing: normalizeBillingPacket(d.billing),
          followUpClosure: normalizeFollowUpClosure(d.followUpClosure),
        };

        setTicket(nextTicket);
        setTicketStatusEdit((nextTicket.status || "new") as TicketStatus);
        setTicketEstimatedHoursEdit(
          String(Math.max(1, Number(nextTicket.estimatedDurationMinutes || 60) / 60))
        );
        setTicketIssueSummaryEdit(String(nextTicket.issueSummary || ""));
        setTicketIssueDetailsEdit(String(nextTicket.issueDetails || ""));

          const [
            usersSnap,
            profilesSnap,
            tripSnap,
            ptoSnap,
            holidaySnap,
            purchaseOrderSnap,
            attachmentSnap,
            activitySnap,
          ] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "employeeProfiles")),
          getDocs(
            query(
              collection(db, "trips"),
              where("link.serviceTicketId", "==", id),
              orderBy("date", "asc"),
              orderBy("startTime", "asc")
            )
          ),
          getDocs(collection(db, "ptoRequests")),
          getDocs(collection(db, "companyHolidays")),
          getDocs(
            query(
              collection(db, "purchaseOrders"),
              where("serviceTicketId", "==", id),
              orderBy("createdAt", "asc")
            )
          ),
          getDocs(
            query(
              collection(db, "serviceTickets", id, "attachments"),
              orderBy("uploadedAt", "desc")
            )
          ),
          getDocs(
            query(
              collection(db, "serviceTickets", id, "activity"),
              orderBy("createdAt", "desc")
            )
          ),
        ]);

        setTechnicians(
          usersSnap.docs
            .map((ds) => {
              const user = ds.data() as any;
              return {
                uid: user.uid ?? ds.id,
                displayName: user.displayName ?? "Unnamed Technician",
                active: user.active ?? false,
                role: user.role ?? "technician",
              };
            })
            .filter((u) => u.active && u.role === "technician")
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
        );

        setEmployeeProfiles(
          profilesSnap.docs.map((ds) => {
            const p = ds.data() as any;
            return {
              id: ds.id,
              userUid: p.userUid ?? null,
              displayName: p.displayName ?? undefined,
              employmentStatus: p.employmentStatus ?? "current",
              laborRole: p.laborRole ?? "other",
              defaultPairedTechUid: p.defaultPairedTechUid ?? null,
            };
          })
        );

        setPtoRequests(
          ptoSnap.docs.map((ds) => {
            const p = ds.data() as any;
            return {
              id: ds.id,
              employeeId: String(p.employeeId || "").trim(),
              employeeName: String(p.employeeName || "").trim(),
              startDate: String(p.startDate || "").trim(),
              endDate: String(p.endDate || p.startDate || "").trim(),
              status: String(p.status || "pending").trim().toLowerCase(),
              notes: p.notes ?? null,
            } as PtoRequestLite;
          })
        );

        setCompanyHolidays(
          holidaySnap.docs
            .map((ds) => normalizeCompanyHoliday(ds.data(), ds.id))
            .filter((holiday): holiday is CompanyHolidayLite => Boolean(holiday))
        );

        setPurchaseOrders(
          purchaseOrderSnap.docs
            .map((ds) => {
              const po = ds.data() as any;
              return {
                id: ds.id,
                poCode: String(po.poCode || ds.id).toUpperCase(),
                poIndex: typeof po.poIndex === "number" ? po.poIndex : undefined,
                poSuffix: po.poSuffix ?? undefined,
                status: po.status || "open",
                serviceTicketId: String(po.serviceTicketId || id),
                tripId: String(po.tripId || ""),
                requestedByUid: po.requestedByUid ?? null,
                requestedByName: po.requestedByName ?? null,
                createdAt: normalizeDateLike(po.createdAt) ?? undefined,
                updatedAt: normalizeDateLike(po.updatedAt) ?? undefined,
                vendorName: po.vendorName ?? null,
                matchedInvoiceId: po.matchedInvoiceId ?? null,
                matchedAttachmentIds: Array.isArray(po.matchedAttachmentIds)
                  ? po.matchedAttachmentIds
                  : [],
                invoiceEmailMessageId: po.invoiceEmailMessageId ?? null,
                                invoiceEmailSubject: po.invoiceEmailSubject ?? null,
                invoiceEmailFrom: po.invoiceEmailFrom ?? null,
                invoiceEmailMatchedAt: normalizeDateLike(po.invoiceEmailMatchedAt),
                invoiceAttachmentCount:
                  typeof po.invoiceAttachmentCount === "number"
                    ? po.invoiceAttachmentCount
                    : undefined,
                invoicePdfAttachmentCount:
                  typeof po.invoicePdfAttachmentCount === "number"
                    ? po.invoicePdfAttachmentCount
                    : undefined,
                matchedAttachments: Array.isArray(po.matchedAttachments)
                  ? po.matchedAttachments.map((attachment: any) => ({
                      id: String(attachment.id || ""),
                      filename: String(attachment.filename || "Invoice PDF"),
                      contentType: attachment.contentType ?? undefined,
                      size:
                        typeof attachment.size === "number"
                          ? attachment.size
                          : undefined,
                      storagePath: attachment.storagePath ?? undefined,
                      downloadUrl: attachment.downloadUrl ?? undefined,
                      uploadedAt: normalizeDateLike(attachment.uploadedAt) ?? undefined,
                    }))
                  : [],
              } satisfies PurchaseOrderLite;
            })
            .sort((a, b) => {
              const ai = Number.isFinite(Number(a.poIndex)) ? Number(a.poIndex) : 9999;
              const bi = Number.isFinite(Number(b.poIndex)) ? Number(b.poIndex) : 9999;
              if (ai !== bi) return ai - bi;
              return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
            })
        );

        setAttachments(
          attachmentSnap.docs
            .map((ds) => {
              const attachment = ds.data() as any;

              return {
                id: ds.id,
                fileName: String(attachment.fileName || attachment.originalFileName || "Attachment"),
                originalFileName: attachment.originalFileName ?? null,
                fileType: getAttachmentFileType(attachment.contentType, attachment.fileName),
                contentType: attachment.contentType ?? null,
                size: typeof attachment.size === "number" ? attachment.size : null,
                storagePath: attachment.storagePath ?? null,
                downloadUrl: attachment.downloadUrl ?? null,
                note: attachment.note ?? null,
                phase: (attachment.phase || "customer_sent") as ServiceTicketAttachmentPhase,
                tripId: attachment.tripId ?? null,
                active: attachment.active !== false,
                uploadedAt: normalizeDateLike(attachment.uploadedAt) ?? undefined,
                uploadedByUid: attachment.uploadedByUid ?? null,
                uploadedByName: attachment.uploadedByName ?? null,
                uploadedByRole: attachment.uploadedByRole ?? null,
                deletedAt: normalizeDateLike(attachment.deletedAt),
                deletedByUid: attachment.deletedByUid ?? null,
              } satisfies ServiceTicketAttachment;
            })
            .filter((attachment) => attachment.active !== false)
        );

        setActivityEntries(
          activitySnap.docs.map((ds) => {
            const activity = ds.data() as any;

            return {
              id: ds.id,
              type: String(activity.type || ""),
              title: String(activity.title || "Activity"),
              description: activity.description ?? null,
              details: Array.isArray(activity.details)
                ? activity.details.map((item: unknown) => String(item || "").trim()).filter(Boolean)
                : [],
              createdAt: normalizeDateLike(activity.createdAt) ?? undefined,
              createdByName: activity.createdByName ?? null,
              createdByRole: activity.createdByRole ?? null,
            };
          })
        );

        const nextTrips = tripSnap.docs.map((ds) => mapTripLikeFromDoc(ds));
        setTrips(nextTrips);

        const nextWork: Record<string, string> = {};
        const nextResolution: Record<string, string> = {};
        const nextFollow: Record<string, string> = {};
        const nextMaterials: Record<string, TripMaterial[]> = {};
        const nextMaterialsText: Record<string, string> = {};
        const nextNoMaterials: Record<string, boolean> = {};
        const nextFinish: Record<string, FinishMode> = {};
        const nextHelperConfirmed: Record<string, boolean> = {};
        const nextSeparateRequestChoice: Record<string, SeparateServiceRequestChoice> = {};
        const nextSeparateRequestDescription: Record<string, string> = {};

        for (const trip of nextTrips) {
          const loadedMaterials = Array.isArray(trip.materials) ? trip.materials : [];
          nextWork[trip.id] = String(trip.workNotes || "");
          nextResolution[trip.id] = String(trip.resolutionNotes || "");
          nextFollow[trip.id] = String(trip.followUpNotes || "");
          nextMaterials[trip.id] = loadedMaterials;
          nextMaterialsText[trip.id] = materialLinesToText(loadedMaterials);
          nextNoMaterials[trip.id] = Boolean(trip.noMaterialsUsed);
          nextFinish[trip.id] = "none";
          nextHelperConfirmed[trip.id] = true;
          nextSeparateRequestChoice[trip.id] = "no";
          nextSeparateRequestDescription[trip.id] = "";
        }

        setTripWorkNotes(nextWork);
        setTripResolutionNotes(nextResolution);
        setTripFollowUpNotes(nextFollow);
        setTripMaterials(nextMaterials);
        setTripMaterialsText(nextMaterialsText);
        setTripNoMaterialsUsed(nextNoMaterials);
        setFinishModeByTrip(nextFinish);
        setHelperConfirmedByTrip(nextHelperConfirmed);
        setSeparateRequestChoiceByTrip(nextSeparateRequestChoice);
        setSeparateRequestDescriptionByTrip(nextSeparateRequestDescription);

        const customerId = String(nextTicket.customerId || "").trim();
        if (customerId) {
          const customerSnap = await getDoc(doc(db, "customers", customerId));
          if (customerSnap.exists()) {
            const customer = customerSnap.data() as any;

            setCustomerPhone(
              String(customer.phonePrimary || customer.phone || "").trim()
            );
            setCustomerEmail(String(customer.email || "").trim());

            const serviceAddresses = Array.isArray(customer.serviceAddresses)
              ? customer.serviceAddresses
                  .map((addr: any) => ({
                    id: String(addr.id || createId()),
                    label: addr.label ?? undefined,
                    addressLine1: String(addr.addressLine1 || ""),
                    addressLine2: addr.addressLine2 ?? null,
                    city: String(addr.city || ""),
                    state: String(addr.state || ""),
                    postalCode: String(addr.postalCode || ""),
                    notes: addr.notes ?? null,
                    active: addr.active ?? true,
                    isPrimary: Boolean(addr.isPrimary),
                    source: addr.source ?? null,
                    createdAt: addr.createdAt ?? undefined,
                    updatedAt: addr.updatedAt ?? undefined,
                  }))
                  .filter((addr: CustomerServiceAddressOption) => addr.active !== false)
              : [];

            serviceAddresses.sort(
              (a: CustomerServiceAddressOption, b: CustomerServiceAddressOption) =>
                Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) ||
                safeStr(a.label).localeCompare(safeStr(b.label))
            );

            setCustomerServiceAddresses(serviceAddresses);
          }
        }

        if (nextTrips.length > 0) {
          const uniqueDates = Array.from(
            new Set(nextTrips.map((trip) => String(trip.date || "").trim()).filter(Boolean))
          );
          const byDate: Record<string, TripDocLite[]> = {};
          for (const date of uniqueDates) {
            byDate[date] = nextTrips.filter((trip) => trip.date === date);
          }
          setAvailabilityTripsByDate((prev) => ({ ...prev, ...byDate }));
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load service ticket."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [params]);

  useEffect(() => {
    if (tripTimeWindow !== "custom") {
      const times = windowToTimes(tripTimeWindow);
      setTripStartTime(times.start);
      setTripEndTime(times.end);
    }
  }, [tripTimeWindow]);

  useEffect(() => {
    if (editTripTimeWindow !== "custom") {
      const times = availabilityWindowToTimes(editTripTimeWindow);
      setEditTripStartTime(times.start);
      setEditTripEndTime(times.end);
    }
  }, [editTripTimeWindow]);

  useEffect(() => {
    if (!tripUseDefaultHelper) return;
    if (!tripPrimaryTechUid.trim()) {
      setTripHelperUid("");
      return;
    }
    setTripHelperUid(defaultHelperForPrimary);
  }, [tripUseDefaultHelper, tripPrimaryTechUid, defaultHelperForPrimary]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const dates = Array.from(new Set([tripDate, editTripDate].filter(Boolean)));
      for (const date of dates) {
        if (!date || availabilityTripsByDate[date]) continue;
        try {
          await loadAvailabilityTripsForDate(date);
        } catch (err) {
          if (!cancelled) {
            console.error("Failed to load availability trips", err);
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [tripDate, editTripDate, availabilityTripsByDate]);

  function findTechName(uid: string) {
    return technicians.find((t) => t.uid === uid)?.displayName || "";
  }

  function findHelperName(uid: string) {
    return helperCandidates.find((h) => h.uid === uid)?.name || "";
  }

  function mapTripLikeFromDoc(ds: any) {
    const trip = ds.data ? ds.data() : ds;
    return {
      id: ds.id ?? trip.id,
      active: trip.active ?? true,
      type: trip.type ?? "service",
      status: trip.status ?? "planned",
      date: trip.date ?? "",
      timeWindow: trip.timeWindow ?? "custom",
      startTime: trip.startTime ?? "",
      endTime: trip.endTime ?? "",
      crew: trip.crew ?? null,
      crewConfirmed: trip.crewConfirmed ?? null,
      dispatchOverride: trip.dispatchOverride ?? null,
      link: trip.link ?? undefined,
      notes: trip.notes ?? null,
      cancelReason: trip.cancelReason ?? null,
      timerState: trip.timerState ?? "not_started",
      actualStartAt: normalizeDateLike(trip.actualStartAt),
      actualEndAt: normalizeDateLike(trip.actualEndAt),
      startedByUid: trip.startedByUid ?? null,
      endedByUid: trip.endedByUid ?? null,
      pauseBlocks: Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [],
      actualMinutes:
        typeof trip.actualMinutes === "number" ? trip.actualMinutes : null,
      billableHours:
        typeof trip.billableHours === "number" ? trip.billableHours : null,
      workNotes: trip.workNotes ?? null,
      resolutionNotes: trip.resolutionNotes ?? null,
      followUpNotes: trip.followUpNotes ?? null,
      materials: Array.isArray(trip.materials) ? trip.materials : [],
      noMaterialsUsed: Boolean(trip.noMaterialsUsed),
      outcome: trip.outcome ?? null,
      readyToBillAt: normalizeDateLike(trip.readyToBillAt),
      updatedAt: normalizeDateLike(trip.updatedAt) ?? undefined,
      updatedByUid: trip.updatedByUid ?? null,
    } as TripDoc;
  }

  function buildCrewSelections(args: {
    primaryTechUid?: string;
    secondaryTechUid?: string;
    helperUid?: string;
    secondaryHelperUid?: string;
  }) {
    const selections: CrewMemberSelection[] = [];

    const addUnique = (member: CrewMemberSelection | null) => {
      if (!member?.uid) return;
      if (selections.some((item) => item.uid === member.uid)) return;
      selections.push(member);
    };

    if (args.primaryTechUid?.trim()) {
      addUnique({
        uid: args.primaryTechUid.trim(),
        name: findTechName(args.primaryTechUid.trim()) || "Primary Technician",
        role: "technician",
      });
    }

    if (args.secondaryTechUid?.trim()) {
      addUnique({
        uid: args.secondaryTechUid.trim(),
        name: findTechName(args.secondaryTechUid.trim()) || "Secondary Technician",
        role: "technician",
      });
    }

    if (args.helperUid?.trim()) {
      addUnique({
        uid: args.helperUid.trim(),
        name: findHelperName(args.helperUid.trim()) || "Helper",
        role: "helper",
      });
    }

    if (args.secondaryHelperUid?.trim()) {
      addUnique({
        uid: args.secondaryHelperUid.trim(),
        name: findHelperName(args.secondaryHelperUid.trim()) || "Secondary Helper",
        role: "helper",
      });
    }

    return selections;
  }

  async function loadAvailabilityTripsForDate(date: string) {
    if (!date?.trim()) return [] as TripDocLite[];

    const snap = await getDocs(
      query(collection(db, "trips"), where("date", "==", date.trim()))
    );

    const items = snap.docs.map((ds) => mapTripLikeFromDoc(ds));
    setAvailabilityTripsByDate((prev) => ({ ...prev, [date]: items }));
    return items;
  }

  function availabilityForOption(args: {
    uid: string;
    name: string;
    role: "technician" | "helper";
    date: string;
    timeWindow: TripTimeWindow;
    startTime: string;
    endTime: string;
    holidayNames: string[];
    holidayOverrideEnabled: boolean;
    excludeTripId?: string | null;
  }) {
    return getOptionAvailabilityLabel({
      baseLabel:
        args.role === "helper"
          ? `${args.name} (${normalizeRole(
              helperCandidates.find((helper) => helper.uid === args.uid)?.laborRole
            ) || "helper"})`
          : args.name,
      uid: args.uid,
      name: args.name,
      role: args.role,
      date: args.date,
      timeWindow: args.timeWindow,
      startTime: args.startTime,
      endTime: args.endTime,
      holidayNames: args.holidayNames,
      holidayOverrideEnabled: args.holidayOverrideEnabled,
      ptoRequests,
      dayTrips: availabilityTripsByDate[args.date] || [],
      excludeTripId: args.excludeTripId,
    });
  }

  function handleQuickPickPrimaryTech(uid: string, window: TripTimeWindow) {
    const times = availabilityWindowToTimes(window);
    setTripPrimaryTechUid(uid);
    setTripTimeWindow(window);
    setTripStartTime(times.start);
    setTripEndTime(times.end);
  }

  const scheduleCrewSelections = useMemo(
    () =>
      buildCrewSelections({
        primaryTechUid: tripPrimaryTechUid,
        secondaryTechUid: tripSecondaryTechUid,
        helperUid: tripHelperUid,
        secondaryHelperUid: tripSecondaryHelperUid,
      }),
    [tripPrimaryTechUid, tripSecondaryTechUid, tripHelperUid, tripSecondaryHelperUid]
  );

  const editCrewSelections = useMemo(
    () =>
      buildCrewSelections({
        primaryTechUid: editTripPrimaryTechUid,
        secondaryTechUid: editTripSecondaryTechUid,
        helperUid: editTripHelperUid,
        secondaryHelperUid: editTripSecondaryHelperUid,
      }),
    [
      editTripPrimaryTechUid,
      editTripSecondaryTechUid,
      editTripHelperUid,
      editTripSecondaryHelperUid,
    ]
  );

  const scheduleDispatchConflicts = useMemo(
    () =>
      collectDispatchOverrideConflicts({
        members: scheduleCrewSelections,
        date: tripDate,
        timeWindow: tripTimeWindow,
        startTime: tripStartTime,
        endTime: tripEndTime,
        dayTrips: availabilityTripsByDate[tripDate] || [],
        ptoRequests,
        holidayNames: scheduleHolidayNames,
        holidayOverrideEnabled: tripHolidayOverride,
      }),
    [
      scheduleCrewSelections,
      tripDate,
      tripTimeWindow,
      tripStartTime,
      tripEndTime,
      availabilityTripsByDate,
      ptoRequests,
      scheduleHolidayNames,
      tripHolidayOverride,
    ]
  );

  const editDispatchConflicts = useMemo(
    () =>
      collectDispatchOverrideConflicts({
        members: editCrewSelections,
        date: editTripDate,
        timeWindow: editTripTimeWindow,
        startTime: editTripStartTime,
        endTime: editTripEndTime,
        dayTrips: availabilityTripsByDate[editTripDate] || [],
        ptoRequests,
        holidayNames: editHolidayNames,
        holidayOverrideEnabled: editTripHolidayOverride,
        excludeTripId: editTripId,
      }),
    [
      editCrewSelections,
      editTripDate,
      editTripTimeWindow,
      editTripStartTime,
      editTripEndTime,
      availabilityTripsByDate,
      ptoRequests,
      editHolidayNames,
      editTripHolidayOverride,
      editTripId,
    ]
  );

  useEffect(() => {
    if (scheduleDispatchConflicts.softMessages.length === 0) {
      setTripDispatchOverrideEnabled(false);
      setTripDispatchOverrideReason("");
    }
  }, [scheduleDispatchConflicts.softMessages.length]);

  useEffect(() => {
    if (editDispatchConflicts.softMessages.length === 0) {
      setEditTripDispatchOverrideEnabled(false);
      setEditTripDispatchOverrideReason("");
    }
  }, [editDispatchConflicts.softMessages.length]);

  const scheduleCanSubmit = useMemo(() => {
    if (!tripDate.trim()) return false;
    if (!tripPrimaryTechUid.trim()) return false;
    if (!tripStartTime.trim() || !tripEndTime.trim()) return false;
    if (tripEndTime <= tripStartTime) return false;
    if (scheduleDispatchConflicts.hardMessages.length > 0) return false;
    if (scheduleDispatchConflicts.softMessages.length > 0) {
      return (
        tripDispatchOverrideEnabled &&
        Boolean(tripDispatchOverrideReason.trim())
      );
    }
    return true;
  }, [
    tripDate,
    tripPrimaryTechUid,
    tripStartTime,
    tripEndTime,
    scheduleDispatchConflicts,
    tripDispatchOverrideEnabled,
    tripDispatchOverrideReason,
  ]);

  const editCanSubmit = useMemo(() => {
    if (!editTripDate.trim()) return false;
    if (!editTripPrimaryTechUid.trim()) return false;
    if (!editTripStartTime.trim() || !editTripEndTime.trim()) return false;
    if (editTripEndTime <= editTripStartTime) return false;
    if (editDispatchConflicts.hardMessages.length > 0) return false;
    if (editDispatchConflicts.softMessages.length > 0) {
      return (
        editTripDispatchOverrideEnabled &&
        Boolean(editTripDispatchOverrideReason.trim())
      );
    }
    return true;
  }, [
    editTripDate,
    editTripPrimaryTechUid,
    editTripStartTime,
    editTripEndTime,
    editDispatchConflicts,
    editTripDispatchOverrideEnabled,
    editTripDispatchOverrideReason,
  ]);

  function deriveNextTicketStatus(
    nextTrips: TripDoc[],
    lastCompletedOutcome?: string | null
  ): TicketStatus {
    const activeTrips = nextTrips.filter((trip) => trip.active !== false);

    if (activeTrips.length === 0) {
      return "new";
    }

    const sortedTrips = [...activeTrips].sort((a, b) => {
      const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateCompare !== 0) return dateCompare;

      const startCompare = String(a.startTime || "").localeCompare(String(b.startTime || ""));
      if (startCompare !== 0) return startCompare;

      const updatedCompare = String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
      if (updatedCompare !== 0) return updatedCompare;

      return String(a.id || "").localeCompare(String(b.id || ""));
    });

    const hasInProgress = sortedTrips.some(
      (trip) => normalizeTripStatus(trip.status) === "in_progress"
    );
    if (hasInProgress) {
      return "in_progress";
    }

    const openTrips = sortedTrips.filter((trip) => isOpenTripRecord(trip));
    if (openTrips.length > 0) {
      const hasCompletedFollowUpHistory = sortedTrips.some(
        (trip) =>
          normalizeTripStatus(trip.status) === "complete" &&
          String(trip.outcome || "").trim().toLowerCase() === "follow_up"
      );

      return hasCompletedFollowUpHistory || ticket?.status === "follow_up"
        ? "follow_up"
        : "scheduled";
    }

    const completedTrips = sortedTrips.filter(
      (trip) => normalizeTripStatus(trip.status) === "complete"
    );

    if (completedTrips.length > 0) {
      const latestCompletedTrip = completedTrips[completedTrips.length - 1];
      const finalOutcome = String(
        lastCompletedOutcome ??
          latestCompletedTrip.outcome ??
          (latestCompletedTrip.readyToBillAt ? "resolved" : "")
      )
        .trim()
        .toLowerCase();

      if (finalOutcome === "resolved") {
        return ticket?.status === "invoiced" ? "invoiced" : "completed";
      }

      if (finalOutcome === "follow_up") {
        return "follow_up";
      }

      return ticket?.status === "invoiced" ? "invoiced" : "completed";
    }

    const hasCancelledTrips = sortedTrips.some(
      (trip) => normalizeTripStatus(trip.status) === "cancelled"
    );
    if (hasCancelledTrips) {
      return "cancelled";
    }

    return ticket?.status === "follow_up" ? "follow_up" : "scheduled";
  }

  async function persistTicketStatus(
    nextStatus: TicketStatus,
    now: string,
    billingOverride?: BillingPacket | null
  ) {
    if (!ticket?.id) return;

    const payload: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: now,
    };

    if (billingOverride !== undefined) {
      payload.billing = billingOverride;
    }

    await updateDoc(doc(db, "serviceTickets", ticket.id), payload);

    setTicket((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            updatedAt: now,
            ...(billingOverride !== undefined ? { billing: billingOverride } : {}),
          }
        : prev
    );

    setTicketStatusEdit(nextStatus);
  }

  function setTripSavingFlag(tripId: string, value: boolean) {
    setTripActionSaving((prev) => ({ ...prev, [tripId]: value }));
  }

  function setTripErr(tripId: string, value: string) {
    setTripActionError((prev) => ({ ...prev, [tripId]: value }));
  }

  function setTripOk(tripId: string, value: string) {
    setTripActionSuccess((prev) => ({ ...prev, [tripId]: value }));
  }

  function canCurrentUserActOnTrip(trip: TripDoc) {
    if (!myUid) return false;
    if (appUser?.role === "admin") return true;
    return isUidOnTripCrew(myUid, trip.crew || null);
  }

  function applyHelperConfirmation(crew: TripCrew | null, tripId: string): TripCrew | null {
    if (!crew) return crew;
    if (helperConfirmedByTrip[tripId] === false) {
      return {
        ...crew,
        helperUid: null,
        helperName: null,
        secondaryHelperUid: null,
        secondaryHelperName: null,
      };
    }
    return crew;
  }

  function getHoursToUse(tripId: string, computedMinutes: number) {
    const override = hoursOverrideByTrip[tripId];
    if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
      return roundToHalf(override);
    }
    return getDefaultBillableHours(computedMinutes);
  }

  const mobileFinishTrip = useMemo(
    () => trips.find((trip) => trip.id === mobileFinishTripId) || null,
    [trips, mobileFinishTripId]
  );

  const inProgressTrip = useMemo(
    () => trips.find((trip) => normalizeTripStatus(trip.status) === "in_progress") || null,
    [trips]
  );

  const mobileResolutionNoteMissing =
    Boolean(mobileFinishTrip) &&
    mobileFinishMode === "resolved" &&
    !String(
      mobileFinishTrip ? tripResolutionNotes[mobileFinishTrip.id] || "" : ""
    ).trim();

  const mobileFollowUpNoteMissing =
    Boolean(mobileFinishTrip) &&
    mobileFinishMode === "follow_up" &&
    !String(
      mobileFinishTrip ? tripFollowUpNotes[mobileFinishTrip.id] || "" : ""
    ).trim();

  const mobileSeparateRequestDescriptionMissing =
    Boolean(mobileFinishTrip) &&
    mobileFinishMode === "resolved" &&
    separateRequestChoiceByTrip[mobileFinishTrip?.id || ""] === "yes" &&
    !String(
      mobileFinishTrip
        ? separateRequestDescriptionByTrip[mobileFinishTrip.id] || ""
        : ""
    ).trim();

  const mobileCompleteDisabled =
    !mobileFinishTrip ||
    mobileFinishMode === "none" ||
    mobileResolutionNoteMissing ||
    mobileFollowUpNoteMissing ||
    mobileSeparateRequestDescriptionMissing ||
    Boolean(mobileFinishTrip && tripActionSaving[mobileFinishTrip.id]) ||
    isInvoicedTicket;

  const eligibleTripForPo = useMemo(() => {
    const candidates = trips.filter((trip) => canGeneratePoForTripDetail(trip));

    const runningOrPaused = candidates.find((trip) => {
      const timerState = normalizeTripTimerState(trip);
      return timerState === "running" || timerState === "paused";
    });

    if (runningOrPaused) return runningOrPaused;

    return (
      [...candidates].sort((a, b) => {
        const aKey = `${a.date || "9999-99-99"}_${a.startTime || "99:99"}_${a.id}`;
        const bKey = `${b.date || "9999-99-99"}_${b.startTime || "99:99"}_${b.id}`;
        return aKey.localeCompare(bKey);
      })[0] || null
    );
  }, [trips]);

  const canGeneratePoFromTicket = Boolean(eligibleTripForPo) && !isInvoicedTicket;

  const latestCompletedTripForLifecycle = useMemo(
    () => getLatestCompletedTripForLifecycle(trips),
    [trips]
  );

  const latestCompletedOutcome = String(
    latestCompletedTripForLifecycle?.outcome ||
      (latestCompletedTripForLifecycle?.readyToBillAt ? "resolved" : "")
  )
    .trim()
    .toLowerCase();

  const hasOpenTicketTrips = useMemo(
    () => trips.some((trip) => isOpenTripRecord(trip)),
    [trips]
  );

  const canCloseFollowUpWithoutReturnVisit =
    Boolean(ticket) &&
    canBill &&
    !isInvoicedTicket &&
    ticket?.status === "follow_up" &&
    latestCompletedOutcome === "follow_up" &&
    !hasOpenTicketTrips &&
    ticket?.billing?.status !== "ready_to_bill";

  useEffect(() => {
    if (!inProgressTrip) return;
    const id = window.setInterval(() => setLiveNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [inProgressTrip?.id]);

  const liveNowIso = useMemo(() => new Date(liveNowMs).toISOString(), [liveNowMs]);

  useEffect(() => {
    if (!ticket?.id || trips.length === 0) return;

    const action = String(searchParams.get("tripAction") || "").trim().toLowerCase();
    const targetTripId = String(searchParams.get("tripId") || "").trim();
    const attachmentAction = String(searchParams.get("attachmentAction") || "")
      .trim()
      .toLowerCase();
    const attachmentPhaseParam = String(searchParams.get("attachmentPhase") || "")
      .trim()
      .toLowerCase();
    const hash =
      typeof window !== "undefined"
        ? decodeURIComponent(window.location.hash || "")
        : "";

    let consumed = false;

    if ((action === "resolved" || action === "follow_up") && isMobile) {
      const targetTrip =
        trips.find((trip) => trip.id === targetTripId) ||
        trips.find((trip) => normalizeTripStatus(trip.status) === "in_progress") ||
        null;

      if (targetTrip && normalizeTripStatus(targetTrip.status) === "in_progress") {
        setMobileFinishTripId(targetTrip.id);
        setMobileFinishMode(action === "resolved" ? "resolved" : "follow_up");
        consumed = true;
      }
    }

    if (hash.startsWith("#trip-work-notes-")) {
      const targetId = hash.replace("#trip-work-notes-", "");
      const el = document.getElementById(`trip-work-notes-${targetId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if (
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLInputElement
          ) {
            el.focus();
          }
        }, 120);
        consumed = true;
      }
    }

    if (attachmentAction === "add") {
      const validPhase =
        attachmentPhaseParam === "customer_sent" ||
        attachmentPhaseParam === "before_visit" ||
        attachmentPhaseParam === "during_visit" ||
        attachmentPhaseParam === "after_visit"
          ? (attachmentPhaseParam as ServiceTicketAttachmentPhase)
          : "during_visit";

      setAttachmentPhase(validPhase);

      setTimeout(() => {
        document
          .getElementById("service-ticket-attachments")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 180);

      consumed = true;
    }

    if (consumed && typeof window !== "undefined") {
      window.history.replaceState({}, "", pathname);
    }
  }, [isMobile, pathname, searchParams, ticket?.id, trips]);

  function closeMobileFinishSheet() {
    const closingTripId = mobileFinishTripId;
    setMobileFinishTripId(null);
    setMobileFinishMode("none");

    if (closingTripId) {
      setSeparateRequestChoiceByTrip((prev) => ({
        ...prev,
        [closingTripId]: "no",
      }));
      setSeparateRequestDescriptionByTrip((prev) => ({
        ...prev,
        [closingTripId]: "",
      }));
    }
  }

  function handleAttachmentMenuOpen(event: React.MouseEvent<HTMLButtonElement>) {
    setAttachmentMenuAnchorEl(event.currentTarget);
  }

  function handleAttachmentMenuClose() {
    setAttachmentMenuAnchorEl(null);
  }

  function triggerAttachmentInput(kind: "camera" | "media" | "file") {
    setAttachmentMenuAnchorEl(null);

    window.setTimeout(() => {
      if (kind === "camera") {
        attachmentCameraInputRef.current?.click();
        return;
      }

      if (kind === "media") {
        attachmentMediaInputRef.current?.click();
        return;
      }

      attachmentFileInputRef.current?.click();
    }, 0);
  }

  function handleAttachmentInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    void handleUploadServiceTicketAttachments(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  async function handleUploadServiceTicketAttachments(fileList: FileList | null) {
    if (!ticket?.id || !canAddTicketAttachments) return;

    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    if (files.length === 0) return;

    setAttachmentUploading(true);
    setAttachmentErr("");
    setAttachmentOk("");

    try {
      const storage = getStorage();
      const uploaded: ServiceTicketAttachment[] = [];
      const uploadedAt = nowIso();
      const note = attachmentNote.trim() || null;
      const activeTripId =
        inProgressTrip?.id ||
        trips.find((trip) => normalizeTripStatus(trip.status) === "in_progress")?.id ||
        null;

      for (const file of files) {
        const attachmentId = createId();
        const fileName = sanitizeStorageFileName(file.name);
        const contentType = file.type || "application/octet-stream";
        const storagePath = `serviceTickets/${ticket.id}/attachments/${attachmentId}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file, {
          contentType,
          customMetadata: {
            serviceTicketId: ticket.id,
            uploadedByUid: myUid || "",
          },
        });

        let downloadUrl: string | null = null;
        try {
          downloadUrl = await getDownloadURL(storageRef);
        } catch {
          downloadUrl = null;
        }

        const attachment: ServiceTicketAttachment = {
          id: attachmentId,
          fileName,
          originalFileName: file.name,
          fileType: getAttachmentFileType(contentType, fileName),
          contentType,
          size: file.size,
          storagePath,
          downloadUrl,
          note,
          phase: attachmentPhase,
          tripId: activeTripId,
          active: true,
          uploadedAt,
          uploadedByUid: myUid || null,
          uploadedByName: appUser?.displayName || null,
          uploadedByRole: appUser?.role || null,
        };

        await setDoc(
          doc(db, "serviceTickets", ticket.id, "attachments", attachmentId),
          stripUndefined(attachment)
        );

        uploaded.push(attachment);
      }

      const now = nowIso();
      const batch = writeBatch(db);
      const nextAttachmentCount =
        attachments.filter((item) => item.active !== false).length + uploaded.length;

      batch.update(doc(db, "serviceTickets", ticket.id), {
        updatedAt: now,
        updatedByUid: myUid || null,
        hasAttachments: nextAttachmentCount > 0,
        attachmentCount: nextAttachmentCount,
        lastAttachmentAt: now,
        lastAttachmentPhase: uploaded[0]?.phase || attachmentPhase,
      });

      const activityRef = doc(collection(db, "serviceTickets", ticket.id, "activity"));
      const activityEntry: ServiceTicketActivityEntry = {
        id: activityRef.id,
        type: "service_ticket_attachment_added",
        title: uploaded.length === 1 ? "Attachment Added" : "Attachments Added",
        description:
          uploaded.length === 1
            ? `${uploaded[0].fileName} was added to this service ticket.`
            : `${uploaded.length} attachments were added to this service ticket.`,
        details: uploaded.map(
          (item) =>
            `${formatAttachmentPhase(item.phase)} • ${item.fileName}${
              item.note ? ` • ${item.note}` : ""
            }`
        ),
        createdAt: now,
        createdByName: appUser?.displayName || "System",
        createdByRole: appUser?.role || null,
      };

      batch.set(activityRef, {
        type: activityEntry.type,
        title: activityEntry.title,
        description: activityEntry.description,
        details: activityEntry.details,
        createdAt: now,
        createdByUid: myUid || null,
        createdByName: activityEntry.createdByName,
        createdByRole: activityEntry.createdByRole,
      });

      await batch.commit();

      setAttachments((prev) => [...uploaded, ...prev]);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              updatedAt: now,
            }
          : prev
      );
      setActivityEntries((prev) => [activityEntry, ...prev]);
      setAttachmentNote("");
      setAttachmentOk(
        uploaded.length === 1 ? "Attachment added." : `${uploaded.length} attachments added.`
      );
    } catch (err: unknown) {
      setAttachmentErr(
        err instanceof Error ? err.message : "Failed to upload attachment."
      );
    } finally {
      setAttachmentUploading(false);
    }
  }

  async function openServiceTicketAttachment(attachment: ServiceTicketAttachment) {
    const directUrl = safeStr(attachment.downloadUrl);
    const storagePath = safeStr(attachment.storagePath);

    try {
      if (storagePath) {
        const storage = getStorage();
        const url = await getDownloadURL(ref(storage, storagePath));
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      if (directUrl) {
        window.open(directUrl, "_blank", "noopener,noreferrer");
        return;
      }

      alert("This attachment is missing its storage path.");
    } catch (err) {
      console.error("Failed to open attachment:", err);
      alert("Could not open attachment. Check Firebase Storage permissions.");
    }
  }

  async function handleSoftDeleteServiceTicketAttachment(attachment: ServiceTicketAttachment) {
    if (!ticket?.id || !canDeleteTicketAttachments) return;

    if (
      window.prompt(`Type DELETE to remove ${attachment.fileName}`, "") !== "DELETE"
    ) {
      return;
    }

    setAttachmentErr("");
    setAttachmentOk("");

    const nextAttachmentCount = Math.max(
      0,
      attachments.filter(
        (item) => item.id !== attachment.id && item.active !== false
      ).length
    );

    try {
      const now = nowIso();
      const batch = writeBatch(db);

      batch.update(doc(db, "serviceTickets", ticket.id, "attachments", attachment.id), {
        active: false,
        deletedAt: now,
        deletedByUid: myUid || null,
        updatedAt: now,
      });

      const ticketAttachmentSummaryUpdate: Record<string, unknown> = {
        hasAttachments: nextAttachmentCount > 0,
        attachmentCount: nextAttachmentCount,
        updatedAt: now,
        updatedByUid: myUid || null,
      };

      if (nextAttachmentCount === 0) {
        ticketAttachmentSummaryUpdate.lastAttachmentAt = null;
        ticketAttachmentSummaryUpdate.lastAttachmentPhase = null;
      }

      batch.update(doc(db, "serviceTickets", ticket.id), ticketAttachmentSummaryUpdate);

      await batch.commit();

      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              updatedAt: now,
            }
          : prev
      );
      setAttachmentOk("Attachment removed from the active ticket view.");
    } catch (err: unknown) {
      setAttachmentErr(
        err instanceof Error ? err.message : "Failed to remove attachment."
      );
    }
  }

  function renderTripMaterialsEditor(tripId: string) {
    const materialsText =
      tripMaterialsText[tripId] ?? materialLinesToText(tripMaterials[tripId]);
    const noMaterialsUsed = Boolean(tripNoMaterialsUsed[tripId]);

    return (
      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            Materials Used
          </Typography>

          {getImportedMaterialChips(tripMaterials[tripId]).length > 0 ? (
  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
    {getImportedMaterialChips(tripMaterials[tripId]).map((material, index) => (
      <Chip
        key={material.supplierLineKey || material.id || index}
        size="small"
        color={material.reviewStatus === "pending" ? "warning" : "success"}
        variant="outlined"
        label={[
          "Imported",
          material.supplierName || "Supplier",
          material.supplierInvoiceNumber
            ? `Invoice #${material.supplierInvoiceNumber}`
            : "",
          material.poCode ? `PO ${material.poCode}` : "",
          material.reviewStatus === "pending" ? "Needs Review" : "",
        ]
          .filter(Boolean)
          .join(" • ")}
        sx={{ borderRadius: 99, fontWeight: 700 }}
      />
    ))}
  </Stack>
) : null}

          <FormControlLabel
            control={
              <Checkbox
                checked={noMaterialsUsed}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setTripNoMaterialsUsed((prev) => ({
                    ...prev,
                    [tripId]: checked,
                  }));

                  if (checked) {
                    setTripMaterials((prev) => ({
                      ...prev,
                      [tripId]: [],
                    }));
                    setTripMaterialsText((prev) => ({
                      ...prev,
                      [tripId]: "",
                    }));
                  }
                }}
              />
            }
            label="No materials used on this trip"
          />

          {noMaterialsUsed ? (
            <Alert severity="success" variant="outlined">
              This trip is marked as no materials used.
            </Alert>
          ) : (
            <TextField
              label="Materials / Parts Used"
              multiline
              minRows={5}
              value={materialsText}
              onChange={(e) =>
                setTripMaterialsText((prev) => ({
                  ...prev,
                  [tripId]: e.target.value,
                }))
              }
              placeholder={`Example:
Angle stop
Wax ring
PVC fittings for drain reset
Supply line`}
              helperText="Use a simple freeform list. One line per item works best."
            />
          )}
        </Stack>
      </Paper>
    );
  }

  function resetQuickAddServiceLocationForm() {
    setQuickServiceLabel("");
    setQuickServiceAddressSearch("");
    setQuickServiceAddressLine1("");
    setQuickServiceAddressLine2("");
    setQuickServiceCity("");
    setQuickServiceState("");
    setQuickServicePostalCode("");
    setQuickServiceNotes("");
    setQuickServiceAddressSource("manual");
  }

  function markQuickServiceAddressManual() {
    setQuickServiceAddressSource((current) =>
      current === "google_places" ? "manual" : current
    );
  }

  function handleQuickServiceGoogleAddressSelected(
    selection: GoogleAddressSelectionLike
  ) {
    setQuickServiceAddressSearch(selection.formattedAddress || "");
    setQuickServiceAddressLine1(selection.addressLine1 || "");
    setQuickServiceAddressLine2(selection.addressLine2 || "");
    setQuickServiceCity(selection.city || "");
    setQuickServiceState(selection.state || "");
    setQuickServicePostalCode(selection.postalCode || "");
    setQuickServiceAddressSource("google_places");
  }

  function openEditLocationDialog() {
    if (!ticket) return;

    setLocationErr("");
    setLocationOk("");
    setQuickAddMode(false);
    resetQuickAddServiceLocationForm();

    const currentServiceAddressId = safeStr(ticket.serviceAddressId);
    const fallbackMatch =
      customerServiceAddresses.find(
        (addr) =>
          safeStr(addr.addressLine1) === safeStr(ticket.serviceAddressLine1) &&
          safeStr(addr.city) === safeStr(ticket.serviceCity) &&
          safeStr(addr.state) === safeStr(ticket.serviceState) &&
          safeStr(addr.postalCode) === safeStr(ticket.servicePostalCode)
      ) || null;

    setSelectedServiceAddressId(
      currentServiceAddressId || fallbackMatch?.id || ""
    );

    setShowEditLocationDialog(true);
  }

  function applyServiceAddressToTicketState(
    address: CustomerServiceAddressOption,
    updatedAt: string
  ) {
    setTicket((prev) =>
      prev
        ? {
            ...prev,
            serviceAddressId: address.id,
            serviceAddressLabel: address.label || "Service Address",
            serviceAddressLine1: address.addressLine1 || "",
            serviceAddressLine2: address.addressLine2 || undefined,
            serviceCity: address.city || "",
            serviceState: address.state || "",
            servicePostalCode: address.postalCode || "",
            updatedAt,
          }
        : prev
    );
  }

  async function handleSaveTicketOverview() {
    if (!canDispatch || !ticket?.id) return;

    if (ticket.status === "invoiced") {
      setTicketEditErr("Invoiced tickets are locked and cannot be edited.");
      return;
    }

    setTicketEditErr("");
    setTicketEditOk("");
    setTicketEditSaving(true);

    try {
      const hours = Number(ticketEstimatedHoursEdit);

      if (!Number.isFinite(hours) || hours < 1) {
        setTicketEditErr("Estimated duration must be at least 1 hour.");
        return;
      }

      if (!Number.isInteger(hours * 2)) {
        setTicketEditErr("Estimated duration must use 0.5 hour increments.");
        return;
      }

      const estimatedDurationMinutes = Math.round(hours * 60);

      const summary = ticketIssueSummaryEdit.trim();
      if (!summary) {
        setTicketEditErr("Issue summary is required.");
        return;
      }

      const nextStatus = ticketStatusEdit as TicketStatus;
      const guard = getLocalManualTicketStatusError({
        nextStatus,
        currentStatus: ticket.status,
        trips,
      });

      if (guard) {
        setTicketEditErr(guard);
        return;
      }

      const now = nowIso();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: nextStatus,
        issueSummary: summary,
        estimatedDurationMinutes,
        issueDetails: ticketIssueDetailsEdit.trim() || null,
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              issueSummary: summary,
              estimatedDurationMinutes,
              issueDetails: ticketIssueDetailsEdit.trim() || undefined,
              updatedAt: now,
            }
          : prev
      );

      setTicketEstimatedHoursEdit(String(hours));
      setTicketEditOk("Ticket updated.");
    } catch (err: unknown) {
      setTicketEditErr(
        err instanceof Error ? err.message : "Failed to update ticket."
      );
    } finally {
      setTicketEditSaving(false);
    }
  }

  async function handleSaveSelectedServiceLocation() {
    if (!ticket?.id || !ticket.customerId || !canDispatch) return;

    if (ticket.status === "invoiced") {
      setLocationErr("Invoiced tickets are locked and location cannot be changed.");
      return;
    }

    const selected = customerServiceAddresses.find(
      (addr) => addr.id === selectedServiceAddressId
    );

    if (!selected) {
      setLocationErr("Select a service location.");
      return;
    }

    setLocationErr("");
    setLocationOk("");
    setLocationSaving(true);

    try {
      const now = nowIso();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        serviceAddressId: selected.id,
        serviceAddressLabel: selected.label || "Service Address",
        serviceAddressLine1: selected.addressLine1 || "",
        serviceAddressLine2: selected.addressLine2 || null,
        serviceCity: selected.city || "",
        serviceState: selected.state || "",
        servicePostalCode: selected.postalCode || "",
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      applyServiceAddressToTicketState(selected, now);
      setLocationOk("Service location updated.");
      setShowEditLocationDialog(false);
    } catch (err: unknown) {
      setLocationErr(
        err instanceof Error ? err.message : "Failed to update service location."
      );
    } finally {
      setLocationSaving(false);
    }
  }

  async function handleQuickAddAndUseServiceLocation() {
    if (!ticket?.id || !ticket.customerId || !canDispatch) return;

    if (ticket.status === "invoiced") {
      setLocationErr("Invoiced tickets are locked and location cannot be changed.");
      return;
    }

    const line1 = quickServiceAddressLine1.trim();
    const city = quickServiceCity.trim();
    const state = quickServiceState.trim();
    const postalCode = quickServicePostalCode.trim();

    if (!line1) {
      setLocationErr("Address line 1 is required.");
      return;
    }

    if (!city) {
      setLocationErr("City is required.");
      return;
    }

    if (!state) {
      setLocationErr("State is required.");
      return;
    }

    if (!postalCode) {
      setLocationErr("Postal code is required.");
      return;
    }

    setLocationErr("");
    setLocationOk("");
    setLocationSaving(true);

    try {
      const now = nowIso();

      const customerRef = doc(db, "customers", ticket.customerId);
      const customerSnap = await getDoc(customerRef);

      if (!customerSnap.exists()) {
        throw new Error("Customer not found.");
      }

      const customerData = customerSnap.data() as any;
      const existingAddresses: CustomerServiceAddressOption[] = Array.isArray(
        customerData.serviceAddresses
      )
        ? customerData.serviceAddresses
        : [];

      const nextAddress: CustomerServiceAddressOption = {
        id: createId(),
        label: quickServiceLabel.trim() || undefined,
        addressLine1: line1,
        addressLine2: quickServiceAddressLine2.trim() || null,
        city,
        state,
        postalCode,
        notes: quickServiceNotes.trim() || null,
        active: true,
        isPrimary: existingAddresses.filter((addr) => addr.active !== false).length === 0,
        source: quickServiceAddressSource || "manual",
        createdAt: now,
        updatedAt: now,
      };

      const nextAddresses = [...existingAddresses, nextAddress];

      const nextAddressesForFirestore = nextAddresses.map((addr) => ({
        ...addr,
        label: addr.label ?? null,
        addressLine2: addr.addressLine2 ?? null,
        notes: addr.notes ?? null,
        source: addr.source ?? null,
      }));

      await updateDoc(customerRef, {
        serviceAddresses: nextAddressesForFirestore,
        updatedAt: now,
      });

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        serviceAddressId: nextAddress.id,
        serviceAddressLabel: nextAddress.label || "Service Address",
        serviceAddressLine1: nextAddress.addressLine1 || "",
        serviceAddressLine2: nextAddress.addressLine2 || null,
        serviceCity: nextAddress.city || "",
        serviceState: nextAddress.state || "",
        servicePostalCode: nextAddress.postalCode || "",
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      setCustomerServiceAddresses((prev) =>
        [...prev, nextAddress].sort(
          (a, b) =>
            Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) ||
            safeStr(a.label).localeCompare(safeStr(b.label))
        )
      );

      setSelectedServiceAddressId(nextAddress.id);
      applyServiceAddressToTicketState(nextAddress, now);

      resetQuickAddServiceLocationForm();
      setQuickAddMode(false);
      setShowEditLocationDialog(false);
      setLocationOk("Service location added and applied to ticket.");
    } catch (err: unknown) {
      setLocationErr(
        err instanceof Error ? err.message : "Failed to add service location."
      );
    } finally {
      setLocationSaving(false);
    }
  }

  async function handleCreateTrip(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ticket || !canDispatch) return;
    if (ticket.status === "invoiced") {
      setTripSaveError("Invoiced tickets are locked and cannot receive new trips.");
      return;
    }

    setTripSaveError("");
    setTripSaveSuccess("");

    if (isTicketTerminal(ticket.status)) {
      setTripSaveError(
        "Completed or cancelled tickets cannot receive new trips."
      );
      return;
    }

    if (hasOpenTrips(trips)) {
      setTripSaveError(
        "This ticket already has an open trip. Complete or cancel it before scheduling another."
      );
      return;
    }

    const remoteOpenTrips = await findOpenTripsForTicketId(ticket.id);
    if (remoteOpenTrips.length > 0) {
      setTripSaveError(
        `This ticket already has an open trip in Firestore (${remoteOpenTrips[0].date} ${remoteOpenTrips[0].startTime}-${remoteOpenTrips[0].endTime}). Refresh and use that trip instead.`
      );
      return;
    }

    if (!tripDate.trim()) {
      setTripSaveError("Trip date is required.");
      return;
    }

    if (!tripPrimaryTechUid.trim()) {
      setTripSaveError("Primary technician is required.");
      return;
    }

    if (!tripStartTime.trim() || !tripEndTime.trim() || tripEndTime <= tripStartTime) {
      setTripSaveError("Enter a valid start and end time.");
      return;
    }

    const freshDayTrips = await loadAvailabilityTripsForDate(tripDate);

    const latestDispatchConflicts = collectDispatchOverrideConflicts({
      members: buildCrewSelections({
        primaryTechUid: tripPrimaryTechUid,
        secondaryTechUid: tripSecondaryTechUid,
        helperUid: tripHelperUid,
        secondaryHelperUid: tripSecondaryHelperUid,
      }),
      date: tripDate,
      timeWindow: tripTimeWindow,
      startTime: tripStartTime,
      endTime: tripEndTime,
      dayTrips: freshDayTrips,
      ptoRequests,
      holidayNames: getHolidayNamesForDate(companyHolidays, tripDate),
      holidayOverrideEnabled: tripHolidayOverride,
    });

    if (latestDispatchConflicts.hardMessages.length > 0) {
      setTripSaveError(latestDispatchConflicts.hardMessages[0]);
      return;
    }

    if (latestDispatchConflicts.softMessages.length > 0) {
      if (!tripDispatchOverrideEnabled) {
        setTripSaveError(
          "This selection overlaps another scheduled or in-progress trip. Enable Dispatch Override to save it as a planned trip."
        );
        return;
      }

      if (!tripDispatchOverrideReason.trim()) {
        setTripSaveError("Dispatch Override reason is required.");
        return;
      }
    }

    setTripSaving(true);

    try {
      const now = nowIso();
      const helperUid = tripHelperUid.trim() || "";
      const secondaryTechUid = tripSecondaryTechUid.trim() || "";
      const secondaryHelperUid = tripSecondaryHelperUid.trim() || "";

      const primaryName = findTechName(tripPrimaryTechUid) || "Unnamed Technician";
      const helperName = helperUid
        ? findHelperName(helperUid) || "Unnamed Helper"
        : null;
      const secondaryTechName = secondaryTechUid
        ? findTechName(secondaryTechUid) || "Unnamed Technician"
        : null;
      const secondaryHelperName = secondaryHelperUid
        ? findHelperName(secondaryHelperUid) || "Unnamed Helper"
        : null;

      const dispatchOverride =
        latestDispatchConflicts.softMessages.length > 0
          ? ({
              enabled: true,
              reason: tripDispatchOverrideReason.trim(),
              createdAt: now,
              createdByUid: appUser?.uid || null,
              createdByName: appUser?.displayName || null,
              conflictTypes: latestDispatchConflicts.softConflictTypes,
              conflictTripIds: latestDispatchConflicts.softTripIds,
            } satisfies DispatchOverrideInfo)
          : null;

      const payload = {
        active: true,
        type: "service",
        status: "planned",
        date: tripDate,
        timeWindow: tripTimeWindow,
        startTime: tripStartTime,
        endTime: tripEndTime,
        billableHours: null,
        noMaterialsUsed: false,
        dispatchOverride,
        crew: {
          primaryTechUid: tripPrimaryTechUid,
          primaryTechName: primaryName,
          helperUid: helperUid || null,
          helperName,
          secondaryTechUid: secondaryTechUid || null,
          secondaryTechName,
          secondaryHelperUid: secondaryHelperUid || null,
          secondaryHelperName,
        },
        crewConfirmed: null,
        link: {
          serviceTicketId: ticket.id,
          projectId: null,
          projectStageKey: null,
        },
        notes: tripNotes.trim() || null,
        cancelReason: null,
        timerState: "not_started",
        actualStartAt: null,
        actualEndAt: null,
        startedByUid: null,
        endedByUid: null,
        pauseBlocks: [],
        actualMinutes: null,
        workNotes: null,
        resolutionNotes: null,
        followUpNotes: null,
        materials: [],
        outcome: null,
        readyToBillAt: null,
        createdAt: now,
        createdByUid: appUser?.uid || null,
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
      };

      const createdRef = await addDoc(collection(db, "trips"), payload as any);
      const createdTrip: TripDoc = { id: createdRef.id, ...(payload as any) };

      const nextTrips = [...trips, createdTrip].sort((a, b) => {
        const byDate = String(a.date || "").localeCompare(String(b.date || ""));
        if (byDate !== 0) return byDate;
        return String(a.startTime || "").localeCompare(String(b.startTime || ""));
      });

      const helperIds = helperUid ? [helperUid] : [];
      const helperNames = helperName ? [helperName] : [];

      const assignedTechnicianIds = [tripPrimaryTechUid];
      if (secondaryTechUid && secondaryTechUid !== tripPrimaryTechUid) {
        assignedTechnicianIds.push(secondaryTechUid);
      }
      if (helperUid && !assignedTechnicianIds.includes(helperUid)) {
        assignedTechnicianIds.push(helperUid);
      }
      if (secondaryHelperUid && !assignedTechnicianIds.includes(secondaryHelperUid)) {
        assignedTechnicianIds.push(secondaryHelperUid);
      }

      const nextStatus = deriveNextTicketStatus(nextTrips);

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: nextStatus,
        assignedTechnicianId: tripPrimaryTechUid,
        assignedTechnicianName: primaryName,
        primaryTechnicianId: tripPrimaryTechUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperIds.length ? helperIds : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianIds,
        updatedAt: now,
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              assignedTechnicianId: tripPrimaryTechUid,
              assignedTechnicianName: primaryName,
              primaryTechnicianId: tripPrimaryTechUid,
              secondaryTechnicianId: secondaryTechUid || undefined,
              secondaryTechnicianName: secondaryTechName || undefined,
              helperIds: helperIds.length ? helperIds : undefined,
              helperNames: helperNames.length ? helperNames : undefined,
              assignedTechnicianIds,
              updatedAt: now,
            }
          : prev
      );

      setTicketStatusEdit(nextStatus);
      setTrips(nextTrips);
      setAvailabilityTripsByDate((prev) => ({
        ...prev,
        [tripDate]: [
          ...(prev[tripDate] || []),
          createdTrip,
        ],
      }));
      setTripWorkNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripResolutionNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripFollowUpNotes((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripMaterials((prev) => ({ ...prev, [createdTrip.id]: [] }));
      setTripMaterialsText((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripNoMaterialsUsed((prev) => ({ ...prev, [createdTrip.id]: false }));
      setFinishModeByTrip((prev) => ({ ...prev, [createdTrip.id]: "none" }));
      setHelperConfirmedByTrip((prev) => ({ ...prev, [createdTrip.id]: true }));
      setSeparateRequestChoiceByTrip((prev) => ({ ...prev, [createdTrip.id]: "no" }));
      setSeparateRequestDescriptionByTrip((prev) => ({ ...prev, [createdTrip.id]: "" }));
      setTripSaveSuccess(
        dispatchOverride
          ? `Trip scheduled with Dispatch Override. Ticket status is now ${formatTicketStatus(nextStatus)}.`
          : `Trip scheduled. Ticket status is now ${formatTicketStatus(nextStatus)}.`
      );
      setTripNotes("");
      setTripHolidayOverride(false);
      setTripDispatchOverrideEnabled(false);
      setTripDispatchOverrideReason("");
    } catch (err: unknown) {
      setTripSaveError(
        err instanceof Error ? err.message : "Failed to create trip."
      );
    } finally {
      setTripSaving(false);
    }
  }

  async function handleStartTrip(trip: TripDoc) {
    if (!canStartTripRole || !myUid) return;

    if (!canCurrentUserActOnTrip(trip) && appUser?.role !== "admin") {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canStartTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip is not in a startable state.");
      return;
    }

    if (hasInProgressTrips(trips.filter((t) => t.id !== trip.id))) {
      setTripErr(trip.id, "Another trip on this ticket is already in progress.");
      return;
    }

    const startCrew = trip.crewConfirmed || trip.crew || null;
    const runningConflicts = await findRunningTripsForCrewUids({
      crewUids: crewUidsFromCrew(startCrew),
      excludeTripId: trip.id,
    });

    if (runningConflicts.length > 0) {
      setTripErr(
        trip.id,
        `Cannot start this trip because one of the assigned crew members already has a running trip: ${runningConflicts[0].summary}`
      );
      return;
    }

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();

      await updateDoc(doc(db, "trips", trip.id), {
        status: "in_progress",
        timerState: "running",
        actualStartAt: trip.actualStartAt || now,
        actualEndAt: null,
        startedByUid: trip.startedByUid || myUid,
        crewConfirmed: trip.crewConfirmed || trip.crew || null,
        pauseBlocks: Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [],
        updatedAt: now,
        updatedByUid: myUid,
      });

      const nextTrips = trips.map((t) =>
        t.id === trip.id
          ? {
              ...t,
              status: "in_progress",
              timerState: "running",
              actualStartAt: t.actualStartAt || now,
              actualEndAt: null,
              startedByUid: t.startedByUid || myUid,
              crewConfirmed: t.crewConfirmed || t.crew || null,
              pauseBlocks: Array.isArray(t.pauseBlocks) ? t.pauseBlocks : [],
              updatedAt: now,
              updatedByUid: myUid,
            }
          : t
      );

      setTrips(nextTrips);
      setAvailabilityTripsByDate((prev) => ({
        ...prev,
        [trip.date]: nextTrips.filter((t) => t.date === trip.date),
      }));
      setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));

      const nextStatus = deriveNextTicketStatus(nextTrips);
      if (ticket?.id && nextStatus !== ticket.status) {
        await persistTicketStatus(nextStatus, now);
      }

      setTripOk(trip.id, "Trip started.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to start trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handlePauseTrip(trip: TripDoc) {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canPauseTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip cannot be paused right now.");
      return;
    }

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();
      const pauseBlocks = [...(Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [])];

      const hasOpenPause = pauseBlocks.some((block) => block?.startAt && !block?.endAt);
      if (hasOpenPause) {
        setTripErr(trip.id, "This trip is already paused.");
        return;
      }

      pauseBlocks.push({ startAt: now, endAt: null });

      await updateDoc(doc(db, "trips", trip.id), {
        timerState: "paused",
        pauseBlocks,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id ? { ...t, timerState: "paused", pauseBlocks } : t
        )
      );

      setTripOk(trip.id, "Paused.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to pause trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleResumeTrip(trip: TripDoc) {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canResumeTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip cannot be resumed right now.");
      return;
    }

    if (hasInProgressTrips(trips.filter((t) => t.id !== trip.id))) {
      setTripErr(trip.id, "Another trip on this ticket is already in progress.");
      return;
    }

    const resumeCrew = trip.crewConfirmed || trip.crew || null;
    const runningConflicts = await findRunningTripsForCrewUids({
      crewUids: crewUidsFromCrew(resumeCrew),
      excludeTripId: trip.id,
    });

    if (runningConflicts.length > 0) {
      setTripErr(
        trip.id,
        `Cannot resume this trip because one of the assigned crew members already has a running trip: ${runningConflicts[0].summary}`
      );
      return;
    }

    setTripErr(trip.id, "");
    setTripOk(trip.id, "");
    setTripSavingFlag(trip.id, true);

    try {
      const now = nowIso();
      const pauseBlocks = [...(Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [])];

      let foundOpenPause = false;

      for (let i = pauseBlocks.length - 1; i >= 0; i--) {
        if (pauseBlocks[i] && pauseBlocks[i].startAt && !pauseBlocks[i].endAt) {
          pauseBlocks[i] = { ...pauseBlocks[i], endAt: now };
          foundOpenPause = true;
          break;
        }
      }

      if (!foundOpenPause) {
        setTripErr(trip.id, "No active pause block was found to resume.");
        return;
      }

      await updateDoc(doc(db, "trips", trip.id), {
        timerState: "running",
        pauseBlocks,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id ? { ...t, timerState: "running", pauseBlocks } : t
        )
      );

      setTripOk(trip.id, "Resumed.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to resume trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleSaveWorkNotes(trip: TripDoc) {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    setTripSavingFlag(trip.id, true);
    setTripErr(trip.id, "");
    setTripOk(trip.id, "");

    try {
      const now = nowIso();
      const value = String(tripWorkNotes[trip.id] || "").trim();

      await updateDoc(doc(db, "trips", trip.id), {
        workNotes: value || null,
        updatedAt: now,
        updatedByUid: myUid,
      });

      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, workNotes: value || null } : t))
      );

      setTripOk(trip.id, "Notes saved.");
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function finishTrip(trip: TripDoc, mode: "resolved" | "follow_up") {
    if (!canWorkTrip || !myUid) return;

    if (!canCurrentUserActOnTrip(trip)) {
      setTripErr(trip.id, "You are not assigned to this trip.");
      return;
    }

    if (!canFinishTrip(trip.status, trip.timerState)) {
      setTripErr(trip.id, "This trip is not ready to finish.");
      return;
    }

    setTripSavingFlag(trip.id, true);
    setTripErr(trip.id, "");
    setTripOk(trip.id, "");

    try {
      const now = nowIso();
      const followNotes = String(tripFollowUpNotes[trip.id] || "").trim();
      const resolutionNotes = String(tripResolutionNotes[trip.id] || "").trim();

      if (mode === "follow_up" && !followNotes) {
        throw new Error("Follow Up requires follow-up notes.");
      }
      if (mode === "resolved" && !resolutionNotes) {
        throw new Error("Resolved requires resolution notes.");
      }

      const separateRequestChoice = separateRequestChoiceByTrip[trip.id] || "no";
      const separateRequestDescription = String(
        separateRequestDescriptionByTrip[trip.id] || ""
      ).trim();
      const shouldCreateSeparateServiceRequest =
        mode === "resolved" && separateRequestChoice === "yes";

      if (shouldCreateSeparateServiceRequest && !separateRequestDescription) {
        throw new Error("Brief issue description is required for the new service ticket.");
      }

      const materialsText = String(tripMaterialsText[trip.id] || "").trim();
      const mats = parseMaterialsText(materialsText, tripMaterials[trip.id]);
      const noMaterialsUsed = Boolean(tripNoMaterialsUsed[trip.id]);
      const materialCheck = validateTripMaterialsCapture({
        materials: mats,
        noMaterialsUsed,
      });

      if (!materialCheck.ok) {
        throw new Error(materialCheck.message);
      }

      const pauseBlocks = [...(Array.isArray(trip.pauseBlocks) ? trip.pauseBlocks : [])];
      for (let i = pauseBlocks.length - 1; i >= 0; i--) {
        if (pauseBlocks[i] && pauseBlocks[i].startAt && !pauseBlocks[i].endAt) {
          pauseBlocks[i] = { ...pauseBlocks[i], endAt: now };
          break;
        }
      }

      const startAt = trip.actualStartAt || now;
      const gross = minutesBetweenIso(startAt, now);
      const paused = sumPausedMinutes(pauseBlocks, now);
      const actualMinutes = Math.max(0, gross - paused);

      if (!trip.date) {
        throw new Error("Trip is missing date; cannot create time entries.");
      }
      if (!actualMinutes || actualMinutes <= 0) {
        throw new Error("Trip duration is 0 minutes; no time entry created.");
      }

      const latestSnap = await getDoc(doc(db, "trips", trip.id));
      const latestTrip = latestSnap.exists() ? (latestSnap.data() as any) : null;

      const crewConfirmed = applyHelperConfirmation(
        (latestTrip?.crewConfirmed ?? trip.crewConfirmed ?? null) as TripCrew | null,
        trip.id
      );
      const crewFallback = applyHelperConfirmation(
        (latestTrip?.crew ?? trip.crew ?? null) as TripCrew | null,
        trip.id
      );
      const finalCrew = crewConfirmed || crewFallback || null;

      const crewMembers = crewMembersFromTrip({ crewConfirmed: finalCrew, crew: finalCrew });
      if (!crewMembers.length) {
        throw new Error("No crew members found on trip.");
      }

      const hoursToUse = getHoursToUse(trip.id, actualMinutes);
      const entryDate = trip.date;
      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

      await updateDoc(
        doc(db, "trips", trip.id),
        stripUndefined({
          status: "complete",
          timerState: "complete",
          actualEndAt: now,
          endedByUid: myUid,
          pauseBlocks,
          actualMinutes,
          billableHours: hoursToUse,
          workNotes: String(tripWorkNotes[trip.id] || "").trim() || null,
          resolutionNotes: mode === "resolved" ? resolutionNotes : null,
          followUpNotes: mode === "follow_up" ? followNotes : null,
          outcome: mode,
          readyToBillAt: mode === "resolved" ? now : null,
          materials: materialCheck.cleaned,
          noMaterialsUsed,
          crewConfirmed: finalCrew,
          updatedAt: now,
          updatedByUid: myUid,
        })
      );

      for (const member of crewMembers) {
        const timesheetId = await upsertWeeklyTimesheetHeader({
          employeeId: member.uid,
          employeeName: member.name,
          employeeRole: member.role,
          weekStartDate,
          weekEndDate,
          createdByUid: myUid || null,
        });

        const addressShort = [
          ticket?.serviceAddressLine1 || "",
          ticket?.serviceCity || "",
          ticket?.serviceState || "",
          ticket?.servicePostalCode || "",
        ]
          .filter(Boolean)
          .join(", ");

        await upsertTimeEntryFromTrip({
          trip,
          member,
          entryDate,
          hoursGenerated: hoursToUse,
          weekStartDate,
          weekEndDate,
          timesheetId,
          createdByUid: myUid || null,
          displayTitle: ticket?.customerDisplayName || "Customer",
          displaySubtitle: ticket?.issueSummary || "Service Ticket",
          outcomeLabel: mode === "resolved" ? "Resolved" : "Follow Up",
          addressShort,
        });
      }

      const nextTrips = trips.map((t) =>
        t.id === trip.id
          ? {
              ...t,
              status: "complete",
              timerState: "complete",
              actualEndAt: now,
              endedByUid: myUid,
              pauseBlocks,
              actualMinutes,
              billableHours: hoursToUse,
              workNotes: String(tripWorkNotes[trip.id] || "").trim() || null,
              resolutionNotes: mode === "resolved" ? resolutionNotes : null,
              followUpNotes: mode === "follow_up" ? followNotes : null,
              outcome: mode,
              readyToBillAt: mode === "resolved" ? now : null,
              materials: materialCheck.cleaned,
              noMaterialsUsed,
              crewConfirmed: finalCrew,
            }
          : t
      );

      setTrips(nextTrips);
      setTripMaterials((prev) => ({
        ...prev,
        [trip.id]: materialCheck.cleaned,
      }));
      setTripMaterialsText((prev) => ({
        ...prev,
        [trip.id]: materialLinesToText(materialCheck.cleaned),
      }));
      setAvailabilityTripsByDate((prev) => ({
        ...prev,
        [trip.date]: nextTrips.filter((t) => t.date === trip.date),
      }));
      setFinishModeByTrip((prev) => ({ ...prev, [trip.id]: "none" }));

      const nextStatus = deriveNextTicketStatus(nextTrips, mode);
      let billingOverride: BillingPacket | null | undefined = undefined;

      if (mode === "resolved") {
        if (nextStatus === "completed") {
          billingOverride = buildBillingPacketFromResolvedTrips({
            trips: nextTrips,
            fallbackUpdatedAt: now,
          });
        } else {
          billingOverride = null;
        }
      } else {
        billingOverride = null;
      }

      if (ticket?.id) {
        await persistTicketStatus(nextStatus, now, billingOverride);
      }

      let createdSeparateTicket: { id: string; summary: string } | null = null;

      if (shouldCreateSeparateServiceRequest && ticket?.id) {
        const newTicketSummary =
          separateRequestDescription.length > 90
            ? `${separateRequestDescription.slice(0, 87).trimEnd()}…`
            : separateRequestDescription;

        const newTicketRef = await addDoc(
          collection(db, "serviceTickets"),
          stripUndefined({
            customerId: ticket.customerId || "",
            customerDisplayName: ticket.customerDisplayName || "Customer",
            serviceAddressId: ticket.serviceAddressId || null,
            serviceAddressLabel: ticket.serviceAddressLabel || null,
            serviceAddressLine1: ticket.serviceAddressLine1 || "",
            serviceAddressLine2: ticket.serviceAddressLine2 || null,
            serviceCity: ticket.serviceCity || "",
            serviceState: ticket.serviceState || "",
            servicePostalCode: ticket.servicePostalCode || "",
            issueSummary: newTicketSummary,
            issueDetails: separateRequestDescription,
            status: "new" satisfies TicketStatus,
            estimatedDurationMinutes: 60,
            assignedTechnicianId: null,
            assignedTechnicianName: null,
            primaryTechnicianId: null,
            secondaryTechnicianId: null,
            secondaryTechnicianName: null,
            helperIds: null,
            helperNames: null,
            assignedTechnicianIds: null,
            active: true,
            source: "field_separate_request",
            sourceLabel: "Requested on-site during completed service visit",
            requestedDuringServiceTicketId: ticket.id,
            requestedDuringTripId: trip.id,
            requestedByUid: myUid || null,
            requestedByName: appUser?.displayName || null,
            requestedByRole: appUser?.role || null,
            createdAt: now,
            createdByUid: myUid || null,
            updatedAt: now,
            updatedByUid: myUid || null,
          })
        );

        createdSeparateTicket = { id: newTicketRef.id, summary: newTicketSummary };

        const originalActivityRef = doc(
          collection(db, "serviceTickets", ticket.id, "activity")
        );
        const newTicketActivityRef = doc(
          collection(db, "serviceTickets", newTicketRef.id, "activity")
        );

        const originalActivityEntry: ServiceTicketActivityEntry = {
          id: originalActivityRef.id,
          type: "separate_service_request_created",
          title: "Separate Service Request Created",
          description:
            "Customer requested future work for a different issue while this ticket was being completed.",
          details: [
            `New ticket: ${newTicketRef.id}`,
            `New issue: ${separateRequestDescription}`,
          ],
          createdAt: now,
          createdByName: appUser?.displayName || "System",
          createdByRole: appUser?.role || null,
        };

        await Promise.all([
          setDoc(originalActivityRef, {
            type: originalActivityEntry.type,
            title: originalActivityEntry.title,
            description: originalActivityEntry.description,
            details: originalActivityEntry.details,
            createdAt: now,
            createdByUid: myUid || null,
            createdByName: originalActivityEntry.createdByName,
            createdByRole: originalActivityEntry.createdByRole,
          }),
          setDoc(newTicketActivityRef, {
            type: "created_from_completed_service_ticket",
            title: "Created From Completed Service Visit",
            description:
              "This ticket was created from the field after the customer requested a future visit for a separate issue.",
            details: [
              `Original ticket: ${ticket.id}`,
              `Original trip: ${trip.id}`,
              `Issue: ${separateRequestDescription}`,
            ],
            createdAt: now,
            createdByUid: myUid || null,
            createdByName: appUser?.displayName || "System",
            createdByRole: appUser?.role || null,
          }),
        ]);

        setActivityEntries((prev) => [originalActivityEntry, ...prev]);
      }

      closeMobileFinishSheet();

      setTripOk(
        trip.id,
        `${mode === "resolved" ? "Resolved" : "Follow Up logged"}. Billable hours: ${hoursToUse}.${
          createdSeparateTicket ? " New service ticket created." : ""
        }`
      );

      if (isMobile) {
        setMobileCompletionResult({
          mode,
          originalTicketId: ticket?.id || "",
          newTicketId: createdSeparateTicket?.id || null,
          newTicketSummary: createdSeparateTicket?.summary || null,
        });
      }
    } catch (err: unknown) {
      setTripErr(trip.id, err instanceof Error ? err.message : "Failed to finish trip.");
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  function openEditTrip(trip: TripDoc) {
    if (ticket?.status === "invoiced") return;
    if (!canEditTripSchedule(trip.status, trip.timerState)) return;

    setEditTripPrimaryTechUid(String(trip.crew?.primaryTechUid || ""));
    setEditTripSecondaryTechUid(String(trip.crew?.secondaryTechUid || ""));
    setEditTripHelperUid(String(trip.crew?.helperUid || ""));
    setEditTripSecondaryHelperUid(String(trip.crew?.secondaryHelperUid || ""));
    setEditTripHolidayOverride(false);
    setEditTripDispatchOverrideEnabled(Boolean(trip.dispatchOverride?.enabled));
    setEditTripDispatchOverrideReason(String(trip.dispatchOverride?.reason || ""));

    const tripPrimaryUid = String(trip.crew?.primaryTechUid || "").trim();
    const tripHelperUid = String(trip.crew?.helperUid || "").trim();
    const defaultHelperUid =
      helperCandidates.find(
        (h) => String(h.defaultPairedTechUid || "").trim() === tripPrimaryUid
      )?.uid || "";

    setEditTripUseDefaultHelper(
      Boolean(tripPrimaryUid && tripHelperUid && defaultHelperUid === tripHelperUid)
    );

    setEditTripId(trip.id);
    setEditTripDate(trip.date || isoTodayLocal());
    setEditTripTimeWindow((trip.timeWindow as TripTimeWindow) || "custom");
    setEditTripStartTime(trip.startTime || "08:00");
    setEditTripEndTime(trip.endTime || "12:00");
    setEditTripNotes(String(trip.notes || ""));
    setEditTripErr("");
  }

  async function handleSaveTripEdit() {
    if (!canDispatch || !editTripId || !ticket?.id) return;
    if (ticket.status === "invoiced") {
      setEditTripErr("Invoiced tickets are locked and trip schedule cannot be edited.");
      return;
    }

    const trip = trips.find((t) => t.id === editTripId);
    if (!trip) return;

    setEditTripErr("");
    setEditTripSaving(true);

    try {
      if (!canEditTripSchedule(trip.status, trip.timerState)) {
        throw new Error("Only planned trips can be edited.");
      }

      if (!editTripDate.trim()) {
        throw new Error("Trip date is required.");
      }

      if (!editTripPrimaryTechUid.trim()) {
        throw new Error("Primary technician is required.");
      }

      if (
        !editTripStartTime.trim() ||
        !editTripEndTime.trim() ||
        editTripEndTime <= editTripStartTime
      ) {
        throw new Error("Enter a valid start and end time.");
      }

      const freshDayTrips = await loadAvailabilityTripsForDate(editTripDate);

      const latestDispatchConflicts = collectDispatchOverrideConflicts({
        members: buildCrewSelections({
          primaryTechUid: editTripPrimaryTechUid,
          secondaryTechUid: editTripSecondaryTechUid,
          helperUid: editTripHelperUid,
          secondaryHelperUid: editTripSecondaryHelperUid,
        }),
        date: editTripDate,
        timeWindow: editTripTimeWindow,
        startTime: editTripStartTime,
        endTime: editTripEndTime,
        dayTrips: freshDayTrips,
        ptoRequests,
        holidayNames: getHolidayNamesForDate(companyHolidays, editTripDate),
        holidayOverrideEnabled: editTripHolidayOverride,
        excludeTripId: trip.id,
      });

      if (latestDispatchConflicts.hardMessages.length > 0) {
        throw new Error(latestDispatchConflicts.hardMessages[0]);
      }

      if (latestDispatchConflicts.softMessages.length > 0) {
        if (!editTripDispatchOverrideEnabled) {
          throw new Error(
            "This selection overlaps another scheduled or in-progress trip. Enable Dispatch Override to save it as a planned trip."
          );
        }

        if (!editTripDispatchOverrideReason.trim()) {
          throw new Error("Dispatch Override reason is required.");
        }
      }

      const now = nowIso();

      const helperUid = editTripHelperUid.trim() || "";
      const secondaryTechUid = editTripSecondaryTechUid.trim() || "";
      const secondaryHelperUid = editTripSecondaryHelperUid.trim() || "";

      const primaryName = findTechName(editTripPrimaryTechUid) || "Unnamed Technician";
      const helperName = helperUid
        ? findHelperName(helperUid) || "Unnamed Helper"
        : null;
      const secondaryTechName = secondaryTechUid
        ? findTechName(secondaryTechUid) || "Unnamed Technician"
        : null;
      const secondaryHelperName = secondaryHelperUid
        ? findHelperName(secondaryHelperUid) || "Unnamed Helper"
        : null;

      const nextCrew: TripCrew = {
        primaryTechUid: editTripPrimaryTechUid || null,
        primaryTechName: editTripPrimaryTechUid ? primaryName : null,
        helperUid: helperUid || null,
        helperName,
        secondaryTechUid: secondaryTechUid || null,
        secondaryTechName,
        secondaryHelperUid: secondaryHelperUid || null,
        secondaryHelperName,
      };

      const dispatchOverride =
        latestDispatchConflicts.softMessages.length > 0
          ? ({
              enabled: true,
              reason: editTripDispatchOverrideReason.trim(),
              createdAt: now,
              createdByUid: appUser?.uid || null,
              createdByName: appUser?.displayName || null,
              conflictTypes: latestDispatchConflicts.softConflictTypes,
              conflictTripIds: latestDispatchConflicts.softTripIds,
            } satisfies DispatchOverrideInfo)
          : null;

      await updateDoc(doc(db, "trips", trip.id), {
        date: editTripDate,
        timeWindow: editTripTimeWindow,
        startTime: editTripStartTime,
        endTime: editTripEndTime,
        crew: nextCrew,
        crewConfirmed: null,
        dispatchOverride,
        notes: editTripNotes.trim() || null,
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      const helperIds = helperUid ? [helperUid] : [];
      const helperNames = helperName ? [helperName] : [];

      const assignedTechnicianIds = [editTripPrimaryTechUid];
      if (secondaryTechUid && secondaryTechUid !== editTripPrimaryTechUid) {
        assignedTechnicianIds.push(secondaryTechUid);
      }
      if (helperUid && !assignedTechnicianIds.includes(helperUid)) {
        assignedTechnicianIds.push(helperUid);
      }
      if (secondaryHelperUid && !assignedTechnicianIds.includes(secondaryHelperUid)) {
        assignedTechnicianIds.push(secondaryHelperUid);
      }

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        assignedTechnicianId: editTripPrimaryTechUid,
        assignedTechnicianName: primaryName,
        primaryTechnicianId: editTripPrimaryTechUid,
        secondaryTechnicianId: secondaryTechUid || null,
        secondaryTechnicianName: secondaryTechUid ? secondaryTechName : null,
        helperIds: helperIds.length ? helperIds : null,
        helperNames: helperNames.length ? helperNames : null,
        assignedTechnicianIds,
        updatedAt: now,
      });

      setTrips((prev) =>
        prev.map((t) =>
          t.id === trip.id
            ? {
                ...t,
                date: editTripDate,
                timeWindow: editTripTimeWindow,
                startTime: editTripStartTime,
                endTime: editTripEndTime,
                crew: nextCrew,
                crewConfirmed: null,
                dispatchOverride,
                notes: editTripNotes.trim() || null,
                updatedAt: now,
                updatedByUid: myUid || null,
              }
            : t
        )
      );

      setAvailabilityTripsByDate((prev) => {
        const nextByDate = { ...prev };
        nextByDate[trip.date] = (nextByDate[trip.date] || []).filter(
          (item) => item.id !== trip.id
        );
        nextByDate[editTripDate] = [
          ...(nextByDate[editTripDate] || []).filter((item) => item.id !== trip.id),
          {
            ...trip,
            date: editTripDate,
            timeWindow: editTripTimeWindow,
            startTime: editTripStartTime,
            endTime: editTripEndTime,
            crew: nextCrew,
            dispatchOverride,
          },
        ];
        return nextByDate;
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              assignedTechnicianId: editTripPrimaryTechUid,
              assignedTechnicianName: primaryName,
              primaryTechnicianId: editTripPrimaryTechUid,
              secondaryTechnicianId: secondaryTechUid || undefined,
              secondaryTechnicianName: secondaryTechName || undefined,
              helperIds: helperIds.length ? helperIds : undefined,
              helperNames: helperNames.length ? helperNames : undefined,
              assignedTechnicianIds,
              updatedAt: now,
            }
          : prev
      );

      setEditTripId(null);
      setEditTripDispatchOverrideEnabled(false);
      setEditTripDispatchOverrideReason("");
    } catch (err: unknown) {
      setEditTripErr(
        err instanceof Error ? err.message : "Failed to update trip."
      );
    } finally {
      setEditTripSaving(false);
    }
  }

  async function handleSoftDeleteTrip(trip: TripDoc) {
    if (!canDispatch) return;

    if (ticket?.status === "invoiced") {
      alert("Invoiced tickets are locked and trips cannot be removed.");
      return;
    }

    if (!canCancelTrip(trip.status, trip.timerState)) {
      alert("Only planned trips can be removed.");
      return;
    }

    if (
      window.prompt(
        `Type DELETE to remove ${trip.date} ${trip.startTime}-${trip.endTime}`,
        ""
      ) !== "DELETE"
    ) {
      return;
    }

    setTripSavingFlag(trip.id, true);
    setTripErr(trip.id, "");
    setTripOk(trip.id, "");

    try {
      const now = nowIso();
      const tripRef = doc(db, "trips", trip.id);
      const ticketRef = ticket?.id ? doc(db, "serviceTickets", ticket.id) : null;

      const nextTrips = trips.filter((t) => t.id !== trip.id);
      const nextStatus = deriveNextTicketStatus(nextTrips);
      const hasRemainingOpenTrips = nextTrips.some((item) => isOpenTripRecord(item));

      const batch = writeBatch(db);

      batch.delete(tripRef);

      if (ticketRef) {
        batch.update(
          ticketRef,
          stripUndefined({
            status: nextStatus,
            updatedAt: now,
            updatedByUid: myUid || null,

            // A deleted, never-started service trip should behave like scheduling never happened.
            // Clear the assignment/schedule fields so the ticket returns to the default Available Tickets queue.
            ...(hasRemainingOpenTrips
              ? {}
              : {
                  assignedTechnicianId: null,
                  assignedTechnicianName: null,
                  primaryTechnicianId: null,
                  secondaryTechnicianId: null,
                  secondaryTechnicianName: null,
                  helperIds: null,
                  helperNames: null,
                  assignedTechnicianIds: null,
                  scheduledDate: null,
                  scheduledStartTime: null,
                  scheduledEndTime: null,
                  scheduledTimeWindow: null,
                  scheduledTripId: null,
                  activeTripId: null,
                }),
          })
        );
      }

      const activityRef = ticket?.id
        ? doc(collection(db, "serviceTickets", ticket.id, "activity"))
        : null;

      if (activityRef) {
        batch.set(activityRef, {
          type: "scheduled_trip_deleted",
          title: "Scheduled Trip Removed",
          description:
            "A planned service trip was deleted before work started. The ticket was returned to the available work queue.",
          details: [
            `Deleted trip: ${trip.id}`,
            `Previous schedule: ${trip.date} ${trip.startTime}-${trip.endTime}`,
            `Next ticket status: ${formatTicketStatus(nextStatus)}`,
          ],
          createdAt: now,
          createdByUid: myUid || null,
          createdByName: appUser?.displayName || "System",
          createdByRole: appUser?.role || null,
        });
      }

      await batch.commit();

      setTrips(nextTrips);
      setAvailabilityTripsByDate((prev) => ({
        ...prev,
        [trip.date]: (prev[trip.date] || []).filter((item) => item.id !== trip.id),
      }));

      if (ticket?.id) {
        setTicket((prev) =>
          prev
            ? {
                ...prev,
                status: nextStatus,
                updatedAt: now,
                ...(hasRemainingOpenTrips
                  ? {}
                  : {
                      assignedTechnicianId: undefined,
                      assignedTechnicianName: undefined,
                      primaryTechnicianId: undefined,
                      secondaryTechnicianId: undefined,
                      secondaryTechnicianName: undefined,
                      helperIds: undefined,
                      helperNames: undefined,
                      assignedTechnicianIds: undefined,
                    }),
              }
            : prev
        );
        setTicketStatusEdit(nextStatus);
      }

      setActivityEntries((prev) => [
        {
          id: activityRef?.id || `local_${trip.id}_${now}`,
          type: "scheduled_trip_deleted",
          title: "Scheduled Trip Removed",
          description:
            "A planned service trip was deleted before work started. The ticket was returned to the available work queue.",
          details: [
            `Deleted trip: ${trip.id}`,
            `Previous schedule: ${trip.date} ${trip.startTime}-${trip.endTime}`,
            `Next ticket status: ${formatTicketStatus(nextStatus)}`,
          ],
          createdAt: now,
          createdByName: appUser?.displayName || "System",
          createdByRole: appUser?.role || null,
        },
        ...prev,
      ]);

      setTripOk(trip.id, "Scheduled trip deleted. Ticket returned to the available queue.");
    } catch (err: unknown) {
      setTripErr(
        trip.id,
        err instanceof Error ? err.message : "Failed to delete trip."
      );
    } finally {
      setTripSavingFlag(trip.id, false);
    }
  }

  async function handleClaimAndStartTrip() {
    if (!ticket?.id || !myUid) return;

    if (ticket.status === "invoiced") {
      alert("Invoiced tickets are locked and cannot be claimed or started.");
      return;
    }

    const role = String(appUser?.role || "").trim().toLowerCase();
    const isTechnicianClaimer = role === "technician";
    const isHelperClaimer = role === "helper" || role === "apprentice";

    if (!isTechnicianClaimer && !isHelperClaimer) {
      alert("Quick Claim & Start is only available to technicians, helpers, and apprentices.");
      return;
    }

    if (ticket.assignedTechnicianId) {
      alert("This ticket is already assigned.");
      return;
    }

    if (isTicketTerminal(ticket.status)) {
      alert("This ticket is not claimable.");
      return;
    }

    if (hasOpenTrips(trips)) {
      alert("This ticket already has an open trip.");
      return;
    }

    const remoteOpenTrips = await findOpenTripsForTicketId(ticket.id);
    if (remoteOpenTrips.length > 0) {
      alert(
        `This ticket already has an open trip in Firestore (${remoteOpenTrips[0].date} ${remoteOpenTrips[0].startTime}-${remoteOpenTrips[0].endTime}). Refresh and use that trip instead.`
      );
      return;
    }

    const now = new Date();
    const nowString = now.toISOString();

    let primaryTechUid = "";
    let primaryTechName = "";
    let helperUid = "";
    let helperName: string | null = null;

    if (isTechnicianClaimer) {
      primaryTechUid = myUid;
      primaryTechName = appUser?.displayName || "Technician";

      helperUid =
        helperCandidates.find(
          (h) => String(h.defaultPairedTechUid || "").trim() === myUid
        )?.uid || "";

      helperName = helperUid
        ? helperCandidates.find((h) => h.uid === helperUid)?.name || "Helper"
        : null;
    } else {
      const claimantProfile = helperCandidates.find((h) => h.uid === myUid);
      const pairedTechUid = String(claimantProfile?.defaultPairedTechUid || "").trim();

      if (!pairedTechUid) {
        alert(
          "No default paired technician is set for your profile. Ask the office to set one before using Claim & Start."
        );
        return;
      }

      if (pairedTechUid === myUid) {
        alert(
          "Your default paired technician setup is invalid. Ask the office to update your pairing."
        );
        return;
      }

      const pairedTech = technicians.find(
        (tech) => tech.uid === pairedTechUid && tech.active
      );

      if (!pairedTech) {
        alert(
          "Your default paired technician could not be found as an active technician. Ask the office to update your pairing."
        );
        return;
      }

      primaryTechUid = pairedTech.uid;
      primaryTechName = pairedTech.displayName || "Technician";
      helperUid = myUid;
      helperName = appUser?.displayName || claimantProfile?.name || "Helper";
    }

    if (!primaryTechUid.trim()) {
      alert("Unable to determine the primary technician for this trip.");
      return;
    }

    const runningConflicts = await findRunningTripsForCrewUids({
      crewUids: Array.from(new Set([primaryTechUid, helperUid].filter(Boolean))),
    });

    if (runningConflicts.length > 0) {
      alert(
        `Cannot claim and start because one of the assigned crew members already has a running trip: ${runningConflicts[0].summary}`
      );
      return;
    }

    try {
      const ticketRef = doc(db, "serviceTickets", ticket.id);
      const tripsRef = collection(db, "trips");
      const newTripRef = doc(tripsRef);

      await runTransaction(db, async (tx) => {
        const liveTicket = await tx.get(ticketRef);
        if (!liveTicket.exists()) throw new Error("Ticket not found.");

        const live = liveTicket.data() as any;
        if (live.assignedTechnicianId) throw new Error("Already claimed by another user.");
        if (isTicketTerminal(live.status)) throw new Error("Ticket is not claimable.");

        tx.set(newTripRef, {
          active: true,
          type: "service",
          status: "in_progress",
          date: isoTodayLocal(),
          timeWindow: "custom",
          startTime: hhmmLocal(now),
          endTime: hhmmLocal(addMinutes(now, 60)),
          billableHours: null,
          noMaterialsUsed: false,
          dispatchOverride: null,
          crew: {
            primaryTechUid,
            primaryTechName,
            helperUid: helperUid || null,
            helperName,
            secondaryTechUid: null,
            secondaryTechName: null,
            secondaryHelperUid: null,
            secondaryHelperName: null,
          },
          crewConfirmed: {
            primaryTechUid,
            primaryTechName,
            helperUid: helperUid || null,
            helperName,
            secondaryTechUid: null,
            secondaryTechName: null,
            secondaryHelperUid: null,
            secondaryHelperName: null,
          },
          link: {
            serviceTicketId: ticket.id,
            projectId: null,
            projectStageKey: null,
          },
          notes: null,
          cancelReason: null,
          timerState: "running",
          actualStartAt: nowString,
          actualEndAt: null,
          startedByUid: myUid,
          endedByUid: null,
          pauseBlocks: [],
          actualMinutes: null,
          workNotes: null,
          resolutionNotes: null,
          followUpNotes: null,
          materials: [],
          outcome: null,
          readyToBillAt: null,
          createdAt: nowString,
          createdByUid: myUid,
          updatedAt: nowString,
          updatedByUid: myUid,
        });

        tx.update(ticketRef, {
          status: "in_progress",
          assignedTechnicianId: primaryTechUid,
          assignedTechnicianName: primaryTechName,
          primaryTechnicianId: primaryTechUid,
          secondaryTechnicianId: null,
          secondaryTechnicianName: null,
          helperIds: helperUid ? [helperUid] : null,
          helperNames: helperName ? [helperName] : null,
          assignedTechnicianIds: helperUid ? [primaryTechUid, helperUid] : [primaryTechUid],
          updatedAt: nowString,
        });
      });

      window.location.reload();
    } catch (err: any) {
      alert(err?.message || "Failed to claim ticket.");
    }
  }

  async function copyPurchaseOrderCode(poCode: string) {
    const clean = String(poCode || "").trim().toUpperCase();
    if (!clean) return;

    try {
      await navigator.clipboard.writeText(clean);
    } catch {
      // Non-blocking clipboard fallback.
    }
  }

  async function openPurchaseOrderAttachment(attachment: PurchaseOrderAttachment) {
  const storagePath = String(attachment.storagePath || "").trim();

  if (!storagePath) {
    alert("This invoice PDF is missing its storage path.");
    return;
  }

  try {
    const storage = getStorage();
    const fileRef = ref(storage, storagePath);
    const url = await getDownloadURL(fileRef);

    window.open(url, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.error("Failed to open invoice PDF:", err);
    alert("Could not open invoice PDF. Check Firebase Storage permissions.");
  }
}


  async function handleGeneratePoFromTicket() {
    if (!eligibleTripForPo || !ticket?.id || !canGeneratePoFromTicket) return;

    setPoGenerating(true);
    setPoError("");
    setPoOk("");

    try {
      const record = await generatePurchaseOrderForTrip({
        db,
        tripId: eligibleTripForPo.id,
        requestedByUid: myUid || null,
        requestedByName: appUser?.displayName || null,
      });

      const nextPo: PurchaseOrderLite = {
        id: record.poCode,
        poCode: record.poCode,
        poIndex: record.poIndex,
        poSuffix: record.poSuffix,
        status: record.status,
        serviceTicketId: record.serviceTicketId || ticketId,
        tripId: record.tripId,
        requestedByUid: record.requestedByUid,
        requestedByName: record.requestedByName,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        vendorName: record.vendorName,
        matchedInvoiceId: record.matchedInvoiceId,
        matchedAttachmentIds: record.matchedAttachmentIds,
        invoiceEmailMessageId: record.invoiceEmailMessageId,
        invoiceEmailSubject: null,
        invoiceEmailFrom: null,
        invoiceEmailMatchedAt: null,
        invoiceAttachmentCount: 0,
        invoicePdfAttachmentCount: 0,
        matchedAttachments: [],
      };

      setPurchaseOrders((prev) =>
        [nextPo, ...prev.filter((po) => po.id !== nextPo.id)].sort((a, b) => {
          const ai = Number.isFinite(Number(a.poIndex)) ? Number(a.poIndex) : 9999;
          const bi = Number.isFinite(Number(b.poIndex)) ? Number(b.poIndex) : 9999;
          if (ai !== bi) return ai - bi;
          return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
        })
      );

      await copyPurchaseOrderCode(record.poCode);
      setPoOk(`Generated PO #${record.poCode}.`);
    } catch (err: unknown) {
      setPoError(err instanceof Error ? err.message : "Failed to generate PO number.");
    } finally {
      setPoGenerating(false);
    }
  }

  async function handleSaveBillingPacketDetails() {
    if (!ticket?.id || !canBill || !ticket.billing) return;
    if (ticket.status === "invoiced") {
      setBillingErr("Invoiced tickets are locked and billing details cannot be changed.");
      return;
    }

    setBillingErr("");
    setBillingOk("");
    setBillingSaving(true);

    try {
      const now = nowIso();

      const parsedAmount =
        billingMaterialsAmountEdit.trim() === ""
          ? null
          : Number(billingMaterialsAmountEdit);

      if (
        parsedAmount !== null &&
        (!Number.isFinite(parsedAmount) || parsedAmount < 0)
      ) {
        throw new Error("Materials Amount must be blank or a number 0 or greater.");
      }

      const nextBilling: BillingPacket = {
        ...ticket.billing,
        materialsSummary: billingMaterialsSummaryEdit.trim() || null,
        materialsAmount: parsedAmount,
        updatedAt: now,
      };

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        billing: nextBilling,
        updatedAt: now,
      });

      setTicket((prev) =>
        prev ? { ...prev, billing: nextBilling, updatedAt: now } : prev
      );

      setBillingOk("Billing packet details saved.");
    } catch (err: unknown) {
      setBillingErr(
        err instanceof Error ? err.message : "Failed to save billing packet details."
      );
    } finally {
      setBillingSaving(false);
    }
  }

  function openCloseFollowUpDialog() {
    setCloseFollowUpReason("customer_declined");
    setCloseFollowUpNote("");
    setCloseFollowUpErr("");
    setShowCloseFollowUpDialog(true);
  }

  function closeCloseFollowUpDialog() {
    if (closeFollowUpSaving) return;
    setShowCloseFollowUpDialog(false);
    setCloseFollowUpErr("");
  }

  async function handleCloseFollowUpWithoutReturnVisit() {
    if (!ticket?.id || !canBill) return;

    setCloseFollowUpErr("");
    setBillingErr("");
    setBillingOk("");

    if (ticket.status === "invoiced") {
      setCloseFollowUpErr("Invoiced tickets are locked and cannot be changed.");
      return;
    }

    const closureNote = closeFollowUpNote.trim();
    if (!closureNote) {
      setCloseFollowUpErr("Office note is required before sending this ticket to billing.");
      return;
    }

    const reason =
      FOLLOW_UP_CLOSURE_REASONS.find((item) => item.code === closeFollowUpReason) ||
      FOLLOW_UP_CLOSURE_REASONS[FOLLOW_UP_CLOSURE_REASONS.length - 1];

    const latestCompletedTrip = getLatestCompletedTripForLifecycle(trips);
    const latestOutcome = String(latestCompletedTrip?.outcome || "")
      .trim()
      .toLowerCase();

    if (!latestCompletedTrip || latestOutcome !== "follow_up") {
      setCloseFollowUpErr(
        "This action is only available when the latest completed trip outcome is Follow Up."
      );
      return;
    }

    if (hasOpenTrips(trips)) {
      setCloseFollowUpErr(
        "An open follow-up trip exists. Complete or cancel that trip before sending this ticket to billing."
      );
      return;
    }

    setCloseFollowUpSaving(true);

    try {
      const remoteOpenTrips = await findOpenTripsForTicketId(ticket.id);
      if (remoteOpenTrips.length > 0) {
        throw new Error(
          "An open follow-up trip exists in Firestore. Complete or cancel it before sending this ticket to billing."
        );
      }

      const now = nowIso();
      const nextBilling = buildBillingPacketFromClosedFollowUp({
        trips,
        fallbackUpdatedAt: now,
        reasonLabel: reason.label,
        closureNote,
      });

      if (!nextBilling) {
        throw new Error(
          "Unable to create the billing packet because a completed Follow-Up trip could not be confirmed."
        );
      }

      const followUpClosure: FollowUpClosure = {
        status: "closed_without_return_visit",
        reasonCode: reason.code,
        reasonLabel: reason.label,
        note: closureNote,
        sourceTripId: latestCompletedTrip.id,
        closedAt: now,
        closedByUid: myUid || null,
        closedByName: appUser?.displayName || null,
        closedByRole: appUser?.role || null,
      };

      const activityRef = doc(collection(db, "serviceTickets", ticket.id, "activity"));
      const activityEntry: ServiceTicketActivityEntry = {
        id: activityRef.id,
        type: "follow_up_closed_without_return_visit",
        title: "Follow-Up Closed — Ready to Bill",
        description:
          "No return trip was performed. Existing completed trip labor and materials were sent to billing.",
        details: [
          `Reason: ${reason.label}`,
          `Office note: ${closureNote}`,
          `Source trip: ${latestCompletedTrip.id}`,
        ],
        createdAt: now,
        createdByName: appUser?.displayName || "System",
        createdByRole: appUser?.role || null,
      };

      const batch = writeBatch(db);
      batch.update(doc(db, "serviceTickets", ticket.id), {
        status: "completed",
        billing: nextBilling,
        followUpClosure,
        updatedAt: now,
        updatedByUid: myUid || null,
      });
      batch.set(activityRef, {
        type: activityEntry.type,
        title: activityEntry.title,
        description: activityEntry.description,
        details: activityEntry.details,
        createdAt: now,
        createdByUid: myUid || null,
        createdByName: activityEntry.createdByName,
        createdByRole: activityEntry.createdByRole,
      });
      await batch.commit();

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              billing: nextBilling,
              followUpClosure,
              updatedAt: now,
            }
          : prev
      );
      setTicketStatusEdit("completed");
      setBillingMaterialsSummaryEdit(
        String(nextBilling.materialsSummary || "").trim() ||
          buildMaterialsSummaryFromLines(nextBilling.materials)
      );
      setBillingMaterialsAmountEdit("");
      setActivityEntries((prev) => [activityEntry, ...prev]);
      setShowCloseFollowUpDialog(false);
      setBillingOk("Follow-up closed without a return visit. Ticket is Ready to Bill.");
      setCloseFollowUpNote("");
      setCloseFollowUpReason("customer_declined");
    } catch (err: unknown) {
      setCloseFollowUpErr(
        err instanceof Error
          ? err.message
          : "Failed to close follow-up and send this ticket to billing."
      );
    } finally {
      setCloseFollowUpSaving(false);
    }
  }

  async function handleResyncBillingPacket() {
    if (!ticket?.id || !canBill) return;

    if (ticket.status === "invoiced") {
      setBillingErr("Invoiced tickets are locked and billing packet cannot be resynced.");
      return;
    }

    setBillingErr("");
    setBillingOk("");
    setBillingSaving(true);

    try {
      const now = nowIso();
      const nextBilling =
        buildBillingPacketFromResolvedTrips({
          trips,
          fallbackUpdatedAt: now,
        }) ||
        (ticket.followUpClosure?.status === "closed_without_return_visit"
          ? buildBillingPacketFromClosedFollowUp({
              trips,
              fallbackUpdatedAt: now,
              reasonLabel: ticket.followUpClosure.reasonLabel,
              closureNote: ticket.followUpClosure.note,
            })
          : null);

      if (!nextBilling) {
        throw new Error(
          "No billing-ready lifecycle was found. Complete the latest trip as Resolved, or close a Follow-Up without a return visit first."
        );
      }

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        billing: nextBilling,
        status: "completed",
        updatedAt: now,
        updatedByUid: myUid || null,
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              billing: nextBilling,
              status: "completed",
              updatedAt: now,
            }
          : prev
      );

      setTicketStatusEdit("completed");
      setBillingMaterialsSummaryEdit(
        String(nextBilling.materialsSummary || "").trim() ||
          buildMaterialsSummaryFromLines(nextBilling.materials)
      );
      setBillingMaterialsAmountEdit(
        typeof nextBilling.materialsAmount === "number" &&
          Number.isFinite(nextBilling.materialsAmount)
          ? String(nextBilling.materialsAmount)
          : ""
      );

      setBillingOk("Billing packet resynced and set to Ready to Bill.");
    } catch (err: unknown) {
      setBillingErr(
        err instanceof Error ? err.message : "Failed to resync billing packet."
      );
    } finally {
      setBillingSaving(false);
    }
  }

  async function markBillingStatus(nextStatus: BillingPacket["status"]) {
    if (!ticket?.id || !canBill) return;
    if (ticket.status === "invoiced") {
      setBillingErr("Invoiced tickets are locked and billing status cannot be changed.");
      return;
    }

    setBillingErr("");
    setBillingOk("");
    setBillingSaving(true);

    try {
      const now = nowIso();

      const parsedAmount =
        billingMaterialsAmountEdit.trim() === ""
          ? null
          : Number(billingMaterialsAmountEdit);

      if (
        parsedAmount !== null &&
        (!Number.isFinite(parsedAmount) || parsedAmount < 0)
      ) {
        throw new Error("Materials Amount must be blank or a number 0 or greater.");
      }

      const base: BillingPacket =
        ticket.billing || {
          status: "not_ready",
          readyToBillAt: null,
          readyToBillTripId: null,
          resolutionNotes: null,
          workNotes: null,
          labor: { totalHours: 0, byCrew: [] },
          materials: [],
          materialsSummary: null,
          materialsAmount: null,
          photos: [],
          invoiceSource: null,
          qboInvoiceId: null,
          qboDocNumber: null,
          qboInvoiceUrl: null,
          qboSyncedAt: null,
          qboInvoiceStatus: null,
          invoiceError: null,
          updatedAt: now,
        };

      const next: BillingPacket = {
        ...base,
        status: nextStatus,
        materialsSummary: billingMaterialsSummaryEdit.trim() || null,
        materialsAmount: parsedAmount,
        updatedAt: now,
      };

      if (nextStatus === "not_ready") {
        next.readyToBillAt = null;
        next.readyToBillTripId = null;
        next.invoiceSource = null;
        next.invoiceError = null;
      }

      if (nextStatus === "ready_to_bill") {
        next.invoiceSource = null;
        next.invoiceError = null;
      }

      if (nextStatus === "invoiced") {
        next.invoiceSource = next.invoiceSource || "manual";
        next.qboInvoiceStatus = next.qboInvoiceStatus || "manual";
        next.invoiceError = null;
      }

      const nextTicketStatus: TicketStatus =
        nextStatus === "invoiced" ? "invoiced" : ticket.status;

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        billing: next,
        status: nextTicketStatus,
        updatedAt: now,
      });

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              billing: next,
              status: nextTicketStatus,
              updatedAt: now,
            }
          : prev
      );

      setTicketStatusEdit(nextTicketStatus);

      setBillingOk(`Billing status updated: ${formatBillingPacketStatus(nextStatus)}`);
    } catch (err: unknown) {
      setBillingErr(
        err instanceof Error ? err.message : "Failed to update billing status."
      );
    } finally {
      setBillingSaving(false);
    }
  }

  async function handleCreateQboInvoice() {
    if (!ticket?.id || !canBill || !ticket.billing) return;
    if (isInvoicedTicket) {
      setBillingErr("This ticket is already invoiced.");
      return;
    }

    if (
      ticket.billing.status !== "ready_to_bill" &&
      ticket.billing.status !== "invoice_failed"
    ) {
      setBillingErr("Billing packet must be Ready to Bill before creating a QBO invoice.");
      return;
    }

    setBillingErr("");
    setBillingOk("");
    setBillingSaving(true);

    const optimisticAt = nowIso();

    const invoiceWindow =
      typeof window !== "undefined"
        ? window.open("", "_blank", "noopener,noreferrer")
        : null;

    setTicket((prev) =>
      prev && prev.billing
        ? {
            ...prev,
            billing: {
              ...prev.billing,
              status: "creating_invoice",
              invoiceError: null,
              updatedAt: optimisticAt,
            },
            updatedAt: optimisticAt,
          }
        : prev
    );

    try {
      const res = await fetch("/api/qbo/invoices/create-from-service-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceTicketId: ticket.id,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          String(
            data?.error ||
              data?.qboBody?.Fault?.Error?.[0]?.Message ||
              "Failed to create QBO invoice."
          )
        );
      }

      const updatedAt = String(data?.updatedAt || nowIso());
      const updatedBilling = (data?.updatedBilling || null) as BillingPacket | null;
      const updatedTicketStatus = (data?.updatedTicketStatus || "invoiced") as TicketStatus;
      const qboInvoiceUrl = String(data?.qboInvoiceUrl || "").trim();

      setTicket((prev) =>
        prev
          ? {
              ...prev,
              status: updatedTicketStatus,
              billing: updatedBilling || prev.billing || null,
              updatedAt,
            }
          : prev
      );

      setTicketStatusEdit(updatedTicketStatus);
      setBillingOk("QBO invoice created successfully.");

      if (qboInvoiceUrl) {
        if (invoiceWindow) {
          invoiceWindow.location.href = qboInvoiceUrl;
        } else if (typeof window !== "undefined") {
          window.open(qboInvoiceUrl, "_blank", "noopener,noreferrer");
        }
      } else if (invoiceWindow) {
        invoiceWindow.close();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create QBO invoice.";
      const failedAt = nowIso();

      if (invoiceWindow) {
        invoiceWindow.close();
      }

      setTicket((prev) =>
        prev && prev.billing
          ? {
              ...prev,
              billing: {
                ...prev.billing,
                status: "invoice_failed",
                invoiceSource: "qbo",
                invoiceError: message,
                updatedAt: failedAt,
              },
              updatedAt: failedAt,
            }
          : prev
      );

      setBillingErr(message);
    } finally {
      setBillingSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Service Ticket Detail">
      <AppShell appUser={appUser}>
        {loading ? <Alert severity="info">Loading service ticket…</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && !error && ticket ? (
          <Stack
            spacing={3}
            sx={{
              minWidth: 0,
              maxWidth: "100%",
              overflowX: "clip",
              "& .MuiPaper-root, & .MuiCard-root": {
                minWidth: 0,
                maxWidth: "100%",
              },
              "& .MuiChip-root": {
                maxWidth: "100%",
              },
              "& .MuiChip-label": {
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
              "& .MuiTypography-root": {
                minWidth: 0,
              },
            }}
          >
            {isInvoicedTicket ? (
              <Alert severity="success" variant="outlined">
                This ticket has been invoiced and is now locked from dispatch, trip, and billing edits.
              </Alert>
            ) : null}

            <Dialog
              fullScreen={isMobile}
              open={Boolean(mobileFinishTrip)}
              onClose={closeMobileFinishSheet}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle sx={{ pb: 1 }}>
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", letterSpacing: "0.08em" }}
                    >
                      Finish Trip
                    </Typography>

                    <Typography variant="h6" fontWeight={800} sx={{ mt: 0.25 }} noWrap>
                      {ticket.customerDisplayName || "Customer"}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {ticket.issueSummary || "Service Ticket"}
                    </Typography>

                    <Chip
                      sx={{ mt: 1.25 }}
                      size="small"
                      color={mobileFinishMode === "resolved" ? "success" : "warning"}
                      icon={mobileFinishMode === "resolved" ? <CheckRoundedIcon /> : undefined}
                      label={mobileFinishMode === "resolved" ? "Resolved" : "Follow-Up"}
                    />
                  </Box>

                  <IconButton onClick={closeMobileFinishSheet}>
                    <CloseRoundedIcon />
                  </IconButton>
                </Stack>
              </DialogTitle>

              <DialogContent dividers>
                {mobileFinishTrip ? (
                  <Stack spacing={2}>
                    <TextField
                      label="Hours (override)"
                      type="number"
                      size="small"
                      inputProps={{ min: 0, step: 0.5 }}
                      value={
                        typeof hoursOverrideByTrip[mobileFinishTrip.id] === "number"
                          ? hoursOverrideByTrip[mobileFinishTrip.id]
                          : getDefaultBillableHours(
                              Math.max(
                                0,
                                (() => {
                                  const paused = sumPausedMinutes(
                                    mobileFinishTrip.pauseBlocks,
                                    liveNowIso
                                  );
                                  const gross =
                                    mobileFinishTrip.actualStartAt &&
                                    !mobileFinishTrip.actualEndAt
                                      ? minutesBetweenIso(
                                          mobileFinishTrip.actualStartAt,
                                          liveNowIso
                                        )
                                      : mobileFinishTrip.actualStartAt &&
                                          mobileFinishTrip.actualEndAt
                                        ? minutesBetweenIso(
                                            mobileFinishTrip.actualStartAt,
                                            mobileFinishTrip.actualEndAt
                                          )
                                        : 0;
                                  return gross - paused;
                                })()
                              )
                            )
                      }
                      onChange={(e) =>
                        setHoursOverrideByTrip((prev) => ({
                          ...prev,
                          [mobileFinishTrip.id]: Number(e.target.value),
                        }))
                      }
                      helperText="Timer default shown above; you can override if needed."
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={helperConfirmedByTrip[mobileFinishTrip.id] ?? true}
                          onChange={(e) =>
                            setHelperConfirmedByTrip((prev) => ({
                              ...prev,
                              [mobileFinishTrip.id]: e.target.checked,
                            }))
                          }
                        />
                      }
                      label="Include helper in payroll"
                    />

                    {mobileFinishMode === "follow_up" ? (
                      <>
                        <TextField
                          label="Follow-Up Notes"
                          multiline
                          minRows={5}
                          autoFocus
                          value={tripFollowUpNotes[mobileFinishTrip.id] ?? ""}
                          onChange={(e) =>
                            setTripFollowUpNotes((prev) => ({
                              ...prev,
                              [mobileFinishTrip.id]: e.target.value,
                            }))
                          }
                          error={mobileFollowUpNoteMissing}
                          helperText={
                            mobileFollowUpNoteMissing
                              ? "Follow-up notes are required to complete as Follow-Up."
                              : undefined
                          }
                        />

                        {renderTripMaterialsEditor(mobileFinishTrip.id)}
                      </>
                    ) : null}

                    {mobileFinishMode === "resolved" ? (
                      <>
                        <TextField
                          label="Resolution Notes"
                          multiline
                          minRows={5}
                          autoFocus
                          value={tripResolutionNotes[mobileFinishTrip.id] ?? ""}
                          onChange={(e) =>
                            setTripResolutionNotes((prev) => ({
                              ...prev,
                              [mobileFinishTrip.id]: e.target.value,
                            }))
                          }
                          error={mobileResolutionNoteMissing}
                          helperText={
                            mobileResolutionNoteMissing
                              ? "Resolution notes are required to complete as Resolved."
                              : undefined
                          }
                        />

                        {renderTripMaterialsEditor(mobileFinishTrip.id)}

                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: alpha(theme.palette.primary.main, 0.035),
                          }}
                        >
                          <Stack spacing={1.25}>
                            <Typography variant="subtitle1" fontWeight={800}>
                              Did the customer ask for a future visit for a different issue?
                            </Typography>

                            <Stack direction="row" spacing={1}>
                              <Button
                                fullWidth
                                variant={
                                  (separateRequestChoiceByTrip[mobileFinishTrip.id] || "no") === "no"
                                    ? "contained"
                                    : "outlined"
                                }
                                color="primary"
                                onClick={() => {
                                  setSeparateRequestChoiceByTrip((prev) => ({
                                    ...prev,
                                    [mobileFinishTrip.id]: "no",
                                  }));
                                  setSeparateRequestDescriptionByTrip((prev) => ({
                                    ...prev,
                                    [mobileFinishTrip.id]: "",
                                  }));
                                }}
                                sx={{ borderRadius: 999, fontWeight: 800 }}
                              >
                                No
                              </Button>

                              <Button
                                fullWidth
                                variant={
                                  separateRequestChoiceByTrip[mobileFinishTrip.id] === "yes"
                                    ? "contained"
                                    : "outlined"
                                }
                                color="primary"
                                onClick={() =>
                                  setSeparateRequestChoiceByTrip((prev) => ({
                                    ...prev,
                                    [mobileFinishTrip.id]: "yes",
                                  }))
                                }
                                sx={{ borderRadius: 999, fontWeight: 800 }}
                              >
                                Yes
                              </Button>
                            </Stack>

                            {separateRequestChoiceByTrip[mobileFinishTrip.id] === "yes" ? (
                              <Stack spacing={1}>
                                <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
                                  Customer and service location will be copied to a new unscheduled ticket.
                                </Alert>

                                <TextField
                                  label="Brief Issue Description"
                                  multiline
                                  minRows={3}
                                  value={separateRequestDescriptionByTrip[mobileFinishTrip.id] || ""}
                                  onChange={(e) =>
                                    setSeparateRequestDescriptionByTrip((prev) => ({
                                      ...prev,
                                      [mobileFinishTrip.id]: e.target.value,
                                    }))
                                  }
                                  error={mobileSeparateRequestDescriptionMissing}
                                  helperText={
                                    mobileSeparateRequestDescriptionMissing
                                      ? "Required to create the new service ticket."
                                      : "Keep it brief. Dispatch can schedule and edit later."
                                  }
                                  placeholder="Example: Customer wants kitchen faucet replaced next week."
                                  fullWidth
                                />
                              </Stack>
                            ) : null}
                          </Stack>
                        </Paper>
                      </>
                    ) : null}
                  </Stack>
                ) : null}
              </DialogContent>

              <DialogActions
                sx={{ p: 2, pb: "calc(16px + env(safe-area-inset-bottom))" }}
              >
                <Button onClick={closeMobileFinishSheet}>Cancel</Button>

                {mobileFinishTrip ? (
                  <Button
                    variant="contained"
                    color={mobileFinishMode === "resolved" ? "success" : "primary"}
                    onClick={() =>
                      finishTrip(
                        mobileFinishTrip,
                        mobileFinishMode as "resolved" | "follow_up"
                      )
                    }
                    disabled={mobileCompleteDisabled}
                  >
                    {mobileFinishMode === "resolved"
                      ? "Complete as Resolved"
                      : "Complete as Follow-Up"}
                  </Button>
                ) : null}
              </DialogActions>
            </Dialog>

            <Dialog
              fullScreen={isMobile}
              open={Boolean(mobileCompletionResult)}
              onClose={() => setMobileCompletionResult(null)}
              fullWidth
              maxWidth="xs"
            >
              <DialogContent
                sx={{
                  pt: { xs: 7, sm: 4 },
                  pb: 2,
                }}
              >
                <Stack spacing={2.5} alignItems="center" textAlign="center">
                  <Box
                    sx={{
                      width: 86,
                      height: 86,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: alpha(theme.palette.success.main, 0.14),
                      color: "success.main",
                    }}
                  >
                    <CheckRoundedIcon sx={{ fontSize: 52 }} />
                  </Box>

                  <Box>
                    <Typography variant="h5" fontWeight={900}>
                      {mobileCompletionResult?.mode === "resolved"
                        ? "Service Ticket Completed"
                        : "Follow-Up Saved"}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                      Hours and materials were saved.
                      {mobileCompletionResult?.mode === "resolved"
                        ? " Original ticket is ready for billing."
                        : " Ticket is marked for follow-up."}
                    </Typography>
                  </Box>

                  {mobileCompletionResult?.newTicketId ? (
                    <Paper
                      variant="outlined"
                      sx={{
                        width: "100%",
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.success.main, 0.08),
                        borderColor: alpha(theme.palette.success.main, 0.24),
                        textAlign: "left",
                      }}
                    >
                      <Stack direction="row" spacing={1.25} alignItems="flex-start">
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            flexShrink: 0,
                            display: "grid",
                            placeItems: "center",
                            bgcolor: alpha(theme.palette.success.main, 0.14),
                            color: "success.main",
                          }}
                        >
                          <ScheduleRoundedIcon />
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={900} color="success.main">
                            New service ticket created
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.25 }}>
                            {ticket.customerDisplayName || "Customer"}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            {mobileCompletionResult.newTicketSummary || "Future service request"}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  ) : null}
                </Stack>
              </DialogContent>

              <DialogActions
                sx={{
                  p: 2,
                  pt: 0,
                  pb: "calc(16px + env(safe-area-inset-bottom))",
                  display: "grid",
                  gap: 1,
                }}
              >
                {mobileCompletionResult?.newTicketId ? (
                  <Button
                    variant="contained"
                    onClick={() => {
                      const nextId = mobileCompletionResult.newTicketId;
                      setMobileCompletionResult(null);
                      router.push(`/service-tickets/${nextId}`);
                    }}
                    sx={{ minHeight: 48, borderRadius: 999, fontWeight: 900 }}
                  >
                    View New Ticket
                  </Button>
                ) : null}

                <Button
                  variant={mobileCompletionResult?.newTicketId ? "outlined" : "contained"}
                  onClick={() => {
                    setMobileCompletionResult(null);
                    router.push("/technician/my-day");
                  }}
                  sx={{ minHeight: 48, borderRadius: 999, fontWeight: 900 }}
                >
                  Back to My Day
                </Button>
              </DialogActions>
            </Dialog>

            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", md: "center" }}
              spacing={2}
              sx={{ minWidth: 0, maxWidth: "100%" }}
            >
              <Stack spacing={1} sx={{ minWidth: 0, maxWidth: "100%", flex: 1 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ minWidth: 0, maxWidth: "100%" }}
                >
                  <Typography
                    variant="h4"
                    fontWeight={800}
                    sx={{
                      minWidth: 0,
                      maxWidth: "100%",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      fontSize: { xs: "1.8rem", sm: "2.125rem" },
                      lineHeight: 1.08,
                    }}
                  >
                    {ticket.issueSummary}
                  </Typography>
                  <Chip
                    label={formatTicketStatus(ticket.status)}
                    color={getTicketTone(ticket.status)}
                    size="small"
                  />
                </Stack>

                {!isFieldUser ? (
                  <Stack
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                    sx={{
                      minWidth: 0,
                      maxWidth: "100%",
                      overflow: "hidden",
                    }}
                  >
                    <Chip
                      title={ticketId}
                      aria-label={`Ticket ID ${ticketId}`}
                      label={`Ticket ID: ${
                        isMobile ? middleTruncate(ticketId, 8, 5) : ticketId
                      }`}
                      variant="outlined"
                      sx={{
                        maxWidth: { xs: "calc(100vw - 94px)", sm: 420 },
                        minWidth: 0,
                        "& .MuiChip-label": {
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label="Copy service ticket ID"
                      onClick={() =>
                        navigator.clipboard.writeText(ticketId).catch(() => undefined)
                      }
                      sx={{ flexShrink: 0 }}
                    >
                      <ContentCopyRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ) : null}
              </Stack>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ width: { xs: "100%", md: "auto" }, minWidth: 0 }}
              >
                {isFieldUser && !ticket.assignedTechnicianId && !hasOpenTrips(trips) ? (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleClaimAndStartTrip}
                    startIcon={<PlayArrowRoundedIcon />}
                    disabled={isInvoicedTicket}
                  >
                    Claim & Start Trip
                  </Button>
                ) : null}

                <Button
                  component={Link}
                  href="/service-tickets"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  Back to Tickets
                </Button>
              </Stack>
            </Stack>

            <Box
              sx={{
                display: "grid",
                gap: 2.5,
                minWidth: 0,
                maxWidth: "100%",
                overflowX: "clip",
                gridTemplateColumns: {
                  xs: "minmax(0, 1fr)",
                  lg: "minmax(0, 1.2fr) minmax(0, 0.95fr)",
                },
              }}
            >
              <Stack spacing={2.5} sx={{ minWidth: 0, maxWidth: "100%" }}>
                <Stack spacing={1} sx={{ minWidth: 0, maxWidth: "100%" }}>
                  <Box
                    sx={{
                      minWidth: 0,
                      maxWidth: "100%",
                      overflowX: "clip",
                      "& .MuiStack-root": { minWidth: 0 },
                      "& .MuiChip-root": { maxWidth: "100%" },
                      "& .MuiChip-label": {
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                      "& .MuiTypography-root": {
                        minWidth: 0,
                        overflowWrap: "anywhere",
                      },
                    }}
                  >
                    <ServiceTicketLocationCard
                    customerDisplayName={ticket.customerDisplayName}
                    customerHref={
                      ticket.customerId ? `/customers/${ticket.customerId}` : undefined
                    }
                    serviceAddressLine1={ticket.serviceAddressLine1}
                    serviceAddressLine2={ticket.serviceAddressLine2}
                    serviceCity={ticket.serviceCity}
                    serviceState={ticket.serviceState}
                    servicePostalCode={ticket.servicePostalCode}
                    customerPhone={customerPhone}
                    customerEmail={customerEmail}
                    showEmail={!isFieldUser}
                  />
                  </Box>

                  {canDispatch ? (
                    <Button
                      variant="outlined"
                      startIcon={<LocationOnRoundedIcon />}
                      onClick={openEditLocationDialog}
                      disabled={isInvoicedTicket}
                      sx={{
                        alignSelf: { xs: "stretch", sm: "flex-start" },
                        borderRadius: 999,
                        fontWeight: 700,
                      }}
                    >
                      Edit Service Location
                    </Button>
                  ) : null}

                  {locationOk ? <Alert severity="success">{locationOk}</Alert> : null}
                </Stack>

                <Section
                  title="Ticket Overview"
                  icon={<AssignmentTurnedInRoundedIcon color="primary" />}
                >
                  {canDispatch ? (
                    <Stack spacing={2}>
                      <Alert severity="info" variant="outlined">
                        Status changes are guarded by the trip lifecycle. Customer cannot be changed from this page.
                      </Alert>

                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        }}
                      >
                        <TextField
                          select
                          size="small"
                          label="Status"
                          value={ticketStatusEdit}
                          onChange={(e) =>
                            setTicketStatusEdit(e.target.value as TicketStatus)
                          }
                          disabled={isInvoicedTicket}
                        >
                          <MenuItem value="new">New</MenuItem>
                          <MenuItem value="scheduled">Scheduled</MenuItem>
                          <MenuItem value="in_progress">In Progress</MenuItem>
                          <MenuItem value="follow_up">Follow Up</MenuItem>
                          <MenuItem value="completed">Completed</MenuItem>
                          <MenuItem value="invoiced">Invoiced</MenuItem>
                          <MenuItem value="cancelled">Cancelled</MenuItem>
                        </TextField>

                        <TextField
                          size="small"
                          type="number"
                          label="Estimated Duration (hours)"
                          inputProps={{ min: 1, step: 0.5 }}
                          value={ticketEstimatedHoursEdit}
                          onChange={(e) => setTicketEstimatedHoursEdit(e.target.value)}
                          disabled={isInvoicedTicket}
                          helperText="Minimum 1 hour. Use 0.5 hour increments."
                        />
                      </Box>

                      <TextField
                        size="small"
                        label="Issue Summary"
                        value={ticketIssueSummaryEdit}
                        onChange={(e) => setTicketIssueSummaryEdit(e.target.value)}
                        disabled={isInvoicedTicket}
                      />

                      <TextField
                        multiline
                        minRows={4}
                        label="Issue Details"
                        value={ticketIssueDetailsEdit}
                        onChange={(e) => setTicketIssueDetailsEdit(e.target.value)}
                        disabled={isInvoicedTicket}
                      />

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button
                          variant="contained"
                          onClick={handleSaveTicketOverview}
                          disabled={ticketEditSaving || isInvoicedTicket}
                        >
                          {ticketEditSaving ? "Saving..." : "Save Ticket Overview"}
                        </Button>

                        {ticketEditErr ? <Alert severity="error">{ticketEditErr}</Alert> : null}
                        {ticketEditOk ? <Alert severity="success">{ticketEditOk}</Alert> : null}
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack spacing={1}>
                      <Typography variant="body1">
                        <strong>Status:</strong> {formatTicketStatus(ticket.status)}
                      </Typography>
                      <Typography variant="body1">
                        <strong>Issue Summary:</strong> {ticket.issueSummary || "—"}
                      </Typography>
                      <Typography variant="body1">
                        <strong>Estimated Duration:</strong>{" "}
                        {Math.max(
                          1,
                          Number(ticket.estimatedDurationMinutes || 60) / 60
                        )}{" "}
                        hour
                        {Math.max(
                          1,
                          Number(ticket.estimatedDurationMinutes || 60) / 60
                        ) === 1
                          ? ""
                          : "s"}
                      </Typography>
                      <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                        {ticket.issueDetails || "No additional issue details."}
                      </Typography>
                    </Stack>
                  )}
                </Section>

                <Box id="service-ticket-attachments">
                  <Section
                    title="Attachments"
                    icon={<AttachFileRoundedIcon color="primary" />}
                  >
                    <Stack spacing={2}>
                      {canAddTicketAttachments ? (
                        <Stack spacing={1.25}>
                          <Typography variant="body2" color="text.secondary">
                            Add customer-sent files before scheduling, capture a new field photo,
                            or attach photos/videos during the visit.
                          </Typography>

                          <Box>
                            <Button
                              variant="contained"
                              startIcon={<AddPhotoAlternateRoundedIcon />}
                              disabled={attachmentUploading || isInvoicedTicket}
                              onClick={handleAttachmentMenuOpen}
                              fullWidth={isMobile}
                              sx={{ borderRadius: 999, fontWeight: 800 }}
                            >
                              {attachmentUploading ? "Uploading..." : "Add Attachment"}
                            </Button>

                            <input
                              ref={attachmentCameraInputRef}
                              hidden
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleAttachmentInputChange}
                            />
                            <input
                              ref={attachmentMediaInputRef}
                              hidden
                              type="file"
                              accept="image/*,video/*"
                              multiple
                              onChange={handleAttachmentInputChange}
                            />
                            <input
                              ref={attachmentFileInputRef}
                              hidden
                              type="file"
                              accept="image/*,video/*,application/pdf"
                              multiple
                              onChange={handleAttachmentInputChange}
                            />

                            <Menu
                              anchorEl={attachmentMenuAnchorEl}
                              open={Boolean(attachmentMenuAnchorEl)}
                              onClose={handleAttachmentMenuClose}
                              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                              transformOrigin={{ vertical: "top", horizontal: "left" }}
                              PaperProps={{
                                sx: {
                                  mt: 1,
                                  minWidth: 260,
                                  borderRadius: 1,
                                  overflow: "hidden",
                                  boxShadow: theme.shadows[8],
                                },
                              }}
                            >
                              <MenuItem onClick={() => triggerAttachmentInput("camera")}>
                                <ListItemIcon>
                                  <AddPhotoAlternateRoundedIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                  primary="Camera"
                                  secondary="Take a new photo"
                                  primaryTypographyProps={{ fontWeight: 800 }}
                                />
                              </MenuItem>

                              <MenuItem onClick={() => triggerAttachmentInput("media")}>
                                <ListItemIcon>
                                  <ImageRoundedIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                  primary="Photos / Videos"
                                  secondary="Choose from this device"
                                  primaryTypographyProps={{ fontWeight: 800 }}
                                />
                              </MenuItem>

                              <MenuItem onClick={() => triggerAttachmentInput("file")}>
                                <ListItemIcon>
                                  <AttachFileRoundedIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                  primary="Files"
                                  secondary="Upload PDF, photo, or video"
                                  primaryTypographyProps={{ fontWeight: 800 }}
                                />
                              </MenuItem>
                            </Menu>
                          </Box>

                          <TextField
                            select
                            size="small"
                            label="Attachment Type"
                            value={attachmentPhase}
                            onChange={(e) =>
                              setAttachmentPhase(e.target.value as ServiceTicketAttachmentPhase)
                            }
                            disabled={attachmentUploading || isInvoicedTicket}
                            fullWidth
                          >
                            <MenuItem value="customer_sent">Customer Sent</MenuItem>
                            <MenuItem value="before_visit">Before Visit</MenuItem>
                            <MenuItem value="during_visit">During Visit</MenuItem>
                            <MenuItem value="after_visit">After Visit</MenuItem>
                          </TextField>

                          <TextField
                            size="small"
                            label="Attachment Note (optional)"
                            value={attachmentNote}
                            onChange={(e) => setAttachmentNote(e.target.value)}
                            disabled={attachmentUploading || isInvoicedTicket}
                            placeholder="Example: Customer texted this photo before scheduling."
                            fullWidth
                          />
                        </Stack>
                      ) : (
                        <Alert severity="info" variant="outlined">
                          Attachments can be added by dispatch, admins, managers, techs, and helpers.
                        </Alert>
                      )}

                      {attachmentErr ? <Alert severity="error">{attachmentErr}</Alert> : null}
                      {attachmentOk ? <Alert severity="success">{attachmentOk}</Alert> : null}

                      {attachments.length === 0 ? (
                        <Alert severity="info" variant="outlined">
                          No images, videos, or files have been added to this service ticket yet.
                        </Alert>
                      ) : (
                        <Stack spacing={1}>
                          {attachments.map((attachment) => {
                            const isImage = attachment.fileType === "image";
                            const isVideo = attachment.fileType === "video";
                            const isPdf = attachment.fileType === "pdf";
                            const sizeLabel = formatBytes(attachment.size);

                            return (
                              <Paper
                                key={attachment.id}
                                variant="outlined"
                                sx={{
                                  p: 1,
                                  borderRadius: 2.25,
                                  bgcolor: alpha(theme.palette.primary.main, 0.018),
                                }}
                              >
                                <Stack
                                  direction="row"
                                  spacing={1.25}
                                  alignItems="stretch"
                                  sx={{ minWidth: 0 }}
                                >
                                  <Box
                                    sx={{
                                      width: { xs: 96, sm: 106 },
                                      height: { xs: 128, sm: 142 },
                                      borderRadius: 1.75,
                                      overflow: "hidden",
                                      flexShrink: 0,
                                      display: "grid",
                                      placeItems: "center",
                                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                                      color: "primary.main",
                                      border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
                                    }}
                                  >
                                    {isImage && attachment.downloadUrl ? (
                                      <Box
                                        component="img"
                                        src={attachment.downloadUrl}
                                        alt={attachment.fileName}
                                        sx={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        }}
                                      />
                                    ) : isVideo && attachment.downloadUrl ? (
                                      <Box
                                        component="video"
                                        src={attachment.downloadUrl}
                                        muted
                                        playsInline
                                        preload="metadata"
                                        sx={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        }}
                                      />
                                    ) : isVideo ? (
                                      <MovieRoundedIcon sx={{ fontSize: 42 }} />
                                    ) : isImage ? (
                                      <ImageRoundedIcon sx={{ fontSize: 42 }} />
                                    ) : isPdf ? (
                                      <PictureAsPdfRoundedIcon sx={{ fontSize: 42 }} />
                                    ) : (
                                      <AttachFileRoundedIcon sx={{ fontSize: 42 }} />
                                    )}
                                  </Box>

                                  <Box
                                    sx={{
                                      minWidth: 0,
                                      flex: 1,
                                      display: "flex",
                                      flexDirection: "column",
                                      py: 0.25,
                                    }}
                                  >
                                    <Typography
                                      variant="subtitle2"
                                      fontWeight={900}
                                      sx={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        lineHeight: 1.2,
                                      }}
                                    >
                                      {attachment.fileName}
                                    </Typography>

                                    <Stack
                                      direction="row"
                                      spacing={0.75}
                                      flexWrap="wrap"
                                      useFlexGap
                                      sx={{ mt: 0.75 }}
                                    >
                                      <Chip
                                        size="small"
                                        label={formatAttachmentPhase(attachment.phase)}
                                        variant="outlined"
                                        sx={{ borderRadius: 1.5, fontWeight: 800 }}
                                      />
                                      {sizeLabel ? (
                                        <Chip
                                          size="small"
                                          label={sizeLabel}
                                          variant="outlined"
                                          sx={{ borderRadius: 1.5 }}
                                        />
                                      ) : null}
                                    </Stack>

                                    {attachment.note ? (
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{
                                          mt: 0.75,
                                          whiteSpace: "pre-wrap",
                                          overflow: "hidden",
                                          display: "-webkit-box",
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: "vertical",
                                        }}
                                      >
                                        {attachment.note}
                                      </Typography>
                                    ) : null}

                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{
                                        display: "block",
                                        mt: 0.75,
                                        lineHeight: 1.25,
                                      }}
                                    >
                                      Added {formatActivityDate(attachment.uploadedAt)}
                                      {attachment.uploadedByName
                                        ? ` by ${attachment.uploadedByName}`
                                        : ""}
                                    </Typography>

                                    <Box sx={{ flex: 1 }} />

                                    <Stack
                                      direction="row"
                                      spacing={1}
                                      alignItems="center"
                                      flexWrap="wrap"
                                      useFlexGap
                                      sx={{ mt: 1 }}
                                    >
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<OpenInNewRoundedIcon />}
                                        onClick={() => openServiceTicketAttachment(attachment)}
                                        sx={{ borderRadius: 999, fontWeight: 800 }}
                                      >
                                        Open
                                      </Button>

                                      {canDeleteTicketAttachments ? (
                                        <IconButton
                                          size="small"
                                          color="error"
                                          onClick={() =>
                                            handleSoftDeleteServiceTicketAttachment(attachment)
                                          }
                                        >
                                          <DeleteOutlineRoundedIcon />
                                        </IconButton>
                                      ) : null}
                                    </Stack>
                                  </Box>
                                </Stack>
                              </Paper>
                            );
                          })}
                        </Stack>
                      )}
                    </Stack>
                  </Section>
                </Box>
              </Stack>

              <Stack spacing={2.5} sx={{ minWidth: 0, maxWidth: "100%" }}>
                <Section
                  title="Trips"
                  icon={<ScheduleRoundedIcon color="primary" />}
                  action={
                    canDispatch ? (
                      <Button
                        component={Link}
                        href={`/service-tickets/${ticketId}/schedule`}
                        variant="contained"
                        disabled={isInvoicedTicket}
                      >
                        Schedule Trip
                      </Button>
                    ) : null
                  }
                >
                  <Stack spacing={1.5}>
                    {trips.length === 0 ? (
                      <Alert severity="info" variant="outlined">
                        No trips scheduled yet.
                      </Alert>
                    ) : null}

                    {trips.map((trip) => {
                      const canAct = canCurrentUserActOnTrip(trip);
                      const savingThis = Boolean(tripActionSaving[trip.id]);
                      const timerState = normalizeTripTimerState(trip);
                      const pausedTrip = isTripPaused(trip);
                      const runningTrip = isTripRunning(trip);
                      const pausedMinutes = sumPausedMinutes(trip.pauseBlocks, liveNowIso);
                      const grossMinutes =
                        trip.actualStartAt && !trip.actualEndAt
                          ? minutesBetweenIso(trip.actualStartAt, liveNowIso)
                          : trip.actualStartAt && trip.actualEndAt
                            ? minutesBetweenIso(
                                trip.actualStartAt,
                                trip.actualEndAt
                              )
                            : 0;
                      const billableMinutes = Math.max(0, grossMinutes - pausedMinutes);
                      const finishMode = finishModeByTrip[trip.id] || "none";
                      const showFinishPanel =
                        normalizeTripStatus(trip.status) === "in_progress" &&
                        finishMode !== "none";
                      const anotherTripInProgress = hasInProgressTrips(
                        trips.filter((t) => t.id !== trip.id)
                      );
                      const canQuickStart = canCurrentUserQuickStartTrip({
                        trip,
                        role: appUser?.role,
                        uid: myUid,
                        canStartTripRole,
                      });
                      const followUpNoteMissing =
                        finishMode === "follow_up" &&
                        !String(tripFollowUpNotes[trip.id] || "").trim();
                      const resolutionNoteMissing =
                        finishMode === "resolved" &&
                        !String(tripResolutionNotes[trip.id] || "").trim();
                      const completedResolutionPreview = getPreviewText(
                        trip.resolutionNotes,
                        280
                      );
                      const completedFollowUpPreview = getPreviewText(
                        trip.followUpNotes,
                        280
                      );
                      const completedMaterialsPreview = trip.noMaterialsUsed
                        ? "No materials used"
                        : getPreviewText(materialLinesToText(trip.materials), 280);
                      const helperPayrollSummary = getHelperPayrollSummary(trip);

                      return (
                        <Paper
                          key={trip.id}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderRadius: 1,
                            borderColor: runningTrip
                              ? alpha(theme.palette.primary.main, 0.26)
                              : pausedTrip
                                ? alpha(theme.palette.warning.main, 0.3)
                                : "divider",
                            backgroundColor: runningTrip
                              ? alpha(theme.palette.primary.main, 0.05)
                              : pausedTrip
                                ? alpha(theme.palette.warning.main, 0.08)
                                : "background.paper",
                          }}
                        >
                          <Stack spacing={1.5}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="flex-start"
                              flexWrap="wrap"
                            >
                              <Box>
                                <Typography variant="subtitle1" fontWeight={700}>
                                  {trip.date} • {formatTripWindow(String(trip.timeWindow || ""))} •{" "}
                                  {trip.startTime}-{trip.endTime}
                                </Typography>

                                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.75 }}>
                                  <Chip
                                    size="small"
                                    label={
                                      pausedTrip
                                        ? "Paused"
                                        : runningTrip
                                          ? "In Progress"
                                          : formatLifecycleTripStatus(trip.status)
                                    }
                                    color={
                                      pausedTrip
                                        ? "warning"
                                        : runningTrip
                                          ? "info"
                                          : getTripTone(trip.status)
                                    }
                                  />
                                  <Chip
                                    size="small"
                                    label={`Timer: ${timerState}`}
                                    variant="outlined"
                                  />
                                  {trip.dispatchOverride?.enabled ? (
                                    <Chip
                                      size="small"
                                      color="warning"
                                      variant="outlined"
                                      label="Dispatch Override"
                                    />
                                  ) : null}
                                </Stack>
                              </Box>

                              {canDispatch ? (
                                <Stack direction="row" spacing={1}>
                                  <IconButton
                                    onClick={() => openEditTrip(trip)}
                                    disabled={isInvoicedTicket || !canEditTripSchedule(trip.status, trip.timerState)}
                                  >
                                    <EditRoundedIcon />
                                  </IconButton>

                                  <IconButton
                                    color="error"
                                    onClick={() => handleSoftDeleteTrip(trip)}
                                    disabled={isInvoicedTicket || !canCancelTrip(trip.status, trip.timerState)}
                                  >
                                    <DeleteOutlineRoundedIcon />
                                  </IconButton>
                                </Stack>
                              ) : null}
                            </Stack>

                            <Stack spacing={1}>
                              {canStartTrip(trip.status, trip.timerState) ? (
                                <Button
                                  variant="contained"
                                  color="primary"
                                  size="large"
                                  startIcon={<PlayArrowRoundedIcon />}
                                  onClick={() => handleStartTrip(trip)}
                                  disabled={!canQuickStart || savingThis || anotherTripInProgress || isInvoicedTicket}
                                  fullWidth
                                  sx={{
                                    minHeight: 48,
                                    borderRadius: 999,
                                    fontWeight: 700,
                                  }}
                                >
                                  Start Trip
                                </Button>
                              ) : null}

                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                useFlexGap
                                flexWrap="wrap"
                              >
                                {canPauseTrip(trip.status, trip.timerState) ? (
                                  <Button
                                    variant="outlined"
                                    color="warning"
                                    startIcon={<PauseRoundedIcon />}
                                    onClick={() => handlePauseTrip(trip)}
                                    disabled={!canAct || savingThis || isInvoicedTicket}
                                    sx={{ minHeight: 44 }}
                                  >
                                    Pause
                                  </Button>
                                ) : null}

                                {canResumeTrip(trip.status, trip.timerState) ? (
                                  <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<PlayArrowRoundedIcon />}
                                    onClick={() => handleResumeTrip(trip)}
                                    disabled={!canAct || savingThis || isInvoicedTicket}
                                    sx={{ minHeight: 44 }}
                                  >
                                    Resume
                                  </Button>
                                ) : null}

                                {!isMobile &&
                                normalizeTripStatus(trip.status) === "in_progress" ? (
                                  <>
                                    <Button
                                      variant="outlined"
                                      onClick={() =>
                                        setFinishModeByTrip((prev) => ({
                                          ...prev,
                                          [trip.id]: "follow_up",
                                        }))
                                      }
                                      disabled={
                                        !canAct ||
                                        savingThis ||
                                        !canFinishTrip(trip.status, trip.timerState) ||
                                        isInvoicedTicket
                                      }
                                    >
                                      Follow-Up
                                    </Button>

                                    <Button
                                      variant="outlined"
                                      onClick={() =>
                                        setFinishModeByTrip((prev) => ({
                                          ...prev,
                                          [trip.id]: "resolved",
                                        }))
                                      }
                                      disabled={
                                        !canAct ||
                                        savingThis ||
                                        !canFinishTrip(trip.status, trip.timerState) ||
                                        isInvoicedTicket
                                      }
                                    >
                                      Resolved
                                    </Button>

                                    {finishMode !== "none" ? (
                                      <Button
                                        variant="outlined"
                                        onClick={() =>
                                          setFinishModeByTrip((prev) => ({
                                            ...prev,
                                            [trip.id]: "none",
                                          }))
                                        }
                                      >
                                        Clear
                                      </Button>
                                    ) : null}
                                  </>
                                ) : null}
                              </Stack>

                              {isMobile &&
                              normalizeTripStatus(trip.status) === "in_progress" ? (
                                <Alert severity="info" variant="outlined">
                                  Finish actions still live in the trip finish sheet. Start,
                                  pause, and resume are available directly on this card.
                                </Alert>
                              ) : null}
                            </Stack>

                            <Typography variant="body2" color="text.secondary">
                              Tech: <strong>{trip.crew?.primaryTechName || "Unassigned"}</strong>
                              {trip.crew?.helperName
                                ? ` • Helper: ${trip.crew.helperName}`
                                : ""}
                              {trip.crew?.secondaryTechName
                                ? ` • 2nd Tech: ${trip.crew.secondaryTechName}`
                                : ""}
                              {trip.crew?.secondaryHelperName
                                ? ` • 2nd Helper: ${trip.crew.secondaryHelperName}`
                                : ""}
                            </Typography>

                            <Typography variant="body2" color="text.secondary">
                              Timer minutes: <strong>{billableMinutes}</strong> (gross{" "}
                              {grossMinutes} - paused {pausedMinutes})
                            </Typography>

                            {trip.dispatchOverride?.enabled ? (
                              <Alert severity="warning" variant="outlined">
                                Dispatch Override: {trip.dispatchOverride.reason || "No reason entered."}
                              </Alert>
                            ) : null}

                            {normalizeTripStatus(trip.status) === "complete" ? (
                              <>
                                <Typography variant="body2" color="text.secondary">
                                  Billable Hours:{" "}
                                  <strong>
                                    {getStoredOrComputedBillableHours(trip).toFixed(2)}
                                  </strong>
                                </Typography>

                                <Paper
                                  variant="outlined"
                                  sx={{
                                    p: 1.25,
                                    borderRadius: 1,
                                    backgroundColor: alpha(theme.palette.success.main, 0.04),
                                  }}
                                >
                                  <Stack spacing={0.9}>
                                    <Typography variant="subtitle2" fontWeight={800}>
                                      Completed Summary
                                    </Typography>

                                    <Typography variant="body2" color="text.secondary">
                                      <strong>Outcome:</strong>{" "}
                                      {String(trip.outcome || "").trim().toLowerCase() === "resolved"
                                        ? "Resolved"
                                        : String(trip.outcome || "").trim().toLowerCase() === "follow_up"
                                          ? "Follow-Up"
                                          : "Completed"}
                                    </Typography>

                                    <Typography variant="body2" color="text.secondary">
                                      <strong>Helper in payroll:</strong> {helperPayrollSummary}
                                    </Typography>

                                    {completedResolutionPreview ? (
                                      <Box>
                                        <Typography variant="caption" color="text.secondary">
                                          Resolution Notes Preview
                                        </Typography>
                                        <Typography
                                          variant="body2"
                                          sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                          {completedResolutionPreview}
                                        </Typography>
                                      </Box>
                                    ) : null}

                                    {!completedResolutionPreview && completedFollowUpPreview ? (
                                      <Box>
                                        <Typography variant="caption" color="text.secondary">
                                          Follow-Up Notes Preview
                                        </Typography>
                                        <Typography
                                          variant="body2"
                                          sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                          {completedFollowUpPreview}
                                        </Typography>
                                      </Box>
                                    ) : null}

                                    {completedMaterialsPreview ? (
                                      <Box>
                                        <Typography variant="caption" color="text.secondary">
                                          Materials Preview
                                        </Typography>
                                        <Typography
                                          variant="body2"
                                          sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                          {completedMaterialsPreview}
                                        </Typography>
                                      </Box>
                                    ) : null}
                                  </Stack>
                                </Paper>
                              </>
                            ) : null}

                            <TextField
                              id={`trip-work-notes-${trip.id}`}
                              label="Work Notes"
                              multiline
                              minRows={3}
                              value={tripWorkNotes[trip.id] ?? ""}
                              onChange={(e) =>
                                setTripWorkNotes((prev) => ({
                                  ...prev,
                                  [trip.id]: e.target.value,
                                }))
                              }
                              disabled={
                                !canAct ||
                                normalizeTripStatus(trip.status) === "cancelled" ||
                                isInvoicedTicket
                              }
                            />

                            <Button
                              variant="outlined"
                              startIcon={<NoteAltOutlinedIcon />}
                              onClick={() => handleSaveWorkNotes(trip)}
                              disabled={
                                !canAct ||
                                normalizeTripStatus(trip.status) === "cancelled" ||
                                savingThis ||
                                isInvoicedTicket
                              }
                            >
                              Save Notes
                            </Button>

                            {showFinishPanel && !isMobile ? (
                              <Paper
                                variant="outlined"
                                sx={{
                                  p: 1.25,
                                  borderRadius: 1,
                                  backgroundColor:
                                    finishMode === "resolved"
                                      ? alpha(theme.palette.success.main, 0.06)
                                      : alpha(theme.palette.warning.main, 0.08),
                                }}
                              >
                                <Stack spacing={1.25}>
                                  <TextField
                                    label="Hours (override)"
                                    type="number"
                                    size="small"
                                    inputProps={{ min: 0, step: 0.5 }}
                                    value={
                                      typeof hoursOverrideByTrip[trip.id] === "number"
                                        ? hoursOverrideByTrip[trip.id]
                                        : getDefaultBillableHours(billableMinutes)
                                    }
                                    onChange={(e) =>
                                      setHoursOverrideByTrip((prev) => ({
                                        ...prev,
                                        [trip.id]: Number(e.target.value),
                                      }))
                                    }
                                  />

                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        checked={helperConfirmedByTrip[trip.id] ?? true}
                                        onChange={(e) =>
                                          setHelperConfirmedByTrip((prev) => ({
                                            ...prev,
                                            [trip.id]: e.target.checked,
                                          }))
                                        }
                                      />
                                    }
                                    label="Include helper in payroll"
                                  />

                                  {finishMode === "follow_up" ? (
                                    <>
                                      <TextField
                                        label="Follow-Up Notes"
                                        multiline
                                        minRows={4}
                                        autoFocus
                                        value={tripFollowUpNotes[trip.id] ?? ""}
                                        onChange={(e) =>
                                          setTripFollowUpNotes((prev) => ({
                                            ...prev,
                                            [trip.id]: e.target.value,
                                          }))
                                        }
                                        error={followUpNoteMissing}
                                        helperText={
                                          followUpNoteMissing
                                            ? "Follow-up notes are required to complete as Follow-Up."
                                            : undefined
                                        }
                                      />

                                      {renderTripMaterialsEditor(trip.id)}

                                      <Button
                                        variant="contained"
                                        onClick={() => finishTrip(trip, "follow_up")}
                                        disabled={
                                          !canAct ||
                                          savingThis ||
                                          isInvoicedTicket ||
                                          followUpNoteMissing
                                        }
                                      >
                                        Complete as Follow-Up
                                      </Button>
                                    </>
                                  ) : null}

                                  {finishMode === "resolved" ? (
                                    <>
                                      <TextField
                                        label="Resolution Notes"
                                        multiline
                                        minRows={4}
                                        autoFocus
                                        value={tripResolutionNotes[trip.id] ?? ""}
                                        onChange={(e) =>
                                          setTripResolutionNotes((prev) => ({
                                            ...prev,
                                            [trip.id]: e.target.value,
                                          }))
                                        }
                                        error={resolutionNoteMissing}
                                        helperText={
                                          resolutionNoteMissing
                                            ? "Resolution notes are required to complete as Resolved."
                                            : undefined
                                        }
                                      />

                                      {renderTripMaterialsEditor(trip.id)}

                                      <Button
                                        variant="contained"
                                        color="success"
                                        onClick={() => finishTrip(trip, "resolved")}
                                        disabled={
                                          !canAct ||
                                          savingThis ||
                                          isInvoicedTicket ||
                                          resolutionNoteMissing
                                        }
                                      >
                                        Complete as Resolved — Ready to Bill
                                      </Button>
                                    </>
                                  ) : null}
                                </Stack>
                              </Paper>
                            ) : null}

                            {tripActionError[trip.id] ? (
                              <Alert severity="error">{tripActionError[trip.id]}</Alert>
                            ) : null}
                            {tripActionSuccess[trip.id] ? (
                              <Alert severity="success">{tripActionSuccess[trip.id]}</Alert>
                            ) : null}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Section>

                <Section title="Purchase Orders" icon={<ReceiptLongRoundedIcon color="primary" />}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.25}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      justifyContent="space-between"
                    >
                      <Alert severity="info" variant="outlined" sx={{ flex: 1 }}>
                        PO codes are stored here as the permanent ticket record. Future email invoice matching will attach supplier PDFs and parsed material line items to these PO records.
                      </Alert>

                      <Button
                        type="button"
                        variant="contained"
                        startIcon={<ReceiptLongRoundedIcon />}
                        onClick={handleGeneratePoFromTicket}
                        disabled={!canGeneratePoFromTicket || poGenerating}
                        sx={{ borderRadius: 2, minHeight: 44, fontWeight: 800, whiteSpace: "nowrap" }}
                      >
                        {poGenerating ? "Generating..." : "Generate PO#"}
                      </Button>
                    </Stack>

                    {!eligibleTripForPo && !isInvoicedTicket ? (
                      <Alert severity="warning" variant="outlined">
                        Add or open a scheduled/in-progress trip before generating a PO for this ticket.
                      </Alert>
                    ) : null}

                    {poError ? <Alert severity="error">{poError}</Alert> : null}
                    {poOk ? <Alert severity="success">{poOk}</Alert> : null}

                    {purchaseOrders.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No PO codes have been generated for this service ticket yet.
                      </Typography>
                    ) : (
                      <Stack spacing={1.25}>
{purchaseOrders.map((po) => {
  const invoiceAttachments = Array.isArray(po.matchedAttachments)
    ? po.matchedAttachments.filter((attachment) =>
        String(attachment.downloadUrl || "").trim()
      )
    : [];

  const attachmentCount = invoiceAttachments.length;

  const hasInvoice = Boolean(
    po.matchedInvoiceId ||
      po.invoiceEmailMessageId ||
      attachmentCount > 0
  );

  return (
                            <Paper
                              key={po.id}
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                borderRadius: 2,
                                bgcolor: alpha(theme.palette.primary.main, 0.025),
                              }}
                            >
                              <Stack spacing={1.25}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                  justifyContent="space-between"
                                >
                                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography
                                      sx={{
                                        fontFamily:
                                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                        fontWeight: 900,
                                        letterSpacing: "0.08em",
                                        fontSize: "1.05rem",
                                      }}
                                    >
                                      {po.poCode}
                                    </Typography>

                                    <Chip
                                      size="small"
                                      label={formatPurchaseOrderStatus(po.status)}
                                      color={getPurchaseOrderTone(po.status)}
                                      variant="outlined"
                                      sx={{ borderRadius: 1.5, fontWeight: 700 }}
                                    />

                                    {hasInvoice ? (
                                      <Chip
                                        size="small"
                                        label={attachmentCount > 0 ? `Invoice matched • ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}` : "Invoice matched"}
                                        color="success"
                                        variant="filled"
                                        sx={{ borderRadius: 1.5, fontWeight: 700 }}
                                      />
                                    ) : null}
                                  </Stack>

                                  <Button
                                    type="button"
                                    size="small"
                                    variant="text"
                                    startIcon={<ContentCopyRoundedIcon />}
                                    onClick={() => copyPurchaseOrderCode(po.poCode)}
                                    sx={{ borderRadius: 999, fontWeight: 700 }}
                                  >
                                    Copy
                                  </Button>
                                </Stack>

                                <Stack spacing={0.35}>
                                  <Typography variant="body2" color="text.secondary">
                                    Generated {formatPurchaseOrderDate(po.createdAt)}
                                    {po.requestedByName ? ` by ${po.requestedByName}` : ""}
                                  </Typography>

                                  {po.vendorName ? (
                                    <Typography variant="body2" color="text.secondary">
                                      Vendor: <strong>{po.vendorName}</strong>
                                    </Typography>
                                  ) : null}

                                  {po.tripId ? (
                                    <Typography variant="caption" color="text.secondary">
                                      Trip: {po.tripId}
                                    </Typography>
                                  ) : null}
                                                                    {po.invoiceEmailSubject ? (
                                    <Typography variant="caption" color="text.secondary">
                                      Email: {po.invoiceEmailSubject}
                                    </Typography>
                                  ) : null}

                                  {po.invoiceEmailMatchedAt ? (
                                    <Typography variant="caption" color="text.secondary">
                                      Matched: {formatPurchaseOrderDate(po.invoiceEmailMatchedAt)}
                                    </Typography>
                                  ) : null}
                                </Stack>

                                <Divider />

                                <Stack spacing={1}>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    flexWrap="wrap"
                                    useFlexGap
                                  >
                                    <PictureAsPdfRoundedIcon
                                      sx={{
                                        fontSize: 18,
                                        color:
                                          attachmentCount > 0
                                            ? "success.main"
                                            : "text.secondary",
                                      }}
                                    />

                                    <Typography variant="subtitle2" fontWeight={800}>
                                      Invoice PDF
                                    </Typography>

                                    <Chip
                                      size="small"
                                      color={attachmentCount > 0 ? "success" : "default"}
                                      variant={attachmentCount > 0 ? "filled" : "outlined"}
                                      label={
                                        attachmentCount > 0
                                          ? `${attachmentCount} PDF${attachmentCount === 1 ? "" : "s"} saved`
                                          : "No PDF saved yet"
                                      }
                                      sx={{ borderRadius: 1.5, fontWeight: 700 }}
                                    />
                                  </Stack>

                                  {attachmentCount > 0 ? (
                                    <Stack spacing={1}>
                                      {invoiceAttachments.map((attachment, index) => (
                                        <Paper
                                          key={attachment.id || `${po.poCode}-attachment-${index}`}
                                          variant="outlined"
                                          sx={{
                                            p: 1.25,
                                            borderRadius: 1.5,
                                            bgcolor: alpha(theme.palette.success.main, 0.045),
                                          }}
                                        >
                                          <Stack
                                            direction={{ xs: "column", sm: "row" }}
                                            spacing={1}
                                            alignItems={{ xs: "stretch", sm: "center" }}
                                            justifyContent="space-between"
                                          >
                                            <Box sx={{ minWidth: 0 }}>
                                              <Typography
                                                variant="body2"
                                                fontWeight={800}
                                                sx={{
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                  whiteSpace: "nowrap",
                                                }}
                                              >
                                                {attachment.filename || "Invoice PDF"}
                                              </Typography>

                                              <Typography variant="caption" color="text.secondary">
                                                {attachment.uploadedAt
                                                  ? `Uploaded ${formatPurchaseOrderDate(
                                                      attachment.uploadedAt
                                                    )}`
                                                  : "Saved invoice attachment"}
                                              </Typography>
                                            </Box>

                                            <Stack direction="row" spacing={1}>
                                              <Button
                                                type="button"
                                                size="small"
                                                variant="contained"
                                                startIcon={<OpenInNewRoundedIcon />}
                                                onClick={() => openPurchaseOrderAttachment(attachment)}
                                                sx={{ borderRadius: 999, fontWeight: 800 }}
                                              >
                                                Open PDF
                                              </Button>

                                              <Button
                                                component="a"
                                                href={attachment.downloadUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                size="small"
                                                variant="outlined"
                                                startIcon={<CloudDownloadRoundedIcon />}
                                                sx={{ borderRadius: 999, fontWeight: 800 }}
                                              >
                                                Download
                                              </Button>
                                            </Stack>
                                          </Stack>
                                        </Paper>
                                      ))}
                                    </Stack>
                                  ) : (
                                    <Alert severity="info" variant="outlined">
                                      No supplier invoice PDF has been attached to this PO yet.
                                    </Alert>
                                  )}
                                </Stack>
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Section>

                <Section title="Billing Packet" icon={<ReceiptLongRoundedIcon color="primary" />}>
                  {canCloseFollowUpWithoutReturnVisit ? (
                    <Alert
                      severity="warning"
                      variant="outlined"
                      sx={{ mb: 2 }}
                      action={
                        <Button
                          color="inherit"
                          size="small"
                          variant="outlined"
                          onClick={openCloseFollowUpDialog}
                          disabled={billingSaving || closeFollowUpSaving}
                          sx={{ fontWeight: 800, whiteSpace: "nowrap" }}
                        >
                          Close Follow-Up
                        </Button>
                      }
                    >
                      <strong>Customer no longer needs a return visit?</strong> Close the
                      follow-up and send the existing completed work to Ready to Bill without
                      changing the original trip outcome.
                    </Alert>
                  ) : null}

                  {ticket.followUpClosure?.status === "closed_without_return_visit" ? (
                    <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                      <strong>Follow-up closed without a return visit.</strong>{" "}
                      {ticket.followUpClosure.reasonLabel}. Note: {ticket.followUpClosure.note}
                    </Alert>
                  ) : null}

                  {!ticket.billing ? (
                    <Stack spacing={1.5}>
                      <Alert severity="info" variant="outlined">
                        No billing packet yet. It appears after a trip is completed as{" "}
                        <strong>Resolved — Ready to Bill</strong>.
                      </Alert>

                      {canBill ? (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Button
                            variant="contained"
                            onClick={handleResyncBillingPacket}
                            disabled={billingSaving || isInvoicedTicket}
                          >
                            {billingSaving ? "Resyncing..." : "Resync Billing Packet"}
                          </Button>
                        </Stack>
                      ) : null}

                      {billingErr ? <Alert severity="error">{billingErr}</Alert> : null}
                      {billingOk ? <Alert severity="success">{billingOk}</Alert> : null}
                    </Stack>
                  ) : (
                    <Stack spacing={2}>
                      {ticket.billing.status === "creating_invoice" ? (
                        <Alert severity="info" variant="outlined">
                          Creating invoice in QuickBooks…
                        </Alert>
                      ) : null}

                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        spacing={1}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="body1">
                            Status:
                          </Typography>
                          <Chip
                            size="small"
                            color={getBillingTone(ticket.billing.status)}
                            label={formatBillingPacketStatus(ticket.billing.status)}
                          />
                          {ticket.billing.invoiceSource ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Source: ${ticket.billing.invoiceSource}`}
                            />
                          ) : null}
                        </Stack>

                        {ticket.billing.readyToBillAt ? (
                          <Typography variant="body2" color="text.secondary">
                            Ready: {ticket.billing.readyToBillAt}
                          </Typography>
                        ) : null}
                      </Stack>

                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            Labor Summary
                          </Typography>

                          <Typography variant="body1">
                            Total billed hours:{" "}
                            <strong>
                              {Number(ticket.billing.labor.totalHours || 0).toFixed(2)}
                            </strong>
                          </Typography>

                          {ticket.billing.readyToBillTripId ? (
                            <Typography variant="body2" color="text.secondary">
                              Ready-to-bill trip: {ticket.billing.readyToBillTripId}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                        <Stack spacing={1.5}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            Materials Billing
                          </Typography>

                          <TextField
                            label="Materials Summary"
                            multiline
                            minRows={4}
                            value={billingMaterialsSummaryEdit}
                            onChange={(e) => setBillingMaterialsSummaryEdit(e.target.value)}
                            disabled={!canBill || billingSaving || isInvoicedTicket}
                            placeholder={`Example: Angle stop, wax ring, PVC fittings for drain reset`}
                            helperText="This will become the summarized materials line description for invoicing."
                          />

                          <TextField
                            label="Materials Amount"
                            type="number"
                            inputProps={{ min: 0, step: 0.01 }}
                            value={billingMaterialsAmountEdit}
                            onChange={(e) => setBillingMaterialsAmountEdit(e.target.value)}
                            disabled={!canBill || billingSaving || isInvoicedTicket}
                            placeholder="0.00"
                            helperText="Enter the total billed materials amount."
                          />

                          {canBill ? (
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                              <Button
                                variant="contained"
                                onClick={handleSaveBillingPacketDetails}
                                disabled={billingSaving || isInvoicedTicket}
                              >
                                {billingSaving ? "Saving..." : "Save Billing Details"}
                              </Button>
                            </Stack>
                          ) : null}
                        </Stack>
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            Invoice Details
                          </Typography>

                          <Typography variant="body2" color="text.secondary">
                            Resolution notes and work notes remain stored for office reference, but
                            the future QBO invoice flow will use the service date range plus the
                            summarized labor/materials billing model.
                          </Typography>

                          {ticket.billing.qboDocNumber ? (
                            <Typography variant="body1">
                              Invoice Number: <strong>{ticket.billing.qboDocNumber}</strong>
                            </Typography>
                          ) : null}

                          {ticket.billing.qboSyncedAt ? (
                            <Typography variant="body2" color="text.secondary">
                              Synced: {ticket.billing.qboSyncedAt}
                            </Typography>
                          ) : null}

                          {ticket.billing.qboInvoiceUrl ? (
                            <Button
                              component="a"
                              href={ticket.billing.qboInvoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              variant="outlined"
                            >
                              Open in QBO
                            </Button>
                          ) : null}

                          {ticket.billing.invoiceError ? (
                            <Alert severity="error">{ticket.billing.invoiceError}</Alert>
                          ) : null}
                        </Stack>
                      </Paper>

                      {canBill ? (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          {(ticket.billing.status === "ready_to_bill" ||
                            ticket.billing.status === "invoice_failed") && !isInvoicedTicket ? (
                            <Button
                              variant="contained"
                              onClick={handleCreateQboInvoice}
                              disabled={billingSaving}
                            >
                              {billingSaving
                                ? "Creating QBO Invoice..."
                                : ticket.billing.status === "invoice_failed"
                                  ? "Retry QBO Invoice"
                                  : "Create QBO Invoice"}
                            </Button>
                          ) : null}

                          <Button
                            variant="outlined"
                            onClick={() => markBillingStatus("invoiced")}
                            disabled={billingSaving || isInvoicedTicket}
                          >
                            {billingSaving ? "Working..." : "Mark Invoiced Manually"}
                          </Button>

                          <Button
                            variant="outlined"
                            onClick={() => markBillingStatus("ready_to_bill")}
                            disabled={billingSaving || isInvoicedTicket}
                          >
                            Set Ready to Bill
                          </Button>

                          <Button
                            variant="outlined"
                            onClick={() => markBillingStatus("not_ready")}
                            disabled={billingSaving || isInvoicedTicket}
                          >
                            Set Not Ready
                          </Button>
                        </Stack>
                      ) : null}

                      {billingErr ? <Alert severity="error">{billingErr}</Alert> : null}
                      {billingOk ? <Alert severity="success">{billingOk}</Alert> : null}
                    </Stack>
                  )}
                </Section>

<Section title="System Activity" icon={<BuildRoundedIcon color="primary" />}>
  <Stack spacing={1.5}>
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
      <Stack spacing={0.5}>
        <Typography variant="body2">
          <strong>Active:</strong> {String(ticket.active)}
        </Typography>
        <Typography variant="body2">
          <strong>Created At:</strong> {ticket.createdAt || "—"}
        </Typography>
        <Typography variant="body2">
          <strong>Updated At:</strong> {ticket.updatedAt || "—"}
        </Typography>
      </Stack>
    </Paper>

    <Divider />

    <Typography variant="subtitle1" fontWeight={800}>
      Activity Log
    </Typography>

    {activityEntries.length === 0 ? (
      <Alert severity="info" variant="outlined">
        No system activity has been logged for this service ticket yet.
      </Alert>
    ) : (
      <Stack spacing={1}>
        {activityEntries.map((entry) => (
          <Paper
            key={entry.id}
            variant="outlined"
            sx={{
              p: 1.25,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.025),
            }}
          >
            <Stack spacing={0.75}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
              >
                <Typography variant="subtitle2" fontWeight={800}>
                  {entry.title || "Activity"}
                </Typography>

                <Chip
                  size="small"
                  variant="outlined"
                  label={formatActivityDate(entry.createdAt)}
                  sx={{ borderRadius: 1, fontWeight: 700 }}
                />
              </Stack>

              {entry.description ? (
                <Typography variant="body2" color="text.secondary">
                  {entry.description}
                </Typography>
              ) : null}

              {entry.details?.length ? (
                <Stack spacing={0.35}>
                  {entry.details.slice(0, 8).map((detail, index) => (
                    <Typography
                      key={`${entry.id}-detail-${index}`}
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      • {detail}
                    </Typography>
                  ))}
                </Stack>
              ) : null}

              <Typography variant="caption" color="text.secondary">
                Logged by {entry.createdByName || "System"}
                {entry.createdByRole ? ` • ${entry.createdByRole}` : ""}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Stack>
    )}
  </Stack>
</Section>
              </Stack>
            </Box>

            <Dialog
              open={showCloseFollowUpDialog}
              onClose={closeCloseFollowUpDialog}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle>Close Follow-Up — Ready to Bill</DialogTitle>

              <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                  <Alert severity="info" variant="outlined">
                    The completed trip will remain recorded as <strong>Follow-Up</strong>. This
                    closes the outstanding return visit and creates a billing packet for the
                    completed labor and materials already recorded.
                  </Alert>

                  <TextField
                    select
                    label="Reason"
                    value={closeFollowUpReason}
                    onChange={(e) => setCloseFollowUpReason(e.target.value)}
                    disabled={closeFollowUpSaving}
                    required
                    fullWidth
                  >
                    {FOLLOW_UP_CLOSURE_REASONS.map((reason) => (
                      <MenuItem key={reason.code} value={reason.code}>
                        {reason.label}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Office Note"
                    value={closeFollowUpNote}
                    onChange={(e) => setCloseFollowUpNote(e.target.value)}
                    disabled={closeFollowUpSaving}
                    required
                    multiline
                    minRows={4}
                    fullWidth
                    placeholder="Customer called back and stated they no longer need us to return. Bill completed initial trip only."
                    helperText="Required. This note is preserved in the billing record and activity log."
                  />

                  {closeFollowUpErr ? (
                    <Alert severity="error">{closeFollowUpErr}</Alert>
                  ) : null}
                </Stack>
              </DialogContent>

              <DialogActions>
                <Button onClick={closeCloseFollowUpDialog} disabled={closeFollowUpSaving}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleCloseFollowUpWithoutReturnVisit}
                  disabled={closeFollowUpSaving || !closeFollowUpNote.trim()}
                >
                  {closeFollowUpSaving ? "Sending to Billing..." : "Send to Ready to Bill"}
                </Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={showEditLocationDialog}
              onClose={() => {
                if (!locationSaving) {
                  setShowEditLocationDialog(false);
                  setLocationErr("");
                  setQuickAddMode(false);
                  resetQuickAddServiceLocationForm();
                }
              }}
              fullWidth
              maxWidth="md"
            >
              <DialogTitle>Edit Service Location</DialogTitle>

              <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                  <Alert severity="info" variant="outlined">
                    Customer stays locked on this ticket. Choose one of this customer&apos;s service
                    locations, or quick add a new one using Google address search.
                  </Alert>

                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack spacing={0.75}>
                      <Typography variant="body2" color="text.secondary">
                        Customer
                      </Typography>
                      <Typography variant="subtitle1" fontWeight={800}>
                        {ticket.customerDisplayName || "Customer"}
                      </Typography>
                    </Stack>
                  </Paper>

                  {!quickAddMode ? (
                    <Stack spacing={2}>
                      <TextField
                        select
                        label="Service Location"
                        value={selectedServiceAddressId}
                        onChange={(e) => setSelectedServiceAddressId(e.target.value)}
                        disabled={locationSaving}
                        helperText={
                          customerServiceAddresses.length > 0
                            ? "Select an existing service location saved on the customer record."
                            : "No active service locations found. Quick add one below."
                        }
                      >
                        <MenuItem value="">Select service location…</MenuItem>
                        {customerServiceAddresses.map((addr) => (
                          <MenuItem key={addr.id} value={addr.id}>
                            {(addr.label || "Service Address") +
                              (addr.isPrimary ? " (Primary)" : "")}{" "}
                            — {addr.addressLine1}, {addr.city}
                          </MenuItem>
                        ))}
                      </TextField>

                      {selectedServiceAddressId ? (
                        (() => {
                          const selected = customerServiceAddresses.find(
                            (addr) => addr.id === selectedServiceAddressId
                          );

                          if (!selected) return null;

                          return (
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                borderRadius: 2,
                                backgroundColor: alpha(theme.palette.primary.main, 0.035),
                              }}
                            >
                              <Typography variant="body2" color="text.secondary">
                                Selected location
                              </Typography>
                              <Typography variant="body1" fontWeight={800} sx={{ mt: 0.5 }}>
                                {selected.label || "Service Address"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {buildInlineAddress(
                                  selected.addressLine1,
                                  selected.addressLine2,
                                  selected.city,
                                  selected.state,
                                  selected.postalCode
                                )}
                              </Typography>
                            </Paper>
                          );
                        })()
                      ) : null}

                      <Button
                        variant="outlined"
                        startIcon={<AddHomeRoundedIcon />}
                        onClick={() => {
                          setLocationErr("");
                          resetQuickAddServiceLocationForm();
                          setQuickAddMode(true);
                        }}
                        disabled={locationSaving}
                        sx={{ alignSelf: "flex-start", borderRadius: 999, fontWeight: 700 }}
                      >
                        Quick Add Service Location
                      </Button>
                    </Stack>
                  ) : (
                    <Stack spacing={2}>
                      <Typography variant="subtitle1" fontWeight={800}>
                        Quick Add Service Location
                      </Typography>

                      <TextField
                        label="Label"
                        value={quickServiceLabel}
                        onChange={(e) => setQuickServiceLabel(e.target.value)}
                        fullWidth
                        placeholder="Home, Rental House, Shop, Weekend House..."
                        disabled={locationSaving}
                      />

                      <AddressAutocompleteField
                        label="Search address"
                        value={quickServiceAddressSearch}
                        onChange={(value) => {
                          setQuickServiceAddressSearch(value);
                          markQuickServiceAddressManual();
                        }}
                        onSelectAddress={handleQuickServiceGoogleAddressSelected}
                        helperText="Start typing to search for a real address, or keep entering it manually below."
                        placeholder="Start typing a service address..."
                        disabled={locationSaving}
                      />

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          size="small"
                          label={
                            quickServiceAddressSource === "google_places"
                              ? "Google suggested"
                              : "Manual entry"
                          }
                          color={
                            quickServiceAddressSource === "google_places" ? "primary" : "default"
                          }
                          variant={
                            quickServiceAddressSource === "google_places" ? "filled" : "outlined"
                          }
                          sx={{ borderRadius: 99, fontWeight: 700 }}
                        />
                      </Stack>

                      <TextField
                        label="Address line 1"
                        value={quickServiceAddressLine1}
                        onChange={(e) => {
                          setQuickServiceAddressLine1(e.target.value);
                          markQuickServiceAddressManual();
                        }}
                        required
                        fullWidth
                        disabled={locationSaving}
                      />

                      <TextField
                        label="Address line 2"
                        value={quickServiceAddressLine2}
                        onChange={(e) => {
                          setQuickServiceAddressLine2(e.target.value);
                          markQuickServiceAddressManual();
                        }}
                        fullWidth
                        disabled={locationSaving}
                      />

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                          gap: 2,
                        }}
                      >
                        <TextField
                          label="City"
                          value={quickServiceCity}
                          onChange={(e) => {
                            setQuickServiceCity(e.target.value);
                            markQuickServiceAddressManual();
                          }}
                          required
                          fullWidth
                          disabled={locationSaving}
                        />

                        <TextField
                          label="State"
                          value={quickServiceState}
                          onChange={(e) => {
                            setQuickServiceState(e.target.value);
                            markQuickServiceAddressManual();
                          }}
                          required
                          fullWidth
                          disabled={locationSaving}
                        />

                        <TextField
                          label="Postal code"
                          value={quickServicePostalCode}
                          onChange={(e) => {
                            setQuickServicePostalCode(e.target.value);
                            markQuickServiceAddressManual();
                          }}
                          required
                          fullWidth
                          disabled={locationSaving}
                        />
                      </Box>

                      <TextField
                        label="Notes"
                        value={quickServiceNotes}
                        onChange={(e) => setQuickServiceNotes(e.target.value)}
                        multiline
                        minRows={3}
                        fullWidth
                        disabled={locationSaving}
                      />

                      <Button
                        variant="outlined"
                        onClick={() => {
                          setQuickAddMode(false);
                          resetQuickAddServiceLocationForm();
                          setLocationErr("");
                        }}
                        disabled={locationSaving}
                        sx={{ alignSelf: "flex-start", borderRadius: 999, fontWeight: 700 }}
                      >
                        Back to Existing Locations
                      </Button>
                    </Stack>
                  )}

                  {locationErr ? <Alert severity="error">{locationErr}</Alert> : null}
                </Stack>
              </DialogContent>

              <DialogActions>
                <Button
                  onClick={() => {
                    setShowEditLocationDialog(false);
                    setLocationErr("");
                    setQuickAddMode(false);
                    resetQuickAddServiceLocationForm();
                  }}
                  disabled={locationSaving}
                >
                  Cancel
                </Button>

                {quickAddMode ? (
                  <Button
                    variant="contained"
                    startIcon={<AddHomeRoundedIcon />}
                    onClick={handleQuickAddAndUseServiceLocation}
                    disabled={locationSaving || isInvoicedTicket}
                  >
                    {locationSaving ? "Saving..." : "Add & Use Location"}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    onClick={handleSaveSelectedServiceLocation}
                    disabled={locationSaving || isInvoicedTicket || !selectedServiceAddressId}
                  >
                    {locationSaving ? "Saving..." : "Save Location"}
                  </Button>
                )}
              </DialogActions>
            </Dialog>

            <Dialog
              open={Boolean(editTripId)}
              onClose={() => setEditTripId(null)}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle>Edit / Reschedule Trip</DialogTitle>

              <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                  <TextField
                    type="date"
                    label="Date"
                    value={editTripDate}
                    onChange={(e) => setEditTripDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    select
                    label="Time Window"
                    value={editTripTimeWindow}
                    onChange={(e) =>
                      setEditTripTimeWindow(e.target.value as TripTimeWindow)
                    }
                  >
                    <MenuItem value="am">Morning (8:00–12:00)</MenuItem>
                    <MenuItem value="pm">Afternoon (1:00–5:00)</MenuItem>
                    <MenuItem value="all_day">All Day (8:00–5:00)</MenuItem>
                    <MenuItem value="custom">Custom</MenuItem>
                  </TextField>

                  <TextField
                    type="time"
                    label="Start Time"
                    value={editTripStartTime}
                    onChange={(e) => setEditTripStartTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    type="time"
                    label="End Time"
                    value={editTripEndTime}
                    onChange={(e) => setEditTripEndTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />

                  <TextField
                    select
                    label="Primary Technician"
                    value={editTripPrimaryTechUid}
                    onChange={(e) => setEditTripPrimaryTechUid(e.target.value)}
                  >
                    <MenuItem value="">Select a technician…</MenuItem>
                    {technicians.map((tech) => {
                      const option = availabilityForOption({
                        uid: tech.uid,
                        name: tech.displayName,
                        role: "technician",
                        date: editTripDate,
                        timeWindow: editTripTimeWindow,
                        startTime: editTripStartTime,
                        endTime: editTripEndTime,
                        holidayNames: editHolidayNames,
                        holidayOverrideEnabled: editTripHolidayOverride,
                        excludeTripId: editTripId,
                      });

                      return (
                        <MenuItem
                          key={tech.uid}
                          value={tech.uid}
                          disabled={option.disabled}
                        >
                          {option.label}
                        </MenuItem>
                      );
                    })}
                  </TextField>

                  <TextField
                    select
                    label="Secondary Technician (optional)"
                    value={editTripSecondaryTechUid}
                    onChange={(e) => setEditTripSecondaryTechUid(e.target.value)}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {technicians
                      .filter((tech) => tech.uid !== editTripPrimaryTechUid)
                      .map((tech) => {
                        const option = availabilityForOption({
                          uid: tech.uid,
                          name: tech.displayName,
                          role: "technician",
                          date: editTripDate,
                          timeWindow: editTripTimeWindow,
                          startTime: editTripStartTime,
                          endTime: editTripEndTime,
                          holidayNames: editHolidayNames,
                          holidayOverrideEnabled: editTripHolidayOverride,
                          excludeTripId: editTripId,
                        });

                        return (
                          <MenuItem
                            key={tech.uid}
                            value={tech.uid}
                            disabled={option.disabled}
                          >
                            {option.label}
                          </MenuItem>
                        );
                      })}
                  </TextField>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editTripUseDefaultHelper}
                        onChange={(e) => setEditTripUseDefaultHelper(e.target.checked)}
                      />
                    }
                    label="Use default helper pairing"
                  />

                  <TextField
                    select
                    label="Helper / Apprentice (optional)"
                    value={editTripHelperUid}
                    onChange={(e) => {
                      setEditTripUseDefaultHelper(false);
                      setEditTripHelperUid(e.target.value);
                    }}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {helperCandidates.map((helper) => {
                      const option = availabilityForOption({
                        uid: helper.uid,
                        name: helper.name,
                        role: "helper",
                        date: editTripDate,
                        timeWindow: editTripTimeWindow,
                        startTime: editTripStartTime,
                        endTime: editTripEndTime,
                        holidayNames: editHolidayNames,
                        holidayOverrideEnabled: editTripHolidayOverride,
                        excludeTripId: editTripId,
                      });

                      return (
                        <MenuItem
                          key={helper.uid}
                          value={helper.uid}
                          disabled={option.disabled}
                        >
                          {option.label}
                        </MenuItem>
                      );
                    })}
                  </TextField>

                  <TextField
                    select
                    label="Secondary Helper (optional)"
                    value={editTripSecondaryHelperUid}
                    onChange={(e) => setEditTripSecondaryHelperUid(e.target.value)}
                  >
                    <MenuItem value="">— None —</MenuItem>
                    {helperCandidates.map((helper) => {
                      const option = availabilityForOption({
                        uid: helper.uid,
                        name: helper.name,
                        role: "helper",
                        date: editTripDate,
                        timeWindow: editTripTimeWindow,
                        startTime: editTripStartTime,
                        endTime: editTripEndTime,
                        holidayNames: editHolidayNames,
                        holidayOverrideEnabled: editTripHolidayOverride,
                        excludeTripId: editTripId,
                      });

                      return (
                        <MenuItem
                          key={helper.uid}
                          value={helper.uid}
                          disabled={option.disabled}
                        >
                          {option.label}
                        </MenuItem>
                      );
                    })}
                  </TextField>

                  <TextField
                    multiline
                    minRows={3}
                    label="Trip Notes"
                    value={editTripNotes}
                    onChange={(e) => setEditTripNotes(e.target.value)}
                  />

                  {editHolidayNames.length > 0 ? (
                    <Alert
                      severity={editTripHolidayOverride ? "success" : "warning"}
                      variant="outlined"
                    >
                      {editTripHolidayOverride
                        ? `Holiday override enabled for ${editHolidayNames.join(", ")}.`
                        : `Selected day falls on ${editHolidayNames.join(", ")}. Save stays blocked until Holiday Override is enabled.`}
                    </Alert>
                  ) : null}

                  {editHolidayNames.length > 0 && canDispatch ? (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={editTripHolidayOverride}
                          onChange={(e) => setEditTripHolidayOverride(e.target.checked)}
                        />
                      }
                      label="Override holiday conflict for this trip"
                    />
                  ) : null}

                  {editDispatchConflicts.hardMessages.length > 0 ? (
                    <Alert severity="error" variant="outlined">
                      {editDispatchConflicts.hardMessages[0]}
                    </Alert>
                  ) : null}

                  {editDispatchConflicts.softMessages.length > 0 &&
                  editDispatchConflicts.hardMessages.length === 0 ? (
                    <Stack spacing={1.25}>
                      <Alert severity="warning" variant="outlined">
                        {editDispatchConflicts.softMessages[0]}
                      </Alert>

                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={editTripDispatchOverrideEnabled}
                            onChange={(e) =>
                              setEditTripDispatchOverrideEnabled(e.target.checked)
                            }
                          />
                        }
                        label="Dispatch Override — schedule this as a planned trip"
                      />

                      {editTripDispatchOverrideEnabled ? (
                        <TextField
                          label="Dispatch Override Reason"
                          value={editTripDispatchOverrideReason}
                          onChange={(e) =>
                            setEditTripDispatchOverrideReason(e.target.value)
                          }
                          placeholder="Example: Confirmed with Josh that he is wrapping up and proceeding directly to this customer."
                          multiline
                          minRows={2}
                        />
                      ) : null}
                    </Stack>
                  ) : null}

                  {editTripErr ? <Alert severity="error">{editTripErr}</Alert> : null}

                  <Typography variant="body2" color="text.secondary">
                    Scheduled or in-progress trip overlaps can be saved with Dispatch Override.
                    The new trip remains planned and cannot be started while another trip is
                    running. PTO and holidays remain blocked unless their separate override is
                    enabled.
                  </Typography>
                </Stack>
              </DialogContent>

              <DialogActions>
                <Button onClick={() => setEditTripId(null)}>Close</Button>
                <Button
                  variant="contained"
                  onClick={handleSaveTripEdit}
                  disabled={editTripSaving || isInvoicedTicket || !editCanSubmit}
                >
                  {editTripSaving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogActions>
            </Dialog>
          </Stack>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}