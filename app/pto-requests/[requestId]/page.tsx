// app/pto-requests/[requestId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { getPayrollWeekBounds } from "../../../src/lib/payroll";
import type { PTORequest } from "../../../src/types/pto-request";

type Props = {
  params: Promise<{ requestId: string }>;
};

type HolidayLite = {
  holidayDate: string;
  active: boolean;
};

type TimeEntryLite = {
  id: string;
  employeeId: string;
  entryDate: string;
  category: string;
  source: string;
  notes?: string;
};

type UnavailabilityLite = {
  id: string;
  uid: string;
  date: string;
  type: string;
  source: string;
  ptoRequestId?: string;
  active: boolean;
};

function formatStatus(status: PTORequest["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function getStatusChipColor(
  status: PTORequest["status"]
): "default" | "success" | "error" | "warning" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "error";
    case "pending":
      return "warning";
    default:
      return "default";
  }
}

function getStatusIcon(status: PTORequest["status"]) {
  switch (status) {
    case "approved":
      return <CheckCircleRoundedIcon fontSize="small" />;
    case "rejected":
      return <EventBusyRoundedIcon fontSize="small" />;
    case "pending":
      return <HourglassTopRoundedIcon fontSize="small" />;
    default:
      return <InfoRoundedIcon fontSize="small" />;
  }
}

function getWeekdayDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  if (end < start) return [];

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const year = cursor.getFullYear();
      const month = String(cursor.getMonth() + 1).padStart(2, "0");
      const date = String(cursor.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${date}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export default function PTORequestDetailPage({ params }: Props) {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [requestId, setRequestId] = useState("");
  const [requestItem, setRequestItem] = useState<PTORequest | null>(null);

  const [managerNote, setManagerNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const canReview =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadRequest() {
      try {
        const resolved = await params;
        const nextId = resolved.requestId;
        setRequestId(nextId);

        const snap = await getDoc(doc(db, "ptoRequests", nextId));

        if (!snap.exists()) {
          setError("PTO request not found.");
          setLoading(false);
          return;
        }

        const data = snap.data();

        const item: PTORequest = {
          id: snap.id,
          employeeId: data.employeeId ?? "",
          employeeName: data.employeeName ?? "",
          employeeRole: data.employeeRole ?? "",
          startDate: data.startDate ?? "",
          endDate: data.endDate ?? "",
          hoursPerDay: typeof data.hoursPerDay === "number" ? data.hoursPerDay : 8,
          totalRequestedHours:
            typeof data.totalRequestedHours === "number"
              ? data.totalRequestedHours
              : 0,
          status: data.status ?? "pending",
          notes: data.notes ?? undefined,
          managerNote: data.managerNote ?? undefined,
          rejectionReason: data.rejectionReason ?? undefined,
          approvedAt: data.approvedAt ?? undefined,
          approvedById: data.approvedById ?? undefined,
          approvedByName: data.approvedByName ?? undefined,
          rejectedAt: data.rejectedAt ?? undefined,
          rejectedById: data.rejectedById ?? undefined,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        };

        setRequestItem(item);
        setManagerNote(item.managerNote ?? "");
        setRejectionReason(item.rejectionReason ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load PTO request.");
      } finally {
        setLoading(false);
      }
    }

    loadRequest();
  }, [params]);

  const weekdayDates = useMemo(() => {
    if (!requestItem) return [];
    return getWeekdayDates(requestItem.startDate, requestItem.endDate);
  }, [requestItem]);

  const canTakeAction = useMemo(() => {
    if (!requestItem) return false;
    return canReview && requestItem.status === "pending";
  }, [canReview, requestItem]);

  async function handleApprove() {
    if (!requestItem || !appUser?.uid) return;

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      const [holidaySnap, timeEntriesSnap, unavailSnap] = await Promise.all([
        getDocs(query(collection(db, "companyHolidays"))),
        getDocs(query(collection(db, "timeEntries"))),
        getDocs(query(collection(db, "employeeUnavailability"))),
      ]);

      const holidays: HolidayLite[] = holidaySnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          holidayDate: data.holidayDate ?? "",
          active: data.active ?? true,
        };
      });

      const activeHolidayDates = new Set(
        holidays.filter((h) => h.active).map((h) => h.holidayDate)
      );

      const allTimeEntries: TimeEntryLite[] = timeEntriesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          employeeId: data.employeeId ?? "",
          entryDate: data.entryDate ?? "",
          category: data.category ?? "",
          source: data.source ?? "",
          notes: data.notes ?? undefined,
        };
      });

      const allUnavailability: UnavailabilityLite[] = unavailSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          uid: data.uid ?? "",
          date: data.date ?? "",
          type: data.type ?? "",
          source: data.source ?? "",
          ptoRequestId: data.ptoRequestId ?? undefined,
          active: data.active ?? true,
        };
      });

      let createdTimeEntryCount = 0;
      let createdUnavailabilityCount = 0;

      for (const entryDate of weekdayDates) {
        if (activeHolidayDates.has(entryDate)) continue;

        const notesPrefix = `AUTO_PTO:${requestItem.id}:${entryDate}`;

        const alreadyHasTimeEntry = allTimeEntries.find((entry) => {
          if (entry.employeeId !== requestItem.employeeId) return false;
          if (entry.entryDate !== entryDate) return false;
          if (entry.category !== "pto") return false;
          if (entry.source !== "system_generated_pto") return false;
          return (entry.notes ?? "").startsWith(notesPrefix);
        });

        if (!alreadyHasTimeEntry) {
          const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

          const newDoc = await addDoc(collection(db, "timeEntries"), {
            employeeId: requestItem.employeeId,
            employeeName: requestItem.employeeName,
            employeeRole: requestItem.employeeRole,
            laborRoleType: null,

            entryDate,
            weekStartDate,
            weekEndDate,

            category: "pto",
            hours: requestItem.hoursPerDay,
            payType: "pto",
            billable: false,
            source: "system_generated_pto",

            serviceTicketId: null,
            projectId: null,
            projectStageKey: null,

            linkedTechnicianId: null,
            linkedTechnicianName: null,

            notes: `${notesPrefix} • Approved PTO request`,
            timesheetId: null,

            entryStatus: "draft",

            createdAt: nowIso,
            updatedAt: nowIso,
          });

          allTimeEntries.push({
            id: newDoc.id,
            employeeId: requestItem.employeeId,
            entryDate,
            category: "pto",
            source: "system_generated_pto",
            notes: `${notesPrefix} • Approved PTO request`,
          });

          createdTimeEntryCount += 1;
        }

        const alreadyHasUnavailability = allUnavailability.find((u) => {
          if (u.uid !== requestItem.employeeId) return false;
          if (u.date !== entryDate) return false;
          if (u.active === false) return false;

          if ((u.ptoRequestId || "") === requestItem.id) return true;

          if (
            u.type === "pto" &&
            (u.source === "pto_request_approved" || u.source === "admin_override")
          ) {
            return true;
          }

          return false;
        });

        if (!alreadyHasUnavailability) {
          const employeeName = requestItem.employeeName || "Unknown";
          const approverName = appUser.displayName || "Unknown Approver";

          const unavailDoc = await addDoc(collection(db, "employeeUnavailability"), {
            uid: requestItem.employeeId,
            displayName: employeeName,

            date: entryDate,
            type: "pto",
            reason: (managerNote.trim() || requestItem.notes || "").trim() || null,

            source: "pto_request_approved",
            ptoRequestId: requestItem.id,

            active: true,
            createdAt: nowIso,
            createdByUid: appUser.uid,
            createdByName: approverName,

            updatedAt: nowIso,
            updatedByUid: appUser.uid,
            updatedByName: approverName,
          });

          allUnavailability.push({
            id: unavailDoc.id,
            uid: requestItem.employeeId,
            date: entryDate,
            type: "pto",
            source: "pto_request_approved",
            ptoRequestId: requestItem.id,
            active: true,
          });

          createdUnavailabilityCount += 1;
        }
      }

      await updateDoc(doc(db, "ptoRequests", requestItem.id), {
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || null,
        rejectionReason: null,
        updatedAt: nowIso,
      });

      setRequestItem({
        ...requestItem,
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || undefined,
        rejectionReason: undefined,
        updatedAt: nowIso,
      });

      setSaveMsg(
        `PTO request approved. Created ${createdTimeEntryCount} PTO time entr${
          createdTimeEntryCount === 1 ? "y" : "ies"
        } and ${createdUnavailabilityCount} unavailability block${
          createdUnavailabilityCount === 1 ? "" : "s"
        }.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve PTO request.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!requestItem || !appUser?.uid) return;

    if (!rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "ptoRequests", requestItem.id), {
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || null,
        updatedAt: nowIso,
      });

      setRequestItem({
        ...requestItem,
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || undefined,
        updatedAt: nowIso,
      });

      setSaveMsg("PTO request rejected.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reject PTO request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="PTO Request Detail">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 1200, mx: "auto", pb: 4 }}>
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 3 },
                borderRadius: 5,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems={{ xs: "flex-start", md: "center" }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.4 }}>
                    PTO Request Detail
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
                    Review the request, verify generated PTO dates, and approve or reject
                    when ready.
                  </Typography>
                </Box>

                <Button
                  component={Link}
                  href="/pto-requests"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                  sx={{ borderRadius: 999 }}
                >
                  Back to PTO Requests
                </Button>
              </Stack>
            </Paper>

            {loading ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 4,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Loading PTO request...
                </Typography>
              </Paper>
            ) : null}

            {error ? (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {error}
              </Alert>
            ) : null}

            {saveMsg ? (
              <Alert severity="success" sx={{ borderRadius: 3 }}>
                {saveMsg}
              </Alert>
            ) : null}

            {!loading && requestItem ? (
              <>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  useFlexGap
                  flexWrap="wrap"
                >
                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: alpha(theme.palette.primary.main, 0.06),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <PersonRoundedIcon sx={{ color: "primary.main" }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Employee
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {requestItem.employeeName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {requestItem.employeeRole}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: alpha(theme.palette.warning.main, 0.06),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <CalendarMonthRoundedIcon sx={{ color: "warning.main" }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Date Range
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {requestItem.startDate} → {requestItem.endDate}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: alpha(theme.palette.secondary.main, 0.06),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <ScheduleRoundedIcon sx={{ color: "secondary.main" }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Requested Hours
                        </Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {requestItem.totalRequestedHours.toFixed(2)} total
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {requestItem.hoursPerDay.toFixed(2)} hrs/day
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: "1 1 220px",
                      minWidth: 0,
                      p: 2,
                      borderRadius: 4,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor:
                        requestItem.status === "approved"
                          ? alpha(theme.palette.success.main, 0.07)
                          : requestItem.status === "rejected"
                            ? alpha(theme.palette.error.main, 0.07)
                            : alpha(theme.palette.warning.main, 0.07),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {getStatusIcon(requestItem.status)}
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Status
                        </Typography>
                        <Chip
                          label={formatStatus(requestItem.status)}
                          color={getStatusChipColor(requestItem.status)}
                          size="small"
                          sx={{ mt: 0.5, borderRadius: 999, fontWeight: 600 }}
                        />
                      </Box>
                    </Stack>
                  </Paper>
                </Stack>

                <Stack direction={{ xs: "column", xl: "row" }} spacing={3} alignItems="stretch">
                  <Stack spacing={3} sx={{ flex: 1.05, minWidth: 0 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: { xs: 2, md: 3 },
                        borderRadius: 5,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                      }}
                    >
                      <Stack spacing={2}>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Request Overview
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Core PTO request details and tracking metadata.
                          </Typography>
                        </Box>

                        <Divider />

                        <Stack spacing={1.25}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                          >
                            <Chip
                              icon={<PersonRoundedIcon />}
                              label={`${requestItem.employeeName} (${requestItem.employeeRole})`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              icon={<CalendarMonthRoundedIcon />}
                              label={`${requestItem.startDate} → ${requestItem.endDate}`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              icon={<ScheduleRoundedIcon />}
                              label={`${requestItem.hoursPerDay.toFixed(2)} hrs/day`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                            <Chip
                              icon={<EventAvailableRoundedIcon />}
                              label={`${requestItem.totalRequestedHours.toFixed(2)} total hrs`}
                              variant="outlined"
                              sx={{ borderRadius: 999 }}
                            />
                          </Stack>

                          <Typography variant="body2" color="text.secondary">
                            PTO Request ID: {requestId}
                          </Typography>

                          {requestItem.approvedAt ? (
                            <Typography variant="body2" color="text.secondary">
                              Approved at: {requestItem.approvedAt}
                            </Typography>
                          ) : null}

                          {requestItem.approvedByName ? (
                            <Typography variant="body2" color="text.secondary">
                              Approved by: {requestItem.approvedByName}
                            </Typography>
                          ) : null}

                          {requestItem.rejectedAt ? (
                            <Typography variant="body2" color="text.secondary">
                              Rejected at: {requestItem.rejectedAt}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Stack>
                    </Paper>

                    <Paper
                      elevation={0}
                      sx={{
                        p: { xs: 2, md: 3 },
                        borderRadius: 5,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                      }}
                    >
                      <Stack spacing={2}>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            PTO Dates That Will Generate
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            These weekday dates are eligible for PTO generation from this request.
                          </Typography>
                        </Box>

                        <Divider />

                        {weekdayDates.length === 0 ? (
                          <Paper
                            elevation={0}
                            sx={{
                              p: 2,
                              borderRadius: 3,
                              border: `1px dashed ${theme.palette.divider}`,
                              backgroundColor: alpha(theme.palette.text.primary, 0.02),
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              No weekdays fall within this request range.
                            </Typography>
                          </Paper>
                        ) : (
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                          >
                            {weekdayDates.map((date) => (
                              <Chip
                                key={date}
                                icon={<CalendarMonthRoundedIcon />}
                                label={`${date} • ${requestItem.hoursPerDay.toFixed(2)} hr`}
                                variant="outlined"
                                sx={{ borderRadius: 999 }}
                              />
                            ))}
                          </Stack>
                        )}

                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.info.main, 0.06),
                          }}
                        >
                          <Stack direction="row" spacing={1.25} alignItems="flex-start">
                            <InfoRoundedIcon sx={{ color: "info.main", mt: "2px" }} />
                            <Typography variant="body2" color="text.secondary">
                              Weekends are skipped. Active company holidays are also skipped to
                              avoid double-counting PTO and holiday pay on the same day.
                            </Typography>
                          </Stack>
                        </Paper>
                      </Stack>
                    </Paper>

                    {requestItem.notes ? (
                      <Paper
                        elevation={0}
                        sx={{
                          p: { xs: 2, md: 3 },
                          borderRadius: 5,
                          border: `1px solid ${theme.palette.divider}`,
                          backgroundColor: theme.palette.background.paper,
                        }}
                      >
                        <Stack spacing={2}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Employee Note
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              Additional context provided by the employee.
                            </Typography>
                          </Box>

                          <Divider />

                          <Stack direction="row" spacing={1.25} alignItems="flex-start">
                            <NotesRoundedIcon
                              sx={{ color: "text.secondary", mt: "2px", flexShrink: 0 }}
                            />
                            <Typography
                              variant="body1"
                              sx={{ whiteSpace: "pre-wrap", color: "text.primary" }}
                            >
                              {requestItem.notes}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>
                    ) : null}
                  </Stack>

                  <Paper
                    elevation={0}
                    sx={{
                      flex: 0.95,
                      p: { xs: 2, md: 3 },
                      borderRadius: 5,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: theme.palette.background.paper,
                      minWidth: 0,
                    }}
                  >
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          Manager Review
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Add review notes and approve or reject this PTO request.
                        </Typography>
                      </Box>

                      <Divider />

                      <TextField
                        label="Manager Note"
                        value={managerNote}
                        onChange={(e) => setManagerNote(e.target.value)}
                        multiline
                        minRows={5}
                        disabled={!canTakeAction || saving}
                        fullWidth
                        placeholder="Optional internal note for context or documentation"
                      />

                      <TextField
                        label="Rejection Reason"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        multiline
                        minRows={4}
                        disabled={!canTakeAction || saving}
                        fullWidth
                        placeholder="Required when rejecting this request"
                      />

                      {requestItem.managerNote && !canTakeAction ? (
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.secondary.main, 0.05),
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                            Saved Manager Note
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ whiteSpace: "pre-wrap" }}
                          >
                            {requestItem.managerNote}
                          </Typography>
                        </Paper>
                      ) : null}

                      {requestItem.rejectionReason ? (
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.error.main, 0.05),
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                            Rejection Reason
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ whiteSpace: "pre-wrap" }}
                          >
                            {requestItem.rejectionReason}
                          </Typography>
                        </Paper>
                      ) : null}

                      {canTakeAction ? (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                          <Button
                            type="button"
                            onClick={handleApprove}
                            disabled={saving}
                            variant="contained"
                            startIcon={<CheckCircleRoundedIcon />}
                            size="large"
                            sx={{ borderRadius: 999, px: 2.5 }}
                          >
                            {saving ? "Saving..." : "Approve PTO Request"}
                          </Button>

                          <Button
                            type="button"
                            onClick={handleReject}
                            disabled={saving}
                            variant="outlined"
                            color="error"
                            startIcon={<CloseRoundedIcon />}
                            size="large"
                            sx={{ borderRadius: 999, px: 2.5 }}
                          >
                            {saving ? "Saving..." : "Reject PTO Request"}
                          </Button>
                        </Stack>
                      ) : (
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.text.primary, 0.04),
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Review Locked
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            This request is no longer in a pending state, or your role does not
                            have review permission.
                          </Typography>
                        </Paper>
                      )}
                    </Stack>
                  </Paper>
                </Stack>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}