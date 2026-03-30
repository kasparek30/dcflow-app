// app/office-display/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import AssignmentLateRoundedIcon from "@mui/icons-material/AssignmentLateRounded";
import BeachAccessRoundedIcon from "@mui/icons-material/BeachAccessRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type TechRow = { uid: string; name: string };

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
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type TripDoc = {
  id: string;
  active: boolean;
  type?: "service" | "project" | string;
  status?: string;
  date?: string;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string;
  endTime?: string;
  crew?: TripCrew | null;
  link?: TripLink | null;
  timerState?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CompanyEvent = {
  id: string;
  active: boolean;
  type: "meeting" | string;
  title: string;
  date: string;
  timeWindow?: "am" | "pm" | "all_day" | "custom" | string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  blocksSchedule?: boolean;
};

type CompanyHoliday = {
  id: string;
  date: string;
  name: string;
  active: boolean;
};

type TicketSummary = {
  id: string;
  issueSummary: string;
  customerDisplayName: string;
  serviceAddressLine1: string;
  serviceCity: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  serviceAddressLine1?: string;
  serviceCity?: string;
};

type PtoDay = {
  uid: string;
  employeeName: string;
  date: string;
  hours?: number | null;
  requestId: string;
  reason?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromIsoDate(iso: string) {
  const [y, m, day] = iso.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, day || 1);
}

function startOfWorkWeek(d: Date) {
  const wd = d.getDay();
  const diffToMon = (wd + 6) % 7;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - diffToMon);
  return out;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function formatIsoMDY(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

function formatDowShort(d: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function formatTime12h(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [hhRaw, mmRaw] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(hhRaw) || !Number.isFinite(mmRaw)) return "—";
  let hh = hhRaw;
  const mm = mmRaw;
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mm === 0) return `${hh}${ampm}`;
  return `${hh}:${pad2(mm)}${ampm}`;
}

function normalizeStatus(s?: string) {
  return String(s || "").trim().toLowerCase();
}

function statusTone(status?: string) {
  const s = normalizeStatus(status);

  if (s === "in_progress") {
    return {
      label: "In progress",
      bg: "rgba(71,184,255,0.12)",
      border: "rgba(71,184,255,0.24)",
      color: "#D8F0FF",
    };
  }

  if (s === "planned") {
    return {
      label: "Planned",
      bg: "rgba(13,126,242,0.10)",
      border: "rgba(13,126,242,0.22)",
      color: "#DCEBFF",
    };
  }

  if (s === "complete" || s === "completed") {
    return {
      label: "Completed",
      bg: "rgba(148,163,184,0.12)",
      border: "rgba(148,163,184,0.20)",
      color: "#E2E8F0",
    };
  }

  if (s === "cancelled") {
    return {
      label: "Cancelled",
      bg: "rgba(255,42,54,0.10)",
      border: "rgba(255,42,54,0.20)",
      color: "#FFE1E4",
    };
  }

  return {
    label: status ? status.replaceAll("_", " ") : "Unknown",
    bg: "rgba(245,158,11,0.10)",
    border: "rgba(245,158,11,0.20)",
    color: "#FFEDD5",
  };
}

function tripDisplayTitle(t: TripDoc, ticket?: TicketSummary, project?: ProjectSummary) {
  const type = normalizeStatus(t.type);
  if (type === "service") return ticket?.issueSummary || "Service Trip";
  if (type === "project") return project?.name || "Project Trip";
  return "Trip";
}

function tripDisplaySubtitle(t: TripDoc, ticket?: TicketSummary) {
  const type = normalizeStatus(t.type);
  if (type === "service") return ticket?.customerDisplayName || "";
  return "";
}

function tripDisplayLocation(t: TripDoc, ticket?: TicketSummary, project?: ProjectSummary) {
  const type = normalizeStatus(t.type);
  if (type === "service") {
    const a1 = ticket?.serviceAddressLine1 || "";
    const c = ticket?.serviceCity || "";
    return [a1, c].filter(Boolean).join(", ");
  }
  if (type === "project") {
    const a1 = project?.serviceAddressLine1 || "";
    const c = project?.serviceCity || "";
    return [a1, c].filter(Boolean).join(", ");
  }
  return "";
}

function tripTimeText(t: TripDoc) {
  const w = String(t.timeWindow || "").toLowerCase();
  if (w === "all_day") return "All day";
  if (w === "am") return "AM";
  if (w === "pm") return "PM";
  const st = t.startTime ? formatTime12h(t.startTime) : "—";
  const et = t.endTime ? formatTime12h(t.endTime) : "—";
  return `${st}–${et}`;
}

function tripRowUids(t: TripDoc): string[] {
  const uids = [
    String(t.crew?.primaryTechUid || "").trim(),
    String(t.crew?.secondaryTechUid || "").trim(),
  ].filter(Boolean);
  return Array.from(new Set(uids));
}

function looksApprovedPto(d: any) {
  const status = String(d.status ?? d.requestStatus ?? "").toLowerCase().trim();
  const approvedBool = Boolean(d.approved ?? d.isApproved ?? false);
  return approvedBool || status === "approved";
}

function extractEmployeeUid(d: any) {
  return String(d.employeeId ?? d.employeeUid ?? d.uid ?? d.userId ?? "").trim();
}

function extractEmployeeName(d: any) {
  return String(d.employeeName ?? d.displayName ?? d.name ?? "").trim();
}

function extractPtoDates(d: any): string[] {
  const single = String(d.date ?? d.ptoDate ?? d.day ?? d.requestDate ?? "").trim();
  if (single && /^\d{4}-\d{2}-\d{2}$/.test(single)) return [single];

  const start = String(d.startDate ?? d.fromDate ?? d.start ?? "").trim();
  const end = String(d.endDate ?? d.toDate ?? d.end ?? "").trim();

  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const s = fromIsoDate(start);
    const e = end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? fromIsoDate(end) : s;

    const out: string[] = [];
    const cur = new Date(s);
    cur.setHours(0, 0, 0, 0);
    const endDt = new Date(e);
    endDt.setHours(0, 0, 0, 0);

    while (cur <= endDt) {
      out.push(toIsoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  return [];
}

function extractHolidayDate(d: any) {
  return String(d.date ?? d.holidayDate ?? d.day ?? "").trim();
}

function extractHolidayName(d: any) {
  return String(d.name ?? d.title ?? d.holidayName ?? "Holiday").trim();
}

function holidayIsActive(d: any) {
  if (typeof d.active === "boolean") return d.active;
  if (typeof d.isActive === "boolean") return d.isActive;
  return true;
}

function MaterialSymbolIcon({
  name,
  size = 14,
}: {
  name: "plumbing" | "square_foot";
  size?: number;
}) {
  return (
    <Box
      component="span"
      className="material-symbols-outlined"
      sx={{
        fontSize: `${size}px`,
        lineHeight: 1,
        display: "block",
        fontVariationSettings: '"FILL" 0, "wght" 500, "GRAD" 0, "opsz" 24',
      }}
    >
      {name}
    </Box>
  );
}

export default function OfficeDisplayPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [techs, setTechs] = useState<TechRow[]>([]);
  const [trips, setTrips] = useState<TripDoc[]>([]);
  const [eventsByDate, setEventsByDate] = useState<Record<string, CompanyEvent[]>>({});
  const [holidaysByDate, setHolidaysByDate] = useState<Record<string, CompanyHoliday[]>>({});
  const [ticketMap, setTicketMap] = useState<Record<string, TicketSummary>>({});
  const [projectMap, setProjectMap] = useState<Record<string, ProjectSummary>>({});
  const [ptoByUidByDate, setPtoByUidByDate] = useState<Record<string, Record<string, PtoDay>>>({});
  const [ptoNamesByDate, setPtoNamesByDate] = useState<Record<string, string[]>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const anchor = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const wk = startOfWorkWeek(today);
    return addDays(wk, weekOffset * 7);
  }, [weekOffset]);

  const days = useMemo(() => {
    return [0, 1, 2, 3, 4].map((i) => {
      const d = addDays(anchor, i);
      const iso = toIsoDate(d);
      return { d, iso };
    });
  }, [anchor]);

  const weekStartIso = days[0]?.iso || "";
  const weekEndIso = days[days.length - 1]?.iso || "";

  useEffect(() => {
    const prevOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubs: Array<() => void> = [];

    const qUsers = query(collection(db, "users"));
    unsubs.push(
      onSnapshot(
        qUsers,
        (snap) => {
          const items = snap.docs
            .map((ds) => {
              const d = ds.data() as any;
              return {
                uid: String(d.uid ?? ds.id),
                name: String(d.displayName ?? "Unnamed"),
                role: String(d.role ?? ""),
                active: Boolean(d.active ?? false),
              };
            })
            .filter((u) => u.active && u.role === "technician")
            .map((u) => ({ uid: u.uid, name: u.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

          setTechs(items);
          setLastUpdated(new Date().toLocaleTimeString());
        },
        (e) => {
          setError(e?.message || "Failed to load technicians.");
        }
      )
    );

    const qTrips = query(
      collection(db, "trips"),
      where("active", "==", true),
      where("date", ">=", weekStartIso),
      where("date", "<=", weekEndIso),
      orderBy("date", "asc"),
      orderBy("startTime", "asc")
    );

    unsubs.push(
      onSnapshot(
        qTrips,
        (snap) => {
          const items: TripDoc[] = snap.docs.map((ds) => {
            const d = ds.data() as any;
            return {
              id: ds.id,
              active: typeof d.active === "boolean" ? d.active : true,
              type: d.type ?? undefined,
              status: d.status ?? undefined,
              date: d.date ?? undefined,
              timeWindow: d.timeWindow ?? undefined,
              startTime: d.startTime ?? undefined,
              endTime: d.endTime ?? undefined,
              crew: d.crew ?? null,
              link: d.link ?? null,
              timerState: d.timerState ?? null,
              createdAt: d.createdAt ?? undefined,
              updatedAt: d.updatedAt ?? undefined,
            };
          });

          setTrips(items);
          setLastUpdated(new Date().toLocaleTimeString());
          setLoading(false);
        },
        (e) => {
          setError(e?.message || "Failed to load trips.");
          setLoading(false);
        }
      )
    );

    const qEvents = query(
      collection(db, "companyEvents"),
      where("active", "==", true),
      where("date", ">=", weekStartIso),
      where("date", "<=", weekEndIso),
      orderBy("date", "asc")
    );

    unsubs.push(
      onSnapshot(
        qEvents,
        (snap) => {
          const map: Record<string, CompanyEvent[]> = {};
          for (const day of days) map[day.iso] = [];

          for (const ds of snap.docs) {
            const d = ds.data() as any;
            const date = String(d.date || "").trim();
            if (!date || !map[date]) continue;

            const ev: CompanyEvent = {
              id: ds.id,
              active: typeof d.active === "boolean" ? d.active : true,
              type: String(d.type ?? "meeting"),
              title: String(d.title ?? d.name ?? "Meeting"),
              date,
              timeWindow: d.timeWindow ?? "am",
              startTime: d.startTime ?? null,
              endTime: d.endTime ?? null,
              location: d.location ?? null,
              notes: d.notes ?? null,
              blocksSchedule:
                typeof d.blocksSchedule === "boolean" ? d.blocksSchedule : true,
            };

            if (!ev.active) continue;
            map[date].push(ev);
          }

          for (const k of Object.keys(map)) {
            map[k].sort(
              (a, b) =>
                String(a.timeWindow || "").localeCompare(String(b.timeWindow || "")) ||
                a.title.localeCompare(b.title)
            );
          }

          setEventsByDate(map);
          setLastUpdated(new Date().toLocaleTimeString());
        },
        (e) => {
          setError(e?.message || "Failed to load meetings.");
        }
      )
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [weekStartIso, weekEndIso, days]);

  useEffect(() => {
    let cancelled = false;

    async function loadHolidays() {
      try {
        const snap = await getDocs(collection(db, "companyHolidays"));
        const map: Record<string, CompanyHoliday[]> = {};
        for (const day of days) map[day.iso] = [];

        for (const ds of snap.docs) {
          const d = ds.data() as any;
          const date = extractHolidayDate(d);
          if (!date) continue;
          if (date < weekStartIso || date > weekEndIso) continue;
          if (!holidayIsActive(d)) continue;

          const holiday: CompanyHoliday = {
            id: ds.id,
            date,
            name: extractHolidayName(d),
            active: true,
          };

          if (!map[date]) map[date] = [];
          map[date].push(holiday);
        }

        for (const k of Object.keys(map)) {
          map[k].sort((a, b) => a.name.localeCompare(b.name));
        }

        if (!cancelled) {
          setHolidaysByDate(map);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (e: any) {
        if (!cancelled) {
          setError((prev) => prev || e?.message || "Failed to load company holidays.");
        }
      }
    }

    loadHolidays();
    return () => {
      cancelled = true;
    };
  }, [weekStartIso, weekEndIso, days]);

  useEffect(() => {
    let cancelled = false;

    async function loadPto() {
      try {
        const snap = await getDocs(collection(db, "ptoRequests"));

        const byUid: Record<string, Record<string, PtoDay>> = {};
        const namesByDate: Record<string, Set<string>> = {};

        for (const ds of snap.docs) {
          const d = ds.data() as any;
          if (!looksApprovedPto(d)) continue;

          const uid = extractEmployeeUid(d);
          if (!uid) continue;

          const dates = extractPtoDates(d);
          if (!dates.length) continue;

          const employeeName = extractEmployeeName(d) || uid;
          const hours = d.hours ?? d.hoursPaid ?? d.requestedHours ?? null;
          const reason = d.reason ?? d.notes ?? d.note ?? null;

          for (const date of dates) {
            if (date < weekStartIso || date > weekEndIso) continue;

            if (!byUid[uid]) byUid[uid] = {};
            byUid[uid][date] = {
              uid,
              employeeName,
              date,
              hours: Number.isFinite(Number(hours)) ? Number(hours) : null,
              requestId: ds.id,
              reason: reason ? String(reason) : null,
            };

            if (!namesByDate[date]) namesByDate[date] = new Set<string>();
            namesByDate[date].add(employeeName);
          }
        }

        const outNames: Record<string, string[]> = {};
        for (const date of Object.keys(namesByDate)) {
          outNames[date] = Array.from(namesByDate[date].values()).sort((a, b) =>
            a.localeCompare(b)
          );
        }

        if (!cancelled) {
          setPtoByUidByDate(byUid);
          setPtoNamesByDate(outNames);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (e: any) {
        if (!cancelled) {
          setError((prev) => prev || e?.message || "Failed to load PTO.");
        }
      }
    }

    loadPto();
    return () => {
      cancelled = true;
    };
  }, [weekStartIso, weekEndIso]);

  const idsKey = useMemo(() => {
    const st = new Set<string>();
    const pj = new Set<string>();
    for (const t of trips) {
      const sid = String(t.link?.serviceTicketId || "").trim();
      if (sid) st.add(sid);
      const pid = String(t.link?.projectId || "").trim();
      if (pid) pj.add(pid);
    }
    return {
      service: Array.from(st).sort().join("|"),
      project: Array.from(pj).sort().join("|"),
    };
  }, [trips]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const serviceIds = idsKey.service ? idsKey.service.split("|").filter(Boolean) : [];
      const projectIds = idsKey.project ? idsKey.project.split("|").filter(Boolean) : [];

      if (serviceIds.length) {
        const missing = serviceIds.filter((id) => !ticketMap[id]);
        if (missing.length) {
          const next: Record<string, TicketSummary> = {};
          await Promise.all(
            missing.map(async (id) => {
              try {
                const snap = await getDoc(doc(db, "serviceTickets", id));
                if (!snap.exists()) return;
                const d = snap.data() as any;
                next[id] = {
                  id,
                  issueSummary: String(d.issueSummary ?? "Service Ticket"),
                  customerDisplayName: String(d.customerDisplayName ?? ""),
                  serviceAddressLine1: String(d.serviceAddressLine1 ?? ""),
                  serviceCity: String(d.serviceCity ?? ""),
                };
              } catch {}
            })
          );
          if (!cancelled && Object.keys(next).length) {
            setTicketMap((prev) => ({ ...prev, ...next }));
          }
        }
      }

      if (projectIds.length) {
        const missing = projectIds.filter((id) => !projectMap[id]);
        if (missing.length) {
          const next: Record<string, ProjectSummary> = {};
          await Promise.all(
            missing.map(async (id) => {
              try {
                const snap = await getDoc(doc(db, "projects", id));
                if (!snap.exists()) return;
                const d = snap.data() as any;
                next[id] = {
                  id,
                  name: String(d.name ?? d.projectName ?? d.title ?? "Project"),
                  serviceAddressLine1: String(d.serviceAddressLine1 ?? ""),
                  serviceCity: String(d.serviceCity ?? ""),
                };
              } catch {}
            })
          );
          if (!cancelled && Object.keys(next).length) {
            setProjectMap((prev) => ({ ...prev, ...next }));
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [idsKey.service, idsKey.project, projectMap, ticketMap]);

  const rows = useMemo(() => {
    const out: Array<{ key: string; label: string; uid: string | null }> = [];
    const unassignedHasTrips = trips.some(
      (t) =>
        t.date &&
        t.date >= weekStartIso &&
        t.date <= weekEndIso &&
        tripRowUids(t).length === 0
    );

    if (unassignedHasTrips) {
      out.push({ key: "UNASSIGNED", label: "Unassigned", uid: null });
    }

    for (const t of techs) {
      out.push({ key: t.uid, label: t.name, uid: t.uid });
    }

    return out;
  }, [techs, trips, weekStartIso, weekEndIso]);

  const grid = useMemo(() => {
    const out = new Map<string, Map<string, TripDoc[]>>();

    for (const t of trips) {
      const dateIso = String(t.date || "").trim();
      if (!dateIso) continue;
      if (dateIso < weekStartIso || dateIso > weekEndIso) continue;

      const rowUids = tripRowUids(t);
      const targets = rowUids.length ? rowUids : ["UNASSIGNED"];

      for (const uid of targets) {
        if (!out.has(uid)) out.set(uid, new Map());
        const byDate = out.get(uid)!;
        if (!byDate.has(dateIso)) byDate.set(dateIso, []);
        byDate.get(dateIso)!.push(t);
      }
    }

    for (const [, byDate] of out) {
      for (const [d, list] of byDate) {
        list.sort((a, b) => {
          const aKey = `${a.startTime || "99:99"}_${a.endTime || "99:99"}_${a.id}`;
          const bKey = `${b.startTime || "99:99"}_${b.endTime || "99:99"}_${b.id}`;
          return aKey.localeCompare(bKey);
        });
        byDate.set(d, list);
      }
    }

    return out;
  }, [trips, weekStartIso, weekEndIso]);

  const weekLabel = useMemo(() => {
    return `Week • ${formatIsoMDY(weekStartIso)} – ${formatIsoMDY(weekEndIso)}`;
  }, [weekStartIso, weekEndIso]);

  const canControlWeek =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager" ||
    appUser?.role === "office_display";

  function renderTripCard(t: TripDoc) {
    const sid = String(t.link?.serviceTicketId || "").trim();
    const pid = String(t.link?.projectId || "").trim();
    const ticket = sid ? ticketMap[sid] : undefined;
    const project = pid ? projectMap[pid] : undefined;

    const title = tripDisplayTitle(t, ticket, project);
    const subtitle = tripDisplaySubtitle(t, ticket);
    const location = tripDisplayLocation(t, ticket, project);
    const timeText = tripTimeText(t);
    const tone = statusTone(t.status);
    const tripType = normalizeStatus(t.type);
    const isCompleted =
      normalizeStatus(t.status) === "complete" ||
      normalizeStatus(t.status) === "completed";

    return (
      <Paper
        key={t.id}
        elevation={0}
        sx={{
          px: 0.9,
          py: isCompleted ? 0.7 : 0.9,
          borderRadius: 1.5,
          backgroundColor: "background.paper",
          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
          minHeight: 0,
        }}
      >
        <Stack spacing={isCompleted ? 0.45 : 0.5}>
          <Stack direction="row" spacing={0.75} justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: 1,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  backgroundColor:
                    tripType === "project"
                      ? alpha(theme.palette.warning.main, 0.14)
                      : alpha(theme.palette.primary.main, 0.14),
                  color:
                    tripType === "project"
                      ? "#FFD89C"
                      : theme.palette.primary.light,
                }}
              >
                {tripType === "project" ? (
                  <MaterialSymbolIcon name="square_foot" size={14} />
                ) : (
                  <MaterialSymbolIcon name="plumbing" size={14} />
                )}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {title}
                </Typography>

                {subtitle ? (
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      mt: 0.1,
                      color: "text.secondary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {subtitle}
                  </Typography>
                ) : null}
              </Box>
            </Stack>

            <Chip
              label={tone.label}
              size="small"
              sx={{
                height: 20,
                borderRadius: 1,
                color: tone.color,
                backgroundColor: tone.bg,
                border: `1px solid ${tone.border}`,
                "& .MuiChip-label": {
                  px: 0.75,
                  fontSize: 10,
                  fontWeight: 500,
                },
              }}
            />
          </Stack>

          {!isCompleted ? (
            <Stack spacing={0.35}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <ScheduleRoundedIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {timeText}
                </Typography>
              </Stack>

              {location ? (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <LocationOnRoundedIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {location}
                  </Typography>
                </Stack>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    );
  }

  function renderMeetingsForDay(dayIso: string) {
    const list = eventsByDate[dayIso] || [];
    if (!list.length) return null;

    const head = list.slice(0, 2);
    const extra = list.length - head.length;

    return (
      <Stack spacing={0.5} sx={{ mt: 0.75 }}>
        {head.map((e) => {
          const w = String(e.timeWindow || "").toLowerCase();
          const time =
            w === "all_day"
              ? "All day"
              : w === "am"
                ? "AM"
                : w === "pm"
                  ? "PM"
                  : e.startTime && e.endTime
                    ? `${formatTime12h(String(e.startTime))}–${formatTime12h(String(e.endTime))}`
                    : "Custom";

          return (
            <Paper
              key={e.id}
              elevation={0}
              sx={{
                px: 0.9,
                py: 0.8,
                borderRadius: 1.5,
                backgroundColor: alpha(theme.palette.success.main, 0.08),
                border: `1px solid ${alpha(theme.palette.success.main, 0.16)}`,
              }}
            >
              <Stack spacing={0.25}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <CampaignRoundedIcon sx={{ fontSize: 13, color: "#CFFFE0" }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#E1FFEA",
                      fontWeight: 500,
                      lineHeight: 1.2,
                    }}
                  >
                    {e.title}
                  </Typography>
                </Stack>

                <Typography
                  variant="caption"
                  sx={{
                    color: alpha("#E1FFEA", 0.88),
                  }}
                >
                  {time}
                  {e.location ? ` • ${e.location}` : ""}
                </Typography>
              </Stack>
            </Paper>
          );
        })}

        {extra > 0 ? (
          <Typography
            variant="caption"
            sx={{
              color: alpha("#E1FFEA", 0.88),
            }}
          >
            +{extra} more meeting(s)
          </Typography>
        ) : null}
      </Stack>
    );
  }

  const headerH = 96;
  const outerPad = 16;
  const gridH = `calc(100vh - ${headerH}px - ${outerPad * 2}px - 12px)`;

  return (
    <ProtectedPage fallbackTitle="Office Display">
      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          height: "100vh",
          overflow: "hidden",
          p: `${outerPad}px`,
          backgroundColor: "background.default",
          color: "text.primary",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          boxSizing: "border-box",
        }}
      >
        <Box
          sx={{
            height: `${headerH}px`,
            px: 0.5,
            pb: 1,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={2}
            sx={{ width: "100%" }}
          >
            <Stack direction="row" spacing={2.25} alignItems="center" minWidth={0}>
              <Box
                sx={{
                  position: "relative",
                  width: 300,
                  height: 82,
                  flexShrink: 0,
                }}
              >
                <Image
                  src="/brand/dcflow-logo.png"
                  alt="DCFlow"
                  fill
                  priority
                  sizes="300px"
                  style={{ objectFit: "contain" }}
                />
              </Box>

              <Stack spacing={0.5} minWidth={0}>
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                  <Chip
                    icon={<CalendarMonthRoundedIcon />}
                    label="Office Display"
                    size="small"
                    sx={{
                      backgroundColor: alpha(theme.palette.primary.main, 0.12),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.20)}`,
                    }}
                  />
                  <Chip
                    icon={<RefreshRoundedIcon />}
                    label={`Live • ${lastUpdated || "—"}`}
                    size="small"
                    sx={{
                      backgroundColor: alpha("#FFFFFF", 0.04),
                      border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    }}
                  />
                </Stack>

                <Typography
                  variant="h5"
                  sx={{
                    lineHeight: 1.1,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {weekLabel}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Technician schedule overview with meetings, company holidays, approved PTO, and weekly visibility
                </Typography>
              </Stack>
            </Stack>

            {canControlWeek ? (
              <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<ChevronLeftRoundedIcon />}
                  onClick={() => setWeekOffset((p) => p - 1)}
                  sx={{ minWidth: 108, borderRadius: 999 }}
                >
                  Prev
                </Button>

                <Button
                  variant="contained"
                  onClick={() => setWeekOffset(0)}
                  sx={{ minWidth: 118, borderRadius: 999 }}
                >
                  This Week
                </Button>

                <Button
                  variant="outlined"
                  color="primary"
                  endIcon={<ChevronRightRoundedIcon />}
                  onClick={() => setWeekOffset((p) => p + 1)}
                  sx={{ minWidth: 108, borderRadius: 999 }}
                >
                  Next
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </Box>

        <Paper
          elevation={0}
          sx={{
            height: gridH,
            minHeight: 0,
            overflow: "hidden",
            borderRadius: 1.5,
            border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
            backgroundColor: alpha("#FFFFFF", 0.02),
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `252px repeat(${days.length}, 1fr)`,
              borderBottom: `1px solid ${alpha("#FFFFFF", 0.08)}`,
              backgroundColor: alpha("#FFFFFF", 0.015),
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1.25,
                display: "flex",
                alignItems: "center",
                gap: 0.75,
              }}
            >
              <GroupsRoundedIcon sx={{ color: "primary.light", fontSize: 18 }} />
              <Typography variant="subtitle2">Technician</Typography>
            </Box>

            {days.map(({ d, iso }) => {
              const ptoNames = ptoNamesByDate[iso] || [];
              const holidays = holidaysByDate[iso] || [];
              const holidayLabel =
                holidays.length === 1 ? holidays[0].name : `${holidays.length} Holidays`;

              return (
                <Box
                  key={iso}
                  sx={{
                    px: 1.2,
                    py: 1.1,
                    borderLeft: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    overflow: "hidden",
                  }}
                >
                  <Stack spacing={0.5}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      spacing={1}
                      alignItems="center"
                    >
                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}
                      >
                        <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
                          {formatDowShort(d)}
                        </Typography>

                        {holidays.length ? (
                          <Chip
                            size="small"
                            icon={<CelebrationRoundedIcon sx={{ fontSize: 15 }} />}
                            label={holidayLabel}
                            variant="outlined"
                            sx={{
                              maxWidth: "100%",
                              borderRadius: 1.25,
                              fontWeight: 600,
                              color: "#FFE6A7",
                              backgroundColor: "rgba(245,158,11,0.10)",
                              border: "1px solid rgba(245,158,11,0.24)",
                              "& .MuiChip-label": {
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              },
                            }}
                          />
                        ) : null}
                      </Stack>

                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {formatIsoMDY(iso)}
                      </Typography>
                    </Stack>

                    {ptoNames.length ? (
                      <Chip
                        size="small"
                        icon={<BeachAccessRoundedIcon sx={{ fontSize: 15 }} />}
                        label={ptoNames.length === 1 ? `PTO: ${ptoNames[0]}` : `PTO: ${ptoNames.length} employees`}
                        color="secondary"
                        variant="outlined"
                        sx={{
                          width: "fit-content",
                          borderRadius: 1.25,
                          fontWeight: 500,
                        }}
                      />
                    ) : null}

                    {renderMeetingsForDay(iso)}
                  </Stack>
                </Box>
              );
            })}
          </Box>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateRows: `repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))`,
              overflow: "hidden",
            }}
          >
            {rows.map((r) => (
              <Box
                key={r.key}
                sx={{
                  display: "grid",
                  gridTemplateColumns: `252px repeat(${days.length}, 1fr)`,
                  borderTop: `1px solid ${alpha("#FFFFFF", 0.06)}`,
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    px: 1.5,
                    py: 1.2,
                    borderRight: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                    backgroundColor: alpha("#FFFFFF", 0.015),
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    minWidth: 0,
                  }}
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: 1,
                      display: "grid",
                      placeItems: "center",
                      backgroundColor:
                        r.key === "UNASSIGNED"
                          ? alpha(theme.palette.warning.main, 0.12)
                          : alpha(theme.palette.primary.main, 0.12),
                      color:
                        r.key === "UNASSIGNED"
                          ? "#FFD89C"
                          : theme.palette.primary.light,
                      flexShrink: 0,
                    }}
                  >
                    {r.key === "UNASSIGNED" ? (
                      <AssignmentLateRoundedIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <HandymanRoundedIcon sx={{ fontSize: 14 }} />
                    )}
                  </Box>

                  <Typography
                    variant="subtitle2"
                    sx={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.label}
                  </Typography>
                </Box>

                {days.map(({ iso }) => {
                  const rowKey = r.key === "UNASSIGNED" ? "UNASSIGNED" : r.key;
                  const cellTrips = grid.get(rowKey)?.get(iso) || [];
                  const pto = rowKey !== "UNASSIGNED" ? ptoByUidByDate[rowKey]?.[iso] : null;
                  const holidays = holidaysByDate[iso] || [];
                  const isHoliday = holidays.length > 0;

                  return (
                    <Box
                      key={`${r.key}_${iso}`}
                      sx={{
                        p: 1,
                        borderLeft: `1px solid ${alpha("#FFFFFF", 0.06)}`,
                        minHeight: 0,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.7,
                        backgroundColor: pto
                          ? alpha(theme.palette.secondary.main, 0.08)
                          : isHoliday
                            ? "rgba(245,158,11,0.06)"
                            : "transparent",
                      }}
                    >
                      {pto ? (
                        <Chip
                          size="small"
                          icon={<BeachAccessRoundedIcon sx={{ fontSize: 15 }} />}
                          label={`PTO${pto.hours ? ` • ${pto.hours}h` : ""}`}
                          color="secondary"
                          variant="outlined"
                          sx={{
                            width: "fit-content",
                            borderRadius: 1.25,
                            fontWeight: 500,
                            flexShrink: 0,
                          }}
                        />
                      ) : null}

                      {cellTrips.length === 0 ? (
                        <Paper
                          elevation={0}
                          sx={{
                            minHeight: 64,
                            borderRadius: 1.5,
                            border: `1px dashed ${alpha("#FFFFFF", 0.12)}`,
                            backgroundColor: "transparent",
                            display: "grid",
                            placeItems: "center",
                            color: "text.secondary",
                            flexShrink: 0,
                          }}
                        >
                          <Typography variant="caption">
                            {pto ? "PTO" : isHoliday ? "Holiday" : "—"}
                          </Typography>
                        </Paper>
                      ) : (
                        <Box
                          sx={{
                            minHeight: 0,
                            overflowY: "auto",
                            overflowX: "hidden",
                            display: "grid",
                            alignContent: "start",
                            gap: 0.7,
                            pr: 0.25,
                            "&::-webkit-scrollbar": {
                              width: 6,
                            },
                            "&::-webkit-scrollbar-thumb": {
                              backgroundColor: alpha("#FFFFFF", 0.16),
                              borderRadius: 999,
                            },
                            "&::-webkit-scrollbar-track": {
                              backgroundColor: "transparent",
                            },
                          }}
                        >
                          {cellTrips.map(renderTripCard)}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Paper>

        {error ? (
          <Alert
            severity="error"
            variant="outlined"
            sx={{
              borderRadius: 1.5,
              flexShrink: 0,
            }}
          >
            {error}
          </Alert>
        ) : null}
      </Box>
    </ProtectedPage>
  );
}