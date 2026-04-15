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
  Typography,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
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

export type PlannerSlotStatus = {
  kind: PlannerSlotStatusKind;
  label: string;
  detail?: string;
  disabled: boolean;
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

function slotButtonCopy(status: PlannerSlotStatus) {
  if (status.kind === "available") return status.label;
  if (status.kind === "pending_pto") return "Pending PTO";
  if (status.kind === "holiday") return "Holiday";
  if (status.kind === "approved_pto") return "PTO";
  return "Booked";
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
      color: palette.warning.dark,
      bgcolor: alpha(palette.warning.main, 0.08),
      borderColor: alpha(palette.warning.main, 0.34),
      "&:hover": {
        bgcolor: alpha(palette.warning.main, 0.14),
        borderColor: palette.warning.main,
      },
    };
  }

  if (status.kind === "holiday") {
    return {
      color: palette.warning.dark,
      bgcolor: alpha(palette.warning.main, selected ? 0.16 : 0.08),
      borderColor: alpha(palette.warning.main, 0.38),
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
    opacity: 0.72,
    "&:hover": {
      bgcolor: alpha(palette.error.main, 0.1),
      borderColor: alpha(palette.error.main, 0.4),
    },
  };
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
            Choose an Open Tech / Time Block
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            AM and PM are half-day options. All Day is intentionally larger so dispatch
            can instantly see it reserves the full day.
          </Typography>
        </Box>

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

                      return (
                        <Button
                          key={`${tech.uid}_${slot.key}`}
                          variant="outlined"
                          disabled={!props.date || status.disabled}
                          onClick={() => props.onPickSlot(tech.uid, slot.key)}
                          sx={{
                            minHeight: isAllDay ? 68 : 56,
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
                            <Typography
                              variant="caption"
                              fontWeight={700}
                              sx={{ lineHeight: 1.1 }}
                            >
                              {slotButtonCopy(status)}
                            </Typography>
                          </Stack>
                        </Button>
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
                    body = `Approved PTO • ${approved.detail}`;
                  } else if (overlap) {
                    severity = "error";
                    icon = <ErrorOutlineRoundedIcon />;
                    body = `${overlap.label} • ${overlap.detail}`;
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
          <Chip label="Approved PTO = blocked" color="error" variant="outlined" />
          <Chip label="Overlap = blocked" color="error" variant="outlined" />
          <Chip label="Holiday = explicit override" color="warning" variant="outlined" />
          <Chip label="Pending PTO = note only" color="warning" variant="outlined" />
        </Stack>
      </Stack>
    </Paper>
  );
}