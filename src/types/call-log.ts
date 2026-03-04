export type CallLog = {
  id: string;

  customerId: string;
  ticketId?: string;

  callType: "new_information" | "status_check" | "reschedule" | "billing" | "general";
  direction: "inbound" | "outbound";

  summary: string;
  details?: string;

  visibleToTech: boolean;
  updatesTicketNotes: boolean;
  followUpNeeded: boolean;
  followUpNote?: string;

  status: "logged";

  callOccurredAt?: string;
  createdAt?: string;
  updatedAt?: string;
};