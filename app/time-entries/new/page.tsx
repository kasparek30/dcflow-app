// app/time-entries/new/page.tsx
"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPayrollWeekBounds(entryDate: string) {
  const date = new Date(`${entryDate}T12:00:00`);
  const day = date.getDay();

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

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(safeTrim(value));
}

function NewTimeEntryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { appUser } = useAuthContext();

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userOptions, setUserOptions] = useState<EmployeeOption[]>([]);
  const [loadError, setLoadError] = useState("");

  const canCreateForOthers =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const todayIso = toIsoDate(new Date());
  const requestedDate = safeTrim(searchParams.get("date"));
  const requestedWeekStart = safeTrim(searchParams.get("weekStart"));

  const initialDate = isIsoDate(requestedDate) ? requestedDate : todayIso;

  const [employeeId, setEmployeeId] = useState(appUser?.uid || "");
  const [entryDate, setEntryDate] = useState(initialDate);
  const [category, setCategory] = useState<TimeEntryCategory>("office");
  const [hours, setHours] = useState(1);
  const [billable, setBillable] = useState(false);
  const [notes, setNotes] = useState("");
  const [serviceTicketId, setServiceTicketId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectStageKey, setProjectStageKey] = useState<
    "" | "roughIn" | "topOutVent" | "trimFinish"
  >("");
  const [linkedTechnicianId, setLinkedTechnicianId] = useState("");
  const [linkedTechnicianName, setLinkedTechnicianName] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isIsoDate(requestedDate)) {
      setEntryDate(requestedDate);
    }
  }, [requestedDate]);

  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: EmployeeOption[] = snap.docs.map((docSnap) => {
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

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
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

  useEffect(() => {
    setBillable(defaultBillableForCategory(category));
  }, [category]);

  useEffect(() => {
    if (
      selectedEmployee &&
      (selectedEmployee.role === "helper" || selectedEmployee.role === "apprentice")
    ) {
      setLinkedTechnicianId(selectedEmployee.preferredTechnicianId || "");
      setLinkedTechnicianName(selectedEmployee.preferredTechnicianName || "");
    } else {
      setLinkedTechnicianId("");
      setLinkedTechnicianName("");
    }
  }, [selectedEmployee]);

  const payrollWeek = useMemo(() => {
    if (!entryDate) return { weekStartDate: "", weekEndDate: "" };
    return getPayrollWeekBounds(entryDate);
  }, [entryDate]);

  const backHref = useMemo(() => {
    const params = new URLSearchParams();
    const weekStart = isIsoDate(requestedWeekStart)
      ? requestedWeekStart
      : payrollWeek.weekStartDate;

    if (weekStart) {
      params.set("weekStart", weekStart);
    }

    return `/time-entries${params.toString() ? `?${params.toString()}` : ""}`;
  }, [payrollWeek.weekStartDate, requestedWeekStart]);

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

    if (hours <= 0) {
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
        hours,
        payType: "regular",
        billable,
        source,

        serviceTicketId: serviceTicketId.trim() || null,
        projectId: projectId.trim() || null,
        projectStageKey: projectStageKey || null,

        linkedTechnicianId: linkedTechnicianId || null,
        linkedTechnicianName: linkedTechnicianName || null,

        notes: notes.trim() || null,
        timesheetId: null,

        entryStatus,

        createdAt: nowIso,
        updatedAt: nowIso,
      });

      router.push(`/time-entries?weekStart=${weekStartDate}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create time entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Time Entry">
      <AppShell appUser={appUser}>
        <Stack spacing={2.5}>
          <Box sx={{ px: { xs: 0.25, sm: 0.5 }, pt: { xs: 0.25, sm: 0.5 } }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
              spacing={1.5}
            >
              <Box>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    letterSpacing: -0.5,
                    fontSize: { xs: "1.9rem", sm: "2.2rem" },
                    lineHeight: 1.05,
                  }}
                >
                  New Time Entry
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  Manual worked-hours entry only. PTO, holiday, and overtime are system-controlled.
                </Typography>
              </Box>

              <Button
                component={Link}
                href={backHref}
                variant="outlined"
                startIcon={<ArrowBackRoundedIcon />}
              >
                Back to Time Entries
              </Button>
            </Stack>
          </Box>

          {loadingUsers ? (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Loading users...
            </Alert>
          ) : null}

          {loadError ? (
            <Alert severity="error" sx={{ borderRadius: 3 }}>
              {loadError}
            </Alert>
          ) : null}

          {!loadingUsers && !loadError ? (
            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2.25} sx={{ maxWidth: 960 }}>
                <Card variant="outlined" sx={{ borderRadius: 4 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Entry Details
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
                        <FormControl fullWidth>
                          <InputLabel>Employee</InputLabel>
                          <Select
                            label="Employee"
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            disabled={!canCreateForOthers}
                          >
                            <MenuItem value="">Select employee</MenuItem>
                            {userOptions.map((user) => (
                              <MenuItem key={user.uid} value={user.uid}>
                                {user.displayName} ({user.role})
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
                          value={hours}
                          onChange={(e) => setHours(Number(e.target.value))}
                          fullWidth
                        />

                        <FormControl fullWidth>
                          <InputLabel>Work Category</InputLabel>
                          <Select
                            label="Work Category"
                            value={category}
                            onChange={(e) =>
                              setCategory(e.target.value as TimeEntryCategory)
                            }
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

                      {!canCreateForOthers ? (
                        <Typography variant="body2" color="text.secondary">
                          Non-admin users can only create entries for themselves.
                        </Typography>
                      ) : null}

                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={billable}
                            onChange={(e) => setBillable(e.target.checked)}
                          />
                        }
                        label="Billable"
                      />
                    </Stack>
                  </CardContent>
                </Card>

                <Card variant="outlined" sx={{ borderRadius: 4 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <InfoOutlinedIcon color="primary" fontSize="small" />
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          Payroll Handling
                        </Typography>
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        Manual entries are always saved as <strong>regular worked hours</strong>.
                        PTO and holiday entries will be system-generated later, and overtime will
                        be calculated in the weekly timesheet after 40+ regular worked hours.
                      </Typography>

                      {entryDate ? (
                        <Typography variant="body2" color="text.secondary">
                          Payroll week: <strong>{payrollWeek.weekStartDate}</strong> through{" "}
                          <strong>{payrollWeek.weekEndDate}</strong>
                        </Typography>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>

                {category === "service_ticket" ? (
                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                      <Stack spacing={2}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          Linked Work
                        </Typography>

                        <TextField
                          label="Service Ticket ID"
                          value={serviceTicketId}
                          onChange={(e) => setServiceTicketId(e.target.value)}
                          placeholder="Paste ticket document ID"
                          fullWidth
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}

                {category === "project_stage" ? (
                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                      <Stack spacing={2}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          Linked Work
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
                                setProjectStageKey(
                                  e.target.value as "" | "roughIn" | "topOutVent" | "trimFinish"
                                )
                              }
                            >
                              <MenuItem value="">Select stage</MenuItem>
                              <MenuItem value="roughIn">Rough-In</MenuItem>
                              <MenuItem value="topOutVent">Top-Out / Vent</MenuItem>
                              <MenuItem value="trimFinish">Trim / Finish</MenuItem>
                            </Select>
                          </FormControl>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}

                {selectedEmployee?.role === "helper" ||
                selectedEmployee?.role === "apprentice" ? (
                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                      <Stack spacing={2}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          Support Labor Link
                        </Typography>

                        <Typography variant="body2" color="text.secondary">
                          Auto-filled from this helper/apprentice’s preferred technician. You can
                          override if needed.
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
                    </CardContent>
                  </Card>
                ) : null}

                <Card variant="outlined" sx={{ borderRadius: 4 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Notes
                      </Typography>

                      <TextField
                        label="Notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        multiline
                        minRows={5}
                        fullWidth
                      />
                    </Stack>
                  </CardContent>
                </Card>

                {error ? (
                  <Alert severity="error" sx={{ borderRadius: 3 }}>
                    {error}
                  </Alert>
                ) : null}

                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.25}
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={saving}
                    startIcon={<EditNoteRoundedIcon />}
                  >
                    {saving ? "Saving..." : "Create Time Entry"}
                  </Button>

                  <Button
                    component={Link}
                    href={backHref}
                    variant="outlined"
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </AppShell>
    </ProtectedPage>
  );
}

export default function NewTimeEntryPage() {
  return (
    <Suspense
      fallback={
        <ProtectedPage fallbackTitle="New Time Entry">
          <AppShell appUser={null}>
            <Stack spacing={2.5}>
              <Box sx={{ px: { xs: 0.25, sm: 0.5 }, pt: { xs: 0.25, sm: 0.5 } }}>
                <Stack spacing={1.25}>
                  <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    New Time Entry
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Loading form...
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </AppShell>
        </ProtectedPage>
      }
    >
      <NewTimeEntryPageContent />
    </Suspense>
  );
}