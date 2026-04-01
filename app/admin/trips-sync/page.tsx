// app/admin/trips-sync/page.tsx
"use client";

import { useMemo, useState } from "react";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";

export default function TripsSyncAdminPage() {
  const { appUser } = useAuthContext();

  const canUse = appUser?.role === "admin" || appUser?.role === "manager" || appUser?.role === "dispatcher";

  const [daysBack, setDaysBack] = useState("30");
  const [daysForward, setDaysForward] = useState("120");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const parsedBack = useMemo(() => Number(daysBack) || 30, [daysBack]);
  const parsedForward = useMemo(() => Number(daysForward) || 120, [daysForward]);

  async function runSync() {
    if (!canUse) return;

    setRunning(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/trips/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daysBack: parsedBack,
          daysForward: parsedForward,
          actorUid: appUser?.uid || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Trips sync failed.");
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Trips sync failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Employee Profiles" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginBottom: "10px" }}>
          Trips Sync (v1)
        </h1>

        <p style={{ marginTop: 0, color: "#666", fontSize: "13px", maxWidth: "900px" }}>
          This tool generates <strong>Trips</strong> from scheduled service tickets + project stages.
          It is <strong>idempotent</strong> (safe to run repeatedly). Trips are the core scheduling + payroll unlock.
        </p>

        {!canUse ? (
          <p style={{ color: "red" }}>
            You do not have access to this tool. (Admin/Manager/Dispatcher only)
          </p>
        ) : null}

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "14px",
            background: "#fafafa",
            maxWidth: "900px",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ fontWeight: 800 }}>Sync Window</div>

          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(240px, 1fr))" }}>
            <div>
              <label style={{ fontWeight: 700 }}>Days Back</label>
              <input
                type="number"
                min={0}
                value={daysBack}
                onChange={(e) => setDaysBack(e.target.value)}
                disabled={!canUse || running}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                Default: 30 (catches recent schedules)
              </div>
            </div>

            <div>
              <label style={{ fontWeight: 700 }}>Days Forward</label>
              <input
                type="number"
                min={0}
                value={daysForward}
                onChange={(e) => setDaysForward(e.target.value)}
                disabled={!canUse || running}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <div style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                Default: 120 (catches most upcoming work)
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={runSync}
            disabled={!canUse || running}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              width: "fit-content",
              fontWeight: 900,
            }}
          >
            {running ? "Running Sync..." : "Run Trips Sync"}
          </button>

          {error ? <div style={{ color: "red", fontSize: "13px" }}>{error}</div> : null}

          {result ? (
            <div style={{ marginTop: "8px", borderTop: "1px solid #eee", paddingTop: "10px" }}>
              <div style={{ fontWeight: 800 }}>Result</div>
              <div style={{ marginTop: "6px", fontSize: "13px", color: "#555" }}>
                <div><strong>Range:</strong> {result.range?.start} → {result.range?.end}</div>
                <div><strong>Trips created/updated:</strong> {result.createdOrUpdated}</div>
              </div>

              {Array.isArray(result.samples) && result.samples.length > 0 ? (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ fontWeight: 800, fontSize: "13px" }}>Samples</div>
                  <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                    {result.samples.map((s: any) => (
                      <div
                        key={s.tripId}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: "10px",
                          padding: "10px",
                          background: "white",
                          fontSize: "12px",
                          color: "#555",
                        }}
                      >
                        <div><strong>{s.type}</strong> • {s.date}</div>
                        <div style={{ marginTop: "4px" }}><strong>tripId:</strong> {s.tripId}</div>
                        <div style={{ marginTop: "4px" }}><strong>sourceKey:</strong> {s.sourceKey}</div>
                        {s.stageKey ? <div style={{ marginTop: "4px" }}><strong>stage:</strong> {s.stageKey}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}