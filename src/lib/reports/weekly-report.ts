export type ReportDocument = Record<string, unknown>;

export type ReportRange = { start: string; end: string };

export type ReportData = {
  newServiceTickets: number;
  newProjects: number;
  serviceTicketsCompleted: number;
  projectsClosed: number;
  serviceInvoicesRecorded: number;
  projectInvoicesRecorded: number;
  billableHours: number;
  nonBillableHours: number;
  paidLeaveHours: number;
  billableRatio: number | null;
  employeeHours: Array<{
    id: string;
    name: string;
    role: string;
    billable: number;
    nonBillable: number;
  }>;
};

const CHICAGO = "America/Chicago";
const dateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: CHICAGO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function chicagoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === "string" || typeof value === "number") date = new Date(value);
  else if (typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    date = typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date((timestamp.seconds ?? NaN) * 1000);
  } else return null;
  if (!Number.isFinite(date.getTime())) return null;
  const parts = dateParts.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function todayChicago(): string {
  return chicagoDate(new Date())!;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(iso: string): string {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

function inRange(value: unknown, range: ReportRange): boolean {
  const date = chicagoDate(value);
  return Boolean(date && date >= range.start && date <= range.end);
}

function object(value: unknown): ReportDocument {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ReportDocument : {};
}

function entries(value: unknown): ReportDocument[] {
  return Array.isArray(value) ? value.map(object) : [];
}

export function buildReport(
  range: ReportRange,
  tickets: ReportDocument[],
  projects: ReportDocument[],
  timeEntries: ReportDocument[],
): ReportData {
  const employees = new Map<string, ReportData["employeeHours"][number]>();
  let billableHours = 0;
  let nonBillableHours = 0;
  let paidLeaveHours = 0;

  for (const entry of timeEntries) {
    if (!inRange(entry.entryDate, range)) continue;
    if (["rejected", "void", "cancelled"].includes(String(entry.entryStatus ?? "").toLowerCase())) continue;
    const hours = Number(entry.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    if (["pto", "holiday"].includes(String(entry.category ?? "").toLowerCase())) {
      paidLeaveHours += hours;
      continue;
    }
    const key = String(entry.employeeId || entry.employeeName || "Unknown");
    const employee = employees.get(key) || {
      id: key,
      name: String(entry.employeeName || "Unknown"),
      role: String(entry.employeeRole || ""),
      billable: 0,
      nonBillable: 0,
    };
    if (entry.billable === true) {
      billableHours += hours;
      employee.billable += hours;
    } else {
      nonBillableHours += hours;
      employee.nonBillable += hours;
    }
    employees.set(key, employee);
  }

  let serviceInvoicesRecorded = 0;
  let serviceTicketsCompleted = 0;
  for (const ticket of tickets) {
    const billing = object(ticket.billing);
    if (inRange(billing.qboSyncedAt || ticket.firstInvoicedAt, range)) serviceInvoicesRecorded++;
    // No updatedAt fallback: editing notes must not create a false close event.
    if (inRange(ticket.firstCompletedAt || ticket.firstReadyToBillAt || billing.readyToBillAt, range)) {
      serviceTicketsCompleted++;
    }
  }

  let projectInvoicesRecorded = 0;
  for (const project of projects) {
    const stages = [project.roughIn, project.topOutVent, project.trimFinish].map(object);
    const periods = entries(project.billingPeriods);
    const datedInvoices = [
      ...stages.map((stage) => stage.invoicedAt),
      ...periods.map((period) => period.invoicedAt),
    ];
    projectInvoicesRecorded += datedInvoices.filter((date) => inRange(date, range)).length;
    // Legacy whole-project invoices have no stage or period event.
    if (!datedInvoices.some(Boolean) && inRange(project.invoicedAt, range)) projectInvoicesRecorded++;
  }

  const total = billableHours + nonBillableHours;
  return {
    newServiceTickets: tickets.filter((ticket) => inRange(ticket.createdAt || ticket.openedAt, range)).length,
    newProjects: projects.filter((project) => inRange(project.createdAt, range)).length,
    serviceTicketsCompleted,
    projectsClosed: projects.filter((project) => inRange(project.closedAt, range)).length,
    serviceInvoicesRecorded,
    projectInvoicesRecorded,
    billableHours,
    nonBillableHours,
    paidLeaveHours,
    billableRatio: total > 0 ? billableHours / total : null,
    employeeHours: [...employees.values()].sort((a, b) => b.billable - a.billable || a.name.localeCompare(b.name)),
  };
}
