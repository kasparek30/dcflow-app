"use client";

import React from "react";
import { Box, Stack, Typography } from "@mui/material";

type PageShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number | string;
  compact?: boolean;
};

export default function PageShell({
  title,
  subtitle,
  actions,
  children,
  maxWidth = 1600,
  compact = false,
}: PageShellProps) {
  return (
    <Box
      sx={{
        width: "100%",
        maxWidth,
        mx: "auto",
      }}
    >
      <Stack
        spacing={compact ? 2 : 3}
        sx={{
          width: "100%",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h4"
              sx={{
                fontSize: { xs: "1.6rem", md: "2rem" },
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              {title}
            </Typography>

            {subtitle ? (
              <Typography
                sx={{
                  mt: 0.75,
                  color: "text.secondary",
                  fontSize: { xs: 13, md: 14 },
                  fontWeight: 500,
                  maxWidth: 900,
                }}
              >
                {subtitle}
              </Typography>
            ) : null}
          </Box>

          {actions ? (
            <Box
              sx={{
                width: { xs: "100%", md: "auto" },
                display: "flex",
                justifyContent: { xs: "stretch", md: "flex-end" },
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
                "& > *": {
                  width: { xs: "100%", sm: "auto" },
                },
              }}
            >
              {actions}
            </Box>
          ) : null}
        </Stack>

        <Box>{children}</Box>
      </Stack>
    </Box>
  );
}