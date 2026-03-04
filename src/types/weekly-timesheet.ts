// src/types/weekly-timesheet.ts

export type WeeklyTimesheetStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "exported_to_quickbooks";

export type QuickBooksExportStatus =
  | "not_ready"
  | "ready"
  | "exported"
  | "failed";

export type WeeklyTimesheet = {
  id: string;

  employeeId: string;
  employeeName: string;
  employeeRole: string;

  weekStartDate: string;
  weekEndDate: string;

  timeEntryIds: string[];

  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  ptoHours: number;
  holidayHours: number;

  billableHours: number;
  nonBillableHours: number;

  status: WeeklyTimesheetStatus;

  submittedAt?: string;
  submittedById?: string;

  approvedAt?: string;
  approvedById?: string;
  approvedByName?: string;

  rejectedAt?: string;
  rejectedById?: string;
  rejectionReason?: string;

  quickbooksExportStatus: QuickBooksExportStatus;
  quickbooksExportedAt?: string;
  quickbooksPayrollBatchId?: string;

  employeeNote?: string;
  managerNote?: string;

  createdAt?: string;
  updatedAt?: string;
};