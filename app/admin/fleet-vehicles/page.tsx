// app/admin/fleet-vehicles/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  Stack,
  Typography,
} from "@mui/material";
import { alpha, Theme, useTheme } from "@mui/material/styles";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import {
  FleetVehicle,
  FleetVehicleStatus,
  getFleetVehicleDisplayName,
  getFleetVehicleStatusLabel,
  getMostRecentMaintenanceLog,
  hasOpenMaintenanceIssue,
  needsYearEndMileage,
} from "../../../src/types/fleet-vehicle";

function normalizeDateValue(value: unknown): string | undefined {
  if (!value) return undefined;

  if (typeof value === "string") return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return undefined;
}

function normalizeNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function normalizeFleetVehicle(id: string, raw: Record<string, unknown>): FleetVehicle {
  return {
    id,

    unitNumber: String(raw.unitNumber ?? ""),
    name: String(raw.name ?? ""),

    year: normalizeNumberValue(raw.year),
    make: raw.make ? String(raw.make) : undefined,
    model: raw.model ? String(raw.model) : undefined,
    trim: raw.trim ? String(raw.trim) : undefined,

    vin: raw.vin ? String(raw.vin) : undefined,
    licensePlate: raw.licensePlate ? String(raw.licensePlate) : undefined,

    status: (raw.status as FleetVehicleStatus | undefined) ?? "active",

    assignedEmployeeUid: raw.assignedEmployeeUid
      ? String(raw.assignedEmployeeUid)
      : undefined,
    assignedEmployeeName: raw.assignedEmployeeName
      ? String(raw.assignedEmployeeName)
      : undefined,

    currentOdometer: normalizeNumberValue(raw.currentOdometer),
    odometerUpdatedAt: normalizeDateValue(raw.odometerUpdatedAt),
    odometerUpdatedByUid: raw.odometerUpdatedByUid
      ? String(raw.odometerUpdatedByUid)
      : undefined,
    odometerUpdatedByName: raw.odometerUpdatedByName
      ? String(raw.odometerUpdatedByName)
      : undefined,

    registrationExpiresAt: normalizeDateValue(raw.registrationExpiresAt),
    insuranceExpiresAt: normalizeDateValue(raw.insuranceExpiresAt),
    inspectionExpiresAt: normalizeDateValue(raw.inspectionExpiresAt),

    lastOilChangeDate: normalizeDateValue(raw.lastOilChangeDate),
    lastOilChangeMileage: normalizeNumberValue(raw.lastOilChangeMileage),
    nextOilChangeDate: normalizeDateValue(raw.nextOilChangeDate),
    nextOilChangeMileage: normalizeNumberValue(raw.nextOilChangeMileage),

    maintenanceLogs: Array.isArray(raw.maintenanceLogs)
      ? (raw.maintenanceLogs as FleetVehicle["maintenanceLogs"])
      : [],

    yearEndMileage: Array.isArray(raw.yearEndMileage)
      ? (raw.yearEndMileage as FleetVehicle["yearEndMileage"])
      : [],

    notes: raw.notes ? String(raw.notes) : undefined,

    createdAt: normalizeDateValue(raw.createdAt) ?? new Date().toISOString(),
    createdByUid: raw.createdByUid ? String(raw.createdByUid) : undefined,
    createdByName: raw.createdByName ? String(raw.createdByName) : undefined,

    updatedAt: normalizeDateValue(raw.updatedAt) ?? new Date().toISOString(),
    updatedByUid: raw.updatedByUid ? String(raw.updatedByUid) : undefined,
    updatedByName: raw.updatedByName ? String(raw.updatedByName) : undefined,
  };
}

function formatDate(value?: string): string {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatOdometer(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not set";

  return `${value.toLocaleString()} mi`;
}

function daysUntil(value?: string): number | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function getStatusChipSx(theme: Theme, status: FleetVehicleStatus) {
  if (status === "active") {
    return {
      backgroundColor: alpha(theme.palette.success.main, 0.14),
      color: theme.palette.success.light,
      borderColor: alpha(theme.palette.success.main, 0.26),
    };
  }

  if (status === "spare") {
    return {
      backgroundColor: alpha(theme.palette.info.main, 0.14),
      color: theme.palette.info.light,
      borderColor: alpha(theme.palette.info.main, 0.26),
    };
  }

  if (status === "out_of_service") {
    return {
      backgroundColor: alpha(theme.palette.warning.main, 0.14),
      color: theme.palette.warning.light,
      borderColor: alpha(theme.palette.warning.main, 0.3),
    };
  }

  return {
    backgroundColor: alpha(theme.palette.text.secondary, 0.1),
    color: theme.palette.text.secondary,
    borderColor: alpha(theme.palette.text.secondary, 0.18),
  };
}

function ExpirationChip({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  const theme = useTheme();
  const days = daysUntil(value);

  const isMissing = !value;
  const isExpired = typeof days === "number" && days < 0;
  const isSoon = typeof days === "number" && days >= 0 && days <= 30;

  let chipLabel = `${label}: ${formatDate(value)}`;
  let color = theme.palette.text.secondary;
  let backgroundColor = alpha(theme.palette.text.secondary, 0.08);
  let borderColor = alpha(theme.palette.text.secondary, 0.16);

  if (isMissing) {
    chipLabel = `${label}: Missing`;
  }

  if (isExpired) {
    chipLabel = `${label}: Expired`;
    color = theme.palette.error.light;
    backgroundColor = alpha(theme.palette.error.main, 0.14);
    borderColor = alpha(theme.palette.error.main, 0.28);
  } else if (isSoon) {
    chipLabel = `${label}: Due soon`;
    color = theme.palette.warning.light;
    backgroundColor = alpha(theme.palette.warning.main, 0.14);
    borderColor = alpha(theme.palette.warning.main, 0.28);
  }

  return (
    <Chip
      size="small"
      label={chipLabel}
      variant="outlined"
      sx={{
        height: 26,
        borderRadius: 1.5,
        fontWeight: 700,
        color,
        backgroundColor,
        borderColor,
      }}
    />
  );
}

function OilChangeChip({ vehicle }: { vehicle: FleetVehicle }) {
  const theme = useTheme();

  const current = vehicle.currentOdometer;
  const next = vehicle.nextOilChangeMileage;

  const milesRemaining =
    typeof current === "number" && typeof next === "number" ? next - current : null;

  const isDue = typeof milesRemaining === "number" && milesRemaining <= 0;
  const isSoon =
    typeof milesRemaining === "number" && milesRemaining > 0 && milesRemaining <= 500;

  let label = "Oil change: Not set";
  let color = theme.palette.text.secondary;
  let backgroundColor = alpha(theme.palette.text.secondary, 0.08);
  let borderColor = alpha(theme.palette.text.secondary, 0.16);

  if (typeof next === "number") {
    label = `Oil change due: ${formatOdometer(next)}`;
  }

  if (isDue) {
    label = "Oil change due now";
    color = theme.palette.error.light;
    backgroundColor = alpha(theme.palette.error.main, 0.14);
    borderColor = alpha(theme.palette.error.main, 0.28);
  } else if (isSoon) {
    label = `Oil change soon: ${milesRemaining?.toLocaleString()} mi`;
    color = theme.palette.warning.light;
    backgroundColor = alpha(theme.palette.warning.main, 0.14);
    borderColor = alpha(theme.palette.warning.main, 0.28);
  }

  return (
    <Chip
      size="small"
      label={label}
      variant="outlined"
      sx={{
        height: 26,
        borderRadius: 1.5,
        fontWeight: 700,
        color,
        backgroundColor,
        borderColor,
      }}
    />
  );
}

function FleetVehicleCard({ vehicle }: { vehicle: FleetVehicle }) {
  const theme = useTheme();
  const recentMaintenance = getMostRecentMaintenanceLog(vehicle);
  const hasMaintenanceIssue = hasOpenMaintenanceIssue(vehicle);
  const currentYear = new Date().getFullYear();
  const yearEndNeeded = needsYearEndMileage(vehicle, currentYear);

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        borderRadius: 1,
        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      <CardActionArea
        component={Link}
        href={`/admin/fleet-vehicles/${vehicle.id}`}
        sx={{
          height: "100%",
          borderRadius: 1,
          alignItems: "stretch",
        }}
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
          <Stack spacing={1.75} sx={{ height: "100%" }}>
            <Stack direction="row" spacing={1.25} alignItems="flex-start">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  backgroundColor: alpha(theme.palette.primary.main, 0.12),
                  color: theme.palette.primary.light,
                }}
              >
                <LocalShippingRoundedIcon sx={{ fontSize: 23 }} />
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="flex-start"
                  justifyContent="space-between"
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 800,
                        lineHeight: 1.2,
                        letterSpacing: "-0.015em",
                      }}
                    >
                      {getFleetVehicleDisplayName(vehicle)}
                    </Typography>

                    <Typography
                      sx={{
                        mt: 0.35,
                        color: "text.secondary",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {[vehicle.year, vehicle.make, vehicle.model]
                        .filter(Boolean)
                        .join(" ") || "Vehicle details not set"}
                    </Typography>
                  </Box>

                  <ArrowForwardRoundedIcon
                    sx={{
                      fontSize: 18,
                      color: "text.secondary",
                      flexShrink: 0,
                      mt: 0.2,
                    }}
                  />
                </Stack>
              </Box>
            </Stack>

            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                label={getFleetVehicleStatusLabel(vehicle.status)}
                variant="outlined"
                sx={{
                  height: 26,
                  borderRadius: 1.5,
                  fontWeight: 800,
                  ...getStatusChipSx(theme, vehicle.status),
                }}
              />

              {hasMaintenanceIssue ? (
                <Chip
                  size="small"
                  icon={<WarningAmberRoundedIcon sx={{ fontSize: 16 }} />}
                  label="Open issue"
                  variant="outlined"
                  sx={{
                    height: 26,
                    borderRadius: 1.5,
                    fontWeight: 800,
                    backgroundColor: alpha(theme.palette.error.main, 0.14),
                    color: theme.palette.error.light,
                    borderColor: alpha(theme.palette.error.main, 0.28),
                    "& .MuiChip-icon": {
                      color: theme.palette.error.light,
                    },
                  }}
                />
              ) : null}

              {yearEndNeeded ? (
                <Chip
                  size="small"
                  icon={<EventRoundedIcon sx={{ fontSize: 16 }} />}
                  label={`${currentYear} mileage needed`}
                  variant="outlined"
                  sx={{
                    height: 26,
                    borderRadius: 1.5,
                    fontWeight: 800,
                    backgroundColor: alpha(theme.palette.warning.main, 0.14),
                    color: theme.palette.warning.light,
                    borderColor: alpha(theme.palette.warning.main, 0.28),
                    "& .MuiChip-icon": {
                      color: theme.palette.warning.light,
                    },
                  }}
                />
              ) : null}
            </Stack>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                gap: 1,
              }}
            >
              <InfoTile
                icon={<BadgeRoundedIcon sx={{ fontSize: 18 }} />}
                label="Assigned driver"
                value={vehicle.assignedEmployeeName || "Unassigned"}
              />

              <InfoTile
                icon={<SpeedRoundedIcon sx={{ fontSize: 18 }} />}
                label="Odometer"
                value={formatOdometer(vehicle.currentOdometer)}
              />
            </Box>

<Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
  <ExpirationChip label="Registration" value={vehicle.registrationExpiresAt} />
  <OilChangeChip vehicle={vehicle} />
</Stack>

            <Divider />

            <Stack direction="row" spacing={1} alignItems="flex-start">
              <BuildRoundedIcon
                sx={{
                  color: "text.secondary",
                  fontSize: 18,
                  mt: 0.1,
                  flexShrink: 0,
                }}
              />

              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Latest maintenance
                </Typography>

                <Typography
                  sx={{
                    mt: 0.2,
                    fontSize: 13,
                    fontWeight: 650,
                    color: recentMaintenance ? "text.primary" : "text.secondary",
                  }}
                >
                  {recentMaintenance
                    ? `${formatDate(recentMaintenance.date)} — ${
                        recentMaintenance.vendor || "Maintenance logged"
                      }`
                    : "No maintenance logged yet"}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minWidth: 0,
        borderRadius: 2,
        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        backgroundColor: alpha(theme.palette.background.default, 0.45),
        p: 1.25,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box
          sx={{
            color: "text.secondary",
            flexShrink: 0,
            mt: 0.1,
          }}
        >
          {icon}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 800,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {label}
          </Typography>

          <Typography
            sx={{
              mt: 0.15,
              fontSize: 13,
              fontWeight: 750,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

export default function FleetVehiclesPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const currentYear = new Date().getFullYear();

  const loadFleetVehicles = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const snapshot = await getDocs(
        query(collection(db, "fleetVehicles"), orderBy("unitNumber", "asc"))
      );

      const nextVehicles = snapshot.docs.map((doc) =>
        normalizeFleetVehicle(doc.id, doc.data())
      );

      setVehicles(nextVehicles);
    } catch (error) {
      console.error("Failed to load fleet vehicles:", error);
      setLoadError("Could not load fleet vehicles. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFleetVehicles();
  }, []);

  const summary = useMemo(() => {
    const active = vehicles.filter((vehicle) => vehicle.status === "active").length;
    const spare = vehicles.filter((vehicle) => vehicle.status === "spare").length;
    const outOfService = vehicles.filter(
      (vehicle) => vehicle.status === "out_of_service"
    ).length;
    const yearEndNeeded = vehicles.filter((vehicle) =>
      needsYearEndMileage(vehicle, currentYear)
    ).length;
    const openMaintenance = vehicles.filter((vehicle) =>
      hasOpenMaintenanceIssue(vehicle)
    ).length;

    return {
      active,
      spare,
      outOfService,
      yearEndNeeded,
      openMaintenance,
      total: vehicles.length,
    };
  }, [vehicles, currentYear]);

  return (
    <ProtectedPage fallbackTitle="Fleet Vehicles" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", lg: "flex-start" }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Button
                  component={Link}
                  href="/admin"
                  startIcon={<ArrowBackRoundedIcon />}
                  sx={{
                    px: 0,
                    minWidth: 0,
                    color: "text.secondary",
                    fontWeight: 700,
                    "&:hover": {
                      backgroundColor: "transparent",
                      color: "primary.light",
                    },
                  }}
                >
                  Admin
                </Button>

                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1, mb: 1 }}
                >
                  <Chip
                    size="small"
                    icon={<LocalShippingRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Fleet"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 700,
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
                    fontWeight: 850,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Fleet Vehicles
                </Typography>

                <Typography
                  sx={{
                    mt: 0.9,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 860,
                  }}
                >
                  Manage company trucks, assigned drivers, odometer readings,
                  registration, insurance, inspection dates, year-end mileage, and
                  maintenance logs.
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "stretch", sm: "center" }}
                sx={{ width: { xs: "100%", lg: "auto" } }}
              >
                <Button
                  variant="outlined"
                  startIcon={<RefreshRoundedIcon />}
                  onClick={() => void loadFleetVehicles()}
                  disabled={loading}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Refresh
                </Button>

                <Button
                  component={Link}
                  href="/admin/fleet-vehicles/new"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Add Vehicle
                </Button>
              </Stack>
            </Stack>

            {loadError ? <Alert severity="error">{loadError}</Alert> : null}

            {summary.yearEndNeeded > 0 ? (
              <Alert
                severity="warning"
                icon={<EventRoundedIcon />}
                action={
                  <Button
                    component={Link}
                    href={`/admin/fleet-vehicles/year-end-mileage?year=${currentYear}`}
                    color="inherit"
                    size="small"
                    sx={{ fontWeight: 800 }}
                  >
                    Enter mileage
                  </Button>
                }
                sx={{
                  borderRadius: 2,
                  border: `1px solid ${alpha(theme.palette.warning.main, 0.24)}`,
                }}
              >
                {summary.yearEndNeeded} active fleet{" "}
                {summary.yearEndNeeded === 1 ? "vehicle needs" : "vehicles need"}{" "}
                year-end mileage for {currentYear}.
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(5, minmax(0, 1fr))",
                },
                gap: 1.25,
              }}
            >
              <SummaryCard label="Total" value={summary.total} />
              <SummaryCard label="Active" value={summary.active} />
              <SummaryCard label="Spare" value={summary.spare} />
              <SummaryCard label="Out of Service" value={summary.outOfService} />
              <SummaryCard label="Open Issues" value={summary.openMaintenance} />
            </Box>

            {loading ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                  minHeight: 220,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Stack spacing={1.5} alignItems="center">
                  <CircularProgress size={28} />
                  <Typography sx={{ color: "text.secondary", fontWeight: 650 }}>
                    Loading fleet vehicles…
                  </Typography>
                </Stack>
              </Card>
            ) : vehicles.length === 0 ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                }}
              >
                <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Stack spacing={2} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        display: "grid",
                        placeItems: "center",
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
                        color: theme.palette.primary.light,
                      }}
                    >
                      <LocalShippingRoundedIcon />
                    </Box>

                    <Box>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 850, letterSpacing: "-0.02em" }}
                      >
                        No fleet vehicles yet
                      </Typography>

                      <Typography
                        sx={{
                          mt: 0.6,
                          color: "text.secondary",
                          fontSize: 14,
                          fontWeight: 500,
                          maxWidth: 680,
                        }}
                      >
                        Add your first truck or company vehicle to start tracking
                        assigned drivers, mileage, expiration dates, and maintenance
                        history.
                      </Typography>
                    </Box>

                    <Button
                      component={Link}
                      href="/admin/fleet-vehicles/new"
                      variant="contained"
                      startIcon={<AddRoundedIcon />}
                      sx={{ borderRadius: 2 }}
                    >
                      Add Vehicle
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    lg: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 1.5,
                }}
              >
                {vehicles.map((vehicle) => (
                  <FleetVehicleCard key={vehicle.id} vehicle={vehicle} />
                ))}
              </Box>
            )}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      <CardContent
        sx={{
          p: 1.75,
          "&:last-child": { pb: 1.75 },
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 850,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.055em",
          }}
        >
          {label}
        </Typography>

        <Typography
          sx={{
            mt: 0.35,
            fontSize: 26,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: "-0.04em",
          }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}