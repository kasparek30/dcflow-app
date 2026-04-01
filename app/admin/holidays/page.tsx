// app/admin/holidays/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { CompanyHoliday } from "../../../src/types/company-holiday";

function getYearFromDate(dateString: string) {
  if (!dateString || dateString.length < 4) return "";
  return dateString.slice(0, 4);
}

export default function AdminHolidaysPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [error, setError] = useState("");

  const currentYear = String(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYear);

  useEffect(() => {
    async function loadHolidays() {
      try {
        const q = query(collection(db, "companyHolidays"), orderBy("holidayDate"));
        const snap = await getDocs(q);

        const items: CompanyHoliday[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            name: data.name ?? "",
            holidayDate: data.holidayDate ?? "",
            paid: data.paid ?? true,
            hoursPaid: typeof data.hoursPaid === "number" ? data.hoursPaid : 8,
            isFullDay: data.isFullDay ?? true,
            scheduleBlocked: data.scheduleBlocked ?? true,
            allowEmergencyOverride: data.allowEmergencyOverride ?? true,
            appliesToRoles: Array.isArray(data.appliesToRoles)
              ? data.appliesToRoles
              : ["technician", "helper", "apprentice"],
            active: data.active ?? true,
            notes: data.notes ?? undefined,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setHolidays(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load holidays.");
      } finally {
        setLoading(false);
      }
    }

    loadHolidays();
  }, []);

  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(
        holidays
          .map((holiday) => getYearFromDate(holiday.holidayDate))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    if (!years.includes(currentYear)) {
      years.push(currentYear);
      years.sort((a, b) => a.localeCompare(b));
    }

    return years;
  }, [holidays, currentYear]);

  const filteredHolidays = useMemo(() => {
    if (selectedYear === "all") {
      return holidays;
    }

    return holidays.filter(
      (holiday) => getYearFromDate(holiday.holidayDate) === selectedYear
    );
  }, [holidays, selectedYear]);

  return (
    <ProtectedPage fallbackTitle="Employee Profiles" allowedRoles={["admin"]}>
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
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>
              Company Holidays
            </h1>
            <p style={{ marginTop: "4px", color: "#666", fontSize: "13px" }}>
              Manage closed days, paid holidays, and emergency override rules.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link
              href="/admin"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
              }}
            >
              Back to Admin
            </Link>

            <Link
              href="/admin/holidays/new"
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: "10px",
                textDecoration: "none",
                color: "inherit",
                background: "white",
                fontWeight: 700,
              }}
            >
              New Holiday
            </Link>
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
          <label style={{ fontWeight: 700 }}>Filter by Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
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
            <option value="all">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
            Showing {filteredHolidays.length} holiday
            {filteredHolidays.length === 1 ? "" : "s"}
            {selectedYear === "all" ? " across all years" : ` for ${selectedYear}`}.
          </div>
        </div>

        {loading ? <p>Loading holidays...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && filteredHolidays.length === 0 ? (
          <p>
            No holidays found
            {selectedYear === "all" ? "." : ` for ${selectedYear}.`}
          </p>
        ) : null}

        {!loading && !error && filteredHolidays.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredHolidays.map((holiday) => (
              <Link
                key={holiday.id}
                href={`/admin/holidays/${holiday.id}`}
                style={{
                  display: "block",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "12px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ fontWeight: 800 }}>{holiday.name}</div>

                <div style={{ marginTop: "4px", fontSize: "13px", color: "#555" }}>
                  Date: {holiday.holidayDate}
                </div>

                <div style={{ marginTop: "6px", fontSize: "12px", color: "#777" }}>
                  Paid: {String(holiday.paid)} • Hours: {holiday.hoursPaid} • Full Day:{" "}
                  {String(holiday.isFullDay)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Schedule Blocked: {String(holiday.scheduleBlocked)} • Emergency Override:{" "}
                  {String(holiday.allowEmergencyOverride)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Active: {String(holiday.active)}
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}