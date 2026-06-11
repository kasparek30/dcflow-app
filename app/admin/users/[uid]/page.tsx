// app/admin/users/[uid]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
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
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type {
  AppUser,
  AppUserRole,
  LaborRoleType,
} from "../../../../src/types/app-user";

type Props = {
  params: Promise<{ uid: string }>;
};

type DirectoryUser = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUserRole;
  preferredTechnicianId: string | null;
};

type TechnicianOption = {
  uid: string;
  displayName: string;
};

type ShirtSize =
  | "XS"
  | "S"
  | "M"
  | "L"
  | "XL"
  | "2XL"
  | "3XL"
  | "4XL"
  | "5XL"
  | "LT"
  | "XLT"
  | "2XLT"
  | "3XLT"
  | "4XLT";

type PlumbingLicenseType =
  | "none"
  | "apprentice"
  | "tradesman"
  | "journeyman"
  | "master"
  | "other";

const ROLE_OPTIONS: AppUserRole[] = [
  "admin",
  "dispatcher",
  "manager",
  "billing",
  "technician",
  "helper",
  "apprentice",
  "office_display",
];

const ROLE_LABELS: Record<AppUserRole, string> = {
  admin: "Admin",
  dispatcher: "Dispatcher",
  manager: "Manager",
  billing: "Billing",
  technician: "Technician",
  helper: "Helper",
  apprentice: "Apprentice",
  office_display: "Office Display",
};

const ROLE_DESCRIPTIONS: Record<AppUserRole, string> = {
  admin: "Full application administration and office access.",
  dispatcher: "Scheduling, dispatch, customer, and service ticket operations.",
  manager: "Operational oversight with intentional field assignment capability.",
  billing: "Billing and invoice workflow access.",
  technician: "Lead field worker who can be assigned service and project trips.",
  helper: "Support field worker typically paired with a technician.",
  apprentice: "Support field worker typically paired with a technician.",
  office_display: "Display-only office access for shared operational screens.",
};

const LABOR_ROLE_LABELS: Record<LaborRoleType, string> = {
  lead_field: "Lead Field Labor",
  support_field: "Support Field Labor",
  office: "Office / Administrative",
};

const SHIRT_SIZE_OPTIONS: ShirtSize[] = [
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

const LICENSE_TYPE_LABELS: Record<PlumbingLicenseType, string> = {
  none: "No License / Not Tracked",
  apprentice: "Apprentice",
  tradesman: "Tradesman",
  journeyman: "Journeyman",
  master: "Master Plumber",
  other: "Other",
};

const LICENSE_TYPE_OPTIONS: PlumbingLicenseType[] = [
  "none",
  "apprentice",
  "tradesman",
  "journeyman",
  "master",
  "other",
];

function isSupportRole(role: AppUserRole) {
  return role === "helper" || role === "apprentice";
}

function getLaborRoleTypeForRole(role: AppUserRole): LaborRoleType {
  if (role === "technician") {
    return "lead_field";
  }

  if (isSupportRole(role)) {
    return "support_field";
  }

  return "office";
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default function AdminUserDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [uid, setUid] = useState("");
  const [userDoc, setUserDoc] = useState<AppUser | null>(null);

  const [techOptions, setTechOptions] = useState<TechnicianOption[]>([]);
  const [supportUsers, setSupportUsers] = useState<DirectoryUser[]>([]);

  const [role, setRole] = useState<AppUserRole>("technician");
  const [holidayEligible, setHolidayEligible] = useState(true);
  const [defaultDailyHolidayHours, setDefaultDailyHolidayHours] =
    useState<number>(8);
  const [preferredTechnicianId, setPreferredTechnicianId] = useState("");

  const [shirtSize, setShirtSize] = useState<ShirtSize | "">("");
  const [gearNotes, setGearNotes] = useState("");

  const [licenseType, setLicenseType] =
    useState<PlumbingLicenseType>("none");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseIssuingState, setLicenseIssuingState] = useState("TX");
  const [licenseExpirationDate, setLicenseExpirationDate] = useState("");
  const [licenseNotes, setLicenseNotes] = useState("");

  const [canDriveCompanyVehicle, setCanDriveCompanyVehicle] = useState(false);
  const [driversLicenseNumber, setDriversLicenseNumber] = useState("");
  const [driversLicenseState, setDriversLicenseState] = useState("TX");
  const [driversLicenseExpirationDate, setDriversLicenseExpirationDate] =
    useState("");
  const [insuranceApproved, setInsuranceApproved] = useState(false);
  const [driverNotes, setDriverNotes] = useState("");

  const supportRole = isSupportRole(role);
  const calculatedLaborRoleType = getLaborRoleTypeForRole(role);

  const preferredTechName = useMemo(() => {
    const match = techOptions.find(
      (technician) => technician.uid === preferredTechnicianId
    );

    return match?.displayName ?? "";
  }, [preferredTechnicianId, techOptions]);

  const otherSupportUsersAssignedToPreferredTech = useMemo(() => {
    if (!preferredTechnicianId) {
      return [];
    }

    return supportUsers.filter(
      (supportUser) =>
        supportUser.uid !== uid &&
        supportUser.preferredTechnicianId === preferredTechnicianId
    );
  }, [preferredTechnicianId, supportUsers, uid]);

  const futurePreferredCrewNames = useMemo(() => {
    if (!supportRole || !preferredTechnicianId || !userDoc) {
      return [];
    }

    return [
      userDoc.displayName,
      ...otherSupportUsersAssignedToPreferredTech.map(
        (supportUser) => supportUser.displayName
      ),
    ];
  }, [
    otherSupportUsersAssignedToPreferredTech,
    preferredTechnicianId,
    supportRole,
    userDoc,
  ]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const resolved = await params;
        setUid(resolved.uid);

        const [userSnap, usersSnap] = await Promise.all([
          getDoc(doc(db, "users", resolved.uid)),
          getDocs(query(collection(db, "users"), orderBy("displayName"))),
        ]);

        const directoryUsers: DirectoryUser[] = usersSnap.docs.map(
          (snapshot) => {
            const data = snapshot.data();

            return {
              uid: data.uid ?? snapshot.id,
              displayName: data.displayName ?? "Unnamed User",
              active: data.active ?? false,
              role: (data.role ?? "technician") as AppUserRole,
              preferredTechnicianId: data.preferredTechnicianId ?? null,
            };
          }
        );

        const activeTechnicians: TechnicianOption[] = directoryUsers
          .filter(
            (directoryUser) =>
              directoryUser.role === "technician" && directoryUser.active
          )
          .map((directoryUser) => ({
            uid: directoryUser.uid,
            displayName: directoryUser.displayName,
          }));

        const activeSupportUsers = directoryUsers.filter(
          (directoryUser) =>
            directoryUser.active && isSupportRole(directoryUser.role)
        );

        setTechOptions(activeTechnicians);
        setSupportUsers(activeSupportUsers);

        if (!userSnap.exists()) {
          setError("User document not found.");
          return;
        }

        const data = userSnap.data();
        const loadedLicenseInfo = data.licenseInfo ?? {};
        const loadedDriverInfo = data.driverInfo ?? {};

        const loadedUser: AppUser = {
          uid: data.uid ?? userSnap.id,
          displayName: data.displayName ?? "—",
          email: data.email ?? "—",
          role: (data.role ?? "technician") as AppUserRole,
          active: data.active ?? false,
          laborRoleType: data.laborRoleType ?? undefined,
          preferredTechnicianId: data.preferredTechnicianId ?? null,
          preferredTechnicianName: data.preferredTechnicianName ?? null,
          holidayEligible:
            typeof data.holidayEligible === "boolean"
              ? data.holidayEligible
              : undefined,
          defaultDailyHolidayHours:
            typeof data.defaultDailyHolidayHours === "number"
              ? data.defaultDailyHolidayHours
              : undefined,
        };

        setUserDoc(loadedUser);
        setRole(loadedUser.role);
        setHolidayEligible(
          typeof loadedUser.holidayEligible === "boolean"
            ? loadedUser.holidayEligible
            : true
        );
        setDefaultDailyHolidayHours(
          typeof loadedUser.defaultDailyHolidayHours === "number"
            ? loadedUser.defaultDailyHolidayHours
            : 8
        );
        setPreferredTechnicianId(
          loadedUser.preferredTechnicianId ?? ""
        );

        setShirtSize((data.shirtSize ?? "") as ShirtSize | "");
        setGearNotes(data.gearNotes ?? "");

        setLicenseType(
          (loadedLicenseInfo.licenseType ?? "none") as PlumbingLicenseType
        );
        setLicenseNumber(loadedLicenseInfo.licenseNumber ?? "");
        setLicenseIssuingState(loadedLicenseInfo.issuingState ?? "TX");
        setLicenseExpirationDate(loadedLicenseInfo.expirationDate ?? "");
        setLicenseNotes(loadedLicenseInfo.notes ?? "");

        setCanDriveCompanyVehicle(
          typeof loadedDriverInfo.canDriveCompanyVehicle === "boolean"
            ? loadedDriverInfo.canDriveCompanyVehicle
            : false
        );
        setDriversLicenseNumber(loadedDriverInfo.driversLicenseNumber ?? "");
        setDriversLicenseState(loadedDriverInfo.driversLicenseState ?? "TX");
        setDriversLicenseExpirationDate(
          loadedDriverInfo.driversLicenseExpirationDate ?? ""
        );
        setInsuranceApproved(
          typeof loadedDriverInfo.insuranceApproved === "boolean"
            ? loadedDriverInfo.insuranceApproved
            : false
        );
        setDriverNotes(loadedDriverInfo.notes ?? "");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load user."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userDoc) {
      return;
    }

    setError("");
    setSaveMsg("");
    setSaving(true);

    try {
      const preferredId = supportRole
        ? preferredTechnicianId || null
        : null;

      const preferredName = supportRole
        ? preferredTechName || null
        : null;

      await updateDoc(doc(db, "users", userDoc.uid), {
        role,
        laborRoleType: calculatedLaborRoleType,
        holidayEligible,
        defaultDailyHolidayHours,
        preferredTechnicianId: preferredId,
        preferredTechnicianName: preferredName,

        shirtSize: shirtSize || null,
        gearNotes: gearNotes.trim() || null,

        licenseInfo: {
          licenseType,
          licenseNumber: licenseNumber.trim() || null,
          issuingState: licenseIssuingState.trim() || null,
          expirationDate: licenseExpirationDate || null,
          notes: licenseNotes.trim() || null,
        },

        driverInfo: {
          canDriveCompanyVehicle,
          driversLicenseNumber: driversLicenseNumber.trim() || null,
          driversLicenseState: driversLicenseState.trim() || null,
          driversLicenseExpirationDate: driversLicenseExpirationDate || null,
          insuranceApproved,
          notes: driverNotes.trim() || null,
        },

        updatedAt: new Date().toISOString(),
      });

      const updatedUser: AppUser = {
        ...userDoc,
        role,
        laborRoleType: calculatedLaborRoleType,
        holidayEligible,
        defaultDailyHolidayHours,
        preferredTechnicianId: preferredId,
        preferredTechnicianName: preferredName,
      };

      setUserDoc(updatedUser);

      setSupportUsers((currentSupportUsers) => {
        const remainingSupportUsers = currentSupportUsers.filter(
          (supportUser) => supportUser.uid !== updatedUser.uid
        );

        if (!updatedUser.active || !supportRole) {
          return remainingSupportUsers;
        }

        return [
          ...remainingSupportUsers,
          {
            uid: updatedUser.uid,
            displayName: updatedUser.displayName,
            active: updatedUser.active,
            role: updatedUser.role,
            preferredTechnicianId: preferredId,
          },
        ];
      });

      setSaveMsg("User settings saved successfully.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save user."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Edit User">
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
                  User Profile
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Manage DCFlow role, regular crew pairing, holiday pay,
                  company gear, license info, and driving eligibility.
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/admin/users"
                variant="outlined"
                size="large"
                sx={{
                  borderRadius: 999,
                  alignSelf: { xs: "flex-start", sm: "center" },
                  whiteSpace: "nowrap",
                }}
              >
                Back to Users
              </Button>
            </Stack>

            {loading ? (
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 4,
                }}
              >
                <CardContent sx={{ py: 7 }}>
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <CircularProgress size={26} />
                    <Typography color="text.secondary">
                      Loading user profile...
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}

            {!loading && !error && userDoc ? (
              <>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 1,
                    overflow: "hidden",
                  }}
                >
                  <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2.5}
                      alignItems={{ xs: "flex-start", sm: "center" }}
                    >
                      <Avatar
                        sx={{
                          width: 64,
                          height: 64,
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          fontWeight: 700,
                          fontSize: "1.35rem",
                        }}
                      >
                        {getInitials(userDoc.displayName)}
                      </Avatar>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="h5"
                          component="h2"
                          sx={{ fontWeight: 700 }}
                        >
                          {userDoc.displayName}
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mt: 0.25,
                            wordBreak: "break-word",
                          }}
                        >
                          {userDoc.email}
                        </Typography>

                        <Stack
                          direction="row"
                          spacing={1}
                          useFlexGap
                          flexWrap="wrap"
                          sx={{ mt: 1.5 }}
                        >
                          <Chip
                            label={ROLE_LABELS[userDoc.role]}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />

                          <Chip
                            label={userDoc.active ? "Active Access" : "Inactive"}
                            size="small"
                            color={userDoc.active ? "success" : "default"}
                            variant="filled"
                          />

                          {userDoc.laborRoleType ? (
                            <Chip
                              label={LABOR_ROLE_LABELS[userDoc.laborRoleType]}
                              size="small"
                              variant="outlined"
                            />
                          ) : null}

                          {shirtSize ? (
                            <Chip
                              label={`Shirt: ${shirtSize}`}
                              size="small"
                              variant="outlined"
                            />
                          ) : null}

                          {licenseType !== "none" ? (
                            <Chip
                              label={LICENSE_TYPE_LABELS[licenseType]}
                              size="small"
                              color="secondary"
                              variant="outlined"
                            />
                          ) : null}

                          {canDriveCompanyVehicle ? (
                            <Chip
                              label={
                                insuranceApproved
                                  ? "Approved Driver"
                                  : "Driver Review Needed"
                              }
                              size="small"
                              color={insuranceApproved ? "success" : "warning"}
                              variant="outlined"
                            />
                          ) : null}
                        </Stack>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                {saveMsg ? <Alert severity="success">{saveMsg}</Alert> : null}

                <Box component="form" onSubmit={handleSave}>
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
                      sx={{
                        borderRadius: 1,
                        height: "100%",
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
                              Role &amp; Access
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Controls the user&apos;s operational role in
                              DCFlow.
                            </Typography>
                          </Box>

                          <Divider />

                          <FormControl fullWidth>
                            <InputLabel id="dcflow-role-label">
                              DCFlow Role
                            </InputLabel>

                            <Select
                              labelId="dcflow-role-label"
                              label="DCFlow Role"
                              value={role}
                              onChange={(event) =>
                                setRole(event.target.value as AppUserRole)
                              }
                            >
                              {ROLE_OPTIONS.map((roleOption) => (
                                <MenuItem key={roleOption} value={roleOption}>
                                  {ROLE_LABELS[roleOption]}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              bgcolor: "action.hover",
                              borderRadius: 3,
                              p: 1.75,
                            }}
                          >
                            {ROLE_DESCRIPTIONS[role]}
                          </Typography>

                          <TextField
                            fullWidth
                            label="Labor Classification"
                            value={LABOR_ROLE_LABELS[calculatedLaborRoleType]}
                            InputProps={{
                              readOnly: true,
                            }}
                            helperText="Automatically determined from the selected DCFlow role."
                          />
                        </Stack>
                      </CardContent>
                    </Card>

                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 1,
                        height: "100%",
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
                              Regular Crew Pairing
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Sets the usual technician relationship for
                              helpers and apprentices.
                            </Typography>
                          </Box>

                          <Divider />

                          {supportRole ? (
                            <>
                              <TextField
                                fullWidth
                                select
                                label="Preferred Technician"
                                value={preferredTechnicianId}
                                onChange={(event) =>
                                  setPreferredTechnicianId(event.target.value)
                                }
                                helperText="This is the normal pairing only. Each trip still controls its actual assigned crew."
                              >
                                <MenuItem value="">
                                  No default technician selected
                                </MenuItem>

                                {techOptions.map((technician) => (
                                  <MenuItem
                                    key={technician.uid}
                                    value={technician.uid}
                                  >
                                    {technician.displayName}
                                  </MenuItem>
                                ))}
                              </TextField>

                              {preferredTechnicianId && preferredTechName ? (
                                <Box
                                  sx={{
                                    bgcolor: "action.hover",
                                    borderRadius: 1,
                                    p: 2,
                                  }}
                                >
                                  <Stack spacing={1}>
                                    <Stack
                                      direction="row"
                                      spacing={1}
                                      useFlexGap
                                      flexWrap="wrap"
                                      alignItems="center"
                                    >
                                      <Typography
                                        variant="subtitle2"
                                        sx={{ fontWeight: 700 }}
                                      >
                                        {preferredTechName}&apos;s regular
                                        support crew
                                      </Typography>

                                      <Chip
                                        size="small"
                                        color="primary"
                                        label={`${futurePreferredCrewNames.length} ${
                                          futurePreferredCrewNames.length === 1
                                            ? "person"
                                            : "people"
                                        }`}
                                      />
                                    </Stack>

                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      {futurePreferredCrewNames.join(", ")}
                                    </Typography>

                                    {otherSupportUsersAssignedToPreferredTech.length >
                                    0 ? (
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                      >
                                        This technician already has another
                                        active helper/apprentice pairing. That
                                        is allowed and does not automatically
                                        assign both workers to every trip.
                                      </Typography>
                                    ) : (
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                      >
                                        This will be the technician&apos;s
                                        only active default helper/apprentice
                                        pairing.
                                      </Typography>
                                    )}
                                  </Stack>
                                </Box>
                              ) : (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    bgcolor: "action.hover",
                                    borderRadius: 3,
                                    p: 1.75,
                                  }}
                                >
                                  No regular technician pairing is currently
                                  selected.
                                </Typography>
                              )}
                            </>
                          ) : (
                            <Box
                              sx={{
                                bgcolor: "action.hover",
                                borderRadius: 3,
                                p: 2,
                              }}
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Preferred technician pairing only applies to
                                users with the Helper or Apprentice role.
                              </Typography>
                            </Box>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>

                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 1,
                        height: "100%",
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
                              Company Gear
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Stores shirt size and gear notes for company
                              apparel orders.
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
                            helperText="Used when ordering company shirts, hoodies, and gear."
                          >
                            <MenuItem value="">No size selected</MenuItem>

                            {SHIRT_SIZE_OPTIONS.map((size) => (
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
                            placeholder="Example: prefers tall shirts, hoodie size is different, needs long sleeves, etc."
                          />
                        </Stack>
                      </CardContent>
                    </Card>

                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 1,
                        height: "100%",
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
                              Plumbing License Info
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Tracks license or registration info for
                              apprentices, tradesmen, journeymen, and master
                              plumbers.
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
                            {LICENSE_TYPE_OPTIONS.map((type) => (
                              <MenuItem key={type} value={type}>
                                {LICENSE_TYPE_LABELS[type]}
                              </MenuItem>
                            ))}
                          </TextField>

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
                              label="License Number"
                              value={licenseNumber}
                              onChange={(event) =>
                                setLicenseNumber(event.target.value)
                              }
                              disabled={licenseType === "none"}
                            />

                            <TextField
                              fullWidth
                              label="Issuing State"
                              value={licenseIssuingState}
                              onChange={(event) =>
                                setLicenseIssuingState(event.target.value)
                              }
                              disabled={licenseType === "none"}
                              placeholder="TX"
                            />
                          </Box>

                          <TextField
                            fullWidth
                            label="Expiration Date"
                            type="date"
                            value={licenseExpirationDate}
                            onChange={(event) =>
                              setLicenseExpirationDate(event.target.value)
                            }
                            disabled={licenseType === "none"}
                            InputLabelProps={{
                              shrink: true,
                            }}
                            helperText="Leave blank if there is no expiration date to track."
                          />

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
                            placeholder="Example: renewal submitted, waiting on card, license held in another state, etc."
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
                              Driver / Vehicle Eligibility
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Tracks whether this employee can be assigned a
                              company vehicle. Vehicle mileage, oil changes,
                              and year-end tax mileage should live on dedicated
                              vehicle records later.
                            </Typography>
                          </Box>

                          <Divider />

                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={3}
                            alignItems={{ xs: "stretch", sm: "center" }}
                          >
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={canDriveCompanyVehicle}
                                  onChange={(event) =>
                                    setCanDriveCompanyVehicle(
                                      event.target.checked
                                    )
                                  }
                                />
                              }
                              label={
                                canDriveCompanyVehicle
                                  ? "Can Drive Company Vehicle"
                                  : "Cannot Drive Company Vehicle"
                              }
                              sx={{ flex: 1, m: 0 }}
                            />

                            <FormControlLabel
                              control={
                                <Switch
                                  checked={insuranceApproved}
                                  disabled={!canDriveCompanyVehicle}
                                  onChange={(event) =>
                                    setInsuranceApproved(event.target.checked)
                                  }
                                />
                              }
                              label={
                                insuranceApproved
                                  ? "Insurance Approved"
                                  : "Insurance Not Approved"
                              }
                              sx={{ flex: 1, m: 0 }}
                            />
                          </Stack>

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
                              label="License State"
                              value={driversLicenseState}
                              onChange={(event) =>
                                setDriversLicenseState(event.target.value)
                              }
                              disabled={!canDriveCompanyVehicle}
                              placeholder="TX"
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
                              InputLabelProps={{
                                shrink: true,
                              }}
                            />
                          </Box>

                          <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            label="Driver / Vehicle Notes"
                            value={driverNotes}
                            onChange={(event) =>
                              setDriverNotes(event.target.value)
                            }
                            disabled={!canDriveCompanyVehicle}
                            placeholder="Example: approved for service trucks only, needs insurance review, do not assign trailer, etc."
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
                              Holiday Pay Settings
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              Manage eligibility and default paid holiday
                              hours for this user.
                            </Typography>
                          </Box>

                          <Divider />

                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={3}
                            alignItems={{ xs: "stretch", sm: "center" }}
                          >
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={holidayEligible}
                                  onChange={(event) =>
                                    setHolidayEligible(event.target.checked)
                                  }
                                />
                              }
                              label={
                                holidayEligible
                                  ? "Eligible for Holiday Pay"
                                  : "Not Eligible for Holiday Pay"
                              }
                              sx={{ flex: 1, m: 0 }}
                            />

                            <TextField
                              label="Default Daily Holiday Hours"
                              type="number"
                              value={defaultDailyHolidayHours}
                              disabled={!holidayEligible}
                              onChange={(event) =>
                                setDefaultDailyHolidayHours(
                                  Number(event.target.value)
                                )
                              }
                              inputProps={{
                                min: 0,
                                step: 0.25,
                              }}
                              helperText={
                                holidayEligible
                                  ? "Common value is 8.0 hours."
                                  : "Enable holiday pay to edit hours."
                              }
                              sx={{
                                width: { xs: "100%", sm: 280 },
                              }}
                            />
                          </Stack>
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
                      href="/admin/users"
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
                        minWidth: 150,
                      }}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </Stack>
                </Box>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}