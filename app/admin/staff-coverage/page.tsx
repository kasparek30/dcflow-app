// app/admin/staff-coverage/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type {
  AppUser,
  StaffCoverageWorkType,
} from "../../../src/types/app-user";
import type { StaffCoverage } from "../../../src/types/staff-coverage";

type StaffEmployeeOption = {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  laborRoleType?: string | null;
  defaultStaffCoverageWorkType?: StaffCoverageWorkType | null;
};

const WORK_TYPE_OPTIONS: Array<{
  value: StaffCoverageWorkType;
  label: string;
}> = [
  { value: "dispatch", label: "Dispatch Coverage" },
  { value: "billing", label: "Billing" },
  { value: "office", label: "Office" },
  { value: "admin", label: "Admin" },
  { value: "shop", label: "Shop" },
  { value: "other", label: "Other" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function todayIsoLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toIsoDate(d);
}

function nowIso() {
  return new Date().toISOString();
}

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function parseHHMM(hhmm: string) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function minutesFromHHMM(hhmm: string) {
  const parsed = parseHHMM(hhmm);
  if (!parsed) return null;
  return parsed.hh * 60 + parsed.mm;
}

function formatTime12h(hhmm?: string | null) {
  const parsed = parseHHMM(String(hhmm || ""));
  if (!parsed) return "—";

  let hh = parsed.hh;
  const suffix = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;

  return parsed.mm === 0
    ? `${hh}${suffix}`
    : `${hh}:${pad2(parsed.mm)}${suffix}`;
}

function defaultUnpaidBreakMinutes(startTime: string, endTime: string) {
  const start = minutesFromHHMM(startTime);
  const end = minutesFromHHMM(endTime);
  if (start == null || end == null || end <= start) return 0;

  const grossMinutes = end - start;

  // Default 1-hour unpaid lunch for full-day office/dispatch coverage.
  // Example: 8:00 AM–5:00 PM = 9 gross hours - 1 lunch = 8 paid hours.
  if (grossMinutes >= 8 * 60) return 60;

  return 0;
}

function calculatePaidHours(
  startTime: string,
  endTime: string,
  unpaidBreakMinutes: number
) {
  const start = minutesFromHHMM(startTime);
  const end = minutesFromHHMM(endTime);
  if (start == null || end == null || end <= start) return null;

  const grossMinutes = end - start;
  const paidMinutes = Math.max(0, grossMinutes - unpaidBreakMinutes);

  return Math.round((paidMinutes / 60) * 100) / 100;
}

function getPayrollWeekBounds(entryDateIso: string) {
  const [y, m, d] = entryDateIso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);

  const wd = dt.getDay();
  const diffToMon = (wd + 6) % 7;

  const weekStart = new Date(dt);
  weekStart.setDate(weekStart.getDate() - diffToMon);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    weekStartDate: toIsoDate(weekStart),
    weekEndDate: toIsoDate(weekEnd),
  };
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

function isLockedWeeklyTimesheetStatus(status?: string | null) {
  const s = safeTrim(status).toLowerCase();
  return (
    s === "submitted" ||
    s === "approved" ||
    s === "exported" ||
    s === "exported_to_quickbooks"
  );
}

function labelForWorkType(workType?: string | null) {
  return (
    WORK_TYPE_OPTIONS.find((option) => option.value === workType)?.label ||
    "Staff Coverage"
  );
}

function isStaffCoverageCandidate(user: AppUser) {
  if (!user.active) return false;
  if (user.staffCoverageEligible === true) return true;
  if (user.laborRoleType === "office") return true;

  return (
    user.role === "dispatcher" ||
    user.role === "billing" ||
    user.role === "admin" ||
    user.role === "manager"
  );
}

export default function StaffCoverageAdminPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState<StaffEmployeeOption[]>([]);
  const [coverageRows, setCoverageRows] = useState<StaffCoverage[]>([]);

  const [employeeId, setEmployeeId] = useState("");
  const [workType, setWorkType] =
    useState<StaffCoverageWorkType>("dispatch");
  const [date, setDate] = useState(todayIsoLocal());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [unpaidBreakMinutes, setUnpaidBreakMinutes] = useState(60);
  const [notes, setNotes] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedEmployee = useMemo(() => {
    return employees.find((employee) => employee.uid === employeeId) || null;
  }, [employees, employeeId]);

const grossHours = useMemo(() => {
  const start = minutesFromHHMM(startTime);
  const end = minutesFromHHMM(endTime);

  if (start == null || end == null || end <= start) return null;

  return Math.round(((end - start) / 60) * 100) / 100;
}, [startTime, endTime]);

useEffect(() => {
  setUnpaidBreakMinutes(defaultUnpaidBreakMinutes(startTime, endTime));
}, [startTime, endTime]);

const scheduledHours = useMemo(() => {
  return calculatePaidHours(startTime, endTime, unpaidBreakMinutes);
}, [startTime, endTime, unpaidBreakMinutes]);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [usersSnap, coverageSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "staffCoverage")),
      ]);

      const userItems: AppUser[] = usersSnap.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          uid: data.uid ?? docSnap.id,
          displayName: data.displayName ?? "Unnamed",
          email: data.email ?? "",
          role: data.role ?? "dispatcher",
          active: Boolean(data.active ?? true),
          laborRoleType: data.laborRoleType ?? undefined,
          preferredTechnicianId: data.preferredTechnicianId ?? null,
          preferredTechnicianName: data.preferredTechnicianName ?? null,
          holidayEligible: data.holidayEligible ?? undefined,
          defaultDailyHolidayHours: data.defaultDailyHolidayHours ?? undefined,
          showOnSchedule: data.showOnSchedule ?? undefined,
          fieldAssignable: data.fieldAssignable ?? undefined,
          staffCoverageEligible: data.staffCoverageEligible ?? undefined,
          defaultStaffCoverageWorkType:
            data.defaultStaffCoverageWorkType ?? null,
        };
      });

      const employeeOptions = userItems
        .filter(isStaffCoverageCandidate)
        .map((user) => ({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          laborRoleType: user.laborRoleType ?? null,
          defaultStaffCoverageWorkType:
            user.defaultStaffCoverageWorkType ?? null,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      const rows = coverageSnap.docs
        .map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            employeeId: String(data.employeeId ?? ""),
            employeeName: String(data.employeeName ?? ""),
            employeeRole: String(data.employeeRole ?? ""),
            laborRoleType: data.laborRoleType ?? null,
            workType: data.workType ?? "office",
            date: String(data.date ?? ""),
            startTime: String(data.startTime ?? ""),
            endTime: String(data.endTime ?? ""),
            scheduledHours:
              typeof data.scheduledHours === "number"
                ? data.scheduledHours
                : 0,
            status: data.status ?? "scheduled",
            active: Boolean(data.active ?? true),
            linkedTimeEntryId: data.linkedTimeEntryId ?? null,
            linkedWeeklyTimesheetId: data.linkedWeeklyTimesheetId ?? null,
            actualStartAt: data.actualStartAt ?? null,
            actualEndAt: data.actualEndAt ?? null,
            confirmedAt: data.confirmedAt ?? null,
            confirmedByUid: data.confirmedByUid ?? null,
            notes: data.notes ?? null,
            createdAt: data.createdAt ?? "",
            createdByUid: data.createdByUid ?? null,
            createdByName: data.createdByName ?? null,
            updatedAt: data.updatedAt ?? "",
            updatedByUid: data.updatedByUid ?? null,
            updatedByName: data.updatedByName ?? null,
          } satisfies StaffCoverage;
        })
        .filter((row) => row.active !== false)
        .sort((a, b) => {
          const byDate = a.date.localeCompare(b.date);
          if (byDate !== 0) return byDate;
          const byTime = a.startTime.localeCompare(b.startTime);
          if (byTime !== 0) return byTime;
          return a.employeeName.localeCompare(b.employeeName);
        });

      setEmployees(employeeOptions);
      setCoverageRows(rows);

      if (!employeeId && employeeOptions.length > 0) {
        const peggy =
          employeeOptions.find((employee) =>
            employee.displayName.toLowerCase().includes("peggy")
          ) || employeeOptions[0];

        setEmployeeId(peggy.uid);
        setWorkType(peggy.defaultStaffCoverageWorkType || "dispatch");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load staff coverage.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEmployeeChange(nextEmployeeId: string) {
    setEmployeeId(nextEmployeeId);

    const employee = employees.find((item) => item.uid === nextEmployeeId);
    if (employee?.defaultStaffCoverageWorkType) {
      setWorkType(employee.defaultStaffCoverageWorkType);
    } else if (employee?.role === "dispatcher") {
      setWorkType("dispatch");
    } else if (employee?.role === "billing") {
      setWorkType("billing");
    } else {
      setWorkType("office");
    }
  }

  async function handleCreateCoverage() {
    setError("");
    setMessage("");

    if (!appUser?.uid) {
      setError("Missing signed-in user.");
      return;
    }

    if (!selectedEmployee) {
      setError("Choose an employee.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Choose a valid date.");
      return;
    }

    if (scheduledHours == null || scheduledHours <= 0) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);

    try {
      const now = nowIso();
      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(date);
      const weeklyTimesheetId = buildWeeklyTimesheetId(
        selectedEmployee.uid,
        weekStartDate
      );

      const timesheetRef = doc(db, "weeklyTimesheets", weeklyTimesheetId);
      const existingTimesheetSnap = await getDoc(timesheetRef);
      const existingTimesheet = existingTimesheetSnap.exists()
        ? (existingTimesheetSnap.data() as any)
        : null;

      if (isLockedWeeklyTimesheetStatus(existingTimesheet?.status)) {
        throw new Error(
          `${selectedEmployee.displayName}'s weekly timesheet for ${weekStartDate} is already locked/submitted. Unlock or reject it before changing scheduled staff coverage.`
        );
      }

      const coverageRef = doc(collection(db, "staffCoverage"));
      const timeEntryId = `staff_${coverageRef.id}`;
      const timeEntryRef = doc(db, "timeEntries", timeEntryId);

      const coveragePayload: Omit<StaffCoverage, "id"> = {
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,
        laborRoleType: selectedEmployee.laborRoleType ?? null,
        workType,
        date,
        startTime,
        endTime,
        scheduledHours,
        unpaidBreakMinutes,
        status: "scheduled",
        active: true,
        linkedTimeEntryId: timeEntryId,
        linkedWeeklyTimesheetId: weeklyTimesheetId,
        actualStartAt: null,
        actualEndAt: null,
        confirmedAt: null,
        confirmedByUid: null,
        notes: notes.trim() || null,
        createdAt: now,
        createdByUid: appUser.uid,
        createdByName: appUser.displayName || null,
        updatedAt: now,
        updatedByUid: appUser.uid,
        updatedByName: appUser.displayName || null,
      };

      const entryNote = [
        `${labelForWorkType(workType)}: ${formatTime12h(
          startTime
        )}–${formatTime12h(endTime)}`,
        notes.trim(),
      ]
        .filter(Boolean)
        .join("\n");

      const batch = writeBatch(db);

      batch.set(coverageRef, coveragePayload);

      batch.set(
        timesheetRef,
        {
          employeeId: selectedEmployee.uid,
          employeeName: selectedEmployee.displayName,
          employeeRole: selectedEmployee.role,
          weekStartDate,
          weekEndDate,
          status: existingTimesheet?.status || "draft",
          submittedAt: existingTimesheet?.submittedAt ?? null,
          submittedByUid: existingTimesheet?.submittedByUid ?? null,
          quickbooksExportStatus:
            existingTimesheet?.quickbooksExportStatus ?? "not_ready",
          createdAt: existingTimesheet?.createdAt ?? now,
          createdByUid: existingTimesheet?.createdByUid ?? appUser.uid,
          updatedAt: now,
          updatedByUid: appUser.uid,
        },
        { merge: true }
      );

      batch.set(timeEntryRef, {
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,
        laborRoleType: selectedEmployee.laborRoleType ?? null,

        entryDate: date,
        weekStartDate,
        weekEndDate,
        timesheetId: weeklyTimesheetId,

        category: "office",
        workType,
        payType: "regular",
        billable: false,
        source: "staff_schedule",

        hours: scheduledHours,
        hoursSource: scheduledHours,
        hoursLocked: false,

        staffCoverageId: coverageRef.id,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        unpaidBreakMinutes,

        title: labelForWorkType(workType),
        notes: entryNote || null,

        entryStatus: "draft",

        createdAt: now,
        createdByUid: appUser.uid,
        updatedAt: now,
        updatedByUid: appUser.uid,
      });

      batch.set(
        timesheetRef,
        {
          timeEntryIds: Array.from(
            new Set([
              ...(Array.isArray(existingTimesheet?.timeEntryIds)
                ? existingTimesheet.timeEntryIds
                : []),
              timeEntryId,
            ])
          ),
          updatedAt: now,
          updatedByUid: appUser.uid,
        },
        { merge: true }
      );

      await batch.commit();

      setMessage(
        `${selectedEmployee.displayName} scheduled for ${labelForWorkType(
          workType
        )} on ${date}. Time entry created.`
      );

      setNotes("");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to create staff coverage.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelCoverage(row: StaffCoverage) {
    const ok = window.confirm(
      `Cancel ${row.employeeName}'s ${labelForWorkType(row.workType)} coverage on ${row.date}? This will remove the linked draft time entry if the timesheet is not locked.`
    );
    if (!ok) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const now = nowIso();
      const weeklyTimesheetId =
        row.linkedWeeklyTimesheetId ||
        buildWeeklyTimesheetId(row.employeeId, getPayrollWeekBounds(row.date).weekStartDate);

      const timesheetRef = doc(db, "weeklyTimesheets", weeklyTimesheetId);
      const timesheetSnap = await getDoc(timesheetRef);

      if (
        timesheetSnap.exists() &&
        isLockedWeeklyTimesheetStatus((timesheetSnap.data() as any).status)
      ) {
        throw new Error(
          `${row.employeeName}'s weekly timesheet is locked/submitted. Unlock or reject it before cancelling this staff coverage.`
        );
      }

      const existingTimeEntryIds = timesheetSnap.exists()
        ? Array.isArray((timesheetSnap.data() as any).timeEntryIds)
          ? (timesheetSnap.data() as any).timeEntryIds
          : []
        : [];

      const batch = writeBatch(db);

      batch.update(doc(db, "staffCoverage", row.id), {
        active: false,
        status: "cancelled",
        updatedAt: now,
        updatedByUid: appUser?.uid || null,
        updatedByName: appUser?.displayName || null,
      });

      if (row.linkedTimeEntryId) {
        batch.delete(doc(db, "timeEntries", row.linkedTimeEntryId));
        batch.set(
          timesheetRef,
          {
            timeEntryIds: existingTimeEntryIds.filter(
              (id: string) => id !== row.linkedTimeEntryId
            ),
            updatedAt: now,
            updatedByUid: appUser?.uid || null,
          },
          { merge: true }
        );
      }

      await batch.commit();

      setMessage("Staff coverage cancelled and linked time entry removed.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to cancel staff coverage.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Staff Coverage" allowedRoles={["admin"]}>
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
                    icon={<SupportAgentRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Staff Coverage"
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
                  Staff Coverage
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
                  Schedule office, dispatch, billing, and other non-field coverage.
                  Scheduling coverage creates a draft time entry for payroll.
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/admin"
                variant="outlined"
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2 }}
              >
                Back to Admin
              </Button>
            </Stack>

            {error ? <Alert severity="error">{error}</Alert> : null}
            {message ? <Alert severity="success">{message}</Alert> : null}

            <Card
              elevation={0}
              sx={{
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                backgroundColor: alpha(theme.palette.primary.main, 0.06),
              }}
            >
              <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={2.25}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      Schedule staff coverage
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Example: Peggy → Dispatch Coverage → Tuesday → 8:00 AM–5:00 PM.
                    </Typography>
                  </Box>

                  {loading ? (
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <CircularProgress size={22} />
                      <Typography variant="body2" color="text.secondary">
                        Loading staff coverage...
                      </Typography>
                    </Stack>
                  ) : null}

                  {!loading ? (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                            xs: "1fr",
                            md: "1.4fr 1fr 1fr 1fr 1fr 1fr",
                        },
                        gap: 1.5,
                      }}
                    >
                      <FormControl fullWidth>
                        <InputLabel>Employee</InputLabel>
                        <Select
                          label="Employee"
                          value={employeeId}
                          onChange={(event) =>
                            handleEmployeeChange(event.target.value)
                          }
                          disabled={saving}
                        >
                          {employees.map((employee) => (
                            <MenuItem key={employee.uid} value={employee.uid}>
                              {employee.displayName} ({employee.role})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl fullWidth>
                        <InputLabel>Work Type</InputLabel>
                        <Select
                          label="Work Type"
                          value={workType}
                          onChange={(event) =>
                            setWorkType(event.target.value as StaffCoverageWorkType)
                          }
                          disabled={saving}
                        >
                          {WORK_TYPE_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <TextField
                        label="Date"
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        disabled={saving}
                        InputLabelProps={{ shrink: true }}
                      />

                      <TextField
                        label="Start"
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        disabled={saving}
                        InputLabelProps={{ shrink: true }}
                      />

                      <TextField
                        label="End"
                        type="time"
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                        disabled={saving}
                        InputLabelProps={{ shrink: true }}
                      />
                      <FormControl fullWidth>
  <InputLabel>Unpaid Lunch</InputLabel>
  <Select
    label="Unpaid Lunch"
    value={String(unpaidBreakMinutes)}
    onChange={(event) => setUnpaidBreakMinutes(Number(event.target.value))}
    disabled={saving}
  >
    <MenuItem value="0">None</MenuItem>
    <MenuItem value="30">30 minutes</MenuItem>
    <MenuItem value="60">1 hour</MenuItem>
  </Select>
</FormControl>
                    </Box>
                  ) : null}

                  <TextField
                    label="Notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    disabled={saving}
                    multiline
                    minRows={2}
                    placeholder="Phone + scheduling coverage"
                    fullWidth
                  />

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "stretch", sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Chip
                      icon={<EventAvailableRoundedIcon />}
                      label={
                        scheduledHours
                            ? `${scheduledHours.toFixed(2)} paid hours${
                                grossHours ? ` from ${grossHours.toFixed(2)} scheduled` : ""
                            }${
                                unpaidBreakMinutes > 0
                                ? ` • ${unpaidBreakMinutes / 60}h lunch`
                                : ""
                            }`
                            : "Enter a valid time range"
                        }
                      color={scheduledHours ? "primary" : "default"}
                      variant={scheduledHours ? "filled" : "outlined"}
                    />

                    <Button
                      variant="contained"
                      startIcon={<SaveRoundedIcon />}
                      onClick={handleCreateCoverage}
                      disabled={saving || loading || employees.length === 0}
                      sx={{ minHeight: 42, borderRadius: 2 }}
                    >
                      {saving ? "Saving..." : "Schedule Coverage"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
                Upcoming active coverage
              </Typography>

              {coverageRows.length === 0 && !loading ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    No active staff coverage scheduled yet.
                  </Typography>
                </Paper>
              ) : null}

              <Stack spacing={1.25}>
                {coverageRows.map((row) => (
                  <Paper
                    key={row.id}
                    elevation={0}
                    sx={{
                      p: { xs: 1.75, md: 2 },
                      borderRadius: 3,
                      border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1.5}
                      alignItems={{ xs: "flex-start", md: "center" }}
                      justifyContent="space-between"
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                          alignItems="center"
                        >
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            {row.employeeName}
                          </Typography>

                          <Chip
                            size="small"
                            label={labelForWorkType(row.workType)}
                            color={row.workType === "dispatch" ? "primary" : "default"}
                            variant="outlined"
                          />

                          <Chip
                            size="small"
                            label={row.status}
                            variant="outlined"
                          />
                        </Stack>

                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {row.date} • {formatTime12h(row.startTime)}–
                          {formatTime12h(row.endTime)} •{" "}
                          {row.scheduledHours.toFixed(2)} hrs
                        </Typography>

                        {row.notes ? (
                          <Typography variant="body2" sx={{ mt: 0.75 }}>
                            {row.notes}
                          </Typography>
                        ) : null}
                      </Box>

                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteRoundedIcon />}
                          disabled={saving}
                          onClick={() => handleCancelCoverage(row)}
                          sx={{ borderRadius: 2 }}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}