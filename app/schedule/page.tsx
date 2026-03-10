"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type DayBucket = {
  key: string;
  label: string;
  shortLabel: string;
  isoDate: string;
  dayIndex: number;
};

type TripCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;

  helperUid?: string | null;
  helperName?: string | null;

  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;

  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
};

type TripLink = {
  projectId?: string | null;
  projectStageKey?: string | null;
  serviceTicketId?: string | null;
};

type Trip = {
  id: string;
  active: boolean;

  type?: "project" | "service" | string;
  status?: string;

  date?: string; // YYYY-MM-DD
  timeWindow?: "am" | "pm" | "all_day" | string;
  startTime?: string; // "08:00"
  endTime?: string; // "17:00"

  crew?: TripCrew;
  link?: TripLink;

  notes?: string | null;
  cancelReason?: string | null;

  sourceKey?: string;

  createdAt?: string;
  updatedAt?: string;
};

type ScheduleItem = {
  kind: "trip";
  id: string;
  date: string;
  sortTime: string;

  title: string;
  subtitle: string;

  techText: string;
  helperText?: string;
  secondaryTechText?: string;
  secondaryHelperText?: string;

  statusText: string;
  timeText: string;

  href: string;
};

function formatDateToIsoLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStartOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day);
  return copy;
}

function buildWeekDays(baseDate: Date): DayBucket[] {
  const start = getStartOfWeek(baseDate);
  const labels = [
    ["Sunday", "Sun"],
    ["Monday", "Mon"],
    ["Tuesday", "Tue"],
    ["Wednesday", "Wed"],
    ["Thursday", "Thu"],
    ["Friday", "Fri"],
    ["Saturday", "Sat"],
  ] as const;

  return labels.map(([label, shortLabel], index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);

    return {
      key: shortLabel.toLowerCase(),
      label,
      shortLabel,
      isoDate: formatDateToIsoLocal(current),
      dayIndex: index,
    };
  });
}

function formatWindow(window?: string) {
  const w = (window || "").toLowerCase();
  if (w === "am") return "AM (8–12)";
  if (w === "pm") return "PM (1–5)";
  if (w === "all_day") return "All Day (8–5)";
  return window || "—";
}

function formatTripType(type?: string) {
  const t = (type || "").toLowerCase();
  if (t === "project") return "📐 Project";
  if (t === "service") return "🔧 Service";
  return type ? `🧩 ${type}` : "🧩 Trip";
}

function buildHrefFromLink(link?: TripLink) {
  if (!link) return "/trips";
  if (link.serviceTicketId) return `/service-tickets/${link.serviceTicketId}`;
  if (link.projectId) return `/projects/${link.projectId}`;
  return "/trips";
}

function buildTitleFromTrip(trip: Trip) {
  const typeLabel = formatTripType(trip.type);

  const stageKey = trip.link?.projectStageKey || "";
  const stageLabel =
    stageKey === "roughIn"
      ? "Rough-In"
      : stageKey === "topOutVent"
        ? "Top-Out / Vent"
        : stageKey === "trimFinish"
          ? "Trim / Finish"
          : stageKey;

  if (trip.type === "project") {
    return stageLabel ? `${typeLabel} • ${stageLabel}` : `${typeLabel}`;
  }

  if (trip.type === "service") {
    return `${typeLabel} • Service Ticket`;
  }

  return `${typeLabel}`;
}

function buildSubtitleFromTrip(trip: Trip) {
  const link = trip.link;
  if (link?.serviceTicketId) return `Ticket: ${link.serviceTicketId}`;
  if (link?.projectId) {
    const stage = link.projectStageKey ? ` • ${link.projectStageKey}` : "";
    return `Project: ${link.projectId}${stage}`;
  }
  return trip.sourceKey ? `Source: ${trip.sourceKey}` : "—";
}

function crewText(crew?: TripCrew) {
  const primary = crew?.primaryTechName || crew?.primaryTechUid || "Unassigned";

  const helper =
    crew?.helperName || crew?.helperUid
      ? `Helper: ${crew?.helperName || crew?.helperUid}`
      : undefined;

  const secondaryTech =
    crew?.secondaryTechName || crew?.secondaryTechUid
      ? `2nd Tech: ${crew?.secondaryTechName || crew?.secondaryTechUid}`
      : undefined;

  const secondaryHelper =
    crew?.secondaryHelperName || crew?.secondaryHelperUid
      ? `2nd Helper: ${crew?.secondaryHelperName || crew?.secondaryHelperUid}`
      : undefined;

  return { primary, helper, secondaryTech, secondaryHelper };
}

export default function WeeklySchedulePage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState("");

  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekends, setShowWeekends] = useState(false);

  const isAdmin = appUser?.role === "admin";

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const snap = await getDocs(collection(db, "trips"));

        const items: Trip[] = snap.docs.map((docSnap) => {
          const d = docSnap.data() as any;

          return {
            id: docSnap.id,
            active: typeof d.active === "boolean" ? d.active : true,

            type: d.type ?? undefined,
            status: d.status ?? undefined,

            date: d.date ?? undefined,
            timeWindow: d.timeWindow ?? undefined,
            startTime: d.startTime ?? undefined,
            endTime: d.endTime ?? undefined,

            crew: d.crew ?? undefined,
            link: d.link ?? undefined,

            notes: d.notes ?? null,
            cancelReason: d.cancelReason ?? null,

            sourceKey: d.sourceKey ?? undefined,

            createdAt: d.createdAt ?? undefined,
            updatedAt: d.updatedAt ?? undefined,
          };
        });

        setTrips(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load weekly schedule (trips).");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const currentWeekBaseDate = useMemo(() => {
    const today = new Date();
    const shifted = new Date(today);
    shifted.setDate(today.getDate() + weekOffset * 7);
    return shifted;
  }, [weekOffset]);

  const allWeekDays = useMemo(() => buildWeekDays(currentWeekBaseDate), [currentWeekBaseDate]);

  const visibleWeekDays = useMemo(() => {
    if (showWeekends) return allWeekDays;
    return allWeekDays.filter((day) => day.dayIndex >= 1 && day.dayIndex <= 5);
  }, [allWeekDays, showWeekends]);

  const weekStart = allWeekDays[0]?.isoDate ?? "";
  const weekEnd = allWeekDays[6]?.isoDate ?? "";

  const scheduledItemsByDay = useMemo(() => {
    const result: Record<string, ScheduleItem[]> = {};
    for (const day of allWeekDays) result[day.isoDate] = [];

    for (const trip of trips) {
      if (trip.active === false) continue;
      if (!trip.date) continue;
      if (!result[trip.date]) continue;

      const crew = crewText(trip.crew);

      const href = buildHrefFromLink(trip.link);

      const timeText =
        trip.startTime || trip.endTime
          ? `${trip.startTime || "—"} - ${trip.endTime || "—"} • ${formatWindow(trip.timeWindow)}`
          : formatWindow(trip.timeWindow);

      const statusText =
        trip.status
          ? `${trip.status}${trip.cancelReason ? ` • Cancel: ${trip.cancelReason}` : ""}`
          : "—";

      result[trip.date].push({
        kind: "trip",
        id: trip.id,
        date: trip.date,
        sortTime: trip.startTime || (trip.timeWindow === "am" ? "08:00" : trip.timeWindow === "pm" ? "13:00" : "12:00"),
        title: buildTitleFromTrip(trip),
        subtitle: buildSubtitleFromTrip(trip),

        techText: `Tech: ${crew.primary}`,
        helperText: crew.helper,
        secondaryTechText: crew.secondaryTech,
        secondaryHelperText: crew.secondaryHelper,

        statusText,
        href,
        timeText,
      });
    }

    for (const day of allWeekDays) {
      result[day.isoDate].sort((a, b) => {
        const byTime = a.sortTime.localeCompare(b.sortTime);
        if (byTime !== 0) return byTime;
        return a.title.localeCompare(b.title);
      });
    }

    return result;
  }, [trips, allWeekDays]);

  const unscheduledTrips = useMemo(() => {
    return trips
      .filter((t) => t.active !== false)
      .filter((t) => !t.date)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [trips]);

  return (
    <ProtectedPage fallbackTitle="Weekly Schedule">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Weekly Schedule</h1>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Week of {weekStart} through {weekEnd}
            </p>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              Currently showing: {showWeekends ? "Monday–Sunday" : "Monday–Friday"}
            </p>
            <p style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
              Trips-driven schedule (projects + service share the same blocking + payroll structure)
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Previous Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              This Week
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                background: "white",
                cursor: "pointer",
              }}
            >
              Next Week
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowWeekends((prev) => !prev)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                {showWeekends ? "Hide Weekends" : "Show Weekends"}
              </button>
            ) : null}

            <Link
              href="/trips"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Trips List
            </Link>
          </div>
        </div>

        {loading ? <p>Loading weekly schedule...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${visibleWeekDays.length}, minmax(240px, 1fr))`,
                gap: "12px",
                alignItems: "start",
                overflowX: "auto",
              }}
            >
              {visibleWeekDays.map((day) => {
                const dayItems = scheduledItemsByDay[day.isoDate] ?? [];

                return (
                  <div
                    key={day.isoDate}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "12px",
                      background: "#fafafa",
                      minHeight: "260px",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "4px" }}>
                      {day.label}
                    </div>

                    <div style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>
                      {day.isoDate}
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {dayItems.length === 0 ? (
                        <div
                          style={{
                            border: "1px dashed #ccc",
                            borderRadius: "10px",
                            padding: "10px",
                            fontSize: "13px",
                            color: "#777",
                            background: "white",
                          }}
                        >
                          No trips scheduled
                        </div>
                      ) : (
                        dayItems.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            style={{
                              display: "block",
                              border: "1px solid #ddd",
                              borderRadius: "10px",
                              padding: "10px",
                              background: "white",
                              textDecoration: "none",
                              color: "inherit",
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: "14px" }}>{item.title}</div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                              {item.timeText}
                            </div>

                            <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                              {item.subtitle}
                            </div>

                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                              {item.techText}
                            </div>

                            {item.helperText ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                {item.helperText}
                              </div>
                            ) : null}

                            {item.secondaryTechText ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                {item.secondaryTechText}
                              </div>
                            ) : null}

                            {item.secondaryHelperText ? (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                                {item.secondaryHelperText}
                              </div>
                            ) : null}

                            <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                              Status: {item.statusText}
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "20px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "1100px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Unscheduled Trips
              </h2>

              {unscheduledTrips.length === 0 ? (
                <p style={{ color: "#666" }}>No unscheduled trips.</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {unscheduledTrips.map((trip) => {
                    const crew = crewText(trip.crew);
                    return (
                      <Link
                        key={trip.id}
                        href="/trips"
                        style={{
                          display: "block",
                          border: "1px solid #ddd",
                          borderRadius: "10px",
                          padding: "10px",
                          background: "white",
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>{buildTitleFromTrip(trip)}</div>
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                          {buildSubtitleFromTrip(trip)}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                          Tech: {crew.primary}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}