"use client";

import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { buildGoogleMapsEmbedSrc } from "../../src/lib/service-ticket-map";

type Props = {
  customerName?: string | null;
  mapsAddress: string;
  mapsHref: string;
  preferAppleMaps: boolean;
};

export default function ServiceTicketMapPreview({
  customerName,
  mapsAddress,
  mapsHref,
  preferAppleMaps,
}: Props) {
  const theme = useTheme();

  const embedSrc = buildGoogleMapsEmbedSrc(mapsAddress);
  const mapsTarget = preferAppleMaps ? undefined : "_blank";
  const mapsRel = preferAppleMaps ? undefined : "noreferrer";

  if (!mapsAddress || !mapsHref) return null;

  return (
    <Box
      component="a"
      href={mapsHref}
      target={mapsTarget}
      rel={mapsRel}
      sx={{
        position: "relative",
        display: "block",
        width: "100%",
        minHeight: { xs: 210, sm: 240 },
        borderRadius: 1,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        textDecoration: "none",
        backgroundColor: alpha(theme.palette.primary.main, 0.06),
      }}
    >
      <Box
        component="iframe"
        title={`Map preview of ${mapsAddress}`}
        src={embedSrc}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sx={{
          display: "block",
          width: "100%",
          height: { xs: 210, sm: 240 },
          border: 0,
          pointerEvents: "none",
          filter: "grayscale(0.02) contrast(1.02)",
        }}
      />

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.14) 100%)",
          pointerEvents: "none",
        }}
      />

      <Box
        sx={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          pointerEvents: "none",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            px: 1.25,
            py: 1,
            borderRadius: 1,
            backgroundColor: alpha(theme.palette.background.paper, 0.9),
            backdropFilter: "blur(8px)",
          }}
        >
          <Typography variant="subtitle2" fontWeight={800} noWrap>
            {customerName || "Customer"}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {mapsAddress}
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}