// app/trips/[tripId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

type TripDoc = {
  id: string;

  active: boolean;
  type: "service" | "project";
  status: string;

  date: string;
  timeWindow: TripTimeWindow | string;
  startTime: string;
  endTime: string;

  crew?: {
    primaryTechUid?: string | null;
    primaryTechName?: string | null;

    helperUid?: string | null;
    helperName?: string | null;

    secondaryTechUid?: string | null;
    secondaryTechName?: string | null;

    secondaryHelperUid?: string | null;
    secondaryHelperName?: string | null;
  };

  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  };

  notes?: string | null;
  cancelReason?: string | null;

  createdAt?: string;
  createdByUid?: string | null;
  updatedAt?: string;
  updatedByUid?: string | null;

  sourceKey?: string;
};

type Props = {
  params: Promise<{ tripId: string }>;
};

function formatWindow(w: string) {
  if (w === "am") return "AM";
  if (w === "pm") return "PM";
  if (w === "all_day") return "All Day";
  if (w === "custom") return "Custom";
  return w || "—";
}

function safeTrim(s: string) {
  return (s ?? "").trim();
}

export default function TripDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const canDispatch =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const [loading, setLoading] = useState(true);
  const [tripId, setTripId] = useState("");
  const [trip, setTrip] = useState<TripDoc | null>(null);
  const [error, setError] = useState("");

  // Edit fields
  const [date, setDate] = useState("");
  const [timeWindow, setTimeWindow] = useState<TripTimeWindow>("am");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Cancel
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      setSaveMsg("");

      try {
        const resolved = await params;
        const id = resolved.tripId;
        setTripId(id);

        const snap = await getDoc(doc(db, "trips", id));
        if (!snap.exists()) {
          setError("Trip not found.");
          setLoading(false);
          return;
        }

        const d = snap.data();

        const item: TripDoc = {
          id: snap.id,

          active: d.active ?? true,
          type: d.type ?? "service",
          status: d.status ?? "planned",

          date: d.date ?? "",
          timeWindow: d.timeWindow ?? "custom",
          startTime: d.startTime ?? "",
          endTime: d.endTime ?? "",

          crew: d.crew ?? undefined,
          link: d.link ?? undefined,

          notes: d.notes ?? null,
          cancelReason: d.cancelReason ?? null,

          createdAt: d.createdAt ?? undefined,
          createdByUid: d.createdByUid ?? null,
          updatedAt: d.updatedAt ?? undefined,
          updatedByUid: d.updatedByUid ?? null,

          sourceKey: d.sourceKey ?? undefined,
        };

        setTrip(item);

        // seed edit fields
        setDate(item.date || "");
        setTimeWindow((item.timeWindow as TripTimeWindow) || "custom");
        setStartTime(item.startTime || "08:00");
        setEndTime(item.endTime || "12:00");
        setNotes(item.notes ?? "");
        setCancelReason(item.cancelReason ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load trip.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  const backLink = useMemo(() => {
    const serviceTicketId = trip?.link?.serviceTicketId || "";
    const projectId = trip?.link?.projectId || "";
    if (serviceTicketId) return { href: `/service-tickets/${serviceTicketId}`, label: "Back to Service Ticket" };
    if (projectId) return { href: `/projects/${projectId}`, label: "Back to Project" };
    return { href: "/schedule", label: "Back to Weekly Schedule" };
  }, [trip]);

  const crewSummary = useMemo(() => {
    const c = trip?.crew || {};
    return {
      primary: c.primaryTechName || "Unassigned",
      helper: c.helperName || "—",
      secondaryTech: c.secondaryTechName || "—",
      secondaryHelper: c.secondaryHelperName || "—",
    };
  }, [trip]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trip) return;
    if (!canDispatch) return;

    setSaving(true);
    setError("");
    setSaveMsg("");

    const nextDate = safeTrim(date);
    const nextStart = safeTrim(startTime);
    const nextEnd = safeTrim(endTime);

    if (!nextDate) {
      setSaving(false);
      setError("Date is required.");
      return;
    }
    if (!nextStart || !nextEnd) {
      setSaving(false);
      setError("Start and end time are required.");
      return;
    }
    if (nextEnd <= nextStart) {
      setSaving(false);
      setError("End time must be after start time.");
      return;
    }

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "trips", trip.id), {
        date: nextDate,
        timeWindow: timeWindow || "custom",
        startTime: nextStart,
        endTime: nextEnd,

        notes: safeTrim(notes) ? safeTrim(notes) : null,

        updatedAt: nowIso,
        updatedByUid: appUser?.uid || null,
      });

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          date: nextDate,
          timeWindow: timeWindow || "custom",
          startTime: nextStart,
          endTime: nextEnd,
          notes: safeTrim(notes) ? safeTrim(notes) : null,
          updatedAt: nowIso,
          updatedByUid: appUser?.uid || null,
        };
      });

      setSaveMsg("✅ Trip updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update trip.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelTrip() {
    if (!trip) return;
    if (!canDispatch) return;

    const reason = safeTrim(cancelReason);
    if (!reason) {
      setError("Cancel reason is required.");
      return;
    }

    setCancelling(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "trips", trip.id), {
        status: "cancelled",
        active: false,
        cancelReason: reason,

        updatedAt: nowIso,
        updatedByUid: appUser?.uid || null,
      });

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "cancelled",
          active: false,
          cancelReason: reason,
          updatedAt: nowIso,
          updatedByUid: appUser?.uid || null,
        };
      });

      setSaveMsg("✅ Trip cancelled (kept for history).");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel trip.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Trip Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading trip...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ color: "green" }}>{saveMsg}</p> : null}

        {!loading && trip ? (
          <div style={{ display: "grid", gap: "16px", maxWidth: "980px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
                  Trip • {trip.date} • {formatWindow(String(trip.timeWindow || ""))} • {trip.startTime}-{trip.endTime}
                </h1>
                <div style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
                  Trip ID: {tripId}
                </div>
                <div style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
                  Status: <strong>{trip.status}</strong> • Active: <strong>{String(trip.active)}</strong>
                </div>
              </div>

              <Link
                href={backLink.href}
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
                {backLink.label}
              </Link>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "14px", background: "#fafafa" }}>
              <div style={{ fontWeight: 900, marginBottom: "8px" }}>Crew</div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                <div><strong>Primary Tech:</strong> {crewSummary.primary}</div>
                <div style={{ marginTop: "4px" }}><strong>Helper:</strong> {crewSummary.helper}</div>
                <div style={{ marginTop: "4px" }}><strong>Secondary Tech:</strong> {crewSummary.secondaryTech}</div>
                <div style={{ marginTop: "4px" }}><strong>Secondary Helper:</strong> {crewSummary.secondaryHelper}</div>
              </div>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "14px", background: "#fafafa" }}>
              <div style={{ fontWeight: 900, marginBottom: "8px" }}>Linked To</div>
              <div style={{ fontSize: "13px", color: "#555" }}>
                <div><strong>Type:</strong> {trip.type}</div>
                <div style={{ marginTop: "6px" }}>
                  <strong>Service Ticket:</strong>{" "}
                  {trip.link?.serviceTicketId ? (
                    <Link href={`/service-tickets/${trip.link.serviceTicketId}`}>{trip.link.serviceTicketId}</Link>
                  ) : (
                    "—"
                  )}
                </div>
                <div style={{ marginTop: "6px" }}>
                  <strong>Project:</strong>{" "}
                  {trip.link?.projectId ? (
                    <Link href={`/projects/${trip.link.projectId}`}>{trip.link.projectId}</Link>
                  ) : (
                    "—"
                  )}
                </div>
                <div style={{ marginTop: "6px" }}>
                  <strong>Project Stage:</strong> {trip.link?.projectStageKey || "—"}
                </div>
                <div style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>
                  SourceKey: {trip.sourceKey || "—"}
                </div>
              </div>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "14px", background: "white" }}>
              <div style={{ fontWeight: 900, marginBottom: "10px" }}>Edit / Reschedule</div>

              {!canDispatch ? (
                <p style={{ color: "#777" }}>Only Admin/Dispatcher/Manager can edit trips.</p>
              ) : (
                <form onSubmit={handleSave} style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                    <div>
                      <label>Date</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        disabled={saving || cancelling}
                        style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                      />
                    </div>

                    <div>
                      <label>Time Window</label>
                      <select
                        value={timeWindow}
                        onChange={(e) => setTimeWindow(e.target.value as TripTimeWindow)}
                        disabled={saving || cancelling}
                        style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                      >
                        <option value="am">AM</option>
                        <option value="pm">PM</option>
                        <option value="all_day">All Day</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
                    <div>
                      <label>Start Time</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        disabled={saving || cancelling}
                        style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                      />
                    </div>

                    <div>
                      <label>End Time</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        disabled={saving || cancelling}
                        style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label>Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      disabled={saving || cancelling}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving || cancelling}
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
                    {saving ? "Saving..." : "Save Trip Changes"}
                  </button>
                </form>
              )}
            </div>

            <div style={{ border: "1px solid #f0c6c6", borderRadius: "12px", padding: "14px", background: "#fff7f7" }}>
              <div style={{ fontWeight: 900, marginBottom: "8px" }}>Cancel Trip</div>
              <div style={{ fontSize: "12px", color: "#777", marginBottom: "10px" }}>
                Cancelling keeps the trip for audit/history, but sets <strong>active=false</strong> and <strong>status=cancelled</strong>.
              </div>

              <div>
                <label>Cancel Reason</label>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={!canDispatch || cancelling || saving}
                  placeholder="Example: Customer rescheduled, rain day, tech out sick..."
                  style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                />
              </div>

              <button
                type="button"
                onClick={handleCancelTrip}
                disabled={!canDispatch || cancelling || saving}
                style={{
                  marginTop: "10px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #e3a3a3",
                  background: "white",
                  cursor: "pointer",
                  width: "fit-content",
                  fontWeight: 900,
                }}
              >
                {cancelling ? "Cancelling..." : "Cancel Trip"}
              </button>
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}