// app/service-tickets/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";

import ConfirmationNumberRoundedIcon from "@mui/icons-material/ConfirmationNumberRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import BuildCircleRoundedIcon from "@mui/icons-material/BuildCircleRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import { formatDateTimeRange12h } from "../../src/lib/time-format";
import type { ServiceTicket } from "../../src/types/service-ticket";

type StatusFilter =
  | "all"
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "invoiced"
  | "cancelled";

type AgingTone =
  | "default"
  | "warning"
  | "critical"
  | "success"
  | "muted";

type ServiceTicketListItem = ServiceTicket & {
  status?: string;
  preferredCustomer?: boolean;
  openedAt?: unknown;
  firstDispatchedAt?: unknown;
  firstStartedAt?: unknown;
  firstCompletedAt?: unknown;
  firstReadyToBillAt?: unknown;
  firstInvoicedAt?: unknown;
  closedAt?: unknown;
  billing?: {
    status?: string | null;
    readyToBillAt?: unknown;
    qboSyncedAt?: unknown;
    qboInvoiceStatus?: string | null;
  } | null;
};

type CustomerPreferenceLookup = Record<string, boolean>;

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
            maxWidth: 920,
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

function SectionSurface({ children }: { children: React.ReactNode }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        overflow: "hidden",
        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      {children}
    </Card>
  );
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeStr(value: unknown) {
  return String(value ?? "");
}

function getStatusLabel(status?: string) {
  switch (normalize(status)) {
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
      return "Unknown";
  }
}

function getScheduleText(ticket: ServiceTicketListItem) {
  return formatDateTimeRange12h(
    ticket.scheduledDate,
    ticket.scheduledStartTime,
    ticket.scheduledEndTime
  );
}

function formatEstimatedDurationHours(minutes?: number | null) {
  const rawMinutes = Number(minutes || 0);

  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) return "—";

  const hours = rawMinutes / 60;

  if (Number.isInteger(hours)) {
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }

  const rounded = Math.round(hours * 100) / 100;
  const display = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.0+$/, "");

  return `${display} hrs`;
}

function isAssigned(ticket: ServiceTicketListItem) {
  return Boolean(
    ticket.assignedTechnicianId ||
      ticket.assignedTechnicianName
  );
}

function statusRankForSort(status: string) {
  const s = normalize(status);

  if (s === "new") return 0;
  if (s === "follow_up") return 1;
  if (s === "scheduled") return 2;
  if (s === "in_progress") return 3;
  if (s === "completed") return 4;
  if (s === "invoiced") return 5;
  if (s === "cancelled") return 6;

  return 99;
}

function dateFromUnknown(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };

    if (typeof maybeTimestamp.toDate === "function") {
      const parsed = maybeTimestamp.toDate();
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    const seconds =
      typeof maybeTimestamp.seconds === "number"
        ? maybeTimestamp.seconds
        : typeof maybeTimestamp._seconds === "number"
          ? maybeTimestamp._seconds
          : null;

    if (seconds !== null) {
      const parsed = new Date(seconds * 1000);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
  }

  return null;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetweenLocal(start: Date, end: Date) {
  const startMs = startOfLocalDay(start).getTime();
  const endMs = startOfLocalDay(end).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  return Math.max(0, Math.floor((endMs - startMs) / oneDayMs));
}

function getTicketOpenedDate(ticket: ServiceTicketListItem) {
  return dateFromUnknown(ticket.openedAt) || dateFromUnknown(ticket.createdAt);
}

function getTicketLifecycleEndDate(ticket: ServiceTicketListItem) {
  const status = normalize(ticket.status);

  if (status === "invoiced") {
    return (
      dateFromUnknown(ticket.closedAt) ||
      dateFromUnknown(ticket.firstInvoicedAt) ||
      dateFromUnknown(ticket.billing?.qboSyncedAt) ||
      dateFromUnknown(ticket.updatedAt)
    );
  }

  if (status === "cancelled") {
    return dateFromUnknown(ticket.closedAt) || dateFromUnknown(ticket.updatedAt);
  }

  if (status === "completed") {
    return (
      dateFromUnknown(ticket.firstReadyToBillAt) ||
      dateFromUnknown(ticket.billing?.readyToBillAt) ||
      dateFromUnknown(ticket.firstCompletedAt) ||
      dateFromUnknown(ticket.updatedAt)
    );
  }

  return null;
}

function isNewUntouchedTicket(ticket: ServiceTicketListItem) {
  const status = normalize(ticket.status);

  const scheduled = Boolean(
    ticket.scheduledDate ||
      ticket.scheduledStartTime ||
      ticket.scheduledEndTime
  );

  return status === "new" && !isAssigned(ticket) && !scheduled;
}

function formatLifecycleDaysLabel(prefix: string, days: number) {
  if (prefix === "Waiting") {
    if (days === 0) return "Waiting today";
    if (days === 1) return "Waiting 1 day";
    return `Waiting ${days} days`;
  }

  if (prefix === "Open") {
    if (days === 0) return "Open today";
    if (days === 1) return "Open 1 day";
    return `Open ${days} days`;
  }

  if (prefix === "Ready after") {
    if (days === 0) return "Ready same day";
    if (days === 1) return "Ready after 1 day";
    return `Ready after ${days} days`;
  }

  if (prefix === "Closed in") {
    if (days === 0) return "Closed same day";
    if (days === 1) return "Closed in 1 day";
    return `Closed in ${days} days`;
  }

  if (days === 0) return `${prefix} today`;
  if (days === 1) return `${prefix} 1 day`;

  return `${prefix} ${days} days`;
}

function getTicketAgeInfo(ticket: ServiceTicketListItem) {
  const openedDate = getTicketOpenedDate(ticket);

  if (!openedDate) return null;

  const status = normalize(ticket.status);
  const endDate = getTicketLifecycleEndDate(ticket);

  const isClosedLike =
    status === "completed" ||
    status === "invoiced" ||
    status === "cancelled";

  const days = daysBetweenLocal(openedDate, endDate || new Date());

  let labelPrefix = "Open";

  if (isNewUntouchedTicket(ticket)) {
    labelPrefix = "Waiting";
  } else if (status === "completed") {
    labelPrefix = "Ready after";
  } else if (status === "invoiced" || status === "cancelled") {
    labelPrefix = "Closed in";
  }

  const critical = !isClosedLike && days >= 14;
  const warning = !isClosedLike && days >= 7;

  if (critical) {
    return {
      days,
      tone: "critical" as AgingTone,
      label: formatLifecycleDaysLabel(labelPrefix, days),
      chipSx: {
        color: "#FFE1E4",
        backgroundColor: "rgba(255,42,54,0.10)",
        border: "1px solid rgba(255,42,54,0.24)",
      },
      cardSx: {
        border: "1.5px solid rgba(255,42,54,0.46)",
        backgroundColor: "rgba(255,42,54,0.035)",
      },
    };
  }

  if (warning) {
    return {
      days,
      tone: "warning" as AgingTone,
      label: formatLifecycleDaysLabel(labelPrefix, days),
      chipSx: {
        color: "#FFEDD5",
        backgroundColor: "rgba(245,158,11,0.11)",
        border: "1px solid rgba(245,158,11,0.24)",
      },
      cardSx: {
        border: "1.5px solid rgba(245,158,11,0.40)",
        backgroundColor: "rgba(245,158,11,0.032)",
      },
    };
  }

  if (status === "completed") {
    return {
      days,
      tone: "success" as AgingTone,
      label: formatLifecycleDaysLabel(labelPrefix, days),
      chipSx: {
        color: "#DFF7E7",
        backgroundColor: "rgba(52,199,89,0.10)",
        border: "1px solid rgba(52,199,89,0.22)",
      },
      cardSx: {
        border: "1px solid rgba(52,199,89,0.24)",
        backgroundColor: "background.paper",
      },
    };
  }

  if (status === "invoiced" || status === "cancelled") {
    return {
      days,
      tone: "muted" as AgingTone,
      label: formatLifecycleDaysLabel(labelPrefix, days),
      chipSx: {
        color: "#E2E8F0",
        backgroundColor: "rgba(148,163,184,0.10)",
        border: "1px solid rgba(148,163,184,0.20)",
      },
      cardSx: {
        border: "1px solid rgba(148,163,184,0.22)",
        backgroundColor: "background.paper",
      },
    };
  }

  return {
    days,
    tone: "default" as AgingTone,
    label: formatLifecycleDaysLabel(labelPrefix, days),
    chipSx: {
      color: "#DCEBFF",
      backgroundColor: "rgba(13,126,242,0.08)",
      border: "1px solid rgba(13,126,242,0.20)",
    },
    cardSx: {
      border: "1px solid rgba(13,126,242,0.22)",
      backgroundColor: "background.paper",
    },
  };
}

function statusTone(status?: string) {
  const s = normalize(status);

  if (s === "new") {
    return {
      label: "New",
      sx: {
        color: "#DCEBFF",
        backgroundColor: "rgba(13,126,242,0.10)",
        border: "1px solid rgba(13,126,242,0.22)",
      },
    };
  }

  if (s === "scheduled") {
    return {
      label: "Scheduled",
      sx: {
        color: "#D8F0FF",
        backgroundColor: "rgba(71,184,255,0.12)",
        border: "1px solid rgba(71,184,255,0.24)",
      },
    };
  }

  if (s === "in_progress") {
    return {
      label: "In Progress",
      sx: {
        color: "#DFF7E7",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "1px solid rgba(52,199,89,0.24)",
      },
    };
  }

  if (s === "follow_up") {
    return {
      label: "Follow Up",
      sx: {
        color: "#FFEDD5",
        backgroundColor: "rgba(245,158,11,0.10)",
        border: "1px solid rgba(245,158,11,0.22)",
      },
    };
  }

  if (s === "completed") {
    return {
      label: "Completed",
      sx: {
        color: "#E2E8F0",
        backgroundColor: "rgba(148,163,184,0.12)",
        border: "1px solid rgba(148,163,184,0.20)",
      },
    };
  }

  if (s === "invoiced") {
    return {
      label: "Invoiced",
      sx: {
        color: "#DFF7E7",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "1px solid rgba(52,199,89,0.24)",
      },
    };
  }

  if (s === "cancelled") {
    return {
      label: "Cancelled",
      sx: {
        color: "#FFE1E4",
        backgroundColor: "rgba(255,42,54,0.10)",
        border: "1px solid rgba(255,42,54,0.20)",
      },
    };
  }

  return {
    label: getStatusLabel(status),
    sx: {
      color: "#E2E8F0",
      backgroundColor: "rgba(148,163,184,0.12)",
      border: "1px solid rgba(148,163,184,0.20)",
    },
  };
}

export default function ServiceTicketsPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const role = String(appUser?.role || "");

  const isFieldUser =
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  const defaultStatus: StatusFilter = isFieldUser ? "new" : "all";
  const defaultHideCompleted = isFieldUser ? true : false;

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicketListItem[]>([]);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(defaultStatus);

  const [assignedFilter, setAssignedFilter] =
    useState<"all" | "assigned" | "unassigned">("all");

  const [scheduleFilter, setScheduleFilter] =
    useState<"all" | "scheduled" | "unscheduled">("all");

  const [hideCompleted, setHideCompleted] =
    useState<boolean>(defaultHideCompleted);

  const [availableOnly, setAvailableOnly] =
    useState<boolean>(true);

  const [preferredOnly, setPreferredOnly] =
    useState<boolean>(false);

  useEffect(() => {
    async function loadTickets() {
      try {
        setLoading(true);
        setError("");

        const ticketQuery = query(
          collection(db, "serviceTickets"),
          orderBy("createdAt", "desc")
        );

        const [ticketSnap, customerSnap] = await Promise.all([
          getDocs(ticketQuery),
          getDocs(collection(db, "customers")),
        ]);

        const preferredLookup: CustomerPreferenceLookup = {};

        customerSnap.docs.forEach((customerDoc) => {
          const customerData = customerDoc.data() as any;

          preferredLookup[customerDoc.id] = Boolean(
            customerData.preferredCustomer
          );
        });

        const items: ServiceTicketListItem[] =
          ticketSnap.docs.map((docSnap) => {
            const data = docSnap.data() as any;
            const customerId = data.customerId ?? "";

            return {
              id: docSnap.id,
              customerId,
              customerDisplayName: data.customerDisplayName ?? "",
              preferredCustomer: Boolean(
                preferredLookup[customerId]
              ),
              serviceAddressId: data.serviceAddressId ?? undefined,
              serviceAddressLabel: data.serviceAddressLabel ?? undefined,
              serviceAddressLine1: data.serviceAddressLine1 ?? "",
              serviceAddressLine2: data.serviceAddressLine2 ?? undefined,
              serviceCity: data.serviceCity ?? "",
              serviceState: data.serviceState ?? "",
              servicePostalCode: data.servicePostalCode ?? "",
              issueSummary: data.issueSummary ?? "",
              issueDetails: data.issueDetails ?? undefined,
              status: data.status ?? "new",
              estimatedDurationMinutes:
                data.estimatedDurationMinutes ?? 0,
              scheduledDate: data.scheduledDate ?? undefined,
              scheduledStartTime: data.scheduledStartTime ?? undefined,
              scheduledEndTime: data.scheduledEndTime ?? undefined,
              assignedTechnicianId:
                data.assignedTechnicianId ?? undefined,
              assignedTechnicianName:
                data.assignedTechnicianName ?? undefined,
              internalNotes: data.internalNotes ?? undefined,
              active: data.active ?? true,
              createdAt: data.createdAt ?? undefined,
              updatedAt: data.updatedAt ?? undefined,
              openedAt: data.openedAt ?? undefined,
              firstDispatchedAt: data.firstDispatchedAt ?? undefined,
              firstStartedAt: data.firstStartedAt ?? undefined,
              firstCompletedAt: data.firstCompletedAt ?? undefined,
              firstReadyToBillAt: data.firstReadyToBillAt ?? undefined,
              firstInvoicedAt: data.firstInvoicedAt ?? undefined,
              closedAt: data.closedAt ?? undefined,
              billing: data.billing ?? null,
            };
          });

        setTickets(items);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load service tickets."
        );
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  const preferredTicketCount = useMemo(() => {
    return tickets.filter((ticket) => ticket.preferredCustomer).length;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const base = tickets.filter((ticket) => {
      const status = normalize(ticket.status);

      if (
        hideCompleted &&
        (
          status === "completed" ||
          status === "invoiced" ||
          status === "cancelled"
        )
      ) {
        return false;
      }

      if (preferredOnly && !ticket.preferredCustomer) {
        return false;
      }

      if (availableOnly) {
        const assigned = isAssigned(ticket);

        if (assigned) return false;

        if (!(status === "new" || status === "scheduled")) {
          return false;
        }
      }

      if (
        statusFilter !== "all" &&
        normalize(ticket.status) !== statusFilter
      ) {
        return false;
      }

      const assigned = isAssigned(ticket);

      if (assignedFilter === "assigned" && !assigned) {
        return false;
      }

      if (assignedFilter === "unassigned" && assigned) {
        return false;
      }

      const scheduled = Boolean(
        ticket.scheduledDate ||
          ticket.scheduledStartTime ||
          ticket.scheduledEndTime
      );

      if (scheduleFilter === "scheduled" && !scheduled) {
        return false;
      }

      if (scheduleFilter === "unscheduled" && scheduled) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const ageInfo = getTicketAgeInfo(ticket);

      const preferredSearchText = ticket.preferredCustomer
        ? "preferred preferred customer priority customer"
        : "";

      const haystack = [
        ticket.issueSummary,
        ticket.issueDetails,
        ticket.customerDisplayName,
        ticket.serviceAddressLabel,
        ticket.serviceAddressLine1,
        ticket.serviceAddressLine2,
        ticket.serviceCity,
        ticket.serviceState,
        ticket.servicePostalCode,
        ticket.assignedTechnicianName,
        ticket.assignedTechnicianId,
        ticket.scheduledDate,
        ticket.scheduledStartTime,
        ticket.scheduledEndTime,
        ticket.internalNotes,
        ticket.status,
        ageInfo?.label,
        preferredSearchText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return [...base].sort((a, b) => {
      const aAssigned = isAssigned(a);
      const bAssigned = isAssigned(b);

      if (aAssigned !== bAssigned) {
        return aAssigned ? 1 : -1;
      }

      const aStatus = normalize(a.status);
      const bStatus = normalize(b.status);

      const aIsNew = aStatus === "new";
      const bIsNew = bStatus === "new";

      if (aIsNew !== bIsNew) {
        return aIsNew ? -1 : 1;
      }

      const ra = statusRankForSort(aStatus);
      const rb = statusRankForSort(bStatus);

      if (ra !== rb) {
        return ra - rb;
      }

      const ac = safeStr(a.createdAt);
      const bc = safeStr(b.createdAt);

      return bc.localeCompare(ac);
    });
  }, [
    tickets,
    searchText,
    statusFilter,
    assignedFilter,
    scheduleFilter,
    hideCompleted,
    availableOnly,
    preferredOnly,
  ]);

  function clearFilters() {
    setSearchText("");
    setAssignedFilter("all");
    setScheduleFilter("all");
    setStatusFilter(defaultStatus);
    setHideCompleted(defaultHideCompleted);
    setAvailableOnly(false);
    setPreferredOnly(false);
  }

  return (
    <ProtectedPage fallbackTitle="Service Tickets">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={4}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", lg: "center" }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <Chip
                    size="small"
                    icon={
                      <ConfirmationNumberRoundedIcon
                        sx={{ fontSize: 16 }}
                      />
                    }
                    label="Service Tickets"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
                      backgroundColor: alpha(
                        theme.palette.primary.main,
                        0.12
                      ),
                      border: `1px solid ${alpha(
                        theme.palette.primary.main,
                        0.22
                      )}`,
                    }}
                  />
                </Stack>

                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: "1.65rem", md: "2.1rem" },
                    lineHeight: 1.05,
                    fontWeight: 800,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Service tickets
                </Typography>

                <Typography
                  sx={{
                    mt: 0.9,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 960,
                  }}
                >
                  Search by customer, issue, address, technician, status,
                  schedule, open age, and preferred customer status to
                  manage the service work queue.
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/service-tickets/new"
                variant="contained"
                startIcon={<AddRoundedIcon />}
                sx={{
                  minHeight: 40,
                  borderRadius: 2,
                }}
              >
                New Service Ticket
              </Button>
            </Stack>

            <SectionSurface>
              <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={2.25}>
                  <SectionHeader
                    title="Filters"
                    subtitle="Refine the work queue by search text, status, assignment state, scheduling state, preferred customer designation, and customer waiting age."
                  />

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "2fr 1fr",
                        xl: "2fr 1fr 1fr 1fr",
                      },
                      gap: 1.5,
                    }}
                  >
                    <TextField
                      label="Search"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Issue, customer, address, tech, preferred, waiting..."
                      size="small"
                      fullWidth
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchRoundedIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <FormControl size="small" fullWidth>
                      <InputLabel>Status</InputLabel>
                      <Select
                        label="Status"
                        value={statusFilter}
                        onChange={(e: SelectChangeEvent) =>
                          setStatusFilter(
                            e.target.value as StatusFilter
                          )
                        }
                      >
                        <MenuItem value="all">All Statuses</MenuItem>
                        <MenuItem value="new">New</MenuItem>
                        <MenuItem value="scheduled">Scheduled</MenuItem>
                        <MenuItem value="in_progress">In Progress</MenuItem>
                        <MenuItem value="follow_up">Follow Up</MenuItem>
                        <MenuItem value="completed">Completed</MenuItem>
                        <MenuItem value="invoiced">Invoiced</MenuItem>
                        <MenuItem value="cancelled">Cancelled</MenuItem>
                      </Select>
                    </FormControl>

                    <FormControl size="small" fullWidth>
                      <InputLabel>Assignment</InputLabel>
                      <Select
                        label="Assignment"
                        value={assignedFilter}
                        onChange={(e: SelectChangeEvent) =>
                          setAssignedFilter(
                            e.target.value as
                              | "all"
                              | "assigned"
                              | "unassigned"
                          )
                        }
                      >
                        <MenuItem value="all">All Tickets</MenuItem>
                        <MenuItem value="assigned">Assigned Only</MenuItem>
                        <MenuItem value="unassigned">Unassigned Only</MenuItem>
                      </Select>
                    </FormControl>

                    <FormControl size="small" fullWidth>
                      <InputLabel>Schedule</InputLabel>
                      <Select
                        label="Schedule"
                        value={scheduleFilter}
                        onChange={(e: SelectChangeEvent) =>
                          setScheduleFilter(
                            e.target.value as
                              | "all"
                              | "scheduled"
                              | "unscheduled"
                          )
                        }
                      >
                        <MenuItem value="all">All Tickets</MenuItem>
                        <MenuItem value="scheduled">Scheduled Only</MenuItem>
                        <MenuItem value="unscheduled">Unscheduled Only</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Divider />

                  <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "flex-start", lg: "center" }}
                    justifyContent="space-between"
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.85,
                          borderRadius: 4,
                          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                          backgroundColor: alpha("#FFFFFF", 0.02),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TuneRoundedIcon
                            sx={{
                              fontSize: 18,
                              color: "text.secondary",
                            }}
                          />

                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600 }}
                          >
                            Available Tickets
                          </Typography>

                          <Switch
                            size="small"
                            checked={availableOnly}
                            onChange={(e) =>
                              setAvailableOnly(e.target.checked)
                            }
                          />
                        </Stack>
                      </Box>

                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.85,
                          borderRadius: 4,
                          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                          backgroundColor: alpha("#FFFFFF", 0.02),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CheckCircleRoundedIcon
                            sx={{
                              fontSize: 18,
                              color: "text.secondary",
                            }}
                          />

                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600 }}
                          >
                            Hide Completed
                          </Typography>

                          <Switch
                            size="small"
                            checked={hideCompleted}
                            onChange={(e) =>
                              setHideCompleted(e.target.checked)
                            }
                          />
                        </Stack>
                      </Box>

                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.85,
                          borderRadius: 4,
                          border: preferredOnly
                            ? `1px solid ${alpha(
                                theme.palette.success.main,
                                0.45
                              )}`
                            : `1px solid ${alpha("#FFFFFF", 0.08)}`,
                          backgroundColor: preferredOnly
                            ? alpha(theme.palette.success.main, 0.08)
                            : alpha("#FFFFFF", 0.02),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <StarRoundedIcon
                            sx={{
                              fontSize: 18,
                              color: preferredOnly
                                ? "#2CF27A"
                                : "text.secondary",
                            }}
                          />

                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600 }}
                          >
                            Preferred Customers Only
                          </Typography>

                          <Switch
                            size="small"
                            color="success"
                            checked={preferredOnly}
                            onChange={(e) =>
                              setPreferredOnly(e.target.checked)
                            }
                          />
                        </Stack>
                      </Box>
                    </Stack>

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      {preferredTicketCount > 0 ? (
                        <Chip
                          size="small"
                          icon={
                            <StarRoundedIcon
                              sx={{ fontSize: 15 }}
                            />
                          }
                          label={`${preferredTicketCount} preferred`}
                          sx={{
                            borderRadius: 1.5,
                            fontWeight: 800,
                            color: "#E8FFF1",
                            backgroundColor: "rgba(0,200,95,0.12)",
                            border: "1px solid rgba(0,255,120,0.38)",
                            "& .MuiChip-icon": {
                              color: "#39FF88",
                            },
                          }}
                        />
                      ) : null}

                      <Chip
                        size="small"
                        label={`Showing ${filteredTickets.length} of ${tickets.length}`}
                        variant="outlined"
                        sx={{
                          borderRadius: 1.5,
                          fontWeight: 700,
                        }}
                      />

                      <Button
                        type="button"
                        onClick={clearFilters}
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          minHeight: 36,
                        }}
                      >
                        Clear Filters
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Box>
            </SectionSurface>

            {error ? (
              <Alert
                severity="error"
                variant="outlined"
                icon={<ErrorOutlineRoundedIcon />}
              >
                {error}
              </Alert>
            ) : null}

            {loading ? (
              <SectionSurface>
                <Box sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    spacing={1.25}
                    alignItems="center"
                  >
                    <CircularProgress size={20} thickness={5} />

                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Loading service tickets...
                    </Typography>
                  </Stack>
                </Box>
              </SectionSurface>
            ) : null}

            {!loading && !error && filteredTickets.length === 0 ? (
              <SectionSurface>
                <Box sx={{ p: 3 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    No matching service tickets found.
                  </Typography>
                </Box>
              </SectionSurface>
            ) : null}

            {!loading && !error && filteredTickets.length > 0 ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 1.5,
                }}
              >
                {filteredTickets.map((ticket) => {
                  const assigned = isAssigned(ticket);
                  const tone = statusTone(ticket.status);
                  const ageInfo = getTicketAgeInfo(ticket);

                  const preferred = Boolean(ticket.preferredCustomer);

                  const agingOverridesPreferred =
                    ageInfo?.tone === "critical" ||
                    ageInfo?.tone === "warning";

                  const cardBorder = agingOverridesPreferred
                    ? ageInfo?.cardSx.border
                    : preferred
                      ? "1.5px solid rgba(0,255,120,0.58)"
                      : ageInfo?.cardSx.border ||
                        `1px solid ${alpha("#FFFFFF", 0.08)}`;

                  const cardBackground = agingOverridesPreferred
                    ? ageInfo?.cardSx.backgroundColor
                    : preferred
                      ? `linear-gradient(
                          145deg,
                          rgba(0,110,50,0.22) 0%,
                          rgba(0,180,85,0.09) 52%,
                          ${theme.palette.background.paper} 100%
                        )`
                      : ageInfo?.cardSx.backgroundColor ||
                        "background.paper";

                  return (
                    <Card
                      key={ticket.id}
                      elevation={0}
                      sx={{
                        height: "100%",
                        borderRadius: 1,
                        overflow: "hidden",
                        position: "relative",
                        border: cardBorder,
                        background: cardBackground,
                        boxShadow:
                          preferred && !agingOverridesPreferred
                            ? "0 0 20px rgba(0,255,120,0.08)"
                            : "none",
                        transition:
                          "border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",

                        "&:hover": {
                          transform: "translateY(-1px)",

                          boxShadow:
                            ageInfo?.tone === "critical"
                              ? "0 0 0 1px rgba(255,42,54,0.18)"
                              : ageInfo?.tone === "warning"
                                ? "0 0 0 1px rgba(245,158,11,0.18)"
                                : preferred
                                  ? "0 0 0 1px rgba(0,255,120,0.26), 0 0 24px rgba(0,255,120,0.10)"
                                  : "0 0 0 1px rgba(255,255,255,0.06)",
                        },

                        ...(preferred
                          ? {
                              "&::before": {
                                content: '""',
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: 4,
                                height: "100%",
                                backgroundColor: "#18E86E",
                                zIndex: 2,
                              },
                            }
                          : {}),
                      }}
                    >
                      <CardActionArea
                        component={Link}
                        href={`/service-tickets/${ticket.id}`}
                        sx={{
                          height: "100%",
                          display: "block",
                        }}
                      >
                        <CardContent
                          sx={{
                            p: { xs: 2, md: 2.25 },
                            pl: preferred
                              ? { xs: 2.25, md: 2.5 }
                              : undefined,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            "&:last-child": {
                              pb: { xs: 2, md: 2.25 },
                            },
                          }}
                        >
                          <Stack spacing={1.5} sx={{ height: "100%" }}>
                            <Stack
                              direction="row"
                              spacing={1.25}
                              justifyContent="space-between"
                              alignItems="flex-start"
                            >
                              <Stack
                                direction="row"
                                spacing={1.25}
                                sx={{
                                  minWidth: 0,
                                  flex: 1,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 3,
                                    display: "grid",
                                    placeItems: "center",
                                    flexShrink: 0,
                                    backgroundColor: preferred
                                      ? "rgba(0,180,85,0.18)"
                                      : alpha(
                                          theme.palette.primary.main,
                                          0.12
                                        ),
                                    color: preferred
                                      ? "#2CF27A"
                                      : theme.palette.primary.light,
                                  }}
                                >
                                  {preferred ? (
                                    <StarRoundedIcon
                                      sx={{ fontSize: 22 }}
                                    />
                                  ) : (
                                    <BuildCircleRoundedIcon
                                      sx={{ fontSize: 22 }}
                                    />
                                  )}
                                </Box>

                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="subtitle1"
                                    sx={{
                                      fontWeight: 800,
                                      lineHeight: 1.2,
                                      letterSpacing: "-0.01em",
                                    }}
                                  >
                                    {ticket.issueSummary || "Service Ticket"}
                                  </Typography>

                                  <Typography
                                    variant="body2"
                                    sx={{
                                      mt: 0.45,
                                      color: "text.secondary",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {ticket.customerDisplayName || "—"}
                                  </Typography>
                                </Box>
                              </Stack>

                              <Stack
                                direction="row"
                                spacing={0.75}
                                flexWrap="wrap"
                                useFlexGap
                                justifyContent="flex-end"
                              >
                                {ageInfo ? (
                                  <Chip
                                    size="small"
                                    icon={
                                      <AccessTimeRoundedIcon
                                        sx={{ fontSize: 15 }}
                                      />
                                    }
                                    label={ageInfo.label}
                                    sx={{
                                      borderRadius: 1.5,
                                      fontWeight: 800,
                                      "& .MuiChip-icon": {
                                        color: "inherit",
                                      },
                                      ...ageInfo.chipSx,
                                    }}
                                  />
                                ) : null}

                                <Chip
                                  size="small"
                                  label={tone.label}
                                  sx={{
                                    borderRadius: 1.5,
                                    fontWeight: 700,
                                    ...tone.sx,
                                  }}
                                />
                              </Stack>
                            </Stack>

                            <Divider />

                            <Stack spacing={1.1}>
                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                              >
                                <PlaceRoundedIcon
                                  sx={{
                                    fontSize: 16,
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                />

                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "text.secondary",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {ticket.serviceAddressLine1 || "—"}
                                </Typography>
                              </Stack>

                              <Typography
                                variant="body2"
                                sx={{
                                  pl: 3,
                                  color: "text.secondary",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {ticket.serviceCity || "—"},{" "}
                                {ticket.serviceState || "—"}{" "}
                                {ticket.servicePostalCode || ""}
                              </Typography>

                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                              >
                                <ScheduleRoundedIcon
                                  sx={{
                                    fontSize: 16,
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                />

                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {getScheduleText(ticket)}
                                </Typography>
                              </Stack>

                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                              >
                                <BuildCircleRoundedIcon
                                  sx={{
                                    fontSize: 16,
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                />

                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Estimated Duration:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{
                                      color: "text.primary",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {formatEstimatedDurationHours(
                                      ticket.estimatedDurationMinutes
                                    )}
                                  </Typography>
                                </Typography>
                              </Stack>

                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                              >
                                <AssignmentIndRoundedIcon
                                  sx={{
                                    fontSize: 16,
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                />

                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Assigned To:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{
                                      color: "text.primary",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {ticket.assignedTechnicianName ||
                                      (assigned ? "Assigned" : "—")}
                                  </Typography>
                                </Typography>
                              </Stack>
                            </Stack>

                            <Box sx={{ flex: 1 }} />

                            <Divider />

                            <Stack
                              direction="row"
                              spacing={0.75}
                              alignItems="center"
                              sx={{
                                color: preferred
                                  ? "#70F7A4"
                                  : "primary.light",
                                pt: 0.25,
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 700,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                Open ticket
                              </Typography>

                              <ArrowForwardRoundedIcon
                                sx={{ fontSize: 14 }}
                              />
                            </Stack>
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}