// components/DispatchAvailabilityPlanner.tsx
"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

export type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

export type PlannerSlotStatusKind =
  | "available"
  | "approved_pto"
  | "pending_pto"
  | "holiday"
  | "overlap";

export type PlannerSlotTooltipItem = {
  tripId: string;
  tripType: "service" | "project" | "trip";
  title: string;
  subtitle?: string;
  estimatedDurationLabel: string;
};

export type PlannerSlotStatus = {
  kind: PlannerSlotStatusKind;
  label: string;
  detail?: string;
  disabled: boolean;
  tooltipItems?: PlannerSlotTooltipItem[];
};

export type PlannerCrewSummaryReason = {
  kind: PlannerSlotStatusKind;
  label: string;
  detail: string;
};

export type PlannerCrewSummary = {
  uid: string;
  name: string;
  reasons: PlannerCrewSummaryReason[];
};

type Props = {
  date: string;
  technicians: Array<{ uid: string; displayName: string }>;
  slotStatusByTech: Record<
    string,
    {
      am: PlannerSlotStatus;
      pm: PlannerSlotStatus;
      all_day: PlannerSlotStatus;
    }
  >;
  selectedPrimaryUid: string;
  selectedWindow: TripTimeWindow;
  selectedCrewSummary: PlannerCrewSummary[];
  holidayNames: string[];
  holidayOverrideEnabled: boolean;
  canOverrideHoliday: boolean;
  onHolidayOverrideChange: (checked: boolean) => void;
  onPickSlot: (uid: string, window: Exclude<TripTimeWindow, "custom">) => void;
};

const slotDefs: Array<{
  key: Exclude<TripTimeWindow, "custom">;
  label: string;
  timeLabel: string;
}> = [
  { key: "am", label: "AM", timeLabel: "8AM–12PM" },
  { key: "pm", label: "PM", timeLabel: "1PM–5PM" },
  { key: "all_day", label: "All Day", timeLabel: "8AM–5PM" },
];

const defaultStatus: PlannerSlotStatus = {
  kind: "available",
  label: "Open",
  disabled: false,
};

function canPickSlot(status: PlannerSlotStatus) {
  return (
    status.kind === "available" ||
    status.kind === "pending_pto" ||
    status.kind === "overlap"
  );
}

function slotButtonCopy(status: PlannerSlotStatus) {
  if (status.kind === "available") return status.label;
  if (status.kind === "pending_pto") return "Pending PTO";
  if (status.kind === "holiday") return "Holiday";
  if (status.kind === "approved_pto") return "PTO";
  return "Booked • Override";
}

function slotButtonSubcopy(status: PlannerSlotStatus) {
  if (status.kind === "available") return "Tap to assign";
  if (status.kind === "pending_pto") return "Tap to assign";
  if (status.kind === "overlap") return "Hover details • Tap to override";
  if (status.kind === "holiday") return "Blocked";
  if (status.kind === "approved_pto") return "Hover details";
  return "";
}

function slotButtonStyles(args: {
  selected: boolean;
  status: PlannerSlotStatus;
  palette: Theme["palette"];
  isAllDay?: boolean;
}) {
  const { selected, status, palette, isAllDay } = args;

  if (status.kind === "available") {
    return {
      color: selected ? palette.primary.contrastText : palette.text.primary,
      bgcolor: selected ? palette.primary.main : alpha(palette.primary.main, 0.04),
      borderColor: alpha(palette.primary.main, selected ? 1 : 0.28),
      boxShadow: isAllDay
        ? `0 0 0 1px ${alpha(palette.primary.main, selected ? 0.3 : 0.12)}`
        : "none",
      "&:hover": {
        bgcolor: selected ? palette.primary.dark : alpha(palette.primary.main, 0.08),
        borderColor: palette.primary.main,
      },
    };
  }

  if (status.kind === "pending_pto") {
    return {
      color: selected ? palette.warning.contrastText : palette.warning.dark,
      bgcolor: selected
        ? palette.warning.main
        : alpha(palette.warning.main, 0.08),
      borderColor: alpha(palette.warning.main, selected ? 1 : 0.34),
      "&:hover": {
        bgcolor: selected
          ? palette.warning.dark
          : alpha(palette.warning.main, 0.14),
        borderColor: palette.warning.main,
      },
    };
  }

  if (status.kind === "overlap") {
    return {
      color: selected ? palette.error.contrastText : palette.error.dark,
      bgcolor: selected ? palette.error.main : alpha(palette.error.main, 0.08),
      borderColor: alpha(palette.error.main, selected ? 1 : 0.36),
      boxShadow: isAllDay
        ? `0 0 0 1px ${alpha(palette.error.main, selected ? 0.3 : 0.12)}`
        : "none",
      "&:hover": {
        bgcolor: selected ? palette.error.dark : alpha(palette.error.main, 0.14),
        borderColor: palette.error.main,
      },
    };
  }

  if (status.kind === "holiday") {
    return {
      color: palette.warning.dark,
      bgcolor: alpha(palette.warning.main, selected ? 0.16 : 0.08),
      borderColor: alpha(palette.warning.main, 0.38),
      opacity: 0.8,
      "&:hover": {
        bgcolor: alpha(palette.warning.main, 0.16),
        borderColor: palette.warning.main,
      },
    };
  }

  return {
    color: palette.error.dark,
    bgcolor: alpha(palette.error.main, 0.08),
    borderColor: alpha(palette.error.main, 0.3),
    opacity: 0.8,
    "&:hover": {
      bgcolor: alpha(palette.error.main, 0.1),
      borderColor: alpha(palette.error.main, 0.4),
    },
  };
}

function getInlineStatusIcon(status: PlannerSlotStatus) {
  if (status.kind === "approved_pto") {
    return <EventBusyRoundedIcon sx={{ fontSize: 16 }} />;
  }
  if (status.kind === "pending_pto") {
    return <WarningAmberRoundedIcon sx={{ fontSize: 16 }} />;
  }
  if (status.kind === "overlap") {
    return <ErrorOutlineRoundedIcon sx={{ fontSize: 16 }} />;
  }
  if (status.kind === "holiday") {
    return <WarningAmberRoundedIcon sx={{ fontSize: 16 }} />;
  }
  return null;
}

function getTooltipTripIcon(item: PlannerSlotTooltipItem) {
  if (item.tripType === "service") {
    return <BuildRoundedIcon sx={{ fontSize: 15, color: "primary.main" }} />;
  }
  if (item.tripType === "project") {
    return (
      <ConstructionRoundedIcon sx={{ fontSize: 15, color: "secondary.main" }} />
    );
  }
  return <ScheduleRoundedIcon sx={{ fontSize: 15, color: "text.secondary" }} />;
}

function renderTooltipContent(status: PlannerSlotStatus) {
  if (status.kind === "overlap" && status.tooltipItems && status.tooltipItems.length > 0) {
    return (
      <Stack spacing={0.75} sx={{ py: 0.2, minWidth: 220 }}>
        {status.tooltipItems.map((item) => (
          <Stack
            key={item.tripId}
            direction="row"
            spacing={0.75}
            alignItems="flex-start"
          >
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 0,
                mt: "2px",
              }}
            >
              {getTooltipTripIcon(item)}
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" fontWeight={800} sx={{ lineHeight: 1.1 }}>
                {item.title}
              </Typography>

              {item.subtitle ? (
                <Typography
                  variant="caption"
                  sx={{ lineHeight: 1.1, opacity: 0.9, display: "block" }}
                >
                  {item.subtitle}
                </Typography>
              ) : null}

              <Typography
                variant="caption"
                sx={{ lineHeight: 1.1, opacity: 0.85, display: "block" }}
              >
                Est. {item.estimatedDurationLabel}
              </Typography>
            </Box>
          </Stack>
        ))}

        <Typography variant="caption" sx={{ lineHeight: 1.1, opacity: 0.9, pt: 0.25 }}>
          Tap to override
        </Typography>
      </Stack>
    );
  }

  if (status.kind === "approved_pto") {
    return (
      <Stack spacing={0.35} sx={{ py: 0.2 }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <EventBusyRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="caption" fontWeight={800} sx={{ lineHeight: 1.1 }}>
            {status.detail ? `PTO • ${status.detail}` : "PTO"}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ lineHeight: 1.1, opacity: 0.9 }}>
          Paid Time Off
        </Typography>
      </Stack>
    );
  }

  if (status.kind === "pending_pto") {
    return (
      <Stack spacing={0.35} sx={{ py: 0.2 }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <WarningAmberRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="caption" fontWeight={800} sx={{ lineHeight: 1.1 }}>
            {status.detail ? `Pending PTO • ${status.detail}` : "Pending PTO"}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ lineHeight: 1.1, opacity: 0.9 }}>
          Tap to assign
        </Typography>
      </Stack>
    );
  }

  if (status.kind === "holiday") {
    return (
      <Stack spacing={0.35} sx={{ py: 0.2 }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <WarningAmberRoundedIcon sx={{ fontSize: 15 }} />
          <Typography variant="caption" fontWeight={800} sx={{ lineHeight: 1.1 }}>
            {status.detail ? `Holiday • ${status.detail}` : "Holiday"}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ lineHeight: 1.1, opacity: 0.9 }}>
          Company holiday
        </Typography>
      </Stack>
    );
  }

  return null;
}

export default function DispatchAvailabilityPlanner(props: Props) {
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, md: 2 },
        borderRadius: 4,
        backgroundColor: alpha(theme.palette.primary.main, 0.03),
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={800}>
            Choose a Tech / Time Block
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Open slots assign normally. Booked slots can still be selected for dispatch
            override on service work. Approved PTO and company holidays remain blocked.
          </Typography>
        </Box>

        <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
          Red booked slots are selectable for override. PTO blocks now show a PTO icon
          and explicit hover detail.
        </Alert>

        {props.holidayNames.length > 0 ? (
          <Alert
            severity={props.holidayOverrideEnabled ? "success" : "warning"}
            icon={
              props.holidayOverrideEnabled ? (
                <CheckCircleRoundedIcon />
              ) : (
                <WarningAmberRoundedIcon />
              )
            }
            variant="outlined"
            sx={{ borderRadius: 3 }}
          >
            {props.holidayOverrideEnabled
              ? `Holiday override enabled for ${props.holidayNames.join(", ")}.`
              : `Selected day falls on ${props.holidayNames.join(
                  ", "
                )}. Scheduling stays blocked until Holiday Override is explicitly enabled.`}
          </Alert>
        ) : null}

        {props.holidayNames.length > 0 && props.canOverrideHoliday ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={props.holidayOverrideEnabled}
                onChange={(e) => props.onHolidayOverrideChange(e.target.checked)}
              />
            }
            label="Override holiday conflict for this trip"
          />
        ) : null}

        <Stack spacing={1.25}>
          {props.technicians.map((tech) => {
            const statuses = props.slotStatusByTech[tech.uid] || {
              am: defaultStatus,
              pm: defaultStatus,
              all_day: defaultStatus,
            };

            return (
              <Paper
                key={tech.uid}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  borderColor:
                    props.selectedPrimaryUid === tech.uid
                      ? alpha(theme.palette.primary.main, 0.5)
                      : "divider",
                }}
              >
                <Stack spacing={1.25}>
                  <Box>
                    <Typography variant="body1" fontWeight={800}>
                      {tech.displayName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {props.date || "Choose a date"}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      gap: 1,
                    }}
                  >
                    {slotDefs.map((slot) => {
                      const status = statuses[slot.key] || defaultStatus;
                      const selected =
                        props.selectedPrimaryUid === tech.uid &&
                        props.selectedWindow === slot.key;
                      const isAllDay = slot.key === "all_day";
                      const pickable =
                        Boolean(props.date) && canPickSlot(status) && !status.disabled;
                      const tooltipContent = renderTooltipContent(status);

                      const buttonNode = (
                        <Button
                          variant="outlined"
                          disabled={!pickable}
                          onClick={() => props.onPickSlot(tech.uid, slot.key)}
                          sx={{
                            width: "100%",
                            minWidth: 0,
                            minHeight: isAllDay ? 72 : 58,
                            gridColumn: isAllDay ? { xs: "1 / -1", sm: "1 / -1" } : "auto",
                            borderRadius: isAllDay ? 4 : 999,
                            textTransform: "none",
                            alignItems: "stretch",
                            justifyContent: "flex-start",
                            px: isAllDay ? 2 : 1.5,
                            py: isAllDay ? 1.35 : 1.1,
                            ...slotButtonStyles({
                              selected,
                              status,
                              palette: theme.palette,
                              isAllDay,
                            }),
                          }}
                        >
                          <Stack
                            spacing={0.2}
                            alignItems="flex-start"
                            sx={{ textAlign: "left", width: "100%" }}
                          >
                            <Typography
                              variant={isAllDay ? "body2" : "caption"}
                              fontWeight={800}
                              sx={{ lineHeight: 1.1 }}
                            >
                              {slot.label} • {slot.timeLabel}
                            </Typography>

                            <Stack direction="row" spacing={0.6} alignItems="center">
                              {getInlineStatusIcon(status) ? (
                                <Box
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    lineHeight: 0,
                                  }}
                                >
                                  {getInlineStatusIcon(status)}
                                </Box>
                              ) : null}

                              <Typography
                                variant="caption"
                                fontWeight={700}
                                sx={{ lineHeight: 1.1 }}
                              >
                                {slotButtonCopy(status)}
                              </Typography>
                            </Stack>

                            {slotButtonSubcopy(status) ? (
                              <Typography
                                variant="caption"
                                sx={{
                                  lineHeight: 1.1,
                                  opacity: selected ? 0.95 : 0.8,
                                }}
                              >
                                {slotButtonSubcopy(status)}
                              </Typography>
                            ) : null}
                          </Stack>
                        </Button>
                      );

                      return tooltipContent ? (
                        <Tooltip
                          key={`${tech.uid}_${slot.key}`}
                          title={tooltipContent}
                          arrow
                          placement="top"
                          enterDelay={120}
                        >
                          <Box sx={{ width: "100%", display: "block" }}>{buttonNode}</Box>
                        </Tooltip>
                      ) : (
                        <Box
                          key={`${tech.uid}_${slot.key}`}
                          sx={{ width: "100%", display: "block" }}
                        >
                          {buttonNode}
                        </Box>
                      );
                    })}
                  </Box>
                </Stack>
              </Paper>
            );
          })}
        </Stack>

        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScheduleRoundedIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" fontWeight={800}>
                Live Availability Check
              </Typography>
            </Stack>

            {props.selectedCrewSummary.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Pick the day, time block, and crew. Availability details appear here
                immediately.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {props.selectedCrewSummary.map((member) => {
                  const approved = member.reasons.find(
                    (reason) => reason.kind === "approved_pto"
                  );
                  const overlap = member.reasons.find(
                    (reason) => reason.kind === "overlap"
                  );
                  const holiday = member.reasons.find(
                    (reason) => reason.kind === "holiday"
                  );
                  const pending = member.reasons.find(
                    (reason) => reason.kind === "pending_pto"
                  );

                  let severity: "success" | "warning" | "error" = "success";
                  let icon = <CheckCircleRoundedIcon />;
                  let body = "Available for the selected slot.";

                  if (approved) {
                    severity = "error";
                    icon = <EventBusyRoundedIcon />;
                    body = `Paid Time Off • ${approved.detail}`;
                  } else if (overlap) {
                    severity = "warning";
                    icon = <WarningAmberRoundedIcon />;
                    body = `${overlap.label} • ${overlap.detail} • Dispatch override available`;
                  } else if (holiday) {
                    severity = "warning";
                    icon = <WarningAmberRoundedIcon />;
                    body = `${holiday.label} • ${holiday.detail}`;
                  } else if (pending) {
                    severity = "warning";
                    icon = <WarningAmberRoundedIcon />;
                    body = `Pending PTO request • ${pending.detail}`;
                  }

                  return (
                    <Alert
                      key={member.uid}
                      severity={severity}
                      icon={icon}
                      variant="outlined"
                      sx={{ borderRadius: 3 }}
                    >
                      <strong>{member.name}</strong> — {body}
                    </Alert>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </Paper>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            icon={<EventBusyRoundedIcon />}
            label="Approved PTO = blocked"
            color="error"
            variant="outlined"
          />
          <Chip
            icon={<ErrorOutlineRoundedIcon />}
            label="Overlap = selectable override"
            color="warning"
            variant="outlined"
          />
          <Chip
            icon={<WarningAmberRoundedIcon />}
            label="Holiday = explicit override"
            color="warning"
            variant="outlined"
          />
          <Chip
            icon={<WarningAmberRoundedIcon />}
            label="Pending PTO = note only"
            color="warning"
            variant="outlined"
          />
        </Stack>
      </Stack>
    </Paper>
  );
}