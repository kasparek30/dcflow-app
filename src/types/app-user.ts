// src/types/app-user.ts

export type AppUserRole =
  | "admin"
  | "dispatcher"
  | "manager"
  | "billing"
  | "technician"
  | "helper"
  | "apprentice"
  | "office_display";

export type LaborRoleType = "lead_field" | "support_field" | "office";

export type StaffCoverageWorkType =
  | "dispatch"
  | "billing"
  | "office"
  | "admin"
  | "shop"
  | "other";

export type AppUser = {
  uid: string;
  displayName: string;
  email: string;
  role: AppUserRole;
  active: boolean;

  // --- Milestone 8A.0 fields ---
  laborRoleType?: LaborRoleType;

  // Helpers/apprentices usually ride with a tech (default pairing)
  preferredTechnicianId?: string | null;
  preferredTechnicianName?: string | null;

  // Holiday pay configuration
  holidayEligible?: boolean;
  defaultDailyHolidayHours?: number;

  // --- Staff Coverage / assignment controls ---
  // showOnSchedule: employee can appear on company schedule rows/cards.
  // fieldAssignable: employee can be assigned to customer field trips.
  // staffCoverageEligible: employee can be scheduled for office/dispatch coverage.
  showOnSchedule?: boolean;
  fieldAssignable?: boolean;
  staffCoverageEligible?: boolean;
  defaultStaffCoverageWorkType?: StaffCoverageWorkType | null;
};