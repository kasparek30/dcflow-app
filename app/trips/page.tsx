"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type Trip = {
  id: string;

  // core
  date?: string; // YYYY-MM-DD
  timeWindow?: "am" | "pm" | "all_day" | string;
  status?: string;
  type?: "service" | "project" | string;

  // linking
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;

  // crew (uids/names optional depending on your sync)
  primaryTechUid?: string | null;
  primaryTechName?: string | null;

  helperUid?: string | null;
  helperName?: string | null;

  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;

  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;

  active?: boolean;

  createdAt?: string;
  updatedAt?: string;
};

function formatWindow(w?: string) {
  const v = (w || "").toLowerCase();
  if (v === "am") return "AM (8–12)";
  if (v === "pm") return "PM (1–5)";
  if (v === "all_day") return "All Day (8–5)";
  return w || "—";
}

function formatType(t?: string) {
  const v = (t || "").toLowerCase();
  if (v === "service") return "Service";
  if (v === "project") return "Project";
  return t || "—";
}

export default function TripsPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState("");

  const canView =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "technician" ||
    appUser?.role === "helper" ||
    appUser?.role === "apprentice";

  const canEdit =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const snap = await getDocs(collection(db, "trips"));
        const items: Trip[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;

          return {
            id: docSnap.id,
            date: d.date ?? undefined,
            timeWindow: d.timeWindow ?? undefined,
            status: d.status ?? undefined,
            type: d.type ?? undefined,

            serviceTicketId: d.serviceTicketId ?? null,
            projectId: d.projectId ?? null,
            projectStageKey: d.projectStageKey ?? null,

            primaryTechUid: d.primaryTechUid ?? d.primaryTechnicianUid ?? d.primaryTechnicianId ?? null,
            primaryTechName: d.primaryTechName ?? d.primaryTechnicianName ?? null,

            helperUid: d.helperUid ?? d.primaryHelperUid ?? null,
            helperName: d.helperName ?? d.primaryHelperName ?? null,

            secondaryTechUid: d.secondaryTechUid ?? d.secondaryTechnicianUid ?? d.secondaryTechnicianId ?? null,
            secondaryTechName: d.secondaryTechName ?? d.secondaryTechnicianName ?? null,

            secondaryHelperUid: d.secondaryHelperUid ?? null,
            secondaryHelperName: d.secondaryHelperName ?? null,

            active: typeof d.active === "boolean" ? d.active : true,
            createdAt: d.createdAt ?? undefined,
            updatedAt: d.updatedAt ?? undefined,
          };
        });

        // Sort newest date first, then updatedAt desc
        items.sort((a, b) => {
          const ad = a.date || "";
          const bd = b.date || "";
          if (ad !== bd) return bd.localeCompare(ad);
          return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        });

        setTrips(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load trips.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const activeTrips = useMemo(() => trips.filter((t) => t.active !== false), [trips]);
  const inactiveTrips = useMemo(() => trips.filter((t) => t.active === false), [trips]);

  if (!canView) {
    return (
      <ProtectedPage fallbackTitle="Trips">
        <AppShell appUser={appUser}>
          <p style={{ color: "red" }}>You do not have access to view Trips.</p>
        </AppShell>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage fallbackTitle="Trips">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>Trips</h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Trips are the scheduling + payroll core units (service + project blocks).
            </p>
          </div>

          {canEdit ? (
            <Link
              href="/admin/trips-sync"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
                height: "fit-content",
              }}
            >
              Admin: Trips Sync
            </Link>
          ) : null}
        </div>

        {loading ? <p>Loading trips...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <>
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "14px",
                background: "#fafafa",
                marginBottom: "16px",
                maxWidth: "980px",
              }}
            >
              <div style={{ fontWeight: 800 }}>Quick stats</div>
              <div style={{ marginTop: "8px", color: "#555", fontSize: "13px" }}>
                Active trips: <strong>{activeTrips.length}</strong> • Inactive trips:{" "}
                <strong>{inactiveTrips.length}</strong>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", maxWidth: "980px" }}>
              {trips.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #ccc",
                    borderRadius: "12px",
                    padding: "14px",
                    background: "white",
                    color: "#666",
                  }}
                >
                  No trips found yet.
                </div>
              ) : (
                trips.map((t) => (
                  <Link
                    key={t.id}
                    href={`/trips/${t.id}`}
                    style={{
                      display: "block",
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "12px",
                      background: "white",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                      <div style={{ fontWeight: 900 }}>
                        {formatType(t.type)} Trip • {t.date || "No date"} • {formatWindow(t.timeWindow)}
                      </div>
                      <div style={{ fontSize: "12px", color: t.active === false ? "#b00" : "#2a6" }}>
                        {t.active === false ? "Inactive" : "Active"}
                      </div>
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "13px", color: "#555" }}>
                      Status: <strong>{t.status || "—"}</strong>
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "13px", color: "#555" }}>
                      Tech: <strong>{t.primaryTechName || t.primaryTechUid || "Unassigned"}</strong>
                      {t.helperName || t.helperUid ? (
                        <>
                          {" "}
                          • Helper: <strong>{t.helperName || t.helperUid}</strong>
                        </>
                      ) : null}
                      {t.secondaryTechName || t.secondaryTechUid ? (
                        <>
                          {" "}
                          • 2nd Tech: <strong>{t.secondaryTechName || t.secondaryTechUid}</strong>
                        </>
                      ) : null}
                      {t.secondaryHelperName || t.secondaryHelperUid ? (
                        <>
                          {" "}
                          • 2nd Helper: <strong>{t.secondaryHelperName || t.secondaryHelperUid}</strong>
                        </>
                      ) : null}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                      Link:{" "}
                      {t.serviceTicketId ? `ServiceTicket ${t.serviceTicketId}` : null}
                      {t.projectId ? `Project ${t.projectId}` : null}
                      {t.projectStageKey ? ` • Stage ${t.projectStageKey}` : null}
                      {!t.serviceTicketId && !t.projectId ? "—" : null}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}