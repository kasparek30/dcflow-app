"use client";

// app/admin/unavailability/page.tsx

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";

import { buildServiceTicketAssignmentFromCrew } from "../../../src/lib/crew-staffing-impact";

import type { AppUser } from "../../../src/types/app-user";
import type { UnavailabilityType } from "../../../src/types/unavailability";

export const dynamic = "force-dynamic";

type UserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role: AppUser["role"];
  active: boolean;
};

type AvailabilityDuration = "all_day" | "partial_day";
type ListTab = "upcoming" | "history";

type UnavailabilityView = {
  id: string;

  uid?: string;
  employeeId?: string;
  userUid?: string;

  displayName?: string;

  date: string;
  startDate?: string;
  endDate?: string;

  allDay?: boolean;

  startTime?: string;
  endTime?: string;

  type: UnavailabilityType;

  reason?: string;

  source?: string;

  active: boolean;

  createdAt?: string;
  createdByUid?: string;

  updatedAt?: string;
  updatedByUid?: string;
};

type TripCrewLite = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;

  helperUid?: string | null;
  helperName?: string | null;

  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;

  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;

  [key: string]: unknown;
};

type TripLite = {
  id: string;

  active: boolean;

  type: string;
  status: string;

  date: string;

  timeWindow: string;
  startTime: string;
  endTime: string;

  timerState: string;

  crew: TripCrewLite | null;

  link: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    [key: string]: unknown;
  } | null;
};

type TripCleanupResult = {
  affectedTrips: number;
  removedAssignments: number;
  leadReassignmentTrips: number;
  activeTripReviews: number;
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function isoTodayLocal() {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function formatType(type: UnavailabilityType) {
  switch (type) {
    case "sick":
      return "Sick";

    case "pto":
      return "PTO";

    case "unpaid":
      return "Unpaid";

    case "holiday":
      return "Holiday";

    case "other":
      return "Other";

    default:
      return type;
  }
}

function formatRole(role: AppUser["role"]) {
  return String(role)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(dateString?: string) {
  if (!dateString) return "";

  const parts = dateString.split("-");

  if (parts.length !== 3) {
    return dateString;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    return dateString;
  }

  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time?: string) {
  if (!time) return "";

  const [hourRaw, minuteRaw] = time.split(":");

  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }

  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStartDate(item: UnavailabilityView) {
  return item.startDate || item.date || "";
}

function getEndDate(item: UnavailabilityView) {
  return item.endDate || item.startDate || item.date || "";
}

function getIsAllDay(item: UnavailabilityView) {
  return item.allDay !== false;
}

function formatDateRange(item: UnavailabilityView) {
  const startDate = getStartDate(item);
  const endDate = getEndDate(item);

  if (!startDate) {
    return "No date";
  }

  if (!endDate || startDate === endDate) {
    return formatDate(startDate);
  }

  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function getTripTimeRange(trip: TripLite) {
  const timeWindow = normalize(trip.timeWindow);

  if (timeWindow === "am") {
    return {
      start: "08:00",
      end: "12:00",
    };
  }

  if (timeWindow === "pm") {
    return {
      start: "13:00",
      end: "17:00",
    };
  }

  if (timeWindow === "all_day") {
    return {
      start: "08:00",
      end: "17:00",
    };
  }

  return {
    start: String(trip.startTime || "").trim(),
    end: String(trip.endTime || "").trim(),
  };
}

function rangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string
) {
  if (!firstStart || !firstEnd || !secondStart || !secondEnd) {
    return false;
  }

  return firstStart < secondEnd && secondStart < firstEnd;
}

function tripOverlapsAbsence(args: {
  trip: TripLite;
  absenceStartDate: string;
  absenceEndDate: string;
  allDay: boolean;
  absenceStartTime?: string;
  absenceEndTime?: string;
}) {
  const {
    trip,
    absenceStartDate,
    absenceEndDate,
    allDay,
    absenceStartTime,
    absenceEndTime,
  } = args;

  const tripDate = String(trip.date || "").trim();

  if (!tripDate) return false;

  if (tripDate < absenceStartDate || tripDate > absenceEndDate) {
    return false;
  }

  if (allDay) {
    return true;
  }

  const tripRange = getTripTimeRange(trip);

  // Conservatively treat incomplete custom scheduling data as overlap.
  if (!tripRange.start || !tripRange.end) {
    return true;
  }

  if (!absenceStartTime || !absenceEndTime) {
    return true;
  }

  return rangesOverlap(
    tripRange.start,
    tripRange.end,
    absenceStartTime,
    absenceEndTime
  );
}

function tripContainsEmployee(
  crew: TripCrewLite | null,
  uid: string
) {
  if (!crew || !uid) return false;

  return (
    String(crew.primaryTechUid || "").trim() === uid ||
    String(crew.helperUid || "").trim() === uid ||
    String(crew.secondaryTechUid || "").trim() === uid ||
    String(crew.secondaryHelperUid || "").trim() === uid
  );
}

function employeeIsPrimaryLead(
  crew: TripCrewLite | null,
  uid: string
) {
  if (!crew || !uid) return false;

  return String(crew.primaryTechUid || "").trim() === uid;
}

function removeEmployeeFromNonLeadCrew(
  originalCrew: TripCrewLite | null,
  uid: string
) {
  const nextCrew: TripCrewLite = {
    ...(originalCrew || {}),
  };

  let removed = false;

  if (String(nextCrew.helperUid || "").trim() === uid) {
    nextCrew.helperUid = null;
    nextCrew.helperName = null;
    removed = true;
  }

  if (String(nextCrew.secondaryTechUid || "").trim() === uid) {
    nextCrew.secondaryTechUid = null;
    nextCrew.secondaryTechName = null;
    removed = true;
  }

  if (String(nextCrew.secondaryHelperUid || "").trim() === uid) {
    nextCrew.secondaryHelperUid = null;
    nextCrew.secondaryHelperName = null;
    removed = true;
  }

  return {
    crew: nextCrew,
    removed,
  };
}

function isTripCompleteOrCancelled(trip: TripLite) {
  const status = normalize(trip.status);

  return (
    status === "complete" ||
    status === "completed" ||
    status === "cancelled" ||
    trip.active === false
  );
}

function isTripInProgress(trip: TripLite) {
  const status = normalize(trip.status);
  const timerState = normalize(trip.timerState);

  return (
    status === "in_progress" ||
    timerState === "running" ||
    timerState === "paused"
  );
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */

export default function AdminUnavailabilityPage() {
  const { appUser } = useAuthContext();

  const canEdit =
    appUser?.role === "admin" ||
    appUser?.role === "dispatcher" ||
    appUser?.role === "manager";

  const today = isoTodayLocal();

  /* USERS */

  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersError, setUsersError] = useState("");

  /* LIST */

  const [listLoading, setListLoading] = useState(true);
  const [items, setItems] = useState<UnavailabilityView[]>([]);
  const [listError, setListError] = useState("");

  const [listTab, setListTab] = useState<ListTab>("upcoming");

  /* FORM */

  const [selectedUid, setSelectedUid] = useState("");

  const [type, setType] =
    useState<UnavailabilityType>("unpaid");

  const [duration, setDuration] =
    useState<AvailabilityDuration>("all_day");

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");

  const [reason, setReason] = useState("");

  /* SAVE */

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  /* ------------------------------------------------------------------------ */
  /* LOAD USERS                                                               */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    async function loadUsers() {
      setUsersLoading(true);
      setUsersError("");

      try {
        const snap = await getDocs(collection(db, "users"));

        const rows: UserOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            uid: String(data.uid ?? docSnap.id),

            displayName: String(
              data.displayName ?? data.name ?? "Unnamed"
            ),

            email:
              data.email != null
                ? String(data.email)
                : undefined,

            role: (data.role ?? "technician") as AppUser["role"],

            active:
              typeof data.active === "boolean"
                ? data.active
                : true,
          };
        });

        rows.sort((a, b) => {
          if (a.active && !b.active) return -1;
          if (!a.active && b.active) return 1;

          return a.displayName.localeCompare(b.displayName);
        });

        setUsers(rows);
      } catch (err: unknown) {
        setUsersError(
          err instanceof Error
            ? err.message
            : "Failed to load employees."
        );
      } finally {
        setUsersLoading(false);
      }
    }

    loadUsers();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* LOAD UNAVAILABILITY                                                      */
  /* ------------------------------------------------------------------------ */

  async function reloadList() {
    setListLoading(true);
    setListError("");

    try {
      const q = query(
        collection(db, "employeeUnavailability"),
        orderBy("date", "desc")
      );

      const snap = await getDocs(q);

      const rows: UnavailabilityView[] = snap.docs.map((docSnap) => {
        const data = docSnap.data();

        const resolvedUid = String(
          data.uid ?? data.employeeId ?? data.userUid ?? ""
        ).trim();

        return {
          id: docSnap.id,

          uid: resolvedUid,
          employeeId: resolvedUid,
          userUid: resolvedUid,

          displayName:
            data.displayName != null
              ? String(data.displayName)
              : data.employeeName != null
                ? String(data.employeeName)
                : undefined,

          date: String(data.date ?? data.startDate ?? ""),

          startDate: String(
            data.startDate ?? data.date ?? ""
          ),

          endDate: String(
            data.endDate ??
              data.startDate ??
              data.date ??
              ""
          ),

          allDay:
            typeof data.allDay === "boolean"
              ? data.allDay
              : true,

          startTime:
            data.startTime != null
              ? String(data.startTime)
              : undefined,

          endTime:
            data.endTime != null
              ? String(data.endTime)
              : undefined,

          type: (data.type ?? "other") as UnavailabilityType,

          reason:
            data.reason != null
              ? String(data.reason)
              : undefined,

          source:
            data.source != null
              ? String(data.source)
              : undefined,

          active:
            typeof data.active === "boolean"
              ? data.active
              : true,

          createdAt:
            data.createdAt != null
              ? String(data.createdAt)
              : undefined,

          createdByUid:
            data.createdByUid != null
              ? String(data.createdByUid)
              : undefined,

          updatedAt:
            data.updatedAt != null
              ? String(data.updatedAt)
              : undefined,

          updatedByUid:
            data.updatedByUid != null
              ? String(data.updatedByUid)
              : undefined,
        };
      });

      setItems(rows);
    } catch (err: unknown) {
      setListError(
        err instanceof Error
          ? err.message
          : "Failed to load employee unavailability."
      );
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    reloadList();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* MEMO DATA                                                                */
  /* ------------------------------------------------------------------------ */

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const user of users) {
      map.set(user.uid, user.displayName);
    }

    return map;
  }, [users]);

  const activeUsers = useMemo(
    () => users.filter((user) => user.active),
    [users]
  );

  const inactiveUsers = useMemo(
    () => users.filter((user) => !user.active),
    [users]
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.uid === selectedUid) || null,
    [users, selectedUid]
  );

  const upcomingItems = useMemo(() => {
    return items
      .filter((item) => {
        if (!item.active) return false;

        const end = getEndDate(item);

        return Boolean(end && end >= today);
      })
      .sort((a, b) =>
        getStartDate(a).localeCompare(getStartDate(b))
      );
  }, [items, today]);

  const historyItems = useMemo(() => {
    return items
      .filter((item) => {
        if (!item.active) return true;

        const end = getEndDate(item);

        return !end || end < today;
      })
      .sort((a, b) =>
        getStartDate(b).localeCompare(getStartDate(a))
      );
  }, [items, today]);

  const visibleItems =
    listTab === "upcoming"
      ? upcomingItems
      : historyItems;

  /* ------------------------------------------------------------------------ */
  /* FORM                                                                     */
  /* ------------------------------------------------------------------------ */

  function handleDurationChange(
    _event: React.MouseEvent<HTMLElement>,
    nextDuration: AvailabilityDuration | null
  ) {
    if (!nextDuration) return;

    setDuration(nextDuration);

    setSaveError("");
    setSaveSuccess("");

    if (nextDuration === "partial_day") {
      setEndDate(startDate);
    }
  }

  function handleStartDateChange(nextDate: string) {
    setStartDate(nextDate);

    if (duration === "partial_day") {
      setEndDate(nextDate);
      return;
    }

    if (!endDate || endDate < nextDate) {
      setEndDate(nextDate);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* TRIP CLEANUP                                                             */
  /* ------------------------------------------------------------------------ */

  async function buildTripCleanupIntoBatch(args: {
    batch: ReturnType<typeof writeBatch>;
    employeeUid: string;
    employeeName: string;
    absenceStartDate: string;
    absenceEndDate: string;
    allDay: boolean;
    absenceStartTime?: string;
    absenceEndTime?: string;
    nowIso: string;
  }): Promise<TripCleanupResult> {
    const {
      batch,
      employeeUid,
      employeeName,
      absenceStartDate,
      absenceEndDate,
      allDay,
      absenceStartTime,
      absenceEndTime,
      nowIso,
    } = args;

    const result: TripCleanupResult = {
      affectedTrips: 0,
      removedAssignments: 0,
      leadReassignmentTrips: 0,
      activeTripReviews: 0,
    };

    const tripSnap = await getDocs(
      query(
        collection(db, "trips"),
        where("date", ">=", absenceStartDate),
        where("date", "<=", absenceEndDate)
      )
    );

    const trips: TripLite[] = tripSnap.docs.map((docSnap) => {
      const data = docSnap.data();

      return {
        id: docSnap.id,

        active:
          typeof data.active === "boolean"
            ? data.active
            : true,

        type: String(data.type ?? ""),
        status: String(data.status ?? "planned"),
        date: String(data.date ?? ""),

        timeWindow: String(data.timeWindow ?? ""),
        startTime: String(data.startTime ?? ""),
        endTime: String(data.endTime ?? ""),

        timerState: String(data.timerState ?? ""),

        crew:
          data.crew && typeof data.crew === "object"
            ? (data.crew as TripCrewLite)
            : null,

        link:
          data.link && typeof data.link === "object"
            ? data.link
            : null,
      };
    });

    for (const trip of trips) {
      if (isTripCompleteOrCancelled(trip)) {
        continue;
      }

      if (!tripContainsEmployee(trip.crew, employeeUid)) {
        continue;
      }

      if (
        !tripOverlapsAbsence({
          trip,
          absenceStartDate,
          absenceEndDate,
          allDay,
          absenceStartTime,
          absenceEndTime,
        })
      ) {
        continue;
      }

      result.affectedTrips += 1;

      const tripRef = doc(db, "trips", trip.id);

      /* ACTIVE TRIP */

      if (isTripInProgress(trip)) {
        const issue =
          `${employeeName} is unavailable during this trip, ` +
          `but the trip is already in progress. Review the active crew manually.`;

        batch.update(tripRef, {
          staffingStatus: "needs_staffing",
          staffingIssue: issue,
          crewConfirmed: null,

          updatedAt: nowIso,
          updatedByUid: appUser?.uid || null,
        });

        result.activeTripReviews += 1;

        continue;
      }

      /* LEAD TECH */

      if (employeeIsPrimaryLead(trip.crew, employeeUid)) {
        const issue =
          `${employeeName} is unavailable on ${trip.date} ` +
          `and is assigned as the lead tech. Reassign the lead before this trip begins.`;

        batch.update(tripRef, {
          staffingStatus: "needs_staffing",
          staffingIssue: issue,
          crewConfirmed: null,

          updatedAt: nowIso,
          updatedByUid: appUser?.uid || null,
        });

        const serviceTicketId = String(
          trip.link?.serviceTicketId || ""
        ).trim();

        if (serviceTicketId) {
          batch.update(
            doc(db, "serviceTickets", serviceTicketId),
            {
              staffingStatus: "needs_staffing",
              staffingIssue: issue,

              updatedAt: nowIso,
              updatedByUid: appUser?.uid || null,
            }
          );
        }

        result.leadReassignmentTrips += 1;

        continue;
      }

      /* HELPER / SECONDARY CREW */

      const cleaned = removeEmployeeFromNonLeadCrew(
        trip.crew,
        employeeUid
      );

      if (!cleaned.removed) {
        continue;
      }

      const issue =
        `${employeeName} was automatically removed from this crew ` +
        `because they are unavailable on ${trip.date}.`;

      batch.update(tripRef, {
        crew: cleaned.crew,

        crewConfirmed: null,

        staffingStatus: "needs_staffing",
        staffingIssue: issue,

        updatedAt: nowIso,
        updatedByUid: appUser?.uid || null,
      });

      const serviceTicketId = String(
        trip.link?.serviceTicketId || ""
      ).trim();

      if (serviceTicketId) {
        batch.update(
          doc(db, "serviceTickets", serviceTicketId),
          {
            ...buildServiceTicketAssignmentFromCrew(cleaned.crew),

            staffingStatus: "needs_staffing",
            staffingIssue: issue,

            updatedAt: nowIso,
            updatedByUid: appUser?.uid || null,
          }
        );
      }

      result.removedAssignments += 1;
    }

    return result;
  }

  /* ------------------------------------------------------------------------ */
  /* CREATE                                                                   */
  /* ------------------------------------------------------------------------ */

  async function handleCreate(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!canEdit) return;

    setSaveError("");
    setSaveSuccess("");

    if (!selectedUid.trim()) {
      setSaveError("Select an employee.");
      return;
    }

    if (!selectedUser) {
      setSaveError("The selected employee could not be found.");
      return;
    }

    if (!startDate.trim()) {
      setSaveError("Choose a start date.");
      return;
    }

    if (duration === "all_day") {
      if (!endDate.trim()) {
        setSaveError("Choose an end date.");
        return;
      }

      if (endDate < startDate) {
        setSaveError(
          "End date cannot be before the start date."
        );
        return;
      }
    }

    if (duration === "partial_day") {
      if (!startTime.trim() || !endTime.trim()) {
        setSaveError(
          "Choose both a start time and an end time."
        );
        return;
      }

      if (endTime <= startTime) {
        setSaveError(
          "End time must be later than start time."
        );
        return;
      }
    }

    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const employeeUid = selectedUid.trim();
      const employeeName = selectedUser.displayName;

      const isAllDay = duration === "all_day";

      const finalEndDate = isAllDay
        ? endDate
        : startDate;

      const batch = writeBatch(db);

      const unavailabilityRef = doc(
        collection(db, "employeeUnavailability")
      );

      batch.set(unavailabilityRef, {
        uid: employeeUid,
        employeeId: employeeUid,
        userUid: employeeUid,

        displayName: employeeName,
        employeeName,

        // Legacy compatibility
        date: startDate,

        startDate,
        endDate: finalEndDate,

        allDay: isAllDay,

        startTime: isAllDay ? null : startTime,
        endTime: isAllDay ? null : endTime,

        requestDayType: isAllDay
          ? "full_day"
          : "partial_day",

        timeWindow: isAllDay
          ? "all_day"
          : "custom",

        type,

        reason: reason.trim() || null,

        source: "manual_unavailability",

        active: true,

        createdAt: nowIso,
        createdByUid: appUser?.uid || null,
        createdByName:
          appUser?.displayName ||
          appUser?.email ||
          null,

        updatedAt: nowIso,
        updatedByUid: appUser?.uid || null,
        updatedByName:
          appUser?.displayName ||
          appUser?.email ||
          null,
      });

      const cleanup = await buildTripCleanupIntoBatch({
        batch,

        employeeUid,
        employeeName,

        absenceStartDate: startDate,
        absenceEndDate: finalEndDate,

        allDay: isAllDay,

        absenceStartTime: isAllDay
          ? undefined
          : startTime,

        absenceEndTime: isAllDay
          ? undefined
          : endTime,

        nowIso,
      });

      await batch.commit();

      const messageParts: string[] = [];

      if (isAllDay) {
        if (startDate === finalEndDate) {
          messageParts.push(
            `${employeeName} marked ${formatType(type)} — All Day on ${formatDate(
              startDate
            )}.`
          );
        } else {
          messageParts.push(
            `${employeeName} marked ${formatType(type)} — ${formatDate(
              startDate
            )} through ${formatDate(finalEndDate)}.`
          );
        }
      } else {
        messageParts.push(
          `${employeeName} marked ${formatType(type)} — ${formatDate(
            startDate
          )}, ${formatTime(startTime)}–${formatTime(endTime)}.`
        );
      }

      if (cleanup.removedAssignments > 0) {
        messageParts.push(
          `Removed from ${cleanup.removedAssignments} scheduled trip${
            cleanup.removedAssignments === 1 ? "" : "s"
          }.`
        );
      }

      if (cleanup.leadReassignmentTrips > 0) {
        messageParts.push(
          `${cleanup.leadReassignmentTrips} trip${
            cleanup.leadReassignmentTrips === 1 ? "" : "s"
          } require${
            cleanup.leadReassignmentTrips === 1 ? "s" : ""
          } lead reassignment.`
        );
      }

      if (cleanup.activeTripReviews > 0) {
        messageParts.push(
          `${cleanup.activeTripReviews} active trip${
            cleanup.activeTripReviews === 1 ? "" : "s"
          } require${
            cleanup.activeTripReviews === 1 ? "s" : ""
          } manual crew review.`
        );
      }

      if (cleanup.affectedTrips === 0) {
        messageParts.push("No scheduled trips were affected.");
      }

      setSaveSuccess(messageParts.join(" "));

      setReason("");

      await reloadList();
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Failed to create unavailability."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* CANCEL / REACTIVATE                                                      */
  /* ------------------------------------------------------------------------ */

  async function setActive(
    docId: string,
    nextActive: boolean
  ) {
    if (!canEdit) return;

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(
        doc(db, "employeeUnavailability", docId),
        {
          active: nextActive,

          updatedAt: nowIso,

          updatedByUid: appUser?.uid || null,

          updatedByName:
            appUser?.displayName ||
            appUser?.email ||
            null,
        }
      );

      setItems((prev) =>
        prev.map((item) =>
          item.id === docId
            ? {
                ...item,
                active: nextActive,
                updatedAt: nowIso,
                updatedByUid: appUser?.uid,
              }
            : item
        )
      );
    } catch (err: unknown) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to update record."
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <ProtectedPage
      fallbackTitle="Employee Unavailability"
      allowedRoles={["admin", "dispatcher", "manager"]}
    >
      <AppShell appUser={appUser}>
        <Box
          sx={{
            width: "100%",
            maxWidth: 1180,
            mx: "auto",
            px: {
              xs: 2,
              sm: 3,
            },
            py: {
              xs: 2,
              md: 3,
            },
            pb: 6,
          }}
        >
          {/* HEADER */}

          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h4"
              component="h1"
              sx={{
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              Employee Unavailability
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.75,
                maxWidth: 720,
              }}
            >
              Record an employee absence and automatically
              review affected project and service trip crews.
            </Typography>
          </Box>

          <Stack spacing={3}>
            {/* ============================================================ */}
            {/* CREATE                                                       */}
            {/* ============================================================ */}

            <Card
              variant="outlined"
              sx={{
                borderRadius: 4,
                overflow: "hidden",
                bgcolor: "background.paper",
              }}
            >
              <CardContent
                sx={{
                  p: {
                    xs: 2,
                    sm: 3,
                  },

                  "&:last-child": {
                    pb: {
                      xs: 2,
                      sm: 3,
                    },
                  },
                }}
              >
                <Stack spacing={3}>
                  {/* CARD TITLE */}

                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 750 }}
                    >
                      Add Unavailability
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      Mark one employee unavailable. The rest
                      of their normal crew remains available
                      for reassignment.
                    </Typography>
                  </Box>

                  <Divider />

                  {usersError ? (
                    <Alert severity="error">
                      {usersError}
                    </Alert>
                  ) : null}

                  <Box
                    component="form"
                    onSubmit={handleCreate}
                  >
                    <Stack spacing={3}>
                      {/* EMPLOYEE + TYPE */}

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            md: "minmax(0, 2fr) minmax(240px, 1fr)",
                          },
                          gap: 2,
                        }}
                      >
                        <FormControl
                          fullWidth
                          disabled={
                            !canEdit || usersLoading
                          }
                        >
                          <InputLabel id="employee-label">
                            Employee
                          </InputLabel>

                          <Select
                            labelId="employee-label"
                            label="Employee"
                            value={selectedUid}
                            onChange={(e) => {
                              setSelectedUid(
                                String(e.target.value)
                              );

                              setSaveError("");
                              setSaveSuccess("");
                            }}
                            startAdornment={
                              usersLoading ? (
                                <CircularProgress
                                  size={18}
                                  sx={{ mr: 1.5 }}
                                />
                              ) : undefined
                            }
                          >
                            <MenuItem value="">
                              <em>Select employee</em>
                            </MenuItem>

                            {activeUsers.map((user) => (
                              <MenuItem
                                key={user.uid}
                                value={user.uid}
                              >
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  sx={{ width: "100%" }}
                                >
                                  <Typography
                                    variant="body1"
                                    sx={{ fontWeight: 600 }}
                                  >
                                    {user.displayName}
                                  </Typography>

                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {formatRole(user.role)}
                                  </Typography>
                                </Stack>
                              </MenuItem>
                            ))}

                            {inactiveUsers.length > 0 ? (
                              <Divider />
                            ) : null}

                            {inactiveUsers.map((user) => (
                              <MenuItem
                                key={user.uid}
                                value={user.uid}
                              >
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <Typography>
                                    {user.displayName}
                                  </Typography>

                                  <Chip
                                    size="small"
                                    label="Inactive"
                                    variant="outlined"
                                  />
                                </Stack>
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <FormControl fullWidth disabled={!canEdit}>
                          <InputLabel id="absence-type-label">
                            Absence type
                          </InputLabel>

                          <Select
                            labelId="absence-type-label"
                            label="Absence type"
                            value={type}
                            onChange={(e) => {
                              setType(
                                e.target
                                  .value as UnavailabilityType
                              );

                              setSaveError("");
                              setSaveSuccess("");
                            }}
                          >
                            <MenuItem value="unpaid">
                              Unpaid
                            </MenuItem>

                            <MenuItem value="pto">
                              PTO
                            </MenuItem>

                            <MenuItem value="sick">
                              Sick
                            </MenuItem>

                            <MenuItem value="other">
                              Other
                            </MenuItem>
                          </Select>
                        </FormControl>
                      </Box>

                      {type === "unpaid" ? (
                        <Alert
                          severity="info"
                          variant="outlined"
                          icon={false}
                          sx={{
                            borderRadius: 3,
                          }}
                        >
                          <Typography variant="body2">
                            <strong>Unpaid</strong> is for an
                            employee who is unavailable but
                            will not receive PTO for the
                            absence.
                          </Typography>
                        </Alert>
                      ) : null}

                      {/* DURATION */}

                      <Box>
                        <Typography
                          variant="overline"
                          color="text.secondary"
                          sx={{
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                          }}
                        >
                          Duration
                        </Typography>

                        <Box sx={{ mt: 0.75 }}>
                          <ToggleButtonGroup
                            exclusive
                            value={duration}
                            onChange={handleDurationChange}
                            disabled={!canEdit}
                            size="small"
                            sx={{
                              "& .MuiToggleButton-root": {
                                px: 2.5,
                                textTransform: "none",
                                fontWeight: 700,
                              },
                            }}
                          >
                            <ToggleButton value="all_day">
                              All day
                            </ToggleButton>

                            <ToggleButton value="partial_day">
                              Partial day
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      </Box>

                      {/* DATE FIELDS */}

                      {duration === "all_day" ? (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "1fr 1fr",
                            },
                            gap: 2,
                          }}
                        >
                          <TextField
                            type="date"
                            label="Start date"
                            value={startDate}
                            onChange={(e) =>
                              handleStartDateChange(
                                e.target.value
                              )
                            }
                            disabled={!canEdit}
                            fullWidth
                            InputLabelProps={{
                              shrink: true,
                            }}
                          />

                          <TextField
                            type="date"
                            label="End date"
                            value={endDate}
                            inputProps={{
                              min: startDate,
                            }}
                            onChange={(e) =>
                              setEndDate(e.target.value)
                            }
                            disabled={!canEdit}
                            fullWidth
                            InputLabelProps={{
                              shrink: true,
                            }}
                            helperText="Same date for a one-day absence."
                          />
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "1fr 1fr",
                              md: "1fr 1fr 1fr",
                            },
                            gap: 2,
                          }}
                        >
                          <TextField
                            type="date"
                            label="Date"
                            value={startDate}
                            onChange={(e) =>
                              handleStartDateChange(
                                e.target.value
                              )
                            }
                            disabled={!canEdit}
                            fullWidth
                            InputLabelProps={{
                              shrink: true,
                            }}
                          />

                          <TextField
                            type="time"
                            label="Start time"
                            value={startTime}
                            onChange={(e) =>
                              setStartTime(e.target.value)
                            }
                            disabled={!canEdit}
                            fullWidth
                            InputLabelProps={{
                              shrink: true,
                            }}
                          />

                          <TextField
                            type="time"
                            label="End time"
                            value={endTime}
                            onChange={(e) =>
                              setEndTime(e.target.value)
                            }
                            disabled={!canEdit}
                            fullWidth
                            InputLabelProps={{
                              shrink: true,
                            }}
                          />
                        </Box>
                      )}

                      {/* NOTE */}

                      <TextField
                        label="Note"
                        value={reason}
                        onChange={(e) =>
                          setReason(e.target.value)
                        }
                        disabled={!canEdit}
                        placeholder="Optional office note"
                        fullWidth
                        multiline
                        minRows={2}
                      />

                      {/* SCHEDULE IMPACT */}

                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          bgcolor: "action.hover",
                        }}
                      >
                        <Stack spacing={0.5}>
                          <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: 750 }}
                          >
                            What DCFlow will do
                          </Typography>

                          <Typography
                            variant="body2"
                            color="text.secondary"
                          >
                            Overlapping planned trips are
                            checked automatically. Helpers
                            and secondary crew are removed.
                            Lead assignments and trips
                            already in progress are flagged
                            for manual staffing review.
                          </Typography>
                        </Stack>
                      </Paper>

                      {saveError ? (
                        <Alert severity="error">
                          {saveError}
                        </Alert>
                      ) : null}

                      {saveSuccess ? (
                        <Alert severity="success">
                          {saveSuccess}
                        </Alert>
                      ) : null}

                      {/* ACTION */}

                      <Stack
                        direction={{
                          xs: "column",
                          sm: "row",
                        }}
                        justifyContent="flex-end"
                        alignItems={{
                          xs: "stretch",
                          sm: "center",
                        }}
                      >
                        <Button
                          type="submit"
                          variant="contained"
                          size="large"
                          disabled={
                            saving ||
                            !canEdit ||
                            usersLoading
                          }
                          sx={{
                            minWidth: 220,
                            borderRadius: 999,
                            textTransform: "none",
                            fontWeight: 750,
                            px: 3,
                          }}
                        >
                          {saving
                            ? "Saving & reviewing trips…"
                            : "Add unavailability"}
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* CURRENT / HISTORY                                            */}
            {/* ============================================================ */}

            <Card
              variant="outlined"
              sx={{
                borderRadius: 4,
                overflow: "hidden",
                bgcolor: "background.paper",
              }}
            >
              {/* LIST HEADER */}

              <Box
                sx={{
                  px: {
                    xs: 2,
                    sm: 3,
                  },
                  pt: {
                    xs: 2,
                    sm: 2.5,
                  },
                }}
              >
                <Stack
                  direction={{
                    xs: "column",
                    sm: "row",
                  }}
                  justifyContent="space-between"
                  alignItems={{
                    xs: "stretch",
                    sm: "center",
                  }}
                  gap={2}
                >
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 750 }}
                    >
                      Absence Schedule
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.25 }}
                    >
                      Current, upcoming, and previous
                      employee absences.
                    </Typography>
                  </Box>

                  <Tabs
                    value={listTab}
                    onChange={(_e, value: ListTab) =>
                      setListTab(value)
                    }
                    sx={{
                      minHeight: 40,

                      "& .MuiTab-root": {
                        minHeight: 40,
                        textTransform: "none",
                        fontWeight: 700,
                        px: 2,
                      },
                    }}
                  >
                    <Tab
                      value="upcoming"
                      label={`Upcoming (${upcomingItems.length})`}
                    />

                    <Tab
                      value="history"
                      label={`History (${historyItems.length})`}
                    />
                  </Tabs>
                </Stack>
              </Box>

              <Divider sx={{ mt: 2 }} />

              <CardContent
                sx={{
                  p: {
                    xs: 2,
                    sm: 3,
                  },

                  "&:last-child": {
                    pb: {
                      xs: 2,
                      sm: 3,
                    },
                  },
                }}
              >
                {listLoading ? (
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ py: 4 }}
                  >
                    <CircularProgress size={22} />

                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      Loading employee absences…
                    </Typography>
                  </Stack>
                ) : null}

                {listError ? (
                  <Alert severity="error">
                    {listError}
                  </Alert>
                ) : null}

                {!listLoading &&
                !listError &&
                visibleItems.length === 0 ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      py: 6,
                      px: 3,
                      textAlign: "center",
                      borderRadius: 3,
                      borderStyle: "dashed",
                      bgcolor: "action.hover",
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 700 }}
                    >
                      {listTab === "upcoming"
                        ? "Everyone is available"
                        : "No absence history"}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      {listTab === "upcoming"
                        ? "There are no current or upcoming employee absences."
                        : "There are no past or cancelled absence records to show."}
                    </Typography>
                  </Paper>
                ) : null}

                {!listLoading &&
                !listError &&
                visibleItems.length > 0 ? (
                  <Stack spacing={1.25}>
                    {visibleItems
                      .slice(0, 100)
                      .map((item) => {
                        const itemUid = String(
                          item.uid ||
                            item.employeeId ||
                            item.userUid ||
                            ""
                        ).trim();

                        const employeeName =
                          item.displayName ||
                          userNameMap.get(itemUid) ||
                          itemUid ||
                          "Unknown Employee";

                        const isAllDay =
                          getIsAllDay(item);

                        const start =
                          getStartDate(item);

                        const end =
                          getEndDate(item);

                        const isToday =
                          item.active &&
                          start <= today &&
                          end >= today;

                        const typeColor:
                          | "default"
                          | "primary"
                          | "error"
                          | "warning"
                          | "success" =
                          item.type === "pto"
                            ? "primary"
                            : item.type === "sick"
                              ? "error"
                              : item.type === "unpaid"
                                ? "warning"
                                : item.type === "holiday"
                                  ? "success"
                                  : "default";

                        return (
                          <Paper
                            key={item.id}
                            variant="outlined"
                            sx={{
                              borderRadius: 3,

                              px: {
                                xs: 2,
                                sm: 2.25,
                              },

                              py: 1.75,

                              opacity: item.active
                                ? 1
                                : 0.62,

                              transition:
                                "background-color 120ms ease",

                              "&:hover": {
                                bgcolor:
                                  "action.hover",
                              },
                            }}
                          >
                            <Stack
                              direction={{
                                xs: "column",
                                sm: "row",
                              }}
                              justifyContent="space-between"
                              alignItems={{
                                xs: "stretch",
                                sm: "center",
                              }}
                              gap={2}
                            >
                              {/* LEFT */}

                              <Box sx={{ minWidth: 0 }}>
                                <Stack
                                  direction="row"
                                  alignItems="center"
                                  spacing={1}
                                  useFlexGap
                                  flexWrap="wrap"
                                >
                                  <Typography
                                    variant="subtitle1"
                                    sx={{
                                      fontWeight: 750,
                                    }}
                                  >
                                    {employeeName}
                                  </Typography>

                                  <Chip
                                    size="small"
                                    label={formatType(
                                      item.type
                                    )}
                                    color={typeColor}
                                    variant="outlined"
                                    sx={{
                                      fontWeight: 700,
                                    }}
                                  />

                                  {isToday ? (
                                    <Chip
                                      size="small"
                                      label="Out today"
                                      color="error"
                                      sx={{
                                        fontWeight: 750,
                                      }}
                                    />
                                  ) : null}

                                  {!item.active ? (
                                    <Chip
                                      size="small"
                                      label="Cancelled"
                                      variant="outlined"
                                    />
                                  ) : null}
                                </Stack>

                                <Stack
                                  direction={{
                                    xs: "column",
                                    sm: "row",
                                  }}
                                  spacing={{
                                    xs: 0.25,
                                    sm: 1,
                                  }}
                                  sx={{ mt: 0.75 }}
                                >
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 600,
                                    }}
                                  >
                                    {formatDateRange(item)}
                                  </Typography>

                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    {isAllDay
                                      ? "All day"
                                      : `${formatTime(
                                          item.startTime
                                        )} – ${formatTime(
                                          item.endTime
                                        )}`}
                                  </Typography>
                                </Stack>

                                {item.reason ? (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                      mt: 0.75,
                                    }}
                                  >
                                    {item.reason}
                                  </Typography>
                                ) : null}
                              </Box>

                              {/* RIGHT */}

                              {canEdit ? (
                                <Button
                                  type="button"
                                  variant={
                                    item.active
                                      ? "outlined"
                                      : "text"
                                  }
                                  size="small"
                                  onClick={() =>
                                    setActive(
                                      item.id,
                                      !item.active
                                    )
                                  }
                                  sx={{
                                    alignSelf: {
                                      xs: "flex-start",
                                      sm: "center",
                                    },
                                    borderRadius: 999,
                                    textTransform: "none",
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {item.active
                                    ? "Cancel absence"
                                    : "Reactivate"}
                                </Button>
                              ) : null}
                            </Stack>
                          </Paper>
                        );
                      })}
                  </Stack>
                ) : null}
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}

export {};