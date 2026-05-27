// app/technician/project-trips/[tripId]/page.tsx
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
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
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";

import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";
import { db } from "../../../../src/lib/firebase";

type TripCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;
  helperUid?: string | null;
  helperName?: string | null;
  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;
  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
};

type ProjectTrip = {
  id: string;
  active: boolean;
  type: string;
  status: string;
  date: string;
  timeWindow?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  timerState?: string | null;
  billingPeriodLabel?: string | null;
  crew?: TripCrew | null;
  crewConfirmed?: TripCrew | null;
  link?: {
    projectId?: string | null;
    projectStageKey?: string | null;
  } | null;
};

type FieldProject = {
  id: string;
  projectName: string;
  serviceAddressLine1: string;
  serviceAddressLine2?: string | null;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string;
};

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function isFieldRole(role?: string | null) {
  return ["technician", "helper", "apprentice"].includes(safeTrim(role).toLowerCase());
}

function isElevatedRole(role?: string | null) {
  return ["admin", "dispatcher", "manager"].includes(safeTrim(role).toLowerCase());
}

function isUidOnCrew(uid: string, crew?: TripCrew | null) {
  const cleanUid = safeTrim(uid);
  if (!cleanUid || !crew) return false;
  return (
    safeTrim(crew.primaryTechUid) === cleanUid ||
    safeTrim(crew.helperUid) === cleanUid ||
    safeTrim(crew.secondaryTechUid) === cleanUid ||
    safeTrim(crew.secondaryHelperUid) === cleanUid
  );
}

function stageLabel(stageKey?: string | null, billingPeriodLabel?: string | null) {
  const billingLabel = safeTrim(billingPeriodLabel);
  if (billingLabel) return billingLabel;

  const key = safeTrim(stageKey);
  if (key === "roughIn") return "Rough-In";
  if (key === "topOutVent") return "Top-Out / Vent";
  if (key === "trimFinish") return "Trim / Finish";
  if (key === "tm_work") return "Time + Materials Visit";
  return "Project Visit";
}

function formatStatus(status?: string | null, timerState?: string | null) {
  const timer = safeTrim(timerState).toLowerCase();
  if (timer === "running") return "In Progress";
  if (timer === "paused") return "Paused";

  const value = safeTrim(status).toLowerCase();
  if (value === "in_progress") return "In Progress";
  if (value === "complete" || value === "completed") return "Complete";
  if (value === "cancelled") return "Cancelled";
  if (value === "planned" || value === "scheduled") return "Scheduled";
  return value ? value.replaceAll("_", " ") : "Scheduled";
}

function statusColor(status?: string | null, timerState?: string | null) {
  const label = formatStatus(status, timerState);
  if (label === "In Progress") return "primary" as const;
  if (label === "Paused") return "warning" as const;
  if (label === "Complete") return "success" as const;
  if (label === "Cancelled") return "error" as const;
  return "default" as const;
}

function formatClockTime(value?: string | null) {
  const raw = safeTrim(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return raw;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return raw;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatTripDate(dateIso?: string | null) {
  const raw = safeTrim(dateIso);
  if (!raw) return "Date not set";
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTripSchedule(trip?: ProjectTrip | null) {
  if (!trip) return "";
  const date = formatTripDate(trip.date);
  const start = formatClockTime(trip.startTime);
  const end = formatClockTime(trip.endTime);
  if (start && end) return `${date} · ${start} – ${end}`;
  return date;
}

function buildAddress(project?: FieldProject | null) {
  if (!project) return "";
  const cityStateZip = [project.serviceCity, project.serviceState, project.servicePostalCode]
    .map(safeTrim)
    .filter(Boolean)
    .join(" ");
  return [project.serviceAddressLine1, project.serviceAddressLine2, cityStateZip]
    .map(safeTrim)
    .filter(Boolean)
    .join(", ");
}

function buildCrewLine(crew?: TripCrew | null) {
  if (!crew) return "Crew not listed";
  const names = [
    crew.primaryTechName || crew.primaryTechUid,
    crew.helperName || crew.helperUid,
    crew.secondaryTechName || crew.secondaryTechUid,
    crew.secondaryHelperName || crew.secondaryHelperUid,
  ]
    .map(safeTrim)
    .filter(Boolean);
  return names.length ? names.join(" · ") : "Crew not listed";
}

function buildMapsUrl(address: string) {
  const cleanAddress = safeTrim(address);
  if (!cleanAddress) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddress)}`;
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: `1px solid ${theme.palette.divider}`,
        backgroundImage: "none",
      }}
    >
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              color: "primary.main",
              bgcolor: alpha(theme.palette.primary.main, 0.1),
            }}
          >
            {icon}
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

export default function FieldProjectTripPage() {
  const router = useRouter();
  const params = useParams<{ tripId: string }>();
  const routeTripId = typeof params?.tripId === "string" ? params.tripId : "";
  const { appUser, loading: authLoading } = useAuthContext();

  const [tripLoading, setTripLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [trip, setTrip] = useState<ProjectTrip | null>(null);
  const [project, setProject] = useState<FieldProject | null>(null);
  const [error, setError] = useState("");

  const role = safeTrim(appUser?.role).toLowerCase();
  const uid = safeTrim(appUser?.uid);

  useEffect(() => {
    if (authLoading || !appUser) return;

    if (!routeTripId) {
      setTripLoading(false);
      setError("Project trip not found.");
      return;
    }

    const unsub = onSnapshot(
      doc(db, "trips", routeTripId),
      (snap) => {
        if (!snap.exists()) {
          setTrip(null);
          setTripLoading(false);
          setError("Project trip not found.");
          return;
        }

        const data = snap.data() as any;
        const item: ProjectTrip = {
          id: snap.id,
          active: typeof data.active === "boolean" ? data.active : true,
          type: safeTrim(data.type) || "project",
          status: safeTrim(data.status) || "planned",
          date: safeTrim(data.date),
          timeWindow: data.timeWindow ?? null,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          notes: data.notes ?? null,
          timerState: data.timerState ?? null,
          billingPeriodLabel: data.billingPeriodLabel ?? null,
          crew: data.crew ?? null,
          crewConfirmed: data.crewConfirmed ?? null,
          link: data.link ?? null,
        };

        if (item.type.toLowerCase() !== "project") {
          setTrip(null);
          setError("This page is only available for project trips.");
          setTripLoading(false);
          return;
        }

        setTrip(item);
        setError("");
        setTripLoading(false);
      },
      () => {
        setTripLoading(false);
        setError("Unable to load this project trip.");
      },
    );

    return () => unsub();
  }, [routeTripId, authLoading, appUser]);

  const crewForAccess = trip?.crewConfirmed || trip?.crew || null;
  const permittedToViewTrip = useMemo(() => {
    if (!trip || !appUser) return false;
    if (isElevatedRole(role)) return true;
    if (isFieldRole(role)) return isUidOnCrew(uid, crewForAccess);
    return false;
  }, [trip, appUser, role, uid, crewForAccess]);

  useEffect(() => {
    if (tripLoading || !trip || !appUser) return;
    if (!permittedToViewTrip) {
      router.replace("/technician/my-day");
    }
  }, [tripLoading, trip, appUser, permittedToViewTrip, router]);

  useEffect(() => {
    const projectId = safeTrim(trip?.link?.projectId);
    if (!projectId || !permittedToViewTrip) {
      setProject(null);
      setProjectLoading(false);
      return;
    }

    setProjectLoading(true);
    const unsub = onSnapshot(
      doc(db, "projects", projectId),
      (snap) => {
        if (!snap.exists()) {
          setProject(null);
          setProjectLoading(false);
          return;
        }

        const data = snap.data() as any;
        setProject({
          id: snap.id,
          projectName: safeTrim(data.projectName) || "Project Visit",
          serviceAddressLine1: safeTrim(data.serviceAddressLine1),
          serviceAddressLine2: data.serviceAddressLine2 ?? null,
          serviceCity: safeTrim(data.serviceCity),
          serviceState: safeTrim(data.serviceState),
          servicePostalCode: safeTrim(data.servicePostalCode),
        });
        setProjectLoading(false);
      },
      () => {
        setProject(null);
        setProjectLoading(false);
      },
    );

    return () => unsub();
  }, [trip?.link?.projectId, permittedToViewTrip]);

  const address = useMemo(() => buildAddress(project), [project]);
  const mapsUrl = useMemo(() => buildMapsUrl(address), [address]);
  const crewLine = useMemo(() => buildCrewLine(trip?.crewConfirmed || trip?.crew || null), [trip]);
  const currentStatus = formatStatus(trip?.status, trip?.timerState);
  const scheduledLine = formatTripSchedule(trip);
  const tripStageLabel = stageLabel(trip?.link?.projectStageKey, trip?.billingPeriodLabel);

  function openMaps() {
    if (!mapsUrl || typeof window === "undefined") return;
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <ProtectedPage
      fallbackTitle="Project Trip"
      allowedRoles={["admin", "dispatcher", "manager", "technician", "helper", "apprentice"]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 720, mx: "auto", pb: { xs: 2, md: 4 } }}>
          <Button
            variant="text"
            size="small"
            startIcon={<ArrowBackRoundedIcon />}
            onClick={() => router.push("/technician/my-day")}
            sx={{ mb: 1.25 }}
          >
            My Day
          </Button>

          {tripLoading ? (
            <Stack alignItems="center" spacing={1.5} sx={{ py: 8 }}>
              <CircularProgress size={28} />
              <Typography color="text.secondary">Loading project trip…</Typography>
            </Stack>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : !trip || !permittedToViewTrip ? (
            <Alert severity="info">Returning to My Day…</Alert>
          ) : (
            <Stack spacing={1.5}>
              <Card elevation={0} sx={{ borderRadius: 3, border: (t) => `1px solid ${t.palette.divider}` }}>
                <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <ConstructionRoundedIcon fontSize="small" color="primary" />
                        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                          Project Trip
                        </Typography>
                      </Stack>
                      <Chip
                        label={currentStatus}
                        color={statusColor(trip.status, trip.timerState)}
                        size="small"
                        variant={currentStatus === "Scheduled" ? "outlined" : "filled"}
                      />
                    </Stack>

                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.22 }}>
                        {projectLoading ? "Loading project…" : project?.projectName || "Project Visit"}
                      </Typography>
                      <Typography variant="body2" color="primary.main" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {tripStageLabel}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center">
                      <ScheduleRoundedIcon fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">
                        {scheduledLine}
                      </Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              <SectionCard icon={<LocationOnRoundedIcon fontSize="small" />} title="Jobsite">
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {projectLoading ? "Loading address…" : address || "No jobsite address provided."}
                </Typography>
                {mapsUrl ? (
                  <Button
                    variant="outlined"
                    startIcon={<MapRoundedIcon />}
                    onClick={openMaps}
                    sx={{ mt: 1.5 }}
                  >
                    Open in Maps
                  </Button>
                ) : null}
              </SectionCard>

              <SectionCard icon={<NotesRoundedIcon fontSize="small" />} title="Today’s Work">
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {safeTrim(trip.notes) || "No work instructions have been added for this visit."}
                </Typography>
              </SectionCard>

              <SectionCard icon={<PeopleAltRoundedIcon fontSize="small" />} title="Working Today">
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {crewLine}
                </Typography>
              </SectionCard>

              <Divider sx={{ my: 0.5 }} />

              {currentStatus === "In Progress" || currentStatus === "Paused" ? (
                <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                  Use the trip bar at the bottom of the screen to pause, resume, or finish today’s project work.
                </Alert>
              ) : currentStatus === "Scheduled" ? (
                <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                  Start this project visit from your My Day trip card when work begins.
                </Alert>
              ) : null}
            </Stack>
          )}
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}
