"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Fab,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  SwipeableDrawer,
  Typography,
  Zoom,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import AccessTimeFilledRoundedIcon from "@mui/icons-material/AccessTimeFilledRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ArrowForwardIosRoundedIcon from "@mui/icons-material/ArrowForwardIosRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";

type QuickCreateRole =
  | "admin"
  | "manager"
  | "dispatcher"
  | "billing"
  | "office_display"
  | "technician"
  | "helper"
  | "apprentice"
  | string
  | undefined;

type QuickCreateContext = {
  type: "customer" | "service_ticket" | "project" | null;
  id: string | null;
};

type QuickCreateAction = {
  id:
    | "service_ticket"
    | "customer"
    | "project"
    | "time_entry"
    | "material_order"
    | "meeting"
    | "pto";
  label: string;
  description: (context: QuickCreateContext) => string;
  icon: ReactNode;
  roles: string[];
  getHref: (context: QuickCreateContext) => string;
};

type ActiveTripSummary = {
  status: "running" | "paused";
  elapsedMinutes: number;
  primaryLine: string;
  secondaryLine: string;
};

const OFFICE_ROLES = ["admin", "manager", "dispatcher"];
const FIELD_ROLES = ["technician", "helper", "apprentice"];

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function appendQuery(
  pathname: string,
  params: Record<string, string | null | undefined>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const normalized = safeTrim(value);
    if (normalized) searchParams.set(key, normalized);
  });

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function getQuickCreateContext(pathname: string): QuickCreateContext {
  const customerMatch = pathname.match(/^\/customers\/([^/]+)(?:\/|$)/);
  if (customerMatch && customerMatch[1] !== "new") {
    return { type: "customer", id: customerMatch[1] };
  }

  const ticketMatch = pathname.match(/^\/service-tickets\/([^/]+)(?:\/|$)/);
  if (ticketMatch && ticketMatch[1] !== "new") {
    return { type: "service_ticket", id: ticketMatch[1] };
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/);
  if (projectMatch && projectMatch[1] !== "new") {
    return { type: "project", id: projectMatch[1] };
  }

  return { type: null, id: null };
}

const quickCreateActions: QuickCreateAction[] = [
  {
    id: "service_ticket",
    label: "Service Ticket",
    description: (context) =>
      context.type === "customer"
        ? "Create a service request for this customer"
        : "Create a new service request",
    icon: <ReceiptLongRoundedIcon />,
    roles: [
      "admin",
      "manager",
      "dispatcher",
      "billing",
      "technician",
      "helper",
      "apprentice",
    ],
    getHref: (context) =>
      appendQuery("/service-tickets/new", {
        customerId: context.type === "customer" ? context.id : null,
        sourceTicketId:
          context.type === "service_ticket" ? context.id : null,
        projectId: context.type === "project" ? context.id : null,
        quickCreate: "1",
      }),
  },
  {
    id: "customer",
    label: "Customer",
    description: () => "Add a new customer",
    icon: <PersonAddAlt1RoundedIcon />,
    roles: [
      "admin",
      "manager",
      "dispatcher",
      "billing",
      "technician",
      "helper",
      "apprentice",
    ],
    getHref: () => appendQuery("/customers/new", { quickCreate: "1" }),
  },
  {
    id: "project",
    label: "Project",
    description: (context) =>
      context.type === "customer"
        ? "Create a project for this customer"
        : "Create a new project",
    icon: <FolderRoundedIcon />,
    roles: OFFICE_ROLES,
    getHref: (context) =>
      appendQuery("/projects/new", {
        customerId: context.type === "customer" ? context.id : null,
        sourceTicketId:
          context.type === "service_ticket" ? context.id : null,
        quickCreate: "1",
      }),
  },
  {
    id: "time_entry",
    label: "Time Entry",
    description: () => "Add an entry to this week’s timesheet",
    icon: <AccessTimeFilledRoundedIcon />,
    roles: [...OFFICE_ROLES, ...FIELD_ROLES],
    getHref: (context) =>
        appendQuery("/time-entries/new", {
            serviceTicketId:
            context.type === "service_ticket" ? context.id : null,
            projectId:
            context.type === "project" ? context.id : null,
            quickCreate: "1",
        }),
  },
  {
    id: "material_order",
    label: "Material Order",
    description: (context) =>
      context.type
        ? "Create a material order linked here"
        : "Create a materials-only order",
    icon: <Inventory2RoundedIcon />,
    roles: ["admin", "manager", "dispatcher", "billing"],
    getHref: (context) =>
      appendQuery("/material-orders/new", {
        quickCreate: "1",
        customerId: context.type === "customer" ? context.id : null,
        serviceTicketId:
          context.type === "service_ticket" ? context.id : null,
        projectId: context.type === "project" ? context.id : null,
      }),
  },
  {
    id: "meeting",
    label: "Meeting",
    description: () => "Open new meeting setup",
    icon: <GroupsRoundedIcon />,
    roles: OFFICE_ROLES,
    getHref: () =>
      appendQuery("/schedule", {
        quickCreate: "meeting",
      }),
  },
  {
    id: "pto",
    label: "PTO Request",
    description: () => "Request time away",
    icon: <BeachAccessRoundedIcon />,
    roles: [...OFFICE_ROLES, ...FIELD_ROLES],
    getHref: () =>
      appendQuery("/pto-requests", {
        quickCreate: "1",
      }),
  },
];

function QuickCreateActionRow({
  action,
  context,
  index,
  opening,
  onClick,
}: {
  action: QuickCreateAction;
  context: QuickCreateContext;
  index: number;
  opening: boolean;
  onClick: () => void;
}) {
  const theme = useTheme();

  return (
    <ListItemButton
      onClick={onClick}
      sx={{
        minHeight: 64,
        px: 1.25,
        py: 0.75,
        borderRadius: 2.5,
        opacity: opening ? 1 : 0,
        transform: opening
          ? "translateY(0) scale(1)"
          : "translateY(14px) scale(0.98)",
        transition: `opacity 260ms ease ${70 + index * 42}ms,
          transform 400ms cubic-bezier(0.2, 1.28, 0.3, 1) ${
            70 + index * 42
          }ms`,
        "&:hover": {
          backgroundColor: alpha(theme.palette.primary.main, 0.07),
        },
        "&:active": {
          transform: "scale(0.975)",
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 50 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            color: "primary.main",
            backgroundColor: alpha(theme.palette.primary.main, 0.11),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.13)}`,
          }}
        >
          {action.icon}
        </Box>
      </ListItemIcon>

      <ListItemText
        primary={action.label}
        secondary={action.description(context)}
        primaryTypographyProps={{
          fontWeight: 800,
          fontSize: 14,
        }}
        secondaryTypographyProps={{
          fontSize: 12,
          color: "text.secondary",
        }}
      />

      <ArrowForwardIosRoundedIcon
        sx={{
          ml: 1,
          fontSize: 14,
          color: alpha(theme.palette.text.secondary, 0.7),
        }}
      />
    </ListItemButton>
  );
}

export default function MobileQuickCreate({
  role,
  pathname,
  bottomOffset,
  hidden = false,
  onOpenChange,
  activeTrip,
}: {
  role: QuickCreateRole;
  pathname: string;
  bottomOffset: number;
  hidden?: boolean;
  onOpenChange?: (open: boolean) => void;
  activeTrip?: ActiveTripSummary | null;
}) {
  const router = useRouter();
  const theme = useTheme();

  const [open, setOpen] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  const normalizedRole = safeTrim(role).toLowerCase();

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    if (!open) {
      setContentVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setContentVisible(true);
    }, 35);

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open) changeOpen(false);
    // Close only when the route itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    return () => onOpenChange?.(false);
  }, [onOpenChange]);

  const context = useMemo(
    () => getQuickCreateContext(pathname),
    [pathname],
  );

  const visibleActions = useMemo(
    () =>
      quickCreateActions.filter((action) =>
        action.roles.includes(normalizedRole),
      ),
    [normalizedRole],
  );

  function handleAction(action: QuickCreateAction) {
    const href = action.getHref(context);
    changeOpen(false);

    window.setTimeout(() => {
      router.push(href);
    }, 130);
  }

  if (visibleActions.length === 0) return null;

  const activeTripAccent =
    activeTrip?.status === "paused"
      ? theme.palette.warning.main
      : theme.palette.primary.main;

  return (
    <>
      <Zoom
        in={!hidden && !open}
        timeout={{ enter: 420, exit: 180 }}
        style={{
          transitionDelay: hidden || open ? "0ms" : "100ms",
        }}
      >
        <Fab
          color="primary"
          aria-label="Open Quick Create"
          onClick={() => changeOpen(true)}
          sx={{
            position: "fixed",
            right: 24,
            bottom: `${bottomOffset}px`,
            zIndex: 1204,
            width: 62,
            height: 62,
            color: theme.palette.primary.contrastText,
            backgroundImage: `linear-gradient(
              145deg,
              ${alpha(theme.palette.common.white, 0.16)} 0%,
              transparent 42%
            )`,
            border: `1px solid ${alpha(
              theme.palette.common.white,
              theme.palette.mode === "dark" ? 0.16 : 0.36,
            )}`,
            boxShadow: `0 14px 30px ${alpha(
              theme.palette.primary.main,
              0.4,
            )}, 0 3px 8px ${alpha(theme.palette.common.black, 0.2)}`,
            transition:
              "bottom 380ms cubic-bezier(0.2, 1.22, 0.3, 1), box-shadow 260ms ease, transform 220ms ease",
            animation:
              "dcflowQuickCreateFloat 3.4s ease-in-out infinite",
            "&:hover": {
              backgroundColor: theme.palette.primary.main,
              transform: "translateY(-2px) scale(1.03)",
              boxShadow: `0 18px 38px ${alpha(
                theme.palette.primary.main,
                0.48,
              )}`,
            },
            "&:active": {
              transform: "scale(0.91)",
            },
            "@keyframes dcflowQuickCreateFloat": {
              "0%, 100%": { transform: "translateY(0)" },
              "50%": { transform: "translateY(-4px)" },
            },
          }}
        >
          <AddRoundedIcon sx={{ fontSize: 34 }} />
        </Fab>
      </Zoom>

      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onOpen={() => changeOpen(true)}
        onClose={() => changeOpen(false)}
        disableSwipeToOpen
        ModalProps={{
          keepMounted: true,
          BackdropProps: {
            sx: {
              backgroundColor: alpha(theme.palette.common.black, 0.5),
              backdropFilter: "blur(5px)",
              WebkitBackdropFilter: "blur(5px)",
            },
          },
        }}
        PaperProps={{
          sx: {
            maxHeight: "min(82dvh, 760px)",
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            overflow: "hidden",
            backgroundColor: "background.paper",
            backgroundImage:
              theme.palette.mode === "dark"
                ? `linear-gradient(
                    180deg,
                    ${alpha(theme.palette.primary.main, 0.08)} 0%,
                    ${theme.palette.background.paper} 160px
                  )`
                : `linear-gradient(
                    180deg,
                    ${alpha(theme.palette.primary.main, 0.055)} 0%,
                    ${theme.palette.background.paper} 180px
                  )`,
            boxShadow: `0 -24px 64px ${alpha(
              theme.palette.common.black,
              0.3,
            )}`,
            pb: "calc(12px + env(safe-area-inset-bottom))",
          },
        }}
      >
        <Box
          sx={{
            px: 1.5,
            pt: 1,
            overflowY: "auto",
            overscrollBehaviorY: "contain",
          }}
        >
          <Box
            sx={{
              width: 42,
              height: 5,
              borderRadius: 999,
              mx: "auto",
              mb: 1.25,
              backgroundColor: alpha(theme.palette.text.secondary, 0.24),
            }}
          />

          <Stack
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{
              px: 0.75,
              pb: 1.5,
              opacity: contentVisible ? 1 : 0,
              transform: contentVisible
                ? "translateY(0)"
                : "translateY(10px)",
              transition:
                "opacity 260ms ease 40ms, transform 400ms cubic-bezier(0.2, 1.2, 0.3, 1) 40ms",
            }}
          >
            <Box
              sx={{
                width: 46,
                height: 46,
                borderRadius: 2.5,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                color: "primary.main",
                backgroundColor: alpha(theme.palette.primary.main, 0.12),
                border: `1px solid ${alpha(
                  theme.palette.primary.main,
                  0.16,
                )}`,
              }}
            >
              <AutoAwesomeRoundedIcon />
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                Quick Create
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create what you need in seconds.
              </Typography>
            </Box>

            <IconButton
              aria-label="Close Quick Create"
              onClick={() => changeOpen(false)}
              sx={{
                backgroundColor: alpha(theme.palette.text.primary, 0.045),
              }}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          {activeTrip ? (
            <Paper
              elevation={0}
              sx={{
                mx: 0.75,
                mb: 1.25,
                px: 1.25,
                py: 1,
                borderRadius: 2.5,
                display: "flex",
                alignItems: "center",
                gap: 1,
                border: `1px solid ${alpha(activeTripAccent, 0.24)}`,
                backgroundColor: alpha(activeTripAccent, 0.08),
                opacity: contentVisible ? 1 : 0,
                transform: contentVisible
                  ? "translateY(0)"
                  : "translateY(8px)",
                transition:
                  "opacity 240ms ease 80ms, transform 360ms cubic-bezier(0.2, 1.2, 0.3, 1) 80ms",
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  color: activeTripAccent,
                  backgroundColor: alpha(activeTripAccent, 0.13),
                }}
              >
                {activeTrip.status === "paused" ? (
                  <PauseRoundedIcon fontSize="small" />
                ) : (
                  <PlayArrowRoundedIcon fontSize="small" />
                )}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: activeTripAccent,
                    fontWeight: 900,
                    lineHeight: 1.1,
                  }}
                >
                  Trip timer {activeTrip.status} • {activeTrip.elapsedMinutes} min
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 750 }} noWrap>
                  {activeTrip.primaryLine}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {activeTrip.secondaryLine}
                </Typography>
              </Box>
            </Paper>
          ) : null}

          <Typography
            variant="overline"
            color="text.secondary"
            sx={{
              display: "block",
              px: 1.25,
              pt: 1.25,
              mb: 0.5,
              fontWeight: 900,
              letterSpacing: 0.7,
              lineHeight: 1,
            }}
          >
            Create new
          </Typography>

          <List disablePadding>
            {visibleActions.map((action, index) => (
              <QuickCreateActionRow
                key={action.id}
                action={action}
                context={context}
                index={index}
                opening={contentVisible}
                onClick={() => handleAction(action)}
              />
            ))}
          </List>
        </Box>
      </SwipeableDrawer>
    </>
  );
}