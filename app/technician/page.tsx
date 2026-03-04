"use client";

import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";

export default function TechnicianPage() {
  const { appUser } = useAuthContext();

  return (
    <ProtectedPage
      allowedRoles={["technician", "admin"]}
      fallbackTitle="Technician"
    >
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Technician</h1>
        <p style={{ marginTop: "12px" }}>
          Technician Page Protected and Working
        </p>
      </AppShell>
    </ProtectedPage>
  );
}