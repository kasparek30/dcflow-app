// app/time-entries/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
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
import AccessTimeFilledRoundedIcon from "@mui/icons-material/AccessTimeFilledRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";
import type {
  TimeEntryCategory,
  TimeEntryStatus,
  TimeEntrySource,
} from "../../../src/types/time-entry";

type EmployeeOption = AppUser;

type ProjectStageKey = "" | "roughIn" | "topOutVent" | "trimFinish";

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPayrollWeekBounds(entryDate: string) {
  const date = new Date(`${entryDate}T12:00:00`);
  const day = date.getDay(); // Sun 0 ... Sat 6

  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    weekStartDate: toIsoDate(monday),
    weekEndDate: toIsoDate(friday),
  };
}

function defaultBillableForCategory(category: TimeEntryCategory) {
  return category === "service_ticket" || category === "project_stage";
}

function normalizeRole(role?: string | null) {
  return String(role || "").trim().toLowerCase();
}

function formatRoleLabel(role?: string | null) {
  const raw = normalizeRole(role);
  if (!raw) return "Employee";

  return raw
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function isSupportRole(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized === "helper" || normalized === "apprentice";
}

function SectionCard(props: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: 2,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          {props.icon}
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {props.title}
            </Typography>
            {props.subtitle ? (
              <Typography variant="body2" color="text.secondary">
                {props.subtitle}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </Box>

      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>{props.children}</CardContent>
    </Card>
  );
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 3,
        height: "100%",
        bgcolor: "background.paper",
      }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.75 }}>
        {value || "—"}
      </Typography>
    </Paper>
  );
}

function selectMenuProps() {
  return {
    MenuProps: {
      PaperProps: {
        sx: {
          borderRadius: 3,
        },
      },
    },
  };
}

export default function NewTimeEntryPage() {
  const router = useRouter();
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userOptions, setUserOptions] = useState<EmployeeOption[]>([]);
  const [loadError, setLoadError] = useState("");

  const canCreateForOthers =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const [employeeId, setEmployeeId] = useState(appUser?.uid || "");
  const [entryDate, setEntryDate] = useState(todayIso);
  const [category, setCategory] = useState<TimeEntryCategory>("office");
  const [hoursInput, setHoursInput] = useState("1");
  const [billable, setBillable] = useState(false);
  const [notes, setNotes] = useState("");
  const [serviceTicketId, setServiceTicketId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectStageKey, setProjectStageKey] = useState<ProjectStageKey>("");
  const [linkedTechnicianId, setLinkedTechnicianId] = useState("");
  const [linkedTechnicianName, setLinkedTechnicianName] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: EmployeeOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

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

        items.sort((a, b) =>
          String(a.displayName || "").localeCompare(String(b.displayName || ""))
        );

        setUserOptions(items);

        if (!employeeId && appUser?.uid) {
          setEmployeeId(appUser.uid);
        }
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, [appUser?.uid, employeeId]);

  const selectedEmployee = useMemo(() => {
    return userOptions.find((u) => u.uid === employeeId) ?? null;
  }, [userOptions, employeeId]);

  const payrollWeek = useMemo(() => {
    return entryDate ? getPayrollWeekBounds(entryDate) : null;
  }, [entryDate]);

  const parsedHours = useMemo(() => {
    const n = Number(hoursInput);
    return Number.isFinite(n) ? n : NaN;
  }, [hoursInput]);

  useEffect(() => {
    if (appUser?.uid && !canCreateForOthers) {
      setEmployeeId(appUser.uid);
    }
  }, [appUser?.uid, canCreateForOthers]);

  useEffect(() => {
    setBillable(defaultBillableForCategory(category));
  }, [category]);

  useEffect(() => {
    if (selectedEmployee && isSupportRole(selectedEmployee.role)) {
      setLinkedTechnicianId(selectedEmployee.preferredTechnicianId || "");
      setLinkedTechnicianName(selectedEmployee.preferredTechnicianName || "");
    } else {
      setLinkedTechnicianId("");
      setLinkedTechnicianName("");
    }
  }, [selectedEmployee]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedEmployee) {
      setError("Please select an employee.");
      return;
    }

    if (!entryDate) {
      setError("Entry date is required.");
      return;
    }

    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError("Hours must be greater than 0.");
      return;
    }

    if (category === "service_ticket" && !serviceTicketId.trim()) {
      setError("Service Ticket ID is required for service ticket entries.");
      return;
    }

    if (category === "project_stage") {
      if (!projectId.trim()) {
        setError("Project ID is required for project stage entries.");
        return;
      }
      if (!projectStageKey) {
        setError("Project stage is required for project stage entries.");
        return;
      }
    }

    setError("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

      const source: TimeEntrySource = "manual_entry";
      const entryStatus: TimeEntryStatus = "draft";

      await addDoc(collection(db, "timeEntries"), {
        employeeId: selectedEmployee.uid,
        employeeName: selectedEmployee.displayName,
        employeeRole: selectedEmployee.role,
        laborRoleType: selectedEmployee.laborRoleType ?? null,

        entryDate,
        weekStartDate,
        weekEndDate,

        category,
        hours: parsedHours,
        payType: "regular",
        billable,
        source,

        serviceTicketId: serviceTicketId.trim() || null,
        projectId: projectId.trim() || null,
        projectStageKey: projectStageKey || null,

        linkedTechnicianId: linkedTechnicianId.trim() || null,
        linkedTechnicianName: linkedTechnicianName.trim() || null,

        notes: notes.trim() || null,
        timesheetId: null,

        entryStatus,

        createdAt: nowIso,
        updatedAt: nowIso,
      });

      router.push("/time-entries");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create time entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Time Entry">
      <AppShell appUser={appUser}>
        <Box
          sx={{
            minHeight: "100%",
            bgcolor: "background.default",
            px: { xs: 1, sm: 2, md: 3 },
            py: { xs: 2, md: 3 },
          }}
        >
          <Stack spacing={2.5}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, sm: 3 },
                borderRadius: 4,
                border: (theme) => `1px solid ${theme.palette.divider}`,
                background:
                  theme.palette.mode === "light"
                    ? `linear-gradient(180deg, ${alpha(
                        theme.palette.primary.main,
                        0.06
                      )}, ${alpha(theme.palette.primary.main, 0.01)})`
                    : undefined,
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      icon={<AccessTimeFilledRoundedIcon />}
                      label="Manual Time Entry"
                      variant="outlined"
                      size="small"
                    />
                    {payrollWeek ? (
                      <Chip
                        label={`${payrollWeek.weekStartDate} → ${payrollWeek.weekEndDate}`}
                        variant="outlined"
                        size="small"
                      />
                    ) : null}
                  </Stack>

                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    New Time Entry
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Manual worked-hours entry only. PTO, holiday, and overtime remain system-controlled.
                  </Typography>
                </Stack>

                <Button
                  component={Link}
                  href="/time-entries"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                >
                  Back to Time Entries
                </Button>
              </Stack>
            </Paper>

            {loadingUsers ? <Alert severity="info">Loading users...</Alert> : null}
            {loadError ? <Alert severity="error">{loadError}</Alert> : null}

            {!loadingUsers && !loadError ? (
              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={2.5}>
                  <SectionCard
                    title="Entry Details"
                    subtitle="Who the time belongs to, when it happened, and how many hours to log."
                    icon={<PersonRoundedIcon color="primary" />}
                  >
                    <Stack spacing={2}>
                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                          },
                        }}
                      >
                        <FormControl fullWidth>
                          <InputLabel>Employee</InputLabel>
                          <Select
                            label="Employee"
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            disabled={!canCreateForOthers}
                            {...selectMenuProps()}
                          >
                            <MenuItem value="">Select employee</MenuItem>
                            {userOptions.map((user) => (
                              <MenuItem key={user.uid} value={user.uid}>
                                {user.displayName} ({formatRoleLabel(user.role)})
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <TextField
                          label="Entry Date"
                          type="date"
                          value={entryDate}
                          onChange={(e) => setEntryDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />

                        <TextField
                          label="Hours Worked"
                          type="number"
                          inputProps={{ min: 0.25, step: 0.25 }}
                          value={hoursInput}
                          onChange={(e) => setHoursInput(e.target.value)}
                          fullWidth
                        />

                        <FormControl fullWidth>
                          <InputLabel>Work Category</InputLabel>
                          <Select
                            label="Work Category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value as TimeEntryCategory)}
                            {...selectMenuProps()}
                          >
                            <MenuItem value="service_ticket">Service Ticket</MenuItem>
                            <MenuItem value="project_stage">Project Stage</MenuItem>
                            <MenuItem value="meeting">Meeting</MenuItem>
                            <MenuItem value="shop">Shop</MenuItem>
                            <MenuItem value="office">Office</MenuItem>
                            <MenuItem value="manual_other">Manual Other</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>

                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={billable}
                            onChange={(e) => setBillable(e.target.checked)}
                          />
                        }
                        label="Billable"
                      />

                      {!canCreateForOthers ? (
                        <Typography variant="caption" color="text.secondary">
                          Non-admin users can only create entries for themselves.
                        </Typography>
                      ) : null}

                      {selectedEmployee ? (
                        <Box
                          sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(3, minmax(0, 1fr))",
                            },
                          }}
                        >
                          <InfoField label="Employee" value={selectedEmployee.displayName || "—"} />
                          <InfoField
                            label="Role"
                            value={formatRoleLabel(selectedEmployee.role)}
                          />
                          <InfoField
                            label="Payroll Week"
                            value={
                              payrollWeek
                                ? `${payrollWeek.weekStartDate} → ${payrollWeek.weekEndDate}`
                                : "—"
                            }
                          />
                        </Box>
                      ) : null}
                    </Stack>
                  </SectionCard>

                  <SectionCard
                    title="Payroll Handling"
                    subtitle="Manual entries stay regular. PTO, holiday, and overtime are handled elsewhere."
                    icon={<InfoRoundedIcon color="primary" />}
                  >
                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                      Manual entries are always saved as <strong>regular worked hours</strong>.
                      PTO and holiday entries are system-generated later, and overtime is calculated in the weekly timesheet after 40+ regular worked hours.
                    </Alert>
                  </SectionCard>

                  {category === "service_ticket" ? (
                    <SectionCard
                      title="Service Ticket Link"
                      subtitle="Only required when the category is Service Ticket."
                      icon={<LinkRoundedIcon color="primary" />}
                    >
                      <TextField
                        label="Service Ticket ID"
                        value={serviceTicketId}
                        onChange={(e) => setServiceTicketId(e.target.value)}
                        placeholder="Paste service ticket document ID"
                        fullWidth
                      />
                    </SectionCard>
                  ) : null}

                  {category === "project_stage" ? (
                    <SectionCard
                      title="Project Link"
                      subtitle="Only required when the category is Project Stage."
                      icon={<WorkRoundedIcon color="primary" />}
                    >
                      <Box
                        sx={{
                          display: "grid",
                          gap: 2,
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                          },
                        }}
                      >
                        <TextField
                          label="Project ID"
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          placeholder="Paste project document ID"
                          fullWidth
                        />

                        <FormControl fullWidth>
                          <InputLabel>Project Stage</InputLabel>
                          <Select
                            label="Project Stage"
                            value={projectStageKey}
                            onChange={(e) =>
                              setProjectStageKey(e.target.value as ProjectStageKey)
                            }
                            {...selectMenuProps()}
                          >
                            <MenuItem value="">Select stage</MenuItem>
                            <MenuItem value="roughIn">Rough-In</MenuItem>
                            <MenuItem value="topOutVent">Top-Out / Vent</MenuItem>
                            <MenuItem value="trimFinish">Trim / Finish</MenuItem>
                          </Select>
                        </FormControl>
                      </Box>
                    </SectionCard>
                  ) : null}

                  {selectedEmployee && isSupportRole(selectedEmployee.role) ? (
                    <SectionCard
                      title="Support Labor Link"
                      subtitle="For helpers and apprentices, this links their time to a preferred technician."
                      icon={<LinkRoundedIcon color="primary" />}
                    >
                      <Stack spacing={2}>
                        <Typography variant="body2" color="text.secondary">
                          Auto-filled from this helper/apprentice’s preferred technician. You can override it here if needed.
                        </Typography>

                        <Box
                          sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(2, minmax(0, 1fr))",
                            },
                          }}
                        >
                          <TextField
                            label="Linked Technician ID"
                            value={linkedTechnicianId}
                            onChange={(e) => setLinkedTechnicianId(e.target.value)}
                            fullWidth
                          />

                          <TextField
                            label="Linked Technician Name"
                            value={linkedTechnicianName}
                            onChange={(e) => setLinkedTechnicianName(e.target.value)}
                            fullWidth
                          />
                        </Box>
                      </Stack>
                    </SectionCard>
                  ) : null}

                  <SectionCard
                    title="Notes"
                    subtitle="Optional context for payroll review and admin reference."
                    icon={<InfoRoundedIcon color="primary" />}
                  >
                    <TextField
                      label="Notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      multiline
                      minRows={5}
                      fullWidth
                    />
                  </SectionCard>

                  {error ? <Alert severity="error">{error}</Alert> : null}

                  <Paper
                    elevation={0}
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: 4,
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      justifyContent="space-between"
                    >
                      <Typography variant="body2" color="text.secondary">
                        Review the fields above, then save the draft time entry.
                      </Typography>

                      <Stack direction="row" spacing={1.25}>
                        <Button
                          component={Link}
                          href="/time-entries"
                          variant="outlined"
                        >
                          Cancel
                        </Button>

                        <Button
                          type="submit"
                          variant="contained"
                          disabled={saving}
                          startIcon={<SaveRoundedIcon />}
                        >
                          {saving ? "Saving..." : "Create Time Entry"}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                </Stack>
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}