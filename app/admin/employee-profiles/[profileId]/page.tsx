"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import WorkHistoryRoundedIcon from "@mui/icons-material/WorkHistoryRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";
import type {
  EmployeeProfile,
  EmploymentStatus,
  LaborRole,
} from "../../../../src/types/employee-profile";

type DcflowUser = {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean;
};

type QboEmployeeDoc = {
  id: string;
  qboEmployeeId?: string;
  displayName?: string;
  email?: string;
  hiredDate?: string;
  releasedDate?: string;
  active?: boolean;
};

type PageProps = {
  params: Promise<{ profileId: string }>;
};

const laborRoles: LaborRole[] = [
  "technician",
  "helper",
  "apprentice",
  "dispatcher",
  "billing",
  "admin",
  "manager",
  "other",
];

const employmentStatuses: EmploymentStatus[] = [
  "current",
  "inactive",
  "seasonal",
];

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(dateIso: string, days: number): string {
  const dt = new Date(`${dateIso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIsoDate(dt);
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
            color: "primary.light",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontSize: { xs: "1rem", md: "1.05rem" },
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {title}
          </Typography>

          {subtitle ? (
            <Typography
              sx={{
                mt: 0.4,
                color: "text.secondary",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Stack>
  );
}

export default function EmployeeProfileDetailPage({ params }: PageProps) {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [profileId, setProfileId] = useState("");
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);

  const [users, setUsers] = useState<DcflowUser[]>([]);
  const [qboEmployees, setQboEmployees] = useState<QboEmployeeDoc[]>([]);
  const [qboLoading, setQboLoading] = useState(true);
  const [showInactiveQbo, setShowInactiveQbo] = useState(false);

  const [error, setError] = useState("");

  const [userUid, setUserUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [employmentStatus, setEmploymentStatus] =
    useState<EmploymentStatus>("current");
  const [laborRole, setLaborRole] = useState<LaborRole>("technician");
  const [defaultPairedTechUid, setDefaultPairedTechUid] = useState("");
  const [notes, setNotes] = useState("");

  const [selectedQboId, setSelectedQboId] = useState("");
  const [linkingQbo, setLinkingQbo] = useState(false);
  const [qboLinkError, setQboLinkError] = useState("");
  const [qboLinkMsg, setQboLinkMsg] = useState("");

  const selectedUser = useMemo(
    () => users.find((u) => u.uid === userUid),
    [users, userUid]
  );

  const techUsers = useMemo(() => {
    return users.filter((u) => {
      const role = String(u.role || "").toLowerCase();
      return role === "technician" || role === "admin";
    });
  }, [users]);

  const filteredQboEmployees = useMemo(() => {
    if (showInactiveQbo) return qboEmployees;
    return qboEmployees.filter((e) => e.active !== false);
  }, [qboEmployees, showInactiveQbo]);

  const selectedQbo = useMemo(() => {
    const target = selectedQboId.trim();
    if (!target) return null;
    return qboEmployees.find((e) => e.id === target) || null;
  }, [selectedQboId, qboEmployees]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const resolved = await params;
        const id = resolved.profileId;
        setProfileId(id);

        const ref = doc(db, "employeeProfiles", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Employee profile not found.");
          setLoading(false);
          return;
        }

        const d = snap.data();

        const item: EmployeeProfile = {
          id: snap.id,
          userUid: d.userUid ?? undefined,
          displayName: d.displayName ?? "",
          email: d.email ?? undefined,
          phone: d.phone ?? undefined,
          employmentStatus: (d.employmentStatus ?? "current") as EmploymentStatus,
          laborRole: (d.laborRole ?? "other") as LaborRole,
          defaultPairedTechUid: d.defaultPairedTechUid ?? undefined,
          qboEmployeeId: d.qboEmployeeId ?? undefined,
          qboEmployeeDisplayName: d.qboEmployeeDisplayName ?? undefined,
          qboEmployeeHiredDate: d.qboEmployeeHiredDate ?? undefined,
          ptoEligibilityDate: d.ptoEligibilityDate ?? undefined,
          notes: d.notes ?? undefined,
          createdAt: d.createdAt ?? "",
          updatedAt: d.updatedAt ?? "",
        };

        setProfile(item);

        setUserUid(item.userUid || "");
        setDisplayName(item.displayName);
        setEmail(item.email || "");
        setPhone(item.phone || "");
        setEmploymentStatus(item.employmentStatus);
        setLaborRole(item.laborRole);
        setDefaultPairedTechUid(item.defaultPairedTechUid || "");
        setNotes(item.notes || "");

        const qUsers = query(collection(db, "users"), orderBy("displayName"));
        const snapUsers = await getDocs(qUsers);

        const userItems: DcflowUser[] = snapUsers.docs.map((docSnap) => {
          const u = docSnap.data();
          return {
            uid: docSnap.id,
            displayName: u.displayName ?? "",
            email: u.email ?? "",
            role: u.role ?? "",
            active: u.active ?? true,
          };
        });

        setUsers(userItems);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load employee profile."
        );
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [params]);

  useEffect(() => {
    async function loadQboEmployees() {
      setQboLoading(true);
      try {
        const q = query(collection(db, "qboEmployees"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: QboEmployeeDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            qboEmployeeId: d.qboEmployeeId ?? docSnap.id,
            displayName: d.displayName ?? "",
            email: d.email ?? "",
            hiredDate: d.hiredDate ?? "",
            releasedDate: d.releasedDate ?? "",
            active: typeof d.active === "boolean" ? d.active : true,
          };
        });

        setQboEmployees(items);
      } finally {
        setQboLoading(false);
      }
    }

    loadQboEmployees();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    if (!displayName) setDisplayName(selectedUser.displayName || "");
    if (!email) setEmail(selectedUser.email || "");
  }, [selectedUser, displayName, email]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError("");

    try {
      const nowIso = new Date().toISOString();

      const payload = {
        userUid: userUid.trim() ? userUid.trim() : null,
        displayName: displayName.trim(),
        email: email.trim() ? email.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
        employmentStatus,
        laborRole,
        defaultPairedTechUid: defaultPairedTechUid.trim()
          ? defaultPairedTechUid.trim()
          : null,
        notes: notes.trim() ? notes.trim() : null,
        updatedAt: nowIso,
      };

      if (!payload.displayName) {
        setError("Display name is required.");
        setSaving(false);
        return;
      }

      await updateDoc(doc(db, "employeeProfiles", profile.id), payload);

      setProfile({
        ...profile,
        userUid: payload.userUid || undefined,
        displayName: payload.displayName,
        email: payload.email || undefined,
        phone: payload.phone || undefined,
        employmentStatus: payload.employmentStatus as EmploymentStatus,
        laborRole: payload.laborRole as LaborRole,
        defaultPairedTechUid: payload.defaultPairedTechUid || undefined,
        notes: payload.notes || undefined,
        updatedAt: payload.updatedAt,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save employee profile."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!profile) return;
    const ok = window.confirm("Delete this employee profile? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    setError("");

    try {
      await deleteDoc(doc(db, "employeeProfiles", profile.id));
      window.location.href = "/admin/employee-profiles";
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete employee profile."
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleLinkQbo() {
    if (!profile) return;

    setLinkingQbo(true);
    setQboLinkError("");
    setQboLinkMsg("");

    try {
      const qboId = selectedQboId.trim();
      if (!qboId) {
        setQboLinkError("Select a QuickBooks employee first.");
        setLinkingQbo(false);
        return;
      }

      const match = qboEmployees.find((e) => e.id === qboId);
      if (!match) {
        setQboLinkError("Selected QuickBooks employee not found.");
        setLinkingQbo(false);
        return;
      }

      const hiredDate = match.hiredDate || "";
      const eligibilityDate = hiredDate ? addDaysIso(hiredDate, 365) : "";
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "employeeProfiles", profile.id), {
        qboEmployeeId: match.id,
        qboEmployeeDisplayName: match.displayName || null,
        qboEmployeeHiredDate: hiredDate || null,
        ptoEligibilityDate: eligibilityDate || null,
        updatedAt: nowIso,
      });

      setProfile({
        ...profile,
        qboEmployeeId: match.id,
        qboEmployeeDisplayName: match.displayName || undefined,
        qboEmployeeHiredDate: hiredDate || undefined,
        ptoEligibilityDate: eligibilityDate || undefined,
        updatedAt: nowIso,
      });

      setQboLinkMsg("QuickBooks employee linked successfully.");
    } catch (err: unknown) {
      setQboLinkError(
        err instanceof Error
          ? err.message
          : "Failed to link QuickBooks employee."
      );
    } finally {
      setLinkingQbo(false);
    }
  }

  async function handleUnlinkQbo() {
    if (!profile) return;

    const ok = window.confirm("Unlink QuickBooks employee from this profile?");
    if (!ok) return;

    setLinkingQbo(true);
    setQboLinkError("");
    setQboLinkMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "employeeProfiles", profile.id), {
        qboEmployeeId: null,
        qboEmployeeDisplayName: null,
        qboEmployeeHiredDate: null,
        ptoEligibilityDate: null,
        updatedAt: nowIso,
      });

      setProfile({
        ...profile,
        qboEmployeeId: undefined,
        qboEmployeeDisplayName: undefined,
        qboEmployeeHiredDate: undefined,
        ptoEligibilityDate: undefined,
        updatedAt: nowIso,
      });

      setSelectedQboId("");
      setQboLinkMsg("QuickBooks employee unlinked.");
    } catch (err: unknown) {
      setQboLinkError(
        err instanceof Error
          ? err.message
          : "Failed to unlink QuickBooks employee."
      );
    } finally {
      setLinkingQbo(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Employee Profile" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1080, mx: "auto" }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", lg: "center" }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    icon={<BadgeRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Employee Profile"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
                      backgroundColor: alpha(theme.palette.primary.main, 0.12),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                    }}
                  />
                  {profile?.employmentStatus ? (
                    <Chip
                      size="small"
                      label={profile.employmentStatus}
                      variant="outlined"
                      sx={{ borderRadius: 1.5, fontWeight: 600 }}
                    />
                  ) : null}
                </Stack>

                <Typography
                  variant="h4"
                  sx={{
                    fontSize: { xs: "1.65rem", md: "2rem" },
                    lineHeight: 1.05,
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {loading ? "Employee Profile" : displayName || "Employee Profile"}
                </Typography>

                <Typography
                  sx={{
                    mt: 0.8,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 900,
                  }}
                >
                  Operational employee record with DCFlow user linkage, staffing role,
                  technician pairing, and QuickBooks employment linkage.
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    mt: 1,
                    display: "block",
                    color: "text.secondary",
                  }}
                >
                  Profile ID: {profileId || "—"}
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/admin/employee-profiles"
                variant="outlined"
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2 }}
              >
                Back
              </Button>
            </Stack>

            {error ? (
              <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                {error}
              </Alert>
            ) : null}

            {loading ? (
              <Card
                elevation={0}
                sx={{
                  borderRadius: 3,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                }}
              >
                <Box sx={{ p: 3 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                      Loading employee profile...
                    </Typography>
                  </Stack>
                </Box>
              </Card>
            ) : null}

            {!loading && profile ? (
              <>
                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                  }}
                >
                  <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontSize: { xs: "1rem", md: "1.05rem" },
                            fontWeight: 800,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          Quick snapshot
                        </Typography>

                        <Typography
                          sx={{
                            mt: 0.5,
                            color: "text.secondary",
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          High-level employee status and linked systems summary.
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          size="small"
                          label={`Role: ${laborRole || "—"}`}
                          sx={{ borderRadius: 1.5, fontWeight: 600 }}
                        />
                        <Chip
                          size="small"
                          label={`Status: ${employmentStatus || "—"}`}
                          sx={{ borderRadius: 1.5, fontWeight: 600 }}
                        />
                        <Chip
                          size="small"
                          label={
                            profile.qboEmployeeId
                              ? "QuickBooks linked"
                              : "QuickBooks not linked"
                          }
                          color={profile.qboEmployeeId ? "success" : "default"}
                          variant={profile.qboEmployeeId ? "filled" : "outlined"}
                          sx={{ borderRadius: 1.5, fontWeight: 600 }}
                        />
                      </Stack>
                    </Stack>
                  </Box>
                </Card>

                <Card
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    backgroundColor: "background.paper",
                  }}
                >
                  <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                    <SectionHeader
                      icon={<AccountBalanceRoundedIcon sx={{ fontSize: 22 }} />}
                      title="QuickBooks Link"
                      subtitle="Link this employee profile to a QuickBooks employee to pull hire date and compute PTO eligibility."
                    />
                  </Box>

                  <Divider />

                  <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                    <Stack spacing={2}>
                      {qboLoading ? (
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <CircularProgress size={18} />
                          <Typography variant="body2" color="text.secondary">
                            Loading QuickBooks employees...
                          </Typography>
                        </Stack>
                      ) : null}

                      {qboLinkError ? (
                        <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                          {qboLinkError}
                        </Alert>
                      ) : null}

                      {qboLinkMsg ? (
                        <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
                          {qboLinkMsg}
                        </Alert>
                      ) : null}

                      {profile.qboEmployeeId ? (
                        <Card
                          elevation={0}
                          sx={{
                            borderRadius: 2.5,
                            border: `1px solid ${alpha(theme.palette.success.main, 0.22)}`,
                            backgroundColor: alpha(theme.palette.success.main, 0.07),
                          }}
                        >
                          <Box sx={{ p: 2 }}>
                            <Stack spacing={1.25}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                Linked: {profile.qboEmployeeDisplayName || "—"}
                              </Typography>

                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip
                                  size="small"
                                  label={`QBO ID: ${profile.qboEmployeeId}`}
                                  variant="outlined"
                                  sx={{ borderRadius: 1.5 }}
                                />
                                <Chip
                                  size="small"
                                  label={`Hired: ${profile.qboEmployeeHiredDate || "—"}`}
                                  variant="outlined"
                                  sx={{ borderRadius: 1.5 }}
                                />
                                <Chip
                                  size="small"
                                  label={`PTO Eligible: ${profile.ptoEligibilityDate || "—"}`}
                                  variant="outlined"
                                  sx={{ borderRadius: 1.5 }}
                                />
                              </Stack>

                              <Box>
                                <Button
                                  type="button"
                                  onClick={handleUnlinkQbo}
                                  disabled={linkingQbo}
                                  variant="outlined"
                                  color="inherit"
                                  startIcon={<LinkRoundedIcon />}
                                  sx={{ borderRadius: 2 }}
                                >
                                  {linkingQbo
                                    ? "Working..."
                                    : "Unlink QuickBooks Employee"}
                                </Button>
                              </Box>
                            </Stack>
                          </Box>
                        </Card>
                      ) : (
                        <Stack spacing={2}>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{
                              px: 0.25,
                            }}
                          >
                            <Switch
                              checked={showInactiveQbo}
                              onChange={(e) => setShowInactiveQbo(e.target.checked)}
                            />
                            <Typography variant="body2">
                              Show inactive QuickBooks employees
                            </Typography>
                          </Stack>

                          <FormControl fullWidth>
                            <InputLabel>Select QuickBooks Employee</InputLabel>
                            <Select
                              label="Select QuickBooks Employee"
                              value={selectedQboId}
                              onChange={(e: SelectChangeEvent) =>
                                setSelectedQboId(e.target.value)
                              }
                            >
                              <MenuItem value="">— Select —</MenuItem>
                              {filteredQboEmployees.map((e) => (
                                <MenuItem key={e.id} value={e.id}>
                                  {e.displayName || "Unnamed"} · Hired:{" "}
                                  {e.hiredDate || "—"} ·{" "}
                                  {e.active === false ? "INACTIVE" : "ACTIVE"}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          {selectedQbo ? (
                            <Card
                              elevation={0}
                              sx={{
                                borderRadius: 2.5,
                                border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                                backgroundColor: alpha("#FFFFFF", 0.02),
                              }}
                            >
                              <Box sx={{ p: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                  Selected QuickBooks employee
                                </Typography>
                                <Typography
                                  variant="subtitle1"
                                  sx={{ mt: 0.5, fontWeight: 700 }}
                                >
                                  {selectedQbo.displayName || "—"}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ mt: 0.5, color: "text.secondary" }}
                                >
                                  Email: {selectedQbo.email || "—"}
                                </Typography>
                              </Box>
                            </Card>
                          ) : null}

                          <Box>
                            <Button
                              type="button"
                              onClick={handleLinkQbo}
                              disabled={linkingQbo}
                              variant="contained"
                              startIcon={<LinkRoundedIcon />}
                              sx={{ borderRadius: 2 }}
                            >
                              {linkingQbo ? "Linking..." : "Link QBO Employee"}
                            </Button>
                          </Box>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                </Card>

                <Box
                  component="form"
                  onSubmit={handleSave}
                  sx={{
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<LinkRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Link to DCFlow User"
                        subtitle="Attach this operational employee profile to an existing DCFlow login account."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <FormControl fullWidth>
                        <InputLabel>Linked User</InputLabel>
                        <Select
                          label="Linked User"
                          value={userUid}
                          onChange={(e: SelectChangeEvent) =>
                            setUserUid(e.target.value)
                          }
                        >
                          <MenuItem value="">— No user linked —</MenuItem>
                          {users.map((u) => (
                            <MenuItem key={u.uid} value={u.uid}>
                              {u.displayName || "Unnamed"} — {u.email || "no email"} (
                              {u.role || "no role"})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<PersonRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Profile"
                        subtitle="Core employee identity and contact information."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <TextField
                          label="Display Name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          required
                          fullWidth
                        />

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                            gap: 2,
                          }}
                        >
                          <TextField
                            label="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            fullWidth
                          />

                          <TextField
                            label="Phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            fullWidth
                          />
                        </Box>
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<WorkHistoryRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Employment"
                        subtitle="Roster status, labor role, helper pairing, and operational notes."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack spacing={2}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                            gap: 2,
                          }}
                        >
                          <FormControl fullWidth>
                            <InputLabel>Employment Status</InputLabel>
                            <Select
                              label="Employment Status"
                              value={employmentStatus}
                              onChange={(e: SelectChangeEvent) =>
                                setEmploymentStatus(
                                  e.target.value as EmploymentStatus
                                )
                              }
                            >
                              {employmentStatuses.map((s) => (
                                <MenuItem key={s} value={s}>
                                  {s}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <FormControl fullWidth>
                            <InputLabel>Labor Role</InputLabel>
                            <Select
                              label="Labor Role"
                              value={laborRole}
                              onChange={(e: SelectChangeEvent) =>
                                setLaborRole(e.target.value as LaborRole)
                              }
                            >
                              {laborRoles.map((r) => (
                                <MenuItem key={r} value={r}>
                                  {r}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>

                        <FormControl fullWidth>
                          <InputLabel>
                            Default Paired Technician (helpers/apprentices)
                          </InputLabel>
                          <Select
                            label="Default Paired Technician (helpers/apprentices)"
                            value={defaultPairedTechUid}
                            onChange={(e: SelectChangeEvent) =>
                              setDefaultPairedTechUid(e.target.value)
                            }
                          >
                            <MenuItem value="">— None —</MenuItem>
                            {techUsers.map((u) => (
                              <MenuItem key={u.uid} value={u.uid}>
                                {u.displayName || "Unnamed"} — {u.email || "no email"}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <TextField
                          label="Notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          multiline
                          minRows={4}
                          fullWidth
                        />
                      </Stack>
                    </Box>
                  </Card>

                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <SectionHeader
                        icon={<NotesRoundedIcon sx={{ fontSize: 22 }} />}
                        title="Actions"
                        subtitle="Save changes to this profile or permanently remove the record."
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.25}
                        alignItems={{ xs: "stretch", sm: "center" }}
                      >
                        <Button
                          type="submit"
                          disabled={saving}
                          variant="contained"
                          startIcon={<SaveRoundedIcon />}
                          sx={{ minHeight: 42, borderRadius: 2 }}
                        >
                          {saving ? "Saving..." : "Save"}
                        </Button>

                        <Button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleting}
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteRoundedIcon />}
                          sx={{ minHeight: 42, borderRadius: 2 }}
                        >
                          {deleting ? "Deleting..." : "Delete Profile"}
                        </Button>
                      </Stack>
                    </Box>
                  </Card>
                </Box>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}