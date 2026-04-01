// app/admin/qbo-customers-import/page.tsx
"use client";

import { useState } from "react";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";

type Result = {
  ok?: boolean;
  message?: string;
  error?: string;
  realmId?: string;
  attempt?: string;
  intuit_tid?: string;
  fetchedCount?: number;
  upsertedCount?: number;
  collection?: string;
  idStrategy?: string;
};

export default function QboCustomersImportPage() {
  const { appUser } = useAuthContext();

  const canUse =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runImport() {
    if (!canUse) return;
    setRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/qbo/customers/sync-to-dcflow", { method: "POST" });
      const json = (await res.json()) as Result;

      if (!res.ok) {
        setResult({ ok: false, error: json?.error || "Import failed." });
        return;
      }

      setResult(json);
    } catch (err: unknown) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Import failed." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Employee Profiles" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginBottom: "10px" }}>
          Import QBO Customers → DCFlow
        </h1>

        <p style={{ color: "#666", fontSize: "13px", maxWidth: "900px" }}>
          This imports your QuickBooks Online customers directly into Firestore collection{" "}
          <strong>customers</strong>, using deterministic IDs like{" "}
          <strong>customers/qbo_123</strong>. Re-running is safe.
        </p>

        {!canUse ? (
          <p style={{ color: "red" }}>
            You do not have access to this tool. (Admin/Manager/Dispatcher only)
          </p>
        ) : null}

        <button
          type="button"
          onClick={runImport}
          disabled={!canUse || running}
          style={{
            marginTop: "12px",
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1px solid #ccc",
            background: "white",
            cursor: canUse ? "pointer" : "not-allowed",
            fontWeight: 900,
          }}
        >
          {running ? "Importing..." : "Import Customers"}
        </button>

        {result ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              background: "#fafafa",
              maxWidth: "900px",
            }}
          >
            {result.ok === false || result.error ? (
              <>
                <div style={{ fontWeight: 900, color: "red" }}>Import failed</div>
                <div style={{ marginTop: "6px", color: "#555", fontSize: "13px" }}>
                  {result.error}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 900 }}>✅ Import complete</div>
                <div style={{ marginTop: "6px", color: "#555", fontSize: "13px" }}>
                  {result.message}
                </div>
                <div style={{ marginTop: "6px", color: "#555", fontSize: "13px" }}>
                  Fetched: <strong>{result.fetchedCount ?? 0}</strong> • Upserted:{" "}
                  <strong>{result.upsertedCount ?? 0}</strong>
                </div>
                <div style={{ marginTop: "6px", color: "#777", fontSize: "12px" }}>
                  realmId: {result.realmId || "—"} • attempt: {result.attempt || "—"} • intuit_tid:{" "}
                  {result.intuit_tid || "—"} • idStrategy: {result.idStrategy || "—"}
                </div>
              </>
            )}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}