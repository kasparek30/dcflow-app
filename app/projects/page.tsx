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
import {
  getEffectiveProjectOfficeStatus,
  getProjectBillingSummary,
  getProjectBillingPeriods,
  isTimeMaterialsProject,
  safeTrim,
} from "../../src/lib/project-billing";
import type { Project, ProjectOfficeStatus } from "../../src/types/project";

type BidFilter = "all" | "draft" | "submitted" | "won" | "lost";
type AssignmentFilter = "all" | "assigned" | "unassigned";
type ActivityFilter = "all" | "active" | "billing" | "closed" | "inactive";
type DisplayLifecycle =
  | "active"
  | "field_complete"
  | "ready_to_invoice"
  | "invoiced"
  | "closed"
  | "completed"
  | "inactive";

type StageLike = {
  status?: string;
  scheduledDate?: string;
  billed?: boolean;
  billedAmount?: number;
};

type ProjectTripLite = {
  id: string;
  projectId: string;
  date?: string | null;
  status?: string | null;
  active?: boolean | null;
  closeoutHours?: number | null;
  materialsUsedToday?: string | null;
  closeout?: {
    hoursWorkedToday?: number | null;
    materialsUsedToday?: string | null;
  } | null;
  billingPeriodId?: string | null;
  billingPeriodSequence?: number | null;
  billingPeriodLabel?: string | null;
  billingPeriodStatus?: string | null;
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
    case "inactive":
      return "Inactive";
    case "field_complete":
      return "Field Complete";
    case "ready_to_invoice":
      return "Ready to Invoice";
    case "invoiced":
      return "Invoiced";
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
    case "ready_to_invoice":
      return "warning";
    case "in_progress":
    case "field_complete":
      return "info";
    case "complete":
    case "invoiced":
    case "closed":
      return "success";
    case "inactive":
    default:
      return "default";
  }
}

function safeOfficeStatus(project: Project, trips: ProjectTripLite[]): ProjectOfficeStatus {
  return getEffectiveProjectOfficeStatus(project, trips);
}

function formatProjectOfficeStatus(status: ProjectOfficeStatus) {
  switch (status) {
    case "field_complete":
      return "Field Complete";
    case "ready_to_invoice":
      return "Ready to Invoice";
    case "invoiced":
      return "Invoiced";
    case "closed":
      return "Closed";
    case "active_work":
    default:
      return "Active Work";
  }
}

function getWorkflowStages(
  project: Project,
): Array<{ label: string; stage: StageLike | undefined }> {
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

function isProjectWorkflowComplete(project: Project) {
  if (project.projectType === "time_materials") {
    return false;
  }

  const stages = getWorkflowStages(project);
  if (stages.length === 0) return false;

  return stages.every((entry) => entry.stage?.status === "complete");
}

function getProjectDisplayLifecycle(project: Project, trips: ProjectTripLite[]): DisplayLifecycle {
  const officeStatus = safeOfficeStatus(project, trips);

  if (officeStatus === "field_complete") return "field_complete";
  if (officeStatus === "ready_to_invoice") return "ready_to_invoice";
  if (officeStatus === "invoiced") return "invoiced";
  if (officeStatus === "closed") return "closed";

  if (!project.active) return "inactive";

  if (isProjectWorkflowComplete(project)) return "completed";

  return "active";
}

function getProjectDisplayLifecycleLabel(lifecycle: DisplayLifecycle) {
  switch (lifecycle) {
    case "field_complete":
      return "Field Complete";
    case "ready_to_invoice":
      return "Ready to Invoice";
    case "invoiced":
      return "Invoiced";
    case "closed":
      return "Closed";
    case "completed":
      return "Completed";
    case "inactive":
      return "Inactive";
    case "active":
    default:
      return "Active";
  }
}

function isLostProjectBid(project: Project) {
  return project.bidStatus === "lost";
}

function getProjectDisplayLifecycleColor(
  lifecycle: DisplayLifecycle,
): "default" | "primary" | "success" | "warning" | "info" {
  switch (lifecycle) {
    case "field_complete":
      return "info";
    case "ready_to_invoice":
      return "warning";
    case "completed":
    case "invoiced":
    case "closed":
      return "success";
    case "inactive":
      return "default";
    case "active":
    default:
      return "primary";
  }
}

function getNextStage(project: Project, trips: ProjectTripLite[]) {
  const lifecycle = getProjectDisplayLifecycle(project, trips);
  const billingSummary = getProjectBillingSummary(trips, project);
  const periods = getProjectBillingPeriods(project);

  if (isTimeMaterialsProject(project.projectType)) {
    const currentPeriod = periods.find((period) => period.status === "open") || null;

    if (lifecycle === "ready_to_invoice") {
      return {
        label: periods.some((period) => period.status === "ready_to_bill")
          ? "Invoice Ready Billing Period"
          : "Ready to Invoice",
        status: "ready_to_invoice",
        dateText: billingSummary.unbilledCompletedTrips > 0
          ? `${billingSummary.unbilledCompletedTrips} trip(s) frozen`
          : `${billingSummary.readyPeriods} ready period(s)`,
        helper:
          "A frozen T&M billing period is waiting on office billing. Historical periods stay visible while future work can continue in the current period.",
      };
    }

    if (lifecycle === "field_complete") {
      return {
        label: "Final Billing Review",
        status: "field_complete",
        dateText:
          billingSummary.unbilledCompletedTrips > 0
            ? `${billingSummary.unbilledCompletedTrips} unbilled completed trip(s)`
            : "No more field work expected",
        helper:
          "No more field work is expected. Review the final accumulated labor and materials, then freeze the last billing period when ready.",
      };
    }

    if (lifecycle === "invoiced") {
      return {
        label: "Final Invoice Recorded",
        status: "invoiced",
        dateText: (project as any).invoiceNumber
          ? `Invoice #${(project as any).invoiceNumber}`
          : "Final invoice recorded",
        helper: "All T&M billing periods are invoiced and the project is now historical.",
      };
    }

    if (lifecycle === "closed") {
      return {
        label: "Closed",
        status: "closed",
        dateText: "Historical record",
        helper: "Project is fully closed and historical.",
      };
    }

    return {
      label: currentPeriod ? "Current Billing Period" : "Open Billing Period",
      status: billingSummary.unbilledCompletedTrips > 0 ? "scheduled" : "in_progress",
      dateText:
        billingSummary.unbilledCompletedTrips > 0
          ? `${billingSummary.unbilledCompletedTrips} completed trip(s) ready to batch`
          : billingSummary.openTrips > 0
            ? `${billingSummary.openTrips} trip(s) still active`
            : "Accumulating work for the next bill",
      helper:
        billingSummary.unbilledCompletedTrips > 0
          ? "Completed T&M trips and materials are accumulating in the current period until someone marks Ready to Bill."
          : "T&M work can continue while the current period stays open for future accumulated trips and materials.",
    };
  }

  if (lifecycle === "ready_to_invoice") {
    return {
      label: "Ready to Invoice",
      status: "ready_to_invoice",
      dateText: "Create final invoice",
      helper: "Office review is complete. Create/send the final invoice.",
    };
  }

  if (lifecycle === "field_complete") {
    return {
      label: "Office Review",
      status: "field_complete",
      dateText: "Review billing",
      helper: "Field work is complete. Review labor, materials, and closeouts.",
    };
  }

  if (lifecycle === "invoiced") {
    return {
      label: "Invoiced",
      status: "invoiced",
      dateText: (project as any).invoiceNumber
        ? `Invoice #${(project as any).invoiceNumber}`
        : "Invoice recorded",
      helper: "Project is locked for history unless reopened.",
    };
  }

  if (lifecycle === "closed") {
    return {
      label: "Closed",
      status: "closed",
      dateText: "Historical record",
      helper: "Project is fully closed and historical.",
    };
  }

  if (lifecycle === "completed") {
    return {
      label: "Project Complete",
      status: "complete",
      dateText: "No remaining stage work",
      helper: "All required project stages are complete. Move to office review when ready.",
    };
  }

  if (lifecycle === "inactive") {
    return {
      label: "Inactive Project",
      status: "inactive",
      dateText: "Inactive",
      helper: "This project is currently inactive.",
    };
  }

  const stages = getWorkflowStages(project);
  const nextStage = stages.find((entry) => entry.stage?.status !== "complete");

  if (!nextStage) {
    return {
      label: "Project Complete",
      status: "complete",
      dateText: "No remaining stage work",
      helper: "All required project stages are complete. Move to office review when ready.",
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

function projectMatchesSearch(project: Project, trips: ProjectTripLite[], search: string) {
  if (!search.trim()) return true;

  const billingSummary = getProjectBillingSummary(trips, project);
  const haystack = [
    project.projectName,
    project.customerDisplayName,
    project.serviceAddressLine1,
    project.serviceCity,
    project.serviceState,
    project.servicePostalCode,
    project.assignedTechnicianName,
    project.primaryTechnicianName,
    formatProjectType(project.projectType),
    formatBidStatus(project.bidStatus),
    getProjectDisplayLifecycleLabel(getProjectDisplayLifecycle(project, trips)),
    formatProjectOfficeStatus(safeOfficeStatus(project, trips)),
    billingSummary.unbilledCompletedTrips > 0 ? "ready to bill" : "",
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
  const [projectTripsById, setProjectTripsById] = useState<Record<string, ProjectTripLite[]>>({});
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

        const [projectsSnap, tripsSnap] = await Promise.all([
          getDocs(query(collection(db, "projects"), orderBy("createdAt", "desc"))),
          getDocs(collection(db, "trips")),
        ]);

        const tripsByProject: Record<string, ProjectTripLite[]> = {};
        tripsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const projectId = safeTrim(data.link?.projectId);
          if (!projectId) return;

          if (!tripsByProject[projectId]) {
            tripsByProject[projectId] = [];
          }

          tripsByProject[projectId].push({
            id: docSnap.id,
            projectId,
            date: data.date ?? null,
            status: data.status ?? null,
            active: data.active ?? true,
            closeoutHours:
              typeof data.closeoutHours === "number"
                ? data.closeoutHours
                : typeof data.closeout?.hoursWorkedToday === "number"
                  ? data.closeout.hoursWorkedToday
                  : null,
            materialsUsedToday: data.materialsUsedToday ?? data.materialsSummary ?? null,
            closeout: data.closeout ?? null,
            billingPeriodId: data.billingPeriodId ?? null,
            billingPeriodSequence:
              typeof data.billingPeriodSequence === "number" ? data.billingPeriodSequence : null,
            billingPeriodLabel: data.billingPeriodLabel ?? null,
            billingPeriodStatus: data.billingPeriodStatus ?? null,
          });
        });

        const items: Project[] = projectsSnap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

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
            primaryTechnicianId: data.primaryTechnicianId ?? undefined,
            primaryTechnicianName: data.primaryTechnicianName ?? undefined,
            secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
            secondaryTechnicianName: data.secondaryTechnicianName ?? undefined,
            helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,
            helperNames: Array.isArray(data.helperNames) ? data.helperNames.filter(Boolean) : undefined,
            internalNotes: data.internalNotes ?? undefined,
            projectOfficeStatus: data.projectOfficeStatus ?? undefined,
            billingPeriods: Array.isArray(data.billingPeriods) ? data.billingPeriods : undefined,
            currentBillingPeriodId: data.currentBillingPeriodId ?? undefined,
            fieldCompletedAt: data.fieldCompletedAt ?? undefined,
            fieldCompletedByUid: data.fieldCompletedByUid ?? undefined,
            fieldCompletedByName: data.fieldCompletedByName ?? undefined,
            readyToInvoiceAt: data.readyToInvoiceAt ?? undefined,
            readyToInvoiceByUid: data.readyToInvoiceByUid ?? undefined,
            readyToInvoiceByName: data.readyToInvoiceByName ?? undefined,
            invoicedAt: data.invoicedAt ?? undefined,
            invoicedByUid: data.invoicedByUid ?? undefined,
            invoicedByName: data.invoicedByName ?? undefined,
            invoiceNumber: data.invoiceNumber ?? undefined,
            invoiceDate: data.invoiceDate ?? undefined,
            invoiceNotes: data.invoiceNotes ?? undefined,
            closedAt: data.closedAt ?? undefined,
            closedByUid: data.closedByUid ?? undefined,
            closedByName: data.closedByName ?? undefined,
            reopenedAt: data.reopenedAt ?? undefined,
            reopenedByUid: data.reopenedByUid ?? undefined,
            reopenedByName: data.reopenedByName ?? undefined,
            reopenReason: data.reopenReason ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setProjects(items);
        setProjectTripsById(tripsByProject);
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
      const trips = projectTripsById[project.id] || [];
      if (!projectMatchesSearch(project, trips, searchText)) return false;

      if (bidFilter !== "all" && project.bidStatus !== bidFilter) return false;

      const assignmentName = project.primaryTechnicianName || project.assignedTechnicianName;
      if (assignmentFilter === "assigned" && !assignmentName) return false;
      if (assignmentFilter === "unassigned" && assignmentName) return false;

      const lifecycle = getProjectDisplayLifecycle(project, trips);

      if (activityFilter === "active" && (lifecycle !== "active" || isLostProjectBid(project))) {
        return false;
      }
      if (
        activityFilter === "billing" &&
        lifecycle !== "field_complete" &&
        lifecycle !== "ready_to_invoice"
      ) {
        return false;
      }
      if (activityFilter === "closed" && lifecycle !== "invoiced" && lifecycle !== "closed") {
        return false;
      }
      if (activityFilter === "inactive" && lifecycle !== "inactive") return false;

      return true;
    });
  }, [projects, projectTripsById, searchText, bidFilter, assignmentFilter, activityFilter]);

  const summary = useMemo(() => {
    const activeCount = projects.filter((project) => {
      const trips = projectTripsById[project.id] || [];
      return getProjectDisplayLifecycle(project, trips) === "active" && !isLostProjectBid(project);
    }).length;

    const fieldCompleteCount = projects.filter((project) => {
      const trips = projectTripsById[project.id] || [];
      return getProjectDisplayLifecycle(project, trips) === "field_complete";
    }).length;

    const readyToInvoiceCount = projects.filter((project) => {
      const trips = projectTripsById[project.id] || [];
      return getProjectDisplayLifecycle(project, trips) === "ready_to_invoice";
    }).length;

    const invoicedCount = projects.filter((project) => {
      const trips = projectTripsById[project.id] || [];
      const lifecycle = getProjectDisplayLifecycle(project, trips);
      return lifecycle === "invoiced" || lifecycle === "closed";
    }).length;

    const completedCount = projects.filter((project) => {
      const trips = projectTripsById[project.id] || [];
      const lifecycle = getProjectDisplayLifecycle(project, trips);
      return (
        lifecycle === "completed" ||
        lifecycle === "field_complete" ||
        lifecycle === "ready_to_invoice" ||
        lifecycle === "invoiced" ||
        lifecycle === "closed"
      );
    }).length;

    const wonCount = projects.filter((project) => project.bidStatus === "won").length;

    const unassignedCount = projects.filter((project) => {
      const trips = projectTripsById[project.id] || [];
      return (
        getProjectDisplayLifecycle(project, trips) === "active" &&
        !isLostProjectBid(project) &&
        !safeTrim(project.primaryTechnicianName || project.assignedTechnicianName)
      );
    }).length;

    const billingQueueCount = projects.filter((project) => {
      const trips = projectTripsById[project.id] || [];
      const lifecycle = getProjectDisplayLifecycle(project, trips);
      return lifecycle === "field_complete" || lifecycle === "ready_to_invoice";
    }).length;

    const totalPipeline = projects
      .filter((project) => {
        const trips = projectTripsById[project.id] || [];
        const lifecycle = getProjectDisplayLifecycle(project, trips);
        return (
          lifecycle !== "invoiced" &&
          lifecycle !== "closed" &&
          lifecycle !== "inactive" &&
          !isLostProjectBid(project)
        );
      })
      .reduce((sum, project) => sum + Number(project.totalBidAmount ?? 0), 0);

    return {
      total: projects.length,
      active: activeCount,
      fieldComplete: fieldCompleteCount,
      readyToInvoice: readyToInvoiceCount,
      invoiced: invoicedCount,
      completed: completedCount,
      won: wonCount,
      unassigned: unassignedCount,
      pipeline: totalPipeline,
      billingQueue: billingQueueCount,
    };
  }, [projects, projectTripsById]);

  return (
    <ProtectedPage fallbackTitle="Projects">
      <AppShell appUser={appUser}>
        <Stack spacing={3}>
          <Box
            sx={{
              borderRadius: 1,
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
                  Manage new construction, remodel, and time + materials work with clearer
                  stage visibility, stronger field-closeout flow, and a T&M batch billing queue.
                </Typography>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                  <Chip
                    icon={<ConstructionRoundedIcon />}
                    label={`${summary.active} Active`}
                    color="primary"
                    variant="filled"
                  />
                  <Chip
                    icon={<AssignmentTurnedInRoundedIcon />}
                    label={`${summary.completed} Completed / Review`}
                    color="success"
                    variant="filled"
                  />
                  <Chip
                    icon={<SellRoundedIcon />}
                    label={`${summary.billingQueue} Billing Queue`}
                    color={summary.billingQueue > 0 ? "warning" : "default"}
                    variant="filled"
                  />
                  <Chip
                    icon={<AssignmentTurnedInRoundedIcon />}
                    label={`${summary.invoiced} Invoiced / Closed`}
                    color="success"
                    variant="outlined"
                  />
                  <Chip
                    icon={<AssignmentTurnedInRoundedIcon />}
                    label={`${summary.won} Won`}
                    color="success"
                    variant="outlined"
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
            {[
              { label: "Total Projects", value: summary.total },
              { label: "Active Work", value: summary.active },
              { label: "Billing Queue", value: summary.billingQueue },
              { label: "Pipeline Value", value: formatCurrency(summary.pipeline) },
            ].map((item) => (
              <Card
                key={item.label}
                sx={{
                  borderRadius: 1,
                  boxShadow: "none",
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary">
                    {item.label}
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                    {item.value}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Card
            sx={{
              borderRadius: 1,
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
                    <Select value={bidFilter} onChange={(e) => setBidFilter(e.target.value as BidFilter)}>
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
                      onChange={(e) => setAssignmentFilter(e.target.value as AssignmentFilter)}
                    >
                      <MenuItem value="all">All Assignments</MenuItem>
                      <MenuItem value="assigned">Assigned</MenuItem>
                      <MenuItem value="unassigned">Unassigned</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <Select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}>
                      <MenuItem value="all">All Activity</MenuItem>
                      <MenuItem value="active">Active Workflow</MenuItem>
                      <MenuItem value="billing">Billing Queue</MenuItem>
                      <MenuItem value="closed">Invoiced / Closed</MenuItem>
                      <MenuItem value="inactive">Inactive Only</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`${filteredProjects.length} Showing`} color="primary" variant="outlined" />
                  {searchText.trim() ? (
                    <Chip label={`Search: ${searchText.trim()}`} onDelete={() => setSearchText("")} variant="outlined" />
                  ) : null}
                  {bidFilter !== "all" ? (
                    <Chip label={`Bid: ${formatBidStatus(bidFilter)}`} onDelete={() => setBidFilter("all")} variant="outlined" />
                  ) : null}
                  {assignmentFilter !== "all" ? (
                    <Chip
                      label={assignmentFilter === "assigned" ? "Assigned only" : "Unassigned only"}
                      onDelete={() => setAssignmentFilter("all")}
                      variant="outlined"
                    />
                  ) : null}
                  {activityFilter !== "all" ? (
                    <Chip
                      label={
                        activityFilter === "active"
                          ? "Active workflow only"
                          : activityFilter === "billing"
                            ? "Billing queue only"
                            : activityFilter === "closed"
                              ? "Invoiced / closed only"
                              : "Inactive only"
                      }
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
                <Card key={index} sx={{ borderRadius: 1, boxShadow: "none", border: `1px solid ${theme.palette.divider}` }}>
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
            <Card sx={{ borderRadius: 1, boxShadow: "none", border: `1px solid ${theme.palette.divider}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  No matching projects
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Try adjusting your search or filters, or create a new project to get started.
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
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              {filteredProjects.map((project) => {
                const trips = projectTripsById[project.id] || [];
                const billingSummary = getProjectBillingSummary(trips, project);
                const nextStage = getNextStage(project, trips);
                const progress = getStageProgressCount(project);
                const lifecycle = getProjectDisplayLifecycle(project, trips);
                const lifecycleColor = getProjectDisplayLifecycleColor(lifecycle);
                const nextStepAccent =
                  lifecycle === "ready_to_invoice"
                    ? theme.palette.warning.main
                    : lifecycle === "field_complete"
                      ? theme.palette.info.main
                      : lifecycle === "completed" || lifecycle === "invoiced" || lifecycle === "closed"
                        ? theme.palette.success.main
                        : lifecycle === "inactive"
                          ? theme.palette.text.secondary
                          : theme.palette.primary.main;

                return (
                  <Card
                    key={project.id}
                    sx={{
                      borderRadius: 1,
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
                    <CardActionArea component={Link} href={`/projects/${project.id}`} sx={{ alignItems: "stretch" }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Stack spacing={2}>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "flex-start" }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, wordBreak: "break-word" }}>
                                {project.projectName || "Untitled Project"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                                {project.customerDisplayName || "No customer"}
                              </Typography>
                            </Box>

                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent={{ xs: "flex-start", sm: "flex-end" }}>
                              <Chip label={formatProjectType(project.projectType)} color={getProjectTypeTone(project.projectType)} variant="filled" size="small" />
                              <Chip label={formatBidStatus(project.bidStatus)} color={getBidStatusColor(project.bidStatus)} variant="filled" size="small" />
                              <Chip label={getProjectDisplayLifecycleLabel(lifecycle)} color={lifecycleColor} variant={lifecycle === "inactive" ? "outlined" : "filled"} size="small" />
                            </Stack>
                          </Stack>

                          <Stack spacing={1}>
                            <Stack direction="row" spacing={1} alignItems="flex-start">
                              <LocationOnRoundedIcon sx={{ color: "text.secondary", fontSize: 18, mt: 0.2 }} />
                              <Typography variant="body2" color="text.secondary">
                                {buildAddress(project)}
                              </Typography>
                            </Stack>

                            <Stack direction="row" spacing={1} alignItems="center">
                              <PersonRoundedIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                              <Typography variant="body2" color="text.secondary">
                                Lead Tech:{" "}
                                <Box component="span" sx={{ color: "text.primary", fontWeight: project.primaryTechnicianName || project.assignedTechnicianName ? 600 : 500 }}>
                                  {project.primaryTechnicianName || project.assignedTechnicianName || "Unassigned"}
                                </Box>
                              </Typography>
                            </Stack>

                            <Stack direction="row" spacing={1} alignItems="center">
                              <TrendingUpRoundedIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                              <Typography variant="body2" color="text.secondary">
                                {isTimeMaterialsProject(project.projectType) ? "Project Value:" : "Total Bid:"}{" "}
                                <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                                  {formatCurrency(project.totalBidAmount)}
                                </Box>
                              </Typography>
                            </Stack>
                          </Stack>

                          <Divider />

                          <Box sx={{ borderRadius: 1, p: 1.5, backgroundColor: alpha(nextStepAccent, 0.05), border: `1px solid ${alpha(nextStepAccent, 0.14)}` }}>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }}>
                              <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                  Next step
                                </Typography>
                                <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }}>
                                  {nextStage.label}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                  {nextStage.helper}
                                </Typography>
                              </Box>

                              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent={{ xs: "flex-start", sm: "flex-end" }}>
                                <Chip label={formatStageStatus(nextStage.status)} color={getStageStatusColor(nextStage.status)} size="small" variant="filled" />
                                <Chip label={nextStage.dateText} size="small" variant="outlined" />
                              </Stack>
                            </Stack>
                          </Box>

                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {progress ? (
                                <Chip size="small" variant="outlined" label={`Stage Progress ${progress.complete}/${progress.total}`} />
                              ) : (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={
                                    billingSummary.unbilledCompletedTrips > 0
                                      ? `${billingSummary.unbilledCompletedTrips} trip(s) awaiting batch bill`
                                      : billingSummary.readyPeriods > 0
                                        ? `${billingSummary.readyPeriods} ready period(s)`
                                        : "T&M batch billing workflow"
                                  }
                                />
                              )}

                              {lifecycle === "active" && !safeTrim(project.primaryTechnicianName || project.assignedTechnicianName) ? (
                                <Chip size="small" color="warning" variant="filled" label="Needs Assignment" />
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
