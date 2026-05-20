// src/lib/service-ticket-activity.ts
import { adminFirestore } from "./firebase-admin";

type ServiceTicketActivityType =
  | "supplier_invoice_matched"
  | "supplier_materials_imported"
  | "billing_resynced"
  | "billing_resync_skipped"
  | "supplier_invoice_unmatched";

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export async function recordServiceTicketActivity(args: {
  serviceTicketId: string;
  type: ServiceTicketActivityType;
  title: string;
  description?: string | null;
  details?: string[];
  createdByUid?: string | null;
  createdByName?: string | null;
  createdByRole?: string | null;
}) {
  const serviceTicketId = clean(args.serviceTicketId);

  if (!serviceTicketId) {
    return { logged: false, reason: "Missing serviceTicketId." };
  }

  const now = new Date().toISOString();

  const payload = {
    type: args.type,
    title: clean(args.title) || "Service ticket activity",
    description: clean(args.description) || null,
    details: (args.details || []).map(clean).filter(Boolean).slice(0, 20),
    createdAt: now,
    createdByUid: args.createdByUid || null,
    createdByName: args.createdByName || "System",
    createdByRole: args.createdByRole || "system",
  };

  await adminFirestore
    .collection("serviceTickets")
    .doc(serviceTicketId)
    .collection("activity")
    .add(payload);

  return { logged: true, createdAt: now };
}