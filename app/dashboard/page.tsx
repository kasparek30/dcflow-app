"use client";

import { Stack, Typography } from "@mui/material";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";

export default function DashboardPage() {
  const { authUser, appUser } = useAuthContext();

  return (
    <ProtectedPage fallbackTitle="Dashboard">
      <AppShell appUser={appUser}>
        <Stack spacing={2}>
          <Typography variant="h5">Dashboard</Typography>

          <Typography variant="body2" color="text.secondary">
            DCFlow dashboard is loading correctly.
          </Typography>

          <Typography variant="body2">
            Authenticated UID: {authUser?.uid || "—"}
          </Typography>

          <Typography variant="body2">
            Display Name: {appUser?.displayName || "—"}
          </Typography>

          <Typography variant="body2">
            Email: {appUser?.email || "—"}
          </Typography>

          <Typography variant="body2">
            Role: {appUser?.role || "—"}
          </Typography>

          <Typography variant="body2">
            Active: {appUser ? String(appUser.active) : "—"}
          </Typography>
        </Stack>
      </AppShell>
    </ProtectedPage>
  );
}