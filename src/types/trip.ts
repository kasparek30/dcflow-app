// src/types/trip.ts

export type TripType = "service" | "project";

export type TripStatus =
  | "planned"
  | "in_progress"
  | "complete"
  | "completed"
  | "cancelled";

export type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

export type TripCloseoutDecision =
  | "done_today"
  | "stage_complete"
  | "project_complete"
  | "more_time_needed";

export type PauseBlock = {
  startAt: string;
  endAt: string | null;
};

export type TripCrew = {
  primaryTechUid: string;
  primaryTechName?: string;

  helperUid?: string;
  helperName?: string;

  secondaryTechUid?: string;
  secondaryTechName?: string;

  secondaryHelperUid?: string;
  secondaryHelperName?: string;
};

export type TripLink = {
  serviceTicketId?: string;

  projectId?: string;
  projectStageKey?: "roughIn" | "topOutVent" | "trimFinish" | "tm_work";
};

export type Trip = {
  id: string;

  type: TripType;
  status: TripStatus;

  date: string; // YYYY-MM-DD
  timeWindow: TripTimeWindow;

  startTime?: string; // HH:mm
  endTime?: string; // HH:mm

  crew: TripCrew;
  link: TripLink;

  sourceKey: string; // unique deterministic key for idempotent sync

  notes?: string;
  cancelReason?: string;

  active: boolean;

  timerState?: "not_started" | "running" | "paused" | "complete" | string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  pauseBlocks?: PauseBlock[] | null;

  completedAt?: string | null;
  completedByUid?: string | null;

  closeoutDecision?: TripCloseoutDecision | null;
  closeoutNotes?: string | null;
  closeoutAt?: string | null;
  closeoutByUid?: string | null;

  needsMoreTime?: boolean | null;
  requestedReturnDate?: string | null;
  estimatedHoursRemaining?: number | null;

  completedEarly?: boolean | null;
  cancelledFutureTripCount?: number | null;

  createdAt?: string;
  updatedAt?: string;
  createdByUid?: string;
  updatedByUid?: string;
};