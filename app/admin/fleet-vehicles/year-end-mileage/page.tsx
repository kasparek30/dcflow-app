// app/admin/fleet-vehicles/year-end-mileage/page.tsx
"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import {
  FleetVehicle,
  FleetVehicleStatus,
  FleetYearEndMileageEntry,
  getFleetMileageReminderTaxYear,
  getFleetVehicleDisplayName,
  getFleetYearEndMileageEntry,
  isFleetVehicleActive,
  needsYearEndMileage,
} from "../../../../src/types/fleet-vehicle";

type MileageInputState = Record<
  string,
  {
    endMileage: string;
    endMileageDate: string;
    notes: string;
  }
>;

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

function parseMileageInput(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatOdometer(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not set";
  return `${value.toLocaleString()} mi`;
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

function normalizeDateInput(value?: string): string {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function defaultYearEndDate(taxYear: number): string {
  return `${taxYear}-12-31`;
}

function normalizeFleetVehicle(
  id: string,
  raw: Record<string, unknown>,
): FleetVehicle {
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
      ? (raw.yearEndMileage as FleetYearEndMileageEntry[])
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

function buildUpdatedYearEndMileageEntries({
  vehicle,
  taxYear,
  endMileage,
  endMileageDate,
  notes,
  enteredByUid,
  enteredByName,
}: {
  vehicle: FleetVehicle;
  taxYear: number;
  endMileage: number;
  endMileageDate: string;
  notes?: string;
  enteredByUid?: string;
  enteredByName?: string;
}): FleetYearEndMileageEntry[] {
  const existingEntries = vehicle.yearEndMileage ?? [];
  const existingEntry = existingEntries.find(
    (entry) => entry.taxYear === taxYear,
  );

  const nextEntry: FleetYearEndMileageEntry = {
    ...existingEntry,
    taxYear,
    endMileage,
    endMileageDate,
    enteredAt: new Date().toISOString(),
    enteredByUid,
    enteredByName,
    notes: notes?.trim() || existingEntry?.notes,
  };

  const otherEntries = existingEntries.filter(
    (entry) => entry.taxYear !== taxYear,
  );

  return [...otherEntries, nextEntry].sort((a, b) => b.taxYear - a.taxYear);
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
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
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

function VehicleMileageCard({
  vehicle,
  taxYear,
  input,
  onChange,
  onUseCurrentOdometer,
}: {
  vehicle: FleetVehicle;
  taxYear: number;
  input: MileageInputState[string];
  onChange: (
    vehicleId: string,
    key: keyof MileageInputState[string],
    value: string,
  ) => void;
  onUseCurrentOdometer: (vehicle: FleetVehicle) => void;
}) {
  const theme = useTheme();
  const existingEntry = getFleetYearEndMileageEntry(vehicle, taxYear);
  const completed = Boolean(existingEntry?.endMileage);
  const parsedInput = parseMileageInput(input.endMileage);
  const hasInvalidMileage =
    Boolean(input.endMileage.trim()) && typeof parsedInput !== "number";

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${
          completed
            ? alpha(theme.palette.success.main, 0.24)
            : alpha("#FFFFFF", 0.08)
        }`,
        backgroundColor: completed
          ? alpha(theme.palette.success.main, 0.055)
          : "background.paper",
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2, md: 2.25 },
          "&:last-child": { pb: { xs: 2, md: 2.25 } },
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.25}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
          >
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="flex-start"
              sx={{ minWidth: 0 }}
            >
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  backgroundColor: alpha(theme.palette.primary.main, 0.12),
                  color: theme.palette.primary.light,
                }}
              >
                <LocalShippingRoundedIcon sx={{ fontSize: 22 }} />
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 16,
                    fontWeight: 850,
                    lineHeight: 1.2,
                    letterSpacing: "-0.02em",
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
            </Stack>

            {completed ? (
              <Chip
                size="small"
                icon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />}
                label={`${taxYear} mileage entered`}
                variant="outlined"
                sx={{
                  borderRadius: 1.5,
                  fontWeight: 800,
                  backgroundColor: alpha(theme.palette.success.main, 0.12),
                  color: theme.palette.success.light,
                  borderColor: alpha(theme.palette.success.main, 0.24),
                  "& .MuiChip-icon": { color: theme.palette.success.light },
                }}
              />
            ) : (
              <Chip
                size="small"
                icon={<WarningAmberRoundedIcon sx={{ fontSize: 16 }} />}
                label="Mileage needed"
                variant="outlined"
                sx={{
                  borderRadius: 1.5,
                  fontWeight: 800,
                  backgroundColor: alpha(theme.palette.warning.main, 0.14),
                  color: theme.palette.warning.light,
                  borderColor: alpha(theme.palette.warning.main, 0.28),
                  "& .MuiChip-icon": { color: theme.palette.warning.light },
                }}
              />
            )}
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(4, minmax(0, 1fr))",
              },
              gap: 1,
            }}
          >
            <MiniInfo
              icon={<BadgeRoundedIcon sx={{ fontSize: 17 }} />}
              label="Assigned Driver"
              value={vehicle.assignedEmployeeName || "Unassigned"}
            />

            <MiniInfo
              icon={<SpeedRoundedIcon sx={{ fontSize: 17 }} />}
              label="Current Odometer"
              value={formatOdometer(vehicle.currentOdometer)}
            />

            <MiniInfo
              icon={<EventRoundedIcon sx={{ fontSize: 17 }} />}
              label={`${taxYear} Mileage`}
              value={
                existingEntry?.endMileage
                  ? formatOdometer(existingEntry.endMileage)
                  : "Not entered"
              }
            />

            <MiniInfo
              icon={<EventRoundedIcon sx={{ fontSize: 17 }} />}
              label="Mileage Date"
              value={formatDate(existingEntry?.endMileageDate)}
            />
          </Box>

          <Divider />

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
                lg: "1fr 220px",
              },
              gap: 1.5,
            }}
          >
            <TextField
              label={`${taxYear} Year-End Mileage`}
              value={input.endMileage}
              onChange={(event) =>
                onChange(vehicle.id, "endMileage", event.target.value)
              }
              error={hasInvalidMileage}
              helperText={
                hasInvalidMileage
                  ? "Enter a valid mileage number."
                  : existingEntry?.endMileage
                    ? `Saved: ${formatOdometer(existingEntry.endMileage)}`
                    : "Enter the odometer reading from year end."
              }
              inputMode="numeric"
              fullWidth
            />

            <TextField
              label="Mileage Date"
              type="date"
              value={input.endMileageDate}
              onChange={(event) =>
                onChange(vehicle.id, "endMileageDate", event.target.value)
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              label="Notes"
              value={input.notes}
              onChange={(event) =>
                onChange(vehicle.id, "notes", event.target.value)
              }
              placeholder="Optional notes"
              fullWidth
              sx={{
                gridColumn: { xs: "auto", md: "span 2", lg: "span 1" },
              }}
            />

            <Button
              variant="outlined"
              disabled={typeof vehicle.currentOdometer !== "number"}
              onClick={() => onUseCurrentOdometer(vehicle)}
              sx={{
                minHeight: 54,
                borderRadius: 2,
                alignSelf: "flex-start",
              }}
            >
              Use current odometer
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function MiniInfo({
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
      <Stack direction="row" spacing={0.9} alignItems="flex-start">
        <Box sx={{ color: "text.secondary", flexShrink: 0, mt: 0.1 }}>
          {icon}
        </Box>

        <Box sx={{ minWidth: 0 }}>
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
              mt: 0.2,
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

function FleetYearEndMileagePageContent() {
  const theme = useTheme();
  const searchParams = useSearchParams();
  const { appUser } = useAuthContext();

  const requestedYear = Number(searchParams.get("year"));
  const taxYear =
    Number.isFinite(requestedYear) && requestedYear > 2000
      ? requestedYear
      : getFleetMileageReminderTaxYear();

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [inputs, setInputs] = useState<MileageInputState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const activeVehicles = useMemo(
    () => vehicles.filter((vehicle) => isFleetVehicleActive(vehicle)),
    [vehicles],
  );

  const summary = useMemo(() => {
    const completed = activeVehicles.filter(
      (vehicle) => !needsYearEndMileage(vehicle, taxYear),
    ).length;

    const needed = activeVehicles.length - completed;

    return {
      total: activeVehicles.length,
      completed,
      needed,
    };
  }, [activeVehicles, taxYear]);

  const loadVehicles = async () => {
    setLoading(true);
    setLoadError("");
    setActionError("");
    setActionSuccess("");

    try {
      const snapshot = await getDocs(
        query(collection(db, "fleetVehicles"), orderBy("unitNumber", "asc")),
      );

      const nextVehicles = snapshot.docs
        .map((vehicleDoc) =>
          normalizeFleetVehicle(vehicleDoc.id, vehicleDoc.data()),
        )
        .filter((vehicle) => isFleetVehicleActive(vehicle));

      const nextInputs: MileageInputState = {};

      nextVehicles.forEach((vehicle) => {
        const existingEntry = getFleetYearEndMileageEntry(vehicle, taxYear);

        nextInputs[vehicle.id] = {
          endMileage:
            typeof existingEntry?.endMileage === "number"
              ? String(existingEntry.endMileage)
              : "",
          endMileageDate:
            normalizeDateInput(existingEntry?.endMileageDate) ||
            defaultYearEndDate(taxYear),
          notes: existingEntry?.notes ?? "",
        };
      });

      setVehicles(nextVehicles);
      setInputs(nextInputs);
    } catch (error) {
      console.error(
        "Failed to load fleet vehicles for year-end mileage:",
        error,
      );
      setLoadError("Could not load fleet vehicles. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear]);

  const updateInput = (
    vehicleId: string,
    key: keyof MileageInputState[string],
    value: string,
  ) => {
    setInputs((current) => ({
      ...current,
      [vehicleId]: {
        ...(current[vehicleId] ?? {
          endMileage: "",
          endMileageDate: defaultYearEndDate(taxYear),
          notes: "",
        }),
        [key]: value,
      },
    }));
  };

  const handleUseCurrentOdometer = (vehicle: FleetVehicle) => {
    if (typeof vehicle.currentOdometer !== "number") return;

    updateInput(vehicle.id, "endMileage", String(vehicle.currentOdometer));
  };

  const handleSaveMileage = async () => {
    setActionError("");
    setActionSuccess("");

    const vehiclesToUpdate = activeVehicles.filter((vehicle) => {
      const input = inputs[vehicle.id];
      return Boolean(input?.endMileage.trim());
    });

    if (vehiclesToUpdate.length === 0) {
      setActionError("Enter mileage for at least one vehicle before saving.");
      return;
    }

    for (const vehicle of vehiclesToUpdate) {
      const input = inputs[vehicle.id];
      const parsedMileage = parseMileageInput(input.endMileage);

      if (typeof parsedMileage !== "number") {
        setActionError(
          `Enter a valid mileage number for ${getFleetVehicleDisplayName(vehicle)}.`,
        );
        return;
      }

      if (!input.endMileageDate) {
        setActionError(
          `Enter a mileage date for ${getFleetVehicleDisplayName(vehicle)}.`,
        );
        return;
      }
    }

    setSaving(true);

    try {
      const batch = writeBatch(db);

      vehiclesToUpdate.forEach((vehicle) => {
        const input = inputs[vehicle.id];
        const parsedMileage = parseMileageInput(input.endMileage);

        if (typeof parsedMileage !== "number") return;

        const nextYearEndMileage = buildUpdatedYearEndMileageEntries({
          vehicle,
          taxYear,
          endMileage: parsedMileage,
          endMileageDate: input.endMileageDate,
          notes: input.notes,
          enteredByUid: appUser?.uid,
          enteredByName: appUser?.displayName || appUser?.email || undefined,
        });

        const vehicleRef = doc(db, "fleetVehicles", vehicle.id);

        batch.update(vehicleRef, {
          yearEndMileage: nextYearEndMileage,
          currentOdometer: parsedMileage,
          odometerUpdatedAt: new Date().toISOString(),
          odometerUpdatedByUid: appUser?.uid,
          odometerUpdatedByName:
            appUser?.displayName || appUser?.email || undefined,
          updatedAt: serverTimestamp(),
          updatedByUid: appUser?.uid,
          updatedByName: appUser?.displayName || appUser?.email || undefined,
        });
      });

      await batch.commit();

      setActionSuccess(
        `Saved ${taxYear} year-end mileage for ${vehiclesToUpdate.length} vehicle${
          vehiclesToUpdate.length === 1 ? "" : "s"
        }.`,
      );

      await loadVehicles();
    } catch (error) {
      console.error("Failed to save year-end mileage:", error);
      setActionError("Could not save year-end mileage. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedPage
      fallbackTitle="Year-End Fleet Mileage"
      allowedRoles={["admin"]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1320, mx: "auto" }}>
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
                  href="/admin/fleet-vehicles"
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
                  Fleet Vehicles
                </Button>

                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1, mb: 1 }}
                >
                  <Chip
                    size="small"
                    icon={<EventRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Year-End Mileage"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 700,
                      backgroundColor: alpha(theme.palette.warning.main, 0.14),
                      border: `1px solid ${alpha(theme.palette.warning.main, 0.26)}`,
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
                  {taxYear} Year-End Fleet Mileage
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
                  Enter December 31 odometer readings for active and spare fleet
                  vehicles. The Fleet reminder will stay visible until every
                  active or spare vehicle has mileage entered for {taxYear}.
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
                  onClick={() => void loadVehicles()}
                  disabled={loading || saving}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Refresh
                </Button>

                <Button
                  variant="contained"
                  startIcon={<SaveRoundedIcon />}
                  onClick={() => void handleSaveMileage()}
                  disabled={loading || saving}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  {saving ? "Saving…" : "Save Mileage"}
                </Button>
              </Stack>
            </Stack>

            {loadError ? <Alert severity="error">{loadError}</Alert> : null}
            {actionError ? <Alert severity="error">{actionError}</Alert> : null}
            {actionSuccess ? (
              <Alert severity="success">{actionSuccess}</Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(3, minmax(0, 1fr))",
                },
                gap: 1.25,
              }}
            >
              <SummaryCard label="Active / Spare" value={summary.total} />
              <SummaryCard label="Completed" value={summary.completed} />
              <SummaryCard label="Still Needed" value={summary.needed} />
            </Box>

            {loading ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                  minHeight: 260,
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
            ) : activeVehicles.length === 0 ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 1,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                }}
              >
                <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Typography variant="h6" sx={{ fontWeight: 850 }}>
                    No active fleet vehicles
                  </Typography>

                  <Typography sx={{ mt: 0.75, color: "text.secondary" }}>
                    Add active or spare fleet vehicles before entering year-end
                    mileage.
                  </Typography>

                  <Button
                    component={Link}
                    href="/admin/fleet-vehicles"
                    variant="contained"
                    sx={{ mt: 2, borderRadius: 2 }}
                  >
                    Back to Fleet Vehicles
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Stack spacing={1.5}>
                {activeVehicles.map((vehicle) => (
                  <VehicleMileageCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    taxYear={taxYear}
                    input={
                      inputs[vehicle.id] ?? {
                        endMileage: "",
                        endMileageDate: defaultYearEndDate(taxYear),
                        notes: "",
                      }
                    }
                    onChange={updateInput}
                    onUseCurrentOdometer={handleUseCurrentOdometer}
                  />
                ))}

                <Divider />

                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  justifyContent="flex-end"
                >
                  <Button
                    component={Link}
                    href="/admin/fleet-vehicles"
                    variant="outlined"
                    disabled={saving}
                    sx={{ minHeight: 42, borderRadius: 2 }}
                  >
                    Back to Fleet
                  </Button>

                  <Button
                    variant="contained"
                    startIcon={<SaveRoundedIcon />}
                    onClick={() => void handleSaveMileage()}
                    disabled={saving}
                    sx={{ minHeight: 42, borderRadius: 2 }}
                  >
                    {saving ? "Saving…" : "Save Mileage"}
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}

export default function FleetYearEndMileagePage() {
  return (
    <Suspense fallback={null}>
      <FleetYearEndMileagePageContent />
    </Suspense>
  );
}
