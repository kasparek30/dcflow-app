// src/types/company-holiday.ts

import type { AppUserRole } from "./app-user";

export type CompanyHoliday = {
  id: string;
  name: string;
  holidayDate: string; // YYYY-MM-DD

  paid: boolean;
  hoursPaid: number;

  isFullDay: boolean;
  scheduleBlocked: boolean;
  allowEmergencyOverride: boolean;

  appliesToRoles: AppUserRole[];

  active: boolean;
  notes?: string;

  createdAt?: string;
  updatedAt?: string;
};