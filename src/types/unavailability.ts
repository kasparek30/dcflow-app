// src/types/unavailability.ts

export type UnavailabilityType =
  | "sick"
  | "pto"
  | "unpaid"
  | "holiday"
  | "other";

export type EmployeeUnavailability = {
  id: string;

  userUid: string;       // Firebase Auth UID
  date: string;          // ISO YYYY-MM-DD (single-day for v1)

  type: UnavailabilityType;
  reason?: string;

  // If false, treat as cancelled/removed (we avoid delete for safety)
  active: boolean;

  createdAt?: string;
  createdByUid?: string;

  updatedAt?: string;
  updatedByUid?: string;
};