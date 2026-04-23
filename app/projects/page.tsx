// app/projects/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  FormControl,
  InputAdornment,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { Project } from "../../src/types/project";

type BidFilter = "all" | "draft" | "submitted" | "won" | "lost";
type AssignmentFilter = "all" | "assigned" | "unassigned";
type ActivityFilter = "all" | "active" | "inactive";

type StageLike = {
  status?: string;
  scheduledDate?: string;
  billed?: boolean;
  billedAmount?: number;
};

function formatCurrency(value?: number) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatBidStatus(status: Project["bidStatus"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    default:
      return "Unknown";
  }
}

function formatStageStatus(status?: string) {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "complete":
      return "Complete";
    default:
      return "Not Started";
  }
}

function formatProjectType(projectType?: Project["projectType"] | string) {
  switch (projectType) {
    case "new_construction":
      return "New Construction";
    case "remodel":
      return "Remodel";
    case "time_materials":
      return "Time + Materials";
    case "other":
      return "Other";
    default:
      return "Project";
  }
}

function getProjectTypeTone(
  projectType?: Project["projectType"] | string,
): "default" | "primary" | "secondary" | "success" {
  switch (projectType) {
    case "new_construction":
      return "primary";
    case "remodel":
      return "secondary";
    case "time_materials":
      return "success";
    default:
      return "default";
  }
}

function getBidStatusColor(
  status: Project["bidStatus"],
): "default" | "warning" | "info" | "success" | "error" {
  switch (status) {
    case "draft":
      return "warning";
    case "submitted":
      return "info";
    case "won":
      return "success";
    case "lost":
      return "error";
    default:
      return "default";
  }
}

function getStageStatusColor(
  status?: string,
): "default" | "warning" | "info" | "success" {
  switch (status) {
    case "not_started":
      return "default";
    case "scheduled":
      return "warning";
    case "in_progress":
      return "info";
    case "complete":
      return "success";
    default:
      return "default";
  }
}

function getWorkflowStages(project: Project): Array<{ label: string; stage: StageLike | undefined }> {
  if (project.projectType === "time_materials") {
    return [];
  }

  if (project.projectType === "remodel") {
    return [
      { label: "Rough-In", stage: project.roughIn },
      { label: "Trim / Finish", stage: project.trimFinish },
    ];
  }

  return [
    { label: "Rough-In", stage: project.roughIn },
    { label: "Top-Out / Vent", stage: project.topOutVent },
    { label: "Trim / Finish", stage: project.trimFinish },
  ];
}

function getNextStage(project: Project) {
  if (project.projectType === "time_materials") {
    return {
      label: "Trip-Based Work",
      status: project.active ? "in_progress" : "complete",
      dateText: project.active ? "Run trips and review billing" : "Closed / inactive",
      helper: project.active ? "Track labor, materials, and billing handoff." : "No current action needed.",
    };
  }

  const stages = getWorkflowStages(project);
  const nextStage = stages.find((entry) => entry.stage?.status !== "complete");

  if (!nextStage) {
    return {
      label: "All Stages Complete",
      status: "complete",
      dateText: "No remaining stage work",
      helper: "Project stages are complete.",
    };
  }

  return {
    label: nextStage.label,
    status: nextStage.stage?.status ?? "not_started",
    dateText: nextStage.stage?.scheduledDate || "No date set",
    helper:
      nextStage.stage?.status === "scheduled"
        ? "Scheduled and ready for field execution."
        : nextStage.stage?.status === "in_progress"
          ? "Currently active in the field."
          : "Needs scheduling / planning.",
  };
}

function getStageProgressCount(project: Project) {
  if (project.projectType === "time_materials") {
    return null;
  }

  const stages = getWorkflowStages(project);
  const completeCount = stages.filter((entry) => entry.stage?.status === "complete").length;

  return {
    complete: completeCount,
    total: stages.length,
  };
}

function buildAddress(project: Project) {
  const line1 = project.serviceAddressLine1?.trim() || "No address";
  const cityStateZip = [project.serviceCity, project.serviceState, project.servicePostalCode]
    .filter(Boolean)
    .join(" ");

  return cityStateZip ? `${line1} • ${cityStateZip}` : line1;
}

function projectMatchesSearch(project: Project, search: string) {
  if (!search.trim()) return true;

  const haystack = [
    project.projectName,
    project.customerDisplayName,
    project.serviceAddressLine1,
    project.serviceCity,
    project.serviceState,
    project.servicePostalCode,
    project.assignedTechnicianName,
    formatProjectType(project.projectType),
    formatBidStatus(project.bidStatus),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.trim().toLowerCase());
}

export default function ProjectsPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [bidFilter, setBidFilter] = useState<BidFilter>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("active");

  useEffect(() => {
    async function loadProjects() {
      try {
        setLoading(true);
        setError("");

        const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const items: Project[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            customerId: data.customerId ?? "",
            customerDisplayName: data.customerDisplayName ?? "",
            serviceAddressId: data.serviceAddressId ?? undefined,
            serviceAddressLabel: data.serviceAddressLabel ?? undefined,
            serviceAddressLine1: data.serviceAddressLine1 ?? "",
            serviceAddressLine2: data.serviceAddressLine2 ?? undefined,
            serviceCity: data.serviceCity ?? "",
            serviceState: data.serviceState ?? "",
            servicePostalCode: data.servicePostalCode ?? "",
            projectName: data.projectName ?? "",
            projectType: data.projectType ?? "other",
            description: data.description ?? undefined,
            bidStatus: data.bidStatus ?? "draft",
            totalBidAmount: Number(data.totalBidAmount ?? 0),
            roughIn: data.roughIn ?? {
              status: "not_started",
              billed: false,
              billedAmount: 0,
            },
            topOutVent: data.topOutVent ?? {
              status: "not_started",
              billed: false,
              billedAmount: 0,
            },
            trimFinish: data.trimFinish ?? {
              status: "not_started",
              billed: false,
              billedAmount: 0,
            },
            assignedTechnicianId: data.assignedTechnicianId ?? undefined,
            assignedTechnicianName: data.assignedTechnicianName ?? undefined,
            internalNotes: data.internalNotes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setProjects(items);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load projects.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (!projectMatchesSearch(project, searchText)) return false;

      if (bidFilter !== "all" && project.bidStatus !== bidFilter) return false;

      if (assignmentFilter === "assigned" && !project.assignedTechnicianName) return false;
      if (assignmentFilter === "unassigned" && project.assignedTechnicianName) return false;

      if (activityFilter === "active" && !project.active) return false;
      if (activityFilter === "inactive" && project.active) return false;

      return true;
    });
  }, [projects, searchText, bidFilter, assignmentFilter, activityFilter]);

  const summary = useMemo(() => {
    const activeCount = projects.filter((project) => project.active).length;
    const wonCount = projects.filter((project) => project.bidStatus === "won").length;
    const unassignedCount = projects.filter(
      (project) => !project.assignedTechnicianName?.trim(),
    ).length;
    const totalPipeline = projects.reduce(
      (sum, project) => sum + Number(project.totalBidAmount ?? 0),
      0,
    );

    return {
      total: projects.length,
      active: activeCount,
      won: wonCount,
      unassigned: unassignedCount,
      pipeline: totalPipeline,
    };
  }, [projects]);

  return (
    <ProtectedPage fallbackTitle="Projects">
      <AppShell appUser={appUser}>
        <Stack spacing={3}>
          <Box
            sx={{
              borderRadius: 4,
              p: { xs: 2, sm: 3 },
              backgroundColor: alpha(theme.palette.primary.main, 0.08),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", md: "center" }}
            >
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.4 }}>
                  Projects
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ mt: 0.75, maxWidth: 780 }}
                >
                  Manage new construction, remodel, and time + materials work with a
                  clearer project workflow, assignment visibility, and next-stage focus.
                </Typography>

                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ mt: 2 }}
                >
                  <Chip
                    icon={<ConstructionRoundedIcon />}
                    label={`${summary.active} Active`}
                    color="primary"
                    variant="filled"
                  />
                  <Chip
                    icon={<AssignmentTurnedInRoundedIcon />}
                    label={`${summary.won} Won`}
                    color="success"
                    variant="filled"
                  />
                  <Chip
                    icon={<PersonRoundedIcon />}
                    label={`${summary.unassigned} Unassigned`}
                    color={summary.unassigned > 0 ? "warning" : "default"}
                    variant="filled"
                  />
                  <Chip
                    icon={<SellRoundedIcon />}
                    label={`Pipeline ${formatCurrency(summary.pipeline)}`}
                    variant="filled"
                  />
                </Stack>
              </Box>

              <Box sx={{ display: "flex", justifyContent: { xs: "stretch", md: "flex-end" } }}>
                <Button
                  component={Link}
                  href="/projects/new"
                  variant="contained"
                  size="large"
                  startIcon={<AddRoundedIcon />}
                  sx={{
                    borderRadius: 99,
                    px: 2.25,
                    minHeight: 48,
                    boxShadow: "none",
                  }}
                >
                  New Project
                </Button>
              </Box>
            </Stack>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(4, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "none",
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Projects
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                  {summary.total}
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "none",
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Active Work
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                  {summary.active}
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "none",
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Won Projects
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                  {summary.won}
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "none",
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">
                  Pipeline Value
                </Typography>
                <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>
                  {formatCurrency(summary.pipeline)}
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Card
            sx={{
              borderRadius: 4,
              boxShadow: "none",
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Find and narrow projects
                </Typography>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      md: "minmax(260px, 1.6fr) repeat(3, minmax(160px, 1fr))",
                    },
                    gap: 2,
                  }}
                >
                  <TextField
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search project, customer, address, lead tech..."
                    fullWidth
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />

                  <FormControl size="small" fullWidth>
                    <Select
                      value={bidFilter}
                      onChange={(e) => setBidFilter(e.target.value as BidFilter)}
                    >
                      <MenuItem value="all">All Bid Statuses</MenuItem>
                      <MenuItem value="draft">Draft</MenuItem>
                      <MenuItem value="submitted">Submitted</MenuItem>
                      <MenuItem value="won">Won</MenuItem>
                      <MenuItem value="lost">Lost</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <Select
                      value={assignmentFilter}
                      onChange={(e) =>
                        setAssignmentFilter(e.target.value as AssignmentFilter)
                      }
                    >
                      <MenuItem value="all">All Assignments</MenuItem>
                      <MenuItem value="assigned">Assigned</MenuItem>
                      <MenuItem value="unassigned">Unassigned</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <Select
                      value={activityFilter}
                      onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
                    >
                      <MenuItem value="all">All Activity</MenuItem>
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Inactive</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip
                    label={`${filteredProjects.length} Showing`}
                    color="primary"
                    variant="outlined"
                  />
                  {searchText.trim() ? (
                    <Chip
                      label={`Search: ${searchText.trim()}`}
                      onDelete={() => setSearchText("")}
                      variant="outlined"
                    />
                  ) : null}
                  {bidFilter !== "all" ? (
                    <Chip
                      label={`Bid: ${formatBidStatus(bidFilter)}`}
                      onDelete={() => setBidFilter("all")}
                      variant="outlined"
                    />
                  ) : null}
                  {assignmentFilter !== "all" ? (
                    <Chip
                      label={
                        assignmentFilter === "assigned"
                          ? "Assigned only"
                          : "Unassigned only"
                      }
                      onDelete={() => setAssignmentFilter("all")}
                      variant="outlined"
                    />
                  ) : null}
                  {activityFilter !== "all" ? (
                    <Chip
                      label={activityFilter === "active" ? "Active only" : "Inactive only"}
                      onDelete={() => setActivityFilter("all")}
                      variant="outlined"
                    />
                  ) : null}
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {loading ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", xl: "repeat(2, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <Card
                  key={index}
                  sx={{
                    borderRadius: 4,
                    boxShadow: "none",
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Skeleton variant="text" width="45%" height={34} />
                    <Skeleton variant="text" width="65%" />
                    <Skeleton variant="text" width="55%" />
                    <Skeleton variant="rounded" height={96} sx={{ mt: 2 }} />
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : null}

          {!loading && error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && !error && filteredProjects.length === 0 ? (
            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "none",
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  No matching projects
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Try adjusting your search or filters, or create a new project to get
                  started.
                </Typography>
                <Button
                  component={Link}
                  href="/projects/new"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  sx={{ mt: 2, borderRadius: 99, boxShadow: "none" }}
                >
                  New Project
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {!loading && !error && filteredProjects.length > 0 ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", xl: "repeat(2, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              {filteredProjects.map((project) => {
                const nextStage = getNextStage(project);
                const progress = getStageProgressCount(project);

                return (
                  <Card
                    key={project.id}
                    sx={{
                      borderRadius: 4,
                      overflow: "hidden",
                      boxShadow: "none",
                      border: `1px solid ${theme.palette.divider}`,
                      transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
                      "&:hover": {
                        transform: "translateY(-1px)",
                        borderColor: alpha(theme.palette.primary.main, 0.28),
                        boxShadow: `0 6px 18px ${alpha(theme.palette.common.black, 0.08)}`,
                      },
                    }}
                  >
                    <CardActionArea
                      component={Link}
                      href={`/projects/${project.id}`}
                      sx={{ alignItems: "stretch" }}
                    >
                      <CardContent sx={{ p: 2.5 }}>
                        <Stack spacing={2}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1.25}
                            justifyContent="space-between"
                            alignItems={{ xs: "flex-start", sm: "flex-start" }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                variant="h6"
                                sx={{
                                  fontWeight: 700,
                                  lineHeight: 1.2,
                                  wordBreak: "break-word",
                                }}
                              >
                                {project.projectName || "Untitled Project"}
                              </Typography>

                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mt: 0.75 }}
                              >
                                {project.customerDisplayName || "No customer"}
                              </Typography>
                            </Box>

                            <Stack
                              direction="row"
                              spacing={1}
                              useFlexGap
                              flexWrap="wrap"
                              justifyContent={{ xs: "flex-start", sm: "flex-end" }}
                            >
                              <Chip
                                label={formatProjectType(project.projectType)}
                                color={getProjectTypeTone(project.projectType)}
                                variant="filled"
                                size="small"
                              />
                              <Chip
                                label={formatBidStatus(project.bidStatus)}
                                color={getBidStatusColor(project.bidStatus)}
                                variant="filled"
                                size="small"
                              />
                              <Chip
                                label={project.active ? "Active" : "Inactive"}
                                color={project.active ? "success" : "default"}
                                variant={project.active ? "filled" : "outlined"}
                                size="small"
                              />
                            </Stack>
                          </Stack>

                          <Stack spacing={1}>
                            <Stack direction="row" spacing={1} alignItems="flex-start">
                              <LocationOnRoundedIcon
                                sx={{ color: "text.secondary", fontSize: 18, mt: 0.2 }}
                              />
                              <Typography variant="body2" color="text.secondary">
                                {buildAddress(project)}
                              </Typography>
                            </Stack>

                            <Stack direction="row" spacing={1} alignItems="center">
                              <PersonRoundedIcon
                                sx={{ color: "text.secondary", fontSize: 18 }}
                              />
                              <Typography variant="body2" color="text.secondary">
                                Lead Tech:{" "}
                                <Box
                                  component="span"
                                  sx={{
                                    color: "text.primary",
                                    fontWeight: project.assignedTechnicianName ? 600 : 500,
                                  }}
                                >
                                  {project.assignedTechnicianName || "Unassigned"}
                                </Box>
                              </Typography>
                            </Stack>

                            <Stack direction="row" spacing={1} alignItems="center">
                              <TrendingUpRoundedIcon
                                sx={{ color: "text.secondary", fontSize: 18 }}
                              />
                              <Typography variant="body2" color="text.secondary">
                                Total Bid:{" "}
                                <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                                  {formatCurrency(project.totalBidAmount)}
                                </Box>
                              </Typography>
                            </Stack>
                          </Stack>

                          <Divider />

                          <Box
                            sx={{
                              borderRadius: 3,
                              p: 1.5,
                              backgroundColor: alpha(theme.palette.primary.main, 0.05),
                              border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                            }}
                          >
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1.5}
                              justifyContent="space-between"
                              alignItems={{ xs: "flex-start", sm: "center" }}
                            >
                              <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                  Next step
                                </Typography>
                                <Typography
                                  variant="h6"
                                  sx={{ mt: 0.5, fontWeight: 700 }}
                                >
                                  {nextStage.label}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ mt: 0.5 }}
                                >
                                  {nextStage.helper}
                                </Typography>
                              </Box>

                              <Stack
                                direction="row"
                                spacing={1}
                                useFlexGap
                                flexWrap="wrap"
                                justifyContent={{ xs: "flex-start", sm: "flex-end" }}
                              >
                                <Chip
                                  label={formatStageStatus(nextStage.status)}
                                  color={getStageStatusColor(nextStage.status)}
                                  size="small"
                                  variant="filled"
                                />
                                <Chip
                                  label={nextStage.dateText}
                                  size="small"
                                  variant="outlined"
                                />
                              </Stack>
                            </Stack>
                          </Box>

                          <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                            justifyContent="space-between"
                            alignItems="center"
                          >
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {progress ? (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={`Stage Progress ${progress.complete}/${progress.total}`}
                                />
                              ) : (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label="Trip-Based Billing Workflow"
                                />
                              )}

                              {!project.assignedTechnicianName ? (
                                <Chip
                                  size="small"
                                  color="warning"
                                  variant="filled"
                                  label="Needs Assignment"
                                />
                              ) : null}
                            </Stack>

                            <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700 }}>
                              Open Project
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
        </Stack>
      </AppShell>
    </ProtectedPage>
  );
}