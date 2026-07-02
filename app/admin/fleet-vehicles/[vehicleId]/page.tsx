// app/admin/fleet-vehicles/[vehicleId]/page.tsx
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, Theme, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import {
  FLEET_MAINTENANCE_TYPES,
  FleetMaintenanceLogEntry,
  FleetMaintenanceType,
  FleetVehicle,
  FleetVehicleStatus,
  getFleetMaintenanceTypeLabel,
  getFleetVehicleDisplayName,
  getFleetVehicleStatusLabel,
  hasOpenMaintenanceIssue,
  needsYearEndMileage,
} from "../../../../src/types/fleet-vehicle";

type MaintenanceFormState = {
  type: FleetMaintenanceType;
  date: string;
  odometer: string;
  vendor: string;
  cost: string;
  notes: string;
  nextDueDate: string;
  nextDueMileage: string;
  isOpenIssue: boolean;
};

const initialMaintenanceForm: MaintenanceFormState = {
  type: "oil_change",
  date: new Date().toISOString().slice(0, 10),
  odometer: "",
  vendor: "",
  cost: "",
  notes: "",
  nextDueDate: "",
  nextDueMileage: "",
  isOpenIssue: false,
};

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

function parseOptionalNumber(value: string): number | undefined {
  const cleaned = value.trim().replace(/,/g, "");
  if (!cleaned) return undefined;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function emptyToUndefined(value: string): string | undefined {
  const cleaned = value.trim();
  return cleaned ? cleaned : undefined;
}

function normalizeMaintenanceLogEntry(
  raw: Partial<FleetMaintenanceLogEntry>
): FleetMaintenanceLogEntry {
  return {
    id: raw.id || crypto.randomUUID(),
    type: raw.type || "other",
    date: normalizeDateValue(raw.date) ?? new Date().toISOString().slice(0, 10),

    odometer: normalizeNumberValue(raw.odometer),
    vendor: raw.vendor ? String(raw.vendor) : undefined,
    cost: normalizeNumberValue(raw.cost),
    notes: raw.notes ? String(raw.notes) : undefined,

    nextDueDate: normalizeDateValue(raw.nextDueDate),
    nextDueMileage: normalizeNumberValue(raw.nextDueMileage),

    isOpenIssue: Boolean(raw.isOpenIssue),
    resolvedAt: normalizeDateValue(raw.resolvedAt),
    resolvedNotes: raw.resolvedNotes ? String(raw.resolvedNotes) : undefined,

    createdAt: normalizeDateValue(raw.createdAt) ?? new Date().toISOString(),
    createdByUid: raw.createdByUid ? String(raw.createdByUid) : undefined,
    createdByName: raw.createdByName ? String(raw.createdByName) : undefined,

    updatedAt: normalizeDateValue(raw.updatedAt),
    updatedByUid: raw.updatedByUid ? String(raw.updatedByUid) : undefined,
    updatedByName: raw.updatedByName ? String(raw.updatedByName) : undefined,
  };
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
      ? raw.maintenanceLogs.map((entry) =>
          normalizeMaintenanceLogEntry(entry as Partial<FleetMaintenanceLogEntry>)
        )
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

function formatMoney(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not set";

  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
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
              fontSize: 14,
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

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const theme = useTheme();

  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          backgroundColor: alpha(theme.palette.primary.main, 0.12),
          color: theme.palette.primary.light,
        }}
      >
        {icon}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h6"
          sx={{
            fontSize: "1rem",
            fontWeight: 850,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {title}
        </Typography>

        {subtitle ? (
          <Typography
            sx={{
              mt: 0.25,
              color: "text.secondary",
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.45,
            }}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

function ExpirationInfo({
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

  let helper = "No warning";
  let color = theme.palette.text.secondary;

  if (isMissing) {
    helper = "Missing";
  } else if (isExpired) {
    helper = "Expired";
    color = theme.palette.error.light;
  } else if (isSoon) {
    helper = `Due in ${days} day${days === 1 ? "" : "s"}`;
    color = theme.palette.warning.light;
  }

  return (
    <InfoTile
      icon={<EventRoundedIcon sx={{ fontSize: 18, color }} />}
      label={label}
      value={`${formatDate(value)} • ${helper}`}
    />
  );
}

function MaintenanceLogCard({
  entry,
  onResolve,
  resolving,
}: {
  entry: FleetMaintenanceLogEntry;
  onResolve: (entryId: string) => void;
  resolving: boolean;
}) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${
          entry.isOpenIssue
            ? alpha(theme.palette.error.main, 0.25)
            : alpha("#FFFFFF", 0.08)
        }`,
        backgroundColor: entry.isOpenIssue
          ? alpha(theme.palette.error.main, 0.06)
          : alpha(theme.palette.background.default, 0.28),
      }}
    >
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Stack spacing={1.25}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 850,
                    letterSpacing: "-0.015em",
                  }}
                >
                  {getFleetMaintenanceTypeLabel(entry.type)}
                </Typography>

                {entry.isOpenIssue ? (
                  <Chip
                    size="small"
                    icon={<WarningAmberRoundedIcon sx={{ fontSize: 15 }} />}
                    label="Open issue"
                    variant="outlined"
                    sx={{
                      height: 24,
                      borderRadius: 1.5,
                      fontWeight: 800,
                      backgroundColor: alpha(theme.palette.error.main, 0.14),
                      color: theme.palette.error.light,
                      borderColor: alpha(theme.palette.error.main, 0.28),
                      "& .MuiChip-icon": { color: theme.palette.error.light },
                    }}
                  />
                ) : (
                  <Chip
                    size="small"
                    icon={<CheckCircleRoundedIcon sx={{ fontSize: 15 }} />}
                    label="Logged"
                    variant="outlined"
                    sx={{
                      height: 24,
                      borderRadius: 1.5,
                      fontWeight: 800,
                      backgroundColor: alpha(theme.palette.success.main, 0.12),
                      color: theme.palette.success.light,
                      borderColor: alpha(theme.palette.success.main, 0.24),
                      "& .MuiChip-icon": { color: theme.palette.success.light },
                    }}
                  />
                )}
              </Stack>

              <Typography
                sx={{
                  mt: 0.25,
                  color: "text.secondary",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {formatDate(entry.date)}
                {entry.vendor ? ` • ${entry.vendor}` : ""}
              </Typography>
            </Box>

            {entry.isOpenIssue ? (
              <Button
                size="small"
                variant="outlined"
                disabled={resolving}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onResolve(entry.id);
                }}
                sx={{ borderRadius: 2, fontWeight: 800 }}
              >
                Resolve
              </Button>
            ) : null}
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(3, minmax(0, 1fr))",
              },
              gap: 1,
            }}
          >
            <MiniMetric label="Odometer" value={formatOdometer(entry.odometer)} />
            <MiniMetric label="Cost" value={formatMoney(entry.cost)} />
            <MiniMetric
              label="Next Due"
              value={
                entry.nextDueMileage
                  ? formatOdometer(entry.nextDueMileage)
                  : formatDate(entry.nextDueDate)
              }
            />
          </Box>

          {entry.notes ? (
            <Typography
              sx={{
                color: "text.secondary",
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {entry.notes}
            </Typography>
          ) : null}

          {entry.resolvedAt ? (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Resolved {formatDate(entry.resolvedAt)}
              {entry.resolvedNotes ? ` — ${entry.resolvedNotes}` : ""}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
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

      <Typography sx={{ mt: 0.1, fontSize: 13, fontWeight: 750 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function FleetVehicleDetailPage() {
  const theme = useTheme();
  const params = useParams<{ vehicleId: string }>();
  const vehicleId = params.vehicleId;
  const { appUser } = useAuthContext();

  const [vehicle, setVehicle] = useState<FleetVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [odometerInput, setOdometerInput] = useState("");
  const [savingOdometer, setSavingOdometer] = useState(false);

  const [maintenanceForm, setMaintenanceForm] =
    useState<MaintenanceFormState>(initialMaintenanceForm);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [resolvingIssueId, setResolvingIssueId] = useState("");

  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const currentYear = new Date().getFullYear();

  const loadVehicle = async () => {
    setLoading(true);
    setLoadError("");
    setActionError("");
    setActionSuccess("");

    try {
      const snapshot = await getDoc(doc(db, "fleetVehicles", vehicleId));

      if (!snapshot.exists()) {
        setLoadError("Fleet vehicle not found.");
        setVehicle(null);
        return;
      }

      const nextVehicle = normalizeFleetVehicle(snapshot.id, snapshot.data());
      setVehicle(nextVehicle);
      setOdometerInput(
        typeof nextVehicle.currentOdometer === "number"
          ? String(nextVehicle.currentOdometer)
          : ""
      );
    } catch (error) {
      console.error("Failed to load fleet vehicle:", error);
      setLoadError("Could not load fleet vehicle. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVehicle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const sortedMaintenanceLogs = useMemo(() => {
    const logs = vehicle?.maintenanceLogs ?? [];

    return [...logs].sort((a, b) => {
      const aTime = new Date(a.date || a.createdAt).getTime();
      const bTime = new Date(b.date || b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [vehicle?.maintenanceLogs]);

  const openIssueCount = useMemo(
    () => sortedMaintenanceLogs.filter((entry) => entry.isOpenIssue).length,
    [sortedMaintenanceLogs]
  );

  const updateMaintenanceForm = <Key extends keyof MaintenanceFormState>(
    key: Key,
    value: MaintenanceFormState[Key]
  ) => {
    setMaintenanceForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSaveOdometer = async () => {
    if (!vehicle) return;

    setActionError("");
    setActionSuccess("");

    const parsed = parseOptionalNumber(odometerInput);

    if (typeof parsed !== "number") {
      setActionError("Enter a valid odometer reading.");
      return;
    }

    setSavingOdometer(true);

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "fleetVehicles", vehicle.id), {
        currentOdometer: parsed,
        odometerUpdatedAt: nowIso,
        odometerUpdatedByUid: appUser?.uid,
        odometerUpdatedByName: appUser?.displayName || appUser?.email || undefined,
        updatedAt: serverTimestamp(),
        updatedByUid: appUser?.uid,
        updatedByName: appUser?.displayName || appUser?.email || undefined,
      });

      setVehicle((current) =>
        current
          ? {
              ...current,
              currentOdometer: parsed,
              odometerUpdatedAt: nowIso,
              odometerUpdatedByUid: appUser?.uid,
              odometerUpdatedByName:
                appUser?.displayName || appUser?.email || undefined,
              updatedAt: nowIso,
              updatedByUid: appUser?.uid,
              updatedByName: appUser?.displayName || appUser?.email || undefined,
            }
          : current
      );

      setActionSuccess("Odometer updated.");
    } catch (error) {
      console.error("Failed to update odometer:", error);
      setActionError("Could not update odometer. Please try again.");
    } finally {
      setSavingOdometer(false);
    }
  };

  const handleAddMaintenance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!vehicle) return;

    setActionError("");
    setActionSuccess("");

    if (!maintenanceForm.date) {
      setActionError("Maintenance date is required.");
      return;
    }

    const odometer = parseOptionalNumber(maintenanceForm.odometer);
    const cost = parseOptionalNumber(maintenanceForm.cost);
    const nextDueMileage = parseOptionalNumber(maintenanceForm.nextDueMileage);
    const nowIso = new Date().toISOString();

    const newEntry: FleetMaintenanceLogEntry = {
      id: crypto.randomUUID(),
      type: maintenanceForm.type,
      date: maintenanceForm.date,

      odometer,
      vendor: emptyToUndefined(maintenanceForm.vendor),
      cost,
      notes: emptyToUndefined(maintenanceForm.notes),

      nextDueDate: emptyToUndefined(maintenanceForm.nextDueDate),
      nextDueMileage,

      isOpenIssue: maintenanceForm.isOpenIssue,

      createdAt: nowIso,
      createdByUid: appUser?.uid,
      createdByName: appUser?.displayName || appUser?.email || undefined,

      updatedAt: nowIso,
      updatedByUid: appUser?.uid,
      updatedByName: appUser?.displayName || appUser?.email || undefined,
    };

    const nextLogs = [...(vehicle.maintenanceLogs ?? []), newEntry];

    const updatePayload: Record<string, unknown> = {
      maintenanceLogs: nextLogs,
      updatedAt: serverTimestamp(),
      updatedByUid: appUser?.uid,
      updatedByName: appUser?.displayName || appUser?.email || undefined,
    };

    if (typeof odometer === "number") {
      updatePayload.currentOdometer = odometer;
      updatePayload.odometerUpdatedAt = nowIso;
      updatePayload.odometerUpdatedByUid = appUser?.uid;
      updatePayload.odometerUpdatedByName =
        appUser?.displayName || appUser?.email || undefined;
    }

    if (maintenanceForm.type === "oil_change") {
      updatePayload.lastOilChangeDate = maintenanceForm.date;

      if (typeof odometer === "number") {
        updatePayload.lastOilChangeMileage = odometer;
      }

      if (maintenanceForm.nextDueDate) {
        updatePayload.nextOilChangeDate = maintenanceForm.nextDueDate;
      }

      if (typeof nextDueMileage === "number") {
        updatePayload.nextOilChangeMileage = nextDueMileage;
      }
    }

    setSavingMaintenance(true);

    try {
      await updateDoc(doc(db, "fleetVehicles", vehicle.id), updatePayload);

      setVehicle((current) =>
        current
          ? {
              ...current,
              maintenanceLogs: nextLogs,
              currentOdometer:
                typeof odometer === "number" ? odometer : current.currentOdometer,
              odometerUpdatedAt:
                typeof odometer === "number" ? nowIso : current.odometerUpdatedAt,
              lastOilChangeDate:
                maintenanceForm.type === "oil_change"
                  ? maintenanceForm.date
                  : current.lastOilChangeDate,
              lastOilChangeMileage:
                maintenanceForm.type === "oil_change" && typeof odometer === "number"
                  ? odometer
                  : current.lastOilChangeMileage,
              nextOilChangeDate:
                maintenanceForm.type === "oil_change" && maintenanceForm.nextDueDate
                  ? maintenanceForm.nextDueDate
                  : current.nextOilChangeDate,
              nextOilChangeMileage:
                maintenanceForm.type === "oil_change" &&
                typeof nextDueMileage === "number"
                  ? nextDueMileage
                  : current.nextOilChangeMileage,
              updatedAt: nowIso,
            }
          : current
      );

      if (typeof odometer === "number") {
        setOdometerInput(String(odometer));
      }

      setMaintenanceForm({
        ...initialMaintenanceForm,
        date: new Date().toISOString().slice(0, 10),
      });

      setActionSuccess("Maintenance log added.");
    } catch (error) {
      console.error("Failed to add maintenance log:", error);
      setActionError("Could not add maintenance log. Please try again.");
    } finally {
      setSavingMaintenance(false);
    }
  };

  const handleResolveIssue = async (entryId: string) => {
    if (!vehicle) return;

    setActionError("");
    setActionSuccess("");
    setResolvingIssueId(entryId);

    const nowIso = new Date().toISOString();

    const nextLogs = (vehicle.maintenanceLogs ?? []).map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            isOpenIssue: false,
            resolvedAt: nowIso,
            resolvedNotes: "Marked resolved from Fleet Vehicle detail.",
            updatedAt: nowIso,
            updatedByUid: appUser?.uid,
            updatedByName: appUser?.displayName || appUser?.email || undefined,
          }
        : entry
    );

    try {
      await updateDoc(doc(db, "fleetVehicles", vehicle.id), {
        maintenanceLogs: nextLogs,
        updatedAt: serverTimestamp(),
        updatedByUid: appUser?.uid,
        updatedByName: appUser?.displayName || appUser?.email || undefined,
      });

      setVehicle((current) =>
        current
          ? {
              ...current,
              maintenanceLogs: nextLogs,
              updatedAt: nowIso,
            }
          : current
      );

      setActionSuccess("Maintenance issue resolved.");
    } catch (error) {
      console.error("Failed to resolve maintenance issue:", error);
      setActionError("Could not resolve maintenance issue. Please try again.");
    } finally {
      setResolvingIssueId("");
    }
  };

  return (
    <ProtectedPage fallbackTitle="Fleet Vehicle" allowedRoles={["admin"]}>
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
                  flexWrap="wrap"
                  useFlexGap
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

                  {vehicle ? (
                    <Chip
                      size="small"
                      label={getFleetVehicleStatusLabel(vehicle.status)}
                      variant="outlined"
                      sx={{
                        borderRadius: 1.5,
                        fontWeight: 800,
                        ...getStatusChipSx(theme, vehicle.status),
                      }}
                    />
                  ) : null}

                  {vehicle && hasOpenMaintenanceIssue(vehicle) ? (
                    <Chip
                      size="small"
                      icon={<WarningAmberRoundedIcon sx={{ fontSize: 16 }} />}
                      label={`${openIssueCount} open issue${openIssueCount === 1 ? "" : "s"}`}
                      variant="outlined"
                      sx={{
                        borderRadius: 1.5,
                        fontWeight: 800,
                        backgroundColor: alpha(theme.palette.error.main, 0.14),
                        color: theme.palette.error.light,
                        borderColor: alpha(theme.palette.error.main, 0.28),
                        "& .MuiChip-icon": { color: theme.palette.error.light },
                      }}
                    />
                  ) : null}

                  {vehicle && needsYearEndMileage(vehicle, currentYear) ? (
                    <Chip
                      size="small"
                      icon={<EventRoundedIcon sx={{ fontSize: 16 }} />}
                      label={`${currentYear} mileage needed`}
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
                  ) : null}
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
                  {vehicle ? getFleetVehicleDisplayName(vehicle) : "Fleet Vehicle"}
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
                  View vehicle assignment, mileage, compliance dates, oil change
                  tracking, and maintenance log history.
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "stretch", sm: "center" }}
                sx={{ width: { xs: "100%", lg: "auto" } }}
              >
                <Button
                  component={Link}
                  href={`/admin/fleet-vehicles/${vehicleId}/edit`}
                  variant="contained"
                  startIcon={<EditRoundedIcon />}
                  disabled={!vehicle}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Edit
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshRoundedIcon />}
                  onClick={() => void loadVehicle()}
                  disabled={loading}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Refresh
                </Button>
              </Stack>
            </Stack>

            {loadError ? <Alert severity="error">{loadError}</Alert> : null}
            {actionError ? <Alert severity="error">{actionError}</Alert> : null}
            {actionSuccess ? <Alert severity="success">{actionSuccess}</Alert> : null}

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
                    Loading fleet vehicle…
                  </Typography>
                </Stack>
              </Card>
            ) : !vehicle ? (
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
                    Vehicle not found
                  </Typography>

                  <Typography sx={{ mt: 0.75, color: "text.secondary" }}>
                    This fleet vehicle may have been removed or the link may be invalid.
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
              <>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      lg: "1.1fr 0.9fr",
                    },
                    gap: 1.5,
                  }}
                >
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2.5}>
                        <SectionTitle
                          icon={<LocalShippingRoundedIcon sx={{ fontSize: 20 }} />}
                          title="Vehicle Info"
                          subtitle="Core vehicle identity and assignment."
                        />

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(2, minmax(0, 1fr))",
                            },
                            gap: 1,
                          }}
                        >
                          <InfoTile
                            icon={<LocalShippingRoundedIcon sx={{ fontSize: 18 }} />}
                            label="Vehicle"
                            value={
                              [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
                                .filter(Boolean)
                                .join(" ") || "Not set"
                            }
                          />

                          <InfoTile
                            icon={<BadgeRoundedIcon sx={{ fontSize: 18 }} />}
                            label="Assigned Driver"
                            value={vehicle.assignedEmployeeName || "Unassigned"}
                          />

                          <InfoTile
                            icon={<NotesRoundedIcon sx={{ fontSize: 18 }} />}
                            label="License Plate"
                            value={vehicle.licensePlate || "Not set"}
                          />

                          <InfoTile
                            icon={<NotesRoundedIcon sx={{ fontSize: 18 }} />}
                            label="VIN"
                            value={vehicle.vin || "Not set"}
                          />
                        </Box>

                        {vehicle.notes ? (
                          <>
                            <Divider />

                            <Box>
                              <Typography
                                sx={{
                                  fontSize: 11,
                                  fontWeight: 850,
                                  color: "text.secondary",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.055em",
                                }}
                              >
                                Notes
                              </Typography>

                              <Typography
                                sx={{
                                  mt: 0.5,
                                  color: "text.secondary",
                                  fontSize: 14,
                                  lineHeight: 1.6,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {vehicle.notes}
                              </Typography>
                            </Box>
                          </>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2.5}>
                        <SectionTitle
                          icon={<SpeedRoundedIcon sx={{ fontSize: 20 }} />}
                          title="Odometer"
                          subtitle="Update current mileage when a truck is serviced or reviewed."
                        />

                        <Stack spacing={1.5}>
                          <InfoTile
                            icon={<SpeedRoundedIcon sx={{ fontSize: 18 }} />}
                            label="Current Odometer"
                            value={formatOdometer(vehicle.currentOdometer)}
                          />

                          <TextField
                            label="Update Odometer"
                            value={odometerInput}
                            onChange={(event) => setOdometerInput(event.target.value)}
                            inputMode="numeric"
                            fullWidth
                          />

                          <Button
                            variant="contained"
                            startIcon={<SaveRoundedIcon />}
                            disabled={savingOdometer}
                            onClick={() => void handleSaveOdometer()}
                            sx={{ borderRadius: 2, alignSelf: "flex-start" }}
                          >
                            {savingOdometer ? "Saving…" : "Save Odometer"}
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>

                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 1,
                    border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    backgroundColor: "background.paper",
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack spacing={2.5}>
                      <SectionTitle
                        icon={<EventRoundedIcon sx={{ fontSize: 20 }} />}
                        title="Compliance & Service Reminders"
                        subtitle="Dates and service interval information that should create admin warnings."
                      />

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            md: "repeat(3, minmax(0, 1fr))",
                          },
                          gap: 1,
                        }}
                      >
                        <ExpirationInfo
                          label="Registration"
                          value={vehicle.registrationExpiresAt}
                        />
                        <ExpirationInfo
                          label="Insurance"
                          value={vehicle.insuranceExpiresAt}
                        />
                        <ExpirationInfo
                          label="Inspection"
                          value={vehicle.inspectionExpiresAt}
                        />
                      </Box>

                      <Divider />

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            md: "repeat(4, minmax(0, 1fr))",
                          },
                          gap: 1,
                        }}
                      >
                        <InfoTile
                          icon={<BuildRoundedIcon sx={{ fontSize: 18 }} />}
                          label="Last Oil Change"
                          value={formatDate(vehicle.lastOilChangeDate)}
                        />
                        <InfoTile
                          icon={<SpeedRoundedIcon sx={{ fontSize: 18 }} />}
                          label="Last Oil Mileage"
                          value={formatOdometer(vehicle.lastOilChangeMileage)}
                        />
                        <InfoTile
                          icon={<EventRoundedIcon sx={{ fontSize: 18 }} />}
                          label="Next Oil Date"
                          value={formatDate(vehicle.nextOilChangeDate)}
                        />
                        <InfoTile
                          icon={<SpeedRoundedIcon sx={{ fontSize: 18 }} />}
                          label="Next Oil Mileage"
                          value={formatOdometer(vehicle.nextOilChangeMileage)}
                        />
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 1,
                    border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    backgroundColor: "background.paper",
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Box component="form" onSubmit={handleAddMaintenance}>
                      <Stack spacing={2.5}>
                        <SectionTitle
                          icon={<AddRoundedIcon sx={{ fontSize: 20 }} />}
                          title="Add Maintenance Log"
                          subtitle="Log oil changes, tires, brakes, registration, repairs, and open truck issues."
                        />

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              md: "repeat(2, minmax(0, 1fr))",
                              lg: "repeat(4, minmax(0, 1fr))",
                            },
                            gap: 1.5,
                          }}
                        >
                          <FormControl fullWidth>
                            <InputLabel>Type</InputLabel>
                            <Select
                              label="Type"
                              value={maintenanceForm.type}
                              onChange={(event) =>
                                updateMaintenanceForm(
                                  "type",
                                  event.target.value as FleetMaintenanceType
                                )
                              }
                            >
                              {FLEET_MAINTENANCE_TYPES.map((type) => (
                                <MenuItem key={type.value} value={type.value}>
                                  {type.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <TextField
                            label="Date"
                            type="date"
                            value={maintenanceForm.date}
                            onChange={(event) =>
                              updateMaintenanceForm("date", event.target.value)
                            }
                            InputLabelProps={{ shrink: true }}
                            required
                            fullWidth
                          />

                          <TextField
                            label="Odometer"
                            value={maintenanceForm.odometer}
                            onChange={(event) =>
                              updateMaintenanceForm("odometer", event.target.value)
                            }
                            inputMode="numeric"
                            fullWidth
                          />

                          <TextField
                            label="Cost"
                            value={maintenanceForm.cost}
                            onChange={(event) =>
                              updateMaintenanceForm("cost", event.target.value)
                            }
                            inputMode="decimal"
                            fullWidth
                          />

                          <TextField
                            label="Vendor"
                            value={maintenanceForm.vendor}
                            onChange={(event) =>
                              updateMaintenanceForm("vendor", event.target.value)
                            }
                            placeholder="Shop / in-house"
                            fullWidth
                            sx={{
                              gridColumn: { xs: "auto", md: "span 2" },
                            }}
                          />

                          <TextField
                            label="Next Due Date"
                            type="date"
                            value={maintenanceForm.nextDueDate}
                            onChange={(event) =>
                              updateMaintenanceForm("nextDueDate", event.target.value)
                            }
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                          />

                          <TextField
                            label="Next Due Mileage"
                            value={maintenanceForm.nextDueMileage}
                            onChange={(event) =>
                              updateMaintenanceForm(
                                "nextDueMileage",
                                event.target.value
                              )
                            }
                            inputMode="numeric"
                            fullWidth
                          />

                          <TextField
                            label="Notes"
                            value={maintenanceForm.notes}
                            onChange={(event) =>
                              updateMaintenanceForm("notes", event.target.value)
                            }
                            multiline
                            minRows={3}
                            fullWidth
                            sx={{
                              gridColumn: { xs: "auto", md: "span 2", lg: "span 4" },
                            }}
                          />
                        </Box>

                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={maintenanceForm.isOpenIssue}
                              onChange={(event) =>
                                updateMaintenanceForm(
                                  "isOpenIssue",
                                  event.target.checked
                                )
                              }
                            />
                          }
                          label="This is an open maintenance issue that needs follow-up"
                        />

                        <Button
                          type="submit"
                          variant="contained"
                          startIcon={<AddRoundedIcon />}
                          disabled={savingMaintenance}
                          sx={{ borderRadius: 2, alignSelf: "flex-start" }}
                        >
                          {savingMaintenance ? "Adding…" : "Add Maintenance Log"}
                        </Button>
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>

                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 1,
                    border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    backgroundColor: "background.paper",
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack spacing={2.5}>
                      <SectionTitle
                        icon={<BuildRoundedIcon sx={{ fontSize: 20 }} />}
                        title="Maintenance Log"
                        subtitle="History of service, repairs, and open vehicle issues."
                      />

                      {sortedMaintenanceLogs.length === 0 ? (
                        <Alert severity="info" sx={{ borderRadius: 2 }}>
                          No maintenance has been logged for this vehicle yet.
                        </Alert>
                      ) : (
                        <Stack spacing={1}>
                          {sortedMaintenanceLogs.map((entry) => (
                            <MaintenanceLogCard
                              key={entry.id}
                              entry={entry}
                              resolving={resolvingIssueId === entry.id}
                              onResolve={handleResolveIssue}
                            />
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </>
            )}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}