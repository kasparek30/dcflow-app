// app/timesheet-review/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { WeeklyTimesheet } from "../../src/types/weekly-timesheet";

function formatStatus(status: WeeklyTimesheet["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "exported_to_quickbooks":
      return "Exported to QuickBooks";
    default:
      return status;
  }
}

export default function TimesheetReviewQueuePage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [timesheets, setTimesheets] = useState<WeeklyTimesheet[]>([]);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<
    "all" | WeeklyTimesheet["status"]
  >("submitted");

  useEffect(() => {
    async function loadTimesheets() {
      try {
        const q = query(collection(db, "weeklyTimesheets"), orderBy("weekStartDate", "desc"));
        const snap = await getDocs(q);

        const items: WeeklyTimesheet[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            employeeId: data.employeeId ?? "",
            employeeName: data.employeeName ?? "",
            employeeRole: data.employeeRole ?? "",
            weekStartDate: data.weekStartDate ?? "",
            weekEndDate: data.weekEndDate ?? "",
            timeEntryIds: Array.isArray(data.timeEntryIds) ? data.timeEntryIds : [],
            totalHours: typeof data.totalHours === "number" ? data.totalHours : 0,
            regularHours: typeof data.regularHours === "number" ? data.regularHours : 0,
            overtimeHours: typeof data.overtimeHours === "number" ? data.overtimeHours : 0,
            ptoHours: typeof data.ptoHours === "number" ? data.ptoHours : 0,
            holidayHours: typeof data.holidayHours === "number" ? data.holidayHours : 0,
            billableHours: typeof data.billableHours === "number" ? data.billableHours : 0,
            nonBillableHours:
              typeof data.nonBillableHours === "number" ? data.nonBillableHours : 0,
            status: data.status ?? "draft",
            submittedAt: data.submittedAt ?? undefined,
            submittedById: data.submittedById ?? undefined,
            approvedAt: data.approvedAt ?? undefined,
            approvedById: data.approvedById ?? undefined,
            approvedByName: data.approvedByName ?? undefined,
            rejectedAt: data.rejectedAt ?? undefined,
            rejectedById: data.rejectedById ?? undefined,
            rejectionReason: data.rejectionReason ?? undefined,
            quickbooksExportStatus: data.quickbooksExportStatus ?? "not_ready",
            quickbooksExportedAt: data.quickbooksExportedAt ?? undefined,
            quickbooksPayrollBatchId: data.quickbooksPayrollBatchId ?? undefined,
            employeeNote: data.employeeNote ?? undefined,
            managerNote: data.managerNote ?? undefined,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setTimesheets(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load timesheet review queue.");
      } finally {
        setLoading(false);
      }
    }

    loadTimesheets();
  }, []);

  const visibleTimesheets = useMemo(() => {
    if (statusFilter === "all") return timesheets;
    return timesheets.filter((item) => item.status === statusFilter);
  }, [timesheets, statusFilter]);

  return (
    <ProtectedPage fallbackTitle="Timesheet Review">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              Timesheet Review
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Review submitted weekly timesheets and approve or reject them.
            </p>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            background: "#fafafa",
            maxWidth: "360px",
          }}
        >
          <label style={{ fontWeight: 700 }}>Filter by Status</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | WeeklyTimesheet["status"])
            }
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              marginTop: "6px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              background: "white",
            }}
          >
            <option value="submitted">Submitted</option>
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="exported_to_quickbooks">Exported to QuickBooks</option>
          </select>

          <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
            Showing {visibleTimesheets.length} timesheet
            {visibleTimesheets.length === 1 ? "" : "s"}.
          </div>
        </div>

        {loading ? <p>Loading review queue...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && visibleTimesheets.length === 0 ? (
          <p>No timesheets found for this filter.</p>
        ) : null}

        {!loading && !error && visibleTimesheets.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {visibleTimesheets.map((timesheet) => (
              <Link
                key={timesheet.id}
                href={`/timesheet-review/${timesheet.id}`}
                style={{
                  display: "block",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "12px",
                  textDecoration: "none",
                  color: "inherit",
                  background: "white",
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {timesheet.employeeName} ({timesheet.employeeRole})
                </div>

                <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                  Week: {timesheet.weekStartDate} through {timesheet.weekEndDate}
                </div>

                <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                  Status: {formatStatus(timesheet.status)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Total Paid: {timesheet.totalHours.toFixed(2)} hr • Regular:{" "}
                  {timesheet.regularHours.toFixed(2)} • OT:{" "}
                  {timesheet.overtimeHours.toFixed(2)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  PTO: {timesheet.ptoHours.toFixed(2)} • Holiday:{" "}
                  {timesheet.holidayHours.toFixed(2)}
                </div>

                {timesheet.submittedAt ? (
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                    Submitted At: {timesheet.submittedAt}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}