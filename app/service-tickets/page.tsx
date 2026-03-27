"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
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
  Paper,
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
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import BuildCircleRoundedIcon from "@mui/icons-material/BuildCircleRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { ServiceTicket } from "../../src/types/service-ticket";

type StatusFilter =
  | "all"
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "cancelled";

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

function getStatusLabel(status?: ServiceTicket["status"]) {
  switch (status) {
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
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function getScheduleText(ticket: ServiceTicket) {
  if (!ticket.scheduledDate && !ticket.scheduledStartTime && !ticket.scheduledEndTime) {
    return "Unscheduled";
  }

  const datePart = ticket.scheduledDate || "No date";
  const startPart = ticket.scheduledStartTime || "—";
  const endPart = ticket.scheduledEndTime || "—";

  return `${datePart} • ${startPart} - ${endPart}`;
}

function normalize(s: unknown) {
  return String(s || "").trim().toLowerCase();
}

function isAssigned(ticket: ServiceTicket) {
  return Boolean(ticket.assignedTechnicianId || ticket.assignedTechnicianName);
}

function statusRankForSort(status: string) {
  const s = normalize(status);
  if (s === "new") return 0;
  if (s === "follow_up") return 1;
  if (s === "scheduled") return 2;
  if (s === "in_progress") return 3;
  if (s === "completed") return 4;
  if (s === "cancelled") return 5;
  return 99;
}

function safeStr(x: unknown) {
  return String(x ?? "");
}

function statusTone(status?: ServiceTicket["status"]) {
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
  const isFieldUser = role === "technician" || role === "helper" || role === "apprentice";

  const defaultStatus: StatusFilter = isFieldUser ? "new" : "all";
  const defaultHideCompleted = isFieldUser ? true : false;

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(defaultStatus);
  const [assignedFilter, setAssignedFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "scheduled" | "unscheduled">("all");
  const [hideCompleted, setHideCompleted] = useState<boolean>(defaultHideCompleted);
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);

  useEffect(() => {
    async function loadTickets() {
      try {
        const q = query(collection(db, "serviceTickets"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const items: ServiceTicket[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

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
            status: data.status ?? "new",
            estimatedDurationMinutes: data.estimatedDurationMinutes ?? 0,
            scheduledDate: data.scheduledDate ?? undefined,
            scheduledStartTime: data.scheduledStartTime ?? undefined,
            scheduledEndTime: data.scheduledEndTime ?? undefined,
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,
            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setTickets(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load service tickets.");
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const base = tickets.filter((ticket) => {
      const s = normalize(ticket.status);

      if (hideCompleted && (s === "completed" || s === "cancelled")) return false;

      if (availableOnly) {
        const assigned = isAssigned(ticket);
        if (assigned) return false;
        if (!(s === "new" || s === "scheduled")) return false;
      }

      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;

      const assigned = isAssigned(ticket);
      if (assignedFilter === "assigned" && !assigned) return false;
      if (assignedFilter === "unassigned" && assigned) return false;

      const scheduled = Boolean(ticket.scheduledDate || ticket.scheduledStartTime || ticket.scheduledEndTime);
      if (scheduleFilter === "scheduled" && !scheduled) return false;
      if (scheduleFilter === "unscheduled" && scheduled) return false;

      if (!normalizedSearch) return true;

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
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    const sorted = [...base].sort((a, b) => {
      const aAssigned = isAssigned(a);
      const bAssigned = isAssigned(b);

      if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;

      const aStatus = normalize(a.status);
      const bStatus = normalize(b.status);

      const aIsNew = aStatus === "new";
      const bIsNew = bStatus === "new";
      if (aIsNew !== bIsNew) return aIsNew ? -1 : 1;

      const ra = statusRankForSort(aStatus);
      const rb = statusRankForSort(bStatus);
      if (ra !== rb) return ra - rb;

      const ac = safeStr(a.createdAt);
      const bc = safeStr(b.createdAt);
      return bc.localeCompare(ac);
    });

    return sorted;
  }, [
    tickets,
    searchText,
    statusFilter,
    assignedFilter,
    scheduleFilter,
    hideCompleted,
    availableOnly,
  ]);

  function clearFilters() {
    setSearchText("");
    setAssignedFilter("all");
    setScheduleFilter("all");
    setStatusFilter(defaultStatus);
    setHideCompleted(defaultHideCompleted);
    setAvailableOnly(false);
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
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    icon={<ConfirmationNumberRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Service Tickets"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
                      backgroundColor: alpha(theme.palette.primary.main, 0.12),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
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
                  Search by customer, issue, address, technician, status, and schedule
                  to manage the service work queue.
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/service-tickets/new"
                variant="contained"
                startIcon={<AddRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2 }}
              >
                New Service Ticket
              </Button>
            </Stack>

            <Card
              elevation={0}
              sx={{
                borderRadius: 3,
                border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                backgroundColor: "background.paper",
              }}
            >
              <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={2.25}>
                  <SectionHeader
                    title="Filters"
                    subtitle="Refine the work queue by search text, status, assignment state, and scheduling state."
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
                      placeholder="Issue, customer, address, tech, date..."
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
                          setStatusFilter(e.target.value as StatusFilter)
                        }
                      >
                        <MenuItem value="all">All Statuses</MenuItem>
                        <MenuItem value="new">New</MenuItem>
                        <MenuItem value="scheduled">Scheduled</MenuItem>
                        <MenuItem value="in_progress">In Progress</MenuItem>
                        <MenuItem value="follow_up">Follow Up</MenuItem>
                        <MenuItem value="completed">Completed</MenuItem>
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
                            e.target.value as "all" | "assigned" | "unassigned"
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
                            e.target.value as "all" | "scheduled" | "unscheduled"
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
                      spacing={1.5}
                      alignItems={{ xs: "flex-start", sm: "center" }}
                    >
                      <Paper
                        elevation={0}
                        sx={{
                          px: 1.25,
                          py: 0.75,
                          borderRadius: 2,
                          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                          backgroundColor: alpha("#FFFFFF", 0.02),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TuneRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Available Tickets
                          </Typography>
                          <Switch
                            size="small"
                            checked={availableOnly}
                            onChange={(e) => setAvailableOnly(e.target.checked)}
                          />
                        </Stack>
                      </Paper>

                      <Paper
                        elevation={0}
                        sx={{
                          px: 1.25,
                          py: 0.75,
                          borderRadius: 2,
                          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                          backgroundColor: alpha("#FFFFFF", 0.02),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CheckCircleRoundedIcon
                            sx={{ fontSize: 18, color: "text.secondary" }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Hide Completed
                          </Typography>
                          <Switch
                            size="small"
                            checked={hideCompleted}
                            onChange={(e) => setHideCompleted(e.target.checked)}
                          />
                        </Stack>
                      </Paper>
                    </Stack>

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <Chip
                        size="small"
                        label={`Showing ${filteredTickets.length} of ${tickets.length}`}
                        variant="outlined"
                        sx={{ borderRadius: 1.5, fontWeight: 700 }}
                      />

                      <Button
                        type="button"
                        onClick={clearFilters}
                        variant="outlined"
                        sx={{ borderRadius: 2, minHeight: 36 }}
                      >
                        Clear Filters
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Box>
            </Card>

            {error ? (
              <Alert severity="error" variant="outlined" icon={<ErrorOutlineRoundedIcon />}>
                {error}
              </Alert>
            ) : null}

            {loading ? (
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 3,
                  p: 3,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <CircularProgress size={20} thickness={5} />
                  <Typography variant="body2" color="text.secondary">
                    Loading service tickets...
                  </Typography>
                </Stack>
              </Paper>
            ) : null}

            {!loading && !error && filteredTickets.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 3,
                  p: 3,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No matching service tickets found.
                </Typography>
              </Paper>
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

                  return (
                    <Card
                      key={ticket.id}
                      elevation={0}
                      sx={{
                        height: "100%",
                        borderRadius: 3,
                        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                        backgroundColor: "background.paper",
                      }}
                    >
                      <CardActionArea
                        component={Link}
                        href={`/service-tickets/${ticket.id}`}
                        sx={{ height: "100%", borderRadius: 3, alignItems: "stretch" }}
                      >
                        <CardContent
                          sx={{
                            p: { xs: 2, md: 2.25 },
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            "&:last-child": { pb: { xs: 2, md: 2.25 } },
                          }}
                        >
                          <Stack spacing={1.5} sx={{ height: "100%" }}>
                            <Stack
                              direction="row"
                              spacing={1.25}
                              justifyContent="space-between"
                              alignItems="flex-start"
                            >
                              <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
                                <Box
                                  sx={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 2,
                                    display: "grid",
                                    placeItems: "center",
                                    flexShrink: 0,
                                    backgroundColor: alpha(theme.palette.primary.main, 0.12),
                                    color: theme.palette.primary.light,
                                  }}
                                >
                                  <BuildCircleRoundedIcon sx={{ fontSize: 22 }} />
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

                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                {!assigned ? (
                                  <Chip
                                    size="small"
                                    label="Unassigned"
                                    sx={{
                                      borderRadius: 1.5,
                                      fontWeight: 700,
                                      color: "#DCEBFF",
                                      backgroundColor: "rgba(13,126,242,0.10)",
                                      border: "1px solid rgba(13,126,242,0.22)",
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

                            <Stack spacing={1}>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <PlaceRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
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
                                {ticket.serviceCity || "—"}, {ticket.serviceState || "—"}{" "}
                                {ticket.servicePostalCode || ""}
                              </Typography>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <ScheduleRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                  {getScheduleText(ticket)}
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <BuildCircleRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                  Estimated Duration:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {ticket.estimatedDurationMinutes} min
                                  </Typography>
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <AssignmentIndRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
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
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {ticket.assignedTechnicianName || (assigned ? "Assigned" : "—")}
                                  </Typography>
                                </Typography>
                              </Stack>
                            </Stack>

                            <Box sx={{ flex: 1 }} />

                            <Stack
                              direction="row"
                              spacing={0.75}
                              alignItems="center"
                              sx={{
                                color: "primary.light",
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
                              <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
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