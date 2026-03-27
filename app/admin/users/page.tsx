// app/admin/users/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { auth, db } from "../../../src/lib/firebase";
import type { AppUser } from "../../../src/types/app-user";

type RoleOption =
  | "admin"
  | "manager"
  | "dispatcher"
  | "billing"
  | "office_display"
  | "technician"
  | "helper"
  | "apprentice";

type TechnicianOption = {
  uid: string;
  displayName: string;
};

const ROLE_OPTIONS: Array<{ value: RoleOption; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "billing", label: "Billing" },
  { value: "office_display", label: "Office Display" },
  { value: "technician", label: "Technician" },
  { value: "helper", label: "Helper" },
  { value: "apprentice", label: "Apprentice" },
];

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box>
      <Typography
        variant="h6"
        sx={{
          fontSize: { xs: "1rem", md: "1.05rem" },
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </Typography>

      {subtitle ? (
        <Typography
          sx={{
            mt: 0.5,
            color: "text.secondary",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

function roleTone(role?: string) {
  const r = String(role || "").toLowerCase();

  if (r === "admin") return { label: "Admin", color: "error" as const };
  if (r === "manager") return { label: "Manager", color: "warning" as const };
  if (r === "dispatcher") return { label: "Dispatcher", color: "secondary" as const };
  if (r === "billing") return { label: "Billing", color: "default" as const };
  if (r === "office_display") return { label: "Office Display", color: "default" as const };
  if (r === "technician") return { label: "Technician", color: "primary" as const };
  if (r === "helper") return { label: "Helper", color: "success" as const };
  if (r === "apprentice") return { label: "Apprentice", color: "success" as const };

  return { label: role || "Unknown", color: "default" as const };
}

export default function AdminUsersPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleOption>("helper");
  const [active, setActive] = useState(true);
  const [laborRoleType, setLaborRoleType] = useState("");
  const [preferredTechnicianId, setPreferredTechnicianId] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const qRef = query(collection(db, "users"), orderBy("displayName"));
      const snap = await getDocs(qRef);

      const items: AppUser[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as any;

        return {
          uid: data.uid ?? docSnap.id,
          displayName: data.displayName ?? "—",
          email: data.email ?? "—",
          role: data.role ?? "technician",
          active: data.active ?? false,
          laborRoleType: data.laborRoleType ?? undefined,
          preferredTechnicianId: data.preferredTechnicianId ?? null,
          preferredTechnicianName: data.preferredTechnicianName ?? null,
          holidayEligible: data.holidayEligible ?? undefined,
          defaultDailyHolidayHours:
            typeof data.defaultDailyHolidayHours === "number"
              ? data.defaultDailyHolidayHours
              : undefined,
        };
      });

      setUsers(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const technicianOptions = useMemo<TechnicianOption[]>(() => {
    return users
      .filter((u) => String(u.role || "").toLowerCase() === "technician")
      .map((u) => ({
        uid: u.uid,
        displayName: u.displayName || "Technician",
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users]);

  const requiresTechnician =
    role === "helper" || role === "apprentice";

  function resetCreateForm() {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRole("helper");
    setActive(true);
    setLaborRoleType("");
    setPreferredTechnicianId("");
    setCreateError("");
    setCreateSuccess("");
  }

  function openCreateDialog() {
    resetCreateForm();
    setCreateOpen(true);
  }

  function closeCreateDialog() {
    if (createSaving) return;
    setCreateOpen(false);
    setCreateError("");
  }

  async function handleCreateUser() {
    setCreateError("");
    setCreateSuccess("");

    if (!displayName.trim()) {
      setCreateError("Display name is required.");
      return;
    }

    if (!email.trim()) {
      setCreateError("Email is required.");
      return;
    }

    if (!password || password.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      return;
    }

    if (requiresTechnician && !preferredTechnicianId) {
      setCreateError("Helpers and apprentices must have a default technician.");
      return;
    }

    setCreateSaving(true);

    try {
      const currentUser = getAuth().currentUser;
      if (!currentUser) {
        throw new Error("You must be signed in as an admin.");
      }

      const idToken = await currentUser.getIdToken();

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          active,
          laborRoleType: laborRoleType.trim() || null,
          preferredTechnicianId: requiresTechnician
            ? preferredTechnicianId
            : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create user.");
      }

      setCreateSuccess("User created successfully.");
      await loadUsers();

      setTimeout(() => {
        setCreateOpen(false);
        resetCreateForm();
      }, 500);
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create user.");
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Admin Users">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={4}>
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
                    icon={<ManageAccountsRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Users"
                    sx={{
                      borderRadius: 1.5,
                      fontWeight: 600,
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
                    fontWeight: 800,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Admin users
                </Typography>

                <Typography
                  sx={{
                    mt: 0.9,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 960,
                  }}
                >
                  Create login accounts, assign roles, and set default helper/apprentice technician pairing.
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
                  href="/admin"
                  variant="outlined"
                  startIcon={<ArrowBackRoundedIcon />}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Back to Admin
                </Button>

                <Button
                  onClick={openCreateDialog}
                  variant="contained"
                  startIcon={<PersonAddAlt1RoundedIcon />}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  Create User
                </Button>
              </Stack>
            </Stack>

            <Box>
              <SectionHeader
                title="User directory"
                subtitle="Select a user to edit their details, or create a new account for office staff, technicians, helpers, and apprentices."
              />

              <Box sx={{ mt: 1.5 }}>
                {loading ? (
                  <Typography variant="body2" color="text.secondary">
                    Loading users...
                  </Typography>
                ) : null}

                {error ? <Alert severity="error">{error}</Alert> : null}

                {!loading && !error && users.length === 0 ? (
                  <Alert severity="info" variant="outlined">
                    No users found.
                  </Alert>
                ) : null}

                {!loading && !error && users.length > 0 ? (
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "repeat(2, minmax(0, 1fr))",
                        xl: "repeat(3, minmax(0, 1fr))",
                      },
                      gap: 1.5,
                    }}
                  >
                    {users.map((u) => {
                      const tone = roleTone(u.role);

                      return (
                        <Card
                          key={u.uid}
                          elevation={0}
                          sx={{
                            height: "100%",
                            borderRadius: 3,
                            border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                            backgroundColor: "background.paper",
                          }}
                        >
                          <CardActionArea
                            component={Link}
                            href={`/admin/users/${u.uid}`}
                            sx={{ height: "100%", borderRadius: 3 }}
                          >
                            <CardContent
                              sx={{
                                p: { xs: 2, md: 2.25 },
                                "&:last-child": { pb: { xs: 2, md: 2.25 } },
                              }}
                            >
                              <Stack spacing={1.5}>
                                <Stack
                                  direction="row"
                                  spacing={1.25}
                                  alignItems="flex-start"
                                  justifyContent="space-between"
                                >
                                  <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
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
                                      {String(u.role || "").toLowerCase() === "technician" ? (
                                        <EngineeringRoundedIcon sx={{ fontSize: 22 }} />
                                      ) : (
                                        <ConstructionRoundedIcon sx={{ fontSize: 22 }} />
                                      )}
                                    </Box>

                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                      <Typography
                                        variant="subtitle1"
                                        sx={{
                                          fontWeight: 700,
                                          lineHeight: 1.2,
                                          letterSpacing: "-0.01em",
                                        }}
                                      >
                                        {u.displayName || "—"}
                                      </Typography>

                                      <Typography
                                        variant="body2"
                                        sx={{
                                          mt: 0.5,
                                          color: "text.secondary",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {u.email || "—"}
                                      </Typography>
                                    </Box>
                                  </Stack>

                                  <Chip
                                    size="small"
                                    label={u.active ? "Active" : "Inactive"}
                                    color={u.active ? "success" : "default"}
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5, fontWeight: 600 }}
                                  />
                                </Stack>

                                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                  <Chip
                                    size="small"
                                    label={tone.label}
                                    color={tone.color}
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5, fontWeight: 600 }}
                                  />

                                  <Chip
                                    size="small"
                                    icon={<BadgeRoundedIcon sx={{ fontSize: 16 }} />}
                                    label={`Labor: ${u.laborRoleType || "—"}`}
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5 }}
                                  />
                                </Stack>

                                <Divider />

                                <Stack spacing={0.5}>
                                  <Typography variant="caption" color="text.secondary">
                                    Preferred technician
                                  </Typography>
                                  <Typography variant="body2">
                                    {u.preferredTechnicianName || "—"}
                                  </Typography>
                                </Stack>
                              </Stack>
                            </CardContent>
                          </CardActionArea>
                        </Card>
                      );
                    })}
                  </Box>
                ) : null}
              </Box>
            </Box>
          </Stack>
        </Box>

        <Dialog open={createOpen} onClose={closeCreateDialog} fullWidth maxWidth="sm">
          <DialogTitle>Create User</DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Create a Firebase login, assign the DCFlow role, and optionally store default technician pairing for helper-type users.
              </Typography>

              {createError ? <Alert severity="error">{createError}</Alert> : null}
              {createSuccess ? <Alert severity="success">{createSuccess}</Alert> : null}

              <TextField
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={createSaving}
                fullWidth
              />

              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={createSaving}
                fullWidth
              />

              <TextField
                label="Temporary Password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={createSaving}
                helperText="Minimum 6 characters."
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  label="Role"
                  value={role}
                  onChange={(e: SelectChangeEvent) =>
                    setRole(e.target.value as RoleOption)
                  }
                  disabled={createSaving}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Labor Role Type (optional)"
                value={laborRoleType}
                onChange={(e) => setLaborRoleType(e.target.value)}
                disabled={createSaving}
                placeholder="example: field, office, plumber, apprentice"
                fullWidth
              />

              {requiresTechnician ? (
                <FormControl fullWidth>
                  <InputLabel>Default Technician</InputLabel>
                  <Select
                    label="Default Technician"
                    value={preferredTechnicianId}
                    onChange={(e: SelectChangeEvent) =>
                      setPreferredTechnicianId(e.target.value)
                    }
                    disabled={createSaving}
                  >
                    {technicianOptions.map((tech) => (
                      <MenuItem key={tech.uid} value={tech.uid}>
                        {tech.displayName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : null}

              <FormControlLabel
                control={
                  <Checkbox
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    disabled={createSaving}
                  />
                }
                label="User is active"
              />
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={closeCreateDialog} disabled={createSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={createSaving}
              variant="contained"
            >
              {createSaving ? "Creating…" : "Create User"}
            </Button>
          </DialogActions>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}