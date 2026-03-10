// app/api/trips/complete/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "../../../../src/lib/firebase-admin";
import { getPayrollWeekBounds } from "../../../../src/lib/payroll";

type CompleteTripBody = {
  tripId: string;
  mode: "resolved" | "follow_up"; // for now we generate timeEntries on resolved
  resolutionNotes?: string | null;
  followUpNotes?: string | null;
};

function toNumber(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function roundToQuarterHours(hours: number) {
  // 0.25 hour increments
  return Math.round(hours / 0.25) * 0.25;
}

function diffMs(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return 0;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, b - a);
}

function uniqStrings(arr: Array<string | null | undefined>) {
  return Array.from(new Set(arr.map((x) => (x || "").trim()).filter(Boolean)));
}

function laborRoleTypeForCrewSlot(slot: "primary" | "helper" | "secondaryTech" | "secondaryHelper") {
  // You can rename these later; keep consistent now.
  if (slot === "primary") return "lead_field";
  if (slot === "helper") return "helper_field";
  if (slot === "secondaryTech") return "secondary_field";
  return "secondary_helper_field";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CompleteTripBody;

    const tripId = String(body.tripId || "").trim();
    if (!tripId) {
      return NextResponse.json({ ok: false, error: "Missing tripId." }, { status: 400 });
    }

    const mode = body.mode;
    if (mode !== "resolved" && mode !== "follow_up") {
      return NextResponse.json({ ok: false, error: "Invalid mode." }, { status: 400 });
    }

    const db = adminDb();

    // Load trip
    const tripRef = db.collection("trips").doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });
    }

    const trip = tripSnap.data() as any;

    // Only service trips generate time entries right now
    const tripType = String(trip?.type || "");
    if (tripType !== "service") {
      return NextResponse.json(
        { ok: false, error: "Only service trips generate time entries in v1." },
        { status: 400 }
      );
    }

    const active = trip?.active !== false;
    if (!active) {
      return NextResponse.json({ ok: false, error: "Trip is inactive/cancelled." }, { status: 400 });
    }

    const tripDate = String(trip?.date || "").trim();
    if (!tripDate) {
      return NextResponse.json({ ok: false, error: "Trip is missing date." }, { status: 400 });
    }

    // Validate required fields for resolved
    const resolutionNotes = String(body.resolutionNotes || "").trim();
    if (mode === "resolved") {
      if (!resolutionNotes) {
        return NextResponse.json(
          { ok: false, error: "Resolution notes are required to resolve a trip." },
          { status: 400 }
        );
      }

      const materials = Array.isArray(trip?.materials) ? trip.materials : [];
      if (materials.length < 1) {
        return NextResponse.json(
          { ok: false, error: "At least 1 material line item is required to resolve a trip." },
          { status: 400 }
        );
      }
    }

    // Compute duration from timer fields on trip
    // Expected fields (based on what you implemented):
    // startedAt, endedAt, pausedMs (or totalPausedMs)
    const startedAt = trip?.startedAt || null;
    const endedAt = trip?.endedAt || null;

    const rawMs = diffMs(startedAt, endedAt);
    const pausedMs = toNumber(trip?.pausedMs ?? trip?.totalPausedMs ?? 0, 0);

    const billableMs = Math.max(0, rawMs - pausedMs);
    const hours = roundToQuarterHours(billableMs / (1000 * 60 * 60));

    if (mode === "resolved") {
      if (!startedAt || !endedAt) {
        return NextResponse.json(
          { ok: false, error: "Trip must be started and ended to resolve." },
          { status: 400 }
        );
      }
      if (hours <= 0) {
        return NextResponse.json(
          { ok: false, error: "Trip duration must be > 0 to resolve." },
          { status: 400 }
        );
      }
    }

    const link = trip?.link || {};
    const serviceTicketId = link?.serviceTicketId ? String(link.serviceTicketId) : null;

    // Determine crew members
    const crew = trip?.crew || {};
    const primaryTechUid = crew?.primaryTechUid ? String(crew.primaryTechUid) : "";
    const helperUid = crew?.helperUid ? String(crew.helperUid) : "";
    const secondaryTechUid = crew?.secondaryTechUid ? String(crew.secondaryTechUid) : "";
    const secondaryHelperUid = crew?.secondaryHelperUid ? String(crew.secondaryHelperUid) : "";

    const crewUids = uniqStrings([primaryTechUid, helperUid, secondaryTechUid, secondaryHelperUid]);

    if (mode === "resolved" && crewUids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Trip has no crew assigned; cannot generate time entries." },
        { status: 400 }
      );
    }

    // Idempotency:
    // We will create one timeEntry per crew member, keyed by (tripId + employeeId)
    // Query existing entries for this trip first.
    const existingSnap = await db
      .collection("timeEntries")
      .where("source", "==", "trip_completion")
      .where("tripId", "==", tripId)
      .get();

    const existingEmployeeIds = new Set<string>();
    existingSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const empId = String(data?.employeeId || "").trim();
      if (empId) existingEmployeeIds.add(empId);
    });

    const nowIso = new Date().toISOString();
    const { weekStartDate, weekEndDate } = getPayrollWeekBounds(tripDate);

    // Load user display info (names/roles) for crew
    // (This avoids blank names in time entries)
    const userDocs = await Promise.all(
      crewUids.map((uid) => db.collection("users").doc(uid).get())
    );

    const userMap = new Map<string, { displayName: string; role: string }>();
    for (const snap of userDocs) {
      if (!snap.exists) continue;
      const u = snap.data() as any;
      const uid = String(u?.uid || snap.id).trim();
      if (!uid) continue;
      userMap.set(uid, {
        displayName: String(u?.displayName || "Unknown User"),
        role: String(u?.role || "employee"),
      });
    }

    // Create missing timeEntries (resolved only)
    let createdCount = 0;

    if (mode === "resolved") {
      for (const uid of crewUids) {
        if (existingEmployeeIds.has(uid)) continue;

        const user = userMap.get(uid);
        const employeeName = user?.displayName || uid;
        const employeeRole = user?.role || "employee";

        // determine laborRoleType based on which slot they occupy on the trip
        let laborRoleType = "crew";
        if (uid === primaryTechUid) laborRoleType = laborRoleTypeForCrewSlot("primary");
        else if (uid === helperUid) laborRoleType = laborRoleTypeForCrewSlot("helper");
        else if (uid === secondaryTechUid) laborRoleType = laborRoleTypeForCrewSlot("secondaryTech");
        else if (uid === secondaryHelperUid) laborRoleType = laborRoleTypeForCrewSlot("secondaryHelper");

        await db.collection("timeEntries").add({
          employeeId: uid,
          employeeName,
          employeeRole,
          laborRoleType,

          entryDate: tripDate,
          weekStartDate,
          weekEndDate,

          category: "service_ticket",
          hours,
          payType: "regular",
          billable: true,

          source: "trip_completion",
          tripId,
          tripSourceKey: trip?.sourceKey || null,

          serviceTicketId: serviceTicketId,
          projectId: null,
          projectStageKey: null,

          linkedTechnicianId: primaryTechUid || null,
          linkedTechnicianName: crew?.primaryTechName || null,

          notes: `AUTO_TRIP:${tripId} • Resolved trip time`,
          timesheetId: null,

          entryStatus: "draft",

          createdAt: nowIso,
          updatedAt: nowIso,
        });

        createdCount += 1;
      }
    }

    // Update trip status + write notes into trip itself
    const nextTripStatus =
      mode === "resolved" ? "resolved_ready_to_bill" : "follow_up_needed";

    const updatePayload: any = {
      status: nextTripStatus,
      updatedAt: nowIso,
      // keep any existing notes but store resolution/followup separately (v1)
      resolutionNotes: mode === "resolved" ? resolutionNotes : null,
      followUpNotes: mode === "follow_up" ? String(body.followUpNotes || "").trim() || null : null,
    };

    await tripRef.update(updatePayload);

    // Optional: update parent ticket status
    if (serviceTicketId) {
      const ticketRef = db.collection("serviceTickets").doc(serviceTicketId);
      if (mode === "resolved") {
        await ticketRef.update({ status: "billing_review", updatedAt: nowIso });
      } else {
        await ticketRef.update({ status: "follow_up", updatedAt: nowIso });
      }
    }

    return NextResponse.json({
      ok: true,
      tripId,
      mode,
      tripStatus: nextTripStatus,
      createdTimeEntries: createdCount,
      hoursGenerated: mode === "resolved" ? hours : 0,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Trip completion failed." },
      { status: 500 }
    );
  }
}