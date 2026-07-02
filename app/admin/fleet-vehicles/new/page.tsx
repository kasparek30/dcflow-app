// app/admin/fleet-vehicles/new/page.tsx
"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import {
  FLEET_VEHICLE_STATUSES,
  FleetVehicleStatus,
} from "../../../../src/types/fleet-vehicle";

type FleetVehicleFormState = {
  unitNumber: string;
  name: string;

  year: string;
  make: string;
  model: string;
  trim: string;

  vin: string;
  licensePlate: string;

  status: FleetVehicleStatus;

  assignedEmployeeName: string;

  currentOdometer: string;

  registrationExpiresAt: string;
  insuranceExpiresAt: string;
  inspectionExpiresAt: string;

  lastOilChangeDate: string;
  lastOilChangeMileage: string;
  nextOilChangeDate: string;
  nextOilChangeMileage: string;

  notes: string;
};

const initialFormState: FleetVehicleFormState = {
  unitNumber: "",
  name: "",

  year: "",
  make: "",
  model: "",
  trim: "",

  vin: "",
  licensePlate: "",

  status: "active",

  assignedEmployeeName: "",

  currentOdometer: "",

  registrationExpiresAt: "",
  insuranceExpiresAt: "",
  inspectionExpiresAt: "",

  lastOilChangeDate: "",
  lastOilChangeMileage: "",
  nextOilChangeDate: "",
  nextOilChangeMileage: "",

  notes: "",
};

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

function dateToStoredValue(value: string): string | undefined {
  return value ? value : undefined;
}

function normalizeUnitNumberKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function removeUndefinedFields<T extends Record<string, unknown>>(
  input: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
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

export default function NewFleetVehiclePage() {
  const theme = useTheme();
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [form, setForm] = useState<FleetVehicleFormState>(initialFormState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const vehiclePreview = useMemo(() => {
    const unit = form.unitNumber.trim()
      ? `Unit ${form.unitNumber.trim()}`
      : "New vehicle";
    const name = form.name.trim();

    if (name) return `${unit} — ${name}`;

    const details = [form.year, form.make, form.model]
      .filter(Boolean)
      .join(" ")
      .trim();

    return details ? `${unit} — ${details}` : unit;
  }, [form.unitNumber, form.name, form.year, form.make, form.model]);

  const updateForm = <Key extends keyof FleetVehicleFormState>(
    key: Key,
    value: FleetVehicleFormState[Key]
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaveError("");

    const unitNumber = form.unitNumber.trim();
    const unitNumberKey = normalizeUnitNumberKey(unitNumber);
    const name = form.name.trim();

    if (!unitNumber) {
      setSaveError("Truck / Unit # is required.");
      return;
    }

    if (!unitNumberKey) {
      setSaveError("Enter a valid Truck / Unit #.");
      return;
    }

    if (!name && !form.make.trim() && !form.model.trim()) {
      setSaveError("Add a vehicle name or at least the make/model.");
      return;
    }

    setSaving(true);

    try {
      const duplicateSnapshot = await getDocs(
        query(
          collection(db, "fleetVehicles"),
          where("unitNumberKey", "==", unitNumberKey),
          limit(1)
        )
      );

      if (!duplicateSnapshot.empty) {
        setSaveError(
          `Truck / Unit # "${unitNumber}" is already assigned to another fleet vehicle.`
        );
        setSaving(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const hasOdometer = Boolean(form.currentOdometer.trim());

      const vehiclePayload = removeUndefinedFields({
        unitNumber,
        unitNumberKey,
        name,

        year: parseOptionalNumber(form.year),
        make: emptyToUndefined(form.make),
        model: emptyToUndefined(form.model),
        trim: emptyToUndefined(form.trim),

        vin: emptyToUndefined(form.vin),
        licensePlate: emptyToUndefined(form.licensePlate),

        status: form.status,

        assignedEmployeeName: emptyToUndefined(form.assignedEmployeeName),

        currentOdometer: parseOptionalNumber(form.currentOdometer),
        odometerUpdatedAt: hasOdometer ? nowIso : undefined,
        odometerUpdatedByUid: hasOdometer ? appUser?.uid : undefined,
        odometerUpdatedByName: hasOdometer
          ? appUser?.displayName || appUser?.email || undefined
          : undefined,

        registrationExpiresAt: dateToStoredValue(form.registrationExpiresAt),
        insuranceExpiresAt: dateToStoredValue(form.insuranceExpiresAt),
        inspectionExpiresAt: dateToStoredValue(form.inspectionExpiresAt),

        lastOilChangeDate: dateToStoredValue(form.lastOilChangeDate),
        lastOilChangeMileage: parseOptionalNumber(form.lastOilChangeMileage),
        nextOilChangeDate: dateToStoredValue(form.nextOilChangeDate),
        nextOilChangeMileage: parseOptionalNumber(form.nextOilChangeMileage),

        maintenanceLogs: [],
        yearEndMileage: [],

        notes: emptyToUndefined(form.notes),

        createdAt: serverTimestamp(),
        createdByUid: appUser?.uid,
        createdByName: appUser?.displayName || appUser?.email || undefined,

        updatedAt: serverTimestamp(),
        updatedByUid: appUser?.uid,
        updatedByName: appUser?.displayName || appUser?.email || undefined,
      });

      const docRef = await addDoc(
        collection(db, "fleetVehicles"),
        vehiclePayload
      );

      router.push(`/admin/fleet-vehicles/${docRef.id}`);
    } catch (error) {
      console.error("Failed to create fleet vehicle:", error);
      setSaveError("Could not create fleet vehicle. Please try again.");
      setSaving(false);
    }
  };

  return (
    <ProtectedPage fallbackTitle="New Fleet Vehicle" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1160, mx: "auto" }}>
          <Box component="form" onSubmit={handleSubmit}>
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
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 2,
                        display: "grid",
                        placeItems: "center",
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
                        color: theme.palette.primary.light,
                      }}
                    >
                      <LocalShippingRoundedIcon sx={{ fontSize: 20 }} />
                    </Box>

                    <Typography
                      sx={{
                        color: "text.secondary",
                        fontSize: 13,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      New Fleet Vehicle
                    </Typography>
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
                    {vehiclePreview}
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.9,
                      color: "text.secondary",
                      fontSize: { xs: 13, md: 14 },
                      fontWeight: 500,
                      maxWidth: 760,
                    }}
                  >
                    Add a company truck or fleet vehicle with assignment, odometer,
                    compliance dates, oil change tracking, and notes.
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
                    href="/admin/fleet-vehicles"
                    variant="outlined"
                    disabled={saving}
                    sx={{ minHeight: 40, borderRadius: 2 }}
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<SaveRoundedIcon />}
                    disabled={saving}
                    sx={{ minHeight: 40, borderRadius: 2 }}
                  >
                    {saving ? "Saving…" : "Save Vehicle"}
                  </Button>
                </Stack>
              </Stack>

              {saveError ? <Alert severity="error">{saveError}</Alert> : null}

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
                      subtitle="Core information used to identify the truck or company vehicle."
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
                      <TextField
                        label="Truck / Unit #"
                        value={form.unitNumber}
                        onChange={(event) =>
                          updateForm("unitNumber", event.target.value)
                        }
                        helperText="Examples: Truck 1, Service 2, Spare 1"
                        required
                        fullWidth
                      />

                      <TextField
                        label="Vehicle Name"
                        value={form.name}
                        onChange={(event) =>
                          updateForm("name", event.target.value)
                        }
                        placeholder="Truck 1"
                        fullWidth
                      />

                      <FormControl fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select
                          label="Status"
                          value={form.status}
                          onChange={(event) =>
                            updateForm(
                              "status",
                              event.target.value as FleetVehicleStatus
                            )
                          }
                        >
                          {FLEET_VEHICLE_STATUSES.map((status) => (
                            <MenuItem key={status.value} value={status.value}>
                              {status.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <TextField
                        label="License Plate"
                        value={form.licensePlate}
                        onChange={(event) =>
                          updateForm("licensePlate", event.target.value)
                        }
                        fullWidth
                      />

                      <TextField
                        label="Year"
                        value={form.year}
                        onChange={(event) =>
                          updateForm("year", event.target.value)
                        }
                        inputMode="numeric"
                        fullWidth
                      />

                      <TextField
                        label="Make"
                        value={form.make}
                        onChange={(event) =>
                          updateForm("make", event.target.value)
                        }
                        placeholder="Ford"
                        fullWidth
                      />

                      <TextField
                        label="Model"
                        value={form.model}
                        onChange={(event) =>
                          updateForm("model", event.target.value)
                        }
                        placeholder="F-250"
                        fullWidth
                      />

                      <TextField
                        label="Trim"
                        value={form.trim}
                        onChange={(event) =>
                          updateForm("trim", event.target.value)
                        }
                        fullWidth
                      />

                      <TextField
                        label="VIN"
                        value={form.vin}
                        onChange={(event) =>
                          updateForm("vin", event.target.value)
                        }
                        fullWidth
                        sx={{
                          gridColumn: { xs: "auto", md: "span 2" },
                        }}
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
                  <Stack spacing={2.5}>
                    <SectionTitle
                      icon={<BadgeRoundedIcon sx={{ fontSize: 20 }} />}
                      title="Assignment"
                      subtitle="For MVP, enter the assigned driver name. We can replace this with an employee picker next."
                    />

                    <TextField
                      label="Assigned Driver"
                      value={form.assignedEmployeeName}
                      onChange={(event) =>
                        updateForm("assignedEmployeeName", event.target.value)
                      }
                      placeholder="Josh"
                      fullWidth
                    />
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
                      title="Mileage"
                      subtitle="Current odometer is used for service intervals and year-end mileage tracking."
                    />

                    <TextField
                      label="Current Odometer"
                      value={form.currentOdometer}
                      onChange={(event) =>
                        updateForm("currentOdometer", event.target.value)
                      }
                      placeholder="84250"
                      inputMode="numeric"
                      fullWidth
                    />
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
                      icon={<EventRoundedIcon sx={{ fontSize: 20 }} />}
                      title="Compliance Dates"
                      subtitle="Track registration, insurance, and commercial inspection dates for admin warnings."
                    />

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          md: "repeat(3, minmax(0, 1fr))",
                        },
                        gap: 1.5,
                      }}
                    >
                      <TextField
                        label="Registration Expires"
                        type="date"
                        value={form.registrationExpiresAt}
                        onChange={(event) =>
                          updateForm(
                            "registrationExpiresAt",
                            event.target.value
                          )
                        }
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                      />

                      <TextField
                        label="Insurance Expires"
                        type="date"
                        value={form.insuranceExpiresAt}
                        onChange={(event) =>
                          updateForm("insuranceExpiresAt", event.target.value)
                        }
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                      />

                      <TextField
                        label="Commercial Inspection Expires"
                        type="date"
                        value={form.inspectionExpiresAt}
                        onChange={(event) =>
                          updateForm("inspectionExpiresAt", event.target.value)
                        }
                        InputLabelProps={{ shrink: true }}
                        fullWidth
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
                  <Stack spacing={2.5}>
                    <SectionTitle
                      icon={<BuildRoundedIcon sx={{ fontSize: 20 }} />}
                      title="Oil Change Tracking"
                      subtitle="Set the last oil change and next due mileage/date. Maintenance log entries will live on the vehicle detail page."
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
                      <TextField
                        label="Last Oil Change Date"
                        type="date"
                        value={form.lastOilChangeDate}
                        onChange={(event) =>
                          updateForm("lastOilChangeDate", event.target.value)
                        }
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                      />

                      <TextField
                        label="Last Oil Change Mileage"
                        value={form.lastOilChangeMileage}
                        onChange={(event) =>
                          updateForm("lastOilChangeMileage", event.target.value)
                        }
                        inputMode="numeric"
                        fullWidth
                      />

                      <TextField
                        label="Next Oil Change Date"
                        type="date"
                        value={form.nextOilChangeDate}
                        onChange={(event) =>
                          updateForm("nextOilChangeDate", event.target.value)
                        }
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                      />

                      <TextField
                        label="Next Oil Change Mileage"
                        value={form.nextOilChangeMileage}
                        onChange={(event) =>
                          updateForm("nextOilChangeMileage", event.target.value)
                        }
                        inputMode="numeric"
                        fullWidth
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
                  <Stack spacing={2.5}>
                    <SectionTitle
                      icon={<NotesRoundedIcon sx={{ fontSize: 20 }} />}
                      title="Notes"
                      subtitle="Optional notes for truck condition, restrictions, or admin reminders."
                    />

                    <TextField
                      label="Notes"
                      value={form.notes}
                      onChange={(event) =>
                        updateForm("notes", event.target.value)
                      }
                      minRows={4}
                      multiline
                      fullWidth
                    />
                  </Stack>
                </CardContent>
              </Card>

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
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveRoundedIcon />}
                  disabled={saving}
                  sx={{ minHeight: 42, borderRadius: 2 }}
                >
                  {saving ? "Saving…" : "Save Vehicle"}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}