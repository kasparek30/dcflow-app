// src/types/trip.ts

export type TripType = "service" | "project";

export type TripStatus = "planned" | "in_progress" | "completed" | "cancelled";

export type TripTimeWindow = "am" | "pm" | "all_day" | "custom";

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

  createdAt?: string;
  updatedAt?: string;
  createdByUid?: string;
  updatedByUid?: string;
};