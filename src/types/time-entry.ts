// src/types/time-entry.ts

export type TimeEntryCategory =
  // ✅ current Firestore categories
  | "service"
  | "project"
  | "meeting"
  | "shop"
  | "office"
  | "pto"
  | "holiday"
  | "manual_other"
  // ✅ legacy categories that may still exist in older docs
  | "service_ticket"
  | "project_stage";

export type TimeEntryPayType = "regular" | "overtime" | "pto" | "holiday";

export type TimeEntrySource =
  | "auto_suggested"
  | "manual_entry"
  | "system_generated_holiday"
  | "system_generated_pto"
  // ✅ newer sources you’re using in Firestore
  | "trip_completion"
  | "trip_daily_confirm";

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

  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: ProjectStageKey | null;

  linkedTechnicianId?: string | null;
  linkedTechnicianName?: string | null;

  notes?: string | null;
  timesheetId?: string | null;

  entryStatus: TimeEntryStatus;

  createdAt?: string;
  updatedAt?: string;

  // ✅ optional fields you already have in Firestore sometimes
  hoursLocked?: boolean;
  hoursSource?: number;
  tripId?: string;
};