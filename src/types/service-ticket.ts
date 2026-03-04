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

  assignedTechnicianId?: string;
  assignedTechnicianName?: string;

  internalNotes?: string;

  active: boolean;

  createdAt?: string;
  updatedAt?: string;
};