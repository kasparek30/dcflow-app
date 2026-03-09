// app/api/trips/sync/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "../../../../src/lib/firebase-admin";

type SyncBody = {
  daysBack?: number;     // default 30
  daysForward?: number;  // default 120
  actorUid?: string;     // optional, for auditing
};

type AnyDoc = Record<string, any>;

function isoLocalFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoLocalFromDate(d);
}

function eachIsoDayInclusive(startIso: string, endIso: string) {
  const out: string[] = [];
  const start = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  if (end < start) return out;

  const cur = new Date(start);
  while (cur <= end) {
    out.push(isoLocalFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function safeString(x: any) {
  return typeof x === "string" ? x : "";
}

function safeBool(x: any, fallback = true) {
  return typeof x === "boolean" ? x : fallback;
}

function asArray<T>(x: any): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function inIsoRange(iso: string, startIso: string, endIso: string) {
  // YYYY-MM-DD lexicographic compare works
  return iso >= startIso && iso <= endIso;
}

function inferTimeWindow(startTime?: string, endTime?: string) {
  const s = (startTime || "").trim();
  const e = (endTime || "").trim();

  if (s === "08:00" && e === "12:00") return { timeWindow: "am" as const, start: "08:00", end: "12:00" };
  if (s === "13:00" && e === "17:00") return { timeWindow: "pm" as const, start: "13:00", end: "17:00" };
  if (s === "08:00" && e === "17:00") return { timeWindow: "all_day" as const, start: "08:00", end: "17:00" };

  // If only date exists but times aren’t standard, treat as custom
  if (s || e) return { timeWindow: "custom" as const, start: s || undefined, end: e || undefined };

  // default for date-only scheduled items
  return { timeWindow: "all_day" as const, start: "08:00", end: "17:00" };
}

function buildServiceTripDoc(ticketId: string, t: AnyDoc, actorUid: string | null) {
  const date = safeString(t.scheduledDate);
  const { timeWindow, start, end } = inferTimeWindow(t.scheduledStartTime, t.scheduledEndTime);

  const primaryTechUid =
    safeString(t.primaryTechnicianId) ||
    safeString(t.assignedTechnicianId);

  const primaryTechName =
    safeString(t.primaryTechnicianName) ||
    safeString(t.assignedTechnicianName);

  const helperIds = asArray<string>(t.helperIds).filter(Boolean);
  const helperNames = asArray<string>(t.helperNames).filter(Boolean);

  const secondaryTechUid = safeString(t.secondaryTechnicianId);
  const secondaryTechName = safeString(t.secondaryTechnicianName);

  const crew = {
    primaryTechUid: primaryTechUid || "",
    primaryTechName: primaryTechName || undefined,

    helperUid: helperIds[0] || undefined,
    helperName: helperNames[0] || undefined,

    secondaryTechUid: secondaryTechUid || undefined,
    secondaryTechName: secondaryTechName || undefined,

    // v1: secondary helper optional future
    secondaryHelperUid: helperIds[1] || undefined,
    secondaryHelperName: helperNames[1] || undefined,
  };

  const sourceKey = `serviceTicket:${ticketId}:${date}:${timeWindow}`;

  return {
    type: "service",
    status: "planned",

    date,
    timeWindow,

    startTime: start ?? null,
    endTime: end ?? null,

    crew: {
      primaryTechUid: crew.primaryTechUid,
      primaryTechName: crew.primaryTechName ?? null,

      helperUid: crew.helperUid ?? null,
      helperName: crew.helperName ?? null,

      secondaryTechUid: crew.secondaryTechUid ?? null,
      secondaryTechName: crew.secondaryTechName ?? null,

      secondaryHelperUid: crew.secondaryHelperUid ?? null,
      secondaryHelperName: crew.secondaryHelperName ?? null,
    },

    link: {
      serviceTicketId: ticketId,
      projectId: null,
      projectStageKey: null,
    },

    sourceKey,

    notes: null,
    cancelReason: null,

    active: true,

    updatedAt: new Date().toISOString(),
    updatedByUid: actorUid ?? null,
  };
}

function buildProjectTripDoc(
  projectId: string,
  stageKey: string,
  date: string,
  stage: AnyDoc,
  project: AnyDoc,
  actorUid: string | null
) {
  // stage staffing override wins, otherwise project-level fields
  const staffing = (stage && typeof stage.staffing === "object" && stage.staffing) ? stage.staffing : null;

  const primaryTechUid =
    safeString(staffing?.primaryTechnicianId) ||
    safeString(project.primaryTechnicianId) ||
    safeString(project.assignedTechnicianId);

  const primaryTechName =
    safeString(staffing?.primaryTechnicianName) ||
    safeString(project.primaryTechnicianName) ||
    safeString(project.assignedTechnicianName);

  const secondaryTechUid =
    safeString(staffing?.secondaryTechnicianId) ||
    safeString(project.secondaryTechnicianId);

  const secondaryTechName =
    safeString(staffing?.secondaryTechnicianName) ||
    safeString(project.secondaryTechnicianName);

  const helperIds =
    asArray<string>(staffing?.helperIds).filter(Boolean).length > 0
      ? asArray<string>(staffing?.helperIds).filter(Boolean)
      : asArray<string>(project.helperIds).filter(Boolean);

  const helperNames =
    asArray<string>(staffing?.helperNames).filter(Boolean).length > 0
      ? asArray<string>(staffing?.helperNames).filter(Boolean)
      : asArray<string>(project.helperNames).filter(Boolean);

  const crew = {
    primaryTechUid: primaryTechUid || "",
    primaryTechName: primaryTechName || undefined,

    helperUid: helperIds[0] || undefined,
    helperName: helperNames[0] || undefined,

    secondaryTechUid: secondaryTechUid || undefined,
    secondaryTechName: secondaryTechName || undefined,

    secondaryHelperUid: helperIds[1] || undefined,
    secondaryHelperName: helperNames[1] || undefined,
  };

  const sourceKey = `project:${projectId}:${stageKey}:${date}`;

  return {
    type: "project",
    status: "planned",

    date,
    timeWindow: "all_day",

    startTime: "08:00",
    endTime: "17:00",

    crew: {
      primaryTechUid: crew.primaryTechUid,
      primaryTechName: crew.primaryTechName ?? null,

      helperUid: crew.helperUid ?? null,
      helperName: crew.helperName ?? null,

      secondaryTechUid: crew.secondaryTechUid ?? null,
      secondaryTechName: crew.secondaryTechName ?? null,

      secondaryHelperUid: crew.secondaryHelperUid ?? null,
      secondaryHelperName: crew.secondaryHelperName ?? null,
    },

    link: {
      serviceTicketId: null,
      projectId,
      projectStageKey: stageKey,
    },

    sourceKey,

    notes: null,
    cancelReason: null,

    active: true,

    updatedAt: new Date().toISOString(),
    updatedByUid: actorUid ?? null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as SyncBody;

    const daysBack = Number.isFinite(body.daysBack as number) ? Number(body.daysBack) : 30;
    const daysForward = Number.isFinite(body.daysForward as number) ? Number(body.daysForward) : 120;

    const actorUid = (body.actorUid && String(body.actorUid).trim()) ? String(body.actorUid).trim() : null;

    const todayIso = isoLocalFromDate(new Date());
    const rangeStart = addDays(todayIso, -Math.max(0, daysBack));
    const rangeEnd = addDays(todayIso, Math.max(0, daysForward));

    const db = adminDb();

    // For v1, we read full collections and filter in memory (simple + reliable).
    // If you want to optimize later, we can add indexed queries.
    const [ticketsSnap, projectsSnap] = await Promise.all([
      db.collection("serviceTickets").get(),
      db.collection("projects").get(),
    ]);

    const nowIso = new Date().toISOString();

    // Build up trip writes (batch)
    let batch = db.batch();
    let batchCount = 0;
    let createdOrUpdated = 0;

    const samples: any[] = [];

    // --------------------------
    // SERVICE TICKETS -> TRIPS
    // --------------------------
    for (const doc of ticketsSnap.docs) {
      const t = doc.data() as AnyDoc;

      // Must have scheduledDate to become a trip
      const scheduledDate = safeString(t.scheduledDate);
      if (!scheduledDate) continue;

      // Only within sync window
      if (!inIsoRange(scheduledDate, rangeStart, rangeEnd)) continue;

      // Optional: only create trips for tickets that are not cancelled
      const status = safeString(t.status);
      if (status === "cancelled") continue;

      const { timeWindow } = inferTimeWindow(t.scheduledStartTime, t.scheduledEndTime);

      const tripId = `svc_${doc.id}_${scheduledDate}_${timeWindow}`; // deterministic doc id
      const ref = db.collection("trips").doc(tripId);

      const payload = buildServiceTripDoc(doc.id, t, actorUid);

      // only set createdAt/createdByUid if doc is new (merge won’t overwrite if it exists unless set)
      batch.set(
        ref,
        {
          ...payload,
          createdAt: nowIso,
          createdByUid: actorUid ?? null,
        },
        { merge: true }
      );

      createdOrUpdated += 1;
      batchCount += 1;

      if (samples.length < 8) {
        samples.push({ tripId, sourceKey: payload.sourceKey, date: scheduledDate, type: "service" });
      }

      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // --------------------------
    // PROJECT STAGES -> TRIPS
    // --------------------------
    for (const doc of projectsSnap.docs) {
      const p = doc.data() as AnyDoc;

      const stages: Array<{ key: string; stage: AnyDoc }> = [
        { key: "roughIn", stage: p.roughIn || {} },
        { key: "topOutVent", stage: p.topOutVent || {} },
        { key: "trimFinish", stage: p.trimFinish || {} },
      ];

      for (const entry of stages) {
        const startIso = safeString(entry.stage?.scheduledDate);
        if (!startIso) continue;

        const endIso = safeString(entry.stage?.scheduledEndDate) || startIso;

        // Skip if entire stage range is outside our sync window
        if (endIso < rangeStart || startIso > rangeEnd) continue;

        // Generate trips for overlap days in window
        const days = eachIsoDayInclusive(startIso, endIso).filter((d) => inIsoRange(d, rangeStart, rangeEnd));

        for (const dayIso of days) {
          const tripId = `proj_${doc.id}_${entry.key}_${dayIso}`;
          const ref = db.collection("trips").doc(tripId);

          const payload = buildProjectTripDoc(doc.id, entry.key, dayIso, entry.stage, p, actorUid);

          batch.set(
            ref,
            {
              ...payload,
              createdAt: nowIso,
              createdByUid: actorUid ?? null,
            },
            { merge: true }
          );

          createdOrUpdated += 1;
          batchCount += 1;

          if (samples.length < 8) {
            samples.push({ tripId, sourceKey: payload.sourceKey, date: dayIso, type: "project", stageKey: entry.key });
          }

          if (batchCount >= 450) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      message: "Trips sync complete.",
      range: { start: rangeStart, end: rangeEnd },
      createdOrUpdated,
      samples,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Trips sync failed." },
      { status: 500 }
    );
  }
}