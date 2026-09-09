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
  where,
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
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import AddressAutocompleteField from "../../../components/AddressAutocompleteField";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { buildCustomerIndexPayload } from "../../../src/lib/customer-search-index";
import type { Customer } from "../../../src/types/customer";

type CustomerDetailPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

type CustomerDetail = Customer & {
  preferredCustomer?: boolean;
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

type NormalizedServiceAddress =
  NonNullable<CustomerDetail["serviceAddresses"]>[number];

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

function safeStr(value: unknown) {
  return String(value ?? "").trim();
}

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
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

  if (isAppleDevice()) {
    return `https://maps.apple.com/?q=${q}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function buildInlineAddress(
  line1?: string,
  line2?: string,
  city?: string,
  state?: string,
  postal?: string
) {
  return [line1, line2, city, state, postal]
    .map((value) => safeStr(value))
    .filter(Boolean)
    .join(", ");
}

function looksLikePoBox(value?: string | null) {
  const normalized = safeStr(value).toLowerCase();

  if (!normalized) return false;

  return (
    /\bp\s*\.?\s*o\s*\.?\s*box\b/.test(normalized) ||
    /\bpost\s+office\s+box\b/.test(normalized) ||
    /\bpo\s+box\b/.test(normalized)
  );
}

function addressLooksLikePoBox(params: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  return looksLikePoBox(
    [
      params.addressLine1,
      params.addressLine2,
      params.city,
      params.state,
      params.postalCode,
    ]
      .map((value) => safeStr(value))
      .filter(Boolean)
      .join(" ")
  );
}

function serviceAddressLooksBillingLike(
  addr: Partial<NormalizedServiceAddress>
) {
  const source = safeStr(addr.source).toLowerCase();
  const label = safeStr(addr.label).toLowerCase();
  const notes = safeStr(addr.notes).toLowerCase();

  return (
    source === "qbo_bill" ||
    source === "billing" ||
    source === "mailing" ||
    label.includes("billing") ||
    label.includes("mailing") ||
    notes.includes("billing address") ||
    notes.includes("mailing address")
  );
}

function isUsableServiceAddress(
  addr: Partial<NormalizedServiceAddress>
) {
  if (addr.active === false) return false;
  if (serviceAddressLooksBillingLike(addr)) return false;

  const addressLine1 = safeStr(addr.addressLine1);

  if (!addressLine1) return false;

  return !addressLooksLikePoBox({
    addressLine1,
    addressLine2: addr.addressLine2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
  });
}

function formatDateTime(value?: string) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

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
  const value = normalizeStatus(status);

  return new Set([
    "completed",
    "cancelled",
    "canceled",
    "closed",
    "invoiced",
    "resolved",
    "done",
  ]).has(value);
}

function isHistoricalProjectStatus(status?: string) {
  const value = normalizeStatus(status);

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
  ]).has(value);
}

function getLinkedQboId(
  rawCustomer: any,
  customer: CustomerDetail | null
) {
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

        <Typography
          variant="body1"
          sx={{
            fontWeight: 700,
            wordBreak: "break-word",
          }}
        >
          {props.primary || "—"}
        </Typography>

        {props.secondary ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
              wordBreak: "break-word",
            }}
          >
            {props.secondary}
          </Typography>
        ) : null}
      </Box>

      {props.action ? (
        <Box sx={{ flexShrink: 0 }}>
          {props.action}
        </Box>
      ) : null}
    </Stack>
  );
}

function SectionCard(props: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  preferred?: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${
          props.preferred
            ? alpha(theme.palette.success.main, 0.38)
            : alpha(theme.palette.divider, 0.8)
        }`,
        background: props.preferred
          ? `linear-gradient(
              180deg,
              ${alpha(theme.palette.success.main, 0.055)} 0%,
              ${alpha(theme.palette.background.paper, 1)} 40%
            )`
          : undefined,
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{
              xs: "flex-start",
              sm: "center",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h6"
                sx={{ fontWeight: 800 }}
              >
                {props.title}
              </Typography>

              {props.subtitle ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  {props.subtitle}
                </Typography>
              ) : null}
            </Box>

            {props.action ? (
              <Box sx={{ flexShrink: 0 }}>
                {props.action}
              </Box>
            ) : null}
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
        borderRadius: 1,
        p: 3,
        border: (theme) =>
          `1px dashed ${alpha(theme.palette.divider, 0.9)}`,
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

        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 800 }}
        >
          {props.title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 520 }}
        >
          {props.description}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
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
  const [customer, setCustomer] =
    useState<CustomerDetail | null>(null);
  const [rawCustomer, setRawCustomer] =
    useState<any>(null);
  const [error, setError] = useState("");

  const [isEditMode, setIsEditMode] =
    useState(false);

  const [showCreateTicket, setShowCreateTicket] =
    useState(false);
  const [
    showAddServiceAddress,
    setShowAddServiceAddress,
  ] = useState(false);

  const [editSaving, setEditSaving] =
    useState(false);
  const [editErr, setEditErr] = useState("");
  const [editOk, setEditOk] = useState("");

  const [editDisplayName, setEditDisplayName] =
    useState("");
  const [editPhonePrimary, setEditPhonePrimary] =
    useState("");
  const [
    editPhoneSecondary,
    setEditPhoneSecondary,
  ] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [editBillLine1, setEditBillLine1] =
    useState("");
  const [editBillLine2, setEditBillLine2] =
    useState("");
  const [editBillCity, setEditBillCity] =
    useState("");
  const [editBillState, setEditBillState] =
    useState("");
  const [editBillPostal, setEditBillPostal] =
    useState("");

  const [editActive, setEditActive] =
    useState(true);
  const [
    editPreferredCustomer,
    setEditPreferredCustomer,
  ] = useState(false);

  const [qboSyncing, setQboSyncing] =
    useState(false);
  const [qboSyncErr, setQboSyncErr] =
    useState("");
  const [qboSyncOk, setQboSyncOk] =
    useState("");

  const [savingAddress, setSavingAddress] =
    useState(false);
  const [
    serviceAddressError,
    setServiceAddressError,
  ] = useState("");

  const [serviceLabel, setServiceLabel] =
    useState("");
  const [
    serviceAddressSearch,
    setServiceAddressSearch,
  ] = useState("");
  const [
    serviceAddressLine1,
    setServiceAddressLine1,
  ] = useState("");
  const [
    serviceAddressLine2,
    setServiceAddressLine2,
  ] = useState("");
  const [serviceCity, setServiceCity] =
    useState("");
  const [serviceState, setServiceState] =
    useState("");
  const [
    servicePostalCode,
    setServicePostalCode,
  ] = useState("");
  const [serviceNotes, setServiceNotes] =
    useState("");
  const [
    serviceIsPrimary,
    setServiceIsPrimary,
  ] = useState(false);
  const [
    serviceAddressSource,
    setServiceAddressSource,
  ] = useState<string>("manual");

  const [
    deleteAddressTargetId,
    setDeleteAddressTargetId,
  ] = useState<string | null>(null);
  const [
    deleteAddressError,
    setDeleteAddressError,
  ] = useState("");
  const [
    deleteAddressSaving,
    setDeleteAddressSaving,
  ] = useState(false);

  const [relatedLoading, setRelatedLoading] =
    useState(true);
  const [relatedError, setRelatedError] =
    useState("");
  const [relatedTickets, setRelatedTickets] =
    useState<RelatedServiceTicket[]>([]);
  const [relatedProjects, setRelatedProjects] =
    useState<RelatedProject[]>([]);
  const [
    relatedPreviewModal,
    setRelatedPreviewModal,
  ] = useState<RelatedPreviewModalState>(null);

  const [ticketSaving, setTicketSaving] =
    useState(false);
  const [ticketError, setTicketError] =
    useState("");
  const [issueSummary, setIssueSummary] =
    useState("");
  const [issueDetails, setIssueDetails] =
    useState("");
  const [
    estimatedDurationHours,
    setEstimatedDurationHours,
  ] = useState("1");
  const [
    selectedAddressKey,
    setSelectedAddressKey,
  ] = useState("");
  const [
    returnToCreateTicketAfterAddressSave,
    setReturnToCreateTicketAfterAddressSave,
  ] = useState(false);

  useEffect(() => {
    async function loadCustomer() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.customerId;

        setCustomerId(id);

        const customerRef = doc(
          db,
          "customers",
          id
        );

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
          safeStr(
            (data as any).customerDisplayName
          ) ||
          safeStr((data as any).qboDisplayName) ||
          "";

        const phonePrimary =
          safeStr((data as any).phonePrimary) ||
          safeStr((data as any).phone) ||
          "";

        const phoneSecondary =
          safeStr(
            (data as any).phoneSecondary
          ) || "";

        const email =
          safeStr((data as any).email) || "";

        const billingAddressLine1 =
          safeStr(
            (data as any).billingAddressLine1
          ) ||
          safeStr(
            (data as any).billAddrLine1
          ) ||
          "";

        const billingAddressLine2 =
          safeStr(
            (data as any).billingAddressLine2
          ) ||
          safeStr(
            (data as any).billAddrLine2
          ) ||
          safeStr(
            (data as any).billAddrLine3
          ) ||
          "";

        const billingCity =
          safeStr(
            (data as any).billingCity
          ) ||
          safeStr(
            (data as any).billAddrCity
          ) ||
          "";

        const billingState =
          safeStr(
            (data as any).billingState
          ) ||
          safeStr(
            (data as any).billAddrState
          ) ||
          "";

        const billingPostalCode =
          safeStr(
            (data as any).billingPostalCode
          ) ||
          safeStr(
            (data as any).billAddrPostalCode
          ) ||
          "";

        const item: CustomerDetail = {
          id: snap.id,

          quickbooksCustomerId:
            (data as any)
              .quickbooksCustomerId ??
            (data as any).qboCustomerId ??
            undefined,

          quickbooksSyncStatus:
            (data as any)
              .quickbooksSyncStatus ??
            (data as any).qboSyncStatus ??
            undefined,

          lastQuickbooksSyncAt:
            (data as any)
              .lastQuickbooksSyncAt ??
            (data as any).qboLastSyncedAt ??
            undefined,

          quickbooksLastError:
            (data as any)
              .quickbooksLastError ??
            (data as any)
              .qboLastSyncError ??
            undefined,

          source:
            (data as any).source ??
            "dcflow",

          displayName,
          phonePrimary,
          phoneSecondary:
            phoneSecondary || undefined,
          email: email || undefined,

          billingAddressLine1,
          billingAddressLine2:
            billingAddressLine2 || undefined,
          billingCity,
          billingState,
          billingPostalCode,

          serviceAddresses: Array.isArray(
            (data as any).serviceAddresses
          )
            ? (data as any).serviceAddresses.map(
                (addr: any) => ({
                  id:
                    addr.id ??
                    createId(),
                  label:
                    addr.label ??
                    undefined,
                  addressLine1:
                    addr.addressLine1 ??
                    "",
                  addressLine2:
                    addr.addressLine2 ??
                    undefined,
                  city:
                    addr.city ?? "",
                  state:
                    addr.state ?? "",
                  postalCode:
                    addr.postalCode ??
                    "",
                  notes:
                    addr.notes ??
                    undefined,
                  active:
                    addr.active ?? true,
                  isPrimary:
                    addr.isPrimary ??
                    false,
                  source:
                    addr.source ??
                    undefined,
                  createdAt:
                    addr.createdAt ??
                    undefined,
                  updatedAt:
                    addr.updatedAt ??
                    undefined,
                })
              )
            : [],

          notes:
            (data as any).notes ??
            undefined,

          active:
            (data as any).active ??
            true,

          preferredCustomer:
            Boolean(
              (data as any)
                .preferredCustomer
            ),

          createdAt:
            (data as any).createdAt ??
            undefined,

          updatedAt:
            (data as any).updatedAt ??
            undefined,
        };

        setCustomer(item);

        setEditDisplayName(
          item.displayName || ""
        );
        setEditPhonePrimary(
          item.phonePrimary || ""
        );
        setEditPhoneSecondary(
          item.phoneSecondary || ""
        );
        setEditEmail(item.email || "");

        setEditBillLine1(
          item.billingAddressLine1 || ""
        );
        setEditBillLine2(
          item.billingAddressLine2 || ""
        );
        setEditBillCity(
          item.billingCity || ""
        );
        setEditBillState(
          item.billingState || ""
        );
        setEditBillPostal(
          item.billingPostalCode || ""
        );

        setEditActive(
          item.active !== false
        );
        setEditPreferredCustomer(
          Boolean(
            item.preferredCustomer
          )
        );
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load customer."
        );
      } finally {
        setLoading(false);
      }
    }

    loadCustomer();
  }, [params]);

  useEffect(() => {
    async function loadRelatedWork() {
      try {
        setRelatedLoading(true);
        setRelatedError("");

        const resolvedParams =
          await params;

        const id =
          resolvedParams.customerId;

        const ticketQuery = query(
          collection(
            db,
            "serviceTickets"
          ),
          where(
            "customerId",
            "==",
            id
          ),
          orderBy(
            "createdAt",
            "desc"
          )
        );

        const projectQuery = query(
          collection(
            db,
            "projects"
          ),
          where(
            "customerId",
            "==",
            id
          ),
          orderBy(
            "createdAt",
            "desc"
          )
        );

        const [
          ticketSnap,
          projectSnap,
        ] = await Promise.all([
          getDocs(ticketQuery),
          getDocs(projectQuery),
        ]);

        const ticketItems: RelatedServiceTicket[] =
          ticketSnap.docs.map(
            (docSnap) => {
              const data =
                docSnap.data() as any;

              return {
                id: docSnap.id,

                status:
                  safeStr(
                    data.status
                  ) || "unknown",

                issueSummary:
                  safeStr(
                    data.issueSummary
                  ) ||
                  "Untitled ticket",

                issueDetails:
                  safeStr(
                    data.issueDetails
                  ) || undefined,

                serviceAddressLabel:
                  safeStr(
                    data.serviceAddressLabel
                  ) || undefined,

                serviceAddressLine1:
                  safeStr(
                    data.serviceAddressLine1
                  ) || undefined,

                assignedTechnicianName:
                  safeStr(
                    data.assignedTechnicianName
                  ) ||
                  safeStr(
                    data.primaryTechnicianName
                  ) ||
                  undefined,

                createdAt:
                  safeStr(
                    data.createdAt
                  ) || undefined,

                updatedAt:
                  safeStr(
                    data.updatedAt
                  ) || undefined,

                active:
                  data.active ?? true,
              };
            }
          );

        const projectItems: RelatedProject[] =
          projectSnap.docs.map(
            (docSnap) => {
              const data =
                docSnap.data() as any;

              const locationLabel =
                buildInlineAddress(
                  safeStr(
                    data.serviceAddressLine1
                  ) ||
                    safeStr(
                      data.addressLine1
                    ) ||
                    safeStr(
                      data.siteAddressLine1
                    ),

                  safeStr(
                    data.serviceAddressLine2
                  ) ||
                    safeStr(
                      data.addressLine2
                    ) ||
                    safeStr(
                      data.siteAddressLine2
                    ),

                  safeStr(
                    data.serviceCity
                  ) ||
                    safeStr(
                      data.city
                    ) ||
                    safeStr(
                      data.siteCity
                    ),

                  safeStr(
                    data.serviceState
                  ) ||
                    safeStr(
                      data.state
                    ) ||
                    safeStr(
                      data.siteState
                    ),

                  safeStr(
                    data.servicePostalCode
                  ) ||
                    safeStr(
                      data.postalCode
                    ) ||
                    safeStr(
                      data.sitePostalCode
                    )
                );

              return {
                id: docSnap.id,

                projectName:
                  safeStr(
                    data.projectName
                  ) ||
                  safeStr(
                    data.title
                  ) ||
                  safeStr(
                    data.displayName
                  ) ||
                  safeStr(
                    data.name
                  ) ||
                  `Project ${docSnap.id}`,

                projectType:
                  safeStr(
                    data.projectType
                  ) ||
                  safeStr(
                    data.type
                  ) ||
                  safeStr(
                    data.projectKind
                  ) ||
                  undefined,

                status:
                  safeStr(
                    data.status
                  ) ||
                  safeStr(
                    data.projectStatus
                  ) ||
                  safeStr(
                    data.workflowStatus
                  ) ||
                  "unknown",

                locationLabel:
                  locationLabel ||
                  undefined,

                assignedLeadName:
                  safeStr(
                    data.projectManagerName
                  ) ||
                  safeStr(
                    data.assignedLeadName
                  ) ||
                  safeStr(
                    data.primaryTechName
                  ) ||
                  undefined,

                description:
                  safeStr(
                    data.projectDescription
                  ) ||
                  safeStr(
                    data.description
                  ) ||
                  safeStr(
                    data.scopeSummary
                  ) ||
                  safeStr(
                    data.notes
                  ) ||
                  undefined,

                createdAt:
                  safeStr(
                    data.createdAt
                  ) || undefined,

                updatedAt:
                  safeStr(
                    data.updatedAt
                  ) || undefined,

                active:
                  data.active ?? true,
              };
            }
          );

        setRelatedTickets(
          ticketItems
        );

        setRelatedProjects(
          projectItems
        );
      } catch (err: unknown) {
        setRelatedError(
          err instanceof Error
            ? err.message
            : "Failed to load related work."
        );
      } finally {
        setRelatedLoading(false);
      }
    }

    loadRelatedWork();
  }, [params]);

  const preferredCustomer =
    Boolean(
      customer?.preferredCustomer
    );

  const activeTickets =
    useMemo(() => {
      return relatedTickets.filter(
        (ticket) =>
          ticket.active !== false &&
          !isHistoricalTicketStatus(
            ticket.status
          )
      );
    }, [relatedTickets]);

  const historicalTickets =
    useMemo(() => {
      return relatedTickets
        .filter((ticket) =>
          isHistoricalTicketStatus(
            ticket.status
          )
        )
        .slice(0, 5);
    }, [relatedTickets]);

  const activeProjects =
    useMemo(() => {
      return relatedProjects.filter(
        (project) =>
          project.active !== false &&
          !isHistoricalProjectStatus(
            project.status
          )
      );
    }, [relatedProjects]);

  const historicalProjects =
    useMemo(() => {
      return relatedProjects
        .filter((project) =>
          isHistoricalProjectStatus(
            project.status
          )
        )
        .slice(0, 5);
    }, [relatedProjects]);

  const activeWorkCount =
    activeTickets.length +
    activeProjects.length;

  const completedWorkCount =
    relatedTickets.filter((ticket) =>
      isHistoricalTicketStatus(
        ticket.status
      )
    ).length +
    relatedProjects.filter((project) =>
      isHistoricalProjectStatus(
        project.status
      )
    ).length;

  const addressChoices =
    useMemo((): AddressChoice[] => {
      if (!customer) return [];

      const services =
        (
          customer.serviceAddresses ||
          []
        )
          .filter((address) =>
            isUsableServiceAddress(
              address
            )
          )
          .map((address) => ({
            key: `service:${address.id}`,

            label: `${
              address.label ||
              "Service Address"
            }${
              address.isPrimary
                ? " (Primary)"
                : ""
            }`,

            addressLine1:
              address.addressLine1 ||
              "",

            addressLine2:
              address.addressLine2 ||
              undefined,

            city:
              address.city || "",

            state:
              address.state || "",

            postalCode:
              address.postalCode ||
              "",

            source:
              "service" as const,

            isPrimary:
              Boolean(
                address.isPrimary
              ),
          })) || [];

      services.sort(
        (a, b) =>
          Number(
            Boolean(b.isPrimary)
          ) -
            Number(
              Boolean(a.isPrimary)
            ) ||
          a.label.localeCompare(
            b.label
          )
      );

      return services;
    }, [customer]);

  useEffect(() => {
    if (
      !addressChoices.length
    ) {
      if (selectedAddressKey) {
        setSelectedAddressKey("");
      }

      return;
    }

    const stillValid =
      addressChoices.some(
        (address) =>
          address.key ===
          selectedAddressKey
      );

    if (!stillValid) {
      const primary =
        addressChoices.find(
          (address) =>
            address.isPrimary
        );

      setSelectedAddressKey(
        primary?.key ||
          addressChoices[0].key
      );
    }
  }, [
    addressChoices,
    selectedAddressKey,
  ]);

  function getAddressFromKey(
    key: string
  ): AddressChoice | null {
    return (
      addressChoices.find(
        (address) =>
          address.key === key
      ) || null
    );
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
    setServiceAddressSource(
      "manual"
    );
    setServiceAddressError("");
  }

  function enterEditMode() {
    if (!customer) return;

    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setIsEditMode(true);

    setEditDisplayName(
      customer.displayName || ""
    );
    setEditPhonePrimary(
      customer.phonePrimary || ""
    );
    setEditPhoneSecondary(
      customer.phoneSecondary || ""
    );
    setEditEmail(
      customer.email || ""
    );

    setEditBillLine1(
      customer.billingAddressLine1 ||
        ""
    );
    setEditBillLine2(
      customer.billingAddressLine2 ||
        ""
    );
    setEditBillCity(
      customer.billingCity || ""
    );
    setEditBillState(
      customer.billingState || ""
    );
    setEditBillPostal(
      customer.billingPostalCode ||
        ""
    );

    setEditActive(
      customer.active !== false
    );

    setEditPreferredCustomer(
      Boolean(
        customer.preferredCustomer
      )
    );
  }

  function cancelEditMode() {
    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setIsEditMode(false);
  }

  function markServiceAddressManual() {
    setServiceAddressSource(
      (current) =>
        current ===
        "google_places"
          ? "manual"
          : current
    );
  }

  function handleServiceGoogleAddressSelected(
    selection: GoogleAddressSelectionLike
  ) {
    setServiceAddressSearch(
      selection.formattedAddress ||
        ""
    );
    setServiceAddressLine1(
      selection.addressLine1 ||
        ""
    );
    setServiceAddressLine2(
      selection.addressLine2 ||
        ""
    );
    setServiceCity(
      selection.city || ""
    );
    setServiceState(
      selection.state || ""
    );
    setServicePostalCode(
      selection.postalCode || ""
    );
    setServiceAddressSource(
      "google_places"
    );
  }

  function handleRelatedTicketClick(
    ticket: RelatedServiceTicket
  ) {
    if (
      isHistoricalTicketStatus(
        ticket.status
      )
    ) {
      setRelatedPreviewModal({
        kind: "ticket",
        item: ticket,
      });

      return;
    }

    router.push(
      `/service-tickets/${ticket.id}`
    );
  }

  function handleRelatedProjectClick(
    project: RelatedProject
  ) {
    if (
      isHistoricalProjectStatus(
        project.status
      )
    ) {
      setRelatedPreviewModal({
        kind: "project",
        item: project,
      });

      return;
    }

    router.push(
      `/projects/${project.id}`
    );
  }

  async function handleCreateQboCustomer() {
    if (!customer) return;

    const alreadyLinked =
      getLinkedQboId(
        rawCustomer,
        customer
      );

    if (alreadyLinked) {
      await handleSyncToQbo({
        updateName: true,
      });

      return;
    }

    setQboSyncErr("");
    setQboSyncOk("");
    setQboSyncing(true);

    try {
      const res = await fetch(
        "/api/qbo/customers/create-from-dcflow",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            dcCustomerId:
              customer.id,
          }),
        }
      );

      const data =
        await res
          .json()
          .catch(() => ({}));

      if (!res.ok) {
        setQboSyncErr(
          data?.error ||
            "Failed to create customer in QuickBooks."
        );

        return;
      }

      const linkedId = safeStr(
        data?.qboCustomerId
      );

      const syncedAt = nowIso();

      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              quickbooksCustomerId:
                linkedId ||
                prev.quickbooksCustomerId,
              quickbooksSyncStatus:
                "synced",
              lastQuickbooksSyncAt:
                syncedAt,
              quickbooksLastError:
                undefined,
            }
          : prev
      );

      setRawCustomer(
        (prev: any) => ({
          ...(prev || {}),

          quickbooksCustomerId:
            linkedId ||
            prev?.quickbooksCustomerId ||
            null,

          qboCustomerId:
            linkedId ||
            prev?.qboCustomerId ||
            null,

          quickbooksSyncStatus:
            "synced",

          qboSyncStatus:
            "synced",

          lastQuickbooksSyncAt:
            syncedAt,

          qboLastSyncedAt:
            syncedAt,

          quickbooksLastError:
            null,

          qboLastSyncError:
            null,

          qboLastSyncIntuitTid:
            data?.intuit_tid || "",

          updatedAt:
            syncedAt,
        })
      );

      setQboSyncOk(
        "Created customer in QuickBooks and linked to DCFlow."
      );
    } catch (err: unknown) {
      setQboSyncErr(
        err instanceof Error
          ? err.message
          : "Failed to create customer in QuickBooks."
      );
    } finally {
      setQboSyncing(false);
    }
  }

  async function handleSyncToQbo(
    opts?: {
      updateName?: boolean;
    }
  ) {
    if (!customer) return;

    const qboLinkedId =
      getLinkedQboId(
        rawCustomer,
        customer
      );

    if (!qboLinkedId) {
      setQboSyncErr(
        "This customer is not linked to QuickBooks yet."
      );

      return;
    }

    setQboSyncErr("");
    setQboSyncOk("");
    setQboSyncing(true);

    try {
      const res = await fetch(
        "/api/qbo/customers/update-from-dcflow",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            dcCustomerId:
              customer.id,
            updateName:
              Boolean(
                opts?.updateName
              ),
          }),
        }
      );

      const data =
        await res
          .json()
          .catch(() => ({}));

      if (!res.ok) {
        setQboSyncErr(
          data?.error ||
            "Failed to sync customer to QuickBooks."
        );

        return;
      }

      const syncedAt = nowIso();

      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              quickbooksSyncStatus:
                "synced",
              lastQuickbooksSyncAt:
                syncedAt,
              quickbooksLastError:
                undefined,
            }
          : prev
      );

      setRawCustomer(
        (prev: any) => ({
          ...(prev || {}),

          quickbooksSyncStatus:
            "synced",

          qboSyncStatus:
            "synced",

          lastQuickbooksSyncAt:
            syncedAt,

          qboLastSyncedAt:
            syncedAt,

          quickbooksLastError:
            null,

          qboLastSyncError:
            null,

          qboLastSyncIntuitTid:
            data?.intuit_tid || "",

          updatedAt:
            syncedAt,
        })
      );

      setQboSyncOk(
        "Synced to QuickBooks."
      );
    } catch (err: unknown) {
      setQboSyncErr(
        err instanceof Error
          ? err.message
          : "Failed to sync to QuickBooks."
      );
    } finally {
      setQboSyncing(false);
    }
  }

  async function handleCreateOrSyncToQbo(
    opts?: {
      updateName?: boolean;
    }
  ) {
    const linked =
      getLinkedQboId(
        rawCustomer,
        customer
      );

    if (linked) {
      await handleSyncToQbo(
        opts
      );

      return;
    }

    await handleCreateQboCustomer();
  }

  async function handleSaveCustomerEdits(
    syncToQboAfter: boolean
  ) {
    if (!customer) return;

    if (!canEditCustomer) {
      setEditErr(
        "You do not have permission to edit customers."
      );

      return;
    }

    setEditErr("");
    setEditOk("");
    setQboSyncErr("");
    setQboSyncOk("");
    setEditSaving(true);

    try {
      const now = nowIso();

      const isAlreadyLinked =
        Boolean(
          getLinkedQboId(
            rawCustomer,
            customer
          )
        );

      const payload: any = {
        displayName:
          safeStr(
            editDisplayName
          ),

        phonePrimary:
          safeStr(
            editPhonePrimary
          ),

        phoneSecondary:
          safeStr(
            editPhoneSecondary
          ) || null,

        email:
          safeStr(editEmail) ||
          null,

        billingAddressLine1:
          safeStr(
            editBillLine1
          ),

        billingAddressLine2:
          safeStr(
            editBillLine2
          ) || null,

        billingCity:
          safeStr(
            editBillCity
          ),

        billingState:
          safeStr(
            editBillState
          ),

        billingPostalCode:
          safeStr(
            editBillPostal
          ),

        active:
          editActive,

        preferredCustomer:
          editPreferredCustomer,

        updatedAt: now,

        customerDisplayName:
          safeStr(
            editDisplayName
          ),

        phone:
          safeStr(
            editPhonePrimary
          ),

        billAddrLine1:
          safeStr(
            editBillLine1
          ),

        billAddrLine2:
          safeStr(
            editBillLine2
          ),

        billAddrCity:
          safeStr(
            editBillCity
          ),

        billAddrState:
          safeStr(
            editBillState
          ),

        billAddrPostalCode:
          safeStr(
            editBillPostal
          ),
      };

      const indexPayload =
        buildCustomerIndexPayload({
          ...(rawCustomer || {}),
          ...customer,
          ...payload,
          serviceAddresses:
            customer.serviceAddresses ??
            [],
        });

      await updateDoc(
        doc(
          db,
          "customers",
          customer.id
        ),
        {
          ...payload,
          ...indexPayload,
        }
      );

      setCustomer((prev) =>
        prev
          ? {
              ...prev,

              displayName:
                safeStr(
                  editDisplayName
                ),

              phonePrimary:
                safeStr(
                  editPhonePrimary
                ),

              phoneSecondary:
                safeStr(
                  editPhoneSecondary
                ) || undefined,

              email:
                safeStr(
                  editEmail
                ) || undefined,

              billingAddressLine1:
                safeStr(
                  editBillLine1
                ),

              billingAddressLine2:
                safeStr(
                  editBillLine2
                ) || undefined,

              billingCity:
                safeStr(
                  editBillCity
                ),

              billingState:
                safeStr(
                  editBillState
                ),

              billingPostalCode:
                safeStr(
                  editBillPostal
                ),

              active:
                editActive,

              preferredCustomer:
                editPreferredCustomer,

              updatedAt:
                now,
            }
          : prev
      );

      setRawCustomer(
        (prev: any) => ({
          ...(prev || {}),
          ...payload,
          ...indexPayload,
        })
      );

      setEditOk(
        syncToQboAfter
          ? isAlreadyLinked
            ? "Saved in DCFlow. Syncing to QuickBooks..."
            : "Saved in DCFlow. Creating customer in QuickBooks..."
          : "Saved in DCFlow."
      );

      setIsEditMode(false);

      if (syncToQboAfter) {
        await handleCreateOrSyncToQbo(
          {
            updateName: true,
          }
        );
      }
    } catch (err: unknown) {
      setEditErr(
        err instanceof Error
          ? err.message
          : "Failed to save customer."
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddServiceAddress(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!customer) return;

    const addressLine1 =
      serviceAddressLine1.trim();

    const city =
      serviceCity.trim();

    const state =
      serviceState.trim();

    const postalCode =
      servicePostalCode.trim();

    if (!addressLine1) {
      setServiceAddressError(
        "Address line 1 is required."
      );

      return;
    }

    if (!city) {
      setServiceAddressError(
        "City is required."
      );

      return;
    }

    if (!state) {
      setServiceAddressError(
        "State is required."
      );

      return;
    }

    if (!postalCode) {
      setServiceAddressError(
        "Postal code is required."
      );

      return;
    }

    if (
      addressLooksLikePoBox({
        addressLine1,
        addressLine2:
          serviceAddressLine2,
        city,
        state,
        postalCode,
      })
    ) {
      setServiceAddressError(
        "PO Box addresses cannot be saved as service locations. Enter the physical address where work will be performed."
      );

      return;
    }

    setServiceAddressError("");
    setSavingAddress(true);

    try {
      const timestamp =
        nowIso();

      const nextAddressForState =
        {
          id: createId(),

          label:
            serviceLabel.trim() ||
            undefined,

          addressLine1,

          addressLine2:
            serviceAddressLine2.trim() ||
            undefined,

          city,
          state,
          postalCode,

          notes:
            serviceNotes.trim() ||
            undefined,

          active: true,

          isPrimary:
            serviceIsPrimary,

          source:
            serviceAddressSource ||
            "manual",

          createdAt:
            timestamp,

          updatedAt:
            timestamp,
        } as NormalizedServiceAddress;

      let existingAddressesForState =
        customer.serviceAddresses ??
        [];

      if (serviceIsPrimary) {
        existingAddressesForState =
          existingAddressesForState.map(
            (address) => ({
              ...address,
              isPrimary: false,
            })
          );
      }

      const updatedAddressesForState =
        [
          ...existingAddressesForState,
          nextAddressForState,
        ];

      const updatedAddressesForFirestore =
        updatedAddressesForState.map(
          (address) => ({
            ...address,

            label:
              address.label ??
              null,

            addressLine2:
              address.addressLine2 ??
              null,

            notes:
              address.notes ??
              null,

            source:
              address.source ??
              null,
          })
        );

      const indexPayload =
        buildCustomerIndexPayload({
          ...(rawCustomer || {}),
          ...customer,

          serviceAddresses:
            updatedAddressesForFirestore,
        });

      await updateDoc(
        doc(
          db,
          "customers",
          customer.id
        ),
        {
          serviceAddresses:
            updatedAddressesForFirestore,

          updatedAt:
            timestamp,

          ...indexPayload,
        }
      );

      setCustomer({
        ...customer,

        serviceAddresses:
          updatedAddressesForState,

        updatedAt:
          timestamp,
      });

      setRawCustomer(
        (prev: any) => ({
          ...(prev || {}),

          serviceAddresses:
            updatedAddressesForFirestore,

          updatedAt:
            timestamp,

          ...indexPayload,
        })
      );

      setSelectedAddressKey(
        `service:${nextAddressForState.id}`
      );

      resetServiceAddressForm();

      setShowAddServiceAddress(
        false
      );

      if (
        returnToCreateTicketAfterAddressSave
      ) {
        setReturnToCreateTicketAfterAddressSave(
          false
        );

        setShowCreateTicket(
          true
        );
      }
    } catch (err: unknown) {
      setServiceAddressError(
        err instanceof Error
          ? err.message
          : "Failed to add service address."
      );
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleDeleteServiceAddress() {
    if (
      !customer ||
      !deleteAddressTargetId
    ) {
      return;
    }

    setDeleteAddressError("");
    setDeleteAddressSaving(true);

    try {
      const timestamp =
        nowIso();

      const currentAddresses =
        customer.serviceAddresses ??
        [];

      const target =
        currentAddresses.find(
          (address) =>
            address.id ===
            deleteAddressTargetId
        );

      if (!target) {
        setDeleteAddressError(
          "Service location not found."
        );

        return;
      }

      let updatedAddresses =
        currentAddresses.map(
          (address) =>
            address.id ===
            deleteAddressTargetId
              ? {
                  ...address,
                  active: false,
                  isPrimary: false,
                  updatedAt:
                    timestamp,
                }
              : address
        );

      const remainingActive =
        updatedAddresses.filter(
          (address) =>
            address.active !== false &&
            address.id !==
              deleteAddressTargetId
        );

      if (
        target.isPrimary &&
        remainingActive.length > 0
      ) {
        const nextPrimary = [
          ...remainingActive,
        ].sort((a, b) =>
          safeStr(a.label).localeCompare(
            safeStr(b.label)
          )
        )[0];

        updatedAddresses =
          updatedAddresses.map(
            (address) =>
              address.id ===
              nextPrimary.id
                ? {
                    ...address,
                    isPrimary: true,
                    updatedAt:
                      timestamp,
                  }
                : address
          );
      }

      const updatedAddressesForFirestore =
        updatedAddresses.map(
          (address) => ({
            ...address,

            label:
              address.label ??
              null,

            addressLine2:
              address.addressLine2 ??
              null,

            notes:
              address.notes ??
              null,

            source:
              address.source ??
              null,
          })
        );

      const indexPayload =
        buildCustomerIndexPayload({
          ...(rawCustomer || {}),
          ...customer,

          serviceAddresses:
            updatedAddressesForFirestore,
        });

      await updateDoc(
        doc(
          db,
          "customers",
          customer.id
        ),
        {
          serviceAddresses:
            updatedAddressesForFirestore,

          updatedAt:
            timestamp,

          ...indexPayload,
        }
      );

      setCustomer({
        ...customer,

        serviceAddresses:
          updatedAddresses,

        updatedAt:
          timestamp,
      });

      setRawCustomer(
        (prev: any) => ({
          ...(prev || {}),

          serviceAddresses:
            updatedAddressesForFirestore,

          updatedAt:
            timestamp,

          ...indexPayload,
        })
      );

      setDeleteAddressTargetId(
        null
      );
    } catch (err: unknown) {
      setDeleteAddressError(
        err instanceof Error
          ? err.message
          : "Failed to archive service location."
      );
    } finally {
      setDeleteAddressSaving(
        false
      );
    }
  }

  async function handleCreateServiceTicket(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!customer) return;

    if (!canCreateTicket) {
      setTicketError(
        "You do not have permission to create service tickets."
      );

      return;
    }

    setTicketError("");
    setTicketSaving(true);

    try {
      const now = nowIso();

      const summary =
        issueSummary.trim();

      if (!summary) {
        setTicketError(
          "Issue Summary is required."
        );

        return;
      }

      const address =
        getAddressFromKey(
          selectedAddressKey
        );

      if (!address) {
        setTicketError(
          "A physical service address is required before creating a service ticket. Billing addresses cannot be used."
        );

        return;
      }

      if (
        address.source !==
        "service"
      ) {
        setTicketError(
          "Billing addresses cannot be used to create service tickets. Add the physical service address where work will be performed."
        );

        return;
      }

      if (
        addressLooksLikePoBox({
          addressLine1:
            address.addressLine1,

          addressLine2:
            address.addressLine2,

          city:
            address.city,

          state:
            address.state,

          postalCode:
            address.postalCode,
        })
      ) {
        setTicketError(
          "PO Box addresses cannot be used for service tickets. Add the physical service address where work will be performed."
        );

        return;
      }

      const hours = Math.max(
        0.25,
        Number(
          estimatedDurationHours ||
            "1"
        )
      );

      const minutes = Math.max(
        1,
        Math.round(
          hours * 60
        )
      );

      const serviceAddressId =
        address.key.replace(
          "service:",
          ""
        );

      const payload = {
        customerId:
          customer.id,

        customerDisplayName:
          customer.displayName ||
          "",

        serviceAddressId,

        serviceAddressLabel:
          address.label,

        serviceAddressLine1:
          address.addressLine1 ||
          "",

        serviceAddressLine2:
          address.addressLine2 ||
          null,

        serviceCity:
          address.city || "",

        serviceState:
          address.state || "",

        servicePostalCode:
          address.postalCode ||
          "",

        issueSummary:
          summary,

        issueDetails:
          issueDetails.trim() ||
          null,

        status: "new",

        estimatedDurationMinutes:
          minutes,

        assignedTechnicianId:
          null,

        assignedTechnicianName:
          null,

        primaryTechnicianId:
          null,

        secondaryTechnicianId:
          null,

        secondaryTechnicianName:
          null,

        helperIds:
          null,

        helperNames:
          null,

        assignedTechnicianIds:
          null,

        internalNotes:
          null,

        active: true,

        createdAt:
          now,

        updatedAt:
          now,
      };

      const created =
        await addDoc(
          collection(
            db,
            "serviceTickets"
          ),
          payload
        );

      setIssueSummary("");
      setIssueDetails("");
      setEstimatedDurationHours(
        "1"
      );
      setShowCreateTicket(
        false
      );

      setRelatedTickets(
        (prev) => [
          {
            id: created.id,

            status: "new",

            issueSummary:
              summary,

            issueDetails:
              issueDetails.trim() ||
              undefined,

            serviceAddressLabel:
              address.label,

            serviceAddressLine1:
              address.addressLine1 ||
              undefined,

            assignedTechnicianName:
              undefined,

            createdAt: now,

            updatedAt: now,

            active: true,
          },

          ...prev,
        ]
      );

      router.push(
        `/service-tickets/${created.id}`
      );
    } catch (err: unknown) {
      setTicketError(
        err instanceof Error
          ? err.message
          : "Failed to create service ticket."
      );
    } finally {
      setTicketSaving(false);
    }
  }

  const qboStatus =
    useMemo(() => {
      const data =
        rawCustomer || {};

      const linked =
        getLinkedQboId(
          rawCustomer,
          customer
        );

      return {
        linkedId:
          linked,

        syncStatus:
          safeStr(
            data.quickbooksSyncStatus
          ) ||
          safeStr(
            data.qboSyncStatus
          ) ||
          "",

        lastSyncedAt:
          safeStr(
            data.lastQuickbooksSyncAt
          ) ||
          safeStr(
            data.qboLastSyncedAt
          ) ||
          "",

        lastError:
          safeStr(
            data.quickbooksLastError
          ) ||
          safeStr(
            data.qboLastSyncError
          ) ||
          "",

        lastTid:
          safeStr(
            data.qboLastSyncIntuitTid
          ) || "",
      };
    }, [
      rawCustomer,
      customer,
    ]);

  const billingInline =
    useMemo(() => {
      return buildInlineAddress(
        customer?.billingAddressLine1,
        customer?.billingAddressLine2,
        customer?.billingCity,
        customer?.billingState,
        customer?.billingPostalCode
      );
    }, [customer]);

  const billingMapsUrl =
    useMemo(() => {
      const full =
        buildInlineAddress(
          customer?.billingAddressLine1,
          customer?.billingAddressLine2,
          customer?.billingCity,
          customer?.billingState,
          customer?.billingPostalCode
        );

      return full
        ? buildMapsUrl(full)
        : "";
    }, [customer]);

  const primaryServiceAddress =
    useMemo(() => {
      return (
        customer?.serviceAddresses?.find(
          (address) =>
            address.active !==
              false &&
            address.isPrimary
        ) ??
        customer?.serviceAddresses?.find(
          (address) =>
            address.active !==
            false
        ) ??
        null
      );
    }, [customer]);

  const activeServiceAddresses =
    useMemo(() => {
      return (
        customer?.serviceAddresses ||
        []
      )
        .filter(
          (address) =>
            address.active !== false
        )
        .sort(
          (a, b) =>
            Number(
              Boolean(
                b.isPrimary
              )
            ) -
            Number(
              Boolean(
                a.isPrimary
              )
            )
        );
    }, [customer]);

  const deleteAddressTarget =
    useMemo(() => {
      return (
        activeServiceAddresses.find(
          (address) =>
            address.id ===
            deleteAddressTargetId
        ) ?? null
      );
    }, [
      activeServiceAddresses,
      deleteAddressTargetId,
    ]);

  if (loading) {
    return (
      <ProtectedPage fallbackTitle="Customer Detail">
        <AppShell appUser={appUser}>
          <Box
            sx={{
              maxWidth: 1320,
              mx: "auto",
              px: {
                xs: 1,
                sm: 2,
              },
              pb: 4,
            }}
          >
            <Stack spacing={2}>
              <Skeleton
                variant="rounded"
                height={150}
                sx={{
                  borderRadius: 1,
                }}
              />

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    lg: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 2,
                }}
              >
                <Skeleton
                  variant="rounded"
                  height={220}
                />

                <Skeleton
                  variant="rounded"
                  height={220}
                />
              </Box>

              <Skeleton
                variant="rounded"
                height={260}
              />

              <Skeleton
                variant="rounded"
                height={260}
              />
            </Stack>
          </Box>
        </AppShell>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Customer Detail">
      <AppShell appUser={appUser}>
        <Box
          sx={{
            maxWidth: 1360,
            mx: "auto",
            px: {
              xs: 1,
              sm: 2,
            },
            pb: 4,
          }}
        >
          <Box
            sx={{
              borderRadius: preferredCustomer
                ? 2
                : 0,

              p: preferredCustomer
                ? {
                    xs: 1,
                    sm: 1.5,
                  }
                : 0,

              background:
                preferredCustomer
                  ? `radial-gradient(
                      circle at top left,
                      ${alpha(
                        theme.palette.success.main,
                        0.2
                      )} 0%,
                      ${alpha(
                        theme.palette.success.main,
                        0.07
                      )} 35%,
                      transparent 75%
                    )`
                  : undefined,

              border:
                preferredCustomer
                  ? `1px solid ${alpha(
                      theme.palette.success.main,
                      0.35
                    )}`
                  : "none",

              boxShadow:
                preferredCustomer
                  ? `0 0 36px ${alpha(
                      theme.palette.success.main,
                      0.16
                    )}`
                  : "none",

              transition:
                "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
            }}
          >
            {error ? (
              <Alert
                severity="error"
                sx={{
                  borderRadius: 4,
                }}
              >
                {error}
              </Alert>
            ) : null}

            {!error && customer ? (
              <Stack spacing={3}>
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 1,

                    px: {
                      xs: 2,
                      sm: 3,
                    },

                    py: {
                      xs: 2.25,
                      sm: 3,
                    },

                    border: `1px solid ${
                      preferredCustomer
                        ? alpha(
                            theme.palette.success.main,
                            0.7
                          )
                        : alpha(
                            theme.palette.divider,
                            0.8
                          )
                    }`,

                    background:
                      preferredCustomer
                        ? `linear-gradient(
                            135deg,
                            ${alpha(
                              theme.palette.success.dark,
                              0.5
                            )} 0%,
                            ${alpha(
                              theme.palette.success.main,
                              0.28
                            )} 48%,
                            ${alpha(
                              theme.palette.background.paper,
                              0.98
                            )} 100%
                          )`
                        : `linear-gradient(
                            180deg,
                            ${alpha(
                              theme.palette.primary.main,
                              0.08
                            )} 0%,
                            ${alpha(
                              theme.palette.primary.main,
                              0.03
                            )} 100%
                          )`,

                    boxShadow:
                      preferredCustomer
                        ? `0 0 28px ${alpha(
                            theme.palette.success.main,
                            0.22
                          )}`
                        : "none",
                  }}
                >
                  <Stack spacing={2}>
                    <Stack
                      direction={{
                        xs: "column",
                        lg: "row",
                      }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{
                        xs: "flex-start",
                        lg: "center",
                      }}
                    >
                      <Box
                        sx={{
                          minWidth: 0,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          flexWrap="wrap"
                          useFlexGap
                        >
                          <Typography
                            variant="h4"
                            sx={{
                              fontWeight: 800,
                              letterSpacing:
                                -0.4,
                            }}
                          >
                            {customer.displayName ||
                              "Unnamed Customer"}
                          </Typography>

                          {preferredCustomer ? (
                            <Chip
                              icon={
                                <StarRoundedIcon />
                              }
                              label="Preferred Customer"
                              color="success"
                              sx={{
                                borderRadius: 99,
                                fontWeight: 900,
                                px: 0.5,
                              }}
                            />
                          ) : null}

                          <Chip
                            label={
                              customer.active
                                ? "Active"
                                : "Inactive"
                            }
                            color={
                              customer.active
                                ? "success"
                                : "default"
                            }
                            variant={
                              customer.active
                                ? "filled"
                                : "outlined"
                            }
                            sx={{
                              borderRadius: 99,
                            }}
                          />
                        </Stack>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 1 }}
                        >
                          Customer ID:{" "}
                          {customerId}
                        </Typography>

                        <Stack
                          direction={{
                            xs: "column",
                            md: "row",
                          }}
                          spacing={1}
                          useFlexGap
                          flexWrap="wrap"
                          sx={{ mt: 1.5 }}
                        >
                          <Chip
                            icon={
                              <PhoneRoundedIcon />
                            }
                            label={
                              customer.phonePrimary ||
                              "No primary phone"
                            }
                            variant="outlined"
                            sx={{
                              borderRadius: 99,
                            }}
                          />

                          {customer.email ? (
                            <Chip
                              icon={
                                <EmailRoundedIcon />
                              }
                              label={
                                customer.email
                              }
                              variant="outlined"
                              sx={{
                                borderRadius: 99,
                              }}
                            />
                          ) : null}

                          <Chip
                            icon={
                              <LocationOnRoundedIcon />
                            }
                            label={
                              activeServiceAddresses.length >
                              0
                                ? `${activeServiceAddresses.length} service location${
                                    activeServiceAddresses.length ===
                                    1
                                      ? ""
                                      : "s"
                                  }`
                                : "No service locations"
                            }
                            variant="outlined"
                            sx={{
                              borderRadius: 99,
                            }}
                          />

                          {primaryServiceAddress ? (
                            <Chip
                              icon={
                                <TaskAltRoundedIcon />
                              }
                              label={`Primary: ${
                                primaryServiceAddress.label ||
                                "Service Address"
                              }`}
                              variant="outlined"
                              sx={{
                                borderRadius: 99,
                              }}
                            />
                          ) : null}
                        </Stack>
                      </Box>

                      <Stack
                        direction={{
                          xs: "column",
                          sm: "row",
                        }}
                        spacing={1}
                        useFlexGap
                        flexWrap="wrap"
                      >
                        <Button
                          component={Link}
                          href="/customers"
                          variant="outlined"
                          startIcon={
                            <ArrowBackRoundedIcon />
                          }
                          sx={{
                            borderRadius: 99,
                            fontWeight: 700,
                          }}
                        >
                          Back to Customers
                        </Button>

                        {canCreateTicket ? (
                          <Button
                            variant="contained"
                            startIcon={
                              <DescriptionRoundedIcon />
                            }
                            onClick={() => {
                              setTicketError(
                                ""
                              );
                              setShowCreateTicket(
                                true
                              );
                            }}
                            sx={{
                              borderRadius: 99,
                              fontWeight: 700,
                              boxShadow:
                                "none",
                            }}
                          >
                            Create Ticket
                          </Button>
                        ) : null}

                        {canEditCustomer ? (
                          <Button
                            variant={
                              isEditMode
                                ? "outlined"
                                : "contained"
                            }
                            startIcon={
                              <EditRoundedIcon />
                            }
                            onClick={() => {
                              if (
                                isEditMode
                              ) {
                                cancelEditMode();
                              } else {
                                enterEditMode();
                              }
                            }}
                            sx={{
                              borderRadius: 99,
                              fontWeight: 700,
                            }}
                          >
                            {isEditMode
                              ? "Cancel Edit"
                              : "Edit Customer"}
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>

                    {preferredCustomer ? (
                      <>
                        <Divider />

                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                        >
                          <StarRoundedIcon
                            color="success"
                          />

                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: 800,
                            }}
                          >
                            Preferred Customer
                          </Typography>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                          >
                            Prioritize the service experience and communication for this account.
                          </Typography>
                        </Stack>
                      </>
                    ) : null}
                  </Stack>
                </Paper>

                {editErr ? (
                  <Alert
                    severity="error"
                    sx={{
                      borderRadius: 4,
                    }}
                  >
                    {editErr}
                  </Alert>
                ) : null}

                {editOk ? (
                  <Alert
                    severity="success"
                    sx={{
                      borderRadius: 4,
                    }}
                  >
                    {editOk}
                  </Alert>
                ) : null}

                {qboSyncErr ? (
                  <Alert
                    severity="error"
                    sx={{
                      borderRadius: 4,
                    }}
                  >
                    {qboSyncErr}
                  </Alert>
                ) : null}

                {qboSyncOk ? (
                  <Alert
                    severity="success"
                    sx={{
                      borderRadius: 4,
                    }}
                  >
                    {qboSyncOk}
                  </Alert>
                ) : null}

                <Box
                  sx={{
                    display: "grid",

                    gridTemplateColumns: {
                      xs: "1fr",
                      lg: "repeat(2, minmax(0, 1fr))",
                    },

                    gap: 2,
                  }}
                >
                  <SectionCard
                    title="Contact"
                    subtitle="Primary customer contact details."
                    preferred={
                      preferredCustomer
                    }
                  >
                    <Stack spacing={2}>
                      <InfoRow
                        icon={
                          <PhoneRoundedIcon color="action" />
                        }
                        label="Primary phone"
                        primary={
                          customer.phonePrimary ||
                          "—"
                        }
                        secondary={
                          customer.phoneSecondary
                            ? `Secondary: ${customer.phoneSecondary}`
                            : undefined
                        }
                        action={
                          customer.phonePrimary ? (
                            <Stack
                              direction="row"
                              spacing={1}
                            >
                              <Button
                                component="a"
                                href={`tel:${customer.phonePrimary}`}
                                variant="outlined"
                                size="small"
                                sx={{
                                  borderRadius: 99,
                                  fontWeight: 700,
                                }}
                              >
                                Call
                              </Button>

                              <Button
                                component="a"
                                href={`sms:${customer.phonePrimary}`}
                                variant="outlined"
                                size="small"
                                sx={{
                                  borderRadius: 99,
                                  fontWeight: 700,
                                }}
                              >
                                Text
                              </Button>
                            </Stack>
                          ) : null
                        }
                      />

                      <Divider />

                      <InfoRow
                        icon={
                          <EmailRoundedIcon color="action" />
                        }
                        label="Email"
                        primary={
                          customer.email ||
                          "—"
                        }
                        action={
                          customer.email ? (
                            <Button
                              component="a"
                              href={`mailto:${customer.email}`}
                              variant="outlined"
                              size="small"
                              sx={{
                                borderRadius: 99,
                                fontWeight: 700,
                              }}
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
                    subtitle="Mailing and invoice destination."
                    preferred={
                      preferredCustomer
                    }
                  >
                    <InfoRow
                      icon={
                        <PlaceRoundedIcon color="action" />
                      }
                      label="Billing address"
                      primary={
                        billingInline ||
                        "—"
                      }
                      action={
                        billingMapsUrl ? (
                          <Button
                            component="a"
                            href={
                              billingMapsUrl
                            }
                            target="_blank"
                            rel="noreferrer"
                            variant="outlined"
                            size="small"
                            startIcon={
                              <DirectionsRoundedIcon />
                            }
                            sx={{
                              borderRadius: 99,
                              fontWeight: 700,
                            }}
                          >
                            Maps
                          </Button>
                        ) : null
                      }
                    />
                  </SectionCard>
                </Box>

                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 1,
                    px: 2,
                    py: 1.5,

                    border: `1px solid ${alpha(
                      preferredCustomer
                        ? theme.palette.success.main
                        : theme.palette.divider,
                      preferredCustomer
                        ? 0.32
                        : 0.8
                    )}`,
                  }}
                >
                  <Stack
                    direction={{
                      xs: "column",
                      md: "row",
                    }}
                    spacing={1.5}
                    justifyContent="space-between"
                    alignItems={{
                      xs: "flex-start",
                      md: "center",
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <BusinessRoundedIcon
                        color="action"
                      />

                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 800,
                        }}
                      >
                        QuickBooks
                      </Typography>

                      <Chip
                        size="small"
                        label={
                          qboStatus.linkedId
                            ? qboStatus.syncStatus ||
                              "Linked"
                            : "Not linked"
                        }
                        color={
                          qboStatus.linkedId
                            ? "primary"
                            : "default"
                        }
                        variant={
                          qboStatus.linkedId
                            ? "filled"
                            : "outlined"
                        }
                        sx={{
                          borderRadius: 99,
                        }}
                      />

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        {qboStatus.lastSyncedAt
                          ? `Last sync ${formatDateTime(
                              qboStatus.lastSyncedAt
                            )}`
                          : "No sync history"}
                      </Typography>
                    </Stack>

                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        <SyncRoundedIcon />
                      }
                      onClick={() =>
                        handleCreateOrSyncToQbo(
                          {
                            updateName: true,
                          }
                        )
                      }
                      disabled={
                        !canEditCustomer ||
                        qboSyncing
                      }
                      sx={{
                        borderRadius: 99,
                        fontWeight: 700,
                      }}
                    >
                      {qboSyncing
                        ? qboStatus.linkedId
                          ? "Syncing..."
                          : "Creating..."
                        : qboStatus.linkedId
                        ? "Sync Now"
                        : "Create in QBO"}
                    </Button>
                  </Stack>

                  {qboStatus.lastError ? (
                    <Alert
                      severity="warning"
                      sx={{
                        borderRadius: 3,
                        mt: 1.5,
                      }}
                    >
                      {qboStatus.lastError}
                    </Alert>
                  ) : null}
                </Paper>

                {isEditMode ? (
                  <SectionCard
                    title="Edit customer"
                    subtitle="Update account status, contact information, and billing details."
                    preferred={
                      preferredCustomer
                    }
                    action={
                      <Stack
                        direction={{
                          xs: "column",
                          sm: "row",
                        }}
                        spacing={1}
                      >
                        <Button
                          variant="outlined"
                          onClick={
                            cancelEditMode
                          }
                          disabled={
                            editSaving ||
                            qboSyncing
                          }
                          sx={{
                            borderRadius: 99,
                            fontWeight: 700,
                          }}
                        >
                          Cancel
                        </Button>

                        <Button
                          variant="outlined"
                          startIcon={
                            <SaveRoundedIcon />
                          }
                          onClick={() =>
                            handleSaveCustomerEdits(
                              false
                            )
                          }
                          disabled={
                            !canEditCustomer ||
                            editSaving
                          }
                          sx={{
                            borderRadius: 99,
                            fontWeight: 700,
                          }}
                        >
                          {editSaving
                            ? "Saving..."
                            : "Save"}
                        </Button>

                        <Button
                          variant="contained"
                          startIcon={
                            <SyncRoundedIcon />
                          }
                          onClick={() =>
                            handleSaveCustomerEdits(
                              true
                            )
                          }
                          disabled={
                            !canEditCustomer ||
                            editSaving ||
                            qboSyncing
                          }
                          sx={{
                            borderRadius: 99,
                            fontWeight: 700,
                            boxShadow:
                              "none",
                          }}
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
                    <Stack spacing={2}>
                      <Card
                        elevation={0}
                        sx={{
                          borderRadius: 2,

                          border: `1px solid ${alpha(
                            theme.palette.divider,
                            0.8
                          )}`,

                          background: editPreferredCustomer
                            ? alpha(
                                theme.palette.success.main,
                                0.08
                              )
                            : undefined,
                        }}
                      >
                        <CardContent
                          sx={{ p: 2 }}
                        >
                          <Stack spacing={1.5}>
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: 800,
                              }}
                            >
                              Account Status
                            </Typography>

                            <FormControlLabel
                              control={
                                <Switch
                                  checked={
                                    editActive
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditActive(
                                      event
                                        .target
                                        .checked
                                    )
                                  }
                                  disabled={
                                    !canEditCustomer ||
                                    editSaving
                                  }
                                />
                              }
                              label="Active Customer"
                            />

                            <FormControlLabel
                              control={
                                <Switch
                                  checked={
                                    editPreferredCustomer
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditPreferredCustomer(
                                      event
                                        .target
                                        .checked
                                    )
                                  }
                                  disabled={
                                    !canEditCustomer ||
                                    editSaving
                                  }
                                />
                              }
                              label={
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <StarRoundedIcon
                                    fontSize="small"
                                    color={
                                      editPreferredCustomer
                                        ? "success"
                                        : "disabled"
                                    }
                                  />

                                  <Box>
                                    <Typography
                                      variant="body1"
                                      sx={{
                                        fontWeight: 800,
                                      }}
                                    >
                                      Preferred Customer
                                    </Typography>

                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      Preferred accounts receive the green visual treatment throughout DCFlow.
                                    </Typography>
                                  </Box>
                                </Stack>
                              }
                            />
                          </Stack>
                        </CardContent>
                      </Card>

                      <Box
                        sx={{
                          display: "grid",

                          gridTemplateColumns: {
                            xs: "1fr",
                            lg: "repeat(2, minmax(0, 1fr))",
                          },

                          gap: 2,
                        }}
                      >
                        <Card
                          elevation={0}
                          sx={{
                            borderRadius: 2,

                            border: `1px solid ${alpha(
                              theme.palette.divider,
                              0.8
                            )}`,
                          }}
                        >
                          <CardContent
                            sx={{ p: 2 }}
                          >
                            <Stack spacing={2}>
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 800,
                                }}
                              >
                                Contact
                              </Typography>

                              <TextField
                                label="Customer name"
                                value={
                                  editDisplayName
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditDisplayName(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                disabled={
                                  !canEditCustomer ||
                                  editSaving
                                }
                                fullWidth
                              />

                              <TextField
                                label="Email"
                                value={
                                  editEmail
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditEmail(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                disabled={
                                  !canEditCustomer ||
                                  editSaving
                                }
                                fullWidth
                              />

                              <TextField
                                label="Primary phone"
                                value={
                                  editPhonePrimary
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditPhonePrimary(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                disabled={
                                  !canEditCustomer ||
                                  editSaving
                                }
                                fullWidth
                              />

                              <TextField
                                label="Secondary phone"
                                value={
                                  editPhoneSecondary
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditPhoneSecondary(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                disabled={
                                  !canEditCustomer ||
                                  editSaving
                                }
                                fullWidth
                              />
                            </Stack>
                          </CardContent>
                        </Card>

                        <Card
                          elevation={0}
                          sx={{
                            borderRadius: 2,

                            border: `1px solid ${alpha(
                              theme.palette.divider,
                              0.8
                            )}`,
                          }}
                        >
                          <CardContent
                            sx={{ p: 2 }}
                          >
                            <Stack spacing={2}>
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 800,
                                }}
                              >
                                Billing address
                              </Typography>

                              <TextField
                                label="Address line 1"
                                value={
                                  editBillLine1
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditBillLine1(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                disabled={
                                  !canEditCustomer ||
                                  editSaving
                                }
                                fullWidth
                              />

                              <TextField
                                label="Address line 2"
                                value={
                                  editBillLine2
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditBillLine2(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                disabled={
                                  !canEditCustomer ||
                                  editSaving
                                }
                                fullWidth
                              />

                              <Box
                                sx={{
                                  display:
                                    "grid",

                                  gridTemplateColumns: {
                                    xs: "1fr",
                                    sm: "repeat(3, minmax(0, 1fr))",
                                  },

                                  gap: 2,
                                }}
                              >
                                <TextField
                                  label="City"
                                  value={
                                    editBillCity
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditBillCity(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    !canEditCustomer ||
                                    editSaving
                                  }
                                  fullWidth
                                />

                                <TextField
                                  label="State"
                                  value={
                                    editBillState
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditBillState(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    !canEditCustomer ||
                                    editSaving
                                  }
                                  fullWidth
                                />

                                <TextField
                                  label="Postal code"
                                  value={
                                    editBillPostal
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditBillPostal(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    !canEditCustomer ||
                                    editSaving
                                  }
                                  fullWidth
                                />
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Box>
                    </Stack>
                  </SectionCard>
                ) : null}

                <SectionCard
                  title="Service locations"
                  subtitle="Physical addresses used for tickets, dispatch, and property-level history."
                  preferred={
                    preferredCustomer
                  }
                  action={
                    <Button
                      variant="contained"
                      startIcon={
                        <AddHomeRoundedIcon />
                      }
                      onClick={() => {
                        resetServiceAddressForm();

                        setShowAddServiceAddress(
                          true
                        );
                      }}
                      sx={{
                        borderRadius: 99,
                        fontWeight: 700,
                        boxShadow: "none",
                      }}
                    >
                      Add Service Location
                    </Button>
                  }
                >
                  {activeServiceAddresses.length ===
                  0 ? (
                    <EmptyMiniState
                      icon={
                        <HomeWorkRoundedIcon
                          sx={{
                            fontSize: 28,
                          }}
                        />
                      }
                      title="No service locations yet"
                      description="Add the home, rental property, shop, or other physical address where work is performed."
                    />
                  ) : (
                    <Box
                      sx={{
                        display: "grid",

                        gridTemplateColumns: {
                          xs: "1fr",
                          lg: "repeat(2, minmax(0, 1fr))",
                        },

                        gap: 2,
                      }}
                    >
                      {activeServiceAddresses.map(
                        (address) => {
                          const fullAddress =
                            buildInlineAddress(
                              address.addressLine1,
                              address.addressLine2,
                              address.city,
                              address.state,
                              address.postalCode
                            );

                          const maps =
                            fullAddress
                              ? buildMapsUrl(
                                  fullAddress
                                )
                              : "";

                          return (
                            <Card
                              key={
                                address.id
                              }
                              elevation={0}
                              sx={{
                                borderRadius: 1,

                                border: `1px solid ${alpha(
                                  preferredCustomer
                                    ? theme
                                        .palette
                                        .success
                                        .main
                                    : theme
                                        .palette
                                        .divider,
                                  preferredCustomer
                                    ? 0.28
                                    : 0.8
                                )}`,
                              }}
                            >
                              <CardContent
                                sx={{
                                  p: 2,
                                }}
                              >
                                <Stack spacing={1.5}>
                                  <Stack
                                    direction={{
                                      xs: "column",
                                      sm: "row",
                                    }}
                                    spacing={1}
                                    justifyContent="space-between"
                                    alignItems={{
                                      xs: "flex-start",
                                      sm: "center",
                                    }}
                                  >
                                    <Stack
                                      direction="row"
                                      spacing={1}
                                      flexWrap="wrap"
                                      useFlexGap
                                    >
                                      <Chip
                                        label={
                                          address.label ||
                                          "Service Address"
                                        }
                                        color="primary"
                                        variant="outlined"
                                        sx={{
                                          borderRadius: 99,
                                        }}
                                      />

                                      {address.isPrimary ? (
                                        <Chip
                                          label="Primary"
                                          color="success"
                                          variant="filled"
                                          sx={{
                                            borderRadius: 99,
                                          }}
                                        />
                                      ) : null}
                                    </Stack>

                                    <Stack
                                      direction="row"
                                      spacing={1}
                                      useFlexGap
                                      flexWrap="wrap"
                                    >
                                      {maps ? (
                                        <Button
                                          component="a"
                                          href={
                                            maps
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                          variant="outlined"
                                          size="small"
                                          startIcon={
                                            <DirectionsRoundedIcon />
                                          }
                                          sx={{
                                            borderRadius: 99,
                                            fontWeight: 700,
                                          }}
                                        >
                                          Maps
                                        </Button>
                                      ) : null}

                                      <Button
                                        variant="outlined"
                                        color="warning"
                                        size="small"
                                        startIcon={
                                          <DeleteOutlineRoundedIcon />
                                        }
                                        onClick={() => {
                                          setDeleteAddressError(
                                            ""
                                          );

                                          setDeleteAddressTargetId(
                                            address.id
                                          );
                                        }}
                                        sx={{
                                          borderRadius: 99,
                                          fontWeight: 700,
                                        }}
                                      >
                                        Archive
                                      </Button>
                                    </Stack>
                                  </Stack>

                                  <Divider />

                                  <InfoRow
                                    icon={
                                      <LocationOnRoundedIcon color="action" />
                                    }
                                    label="Address"
                                    primary={
                                      fullAddress ||
                                      "—"
                                    }
                                    secondary={
                                      address.notes
                                        ? `Notes: ${address.notes}`
                                        : undefined
                                    }
                                  />
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        }
                      )}
                    </Box>
                  )}
                </SectionCard>

                <SectionCard
                  title="Work"
                  subtitle="Active work first, followed by recent completed history."
                  preferred={
                    preferredCustomer
                  }
                >
                  {relatedError ? (
                    <Alert
                      severity="error"
                      sx={{
                        borderRadius: 4,
                      }}
                    >
                      {relatedError}
                    </Alert>
                  ) : null}

                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Chip
                      label={
                        relatedLoading
                          ? "Active: …"
                          : `Active: ${activeWorkCount}`
                      }
                      color={
                        activeWorkCount >
                        0
                          ? "primary"
                          : "default"
                      }
                      variant={
                        activeWorkCount >
                        0
                          ? "filled"
                          : "outlined"
                      }
                      sx={{
                        borderRadius: 99,
                        fontWeight: 700,
                      }}
                    />

                    <Chip
                      label={
                        relatedLoading
                          ? "Completed: …"
                          : `Completed: ${completedWorkCount}`
                      }
                      variant="outlined"
                      sx={{
                        borderRadius: 99,
                        fontWeight: 700,
                      }}
                    />

                    <Chip
                      label={
                        relatedLoading
                          ? "Projects: …"
                          : `Projects: ${relatedProjects.length}`
                      }
                      variant="outlined"
                      sx={{
                        borderRadius: 99,
                        fontWeight: 700,
                      }}
                    />
                  </Stack>

                  <Divider />

                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    Active Work
                  </Typography>

                  {relatedLoading ? (
                    <Stack spacing={1.25}>
                      <Skeleton
                        variant="rounded"
                        height={96}
                      />

                      <Skeleton
                        variant="rounded"
                        height={96}
                      />
                    </Stack>
                  ) : activeWorkCount ===
                    0 ? (
                    <EmptyMiniState
                      icon={
                        <TaskAltRoundedIcon
                          sx={{
                            fontSize: 28,
                          }}
                        />
                      }
                      title="No active work"
                      description="This customer currently has no open service tickets or active projects."
                    />
                  ) : (
                    <Box
                      sx={{
                        display: "grid",

                        gridTemplateColumns: {
                          xs: "1fr",
                          xl: "repeat(2, minmax(0, 1fr))",
                        },

                        gap: 2,
                      }}
                    >
                      <Card
                        elevation={0}
                        sx={{
                          borderRadius: 1,

                          border: `1px solid ${alpha(
                            theme.palette.divider,
                            0.8
                          )}`,
                        }}
                      >
                        <CardContent
                          sx={{ p: 2 }}
                        >
                          <Stack spacing={2}>
                            <Stack
                              direction="row"
                              spacing={1}
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 800,
                                }}
                              >
                                Service Tickets
                              </Typography>

                              <Chip
                                size="small"
                                label={
                                  activeTickets.length
                                }
                                variant="outlined"
                                sx={{
                                  borderRadius: 99,
                                  fontWeight: 700,
                                }}
                              />
                            </Stack>

                            {activeTickets.length ===
                            0 ? (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                No active service tickets.
                              </Typography>
                            ) : (
                              <Stack spacing={1.25}>
                                {activeTickets.map(
                                  (
                                    ticket
                                  ) => (
                                    <Card
                                      key={
                                        ticket.id
                                      }
                                      elevation={
                                        0
                                      }
                                      onClick={() =>
                                        handleRelatedTicketClick(
                                          ticket
                                        )
                                      }
                                      role="button"
                                      tabIndex={
                                        0
                                      }
                                      sx={{
                                        borderRadius: 1,

                                        border: `1px solid ${alpha(
                                          theme
                                            .palette
                                            .divider,
                                          0.8
                                        )}`,

                                        cursor:
                                          "pointer",

                                        "&:hover":
                                          {
                                            borderColor:
                                              alpha(
                                                theme
                                                  .palette
                                                  .primary
                                                  .main,
                                                0.4
                                              ),
                                          },
                                      }}
                                    >
                                      <CardContent
                                        sx={{
                                          p: 1.75,
                                        }}
                                      >
                                        <Stack spacing={0.75}>
                                          <Stack
                                            direction="row"
                                            spacing={1}
                                            justifyContent="space-between"
                                            alignItems="center"
                                          >
                                            <Typography
                                              variant="subtitle2"
                                              sx={{
                                                fontWeight: 800,
                                              }}
                                            >
                                              {
                                                ticket.issueSummary
                                              }
                                            </Typography>

                                            <Chip
                                              size="small"
                                              label={formatStatusLabel(
                                                ticket.status
                                              )}
                                              color="primary"
                                              variant="outlined"
                                            />
                                          </Stack>

                                          <Typography
                                            variant="body2"
                                            color="text.secondary"
                                          >
                                            {ticket.serviceAddressLabel ||
                                              ticket.serviceAddressLine1 ||
                                              "No service location"}
                                          </Typography>
                                        </Stack>
                                      </CardContent>
                                    </Card>
                                  )
                                )}
                              </Stack>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>

                      <Card
                        elevation={0}
                        sx={{
                          borderRadius: 1,

                          border: `1px solid ${alpha(
                            theme.palette.divider,
                            0.8
                          )}`,
                        }}
                      >
                        <CardContent
                          sx={{ p: 2 }}
                        >
                          <Stack spacing={2}>
                            <Stack
                              direction="row"
                              spacing={1}
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 800,
                                }}
                              >
                                Projects
                              </Typography>

                              <Chip
                                size="small"
                                label={
                                  activeProjects.length
                                }
                                variant="outlined"
                                sx={{
                                  borderRadius: 99,
                                  fontWeight: 700,
                                }}
                              />
                            </Stack>

                            {activeProjects.length ===
                            0 ? (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                No active projects.
                              </Typography>
                            ) : (
                              <Stack spacing={1.25}>
                                {activeProjects.map(
                                  (
                                    project
                                  ) => (
                                    <Card
                                      key={
                                        project.id
                                      }
                                      elevation={
                                        0
                                      }
                                      onClick={() =>
                                        handleRelatedProjectClick(
                                          project
                                        )
                                      }
                                      role="button"
                                      tabIndex={
                                        0
                                      }
                                      sx={{
                                        borderRadius: 1,

                                        border: `1px solid ${alpha(
                                          theme
                                            .palette
                                            .divider,
                                          0.8
                                        )}`,

                                        cursor:
                                          "pointer",

                                        "&:hover":
                                          {
                                            borderColor:
                                              alpha(
                                                theme
                                                  .palette
                                                  .primary
                                                  .main,
                                                0.4
                                              ),
                                          },
                                      }}
                                    >
                                      <CardContent
                                        sx={{
                                          p: 1.75,
                                        }}
                                      >
                                        <Stack spacing={0.75}>
                                          <Stack
                                            direction="row"
                                            spacing={1}
                                            justifyContent="space-between"
                                            alignItems="center"
                                          >
                                            <Typography
                                              variant="subtitle2"
                                              sx={{
                                                fontWeight: 800,
                                              }}
                                            >
                                              {
                                                project.projectName
                                              }
                                            </Typography>

                                            <Chip
                                              size="small"
                                              label={formatStatusLabel(
                                                project.status
                                              )}
                                              color="primary"
                                              variant="outlined"
                                            />
                                          </Stack>

                                          {project.locationLabel ? (
                                            <Typography
                                              variant="body2"
                                              color="text.secondary"
                                            >
                                              {
                                                project.locationLabel
                                              }
                                            </Typography>
                                          ) : null}
                                        </Stack>
                                      </CardContent>
                                    </Card>
                                  )
                                )}
                              </Stack>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Box>
                  )}

                  <Divider />

                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    Recent History
                  </Typography>

                  <Box
                    sx={{
                      display: "grid",

                      gridTemplateColumns: {
                        xs: "1fr",
                        xl: "repeat(2, minmax(0, 1fr))",
                      },

                      gap: 2,
                    }}
                  >
                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 1,

                        border: `1px solid ${alpha(
                          theme.palette.divider,
                          0.8
                        )}`,
                      }}
                    >
                      <CardContent
                        sx={{ p: 2 }}
                      >
                        <Stack spacing={2}>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            justifyContent="space-between"
                          >
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: 800,
                              }}
                            >
                              Service Tickets
                            </Typography>

                            <Chip
                              label={
                                relatedLoading
                                  ? "…"
                                  : relatedTickets.length
                              }
                              variant="outlined"
                              size="small"
                              sx={{
                                borderRadius: 99,
                                fontWeight: 700,
                              }}
                            />
                          </Stack>

                          {relatedLoading ? (
                            <Stack spacing={1.25}>
                              <Skeleton
                                variant="rounded"
                                height={82}
                              />

                              <Skeleton
                                variant="rounded"
                                height={82}
                              />
                            </Stack>
                          ) : historicalTickets.length ===
                            0 ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              No completed service ticket history yet.
                            </Typography>
                          ) : (
                            <Stack spacing={1.25}>
                              {historicalTickets.map(
                                (
                                  ticket
                                ) => (
                                  <Card
                                    key={
                                      ticket.id
                                    }
                                    elevation={
                                      0
                                    }
                                    onClick={() =>
                                      handleRelatedTicketClick(
                                        ticket
                                      )
                                    }
                                    role="button"
                                    tabIndex={0}
                                    sx={{
                                      borderRadius: 1,

                                      border: `1px solid ${alpha(
                                        theme
                                          .palette
                                          .divider,
                                        0.75
                                      )}`,

                                      cursor:
                                        "pointer",
                                    }}
                                  >
                                    <CardContent
                                      sx={{
                                        p: 1.5,
                                      }}
                                    >
                                      <Stack spacing={0.5}>
                                        <Stack
                                          direction="row"
                                          spacing={1}
                                          justifyContent="space-between"
                                          alignItems="center"
                                        >
                                          <Typography
                                            variant="subtitle2"
                                            sx={{
                                              fontWeight: 800,
                                            }}
                                          >
                                            {
                                              ticket.issueSummary
                                            }
                                          </Typography>

                                          <Chip
                                            size="small"
                                            label={formatStatusLabel(
                                              ticket.status
                                            )}
                                            variant="outlined"
                                          />
                                        </Stack>

                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          {formatDateTime(
                                            ticket.createdAt
                                          )}
                                        </Typography>
                                      </Stack>
                                    </CardContent>
                                  </Card>
                                )
                              )}
                            </Stack>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>

                    <Card
                      elevation={0}
                      sx={{
                        borderRadius: 1,

                        border: `1px solid ${alpha(
                          theme.palette.divider,
                          0.8
                        )}`,
                      }}
                    >
                      <CardContent
                        sx={{ p: 2 }}
                      >
                        <Stack spacing={2}>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            justifyContent="space-between"
                          >
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: 800,
                              }}
                            >
                              Projects
                            </Typography>

                            <Chip
                              label={
                                relatedLoading
                                  ? "…"
                                  : relatedProjects.length
                              }
                              variant="outlined"
                              size="small"
                              sx={{
                                borderRadius: 99,
                                fontWeight: 700,
                              }}
                            />
                          </Stack>

                          {relatedLoading ? (
                            <Stack spacing={1.25}>
                              <Skeleton
                                variant="rounded"
                                height={82}
                              />

                              <Skeleton
                                variant="rounded"
                                height={82}
                              />
                            </Stack>
                          ) : historicalProjects.length ===
                            0 ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              No completed project history yet.
                            </Typography>
                          ) : (
                            <Stack spacing={1.25}>
                              {historicalProjects.map(
                                (
                                  project
                                ) => (
                                  <Card
                                    key={
                                      project.id
                                    }
                                    elevation={
                                      0
                                    }
                                    onClick={() =>
                                      handleRelatedProjectClick(
                                        project
                                      )
                                    }
                                    role="button"
                                    tabIndex={0}
                                    sx={{
                                      borderRadius: 1,

                                      border: `1px solid ${alpha(
                                        theme
                                          .palette
                                          .divider,
                                        0.75
                                      )}`,

                                      cursor:
                                        "pointer",
                                    }}
                                  >
                                    <CardContent
                                      sx={{
                                        p: 1.5,
                                      }}
                                    >
                                      <Stack spacing={0.5}>
                                        <Stack
                                          direction="row"
                                          spacing={1}
                                          justifyContent="space-between"
                                          alignItems="center"
                                        >
                                          <Typography
                                            variant="subtitle2"
                                            sx={{
                                              fontWeight: 800,
                                            }}
                                          >
                                            {
                                              project.projectName
                                            }
                                          </Typography>

                                          <Chip
                                            size="small"
                                            label={formatStatusLabel(
                                              project.status
                                            )}
                                            variant="outlined"
                                          />
                                        </Stack>

                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          {formatDateTime(
                                            project.createdAt
                                          )}
                                        </Typography>
                                      </Stack>
                                    </CardContent>
                                  </Card>
                                )
                              )}
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
        </Box>

        <Dialog
          open={showCreateTicket}
          onClose={() =>
            !ticketSaving &&
            setShowCreateTicket(false)
          }
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>
            Create Service Ticket
          </DialogTitle>

          <DialogContent dividers>
            {!canCreateTicket ? (
              <Alert
                severity="info"
                sx={{
                  borderRadius: 3,
                }}
              >
                Only Admin, Dispatcher, and Manager roles can create service tickets.
              </Alert>
            ) : (
              <Box
                component="form"
                id="create-ticket-form"
                onSubmit={
                  handleCreateServiceTicket
                }
                sx={{
                  display: "grid",
                  gap: 2,
                  pt: 0.5,
                }}
              >
                {preferredCustomer ? (
                  <Alert
                    severity="success"
                    icon={
                      <StarRoundedIcon />
                    }
                    sx={{
                      borderRadius: 3,
                    }}
                  >
                    <strong>
                      Preferred Customer
                    </strong>{" "}
                    — prioritize the service experience and communication for this account.
                  </Alert>
                ) : null}

                {addressChoices.length ===
                0 ? (
                  <Alert
                    severity="warning"
                    sx={{
                      borderRadius: 3,
                    }}
                  >
                    <Stack
                      spacing={1.5}
                      alignItems="flex-start"
                    >
                      <Typography variant="body2">
                        This customer does not have a valid physical service address. Billing addresses and PO Boxes cannot be used to create service tickets.
                      </Typography>

                      <Button
                        type="button"
                        variant="outlined"
                        size="small"
                        startIcon={
                          <AddHomeRoundedIcon />
                        }
                        onClick={() => {
                          setReturnToCreateTicketAfterAddressSave(
                            true
                          );

                          setShowCreateTicket(
                            false
                          );

                          resetServiceAddressForm();

                          setShowAddServiceAddress(
                            true
                          );
                        }}
                        sx={{
                          borderRadius: 99,
                          fontWeight: 700,
                        }}
                      >
                        Add Service Location
                      </Button>
                    </Stack>
                  </Alert>
                ) : null}

                <Box
                  sx={{
                    display: "grid",

                    gridTemplateColumns: {
                      xs: "1fr",
                      md: "2fr 1fr",
                    },

                    gap: 2,
                  }}
                >
                  <TextField
                    label="Issue summary"
                    value={
                      issueSummary
                    }
                    onChange={(
                      event
                    ) =>
                      setIssueSummary(
                        event.target.value
                      )
                    }
                    required
                    fullWidth
                    placeholder='Example: "Clogged kitchen sink"'
                  />

                  <TextField
                    label="Estimated duration (hours)"
                    type="number"
                    inputProps={{
                      min: 0.25,
                      step: 0.25,
                    }}
                    value={
                      estimatedDurationHours
                    }
                    onChange={(
                      event
                    ) =>
                      setEstimatedDurationHours(
                        event.target.value
                      )
                    }
                    fullWidth
                  />
                </Box>

                <TextField
                  label="Issue details"
                  value={
                    issueDetails
                  }
                  onChange={(
                    event
                  ) =>
                    setIssueDetails(
                      event.target.value
                    )
                  }
                  multiline
                  minRows={3}
                  fullWidth
                  placeholder="Helpful details for dispatch and technician notes…"
                />

                <FormControl fullWidth>
                  <InputLabel id="ticket-address-label">
                    Service address for this ticket
                  </InputLabel>

                  <Select
                    labelId="ticket-address-label"
                    value={
                      selectedAddressKey
                    }
                    label="Service address for this ticket"
                    onChange={(
                      event
                    ) =>
                      setSelectedAddressKey(
                        String(
                          event.target.value
                        )
                      )
                    }
                  >
                    {addressChoices.length ===
                    0 ? (
                      <MenuItem value="">
                        No valid service addresses found
                      </MenuItem>
                    ) : (
                      addressChoices.map(
                        (address) => (
                          <MenuItem
                            key={
                              address.key
                            }
                            value={
                              address.key
                            }
                          >
                            {address.label} —{" "}
                            {address.addressLine1},{" "}
                            {address.city}
                          </MenuItem>
                        )
                      )
                    )}
                  </Select>
                </FormControl>

                {(() => {
                  const address =
                    getAddressFromKey(
                      selectedAddressKey
                    );

                  if (!address) {
                    return null;
                  }

                  return (
                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 3,
                        p: 2,
                        bgcolor:
                          "action.hover",

                        border: `1px solid ${alpha(
                          theme.palette.divider,
                          0.7
                        )}`,
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Using service address
                      </Typography>

                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: 700,
                          mt: 0.5,
                        }}
                      >
                        {buildInlineAddress(
                          address.addressLine1,
                          address.addressLine2,
                          address.city,
                          address.state,
                          address.postalCode
                        )}
                      </Typography>
                    </Paper>
                  );
                })()}

                {ticketError ? (
                  <Alert
                    severity="error"
                    sx={{
                      borderRadius: 3,
                    }}
                  >
                    {ticketError}
                  </Alert>
                ) : null}
              </Box>
            )}
          </DialogContent>

          <DialogActions
            sx={{
              px: 3,
              py: 2,
            }}
          >
            <Button
              onClick={() =>
                setShowCreateTicket(
                  false
                )
              }
              disabled={
                ticketSaving
              }
              sx={{
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Cancel
            </Button>

            {canCreateTicket ? (
              <Button
                type="submit"
                form="create-ticket-form"
                variant="contained"
                startIcon={
                  <DescriptionRoundedIcon />
                }
                disabled={
                  ticketSaving ||
                  addressChoices.length ===
                    0
                }
                sx={{
                  borderRadius: 99,
                  fontWeight: 700,
                  boxShadow: "none",
                }}
              >
                {ticketSaving
                  ? "Creating..."
                  : "Create Ticket"}
              </Button>
            ) : null}
          </DialogActions>
        </Dialog>

        <Dialog
          open={
            showAddServiceAddress
          }
          onClose={() => {
            if (!savingAddress) {
              setReturnToCreateTicketAfterAddressSave(
                false
              );

              setShowAddServiceAddress(
                false
              );

              resetServiceAddressForm();
            }
          }}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>
            Add Service Location
          </DialogTitle>

          <DialogContent dividers>
            <Box
              component="form"
              id="add-service-address-form"
              onSubmit={
                handleAddServiceAddress
              }
              sx={{
                display: "grid",
                gap: 2,
                pt: 0.5,
              }}
            >
              <TextField
                label="Label"
                value={
                  serviceLabel
                }
                onChange={(
                  event
                ) =>
                  setServiceLabel(
                    event.target.value
                  )
                }
                fullWidth
                placeholder="Home, Rental House, Shop, Weekend House..."
              />

              <AddressAutocompleteField
                label="Search address"
                value={
                  serviceAddressSearch
                }
                onChange={(
                  value
                ) => {
                  setServiceAddressSearch(
                    value
                  );

                  markServiceAddressManual();
                }}
                onSelectAddress={
                  handleServiceGoogleAddressSelected
                }
                helperText="Start typing to search for a real address, or keep entering it manually below."
                placeholder="Start typing a service address..."
                disabled={
                  savingAddress
                }
              />

              <TextField
                label="Address line 1"
                value={
                  serviceAddressLine1
                }
                onChange={(
                  event
                ) => {
                  setServiceAddressLine1(
                    event.target.value
                  );

                  markServiceAddressManual();
                }}
                required
                fullWidth
              />

              <TextField
                label="Address line 2"
                value={
                  serviceAddressLine2
                }
                onChange={(
                  event
                ) => {
                  setServiceAddressLine2(
                    event.target.value
                  );

                  markServiceAddressManual();
                }}
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
                  value={
                    serviceCity
                  }
                  onChange={(
                    event
                  ) => {
                    setServiceCity(
                      event.target.value
                    );

                    markServiceAddressManual();
                  }}
                  required
                  fullWidth
                />

                <TextField
                  label="State"
                  value={
                    serviceState
                  }
                  onChange={(
                    event
                  ) => {
                    setServiceState(
                      event.target.value
                    );

                    markServiceAddressManual();
                  }}
                  required
                  fullWidth
                />

                <TextField
                  label="Postal code"
                  value={
                    servicePostalCode
                  }
                  onChange={(
                    event
                  ) => {
                    setServicePostalCode(
                      event.target.value
                    );

                    markServiceAddressManual();
                  }}
                  required
                  fullWidth
                />
              </Box>

              <TextField
                label="Notes"
                value={
                  serviceNotes
                }
                onChange={(
                  event
                ) =>
                  setServiceNotes(
                    event.target.value
                  )
                }
                multiline
                minRows={3}
                fullWidth
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={
                      serviceIsPrimary
                    }
                    onChange={(
                      event
                    ) =>
                      setServiceIsPrimary(
                        event.target
                          .checked
                      )
                    }
                  />
                }
                label="Set as primary service address"
              />

              {serviceAddressError ? (
                <Alert
                  severity="error"
                  sx={{
                    borderRadius: 3,
                  }}
                >
                  {serviceAddressError}
                </Alert>
              ) : null}
            </Box>
          </DialogContent>

          <DialogActions
            sx={{
              px: 3,
              py: 2,
            }}
          >
            <Button
              onClick={() => {
                setReturnToCreateTicketAfterAddressSave(
                  false
                );

                setShowAddServiceAddress(
                  false
                );

                resetServiceAddressForm();
              }}
              disabled={
                savingAddress
              }
              sx={{
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              form="add-service-address-form"
              variant="contained"
              startIcon={
                <AddHomeRoundedIcon />
              }
              disabled={
                savingAddress
              }
              sx={{
                borderRadius: 99,
                fontWeight: 700,
                boxShadow: "none",
              }}
            >
              {savingAddress
                ? "Saving..."
                : "Add Service Location"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(
            deleteAddressTargetId
          )}
          onClose={() => {
            if (
              !deleteAddressSaving
            ) {
              setDeleteAddressTargetId(
                null
              );

              setDeleteAddressError(
                ""
              );
            }
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>
            Archive Service Location
          </DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body1">
                Archive this service location from active use?
              </Typography>

              {deleteAddressTarget ? (
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    p: 2,
                    bgcolor:
                      "action.hover",

                    border: `1px solid ${alpha(
                      theme.palette.divider,
                      0.7
                    )}`,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 800,
                    }}
                  >
                    {deleteAddressTarget.label ||
                      "Service Address"}
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
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
                      sx={{
                        mt: 1,
                        borderRadius: 99,
                      }}
                    />
                  ) : null}
                </Paper>
              ) : null}

              <Typography
                variant="body2"
                color="text.secondary"
              >
                Archiving removes the location from active use while preserving old tickets, projects, and historical records that reference it.
              </Typography>

              {deleteAddressError ? (
                <Alert
                  severity="error"
                  sx={{
                    borderRadius: 3,
                  }}
                >
                  {deleteAddressError}
                </Alert>
              ) : null}
            </Stack>
          </DialogContent>

          <DialogActions
            sx={{
              px: 3,
              py: 2,
            }}
          >
            <Button
              onClick={() => {
                setDeleteAddressTargetId(
                  null
                );

                setDeleteAddressError(
                  ""
                );
              }}
              disabled={
                deleteAddressSaving
              }
              sx={{
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Cancel
            </Button>

            <Button
              variant="contained"
              color="warning"
              startIcon={
                <DeleteOutlineRoundedIcon />
              }
              onClick={
                handleDeleteServiceAddress
              }
              disabled={
                deleteAddressSaving
              }
              sx={{
                borderRadius: 99,
                fontWeight: 700,
                boxShadow: "none",
              }}
            >
              {deleteAddressSaving
                ? "Archiving..."
                : "Archive Location"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(
            relatedPreviewModal
          )}
          onClose={() =>
            setRelatedPreviewModal(
              null
            )
          }
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>
            {relatedPreviewModal?.kind ===
            "ticket"
              ? "Service Ticket Details"
              : relatedPreviewModal?.kind ===
                "project"
              ? "Project Details"
              : "Details"}
          </DialogTitle>

          <DialogContent dividers>
            {relatedPreviewModal?.kind ===
            "ticket" ? (
              <Stack spacing={2.25}>
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    p: 2,
                    bgcolor:
                      "action.hover",

                    border: `1px solid ${alpha(
                      theme.palette.divider,
                      0.7
                    )}`,
                  }}
                >
                  <Stack spacing={1}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                      }}
                    >
                      {relatedPreviewModal
                        .item
                        .issueSummary ||
                        "Untitled ticket"}
                    </Typography>

                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Chip
                        label={`Ticket ID: ${relatedPreviewModal.item.id}`}
                        variant="outlined"
                        sx={{
                          borderRadius: 99,
                        }}
                      />

                      <Chip
                        label={formatStatusLabel(
                          relatedPreviewModal
                            .item.status
                        )}
                        color="primary"
                        variant="outlined"
                        sx={{
                          borderRadius: 99,
                        }}
                      />
                    </Stack>
                  </Stack>
                </Paper>

                <InfoRow
                  icon={
                    <LocationOnRoundedIcon color="action" />
                  }
                  label="Address"
                  primary={
                    relatedPreviewModal
                      .item
                      .serviceAddressLabel ||
                    relatedPreviewModal
                      .item
                      .serviceAddressLine1 ||
                    "—"
                  }
                  secondary={
                    relatedPreviewModal
                      .item
                      .serviceAddressLabel &&
                    relatedPreviewModal
                      .item
                      .serviceAddressLine1
                      ? relatedPreviewModal
                          .item
                          .serviceAddressLine1
                      : undefined
                  }
                />

                <InfoRow
                  icon={
                    <TaskAltRoundedIcon color="action" />
                  }
                  label="Assigned technician"
                  primary={
                    relatedPreviewModal
                      .item
                      .assignedTechnicianName ||
                    "—"
                  }
                />

                <InfoRow
                  icon={
                    <DescriptionRoundedIcon color="action" />
                  }
                  label="Details"
                  primary={
                    relatedPreviewModal
                      .item
                      .issueDetails ||
                    "No additional details."
                  }
                />

                <Box
                  sx={{
                    display: "grid",

                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                    },

                    gap: 2,
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,

                      border: `1px solid ${alpha(
                        theme.palette.divider,
                        0.8
                      )}`,
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Created
                    </Typography>

                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        mt: 0.5,
                      }}
                    >
                      {formatDateTime(
                        relatedPreviewModal
                          .item
                          .createdAt
                      )}
                    </Typography>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,

                      border: `1px solid ${alpha(
                        theme.palette.divider,
                        0.8
                      )}`,
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Last updated
                    </Typography>

                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        mt: 0.5,
                      }}
                    >
                      {formatDateTime(
                        relatedPreviewModal
                          .item
                          .updatedAt
                      )}
                    </Typography>
                  </Paper>
                </Box>
              </Stack>
            ) : relatedPreviewModal?.kind ===
              "project" ? (
              <Stack spacing={2.25}>
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 1,
                    p: 2,
                    bgcolor:
                      "action.hover",

                    border: `1px solid ${alpha(
                      theme.palette.divider,
                      0.7
                    )}`,
                  }}
                >
                  <Stack spacing={1}>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                      }}
                    >
                      {relatedPreviewModal
                        .item
                        .projectName ||
                        "Untitled project"}
                    </Typography>

                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Chip
                        label={`Project ID: ${relatedPreviewModal.item.id}`}
                        variant="outlined"
                        sx={{
                          borderRadius: 99,
                        }}
                      />

                      <Chip
                        label={formatStatusLabel(
                          relatedPreviewModal
                            .item.status
                        )}
                        color="primary"
                        variant="outlined"
                        sx={{
                          borderRadius: 99,
                        }}
                      />

                      {relatedPreviewModal
                        .item
                        .projectType ? (
                        <Chip
                          label={formatStatusLabel(
                            relatedPreviewModal
                              .item
                              .projectType
                          )}
                          variant="outlined"
                          sx={{
                            borderRadius: 99,
                          }}
                        />
                      ) : null}
                    </Stack>
                  </Stack>
                </Paper>

                <InfoRow
                  icon={
                    <LocationOnRoundedIcon color="action" />
                  }
                  label="Project location"
                  primary={
                    relatedPreviewModal
                      .item
                      .locationLabel ||
                    "—"
                  }
                />

                <InfoRow
                  icon={
                    <TaskAltRoundedIcon color="action" />
                  }
                  label="Lead / assigned"
                  primary={
                    relatedPreviewModal
                      .item
                      .assignedLeadName ||
                    "—"
                  }
                />

                <InfoRow
                  icon={
                    <DescriptionRoundedIcon color="action" />
                  }
                  label="Description"
                  primary={
                    relatedPreviewModal
                      .item
                      .description ||
                    "No additional details."
                  }
                />

                <Box
                  sx={{
                    display: "grid",

                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                    },

                    gap: 2,
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,

                      border: `1px solid ${alpha(
                        theme.palette.divider,
                        0.8
                      )}`,
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Created
                    </Typography>

                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        mt: 0.5,
                      }}
                    >
                      {formatDateTime(
                        relatedPreviewModal
                          .item
                          .createdAt
                      )}
                    </Typography>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      p: 2,

                      border: `1px solid ${alpha(
                        theme.palette.divider,
                        0.8
                      )}`,
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Last updated
                    </Typography>

                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        mt: 0.5,
                      }}
                    >
                      {formatDateTime(
                        relatedPreviewModal
                          .item
                          .updatedAt
                      )}
                    </Typography>
                  </Paper>
                </Box>
              </Stack>
            ) : null}
          </DialogContent>

          <DialogActions
            sx={{
              px: 3,
              py: 2,
            }}
          >
            <Button
              onClick={() =>
                setRelatedPreviewModal(
                  null
                )
              }
              sx={{
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              Close
            </Button>

            {relatedPreviewModal?.kind ===
            "ticket" ? (
              <Button
                component={Link}
                href={`/service-tickets/${relatedPreviewModal.item.id}`}
                variant="outlined"
                startIcon={
                  <OpenInNewRoundedIcon />
                }
                sx={{
                  borderRadius: 99,
                  fontWeight: 700,
                }}
              >
                Open Ticket Page
              </Button>
            ) : null}

            {relatedPreviewModal?.kind ===
            "project" ? (
              <Button
                component={Link}
                href={`/projects/${relatedPreviewModal.item.id}`}
                variant="outlined"
                startIcon={
                  <OpenInNewRoundedIcon />
                }
                sx={{
                  borderRadius: 99,
                  fontWeight: 700,
                }}
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