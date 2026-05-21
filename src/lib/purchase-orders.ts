// src/lib/purchase-orders.ts
import { doc, runTransaction, type Firestore } from "firebase/firestore";

export type PurchaseOrderStatus = "open" | "matched" | "cancelled" | "closed";

export type PurchaseOrderSourceType = "service_ticket" | "project";

export type PurchaseOrderRecord = {
  poCode: string;
  poIndex: number;
  poSuffix: string;
  status: PurchaseOrderStatus;

  sourceType: PurchaseOrderSourceType;

  serviceTicketId: string | null;
  projectId: string | null;
  projectType: string | null;
  projectStageKey: string | null;

  tripId: string;

  billingPeriodId: string | null;
  billingPeriodSequence: number | null;
  billingPeriodLabel: string | null;
  billingPeriodStatus: string | null;

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

export function formatBidProjectCode(projectNumber: number) {
  return `P${padTicketNumber(projectNumber)}`;
}

export function formatTimeMaterialsProjectCode(projectNumber: number) {
  return `T${padTicketNumber(projectNumber)}`;
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

function readUpper(value: unknown) {
  return readString(value).toUpperCase();
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

function isProjectTripType(value: unknown) {
  return readLower(value) === "project";
}

function isServiceTripType(value: unknown) {
  return readLower(value) === "service";
}

function isTimeMaterialsProjectType(value: unknown) {
  const valueLower = readLower(value);
  return (
    valueLower === "time_materials" ||
    valueLower === "time+materials" ||
    valueLower === "time_and_materials" ||
    valueLower === "time materials"
  );
}

function isBidProjectType(value: unknown) {
  const valueLower = readLower(value);
  return valueLower === "new_construction" || valueLower === "remodel";
}

function getProjectPoCounterDocId(projectType: string) {
  return isTimeMaterialsProjectType(projectType)
    ? "timeMaterialsProjectPurchaseOrders"
    : "bidProjectPurchaseOrders";
}

function getProjectBaseCode(args: {
  projectType: string;
  projectNumber: number;
}) {
  if (isTimeMaterialsProjectType(args.projectType)) {
    return formatTimeMaterialsProjectCode(args.projectNumber);
  }

  return formatBidProjectCode(args.projectNumber);
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
  const serviceCounterRef = doc(args.db, "systemCounters", "serviceTickets");

  return runTransaction(args.db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error("Trip not found.");

    const trip = tripSnap.data() as FirestoreData;

    const tripType = readLower(trip.type);

    if (isProjectTripType(tripType)) {
      throw new Error("Use generatePurchaseOrderForProjectTrip for project trips.");
    }

    if (!isServiceTripType(tripType)) {
      throw new Error("PO numbers can only be generated for service or project trips.");
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
    const existingTicketCode = readUpper(ticket.ticketCode);

    let counterSnap = null as Awaited<ReturnType<typeof tx.get>> | null;

    if (!existingTicketNumber || existingTicketNumber <= 0 || !existingTicketCode) {
      counterSnap = await tx.get(serviceCounterRef);
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
      projectId: null,
      projectType: null,
      projectStageKey: null,

      tripId,

      billingPeriodId: null,
      billingPeriodSequence: null,
      billingPeriodLabel: null,
      billingPeriodStatus: null,

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

    if (!existingTicketNumber || existingTicketNumber <= 0 || !existingTicketCode) {
      tx.set(
        serviceCounterRef,
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

export async function generatePurchaseOrderForProjectTrip(args: {
  db: Firestore;
  tripId: string;
  requestedByUid?: string | null;
  requestedByName?: string | null;
}) {
  const tripId = readString(args.tripId);
  if (!tripId) throw new Error("Missing trip ID.");

  const tripRef = doc(args.db, "trips", tripId);

  return runTransaction(args.db, async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists()) throw new Error("Trip not found.");

    const trip = tripSnap.data() as FirestoreData;

    if (!isProjectTripType(trip.type)) {
      throw new Error("Project PO numbers can only be generated for project trips.");
    }

    const tripStatus = readLower(trip.status);
    if (tripStatus === "complete" || tripStatus === "completed" || tripStatus === "cancelled") {
      throw new Error("PO numbers cannot be generated for completed or cancelled trips.");
    }

    const projectId = readNestedString(trip, ["link", "projectId"]);
    if (!projectId) throw new Error("This project trip is not linked to a project.");

    const projectRef = doc(args.db, "projects", projectId);
    const projectSnap = await tx.get(projectRef);
    if (!projectSnap.exists()) throw new Error("Linked project not found.");

    const project = projectSnap.data() as FirestoreData;
    const projectType = readLower(project.projectType || "other");

    if (!isTimeMaterialsProjectType(projectType) && !isBidProjectType(projectType)) {
      throw new Error(
        "Project POs are currently supported for New Construction, Remodel, and Time + Materials projects."
      );
    }

    const projectOfficeStatus = readLower(project.projectOfficeStatus);
    if (projectOfficeStatus === "invoiced" || projectOfficeStatus === "closed") {
      throw new Error("PO numbers cannot be generated for invoiced or closed projects.");
    }

    const counterRef = doc(
      args.db,
      "systemCounters",
      getProjectPoCounterDocId(projectType)
    );

    const existingProjectPoNumber = readNumber(project.projectPoNumber, 0);
    const existingProjectPoCode = readUpper(project.projectPoCode);

    let counterSnap = null as Awaited<ReturnType<typeof tx.get>> | null;

    if (
      !existingProjectPoNumber ||
      existingProjectPoNumber <= 0 ||
      !existingProjectPoCode
    ) {
      counterSnap = await tx.get(counterRef);
    }

    const stamp = nowIso();

    let projectPoNumber = existingProjectPoNumber;
    let projectPoCode = existingProjectPoCode;

    if (
      !Number.isFinite(projectPoNumber) ||
      projectPoNumber <= 0 ||
      !projectPoCode
    ) {
      const counterData = counterSnap?.exists()
        ? (counterSnap.data() as FirestoreData)
        : {};

      const current = readNumber(counterData.nextNumber, 1);
      projectPoNumber = Number.isFinite(current) && current > 0 ? Math.floor(current) : 1;
      projectPoCode = getProjectBaseCode({
        projectType,
        projectNumber: projectPoNumber,
      });
    }

    const nextPoIndex = Number.isFinite(readNumber(project.nextPoIndex, 0))
      ? Math.max(0, readNumber(project.nextPoIndex, 0))
      : 0;

    const poSuffix = getNextPoSuffix(nextPoIndex);
    const poCode = `${projectPoCode}${poSuffix}`.toUpperCase();
    const poRef = doc(args.db, "purchaseOrders", poCode);

    const existingPoSnap = await tx.get(poRef);

    if (existingPoSnap.exists()) {
      throw new Error(`PO ${poCode} already exists. Try again.`);
    }

    const projectStageKey = readNestedString(trip, ["link", "projectStageKey"]);

    const record: PurchaseOrderRecord = {
      poCode,
      poIndex: nextPoIndex,
      poSuffix,
      status: "open",

      sourceType: "project",

      serviceTicketId: null,
      projectId,
      projectType,
      projectStageKey: projectStageKey || null,

      tripId,

      billingPeriodId: readString(trip.billingPeriodId) || null,
      billingPeriodSequence:
        Number.isFinite(readNumber(trip.billingPeriodSequence, NaN))
          ? readNumber(trip.billingPeriodSequence, NaN)
          : null,
      billingPeriodLabel: readString(trip.billingPeriodLabel) || null,
      billingPeriodStatus: readString(trip.billingPeriodStatus) || null,

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

    if (
      !existingProjectPoNumber ||
      existingProjectPoNumber <= 0 ||
      !existingProjectPoCode
    ) {
      tx.set(
        counterRef,
        {
          nextNumber: projectPoNumber + 1,
          updatedAt: stamp,
        },
        { merge: true }
      );
    }

    tx.set(poRef, record);

    tx.set(
      projectRef,
      {
        projectPoNumber,
        projectPoCode,
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
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists()) throw new Error("Service ticket not found.");

    const ticket = ticketSnap.data() as FirestoreData;
    const existingNumber = readNumber(ticket.ticketNumber, 0);
    const existingCode = readUpper(ticket.ticketCode);

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