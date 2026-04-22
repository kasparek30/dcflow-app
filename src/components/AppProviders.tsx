// src/components/AppProviders.tsx
"use client";

import { CssBaseline, ThemeProvider } from "@mui/material";
import { AuthProvider } from "../context/auth-context";
import dcflowTheme from "../theme/dcflowTheme";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider theme={dcflowTheme}>
      <CssBaseline />
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}