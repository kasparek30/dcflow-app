// app/api/qbo/invoices/create-from-service-ticket/route.ts
import { NextResponse } from "next/server";
import {
  qboFetchWithAutoRefresh,
  getQboApiBaseUrl,
  getQboCookieValues,
} from "../../_lib";
import { adminDb } from "../../admin-db";

const QBO_LABOR_ITEM_LABEL = "Labor N/T";
const QBO_LABOR_ITEM_ID_OVERRIDE = "7";
const QBO_MATERIALS_ITEM_LABEL = "Materials";
const QBO_MATERIALS_ITEM_ID_OVERRIDE = "6";
const USE_MATERIALS_ITEM = true;

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

type QboInvoiceLite = {
  Id?: string;
  DocNumber?: string;
  MetaData?: {
    CreateTime?: string;
  };
};

function safeNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function asArray<T>(x: unknown): T[] {
  if (!x) return [];
  return Array.isArray(x) ? (x as T[]) : [x as T];
}

function nowIso() {
  return new Date().toISOString();
}

function buildMaterialsSummaryFromLines(materials?: TripMaterial[] | null) {
  const items = Array.isArray(materials) ? materials : [];
  return items
    .filter((m) => String(m?.name || "").trim())
    .map((m) => {
      const qty = Number(m.qty || 0);
      const unit = String(m.unit || "").trim();
      return `${qty > 0 ? `${qty} of ` : ""}${String(m.name || "").trim()}${
        unit ? ` (${unit})` : ""
      }`;
    })
    .join(", ");
}

function incrementDocNumber(docNumber: string) {
  const trimmed = String(docNumber || "").trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return null;

  const prefix = match[1] || "";
  const digits = match[2] || "";
  const nextValue = String(Number(digits) + 1).padStart(digits.length, "0");

  return `${prefix}${nextValue}`;
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

  const item = (body?.Item ?? body) as any;
  if (!item?.Id) return null;

  return item as QboItem;
}

function pickBestItemMatch(items: QboItem[], label: string) {
  const want = normalize(label);
  const actives = items.filter((i) => i?.Active !== false);
  const pool = actives.length ? actives : items;

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

  return { item: null, candidates: [] as QboItem[] };
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
        `Found QBO labor item by Id (${byId.Id}) but it has no UnitPrice/SalesPrice.`
      );
    }

    return {
      laborItemId: String(byId.Id),
      laborItemName: byId.Name || QBO_LABOR_ITEM_LABEL,
      laborUnitPrice: unitPrice,
    };
  }

  const { item, candidates } = await findQboItemFlexible(
    realmId,
    QBO_LABOR_ITEM_LABEL
  );

  if (!item?.Id) {
    throw new Error(
      `Could not find QBO labor item "${QBO_LABOR_ITEM_LABEL}". Candidates: ${JSON.stringify(
        (candidates || []).slice(0, 10)
      )}`
    );
  }

  const unitPrice = getItemRate(item);
  if (!unitPrice) {
    throw new Error(
      `Found QBO labor item (Id: ${item.Id}) but it has no UnitPrice/SalesPrice.`
    );
  }

  return {
    laborItemId: String(item.Id),
    laborItemName: item.Name || QBO_LABOR_ITEM_LABEL,
    laborUnitPrice: unitPrice,
  };
}

async function getMaterialsItem(realmId: string) {
  if (QBO_MATERIALS_ITEM_ID_OVERRIDE) {
    const byId = await getQboItemById(realmId, QBO_MATERIALS_ITEM_ID_OVERRIDE);
    if (!byId?.Id) {
      throw new Error(
        `Materials item override Id "${QBO_MATERIALS_ITEM_ID_OVERRIDE}" not found in QBO for this realm.`
      );
    }

    return {
      id: String(byId.Id),
      name: byId.Name || QBO_MATERIALS_ITEM_LABEL,
    };
  }

  const { item } = await findQboItemFlexible(realmId, QBO_MATERIALS_ITEM_LABEL);
  if (!item?.Id) return null;

  return {
    id: String(item.Id),
    name: item.Name || QBO_MATERIALS_ITEM_LABEL,
  };
}

async function getNextInvoiceDocNumber(realmId: string) {
  const { res, body } = await qboQuery(
    realmId,
    `select * from Invoice order by MetaData.CreateTime desc maxresults 25`
  );

  if (!res.ok) {
    throw new Error("Failed to query QBO invoices for next DocNumber.");
  }

  const invoices = asArray<QboInvoiceLite>(body?.QueryResponse?.Invoice);

  if (invoices.length === 0) {
    return "1";
  }

  for (const invoice of invoices) {
    const next = incrementDocNumber(String(invoice?.DocNumber || ""));
    if (next) return next;
  }

  const numericDocNumbers = invoices
    .map((invoice) => String(invoice?.DocNumber || "").trim())
    .filter(Boolean)
    .map((docNumber) => Number(docNumber))
    .filter((n) => Number.isFinite(n));

  if (numericDocNumbers.length > 0) {
    return String(Math.max(...numericDocNumbers) + 1);
  }

  throw new Error(
    "Could not determine the next sequential QBO invoice number from recent invoices."
  );
}

export async function POST(req: Request) {
  const db = adminDb();
  let ticketRef: FirebaseFirestore.DocumentReference | null = null;
  let existingBilling: any = null;

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

    ticketRef = db.collection("serviceTickets").doc(serviceTicketId);
    const ticketSnap = await ticketRef.get();

    if (!ticketSnap.exists) {
      return NextResponse.json(
        { error: "Service ticket not found." },
        { status: 404 }
      );
    }

    const ticket = ticketSnap.data() || {};
    existingBilling = (ticket.billing || {}) as any;

    if (String(existingBilling.status || "").trim() !== "ready_to_bill") {
      return NextResponse.json(
        {
          error: `Ticket billing status must be "ready_to_bill". Current: ${
            String(existingBilling.status || "").trim() || "unset"
          }`,
        },
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

    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return NextResponse.json(
        { error: "Customer not found." },
        { status: 404 }
      );
    }

    const customer = customerSnap.data() || {};
    const qboCustomerId = String(customer.qboCustomerId || "").trim();

    if (!qboCustomerId) {
      return NextResponse.json(
        {
          error:
            "Customer is missing qboCustomerId. Import/link the QBO customer first.",
        },
        { status: 400 }
      );
    }

    const laborHours = safeNumber(existingBilling?.labor?.totalHours, 0);
    if (laborHours <= 0) {
      return NextResponse.json(
        { error: "Billing packet labor.totalHours must be greater than 0." },
        { status: 400 }
      );
    }

    const materialsSummary =
      String(existingBilling.materialsSummary || "").trim() ||
      buildMaterialsSummaryFromLines(existingBilling.materials || []);

    const materialsAmount = safeNumber(existingBilling.materialsAmount, 0);

    if (materialsAmount > 0 && !materialsSummary) {
      return NextResponse.json(
        {
          error:
            "Materials Amount is greater than 0, but Materials Summary is blank.",
        },
        { status: 400 }
      );
    }

    const resolutionNotes = String(existingBilling.resolutionNotes || "").trim();
    const workNotes = String(existingBilling.workNotes || "").trim();
    const issueSummary = String(ticket.issueSummary || "").trim();

    const creatingAt = nowIso();
    const creatingBilling = {
      ...existingBilling,
      status: "creating_invoice",
      invoiceError: null,
      updatedAt: creatingAt,
    };

    await ticketRef.set(
      {
        billing: creatingBilling,
        updatedAt: creatingAt,
      },
      { merge: true }
    );

    const nextDocNumber = await getNextInvoiceDocNumber(realmId);

    const { laborItemId, laborItemName, laborUnitPrice } =
      await getLaborItemAndRate(realmId);

    const laborAmount = Number((laborHours * laborUnitPrice).toFixed(2));

    const laborDescriptionParts = [
      `Labor (${laborHours.toFixed(2)} hr)`,
      issueSummary || "Service Ticket",
      resolutionNotes || "",
    ].filter(Boolean);

    const laborLine = {
      DetailType: "SalesItemLineDetail",
      Amount: laborAmount,
      Description: laborDescriptionParts.join(" — "),
      SalesItemLineDetail: {
        ItemRef: { value: laborItemId, name: laborItemName },
        Qty: laborHours,
        UnitPrice: laborUnitPrice,
      },
    };

    const lines: any[] = [laborLine];

    if (materialsAmount > 0) {
      if (!USE_MATERIALS_ITEM) {
        throw new Error(
          "Materials amount exists, but USE_MATERIALS_ITEM is false."
        );
      }

      const matItem = await getMaterialsItem(realmId);
      if (!matItem) {
        throw new Error(
          `Could not find QBO materials item "${QBO_MATERIALS_ITEM_LABEL}".`
        );
      }

      lines.push({
        DetailType: "SalesItemLineDetail",
        Amount: Number(materialsAmount.toFixed(2)),
        Description: materialsSummary
          ? `Materials: ${materialsSummary}`
          : "Materials",
        SalesItemLineDetail: {
          ItemRef: { value: matItem.id, name: matItem.name },
          Qty: 1,
          UnitPrice: Number(materialsAmount.toFixed(2)),
        },
      });
    } else if (materialsSummary) {
      lines.push({
        DetailType: "DescriptionOnly",
        Description: `Materials: ${materialsSummary}`,
      });
    }

    const privateNoteParts = [
      `DCFlow Ticket ${serviceTicketId}`,
      existingBilling.readyToBillTripId
        ? `Ready Trip ${existingBilling.readyToBillTripId}`
        : "",
      workNotes || "",
    ].filter(Boolean);

    const invoicePayload = {
      CustomerRef: { value: qboCustomerId },
      DocNumber: nextDocNumber,
      PrivateNote: privateNoteParts.join(" • "),
      Line: lines,
    };

    const base = getQboApiBaseUrl();
    const url = `${base}/v3/company/${realmId}/invoice`;

    const { res, body: qboBody, intuitTid, attempt } =
      await qboFetchWithAutoRefresh(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoicePayload),
      });

    if (!res.ok) {
      const failedAt = nowIso();
      const invoiceError =
        qboBody?.Fault?.Error?.[0]?.Message ||
        qboBody?.fault?.error?.[0]?.message ||
        "QBO invoice create failed.";

      const failedBilling = {
        ...creatingBilling,
        status: "invoice_failed",
        invoiceSource: "qbo",
        invoiceError,
        updatedAt: failedAt,
      };

      await ticketRef.set(
        {
          billing: failedBilling,
          updatedAt: failedAt,
        },
        { merge: true }
      );

      return NextResponse.json(
        {
          ok: false,
          error: invoiceError,
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
    const qboDocNumber = String(qboInvoice?.DocNumber || nextDocNumber).trim();

    if (!qboInvoiceId) {
      throw new Error("QBO returned success but no Invoice.Id was found.");
    }

    const qboInvoiceUrl = `https://qbo.intuit.com/app/invoice?txnId=${qboInvoiceId}`;
    const syncedAt = nowIso();

    const nextBilling = {
      ...creatingBilling,
      status: "invoiced",
      invoiceSource: "qbo",
      qboInvoiceId,
      qboDocNumber: qboDocNumber || null,
      qboInvoiceUrl,
      qboSyncedAt: syncedAt,
      qboInvoiceStatus: "created",
      invoiceError: null,
      updatedAt: syncedAt,
    };

    await ticketRef.set(
      {
        status: "invoiced",
        billing: nextBilling,
        updatedAt: syncedAt,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      message: "Invoice created in QBO.",
      serviceTicketId,
      qboInvoiceId,
      qboDocNumber: qboDocNumber || null,
      qboInvoiceUrl,
      updatedAt: syncedAt,
      updatedTicketStatus: "invoiced",
      updatedBilling: nextBilling,
      intuit_tid: intuitTid || "",
      attempt: attempt || "original",
    });
  } catch (err: unknown) {
    if (ticketRef && existingBilling) {
      const failedAt = nowIso();
      const message =
        err instanceof Error ? err.message : "Invoice create failed.";

      await ticketRef.set(
        {
          billing: {
            ...existingBilling,
            status: "invoice_failed",
            invoiceSource: "qbo",
            invoiceError: message,
            updatedAt: failedAt,
          },
          updatedAt: failedAt,
        },
        { merge: true }
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invoice create failed." },
      { status: 500 }
    );
  }
}