// app/admin/auto-suggest-sync/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  getDocs,
  query,
  updateDoc,
  doc,
} from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { getPayrollWeekBounds } from "../../../src/lib/payroll";
import type { AppUser } from "../../../src/types/app-user";

type ServiceTicketVisitRecord = {
  id: string;
  serviceTicketId: string;
  customerDisplayName?: string;
  visitDate: string;
  leadTechnicianId: string;
  leadTechnicianName: string;
  supportUserId?: string;
  supportUserName?: string;
  hoursWorked: number;
  billableHours: number;
};

type ProjectRecord = {
  id: string;
  customerDisplayName: string;
  projectName: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  roughIn: {
    scheduledDate?: string;
    status?: string;
  };
  topOutVent: {
    scheduledDate?: string;
    status?: string;
  };
  trimFinish: {
    scheduledDate?: string;
    status?: string;
  };
};

type TimeEntryRecord = {
  id: string;
  employeeId: string;
  entryDate: string;
  category: string;
  source: string;
  serviceTicketId?: string;
  projectId?: string;
  projectStageKey?: string;
  notes?: string;
};

function stageLabel(stageKey: "roughIn" | "topOutVent" | "trimFinish") {
  switch (stageKey) {
    case "roughIn":
      return "Rough-In";
    case "topOutVent":
      return "Top-Out / Vent";
    case "trimFinish":
      return "Trim / Finish";
    default:
      return stageKey;
  }
}

export default function AutoSuggestSyncPage() {
  const { appUser } = useAuthContext();

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<{
    created: number;
    updated: number;
    visitEntries: number;
    projectEntries: number;
  } | null>(null);

  async function findExistingAutoSuggestedEntry(
    allTimeEntries: TimeEntryRecord[],
    {
      employeeId,
      entryDate,
      category,
      serviceTicketId,
      projectId,
      projectStageKey,
      notesPrefix,
    }: {
      employeeId: string;
      entryDate: string;
      category: string;
      serviceTicketId?: string;
      projectId?: string;
      projectStageKey?: string;
      notesPrefix: string;
    }
  ) {
    return (
      allTimeEntries.find((entry) => {
        if (entry.employeeId !== employeeId) return false;
        if (entry.entryDate !== entryDate) return false;
        if (entry.category !== category) return false;
        if (entry.source !== "auto_suggested") return false;

        if ((serviceTicketId ?? null) !== (entry.serviceTicketId ?? null)) return false;
        if ((projectId ?? null) !== (entry.projectId ?? null)) return false;
        if ((projectStageKey ?? null) !== (entry.projectStageKey ?? null)) return false;

        return (entry.notes ?? "").startsWith(notesPrefix);
      }) ?? null
    );
  }

  async function handleRunSync() {
    setRunning(true);
    setError("");
    setResults(null);

    try {
      const [visitsSnap, projectsSnap, timeEntriesSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, "serviceTicketVisits"))),
        getDocs(query(collection(db, "projects"))),
        getDocs(query(collection(db, "timeEntries"))),
        getDocs(query(collection(db, "users"))),
      ]);

      const allUsers: AppUser[] = usersSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          uid: data.uid ?? docSnap.id,
          displayName: data.displayName ?? "Unnamed User",
          email: data.email ?? "",
          role: data.role ?? "technician",
          active: data.active ?? true,
          laborRoleType: data.laborRoleType ?? undefined,
          preferredTechnicianId: data.preferredTechnicianId ?? null,
          preferredTechnicianName: data.preferredTechnicianName ?? null,
          holidayEligible: data.holidayEligible ?? undefined,
          defaultDailyHolidayHours: data.defaultDailyHolidayHours ?? undefined,
        };
      });

      const userMap = new Map(allUsers.map((user) => [user.uid, user]));

      const visits: ServiceTicketVisitRecord[] = visitsSnap.docs.map((docSnap) => {
        const data = docSnap.data();

        return {
          id: docSnap.id,
          serviceTicketId: data.serviceTicketId ?? "",
          customerDisplayName: data.customerDisplayName ?? undefined,
          visitDate: data.visitDate ?? "",
          leadTechnicianId: data.leadTechnicianId ?? "",
          leadTechnicianName: data.leadTechnicianName ?? "",
          supportUserId: data.supportUserId ?? undefined,
          supportUserName: data.supportUserName ?? undefined,
          hoursWorked: typeof data.hoursWorked === "number" ? data.hoursWorked : 0,
          billableHours:
            typeof data.billableHours === "number" ? data.billableHours : 0,
        };
      });

      const projects: ProjectRecord[] = projectsSnap.docs.map((docSnap) => {
        const data = docSnap.data();

        return {
          id: docSnap.id,
          customerDisplayName: data.customerDisplayName ?? "",
          projectName: data.projectName ?? "",
          assignedTechnicianId: data.assignedTechnicianId ?? undefined,
          assignedTechnicianName: data.assignedTechnicianName ?? undefined,
          roughIn: data.roughIn ?? {},
          topOutVent: data.topOutVent ?? {},
          trimFinish: data.trimFinish ?? {},
        };
      });

      const allTimeEntries: TimeEntryRecord[] = timeEntriesSnap.docs.map((docSnap) => {
        const data = docSnap.data();

        return {
          id: docSnap.id,
          employeeId: data.employeeId ?? "",
          entryDate: data.entryDate ?? "",
          category: data.category ?? "",
          source: data.source ?? "",
          serviceTicketId: data.serviceTicketId ?? undefined,
          projectId: data.projectId ?? undefined,
          projectStageKey: data.projectStageKey ?? undefined,
          notes: data.notes ?? undefined,
        };
      });

      let created = 0;
      let updated = 0;
      let visitEntries = 0;
      let projectEntries = 0;

      // ------------------------------
      // 1) Sync service ticket visits
      // ------------------------------
      for (const visit of visits) {
        if (!visit.visitDate || !visit.serviceTicketId) continue;
        if (!visit.leadTechnicianId) continue;
        if (visit.hoursWorked <= 0) continue;

        const employee = userMap.get(visit.leadTechnicianId);
        if (!employee) continue;

        const { weekStartDate, weekEndDate } = getPayrollWeekBounds(visit.visitDate);
        const billable = visit.billableHours > 0;
        const notesPrefix = `AUTO_VISIT:${visit.id}`;

        const existing = await findExistingAutoSuggestedEntry(allTimeEntries, {
          employeeId: employee.uid,
          entryDate: visit.visitDate,
          category: "service_ticket",
          serviceTicketId: visit.serviceTicketId,
          notesPrefix,
        });

        const payload = {
          employeeId: employee.uid,
          employeeName: employee.displayName,
          employeeRole: employee.role,
          laborRoleType: employee.laborRoleType ?? null,

          entryDate: visit.visitDate,
          weekStartDate,
          weekEndDate,

          category: "service_ticket",
          hours: visit.hoursWorked,
          payType: "regular",
          billable,
          source: "auto_suggested",

          serviceTicketId: visit.serviceTicketId,
          projectId: null,
          projectStageKey: null,

          linkedTechnicianId: null,
          linkedTechnicianName: null,

          notes:
            `${notesPrefix} • Visit session for ticket ${visit.serviceTicketId}` +
            (visit.customerDisplayName ? ` • ${visit.customerDisplayName}` : ""),
          timesheetId: null,

          entryStatus: "draft",
          updatedAt: new Date().toISOString(),
        };

        if (existing) {
          await updateDoc(doc(db, "timeEntries", existing.id), payload);
          updated += 1;
        } else {
          const nowIso = new Date().toISOString();
          const docRef = await addDoc(collection(db, "timeEntries"), {
            ...payload,
            createdAt: nowIso,
          });

          allTimeEntries.push({
            id: docRef.id,
            employeeId: employee.uid,
            entryDate: visit.visitDate,
            category: "service_ticket",
            source: "auto_suggested",
            serviceTicketId: visit.serviceTicketId,
            notes: payload.notes,
          });

          created += 1;
        }

        visitEntries += 1;

        // Optional support helper/apprentice mirrored suggestion
        if (visit.supportUserId) {
          const supportUser = userMap.get(visit.supportUserId);

          if (supportUser) {
            const supportNotesPrefix = `AUTO_VISIT_SUPPORT:${visit.id}`;

            const supportExisting = await findExistingAutoSuggestedEntry(allTimeEntries, {
              employeeId: supportUser.uid,
              entryDate: visit.visitDate,
              category: "service_ticket",
              serviceTicketId: visit.serviceTicketId,
              notesPrefix: supportNotesPrefix,
            });

            const supportPayload = {
              employeeId: supportUser.uid,
              employeeName: supportUser.displayName,
              employeeRole: supportUser.role,
              laborRoleType: supportUser.laborRoleType ?? null,

              entryDate: visit.visitDate,
              weekStartDate,
              weekEndDate,

              category: "service_ticket",
              hours: visit.hoursWorked,
              payType: "regular",
              billable: false,
              source: "auto_suggested",

              serviceTicketId: visit.serviceTicketId,
              projectId: null,
              projectStageKey: null,

              linkedTechnicianId: employee.uid,
              linkedTechnicianName: employee.displayName,

              notes:
                `${supportNotesPrefix} • Support labor for ticket ${visit.serviceTicketId}` +
                (visit.customerDisplayName ? ` • ${visit.customerDisplayName}` : ""),
              timesheetId: null,

              entryStatus: "draft",
              updatedAt: new Date().toISOString(),
            };

            if (supportExisting) {
              await updateDoc(doc(db, "timeEntries", supportExisting.id), supportPayload);
              updated += 1;
            } else {
              const nowIso = new Date().toISOString();
              const docRef = await addDoc(collection(db, "timeEntries"), {
                ...supportPayload,
                createdAt: nowIso,
              });

              allTimeEntries.push({
                id: docRef.id,
                employeeId: supportUser.uid,
                entryDate: visit.visitDate,
                category: "service_ticket",
                source: "auto_suggested",
                serviceTicketId: visit.serviceTicketId,
                notes: supportPayload.notes,
              });

              created += 1;
            }

            visitEntries += 1;
          }
        }
      }

      // ------------------------------
      // 2) Sync project stages
      // ------------------------------
      for (const project of projects) {
        if (!project.assignedTechnicianId) continue;

        const employee = userMap.get(project.assignedTechnicianId);
        if (!employee) continue;

        const stageDefs = [
          { key: "roughIn" as const, data: project.roughIn },
          { key: "topOutVent" as const, data: project.topOutVent },
          { key: "trimFinish" as const, data: project.trimFinish },
        ];

        for (const stageDef of stageDefs) {
          const scheduledDate = stageDef.data?.scheduledDate;
          const stageStatus = stageDef.data?.status ?? "not_started";

          if (!scheduledDate) continue;
          if (stageStatus === "complete") continue;

          const { weekStartDate, weekEndDate } = getPayrollWeekBounds(scheduledDate);
          const notesPrefix = `AUTO_PROJECT:${project.id}:${stageDef.key}`;

          const existing = await findExistingAutoSuggestedEntry(allTimeEntries, {
            employeeId: employee.uid,
            entryDate: scheduledDate,
            category: "project_stage",
            projectId: project.id,
            projectStageKey: stageDef.key,
            notesPrefix,
          });

          const payload = {
            employeeId: employee.uid,
            employeeName: employee.displayName,
            employeeRole: employee.role,
            laborRoleType: employee.laborRoleType ?? null,

            entryDate: scheduledDate,
            weekStartDate,
            weekEndDate,

            category: "project_stage",
            hours: 8,
            payType: "regular",
            billable: true,
            source: "auto_suggested",

            serviceTicketId: null,
            projectId: project.id,
            projectStageKey: stageDef.key,

            linkedTechnicianId: null,
            linkedTechnicianName: null,

            notes:
              `${notesPrefix} • ${project.projectName} • ${stageLabel(stageDef.key)}` +
              (project.customerDisplayName ? ` • ${project.customerDisplayName}` : ""),
            timesheetId: null,

            entryStatus: "draft",
            updatedAt: new Date().toISOString(),
          };

          if (existing) {
            await updateDoc(doc(db, "timeEntries", existing.id), payload);
            updated += 1;
          } else {
            const nowIso = new Date().toISOString();
            const docRef = await addDoc(collection(db, "timeEntries"), {
              ...payload,
              createdAt: nowIso,
            });

            allTimeEntries.push({
              id: docRef.id,
              employeeId: employee.uid,
              entryDate: scheduledDate,
              category: "project_stage",
              source: "auto_suggested",
              projectId: project.id,
              projectStageKey: stageDef.key,
              notes: payload.notes,
            });

            created += 1;
          }

          projectEntries += 1;
        }
      }

      setResults({
        created,
        updated,
        visitEntries,
        projectEntries,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run auto-suggest sync."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="Auto-Suggest Time Sync">
      <AppShell appUser={appUser}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              Auto-Suggest Time Sync
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Generate or refresh auto-suggested time entries from service ticket visits and scheduled project stages.
            </p>
          </div>

          <Link
            href="/admin"
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
            Back to Admin
          </Link>
        </div>

        <div
          style={{
            marginTop: "16px",
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            maxWidth: "820px",
            background: "#fafafa",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "18px" }}>
            What this sync does
          </div>

          <div style={{ fontSize: "13px", color: "#555" }}>
            <strong>Service Ticket Visits:</strong> each visit session creates or refreshes an auto-suggested time entry for the lead technician.
          </div>

          <div style={{ fontSize: "13px", color: "#555" }}>
            <strong>Support Labor:</strong> if a helper/apprentice is attached to the visit, a mirrored support time entry is also created.
          </div>

          <div style={{ fontSize: "13px", color: "#555" }}>
            <strong>Project Stages:</strong> each scheduled stage creates or refreshes an auto-suggested 8-hour project-stage time entry for the assigned technician.
          </div>

          <div style={{ fontSize: "12px", color: "#666" }}>
            These entries are still reviewable in the Weekly Timesheet before payroll approval.
          </div>

          <button
            type="button"
            onClick={handleRunSync}
            disabled={running}
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
            {running ? "Running Sync..." : "Run Auto-Suggest Sync"}
          </button>
        </div>

        {error ? (
          <p style={{ marginTop: "16px", color: "red" }}>{error}</p>
        ) : null}

        {results ? (
          <div
            style={{
              marginTop: "16px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "16px",
              maxWidth: "820px",
              background: "#fafafa",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "18px" }}>
              Sync Results
            </div>

            <div style={{ fontSize: "14px", color: "#444" }}>
              Created: {results.created}
            </div>
            <div style={{ fontSize: "14px", color: "#444" }}>
              Updated: {results.updated}
            </div>
            <div style={{ fontSize: "14px", color: "#444" }}>
              Visit-based entries processed: {results.visitEntries}
            </div>
            <div style={{ fontSize: "14px", color: "#444" }}>
              Project-stage entries processed: {results.projectEntries}
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}