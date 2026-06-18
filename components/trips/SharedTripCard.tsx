// components/trips/SharedTripCard.tsx
"use client";

import * as React from "react";
import {
  Box,
  Card,
  CardActionArea,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import PlumbingRoundedIcon from "@mui/icons-material/PlumbingRounded";
import SquareFootRoundedIcon from "@mui/icons-material/SquareFootRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";
import { getTripStatusTone } from "../../src/lib/trip-status-ui";

type SharedTripCardProps = {
  title: string;
  status?: string;
  tripType?: string;
  titleMeta?: React.ReactNode;
  subtitle?: React.ReactNode;
  customerLine?: React.ReactNode;
  progressText?: React.ReactNode;
  crewChips?: React.ReactNode;
  detailBlock?: React.ReactNode;
  followUpBlock?: React.ReactNode;
  footer?: React.ReactNode;
  trailingContent?: React.ReactNode;
  titleSuffix?: React.ReactNode;
  cardBorderRadius?: number;
  onClick?: () => void;
};

function splitCustomerLine(customerLine: React.ReactNode) {
  if (typeof customerLine !== "string") {
    return {
      customer: customerLine,
      address: null as React.ReactNode,
    };
  }

  const parts = customerLine
    .split(" — ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return {
      customer: customerLine,
      address: null as React.ReactNode,
    };
  }

  return {
    customer: parts[0],
    address: parts.slice(1).join(" — "),
  };
}

export default function SharedTripCard({
  title,
  status,
  tripType,
  titleMeta,
  subtitle,
  customerLine,
  progressText,
  crewChips,
  detailBlock,
  followUpBlock,
  footer,
  trailingContent,
  titleSuffix,
  cardBorderRadius,
  onClick,
}: SharedTripCardProps) {
  const theme = useTheme();
  const cleanStatus = String(status || "").trim();
  const showStatusChip = Boolean(cleanStatus);
  const tone = showStatusChip ? getTripStatusTone(theme, cleanStatus) : null;

  const type = String(tripType || "").toLowerCase();
  const isProject = type === "project";
  const isService = type === "service";

  const customerParts = splitCustomerLine(customerLine);
  const hasCustomer = Boolean(customerLine);
  const hasAddress = Boolean(customerParts.address);
  const showProjectTypeRow = isProject;

  const hasMetaRows = Boolean(
    subtitle || hasCustomer || hasAddress || progressText || showProjectTypeRow,
  );
  const hasInlineDetails = Boolean(detailBlock || followUpBlock);
  const hasFooter = Boolean(footer);
  const hasTrailing = showStatusChip || Boolean(trailingContent);

  const iconBg = isProject
    ? alpha("#F59E0B", theme.palette.mode === "dark" ? 0.18 : 0.12)
    : isService
      ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.1)
      : alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.1);

  const iconColor = isProject
    ? "#FFD89C"
    : isService
      ? theme.palette.primary.light
      : theme.palette.primary.light;

  const TripTypeIcon = isProject ? SquareFootRoundedIcon : PlumbingRoundedIcon;

  const mainContent = (
    <Box
      sx={{
        px: { xs: 2, md: 2.25 },
        py: { xs: 1.75, md: 2 },
      }}
    >
      <Stack spacing={0}>
        <Stack
          direction="row"
          spacing={1.4}
          alignItems="flex-start"
          justifyContent="space-between"
          sx={{ minWidth: 0 }}
        >
          <Stack
            direction="row"
            spacing={{ xs: 1.35, md: 1.5 }}
            alignItems="flex-start"
            sx={{ minWidth: 0, flex: 1 }}
          >
            <Box
              sx={{
                width: { xs: 52, md: 50 },
                height: { xs: 52, md: 50 },
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                backgroundColor: iconBg,
                color: iconColor,
                border: `1px solid ${alpha(iconColor, 0.08)}`,
              }}
            >
              <TripTypeIcon sx={{ fontSize: { xs: 24, md: 23 } }} />
            </Box>

            <Box sx={{ minWidth: 0, flex: 1, pt: 0.15 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 850,
                    lineHeight: 1.16,
                    letterSpacing: "-0.02em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {title}
                </Typography>

                {titleSuffix ? (
                  <Box sx={{ display: "inline-flex", flexShrink: 0 }}>{titleSuffix}</Box>
                ) : null}
              </Stack>

              {titleMeta ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.45,
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.25,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {titleMeta}
                </Typography>
              ) : null}
            </Box>
          </Stack>

          {hasTrailing ? (
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              justifyContent="flex-end"
              flexWrap="wrap"
              useFlexGap
              sx={{ rowGap: 0.75, flexShrink: 0, maxWidth: "45%" }}
            >
              {showStatusChip && tone ? (
                <Chip
                  size="small"
                  label={tone.label}
                  sx={{
                    height: 24,
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 800,
                    px: 0.25,
                    color: tone.color,
                    backgroundColor: tone.bg,
                    border: `1px solid ${tone.border}`,
                    textTransform: "capitalize",
                  }}
                />
              ) : null}

              {trailingContent ? trailingContent : null}
            </Stack>
          ) : null}
        </Stack>

        {hasMetaRows ? (
          <Stack spacing={0.75} sx={{ mt: 1.15, pl: { xs: "66px", md: "64px" } }}>
            {subtitle ? (
              <Stack direction="row" spacing={0.85} alignItems="center" sx={{ minWidth: 0 }}>
                <ScheduleRoundedIcon sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }} noWrap>
                  {subtitle}
                </Typography>
              </Stack>
            ) : null}

            {showProjectTypeRow ? (
              <Stack direction="row" spacing={0.85} alignItems="center" sx={{ minWidth: 0 }}>
                <WorkRoundedIcon sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }} noWrap>
                  Project
                </Typography>
              </Stack>
            ) : null}

            {hasCustomer ? (
              <Stack direction="row" spacing={0.85} alignItems="center" sx={{ minWidth: 0 }}>
                <PersonRoundedIcon sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }} noWrap>
                  {customerParts.customer}
                </Typography>
              </Stack>
            ) : null}

            {hasAddress ? (
              <Stack direction="row" spacing={0.85} alignItems="center" sx={{ minWidth: 0 }}>
                <LocationOnRoundedIcon sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }} noWrap>
                  {customerParts.address}
                </Typography>
              </Stack>
            ) : null}

            {progressText ? (
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                {progressText}
              </Typography>
            ) : null}
          </Stack>
        ) : null}

        {crewChips ? <Box sx={{ mt: 1.35 }}>{crewChips}</Box> : null}

        {hasInlineDetails ? (
          <Stack
            spacing={1.2}
            sx={{
              mt: 1.35,
              pt: 1.35,
              borderTop: `1px solid ${alpha("#FFFFFF", 0.08)}`,
            }}
          >
            {detailBlock ? detailBlock : null}
            {followUpBlock ? followUpBlock : null}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: cardBorderRadius ?? { xs: 3, md: 2.25 },
        overflow: "hidden",
        borderColor: alpha("#FFFFFF", theme.palette.mode === "dark" ? 0.09 : 0.14),
        backgroundColor:
          theme.palette.mode === "dark"
            ? alpha(theme.palette.background.paper, 0.86)
            : theme.palette.background.paper,
        backgroundImage:
          theme.palette.mode === "dark"
            ? `linear-gradient(135deg, ${alpha(theme.palette.common.white, 0.035)} 0%, ${alpha(
                theme.palette.common.white,
                0.012,
              )} 100%)`
            : "none",
        boxShadow: "none",
        transition: "border-color 160ms ease, transform 160ms ease, background-color 160ms ease",
        ...(onClick
          ? {
              cursor: "pointer",
              "&:hover": {
                borderColor: alpha(theme.palette.primary.main, 0.26),
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? alpha(theme.palette.background.paper, 0.94)
                    : theme.palette.background.paper,
              },
            }
          : {}),
      }}
    >
      {onClick ? (
        <CardActionArea
          onClick={onClick}
          sx={{
            display: "block",
            "& .MuiCardActionArea-focusHighlight": {
              backgroundColor: alpha(theme.palette.primary.main, 0.12),
            },
          }}
        >
          {mainContent}
        </CardActionArea>
      ) : (
        mainContent
      )}

      {hasFooter ? (
        <>
          <Divider sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />
          <Box
            sx={{
              px: { xs: 2, md: 2.25 },
              py: { xs: 1.5, md: 1.75 },
            }}
          >
            {footer}
          </Box>
        </>
      ) : null}
    </Card>
  );
}
