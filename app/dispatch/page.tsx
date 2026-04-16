"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type {
  ServiceTicket,
  ServiceTicketStatus,
} from "../../src/types/service-ticket";
import type { AppUser } from "../../src/types/app-user";

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUser["role"];
};

type TicketDraft = {
  status: ServiceTicketStatus;
  assignedTechnicianId: string;
};

type SectionConfig = {
  id: "needs_action" | "scheduled_active" | "recent_history";
  title: string;
  description: string;
  statuses: ServiceTicketStatus[];
};

const RECENT_HISTORY_DAYS = 7;

const STATUS_LABELS: Record<ServiceTicketStatus, string> = {
  new: "New",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  follow_up: "Follow Up",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const OPEN_STATUSES: ServiceTicketStatus[] = [
  "new",
  "scheduled",
  "in_progress",
  "follow_up",
];

const HISTORY_STATUSES: ServiceTicketStatus[] = [
  "completed",
  "invoiced",
  "cancelled",
];

const SECTIONS: SectionConfig[] = [
  {
    id: "needs_action",
    title: "Needs Action",
    description: "New tickets and follow-up work that needs dispatch attention.",
    statuses: ["new", "follow_up"],
  },
  {
    id: "scheduled_active",
    title: "Scheduled / Active",
    description: "Tickets already scheduled or currently being worked.",
    statuses: ["scheduled", "in_progress"],
  },
  {
    id: "recent_history",
    title: "Recent History",
    description: `Completed, invoiced, and cancelled tickets from the last ${RECENT_HISTORY_DAYS} days.`,
    statuses: ["completed", "invoiced", "cancelled"],
  },
];

function parseDateMs(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatAddress(ticket: ServiceTicket) {
  const cityStateZip = [ticket.serviceCity, ticket.serviceState, ticket.servicePostalCode]
    .filter(Boolean)
    .join(" ");

  return [ticket.serviceAddressLine1, cityStateZip].filter(Boolean).join(", ");
}

function getScheduleText(ticket: ServiceTicket) {
  if (!ticket.scheduledDate && !ticket.scheduledStartTime && !ticket.scheduledEndTime) {
    return "Unscheduled";
  }

  const datePart = ticket.scheduledDate || "No date";
  const startPart = ticket.scheduledStartTime || "—";
  const endPart = ticket.scheduledEndTime || "—";

  if (!ticket.scheduledStartTime && !ticket.scheduledEndTime) {
    return datePart;
  }

  return `${datePart} • ${startPart}–${endPart}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getStatusTone(
  theme: ReturnType<typeof useTheme>,
  status: ServiceTicketStatus
) {
  switch (status) {
    case "new":
      return {
        fg: theme.palette.primary.dark,
        bg: alpha(theme.palette.primary.main, 0.12),
      };
    case "scheduled":
      return {
        fg: theme.palette.info.dark,
        bg: alpha(theme.palette.info.main, 0.14),
      };
    case "in_progress":
      return {
        fg: theme.palette.warning.dark,
        bg: alpha(theme.palette.warning.main, 0.18),
      };
    case "follow_up":
      return {
        fg: theme.palette.secondary.dark,
        bg: alpha(theme.palette.secondary.main, 0.16),
      };
    case "completed":
      return {
        fg: theme.palette.success.dark,
        bg: alpha(theme.palette.success.main, 0.14),
      };
    case "invoiced":
      return {
        fg: theme.palette.success.dark,
        bg: alpha(theme.palette.success.main, 0.18),
      };
    case "cancelled":
      return {
        fg: theme.palette.text.secondary,
        bg: alpha(theme.palette.text.secondary, 0.12),
      };
    default:
      return {
        fg: theme.palette.text.primary,
        bg: alpha(theme.palette.text.primary, 0.08),
      };
  }
}

function statusMatchesFilter(
  ticketStatus: ServiceTicketStatus,
  filterStatus: string
) {
  if (filterStatus === "all") return true;
  if (filterStatus === "open") return OPEN_STATUSES.includes(ticketStatus);
  if (filterStatus === "history") return HISTORY_STATUSES.includes(ticketStatus);
  return ticketStatus === filterStatus;
}

function ticketMatchesSearch(ticket: ServiceTicket, search: string) {
  if (!search) return true;

  const haystack = normalize(
    [
      ticket.issueSummary,
      ticket.customerDisplayName,
      ticket.serviceAddressLine1,
      ticket.serviceCity,
      ticket.serviceState,
      ticket.assignedTechnicianName,
      ticket.secondaryTechnicianName,
      ticket.serviceAddressLabel,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return haystack.includes(search);
}

function sortTicketsForDispatch(a: ServiceTicket, b: ServiceTicket) {
  const aScheduled = parseDateMs(
    a.scheduledDate ? `${a.scheduledDate}T${a.scheduledStartTime || "00:00"}` : ""
  );
  const bScheduled = parseDateMs(
    b.scheduledDate ? `${b.scheduledDate}T${b.scheduledStartTime || "00:00"}` : ""
  );

  if (aScheduled && bScheduled && aScheduled !== bScheduled) {
    return aScheduled - bScheduled;
  }

  if (aScheduled && !bScheduled) return -1;
  if (!aScheduled && bScheduled) return 1;

  const aUpdated = parseDateMs(a.updatedAt || a.createdAt);
  const bUpdated = parseDateMs(b.updatedAt || b.createdAt);

  return bUpdated - aUpdated;
}

export default function DispatchBoardPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState("");

  const [techniciansLoading, setTechniciansLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techniciansError, setTechniciansError] = useState("");

  const [drafts, setDrafts] = useState<Record<string, TicketDraft>>({});
  const [savingTicketId, setSavingTicketId] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [showRecentHistory, setShowRecentHistory] = useState(true);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    severity: "success" | "error";
    message: string;
  }>({
    open: false,
    severity: "success",
    message: "",
  });

  useEffect(() => {
    async function loadTickets() {
      try {
        const snap = await getDocs(collection(db, "serviceTickets"));

        const items: ServiceTicket[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            customerId: data.customerId ?? "",
            customerDisplayName: data.customerDisplayName ?? "",
            serviceAddressId: data.serviceAddressId ?? undefined,
            serviceAddressLabel: data.serviceAddressLabel ?? undefined,
            serviceAddressLine1: data.serviceAddressLine1 ?? "",
            serviceAddressLine2: data.serviceAddressLine2 ?? undefined,
            serviceCity: data.serviceCity ?? "",
            serviceState: data.serviceState ?? "",
            servicePostalCode: data.servicePostalCode ?? "",
            issueSummary: data.issueSummary ?? "",
            issueDetails: data.issueDetails ?? undefined,
            status: (data.status ?? "new") as ServiceTicketStatus,
            estimatedDurationMinutes: data.estimatedDurationMinutes ?? 0,
            scheduledDate: data.scheduledDate ?? undefined,
            scheduledStartTime: data.scheduledStartTime ?? undefined,
            scheduledEndTime: data.scheduledEndTime ?? undefined,
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,
            primaryTechnicianId: data.primaryTechnicianId ?? undefined,
            assignedTechnicianIds: Array.isArray(data.assignedTechnicianIds)
              ? data.assignedTechnicianIds
              : undefined,
            secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
            secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,
            helperIds: Array.isArray(data.helperIds) ? data.helperIds : undefined,
            helperNames: Array.isArray(data.helperNames) ? data.helperNames : undefined,
            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        items.sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt));
        setTickets(items);

        const initialDrafts: Record<string, TicketDraft> = {};
        for (const ticket of items) {
          initialDrafts[ticket.id] = {
            status: ticket.status,
            assignedTechnicianId: ticket.assignedTechnicianId ?? "",
          };
        }
        setDrafts(initialDrafts);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load dispatch board.");
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  useEffect(() => {
    async function loadTechnicians() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: TechnicianOption[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data();

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
        setTechniciansError(
          err instanceof Error ? err.message : "Failed to load technicians."
        );
      } finally {
        setTechniciansLoading(false);
      }
    }

    loadTechnicians();
  }, []);

  const recentHistoryCutoffMs = useMemo(
    () => Date.now() - RECENT_HISTORY_DAYS * 24 * 60 * 60 * 1000,
    []
  );

  const visibleBaseTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (!showRecentHistory && HISTORY_STATUSES.includes(ticket.status)) {
        return false;
      }

      if (HISTORY_STATUSES.includes(ticket.status)) {
        const timestampSource = ticket.updatedAt || ticket.createdAt;
        const timestamp = parseDateMs(timestampSource);
        return timestamp >= recentHistoryCutoffMs;
      }

      return true;
    });
  }, [tickets, showRecentHistory, recentHistoryCutoffMs]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = normalize(search);

    return visibleBaseTickets
      .filter((ticket) => statusMatchesFilter(ticket.status, statusFilter))
      .filter((ticket) => {
        if (technicianFilter === "all") return true;
        return ticket.assignedTechnicianId === technicianFilter;
      })
      .filter((ticket) => ticketMatchesSearch(ticket, normalizedSearch))
      .sort(sortTicketsForDispatch);
  }, [visibleBaseTickets, search, statusFilter, technicianFilter]);

  const ticketsBySection = useMemo(() => {
    return SECTIONS.reduce<Record<SectionConfig["id"], ServiceTicket[]>>(
      (acc, section) => {
        acc[section.id] = filteredTickets.filter((ticket) =>
          section.statuses.includes(ticket.status)
        );
        return acc;
      },
      {
        needs_action: [],
        scheduled_active: [],
        recent_history: [],
      }
    );
  }, [filteredTickets]);

  const statusCounts = useMemo(() => {
    return tickets.reduce<Record<ServiceTicketStatus, number>>(
      (acc, ticket) => {
        acc[ticket.status] += 1;
        return acc;
      },
      {
        new: 0,
        scheduled: 0,
        in_progress: 0,
        follow_up: 0,
        completed: 0,
        invoiced: 0,
        cancelled: 0,
      }
    );
  }, [tickets]);

  function handleDraftChange(
    ticketId: string,
    field: keyof TicketDraft,
    value: string
  ) {
    setDrafts((prev) => ({
      ...prev,
      [ticketId]: {
        ...(prev[ticketId] ?? { status: "new", assignedTechnicianId: "" }),
        [field]: value as TicketDraft[keyof TicketDraft],
      },
    }));
  }

  async function handleSaveQuickUpdate(ticket: ServiceTicket) {
    if (ticket.status === "invoiced") {
      setSnackbar({
        open: true,
        severity: "error",
        message: "Invoiced tickets are locked and cannot be quick-edited from dispatch.",
      });
      return;
    }

    const draft = drafts[ticket.id];
    if (!draft) return;

    setSavingTicketId(ticket.id);

    try {
      const selectedTechnician =
        technicians.find((tech) => tech.uid === draft.assignedTechnicianId) ?? null;

      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "serviceTickets", ticket.id), {
        status: draft.status,
        assignedTechnicianId: selectedTechnician ? selectedTechnician.uid : null,
        assignedTechnicianName: selectedTechnician
          ? selectedTechnician.displayName
          : null,
        updatedAt: nowIso,
      });

      setTickets((prev) =>
        prev.map((item) =>
          item.id === ticket.id
            ? {
                ...item,
                status: draft.status,
                assignedTechnicianId: selectedTechnician?.uid || undefined,
                assignedTechnicianName: selectedTechnician?.displayName || undefined,
                updatedAt: nowIso,
              }
            : item
        )
      );

      setSnackbar({
        open: true,
        severity: "success",
        message: `Saved updates for "${ticket.issueSummary}".`,
      });
    } catch (err: unknown) {
      setSnackbar({
        open: true,
        severity: "error",
        message:
          err instanceof Error ? err.message : "Failed to save quick ticket update.",
      });
    } finally {
      setSavingTicketId("");
    }
  }

  function renderSummaryChip(
    status: ServiceTicketStatus,
    icon: React.ReactNode
  ) {
    const tone = getStatusTone(theme, status);

    return (
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.5,
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.background.paper,
          minWidth: 140,
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              color: tone.fg,
              bgcolor: tone.bg,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography variant="labelMedium" color="text.secondary">
              {STATUS_LABELS[status]}
            </Typography>
            <Typography variant="titleLarge" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              {statusCounts[status]}
            </Typography>
          </Box>
        </Stack>
      </Paper>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Dispatch">
      <AppShell appUser={appUser}>
        <Stack spacing={3}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 4,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: theme.palette.background.paper,
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              spacing={2}
            >
              <Box>
                <Typography variant="headlineMedium" sx={{ fontWeight: 700 }}>
                  Dispatch
                </Typography>
                <Typography
                  variant="bodyMedium"
                  color="text.secondary"
                  sx={{ mt: 0.75, maxWidth: 760 }}
                >
                  Manage the live service ticket flow, make quick assignments, and keep
                  the board focused on what needs action now.
                </Typography>
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <Button
                  component={Link}
                  href="/service-tickets/new"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  sx={{ borderRadius: 99, minWidth: 190 }}
                >
                  New Service Ticket
                </Button>
              </Stack>
            </Stack>

            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                mt: 3,
                overflowX: "auto",
                pb: 0.5,
              }}
            >
              {renderSummaryChip("new", <BoltRoundedIcon fontSize="small" />)}
              {renderSummaryChip("scheduled", <EventRoundedIcon fontSize="small" />)}
              {renderSummaryChip(
                "in_progress",
                <AssignmentIndRoundedIcon fontSize="small" />
              )}
              {renderSummaryChip("follow_up", <ReceiptLongRoundedIcon fontSize="small" />)}
            </Stack>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 2.5 },
              borderRadius: 4,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: theme.palette.background.paper,
            }}
          >
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", lg: "row" }}
                spacing={2}
                alignItems={{ xs: "stretch", lg: "center" }}
              >
                <TextField
                  fullWidth
                  label="Search tickets"
                  placeholder="Issue, customer, address, or technician"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />

                <FormControl sx={{ minWidth: { xs: "100%", sm: 220 } }}>
                  <InputLabel id="dispatch-status-filter-label">Status</InputLabel>
                  <Select
                    labelId="dispatch-status-filter-label"
                    label="Status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <MenuItem value="all">All statuses</MenuItem>
                    <MenuItem value="open">Open only</MenuItem>
                    <MenuItem value="history">History only</MenuItem>
                    <Divider />
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl sx={{ minWidth: { xs: "100%", sm: 240 } }}>
                  <InputLabel id="dispatch-tech-filter-label">Assigned Tech</InputLabel>
                  <Select
                    labelId="dispatch-tech-filter-label"
                    label="Assigned Tech"
                    value={technicianFilter}
                    onChange={(e) => setTechnicianFilter(e.target.value)}
                  >
                    <MenuItem value="all">All technicians</MenuItem>
                    {technicians.map((tech) => (
                      <MenuItem key={tech.uid} value={tech.uid}>
                        {tech.displayName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={1.5}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Switch
                    checked={showRecentHistory}
                    onChange={(e) => setShowRecentHistory(e.target.checked)}
                  />
                  <Typography variant="bodyMedium" color="text.secondary">
                    Show recent history
                  </Typography>
                </Stack>

                <Typography variant="bodySmall" color="text.secondary">
                  Showing {filteredTickets.length} ticket
                  {filteredTickets.length === 1 ? "" : "s"}
                </Typography>
              </Stack>
            </Stack>
          </Paper>

          {loading ? <Alert severity="info">Loading dispatch board...</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {techniciansLoading ? (
            <Alert severity="info">Loading technicians...</Alert>
          ) : null}
          {techniciansError ? <Alert severity="error">{techniciansError}</Alert> : null}

          {!loading && !error ? (
            <Stack spacing={3}>
              {SECTIONS.filter(
                (section) => showRecentHistory || section.id !== "recent_history"
              ).map((section) => {
                const sectionTickets = ticketsBySection[section.id];

                return (
                  <Paper
                    key={section.id}
                    elevation={0}
                    sx={{
                      p: { xs: 2, md: 2.5 },
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      bgcolor: theme.palette.background.paper,
                    }}
                  >
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                        spacing={1}
                      >
                        <Box>
                          <Typography variant="titleLarge" sx={{ fontWeight: 700 }}>
                            {section.title}
                          </Typography>
                          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5 }}>
                            {section.description}
                          </Typography>
                        </Box>

                        <Chip
                          label={`${sectionTickets.length} ticket${
                            sectionTickets.length === 1 ? "" : "s"
                          }`}
                          sx={{ borderRadius: 99 }}
                        />
                      </Stack>

                      {sectionTickets.length === 0 ? (
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 3,
                            borderRadius: 3,
                            bgcolor: alpha(theme.palette.primary.main, 0.02),
                          }}
                        >
                          <Typography variant="bodyMedium" color="text.secondary">
                            No tickets match this section right now.
                          </Typography>
                        </Paper>
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
                          {sectionTickets.map((ticket) => {
                            const isLocked = ticket.status === "invoiced";

                            const draft = drafts[ticket.id] ?? {
                              status: ticket.status,
                              assignedTechnicianId: ticket.assignedTechnicianId ?? "",
                            };

                            const hasChanges =
                              draft.status !== ticket.status ||
                              draft.assignedTechnicianId !==
                                (ticket.assignedTechnicianId ?? "");

                            const tone = getStatusTone(theme, ticket.status);

                            return (
                              <Card
                                key={ticket.id}
                                variant="outlined"
                                sx={{
                                  borderRadius: 4,
                                  borderColor: theme.palette.divider,
                                  bgcolor: theme.palette.background.paper,
                                }}
                              >
                                <CardContent sx={{ pb: 2 }}>
                                  <Stack spacing={1.5}>
                                    <Stack
                                      direction={{ xs: "column", sm: "row" }}
                                      justifyContent="space-between"
                                      alignItems={{ xs: "flex-start", sm: "flex-start" }}
                                      spacing={1}
                                    >
                                      <Box sx={{ minWidth: 0 }}>
                                        <Typography
                                          variant="titleMedium"
                                          sx={{ fontWeight: 700 }}
                                        >
                                          {ticket.issueSummary || "Untitled Ticket"}
                                        </Typography>
                                        <Typography
                                          variant="bodyMedium"
                                          color="text.secondary"
                                          sx={{ mt: 0.5 }}
                                        >
                                          {ticket.customerDisplayName || "No customer name"}
                                        </Typography>
                                      </Box>

                                      <Chip
                                        label={STATUS_LABELS[ticket.status]}
                                        size="small"
                                        sx={{
                                          borderRadius: 99,
                                          color: tone.fg,
                                          bgcolor: tone.bg,
                                          fontWeight: 700,
                                        }}
                                      />
                                    </Stack>

                                    <Stack
                                      direction="row"
                                      spacing={1}
                                      flexWrap="wrap"
                                      useFlexGap
                                    >
                                      {ticket.assignedTechnicianName ? (
                                        <Chip
                                          size="small"
                                          icon={<AssignmentIndRoundedIcon />}
                                          label={ticket.assignedTechnicianName}
                                          variant="outlined"
                                          sx={{ borderRadius: 99 }}
                                        />
                                      ) : (
                                        <Chip
                                          size="small"
                                          label="Unassigned"
                                          variant="outlined"
                                          sx={{ borderRadius: 99 }}
                                        />
                                      )}

                                      <Chip
                                        size="small"
                                        icon={<EventRoundedIcon />}
                                        label={getScheduleText(ticket)}
                                        variant="outlined"
                                        sx={{ borderRadius: 99, maxWidth: "100%" }}
                                      />
                                    </Stack>

                                    <Box>
                                      <Typography variant="bodySmall" color="text.secondary">
                                        Service Address
                                      </Typography>
                                      <Typography variant="bodyMedium" sx={{ mt: 0.25 }}>
                                        {formatAddress(ticket) || "No address"}
                                      </Typography>
                                    </Box>

                                    <Box>
                                      <Typography variant="bodySmall" color="text.secondary">
                                        ETA
                                      </Typography>
                                      <Typography variant="bodyMedium" sx={{ mt: 0.25 }}>
                                        {ticket.estimatedDurationMinutes
                                          ? `${ticket.estimatedDurationMinutes} min`
                                          : "Not set"}
                                      </Typography>
                                    </Box>

                                    {isLocked ? (
                                      <Alert severity="success" sx={{ borderRadius: 3 }}>
                                        This ticket is invoiced and locked from quick edits.
                                      </Alert>
                                    ) : null}

                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        p: 2,
                                        borderRadius: 3,
                                        bgcolor: alpha(theme.palette.primary.main, 0.02),
                                      }}
                                    >
                                      <Stack spacing={2}>
                                        <Typography
                                          variant="labelLarge"
                                          sx={{ fontWeight: 700 }}
                                        >
                                          Quick Update
                                        </Typography>

                                        <Stack
                                          direction={{ xs: "column", md: "row" }}
                                          spacing={1.5}
                                        >
                                          <FormControl fullWidth>
                                            <InputLabel id={`status-label-${ticket.id}`}>
                                              Status
                                            </InputLabel>
                                            <Select
                                              labelId={`status-label-${ticket.id}`}
                                              label="Status"
                                              value={draft.status}
                                              onChange={(e) =>
                                                handleDraftChange(
                                                  ticket.id,
                                                  "status",
                                                  e.target.value
                                                )
                                              }
                                              disabled={isLocked}
                                            >
                                              {Object.entries(STATUS_LABELS).map(
                                                ([value, label]) => (
                                                  <MenuItem key={value} value={value}>
                                                    {label}
                                                  </MenuItem>
                                                )
                                              )}
                                            </Select>
                                          </FormControl>

                                          <FormControl fullWidth>
                                            <InputLabel id={`tech-label-${ticket.id}`}>
                                              Assigned Tech
                                            </InputLabel>
                                            <Select
                                              labelId={`tech-label-${ticket.id}`}
                                              label="Assigned Tech"
                                              value={draft.assignedTechnicianId}
                                              onChange={(e) =>
                                                handleDraftChange(
                                                  ticket.id,
                                                  "assignedTechnicianId",
                                                  e.target.value
                                                )
                                              }
                                              disabled={isLocked}
                                            >
                                              <MenuItem value="">Unassigned</MenuItem>
                                              {technicians.map((tech) => (
                                                <MenuItem key={tech.uid} value={tech.uid}>
                                                  {tech.displayName}
                                                </MenuItem>
                                              ))}
                                            </Select>
                                          </FormControl>
                                        </Stack>

                                        <Stack
                                          direction={{ xs: "column", sm: "row" }}
                                          justifyContent="space-between"
                                          alignItems={{ xs: "flex-start", sm: "center" }}
                                          spacing={1}
                                        >
                                          <Typography
                                            variant="bodySmall"
                                            color={
                                              hasChanges
                                                ? "primary.main"
                                                : "text.secondary"
                                            }
                                          >
                                            {hasChanges
                                              ? "Unsaved changes"
                                              : "No pending quick changes"}
                                          </Typography>

                                          <Button
                                            variant={hasChanges ? "contained" : "outlined"}
                                            onClick={() => handleSaveQuickUpdate(ticket)}
                                            disabled={savingTicketId === ticket.id || isLocked || !hasChanges}
                                            sx={{ borderRadius: 99, minWidth: 160 }}
                                          >
                                            {savingTicketId === ticket.id
                                              ? "Saving..."
                                              : "Save Quick Update"}
                                          </Button>
                                        </Stack>
                                      </Stack>
                                    </Paper>
                                  </Stack>
                                </CardContent>

                                <CardActions
                                  sx={{
                                    px: 2,
                                    pb: 2,
                                    pt: 0,
                                    justifyContent: "space-between",
                                    flexWrap: "wrap",
                                    gap: 1,
                                  }}
                                >
                                  <Button
                                    component={Link}
                                    href={`/service-tickets/${ticket.id}`}
                                    variant="text"
                                    sx={{ borderRadius: 99 }}
                                  >
                                    Open Ticket
                                  </Button>

                                  {ticket.status === "scheduled" || ticket.status === "in_progress" ? (
                                    <Button
                                      component={Link}
                                      href={`/service-tickets/${ticket.id}`}
                                      variant="outlined"
                                      sx={{ borderRadius: 99 }}
                                    >
                                      View Trip Details
                                    </Button>
                                  ) : null}
                                </CardActions>
                              </Card>
                            );
                          })}
                        </Box>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          ) : null}
        </Stack>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={3500}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            severity={snackbar.severity}
            variant="filled"
            onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
            sx={{ width: "100%" }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </AppShell>
    </ProtectedPage>
  );
}