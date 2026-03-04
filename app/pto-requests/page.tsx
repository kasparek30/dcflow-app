// app/pto-requests/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { PTORequest } from "../../src/types/pto-request";

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function countWeekdays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function formatStatus(status: PTORequest["status"]): string {
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

export default function PTORequestsPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PTORequest[]>([]);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const todayIso = toIsoDate(new Date());

  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

  const canReviewAll =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    appUser?.role === "dispatcher";

  useEffect(() => {
    async function loadRequests() {
      try {
        const q = query(collection(db, "ptoRequests"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const items: PTORequest[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
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
        });

        setRequests(items);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load PTO requests.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadRequests();
  }, []);

  const weekdayCount = useMemo(() => {
    return countWeekdays(startDate, endDate);
  }, [startDate, endDate]);

  const totalRequestedHours = useMemo(() => {
    return weekdayCount * hoursPerDay;
  }, [weekdayCount, hoursPerDay]);

  const visibleRequests = useMemo(() => {
    if (canReviewAll) return requests;
    return requests.filter((item) => item.employeeId === appUser?.uid);
  }, [requests, canReviewAll, appUser?.uid]);

  async function handleCreateRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!appUser?.uid) {
      setError("You must be logged in.");
      return;
    }

    if (!startDate || !endDate) {
      setError("Start and end dates are required.");
      return;
    }

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    if (hoursPerDay <= 0) {
      setError("Hours per day must be greater than 0.");
      return;
    }

    if (weekdayCount <= 0) {
      setError("This request must include at least one weekday.");
      return;
    }

    setSaving(true);
    setError("");
    setSaveMsg("");

    try {
      const nowIso = new Date().toISOString();

      const docRef = await addDoc(collection(db, "ptoRequests"), {
        employeeId: appUser.uid,
        employeeName: appUser.displayName || "Unknown User",
        employeeRole: appUser.role || "technician",

        startDate,
        endDate,
        hoursPerDay,
        totalRequestedHours,

        status: "pending",

        notes: notes.trim() || null,
        managerNote: null,
        rejectionReason: null,

        approvedAt: null,
        approvedById: null,
        approvedByName: null,

        rejectedAt: null,
        rejectedById: null,

        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const newItem: PTORequest = {
        id: docRef.id,
        employeeId: appUser.uid,
        employeeName: appUser.displayName || "Unknown User",
        employeeRole: appUser.role || "technician",
        startDate,
        endDate,
        hoursPerDay,
        totalRequestedHours,
        status: "pending",
        notes: notes.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      setRequests((prev) => [newItem, ...prev]);
      setSaveMsg("PTO request submitted.");

      setStartDate(todayIso);
      setEndDate(todayIso);
      setHoursPerDay(8);
      setNotes("");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create PTO request.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="PTO Requests">
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
              PTO Requests
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Submit PTO requests and track approval status.
            </p>
          </div>
        </div>

        {error ? <p style={{ color: "red" }}>{error}</p> : null}
        {saveMsg ? <p style={{ color: "green" }}>{saveMsg}</p> : null}

        <form
          onSubmit={handleCreateRequest}
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            background: "#fafafa",
            maxWidth: "900px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: "18px" }}>
            New PTO Request
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={{ fontWeight: 700 }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <div>
              <label style={{ fontWeight: 700 }}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <div>
              <label style={{ fontWeight: 700 }}>Hours Per Day</label>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 700 }}>Employee Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div
            style={{
              border: "1px solid #e6e6e6",
              borderRadius: "12px",
              padding: "12px",
              background: "white",
              display: "grid",
              gap: "6px",
            }}
          >
            <div style={{ fontWeight: 800 }}>Request Summary</div>
            <div style={{ fontSize: "13px", color: "#555" }}>
              Weekdays in range: {weekdayCount}
            </div>
            <div style={{ fontSize: "13px", color: "#555" }}>
              Total requested hours: {totalRequestedHours.toFixed(2)}
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>
              Weekends are automatically excluded from PTO hour generation.
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              width: "fit-content",
              fontWeight: 800,
            }}
          >
            {saving ? "Submitting..." : "Submit PTO Request"}
          </button>
        </form>

        <div
          style={{
            marginTop: "16px",
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            background: "#fafafa",
            maxWidth: "900px",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: "18px", marginBottom: "12px" }}>
            {canReviewAll ? "All PTO Requests" : "My PTO Requests"}
          </div>

          {loading ? <p>Loading PTO requests...</p> : null}

          {!loading && visibleRequests.length === 0 ? (
            <p>No PTO requests found.</p>
          ) : null}

          {!loading && visibleRequests.length > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {visibleRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/pto-requests/${request.id}`}
                  style={{
                    display: "block",
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: "10px",
                    background: "white",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {request.employeeName} ({request.employeeRole})
                  </div>

                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                    {request.startDate} through {request.endDate}
                  </div>

                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                    Status: {formatStatus(request.status)}
                  </div>

                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                    Hours/Day: {request.hoursPerDay.toFixed(2)} • Total:{" "}
                    {request.totalRequestedHours.toFixed(2)}
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}