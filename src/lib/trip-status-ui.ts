// src/lil/trip-status-ui.ts
import { alpha, Theme } from "@mui/material/styles";

export function normalizeTripStatus(status?: string) {
  return String(status || "").trim().toLowerCase();
}

export function getTripStatusTone(theme: Theme, status?: string) {
  const s = normalizeTripStatus(status);

  if (s === "in_progress") {
    return {
      label: "In progress",
      bg: "#E7F6EA",
      border: "#B7E3C2",
      color: "#0D5E2A",
    };
  }

  if (s === "planned") {
    return {
      label: "Planned",
      bg: alpha(theme.palette.primary.main, 0.12),
      border: alpha(theme.palette.primary.main, 0.24),
      color: theme.palette.primary.light,
    };
  }

  if (s === "complete" || s === "completed") {
    return {
      label: "Completed",
      bg: alpha("#FFFFFF", 0.06),
      border: alpha("#FFFFFF", 0.12),
      color: alpha("#FFFFFF", 0.78),
    };
  }

  if (s === "cancelled" || s === "canceled") {
    return {
      label: "Cancelled",
      bg: alpha(theme.palette.error.main, 0.12),
      border: alpha(theme.palette.error.main, 0.26),
      color: theme.palette.error.light,
    };
  }

  return {
    label: status ? String(status).replaceAll("_", " ") : "Trip",
    bg: "#FFF7E6",
    border: "#FFE2A8",
    color: "#7A4B00",
  };
}