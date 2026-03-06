// src/types/daily-crew-override.ts

export type DailyCrewOverride = {
  id: string;

  date: string; // YYYY-MM-DD

  helperUid: string;
  assignedTechUid: string;

  note?: string;

  active: boolean;

  createdAt?: string;
  createdByUid?: string;
  updatedAt?: string;
  updatedByUid?: string;
};