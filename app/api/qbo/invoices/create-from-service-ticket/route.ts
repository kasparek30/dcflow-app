import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../_lib";
import { adminDb } from "../../admin-db";

/**
 * ✅ CONFIG (matches your screenshot)
 */
const QBO_LABOR_ITEM_NAME = "Labor N/T";
const QBO_MATERIALS_ITEM_NAME = "Materials:Materials"; // optional, see USE_MATERIALS_ITEM
const USE_MATERIALS_ITEM = false; // keep false = description-only lines (recommended v1)

type TripMaterial = {
  name: string;
  qty: number;
  unit?: string;
  notes?: string;
};

type QboItem = {
  Id?: string;
  Name?: string;
  Active?: boolean;
  UnitPrice?: number;
  SalesPrice?: number;
};

function asArray<T>(x: unknown): T[] {
  if (!x) return [];
  return Array.isArray(x) ? (x as T[]) : [x as T];
}

function roundToQuarter(hours: number) {
  return Math.round(hours * 4) / 4;
}

function safeNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function buildMaterialsDescription(m: TripMaterial) {
  const qty = safeNumber(m.qty, 1);
  const unit = (m.unit || "").trim();
  const notes = (m.notes || "").trim();

  let line = `• ${m.name} — Qty: ${qty}${unit ? ` ${unit}` : ""}`;
  if (notes) line += ` (${notes})`;
  return line;
}

async function qboQuery(realmId: string, queryStr: string) {
  const base = getQboApiBaseUrl();
  const q = encodeURIComponent(queryStr);
  const url = `${base}/v3/company/${realmId}/query?query=${q}`;
  return qboFetchWithAutoRefresh(url);
}

async function findQboItemByName(realmId: string, nameExact: string) {
  const escaped = nameExact.replace(/"/g, '\\"');

  // exact match
  {
    const { res, body } = await qboQuery(
      realmId,
      `select * from Item where Name = "${escaped}" maxresults 10`
    );
    if (res.ok) {
      const items = asArray<QboItem>(body?.QueryResponse?.Item).filter(
        (i) => (i?.Active ?? true) && String(i?.Id || "").trim()
      );
      if (items.length) return items[0];
    }
  }

  // contains match fallback
  {
    const { res, body } = await qboQuery(
      realmId,
      `select * from Item where Name LIKE "%${escaped}%" maxresults 10`
    );
    if (res.ok) {
      const items = asArray<QboItem>(body?.QueryResponse?.Item).filter(
        (i) => (i?.Active ?? true) && String(i?.Id || "").trim()
      );
      const lowered = nameExact.toLowerCase();
      items.sort((a, b) => {
        const an = String(a.Name || "").toLowerCase();
        const bn = String(b.Name || "").toLowerCase();
        const aScore = an === lowered ? 0 : an.includes(lowered) ? 1 : 2;
        const bScore = bn === lowered ? 0 : bn.includes(lowered) ? 1 : 2;
        return aScore - bScore;
      });
      if (items.length) return items[0];
    }
  }

  return null;
}

async function getLaborItemAndRate(realmId: string) {
  const laborItem = await findQboItemByName(realmId, QBO_LABOR_ITEM_NAME);
  if (!laborItem?.Id) {
    throw new Error(
      `Could not find QBO Item named "${QBO_LABOR_ITEM_NAME}". Check Products/Services in QBO.`
    );
  }

  const unitPrice =
    typeof laborItem.UnitPrice === "number"
      ? laborItem.UnitPrice
      : typeof laborItem.SalesPrice === "number"
        ? laborItem.SalesPrice
        : null;

  if (!unitPrice || unitPrice <= 0) {
    throw new Error(
      `QBO "${QBO_LABOR_ITEM_NAME}" item found (Id: ${laborItem.Id}) but no usable UnitPrice/SalesPrice. Please set its sales price in QBO.`
    );
  }

  return {
    laborItemId: String(laborItem.Id),
    laborItemName: laborItem.Name || QBO_LABOR_ITEM_NAME,
    laborUnitPrice: unitPrice,
  };
}

async function getMaterialsItem(realmId: string) {
  const matItem = await findQboItemByName(realmId, QBO_MATERIALS_ITEM_NAME);
  if (!matItem?.Id) return null;
  return { id: String(matItem.Id), name: matItem.Name || QBO_MATERIALS_ITEM_NAME };
}

export async function POST(req: Request) {
  try {
    const { realmId } = await getQboCookieValues();
    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const serviceTicketId = String(body?.serviceTicketId || "").trim();
    if (!serviceTicketId) {
      return NextResponse.json(
        { error: "Missing required field: serviceTicketId" },
        { status: 400 }
      );
    }

    const db = adminDb();

    // 1) Load service ticket
    const ticketRef = db.collection("serviceTickets").doc(serviceTicketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      return NextResponse.json({ error: "Service ticket not found." }, { status: 404 });
    }
    const ticket = ticketSnap.data() || {};

    const billing = (ticket.billing || {}) as any;
    const billingStatus = String(billing.status || "").trim();

    if (billingStatus !== "ready_to_bill") {
      return NextResponse.json(
        {
          error: `Ticket billing status must be "ready_to_bill". Current: ${billingStatus || "unset"}`,
        },
        { status: 400 }
      );
    }

    const resolutionNotes = String(billing.resolutionNotes || "").trim();
    if (!resolutionNotes) {
      return NextResponse.json(
        { error: "Billing resolutionNotes is required before invoicing." },
        { status: 400 }
      );
    }

    const readyTripId = String(billing.readyToBillTripId || "").trim();
    if (!readyTripId) {
      return NextResponse.json(
        { error: "billing.readyToBillTripId missing. Set Ready to Bill from a completed trip first." },
        { status: 400 }
      );
    }

    const customerId = String(ticket.customerId || "").trim();
    if (!customerId) {
      return NextResponse.json(
        { error: "Ticket is missing customerId." },
        { status: 400 }
      );
    }

    // 2) Load customer + qboCustomerId
    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    const customer = customerSnap.data() || {};
    const qboCustomerId = String(customer.qboCustomerId || "").trim();
    if (!qboCustomerId) {
      return NextResponse.json(
        { error: "Customer is missing qboCustomerId. (Import/link QBO customers first.)" },
        { status: 400 }
      );
    }

    // 3) Load the completed trip
    const tripRef = db.collection("trips").doc(readyTripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      return NextResponse.json({ error: "Ready-to-bill trip not found." }, { status: 404 });
    }
    const trip = tripSnap.data() || {};

    const actualMinutes = safeNumber(trip.actualMinutes, 0);
    if (actualMinutes <= 0) {
      return NextResponse.json(
        { error: "Trip has 0 actualMinutes. Cannot invoice labor hours." },
        { status: 400 }
      );
    }

    const hours = roundToQuarter(actualMinutes / 60);
    if (hours <= 0) {
      return NextResponse.json(
        { error: "Trip hours rounded to 0. Cannot invoice." },
        { status: 400 }
      );
    }

    // 4) Pull labor item + current rate from QBO (Labor N/T)
    const { laborItemId, laborItemName, laborUnitPrice } = await getLaborItemAndRate(realmId);

    // 5) Build invoice lines
    const laborAmount = Number((hours * laborUnitPrice).toFixed(2));

    const laborLine = {
      DetailType: "SalesItemLineDetail",
      Amount: laborAmount,
      Description: `Labor (${hours} hr) — ${resolutionNotes}`,
      SalesItemLineDetail: {
        ItemRef: { value: laborItemId, name: laborItemName },
        Qty: hours,
        UnitPrice: laborUnitPrice,
      },
    };

    const materials: TripMaterial[] = Array.isArray(billing.materials) ? billing.materials : [];
    const cleanedMaterials = materials
      .filter((m) => m && String(m.name || "").trim())
      .map((m) => ({
        name: String(m.name || "").trim(),
        qty: safeNumber(m.qty, 1),
        unit: String(m.unit || ""),
        notes: String(m.notes || ""),
      }));

    let materialLines: any[] = [];
    if (cleanedMaterials.length > 0) {
      if (USE_MATERIALS_ITEM) {
        // Optional alternative: attach a single "Materials:Materials" line and put the list in description
        const matItem = await getMaterialsItem(realmId);
        if (!matItem) {
          throw new Error(
            `USE_MATERIALS_ITEM=true but could not find QBO Item "${QBO_MATERIALS_ITEM_NAME}".`
          );
        }

        const desc = ["Materials Used:", ...cleanedMaterials.map(buildMaterialsDescription)].join("\n");

        materialLines = [
          {
            DetailType: "SalesItemLineDetail",
            Amount: 0, // you said you don't need pricing here (v1)
            Description: desc,
            SalesItemLineDetail: {
              ItemRef: { value: matItem.id, name: matItem.name },
              Qty: 1,
              UnitPrice: 0,
            },
          },
        ];
      } else {
        // Recommended v1: description-only lines (very clean, no pricing assumptions)
        materialLines = [
          { DetailType: "DescriptionOnly", Description: "Materials Used:" },
          ...cleanedMaterials.map((m) => ({
            DetailType: "DescriptionOnly",
            Description: buildMaterialsDescription(m),
          })),
        ];
      }
    }

    const invoicePayload = {
      CustomerRef: { value: qboCustomerId },
      PrivateNote: `DCFlow Ticket ${serviceTicketId} • Trip ${readyTripId}`,
      Line: [laborLine, ...materialLines],
    };

    // 6) Create invoice in QBO
    const base = getQboApiBaseUrl();
    const url = `${base}/v3/company/${realmId}/invoice`;

    const { res, body: qboBody, intuitTid, attempt } = await qboFetchWithAutoRefresh(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoicePayload),
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "QBO invoice create failed.",
          status: res.status,
          intuit_tid: intuitTid || "",
          attempt: attempt || "original",
          qboBody,
          payloadSent: invoicePayload,
        },
        { status: 500 }
      );
    }

    const qboInvoice = qboBody?.Invoice || qboBody;
    const qboInvoiceId = String(qboInvoice?.Id || "").trim();
    const docNumber = String(qboInvoice?.DocNumber || "").trim();

    if (!qboInvoiceId) {
      return NextResponse.json(
        { ok: false, error: "QBO returned success but no Invoice.Id was found.", qboBody },
        { status: 500 }
      );
    }

    // 7) Save linkage back to ticket
    const nowIso = new Date().toISOString();
    await ticketRef.set(
      {
        billing: {
          ...billing,
          qboInvoiceId,
          qboDocNumber: docNumber || null,
          qboSyncedAt: nowIso,
          qboLastSyncIntuitTid: intuitTid || null,
          qboSyncAttempt: attempt || null,
          qboInvoiceStatus: "created",
        },
        updatedAt: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      message: "Invoice created in QBO from DCFlow service ticket.",
      realmId,
      serviceTicketId,
      qboCustomerId,
      qboInvoiceId,
      docNumber: docNumber || null,
      labor: {
        hours,
        unitPrice: laborUnitPrice,
        amount: laborAmount,
        itemId: laborItemId,
        itemName: laborItemName,
      },
      materialsCount: cleanedMaterials.length,
      materialsMode: USE_MATERIALS_ITEM ? "materials_item_single_line" : "description_only_lines",
      intuit_tid: intuitTid || "",
      attempt: attempt || "original",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invoice create failed." },
      { status: 500 }
    );
  }
}