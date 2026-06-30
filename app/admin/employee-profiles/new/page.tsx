// app/admin/employee-profiles/new/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  updateDoc,
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
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import BusinessCenterRoundedIcon from "@mui/icons-material/BusinessCenterRounded";
import CheckroomRoundedIcon from "@mui/icons-material/CheckroomRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type {
  EmploymentStatus,
  LaborRole,
  PlumbingLicenseType,
  ShirtSize,
} from "../../../../src/types/employee-profile";

type DcflowUser = {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean;
  employeeProfileId?: string | null;
};

type QboEmployee = {
  docId: string;
  qboEmployeeId: string;
  displayName: string;
  email?: string;
  phone?: string;
  hiredDate?: string;
  active?: boolean;
};

const laborRoles: Array<{ value: LaborRole; label: string }> = [
  { value: "technician", label: "Technician" },
  { value: "helper", label: "Helper" },
  { value: "apprentice", label: "Apprentice" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "billing", label: "Billing" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "other", label: "Other" },
];

const employmentStatuses: Array<{ value: EmploymentStatus; label: string }> = [
  { value: "current", label: "Current" },
  { value: "inactive", label: "Inactive" },
  { value: "seasonal", label: "Seasonal" },
];

const shirtSizeOptions: ShirtSize[] = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "LT",
  "XLT",
  "2XLT",
  "3XLT",
  "4XLT",
];

const licenseTypeOptions: Array<{
  value: PlumbingLicenseType;
  label: string;
}> = [
  { value: "none", label: "No License / Not Tracked" },
  { value: "apprentice", label: "Apprentice" },
  { value: "tradesman", label: "Tradesman" },
  { value: "journeyman", label: "Journeyman" },
  { value: "master", label: "Master Plumber" },
  { value: "other", label: "Other" },
];

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep) as unknown as T;
  }

  if (value && typeof value === "object") {
    const out: any = {};

    for (const [key, val] of Object.entries(value as any)) {
      if (val === undefined) continue;
      out[key] = stripUndefinedDeep(val);
    }

    return out;
  }

  return value;
}

function cleanString(value: string) {
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function addOneYear(dateValue: string) {
  if (!dateValue) return "";

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  date.setFullYear(date.getFullYear() + 1);

  return date.toISOString().slice(0, 10);
}

function getQboString(data: any, paths: string[]) {
  for (const path of paths) {
    const parts = path.split(".");
    let current = data;

    for (const part of parts) {
      current = current?.[part];
    }

    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }

  return "";
}

function mapQboEmployee(docId: string, data: any): QboEmployee {
  const displayName =
    getQboString(data, [
      "DisplayName",
      "displayName",
      "FullyQualifiedName",
      "PrintOnCheckName",
      "Name",
      "qboEmployeeDisplayName",
    ]) || docId;

  const qboEmployeeId =
    getQboString(data, ["Id", "id", "qboEmployeeId"]) || docId;

  const email = getQboString(data, [
    "PrimaryEmailAddr.Address",
    "primaryEmailAddr.Address",
    "PrimaryEmailAddr",
    "primaryEmail",
    "email",
  ]);

  const phone = getQboString(data, [
    "PrimaryPhone.FreeFormNumber",
    "primaryPhone.FreeFormNumber",
    "PrimaryPhone",
    "phone",
  ]);

  const hiredDate = getQboString(data, [
    "HiredDate",
    "hiredDate",
    "qboEmployeeHiredDate",
  ]);

  return {
    docId,
    qboEmployeeId,
    displayName,
    email,
    phone,
    hiredDate,
    active:
      typeof data.Active === "boolean"
        ? data.Active
        : typeof data.active === "boolean"
          ? data.active
          : true,
  };
}

function isFieldRole(role: LaborRole) {
  return (
    role === "technician" ||
    role === "helper" ||
    role === "apprentice" ||
    role === "manager"
  );
}

function isSupportRole(role: LaborRole) {
  return role === "helper" || role === "apprentice";
}

function isStaffCoverageRole(role: LaborRole) {
  return role === "dispatcher" || role === "billing" || role === "admin";
}

export default function NewEmployeeProfilePage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<DcflowUser[]>([]);
  const [qboEmployees, setQboEmployees] = useState<QboEmployee[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedUid, setSelectedUid] = useState("");
  const [selectedQboDocId, setSelectedQboDocId] = useState("");

  const selectedUser = useMemo(
    () => users.find((user) => user.uid === selectedUid),
    [users, selectedUid]
  );

  const selectedQboEmployee = useMemo(
    () =>
      qboEmployees.find(
        (employee) => employee.docId === selectedQboDocId
      ),
    [qboEmployees, selectedQboDocId]
  );

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [employmentStatus, setEmploymentStatus] =
    useState<EmploymentStatus>("current");
  const [laborRole, setLaborRole] = useState<LaborRole>("helper");

  const [showOnSchedule, setShowOnSchedule] = useState(true);
  const [fieldAssignable, setFieldAssignable] = useState(true);
  const [staffCoverageEligible, setStaffCoverageEligible] = useState(false);
  const [defaultPairedTechUid, setDefaultPairedTechUid] = useState("");

  const [qboEmployeeId, setQboEmployeeId] = useState("");
  const [qboEmployeeDisplayName, setQboEmployeeDisplayName] = useState("");
  const [qboEmployeeHiredDate, setQboEmployeeHiredDate] = useState("");
  const [ptoEligibilityDate, setPtoEligibilityDate] = useState("");

  const [shirtSize, setShirtSize] = useState<ShirtSize | "">("");
  const [gearNotes, setGearNotes] = useState("");

  const [licenseType, setLicenseType] =
    useState<PlumbingLicenseType>("none");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseIssuingState, setLicenseIssuingState] = useState("TX");
  const [licenseExpirationDate, setLicenseExpirationDate] = useState("");
  const [licenseNotes, setLicenseNotes] = useState("");

  const [canDriveCompanyVehicle, setCanDriveCompanyVehicle] = useState(false);
  const [insuranceApproved, setInsuranceApproved] = useState(false);
  const [driversLicenseNumber, setDriversLicenseNumber] = useState("");
  const [driversLicenseState, setDriversLicenseState] = useState("TX");
  const [driversLicenseExpirationDate, setDriversLicenseExpirationDate] =
    useState("");
  const [driverNotes, setDriverNotes] = useState("");

  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const [usersSnap, qboSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "qboEmployees")),
        ]);

        const userItems: DcflowUser[] = usersSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;

            return {
              uid: data.uid ?? docSnap.id,
              displayName: data.displayName ?? "",
              email: data.email ?? "",
              role: data.role ?? "",
              active: data.active ?? true,
              employeeProfileId: data.employeeProfileId ?? null,
            };
          })
          .sort((a, b) =>
            (a.displayName || "").localeCompare(b.displayName || "")
          );

        const qboItems = qboSnap.docs
          .map((docSnap) => mapQboEmployee(docSnap.id, docSnap.data()))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        setUsers(userItems);
        setQboEmployees(qboItems);
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load employee setup data."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;

    if (!displayName) {
      setDisplayName(selectedUser.displayName || "");
    }

    if (!email) {
      setEmail(selectedUser.email || "");
    }
  }, [selectedUser, displayName, email]);

  useEffect(() => {
    if (!selectedQboEmployee) return;

    setQboEmployeeId(selectedQboEmployee.qboEmployeeId);
    setQboEmployeeDisplayName(selectedQboEmployee.displayName);

    if (selectedQboEmployee.hiredDate) {
      setQboEmployeeHiredDate(selectedQboEmployee.hiredDate);

      if (!ptoEligibilityDate) {
        setPtoEligibilityDate(addOneYear(selectedQboEmployee.hiredDate));
      }
    }

    if (!displayName) {
      setDisplayName(selectedQboEmployee.displayName);
    }

    if (!email && selectedQboEmployee.email) {
      setEmail(selectedQboEmployee.email);
    }

    if (!phone && selectedQboEmployee.phone) {
      setPhone(selectedQboEmployee.phone);
    }
  }, [
    selectedQboEmployee,
    displayName,
    email,
    phone,
    ptoEligibilityDate,
  ]);

  const fieldLeadUsers = useMemo(() => {
    return users.filter((user) => {
      const role = String(user.role || "").toLowerCase();
      return role === "technician" || role === "manager" || role === "admin";
    });
  }, [users]);

  function handleLaborRoleChange(nextRole: LaborRole) {
    setLaborRole(nextRole);

    const nextFieldAssignable = isFieldRole(nextRole);
    const nextStaffCoverageEligible = isStaffCoverageRole(nextRole);

    setShowOnSchedule(true);
    setFieldAssignable(nextFieldAssignable);
    setStaffCoverageEligible(nextStaffCoverageEligible);

    if (!isSupportRole(nextRole)) {
      setDefaultPairedTechUid("");
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const nowIso = new Date().toISOString();

      const displayNameClean = displayName.trim();
      if (!displayNameClean) {
        setError("Display name is required.");
        setSaving(false);
        return;
      }

      if (isSupportRole(laborRole) && !defaultPairedTechUid.trim()) {
        setError("Helpers and apprentices should have a default paired technician.");
        setSaving(false);
        return;
      }

      const selectedUidClean = selectedUid.trim();

      const payload = stripUndefinedDeep({
        userUid: selectedUidClean ? selectedUidClean : null,

        displayName: displayNameClean,
        email: cleanString(email),
        phone: cleanString(phone),

        employmentStatus,
        laborRole,

        defaultPairedTechUid: cleanString(defaultPairedTechUid),

        showOnSchedule,
        fieldAssignable,
        staffCoverageEligible,
        defaultStaffCoverageWorkType: null,

        qboEmployeeId: cleanString(qboEmployeeId),
        qboEmployeeDisplayName: cleanString(qboEmployeeDisplayName),
        qboEmployeeHiredDate: cleanString(qboEmployeeHiredDate),
        ptoEligibilityDate: cleanString(ptoEligibilityDate),

        shirtSize: shirtSize || null,
        gearNotes: cleanString(gearNotes),

        licenseInfo: {
          licenseType,
          licenseNumber: cleanString(licenseNumber),
          issuingState: cleanString(licenseIssuingState),
          expirationDate: cleanString(licenseExpirationDate),
          notes: cleanString(licenseNotes),
        },

        driverInfo: {
          canDriveCompanyVehicle,
          driversLicenseNumber: cleanString(driversLicenseNumber),
          driversLicenseState: cleanString(driversLicenseState),
          driversLicenseExpirationDate: cleanString(
            driversLicenseExpirationDate
          ),
          insuranceApproved,
          notes: cleanString(driverNotes),
        },

        notes: cleanString(notes),

        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const ref = await addDoc(collection(db, "employeeProfiles"), payload);

      if (selectedUidClean) {
        await updateDoc(doc(db, "users", selectedUidClean), {
          employeeProfileId: ref.id,
          updatedAt: nowIso,
        });
      }

      window.location.href = `/admin/employee-profiles/${ref.id}`;
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create employee profile."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Add Employee" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1120, mx: "auto", pb: 6 }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              spacing={2}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    icon={<PersonAddAlt1RoundedIcon sx={{ fontSize: 16 }} />}
                    label="New Hire Setup"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ borderRadius: 1.5, fontWeight: 700 }}
                  />
                </Stack>

                <Typography
                  variant="h4"
                  component="h1"
                  sx={{
                    mt: 1,
                    fontWeight: 800,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Add Employee
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75, maxWidth: 760 }}
                >
                  Create the employee profile, link QuickBooks, optionally link
                  an existing DCFlow login, and set scheduling, gear, license,
                  and driver eligibility details.
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/admin/employee-profiles"
                variant="outlined"
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ borderRadius: 999, alignSelf: { xs: "flex-start", sm: "center" } }}
              >
                Back to Employees
              </Button>
            </Stack>

            {loading ? (
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <CircularProgress size={24} />
                    <Typography color="text.secondary">
                      Loading QBO employees and DCFlow users...
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}

            {!loading ? (
              <Box component="form" onSubmit={handleCreate}>
                <Stack spacing={3}>
                  <Card variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <BusinessCenterRoundedIcon color="primary" />
                            <Typography
                              variant="h6"
                              component="h2"
                              sx={{ fontWeight: 800 }}
                            >
                              QuickBooks Link
                            </Typography>
                          </Stack>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            Since the employee already exists in QBO, link that
                            record first to pull in the available payroll
                            identity details.
                          </Typography>
                        </Box>

                        <Divider />

                        <TextField
                          fullWidth
                          select
                          label="QBO Employee"
                          value={selectedQboDocId}
                          onChange={(event) =>
                            setSelectedQboDocId(event.target.value)
                          }
                          helperText="Optional, but recommended for employees already created in QuickBooks."
                        >
                          <MenuItem value="">No QBO employee linked yet</MenuItem>

                          {qboEmployees.map((employee) => (
                            <MenuItem
                              key={employee.docId}
                              value={employee.docId}
                            >
                              {employee.displayName}
                              {employee.hiredDate
                                ? ` — hired ${employee.hiredDate}`
                                : ""}
                            </MenuItem>
                          ))}
                        </TextField>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(3, minmax(0, 1fr))",
                            },
                            gap: 2,
                          }}
                        >
                          <TextField
                            label="QBO Employee ID"
                            value={qboEmployeeId}
                            onChange={(event) =>
                              setQboEmployeeId(event.target.value)
                            }
                            fullWidth
                          />

                          <TextField
                            label="QBO Display Name"
                            value={qboEmployeeDisplayName}
                            onChange={(event) =>
                              setQboEmployeeDisplayName(event.target.value)
                            }
                            fullWidth
                          />

                          <TextField
                            label="Hire Date"
                            type="date"
                            value={qboEmployeeHiredDate}
                            onChange={(event) => {
                              const nextDate = event.target.value;
                              setQboEmployeeHiredDate(nextDate);

                              if (!ptoEligibilityDate) {
                                setPtoEligibilityDate(addOneYear(nextDate));
                              }
                            }}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                          />
                        </Box>

                        <TextField
                          label="PTO Eligibility Date"
                          type="date"
                          value={ptoEligibilityDate}
                          onChange={(event) =>
                            setPtoEligibilityDate(event.target.value)
                          }
                          InputLabelProps={{ shrink: true }}
                          helperText="Defaults to one year after the hire date when available."
                          fullWidth
                        />
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <BadgeRoundedIcon color="primary" />
                            <Typography
                              variant="h6"
                              component="h2"
                              sx={{ fontWeight: 800 }}
                            >
                              DCFlow Access
                            </Typography>
                          </Stack>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            Link an existing DCFlow login account if one has
                            already been created. Login creation can still stay
                            in the access/user flow for now.
                          </Typography>
                        </Box>

                        <Divider />

                        <TextField
                          fullWidth
                          select
                          label="Existing DCFlow User"
                          value={selectedUid}
                          onChange={(event) =>
                            setSelectedUid(event.target.value)
                          }
                        >
                          <MenuItem value="">No DCFlow user linked</MenuItem>

                          {users.map((user) => (
                            <MenuItem key={user.uid} value={user.uid}>
                              {user.displayName || "Unnamed"} —{" "}
                              {user.email || "no email"} ({user.role || "no role"})
                              {user.employeeProfileId
                                ? " — already linked"
                                : ""}
                            </MenuItem>
                          ))}
                        </TextField>

                        <Alert severity="info" variant="outlined">
                          This page creates the employee profile. If the new
                          hire still needs a login, create or link the DCFlow
                          user account next.
                        </Alert>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Box>
                          <Typography
                            variant="h6"
                            component="h2"
                            sx={{ fontWeight: 800 }}
                          >
                            Employee Info
                          </Typography>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            This is the main workforce profile information.
                          </Typography>
                        </Box>

                        <Divider />

                        <TextField
                          label="Display Name"
                          value={displayName}
                          onChange={(event) =>
                            setDisplayName(event.target.value)
                          }
                          required
                          fullWidth
                        />

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(2, minmax(0, 1fr))",
                            },
                            gap: 2,
                          }}
                        >
                          <TextField
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            fullWidth
                          />

                          <TextField
                            label="Phone"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            fullWidth
                          />
                        </Box>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(2, minmax(0, 1fr))",
                            },
                            gap: 2,
                          }}
                        >
                          <FormControl fullWidth>
                            <InputLabel>Employment Status</InputLabel>
                            <Select
                              label="Employment Status"
                              value={employmentStatus}
                              onChange={(event: SelectChangeEvent) =>
                                setEmploymentStatus(
                                  event.target.value as EmploymentStatus
                                )
                              }
                            >
                              {employmentStatuses.map((status) => (
                                <MenuItem
                                  key={status.value}
                                  value={status.value}
                                >
                                  {status.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <FormControl fullWidth>
                            <InputLabel>Labor Role</InputLabel>
                            <Select
                              label="Labor Role"
                              value={laborRole}
                              onChange={(event: SelectChangeEvent) =>
                                handleLaborRoleChange(
                                  event.target.value as LaborRole
                                )
                              }
                            >
                              {laborRoles.map((roleOption) => (
                                <MenuItem
                                  key={roleOption.value}
                                  value={roleOption.value}
                                >
                                  {roleOption.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <EngineeringRoundedIcon color="primary" />
                            <Typography
                              variant="h6"
                              component="h2"
                              sx={{ fontWeight: 800 }}
                            >
                              Scheduling &amp; Field Assignment
                            </Typography>
                          </Stack>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            Controls how the employee appears in the schedule
                            and whether they can be assigned to field work.
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
                          <FormControlLabel
                            control={
                              <Switch
                                checked={showOnSchedule}
                                onChange={(event) =>
                                  setShowOnSchedule(event.target.checked)
                                }
                              />
                            }
                            label="Show on Schedule"
                          />

                          <FormControlLabel
                            control={
                              <Switch
                                checked={fieldAssignable}
                                onChange={(event) =>
                                  setFieldAssignable(event.target.checked)
                                }
                              />
                            }
                            label="Field Assignable"
                          />

                          <FormControlLabel
                            control={
                              <Switch
                                checked={staffCoverageEligible}
                                onChange={(event) =>
                                  setStaffCoverageEligible(event.target.checked)
                                }
                              />
                            }
                            label="Staff Coverage Eligible"
                          />
                        </Box>

                        {isSupportRole(laborRole) ? (
                          <TextField
                            fullWidth
                            select
                            label="Default Paired Technician"
                            value={defaultPairedTechUid}
                            onChange={(event) =>
                              setDefaultPairedTechUid(event.target.value)
                            }
                            helperText="Used as the normal pairing. Actual trip crews can still be adjusted."
                          >
                            <MenuItem value="">
                              No default technician selected
                            </MenuItem>

                            {fieldLeadUsers.map((user) => (
                              <MenuItem key={user.uid} value={user.uid}>
                                {user.displayName || "Unnamed"} —{" "}
                                {user.email || "no email"}
                              </MenuItem>
                            ))}
                          </TextField>
                        ) : (
                          <Alert severity="info" variant="outlined">
                            Default paired technician is only required for
                            helpers and apprentices.
                          </Alert>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>

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
                    <Card variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Box>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              <CheckroomRoundedIcon color="primary" />
                              <Typography
                                variant="h6"
                                component="h2"
                                sx={{ fontWeight: 800 }}
                              >
                                Company Gear
                              </Typography>
                            </Stack>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Store shirt size and gear notes for ordering.
                            </Typography>
                          </Box>

                          <Divider />

                          <TextField
                            fullWidth
                            select
                            label="Shirt Size"
                            value={shirtSize}
                            onChange={(event) =>
                              setShirtSize(event.target.value as ShirtSize | "")
                            }
                          >
                            <MenuItem value="">No size selected</MenuItem>

                            {shirtSizeOptions.map((size) => (
                              <MenuItem key={size} value={size}>
                                {size}
                              </MenuItem>
                            ))}
                          </TextField>

                          <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            label="Gear Notes"
                            value={gearNotes}
                            onChange={(event) =>
                              setGearNotes(event.target.value)
                            }
                            placeholder="Example: prefers tall shirts, hoodie size is different, etc."
                          />
                        </Stack>
                      </CardContent>
                    </Card>

                    <Card variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Box>
                            <Typography
                              variant="h6"
                              component="h2"
                              sx={{ fontWeight: 800 }}
                            >
                              Plumbing License Info
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Track license or registration details where
                              applicable.
                            </Typography>
                          </Box>

                          <Divider />

                          <TextField
                            fullWidth
                            select
                            label="License Type"
                            value={licenseType}
                            onChange={(event) =>
                              setLicenseType(
                                event.target.value as PlumbingLicenseType
                              )
                            }
                          >
                            {licenseTypeOptions.map((option) => (
                              <MenuItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </MenuItem>
                            ))}
                          </TextField>

                          <TextField
                            fullWidth
                            label="License Number"
                            value={licenseNumber}
                            onChange={(event) =>
                              setLicenseNumber(event.target.value)
                            }
                            disabled={licenseType === "none"}
                          />

                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: {
                                xs: "1fr",
                                sm: "repeat(2, minmax(0, 1fr))",
                              },
                              gap: 2,
                            }}
                          >
                            <TextField
                              fullWidth
                              label="Issuing State"
                              value={licenseIssuingState}
                              onChange={(event) =>
                                setLicenseIssuingState(event.target.value)
                              }
                              disabled={licenseType === "none"}
                            />

                            <TextField
                              fullWidth
                              label="Expiration Date"
                              type="date"
                              value={licenseExpirationDate}
                              onChange={(event) =>
                                setLicenseExpirationDate(event.target.value)
                              }
                              disabled={licenseType === "none"}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Box>

                          <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            label="License Notes"
                            value={licenseNotes}
                            onChange={(event) =>
                              setLicenseNotes(event.target.value)
                            }
                            disabled={licenseType === "none"}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  </Box>

                  <Card variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <DirectionsCarRoundedIcon color="primary" />
                            <Typography
                              variant="h6"
                              component="h2"
                              sx={{ fontWeight: 800 }}
                            >
                              Driver / Vehicle Eligibility
                            </Typography>
                          </Stack>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            Track whether this employee can be assigned a
                            company vehicle in the future.
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
                            gap: 2,
                          }}
                        >
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={canDriveCompanyVehicle}
                                onChange={(event) =>
                                  setCanDriveCompanyVehicle(
                                    event.target.checked
                                  )
                                }
                              />
                            }
                            label="Can Drive Company Vehicle"
                          />

                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={insuranceApproved}
                                onChange={(event) =>
                                  setInsuranceApproved(event.target.checked)
                                }
                                disabled={!canDriveCompanyVehicle}
                              />
                            }
                            label="Insurance Approved"
                          />
                        </Box>

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
                          <TextField
                            fullWidth
                            label="Driver License Number"
                            value={driversLicenseNumber}
                            onChange={(event) =>
                              setDriversLicenseNumber(event.target.value)
                            }
                            disabled={!canDriveCompanyVehicle}
                          />

                          <TextField
                            fullWidth
                            label="Driver License State"
                            value={driversLicenseState}
                            onChange={(event) =>
                              setDriversLicenseState(event.target.value)
                            }
                            disabled={!canDriveCompanyVehicle}
                          />

                          <TextField
                            fullWidth
                            label="Driver License Expiration"
                            type="date"
                            value={driversLicenseExpirationDate}
                            onChange={(event) =>
                              setDriversLicenseExpirationDate(
                                event.target.value
                              )
                            }
                            disabled={!canDriveCompanyVehicle}
                            InputLabelProps={{ shrink: true }}
                          />
                        </Box>

                        <TextField
                          fullWidth
                          multiline
                          minRows={3}
                          label="Driver Notes"
                          value={driverNotes}
                          onChange={(event) =>
                            setDriverNotes(event.target.value)
                          }
                          disabled={!canDriveCompanyVehicle}
                          placeholder="Example: approved for service trucks only, needs insurance review, etc."
                        />
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Typography
                          variant="h6"
                          component="h2"
                          sx={{ fontWeight: 800 }}
                        >
                          Notes
                        </Typography>

                        <Divider />

                        <TextField
                          fullWidth
                          multiline
                          minRows={4}
                          label="Employee Notes"
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                        />
                      </Stack>
                    </CardContent>
                  </Card>

                  <Stack
                    direction={{ xs: "column-reverse", sm: "row" }}
                    justifyContent="flex-end"
                    spacing={1.5}
                  >
                    <Button
                      component={Link}
                      href="/admin/employee-profiles"
                      variant="text"
                      disabled={saving}
                      sx={{ borderRadius: 999 }}
                    >
                      Cancel
                    </Button>

                    <Button
                      type="submit"
                      variant="contained"
                      disabled={saving}
                      sx={{
                        borderRadius: 999,
                        minWidth: 180,
                      }}
                    >
                      {saving ? "Creating..." : "Create Employee"}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}