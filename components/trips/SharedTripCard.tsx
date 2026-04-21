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
import PrecisionManufacturingRoundedIcon from "@mui/icons-material/PrecisionManufacturingRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
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
  onClick?: () => void;
};

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
  onClick,
}: SharedTripCardProps) {
  const theme = useTheme();
  const tone = getTripStatusTone(theme, status);
  const type = String(tripType || "").toLowerCase();
  const isProject = type === "project";

  const hasMetaRows = Boolean(subtitle || customerLine || progressText);
  const hasInlineDetails = Boolean(detailBlock || followUpBlock);
  const hasFooter = Boolean(footer);

  const mainContent = (
    <Box
      sx={{
        px: { xs: 2, md: 2.25 },
        py: { xs: 1.75, md: 2 },
      }}
    >
      <Stack spacing={0}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.25}
          alignItems={{ xs: "flex-start", sm: "flex-start" }}
          justifyContent="space-between"
        >
          <Stack
            direction="row"
            spacing={1.25}
            alignItems="flex-start"
            sx={{ minWidth: 0, flex: 1 }}
          >
            <Box
              sx={{
                width: { xs: 40, md: 42 },
                height: { xs: 40, md: 42 },
                borderRadius: 2.5,
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
                <ConstructionRoundedIcon sx={{ fontSize: { xs: 20, md: 21 } }} />
              ) : (
                <PrecisionManufacturingRoundedIcon sx={{ fontSize: { xs: 20, md: 21 } }} />
              )}
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 800,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
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

              {titleMeta ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.45,
                    fontSize: 13,
                    fontWeight: 400,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    whiteSpace: "normal",
                  }}
                >
                  {titleMeta}
                </Typography>
              ) : null}
            </Box>
          </Stack>

          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ rowGap: 0.75 }}
          >
            <Chip
              size="small"
              label={tone.label}
              sx={{
                height: 24,
                borderRadius: 1.5,
                fontSize: 11,
                fontWeight: 700,
                color: tone.color,
                backgroundColor: tone.bg,
                border: `1px solid ${tone.border}`,
              }}
            />
            {trailingContent ? trailingContent : null}
          </Stack>
        </Stack>

        {hasMetaRows ? (
          <Stack spacing={0.85} sx={{ mt: 1.35 }}>
            {subtitle ? (
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ScheduleRoundedIcon sx={{ fontSize: 15, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              </Stack>
            ) : null}

            {customerLine ? (
              <Stack direction="row" spacing={0.75} alignItems="center">
                <PersonRoundedIcon sx={{ fontSize: 15, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {customerLine}
                </Typography>
              </Stack>
            ) : null}

            {progressText ? (
              <Typography variant="caption" color="text.secondary">
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
        borderRadius: 1.2,
        overflow: "hidden",
        borderColor: alpha("#FFFFFF", 0.08),
        backgroundColor: "background.paper",
        transition: "border-color 160ms ease, transform 160ms ease",
        ...(onClick
          ? {
              "&:hover": {
                borderColor: alpha(theme.palette.primary.main, 0.22),
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