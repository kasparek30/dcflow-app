// src/types/time-entry.ts

export type TimeEntryCategory =
  | "service_ticket"
  | "project_stage"
  | "meeting"
  | "shop"
  | "office"
  | "pto"
  | "holiday"
  | "manual_other";

export type TimeEntryPayType =
  | "regular"
  | "overtime"
  | "pto"
  | "holiday";

export type TimeEntrySource =
  | "auto_suggested"
  | "manual_entry"
  | "system_generated_holiday"
  | "system_generated_pto";

export type TimeEntryStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "exported";

export type ProjectStageKey = "roughIn" | "topOutVent" | "trimFinish";

export type TimeEntry = {
  id: string;

  employeeId: string;
  employeeName: string;
  employeeRole: string;
  laborRoleType?: string;

  entryDate: string;
  weekStartDate: string;
  weekEndDate: string;

  category: TimeEntryCategory;
  hours: number;
  payType: TimeEntryPayType;
  billable: boolean;
  source: TimeEntrySource;

  serviceTicketId?: string;
  projectId?: string;
  projectStageKey?: ProjectStageKey;

  linkedTechnicianId?: string;
  linkedTechnicianName?: string;

  notes?: string;
  timesheetId?: string;

  entryStatus: TimeEntryStatus;

  createdAt?: string;
  updatedAt?: string;
};