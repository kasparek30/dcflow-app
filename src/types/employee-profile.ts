// src/types/employee-profile.ts

export type EmploymentStatus = "current" | "inactive" | "seasonal";

export type LaborRole =
  | "technician"
  | "helper"
  | "apprentice"
  | "dispatcher"
  | "billing"
  | "admin"
  | "manager"
  | "other";

export type EmployeeProfile = {
  id: string;

  // Link to DCFlow login user (optional)
  userUid?: string;

  displayName: string;
  email?: string;
  phone?: string;

  employmentStatus: EmploymentStatus;
  laborRole: LaborRole;

  // Default pairing (for helpers/apprentices)
  defaultPairedTechUid?: string;

  // Future QuickBooks link
  qboEmployeeId?: string;

  notes?: string;

  createdAt: string;
  updatedAt: string;
};