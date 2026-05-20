// src/lib/resync-service-ticket-billing.ts
import { adminFirestore } from "./firebase-admin";

type TripMaterial = {
  name?: string;
  qty?: number;
  unit?: string;
  notes?: string;
  [key: string]: unknown;
};

type TripDoc = {
  id: string;
  status?: string;
  outcome?: string;
  readyToBillAt?: string;
  updatedAt?: string;
  date?: string;
  actualMinutes?: number;
  billableHours?: number;
  resolutionNotes?: string | null;
  workNotes?: string | null;
  materials?: TripMaterial[];
};

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function roundToHalf(value: number) {
  return Math.round(Number(value || 0) * 2) / 2;
}

function normalizeTripStatus(value: unknown) {
  return clean(value).toLowerCase();
}

function formatSingleMaterialLine(material: TripMaterial | null) {
  const name = clean(material?.name);
  if (!name) return "";

  const qty = Number(material?.qty ?? 0);
  const unit = clean(material?.unit);
  const notes = clean(material?.notes);

  let line = name;

  if ((Number.isFinite(qty) && qty > 1) || unit) {
    const qtyPrefix = Number.isFinite(qty) && qty > 0 ? `${qty} of ` : "";
    line = `${qtyPrefix}${name}${unit ? ` (${unit})` : ""}`;
  }

  if (notes) {
    line = `${line} — ${notes}`;
  }

  return line;
}

function buildMaterialsSummaryFromLines(materials?: TripMaterial[] | null) {
  const items = Array.isArray(materials) ? materials : [];
  return items.map((m) => formatSingleMaterialLine(m)).filter(Boolean).join(", ");
}

function mergeTripMaterials(trips: TripDoc[]) {
  return trips
    .flatMap((trip) => (Array.isArray(trip.materials) ? trip.materials : []))
    .filter((item) => clean(item?.name));
}

function getDefaultBillableHours(actualMinutes: number) {
  const safeMinutes = Math.max(0, Number(actualMinutes || 0));
  return Math.max(1, roundToHalf(safeMinutes / 60));
}

function getStoredOrComputedBillableHours(trip: TripDoc) {
  const stored = Number(trip.billableHours);
  if (Number.isFinite(stored) && stored > 0) {
    return roundToHalf(stored);
  }

  return getDefaultBillableHours(Number(trip.actualMinutes || 0));
}

function getTripSortTime(trip: TripDoc) {
  const candidates = [trip.readyToBillAt, trip.updatedAt, trip.date].map((value) =>
    Date.parse(String(value || ""))
  );

  const valid = candidates.find((value) => Number.isFinite(value));
  return Number.isFinite(valid) ? Number(valid) : 0;
}

function buildBillingPacketFromResolvedTrips(args: {
  trips: TripDoc[];
  fallbackUpdatedAt: string;
}) {
  const completedTrips = args.trips.filter(
    (trip) => normalizeTripStatus(trip.status) === "complete"
  );

  const resolvedTrips = completedTrips.filter(
    (trip) => clean(trip.outcome).toLowerCase() === "resolved"
  );

  if (completedTrips.length === 0 || resolvedTrips.length === 0) {
    return null;
  }

  const totalHours = completedTrips.reduce(
    (sum, trip) => sum + getStoredOrComputedBillableHours(trip),
    0
  );

  const materials = mergeTripMaterials(completedTrips);
  const materialsSummary = buildMaterialsSummaryFromLines(materials) || null;

  const uniqueResolutionNotes = Array.from(
    new Set(resolvedTrips.map((trip) => clean(trip.resolutionNotes)).filter(Boolean))
  );

  const uniqueWorkNotes = Array.from(
    new Set(completedTrips.map((trip) => clean(trip.workNotes)).filter(Boolean))
  );

  const latestResolvedTrip = [...resolvedTrips].sort((a, b) => {
    const timeDiff = getTripSortTime(b) - getTripSortTime(a);
    if (timeDiff !== 0) return timeDiff;

    const dateDiff = clean(b.date).localeCompare(clean(a.date));
    if (dateDiff !== 0) return dateDiff;

    return clean(b.id).localeCompare(clean(a.id));
  })[0];

  return {
    status: "ready_to_bill" as const,
    readyToBillAt:
      latestResolvedTrip?.readyToBillAt ||
      latestResolvedTrip?.updatedAt ||
      args.fallbackUpdatedAt,
    readyToBillTripId: latestResolvedTrip?.id || null,
    resolutionNotes: uniqueResolutionNotes.join("\n\n") || null,
    workNotes: uniqueWorkNotes.join("\n\n") || null,
    labor: {
      totalHours: roundToHalf(totalHours),
      byCrew: [],
    },
    materials,
    materialsSummary,
    materialsAmount: null,
    photos: [],
    invoiceSource: null,
    qboInvoiceId: null,
    qboDocNumber: null,
    qboInvoiceUrl: null,
    qboSyncedAt: null,
    qboInvoiceStatus: null,
    invoiceError: null,
    updatedAt: args.fallbackUpdatedAt,
  };
}

export async function resyncServiceTicketBillingFromTrips(args: {
  serviceTicketId: string;
}) {
  const serviceTicketId = clean(args.serviceTicketId);

  if (!serviceTicketId) {
    return { resynced: false, reason: "Missing serviceTicketId." };
  }

  const now = new Date().toISOString();
  const ticketRef = adminFirestore.collection("serviceTickets").doc(serviceTicketId);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) {
    return { resynced: false, reason: `Service ticket ${serviceTicketId} not found.` };
  }

  const ticket = ticketSnap.data() as any;
  const ticketStatus = clean(ticket.status).toLowerCase();

  if (ticketStatus === "invoiced") {
    return {
      resynced: false,
      locked: true,
      reason: "Service ticket is invoiced; billing packet was not changed.",
    };
  }

  const tripSnap = await adminFirestore
    .collection("trips")
    .where("link.serviceTicketId", "==", serviceTicketId)
    .get();

  const trips: TripDoc[] = tripSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));

  const nextBilling = buildBillingPacketFromResolvedTrips({
    trips,
    fallbackUpdatedAt: now,
  });

  if (!nextBilling) {
    return {
      resynced: false,
      reason: "No completed resolved trips found; billing packet not rebuilt.",
    };
  }

  await ticketRef.set(
    {
      billing: nextBilling,
      status: "completed",
      supplierMaterialImportStatus: "needs_review",
      supplierMaterialBillingResyncedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    resynced: true,
    reason: "Billing packet resynced from trip materials.",
    materialCount: nextBilling.materials.length,
  };
}