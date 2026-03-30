"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
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
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EditCalendarRoundedIcon from "@mui/icons-material/EditCalendarRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PublishRoundedIcon from "@mui/icons-material/PublishRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import NoteAltRoundedIcon from "@mui/icons-material/NoteAltRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { WeeklyTimesheet } from "../../../src/types/weekly-timesheet";
import type { TimeEntry } from "../../../src/types/time-entry";

type Props = {
  params: Promise<{ timesheetId: string }>;
};

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

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

function numOr0(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function stageLabel(stage?: string) {
  const s = safeTrim(stage);
  if (!s) return "";
  if (s === "roughIn") return "Rough-In";
  if (s === "topOutVent") return "Top-Out / Vent";
  if (s === "trimFinish") return "Trim / Finish";
  return s;
}

function isWorkedHoursCategory(category: TimeEntry["category"]) {
  const c = safeTrim(category).toLowerCase();

  if (
    c === "service" ||
    c === "project" ||
    c === "meeting" ||
    c === "shop" ||
    c === "office" ||
    c === "manual_other"
  ) {
    return true;
  }

  if (c === "service_ticket" || c === "project_stage") return true;

  return false;
}

type ServiceTicketMini = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
};

type ProjectMini = {
  id: string;
  projectName: string;
};

export default function TimesheetReviewDetailPage({ params }: Props) {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const canReview =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [timesheetId, setTimesheetId] = useState("");
  const [timesheet, setTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [editedHoursByEntryId, setEditedHoursByEntryId] = useState<
    Record<string, number>
  >({});
  const [lockByEntryId, setLockByEntryId] = useState<Record<string, boolean>>(
    {}
  );

  const [rejectionReason, setRejectionReason] = useState("");
  const [managerNote, setManagerNote] = useState("");

  const [ticketMiniById, setTicketMiniById] = useState<
    Record<string, ServiceTicketMini>
  >({});
  const [projectMiniById, setProjectMiniById] = useState<
    Record<string, ProjectMini>
  >({});

  useEffect(() => {
    async function load() {
      setError("");
      setOk("");
      setLoading(true);

      try {
        const resolved = await params;
        const id = resolved.timesheetId;
        setTimesheetId(id);

        const tsSnap = await getDoc(doc(db, "weeklyTimesheets", id));
        if (!tsSnap.exists()) {
          setError("Timesheet not found.");
          setLoading(false);
          return;
        }

        const d: any = tsSnap.data();

        const ts: WeeklyTimesheet = {
          id: tsSnap.id,
          employeeId: d.employeeId ?? "",
          employeeName: d.employeeName ?? "",
          employeeRole: d.employeeRole ?? "",
          weekStartDate: d.weekStartDate ?? "",
          weekEndDate: d.weekEndDate ?? "",
          timeEntryIds: Array.isArray(d.timeEntryIds) ? d.timeEntryIds : [],
          totalHours: typeof d.totalHours === "number" ? d.totalHours : 0,
          regularHours: typeof d.regularHours === "number" ? d.regularHours : 0,
          overtimeHours:
            typeof d.overtimeHours === "number" ? d.overtimeHours : 0,
          ptoHours: typeof d.ptoHours === "number" ? d.ptoHours : 0,
          holidayHours:
            typeof d.holidayHours === "number" ? d.holidayHours : 0,
          billableHours:
            typeof d.billableHours === "number" ? d.billableHours : 0,
          nonBillableHours:
            typeof d.nonBillableHours === "number" ? d.nonBillableHours : 0,
          status: d.status ?? "draft",
          submittedAt: d.submittedAt ?? undefined,
          submittedById: d.submittedById ?? undefined,
          approvedAt: d.approvedAt ?? undefined,
          approvedById: d.approvedById ?? undefined,
          approvedByName: d.approvedByName ?? undefined,
          rejectedAt: d.rejectedAt ?? undefined,
          rejectedById: d.rejectedById ?? undefined,
          rejectionReason: d.rejectionReason ?? undefined,
          quickbooksExportStatus: d.quickbooksExportStatus ?? "not_ready",
          quickbooksExportedAt: d.quickbooksExportedAt ?? undefined,
          quickbooksPayrollBatchId: d.quickbooksPayrollBatchId ?? undefined,
          employeeNote: d.employeeNote ?? undefined,
          managerNote: d.managerNote ?? undefined,
          createdAt: d.createdAt ?? undefined,
          updatedAt: d.updatedAt ?? undefined,
        };

        setTimesheet(ts);
        setRejectionReason(safeTrim(ts.rejectionReason));
        setManagerNote(safeTrim(ts.managerNote));

        const byIds: TimeEntry[] = [];

        if (Array.isArray(ts.timeEntryIds) && ts.timeEntryIds.length > 0) {
          const snaps = await Promise.all(
            ts.timeEntryIds.map(async (eid) => {
              try {
                return await getDoc(doc(db, "timeEntries", eid));
              } catch {
                return null;
              }
            })
          );

          for (const s of snaps) {
            if (!s || !s.exists()) continue;
            const x: any = s.data();
            byIds.push({
              id: s.id,
              employeeId: x.employeeId ?? "",
              employeeName: x.employeeName ?? "",
              employeeRole: x.employeeRole ?? "",
              laborRoleType: x.laborRoleType ?? undefined,
              entryDate: x.entryDate ?? "",
              weekStartDate: x.weekStartDate ?? "",
              weekEndDate: x.weekEndDate ?? "",
              category: x.category ?? "manual_other",
              hours: typeof x.hours === "number" ? x.hours : 0,
              payType: x.payType ?? "regular",
              billable: x.billable ?? false,
              source: x.source ?? "manual_entry",
              serviceTicketId: x.serviceTicketId ?? undefined,
              projectId: x.projectId ?? undefined,
              projectStageKey: x.projectStageKey ?? undefined,
              linkedTechnicianId: x.linkedTechnicianId ?? undefined,
              linkedTechnicianName: x.linkedTechnicianName ?? undefined,
              notes: x.notes ?? undefined,
              timesheetId: x.timesheetId ?? undefined,
              entryStatus: x.entryStatus ?? "draft",
              createdAt: x.createdAt ?? undefined,
              updatedAt: x.updatedAt ?? undefined,
            });
          }
        }

        let items: TimeEntry[] = byIds;

        if (items.length === 0) {
          const qEntries = query(
            collection(db, "timeEntries"),
            where("employeeId", "==", ts.employeeId),
            where("entryDate", ">=", ts.weekStartDate),
            where("entryDate", "<=", ts.weekEndDate)
          );

          const eSnap = await getDocs(qEntries);

          items = eSnap.docs.map((docSnap) => {
            const x: any = docSnap.data();
            return {
              id: docSnap.id,
              employeeId: x.employeeId ?? "",
              employeeName: x.employeeName ?? "",
              employeeRole: x.employeeRole ?? "",
              laborRoleType: x.laborRoleType ?? undefined,
              entryDate: x.entryDate ?? "",
              weekStartDate: x.weekStartDate ?? "",
              weekEndDate: x.weekEndDate ?? "",
              category: x.category ?? "manual_other",
              hours: typeof x.hours === "number" ? x.hours : 0,
              payType: x.payType ?? "regular",
              billable: x.billable ?? false,
              source: x.source ?? "manual_entry",
              serviceTicketId: x.serviceTicketId ?? undefined,
              projectId: x.projectId ?? undefined,
              projectStageKey: x.projectStageKey ?? undefined,
              linkedTechnicianId: x.linkedTechnicianId ?? undefined,
              linkedTechnicianName: x.linkedTechnicianName ?? undefined,
              notes: x.notes ?? undefined,
              timesheetId: x.timesheetId ?? undefined,
              entryStatus: x.entryStatus ?? "draft",
              createdAt: x.createdAt ?? undefined,
              updatedAt: x.updatedAt ?? undefined,
            };
          });
        }

        items.sort(
          (a, b) =>
            a.entryDate.localeCompare(b.entryDate) ||
            (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
        );

        setEntries(items);

        const nextHours: Record<string, number> = {};
        const nextLocks: Record<string, boolean> = {};

        for (const it of items) {
          nextHours[it.id] = numOr0(it.hours);
          nextLocks[it.id] = Boolean((it as any)?.hoursLocked);
        }

        setEditedHoursByEntryId(nextHours);
        setLockByEntryId(nextLocks);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load timesheet."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  useEffect(() => {
    async function hydrate() {
      const needTicketIds = new Set<string>();
      const needProjectIds = new Set<string>();

      for (const e of entries) {
        const cat = safeTrim((e as any).category).toLowerCase();

        if (cat === "service" || cat === "service_ticket") {
          const tid = safeTrim((e as any).serviceTicketId);
          if (tid && !ticketMiniById[tid]) needTicketIds.add(tid);
        }

        if (cat === "project" || cat === "project_stage") {
          const pid = safeTrim((e as any).projectId);
          if (pid && !projectMiniById[pid]) needProjectIds.add(pid);
        }
      }

      if (needTicketIds.size === 0 && needProjectIds.size === 0) return;

      const ticketFetches = Array.from(needTicketIds).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "serviceTickets", id));
          if (!snap.exists()) return null;
          const d: any = snap.data();
          return {
            id,
            customerDisplayName: safeTrim(d.customerDisplayName) || "Customer",
            issueSummary: safeTrim(d.issueSummary) || "Service Ticket",
          } as ServiceTicketMini;
        } catch {
          return null;
        }
      });

      const projectFetches = Array.from(needProjectIds).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "projects", id));
          if (!snap.exists()) return null;
          const d: any = snap.data();
          return {
            id,
            projectName: safeTrim(d.projectName) || "Project",
          } as ProjectMini;
        } catch {
          return null;
        }
      });

      const [ticketResults, projectResults] = await Promise.all([
        Promise.all(ticketFetches),
        Promise.all(projectFetches),
      ]);

      const nextTickets: Record<string, ServiceTicketMini> = {};
      for (const t of ticketResults) if (t?.id) nextTickets[t.id] = t;

      const nextProjects: Record<string, ProjectMini> = {};
      for (const p of projectResults) if (p?.id) nextProjects[p.id] = p;

      if (Object.keys(nextTickets).length) {
        setTicketMiniById((prev) => ({ ...prev, ...nextTickets }));
      }
      if (Object.keys(nextProjects).length) {
        setProjectMiniById((prev) => ({ ...prev, ...nextProjects }));
      }
    }

    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  function formatEntryPrimary(e: TimeEntry) {
    const cat = safeTrim((e as any).category).toLowerCase();

    if (cat === "service" || cat === "service_ticket") {
      const tid = safeTrim((e as any).serviceTicketId);
      const mini = tid ? ticketMiniById[tid] : null;
      return mini?.customerDisplayName || "Service";
    }

    if (cat === "project" || cat === "project_stage") {
      const pid = safeTrim((e as any).projectId);
      const mini = pid ? projectMiniById[pid] : null;
      return mini?.projectName || "Project";
    }

    return safeTrim((e as any).category) || "Entry";
  }

  function formatEntrySecondary(e: TimeEntry) {
    const cat = safeTrim((e as any).category).toLowerCase();

    if (cat === "service" || cat === "service_ticket") {
      const tid = safeTrim((e as any).serviceTicketId);
      const mini = tid ? ticketMiniById[tid] : null;
      return mini?.issueSummary ? `Issue: ${mini.issueSummary}` : "";
    }

    if (cat === "project" || cat === "project_stage") {
      const stage = stageLabel((e as any).projectStageKey);
      return stage ? `Stage: ${stage}` : "";
    }

    return "";
  }

  const computed = useMemo(() => {
    let workedHours = 0;
    let ptoHours = 0;
    let holidayHours = 0;
    let billableHours = 0;
    let nonBillableHours = 0;

    for (const e of entries) {
      const hours = numOr0(editedHoursByEntryId[e.id] ?? e.hours);

      if (isWorkedHoursCategory(e.category)) workedHours += hours;

      const cat = safeTrim(e.category).toLowerCase();
      if (cat === "pto") ptoHours += hours;
      if (cat === "holiday") holidayHours += hours;

      if (e.billable) billableHours += hours;
      else nonBillableHours += hours;
    }

    const regularHours = Math.min(workedHours, 40);
    const overtimeHours = Math.max(workedHours - 40, 0);
    const totalHours = regularHours + overtimeHours + ptoHours + holidayHours;

    return {
      workedHours,
      regularHours,
      overtimeHours,
      ptoHours,
      holidayHours,
      billableHours,
      nonBillableHours,
      totalHours,
    };
  }, [entries, editedHoursByEntryId]);

  const status = (timesheet?.status ?? "draft") as WeeklyTimesheet["status"];
  const statusTone = getStatusTone(status);

  const canApproveReject = canReview && status === "submitted";
  const canAdminAdjust =
    canReview && (status === "submitted" || status === "rejected");

  async function handleSaveAdminAdjust() {
    if (!timesheet) return;
    if (!canAdminAdjust) {
      setError("Admin Adjust is only allowed for Submitted/Rejected timesheets.");
      return;
    }

    setSaving(true);
    setError("");
    setOk("");

    try {
      const now = nowIso();

      for (const e of entries) {
        const nextHours = numOr0(editedHoursByEntryId[e.id] ?? e.hours);
        const locked = Boolean(lockByEntryId[e.id]);

        if (!Number.isFinite(nextHours) || nextHours < 0) {
          throw new Error(`Invalid hours for entry ${e.id}.`);
        }

        await updateDoc(doc(db, "timeEntries", e.id), {
          hours: nextHours,
          hoursLocked: locked,
          updatedAt: now,
          updatedByUid: appUser?.uid || null,
          updatedByName: appUser?.displayName || null,
          adminAdjustedAt: now,
        } as any);
      }

      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        totalHours: computed.totalHours,
        regularHours: computed.regularHours,
        overtimeHours: computed.overtimeHours,
        ptoHours: computed.ptoHours,
        holidayHours: computed.holidayHours,
        billableHours: computed.billableHours,
        nonBillableHours: computed.nonBillableHours,
        managerNote: managerNote.trim() || null,
        updatedAt: now,
        updatedById: appUser?.uid || null,
      } as any);

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              totalHours: computed.totalHours,
              regularHours: computed.regularHours,
              overtimeHours: computed.overtimeHours,
              ptoHours: computed.ptoHours,
              holidayHours: computed.holidayHours,
              billableHours: computed.billableHours,
              nonBillableHours: computed.nonBillableHours,
              managerNote: managerNote.trim() || undefined,
              updatedAt: now,
            }
          : prev
      );

      setEntries((prev) =>
        prev.map((x) => ({
          ...x,
          hours: numOr0(editedHoursByEntryId[x.id] ?? x.hours),
          updatedAt: now,
        }))
      );

      setOk("Admin adjustments saved.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save adjustments."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!timesheet) return;
    if (!canApproveReject) {
      setError("Only submitted timesheets can be approved.");
      return;
    }

    setSaving(true);
    setError("");
    setOk("");

    try {
      const now = nowIso();

      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        status: "approved",
        approvedAt: now,
        approvedById: appUser?.uid || null,
        approvedByName: appUser?.displayName || null,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
        managerNote: managerNote.trim() || null,
        updatedAt: now,
      } as any);

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              status: "approved",
              approvedAt: now,
              approvedById: appUser?.uid || undefined,
              approvedByName: appUser?.displayName || undefined,
              rejectedAt: undefined,
              rejectedById: undefined,
              rejectionReason: undefined,
              managerNote: managerNote.trim() || undefined,
              updatedAt: now,
            }
          : prev
      );

      setOk("Approved.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to approve timesheet."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!timesheet) return;
    if (!canApproveReject) {
      setError("Only submitted timesheets can be rejected.");
      return;
    }

    const reason = safeTrim(rejectionReason);
    if (!reason) {
      setError("Rejection reason is required.");
      return;
    }

    setSaving(true);
    setError("");
    setOk("");

    try {
      const now = nowIso();

      await updateDoc(doc(db, "weeklyTimesheets", timesheet.id), {
        status: "rejected",
        rejectedAt: now,
        rejectedById: appUser?.uid || null,
        rejectionReason: reason,
        managerNote: managerNote.trim() || null,
        updatedAt: now,
      } as any);

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              status: "rejected",
              rejectedAt: now,
              rejectedById: appUser?.uid || undefined,
              rejectionReason: reason,
              managerNote: managerNote.trim() || undefined,
              updatedAt: now,
            }
          : prev
      );

      setOk(
        "Rejected. The employee will see the rejection reason on their Weekly Timesheet page."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to reject timesheet."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Timesheet Review Detail">
      <AppShell appUser={appUser}>
        <Container
          maxWidth="lg"
          disableGutters
          sx={{
            pb: { xs: 14, md: 3 },
          }}
        >
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
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Stack spacing={1.25}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.25}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <Chip
                      icon={statusTone.icon}
                      label={statusTone.label}
                      color={statusTone.color}
                      variant={statusTone.color === "default" ? "outlined" : "filled"}
                    />
                    <Chip label={`Timesheet ID: ${timesheetId || "—"}`} variant="outlined" />
                  </Stack>

                  <Typography variant="h4" fontWeight={800} letterSpacing={-0.4}>
                    Timesheet Review
                  </Typography>

                  <Typography variant="body1" color="text.secondary">
                    Review, adjust, approve, or reject a weekly timesheet with full
                    entry-level visibility.
                  </Typography>
                </Stack>

                <Button
                  component={Link}
                  href="/timesheet-review"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                  sx={{ borderRadius: 999 }}
                >
                  Back to Review Queue
                </Button>
              </Stack>
            </Box>

            {loading ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 5,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <CardContent sx={{ py: 6 }}>
                  <Stack spacing={2} alignItems="center">
                    <CircularProgress />
                    <Typography variant="body2" color="text.secondary">
                      Loading timesheet...
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}
            {ok ? <Alert severity="success">{ok}</Alert> : null}

            {!loading && timesheet ? (
              <>
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
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                      >
                        <Box>
                          <Typography variant="h5" fontWeight={800}>
                            {timesheet.employeeName || "Unnamed Employee"}
                          </Typography>
                          <Typography variant="body1" color="text.secondary">
                            {timesheet.employeeRole || "No role set"}
                          </Typography>
                        </Box>

                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          useFlexGap
                          flexWrap="wrap"
                        >
                          <Chip
                            icon={<PersonRoundedIcon />}
                            label={timesheet.employeeRole || "Role"}
                            variant="outlined"
                          />
                          <Chip
                            icon={<AccessTimeRoundedIcon />}
                            label={`${timesheet.weekStartDate} → ${timesheet.weekEndDate}`}
                            variant="outlined"
                          />
                        </Stack>
                      </Stack>

                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        useFlexGap
                        flexWrap="wrap"
                      >
                        <Chip
                          label={`Total: ${timesheet.totalHours.toFixed(2)} hr`}
                          variant="outlined"
                        />
                        <Chip
                          label={`Regular: ${timesheet.regularHours.toFixed(2)} hr`}
                          variant="outlined"
                        />
                        <Chip
                          label={`OT: ${timesheet.overtimeHours.toFixed(2)} hr`}
                          variant="outlined"
                        />
                        <Chip
                          label={`PTO: ${timesheet.ptoHours.toFixed(2)} hr`}
                          variant="outlined"
                        />
                        <Chip
                          label={`Holiday: ${timesheet.holidayHours.toFixed(2)} hr`}
                          variant="outlined"
                        />
                      </Stack>

                      <Stack spacing={0.75}>
                        <Typography variant="body2" color="text.secondary">
                          Status: <strong>{formatStatus(timesheet.status)}</strong>
                        </Typography>

                        {timesheet.submittedAt ? (
                          <Typography variant="body2" color="text.secondary">
                            Submitted: {timesheet.submittedAt}
                          </Typography>
                        ) : null}

                        {timesheet.approvedAt ? (
                          <Typography variant="body2" color="text.secondary">
                            Approved: {timesheet.approvedAt}
                          </Typography>
                        ) : null}

                        {timesheet.rejectedAt ? (
                          <Typography variant="body2" color="text.secondary">
                            Rejected: {timesheet.rejectedAt}
                          </Typography>
                        ) : null}
                      </Stack>

                      {timesheet.employeeNote ? (
                        <>
                          <Divider />
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: 4,
                              backgroundColor: alpha(
                                theme.palette.primary.main,
                                0.05
                              ),
                              border: `1px solid ${alpha(
                                theme.palette.primary.main,
                                0.12
                              )}`,
                            }}
                          >
                            <Stack spacing={1}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <NoteAltRoundedIcon
                                  sx={{ fontSize: 18, color: "text.secondary" }}
                                />
                                <Typography variant="subtitle1" fontWeight={700}>
                                  Employee Note
                                </Typography>
                              </Stack>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ whiteSpace: "pre-wrap" }}
                              >
                                {timesheet.employeeNote}
                              </Typography>
                            </Stack>
                          </Box>
                        </>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 5,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack spacing={2.5}>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <EditCalendarRoundedIcon color="primary" />
                          <Typography variant="h6" fontWeight={800}>
                            Admin Adjust
                          </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Edit entry hours, optionally lock them, and save corrected
                          totals. Allowed when status is <strong>Submitted</strong> or{" "}
                          <strong>Rejected</strong>.
                        </Typography>
                      </Box>

                      {!canReview ? (
                        <Alert severity="warning">
                          You do not have permission to review timesheets.
                        </Alert>
                      ) : null}

                      <TextField
                        label="Manager Note"
                        value={managerNote}
                        onChange={(e) => setManagerNote(e.target.value)}
                        multiline
                        minRows={3}
                        disabled={!canReview}
                        placeholder="Optional note for payroll review or follow-up."
                        fullWidth
                      />

                      <Stack spacing={1.5}>
                        {entries.length === 0 ? (
                          <Box
                            sx={{
                              p: 3,
                              borderRadius: 4,
                              border: `1px dashed ${theme.palette.divider}`,
                              textAlign: "center",
                              color: "text.secondary",
                            }}
                          >
                            <Typography variant="body2">
                              No time entries found for this employee/week.
                            </Typography>
                          </Box>
                        ) : (
                          entries.map((e) => {
                            const hours = numOr0(
                              editedHoursByEntryId[e.id] ?? e.hours ?? 0
                            );
                            const locked = Boolean(lockByEntryId[e.id]);
                            const primary = formatEntryPrimary(e);
                            const secondary = formatEntrySecondary(e);

                            return (
                              <Card
                                key={e.id}
                                elevation={0}
                                sx={{
                                  borderRadius: 4,
                                  border: `1px solid ${theme.palette.divider}`,
                                  backgroundColor: alpha(
                                    theme.palette.background.default,
                                    0.5
                                  ),
                                }}
                              >
                                <CardContent sx={{ p: 2 }}>
                                  <Stack spacing={1.5}>
                                    <Stack
                                      direction={{ xs: "column", md: "row" }}
                                      spacing={2}
                                      justifyContent="space-between"
                                      alignItems={{ xs: "flex-start", md: "flex-start" }}
                                    >
                                      <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography variant="subtitle1" fontWeight={700}>
                                          {e.entryDate} • {primary}
                                        </Typography>

                                        {secondary ? (
                                          <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{ mt: 0.5 }}
                                          >
                                            {secondary}
                                          </Typography>
                                        ) : null}

                                        <Stack
                                          direction={{ xs: "column", sm: "row" }}
                                          spacing={1}
                                          useFlexGap
                                          flexWrap="wrap"
                                          sx={{ mt: 1.25 }}
                                        >
                                          <Chip
                                            size="small"
                                            label={`Category: ${
                                              safeTrim(e.category) || "—"
                                            }`}
                                            variant="outlined"
                                          />
                                          <Chip
                                            size="small"
                                            label={`Billable: ${
                                              e.billable ? "Yes" : "No"
                                            }`}
                                            variant="outlined"
                                          />
                                          {e.linkedTechnicianName ? (
                                            <Chip
                                              size="small"
                                              label={`Linked Tech: ${e.linkedTechnicianName}`}
                                              variant="outlined"
                                            />
                                          ) : null}
                                        </Stack>
                                      </Box>

                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1.5}
                                        alignItems={{ xs: "stretch", sm: "center" }}
                                        sx={{ width: { xs: "100%", md: "auto" } }}
                                      >
                                        <TextField
                                          label="Hours"
                                          type="number"
                                          inputProps={{ step: 0.25, min: 0 }}
                                          value={hours}
                                          onChange={(evt) =>
                                            setEditedHoursByEntryId((prev) => ({
                                              ...prev,
                                              [e.id]: numOr0(evt.target.value),
                                            }))
                                          }
                                          disabled={!canAdminAdjust || saving}
                                          sx={{ minWidth: { xs: "100%", sm: 120 } }}
                                        />

                                        <FormControlLabel
                                          control={
                                            <Checkbox
                                              checked={locked}
                                              onChange={(evt) =>
                                                setLockByEntryId((prev) => ({
                                                  ...prev,
                                                  [e.id]: evt.target.checked,
                                                }))
                                              }
                                              disabled={!canAdminAdjust || saving}
                                            />
                                          }
                                          label={
                                            <Stack
                                              direction="row"
                                              spacing={0.75}
                                              alignItems="center"
                                            >
                                              <LockRoundedIcon sx={{ fontSize: 16 }} />
                                              <span>Lock</span>
                                            </Stack>
                                          }
                                          sx={{ ml: 0 }}
                                        />
                                      </Stack>
                                    </Stack>

                                    <Typography variant="caption" color="text.secondary">
                                      Entry ID: {e.id}
                                    </Typography>
                                  </Stack>
                                </CardContent>
                              </Card>
                            );
                          })
                        )}
                      </Stack>

                      <Divider />

                      <Stack
                        direction={{ xs: "column", lg: "row" }}
                        spacing={2}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", lg: "center" }}
                      >
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          useFlexGap
                          flexWrap="wrap"
                        >
                          <Chip
                            label={`Total ${computed.totalHours.toFixed(2)}`}
                            color="primary"
                            variant="outlined"
                          />
                          <Chip
                            label={`Regular ${computed.regularHours.toFixed(2)}`}
                            variant="outlined"
                          />
                          <Chip
                            label={`OT ${computed.overtimeHours.toFixed(2)}`}
                            variant="outlined"
                          />
                          <Chip
                            label={`PTO ${computed.ptoHours.toFixed(2)}`}
                            variant="outlined"
                          />
                          <Chip
                            label={`Holiday ${computed.holidayHours.toFixed(2)}`}
                            variant="outlined"
                          />
                          <Chip
                            label={`Billable ${computed.billableHours.toFixed(2)}`}
                            variant="outlined"
                          />
                          <Chip
                            label={`Non-Billable ${computed.nonBillableHours.toFixed(
                              2
                            )}`}
                            variant="outlined"
                          />
                        </Stack>

                        <Button
                          type="button"
                          onClick={handleSaveAdminAdjust}
                          disabled={!canAdminAdjust || saving}
                          variant="contained"
                          startIcon={<SaveRoundedIcon />}
                          sx={{
                            borderRadius: 999,
                            display: { xs: "none", md: "inline-flex" },
                          }}
                        >
                          {saving ? "Saving..." : "Save Admin Adjustments"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 5,
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack spacing={2.5}>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CheckCircleRoundedIcon color="primary" />
                          <Typography variant="h6" fontWeight={800}>
                            Approve / Reject
                          </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Approval actions are only enabled while the timesheet is in{" "}
                          <strong>Submitted</strong> status.
                        </Typography>
                      </Box>

                      <TextField
                        label="Rejection Reason"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        disabled={!canApproveReject || saving}
                        placeholder="Example: Please correct Tuesday hours; missing job note."
                        fullWidth
                      />

                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.25}
                        alignItems={{ xs: "stretch", sm: "center" }}
                        justifyContent="space-between"
                      >
                        <Stack
                          direction="row"
                          spacing={1.25}
                          flexWrap="wrap"
                          sx={{ display: { xs: "none", md: "flex" } }}
                        >
                          <Button
                            type="button"
                            onClick={handleApprove}
                            disabled={!canApproveReject || saving}
                            variant="contained"
                            color="success"
                            sx={{ borderRadius: 999 }}
                          >
                            {saving ? "Working..." : "Approve"}
                          </Button>

                          <Button
                            type="button"
                            onClick={handleReject}
                            disabled={!canApproveReject || saving}
                            variant="outlined"
                            color="error"
                            sx={{ borderRadius: 999 }}
                          >
                            {saving ? "Working..." : "Reject"}
                          </Button>
                        </Stack>

                        <Chip
                          label={`Current: ${formatStatus(status)}`}
                          color={statusTone.color}
                          variant={statusTone.color === "default" ? "outlined" : "filled"}
                        />
                      </Stack>

                      {status !== "submitted" ? (
                        <Alert severity="warning">
                          This timesheet is not in Submitted status, so approve/reject
                          is disabled.
                        </Alert>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </Stack>
        </Container>

        {!loading && timesheet ? (
          <Paper
            elevation={8}
            sx={{
              display: { xs: "block", md: "none" },
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: theme.zIndex.appBar,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderTop: `1px solid ${theme.palette.divider}`,
              backgroundColor: alpha(theme.palette.background.paper, 0.98),
              backdropFilter: "blur(14px)",
              px: 2,
              pt: 1.5,
              pb: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            }}
          >
            <Stack spacing={1.25}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={1}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={800} noWrap>
                    {timesheet.employeeName || "Timesheet Review"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatStatus(status)} • Total {computed.totalHours.toFixed(2)} hr
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={formatStatus(status)}
                  color={statusTone.color}
                  variant={statusTone.color === "default" ? "outlined" : "filled"}
                />
              </Stack>

              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  type="button"
                  onClick={handleSaveAdminAdjust}
                  disabled={!canAdminAdjust || saving}
                  variant="outlined"
                  startIcon={<SaveRoundedIcon />}
                  sx={{ borderRadius: 999 }}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>

                <Button
                  fullWidth
                  type="button"
                  onClick={handleApprove}
                  disabled={!canApproveReject || saving}
                  variant="contained"
                  color="success"
                  sx={{ borderRadius: 999 }}
                >
                  {saving ? "Working..." : "Approve"}
                </Button>

                <Button
                  fullWidth
                  type="button"
                  onClick={handleReject}
                  disabled={!canApproveReject || saving}
                  variant="outlined"
                  color="error"
                  sx={{ borderRadius: 999 }}
                >
                  {saving ? "Working..." : "Reject"}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}