import type {
  Project,
  ProjectBillingPeriod,
  ProjectBillingPeriodStatus,
  ProjectOfficeStatus,
} from "../types/project";

export type ProjectBillingTripLike = {
  id: string;
  date?: string | null;
  status?: string | null;
  active?: boolean | null;
  closeoutHours?: number | null;
  materialsUsedToday?: string | null;
  closeout?: {
    hoursWorkedToday?: number | null;
    materialsUsedToday?: string | null;
  } | null;
  billingPeriodId?: string | null;
  billingPeriodSequence?: number | null;
  billingPeriodLabel?: string | null;
  billingPeriodStatus?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
};

export type ProjectBillingSummary = {
  totalTrips: number;
  completedTrips: number;
  openTrips: number;
  totalLaborHours: number;
  unbilledCompletedTrips: number;
  unbilledCompletedHours: number;
  unbilledMaterialsCount: number;
  readyPeriods: number;
  invoicedPeriods: number;
  openPeriods: number;
};

export function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

export function isTimeMaterialsProject(projectType?: string | null) {
  const value = safeTrim(projectType).toLowerCase();
  return (
    value === "time_materials" ||
    value === "time+materials" ||
    value === "time_and_materials"
  );
}

export function normalizeProjectBillingPeriodStatus(
  value: unknown,
): ProjectBillingPeriodStatus {
  const raw = safeTrim(value).toLowerCase();
  if (raw === "ready_to_bill") return "ready_to_bill";
  if (raw === "invoiced") return "invoiced";
  return "open";
}

export function buildProjectBillingPeriodLabel(sequence: number) {
  return `Billing ${sequence}`;
}

export function buildProjectBillingPeriodId(sequence: number) {
  return `tm_period_${String(sequence).padStart(3, "0")}`;
}

export function getProjectBillingPeriods(project?: Project | null): ProjectBillingPeriod[] {
  const source = Array.isArray(project?.billingPeriods) ? project?.billingPeriods : [];
  return [...source]
    .map((period, index) => ({
      id: safeTrim(period?.id) || buildProjectBillingPeriodId(Number(period?.sequence || index + 1)),
      sequence: Number(period?.sequence || index + 1),
      label: safeTrim(period?.label) || buildProjectBillingPeriodLabel(Number(period?.sequence || index + 1)),
      status: normalizeProjectBillingPeriodStatus(period?.status),
      openedAt: period?.openedAt,
      openedByUid: period?.openedByUid,
      openedByName: period?.openedByName,
      readyToBillAt: period?.readyToBillAt,
      readyToBillByUid: period?.readyToBillByUid,
      readyToBillByName: period?.readyToBillByName,
      invoicedAt: period?.invoicedAt,
      invoicedByUid: period?.invoicedByUid,
      invoicedByName: period?.invoicedByName,
      invoiceNumber: period?.invoiceNumber,
      invoiceDate: period?.invoiceDate,
      invoiceNotes: period?.invoiceNotes,
      tripIds: Array.isArray(period?.tripIds) ? period.tripIds.filter(Boolean) : [],
      tripCount: Number(period?.tripCount || 0),
      totalHours: Number(period?.totalHours || 0),
      materialsCount: Number(period?.materialsCount || 0),
      dateFrom: period?.dateFrom,
      dateTo: period?.dateTo,
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

export function getCurrentOpenBillingPeriod(project?: Project | null) {
  const currentId = safeTrim(project?.currentBillingPeriodId);
  const periods = getProjectBillingPeriods(project);
  if (currentId) {
    const exact = periods.find((period) => period.id === currentId && period.status === "open");
    if (exact) return exact;
  }
  return periods.find((period) => period.status === "open") || null;
}

export function getNextBillingSequence(project?: Project | null) {
  const periods = getProjectBillingPeriods(project);
  const max = periods.reduce((highest, period) => Math.max(highest, Number(period.sequence || 0)), 0);
  return max + 1;
}

export function createOpenBillingPeriod(args: {
  project?: Project | null;
  actorUid?: string | null;
  actorName?: string | null;
  openedAt?: string;
}): ProjectBillingPeriod {
  const sequence = getNextBillingSequence(args.project);
  const stamp = safeTrim(args.openedAt) || new Date().toISOString();
  return {
    id: buildProjectBillingPeriodId(sequence),
    sequence,
    label: buildProjectBillingPeriodLabel(sequence),
    status: "open",
    openedAt: stamp,
    openedByUid: safeTrim(args.actorUid) || undefined,
    openedByName: safeTrim(args.actorName) || undefined,
    tripIds: [],
    tripCount: 0,
    totalHours: 0,
    materialsCount: 0,
  };
}

export function getTripCloseoutHours(trip?: ProjectBillingTripLike | null) {
  const raw =
    trip?.closeout?.hoursWorkedToday ??
    trip?.closeoutHours ??
    null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getTripMaterialsSummary(trip?: ProjectBillingTripLike | null) {
  return safeTrim(trip?.closeout?.materialsUsedToday) || safeTrim(trip?.materialsUsedToday);
}

export function isCompletedTrip(trip?: ProjectBillingTripLike | null) {
  return safeTrim(trip?.status).toLowerCase() === "complete";
}

export function isCancelledTrip(trip?: ProjectBillingTripLike | null) {
  const status = safeTrim(trip?.status).toLowerCase();
  return status === "cancelled" || trip?.active === false;
}

export function getUnbilledCompletedTrips(trips: ProjectBillingTripLike[]) {
  return trips.filter((trip) => {
    if (isCancelledTrip(trip)) return false;
    if (!isCompletedTrip(trip)) return false;
    if (safeTrim(trip.billingPeriodId)) return false;
    return true;
  });
}

export function summarizeBillingPeriodTrips(trips: ProjectBillingTripLike[]) {
  const cleanTrips = trips
    .filter((trip) => !isCancelledTrip(trip))
    .sort((a, b) => `${safeTrim(a.date)}_${a.id}`.localeCompare(`${safeTrim(b.date)}_${b.id}`));

  const totalHours = cleanTrips.reduce((sum, trip) => sum + getTripCloseoutHours(trip), 0);
  const materialsCount = cleanTrips.reduce((sum, trip) => {
    return getTripMaterialsSummary(trip) ? sum + 1 : sum;
  }, 0);

  return {
    tripIds: cleanTrips.map((trip) => trip.id),
    tripCount: cleanTrips.length,
    totalHours: Number(totalHours.toFixed(2)),
    materialsCount,
    dateFrom: cleanTrips[0]?.date || undefined,
    dateTo: cleanTrips[cleanTrips.length - 1]?.date || undefined,
  };
}

export function getProjectBillingSummary(trips: ProjectBillingTripLike[], project?: Project | null): ProjectBillingSummary {
  const relevantTrips = trips.filter((trip) => !isCancelledTrip(trip));
  const completedTrips = relevantTrips.filter((trip) => isCompletedTrip(trip));
  const openTrips = relevantTrips.filter((trip) => !isCompletedTrip(trip));
  const unbilledCompletedTrips = getUnbilledCompletedTrips(relevantTrips);
  const periods = getProjectBillingPeriods(project);

  return {
    totalTrips: relevantTrips.length,
    completedTrips: completedTrips.length,
    openTrips: openTrips.length,
    totalLaborHours: Number(
      completedTrips.reduce((sum, trip) => sum + getTripCloseoutHours(trip), 0).toFixed(2),
    ),
    unbilledCompletedTrips: unbilledCompletedTrips.length,
    unbilledCompletedHours: Number(
      unbilledCompletedTrips.reduce((sum, trip) => sum + getTripCloseoutHours(trip), 0).toFixed(2),
    ),
    unbilledMaterialsCount: unbilledCompletedTrips.reduce((sum, trip) => {
      return getTripMaterialsSummary(trip) ? sum + 1 : sum;
    }, 0),
    readyPeriods: periods.filter((period) => period.status === "ready_to_bill").length,
    invoicedPeriods: periods.filter((period) => period.status === "invoiced").length,
    openPeriods: periods.filter((period) => period.status === "open").length,
  };
}

export function periodHasAssignedTripsInBillingPeriod(
  periodId: string,
  trips: ProjectBillingTripLike[] = [],
) {
  const target = safeTrim(periodId);
  if (!target) return false;
  return trips.some((trip) => {
    if (isCancelledTrip(trip)) return false;
    if (!isCompletedTrip(trip)) return false;
    return safeTrim(trip.billingPeriodId) === target;
  });
}

export function getEffectiveProjectOfficeStatus(
  project?: Project | null,
  trips: ProjectBillingTripLike[] = [],
): ProjectOfficeStatus {
  const raw = safeTrim(project?.projectOfficeStatus).toLowerCase();
  if (raw === "closed") return "closed";
  if (raw === "invoiced") return "invoiced";

  if (!isTimeMaterialsProject(project?.projectType)) {
    if (
      raw === "active_work" ||
      raw === "field_complete" ||
      raw === "ready_to_invoice"
    ) {
      return raw as ProjectOfficeStatus;
    }
    return "active_work";
  }

  const periods = getProjectBillingPeriods(project);
  const frozenPeriods = periods.filter((period) => period.status !== "open");
  const readyPeriods = frozenPeriods.filter((period) => period.status === "ready_to_bill");
  const openPeriods = periods.filter((period) => period.status === "open");
  const openPeriodHasTrips = openPeriods.some((period) =>
    periodHasAssignedTripsInBillingPeriod(period.id, trips),
  );
  const unbilledCompletedTrips = getUnbilledCompletedTrips(trips);
  const fieldComplete = Boolean(project?.fieldCompletedAt);
  const allFrozenPeriodsInvoiced =
    frozenPeriods.length > 0 &&
    frozenPeriods.every((period) => period.status === "invoiced");

  if (fieldComplete) {
    if (readyPeriods.length > 0) return "ready_to_invoice";
    if (
      allFrozenPeriodsInvoiced &&
      unbilledCompletedTrips.length === 0 &&
      !openPeriodHasTrips
    ) {
      return "invoiced";
    }
    return "field_complete";
  }

  return "active_work";
}

export function buildBillingTabLabel(period: ProjectBillingPeriod, isCurrentOpen: boolean) {
  if (isCurrentOpen) return "Current Period";
  return safeTrim(period.label) || buildProjectBillingPeriodLabel(period.sequence);
}
