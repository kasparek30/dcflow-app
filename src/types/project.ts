export type ProjectBidStatus = "draft" | "submitted" | "won" | "lost";

export type ProjectStageStatus =
  | "not_started"
  | "scheduled"
  | "in_progress"
  | "complete";

// ✅ Optional staffing fields (safe + additive)
export type StageStaffing = {
  primaryTechnicianId?: string;
  primaryTechnicianName?: string;

  secondaryTechnicianId?: string;
  secondaryTechnicianName?: string;

  helperIds?: string[];
  helperNames?: string[];
};

export type ProjectStage = {
  status: ProjectStageStatus;
  scheduledDate?: string;
  completedDate?: string;

  billed: boolean;
  billedAmount: number;

  // ✅ NEW: stage-level staffing (optional)
  staffing?: StageStaffing;
};

export type Project = {
  id: string;

  customerId: string;
  customerDisplayName: string;

  serviceAddressId?: string;
  serviceAddressLabel?: string;
  serviceAddressLine1: string;
  serviceAddressLine2?: string;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string;

  projectName: string;
  projectType: "new_construction" | "remodel" | "other";
  description?: string;

  bidStatus: ProjectBidStatus;
  totalBidAmount: number;

  roughIn: ProjectStage;
  topOutVent: ProjectStage;
  trimFinish: ProjectStage;

  // ✅ Project-level default crew (optional fallback)
  primaryTechnicianId?: string;
  primaryTechnicianName?: string;

  secondaryTechnicianId?: string;
  secondaryTechnicianName?: string;

  helperIds?: string[];
  helperNames?: string[];

  // Legacy single-tech fields (keep for backwards compatibility)
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;

  internalNotes?: string;
  active: boolean;

  createdAt?: string;
  updatedAt?: string;
};