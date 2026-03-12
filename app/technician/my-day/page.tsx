// app/technician/my-day/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
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
  status?: string; // planned | in_progress | complete | cancelled | etc

  date?: string; // YYYY-MM-DD
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm

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

  // Card
  headerText: string; // “Service Ticket: …”
  subLine: string; // time + customer + address
  techText: string;
  helperText?: string;
  secondaryTechText?: string;
  secondaryHelperText?: string;

  issueDetailsText?: string;
  followUpText?: string;

  status: string;
  sortKey: string;

  href: string;
};

type EmployeeOption = {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
};

type ServiceTicketLite = {
  id: string;
  issueSummary?: string;
  issueDetails?: string;
  status?: string;

  customerDisplayName?: string;
  customerPhone?: string;

  serviceAddressLabel?: string;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string;
  serviceCity?: string;
  serviceState?: string;
  servicePostalCode?: string;
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

function isUidInCrew(uid: string, crew?: TripCrew) {
  if (!uid) return false;
  return (
    crew?.primaryTechUid === uid ||
    crew?.helperUid === uid ||
    crew?.secondaryTechUid === uid ||
    crew?.secondaryHelperUid === uid
  );
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

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function buildAddressLine(t: ServiceTicketLite) {
  const parts: string[] = [];
  const label = safeStr(t.serviceAddressLabel).trim();
  const line1 = safeStr(t.serviceAddressLine1).trim();
  const line2 = safeStr(t.serviceAddressLine2).trim();
  const city = safeStr(t.serviceCity).trim();
  const state = safeStr(t.serviceState).trim();
  const zip = safeStr(t.servicePostalCode).trim();

  if (label) parts.push(label);
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);

  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);

  return parts.filter(Boolean).join(" • ");
}

function normalizeStatus(s?: string) {
  return (s || "").toLowerCase().trim();
}

function timeSortKey(startTime?: string, window?: string) {
  // We want real timed items first, otherwise order by typical windows.
  const st = safeStr(startTime);
  if (st) return st;

  const w = (window || "").toLowerCase();
  if (w === "am") return "08:00";
  if (w === "pm") return "13:00";
  if (w === "all_day") return "08:00";
  return "99:99";
}

export default function TechnicianMyDayPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [override, setOverride] = useState<DailyCrewOverride | null>(null);
  const [error, setError] = useState("");

  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeUid, setSelectedEmployeeUid] = useState<string>("");

  const [ticketById, setTicketById] = useState<Record<string, ServiceTicketLite>>({});
  const [followUpByTicketId, setFollowUpByTicketId] = useState<Record<string, string>>({});

  const todayIso = useMemo(() => isoTodayLocal(), []);
  const myUid = appUser?.uid || "";
  const myRole = appUser?.role || "";

  const isHelperRole = myRole === "helper" || myRole === "apprentice";

  const canViewOtherEmployees =
    myRole === "admin" || myRole === "dispatcher" || myRole === "manager";

  // Default selected employee:
  useEffect(() => {
    if (!selectedEmployeeUid && myUid) {
      setSelectedEmployeeUid(myUid);
    }
  }, [selectedEmployeeUid, myUid]);

  // Load employees list (for admin/dispatch/manager picker)
  useEffect(() => {
    async function loadEmployees() {
      if (!canViewOtherEmployees) {
        setEmployeesLoading(false);
        return;
      }

      setEmployeesLoading(true);
      try {
        const snap = await getDocs(collection(db, "users"));
        const items: EmployeeOption[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              uid: String(data.uid ?? d.id),
              displayName: String(data.displayName ?? "Unnamed"),
              role: String(data.role ?? ""),
              active: Boolean(data.active ?? false),
            };
          })
          .filter((u) => u.active)
          .filter((u) => ["technician", "helper", "apprentice"].includes(u.role));

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setEmployees(items);
      } catch (e) {
        // Non-fatal
      } finally {
        setEmployeesLoading(false);
      }
    }

    loadEmployees();
  }, [canViewOtherEmployees]);

  // Load trips for today
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const whoUid = canViewOtherEmployees
          ? (selectedEmployeeUid || myUid)
          : myUid;

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

        if (isHelperRole && whoUid) {
          const overrideSnap = await getDocs(
            query(
              collection(db, "dailyCrewOverrides"),
              where("date", "==", todayIso),
              where("helperUid", "==", whoUid),
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

        // Enrich: load service ticket docs for visible service trips
        const ticketIds = Array.from(
          new Set(
            tripItems
              .map((t) => t.link?.serviceTicketId || "")
              .filter(Boolean)
          )
        );

        const ticketMap: Record<string, ServiceTicketLite> = {};
        await Promise.all(
          ticketIds.map(async (tid) => {
            try {
              const snap = await getDoc(doc(db, "serviceTickets", tid));
              if (!snap.exists()) return;

              const d = snap.data() as any;
              ticketMap[tid] = {
                id: tid,
                issueSummary: d.issueSummary ?? "",
                issueDetails: d.issueDetails ?? "",
                status: d.status ?? "",
                customerDisplayName: d.customerDisplayName ?? "",
                customerPhone: d.customerPhone ?? d.phone ?? "",
                serviceAddressLabel: d.serviceAddressesLabel ?? d.serviceAddressLabel ?? "",
                serviceAddressLine1: d.serviceAddressLine1 ?? "",
                serviceAddressLine2: d.serviceAddressLine2 ?? "",
                serviceCity: d.serviceCity ?? "",
                serviceState: d.serviceState ?? "",
                servicePostalCode: d.servicePostalCode ?? "",
              };
            } catch {
              // ignore per ticket
            }
          })
        );
        setTicketById(ticketMap);

        // Enrich: if ticket is follow_up, try to fetch latest followUpNotes
        const followUpMap: Record<string, string> = {};
        await Promise.all(
          ticketIds.map(async (tid) => {
            try {
              const t = ticketMap[tid];
              if (!t) return;
              if (normalizeStatus(t.status) !== "follow_up") return;

              // Try to get most recent follow-up trip note for this ticket.
              // If Firestore asks for an index, this will fail gracefully.
              const qTrip = query(
                collection(db, "trips"),
                where("link.serviceTicketId", "==", tid),
                where("outcome", "==", "follow_up"),
                orderBy("updatedAt", "desc"),
                limit(1)
              );

              const snap = await getDocs(qTrip);
              if (snap.empty) return;

              const d = snap.docs[0].data() as any;
              const note = String(d.followUpNotes ?? "").trim();
              if (note) followUpMap[tid] = note;
            } catch {
              // ignore (index missing, etc.)
            }
          })
        );
        setFollowUpByTicketId(followUpMap);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load My Day (trips).");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [todayIso, myUid, isHelperRole, canViewOtherEmployees, selectedEmployeeUid]);

  const visibleTrips = useMemo(() => {
    const whoUid = canViewOtherEmployees
      ? (selectedEmployeeUid || myUid)
      : myUid;

    if (!whoUid) return [];

    // Default: show trips where you are explicitly on the crew
    const explicitCrewTrips = trips
      .filter((t) => t.active !== false)
      .filter((t) => isUidInCrew(whoUid, t.crew));

    // If you are a helper/apprentice AND an override exists:
    // - also show trips where primary tech == override.assignedTechUid
    if (!canViewOtherEmployees && isHelperRole && override?.assignedTechUid) {
      const overrideTechTrips = trips
        .filter((t) => t.active !== false)
        .filter((t) => (t.crew?.primaryTechUid || "") === override.assignedTechUid);

      const merged = [...explicitCrewTrips, ...overrideTechTrips];

      // de-dupe
      const byId = new Map<string, Trip>();
      for (const t of merged) byId.set(t.id, t);

      return Array.from(byId.values());
    }

    return explicitCrewTrips;
  }, [trips, myUid, isHelperRole, override, canViewOtherEmployees, selectedEmployeeUid]);

  const items = useMemo(() => {
    const whoUid = canViewOtherEmployees
      ? (selectedEmployeeUid || myUid)
      : myUid;

    const mapped: MyDayItem[] = visibleTrips
      .filter((t) => {
        // ✅ Hide completed trips from My Day (requested)
        const s = normalizeStatus(t.status);
        if (s === "complete" || s === "completed") return false;
        return true;
      })
      .map((t) => {
        const crew = crewDisplay(t.crew);
        const href = buildHref(t.link);

        const windowText = formatWindow(t.timeWindow);
        const timeText =
          t.startTime || t.endTime
            ? `${t.startTime || "—"} - ${t.endTime || "—"} • ${windowText}`
            : windowText;

        const status = normalizeStatus(t.status) || "planned";

        // Service ticket enrichment
        const serviceTicketId = t.link?.serviceTicketId || "";
        const st = serviceTicketId ? ticketById[serviceTicketId] : undefined;

        // Header per your spec
        let headerText = "";
        if ((t.type || "").toLowerCase() === "service") {
          const summary = safeStr(st?.issueSummary).trim() || "Service Ticket";
          headerText = `🔧 Service Ticket: ${summary}`;
        } else if ((t.type || "").toLowerCase() === "project") {
          const stage = stageLabel(t.link?.projectStageKey || null);
          headerText = stage ? `${formatType(t.type)} • ${stage}` : `${formatType(t.type)}`;
        } else {
          headerText = `${formatType(t.type)} • ${((t.type || "") as string) || "Trip"}`;
        }

        // Second line: time block + customer - address
        let subLine = timeText;
        if (st) {
          const cust = safeStr(st.customerDisplayName).trim();
          const addr = buildAddressLine(st);
          const right = [cust, addr].filter(Boolean).join(" — ");
          if (right) subLine = `${timeText} • ${right}`;
        }

        // Issue details bottom line
        const issueDetailsText =
          (t.type || "").toLowerCase() === "service"
            ? (safeStr(st?.issueDetails).trim() || "")
            : "";

        const followUpText =
          (t.type || "").toLowerCase() === "service" && serviceTicketId
            ? (safeStr(followUpByTicketId[serviceTicketId]).trim() || "")
            : "";

        // Sorting:
        // - in_progress to top
        // - otherwise by actual time
        const inProgBoost = status === "in_progress" ? "0" : "1";
        const tKey = timeSortKey(t.startTime, t.timeWindow);
        const sortKey = `${inProgBoost}_${tKey}_${t.id}`;

        return {
          id: t.id,
          headerText,
          subLine,
          techText: `Tech: ${crew.primary}`,
          helperText: crew.helper,
          secondaryTechText: crew.secondaryTech,
          secondaryHelperText: crew.secondaryHelper,
          issueDetailsText,
          followUpText,
          status,
          sortKey,
          href,
        };
      });

    mapped.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return mapped;
  }, [visibleTrips, ticketById, followUpByTicketId, myUid, canViewOtherEmployees, selectedEmployeeUid]);

  const banner = useMemo(() => {
    const whoUid = canViewOtherEmployees
      ? (selectedEmployeeUid || myUid)
      : myUid;

    if (!whoUid) return null;

    if (!canViewOtherEmployees && isHelperRole) {
      if (override?.assignedTechUid) {
        return {
          title: "✅ Override Active",
          text: `Today you are reassigned to a different technician for today.`,
          sub: `Assigned Tech UID: ${override.assignedTechUid}${override.note ? ` • Note: ${override.note}` : ""}`,
        };
      }

      return {
        title: "✅ Pairing Active",
        text: "Today you are using your normal crew pairing. (Overrides apply if set by admin.)",
        sub: "",
      };
    }

    return null;
  }, [myUid, isHelperRole, override, canViewOtherEmployees, selectedEmployeeUid]);

  function statusStyles(status: string) {
    // requested: in_progress green, planned blue
    if (status === "in_progress") {
      return {
        border: "1px solid #b7e3c2",
        background: "#f2fff6",
      };
    }
    if (status === "planned") {
      return {
        border: "1px solid #b7cff5",
        background: "#f4f8ff",
      };
    }
    return {
      border: "1px solid #ddd",
      background: "white",
    };
  }

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
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>My Day</h1>
            <p style={{ marginTop: "6px", color: "#666" }}>
              Today: <strong>{todayIso}</strong>
            </p>
            <p style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
              Trips-driven view (scheduling + time capture)
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {canViewOtherEmployees ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#666", fontWeight: 800 }}>Employee</span>
                <select
                  value={selectedEmployeeUid || ""}
                  onChange={(e) => setSelectedEmployeeUid(e.target.value)}
                  disabled={employeesLoading}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    background: "white",
                  }}
                >
                  <option value={myUid}>Me</option>
                  {employees.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

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
                No trips scheduled for this employee today.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {items.map((item) => {
                  const styles = statusStyles(item.status);

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      style={{
                        display: "block",
                        borderRadius: "12px",
                        padding: "12px",
                        textDecoration: "none",
                        color: "inherit",
                        ...(styles as any),
                      }}
                    >
                      {/* Header */}
                      <div style={{ fontWeight: 950, fontSize: "15px" }}>{item.headerText}</div>

                      {/* Line 2: time + customer + address */}
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "#333" }}>
                        {item.subLine}
                      </div>

                      {/* Crew */}
                      <div style={{ marginTop: "8px", fontSize: "12px", color: "#555" }}>
                        {item.techText}
                      </div>
                      {item.helperText ? (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                          {item.helperText}
                        </div>
                      ) : null}
                      {item.secondaryTechText ? (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                          {item.secondaryTechText}
                        </div>
                      ) : null}
                      {item.secondaryHelperText ? (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#555" }}>
                          {item.secondaryHelperText}
                        </div>
                      ) : null}

                      {/* Issue details + follow-up notes */}
                      {item.issueDetailsText ? (
                        <div
                          style={{
                            marginTop: "10px",
                            paddingTop: "10px",
                            borderTop: "1px solid rgba(0,0,0,0.06)",
                            fontSize: "12px",
                            color: "#444",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          <strong>Issue:</strong> {item.issueDetailsText}
                        </div>
                      ) : null}

                      {item.followUpText ? (
                        <div
                          style={{
                            marginTop: "8px",
                            fontSize: "12px",
                            color: "#6a4b00",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          <strong>Follow-up notes:</strong> {item.followUpText}
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}