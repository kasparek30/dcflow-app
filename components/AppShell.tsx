"use client";

import Link from "next/link";
import { ReactNode } from "react";
import LogoutButton from "./LogoutButton";
import type { AppUser } from "../src/types/app-user";

export default function AppShell({
  children,
  appUser,
}: {
  children: ReactNode;
  appUser: AppUser | null;
}) {
  const role = appUser?.role;

  const showDashboard =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "billing" ||
    role === "office_display";

  const showAdmin = role === "admin";
  const showTechnician = role === "technician" || role === "admin";
  const showDispatch =
    role === "admin" || role === "dispatcher" || role === "manager";
  const showSchedule =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display";
  const showOfficeDisplay =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display";
  const showMonthlySchedule =
    role === "admin" ||
    role === "dispatcher" ||
    role === "manager" ||
    role === "office_display";
  const showProjects =
    role === "admin" || role === "dispatcher" || role === "manager";
  const showWorkload =
    role === "admin" || role === "dispatcher" || role === "manager";
  const showTimeEntries =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";
  const showWeeklyTimesheet =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";
  const showTimesheetReview =
    role === "admin" || role === "manager" || role === "dispatcher";
  const showPTORequests =
    role === "admin" ||
    role === "manager" ||
    role === "dispatcher" ||
    role === "technician" ||
    role === "helper" ||
    role === "apprentice";

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: "260px",
          borderRight: "1px solid #ddd",
          padding: "16px",
          background: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>
          DCFlow
        </h1>

        <div style={{ marginBottom: "20px", fontSize: "14px" }}>
          <div style={{ fontWeight: 600 }}>
            {appUser?.displayName || "Unknown User"}
          </div>
          <div style={{ color: "#666", marginTop: "4px" }}>
            {appUser?.role || "No Role"}
          </div>
        </div>

        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          {showDashboard ? <Link href="/dashboard">Dashboard</Link> : null}
          {showDispatch ? <Link href="/dispatch">Dispatcher Board</Link> : null}
          {showSchedule ? <Link href="/schedule">Weekly Schedule</Link> : null}
          {showMonthlySchedule ? (
            <Link href="/monthly-schedule">Monthly Schedule</Link>
          ) : null}
          {showOfficeDisplay ? <Link href="/office-display">Office Display</Link> : null}
          {showProjects ? <Link href="/projects">Projects</Link> : null}
          {showWorkload ? <Link href="/technician-workload">Technician Workload</Link> : null}
          {showTimeEntries ? <Link href="/time-entries">Time Entries</Link> : null}
          {showWeeklyTimesheet ? <Link href="/weekly-timesheet">Weekly Timesheet</Link> : null}
          {showPTORequests ? <Link href="/pto-requests">PTO Requests</Link> : null}
          {showTimesheetReview ? <Link href="/timesheet-review">Timesheet Review</Link> : null}
          {showAdmin ? <Link href="/admin">Admin</Link> : null}
          {showTechnician ? <Link href="/technician">Technician</Link> : null}
          <Link href="/customers">Customers</Link>
          <Link href="/service-tickets">Service Tickets</Link>
        </nav>

        <LogoutButton />
      </aside>

      <main style={{ flex: 1, padding: "24px" }}>{children}</main>
    </div>
  );
}