"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { auth, db } from "../../../src/lib/firebase";
import type {
  EmployeeProfile,
  EmploymentStatus,
} from "../../../src/types/employee-profile";

type FilterMode = "current" | "inactive" | "all";

type DcflowUser = {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean;
};

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
            maxWidth: 920,
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

function getInitials(name?: string) {
  const text = String(name || "").trim();
  if (!text) return "U";

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function employmentStatusTone(
  status?: EmploymentStatus
): {
  label: string;
  sx: object;
} {
  if (status === "inactive") {
    return {
      label: "Inactive",
      sx: {
        color: "#FFE1E4",
        backgroundColor: "rgba(255,42,54,0.10)",
        border: "1px solid rgba(255,42,54,0.20)",
      },
    };
  }

  if (status === "current") {
    return {
      label: "Current",
      sx: {
        color: "#DFF7E7",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "1px solid rgba(52,199,89,0.24)",
      },
    };
  }

  return {
    label: status || "Unknown",
    sx: {
      color: "#DCEBFF",
      backgroundColor: "rgba(13,126,242,0.10)",
      border: "1px solid rgba(13,126,242,0.22)",
    },
  };
}

export default function EmployeeProfilesPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [users, setUsers] = useState<DcflowUser[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterMode>("current");

  const [creatingUid, setCreatingUid] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [createMessage, setCreateMessage] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");
    setCreateError("");
    setCreateMessage("");

    try {
      const profilesQ = query(
        collection(db, "employeeProfiles"),
        orderBy("displayName")
      );
      const profilesSnap = await getDocs(profilesQ);

      const profileItems: EmployeeProfile[] = profilesSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          userUid: d.userUid ?? undefined,
          displayName: d.displayName ?? "",
          email: d.email ?? undefined,
          phone: d.phone ?? undefined,
          employmentStatus: (d.employmentStatus ?? "current") as EmploymentStatus,
          laborRole: (d.laborRole ?? "other") as any,
          defaultPairedTechUid: d.defaultPairedTechUid ?? undefined,
          qboEmployeeId: d.qboEmployeeId ?? undefined,
          notes: d.notes ?? undefined,
          createdAt: d.createdAt ?? "",
          updatedAt: d.updatedAt ?? "",
        };
      });

      const usersQ = query(collection(db, "users"), orderBy("displayName"));
      const usersSnap = await getDocs(usersQ);

      const userItems: DcflowUser[] = usersSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          uid: docSnap.id,
          displayName: d.displayName ?? "",
          email: d.email ?? "",
          role: d.role ?? "",
          active: d.active ?? true,
        };
      });

      setProfiles(profileItems);
      setUsers(userItems);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load employee profiles."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProfiles = useMemo(() => {
    if (filter === "all") return profiles;
    return profiles.filter((p) => p.employmentStatus === filter);
  }, [profiles, filter]);

  const profileUserUids = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) {
      if (p.userUid) set.add(p.userUid);
    }
    return set;
  }, [profiles]);

  const usersMissingProfiles = useMemo(() => {
    const activeUsers = users.filter((u) => u.active !== false);
    return activeUsers.filter((u) => !profileUserUids.has(u.uid));
  }, [users, profileUserUids]);

  async function handleCreateFromUser(userUid: string) {
    setCreatingUid(userUid);
    setCreateError("");
    setCreateMessage("");

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        setCreateError("You must be signed in to create an employee profile.");
        return;
      }

      const idToken = await currentUser.getIdToken(true);

      const res = await fetch("/api/employee-profiles/create-from-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userUid }),
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data?.error || "Create profile failed.");
        return;
      }

      if (data?.existed) {
        setCreateMessage("Profile already existed — opening it.");
      } else {
        setCreateMessage("Profile created — opening it.");
      }

      const id = data?.profileId;
      if (id) {
        window.location.href = `/admin/employee-profiles/${id}`;
        return;
      }

      await loadAll();
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Create profile failed."
      );
    } finally {
      setCreatingUid(null);
    }
  }

  return (
    <ProtectedPage
  fallbackTitle="My Day"
  allowedRoles={[
    "admin",
    "dispatcher",
    "manager",
    "technician",
    "helper",
    "apprentice",
  ]}
>
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
                    icon={<BadgeRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Employee Profiles"
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
                  Employee profiles
                </Typography>

                <Typography
                  sx={{
                    mt: 0.9,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 940,
                  }}
                >
                  Your internal workforce roster truth for DCFlow. This should reflect
                  who is actually in your operating team, independent from QuickBooks
                  active flags and accounting sync behavior.
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
                  component={Link}
                  href="/admin/employee-profiles/new"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  sx={{ minHeight: 40, borderRadius: 2 }}
                >
                  New Employee Profile
                </Button>
              </Stack>
            </Stack>

            {error ? (
              <Alert severity="error" variant="outlined" icon={<ErrorOutlineRoundedIcon />}>
                {error}
              </Alert>
            ) : null}

            {createError ? (
              <Alert severity="error" variant="outlined" icon={<ErrorOutlineRoundedIcon />}>
                {createError}
              </Alert>
            ) : null}

            {createMessage ? (
              <Alert severity="success" variant="outlined" icon={<CheckCircleRoundedIcon />}>
                {createMessage}
              </Alert>
            ) : null}

            <Card
              elevation={0}
              sx={{
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              }}
            >
              <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={1.75}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                  >
                    <SectionHeader
                      title="Quick create from DCFlow users"
                      subtitle="These active users do not yet have an employee profile. Creating from here generates the profile automatically and opens it."
                    />

                    <Chip
                      size="small"
                      icon={<PersonAddRoundedIcon sx={{ fontSize: 16 }} />}
                      label={`${usersMissingProfiles.length} pending`}
                      sx={{
                        borderRadius: 1.5,
                        fontWeight: 700,
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                      }}
                    />
                  </Stack>

                  {usersMissingProfiles.length === 0 ? (
                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 2,
                        p: 1.75,
                        border: `1px solid ${alpha(theme.palette.success.main, 0.22)}`,
                        backgroundColor: alpha(theme.palette.success.main, 0.10),
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CheckCircleRoundedIcon
                          sx={{ color: theme.palette.success.light, fontSize: 18 }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          All active users already have employee profiles.
                        </Typography>
                      </Stack>
                    </Paper>
                  ) : (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          xl: "repeat(2, minmax(0, 1fr))",
                        },
                        gap: 1.5,
                      }}
                    >
                      {usersMissingProfiles.map((u) => (
                        <Paper
                          key={u.uid}
                          elevation={0}
                          sx={{
                            borderRadius: 2.5,
                            p: 1.5,
                            border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                            backgroundColor: "background.paper",
                          }}
                        >
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1.5}
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            justifyContent="space-between"
                          >
                            <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
                              <Avatar
                                sx={{
                                  width: 42,
                                  height: 42,
                                  borderRadius: 2,
                                  bgcolor: alpha(theme.palette.primary.main, 0.14),
                                  color: theme.palette.primary.light,
                                  fontWeight: 800,
                                  fontSize: 14,
                                }}
                              >
                                {getInitials(u.displayName)}
                              </Avatar>

                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography
                                  variant="subtitle1"
                                  sx={{
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                    letterSpacing: "-0.01em",
                                  }}
                                >
                                  {u.displayName || "Unnamed"}
                                </Typography>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    mt: 0.35,
                                    color: "text.secondary",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {u.email || "No email"}
                                </Typography>

                                <Stack
                                  direction="row"
                                  spacing={0.75}
                                  flexWrap="wrap"
                                  useFlexGap
                                  sx={{ mt: 1 }}
                                >
                                  <Chip
                                    size="small"
                                    label={u.role || "—"}
                                    variant="outlined"
                                    sx={{ borderRadius: 1.5, fontWeight: 600 }}
                                  />
                                  <Chip
                                    size="small"
                                    label={u.uid}
                                    variant="outlined"
                                    sx={{
                                      borderRadius: 1.5,
                                      maxWidth: 220,
                                      "& .MuiChip-label": {
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      },
                                    }}
                                  />
                                </Stack>
                              </Box>
                            </Stack>

                            <Button
                              variant="contained"
                              startIcon={<PersonAddRoundedIcon />}
                              onClick={() => handleCreateFromUser(u.uid)}
                              disabled={creatingUid === u.uid}
                              sx={{
                                borderRadius: 2,
                                minHeight: 40,
                                flexShrink: 0,
                              }}
                            >
                              {creatingUid === u.uid ? "Creating..." : "Create Profile"}
                            </Button>
                          </Stack>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Stack>
              </Box>
            </Card>

            <Box>
              <SectionHeader
                title="Roster"
                subtitle="Browse and open employee profiles by employment status."
              />

              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", md: "center" }}
                justifyContent="space-between"
                sx={{ mt: 1.5 }}
              >
                <ToggleButtonGroup
                  exclusive
                  value={filter}
                  onChange={(_, next) => {
                    if (next) setFilter(next);
                  }}
                  size="small"
                  sx={{
                    flexWrap: "wrap",
                    "& .MuiToggleButton-root": {
                      px: 1.5,
                      minHeight: 36,
                      borderRadius: "999px !important",
                      textTransform: "none",
                      fontWeight: 700,
                      borderColor: alpha("#FFFFFF", 0.12),
                    },
                  }}
                >
                  <ToggleButton value="current">Current</ToggleButton>
                  <ToggleButton value="inactive">Inactive</ToggleButton>
                  <ToggleButton value="all">All</ToggleButton>
                </ToggleButtonGroup>

                <Chip
                  size="small"
                  icon={<ManageAccountsRoundedIcon sx={{ fontSize: 16 }} />}
                  label={`${filteredProfiles.length} profile(s)`}
                  variant="outlined"
                  sx={{ borderRadius: 1.5, fontWeight: 700 }}
                />
              </Stack>
            </Box>

            {loading ? (
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 3,
                  p: 3,
                  border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                  backgroundColor: "background.paper",
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <CircularProgress size={20} thickness={5} />
                  <Typography variant="body2" color="text.secondary">
                    Loading employee profiles...
                  </Typography>
                </Stack>
              </Paper>
            ) : null}

            {!loading && !error ? (
              filteredProfiles.length === 0 ? (
                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 3,
                    p: 3,
                    border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    backgroundColor: "background.paper",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    No employee profiles found for this filter.
                  </Typography>
                </Paper>
              ) : (
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
                  {filteredProfiles.map((p) => {
                    const tone = employmentStatusTone(p.employmentStatus);

                    return (
                      <Card
                        key={p.id}
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
                          href={`/admin/employee-profiles/${p.id}`}
                          sx={{ height: "100%", borderRadius: 3, alignItems: "stretch" }}
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
                            <Stack spacing={1.5} sx={{ height: "100%" }}>
                              <Stack
                                direction="row"
                                spacing={1.25}
                                justifyContent="space-between"
                                alignItems="flex-start"
                              >
                                <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
                                  <Avatar
                                    sx={{
                                      width: 42,
                                      height: 42,
                                      borderRadius: 2,
                                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                                      color: theme.palette.primary.light,
                                      fontWeight: 800,
                                      fontSize: 14,
                                    }}
                                  >
                                    {getInitials(p.displayName)}
                                  </Avatar>

                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                      variant="subtitle1"
                                      sx={{
                                        fontWeight: 800,
                                        lineHeight: 1.2,
                                        letterSpacing: "-0.01em",
                                      }}
                                    >
                                      {p.displayName}
                                    </Typography>

                                    <Typography
                                      variant="body2"
                                      sx={{
                                        mt: 0.45,
                                        color: "text.secondary",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {p.email || "—"}
                                    </Typography>
                                  </Box>
                                </Stack>

                                <Chip
                                  size="small"
                                  label={tone.label}
                                  sx={{
                                    borderRadius: 1.5,
                                    fontWeight: 700,
                                    ...tone.sx,
                                  }}
                                />
                              </Stack>

                              <Divider />

                              <Stack spacing={1}>
                                <Stack direction="row" spacing={0.75} alignItems="center">
                                  <WorkRoundedIcon
                                    sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                  />
                                  <Typography variant="body2" color="text.secondary">
                                    Labor Role:{" "}
                                    <Typography
                                      component="span"
                                      variant="body2"
                                      sx={{ color: "text.primary", fontWeight: 700 }}
                                    >
                                      {p.laborRole || "—"}
                                    </Typography>
                                  </Typography>
                                </Stack>

                                <Stack direction="row" spacing={0.75} alignItems="center">
                                  <LinkRoundedIcon
                                    sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                  />
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                      minWidth: 0,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Linked User UID:{" "}
                                    <Typography
                                      component="span"
                                      variant="body2"
                                      sx={{ color: "text.primary", fontWeight: 700 }}
                                    >
                                      {p.userUid || "—"}
                                    </Typography>
                                  </Typography>
                                </Stack>

                                <Stack direction="row" spacing={0.75} alignItems="center">
                                  <PersonRoundedIcon
                                    sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                  />
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                      minWidth: 0,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Paired Tech UID:{" "}
                                    <Typography
                                      component="span"
                                      variant="body2"
                                      sx={{ color: "text.primary", fontWeight: 700 }}
                                    >
                                      {p.defaultPairedTechUid || "—"}
                                    </Typography>
                                  </Typography>
                                </Stack>
                              </Stack>

                              <Box sx={{ flex: 1 }} />

                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                                sx={{
                                  color: "primary.light",
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 700,
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  Open profile
                                </Typography>
                                <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
                              </Stack>
                            </Stack>
                          </CardContent>
                        </CardActionArea>
                      </Card>
                    );
                  })}
                </Box>
              )
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}