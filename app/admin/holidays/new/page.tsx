"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type { AppUserRole } from "../../../../src/types/app-user";

const ROLE_OPTIONS: AppUserRole[] = [
  "technician",
  "helper",
  "apprentice",
  "dispatcher",
  "manager",
  "billing",
  "admin",
  "office_display",
];

const ROLE_LABELS: Record<AppUserRole, string> = {
  technician: "Technician",
  helper: "Helper",
  apprentice: "Apprentice",
  dispatcher: "Dispatcher",
  manager: "Manager",
  billing: "Billing",
  admin: "Admin",
  office_display: "Office Display",
};

function formatHolidayDate(dateString: string) {
  if (!dateString) {
    return "Select a holiday date";
  }

  const parsedDate = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

function getDateBadge(dateString: string) {
  if (!dateString) {
    return {
      month: "NEW",
      day: "+",
    };
  }

  const parsedDate = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      month: "NEW",
      day: "+",
    };
  }

  return {
    month: new Intl.DateTimeFormat("en-US", {
      month: "short",
    })
      .format(parsedDate)
      .toUpperCase(),
    day: new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
    }).format(parsedDate),
  };
}

export default function NewHolidayPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [paid, setPaid] = useState(true);
  const [hoursPaid, setHoursPaid] = useState(8);
  const [isFullDay, setIsFullDay] = useState(true);
  const [scheduleBlocked, setScheduleBlocked] = useState(true);
  const [allowEmergencyOverride, setAllowEmergencyOverride] = useState(true);
  const [appliesToRoles, setAppliesToRoles] = useState<AppUserRole[]>([
    "technician",
    "helper",
    "apprentice",
  ]);
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dateBadge = useMemo(() => getDateBadge(holidayDate), [holidayDate]);

  const schedulingSummary = useMemo(() => {
    if (!scheduleBlocked) {
      return "Scheduling remains available on this date.";
    }

    if (allowEmergencyOverride) {
      return "Scheduling is blocked by default, but urgent work may still be scheduled using an emergency override.";
    }

    return "Scheduling is blocked on this date with no emergency override enabled.";
  }, [scheduleBlocked, allowEmergencyOverride]);

  function toggleRole(role: AppUserRole) {
    setAppliesToRoles((currentRoles) =>
      currentRoles.includes(role)
        ? currentRoles.filter((currentRole) => currentRole !== role)
        : [...currentRoles, role]
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Holiday name is required.");
      return;
    }

    if (!holidayDate) {
      setError("Holiday date is required.");
      return;
    }

    if (appliesToRoles.length === 0) {
      setError("Select at least one role.");
      return;
    }

    if (paid && hoursPaid < 0) {
      setError("Hours paid cannot be less than zero.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const docRef = await addDoc(collection(db, "companyHolidays"), {
        name: name.trim(),
        holidayDate,
        paid,
        hoursPaid,
        isFullDay,
        scheduleBlocked,
        allowEmergencyOverride,
        appliesToRoles,
        active,
        notes: notes.trim() || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      router.push(`/admin/holidays/${docRef.id}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create holiday."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Holiday">
      <AppShell appUser={appUser}>
        <Box
          sx={{
            width: "100%",
            maxWidth: 1120,
            mx: "auto",
            pb: 6,
          }}
        >
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              spacing={2}
            >
              <Box>
                <Typography
                  variant="h4"
                  component="h1"
                  sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}
                >
                  New Holiday
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Create a company holiday with pay and scheduling rules.
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/admin/holidays"
                variant="outlined"
                size="large"
                sx={{
                  borderRadius: 999,
                  alignSelf: { xs: "flex-start", sm: "center" },
                }}
              >
                Back to Holidays
              </Button>
            </Stack>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <Card variant="outlined" sx={{ borderRadius: 1 }}>
              <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2.5}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                >
                  <Box
                    sx={{
                      width: 72,
                      minWidth: 72,
                      height: 72,
                      borderRadius: 3,
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        lineHeight: 1,
                      }}
                    >
                      {dateBadge.month}
                    </Typography>

                    <Typography
                      variant="h4"
                      sx={{ fontWeight: 700, lineHeight: 1.2 }}
                    >
                      {dateBadge.day}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h5"
                      component="h2"
                      sx={{ fontWeight: 700 }}
                    >
                      {name.trim() || "New Company Holiday"}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.25 }}
                    >
                      {formatHolidayDate(holidayDate)}
                    </Typography>

                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      flexWrap="wrap"
                      sx={{ mt: 1.5 }}
                    >
                      <Chip
                        size="small"
                        label={active ? "Active" : "Inactive"}
                        color={active ? "success" : "default"}
                      />

                      <Chip
                        size="small"
                        label={paid ? `${hoursPaid} Hours Paid` : "Unpaid"}
                        color={paid ? "primary" : "default"}
                        variant="outlined"
                      />

                      <Chip
                        size="small"
                        label={
                          scheduleBlocked
                            ? "Scheduling Blocked"
                            : "Scheduling Open"
                        }
                        color={scheduleBlocked ? "warning" : "default"}
                        variant="outlined"
                      />

                      {scheduleBlocked && allowEmergencyOverride ? (
                        <Chip
                          size="small"
                          label="Emergency Override Allowed"
                          color="info"
                          variant="outlined"
                        />
                      ) : null}
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Box component="form" onSubmit={handleSubmit}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 3,
                }}
              >
                <Card
                  variant="outlined"
                  sx={{ borderRadius: 1, height: "100%" }}
                >
                  <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography
                          variant="h6"
                          component="h2"
                          sx={{ fontWeight: 700 }}
                        >
                          Holiday Details
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Set the holiday name, date, and active status.
                        </Typography>
                      </Box>

                      <Divider />

                      <TextField
                        fullWidth
                        required
                        label="Holiday Name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Example: Christmas Day"
                      />

                      <TextField
                        fullWidth
                        required
                        type="date"
                        label="Holiday Date"
                        value={holidayDate}
                        onChange={(event) =>
                          setHolidayDate(event.target.value)
                        }
                        InputLabelProps={{ shrink: true }}
                      />

                      <Box
                        sx={{
                          bgcolor: "action.hover",
                          borderRadius: 1,
                          p: 2,
                        }}
                      >
                        <FormControlLabel
                          control={
                            <Switch
                              checked={active}
                              onChange={(event) =>
                                setActive(event.target.checked)
                              }
                            />
                          }
                          label={
                            active
                              ? "Holiday Rule Active"
                              : "Holiday Rule Inactive"
                          }
                          sx={{ m: 0 }}
                        />

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.75 }}
                        >
                          {active
                            ? "This holiday rule will be available to scheduling and holiday-pay workflows."
                            : "This holiday will be saved, but marked inactive."}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  variant="outlined"
                  sx={{ borderRadius: 1, height: "100%" }}
                >
                  <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography
                          variant="h6"
                          component="h2"
                          sx={{ fontWeight: 700 }}
                        >
                          Pay Settings
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Define whether eligible employees receive paid
                          holiday hours.
                        </Typography>
                      </Box>

                      <Divider />

                      <Box
                        sx={{
                          bgcolor: "action.hover",
                          borderRadius: 1,
                          p: 2,
                        }}
                      >
                        <FormControlLabel
                          control={
                            <Switch
                              checked={paid}
                              onChange={(event) =>
                                setPaid(event.target.checked)
                              }
                            />
                          }
                          label={paid ? "Paid Holiday" : "Unpaid Holiday"}
                          sx={{ m: 0 }}
                        />

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.75 }}
                        >
                          {paid
                            ? "Eligible employees may receive the configured holiday hours."
                            : "No paid holiday hours will apply for this date."}
                        </Typography>
                      </Box>

                      <TextField
                        label="Hours Paid"
                        type="number"
                        value={hoursPaid}
                        disabled={!paid}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);

                          setHoursPaid(
                            Number.isFinite(nextValue) ? nextValue : 0
                          );
                        }}
                        inputProps={{
                          min: 0,
                          step: 0.25,
                        }}
                        helperText={
                          paid
                            ? "Common value is 8.0 hours."
                            : "Enable paid holiday to edit hours."
                        }
                        sx={{ maxWidth: 260 }}
                      />
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 1,
                    gridColumn: { xs: "auto", md: "1 / -1" },
                  }}
                >
                  <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography
                          variant="h6"
                          component="h2"
                          sx={{ fontWeight: 700 }}
                        >
                          Scheduling Rules
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Control how this holiday affects dispatch and trip
                          scheduling.
                        </Typography>
                      </Box>

                      <Divider />

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            md: "repeat(3, minmax(0, 1fr))",
                          },
                          gap: 2,
                        }}
                      >
                        <Box
                          sx={{
                            bgcolor: "action.hover",
                            borderRadius: 1,
                            p: 2,
                          }}
                        >
                          <FormControlLabel
                            control={
                              <Switch
                                checked={isFullDay}
                                onChange={(event) =>
                                  setIsFullDay(event.target.checked)
                                }
                              />
                            }
                            label="Full-Day Holiday"
                            sx={{ m: 0 }}
                          />

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.75 }}
                          >
                            Identifies whether the holiday applies to the
                            entire workday.
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            bgcolor: "action.hover",
                            borderRadius: 1,
                            p: 2,
                          }}
                        >
                          <FormControlLabel
                            control={
                              <Switch
                                checked={scheduleBlocked}
                                onChange={(event) =>
                                  setScheduleBlocked(event.target.checked)
                                }
                              />
                            }
                            label="Block Scheduling"
                            sx={{ m: 0 }}
                          />

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.75 }}
                          >
                            Prevent normal trip scheduling on this holiday.
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            bgcolor: "action.hover",
                            borderRadius: 1,
                            p: 2,
                          }}
                        >
                          <FormControlLabel
                            control={
                              <Switch
                                checked={allowEmergencyOverride}
                                disabled={!scheduleBlocked}
                                onChange={(event) =>
                                  setAllowEmergencyOverride(
                                    event.target.checked
                                  )
                                }
                              />
                            }
                            label="Emergency Override"
                            sx={{ m: 0 }}
                          />

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.75 }}
                          >
                            Allow urgent work to be scheduled when the date is
                            otherwise blocked.
                          </Typography>
                        </Box>
                      </Box>

                      <Alert severity={scheduleBlocked ? "warning" : "info"}>
                        {schedulingSummary}
                      </Alert>
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  variant="outlined"
                  sx={{ borderRadius: 1, height: "100%" }}
                >
                  <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography
                          variant="h6"
                          component="h2"
                          sx={{ fontWeight: 700 }}
                        >
                          Applies to Roles
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Select the employee roles affected by this holiday
                          rule.
                        </Typography>
                      </Box>

                      <Divider />

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                          },
                          gap: 0.5,
                        }}
                      >
                        {ROLE_OPTIONS.map((roleOption) => (
                          <FormControlLabel
                            key={roleOption}
                            control={
                              <Checkbox
                                checked={appliesToRoles.includes(roleOption)}
                                onChange={() => toggleRole(roleOption)}
                              />
                            }
                            label={ROLE_LABELS[roleOption]}
                            sx={{ m: 0 }}
                          />
                        ))}
                      </Box>

                      <Typography variant="body2" color="text.secondary">
                        Selected roles: {appliesToRoles.length}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  variant="outlined"
                  sx={{ borderRadius: 1, height: "100%" }}
                >
                  <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                    <Stack spacing={2.5}>
                      <Box>
                        <Typography
                          variant="h6"
                          component="h2"
                          sx={{ fontWeight: 700 }}
                        >
                          Internal Notes
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Add optional administrative information about this
                          holiday.
                        </Typography>
                      </Box>

                      <Divider />

                      <TextField
                        fullWidth
                        multiline
                        minRows={6}
                        label="Notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Optional notes for Admin or Dispatch..."
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Box>

              <Stack
                direction={{ xs: "column-reverse", sm: "row" }}
                justifyContent="flex-end"
                spacing={1.5}
                sx={{ mt: 3 }}
              >
                <Button
                  component={Link}
                  href="/admin/holidays"
                  variant="text"
                  size="large"
                  sx={{ borderRadius: 999 }}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={saving}
                  sx={{
                    borderRadius: 999,
                    minWidth: 165,
                  }}
                >
                  {saving ? "Creating..." : "Create Holiday"}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}