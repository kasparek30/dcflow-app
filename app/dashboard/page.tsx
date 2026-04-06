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
  readyToBillAt?: string | null;
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
  accent: "primary" | "warning";
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
                      : alpha(theme.palette.primary.main, 0.14),
                  color:
                    accent === "warning"
                      ? theme.palette.warning.main
                      : theme.palette.primary.main,
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
              color={accent}
              variant="filled"
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
  const address = [safeTrim(item.serviceAddressLine1), safeTrim(item.serviceCity), safeTrim(item.serviceState)]
    .filter(Boolean)
    .join(", ");

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

            {item.assignedTechnicianName ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PersonRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {item.assignedTechnicianName}
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

export default function DashboardPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [followUpTickets, setFollowUpTickets] = useState<DashboardTicketItem[]>([]);
  const [reviewTickets, setReviewTickets] = useState<DashboardTicketItem[]>([]);

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
              readyToBillAt: d.billing?.readyToBillAt ?? null,
            } as DashboardTicketItem;
          })
          .sort(ticketSort);

        setReviewTickets(items);
      },
      () => setReviewTickets([])
    );

    return () => {
      unsubFollowUp();
      unsubReview();
    };
  }, []);

  const attentionCount = useMemo(() => {
    return new Set([
      ...followUpTickets.map((x) => x.id),
      ...reviewTickets.map((x) => x.id),
    ]).size;
  }, [followUpTickets, reviewTickets]);

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
                        sx={{ mt: 1, maxWidth: 880 }}
                      >
                        This dashboard surfaces the service tickets that need office follow-up
                        or billing review so nothing gets buried in the day-to-day workflow.
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

            {attentionCount === 0 ? (
              <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                Nice — there are no current office attention items in the service workflow.
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" },
              }}
            >
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
            </Box>

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
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}