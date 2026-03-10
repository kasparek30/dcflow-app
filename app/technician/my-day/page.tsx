"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

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

  date?: string;
  timeWindow?: "am" | "pm" | "all_day" | string;
  startTime?: string;
  endTime?: string;

  crew?: TripCrew;
  link?: TripLink;

  cancelReason?: string | null;
};

type DailyCrewOverride = {
  id: string;
  active: boolean;
  date: string; // YYYY-MM-DD
  helperUid: string;
  assignedTechUid: string;
  note?: string | null;
};

type MyDayItem = {
  id: string;
  title: string;
  subtitle: string;
  timeText: string;
  statusText: string;

  techText: string;
  helperText?: string;
  secondaryTechText?: string;
  secondaryHelperText?: string;

  href: string;
};

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWindow(window?: string) {
  const w = (window || "").toLowerCase();
  if (w === "am") return "AM (8–12)";
  if (w === "pm") return "PM (1–5)";
  if (w === "all_day") return "All Day (8–5)";
  return window || "—";
}

function formatType(type?: string) {
  const t = (type || "").toLowerCase();
  if (t === "project") return "📐 Project";
  if (t === "service") return "🔧 Service";
  return type ? `🧩 ${type}` : "🧩 Trip";
}

function stageLabel(stageKey?: string | null) {
  const s = stageKey || "";
  if (s === "roughIn") return "Rough-In";
  if (s === "topOutVent") return "Top-Out / Vent";
  if (s === "trimFinish") return "Trim / Finish";
  return s;
}

function buildHref(link?: TripLink) {
  if (!link) return "/trips";
  if (link.serviceTicketId) return `/service-tickets/${link.serviceTicketId}`;
  if (link.projectId) return `/projects/${link.projectId}`;
  return "/trips";
}

function titleForTrip(t: Trip) {
  if (t.type === "project") {
    const stage = stageLabel(t.link?.projectStageKey || null);
    return stage ? `${formatType(t.type)} • ${stage}` : `${formatType(t.type)}`;
  }
  if (t.type === "service") return `${formatType(t.type)} • Service Ticket`;
  return `${formatType(t.type)}`;
}

function subtitleForTrip(t: Trip) {
  if (t.link?.serviceTicketId) return `Ticket: ${t.link.serviceTicketId}`;
  if (t.link?.projectId) {
    const stage = t.link.projectStageKey ? ` • ${t.link.projectStageKey}` : "";
    return `Project: ${t.link.projectId}${stage}`;
  }
  return "—";
}

function crewDisplay(crew?: TripCrew) {
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

function isUidInCrew(uid: string, crew?: TripCrew) {
  if (!uid) return false;
  return (
    crew?.primaryTechUid === uid ||
    crew?.helperUid === uid ||
    crew?.secondaryTechUid === uid ||
    crew?.secondaryHelperUid === uid
  );
}

export default function TechnicianMyDayPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [override, setOverride] = useState<DailyCrewOverride | null>(null);
  const [error, setError] = useState("");

  const todayIso = useMemo(() => isoTodayLocal(), []);
  const myUid = appUser?.uid || "";
  const myRole = appUser?.role || "";

  const isHelperRole = myRole === "helper" || myRole === "apprentice";

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        // Pull trips for today only (fast and clean)
        const tripsSnap = await getDocs(
          query(collection(db, "trips"), where("date", "==", todayIso))
        );

        const tripItems: Trip[] = tripsSnap.docs.map((docSnap) => {
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
            cancelReason: d.cancelReason ?? null,
          };
        });

        // Load daily crew override for THIS helper (if helper/apprentice)
        let foundOverride: DailyCrewOverride | null = null;

        if (isHelperRole && myUid) {
          const overrideSnap = await getDocs(
            query(
              collection(db, "dailyCrewOverrides"),
              where("date", "==", todayIso),
              where("helperUid", "==", myUid),
              where("active", "==", true)
            )
          );

          if (!overrideSnap.empty) {
            const docSnap = overrideSnap.docs[0];
            const d = docSnap.data() as any;
            foundOverride = {
              id: docSnap.id,
              active: typeof d.active === "boolean" ? d.active : true,
              date: d.date ?? todayIso,
              helperUid: d.helperUid ?? "",
              assignedTechUid: d.assignedTechUid ?? "",
              note: d.note ?? null,
            };
          }
        }

        setTrips(tripItems);
        setOverride(foundOverride);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load My Day (trips).");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [todayIso, myUid, isHelperRole]);

  const visibleTrips = useMemo(() => {
    if (!myUid) return [];

    // Default: show trips where you are explicitly on the crew
    const explicitCrewTrips = trips
      .filter((t) => t.active !== false)
      .filter((t) => isUidInCrew(myUid, t.crew));

    // If you are a helper/apprentice AND an override exists:
    // - also show trips where primary tech == override.assignedTechUid
    // - BUT hide “default tech” trips unless you’re explicitly on crew
    if (isHelperRole && override?.assignedTechUid) {
      const overrideTechTrips = trips
        .filter((t) => t.active !== false)
        .filter((t) => (t.crew?.primaryTechUid || "") === override.assignedTechUid);

      const merged = [...explicitCrewTrips, ...overrideTechTrips];

      // de-dupe by trip id
      const byId = new Map<string, Trip>();
      for (const t of merged) byId.set(t.id, t);

      return Array.from(byId.values());
    }

    return explicitCrewTrips;
  }, [trips, myUid, isHelperRole, override]);

  const items = useMemo(() => {
    const mapped: MyDayItem[] = visibleTrips.map((t) => {
      const crew = crewDisplay(t.crew);
      const href = buildHref(t.link);

      const timeText =
        t.startTime || t.endTime
          ? `${t.startTime || "—"} - ${t.endTime || "—"} • ${formatWindow(t.timeWindow)}`
          : formatWindow(t.timeWindow);

      const statusText =
        t.status
          ? `${t.status}${t.cancelReason ? ` • Cancel: ${t.cancelReason}` : ""}`
          : "—";

      return {
        id: t.id,
        title: titleForTrip(t),
        subtitle: subtitleForTrip(t),
        timeText,
        statusText,
        techText: `Tech: ${crew.primary}`,
        helperText: crew.helper,
        secondaryTechText: crew.secondaryTech,
        secondaryHelperText: crew.secondaryHelper,
        href,
      };
    });

    mapped.sort((a, b) => a.timeText.localeCompare(b.timeText));
    return mapped;
  }, [visibleTrips]);

  const banner = useMemo(() => {
    if (!myUid) return null;

    if (isHelperRole) {
      if (override?.assignedTechUid) {
        return {
          kind: "override" as const,
          title: "✅ Override Active",
          text: `Today you are reassigned to a different technician for today.`,
          sub: `Assigned Tech UID: ${override.assignedTechUid}${override.note ? ` • Note: ${override.note}` : ""}`,
        };
      }

      return {
        kind: "default" as const,
        title: "✅ Pairing Active",
        text: "Today you are using your normal crew pairing. (Overrides apply if set by admin.)",
        sub: "",
      };
    }

    return null;
  }, [myUid, isHelperRole, override]);

  return (
    <ProtectedPage fallbackTitle="My Day">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>My Day</h1>
            <p style={{ marginTop: "6px", color: "#666" }}>
              Today: <strong>{todayIso}</strong>
            </p>
            <p style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
              Trips-driven view (this is what will power timesheets + payroll accuracy)
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link
              href="/schedule"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Weekly Schedule
            </Link>
            <Link
              href="/time-entries"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Time Entries
            </Link>
          </div>
        </div>

        {banner ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "12px",
              background: "#fafafa",
              maxWidth: "980px",
            }}
          >
            <div style={{ fontWeight: 900 }}>{banner.title}</div>
            <div style={{ marginTop: "6px", color: "#555", fontSize: "13px" }}>{banner.text}</div>
            {banner.sub ? (
              <div style={{ marginTop: "6px", color: "#777", fontSize: "12px" }}>{banner.sub}</div>
            ) : null}
          </div>
        ) : null}

        {loading ? <p style={{ marginTop: "16px" }}>Loading your day...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <div style={{ marginTop: "16px", maxWidth: "980px" }}>
            {items.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #ccc",
                  borderRadius: "12px",
                  padding: "14px",
                  background: "white",
                  color: "#666",
                }}
              >
                No trips scheduled for you today.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
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
                    <div style={{ fontWeight: 900, fontSize: "15px" }}>{item.title}</div>

                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                      {item.timeText} • {item.statusText}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#555" }}>
                      {item.subtitle}
                    </div>

                    <div style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>
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
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}