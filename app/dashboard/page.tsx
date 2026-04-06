"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import PauseCircleRoundedIcon from "@mui/icons-material/PauseCircleRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type DashboardTicketItem = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
  serviceAddressLine1?: string;
  serviceCity?: string;
  serviceState?: string;
  updatedAt?: string | null;
  assignedTechnicianName?: string;
  assignedHelperName?: string;
  readyToBillAt?: string | null;
  status?: string;
};

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function formatWhen(value?: string | null) {
  const raw = safeTrim(value);
  if (!raw) return "—";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ticketSort(a: DashboardTicketItem, b: DashboardTicketItem) {
  const aTs = safeTrim(a.readyToBillAt || a.updatedAt);
  const bTs = safeTrim(b.readyToBillAt || b.updatedAt);
  return bTs.localeCompare(aTs);
}

function statusSort(a: DashboardTicketItem, b: DashboardTicketItem) {
  const aTs = safeTrim(a.updatedAt);
  const bTs = safeTrim(b.updatedAt);
  return bTs.localeCompare(aTs);
}

function buildAddress(item: DashboardTicketItem) {
  return [safeTrim(item.serviceAddressLine1), safeTrim(item.serviceCity), safeTrim(item.serviceState)]
    .filter(Boolean)
    .join(", ");
}

function buildAssignedPeople(item: DashboardTicketItem) {
  return [safeTrim(item.assignedTechnicianName), safeTrim(item.assignedHelperName)]
    .filter(Boolean)
    .join(" + ");
}

function buildStaticMapUrl(items: DashboardTicketItem[]) {
  const apiKey = safeTrim(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  if (!apiKey) return "";

  const addresses = items
    .map((item) => buildAddress(item))
    .filter(Boolean)
    .slice(0, 4);

  if (addresses.length === 0) return "";

  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams();

  params.set("size", "1200x420");
  params.set("scale", "2");
  params.set("maptype", "roadmap");

  if (addresses.length === 1) {
    params.set("center", addresses[0]);
    params.set("zoom", "12");
  }

  addresses.forEach((address, index) => {
    const label = String(index + 1);
    params.append("markers", `size:mid|color:0x1a73e8|label:${label}|${address}`);
  });

  params.set("key", apiKey);

  return `${base}?${params.toString()}`;
}

function SectionCard({
  title,
  subtitle,
  icon,
  count,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  accent: "primary" | "warning" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
        <Stack spacing={2}>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={2}
          >
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={(theme) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor:
                    accent === "warning"
                      ? alpha(theme.palette.warning.main, 0.14)
                      : accent === "primary"
                      ? alpha(theme.palette.primary.main, 0.14)
                      : alpha(theme.palette.text.primary, 0.08),
                  color:
                    accent === "warning"
                      ? theme.palette.warning.main
                      : accent === "primary"
                      ? theme.palette.primary.main
                      : theme.palette.text.primary,
                })}
              >
                {icon}
              </Box>

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              </Box>
            </Stack>

            <Chip
              size="small"
              label={count}
              color={accent === "neutral" ? "default" : accent}
              variant={accent === "neutral" ? "outlined" : "filled"}
              sx={{ fontWeight: 800, minWidth: 36 }}
            />
          </Stack>

          <Divider />

          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function TicketRow({
  item,
  mode,
}: {
  item: DashboardTicketItem;
  mode: "follow_up" | "review";
}) {
  const address = buildAddress(item);
  const assignedPeople = buildAssignedPeople(item);

  return (
    <Box
      sx={{
        py: 1.5,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {item.customerDisplayName || "Customer"}
            </Typography>

            <Chip
              size="small"
              label={mode === "review" ? "Needs Review" : "Follow-Up"}
              color={mode === "review" ? "primary" : "warning"}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>

          <Typography
            variant="body1"
            sx={{
              mt: 0.5,
              fontWeight: 600,
            }}
          >
            {item.issueSummary || "Service Ticket"}
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 0.85 }}
          >
            {address ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PlaceRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {address}
                </Typography>
              </Stack>
            ) : null}

            {assignedPeople ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PersonRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {assignedPeople}
                </Typography>
              </Stack>
            ) : null}

            <Stack direction="row" spacing={0.5} alignItems="center">
              <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                {mode === "review"
                  ? `Ready ${formatWhen(item.readyToBillAt || item.updatedAt)}`
                  : `Updated ${formatWhen(item.updatedAt)}`}
              </Typography>
            </Stack>
          </Stack>
        </Box>

        <Button
          component={Link}
          href={`/service-tickets/${item.id}`}
          variant={mode === "review" ? "contained" : "outlined"}
          color={mode === "review" ? "primary" : "warning"}
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ borderRadius: 999, flexShrink: 0 }}
        >
          Open Ticket
        </Button>
      </Stack>
    </Box>
  );
}

function getActiveStatusMeta(status?: string) {
  const normalized = safeTrim(status).toLowerCase();

  if (normalized === "paused") {
    return {
      label: "Paused",
      color: "warning" as const,
      icon: <PauseCircleRoundedIcon sx={{ fontSize: 14 }} />,
    };
  }

  return {
    label: "In Progress",
    color: "success" as const,
    icon: <PlayCircleRoundedIcon sx={{ fontSize: 14 }} />,
  };
}

function ActiveWorkRow({ item }: { item: DashboardTicketItem }) {
  const statusMeta = getActiveStatusMeta(item.status);
  const address = buildAddress(item);
  const assignedPeople = buildAssignedPeople(item);

  return (
    <Box
      sx={{
        borderRadius: 3,
        border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: (theme) => alpha(theme.palette.common.white, 0.02),
        px: 1.5,
        py: 1.5,
      }}
    >
      <Stack spacing={1.2}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800}>
              {item.issueSummary || "Active Service Ticket"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {item.customerDisplayName || "Customer"}
            </Typography>
          </Box>

          <Chip
            size="small"
            icon={statusMeta.icon}
            label={statusMeta.label}
            color={statusMeta.color}
            variant="outlined"
            sx={{ fontWeight: 700, flexShrink: 0 }}
          />
        </Stack>

        <Stack spacing={0.8}>
          {assignedPeople ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <EngineeringRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
              <Typography variant="body2" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Crew:
                </Box>{" "}
                {assignedPeople}
              </Typography>
            </Stack>
          ) : null}

          {address ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <PlaceRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
              <Typography variant="body2" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Address:
                </Box>{" "}
                {address}
              </Typography>
            </Stack>
          ) : null}

          <Stack direction="row" spacing={0.75} alignItems="flex-start">
            <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
            <Typography variant="body2" color="text.secondary">
              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                Updated:
              </Box>{" "}
              {formatWhen(item.updatedAt)}
            </Typography>
          </Stack>
        </Stack>

        <Button
          component={Link}
          href={`/service-tickets/${item.id}`}
          variant="text"
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{
            alignSelf: "flex-start",
            px: 0,
            minWidth: 0,
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          Open Ticket
        </Button>
      </Stack>
    </Box>
  );
}

function AreaSnapshotCard({ activeTickets }: { activeTickets: DashboardTicketItem[] }) {
  const theme = useTheme();
  const mapUrl = useMemo(() => buildStaticMapUrl(activeTickets), [activeTickets]);

  return (
    <Box
      sx={{
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.16)}, ${alpha(
          theme.palette.info.light,
          0.08
        )})`,
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        }}
      >
        <Typography
          variant="overline"
          sx={{ letterSpacing: "0.12em", color: "text.secondary", fontWeight: 800 }}
        >
          Area Snapshot
        </Typography>
      </Box>

      {mapUrl ? (
        <Box sx={{ position: "relative", height: 148 }}>
          <Box
            component="img"
            src={mapUrl}
            alt="Live field work area snapshot"
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />

          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.16), rgba(0,0,0,0.02))",
              pointerEvents: "none",
            }}
          />

          <Button
            size="small"
            variant="contained"
            component={Link}
            href="/office-display"
            sx={{
              position: "absolute",
              right: 12,
              bottom: 12,
              borderRadius: 999,
              textTransform: "none",
            }}
          >
            Open office display
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            position: "relative",
            height: 148,
            backgroundImage: `
              radial-gradient(circle at 20% 25%, rgba(255,255,255,0.42), transparent 18%),
              radial-gradient(circle at 72% 62%, rgba(255,255,255,0.28), transparent 20%),
              linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))
            `,
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              opacity: 0.2,
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0 16px, rgba(255,255,255,0.4) 16px 18px)",
            }}
          />

          <Box
            sx={{
              position: "absolute",
              top: 30,
              left: 40,
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "text.primary",
              boxShadow: `0 0 0 6px ${alpha(theme.palette.common.white, 0.3)}`,
            }}
          />

          <Box
            sx={{
              position: "absolute",
              bottom: 30,
              right: 54,
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "text.primary",
              boxShadow: `0 0 0 6px ${alpha(theme.palette.common.white, 0.3)}`,
            }}
          />

          <Stack
            spacing={1}
            sx={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 12,
            }}
          >
            <Alert severity="info" variant="filled" sx={{ borderRadius: 2 }}>
              Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show a real static map preview here.
            </Alert>

            <Button
              size="small"
              variant="contained"
              component={Link}
              href="/office-display"
              sx={{
                alignSelf: "flex-end",
                borderRadius: 999,
                textTransform: "none",
              }}
            >
              Open office display
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export default function DashboardPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [followUpTickets, setFollowUpTickets] = useState<DashboardTicketItem[]>([]);
  const [reviewTickets, setReviewTickets] = useState<DashboardTicketItem[]>([]);
  const [activeTickets, setActiveTickets] = useState<DashboardTicketItem[]>([]);

  useEffect(() => {
    const followUpQuery = query(
      collection(db, "serviceTickets"),
      where("status", "==", "follow_up"),
      limit(25)
    );

    const readyToBillQuery = query(
      collection(db, "serviceTickets"),
      where("billing.status", "==", "ready_to_bill"),
      limit(25)
    );

    const activeWorkQuery = query(
      collection(db, "serviceTickets"),
      where("status", "in", ["in_progress", "paused"]),
      limit(12)
    );

    const unsubFollowUp = onSnapshot(
      followUpQuery,
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const d = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName: d.customerDisplayName ?? "",
              issueSummary: d.issueSummary ?? "",
              serviceAddressLine1: d.serviceAddressLine1 ?? "",
              serviceCity: d.serviceCity ?? "",
              serviceState: d.serviceState ?? "",
              updatedAt: d.updatedAt ?? null,
              assignedTechnicianName: d.assignedTechnicianName ?? "",
              assignedHelperName: d.assignedHelperName ?? "",
              status: d.status ?? "",
            } as DashboardTicketItem;
          })
          .sort(ticketSort);

        setFollowUpTickets(items);
      },
      () => setFollowUpTickets([])
    );

    const unsubReview = onSnapshot(
      readyToBillQuery,
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const d = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName: d.customerDisplayName ?? "",
              issueSummary: d.issueSummary ?? "",
              serviceAddressLine1: d.serviceAddressLine1 ?? "",
              serviceCity: d.serviceCity ?? "",
              serviceState: d.serviceState ?? "",
              updatedAt: d.updatedAt ?? null,
              assignedTechnicianName: d.assignedTechnicianName ?? "",
              assignedHelperName: d.assignedHelperName ?? "",
              readyToBillAt: d.billing?.readyToBillAt ?? null,
              status: d.status ?? "",
            } as DashboardTicketItem;
          })
          .sort(ticketSort);

        setReviewTickets(items);
      },
      () => setReviewTickets([])
    );

    const unsubActive = onSnapshot(
      activeWorkQuery,
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const d = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName: d.customerDisplayName ?? "",
              issueSummary: d.issueSummary ?? "",
              serviceAddressLine1: d.serviceAddressLine1 ?? "",
              serviceCity: d.serviceCity ?? "",
              serviceState: d.serviceState ?? "",
              updatedAt: d.updatedAt ?? null,
              assignedTechnicianName: d.assignedTechnicianName ?? "",
              assignedHelperName: d.assignedHelperName ?? "",
              status: d.status ?? "",
            } as DashboardTicketItem;
          })
          .sort(statusSort);

        setActiveTickets(items);
      },
      () => setActiveTickets([])
    );

    return () => {
      unsubFollowUp();
      unsubReview();
      unsubActive();
    };
  }, []);

  const attentionCount = useMemo(() => {
    return new Set([
      ...followUpTickets.map((x) => x.id),
      ...reviewTickets.map((x) => x.id),
    ]).size;
  }, [followUpTickets, reviewTickets]);

  const visibleCardCount = useMemo(() => {
    return reviewTickets.length + followUpTickets.length + activeTickets.length;
  }, [reviewTickets.length, followUpTickets.length, activeTickets.length]);

  return (
    <ProtectedPage
      fallbackTitle="Dashboard"
      allowedRoles={[
        "admin",
        "dispatcher",
        "manager",
        "billing",
        "office_display",
      ]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={3}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 4,
                border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                backgroundColor: "background.paper",
              }}
            >
              <CardContent sx={{ p: { xs: 2.25, md: 3 }, "&:last-child": { pb: { xs: 2.25, md: 3 } } }}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                >
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip
                        icon={<DashboardRoundedIcon sx={{ fontSize: 16 }} />}
                        label="Dashboard"
                        size="small"
                        sx={{
                          borderRadius: 999,
                          fontWeight: 700,
                          backgroundColor: alpha(theme.palette.primary.main, 0.14),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.24)}`,
                          color: theme.palette.primary.main,
                        }}
                      />

                      <Chip
                        label={`${attentionCount} need attention`}
                        size="small"
                        color={attentionCount > 0 ? "warning" : "default"}
                        variant={attentionCount > 0 ? "filled" : "outlined"}
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />

                      <Chip
                        label={`${activeTickets.length} active in field`}
                        size="small"
                        color={activeTickets.length > 0 ? "success" : "default"}
                        variant={activeTickets.length > 0 ? "filled" : "outlined"}
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />
                    </Stack>

                    <Box>
                      <Typography
                        variant="h4"
                        sx={{
                          fontSize: { xs: "1.8rem", md: "2.35rem" },
                          lineHeight: 1.05,
                          fontWeight: 800,
                          letterSpacing: "-0.035em",
                        }}
                      >
                        Office attention center
                      </Typography>

                      <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mt: 1, maxWidth: 940 }}
                      >
                        This dashboard keeps office action items front and center while also giving
                        dispatch a compact view of live field work, current assignments, and active
                        ticket status.
                      </Typography>
                    </Box>
                  </Stack>

                  <Button
                    component={Link}
                    href="/service-tickets"
                    variant="outlined"
                    endIcon={<ArrowForwardRoundedIcon />}
                    sx={{ borderRadius: 999 }}
                  >
                    Open Service Tickets
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {attentionCount === 0 && activeTickets.length === 0 ? (
              <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                Nice — there are no current office attention items or active field jobs showing right now.
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.35fr) minmax(360px, 0.95fr)" },
                alignItems: "start",
              }}
            >
              <Stack spacing={2}>
                {reviewTickets.length > 0 ? (
                  <SectionCard
                    title="Needs Review"
                    subtitle="Completed work that is ready for office review and billing follow-through."
                    icon={<AssignmentTurnedInRoundedIcon />}
                    count={reviewTickets.length}
                    accent="primary"
                  >
                    <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
                      {reviewTickets.map((item) => (
                        <TicketRow key={item.id} item={item} mode="review" />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {followUpTickets.length > 0 ? (
                  <SectionCard
                    title="Follow-Up Needed"
                    subtitle="Tickets that still have billable context but are waiting on the next action."
                    icon={<AutorenewRoundedIcon />}
                    count={followUpTickets.length}
                    accent="warning"
                  >
                    <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
                      {followUpTickets.map((item) => (
                        <TicketRow key={item.id} item={item} mode="follow_up" />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {attentionCount > 0 ? (
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 4,
                      border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={2}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                      >
                        <Box>
                          <Typography variant="h6" fontWeight={800}>
                            Attention summary
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Needs Review: {reviewTickets.length} • Follow-Up Needed: {followUpTickets.length}
                          </Typography>
                        </Box>

                        <Button
                          component={Link}
                          href="/service-tickets"
                          variant="contained"
                          startIcon={<ReceiptLongRoundedIcon />}
                          sx={{ borderRadius: 999 }}
                        >
                          Manage Service Workflow
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}
              </Stack>

              <Stack spacing={2}>
                <SectionCard
                  title="Live Field Work"
                  subtitle="Compact visibility into active tickets and who is assigned in the field."
                  icon={<MyLocationRoundedIcon />}
                  count={activeTickets.length}
                  accent="neutral"
                >
                  <Stack spacing={1.25}>
                    <AreaSnapshotCard activeTickets={activeTickets} />

                    {activeTickets.length === 0 ? (
                      <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                        No active field tickets are showing right now.
                      </Alert>
                    ) : (
                      <Stack spacing={1.25}>
                        {activeTickets.map((item) => (
                          <ActiveWorkRow key={item.id} item={item} />
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </SectionCard>

                <SectionCard
                  title="Today at a Glance"
                  subtitle="Quick counts from what is currently surfaced on this dashboard."
                  icon={<DashboardRoundedIcon />}
                  count={visibleCardCount}
                  accent="neutral"
                >
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1.25,
                      gridTemplateColumns: "1fr 1fr",
                    }}
                  >
                    {[
                      { label: "Active Now", value: activeTickets.length },
                      { label: "Needs Review", value: reviewTickets.length },
                      { label: "Follow-Up", value: followUpTickets.length },
                      { label: "Attention Total", value: attentionCount },
                    ].map((item) => (
                      <Box
                        key={item.label}
                        sx={{
                          borderRadius: 3,
                          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                          backgroundColor: alpha(theme.palette.common.white, 0.02),
                          px: 1.5,
                          py: 1.5,
                        }}
                      >
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 800,
                            lineHeight: 1,
                            letterSpacing: "-0.03em",
                          }}
                        >
                          {item.value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </SectionCard>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}