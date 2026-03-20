// src/types/time-entry.ts

export type TimeEntryCategory =
  // ✅ legacy categories (still exist in older docs)
  | "service_ticket"
  | "project_stage"

  // ✅ current categories (what you said you're using now)
  | "service"
  | "project"
  | "meeting"

  // ✅ other system/manual categories
  | "shop"
  | "office"
  | "pto"
  | "holiday"
  | "manual_other";

export type TimeEntryPayType = "regular" | "overtime" | "pto" | "holiday";

export type TimeEntrySource =
  // manual / default
  | "auto_suggested"
  | "manual_entry"
  | "system_generated_holiday"
  | "system_generated_pto"

  // ✅ trip-driven sources you are actually writing
  | "trip_completion"
  | "trip_daily_confirm"
  | "trip_completion_confirmed";

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

  // ✅ optional “card display” fields (future-proof)
  displayTitle?: string;
  displaySubtitle?: string;
  outcome?: "resolved" | "follow_up" | "unknown";

  entryStatus: TimeEntryStatus;

  createdAt?: string;
  updatedAt?: string;
};