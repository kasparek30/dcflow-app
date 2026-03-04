// app/pto-requests/[requestId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { getPayrollWeekBounds } from "../../../src/lib/payroll";
import type { PTORequest } from "../../../src/types/pto-request";

type Props = {
  params: Promise<{ requestId: string }>;
};

type HolidayLite = {
  holidayDate: string;
  active: boolean;
};

type TimeEntryLite = {
  id: string;
  employeeId: string;
  entryDate: string;
  category: string;
  source: string;
  notes?: string;
};

function formatStatus(status: PTORequest["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function getWeekdayDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  if (end < start) return [];

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const year = cursor.getFullYear();
      const month = String(cursor.getMonth() + 1).padStart(2, "0");
      const date = String(cursor.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${date}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export default function PTORequestDetailPage({ params }: Props) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [requestId, setRequestId] = useState("");
  const [requestItem, setRequestItem] = useState<PTORequest | null>(null);

  const [managerNote, setManagerNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const canReview =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadRequest() {
      try {
        const resolved = await params;
        const nextId = resolved.requestId;
        setRequestId(nextId);

        const snap = await getDoc(doc(db, "ptoRequests", nextId));

        if (!snap.exists()) {
          setError("PTO request not found.");
          setLoading(false);
          return;
        }

        const data = snap.data();

        const item: PTORequest = {
          id: snap.id,
          employeeId: data.employeeId ?? "",
          employeeName: data.employeeName ?? "",
          employeeRole: data.employeeRole ?? "",
          startDate: data.startDate ?? "",
          endDate: data.endDate ?? "",
          hoursPerDay: typeof data.hoursPerDay === "number" ? data.hoursPerDay : 8,
          totalRequestedHours:
            typeof data.totalRequestedHours === "number" ? data.totalRequestedHours : 0,
          status: data.status ?? "pending",
          notes: data.notes ?? undefined,
          managerNote: data.managerNote ?? undefined,
          rejectionReason: data.rejectionReason ?? undefined,
          approvedAt: data.approvedAt ?? undefined,
          approvedById: data.approvedById ?? undefined,
          approvedByName: data.approvedByName ?? undefined,
          rejectedAt: data.rejectedAt ?? undefined,
          rejectedById: data.rejectedById ?? undefined,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        };

        setRequestItem(item);
        setManagerNote(item.managerNote ?? "");
        setRejectionReason(item.rejectionReason ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load PTO request.");
      } finally {
        setLoading(false);
      }
    }

    loadRequest();
  }, [params]);

  const weekdayDates = useMemo(() => {
    if (!requestItem) return [];
    return getWeekdayDates(requestItem.startDate, requestItem.endDate);
  }, [requestItem]);

  const canTakeAction = useMemo(() => {
    if (!requestItem) return false;
    return canReview && requestItem.status === "pending";
  }, [canReview, requestItem]);

  async function handleApprove() {
    if (!requestItem || !appUser?.uid) return;

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      const [holidaySnap, timeEntriesSnap] = await Promise.all([
        getDocs(query(collection(db, "companyHolidays"))),
        getDocs(query(collection(db, "timeEntries"))),
      ]);

      const holidays: HolidayLite[] = holidaySnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          holidayDate: data.holidayDate ?? "",
          active: data.active ?? true,
        };
      });

      const activeHolidayDates = new Set(
        holidays.filter((h) => h.active).map((h) => h.holidayDate)
      );

      const allTimeEntries: TimeEntryLite[] = timeEntriesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          employeeId: data.employeeId ?? "",
          entryDate: data.entryDate ?? "",
          category: data.category ?? "",
          source: data.source ?? "",
          notes: data.notes ?? undefined,
        };
      });

      let createdCount = 0;

      for (const entryDate of weekdayDates) {
        if (activeHolidayDates.has(entryDate)) {
          continue;
        }

        const notesPrefix = `AUTO_PTO:${requestItem.id}:${entryDate}`;

        const alreadyExists = allTimeEntries.find((entry) => {
          if (entry.employeeId !== requestItem.employeeId) return false;
          if (entry.entryDate !== entryDate) return false;
          if (entry.category !== "pto") return false;
          if (entry.source !== "system_generated_pto") return false;
          return (entry.notes ?? "").startsWith(notesPrefix);
        });

        if (alreadyExists) {
          continue;
        }

        const { weekStartDate, weekEndDate } = getPayrollWeekBounds(entryDate);

        const newDoc = await addDoc(collection(db, "timeEntries"), {
          employeeId: requestItem.employeeId,
          employeeName: requestItem.employeeName,
          employeeRole: requestItem.employeeRole,
          laborRoleType: null,

          entryDate,
          weekStartDate,
          weekEndDate,

          category: "pto",
          hours: requestItem.hoursPerDay,
          payType: "pto",
          billable: false,
          source: "system_generated_pto",

          serviceTicketId: null,
          projectId: null,
          projectStageKey: null,

          linkedTechnicianId: null,
          linkedTechnicianName: null,

          notes: `${notesPrefix} • Approved PTO request`,
          timesheetId: null,

          entryStatus: "draft",

          createdAt: nowIso,
          updatedAt: nowIso,
        });

        allTimeEntries.push({
          id: newDoc.id,
          employeeId: requestItem.employeeId,
          entryDate,
          category: "pto",
          source: "system_generated_pto",
          notes: `${notesPrefix} • Approved PTO request`,
        });

        createdCount += 1;
      }

      await updateDoc(doc(db, "ptoRequests", requestItem.id), {
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || null,
        rejectionReason: null,
        updatedAt: nowIso,
      });

      setRequestItem({
        ...requestItem,
        status: "approved",
        approvedAt: nowIso,
        approvedById: appUser.uid,
        approvedByName: appUser.displayName || "Unknown Approver",
        managerNote: managerNote.trim() || undefined,
        rejectionReason: undefined,
        updatedAt: nowIso,
      });

      setSaveMsg(`PTO request approved. Created ${createdCount} PTO time entr${createdCount === 1 ? "y" : "ies"}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve PTO request.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!requestItem || !appUser?.uid) return;

    if (!rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, "ptoRequests", requestItem.id), {
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || null,
        updatedAt: nowIso,
      });

      setRequestItem({
        ...requestItem,
        status: "rejected",
        rejectedAt: nowIso,
        rejectedById: appUser.uid,
        rejectionReason: rejectionReason.trim(),
        managerNote: managerNote.trim() || undefined,
        updatedAt: nowIso,
      });

      setSaveMsg("PTO request rejected.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reject PTO request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="PTO Request Detail">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              PTO Request Detail
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Review PTO request details and approve or reject when ready.
            </p>
          </div>

          <Link
            href="/pto-requests"
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
              height: "fit-content",
            }}
          >
            Back to PTO Requests
          </Link>
        </div>

        {loading ? <p style={{ marginTop: "16px" }}>Loading PTO request...</p> : null}
        {error ? <p style={{ marginTop: "16px", color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ marginTop: "16px", color: "green" }}>{saveMsg}</p> : null}

        {!loading && requestItem ? (
          <>
            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "920px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "18px" }}>
                {requestItem.employeeName} ({requestItem.employeeRole})
              </div>

              <div style={{ fontSize: "13px", color: "#555" }}>
                Request: {requestItem.startDate} through {requestItem.endDate}
              </div>

              <div style={{ fontSize: "13px", color: "#555" }}>
                Status: {formatStatus(requestItem.status)}
              </div>

              <div style={{ fontSize: "13px", color: "#555" }}>
                Hours Per Day: {requestItem.hoursPerDay.toFixed(2)}
              </div>

              <div style={{ fontSize: "13px", color: "#555" }}>
                Total Requested Hours: {requestItem.totalRequestedHours.toFixed(2)}
              </div>

              <div style={{ fontSize: "12px", color: "#666" }}>
                PTO Request ID: {requestId}
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "920px",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: "8px" }}>
                PTO Dates That Will Generate
              </div>

              {weekdayDates.length === 0 ? (
                <div style={{ fontSize: "13px", color: "#666" }}>
                  No weekdays in this request.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "6px" }}>
                  {weekdayDates.map((date) => (
                    <div key={date} style={{ fontSize: "13px", color: "#555" }}>
                      {date} • {requestItem.hoursPerDay.toFixed(2)} hr
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                Weekends are skipped. Active company holidays are also skipped to avoid double-counting PTO + holiday pay on the same day.
              </div>
            </div>

            {requestItem.notes ? (
              <div
                style={{
                  marginTop: "16px",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "#fafafa",
                  maxWidth: "920px",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "8px" }}>
                  Employee Note
                </div>
                <div style={{ fontSize: "13px", color: "#555", whiteSpace: "pre-wrap" }}>
                  {requestItem.notes}
                </div>
              </div>
            ) : null}

            <div
              style={{
                marginTop: "16px",
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
                background: "#fafafa",
                maxWidth: "920px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: "18px" }}>
                Manager Review
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>Manager Note</label>
                <textarea
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  rows={4}
                  disabled={!canTakeAction || saving}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: canTakeAction ? "white" : "#f1f1f1",
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>Rejection Reason</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  disabled={!canTakeAction || saving}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: canTakeAction ? "white" : "#f1f1f1",
                  }}
                />
              </div>

              {canTakeAction ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    {saving ? "Saving..." : "Approve PTO Request"}
                  </button>

                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    {saving ? "Saving..." : "Reject PTO Request"}
                  </button>
                </div>
              ) : (
                <span
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ddd",
                    background: "#f1f1f1",
                    color: "#777",
                    width: "fit-content",
                    fontWeight: 800,
                  }}
                >
                  Review Locked
                </span>
              )}
            </div>
          </>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}