// src/lib/service-ticket-lifecycle.ts
export type LifecycleTicketStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "cancelled";

export type LifecycleTripStatus = "planned" | "in_progress" | "complete" | "cancelled";

export type LifecycleTripLike = {
  id?: string;
  status?: string | null;
  active?: boolean | null;
  outcome?: string | null;
  timerState?: string | null;
};

export function normalizeTicketStatus(value?: string | null): LifecycleTicketStatus {
  const v = String(value || "").trim().toLowerCase();
  if (v === "scheduled") return "scheduled";
  if (v === "in_progress") return "in_progress";
  if (v === "follow_up") return "follow_up";
  if (v === "completed") return "completed";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  return "new";
}

export function normalizeTripStatus(value?: string | null): LifecycleTripStatus {
  const v = String(value || "").trim().toLowerCase();
  if (v === "in_progress") return "in_progress";
  if (v === "complete" || v === "completed") return "complete";
  if (v === "cancelled" || v === "canceled") return "cancelled";
  return "planned";
}

export function formatLifecycleTripStatus(value?: string | null) {
  const v = normalizeTripStatus(value);
  if (v === "planned") return "Planned";
  if (v === "in_progress") return "In Progress";
  if (v === "complete") return "Complete";
  return "Cancelled";
}

export function isTicketTerminal(status?: string | null) {
  const v = normalizeTicketStatus(status);
  return v === "completed" || v === "cancelled";
}

export function isTripCancelled(status?: string | null) {
  return normalizeTripStatus(status) === "cancelled";
}

export function isTripComplete(status?: string | null) {
  return normalizeTripStatus(status) === "complete";
}

export function isTripInProgress(status?: string | null) {
  return normalizeTripStatus(status) === "in_progress";
}

export function isTripOpen(status?: string | null) {
  const v = normalizeTripStatus(status);
  return v === "planned" || v === "in_progress";
}

export function hasInProgressTrips(trips: LifecycleTripLike[]) {
  return trips.some((trip) => trip.active !== false && isTripInProgress(trip.status));
}

export function hasOpenTrips(trips: LifecycleTripLike[]) {
  return trips.some((trip) => trip.active !== false && isTripOpen(trip.status));
}

export function hasCompletedTrips(trips: LifecycleTripLike[]) {
  return trips.some((trip) => trip.active !== false && isTripComplete(trip.status));
}

export function hasFollowUpHistory(trips: LifecycleTripLike[]) {
  return trips.some((trip) => {
    if (trip.active === false) return false;
    if (!isTripComplete(trip.status)) return false;
    return String(trip.outcome || "").trim().toLowerCase() === "follow_up";
  });
}

function getActiveTrips(trips: LifecycleTripLike[]) {
  return Array.isArray(trips) ? trips.filter((trip) => trip && trip.active !== false) : [];
}

function getCompletedTrips(trips: LifecycleTripLike[]) {
  return getActiveTrips(trips).filter((trip) => isTripComplete(trip.status));
}

function getLatestCompletedOutcome(trips: LifecycleTripLike[]) {
  const completedTrips = getCompletedTrips(trips);

  for (let i = completedTrips.length - 1; i >= 0; i--) {
    const outcome = String(completedTrips[i]?.outcome || "").trim().toLowerCase();
    if (outcome === "resolved" || outcome === "follow_up") {
      return outcome;
    }
  }

  return "";
}

export function deriveTicketStatusFromTrips(args: {
  currentStatus?: string | null;
  trips: LifecycleTripLike[];
  lastCompletedOutcome?: string | null;
}): LifecycleTicketStatus {
  const currentStatus = normalizeTicketStatus(args.currentStatus);
  const trips = getActiveTrips(args.trips);

  if (hasInProgressTrips(trips)) {
    return "in_progress";
  }

  const openTrips = hasOpenTrips(trips);
  const completedTrips = hasCompletedTrips(trips);
  const followUpHistory = hasFollowUpHistory(trips);

  const explicitLastCompletedOutcome = String(args.lastCompletedOutcome || "")
    .trim()
    .toLowerCase();

  const latestCompletedOutcome =
    explicitLastCompletedOutcome || getLatestCompletedOutcome(trips);

  if (openTrips) {
    if (
      currentStatus === "follow_up" ||
      latestCompletedOutcome === "follow_up" ||
      followUpHistory
    ) {
      return "follow_up";
    }

    return "scheduled";
  }

  if (latestCompletedOutcome === "resolved") {
    return "completed";
  }

  if (latestCompletedOutcome === "follow_up") {
    return "follow_up";
  }

  if (completedTrips) {
    return "completed";
  }

  const onlyCancelledOrEmpty = !trips.some((trip) => !isTripCancelled(trip.status));

  if (currentStatus === "cancelled" && onlyCancelledOrEmpty) {
    return "cancelled";
  }

  return "new";
}

export function getManualTicketStatusError(args: {
  nextStatus: string;
  currentStatus?: string | null;
  trips: LifecycleTripLike[];
}) {
  const nextStatus = normalizeTicketStatus(args.nextStatus);
  const currentStatus = normalizeTicketStatus(args.currentStatus);
  const trips = getActiveTrips(args.trips);

  const openTrips = hasOpenTrips(trips);
  const inProgressTrips = hasInProgressTrips(trips);
  const completedTrips = hasCompletedTrips(trips);
  const followUpHistory = hasFollowUpHistory(trips);
  const latestCompletedOutcome = getLatestCompletedOutcome(trips);
  const onlyCancelledOrEmpty = !trips.some((trip) => !isTripCancelled(trip.status));

  if (nextStatus === "new" && !onlyCancelledOrEmpty) {
    return "Use New only when the ticket has no open or completed trips.";
  }

  if (nextStatus === "scheduled") {
    if (!openTrips || inProgressTrips) {
      return "Scheduled requires an open planned trip and no trip currently in progress.";
    }
    if (
      currentStatus === "follow_up" ||
      latestCompletedOutcome === "follow_up" ||
      followUpHistory
    ) {
      return "This ticket is in a follow-up lifecycle. Keep it as Follow Up unless you are intentionally breaking that chain.";
    }
  }

  if (nextStatus === "in_progress" && !inProgressTrips) {
    return "In Progress requires a trip that is currently in progress.";
  }

  if (nextStatus === "follow_up") {
    const followUpLifecycle =
      currentStatus === "follow_up" ||
      latestCompletedOutcome === "follow_up" ||
      followUpHistory;

    if (inProgressTrips) {
      return "Follow Up cannot be set while a trip is currently in progress.";
    }

    if (!followUpLifecycle && !completedTrips) {
      return "Follow Up should only be used after a completed visit that still needs another trip.";
    }
  }

  if (nextStatus === "completed") {
    if (openTrips || inProgressTrips) {
      return "Completed cannot be set while this ticket still has an open trip.";
    }
    if (!completedTrips) {
      return "Completed requires at least one completed trip.";
    }
    if (latestCompletedOutcome === "follow_up") {
      return "Completed cannot be set because the latest completed trip outcome is Follow Up.";
    }
  }

  if (nextStatus === "cancelled" && (openTrips || inProgressTrips)) {
    return "Cancelled requires all open trips on this ticket to be cancelled first.";
  }

  return "";
}

export function canStartTrip(status?: string | null, timerState?: string | null) {
  const tripStatus = normalizeTripStatus(status);
  const timer = String(timerState || "not_started").trim().toLowerCase();
  return (
    tripStatus === "planned" &&
    timer !== "running" &&
    timer !== "paused" &&
    timer !== "complete"
  );
}

export function canPauseTrip(status?: string | null, timerState?: string | null) {
  const tripStatus = normalizeTripStatus(status);
  const timer = String(timerState || "running").trim().toLowerCase();
  return tripStatus === "in_progress" && timer === "running";
}

export function canResumeTrip(status?: string | null, timerState?: string | null) {
  const tripStatus = normalizeTripStatus(status);
  const timer = String(timerState || "not_started").trim().toLowerCase();
  return tripStatus === "in_progress" && timer === "paused";
}

export function canFinishTrip(status?: string | null, timerState?: string | null) {
  const tripStatus = normalizeTripStatus(status);
  const timer = String(timerState || "running").trim().toLowerCase();
  return tripStatus === "in_progress" && (timer === "running" || timer === "paused");
}

export function canEditTripSchedule(status?: string | null, timerState?: string | null) {
  const tripStatus = normalizeTripStatus(status);
  const timer = String(timerState || "not_started").trim().toLowerCase();
  return tripStatus === "planned" && timer !== "running" && timer !== "paused";
}

export function canCancelTrip(status?: string | null, timerState?: string | null) {
  return canEditTripSchedule(status, timerState);
}