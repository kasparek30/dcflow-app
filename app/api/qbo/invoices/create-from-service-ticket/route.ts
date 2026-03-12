import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../_lib";
import { adminDb } from "../../admin-db";

/**
 * ✅ CONFIG
 * Put what you SEE in QBO UI here (we’ll match it against Name OR FullyQualifiedName).
 */
const QBO_LABOR_ITEM_LABEL = "Labor N/T";
const QBO_LABOR_ITEM_ID_OVERRIDE = "7"; // <-- from https://qbo.intuit.com/app/item?itemId=7
const QBO_MATERIALS_ITEM_LABEL = "Materials:Materials"; // optional, see USE_MATERIALS_ITEM
const USE_MATERIALS_ITEM = false; // v1 recommended = false (description-only)

type TripMaterial = {
  name: string;
  qty: number;
  unit?: string;
  notes?: string;
};

type QboItem = {
  Id?: string;
  Name?: string;
  FullyQualifiedName?: string;
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

function normalize(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
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

async function getQboItemById(realmId: string, itemId: string) {
  const base = getQboApiBaseUrl();
  const url = `${base}/v3/company/${realmId}/item/${encodeURIComponent(itemId)}`;

  const { res, body } = await qboFetchWithAutoRefresh(url);

  if (!res.ok) return null;

  // QBO usually returns { Item: {...} }
  const item = (body?.Item ?? body) as any;
  if (!item?.Id) return null;

  return item as QboItem;
}

function pickBestItemMatch(items: QboItem[], label: string) {
  const want = normalize(label);

  // Prefer Active first, but if nothing active, we’ll still take an inactive match
  const actives = items.filter((i) => i?.Active !== false);
  const pool = actives.length ? actives : items;

  // Score by exact match on Name / FQN, then contains
  const scored = pool
    .filter((i) => String(i?.Id || "").trim())
    .map((i) => {
      const name = normalize(i.Name);
      const fqn = normalize(i.FullyQualifiedName);
      let score = 999;

      if (name === want) score = 0;
      else if (fqn === want) score = 1;
      else if (name.includes(want)) score = 2;
      else if (fqn.includes(want)) score = 3;

      return { i, score };
    })
    .filter((x) => x.score < 999)
    .sort((a, b) => a.score - b.score);

  return scored.length ? scored[0].i : null;
}

async function findQboItemFlexible(realmId: string, label: string) {
  const escaped = label.replace(/"/g, '\\"');

  // 1) Exact Name
  {
    const { res, body } = await qboQuery(
      realmId,
      `select * from Item where Name = "${escaped}" maxresults 50`
    );
    if (res.ok) {
      const items = asArray<QboItem>(body?.QueryResponse?.Item);
      const best = pickBestItemMatch(items, label);
      if (best) return { item: best, candidates: items };
    }
  }

  // 2) Exact FullyQualifiedName
  {
    const { res, body } = await qboQuery(
      realmId,
      `select * from Item where FullyQualifiedName = "${escaped}" maxresults 50`
    );
    if (res.ok) {
      const items = asArray<QboItem>(body?.QueryResponse?.Item);
      const best = pickBestItemMatch(items, label);
      if (best) return { item: best, candidates: items };
    }
  }

  // 3) LIKE Name
  {
    const { res, body } = await qboQuery(
      realmId,
      `select * from Item where Name LIKE "%${escaped}%" maxresults 50`
    );
    if (res.ok) {
      const items = asArray<QboItem>(body?.QueryResponse?.Item);
      const best = pickBestItemMatch(items, label);
      if (best) return { item: best, candidates: items };
    }
  }

  // 4) LIKE FullyQualifiedName
  {
    const { res, body } = await qboQuery(
      realmId,
      `select * from Item where FullyQualifiedName LIKE "%${escaped}%" maxresults 50`
    );
    if (res.ok) {
      const items = asArray<QboItem>(body?.QueryResponse?.Item);
      const best = pickBestItemMatch(items, label);
      if (best) return { item: best, candidates: items };
    }
  }

  // 5) Final fallback: search for "Labor" so we can SHOW you what QBO returns
  {
    const { res, body } = await qboQuery(
      realmId,
      `select * from Item where Name LIKE "%Labor%" maxresults 50`
    );
    const items = res.ok ? asArray<QboItem>(body?.QueryResponse?.Item) : [];
    return { item: null, candidates: items };
  }
}

function getItemRate(item: QboItem) {
  const unitPrice =
    typeof item.UnitPrice === "number"
      ? item.UnitPrice
      : typeof item.SalesPrice === "number"
        ? item.SalesPrice
        : null;
  return unitPrice && unitPrice > 0 ? unitPrice : null;
}

async function getLaborItemAndRate(realmId: string) {
  // ✅ 0) If override is set, fetch directly by Id (bulletproof)
  if (QBO_LABOR_ITEM_ID_OVERRIDE) {
    const byId = await getQboItemById(realmId, QBO_LABOR_ITEM_ID_OVERRIDE);
    if (!byId?.Id) {
      throw new Error(
        `Labor item override Id "${QBO_LABOR_ITEM_ID_OVERRIDE}" not found in QBO for this realm.`
      );
    }

    const unitPrice = getItemRate(byId);
    if (!unitPrice) {
      throw new Error(
        `Found QBO labor item by Id (${byId.Id}) but it has no UnitPrice/SalesPrice. Set the sales price in QBO.`
      );
    }

    return {
      laborItemId: String(byId.Id),
      laborItemName: byId.Name || QBO_LABOR_ITEM_LABEL,
      laborUnitPrice: unitPrice,
    };
  }

  // ✅ 1) Otherwise fall back to name/FQN matching
  const { item, candidates } = await findQboItemFlexible(realmId, QBO_LABOR_ITEM_LABEL);

  if (!item?.Id) {
    const list = (candidates || [])
      .slice(0, 25)
      .map((i) => ({
        Id: i.Id || "",
        Name: i.Name || "",
        FullyQualifiedName: i.FullyQualifiedName || "",
        Active: i.Active !== false,
        UnitPrice: i.UnitPrice ?? i.SalesPrice ?? null,
      }));

    throw new Error(
      `Could not find QBO Item matching "${QBO_LABOR_ITEM_LABEL}". ` +
        `I searched Name + FullyQualifiedName. ` +
        `Sample Labor-related items returned by QBO: ${JSON.stringify(list)}`
    );
  }

  const unitPrice = getItemRate(item);
  if (!unitPrice) {
    throw new Error(
      `Found QBO labor item (Id: ${item.Id}, Name: ${item.Name}, FQN: ${item.FullyQualifiedName}) but it has no UnitPrice/SalesPrice. Set the sales price in QBO.`
    );
  }

  return {
    laborItemId: String(item.Id),
    laborItemName: item.Name || QBO_LABOR_ITEM_LABEL,
    laborUnitPrice: unitPrice,
  };
}

async function getMaterialsItem(realmId: string) {
  const { item } = await findQboItemFlexible(realmId, QBO_MATERIALS_ITEM_LABEL);
  if (!item?.Id) return null;
  return { id: String(item.Id), name: item.Name || QBO_MATERIALS_ITEM_LABEL };
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
      return NextResponse.json({ error: "Ticket is missing customerId." }, { status: 400 });
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

    // 4) Pull labor item + current rate from QBO (flex match Name/FQN)
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
        const matItem = await getMaterialsItem(realmId);
        if (!matItem) {
          throw new Error(
            `USE_MATERIALS_ITEM=true but could not find QBO Item matching "${QBO_MATERIALS_ITEM_LABEL}".`
          );
        }
        const desc = ["Materials Used:", ...cleanedMaterials.map(buildMaterialsDescription)].join("\n");

        materialLines = [
          {
            DetailType: "SalesItemLineDetail",
            Amount: 0,
            Description: desc,
            SalesItemLineDetail: {
              ItemRef: { value: matItem.id, name: matItem.name },
              Qty: 1,
              UnitPrice: 0,
            },
          },
        ];
      } else {
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

const qboInvoiceUrl = `https://qbo.intuit.com/app/invoice?txnId=${qboInvoiceId}`;


return NextResponse.json({
  ok: true,
  message: "Invoice created in QBO from DCFlow service ticket.",
  realmId,
  serviceTicketId,
  qboCustomerId,
  qboInvoiceId,
  qboInvoiceUrl, // ✅ add this
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