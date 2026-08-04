import {
  collection,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  type Firestore,
} from "firebase/firestore";

export type PauseBlock = {
  startAt: string;
  endAt: string | null;
};

export type WorkerTripTimerStatus = "running" | "paused" | "complete";

export type WorkerTripTimer = {
  status: WorkerTripTimerStatus;
  startedAt: string;
  endedAt?: string | null;
  pauseBlocks: PauseBlock[];
  updatedAt: string;
  updatedByUid?: string | null;
};

export type WorkerTimersByUid = Record<string, WorkerTripTimer>;

export type TripTimerCrew = {
  primaryTechUid?: string | null;
  helperUid?: string | null;
  secondaryTechUid?: string | null;
  secondaryHelperUid?: string | null;
};

export type TripTimerLike = {
  id: string;
  active?: boolean;
  status?: string | null;
  timerState?: string | null;
  actualStartAt?: string | null;
  startedAt?: string | null;
  actualEndAt?: string | null;
  completedAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;
  crew?: TripTimerCrew | null;
  crewConfirmed?: TripTimerCrew | null;
  workerTimers?: WorkerTimersByUid | null;
  link?: {
    serviceTicketId?: string | null;
    projectId?: string | null;
    projectStageKey?: string | null;
  } | null;
};

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value?: string | null) {
  const status = safeTrim(value).toLowerCase();
  return status === "completed" ? "complete" : status;
}

function normalizeTimerState(value?: string | null, status?: string | null) {
  const timer = safeTrim(value).toLowerCase();
  if (timer === "running" || timer === "paused" || timer === "complete") {
    return timer;
  }

  const normalizedStatus = normalizeStatus(status);
  if (normalizedStatus === "in_progress") return "running";
  if (normalizedStatus === "complete" || normalizedStatus === "cancelled") {
    return "complete";
  }
  return "not_started";
}

export function getCrewUids(crew?: TripTimerCrew | null) {
  return Array.from(
    new Set(
      [
        safeTrim(crew?.primaryTechUid),
        safeTrim(crew?.helperUid),
        safeTrim(crew?.secondaryTechUid),
        safeTrim(crew?.secondaryHelperUid),
      ].filter(Boolean),
    ),
  );
}

export function getTripCrewUids(
  trip: Pick<TripTimerLike, "crew" | "crewConfirmed">,
) {
  return Array.from(
    new Set([
      ...getCrewUids(trip.crew),
      ...getCrewUids(trip.crewConfirmed),
    ]),
  );
}

function parseIsoMs(value?: string | null) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

function minutesBetween(aMs: number, bMs: number) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs) || bMs <= aMs) return 0;
  return Math.max(0, Math.round((bMs - aMs) / 60000));
}

export function findOpenPauseIndex(blocks?: PauseBlock[] | null) {
  if (!Array.isArray(blocks)) return -1;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.startAt && !block.endAt) return index;
  }
  return -1;
}

export function sumWorkerPausedMinutes(
  blocks?: PauseBlock[] | null,
  referenceMs = Date.now(),
) {
  if (!Array.isArray(blocks)) return 0;

  return blocks.reduce((total, block) => {
    const startMs = parseIsoMs(block?.startAt || null);
    const endMs = block?.endAt ? parseIsoMs(block.endAt) : referenceMs;
    return total + minutesBetween(startMs, endMs);
  }, 0);
}

function legacyTimerForWorker(
  trip: TripTimerLike,
  workerUid: string,
  stamp: string,
): WorkerTripTimer | null {
  if (!getTripCrewUids(trip).includes(workerUid)) return null;

  const state = normalizeTimerState(trip.timerState, trip.status);
  if (state === "not_started") return null;

  const startedAt =
    safeTrim(trip.actualStartAt) || safeTrim(trip.startedAt) || stamp;
  const pauseBlocks = Array.isArray(trip.pauseBlocks)
    ? trip.pauseBlocks.map((block) => ({ ...block }))
    : [];

  return {
    status: state === "complete" ? "complete" : state,
    startedAt,
    endedAt:
      state === "complete"
        ? safeTrim(trip.actualEndAt) || safeTrim(trip.completedAt) || stamp
        : null,
    pauseBlocks,
    updatedAt: stamp,
    updatedByUid: null,
  };
}

export function materializeWorkerTimers(
  trip: TripTimerLike,
  stamp: string,
): WorkerTimersByUid {
  const existing =
    trip.workerTimers && typeof trip.workerTimers === "object"
      ? { ...trip.workerTimers }
      : {};

  for (const uid of getTripCrewUids(trip)) {
    if (existing[uid]) continue;
    const legacy = legacyTimerForWorker(trip, uid, stamp);
    if (legacy) existing[uid] = legacy;
  }

  return existing;
}

export function getWorkerTimer(
  trip: TripTimerLike | null | undefined,
  workerUid: string,
  referenceStamp = new Date().toISOString(),
) {
  if (!trip || !workerUid) return null;
  return materializeWorkerTimers(trip, referenceStamp)[workerUid] || null;
}

export function getWorkerTimerStatus(
  trip: TripTimerLike | null | undefined,
  workerUid: string,
) {
  return getWorkerTimer(trip, workerUid)?.status || "not_started";
}

export function getWorkerTimerMinutesAt(
  trip: TripTimerLike,
  workerUid: string,
  referenceMs: number,
) {
  const timer = getWorkerTimer(
    trip,
    workerUid,
    new Date(referenceMs).toISOString(),
  );
  if (!timer) return null;

  const startMs = parseIsoMs(timer.startedAt);
  const endMs =
    timer.status === "complete" && timer.endedAt
      ? parseIsoMs(timer.endedAt)
      : referenceMs;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  const gross = minutesBetween(startMs, endMs);
  const paused = sumWorkerPausedMinutes(timer.pauseBlocks, endMs);
  return Math.max(0, gross - paused);
}

export function getTripActiveMinutesAt(
  trip: TripTimerLike,
  referenceMs: number,
) {
  const explicitTimerUids =
    trip.workerTimers && typeof trip.workerTimers === "object"
      ? Object.keys(trip.workerTimers)
      : [];

  const workerUids =
    explicitTimerUids.length > 0
      ? explicitTimerUids
      : getTripCrewUids(trip);

  const activeMinutes = workerUids
    .map((uid) => getWorkerTimerMinutesAt(trip, uid, referenceMs))
    .filter(
      (minutes): minutes is number =>
        typeof minutes === "number" &&
        Number.isFinite(minutes) &&
        minutes >= 0,
    );

  if (activeMinutes.length > 0) {
    // Customer billable trip duration is elapsed active trip time, not the
    // sum of every crew member's payroll hours.
    return Math.max(...activeMinutes);
  }

  // Backward-compatible fallback for legacy trips that predate workerTimers.
  const startMs = parseIsoMs(trip.actualStartAt || trip.startedAt || null);
  const endMs = referenceMs;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0;
  }

  const gross = minutesBetween(startMs, endMs);
  const paused = sumWorkerPausedMinutes(trip.pauseBlocks, endMs);
  return Math.max(0, gross - paused);
}

export function deriveTripTimerState(workerTimers: WorkerTimersByUid) {
  const timers = Object.values(workerTimers || {});
  if (timers.some((timer) => timer.status === "running")) return "running";
  if (timers.some((timer) => timer.status === "paused")) return "paused";
  if (timers.length > 0 && timers.every((timer) => timer.status === "complete")) {
    return "complete";
  }
  return "not_started";
}

function pauseTimer(
  timer: WorkerTripTimer,
  stamp: string,
  actorUid: string | null,
): WorkerTripTimer {
  if (timer.status !== "running") return timer;
  const pauseBlocks = Array.isArray(timer.pauseBlocks)
    ? timer.pauseBlocks.map((block) => ({ ...block }))
    : [];
  if (findOpenPauseIndex(pauseBlocks) === -1) {
    pauseBlocks.push({ startAt: stamp, endAt: null });
  }
  return {
    ...timer,
    status: "paused",
    pauseBlocks,
    updatedAt: stamp,
    updatedByUid: actorUid,
  };
}

function resumeTimer(
  timer: WorkerTripTimer,
  stamp: string,
  actorUid: string | null,
): WorkerTripTimer {
  const pauseBlocks = Array.isArray(timer.pauseBlocks)
    ? timer.pauseBlocks.map((block) => ({ ...block }))
    : [];
  const openIndex = findOpenPauseIndex(pauseBlocks);
  if (openIndex !== -1) {
    pauseBlocks[openIndex] = { ...pauseBlocks[openIndex], endAt: stamp };
  }
  return {
    ...timer,
    status: "running",
    pauseBlocks,
    endedAt: null,
    updatedAt: stamp,
    updatedByUid: actorUid,
  };
}

function newRunningTimer(
  stamp: string,
  actorUid: string | null,
): WorkerTripTimer {
  return {
    status: "running",
    startedAt: stamp,
    endedAt: null,
    pauseBlocks: [],
    updatedAt: stamp,
    updatedByUid: actorUid,
  };
}

function mapTrip(id: string, data: any): TripTimerLike {
  return {
    id,
    active: data.active !== false,
    status: data.status ?? null,
    timerState: data.timerState ?? null,
    actualStartAt: data.actualStartAt ?? data.startedAt ?? null,
    startedAt: data.startedAt ?? data.actualStartAt ?? null,
    actualEndAt: data.actualEndAt ?? data.completedAt ?? null,
    completedAt: data.completedAt ?? data.actualEndAt ?? null,
    pauseBlocks: Array.isArray(data.pauseBlocks) ? data.pauseBlocks : [],
    crew: data.crew ?? null,
    crewConfirmed: data.crewConfirmed ?? null,
    workerTimers:
      data.workerTimers && typeof data.workerTimers === "object"
        ? data.workerTimers
        : null,
    link:
      data.link && typeof data.link === "object"
        ? {
            serviceTicketId: data.link.serviceTicketId ?? null,
            projectId: data.link.projectId ?? null,
            projectStageKey: data.link.projectStageKey ?? null,
          }
        : null,
  };
}

async function queryTripsForWorker(db: Firestore, workerUid: string) {
  const base = collection(db, "trips");
  const crewPaths = [
    "crew.primaryTechUid",
    "crew.helperUid",
    "crew.secondaryTechUid",
    "crew.secondaryHelperUid",
    "crewConfirmed.primaryTechUid",
    "crewConfirmed.helperUid",
    "crewConfirmed.secondaryTechUid",
    "crewConfirmed.secondaryHelperUid",
  ];

  const crewSnapshots = await Promise.all(
    crewPaths.map((fieldPath) =>
      getDocs(
        query(
          base,
          where("active", "==", true),
          where("status", "==", "in_progress"),
          where(fieldPath, "==", workerUid),
        ),
      ).catch(() => null),
    ),
  );

  // This catches workers added after a trip began even if the crew fields
  // were not fully synchronized. If Firestore needs an index for this query,
  // the crew/crewConfirmed queries above still provide a safe fallback.
  const timerSnapshot = await getDocs(
    query(
      base,
      where("active", "==", true),
      where("status", "==", "in_progress"),
      where(new FieldPath("workerTimers", workerUid, "status"), "==", "running"),
    ),
  ).catch(() => null);

  // Guaranteed fallback: load the relatively small set of in-progress trips
  // and filter locally. This protects switching when a field-path query is
  // unavailable because of an index/rules gap or when crew fields and
  // workerTimers are temporarily out of sync.
  const inProgressSnapshot = await getDocs(
    query(base, where("status", "==", "in_progress")),
  ).catch(() => null);

  const byId = new Map<string, TripTimerLike>();

  for (const snapshot of [
    ...crewSnapshots,
    timerSnapshot,
    inProgressSnapshot,
  ]) {
    if (!snapshot) continue;

    for (const row of snapshot.docs) {
      const trip = mapTrip(row.id, row.data());
      if (trip.active === false) continue;

      const belongsToWorker =
        getTripCrewUids(trip).includes(workerUid) ||
        Boolean(trip.workerTimers?.[workerUid]);

      if (!belongsToWorker) continue;

      byId.set(row.id, trip);
    }
  }

  return Array.from(byId.values());
}

function buildLinkedTicketTimerPatch(args: {
  tripId: string;
  timerState: string;
  stamp: string;
  actorUid: string | null;
  actorName?: string | null;
  actorRole?: string | null;
}) {
  return {
    activeTripId: args.tripId,
    activeTripTimerState: args.timerState,
    activeTripPaused: args.timerState === "paused",
    updatedAt: args.stamp,
    updatedByUid: args.actorUid,
    updatedByName: args.actorName || null,
    updatedByRole: args.actorRole || null,
  };
}

export async function switchWorkerToTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  startWholeCrewWhenTripNotStarted?: boolean;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;

  if (!tripId) throw new Error("Missing trip id.");
  if (!workerUid) throw new Error("Missing worker id.");

  const targetRef = doc(args.db, "trips", tripId);
  const targetSnap = await getDoc(targetRef);
  if (!targetSnap.exists()) throw new Error("Trip not found.");

  const target = mapTrip(targetSnap.id, targetSnap.data());
  const targetStatus = normalizeStatus(target.status);

  if (targetStatus === "complete" || targetStatus === "cancelled") {
    throw new Error("This trip is no longer available to start.");
  }

  const targetCrewUids = getTripCrewUids(target);

  if (!targetCrewUids.includes(workerUid)) {
    throw new Error("This employee is not assigned to the trip.");
  }

  const targetState = normalizeTimerState(target.timerState, target.status);
  const shouldStartWholeCrew =
    args.startWholeCrewWhenTripNotStarted !== false &&
    targetStatus !== "in_progress" &&
    targetState === "not_started";

  const workersToStart = shouldStartWholeCrew ? targetCrewUids : [workerUid];

  const candidateTripsById = new Map<string, TripTimerLike>();

  for (const uid of workersToStart) {
    const trips = await queryTripsForWorker(args.db, uid);
    for (const trip of trips) {
      candidateTripsById.set(trip.id, trip);
    }
  }

  candidateTripsById.set(target.id, target);

  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const liveTrips = new Map<string, TripTimerLike>();

    for (const candidateId of candidateTripsById.keys()) {
      const snap = await tx.get(doc(args.db, "trips", candidateId));
      if (snap.exists()) {
        liveTrips.set(candidateId, mapTrip(candidateId, snap.data()));
      }
    }

    const liveTarget = liveTrips.get(tripId);
    if (!liveTarget) throw new Error("Trip not found.");

    const shouldSyncLinkedTickets = args.syncLinkedServiceTicket !== false;
    const linkedTicketIds = new Set<string>();

    if (shouldSyncLinkedTickets) {
      for (const trip of liveTrips.values()) {
        const ticketId = safeTrim(trip.link?.serviceTicketId);
        if (ticketId) linkedTicketIds.add(ticketId);
      }
    }

    const linkedTicketSnaps = new Map<string, Awaited<ReturnType<typeof tx.get>>>();
    for (const ticketId of linkedTicketIds) {
      const ticketRef = doc(args.db, "serviceTickets", ticketId);
      linkedTicketSnaps.set(ticketId, await tx.get(ticketRef));
    }

    const changedPreviousTrips = new Map<
      string,
      { trip: TripTimerLike; timers: WorkerTimersByUid; timerState: string }
    >();

    for (const uid of workersToStart) {
      for (const [candidateId, candidate] of liveTrips.entries()) {
        if (candidateId === tripId) continue;

        const existingChange = changedPreviousTrips.get(candidateId);
        const timers = existingChange
          ? existingChange.timers
          : materializeWorkerTimers(candidate, stamp);
        const current = timers[uid];

        if (!current || current.status !== "running") continue;

        const currentStartedAt = safeTrim(current.startedAt);
        const currentUpdatedAt = safeTrim(current.updatedAt);
        const currentUpdatedByUid = safeTrim(current.updatedByUid);

        timers[uid] = pauseTimer(current, stamp, actorUid);

        // Clean up stale sibling timers created by the former whole-crew start
        // behavior. Only pause a sibling when its timer has the exact same
        // start/update signature and actor as the worker being switched. A
        // coworker who has independently paused, resumed, or otherwise touched
        // their timer will have a different update signature and remains live.
        if (
          currentStartedAt &&
          currentUpdatedAt &&
          currentUpdatedByUid
        ) {
          for (const [siblingUid, siblingTimer] of Object.entries(timers)) {
            if (siblingUid === uid || siblingTimer.status !== "running") {
              continue;
            }

            const siblingUpdatedByUid = safeTrim(
              siblingTimer.updatedByUid,
            );

            const wasAutoStartedTogether =
              safeTrim(siblingTimer.startedAt) === currentStartedAt &&
              safeTrim(siblingTimer.updatedAt) === currentUpdatedAt &&
              siblingUpdatedByUid === currentUpdatedByUid;

            // A timer last updated by somebody other than the employee whose
            // timer it is was started/managed on that employee's behalf. This
            // includes stale whole-crew timers created by the older workflow.
            // Preserve a coworker's timer only after that coworker has
            // personally started or resumed it.
            const wasManagedForSibling =
              Boolean(siblingUpdatedByUid) &&
              siblingUpdatedByUid !== siblingUid;

            if (wasAutoStartedTogether || wasManagedForSibling) {
              timers[siblingUid] = pauseTimer(
                siblingTimer,
                stamp,
                actorUid,
              );
            }
          }
        }

        changedPreviousTrips.set(candidateId, {
          trip: candidate,
          timers,
          timerState: deriveTripTimerState(timers),
        });
      }
    }

    for (const [candidateId, change] of changedPreviousTrips.entries()) {
      tx.update(doc(args.db, "trips", candidateId), {
        workerTimers: change.timers,
        timerState: change.timerState,
        updatedAt: stamp,
        updatedByUid: actorUid,
      });

      const previousTicketId = safeTrim(change.trip.link?.serviceTicketId);
      const previousTicketSnap = previousTicketId
        ? linkedTicketSnaps.get(previousTicketId)
        : null;

      if (previousTicketId && previousTicketSnap?.exists()) {
        const previousTicket = previousTicketSnap.data() as any;
        const activeTripId = safeTrim(previousTicket.activeTripId);

        if (!activeTripId || activeTripId === candidateId) {
          tx.update(
            doc(args.db, "serviceTickets", previousTicketId),
            buildLinkedTicketTimerPatch({
              tripId: candidateId,
              timerState: change.timerState,
              stamp,
              actorUid,
              actorName,
              actorRole,
            }),
          );
        }
      }
    }

    const targetTimers = materializeWorkerTimers(liveTarget, stamp);

    for (const uid of workersToStart) {
      const current = targetTimers[uid];
      targetTimers[uid] = current
        ? resumeTimer(current, stamp, actorUid)
        : newRunningTimer(stamp, actorUid);
    }

    const targetPatch = {
      status: "in_progress",
      timerState: deriveTripTimerState(targetTimers),
      workerTimers: targetTimers,
      actualStartAt: liveTarget.actualStartAt || stamp,
      actualEndAt: null,
      active: true,
      updatedAt: stamp,
      updatedByUid: actorUid,
    };

    tx.update(targetRef, targetPatch);

    const linkedServiceTicketId = shouldSyncLinkedTickets
      ? safeTrim(liveTarget.link?.serviceTicketId)
      : "";
    const linkedTicketSnap = linkedServiceTicketId
      ? linkedTicketSnaps.get(linkedServiceTicketId)
      : null;

    let linkedServiceTicketUpdated = false;

    if (linkedServiceTicketId && linkedTicketSnap?.exists()) {
      const liveTicket = linkedTicketSnap.data() as any;
      const liveTicketStatus = safeTrim(liveTicket.status).toLowerCase();

      if (
        liveTicketStatus !== "invoiced" &&
        liveTicketStatus !== "cancelled"
      ) {
        tx.update(doc(args.db, "serviceTickets", linkedServiceTicketId), {
          status: "in_progress",
          scheduledTripId: liveTicket.scheduledTripId || tripId,
          ...buildLinkedTicketTimerPatch({
            tripId,
            timerState: targetPatch.timerState,
            stamp,
            actorUid,
            actorName,
            actorRole,
          }),
        });

        linkedServiceTicketUpdated = true;
      }
    }

    return {
      tripId,
      workerUid,
      startedCrewUids: workersToStart,
      startedWholeCrew: shouldStartWholeCrew,
      stamp,
      workerTimers: targetTimers,
      timerState: targetPatch.timerState,
      linkedServiceTicketId: linkedServiceTicketId || null,
      linkedServiceTicketUpdated,
      linkedServiceTicketStatus: linkedServiceTicketUpdated
        ? "in_progress"
        : null,
    };
  });
}

export async function pauseWorkerOnTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;

  if (!tripId) throw new Error("Missing trip id.");
  if (!workerUid) throw new Error("Missing worker id.");

  const tripRef = doc(args.db, "trips", tripId);
  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const snap = await tx.get(tripRef);
    if (!snap.exists()) throw new Error("Trip not found.");

    const trip = mapTrip(tripId, snap.data());
    const linkedServiceTicketId =
      args.syncLinkedServiceTicket === false
        ? ""
        : safeTrim(trip.link?.serviceTicketId);
    const linkedTicketRef = linkedServiceTicketId
      ? doc(args.db, "serviceTickets", linkedServiceTicketId)
      : null;
    const linkedTicketSnap = linkedTicketRef
      ? await tx.get(linkedTicketRef)
      : null;

    const timers = materializeWorkerTimers(trip, stamp);
    const current = timers[workerUid];

    if (!current) {
      throw new Error("No timer exists for this employee on the trip.");
    }

    if (current.status !== "paused") {
      if (current.status !== "running") {
        throw new Error("This employee's timer is not running.");
      }

      timers[workerUid] = pauseTimer(current, stamp, actorUid);
    }

    const timerState = deriveTripTimerState(timers);

    tx.update(tripRef, {
      workerTimers: timers,
      timerState,
      updatedAt: stamp,
      updatedByUid: actorUid,
    });

    if (linkedTicketRef && linkedTicketSnap?.exists()) {
      const liveTicket = linkedTicketSnap.data() as any;
      const activeTripId = safeTrim(liveTicket.activeTripId);

      if (!activeTripId || activeTripId === tripId) {
        tx.update(
          linkedTicketRef,
          buildLinkedTicketTimerPatch({
            tripId,
            timerState,
            stamp,
            actorUid,
            actorName,
            actorRole,
          }),
        );
      }
    }

    return { workerTimers: timers, timerState, stamp };
  });
}

export async function pauseAllWorkersOnTrip(args: {
  db: Firestore;
  tripId: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const actorUid = safeTrim(args.actorUid) || null;
  const actorName = safeTrim(args.actorName) || null;
  const actorRole = safeTrim(args.actorRole) || null;

  if (!tripId) throw new Error("Missing trip id.");

  const tripRef = doc(args.db, "trips", tripId);
  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const snap = await tx.get(tripRef);
    if (!snap.exists()) throw new Error("Trip not found.");

    const trip = mapTrip(tripId, snap.data());
    const linkedServiceTicketId =
      args.syncLinkedServiceTicket === false
        ? ""
        : safeTrim(trip.link?.serviceTicketId);
    const linkedTicketRef = linkedServiceTicketId
      ? doc(args.db, "serviceTickets", linkedServiceTicketId)
      : null;
    const linkedTicketSnap = linkedTicketRef
      ? await tx.get(linkedTicketRef)
      : null;

    const timers = materializeWorkerTimers(trip, stamp);
    const crewUids = getTripCrewUids(trip);

    if (crewUids.length === 0) {
      throw new Error("No assigned crew was found on this trip.");
    }

    let changed = false;
    for (const uid of crewUids) {
      const current = timers[uid];
      if (!current || current.status !== "running") continue;
      timers[uid] = pauseTimer(current, stamp, actorUid);
      changed = true;
    }

    const timerState = deriveTripTimerState(timers);

    if (changed) {
      tx.update(tripRef, {
        workerTimers: timers,
        timerState,
        updatedAt: stamp,
        updatedByUid: actorUid,
      });
    }

    if (linkedTicketRef && linkedTicketSnap?.exists()) {
      const liveTicket = linkedTicketSnap.data() as any;
      const activeTripId = safeTrim(liveTicket.activeTripId);

      if (!activeTripId || activeTripId === tripId) {
        tx.update(
          linkedTicketRef,
          buildLinkedTicketTimerPatch({
            tripId,
            timerState,
            stamp,
            actorUid,
            actorName,
            actorRole,
          }),
        );
      }
    }

    return {
      workerTimers: timers,
      timerState,
      stamp,
      affectedWorkerUids: crewUids.filter(
        (uid) => timers[uid]?.status === "paused",
      ),
    };
  });
}

export async function resumeWorkerOnTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  return switchWorkerToTrip({
    db: args.db,
    tripId: args.tripId,
    workerUid: args.workerUid,
    actorUid: args.actorUid,
    actorName: args.actorName,
    actorRole: args.actorRole,
    startWholeCrewWhenTripNotStarted: false,
    syncLinkedServiceTicket: args.syncLinkedServiceTicket,
  });
}

export async function resumeAllWorkersOnTrip(args: {
  db: Firestore;
  tripId: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  syncLinkedServiceTicket?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const actorUid = safeTrim(args.actorUid) || null;

  if (!tripId) throw new Error("Missing trip id.");

  const tripRef = doc(args.db, "trips", tripId);
  const initialSnap = await getDoc(tripRef);
  if (!initialSnap.exists()) throw new Error("Trip not found.");

  const initialTrip = mapTrip(tripId, initialSnap.data());
  const status = normalizeStatus(initialTrip.status);

  if (status === "complete" || status === "cancelled") {
    throw new Error("This trip is no longer available to resume.");
  }

  const crewUids = getTripCrewUids(initialTrip);
  if (crewUids.length === 0) {
    throw new Error("No assigned crew was found on this trip.");
  }

  const affectedWorkerUids: string[] = [];

  // Use the same switch path for every worker so resuming an entire crew
  // cannot leave any worker running on two trips at once.
  for (const workerUid of crewUids) {
    const timer = getWorkerTimer(initialTrip, workerUid);
    if (!timer || timer.status !== "paused") continue;

    await switchWorkerToTrip({
      db: args.db,
      tripId,
      workerUid,
      actorUid,
      actorName: args.actorName,
      actorRole: args.actorRole,
      startWholeCrewWhenTripNotStarted: false,
      syncLinkedServiceTicket: args.syncLinkedServiceTicket,
    });

    affectedWorkerUids.push(workerUid);
  }

  const finalSnap = await getDoc(tripRef);
  if (!finalSnap.exists()) throw new Error("Trip not found.");

  const finalTrip = mapTrip(tripId, finalSnap.data());
  const stamp = new Date().toISOString();
  const workerTimers = materializeWorkerTimers(finalTrip, stamp);

  return {
    workerTimers,
    timerState: deriveTripTimerState(workerTimers),
    stamp,
    affectedWorkerUids,
  };
}

export function completeAllWorkerTimers(
  trip: TripTimerLike,
  stamp: string,
  actorUid?: string | null,
) {
  const timers = materializeWorkerTimers(trip, stamp);
  for (const [uid, timer] of Object.entries(timers)) {
    const pauseBlocks = Array.isArray(timer.pauseBlocks)
      ? timer.pauseBlocks.map((block) => ({ ...block }))
      : [];
    const openIndex = findOpenPauseIndex(pauseBlocks);
    if (openIndex !== -1) {
      pauseBlocks[openIndex] = { ...pauseBlocks[openIndex], endAt: stamp };
    }
    timers[uid] = {
      ...timer,
      status: "complete",
      endedAt: stamp,
      pauseBlocks,
      updatedAt: stamp,
      updatedByUid: safeTrim(actorUid) || null,
    };
  }
  return timers;
}