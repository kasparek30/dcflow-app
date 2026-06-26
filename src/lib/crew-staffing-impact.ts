// src/lib/crew-staffing-impact.ts

export type CrewStaffingTripTimeWindow = "am" | "pm" | "all_day" | "custom" | string;

export type CrewStaffingTripCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;
  helperUid?: string | null;
  helperName?: string | null;
  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;
  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
};

export type CrewStaffingTripLite = {
  id: string;
  active?: boolean | null;
  type?: "service" | "project" | string | null;
  status?: string | null;
  date?: string | null;
  timeWindow?: CrewStaffingTripTimeWindow | null;
  startTime?: string | null;
  endTime?: string | null;
  crew?: CrewStaffingTripCrew | null;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  } | null;
  notes?: string | null;
};

export type CrewStaffingTicketLite = {
  id: string;
  customerDisplayName?: string | null;
  issueSummary?: string | null;
  serviceAddressLine1?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  status?: string | null;
};

export type CrewStaffingReplacementCandidate = {
  uid: string;
  name: string;
  role: "lead" | "helper";
  unavailable?: boolean;
  unavailableReason?: string | null;
};

export type CrewStaffingRoleOnTrip =
  | "primaryTech"
  | "helper"
  | "secondaryTech"
  | "secondaryHelper";

export type CrewStaffingActionType =
  | "remove_worker"
  | "replace_worker"
  | "needs_staffing"
  | "reschedule_trip"
  | "review_only";

export type CrewStaffingActionSelection = {
  type: CrewStaffingActionType;
  replacementUid?: string | null;
  replacementName?: string | null;
};

export type CrewStaffingImpactTrip = {
  trip: CrewStaffingTripLite;
  ticket?: CrewStaffingTicketLite | null;
  affectedPositions: CrewStaffingRoleOnTrip[];
  primaryAffectedPosition: CrewStaffingRoleOnTrip;
  affectedRoleLabel: string;
  status: string;
  isPlanned: boolean;
  isInProgress: boolean;
  isEditable: boolean;
};

export type CrewStaffingApplyResult = {
  nextCrew: CrewStaffingTripCrew;
  needsStaffing: boolean;
  staffingStatus: "staffed" | "needs_staffing" | "needs_reschedule" | "review_required";
  staffingIssue: Record<string, unknown> | null;
  activityDetails: string[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value).toLowerCase();
}

export function isOpenCrewStaffingTrip(trip: Pick<CrewStaffingTripLite, "active" | "status">) {
  if (trip.active === false) return false;
  const status = normalize(trip.status);
  return status === "planned" || status === "in_progress";
}

export function isCrewStaffingTripEditableForPto(trip: Pick<CrewStaffingTripLite, "active" | "status">) {
  if (trip.active === false) return false;
  return normalize(trip.status) === "planned";
}

export function getCrewStaffingPositionLabel(position?: CrewStaffingRoleOnTrip | null) {
  switch (position) {
    case "primaryTech":
      return "Lead Tech";
    case "secondaryTech":
      return "Secondary Tech";
    case "helper":
      return "Helper";
    case "secondaryHelper":
      return "Secondary Helper";
    default:
      return "Crew Member";
  }
}

export function getCrewStaffingReplacementRole(position?: CrewStaffingRoleOnTrip | null): "lead" | "helper" {
  return position === "primaryTech" || position === "secondaryTech" ? "lead" : "helper";
}

export function detectCrewStaffingPositionsForUid(
  crew: CrewStaffingTripCrew | null | undefined,
  uid: string
): CrewStaffingRoleOnTrip[] {
  const target = clean(uid);
  if (!target || !crew) return [];

  const out: CrewStaffingRoleOnTrip[] = [];
  if (clean(crew.primaryTechUid) === target) out.push("primaryTech");
  if (clean(crew.helperUid) === target) out.push("helper");
  if (clean(crew.secondaryTechUid) === target) out.push("secondaryTech");
  if (clean(crew.secondaryHelperUid) === target) out.push("secondaryHelper");
  return out;
}

export function getPrimaryCrewStaffingPosition(positions: CrewStaffingRoleOnTrip[]) {
  const priority: CrewStaffingRoleOnTrip[] = [
    "primaryTech",
    "secondaryTech",
    "helper",
    "secondaryHelper",
  ];

  return priority.find((position) => positions.includes(position)) || positions[0];
}

export function buildCrewStaffingImpactTrips(args: {
  employeeUid: string;
  trips: CrewStaffingTripLite[];
  ticketsById?: Record<string, CrewStaffingTicketLite | null | undefined>;
}) {
  const employeeUid = clean(args.employeeUid);
  if (!employeeUid) return [] as CrewStaffingImpactTrip[];

  const ticketsById = args.ticketsById || {};

  const impacts = (args.trips || [])
    .filter((trip) => isOpenCrewStaffingTrip(trip))
    .map((trip) => {
      const affectedPositions = detectCrewStaffingPositionsForUid(trip.crew, employeeUid);
      if (affectedPositions.length === 0) return null;

      const primaryAffectedPosition = getPrimaryCrewStaffingPosition(affectedPositions);
      const serviceTicketId = clean(trip.link?.serviceTicketId);
      const status = normalize(trip.status);

      return {
        trip,
        ticket: serviceTicketId ? ticketsById[serviceTicketId] || null : null,
        affectedPositions,
        primaryAffectedPosition,
        affectedRoleLabel: getCrewStaffingPositionLabel(primaryAffectedPosition),
        status,
        isPlanned: status === "planned",
        isInProgress: status === "in_progress",
        isEditable: isCrewStaffingTripEditableForPto(trip),
      } satisfies CrewStaffingImpactTrip;
    })
    .filter(Boolean) as CrewStaffingImpactTrip[];

  return impacts.sort((a, b) => {
    const aKey = `${clean(a.trip.date)}_${clean(a.trip.startTime)}_${a.trip.id}`;
    const bKey = `${clean(b.trip.date)}_${clean(b.trip.startTime)}_${b.trip.id}`;
    return aKey.localeCompare(bKey);
  });
}


function removePositionFromCrew(crew: CrewStaffingTripCrew, position: CrewStaffingRoleOnTrip) {
  const next = { ...crew };

  if (position === "primaryTech") {
    next.primaryTechUid = null;
    next.primaryTechName = null;
  }

  if (position === "helper") {
    next.helperUid = null;
    next.helperName = null;
  }

  if (position === "secondaryTech") {
    next.secondaryTechUid = null;
    next.secondaryTechName = null;
  }

  if (position === "secondaryHelper") {
    next.secondaryHelperUid = null;
    next.secondaryHelperName = null;
  }

  return next;
}

function replacePositionOnCrew(
  crew: CrewStaffingTripCrew,
  position: CrewStaffingRoleOnTrip,
  replacementUid: string,
  replacementName: string
) {
  const next = { ...crew };
  const uid = clean(replacementUid) || null;
  const name = clean(replacementName) || null;

  if (position === "primaryTech") {
    next.primaryTechUid = uid;
    next.primaryTechName = name;
  }

  if (position === "helper") {
    next.helperUid = uid;
    next.helperName = name;
  }

  if (position === "secondaryTech") {
    next.secondaryTechUid = uid;
    next.secondaryTechName = name;
  }

  if (position === "secondaryHelper") {
    next.secondaryHelperUid = uid;
    next.secondaryHelperName = name;
  }

  return next;
}

export function crewStaffingHasLeadTech(crew: CrewStaffingTripCrew | null | undefined) {
  return Boolean(clean(crew?.primaryTechUid) || clean(crew?.secondaryTechUid));
}

export function crewStaffingHasHelper(crew: CrewStaffingTripCrew | null | undefined) {
  return Boolean(clean(crew?.helperUid) || clean(crew?.secondaryHelperUid));
}

export function applyCrewStaffingImpactAction(args: {
  trip: CrewStaffingTripLite;
  employeeUid: string;
  employeeName: string;
  action: CrewStaffingActionSelection;
  approvedPtoRequestId: string;
  approvedPtoDateRange: string;
  updatedAt: string;
}) {
  const originalCrew = args.trip.crew || {};
  const employeeUid = clean(args.employeeUid);
  const employeeName = clean(args.employeeName) || "Employee";
  const positions = detectCrewStaffingPositionsForUid(originalCrew, employeeUid);
  const primaryPosition = getPrimaryCrewStaffingPosition(positions);
  const roleLabel = getCrewStaffingPositionLabel(primaryPosition);

  let nextCrew = { ...originalCrew };
  let staffingStatus: CrewStaffingApplyResult["staffingStatus"] = "staffed";
  let needsStaffing = false;
  const activityDetails: string[] = [];

  if (!primaryPosition) {
    return {
      nextCrew,
      needsStaffing: false,
      staffingStatus: "staffed",
      staffingIssue: null,
      activityDetails: [`${employeeName} was not found on this trip crew.`],
    } satisfies CrewStaffingApplyResult;
  }

  if (normalize(args.trip.status) === "in_progress") {
    return {
      nextCrew,
      needsStaffing: true,
      staffingStatus: "review_required",
      staffingIssue: {
        reason: "approved_pto_in_progress_trip",
        ptoRequestId: args.approvedPtoRequestId,
        unavailableUid: employeeUid,
        unavailableName: employeeName,
        affectedPosition: primaryPosition,
        affectedRoleLabel: roleLabel,
        dateRange: args.approvedPtoDateRange,
        updatedAt: args.updatedAt,
      },
      activityDetails: [
        `${employeeName} has approved PTO but this trip is already in progress. Crew was not changed automatically.`,
      ],
    } satisfies CrewStaffingApplyResult;
  }

  if (args.action.type === "review_only") {
    return {
      nextCrew,
      needsStaffing: true,
      staffingStatus: "review_required",
      staffingIssue: {
        reason: "approved_pto_review_required",
        ptoRequestId: args.approvedPtoRequestId,
        unavailableUid: employeeUid,
        unavailableName: employeeName,
        affectedPosition: primaryPosition,
        affectedRoleLabel: roleLabel,
        dateRange: args.approvedPtoDateRange,
        updatedAt: args.updatedAt,
      },
      activityDetails: [`${employeeName} has approved PTO. Trip was flagged for staffing review.`],
    } satisfies CrewStaffingApplyResult;
  }

  if (args.action.type === "reschedule_trip") {
    nextCrew = removePositionFromCrew(nextCrew, primaryPosition);
    needsStaffing = true;
    staffingStatus = "needs_reschedule";
    activityDetails.push(`${employeeName} was removed from ${roleLabel}. Trip needs rescheduling.`);
  } else if (args.action.type === "replace_worker") {
    const replacementUid = clean(args.action.replacementUid);
    const replacementName = clean(args.action.replacementName) || "Replacement";

    if (!replacementUid) {
      nextCrew = removePositionFromCrew(nextCrew, primaryPosition);
      needsStaffing = true;
      staffingStatus = "needs_staffing";
      activityDetails.push(`${employeeName} was removed from ${roleLabel}. Replacement was missing.`);
    } else {
      nextCrew = replacePositionOnCrew(nextCrew, primaryPosition, replacementUid, replacementName);
      activityDetails.push(`${employeeName} was replaced as ${roleLabel} by ${replacementName}.`);
    }
  } else {
    nextCrew = removePositionFromCrew(nextCrew, primaryPosition);

    if (args.action.type === "remove_worker") {
      activityDetails.push(`${employeeName} was removed from ${roleLabel}.`);
    } else {
      activityDetails.push(`${employeeName} was removed from ${roleLabel}. Trip was marked Needs Staffing.`);
    }

    const roleNeedsLead = primaryPosition === "primaryTech" || primaryPosition === "secondaryTech";
    const roleNeedsHelper = primaryPosition === "helper" || primaryPosition === "secondaryHelper";
    const missingLead = roleNeedsLead && !crewStaffingHasLeadTech(nextCrew);
    const missingHelper = roleNeedsHelper && !crewStaffingHasHelper(nextCrew);

    needsStaffing = args.action.type === "needs_staffing" || missingLead || missingHelper;
    staffingStatus = needsStaffing ? "needs_staffing" : "staffed";
  }

  const missingLead = !crewStaffingHasLeadTech(nextCrew);
  if (missingLead) {
    needsStaffing = true;
    staffingStatus = staffingStatus === "needs_reschedule" ? "needs_reschedule" : "needs_staffing";
    activityDetails.push("Trip has no lead tech assigned after PTO update.");
  }

  const staffingIssue = needsStaffing
    ? {
        reason:
          staffingStatus === "needs_reschedule"
            ? "approved_pto_reschedule_needed"
            : "approved_pto_needs_staffing",
        ptoRequestId: args.approvedPtoRequestId,
        unavailableUid: employeeUid,
        unavailableName: employeeName,
        affectedPosition: primaryPosition,
        affectedRoleLabel: roleLabel,
        dateRange: args.approvedPtoDateRange,
        actionType: args.action.type,
        updatedAt: args.updatedAt,
      }
    : null;

  return {
    nextCrew,
    needsStaffing,
    staffingStatus,
    staffingIssue,
    activityDetails,
  } satisfies CrewStaffingApplyResult;
}

export function buildServiceTicketAssignmentFromCrew(crew: CrewStaffingTripCrew | null | undefined) {
  const primaryTechUid = clean(crew?.primaryTechUid);
  const primaryTechName = clean(crew?.primaryTechName);
  const secondaryTechUid = clean(crew?.secondaryTechUid);
  const secondaryTechName = clean(crew?.secondaryTechName);
  const helperUid = clean(crew?.helperUid);
  const helperName = clean(crew?.helperName);
  const secondaryHelperUid = clean(crew?.secondaryHelperUid);
  const secondaryHelperName = clean(crew?.secondaryHelperName);

  const helperIds = [helperUid, secondaryHelperUid].filter(Boolean);
  const helperNames = [helperName, secondaryHelperName].filter(Boolean);

  const assignedTechnicianIds = Array.from(
    new Set([primaryTechUid, secondaryTechUid, helperUid, secondaryHelperUid].filter(Boolean))
  );

  return {
    assignedTechnicianId: primaryTechUid || null,
    assignedTechnicianName: primaryTechName || null,
    primaryTechnicianId: primaryTechUid || null,
    secondaryTechnicianId: secondaryTechUid || null,
    secondaryTechnicianName: secondaryTechName || null,
    helperIds: helperIds.length ? helperIds : null,
    helperNames: helperNames.length ? helperNames : null,
    assignedTechnicianIds: assignedTechnicianIds.length ? assignedTechnicianIds : null,
  };
}

export function getDefaultCrewStaffingActionForImpact(impact: CrewStaffingImpactTrip) {
  if (impact.isInProgress) {
    return { type: "review_only" as const };
  }

  const replacementRole = getCrewStaffingReplacementRole(impact.primaryAffectedPosition);

  if (replacementRole === "lead") {
    return { type: "needs_staffing" as const };
  }

  return { type: "remove_worker" as const };
}

export function formatCrewStaffingDateRange(startDate?: string | null, endDate?: string | null) {
  const start = clean(startDate);
  const end = clean(endDate || startDate);

  if (!start && !end) return "selected dates";
  if (start && end && start !== end) return `${start} to ${end}`;
  return start || end;
}

export function isReplacementCandidateForImpact(
  candidate: CrewStaffingReplacementCandidate,
  impact: CrewStaffingImpactTrip,
  unavailableUid: string
) {
  if (!candidate.uid || candidate.uid === unavailableUid) return false;
  if (candidate.unavailable) return false;
  return candidate.role === getCrewStaffingReplacementRole(impact.primaryAffectedPosition);
}
