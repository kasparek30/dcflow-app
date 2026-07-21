import {
  collection,
  doc,
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
  const crew = trip.crewConfirmed || trip.crew || null;
  if (!getCrewUids(crew).includes(workerUid)) return null;

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
  const existing = trip.workerTimers && typeof trip.workerTimers === "object"
    ? { ...trip.workerTimers }
    : {};

  const crew = trip.crewConfirmed || trip.crew || null;
  for (const uid of getCrewUids(crew)) {
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
  };
}

async function queryTripsForWorker(db: Firestore, workerUid: string) {
  const base = collection(db, "trips");
  const paths = [
    "crew.primaryTechUid",
    "crew.helperUid",
    "crew.secondaryTechUid",
    "crew.secondaryHelperUid",
  ];

  const snapshots = await Promise.all(
    paths.map((fieldPath) =>
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

  const byId = new Map<string, TripTimerLike>();
  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    for (const row of snapshot.docs) {
      byId.set(row.id, mapTrip(row.id, row.data()));
    }
  }
  return Array.from(byId.values());
}

export async function switchWorkerToTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
  startWholeCrewWhenTripNotStarted?: boolean;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const actorUid = safeTrim(args.actorUid) || null;
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

  const targetCrew = target.crewConfirmed || target.crew || null;
  const targetCrewUids = getCrewUids(targetCrew);
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
    for (const trip of trips) candidateTripsById.set(trip.id, trip);
  }
  candidateTripsById.set(target.id, target);

  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const liveTrips = new Map<string, TripTimerLike>();
    for (const candidateId of candidateTripsById.keys()) {
      const snap = await tx.get(doc(args.db, "trips", candidateId));
      if (snap.exists()) liveTrips.set(candidateId, mapTrip(candidateId, snap.data()));
    }

    const liveTarget = liveTrips.get(tripId);
    if (!liveTarget) throw new Error("Trip not found.");

    for (const uid of workersToStart) {
      for (const [candidateId, candidate] of liveTrips.entries()) {
        if (candidateId === tripId) continue;

        const timers = materializeWorkerTimers(candidate, stamp);
        const current = timers[uid];
        if (!current || current.status !== "running") continue;

        timers[uid] = pauseTimer(current, stamp, actorUid);
        tx.update(doc(args.db, "trips", candidateId), {
          workerTimers: timers,
          timerState: deriveTripTimerState(timers),
          updatedAt: stamp,
          updatedByUid: actorUid,
        });
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

    return {
      tripId,
      workerUid,
      startedCrewUids: workersToStart,
      startedWholeCrew: shouldStartWholeCrew,
      stamp,
      workerTimers: targetTimers,
      timerState: targetPatch.timerState,
    };
  });
}

export async function pauseWorkerOnTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
}) {
  const tripId = safeTrim(args.tripId);
  const workerUid = safeTrim(args.workerUid);
  const actorUid = safeTrim(args.actorUid) || null;
  const tripRef = doc(args.db, "trips", tripId);
  const stamp = new Date().toISOString();

  return runTransaction(args.db, async (tx) => {
    const snap = await tx.get(tripRef);
    if (!snap.exists()) throw new Error("Trip not found.");
    const trip = mapTrip(tripId, snap.data());
    const timers = materializeWorkerTimers(trip, stamp);
    const current = timers[workerUid];
    if (!current) throw new Error("No timer exists for this employee on the trip.");
    if (current.status === "paused") return { workerTimers: timers, timerState: deriveTripTimerState(timers) };
    if (current.status !== "running") throw new Error("This employee's timer is not running.");

    timers[workerUid] = pauseTimer(current, stamp, actorUid);
    const timerState = deriveTripTimerState(timers);
    tx.update(tripRef, {
      workerTimers: timers,
      timerState,
      updatedAt: stamp,
      updatedByUid: actorUid,
    });
    return { workerTimers: timers, timerState, stamp };
  });
}

export async function resumeWorkerOnTrip(args: {
  db: Firestore;
  tripId: string;
  workerUid: string;
  actorUid?: string | null;
}) {
  return switchWorkerToTrip({
    db: args.db,
    tripId: args.tripId,
    workerUid: args.workerUid,
    actorUid: args.actorUid,
    startWholeCrewWhenTripNotStarted: false,
  });
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
