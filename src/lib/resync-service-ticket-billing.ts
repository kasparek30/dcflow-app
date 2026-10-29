// src/lib/resync-service-ticket-billing.ts
// Rebuild automatic billable materials without discarding manually entered
// descriptions, existing billing amounts, or older material line items.
import { adminFirestore } from "./firebase-admin";

type TripMaterial = {
  id?: string;
  name?: string;
  qty?: number;
  unit?: string;
  notes?: string;
  imported?: boolean;
  source?: string;
  supplierLineKey?: string;
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
  manualMaterialsNotes?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
  if (notes) line = `${line} — ${notes}`;
  return line;
}

function buildMaterialsSummaryFromLines(materials?: TripMaterial[] | null) {
  return (Array.isArray(materials) ? materials : [])
    .map((m) => formatSingleMaterialLine(m))
    .filter(Boolean)
    .join(", ");
}

function mergeTripMaterials(trips: TripDoc[]) {
  return trips.flatMap((trip) => {
    const materials = (Array.isArray(trip.materials) ? trip.materials : [])
      .filter((item) => clean(item?.name));

    // New trip closeouts save a separate immutable-source technician text
    // field. Even if a future importer corrupts the combined materials array,
    // we can recover the technician lines for billing from that field.
    const rawManual = String(trip.manualMaterialsNotes || "");
    if (!rawManual.trim()) return materials;

    const manualCounts = new Map<string, number>();
    for (const item of materials) {
      if (item.imported || item.source === "supplier_invoice") continue;
      const key = String(item.name || "").trim();
      manualCounts.set(key, (manualCounts.get(key) || 0) + 1);
    }
    for (const rawLine of rawManual.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const remaining = manualCounts.get(line) || 0;
      if (remaining > 0) {
        manualCounts.set(line, remaining - 1);
      } else {
        materials.push({ name: line, qty: 1, source: "manual" });
      }
    }
    return materials;
  });
}

function materialIdentity(material: TripMaterial): string {
  const key = clean(material.supplierLineKey);
  if (key) return `supplier:${key}`;
  // Manual lines may be identical across visits. Counting rather than a Set
  // preserves legitimate duplicate quantities and repeated service visits.
  return JSON.stringify([
    clean(material.source),
    clean(material.name),
    Number(material.qty ?? 0),
    clean(material.unit),
    clean(material.notes),
    clean(material.id),
  ]);
}

// Retain any previous billing material rows that are no longer present in
// trips. We cannot assume that a missing line was intentionally deleted:
// older supplier imports could have overwritten the original technician rows.
function mergeWithoutDiscardingPrevious(
  current: TripMaterial[],
  previous: TripMaterial[],
) {
  const result = [...current];
  const counts = new Map<string, number>();
  for (const item of current) {
    const key = materialIdentity(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const oldItem of previous) {
    if (!clean(oldItem?.name)) continue;
    const key = materialIdentity(oldItem);
    const found = counts.get(key) || 0;
    if (found > 0) {
      counts.set(key, found - 1);
    } else {
      result.push(oldItem);
    }
  }
  return result;
}

function newlyAddedMaterials(before: TripMaterial[], after: TripMaterial[]) {
  const counts = new Map<string, number>();
  for (const item of before) {
    const key = materialIdentity(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return after.filter((item) => {
    const key = materialIdentity(item);
    const remaining = counts.get(key) || 0;
    if (remaining > 0) {
      counts.set(key, remaining - 1);
      return false;
    }
    return true;
  });
}

function getDefaultBillableHours(actualMinutes: number) {
  const safeMinutes = Math.max(0, Number(actualMinutes || 0));
  return Math.max(1, roundToHalf(safeMinutes / 60));
}

function getStoredOrComputedBillableHours(trip: TripDoc) {
  const stored = Number(trip.billableHours);
  if (Number.isFinite(stored) && stored > 0) return roundToHalf(stored);
  return getDefaultBillableHours(Number(trip.actualMinutes || 0));
}

function getTripSortTime(trip: TripDoc) {
  const candidates = [trip.readyToBillAt, trip.updatedAt, trip.date]
    .map((value) => Date.parse(String(value || "")));
  const valid = candidates.find((value) => Number.isFinite(value));
  return Number.isFinite(valid) ? Number(valid) : 0;
}

function buildBillingPacketFromResolvedTrips(args: {
  trips: TripDoc[];
  fallbackUpdatedAt: string;
  existingBilling: any;
}) {
  const completedTrips = args.trips.filter(
    (trip) => normalizeTripStatus(trip.status) === "complete",
  );
  const resolvedTrips = completedTrips.filter(
    (trip) => clean(trip.outcome).toLowerCase() === "resolved",
  );
  if (completedTrips.length === 0 || resolvedTrips.length === 0) return null;

  const totalHours = completedTrips.reduce(
    (sum, trip) => sum + getStoredOrComputedBillableHours(trip),
    0,
  );

  const existing = args.existingBilling && typeof args.existingBilling === "object"
    ? args.existingBilling
    : {};
  const previousMaterials: TripMaterial[] = Array.isArray(existing.materials)
    ? existing.materials
    : [];
  const materials = mergeWithoutDiscardingPrevious(
    mergeTripMaterials(completedTrips),
    previousMaterials,
  );

  const generatedBefore = buildMaterialsSummaryFromLines(previousMaterials);
  const generatedNow = buildMaterialsSummaryFromLines(materials);
  const previousSummary = String(existing.materialsSummary || "").trim();

  let materialsSummary = generatedNow || null;
  if (previousSummary && previousSummary !== generatedBefore) {
    // The summary was manually edited. Never replace it with OCR output.
    // Append only genuinely new material rows that have not yet appeared in
    // the prior billing material array.
    const additions = newlyAddedMaterials(previousMaterials, materials)
      .map(formatSingleMaterialLine)
      .filter((line) => line && !previousSummary.includes(line));
    materialsSummary = [previousSummary, ...additions].join(", ") || null;
  }

  const uniqueResolutionNotes = Array.from(new Set(
    resolvedTrips.map((trip) => clean(trip.resolutionNotes)).filter(Boolean),
  ));
  const uniqueWorkNotes = Array.from(new Set(
    completedTrips.map((trip) => clean(trip.workNotes)).filter(Boolean),
  ));
  const latestResolvedTrip = [...resolvedTrips].sort((a, b) => {
    const timeDiff = getTripSortTime(b) - getTripSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    const dateDiff = clean(b.date).localeCompare(clean(a.date));
    return dateDiff || clean(b.id).localeCompare(clean(a.id));
  })[0];

  return {
    ...existing,
    status: existing.status === "creating_invoice" || existing.status === "invoice_failed"
      ? existing.status
      : "ready_to_bill",
    readyToBillAt: existing.readyToBillAt || latestResolvedTrip.readyToBillAt ||
      latestResolvedTrip.updatedAt || args.fallbackUpdatedAt,
    readyToBillTripId: latestResolvedTrip.id,
    resolutionNotes: uniqueResolutionNotes.join("\n\n") || existing.resolutionNotes || null,
    workNotes: uniqueWorkNotes.join("\n\n") || existing.workNotes || null,
    labor: {
      ...(existing.labor || {}),
      totalHours: roundToHalf(totalHours),
    },
    materials,
    materialsSummary,
    // The office-entered dollar amount is never reset on supplier import.
    materialsAmount: typeof existing.materialsAmount === "number"
      ? existing.materialsAmount
      : null,
    photos: Array.isArray(existing.photos) ? existing.photos : [],
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

  const ticketRef = adminFirestore.collection("serviceTickets").doc(serviceTicketId);
  const tripsQuery = adminFirestore.collection("trips")
    .where("link.serviceTicketId", "==", serviceTicketId);

  return adminFirestore.runTransaction(async (tx) => {
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists) {
      return { resynced: false, reason: `Service ticket ${serviceTicketId} not found.` };
    }
    const ticket = ticketSnap.data() as any;
    const ticketStatus = clean(ticket.status).toLowerCase();
    if (ticketStatus === "invoiced" || ticketStatus === "cancelled") {
      return {
        resynced: false,
        locked: true,
        reason: "Service ticket is invoiced/cancelled; billing packet was not changed.",
      };
    }
    if (["new", "scheduled", "in_progress", "follow_up"].includes(ticketStatus)) {
      return {
        resynced: false,
        reason: "PO items are saved on the trip, but ticket is not ready for billing. Its lifecycle and notes were preserved.",
      };
    }
    if (clean(ticket.billing?.status).toLowerCase() === "creating_invoice") {
      return {
        resynced: false,
        locked: true,
        reason: "Invoice is being created; do not modify its materials while invoicing.",
      };
    }

    // Reading the trips and billing packet in one transaction avoids replacing
    // a newer manual closeout or billing edit with an old snapshot.
    const tripSnap = await tx.get(tripsQuery);
    const trips: TripDoc[] = tripSnap.docs.map((ds) => ({
      ...(ds.data() as any), id: ds.id,
    }));
    const now = new Date().toISOString();
    const nextBilling = buildBillingPacketFromResolvedTrips({
      trips,
      fallbackUpdatedAt: now,
      existingBilling: ticket.billing,
    });
    if (!nextBilling) {
      return {
        resynced: false,
        reason: "No completed resolved trips found; billing packet not rebuilt.",
      };
    }

    tx.update(ticketRef, {
      billing: nextBilling,
      // Do not reverse an intentional Completed -> Follow Up office correction.
      status: ticketStatus === "follow_up" ? "follow_up" : "completed",
      supplierMaterialImportStatus: "needs_review",
      supplierMaterialBillingResyncedAt: now,
      updatedAt: now,
    });
    return {
      resynced: true,
      reason: "Billing packet resynced without overwriting technician notes or office edits.",
      materialCount: nextBilling.materials.length,
    };
  });
}
