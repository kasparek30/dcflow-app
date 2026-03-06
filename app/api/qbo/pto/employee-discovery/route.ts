// app/api/qbo/pto/employee-discovery/route.ts
import { NextResponse } from "next/server";
import {
  getQboApiBaseUrl,
  getQboCookieValues,
  qboFetchWithAutoRefresh,
} from "../../_lib";
import { pickKeys, safeJsonPreview } from "../_util";

export async function GET() {
  try {
    const { realmId } = await getQboCookieValues();
    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const base = getQboApiBaseUrl();

    // Query a few Employees (Accounting API)
    const query = encodeURIComponent("select * from Employee maxresults 10");
    const url = `${base}/v3/company/${realmId}/query?query=${query}`;

    const { res, body, intuitTid, attempt } = await qboFetchWithAutoRefresh(url);

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          where: "Accounting Employee query",
          attempt,
          status: res.status,
          intuit_tid: intuitTid || "",
          body,
        },
        { status: 500 }
      );
    }

    const employees = body?.QueryResponse?.Employee;
    const list: any[] = Array.isArray(employees) ? employees : employees ? [employees] : [];

    // Preview the kinds of fields returned for each employee
    const previews = list.map((e) => ({
      // Common fields we care about:
      ...pickKeys(e, [
        "Id",
        "DisplayName",
        "GivenName",
        "FamilyName",
        "Active",
        "PrimaryEmailAddr",
        "PrimaryPhone",
        // Some tenants include a hire date-like field (varies):
        "HiredDate",
        "HireDate",
        "StartDate",
        "EmployeeNumber",
      ]),
      // Show what keys exist (helps discovery without dumping everything)
      _keys: Object.keys(e || {}).sort(),
    }));

    return NextResponse.json({
      ok: true,
      attempt,
      intuit_tid: intuitTid || "",
      count: previews.length,
      note:
        "This route uses the QBO Accounting Employee entity. We’re looking for hire-date-like fields and any PTO/timeoff clues.",
      previews,
      rawPreview: safeJsonPreview(body),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Employee discovery failed." },
      { status: 500 }
    );
  }
}