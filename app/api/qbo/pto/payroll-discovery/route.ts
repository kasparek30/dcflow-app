// app/api/qbo/pto/payroll-discovery/route.ts
import { NextResponse } from "next/server";
import { getQboCookieValues, qboFetchWithAutoRefresh } from "../../_lib";
import { safeJsonPreview } from "../_util";

type AttemptValue = "original" | "refreshed";

type AttemptResult = {
  label: string;
  url: string;
  ok: boolean;
  status: number;
  intuit_tid: string;
  attempt: AttemptValue;
  preview: string;
};

export async function GET() {
  try {
    const { realmId } = await getQboCookieValues();
    if (!realmId) {
      return NextResponse.json(
        { error: "Not connected to QuickBooks (missing realmId)." },
        { status: 400 }
      );
    }

    const candidates: { label: string; url: string }[] = [
      {
        label: "Payroll v1 list employees (candidate A)",
        url: `https://quickbooks.api.intuit.com/payroll/v1/companies/${realmId}/employees`,
      },
      {
        label: "Payroll v1 list employees (candidate B)",
        url: `https://quickbooks.api.intuit.com/payroll/v1/company/${realmId}/employees`,
      },
      {
        label: "Payroll v1 company info (candidate)",
        url: `https://quickbooks.api.intuit.com/payroll/v1/companies/${realmId}`,
      },
      {
        label: "TimeActivity query (Accounting API, sanity check)",
        url: `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(
          "select * from TimeActivity maxresults 5"
        )}`,
      },
    ];

    const results: AttemptResult[] = [];

    for (const c of candidates) {
      try {
        const { res, body, intuitTid, attempt } = await qboFetchWithAutoRefresh(
          c.url
        );

        results.push({
          label: c.label,
          url: c.url,
          ok: res.ok,
          status: res.status,
          intuit_tid: intuitTid || "",
          attempt: (attempt === "refreshed" ? "refreshed" : "original") as AttemptValue,
          preview: safeJsonPreview(body),
        });
      } catch (e: unknown) {
        results.push({
          label: c.label,
          url: c.url,
          ok: false,
          status: 0,
          intuit_tid: "",
          attempt: "original" as const,
          preview: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const okOnes = results.filter((r) => r.ok).length;

    return NextResponse.json({
      ok: true,
      realmId,
      note:
        "Payroll discovery tries multiple endpoint candidates. If payroll endpoints return 401/403, we’ll likely need additional Intuit Payroll/Time API access/scopes.",
      successfulCount: okOnes,
      results,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payroll discovery failed." },
      { status: 500 }
    );
  }
}