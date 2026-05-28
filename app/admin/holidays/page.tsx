"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { CompanyHoliday } from "../../../src/types/company-holiday";

function getYearFromDate(dateString: string) {
  if (!dateString || dateString.length < 4) {
    return "";
  }

  return dateString.slice(0, 4);
}

function formatHolidayDate(dateString: string) {
  if (!dateString) {
    return "No date selected";
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

function formatHours(hours: number) {
  const displayHours = Number.isInteger(hours) ? hours.toFixed(0) : String(hours);

  return `${displayHours} ${hours === 1 ? "hour" : "hours"}`;
}

function formatRoleLabel(role: string) {
  const roleLabels: Record<string, string> = {
    admin: "Admin",
    dispatcher: "Dispatcher",
    manager: "Manager",
    billing: "Billing",
    technician: "Technician",
    helper: "Helper",
    apprentice: "Apprentice",
    office_display: "Office Display",
  };

  return roleLabels[role] ?? role;
}

export default function AdminHolidaysPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [error, setError] = useState("");

  const currentYear = String(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYear);

  useEffect(() => {
    async function loadHolidays() {
      setLoading(true);
      setError("");

      try {
        const holidaysQuery = query(
          collection(db, "companyHolidays"),
          orderBy("holidayDate")
        );

        const snapshot = await getDocs(holidaysQuery);

        const items: CompanyHoliday[] = snapshot.docs.map((documentSnapshot) => {
          const data = documentSnapshot.data();

          return {
            id: documentSnapshot.id,
            name: data.name ?? "",
            holidayDate: data.holidayDate ?? "",
            paid: data.paid ?? true,
            hoursPaid:
              typeof data.hoursPaid === "number" ? data.hoursPaid : 8,
            isFullDay: data.isFullDay ?? true,
            scheduleBlocked: data.scheduleBlocked ?? true,
            allowEmergencyOverride: data.allowEmergencyOverride ?? true,
            appliesToRoles: Array.isArray(data.appliesToRoles)
              ? data.appliesToRoles
              : ["technician", "helper", "apprentice"],
            active: data.active ?? true,
            notes: data.notes ?? undefined,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setHolidays(items);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load holidays."
        );
      } finally {
        setLoading(false);
      }
    }

    loadHolidays();
  }, []);

  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(
        holidays
          .map((holiday) => getYearFromDate(holiday.holidayDate))
          .filter(Boolean)
      )
    ).sort((firstYear, secondYear) => firstYear.localeCompare(secondYear));

    if (!years.includes(currentYear)) {
      years.push(currentYear);
      years.sort((firstYear, secondYear) =>
        firstYear.localeCompare(secondYear)
      );
    }

    return years;
  }, [holidays, currentYear]);

  const filteredHolidays = useMemo(() => {
    if (selectedYear === "all") {
      return holidays;
    }

    return holidays.filter(
      (holiday) => getYearFromDate(holiday.holidayDate) === selectedYear
    );
  }, [holidays, selectedYear]);

  const summary = useMemo(() => {
    return {
      total: filteredHolidays.length,
      active: filteredHolidays.filter((holiday) => holiday.active).length,
      paid: filteredHolidays.filter((holiday) => holiday.paid).length,
      blocked: filteredHolidays.filter((holiday) => holiday.scheduleBlocked)
        .length,
    };
  }, [filteredHolidays]);

  return (
    <ProtectedPage fallbackTitle="Company Holidays" allowedRoles={["admin"]}>
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
                  Company Holidays
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Manage company closed days, holiday pay, and scheduling
                  override rules.
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", sm: "center" }}
              >
                <Button
                  component={Link}
                  href="/admin"
                  variant="outlined"
                  size="large"
                  sx={{ borderRadius: 999 }}
                >
                  Back to Admin
                </Button>

                <Button
                  component={Link}
                  href="/admin/holidays/new"
                  variant="contained"
                  size="large"
                  sx={{ borderRadius: 999 }}
                >
                  New Holiday
                </Button>
              </Stack>
            </Stack>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <Card variant="outlined" sx={{ borderRadius: 1 }}>
              <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                <Stack spacing={2.5}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "stretch", sm: "center" }}
                    spacing={2}
                  >
                    <Box>
                      <Typography
                        variant="h6"
                        component="h2"
                        sx={{ fontWeight: 700 }}
                      >
                        Holiday Calendar
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Review the holiday schedule for a specific year.
                      </Typography>
                    </Box>

                    <FormControl
                      size="small"
                      sx={{ minWidth: { xs: "100%", sm: 180 } }}
                    >
                      <InputLabel id="holiday-year-filter-label">
                        Calendar Year
                      </InputLabel>

                      <Select
                        labelId="holiday-year-filter-label"
                        label="Calendar Year"
                        value={selectedYear}
                        onChange={(event) =>
                          setSelectedYear(event.target.value)
                        }
                      >
                        <MenuItem value="all">All Years</MenuItem>

                        {availableYears.map((year) => (
                          <MenuItem key={year} value={year}>
                            {year}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>

                  <Divider />

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "repeat(2, minmax(0, 1fr))",
                        md: "repeat(4, minmax(0, 1fr))",
                      },
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        p: 2,
                      }}
                    >
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {summary.total}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        Holidays Shown
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        p: 2,
                      }}
                    >
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {summary.active}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        Active Rules
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        p: 2,
                      }}
                    >
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {summary.paid}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        Paid Holidays
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        p: 2,
                      }}
                    >
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {summary.blocked}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        Blocked Days
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    Showing {filteredHolidays.length} holiday
                    {filteredHolidays.length === 1 ? "" : "s"}
                    {selectedYear === "all"
                      ? " across all years."
                      : ` for ${selectedYear}.`}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            {loading ? (
              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ py: 7 }}>
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <CircularProgress size={26} />

                    <Typography color="text.secondary">
                      Loading company holidays...
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {!loading && !error && filteredHolidays.length === 0 ? (
              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ py: 7, textAlign: "center" }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    No holidays found
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.75 }}
                  >
                    {selectedYear === "all"
                      ? "Create a holiday to begin managing the company holiday calendar."
                      : `No holidays have been created for ${selectedYear}.`}
                  </Typography>

                  <Button
                    component={Link}
                    href="/admin/holidays/new"
                    variant="contained"
                    sx={{ mt: 2.5, borderRadius: 999 }}
                  >
                    New Holiday
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {!loading && !error && filteredHolidays.length > 0 ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 2,
                }}
              >
                {filteredHolidays.map((holiday) => (
                  <Link
                    key={holiday.id}
                    href={`/admin/holidays/${holiday.id}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                    }}
                  >
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 1,
                        height: "100%",
                        transition:
                          "border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease",
                        "&:hover": {
                          borderColor: "primary.main",
                          boxShadow: 3,
                          transform: "translateY(-1px)",
                        },
                      }}
                    >
                      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                        <Stack spacing={2}>
                          <Box>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="flex-start"
                              spacing={1.5}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="h6"
                                  component="h2"
                                  sx={{ fontWeight: 700 }}
                                >
                                  {holiday.name || "Unnamed Holiday"}
                                </Typography>

                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 0.5 }}
                                >
                                  {formatHolidayDate(holiday.holidayDate)}
                                </Typography>
                              </Box>

                              <Chip
                                label={holiday.active ? "Active" : "Inactive"}
                                size="small"
                                color={holiday.active ? "success" : "default"}
                              />
                            </Stack>
                          </Box>

                          <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                          >
                            <Chip
                              size="small"
                              label={
                                holiday.paid
                                  ? `Paid · ${formatHours(holiday.hoursPaid)}`
                                  : "Unpaid"
                              }
                              color={holiday.paid ? "primary" : "default"}
                              variant="outlined"
                            />

                            <Chip
                              size="small"
                              label={
                                holiday.isFullDay ? "Full Day" : "Partial Day"
                              }
                              variant="outlined"
                            />

                            <Chip
                              size="small"
                              label={
                                holiday.scheduleBlocked
                                  ? "Scheduling Blocked"
                                  : "Scheduling Open"
                              }
                              color={
                                holiday.scheduleBlocked ? "warning" : "default"
                              }
                              variant="outlined"
                            />

                            {holiday.scheduleBlocked &&
                            holiday.allowEmergencyOverride ? (
                              <Chip
                                size="small"
                                label="Emergency Override Allowed"
                                color="info"
                                variant="outlined"
                              />
                            ) : null}
                          </Stack>

                          <Divider />

                          <Typography variant="body2" color="text.secondary">
                            Applies to:{" "}
                            <Box
                              component="span"
                              sx={{ color: "text.primary", fontWeight: 500 }}
                            >
                              {holiday.appliesToRoles
                                .map((role) => formatRoleLabel(role))
                                .join(", ")}
                            </Box>
                          </Typography>

                          {holiday.notes ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 2,
                                overflow: "hidden",
                              }}
                            >
                              {holiday.notes}
                            </Typography>
                          ) : null}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}