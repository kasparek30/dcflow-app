// src/types/staff-coverage.ts

import type { StaffCoverageWorkType } from "./app-user";

export type StaffCoverageStatus =
  | "scheduled"
  | "clocked_in"
  | "completed"
  | "cancelled";

export type StaffCoverage = {
  id: string;

  employeeId: string;
  employeeName: string;
  employeeRole: string;
  laborRoleType?: string | null;

  workType: StaffCoverageWorkType;

  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm

  scheduledHours: number;
  unpaidBreakMinutes?: number;

  status: StaffCoverageStatus;
  active: boolean;

  linkedTimeEntryId?: string | null;
  linkedWeeklyTimesheetId?: string | null;

  actualStartAt?: string | null;
  actualEndAt?: string | null;

  confirmedAt?: string | null;
  confirmedByUid?: string | null;

  notes?: string | null;

  createdAt: string;
  createdByUid: string | null;
  createdByName?: string | null;

  updatedAt: string;
  updatedByUid: string | null;
  updatedByName?: string | null;
};