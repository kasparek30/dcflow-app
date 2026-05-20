// src/lib/purchase-orders.ts
import { doc, runTransaction, type Firestore } from "firebase/firestore";

export type PurchaseOrderStatus = "open" | "matched" | "cancelled" | "closed";

export type PurchaseOrderRecord = {
  poCode: string;
  poIndex: number;
  poSuffix: string;
  status: PurchaseOrderStatus;
  serviceTicketId: string;
  tripId: string;
  sourceType: "service_ticket";
  requestedByUid: string | null;
  requestedByName: string | null;
  createdAt: string;
  updatedAt: string;
  vendorName: string | null;
  notes: string | null;
  matchedInvoiceId: string | null;
  matchedAttachmentIds: string[];
  invoiceEmailMessageId: string | null;
};

type FirestoreData = Record<string, unknown>;

const PO_SUFFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function nowIso() {
  return new Date().toISOString();
}

function padTicketNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "000";
  return String(Math.floor(value)).padStart(3, "0");
}

export function formatServiceTicketCode(ticketNumber: number) {
  return `S${padTicketNumber(ticketNumber)}`;
}

function getNextPoSuffix(index: number) {
  const safeIndex = Number.isFinite(index) ? Math.floor(index) : 0;

  if (safeIndex >= 0 && safeIndex < PO_SUFFIXES.length) {
    return PO_SUFFIXES[safeIndex];
  }

  const first = Math.floor(safeIndex / PO_SUFFIXES.length) - 1;
  const second = safeIndex % PO_SUFFIXES.length;

  return `${PO_SUFFIXES[Math.max(0, first) % PO_SUFFIXES.length]}${PO_SUFFIXES[second]}`;
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}

function readLower(value: unknown) {
  return readString(value).toLowerCase();
}

function readNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readNestedString(data: FirestoreData, path: string[]) {
  let current: unknown = data;

  for (const key of path) {
    if (!current || typeof current !== "object") return "";
    current = (current as FirestoreData)[key];
  }

  return readString(current);
}

export async function reserveNextServiceTicketNumber(db: Firestore) {
  const counterRef = doc(db, "systemCounters", "serviceTickets");

  return runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);

    const counterData = counterSnap.exists()
      ? (counterSnap.data() as FirestoreData)
      : {};

    const current = readNumber(counterData.nextNumber, 1);
    const nextTicketNumber =
      Number.isFinite(current) && current > 0 ? Math.floor(current) : 1;

    const nextCounterValue = nextTicketNumber + 1;
    const stamp = nowIso();

    tx.set(
      counterRef,
      {
        nextNumber: nextCounterValue,
        updatedAt: stamp,
      },
      { merge: true }
    );

    return {
      ticketNumber: nextTicketNumber,
      ticketCode: formatServiceTicketCode(nextTicketNumber),
    };
  });
}

export async function generatePurchaseOrderForTrip(args: {
  db: Firestore;
  tripId: string;
  requestedByUid?: string | null;
  requestedByName?: string | null;
}) {
  const tripId = readString(args.tripId);
  if (!tripId) throw new Error("Missing trip ID.");

  const tripRef = doc(args.db, "trips", tripId);
  const counterRef = doc(args.db, "systemCounters", "serviceTickets");

  return runTransaction(args.db, async (tx) => {
    // ✅ ALL READS FIRST
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error("Trip not found.");

    const trip = tripSnap.data() as FirestoreData;

    const tripType = readLower(trip.type);
    if (tripType !== "service") {
      throw new Error("PO numbers can only be generated for service trips right now.");
    }

    const tripStatus = readLower(trip.status);
    if (tripStatus === "complete" || tripStatus === "completed" || tripStatus === "cancelled") {
      throw new Error("PO numbers cannot be generated for completed or cancelled trips.");
    }

    const serviceTicketId = readNestedString(trip, ["link", "serviceTicketId"]);
    if (!serviceTicketId) throw new Error("This service trip is not linked to a service ticket.");

    const ticketRef = doc(args.db, "serviceTickets", serviceTicketId);
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists()) throw new Error("Linked service ticket not found.");

    const ticket = ticketSnap.data() as FirestoreData;

    const existingTicketNumber = readNumber(ticket.ticketNumber, 0);
    const existingTicketCode = readString(ticket.ticketCode).toUpperCase();

    let counterSnap = null as Awaited<ReturnType<typeof tx.get>> | null;

    if (!existingTicketNumber || existingTicketNumber <= 0 || !existingTicketCode) {
      counterSnap = await tx.get(counterRef);
    }

    const stamp = nowIso();

    let ticketNumber = existingTicketNumber;
    let ticketCode = existingTicketCode;

    if (!Number.isFinite(ticketNumber) || ticketNumber <= 0 || !ticketCode) {
      const counterData = counterSnap?.exists()
        ? (counterSnap.data() as FirestoreData)
        : {};

      const current = readNumber(counterData.nextNumber, 1);
      ticketNumber = Number.isFinite(current) && current > 0 ? Math.floor(current) : 1;
      ticketCode = formatServiceTicketCode(ticketNumber);
    }

    const nextPoIndex = Number.isFinite(readNumber(ticket.nextPoIndex, 0))
      ? Math.max(0, readNumber(ticket.nextPoIndex, 0))
      : 0;

    const poSuffix = getNextPoSuffix(nextPoIndex);
    const poCode = `${ticketCode}${poSuffix}`.toUpperCase();
    const poRef = doc(args.db, "purchaseOrders", poCode);

    // ✅ This read must happen BEFORE any tx.set / tx.update.
    const existingPoSnap = await tx.get(poRef);

    if (existingPoSnap.exists()) {
      throw new Error(`PO ${poCode} already exists. Try again.`);
    }

    const record: PurchaseOrderRecord = {
      poCode,
      poIndex: nextPoIndex,
      poSuffix,
      status: "open",
      sourceType: "service_ticket",
      serviceTicketId,
      tripId,
      requestedByUid: args.requestedByUid || null,
      requestedByName: args.requestedByName || null,
      createdAt: stamp,
      updatedAt: stamp,
      vendorName: null,
      notes: null,
      matchedInvoiceId: null,
      matchedAttachmentIds: [],
      invoiceEmailMessageId: null,
    };

    // ✅ WRITES ONLY AFTER ALL READS ABOVE
    if (!existingTicketNumber || existingTicketNumber <= 0 || !existingTicketCode) {
      tx.set(
        counterRef,
        {
          nextNumber: ticketNumber + 1,
          updatedAt: stamp,
        },
        { merge: true }
      );
    }

    tx.set(poRef, record);

    tx.set(
      ticketRef,
      {
        ticketNumber,
        ticketCode,
        nextPoIndex: nextPoIndex + 1,
        updatedAt: stamp,
      },
      { merge: true }
    );

    tx.set(
      tripRef,
      {
        updatedAt: stamp,
        updatedByUid: args.requestedByUid || null,
      },
      { merge: true }
    );

    return record;
  });
}

export async function ensureServiceTicketNumber(args: {
  db: Firestore;
  serviceTicketId: string;
}) {
  const serviceTicketId = readString(args.serviceTicketId);
  if (!serviceTicketId) throw new Error("Missing service ticket ID.");

  const ticketRef = doc(args.db, "serviceTickets", serviceTicketId);
  const counterRef = doc(args.db, "systemCounters", "serviceTickets");

  return runTransaction(args.db, async (tx) => {
    // ✅ ALL READS FIRST
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists()) throw new Error("Service ticket not found.");

    const ticket = ticketSnap.data() as FirestoreData;
    const existingNumber = readNumber(ticket.ticketNumber, 0);
    const existingCode = readString(ticket.ticketCode).toUpperCase();

    if (Number.isFinite(existingNumber) && existingNumber > 0 && existingCode) {
      return {
        ticketNumber: existingNumber,
        ticketCode: existingCode,
      };
    }

    const counterSnap = await tx.get(counterRef);
    const counterData = counterSnap.exists()
      ? (counterSnap.data() as FirestoreData)
      : {};

    const current = readNumber(counterData.nextNumber, 1);
    const ticketNumber = Number.isFinite(current) && current > 0 ? Math.floor(current) : 1;
    const ticketCode = formatServiceTicketCode(ticketNumber);
    const stamp = nowIso();

    const existingNextPoIndex = readNumber(ticket.nextPoIndex, 0);

    // ✅ WRITES ONLY AFTER ALL READS ABOVE
    tx.set(
      counterRef,
      {
        nextNumber: ticketNumber + 1,
        updatedAt: stamp,
      },
      { merge: true }
    );

    tx.set(
      ticketRef,
      {
        ticketNumber,
        ticketCode,
        nextPoIndex: Number.isFinite(existingNextPoIndex)
          ? Math.max(0, existingNextPoIndex)
          : 0,
        updatedAt: stamp,
      },
      { merge: true }
    );

    return {
      ticketNumber,
      ticketCode,
    };
  });
}