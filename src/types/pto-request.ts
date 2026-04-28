export type PTORequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type PTORequestDayType = "full_day" | "partial_day";

export type PTORequestPartialDayType = "am" | "pm" | "custom";

export type PTORequest = {
  id: string;

  employeeId: string;
  employeeName: string;
  employeeRole: string;

  startDate: string;
  endDate: string;
  hoursPerDay: number;

  totalRequestedHours: number;

  status: PTORequestStatus;

  requestDayType?: PTORequestDayType;
  partialDayType?: PTORequestPartialDayType | null;
  partialStartTime?: string | null;
  partialEndTime?: string | null;

  notes?: string;
  managerNote?: string;
  rejectionReason?: string;

  approvedAt?: string;
  approvedById?: string;
  approvedByName?: string;

  rejectedAt?: string;
  rejectedById?: string;

  createdAt?: string;
  updatedAt?: string;
};