"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
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
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TodayRoundedIcon from "@mui/icons-material/TodayRounded";

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type {
  PTORequest,
  PTORequestDayType,
  PTORequestPartialDayType,
} from "../../src/types/pto-request";
import type { AppUser } from "../../src/types/app-user";

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function countWeekdays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function formatStatus(status: PTORequest["status"]): string {
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

function formatTime12h(hhmm?: string | null) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [hhRaw, mmRaw] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hhRaw) || !Number.isFinite(mmRaw)) return "—";

  const suffix = hhRaw >= 12 ? "PM" : "AM";
  let hh = hhRaw % 12;
  if (hh === 0) hh = 12;

  if (mmRaw === 0) return `${hh}${suffix}`;
  return `${hh}:${String(mmRaw).padStart(2, "0")}${suffix}`;
}

function diffHours(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return 0;
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return 0;

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(((end - start) / 60) * 100) / 100;
}

function normalizeRequestDayType(value?: string | null): PTORequestDayType {
  return String(value || "").trim().toLowerCase() === "partial_day"
    ? "partial_day"
    : "full_day";
}

function normalizePartialDayType(value?: string | null): PTORequestPartialDayType {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "am" || normalized === "pm" || normalized === "custom") {
    return normalized;
  }
  return "custom";
}

function getPartialWindowTimes(partialDayType: PTORequestPartialDayType) {
  if (partialDayType === "am") return { start: "08:00", end: "12:00" };
  if (partialDayType === "pm") return { start: "13:00", end: "17:00" };
  return { start: "08:00", end: "09:00" };
}

function buildTimingLabel(args: {
  requestDayType?: PTORequestDayType;
  partialDayType?: PTORequestPartialDayType | null;
  partialStartTime?: string | null;
  partialEndTime?: string | null;
}) {
  const requestDayType = normalizeRequestDayType(args.requestDayType);

  if (requestDayType !== "partial_day") {
    return "Full Day";
  }

  const partialDayType = normalizePartialDayType(args.partialDayType || "custom");

  if (partialDayType === "am") return "Partial Day • AM";
  if (partialDayType === "pm") return "Partial Day • PM";

  return `Partial Day • ${formatTime12h(args.partialStartTime)}–${formatTime12h(
    args.partialEndTime
  )}`;
}

export default function PTORequestsPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PTORequest[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const todayIso = toIsoDate(new Date());

  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [requestDayType, setRequestDayType] = useState<PTORequestDayType>("full_day");
  const [partialDayType, setPartialDayType] =
    useState<PTORequestPartialDayType>("custom");
  const [partialStartTime, setPartialStartTime] = useState("08:00");
  const [partialEndTime, setPartialEndTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const canReviewAll =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const canSubmitForOthers = canReviewAll;

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(appUser?.uid || "");

  useEffect(() => {
    if (!selectedEmployeeId && appUser?.uid) {
      setSelectedEmployeeId(appUser.uid);
    }
  }, [appUser?.uid, selectedEmployeeId]);

  useEffect(() => {
    if (requestDayType !== "partial_day") return;
    if (partialDayType === "custom") return;

    const times = getPartialWindowTimes(partialDayType);
    setPartialStartTime(times.start);
    setPartialEndTime(times.end);
  }, [requestDayType, partialDayType]);

  useEffect(() => {
    async function loadData() {
      try {
        const [ptoSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, "ptoRequests"), orderBy("createdAt", "desc"))),
          getDocs(collection(db, "users")),
        ]);

        const ptoItems: PTORequest[] = ptoSnap.docs.map((docSnap) => {
          const data: any = docSnap.data();

          const nextRequestDayType = normalizeRequestDayType(
            data.requestDayType ??
              (data.partialDayType || data.partialStartTime || data.partialEndTime
                ? "partial_day"
                : "full_day")
          );

          const nextPartialDayType =
            nextRequestDayType === "partial_day"
              ? normalizePartialDayType(data.partialDayType)
              : undefined;

          return {
            id: docSnap.id,
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
            requestDayType: nextRequestDayType,
            partialDayType: nextPartialDayType,
            partialStartTime: data.partialStartTime ?? undefined,
            partialEndTime: data.partialEndTime ?? undefined,
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
        });

        const userItems: AppUser[] = usersSnap.docs.map((docSnap) => {
          const data: any = docSnap.data();

          return {
            uid: data.uid ?? docSnap.id,
            displayName: data.displayName ?? "Unnamed User",
            email: data.email ?? "",
            role: data.role ?? "technician",
            active: data.active ?? true,
            laborRoleType: data.laborRoleType ?? undefined,
            preferredTechnicianId: data.preferredTechnicianId ?? null,
            preferredTechnicianName: data.preferredTechnicianName ?? null,
            holidayEligible: data.holidayEligible ?? undefined,
            defaultDailyHolidayHours: data.defaultDailyHolidayHours ?? undefined,
          };
        });

        userItems.sort((a, b) => a.displayName.localeCompare(b.displayName));

        setRequests(ptoItems);
        setUsers(userItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load PTO requests.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const selectedEmployee = useMemo(() => {
    return users.find((u) => u.uid === selectedEmployeeId) ?? null;
  }, [users, selectedEmployeeId]);

  const weekdayCount = useMemo(() => {
    return countWeekdays(startDate, endDate);
  }, [startDate, endDate]);

  const effectiveHoursPerDay = useMemo(() => {
    if (requestDayType !== "partial_day") {
      return hoursPerDay;
    }

    if (partialDayType === "am") return 4;
    if (partialDayType === "pm") return 4;

    return diffHours(partialStartTime, partialEndTime);
  }, [hoursPerDay, requestDayType, partialDayType, partialStartTime, partialEndTime]);

  const totalRequestedHours = useMemo(() => {
    return weekdayCount * effectiveHoursPerDay;
  }, [weekdayCount, effectiveHoursPerDay]);

  const timingLabel = useMemo(() => {
    return buildTimingLabel({
      requestDayType,
      partialDayType,
      partialStartTime,
      partialEndTime,
    });
  }, [requestDayType, partialDayType, partialStartTime, partialEndTime]);

  const visibleRequests = useMemo(() => {
    if (canReviewAll) return requests;
    return requests.filter((item) => item.employeeId === appUser?.uid);
  }, [requests, canReviewAll, appUser?.uid]);

  async function handleCreateRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!appUser?.uid) {
      setError("You must be logged in.");
      return;
    }

    const targetEmployeeId = canSubmitForOthers ? selectedEmployeeId : appUser.uid;

    if (!targetEmployeeId) {
      setError("Please select an employee.");
      return;
    }

    const targetEmployee =
      (canSubmitForOthers ? selectedEmployee : null) ||
      users.find((u) => u.uid === appUser.uid) ||
      null;

    const employeeName =
      targetEmployee?.displayName ||
      (targetEmployeeId === appUser.uid ? appUser.displayName : "Unknown User");

    const employeeRole =
      targetEmployee?.role ||
      (targetEmployeeId === appUser.uid ? appUser.role : "technician");

    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    if (weekdayCount <= 0) {
      setError("This request must include at least one weekday.");
      return;
    }

    if (!canSubmitForOthers && targetEmployeeId !== appUser.uid) {
      setError("You can only submit PTO for yourself.");
      return;
    }

    if (requestDayType === "full_day" && hoursPerDay <= 0) {
      setError("Hours per day must be greater than 0.");
      return;
    }

    if (requestDayType === "partial_day") {
      if (partialDayType === "custom") {
        if (!partialStartTime || !partialEndTime || effectiveHoursPerDay <= 0) {
          setError("Enter a valid custom partial-day time range.");
          return;
        }
      }

      if (effectiveHoursPerDay <= 0) {
        setError("Partial-day PTO must have a valid hour amount.");
        return;
      }
    }

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      const payload = {
        employeeId: targetEmployeeId,
        employeeName,
        employeeRole,
        startDate,
        endDate,
        hoursPerDay: effectiveHoursPerDay,
        totalRequestedHours,
        status: "pending",
        requestDayType,
        partialDayType: requestDayType === "partial_day" ? partialDayType : null,
        partialStartTime:
          requestDayType === "partial_day" && partialDayType === "custom"
            ? partialStartTime
            : requestDayType === "partial_day" && partialDayType !== "custom"
              ? getPartialWindowTimes(partialDayType).start
              : null,
        partialEndTime:
          requestDayType === "partial_day" && partialDayType === "custom"
            ? partialEndTime
            : requestDayType === "partial_day" && partialDayType !== "custom"
              ? getPartialWindowTimes(partialDayType).end
              : null,
        notes: notes.trim() || null,
        managerNote: null,
        rejectionReason: null,
        approvedAt: null,
        approvedById: null,
        approvedByName: null,
        rejectedAt: null,
        rejectedById: null,
        createdById: appUser.uid,
        createdByName: appUser.displayName || "Unknown",
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const docRef = await addDoc(collection(db, "ptoRequests"), payload as any);

      const newItem: PTORequest = {
        id: docRef.id,
        employeeId: targetEmployeeId,
        employeeName,
        employeeRole,
        startDate,
        endDate,
        hoursPerDay: effectiveHoursPerDay,
        totalRequestedHours,
        status: "pending",
        requestDayType,
        partialDayType: requestDayType === "partial_day" ? partialDayType : undefined,
        partialStartTime:
          requestDayType === "partial_day"
            ? payload.partialStartTime ?? undefined
            : undefined,
        partialEndTime:
          requestDayType === "partial_day"
            ? payload.partialEndTime ?? undefined
            : undefined,
        notes: notes.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setRequests((prev) => [newItem, ...prev]);
      setSaveMsg("PTO request submitted.");

      setStartDate(todayIso);
      setEndDate(todayIso);
      setHoursPerDay(8);
      setRequestDayType("full_day");
      setPartialDayType("custom");
      setPartialStartTime("08:00");
      setPartialEndTime("09:00");
      setNotes("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create PTO request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="PTO Requests">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 1200, mx: "auto", pb: 4 }}>
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.25, md: 3 },
                borderRadius: 4,
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
                    PTO Requests
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ mt: 0.75, maxWidth: 760 }}
                  >
                    Submit paid time off requests, including partial-day requests, and
                    track approval status in one place.
                  </Typography>
                </Box>

                <Chip
                  icon={<EventAvailableRoundedIcon />}
                  label={canReviewAll ? "Reviewer access" : "Employee access"}
                  color="primary"
                  variant="outlined"
                  sx={{ borderRadius: 999 }}
                />
              </Stack>
            </Paper>

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

            <Stack direction={{ xs: "column", xl: "row" }} spacing={3} alignItems="stretch">
              <Paper
                elevation={0}
                sx={{
                  flex: 1.05,
                  p: { xs: 2, md: 3 },
                  borderRadius: 4,
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.background.paper,
                }}
              >
                <Stack spacing={2.5} component="form" onSubmit={handleCreateRequest}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      New PTO Request
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Choose dates, full day or partial day, and any supporting notes.
                    </Typography>
                  </Box>

                  {canSubmitForOthers ? (
                    <TextField
                      select
                      label="Employee"
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      fullWidth
                    >
                      <MenuItem value="">Select employee</MenuItem>
                      {users.map((u) => (
                        <MenuItem key={u.uid} value={u.uid}>
                          {u.displayName} ({u.role})
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : null}

                  {canSubmitForOthers ? (
                    <Paper
                      elevation={0}
                      sx={{
                        px: 2,
                        py: 1.5,
                        borderRadius: 3,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: alpha(theme.palette.primary.main, 0.05),
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <PersonRoundedIcon
                          fontSize="small"
                          sx={{ color: "primary.main" }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          Submitting on behalf of{" "}
                          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                            {selectedEmployee?.displayName || "—"}
                          </Box>
                        </Typography>
                      </Stack>
                    </Paper>
                  ) : null}

                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="Start Date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />

                    <TextField
                      label="End Date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Stack>

                  <TextField
                    select
                    label="Request Type"
                    value={requestDayType}
                    onChange={(e) =>
                      setRequestDayType(e.target.value as PTORequestDayType)
                    }
                    fullWidth
                  >
                    <MenuItem value="full_day">Full Day</MenuItem>
                    <MenuItem value="partial_day">Partial Day</MenuItem>
                  </TextField>

                  {requestDayType === "full_day" ? (
                    <TextField
                      label="Hours Per Day"
                      type="number"
                      value={hoursPerDay}
                      onChange={(e) => setHoursPerDay(Number(e.target.value))}
                      inputProps={{ min: 0.25, step: 0.25 }}
                      fullWidth
                    />
                  ) : (
                    <Stack spacing={2}>
                      <TextField
                        select
                        label="Partial Day Block"
                        value={partialDayType}
                        onChange={(e) =>
                          setPartialDayType(e.target.value as PTORequestPartialDayType)
                        }
                        fullWidth
                      >
                        <MenuItem value="am">AM (8:00–12:00)</MenuItem>
                        <MenuItem value="pm">PM (1:00–5:00)</MenuItem>
                        <MenuItem value="custom">Custom Time</MenuItem>
                      </TextField>

                      {partialDayType === "custom" ? (
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                          <TextField
                            label="Start Time"
                            type="time"
                            value={partialStartTime}
                            onChange={(e) => setPartialStartTime(e.target.value)}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                          />
                          <TextField
                            label="End Time"
                            type="time"
                            value={partialEndTime}
                            onChange={(e) => setPartialEndTime(e.target.value)}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                          />
                        </Stack>
                      ) : null}

                      <Paper
                        elevation={0}
                        sx={{
                          p: 1.5,
                          borderRadius: 3,
                          border: `1px solid ${theme.palette.divider}`,
                          backgroundColor: alpha(theme.palette.warning.main, 0.05),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <AccessTimeRoundedIcon
                            fontSize="small"
                            sx={{ color: "warning.main" }}
                          />
                          <Typography variant="body2" color="text.secondary">
                            Partial-day hours will be calculated automatically:{" "}
                            <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                              {effectiveHoursPerDay.toFixed(2)} hrs/day
                            </Box>
                          </Typography>
                        </Stack>
                      </Paper>
                    </Stack>
                  )}

                  <TextField
                    label="Employee Note"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    multiline
                    minRows={4}
                    fullWidth
                    placeholder="Optional details for reviewer context"
                  />

                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      border: `1px solid ${theme.palette.divider}`,
                      backgroundColor: alpha(theme.palette.secondary.main, 0.05),
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Request Summary
                      </Typography>

                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        useFlexGap
                        flexWrap="wrap"
                      >
                        <Chip
                          icon={<TodayRoundedIcon />}
                          label={`${weekdayCount} weekday${weekdayCount === 1 ? "" : "s"}`}
                          variant="outlined"
                          sx={{ borderRadius: 999 }}
                        />
                        <Chip
                          icon={<ScheduleRoundedIcon />}
                          label={`${totalRequestedHours.toFixed(2)} total hours`}
                          variant="outlined"
                          sx={{ borderRadius: 999 }}
                        />
                        <Chip
                          icon={<EventNoteRoundedIcon />}
                          label={timingLabel}
                          variant="outlined"
                          sx={{ borderRadius: 999 }}
                        />
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        Weekends are automatically excluded from PTO hour calculation.
                      </Typography>
                    </Stack>
                  </Paper>

                  <Stack direction="row" justifyContent="flex-start">
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={saving}
                      size="large"
                      sx={{ borderRadius: 999, px: 2.5 }}
                    >
                      {saving ? "Submitting..." : "Submit PTO Request"}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  flex: 1,
                  p: { xs: 2, md: 3 },
                  borderRadius: 4,
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.background.paper,
                  minWidth: 0,
                }}
              >
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {canReviewAll ? "All PTO Requests" : "My PTO Requests"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {canReviewAll
                        ? "Review all submitted requests across the team."
                        : "Track your submitted PTO requests and approval status."}
                    </Typography>
                  </Box>

                  <Divider />

                  {loading ? (
                    <Typography variant="body2" color="text.secondary">
                      Loading PTO requests...
                    </Typography>
                  ) : null}

                  {!loading && visibleRequests.length === 0 ? (
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2.5,
                        borderRadius: 3,
                        border: `1px dashed ${theme.palette.divider}`,
                        backgroundColor: alpha(theme.palette.text.primary, 0.02),
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        No PTO requests found.
                      </Typography>
                    </Paper>
                  ) : null}

                  {!loading && visibleRequests.length > 0 ? (
                    <Stack spacing={1.5}>
                      {visibleRequests.map((request) => (
                        <Card
                          key={request.id}
                          elevation={0}
                          sx={{
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            overflow: "hidden",
                            transition: "background-color 0.2s ease, border-color 0.2s ease",
                            "&:hover": {
                              borderColor: theme.palette.primary.main,
                              backgroundColor: alpha(theme.palette.primary.main, 0.03),
                            },
                          }}
                        >
                          <CardActionArea
                            component={Link}
                            href={`/pto-requests/${request.id}`}
                            sx={{ alignItems: "stretch" }}
                          >
                            <CardContent sx={{ p: 2 }}>
                              <Stack spacing={1.25}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                  justifyContent="space-between"
                                >
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography
                                      variant="subtitle1"
                                      sx={{ fontWeight: 700, lineHeight: 1.2 }}
                                    >
                                      {request.employeeName}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {request.employeeRole}
                                    </Typography>
                                  </Box>

                                  <Chip
                                    label={formatStatus(request.status)}
                                    color={getStatusChipColor(request.status)}
                                    size="small"
                                    sx={{ borderRadius: 999, fontWeight: 600 }}
                                  />
                                </Stack>

                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1}
                                  useFlexGap
                                  flexWrap="wrap"
                                >
                                  <Chip
                                    icon={<TodayRoundedIcon />}
                                    label={`${request.startDate} → ${request.endDate}`}
                                    variant="outlined"
                                    size="small"
                                    sx={{ borderRadius: 999 }}
                                  />
                                  <Chip
                                    icon={<ScheduleRoundedIcon />}
                                    label={`${request.hoursPerDay.toFixed(2)} hrs/day`}
                                    variant="outlined"
                                    size="small"
                                    sx={{ borderRadius: 999 }}
                                  />
                                  <Chip
                                    icon={<EventAvailableRoundedIcon />}
                                    label={`${request.totalRequestedHours.toFixed(2)} total hrs`}
                                    variant="outlined"
                                    size="small"
                                    sx={{ borderRadius: 999 }}
                                  />
                                  <Chip
                                    icon={<AccessTimeRoundedIcon />}
                                    label={buildTimingLabel(request)}
                                    variant="outlined"
                                    size="small"
                                    sx={{ borderRadius: 999 }}
                                  />
                                </Stack>

                                {request.notes ? (
                                  <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <NotesRoundedIcon
                                      fontSize="small"
                                      sx={{
                                        mt: "2px",
                                        color: "text.secondary",
                                        flexShrink: 0,
                                      }}
                                    />
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                      sx={{
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {request.notes}
                                    </Typography>
                                  </Stack>
                                ) : null}

                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  justifyContent="flex-end"
                                >
                                  <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                                    Open details
                                  </Typography>
                                  <ArrowForwardRoundedIcon
                                    fontSize="small"
                                    sx={{ color: "primary.main" }}
                                  />
                                </Stack>
                              </Stack>
                            </CardContent>
                          </CardActionArea>
                        </Card>
                      ))}
                    </Stack>
                  ) : null}
                </Stack>
              </Paper>
            </Stack>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}