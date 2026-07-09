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

export type TripWorkNote = {
  id: string;
  text: string;

  createdAt: string;
  createdByUid: string;
  createdByName?: string | null;

  updatedAt?: string | null;
  updatedByUid?: string | null;
  updatedByName?: string | null;
};

export type TripMaterialNote = {
  id: string;
  text: string;

  createdAt: string;
  createdByUid: string;
  createdByName?: string | null;

  updatedAt?: string | null;
  updatedByUid?: string | null;
  updatedByName?: string | null;
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

  /**
   * General trip/scheduling notes.
   * This is still useful for office/admin scheduling context.
   */
  notes?: string;

  /**
   * Field-facing work notes used during active trips.
   * This should be available for both service and project trips.
   */
  workNotes?: TripWorkNote[];

  /**
   * Optional structured material notes during the trip.
   * Useful when crews want to keep material tracking separate from general work notes.
   */
  materialNotes?: TripMaterialNote[];

  /**
   * Simple summary fields used during closeout / billing history.
   * These support the existing project trip closeout flow.
   */
  workNotesSummary?: string | null;
  materialsUsedToday?: string | null;
  materialsSummary?: string | null;

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