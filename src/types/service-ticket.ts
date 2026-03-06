// src/types/service-ticket.ts

export type ServiceTicketStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "cancelled";

export type ServiceTicket = {
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

  issueSummary: string;
  issueDetails?: string;

  status: ServiceTicketStatus;

  estimatedDurationMinutes: number;

  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;

  // Existing single-tech fields (keep for backwards compatibility)
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;

  // ✅ NEW: Multi-tech foundation (additive + optional, does not break existing data)
  primaryTechnicianId?: string;      // usually same as assignedTechnicianId for now
  assignedTechnicianIds?: string[];  // includes primary + helper(s)

  internalNotes?: string;

  active: boolean;

  createdAt?: string;
  updatedAt?: string;
};