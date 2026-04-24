// app/customers/[customerId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
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
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddHomeRoundedIcon from "@mui/icons-material/AddHomeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DirectionsRoundedIcon from "@mui/icons-material/DirectionsRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PhoneRoundedIcon from "@mui/icons-material/PhoneRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import AddressAutocompleteField from "../../../components/AddressAutocompleteField";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { Customer } from "../../../src/types/customer";

type CustomerDetailPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

type AddressChoice = {
  key: string;
  label: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  source: "service" | "billing";
  isPrimary?: boolean;
};

type NormalizedServiceAddress = NonNullable<Customer["serviceAddresses"]>[number];

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

type RelatedServiceTicket = {
  id: string;
  status: string;
  issueSummary: string;
  issueDetails?: string;
  serviceAddressLabel?: string;
  serviceAddressLine1?: string;
  assignedTechnicianName?: string;
  createdAt?: string;
  updatedAt?: string;
  active?: boolean;
};

type RelatedProject = {
  id: string;
  projectName: string;
  projectType?: string;
  status: string;
  locationLabel?: string;
  assignedLeadName?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  active?: boolean;
};

type RelatedPreviewModalState =
  | {
      kind: "ticket";
      item: RelatedServiceTicket;
    }
  | {
      kind: "project";
      item: RelatedProject;
    }
  | null;

function nowIso() {
  return new Date().toISOString();
}

function safeStr(x: unknown) {
  return String(x ?? "").trim();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2, 11)}`;
}

function isAppleDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function buildMapsUrl(address: string) {
  const q = encodeURIComponent(address);
  if (isAppleDevice()) return `https://maps.apple.com/?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function buildInlineAddress(
  line1?: string,
  line2?: string,
  city?: string,
  state?: string,
  postal?: string
) {
  const parts = [line1, line2, city, state, postal].map((x) => safeStr(x)).filter(Boolean);
  return parts.join(", ");
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function normalizeStatus(value?: string) {
  return safeStr(value).toLowerCase().replace(/\s+/g, "_");
}

function formatStatusLabel(value?: string) {
  const raw = safeStr(value);
  if (!raw) return "Unknown";
  return raw.replace(/_/g, " ");
}

function isHistoricalTicketStatus(status?: string) {
  const s = normalizeStatus(status);
  return new Set([
    "completed",
    "cancelled",
    "canceled",
    "closed",
    "invoiced",
    "resolved",
    "done",
  ]).has(s);
}

function isHistoricalProjectStatus(status?: string) {
  const s = normalizeStatus(status);
  return new Set([
    "completed",
    "cancelled",
    "canceled",
    "closed",
    "invoiced",
    "fully_invoiced",
    "billed",
    "done",
    "archived",
  ]).has(s);
}

function getLinkedQboId(rawCustomer: any, customer: Customer | null) {
  return (
    safeStr(rawCustomer?.qboCustomerId) ||
    safeStr(rawCustomer?.quickbooksCustomerId) ||
    safeStr(customer?.quickbooksCustomerId)
  );
}

function InfoRow(props: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 3,
          display: "grid",
          placeItems: "center",
          bgcolor: "action.hover",
          flexShrink: 0,
          mt: 0.25,
        }}
      >
        {props.icon}
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {props.label}
        </Typography>
        <Typography variant="body1" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
          {props.primary || "—"}
        </Typography>
        {props.secondary ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.25, wordBreak: "break-word" }}
          >
            {props.secondary}
          </Typography>
        ) : null}
      </Box>

      {props.action ? <Box sx={{ flexShrink: 0 }}>{props.action}</Box> : null}
    </Stack>
  );
}

function SectionCard(props: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 5,
        border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.8)}`,
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {props.title}
              </Typography>
              {props.subtitle ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {props.subtitle}
                </Typography>
              ) : null}
            </Box>

            {props.action ? <Box sx={{ flexShrink: 0 }}>{props.action}</Box> : null}
          </Stack>

          {props.children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function EmptyMiniState(props: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        p: 3,
        border: (theme) => `1px dashed ${alpha(theme.palette.divider, 0.9)}`,
        textAlign: "center",
      }}
    >
      <Stack spacing={1.25} alignItems="center">
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: 4,
            display: "grid",
            placeItems: "center",
            bgcolor: "action.hover",
            color: "text.secondary",
          }}
        >
          {props.icon}
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {props.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
          {props.description}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const theme = useTheme();
  const { appUser } = useAuthContext();
  const router = useRouter();

  const canCreateTicket =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const canEditCustomer =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "billing";

  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [rawCustomer, setRawCustomer] = useState<any>(null);
  const [error, setError] = useState("");

  const [isEditMode, setIsEditMode] = useState(false);

  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [showAddServiceAddress, setShowAddServiceAddress] = useState(false);

  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editOk, setEditOk] = useState("");

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhonePrimary, setEditPhonePrimary] = useState("");
  const [editPhoneSecondary, setEditPhoneSecondary] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [editBillLine1, setEditBillLine1] = useState("");
  const [editBillLine2, setEditBillLine2] = useState("");
  const [editBillCity, setEditBillCity] = useState("");
  const [editBillState, setEditBillState] = useState("");
  const [editBillPostal, setEditBillPostal] = useState("");

  const [qboSyncing, setQboSyncing] = useState(false);
  const [qboSyncErr, setQboSyncErr] = useState("");
  const [qboSyncOk, setQboSyncOk] = useState("");

  const [savingAddress, setSavingAddress] = useState(false);
  const [serviceAddressError, setServiceAddressError] = useState("");

  const [serviceLabel, setServiceLabel] = useState("");
  const [serviceAddressSearch, setServiceAddressSearch] = useState("");
  const [serviceAddressLine1, setServiceAddressLine1] = useState("");
  const [serviceAddressLine2, setServiceAddressLine2] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [serviceState, setServiceState] = useState("");
  const [servicePostalCode, setServicePostalCode] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceIsPrimary, setServiceIsPrimary] = useState(false);
  const [serviceAddressSource, setServiceAddressSource] = useState<string>("manual");

  const [deleteAddressTargetId, setDeleteAddressTargetId] = useState<string | null>(null);
  const [deleteAddressError, setDeleteAddressError] = useState("");
  const [deleteAddressSaving, setDeleteAddressSaving] = useState(false);

  const [relatedLoading, setRelatedLoading] = useState(true);
  const [relatedError, setRelatedError] = useState("");
  const [relatedTickets, setRelatedTickets] = useState<RelatedServiceTicket[]>([]);
  const [relatedProjects, setRelatedProjects] = useState<RelatedProject[]>([]);
  const [relatedPreviewModal, setRelatedPreviewModal] =
    useState<RelatedPreviewModalState>(null);

  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [issueSummary, setIssueSummary] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("60");
  const [selectedAddressKey, setSelectedAddressKey] = useState("");

  useEffect(() => {
    async function loadCustomer() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.customerId;
        setCustomerId(id);

        const customerRef = doc(db, "customers", id);
        const snap = await getDoc(customerRef);

        if (!snap.exists()) {
          setError("Customer not found.");
          setLoading(false);
          return;
        }

        const data = snap.data();
        setRawCustomer(data);

        const displayName =
          safeStr((data as any).displayName) ||
          safeStr((data as any).customerDisplayName) ||
          safeStr((data as any).qboDisplayName) ||
          "";

        const phonePrimary =
          safeStr((data as any).phonePrimary) ||
          safeStr((data as any).phone) ||
          "";

        const phoneSecondary = safeStr((data as any).phoneSecondary) || "";

        const email = safeStr((data as any).email) || "";

        const billingAddressLine1 =
          safeStr((data as any).billingAddressLine1) ||
          safeStr((data as any).billAddrLine1) ||
          "";

        const billingAddressLine2 =
          safeStr((data as any).billingAddressLine2) ||
          safeStr((data as any).billAddrLine2) ||
          safeStr((data as any).billAddrLine3) ||
          "";

        const billingCity =
          safeStr((data as any).billingCity) ||
          safeStr((data as any).billAddrCity) ||
          "";

        const billingState =
          safeStr((data as any).billingState) ||
          safeStr((data as any).billAddrState) ||
          "";

        const billingPostalCode =
          safeStr((data as any).billingPostalCode) ||
          safeStr((data as any).billAddrPostalCode) ||
          "";

        const item: Customer = {
          id: snap.id,
          quickbooksCustomerId:
            (data as any).quickbooksCustomerId ?? (data as any).qboCustomerId ?? undefined,
          quickbooksSyncStatus:
            (data as any).quickbooksSyncStatus ?? (data as any).qboSyncStatus ?? undefined,
          lastQuickbooksSyncAt:
            (data as any).lastQuickbooksSyncAt ?? (data as any).qboLastSyncedAt ?? undefined,
          quickbooksLastError:
            (data as any).quickbooksLastError ?? (data as any).qboLastSyncError ?? undefined,
          source: (data as any).source ?? "dcflow",
          displayName,
          phonePrimary,
          phoneSecondary: phoneSecondary || undefined,
          email: email || undefined,

          billingAddressLine1,
          billingAddressLine2: billingAddressLine2 || undefined,
          billingCity,
          billingState,
          billingPostalCode,

          serviceAddresses: Array.isArray((data as any).serviceAddresses)
            ? (data as any).serviceAddresses.map((addr: any) => ({
                id: addr.id ?? createId(),
                label: addr.label ?? undefined,
                addressLine1: addr.addressLine1 ?? "",
                addressLine2: addr.addressLine2 ?? undefined,
                city: addr.city ?? "",
                state: addr.state ?? "",
                postalCode: addr.postalCode ?? "",
                notes: addr.notes ?? undefined,
                active: addr.active ?? true,
                isPrimary: addr.isPrimary ?? false,
                source: addr.source ?? undefined,
                createdAt: addr.createdAt ?? undefined,
                updatedAt: addr.updatedAt ?? undefined,
              }))
            : [],

          notes: (data as any).notes ?? undefined,
          active: (data as any).active ?? true,
          createdAt: (data as any).createdAt ?? undefined,
          updatedAt: (data as any).updatedAt ?? undefined,
        };

        setCustomer(item);

        setEditDisplayName(item.displayName || "");
        setEditPhonePrimary(item.phonePrimary || "");
        setEditPhoneSecondary(item.phoneSecondary || "");
        setEditEmail(item.email || "");

        setEditBillLine1(item.billingAddressLine1 || "");
        setEditBillLine2(item.billingAddressLine2 || "");
        setEditBillCity(item.billingCity || "");
        setEditBillState(item.billingState || "");
        setEditBillPostal(item.billingPostalCode || "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load customer.");
      } finally {
        setLoading(false);
      }
    }

    loadCustomer();
  }, [params]);

  useEffect(() => {
    async function loadRelatedWork() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.customerId;

        const ticketQuery = query(collection(db, "serviceTickets"), orderBy("createdAt", "desc"));
        const ticketSnap = await getDocs(ticketQuery);

        const ticketItems: RelatedServiceTicket[] = ticketSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;

            return {
              id: docSnap.id,
              status: safeStr(data.status) || "unknown",
              issueSummary: safeStr(data.issueSummary) || "Untitled ticket",
              issueDetails: safeStr(data.issueDetails) || undefined,
              serviceAddressLabel: safeStr(data.serviceAddressLabel) || undefined,
              serviceAddressLine1: safeStr(data.serviceAddressLine1) || undefined,
              assignedTechnicianName:
                safeStr(data.assignedTechnicianName) ||
                safeStr(data.primaryTechnicianName) ||
                undefined,
              createdAt: safeStr(data.createdAt) || undefined,
              updatedAt: safeStr(data.updatedAt) || undefined,
              active: data.active ?? true,
              customerId: safeStr(data.customerId),
            };
          })
          .filter((item: any) => item.customerId === id)
          .map(({ customerId: _customerId, ...rest }: any) => rest);

        const projectQuery = query(collection(db, "projects"), orderBy("createdAt", "desc"));
        const projectSnap = await getDocs(projectQuery);

        const projectItems: RelatedProject[] = projectSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;

            const locationLabel = buildInlineAddress(
              safeStr(data.serviceAddressLine1) ||
                safeStr(data.addressLine1) ||
                safeStr(data.siteAddressLine1),
              safeStr(data.serviceAddressLine2) ||
                safeStr(data.addressLine2) ||
                safeStr(data.siteAddressLine2),
              safeStr(data.serviceCity) || safeStr(data.city) || safeStr(data.siteCity),
              safeStr(data.serviceState) || safeStr(data.state) || safeStr(data.siteState),
              safeStr(data.servicePostalCode) ||
                safeStr(data.postalCode) ||
                safeStr(data.sitePostalCode)
            );

            return {
              id: docSnap.id,
              projectName:
                safeStr(data.projectName) ||
                safeStr(data.title) ||
                safeStr(data.displayName) ||
                safeStr(data.name) ||
                `Project ${docSnap.id}`,
              projectType:
                safeStr(data.projectType) ||
                safeStr(data.type) ||
                safeStr(data.projectKind) ||
                undefined,
              status:
                safeStr(data.status) ||
                safeStr(data.projectStatus) ||
                safeStr(data.workflowStatus) ||
                "unknown",
              locationLabel: locationLabel || undefined,
              assignedLeadName:
                safeStr(data.projectManagerName) ||
                safeStr(data.assignedLeadName) ||
                safeStr(data.primaryTechName) ||
                undefined,
              description:
                safeStr(data.projectDescription) ||
                safeStr(data.description) ||
                safeStr(data.scopeSummary) ||
                safeStr(data.notes) ||
                undefined,
              createdAt: safeStr(data.createdAt) || undefined,
              updatedAt: safeStr(data.updatedAt) || undefined,
              active: data.active ?? true,
              customerId: safeStr(data.customerId),
            };
          })
          .filter((item: any) => item.customerId === id)
          .map(({ customerId: _customerId, ...rest }: any) => rest);

        setRelatedTickets(ticketItems);
        setRelatedProjects(projectItems);
        setRelatedError("");
      } catch (err: unknown) {
        setRelatedError(err instanceof Error ? err.message : "Failed to load related work.");
      } finally {
        setRelatedLoading(false);
      }
    }

    loadRelatedWork();
  }, [params]);

  const addressChoices = useMemo((): AddressChoice[] => {
    if (!customer) return [];

    const services =
      (customer.serviceAddresses || [])
        .filter((a) => a.active !== false)
        .map((a) => ({
          key: `service:${a.id}`,
          label: `${a.label || "Service Address"}${a.isPrimary ? " (Primary)" : ""}`,
          addressLine1: a.addressLine1 || "",
          addressLine2: a.addressLine2 || undefined,
          city: a.city || "",
          state: a.state || "",
          postalCode: a.postalCode || "",
          source: "service" as const,
          isPrimary: Boolean(a.isPrimary),
        })) || [];

    services.sort(
      (a, b) =>
        Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) ||
        a.label.localeCompare(b.label)
    );

    const billing: AddressChoice = {
      key: "billing",
      label: "Billing Address",
      addressLine1: customer.billingAddressLine1 || "",
      addressLine2: customer.billingAddressLine2 || undefined,
      city: customer.billingCity || "",
      state: customer.billingState || "",
      postalCode: customer.billingPostalCode || "",
      source: "billing",
    };

    return [...services, billing];
  }, [customer]);

  useEffect(() => {
    if (!selectedAddressKey && addressChoices.length) {
      const primary = addressChoices.find((a) => a.source === "service" && a.isPrimary);
      setSelectedAddressKey(primary?.key || addressChoices[0].key);
    }
  }, [addressChoices, selectedAddressKey]);

  function getAddressFromKey(key: string): AddressChoice | null {
    return addressChoices.find((a) => a.key === key) || null;
  }

  function resetServiceAddressForm() {
    setServiceLabel("");
    setServiceAddressSearch("");
    setServiceAddressLine1("");
    setServiceAddressLine2("");
    setServiceCity("");
    setServiceState("");
    setServicePostalCode("");
    setServiceNotes("");
    setServiceIsPrimary(false);
    setServiceAddressSource("manual");
    setServiceAddressError("");
  }

  function enterEditMode() {
    if (!customer) return;

    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setIsEditMode(true);

    setEditDisplayName(customer.displayName || "");
    setEditPhonePrimary(customer.phonePrimary || "");
    setEditPhoneSecondary(customer.phoneSecondary || "");
    setEditEmail(customer.email || "");
    setEditBillLine1(customer.billingAddressLine1 || "");
    setEditBillLine2(customer.billingAddressLine2 || "");
    setEditBillCity(customer.billingCity || "");
    setEditBillState(customer.billingState || "");
    setEditBillPostal(customer.billingPostalCode || "");
  }

  function cancelEditMode() {
    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setIsEditMode(false);
  }

  function markServiceAddressManual() {
    setServiceAddressSource((current) => (current === "google_places" ? "manual" : current));
  }

  function handleServiceGoogleAddressSelected(selection: GoogleAddressSelectionLike) {
    setServiceAddressSearch(selection.formattedAddress || "");
    setServiceAddressLine1(selection.addressLine1 || "");
    setServiceAddressLine2(selection.addressLine2 || "");
    setServiceCity(selection.city || "");
    setServiceState(selection.state || "");
    setServicePostalCode(selection.postalCode || "");
    setServiceAddressSource("google_places");
  }

  function handleRelatedTicketClick(ticket: RelatedServiceTicket) {
    if (isHistoricalTicketStatus(ticket.status)) {
      setRelatedPreviewModal({ kind: "ticket", item: ticket });
      return;
    }

    router.push(`/service-tickets/${ticket.id}`);
  }

  function handleRelatedProjectClick(project: RelatedProject) {
    if (isHistoricalProjectStatus(project.status)) {
      setRelatedPreviewModal({ kind: "project", item: project });
      return;
    }

    router.push(`/projects/${project.id}`);
  }

  async function handleCreateQboCustomer() {
    if (!customer) return;

    const alreadyLinked = getLinkedQboId(rawCustomer, customer);
    if (alreadyLinked) {
      await handleSyncToQbo({ updateName: true });
      return;
    }

    setQboSyncErr("");
    setQboSyncOk("");
    setQboSyncing(true);

    try {
      const res = await fetch("/api/qbo/customers/create-from-dcflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dcCustomerId: customer.id }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setQboSyncErr(data?.error || "Failed to create customer in QuickBooks.");
        return;
      }

      const linkedId = safeStr(data?.qboCustomerId);
      const syncedAt = nowIso();

      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              quickbooksCustomerId: linkedId || prev.quickbooksCustomerId,
              quickbooksSyncStatus: "synced",
              lastQuickbooksSyncAt: syncedAt,
              quickbooksLastError: undefined,
            }
          : prev
      );

      setRawCustomer((prev: any) => ({
        ...(prev || {}),
        quickbooksCustomerId: linkedId || prev?.quickbooksCustomerId || null,
        qboCustomerId: linkedId || prev?.qboCustomerId || null,
        quickbooksSyncStatus: "synced",
        qboSyncStatus: "synced",
        lastQuickbooksSyncAt: syncedAt,
        qboLastSyncedAt: syncedAt,
        quickbooksLastError: null,
        qboLastSyncError: null,
        qboLastSyncIntuitTid: data?.intuit_tid || "",
        updatedAt: syncedAt,
      }));

      setQboSyncOk("Created customer in QuickBooks and linked to DCFlow.");
    } catch (err: unknown) {
      setQboSyncErr(
        err instanceof Error ? err.message : "Failed to create customer in QuickBooks."
      );
    } finally {
      setQboSyncing(false);
    }
  }

  async function handleSyncToQbo(opts?: { updateName?: boolean }) {
    if (!customer) return;

    const qboLinkedId = getLinkedQboId(rawCustomer, customer);

    if (!qboLinkedId) {
      setQboSyncErr("This customer is not linked to QuickBooks yet.");
      return;
    }

    setQboSyncErr("");
    setQboSyncOk("");
    setQboSyncing(true);

    try {
      const res = await fetch("/api/qbo/customers/update-from-dcflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dcCustomerId: customer.id,
          updateName: Boolean(opts?.updateName),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setQboSyncErr(data?.error || "Failed to sync customer to QuickBooks.");
        return;
      }

      const syncedAt = nowIso();

      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              quickbooksSyncStatus: "synced",
              lastQuickbooksSyncAt: syncedAt,
              quickbooksLastError: undefined,
            }
          : prev
      );

      setRawCustomer((prev: any) => ({
        ...(prev || {}),
        quickbooksSyncStatus: "synced",
        qboSyncStatus: "synced",
        lastQuickbooksSyncAt: syncedAt,
        qboLastSyncedAt: syncedAt,
        quickbooksLastError: null,
        qboLastSyncError: null,
        qboLastSyncIntuitTid: data?.intuit_tid || "",
        updatedAt: syncedAt,
      }));

      setQboSyncOk("Synced to QuickBooks.");
    } catch (err: unknown) {
      setQboSyncErr(err instanceof Error ? err.message : "Failed to sync to QuickBooks.");
    } finally {
      setQboSyncing(false);
    }
  }

  async function handleCreateOrSyncToQbo(opts?: { updateName?: boolean }) {
    const linked = getLinkedQboId(rawCustomer, customer);
    if (linked) {
      await handleSyncToQbo(opts);
      return;
    }

    await handleCreateQboCustomer();
  }

  async function handleSaveCustomerEdits(syncToQboAfter: boolean) {
    if (!customer) return;

    if (!canEditCustomer) {
      setEditErr("You do not have permission to edit customers.");
      return;
    }

    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setEditSaving(true);

    try {
      const now = nowIso();
      const isAlreadyLinked = Boolean(getLinkedQboId(rawCustomer, customer));

      const payload: any = {
        displayName: safeStr(editDisplayName),
        phonePrimary: safeStr(editPhonePrimary),
        phoneSecondary: safeStr(editPhoneSecondary) || null,
        email: safeStr(editEmail) || null,

        billingAddressLine1: safeStr(editBillLine1),
        billingAddressLine2: safeStr(editBillLine2) || null,
        billingCity: safeStr(editBillCity),
        billingState: safeStr(editBillState),
        billingPostalCode: safeStr(editBillPostal),

        updatedAt: now,

        customerDisplayName: safeStr(editDisplayName),
        phone: safeStr(editPhonePrimary),
        billAddrLine1: safeStr(editBillLine1),
        billAddrLine2: safeStr(editBillLine2),
        billAddrCity: safeStr(editBillCity),
        billAddrState: safeStr(editBillState),
        billAddrPostalCode: safeStr(editBillPostal),
      };

      await updateDoc(doc(db, "customers", customer.id), payload);

      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              displayName: safeStr(editDisplayName),
              phonePrimary: safeStr(editPhonePrimary),
              phoneSecondary: safeStr(editPhoneSecondary) || undefined,
              email: safeStr(editEmail) || undefined,
              billingAddressLine1: safeStr(editBillLine1),
              billingAddressLine2: safeStr(editBillLine2) || undefined,
              billingCity: safeStr(editBillCity),
              billingState: safeStr(editBillState),
              billingPostalCode: safeStr(editBillPostal),
              updatedAt: now,
            }
          : prev
      );

      setRawCustomer((prev: any) => ({
        ...(prev || {}),
        ...payload,
      }));

      setEditOk(
        syncToQboAfter
          ? isAlreadyLinked
            ? "Saved in DCFlow. Syncing to QuickBooks..."
            : "Saved in DCFlow. Creating customer in QuickBooks..."
          : "Saved in DCFlow."
      );
      setIsEditMode(false);

      if (syncToQboAfter) {
        await handleCreateOrSyncToQbo({ updateName: true });
      }
    } catch (err: unknown) {
      setEditErr(err instanceof Error ? err.message : "Failed to save customer.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddServiceAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customer) return;

    setServiceAddressError("");
    setSavingAddress(true);

    try {
      const timestamp = nowIso();

      const nextAddressForState = {
        id: createId(),
        label: serviceLabel.trim() || undefined,
        addressLine1: serviceAddressLine1.trim(),
        addressLine2: serviceAddressLine2.trim() || undefined,
        city: serviceCity.trim(),
        state: serviceState.trim(),
        postalCode: servicePostalCode.trim(),
        notes: serviceNotes.trim() || undefined,
        active: true,
        isPrimary: serviceIsPrimary,
        source: serviceAddressSource || "manual",
        createdAt: timestamp,
        updatedAt: timestamp,
      } as NormalizedServiceAddress;

      let existingAddressesForState = customer.serviceAddresses ?? [];

      if (serviceIsPrimary) {
        existingAddressesForState = existingAddressesForState.map((addr) => ({
          ...addr,
          isPrimary: false,
        }));
      }

      const updatedAddressesForState = [...existingAddressesForState, nextAddressForState];

      const updatedAddressesForFirestore = updatedAddressesForState.map((addr) => ({
        ...addr,
        label: addr.label ?? null,
        addressLine2: addr.addressLine2 ?? null,
        notes: addr.notes ?? null,
        source: addr.source ?? null,
      }));

      await updateDoc(doc(db, "customers", customer.id), {
        serviceAddresses: updatedAddressesForFirestore,
        updatedAt: timestamp,
      });

      setCustomer({
        ...customer,
        serviceAddresses: updatedAddressesForState,
        updatedAt: timestamp,
      });

      setRawCustomer((prev: any) => ({
        ...(prev || {}),
        serviceAddresses: updatedAddressesForFirestore,
        updatedAt: timestamp,
      }));

      resetServiceAddressForm();
      setShowAddServiceAddress(false);
    } catch (err: unknown) {
      setServiceAddressError(err instanceof Error ? err.message : "Failed to add service address.");
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleDeleteServiceAddress() {
    if (!customer || !deleteAddressTargetId) return;

    setDeleteAddressError("");
    setDeleteAddressSaving(true);

    try {
      const timestamp = nowIso();
      const currentAddresses = customer.serviceAddresses ?? [];
      const target = currentAddresses.find((addr) => addr.id === deleteAddressTargetId);

      if (!target) {
        setDeleteAddressError("Service address not found.");
        return;
      }

      let updatedAddresses = currentAddresses.map((addr) =>
        addr.id === deleteAddressTargetId
          ? {
              ...addr,
              active: false,
              isPrimary: false,
              updatedAt: timestamp,
            }
          : addr
      );

      const remainingActive = updatedAddresses.filter(
        (addr) => addr.active !== false && addr.id !== deleteAddressTargetId
      );

      if (target.isPrimary && remainingActive.length > 0) {
        const nextPrimary = [...remainingActive].sort((a, b) =>
          safeStr(a.label).localeCompare(safeStr(b.label))
        )[0];

        updatedAddresses = updatedAddresses.map((addr) =>
          addr.id === nextPrimary.id
            ? {
                ...addr,
                isPrimary: true,
                updatedAt: timestamp,
              }
            : addr
        );
      }

      const updatedAddressesForFirestore = updatedAddresses.map((addr) => ({
        ...addr,
        label: addr.label ?? null,
        addressLine2: addr.addressLine2 ?? null,
        notes: addr.notes ?? null,
        source: addr.source ?? null,
      }));

      await updateDoc(doc(db, "customers", customer.id), {
        serviceAddresses: updatedAddressesForFirestore,
        updatedAt: timestamp,
      });

      setCustomer({
        ...customer,
        serviceAddresses: updatedAddresses,
        updatedAt: timestamp,
      });

      setRawCustomer((prev: any) => ({
        ...(prev || {}),
        serviceAddresses: updatedAddressesForFirestore,
        updatedAt: timestamp,
      }));

      setDeleteAddressTargetId(null);
    } catch (err: unknown) {
      setDeleteAddressError(
        err instanceof Error ? err.message : "Failed to delete service address."
      );
    } finally {
      setDeleteAddressSaving(false);
    }
  }

  async function handleCreateServiceTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customer) return;

    if (!canCreateTicket) {
      setTicketError("You do not have permission to create service tickets.");
      return;
    }

    setTicketError("");
    setTicketSaving(true);

    try {
      const now = nowIso();
      const sum = issueSummary.trim();

      if (!sum) {
        setTicketError("Issue Summary is required.");
        return;
      }

      const addr = getAddressFromKey(selectedAddressKey);
      if (!addr) {
        setTicketError("Please choose a service or billing address.");
        return;
      }

      const minutes = Math.max(1, Number(estimatedDurationMinutes || "60"));

      const serviceAddressId =
        addr.source === "service" ? addr.key.replace("service:", "") : null;

      const payload = {
        customerId: customer.id,
        customerDisplayName: customer.displayName || "",

        serviceAddressId,
        serviceAddressLabel: addr.source === "service" ? addr.label : "Billing Address",
        serviceAddressLine1: addr.addressLine1 || "",
        serviceAddressLine2: addr.addressLine2 || null,
        serviceCity: addr.city || "",
        serviceState: addr.state || "",
        servicePostalCode: addr.postalCode || "",

        issueSummary: sum,
        issueDetails: issueDetails.trim() || null,

        status: "new",
        estimatedDurationMinutes: minutes,

        assignedTechnicianId: null,
        assignedTechnicianName: null,
        primaryTechnicianId: null,
        secondaryTechnicianId: null,
        secondaryTechnicianName: null,
        helperIds: null,
        helperNames: null,
        assignedTechnicianIds: null,

        internalNotes: null,
        active: true,

        createdAt: now,
        updatedAt: now,
      };

      const created = await addDoc(collection(db, "serviceTickets"), payload);

      setIssueSummary("");
      setIssueDetails("");
      setEstimatedDurationMinutes("60");
      setShowCreateTicket(false);

      setRelatedTickets((prev) => [
        {
          id: created.id,
          status: "new",
          issueSummary: sum,
          issueDetails: issueDetails.trim() || undefined,
          serviceAddressLabel: addr.source === "service" ? addr.label : "Billing Address",
          serviceAddressLine1: addr.addressLine1 || undefined,
          assignedTechnicianName: undefined,
          createdAt: now,
          updatedAt: now,
          active: true,
        },
        ...prev,
      ]);

      router.push(`/service-tickets/${created.id}`);
    } catch (err: unknown) {
      setTicketError(err instanceof Error ? err.message : "Failed to create service ticket.");
    } finally {
      setTicketSaving(false);
    }
  }

  const qboStatus = useMemo(() => {
    const d = rawCustomer || {};
    const linked = getLinkedQboId(rawCustomer, customer);

    return {
      linkedId: linked,
      syncStatus: safeStr(d.quickbooksSyncStatus) || safeStr(d.qboSyncStatus) || "",
      lastSyncedAt: safeStr(d.lastQuickbooksSyncAt) || safeStr(d.qboLastSyncedAt) || "",
      lastError: safeStr(d.quickbooksLastError) || safeStr(d.qboLastSyncError) || "",
      lastTid: safeStr(d.qboLastSyncIntuitTid) || "",
    };
  }, [rawCustomer, customer]);

  const billingInline = useMemo(() => {
    return buildInlineAddress(
      customer?.billingAddressLine1,
      customer?.billingAddressLine2,
      customer?.billingCity,
      customer?.billingState,
      customer?.billingPostalCode
    );
  }, [customer]);

  const billingMapsUrl = useMemo(() => {
    const full = buildInlineAddress(
      customer?.billingAddressLine1,
      customer?.billingAddressLine2,
      customer?.billingCity,
      customer?.billingState,
      customer?.billingPostalCode
    );
    return full ? buildMapsUrl(full) : "";
  }, [customer]);

  const primaryServiceAddress = useMemo(() => {
    return (
      customer?.serviceAddresses?.find((addr) => addr.active !== false && addr.isPrimary) ??
      customer?.serviceAddresses?.find((addr) => addr.active !== false) ??
      null
    );
  }, [customer]);

  const activeServiceAddresses = useMemo(() => {
    return (customer?.serviceAddresses || [])
      .filter((a) => a.active !== false)
      .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));
  }, [customer]);

  const deleteAddressTarget = useMemo(() => {
    return activeServiceAddresses.find((addr) => addr.id === deleteAddressTargetId) ?? null;
  }, [activeServiceAddresses, deleteAddressTargetId]);

  if (loading) {
    return (
      <ProtectedPage fallbackTitle="Customer Detail">
        <AppShell appUser={appUser}>
          <Box sx={{ maxWidth: 1320, mx: "auto", px: { xs: 1, sm: 2 }, pb: 4 }}>
            <Stack spacing={2}>
              <Skeleton variant="rounded" height={150} sx={{ borderRadius: 5 }} />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" },
                  gap: 2,
                }}
              >
                <Skeleton variant="rounded" height={220} sx={{ borderRadius: 5 }} />
                <Skeleton variant="rounded" height={220} sx={{ borderRadius: 5 }} />
                <Skeleton variant="rounded" height={220} sx={{ borderRadius: 5 }} />
              </Box>
              <Skeleton variant="rounded" height={260} sx={{ borderRadius: 5 }} />
              <Skeleton variant="rounded" height={260} sx={{ borderRadius: 5 }} />
            </Stack>
          </Box>
        </AppShell>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Customer Detail">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 1320, mx: "auto", px: { xs: 1, sm: 2 }, pb: 4 }}>
          {error ? (
            <Alert severity="error" sx={{ borderRadius: 4 }}>
              {error}
            </Alert>
          ) : null}

          {!error && customer ? (
            <Stack spacing={3}>
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 5,
                  px: { xs: 2, sm: 3 },
                  py: { xs: 2.25, sm: 3 },
                  border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                  background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(
                    theme.palette.primary.main,
                    0.03
                  )} 100%)`,
                }}
              >
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", lg: "center" }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.4 }}>
                          {customer.displayName || "Unnamed Customer"}
                        </Typography>

                        <Chip
                          label={customer.active ? "Active" : "Inactive"}
                          color={customer.active ? "success" : "default"}
                          variant={customer.active ? "filled" : "outlined"}
                          sx={{ borderRadius: 99 }}
                        />

                        <Chip
                          label={qboStatus.linkedId ? "QBO linked" : "DCFlow only"}
                          icon={qboStatus.linkedId ? <SyncRoundedIcon /> : <BusinessRoundedIcon />}
                          color={qboStatus.linkedId ? "primary" : "default"}
                          variant={qboStatus.linkedId ? "filled" : "outlined"}
                          sx={{ borderRadius: 99 }}
                        />
                      </Stack>

                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Customer ID: {customerId}
                      </Typography>

                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={1}
                        useFlexGap
                        flexWrap="wrap"
                        sx={{ mt: 1.5 }}
                      >
                        <Chip
                          icon={<PhoneRoundedIcon />}
                          label={customer.phonePrimary || "No primary phone"}
                          variant="outlined"
                          sx={{ borderRadius: 99 }}
                        />
                        <Chip
                          icon={<LocationOnRoundedIcon />}
                          label={
                            activeServiceAddresses.length > 0
                              ? `${activeServiceAddresses.length} service location${
                                  activeServiceAddresses.length === 1 ? "" : "s"
                                }`
                              : "Billing-only customer"
                          }
                          variant="outlined"
                          sx={{ borderRadius: 99 }}
                        />
                        <Chip
                          icon={<TaskAltRoundedIcon />}
                          label={
                            primaryServiceAddress
                              ? `Primary: ${primaryServiceAddress.label || "Service Address"}`
                              : "No primary service location"
                          }
                          variant="outlined"
                          sx={{ borderRadius: 99 }}
                        />
                      </Stack>
                    </Box>

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      useFlexGap
                      flexWrap="wrap"
                    >
                      <Button
                        component={Link}
                        href="/customers"
                        variant="outlined"
                        startIcon={<ArrowBackRoundedIcon />}
                        sx={{ borderRadius: 99, fontWeight: 700 }}
                      >
                        Back to Customers
                      </Button>

                      {canCreateTicket ? (
                        <Button
                          variant="contained"
                          startIcon={<DescriptionRoundedIcon />}
                          onClick={() => {
                            setShowCreateTicket(true);
                            setTicketError("");
                          }}
                          sx={{ borderRadius: 99, fontWeight: 700, boxShadow: "none" }}
                        >
                          Create Ticket
                        </Button>
                      ) : null}

                      {canEditCustomer ? (
                        <Button
                          variant={isEditMode ? "outlined" : "contained"}
                          startIcon={<EditRoundedIcon />}
                          onClick={() => {
                            if (isEditMode) cancelEditMode();
                            else enterEditMode();
                          }}
                          sx={{ borderRadius: 99, fontWeight: 700 }}
                        >
                          {isEditMode ? "Cancel Edit" : "Edit Customer"}
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>

                  <Divider />

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                        xl: "repeat(4, minmax(0, 1fr))",
                      },
                      gap: 1.5,
                    }}
                  >
                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        p: 2,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        bgcolor: theme.palette.background.paper,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Primary phone
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 800, mt: 0.5, wordBreak: "break-word" }}
                      >
                        {customer.phonePrimary || "—"}
                      </Typography>
                    </Paper>

                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        p: 2,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        bgcolor: theme.palette.background.paper,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Email
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 800, mt: 0.5, wordBreak: "break-word" }}
                      >
                        {customer.email || "—"}
                      </Typography>
                    </Paper>

                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        p: 2,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        bgcolor: theme.palette.background.paper,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        QuickBooks status
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
                        {qboStatus.linkedId ? qboStatus.syncStatus || "Linked" : "Not linked"}
                      </Typography>
                    </Paper>

                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        p: 2,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        bgcolor: theme.palette.background.paper,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Last sync
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
                        {qboStatus.lastSyncedAt ? formatDateTime(qboStatus.lastSyncedAt) : "—"}
                      </Typography>
                    </Paper>
                  </Box>
                </Stack>
              </Paper>

              {editErr ? (
                <Alert severity="error" sx={{ borderRadius: 4 }}>
                  {editErr}
                </Alert>
              ) : null}

              {editOk ? (
                <Alert severity="success" sx={{ borderRadius: 4 }}>
                  {editOk}
                </Alert>
              ) : null}

              {qboSyncErr ? (
                <Alert severity="error" sx={{ borderRadius: 4 }}>
                  {qboSyncErr}
                </Alert>
              ) : null}

              {qboSyncOk ? (
                <Alert severity="success" sx={{ borderRadius: 4 }}>
                  {qboSyncOk}
                </Alert>
              ) : null}

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", xl: "repeat(3, minmax(0, 1fr))" },
                  gap: 2,
                }}
              >
                <SectionCard
                  title="Contact"
                  subtitle="Primary customer contact details and quick communication actions."
                >
                  <Stack spacing={2}>
                    <InfoRow
                      icon={<PhoneRoundedIcon color="action" />}
                      label="Primary phone"
                      primary={customer.phonePrimary || "—"}
                      secondary={
                        customer.phoneSecondary
                          ? `Secondary: ${customer.phoneSecondary}`
                          : undefined
                      }
                      action={
                        customer.phonePrimary ? (
                          <Stack direction="row" spacing={1}>
                            <Button
                              component="a"
                              href={`tel:${customer.phonePrimary}`}
                              variant="outlined"
                              size="small"
                              sx={{ borderRadius: 99, fontWeight: 700 }}
                            >
                              Call
                            </Button>
                            <Button
                              component="a"
                              href={`sms:${customer.phonePrimary}`}
                              variant="outlined"
                              size="small"
                              sx={{ borderRadius: 99, fontWeight: 700 }}
                            >
                              Text
                            </Button>
                          </Stack>
                        ) : null
                      }
                    />

                    <Divider />

                    <InfoRow
                      icon={<EmailRoundedIcon color="action" />}
                      label="Email"
                      primary={customer.email || "—"}
                      action={
                        customer.email ? (
                          <Button
                            component="a"
                            href={`mailto:${customer.email}`}
                            variant="outlined"
                            size="small"
                            sx={{ borderRadius: 99, fontWeight: 700 }}
                          >
                            Email
                          </Button>
                        ) : null
                      }
                    />
                  </Stack>
                </SectionCard>

                <SectionCard
                  title="Billing address"
                  subtitle="Mailing and invoice destination for this customer."
                >
                  <Stack spacing={2}>
                    <InfoRow
                      icon={<PlaceRoundedIcon color="action" />}
                      label="Billing address"
                      primary={billingInline || "—"}
                      action={
                        billingMapsUrl ? (
                          <Button
                            component="a"
                            href={billingMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            variant="outlined"
                            size="small"
                            startIcon={<DirectionsRoundedIcon />}
                            sx={{ borderRadius: 99, fontWeight: 700 }}
                          >
                            Maps
                          </Button>
                        ) : null
                      }
                    />
                  </Stack>
                </SectionCard>

                <SectionCard
                  title="QuickBooks"
                  subtitle={
                    qboStatus.linkedId
                      ? "This customer is linked to QuickBooks and can be synced at any time."
                      : "This customer is currently DCFlow-only and can be created in QuickBooks from here."
                  }
                  action={
                    <Button
                      variant="outlined"
                      startIcon={<SyncRoundedIcon />}
                      onClick={() => handleCreateOrSyncToQbo({ updateName: true })}
                      disabled={!canEditCustomer || qboSyncing}
                      sx={{ borderRadius: 99, fontWeight: 700 }}
                    >
                      {qboSyncing
                        ? qboStatus.linkedId
                          ? "Syncing..."
                          : "Creating..."
                        : qboStatus.linkedId
                        ? "Sync Now"
                        : "Create in QBO"}
                    </Button>
                  }
                >
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={qboStatus.linkedId ? `Linked: ${qboStatus.linkedId}` : "Not linked"}
                        color={qboStatus.linkedId ? "primary" : "default"}
                        variant={qboStatus.linkedId ? "filled" : "outlined"}
                        sx={{ borderRadius: 99 }}
                      />
                      <Chip
                        label={qboStatus.syncStatus || "No sync status"}
                        variant="outlined"
                        sx={{ borderRadius: 99 }}
                      />
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      Last sync:{" "}
                      {qboStatus.lastSyncedAt ? formatDateTime(qboStatus.lastSyncedAt) : "—"}
                    </Typography>

                    {qboStatus.lastError ? (
                      <Alert severity="warning" sx={{ borderRadius: 3 }}>
                        {qboStatus.lastError}
                      </Alert>
                    ) : null}

                    {qboStatus.lastTid ? (
                      <Typography variant="caption" color="text.secondary">
                        Intuit TID: {qboStatus.lastTid}
                      </Typography>
                    ) : null}
                  </Stack>
                </SectionCard>
              </Box>

              {isEditMode ? (
                <SectionCard
                  title="Edit customer"
                  subtitle={
                    qboStatus.linkedId
                      ? "Update contact and billing details. Save in DCFlow only, or save and sync to QuickBooks."
                      : "Update contact and billing details. Save in DCFlow only, or save and create this customer in QuickBooks."
                  }
                  action={
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant="outlined"
                        onClick={cancelEditMode}
                        disabled={editSaving || qboSyncing}
                        sx={{ borderRadius: 99, fontWeight: 700 }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<SaveRoundedIcon />}
                        onClick={() => handleSaveCustomerEdits(false)}
                        disabled={!canEditCustomer || editSaving}
                        sx={{ borderRadius: 99, fontWeight: 700 }}
                      >
                        {editSaving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        variant="contained"
                        startIcon={<SyncRoundedIcon />}
                        onClick={() => handleSaveCustomerEdits(true)}
                        disabled={!canEditCustomer || editSaving || qboSyncing}
                        sx={{ borderRadius: 99, fontWeight: 700, boxShadow: "none" }}
                      >
                        {qboSyncing
                          ? qboStatus.linkedId
                            ? "Syncing..."
                            : "Creating..."
                          : qboStatus.linkedId
                          ? "Save & Sync"
                          : "Save & Create in QBO"}
                      </Button>
                    </Stack>
                  }
                >
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                      gap: 2,
                    }}
                  >
                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                      }}
                    >
                      <CardContent sx={{ p: 2 }}>
                        <Stack spacing={2}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            Contact
                          </Typography>

                          <TextField
                            label="Customer name"
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            disabled={!canEditCustomer || editSaving}
                            fullWidth
                          />

                          <TextField
                            label="Email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            disabled={!canEditCustomer || editSaving}
                            fullWidth
                          />

                          <TextField
                            label="Primary phone"
                            value={editPhonePrimary}
                            onChange={(e) => setEditPhonePrimary(e.target.value)}
                            disabled={!canEditCustomer || editSaving}
                            fullWidth
                          />

                          <TextField
                            label="Secondary phone"
                            value={editPhoneSecondary}
                            onChange={(e) => setEditPhoneSecondary(e.target.value)}
                            disabled={!canEditCustomer || editSaving}
                            fullWidth
                          />
                        </Stack>
                      </CardContent>
                    </Card>

                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                      }}
                    >
                      <CardContent sx={{ p: 2 }}>
                        <Stack spacing={2}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            Billing address
                          </Typography>

                          <TextField
                            label="Address line 1"
                            value={editBillLine1}
                            onChange={(e) => setEditBillLine1(e.target.value)}
                            disabled={!canEditCustomer || editSaving}
                            fullWidth
                          />

                          <TextField
                            label="Address line 2"
                            value={editBillLine2}
                            onChange={(e) => setEditBillLine2(e.target.value)}
                            disabled={!canEditCustomer || editSaving}
                            fullWidth
                          />

                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: {
                                xs: "1fr",
                                sm: "repeat(3, minmax(0, 1fr))",
                              },
                              gap: 2,
                            }}
                          >
                            <TextField
                              label="City"
                              value={editBillCity}
                              onChange={(e) => setEditBillCity(e.target.value)}
                              disabled={!canEditCustomer || editSaving}
                              fullWidth
                            />

                            <TextField
                              label="State"
                              value={editBillState}
                              onChange={(e) => setEditBillState(e.target.value)}
                              disabled={!canEditCustomer || editSaving}
                              fullWidth
                            />

                            <TextField
                              label="Postal code"
                              value={editBillPostal}
                              onChange={(e) => setEditBillPostal(e.target.value)}
                              disabled={!canEditCustomer || editSaving}
                              fullWidth
                            />
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Box>
                </SectionCard>
              ) : null}

              <SectionCard
                title="Service locations"
                subtitle="Manage the physical service addresses used for tickets, dispatch, and future property-level history."
                action={
                  <Button
                    variant="contained"
                    startIcon={<AddHomeRoundedIcon />}
                    onClick={() => {
                      resetServiceAddressForm();
                      setShowAddServiceAddress(true);
                    }}
                    sx={{ borderRadius: 99, fontWeight: 700, boxShadow: "none" }}
                  >
                    Add Service Location
                  </Button>
                }
              >
                {activeServiceAddresses.length === 0 ? (
                  <EmptyMiniState
                    icon={<HomeWorkRoundedIcon sx={{ fontSize: 28 }} />}
                    title="No service locations yet"
                    description="Add a service location for the home, rental property, shop, or other physical address where work is performed."
                  />
                ) : (
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                      gap: 2,
                    }}
                  >
                    {activeServiceAddresses.map((addr) => {
                      const fullAddr = buildInlineAddress(
                        addr.addressLine1,
                        addr.addressLine2,
                        addr.city,
                        addr.state,
                        addr.postalCode
                      );
                      const maps = fullAddr ? buildMapsUrl(fullAddr) : "";

                      return (
                        <Card
                          key={addr.id}
                          elevation={0}
                          sx={{
                            borderRadius: 4,
                            border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                          }}
                        >
                          <CardContent sx={{ p: 2 }}>
                            <Stack spacing={1.5}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                justifyContent="space-between"
                                alignItems={{ xs: "flex-start", sm: "center" }}
                              >
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Chip
                                    label={addr.label || "Service Address"}
                                    color="primary"
                                    variant="outlined"
                                    sx={{ borderRadius: 99 }}
                                  />
                                  {addr.isPrimary ? (
                                    <Chip
                                      label="Primary"
                                      color="success"
                                      variant="filled"
                                      sx={{ borderRadius: 99 }}
                                    />
                                  ) : null}
                                  {addr.source ? (
                                    <Chip
                                      label={addr.source}
                                      variant="outlined"
                                      sx={{ borderRadius: 99, textTransform: "capitalize" }}
                                    />
                                  ) : null}
                                </Stack>

                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                  {maps ? (
                                    <Button
                                      component="a"
                                      href={maps}
                                      target="_blank"
                                      rel="noreferrer"
                                      variant="outlined"
                                      size="small"
                                      startIcon={<DirectionsRoundedIcon />}
                                      sx={{ borderRadius: 99, fontWeight: 700 }}
                                    >
                                      Maps
                                    </Button>
                                  ) : null}

                                  <Button
                                    variant="outlined"
                                    color="error"
                                    size="small"
                                    startIcon={<DeleteOutlineRoundedIcon />}
                                    onClick={() => {
                                      setDeleteAddressError("");
                                      setDeleteAddressTargetId(addr.id);
                                    }}
                                    sx={{ borderRadius: 99, fontWeight: 700 }}
                                  >
                                    Delete
                                  </Button>
                                </Stack>
                              </Stack>

                              <Divider />

                              <InfoRow
                                icon={<LocationOnRoundedIcon color="action" />}
                                label="Address"
                                primary={fullAddr || "—"}
                                secondary={addr.notes ? `Notes: ${addr.notes}` : undefined}
                              />
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                )}
              </SectionCard>

              <SectionCard
                title="Related work"
                subtitle="All service tickets and projects related to this customer."
              >
                {relatedError ? (
                  <Alert severity="error" sx={{ borderRadius: 4 }}>
                    {relatedError}
                  </Alert>
                ) : null}

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", xl: "repeat(2, minmax(0, 1fr))" },
                    gap: 2,
                  }}
                >
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 4,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={2}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            Service Tickets
                          </Typography>
                          <Chip
                            label={relatedLoading ? "…" : `${relatedTickets.length}`}
                            variant="outlined"
                            sx={{ borderRadius: 99, fontWeight: 700 }}
                          />
                        </Stack>

                        {relatedLoading ? (
                          <Stack spacing={1.25}>
                            <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
                            <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
                            <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
                          </Stack>
                        ) : relatedTickets.length === 0 ? (
                          <EmptyMiniState
                            icon={<DescriptionRoundedIcon sx={{ fontSize: 26 }} />}
                            title="No service tickets yet"
                            description="Service tickets created for this customer will appear here."
                          />
                        ) : (
                          <Stack spacing={1.5}>
                            {relatedTickets.map((ticket) => {
                              const opensModal = isHistoricalTicketStatus(ticket.status);

                              return (
                                <Card
                                  key={ticket.id}
                                  elevation={0}
                                  onClick={() => handleRelatedTicketClick(ticket)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      handleRelatedTicketClick(ticket);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  sx={{
                                    borderRadius: 4,
                                    border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                                    cursor: "pointer",
                                    transition: "border-color 160ms ease, transform 160ms ease",
                                    "&:hover": {
                                      borderColor: alpha(theme.palette.primary.main, 0.28),
                                      transform: "translateY(-1px)",
                                    },
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
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography
                                            variant="subtitle2"
                                            sx={{ fontWeight: 800, wordBreak: "break-word" }}
                                          >
                                            {ticket.issueSummary || "Untitled ticket"}
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary">
                                            Ticket ID: {ticket.id}
                                          </Typography>
                                        </Box>

                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                          <Chip
                                            label={formatStatusLabel(ticket.status)}
                                            color="primary"
                                            variant="outlined"
                                            sx={{ borderRadius: 99 }}
                                          />
                                          <Chip
                                            icon={
                                              opensModal ? (
                                                <VisibilityRoundedIcon sx={{ fontSize: 16 }} />
                                              ) : (
                                                <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
                                              )
                                            }
                                            label={opensModal ? "Quick view" : "Open ticket"}
                                            variant="outlined"
                                            sx={{ borderRadius: 99 }}
                                          />
                                        </Stack>
                                      </Stack>

                                      <Typography variant="body2" color="text.secondary">
                                        {ticket.serviceAddressLabel || ticket.serviceAddressLine1
                                          ? `${ticket.serviceAddressLabel || "Address"}${
                                              ticket.serviceAddressLine1
                                                ? ` — ${ticket.serviceAddressLine1}`
                                                : ""
                                            }`
                                          : "No address label"}
                                      </Typography>

                                      {ticket.assignedTechnicianName ? (
                                        <Typography variant="body2" color="text.secondary">
                                          Assigned: {ticket.assignedTechnicianName}
                                        </Typography>
                                      ) : null}

                                      <Typography variant="caption" color="text.secondary">
                                        Created: {formatDateTime(ticket.createdAt)}
                                      </Typography>
                                    </Stack>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 4,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Stack spacing={2}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            Projects
                          </Typography>
                          <Chip
                            label={relatedLoading ? "…" : `${relatedProjects.length}`}
                            variant="outlined"
                            sx={{ borderRadius: 99, fontWeight: 700 }}
                          />
                        </Stack>

                        {relatedLoading ? (
                          <Stack spacing={1.25}>
                            <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
                            <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
                            <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
                          </Stack>
                        ) : relatedProjects.length === 0 ? (
                          <EmptyMiniState
                            icon={<HomeWorkRoundedIcon sx={{ fontSize: 26 }} />}
                            title="No projects yet"
                            description="Projects created for this customer will appear here."
                          />
                        ) : (
                          <Stack spacing={1.5}>
                            {relatedProjects.map((project) => {
                              const opensModal = isHistoricalProjectStatus(project.status);

                              return (
                                <Card
                                  key={project.id}
                                  elevation={0}
                                  onClick={() => handleRelatedProjectClick(project)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      handleRelatedProjectClick(project);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  sx={{
                                    borderRadius: 4,
                                    border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                                    cursor: "pointer",
                                    transition: "border-color 160ms ease, transform 160ms ease",
                                    "&:hover": {
                                      borderColor: alpha(theme.palette.primary.main, 0.28),
                                      transform: "translateY(-1px)",
                                    },
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
                                        <Box sx={{ minWidth: 0 }}>
                                          <Typography
                                            variant="subtitle2"
                                            sx={{ fontWeight: 800, wordBreak: "break-word" }}
                                          >
                                            {project.projectName}
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary">
                                            Project ID: {project.id}
                                          </Typography>
                                        </Box>

                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                          <Chip
                                            label={formatStatusLabel(project.status)}
                                            color="primary"
                                            variant="outlined"
                                            sx={{ borderRadius: 99 }}
                                          />
                                          {project.projectType ? (
                                            <Chip
                                              label={formatStatusLabel(project.projectType)}
                                              variant="outlined"
                                              sx={{ borderRadius: 99 }}
                                            />
                                          ) : null}
                                          <Chip
                                            icon={
                                              opensModal ? (
                                                <VisibilityRoundedIcon sx={{ fontSize: 16 }} />
                                              ) : (
                                                <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
                                              )
                                            }
                                            label={opensModal ? "Quick view" : "Open project"}
                                            variant="outlined"
                                            sx={{ borderRadius: 99 }}
                                          />
                                        </Stack>
                                      </Stack>

                                      {project.locationLabel ? (
                                        <Typography variant="body2" color="text.secondary">
                                          {project.locationLabel}
                                        </Typography>
                                      ) : null}

                                      {project.assignedLeadName ? (
                                        <Typography variant="body2" color="text.secondary">
                                          Lead: {project.assignedLeadName}
                                        </Typography>
                                      ) : null}

                                      <Typography variant="caption" color="text.secondary">
                                        Created: {formatDateTime(project.createdAt)}
                                      </Typography>
                                    </Stack>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>
              </SectionCard>
            </Stack>
          ) : null}
        </Box>

        <Dialog
          open={showCreateTicket}
          onClose={() => !ticketSaving && setShowCreateTicket(false)}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>Create Service Ticket</DialogTitle>
          <DialogContent dividers>
            {!canCreateTicket ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Only Admin, Dispatcher, and Manager roles can create service tickets.
              </Alert>
            ) : (
              <Box
                component="form"
                id="create-ticket-form"
                onSubmit={handleCreateServiceTicket}
                sx={{ display: "grid", gap: 2, pt: 0.5 }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
                    gap: 2,
                  }}
                >
                  <TextField
                    label="Issue summary"
                    value={issueSummary}
                    onChange={(e) => setIssueSummary(e.target.value)}
                    required
                    fullWidth
                    placeholder='Example: "Clogged kitchen sink"'
                  />

                  <TextField
                    label="Estimated duration (minutes)"
                    type="number"
                    inputProps={{ min: 1 }}
                    value={estimatedDurationMinutes}
                    onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
                    fullWidth
                  />
                </Box>

                <TextField
                  label="Issue details"
                  value={issueDetails}
                  onChange={(e) => setIssueDetails(e.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                  placeholder="Helpful details for dispatch and technician notes…"
                />

                <FormControl fullWidth>
                  <InputLabel id="ticket-address-label">Address for this ticket</InputLabel>
                  <Select
                    labelId="ticket-address-label"
                    value={selectedAddressKey}
                    label="Address for this ticket"
                    onChange={(e) => setSelectedAddressKey(String(e.target.value))}
                  >
                    {addressChoices.length === 0 ? (
                      <MenuItem value="">No addresses found</MenuItem>
                    ) : (
                      addressChoices.map((a) => (
                        <MenuItem key={a.key} value={a.key}>
                          {a.label} — {a.addressLine1}, {a.city}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>

                {(() => {
                  const a = getAddressFromKey(selectedAddressKey);
                  if (!a) return null;

                  return (
                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 3,
                        p: 2,
                        bgcolor: "action.hover",
                        border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Using address
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {buildInlineAddress(
                          a.addressLine1,
                          a.addressLine2,
                          a.city,
                          a.state,
                          a.postalCode
                        )}
                      </Typography>
                    </Paper>
                  );
                })()}

                {ticketError ? (
                  <Alert severity="error" sx={{ borderRadius: 3 }}>
                    {ticketError}
                  </Alert>
                ) : null}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => setShowCreateTicket(false)}
              disabled={ticketSaving}
              sx={{ borderRadius: 99, fontWeight: 700 }}
            >
              Cancel
            </Button>
            {canCreateTicket ? (
              <Button
                type="submit"
                form="create-ticket-form"
                variant="contained"
                startIcon={<DescriptionRoundedIcon />}
                disabled={ticketSaving}
                sx={{ borderRadius: 99, fontWeight: 700, boxShadow: "none" }}
              >
                {ticketSaving ? "Creating..." : "Create Ticket"}
              </Button>
            ) : null}
          </DialogActions>
        </Dialog>

        <Dialog
          open={showAddServiceAddress}
          onClose={() => {
            if (!savingAddress) {
              setShowAddServiceAddress(false);
              resetServiceAddressForm();
            }
          }}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>Add Service Location</DialogTitle>
          <DialogContent dividers>
            <Box
              component="form"
              id="add-service-address-form"
              onSubmit={handleAddServiceAddress}
              sx={{ display: "grid", gap: 2, pt: 0.5 }}
            >
              <TextField
                label="Label"
                value={serviceLabel}
                onChange={(e) => setServiceLabel(e.target.value)}
                fullWidth
                placeholder="Home, Rental House, Shop, Weekend House..."
              />

              <AddressAutocompleteField
                label="Search address"
                value={serviceAddressSearch}
                onChange={(value) => {
                  setServiceAddressSearch(value);
                  markServiceAddressManual();
                }}
                onSelectAddress={handleServiceGoogleAddressSelected}
                helperText="Start typing to search for a real address, or keep entering it manually below."
                placeholder="Start typing a service address..."
                disabled={savingAddress}
              />

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  label={
                    serviceAddressSource === "google_places" ? "Google suggested" : "Manual entry"
                  }
                  color={serviceAddressSource === "google_places" ? "primary" : "default"}
                  variant={serviceAddressSource === "google_places" ? "filled" : "outlined"}
                  sx={{ borderRadius: 99, fontWeight: 700 }}
                />
              </Stack>

              <TextField
                label="Address line 1"
                value={serviceAddressLine1}
                onChange={(e) => {
                  setServiceAddressLine1(e.target.value);
                  markServiceAddressManual();
                }}
                required
                fullWidth
              />

              <TextField
                label="Address line 2"
                value={serviceAddressLine2}
                onChange={(e) => {
                  setServiceAddressLine2(e.target.value);
                  markServiceAddressManual();
                }}
                fullWidth
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
                  value={serviceCity}
                  onChange={(e) => {
                    setServiceCity(e.target.value);
                    markServiceAddressManual();
                  }}
                  required
                  fullWidth
                />

                <TextField
                  label="State"
                  value={serviceState}
                  onChange={(e) => {
                    setServiceState(e.target.value);
                    markServiceAddressManual();
                  }}
                  required
                  fullWidth
                />

                <TextField
                  label="Postal code"
                  value={servicePostalCode}
                  onChange={(e) => {
                    setServicePostalCode(e.target.value);
                    markServiceAddressManual();
                  }}
                  required
                  fullWidth
                />
              </Box>

              <TextField
                label="Notes"
                value={serviceNotes}
                onChange={(e) => setServiceNotes(e.target.value)}
                multiline
                minRows={3}
                fullWidth
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={serviceIsPrimary}
                    onChange={(e) => setServiceIsPrimary(e.target.checked)}
                  />
                }
                label="Set as primary service address"
              />

              {serviceAddressError ? (
                <Alert severity="error" sx={{ borderRadius: 3 }}>
                  {serviceAddressError}
                </Alert>
              ) : null}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => {
                setShowAddServiceAddress(false);
                resetServiceAddressForm();
              }}
              disabled={savingAddress}
              sx={{ borderRadius: 99, fontWeight: 700 }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-service-address-form"
              variant="contained"
              startIcon={<AddHomeRoundedIcon />}
              disabled={savingAddress}
              sx={{ borderRadius: 99, fontWeight: 700, boxShadow: "none" }}
            >
              {savingAddress ? "Saving..." : "Add Service Location"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(deleteAddressTargetId)}
          onClose={() => {
            if (!deleteAddressSaving) {
              setDeleteAddressTargetId(null);
              setDeleteAddressError("");
            }
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Delete Service Location</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body1">
                Remove this service location from active use?
              </Typography>

              {deleteAddressTarget ? (
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    p: 2,
                    bgcolor: "action.hover",
                    border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    {deleteAddressTarget.label || "Service Address"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {buildInlineAddress(
                      deleteAddressTarget.addressLine1,
                      deleteAddressTarget.addressLine2,
                      deleteAddressTarget.city,
                      deleteAddressTarget.state,
                      deleteAddressTarget.postalCode
                    )}
                  </Typography>
                  {deleteAddressTarget.isPrimary ? (
                    <Chip
                      label="Primary"
                      color="success"
                      size="small"
                      sx={{ mt: 1, borderRadius: 99 }}
                    />
                  ) : null}
                </Paper>
              ) : null}

              <Typography variant="body2" color="text.secondary">
                This will soft-delete the address by marking it inactive so old records can still
                retain their historical reference.
              </Typography>

              {deleteAddressError ? (
                <Alert severity="error" sx={{ borderRadius: 3 }}>
                  {deleteAddressError}
                </Alert>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => {
                setDeleteAddressTargetId(null);
                setDeleteAddressError("");
              }}
              disabled={deleteAddressSaving}
              sx={{ borderRadius: 99, fontWeight: 700 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteOutlineRoundedIcon />}
              onClick={handleDeleteServiceAddress}
              disabled={deleteAddressSaving}
              sx={{ borderRadius: 99, fontWeight: 700, boxShadow: "none" }}
            >
              {deleteAddressSaving ? "Deleting..." : "Delete Service Location"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(relatedPreviewModal)}
          onClose={() => setRelatedPreviewModal(null)}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>
            {relatedPreviewModal?.kind === "ticket"
              ? "Service Ticket Details"
              : relatedPreviewModal?.kind === "project"
              ? "Project Details"
              : "Details"}
          </DialogTitle>
          <DialogContent dividers>
            {relatedPreviewModal?.kind === "ticket" ? (
              <Stack spacing={2.25}>
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    p: 2,
                    bgcolor: "action.hover",
                    border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                  }}
                >
                  <Stack spacing={1}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      {relatedPreviewModal.item.issueSummary || "Untitled ticket"}
                    </Typography>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={`Ticket ID: ${relatedPreviewModal.item.id}`}
                        variant="outlined"
                        sx={{ borderRadius: 99 }}
                      />
                      <Chip
                        label={formatStatusLabel(relatedPreviewModal.item.status)}
                        color="primary"
                        variant="outlined"
                        sx={{ borderRadius: 99 }}
                      />
                    </Stack>
                  </Stack>
                </Paper>

                <InfoRow
                  icon={<LocationOnRoundedIcon color="action" />}
                  label="Address"
                  primary={
                    relatedPreviewModal.item.serviceAddressLabel ||
                    relatedPreviewModal.item.serviceAddressLine1 ||
                    "—"
                  }
                  secondary={
                    relatedPreviewModal.item.serviceAddressLabel &&
                    relatedPreviewModal.item.serviceAddressLine1
                      ? relatedPreviewModal.item.serviceAddressLine1
                      : undefined
                  }
                />

                <InfoRow
                  icon={<TaskAltRoundedIcon color="action" />}
                  label="Assigned technician"
                  primary={relatedPreviewModal.item.assignedTechnicianName || "—"}
                />

                <InfoRow
                  icon={<DescriptionRoundedIcon color="action" />}
                  label="Details"
                  primary={relatedPreviewModal.item.issueDetails || "No additional details."}
                />

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                    gap: 2,
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Created
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                      {formatDateTime(relatedPreviewModal.item.createdAt)}
                    </Typography>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Last updated
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                      {formatDateTime(relatedPreviewModal.item.updatedAt)}
                    </Typography>
                  </Paper>
                </Box>
              </Stack>
            ) : relatedPreviewModal?.kind === "project" ? (
              <Stack spacing={2.25}>
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    p: 2,
                    bgcolor: "action.hover",
                    border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                  }}
                >
                  <Stack spacing={1}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      {relatedPreviewModal.item.projectName || "Untitled project"}
                    </Typography>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={`Project ID: ${relatedPreviewModal.item.id}`}
                        variant="outlined"
                        sx={{ borderRadius: 99 }}
                      />
                      <Chip
                        label={formatStatusLabel(relatedPreviewModal.item.status)}
                        color="primary"
                        variant="outlined"
                        sx={{ borderRadius: 99 }}
                      />
                      {relatedPreviewModal.item.projectType ? (
                        <Chip
                          label={formatStatusLabel(relatedPreviewModal.item.projectType)}
                          variant="outlined"
                          sx={{ borderRadius: 99 }}
                        />
                      ) : null}
                    </Stack>
                  </Stack>
                </Paper>

                <InfoRow
                  icon={<LocationOnRoundedIcon color="action" />}
                  label="Project location"
                  primary={relatedPreviewModal.item.locationLabel || "—"}
                />

                <InfoRow
                  icon={<TaskAltRoundedIcon color="action" />}
                  label="Lead / assigned"
                  primary={relatedPreviewModal.item.assignedLeadName || "—"}
                />

                <InfoRow
                  icon={<DescriptionRoundedIcon color="action" />}
                  label="Description"
                  primary={relatedPreviewModal.item.description || "No additional details."}
                />

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                    gap: 2,
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Created
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                      {formatDateTime(relatedPreviewModal.item.createdAt)}
                    </Typography>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Last updated
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, mt: 0.5 }}>
                      {formatDateTime(relatedPreviewModal.item.updatedAt)}
                    </Typography>
                  </Paper>
                </Box>
              </Stack>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => setRelatedPreviewModal(null)}
              sx={{ borderRadius: 99, fontWeight: 700 }}
            >
              Close
            </Button>

            {relatedPreviewModal?.kind === "ticket" ? (
              <Button
                component={Link}
                href={`/service-tickets/${relatedPreviewModal.item.id}`}
                variant="outlined"
                startIcon={<OpenInNewRoundedIcon />}
                sx={{ borderRadius: 99, fontWeight: 700 }}
              >
                Open Ticket Page
              </Button>
            ) : null}

            {relatedPreviewModal?.kind === "project" ? (
              <Button
                component={Link}
                href={`/projects/${relatedPreviewModal.item.id}`}
                variant="outlined"
                startIcon={<OpenInNewRoundedIcon />}
                sx={{ borderRadius: 99, fontWeight: 700 }}
              >
                Open Project Page
              </Button>
            ) : null}
          </DialogActions>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}