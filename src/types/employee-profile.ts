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

export type ShirtSize =
  | "XS"
  | "S"
  | "M"
  | "L"
  | "XL"
  | "2XL"
  | "3XL"
  | "4XL"
  | "5XL"
  | "LT"
  | "XLT"
  | "2XLT"
  | "3XLT"
  | "4XLT";

export type PlumbingLicenseType =
  | "none"
  | "apprentice"
  | "tradesman"
  | "journeyman"
  | "master"
  | "other";

export type EmployeeLicenseInfo = {
  licenseType: PlumbingLicenseType;

  // License number as shown on the state license/registration
  licenseNumber?: string;

  // Example: "TX"
  issuingState?: string;

  // YYYY-MM-DD
  expirationDate?: string;

  notes?: string;
};

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

  // Company gear / apparel
  shirtSize?: ShirtSize | "";
  gearNotes?: string;

  // Plumbing license / registration info
  licenseInfo?: EmployeeLicenseInfo;

  // ✅ QuickBooks link (v1)
  qboEmployeeId?: string;
  qboEmployeeDisplayName?: string;
  qboEmployeeHiredDate?: string; // YYYY-MM-DD
  ptoEligibilityDate?: string; // YYYY-MM-DD (HiredDate + 365 by default)

  notes?: string;

  createdAt: string;
  updatedAt: string;
};