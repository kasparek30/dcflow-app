export type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

export type TripCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;
  helperUid?: string | null;
  helperName?: string | null;
  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;
  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
};

export type DispatchOverrideInfo = {
  enabled: boolean;
  reason?: string | null;
  createdAt?: string;
  createdByUid?: string | null;
  createdByName?: string | null;
  conflictTypes?: string[];
  conflictTripIds?: string[];
};

export type TripDocLite = {
  id: string;
  active?: boolean | null;
  status?: string | null;
  date?: string;
  timeWindow?: TripTimeWindow | string;
  startTime?: string;
  endTime?: string;
  crew?: TripCrew | null;
  timerState?: string | null;
  dispatchOverride?: DispatchOverrideInfo | null;
};

export type PtoRequestLite = {
  id: string;
  employeeId: string;
  employeeName?: string;
  startDate: string;
  endDate: string;
  status: string;
  notes?: string | null;
};

export type CompanyHolidayLite = {
  id: string;
  date: string;
  name: string;
  active: boolean;
};

export type CrewRole = "technician" | "helper";

export type CrewMemberSelection = {
  uid: string;
  name: string;
  role: CrewRole;
};

export type AvailabilityReasonKind =
  | "approved_pto"
  | "pending_pto"
  | "overlap"
  | "holiday";

export type AvailabilityReason = {
  kind: AvailabilityReasonKind;
  blocking: boolean;
  label: string;
  detail: string;
};

export type CrewMemberAvailability = {
  uid: string;
  name: string;
  role: CrewRole;
  blocking: boolean;
  reasons: AvailabilityReason[];
};

export type QuickPickStatus = {
  kind: "available" | "pending_pto" | "holiday" | "approved_pto" | "overlap";
  label: string;
  disabled: boolean;
  blocking: boolean;
};

function normalizeTripStatus(value?: string | null) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "completed") return "complete";
  return status;
}

function isOpenTripRecord(trip: { active?: boolean | null; status?: string | null }) {
  if (trip.active === false) return false;
  const status = normalizeTripStatus(trip.status);
  return status === "planned" || status === "in_progress";
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function normalizeDateValue(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return "";

    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${pad2(Number(isoMatch[2]))}-${pad2(Number(isoMatch[3]))}`;
    }

    const leadingIsoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (leadingIsoMatch) {
      return leadingIsoMatch[1];
    }

    const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      return `${usMatch[3]}-${pad2(Number(usMatch[1]))}-${pad2(Number(usMatch[2]))}`;
    }

    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) {
      return formatLocalIsoDate(parsed);
    }

    return "";
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return "";
    return formatLocalIsoDate(value);
  }

  if (typeof value === "object" && value !== null) {
    const maybeObj = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };

    if (typeof maybeObj.toDate === "function") {
      return normalizeDateValue(maybeObj.toDate());
    }

    if (typeof maybeObj.seconds === "number") {
      return normalizeDateValue(new Date(maybeObj.seconds * 1000));
    }

    if (typeof maybeObj._seconds === "number") {
      return normalizeDateValue(new Date(maybeObj._seconds * 1000));
    }
  }

  return "";
}

function isIsoDateInRange(targetDate: string, startDate: string, endDate: string) {
  const safeTarget = normalizeDateValue(targetDate);
  const safeStart = normalizeDateValue(startDate);
  const safeEnd = normalizeDateValue(endDate || startDate);

  if (!safeTarget || !safeStart) return false;
  return safeTarget >= safeStart && safeTarget <= safeEnd;
}

export function extractHolidayDate(raw: any): string {
  return normalizeDateValue(
    raw?.date ??
      raw?.holidayDate ??
      raw?.day ??
      raw?.observedDate ??
      raw?.observedOn ??
      raw?.holiday_date ??
      raw?.holiday_day ??
      raw?.startDate ??
      ""
  );
}

export function extractHolidayName(raw: any): string {
  return String(
    raw?.name ??
      raw?.title ??
      raw?.holidayName ??
      raw?.holiday_name ??
      raw?.label ??
      "Holiday"
  ).trim();
}

export function holidayIsActive(raw: any): boolean {
  if (typeof raw?.active === "boolean") return raw.active;
  if (typeof raw?.isActive === "boolean") return raw.isActive;
  if (typeof raw?.enabled === "boolean") return raw.enabled;
  return true;
}

export function normalizeCompanyHoliday(
  raw: any,
  fallbackId?: string
): CompanyHolidayLite | null {
  const date = extractHolidayDate(raw);
  if (!date) return null;

  return {
    id: String(fallbackId || raw?.id || "").trim() || date,
    date,
    name: extractHolidayName(raw) || "Holiday",
    active: holidayIsActive(raw),
  };
}

export function windowToTimes(window: TripTimeWindow) {
  if (window === "am") return { start: "08:00", end: "12:00" };
  if (window === "pm") return { start: "13:00", end: "17:00" };
  if (window === "all_day") return { start: "08:00", end: "17:00" };
  return { start: "09:00", end: "10:00" };
}

export function formatTime12h(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  const [hhRaw, mmRaw] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hhRaw) || !Number.isFinite(mmRaw)) return "—";

  const suffix = hhRaw >= 12 ? "PM" : "AM";
  let hh = hhRaw % 12;
  if (hh === 0) hh = 12;

  if (mmRaw === 0) return `${hh}${suffix}`;
  return `${hh}:${String(mmRaw).padStart(2, "0")}${suffix}`;
}

function toMinutes(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function buildSlotRange(args: {
  timeWindow: TripTimeWindow | string;
  startTime?: string;
  endTime?: string;
}) {
  const timeWindow = String(args.timeWindow || "custom").toLowerCase() as TripTimeWindow;

  const fallback =
    timeWindow !== "custom"
      ? windowToTimes(timeWindow)
      : {
          start: String(args.startTime || "").trim(),
          end: String(args.endTime || "").trim(),
        };

  const startMinutes = toMinutes(fallback.start);
  const endMinutes = toMinutes(fallback.end);

  if (startMinutes === null || endMinutes === null) return null;
  if (endMinutes <= startMinutes) return null;

  return {
    startMinutes,
    endMinutes,
    startLabel: fallback.start,
    endLabel: fallback.end,
  };
}

function rangesOverlap(
  a: { startMinutes: number; endMinutes: number },
  b: { startMinutes: number; endMinutes: number }
) {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

function isUidOnTripCrew(uid: string, crew?: TripCrew | null) {
  if (!uid || !crew) return false;
  return (
    crew.primaryTechUid === uid ||
    crew.helperUid === uid ||
    crew.secondaryTechUid === uid ||
    crew.secondaryHelperUid === uid
  );
}

export function getHolidayNamesForDate(
  holidays: CompanyHolidayLite[],
  date: string
) {
  const targetDate = normalizeDateValue(date);

  return holidays
    .filter((holiday) => holiday.active !== false)
    .filter((holiday) => normalizeDateValue(holiday.date) === targetDate)
    .map((holiday) => String(holiday.name || "Holiday").trim())
    .filter(Boolean);
}

export function getMemberAvailability(args: {
  member: CrewMemberSelection;
  date: string;
  timeWindow: TripTimeWindow | string;
  startTime?: string;
  endTime?: string;
  ptoRequests: PtoRequestLite[];
  dayTrips: TripDocLite[];
  excludeTripId?: string | null;
}): CrewMemberAvailability {
  const { member, date, timeWindow, startTime, endTime, ptoRequests, dayTrips, excludeTripId } =
    args;

  const reasons: AvailabilityReason[] = [];
  const slotRange = buildSlotRange({ timeWindow, startTime, endTime });
  const safeDate = normalizeDateValue(date);

  const approvedMatches = ptoRequests.filter((pto) => {
    if (String(pto.employeeId || "").trim() !== member.uid) return false;
    if (String(pto.status || "").trim().toLowerCase() !== "approved") return false;
    return isIsoDateInRange(safeDate, pto.startDate, pto.endDate);
  });

  if (approvedMatches.length > 0) {
    const first = approvedMatches[0];
    reasons.push({
      kind: "approved_pto",
      blocking: true,
      label: "Approved PTO",
      detail: `${normalizeDateValue(first.startDate)} → ${normalizeDateValue(first.endDate)}`,
    });
  }

  const pendingMatches = ptoRequests.filter((pto) => {
    if (String(pto.employeeId || "").trim() !== member.uid) return false;
    if (String(pto.status || "").trim().toLowerCase() !== "pending") return false;
    return isIsoDateInRange(safeDate, pto.startDate, pto.endDate);
  });

  if (pendingMatches.length > 0) {
    const first = pendingMatches[0];
    reasons.push({
      kind: "pending_pto",
      blocking: false,
      label: "Pending PTO",
      detail: `${normalizeDateValue(first.startDate)} → ${normalizeDateValue(first.endDate)}`,
    });
  }

  if (slotRange) {
    const overlappingTrips = dayTrips.filter((trip) => {
      if (trip.id === excludeTripId) return false;
      if (!isOpenTripRecord(trip)) return false;
      if (normalizeDateValue(trip.date || "") !== safeDate) return false;
      if (!isUidOnTripCrew(member.uid, trip.crew || null)) return false;

      const tripRange = buildSlotRange({
        timeWindow: (trip.timeWindow as TripTimeWindow) || "custom",
        startTime: trip.startTime,
        endTime: trip.endTime,
      });

      if (!tripRange) return false;
      return rangesOverlap(slotRange, tripRange);
    });

    if (overlappingTrips.length > 0) {
      const first = overlappingTrips[0];
      const tripRange = buildSlotRange({
        timeWindow: (first.timeWindow as TripTimeWindow) || "custom",
        startTime: first.startTime,
        endTime: first.endTime,
      });

      reasons.push({
        kind: "overlap",
        blocking: true,
        label: "Overlapping Trip",
        detail: tripRange
          ? `${formatTime12h(tripRange.startLabel)}–${formatTime12h(tripRange.endLabel)} • Trip ${first.id}`
          : `Trip ${first.id}`,
      });
    }
  }

  return {
    uid: member.uid,
    name: member.name,
    role: member.role,
    blocking: reasons.some((reason) => reason.blocking),
    reasons,
  };
}

export function getQuickPickStatus(args: {
  member: CrewMemberSelection;
  date: string;
  timeWindow: TripTimeWindow;
  ptoRequests: PtoRequestLite[];
  holidays: CompanyHolidayLite[];
  dayTrips: TripDocLite[];
  excludeTripId?: string | null;
}): QuickPickStatus {
  const times = windowToTimes(args.timeWindow);
  const holidayNames = getHolidayNamesForDate(args.holidays, args.date);

  const availability = getMemberAvailability({
    member: args.member,
    date: args.date,
    timeWindow: args.timeWindow,
    startTime: times.start,
    endTime: times.end,
    ptoRequests: args.ptoRequests,
    dayTrips: args.dayTrips,
    excludeTripId: args.excludeTripId,
  });

  const approved = availability.reasons.find((reason) => reason.kind === "approved_pto");
  if (approved) {
    return { kind: "approved_pto", label: "PTO", disabled: true, blocking: true };
  }

  const overlap = availability.reasons.find((reason) => reason.kind === "overlap");
  if (overlap) {
    return { kind: "overlap", label: "Booked", disabled: true, blocking: true };
  }

  if (holidayNames.length > 0) {
    return { kind: "holiday", label: "Holiday", disabled: false, blocking: true };
  }

  const pending = availability.reasons.find((reason) => reason.kind === "pending_pto");
  if (pending) {
    return { kind: "pending_pto", label: "Pending", disabled: false, blocking: false };
  }

  return { kind: "available", label: "Open", disabled: false, blocking: false };
}

export function formatAvailabilityOptionLabel(args: {
  baseLabel: string;
  availability: CrewMemberAvailability | null;
  holidayNames: string[];
}) {
  const { baseLabel, availability, holidayNames } = args;

  if (!availability) {
    if (holidayNames.length > 0) return `${baseLabel} — Holiday`;
    return baseLabel;
  }

  const approved = availability.reasons.find((reason) => reason.kind === "approved_pto");
  if (approved) return `${baseLabel} — Approved PTO`;

  const overlap = availability.reasons.find((reason) => reason.kind === "overlap");
  if (overlap) return `${baseLabel} — ${overlap.label}`;

  if (holidayNames.length > 0) return `${baseLabel} — Holiday`;

  const pending = availability.reasons.find((reason) => reason.kind === "pending_pto");
  if (pending) return `${baseLabel} — Pending PTO`;

  return `${baseLabel} — Available`;
}

export function optionShouldBeDisabled(args: {
  availability: CrewMemberAvailability | null;
}) {
  if (!args.availability) return false;

  return args.availability.reasons.some(
    (reason) => reason.kind === "approved_pto" || reason.kind === "overlap"
  );
}

export function summarizeBlockingReasons(args: {
  members: CrewMemberAvailability[];
  holidayNames: string[];
  holidayOverrideEnabled: boolean;
}) {
  const reasons: string[] = [];

  for (const member of args.members) {
    for (const reason of member.reasons) {
      if (!reason.blocking) continue;
      reasons.push(
        `${member.name}: ${reason.label}${reason.detail ? ` (${reason.detail})` : ""}`
      );
    }
  }

  if (args.holidayNames.length > 0 && !args.holidayOverrideEnabled) {
    reasons.push(
      `Holiday conflict: ${args.holidayNames.join(
        ", "
      )}. Enable explicit holiday override to continue.`
    );
  }

  return reasons;
}