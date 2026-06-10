// src/types/employee-profile.ts

import type { StaffCoverageWorkType } from "./app-user";

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

  // Staff scheduling / assignment controls
  showOnSchedule?: boolean;
  fieldAssignable?: boolean;
  staffCoverageEligible?: boolean;
  defaultStaffCoverageWorkType?: StaffCoverageWorkType | null;

  // ✅ QuickBooks link (v1)
  qboEmployeeId?: string;
  qboEmployeeDisplayName?: string;
  qboEmployeeHiredDate?: string; // YYYY-MM-DD
  ptoEligibilityDate?: string; // YYYY-MM-DD (HiredDate + 365 by default)

  notes?: string;

  createdAt: string;
  updatedAt: string;
};