"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Stack, TextField, Typography } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import { addDays, buildReport, mondayOf, todayChicago, type ReportData, type ReportDocument, type ReportRange } from "../../src/lib/reports/weekly-report";

const allowedRoles = ["admin", "manager", "dispatcher"];
const hours = (number: number) => number.toFixed(1);
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const initialWeek = mondayOf(todayChicago());

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadCsv(range: ReportRange, report: ReportData) {
  const rows: Array<Array<string | number>> = [
    ["DCFlow operations report", range.start, range.end],
    ["Metric", "Value"],
    ["New service tickets", report.newServiceTickets],
    ["New projects", report.newProjects],
    ["Service tickets completed", report.serviceTicketsCompleted],
    ["Projects closed", report.projectsClosed],
    ["Service invoices recorded in QBO", report.serviceInvoicesRecorded],
    ["Project invoices recorded", report.projectInvoicesRecorded],
    ["Billable worked hours", hours(report.billableHours)],
    ["Nonbillable worked hours", hours(report.nonBillableHours)],
    ["Billable share of worked hours", percent(report.billableRatio)],
    ["PTO and holiday hours (excluded from ratio)", hours(report.paidLeaveHours)],
    [],
    ["Employee", "Role", "Billable hours", "Nonbillable worked hours"],
    ...report.employeeHours.map((employee) => [employee.name, employee.role, hours(employee.billable), hours(employee.nonBillable)]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `dcflow-report-${range.start}-to-${range.end}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent>
    <Typography color="text.secondary" variant="body2">{label}</Typography>
    <Typography variant="h4" fontWeight={700} sx={{ my: 1 }}>{value}</Typography>
    {detail && <Typography color="text.secondary" variant="caption">{detail}</Typography>}
  </CardContent></Card>;
}

function ReportsContent() {
  const { appUser } = useAuthContext();
  const [range, setRange] = useState<ReportRange>({ start: initialWeek, end: addDays(initialWeek, 6) });
  const [preset, setPreset] = useState("thisWeek");
  const [report, setReport] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(range.start) && /^\d{4}-\d{2}-\d{2}$/.test(range.end) && range.start <= range.end;
  const authorized = allowedRoles.includes(appUser?.role || "");

  const choosePreset = useCallback((choice: string) => {
    const today = todayChicago();
    const monday = mondayOf(today);
    if (choice === "thisWeek") setRange({ start: monday, end: addDays(monday, 6) });
    if (choice === "lastWeek") setRange({ start: addDays(monday, -7), end: addDays(monday, -1) });
    if (choice === "month") setRange({ start: `${today.slice(0, 7)}-01`, end: today });
    setPreset(choice);
  }, []);

  useEffect(() => {
    if (!authorized || !valid) return;
    let cancelled = false;
    setBusy(true);
    setReport(null);
    setError("");
    async function load() {
      try {
        // Ticket/project lifecycle dates live in several fields and nested billing
        // records. The first pass reads those two collections and filters locally.
        const [ticketSnap, projectSnap, entrySnap] = await Promise.all([
          getDocs(collection(db, "serviceTickets")),
          getDocs(collection(db, "projects")),
          getDocs(query(collection(db, "timeEntries"), where("entryDate", ">=", range.start), where("entryDate", "<=", range.end))),
        ]);
        if (cancelled) return;
        const data = (snap: typeof ticketSnap) => snap.docs.map((document) => ({ id: document.id, ...document.data() }) as ReportDocument);
        setReport(buildReport(range, data(ticketSnap), data(projectSnap), data(entrySnap)));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load report data.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [authorized, range, valid, revision]);

  const summary = useMemo(() => report ? [
    ["New service tickets", report.newServiceTickets],
    ["New projects", report.newProjects],
    ["Service tickets completed", report.serviceTicketsCompleted],
    ["Projects closed", report.projectsClosed],
    ["Service invoices recorded", report.serviceInvoicesRecorded],
    ["Project invoices recorded", report.projectInvoicesRecorded],
    ["Billable worked hours", hours(report.billableHours)],
    ["Nonbillable worked hours", hours(report.nonBillableHours)],
    ["Billable share", percent(report.billableRatio)],
  ] as const : [], [report]);

  return <AppShell appUser={appUser}>
    <Box sx={{ maxWidth: 1400, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2} mb={3}>
        <Box><Typography variant="overline" color="primary">DCFlow</Typography><Typography variant="h4" fontWeight={750}>Operations Reports</Typography>
          <Typography color="text.secondary">Live service, project, billing, and labor activity</Typography></Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => setRevision((value) => value + 1)} disabled={busy || !valid}>Refresh</Button>
          <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={() => report && downloadCsv(range, report)} disabled={!report || busy}>Export CSV</Button>
        </Stack>
      </Stack>
      <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}><CardContent>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
          {[["thisWeek", "This week"], ["lastWeek", "Last week"], ["month", "Month to date"]].map(([key, label]) =>
            <Button key={key} size="small" variant={preset === key ? "contained" : "outlined"} onClick={() => choosePreset(key)}>{label}</Button>)}
          {preset === "custom" && <Chip label="Custom range" color="primary" />}
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
          <TextField label="From" type="date" size="small" value={range.start} slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => { setPreset("custom"); setRange((previous) => ({ ...previous, start: event.target.value })); }} />
          <TextField label="Through" type="date" size="small" value={range.end} slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => { setPreset("custom"); setRange((previous) => ({ ...previous, end: event.target.value })); }} />
        </Stack>
        {!valid && <Alert severity="warning" sx={{ mt: 2 }}>Choose a valid start and end date.</Alert>}
      </CardContent></Card>
      {busy && <Stack direction="row" gap={2} alignItems="center" mb={3}><CircularProgress size={22} /><Typography>Loading report…</Typography></Stack>}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {report && <>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" } }}>
          <Metric label="New service tickets" value={report.newServiceTickets} />
          <Metric label="New projects" value={report.newProjects} />
          <Metric label="Service tickets completed" value={report.serviceTicketsCompleted} detail="First recorded completion or ready-to-bill date" />
          <Metric label="Projects closed" value={report.projectsClosed} />
          <Metric label="Invoices recorded" value={report.serviceInvoicesRecorded + report.projectInvoicesRecorded} detail="Service QBO syncs + project billing events" />
          <Metric label="Billable worked hours" value={hours(report.billableHours)} />
          <Metric label="Nonbillable worked hours" value={hours(report.nonBillableHours)} />
          <Metric label="Billable share" value={percent(report.billableRatio)} detail="Billable ÷ all worked hours" />
        </Box>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, mt: 3, alignItems: "start" }}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="h6" fontWeight={700} mb={2}>Hours by employee</Typography>
            {report.employeeHours.length === 0 ? <Typography color="text.secondary">No worked time entries in this range.</Typography> :
              report.employeeHours.map((employee) => <Stack key={employee.id} direction="row" justifyContent="space-between" gap={2} sx={{ py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
                <Box><Typography fontWeight={600}>{employee.name}</Typography><Typography variant="caption" color="text.secondary">{employee.role}</Typography></Box>
                <Typography textAlign="right">{hours(employee.billable)} billable<br /><Typography component="span" variant="caption" color="text.secondary">{hours(employee.nonBillable)} nonbillable</Typography></Typography>
              </Stack>)}
            <Typography variant="body2" color="text.secondary" mt={2}>PTO and holiday: {hours(report.paidLeaveHours)} hours, excluded from the worked-hours ratio.</Typography>
          </CardContent></Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent>
            <Typography variant="overline" color="primary">Weekly summary preview</Typography>
            <Typography variant="h6" fontWeight={700}>Operations Summary</Typography>
            <Typography color="text.secondary" mb={2}>{range.start} through {range.end}</Typography>
            <Divider sx={{ mb: 1 }} />
            {summary.map(([label, value]) => <Stack key={label} direction="row" justifyContent="space-between" gap={2} py={0.8}><Typography variant="body2">{label}</Typography><Typography variant="body2" fontWeight={700}>{value}</Typography></Stack>)}
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary">Times use America/Chicago dates. Invoice counts mean recorded QBO service syncs and project billing events; they do not confirm an email was sent. Draft time entries are included and may change after payroll review. Records lacking a lifecycle date are excluded from that event count.</Typography>
          </CardContent></Card>
        </Box>
      </>}
    </Box>
  </AppShell>;
}

export default function ReportsPage() {
  return <ProtectedPage fallbackTitle="Reports" allowedRoles={allowedRoles}><ReportsContent /></ProtectedPage>;
}
