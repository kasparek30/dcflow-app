// src/types/pto-request.ts

export type PTORequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

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