"use client";

import * as React from "react";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PrecisionManufacturingRoundedIcon from "@mui/icons-material/PrecisionManufacturingRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import { getTripStatusTone } from "../../src/lib/trip-status-ui";

type SharedTripCardProps = {
  title: string;
  status?: string;
  tripType?: string;
  subtitle?: React.ReactNode;
  customerLine?: React.ReactNode;
  progressText?: React.ReactNode;
  crewChips?: React.ReactNode;
  detailBlock?: React.ReactNode;
  followUpBlock?: React.ReactNode;
  footer?: React.ReactNode;
  trailingContent?: React.ReactNode;
  titleSuffix?: React.ReactNode;
  onClick?: () => void;
};

export default function SharedTripCard({
  title,
  status,
  tripType,
  subtitle,
  customerLine,
  progressText,
  crewChips,
  detailBlock,
  followUpBlock,
  footer,
  trailingContent,
  titleSuffix,
  onClick,
}: SharedTripCardProps) {
  const theme = useTheme();
  const tone = getTripStatusTone(theme, status);
  const type = String(tripType || "").toLowerCase();
  const isProject = type === "project";

  const content = (
    <CardContent
      sx={{
        p: { xs: 1.25, md: 1.5 },
        "&:last-child": { pb: { xs: 1.25, md: 1.5 } },
      }}
    >
      <Stack spacing={{ xs: 0.9, md: 1 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "flex-start" }}
          justifyContent="space-between"
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
            sx={{ minWidth: 0, flex: 1 }}
          >
            <Box
              sx={{
                width: { xs: 34, md: 36 },
                height: { xs: 34, md: 36 },
                borderRadius: 2,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                backgroundColor: isProject
                  ? alpha("#F59E0B", 0.14)
                  : alpha(theme.palette.primary.main, 0.14),
                color: isProject ? "#FFD89C" : theme.palette.primary.light,
              }}
            >
              {isProject ? (
                <ConstructionRoundedIcon sx={{ fontSize: { xs: 18, md: 19 } }} />
              ) : (
                <PrecisionManufacturingRoundedIcon sx={{ fontSize: { xs: 18, md: 19 } }} />
              )}
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  lineHeight: 1.25,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {title}
                {titleSuffix ? titleSuffix : null}
              </Typography>
            </Box>
          </Stack>

          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Chip
              size="small"
              label={tone.label}
              sx={{
                height: 24,
                borderRadius: 1.5,
                fontSize: 11,
                fontWeight: 600,
                color: tone.color,
                backgroundColor: tone.bg,
                border: `1px solid ${tone.border}`,
              }}
            />
            {trailingContent ? trailingContent : null}
          </Stack>
        </Stack>

        {subtitle ? (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <ScheduleRoundedIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          </Stack>
        ) : null}

        {progressText ? (
          <Typography variant="caption" color="text.secondary">
            {progressText}
          </Typography>
        ) : null}

        {customerLine ? (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <PersonRoundedIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">
              {customerLine}
            </Typography>
          </Stack>
        ) : null}

        {crewChips ? crewChips : null}
        {detailBlock ? detailBlock : null}
        {followUpBlock ? followUpBlock : null}

        {footer ? (
          <Box
            sx={{
              pt: { xs: 1, md: 1.25 },
              borderTop: `1px solid ${alpha("#FFFFFF", 0.08)}`,
            }}
          >
            {footer}
          </Box>
        ) : null}
      </Stack>
    </CardContent>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: alpha("#FFFFFF", 0.08),
      }}
    >
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ borderRadius: 2 }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );
}