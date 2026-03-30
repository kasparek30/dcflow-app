"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import PublishRoundedIcon from "@mui/icons-material/PublishRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { WeeklyTimesheet } from "../../src/types/weekly-timesheet";

function formatStatus(status: WeeklyTimesheet["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "exported_to_quickbooks":
      return "Exported to QuickBooks";
    default:
      return String(status || "");
  }
}

function getStatusTone(status: WeeklyTimesheet["status"]) {
  switch (status) {
    case "submitted":
      return {
        label: "Submitted",
        color: "warning" as const,
        icon: <HourglassTopRoundedIcon sx={{ fontSize: 16 }} />,
      };
    case "approved":
      return {
        label: "Approved",
        color: "success" as const,
        icon: <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />,
      };
    case "rejected":
      return {
        label: "Rejected",
        color: "error" as const,
        icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 16 }} />,
      };
    case "exported_to_quickbooks":
      return {
        label: "Exported",
        color: "info" as const,
        icon: <PublishRoundedIcon sx={{ fontSize: 16 }} />,
      };
    case "draft":
    default:
      return {
        label: "Draft",
        color: "default" as const,
        icon: <ScheduleRoundedIcon sx={{ fontSize: 16 }} />,
      };
  }
}

export default function TimesheetReviewQueuePage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [timesheets, setTimesheets] = useState<WeeklyTimesheet[]>([]);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<
    "all" | WeeklyTimesheet["status"]
  >("submitted");

  useEffect(() => {
    setError("");

    const q = query(
      collection(db, "weeklyTimesheets"),
      orderBy("weekStartDate", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: WeeklyTimesheet[] = snap.docs.map((docSnap) => {
          const data: any = docSnap.data();
          return {
            id: docSnap.id,
            employeeId: data.employeeId ?? "",
            employeeName: data.employeeName ?? "",
            employeeRole: data.employeeRole ?? "",
            weekStartDate: data.weekStartDate ?? "",
            weekEndDate: data.weekEndDate ?? "",
            timeEntryIds: Array.isArray(data.timeEntryIds) ? data.timeEntryIds : [],
            totalHours: typeof data.totalHours === "number" ? data.totalHours : 0,
            regularHours:
              typeof data.regularHours === "number" ? data.regularHours : 0,
            overtimeHours:
              typeof data.overtimeHours === "number" ? data.overtimeHours : 0,
            ptoHours: typeof data.ptoHours === "number" ? data.ptoHours : 0,
            holidayHours:
              typeof data.holidayHours === "number" ? data.holidayHours : 0,
            billableHours:
              typeof data.billableHours === "number" ? data.billableHours : 0,
            nonBillableHours:
              typeof data.nonBillableHours === "number"
                ? data.nonBillableHours
                : 0,
            status: data.status ?? "draft",
            submittedAt: data.submittedAt ?? undefined,
            submittedById: data.submittedById ?? undefined,
            approvedAt: data.approvedAt ?? undefined,
            approvedById: data.approvedById ?? undefined,
            approvedByName: data.approvedByName ?? undefined,
            rejectedAt: data.rejectedAt ?? undefined,
            rejectedById: data.rejectedById ?? undefined,
            rejectionReason: data.rejectionReason ?? undefined,
            quickbooksExportStatus: data.quickbooksExportStatus ?? "not_ready",
            quickbooksExportedAt: data.quickbooksExportedAt ?? undefined,
            quickbooksPayrollBatchId: data.quickbooksPayrollBatchId ?? undefined,
            employeeNote: data.employeeNote ?? undefined,
            managerNote: data.managerNote ?? undefined,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setTimesheets(items);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Failed to load timesheet review queue.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const visibleTimesheets = useMemo(() => {
    if (statusFilter === "all") return timesheets;
    return timesheets.filter((item) => item.status === statusFilter);
  }, [timesheets, statusFilter]);

  return (
    <ProtectedPage fallbackTitle="Timesheet Review">
      <AppShell appUser={appUser}>
        <Container maxWidth="lg" disableGutters>
          <Stack spacing={3}>
            <Box
              sx={{
                px: { xs: 2, md: 3 },
                py: { xs: 2.5, md: 3 },
                borderRadius: 5,
                background: `linear-gradient(135deg, ${alpha(
                  theme.palette.primary.main,
                  0.12
                )} 0%, ${alpha(theme.palette.secondary.main, 0.08)} 100%)`,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
              }}
            >
              <Stack spacing={1.25}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.25}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                >
                  <Chip
                    icon={<AssignmentTurnedInRoundedIcon />}
                    label="Payroll Review"
                    color="primary"
                    variant="filled"
                  />
                  <Chip
                    label={`${visibleTimesheets.length} shown`}
                    variant="outlined"
                  />
                </Stack>

                <Typography variant="h4" fontWeight={800} letterSpacing={-0.4}>
                  Timesheet Review
                </Typography>

                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ maxWidth: 760 }}
                >
                  Review weekly employee timesheets, filter by status, and open a
                  detailed review page to approve, reject, or adjust hours.
                </Typography>
              </Stack>
            </Box>

            <Card
              elevation={0}
              sx={{
                borderRadius: 5,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    alignItems={{ xs: "stretch", md: "center" }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Queue filters
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Narrow the review queue to the timesheets you want to work
                        through.
                      </Typography>
                    </Box>

                    <TextField
                      select
                      label="Status"
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(
                          e.target.value as "all" | WeeklyTimesheet["status"]
                        )
                      }
                      sx={{ minWidth: { xs: "100%", md: 260 } }}
                    >
                      <MenuItem value="submitted">Submitted</MenuItem>
                      <MenuItem value="all">All Statuses</MenuItem>
                      <MenuItem value="draft">Draft</MenuItem>
                      <MenuItem value="approved">Approved</MenuItem>
                      <MenuItem value="rejected">Rejected</MenuItem>
                      <MenuItem value="exported_to_quickbooks">
                        Exported to QuickBooks
                      </MenuItem>
                    </TextField>
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    Showing {visibleTimesheets.length} timesheet
                    {visibleTimesheets.length === 1 ? "" : "s"}.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            {loading ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 5,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <CardContent sx={{ py: 5 }}>
                  <Stack spacing={2} alignItems="center" justifyContent="center">
                    <CircularProgress />
                    <Typography variant="body2" color="text.secondary">
                      Loading review queue...
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}

            {!loading && !error && visibleTimesheets.length === 0 ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 5,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <CardContent sx={{ py: 5 }}>
                  <Stack spacing={1.5} alignItems="center">
                    <AssignmentTurnedInRoundedIcon
                      sx={{ fontSize: 40, color: "text.secondary" }}
                    />
                    <Typography variant="h6" fontWeight={700}>
                      No timesheets found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      There are no timesheets matching the current filter.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {!loading && !error && visibleTimesheets.length > 0 ? (
              <Stack spacing={2}>
                {visibleTimesheets.map((ts) => {
                  const tone = getStatusTone(ts.status);

                  return (
                    <Card
                      key={ts.id}
                      elevation={0}
                      sx={{
                        borderRadius: 5,
                        border: `1px solid ${theme.palette.divider}`,
                        overflow: "hidden",
                        transition: "transform 160ms ease, box-shadow 160ms ease",
                        "&:hover": {
                          transform: "translateY(-1px)",
                          boxShadow: theme.shadows[2],
                        },
                      }}
                    >
                      <CardActionArea
                        component={Link}
                        href={`/timesheet-review/${ts.id}`}
                        sx={{ alignItems: "stretch" }}
                      >
                        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                          <Stack spacing={1.75}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1.25}
                              justifyContent="space-between"
                              alignItems={{ xs: "flex-start", sm: "center" }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="h6"
                                  fontWeight={800}
                                  sx={{ lineHeight: 1.2 }}
                                >
                                  {ts.employeeName || "Unnamed Employee"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {ts.employeeRole || "No role set"}
                                </Typography>
                              </Box>

                              <Chip
                                icon={tone.icon}
                                label={tone.label}
                                color={tone.color}
                                variant={tone.color === "default" ? "outlined" : "filled"}
                              />
                            </Stack>

                            <Stack
                              direction={{ xs: "column", md: "row" }}
                              spacing={1.25}
                              useFlexGap
                              flexWrap="wrap"
                            >
                              <Chip
                                variant="outlined"
                                label={`Week: ${ts.weekStartDate} → ${ts.weekEndDate}`}
                              />
                              <Chip
                                variant="outlined"
                                label={`Total Paid: ${ts.totalHours.toFixed(2)} hr`}
                              />
                              <Chip
                                variant="outlined"
                                label={`Regular: ${ts.regularHours.toFixed(2)} hr`}
                              />
                              <Chip
                                variant="outlined"
                                label={`OT: ${ts.overtimeHours.toFixed(2)} hr`}
                              />
                            </Stack>

                            <Stack spacing={0.5}>
                              {ts.submittedAt ? (
                                <Typography variant="body2" color="text.secondary">
                                  Submitted: {ts.submittedAt}
                                </Typography>
                              ) : null}

                              {ts.approvedAt ? (
                                <Typography variant="body2" color="text.secondary">
                                  Approved: {ts.approvedAt}
                                </Typography>
                              ) : null}

                              {ts.rejectedAt ? (
                                <Typography variant="body2" color="text.secondary">
                                  Rejected: {ts.rejectedAt}
                                </Typography>
                              ) : null}
                            </Stack>
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Stack>
            ) : null}
          </Stack>
        </Container>
      </AppShell>
    </ProtectedPage>
  );
}