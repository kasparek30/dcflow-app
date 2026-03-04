// src/types/service-ticket-visit.ts

export type ServiceTicketVisitOutcome =
  | "completed"
  | "follow_up"
  | "cancelled"
  | "partial_complete";

export type ServiceTicketVisit = {
  id: string;

  serviceTicketId: string;
  customerId?: string;
  customerDisplayName?: string;

  visitDate: string;

  leadTechnicianId: string;
  leadTechnicianName: string;

  supportUserId?: string;
  supportUserName?: string;

  startTime?: string;
  endTime?: string;

  hoursWorked: number;
  billableHours: number;

  materialsSummary?: string;
  materialsCost?: number;

  outcome: ServiceTicketVisitOutcome;
  notes?: string;

  createdAt?: string;
  updatedAt?: string;
};