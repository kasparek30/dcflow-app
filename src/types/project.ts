// src/types/project.ts
export type ProjectBidStatus = "draft" | "submitted" | "won" | "lost";

export type ProjectStageStatus =
  | "not_started"
  | "scheduled"
  | "in_progress"
  | "complete";

export type ProjectOfficeStatus =
  | "active_work"
  | "field_complete"
  | "ready_to_invoice"
  | "invoiced"
  | "closed";

export type ProjectBillingPeriodStatus = "open" | "ready_to_bill" | "invoiced";

export type ProjectStageBillingStatus =
  | "not_ready"
  | "ready_to_bill"
  | "invoiced";

export type ProjectBillingPeriod = {
  id: string;
  sequence: number;
  label?: string;
  status: ProjectBillingPeriodStatus;
  openedAt?: string;
  openedByUid?: string;
  openedByName?: string;
  readyToBillAt?: string;
  readyToBillByUid?: string;
  readyToBillByName?: string;
  invoicedAt?: string;
  invoicedByUid?: string;
  invoicedByName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceNotes?: string;
  tripIds?: string[];
  tripCount?: number;
  totalHours?: number;
  materialsCount?: number;
  dateFrom?: string;
  dateTo?: string;
};

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

  staffing?: StageStaffing;

  /**
   * Stage-level billing lifecycle for staged projects.
   *
   * Safe default:
   * - If missing and billed === true, treat as "invoiced".
   * - If missing and billed !== true, treat as "not_ready".
   */
  billingStatus?: ProjectStageBillingStatus;

  /**
   * Ready to bill means the stage is complete enough for the office to invoice
   * that stage without closing the whole project.
   */
  readyToBillAt?: string;
  readyToBillByUid?: string;
  readyToBillByName?: string;

  /**
   * Invoiced means this stage billing has been recorded/sent.
   */
  invoicedAt?: string;
  invoicedByUid?: string;
  invoicedByName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceNotes?: string;
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
  projectType: "new_construction" | "remodel" | "time_materials" | "other";
  description?: string;

  bidStatus: ProjectBidStatus;
  totalBidAmount: number;

  roughIn: ProjectStage;
  topOutVent: ProjectStage;
  trimFinish: ProjectStage;

  primaryTechnicianId?: string;
  primaryTechnicianName?: string;

  secondaryTechnicianId?: string;
  secondaryTechnicianName?: string;

  helperIds?: string[];
  helperNames?: string[];

  assignedTechnicianId?: string;
  assignedTechnicianName?: string;

  internalNotes?: string;

  projectOfficeStatus?: ProjectOfficeStatus;

  /**
   * T&M billing periods.
   *
   * - One open period may exist while work is still accumulating.
   * - Ready-to-bill periods are frozen for office billing.
   * - Invoiced periods remain historical and accessible.
   */
  billingPeriods?: ProjectBillingPeriod[];
  currentBillingPeriodId?: string;

  fieldCompletedAt?: string;
  fieldCompletedByUid?: string;
  fieldCompletedByName?: string;

  readyToInvoiceAt?: string;
  readyToInvoiceByUid?: string;
  readyToInvoiceByName?: string;

  invoicedAt?: string;
  invoicedByUid?: string;
  invoicedByName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceNotes?: string;

  closedAt?: string;
  closedByUid?: string;
  closedByName?: string;

  reopenedAt?: string;
  reopenedByUid?: string;
  reopenedByName?: string;
  reopenReason?: string;

  active: boolean;

  createdAt?: string;
  updatedAt?: string;
};
