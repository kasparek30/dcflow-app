import { doc, getDoc, writeBatch, type WriteBatch } from "firebase/firestore";
import { db } from "./firebase";

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

type ProjectTripLite = {
  id: string;
  date?: string | null;
  timeWindow?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
  timerState?: string | null;
  crew?: TripCrew | null;
  link?: {
    projectId?: string | null;
    projectStageKey?: string | null;
    serviceTicketId?: string | null;
  } | null;
};

type CrewMemberForTimeEntry = {
  uid: string;
  name: string;
  role: string;
  crewRole: "primaryTech" | "helper" | "secondaryTech" | "secondaryHelper";
};

export type ProjectTripTimeEntrySyncResult = {
  memberCount: number;
  createdOrUpdatedEntryIds: string[];
  skippedReason?: string;
};

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPayrollWeekBounds(entryDateIso: string) {
  const clean = safeTrim(entryDateIso);
  const [y, m, d] = clean.split("-").map((part) => Number(part));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);

  const weekday = dt.getDay();
  const diffToMonday = (weekday + 6) % 7;

  const weekStart = new Date(dt);
  weekStart.setDate(weekStart.getDate() - diffToMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    weekStartDate: toIsoDate(weekStart),
    weekEndDate: toIsoDate(weekEnd),
  };
}

function buildWeeklyTimesheetId(employeeId: string, weekStartDate: string) {
  return `ws_${employeeId}_${weekStartDate}`;
}

function buildProjectTripTimeEntryId(tripId: string, employeeId: string) {
  return `trip_${tripId}_${employeeId}`;
}

function normalizeProjectStageKey(value: unknown) {
  const key = safeTrim(value);
  return key || null;
}

function normalizeRoleFromCrewSlot(crewRole: CrewMemberForTimeEntry["crewRole"]) {
  if (crewRole === "helper" || crewRole === "secondaryHelper") return "helper";
  return "technician";
}

function uniqueCrewMembers(crew?: TripCrew | null): CrewMemberForTimeEntry[] {
  const members: CrewMemberForTimeEntry[] = [];
  const seen = new Set<string>();

  function pushMember(input: {
    uid?: string | null;
    name?: string | null;
    crewRole: CrewMemberForTimeEntry["crewRole"];
  }) {
    const uid = safeTrim(input.uid);
    if (!uid) return;
    if (seen.has(uid)) return;

    seen.add(uid);

    members.push({
      uid,
      name: safeTrim(input.name) || "Employee",
      role: normalizeRoleFromCrewSlot(input.crewRole),
      crewRole: input.crewRole,
    });
  }

  pushMember({
    uid: crew?.primaryTechUid,
    name: crew?.primaryTechName,
    crewRole: "primaryTech",
  });

  pushMember({
    uid: crew?.helperUid,
    name: crew?.helperName,
    crewRole: "helper",
  });

  pushMember({
    uid: crew?.secondaryTechUid,
    name: crew?.secondaryTechName,
    crewRole: "secondaryTech",
  });

  pushMember({
    uid: crew?.secondaryHelperUid,
    name: crew?.secondaryHelperName,
    crewRole: "secondaryHelper",
  });

  return members;
}

async function resolveUserProfileFallback(member: CrewMemberForTimeEntry) {
  try {
    const snap = await getDoc(doc(db, "users", member.uid));
    if (!snap.exists()) return member;

    const data = snap.data() as any;

    return {
      ...member,
      name:
        safeTrim(data.displayName) ||
        safeTrim(data.name) ||
        safeTrim(data.email) ||
        member.name,
      role: safeTrim(data.role) || member.role,
    };
  } catch {
    return member;
  }
}

export async function queueProjectTripTimeEntryWrites(
  batch: WriteBatch,
  args: {
    trip: ProjectTripLite;
    projectId?: string | null;
    projectStageKey?: string | null;
    hours: number;
    notes?: string | null;
    actorUid?: string | null;
    actorName?: string | null;
    source?: string;
  },
): Promise<ProjectTripTimeEntrySyncResult> {
  const trip = args.trip;
  const tripId = safeTrim(trip?.id);
  const projectId = safeTrim(args.projectId) || safeTrim(trip?.link?.projectId);

  if (!tripId) {
    return {
      memberCount: 0,
      createdOrUpdatedEntryIds: [],
      skippedReason: "Missing trip id.",
    };
  }

  if (!projectId) {
    return {
      memberCount: 0,
      createdOrUpdatedEntryIds: [],
      skippedReason: "Missing project id.",
    };
  }

  const hours = Number(args.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return {
      memberCount: 0,
      createdOrUpdatedEntryIds: [],
      skippedReason: "Hours must be greater than 0.",
    };
  }

  const crewMembers = uniqueCrewMembers(trip.crew || null);

  if (crewMembers.length === 0) {
    return {
      memberCount: 0,
      createdOrUpdatedEntryIds: [],
      skippedReason: "No assigned crew members found.",
    };
  }

  const stamp = new Date().toISOString();
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const entryDate = safeTrim(trip.date) || toIsoDate(new Date());
  const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);
  const projectStageKey = normalizeProjectStageKey(
    args.projectStageKey ?? trip?.link?.projectStageKey,
  );

  const createdOrUpdatedEntryIds: string[] = [];

  for (const rawMember of crewMembers) {
    const member = await resolveUserProfileFallback(rawMember);

    const timesheetId = buildWeeklyTimesheetId(member.uid, weekStartDate);
    const timeEntryId = buildProjectTripTimeEntryId(tripId, member.uid);

    const timesheetRef = doc(db, "weeklyTimesheets", timesheetId);
    const timeEntryRef = doc(db, "timeEntries", timeEntryId);

    const [timesheetSnap, timeEntrySnap] = await Promise.all([
      getDoc(timesheetRef),
      getDoc(timeEntryRef),
    ]);

    const existingTimesheet = timesheetSnap.exists()
      ? (timesheetSnap.data() as any)
      : null;

    const existingEntry = timeEntrySnap.exists()
      ? (timeEntrySnap.data() as any)
      : null;

    batch.set(
      timesheetRef,
      {
        employeeId: member.uid,
        employeeName: member.name || "Employee",
        employeeRole: member.role || "employee",
        weekStartDate,
        weekEndDate,
        status: safeTrim(existingTimesheet?.status) || "draft",
        submittedAt: existingTimesheet?.submittedAt ?? null,
        submittedByUid: existingTimesheet?.submittedByUid ?? null,
        createdAt: existingTimesheet?.createdAt ?? stamp,
        createdByUid: existingTimesheet?.createdByUid ?? actorUid,
        updatedAt: stamp,
        updatedByUid: actorUid,
      },
      { merge: true },
    );

    batch.set(
      timeEntryRef,
      {
        employeeId: member.uid,
        employeeName: member.name || "Employee",
        employeeRole: member.role || "employee",
        entryDate,
        weekStartDate,
        weekEndDate,
        timesheetId,

        category: "project",
        payType: "regular",
        billable: true,

        source: args.source || "project_trip_closeout",
        sourceType: "project_trip",
        sourceTripId: tripId,
        sourceTripStatus: safeTrim(trip.status) || "complete",

        hours,
        hoursSource: hours,
        hoursLocked: true,

        tripId,
        projectId,
        projectStageKey,

        crewRole: member.crewRole,

        entryStatus: safeTrim(existingEntry?.entryStatus) || "draft",
        notes: safeTrim(args.notes) || null,

        createdAt: existingEntry?.createdAt ?? stamp,
        createdByUid: existingEntry?.createdByUid ?? actorUid,
        updatedAt: stamp,
        updatedByUid: actorUid,
        updatedByName: actorName,
      },
      { merge: true },
    );

    createdOrUpdatedEntryIds.push(timeEntryId);
  }

  return {
    memberCount: crewMembers.length,
    createdOrUpdatedEntryIds,
  };
}

export async function upsertProjectTripTimeEntriesForCrew(args: {
  trip: ProjectTripLite;
  projectId?: string | null;
  projectStageKey?: string | null;
  hours: number;
  notes?: string | null;
  actorUid?: string | null;
  actorName?: string | null;
  source?: string;
}): Promise<ProjectTripTimeEntrySyncResult> {
  const batch = writeBatch(db);

  const result = await queueProjectTripTimeEntryWrites(batch, args);

  if (result.memberCount > 0) {
    await batch.commit();
  }

  return result;
}