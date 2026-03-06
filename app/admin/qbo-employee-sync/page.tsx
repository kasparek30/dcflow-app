// app/admin/qbo-employee-sync/page.tsx
"use client";

import { useState } from "react";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";

export default function QboEmployeeSyncPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function runSync() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/qbo/employees/sync", {
        method: "POST",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Sync failed.");
        setResult(data);
        return;
      }

      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="QBO Employee Sync" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginTop: 0 }}>
          QuickBooks Employee Sync (v1)
        </h1>

        <p style={{ color: "#666", marginTop: "6px" }}>
          Pull employees from QuickBooks and upsert into Firestore collection{" "}
          <strong>qboEmployees</strong>.
        </p>

        <button
          onClick={runSync}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1px solid #ccc",
            background: "white",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {loading ? "Syncing..." : "Run Employee Sync Now"}
        </button>

        {error ? (
          <p style={{ marginTop: "16px", color: "red" }}>{error}</p>
        ) : null}

        {result ? (
          <pre
            style={{
              marginTop: "16px",
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              background: "#fafafa",
              overflowX: "auto",
              fontSize: "12px",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}