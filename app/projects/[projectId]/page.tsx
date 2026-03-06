"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { Project, StageStaffing } from "../../../src/types/project";
import type { AppUser } from "../../../src/types/app-user";

type ProjectDetailPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

type TechnicianOption = {
  uid: string;
  displayName: string;
  active: boolean;
  role: AppUser["role"];
};

type EmployeeProfileOption = {
  id: string;
  userUid?: string | null;
  displayName?: string;
  employmentStatus?: string;
  laborRole?: string; // helper/apprentice/technician/etc
  defaultPairedTechUid?: string | null;
};

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

function formatBidStatus(status: Project["bidStatus"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    default:
      return status;
  }
}

function formatStageStatus(status: Project["roughIn"]["status"]) {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "complete":
      return "Complete";
    default:
      return status;
  }
}

type StageKey = "roughIn" | "topOutVent" | "trimFinish";

type StageAssignmentState = {
  primaryUid: string;
  secondaryUid: string;
  helperUids: string[];
  useDefaultHelper: boolean;
  overrideEnabled: boolean; // if false -> stage uses project defaults (no staffing saved)
};

function emptyStageAssignment(): StageAssignmentState {
  return {
    primaryUid: "",
    secondaryUid: "",
    helperUids: [],
    useDefaultHelper: true,
    overrideEnabled: false,
  };
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  const [techLoading, setTechLoading] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techError, setTechError] = useState("");

  const [profilesLoading, setProfilesLoading] = useState(true);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [profilesError, setProfilesError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [bidStatus, setBidStatus] = useState<"draft" | "submitted" | "won" | "lost">(
    "draft"
  );

  // ✅ Project-level default crew (fallback)
  const [projectPrimaryUid, setProjectPrimaryUid] = useState("");
  const [projectSecondaryUid, setProjectSecondaryUid] = useState("");
  const [projectHelperUids, setProjectHelperUids] = useState<string[]>([]);
  const [projectUseDefaultHelper, setProjectUseDefaultHelper] = useState(true);

  // ✅ Stage-level crew (override)
  const [roughInAssign, setRoughInAssign] = useState<StageAssignmentState>(
    emptyStageAssignment()
  );
  const [topOutAssign, setTopOutAssign] = useState<StageAssignmentState>(
    emptyStageAssignment()
  );
  const [trimAssign, setTrimAssign] = useState<StageAssignmentState>(
    emptyStageAssignment()
  );

  const [roughInStatus, setRoughInStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [roughInScheduledDate, setRoughInScheduledDate] = useState("");
  const [roughInScheduledEndDate, setRoughInScheduledEndDate] = useState("");
  const [roughInCompletedDate, setRoughInCompletedDate] = useState("");

  const [topOutVentStatus, setTopOutVentStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [topOutVentScheduledDate, setTopOutVentScheduledDate] = useState("");
  const [topOutVentScheduledEndDate, setTopOutVentScheduledEndDate] = useState("");
  const [topOutVentCompletedDate, setTopOutVentCompletedDate] = useState("");

  const [trimFinishStatus, setTrimFinishStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [trimFinishScheduledDate, setTrimFinishScheduledDate] = useState("");
  const [trimFinishScheduledEndDate, setTrimFinishScheduledEndDate] = useState("");
  const [trimFinishCompletedDate, setTrimFinishCompletedDate] = useState("");

  const [internalNotes, setInternalNotes] = useState("");

  const canEdit = appUser?.role === "admin" || appUser?.role === "dispatcher";

  // -----------------------------
  // Helpers: profiles + pairing
  // -----------------------------
  const helperCandidates = useMemo(() => {
    const candidates: { uid: string; name: string; laborRole: string }[] = [];

    for (const p of employeeProfiles) {
      if ((p.employmentStatus || "current").toLowerCase() !== "current") continue;
      const labor = normalizeRole(p.laborRole);
      if (labor !== "helper" && labor !== "apprentice") continue;

      const uid = String(p.userUid || "").trim();
      if (!uid) continue;

      candidates.push({
        uid,
        name: p.displayName || "Unnamed",
        laborRole: labor,
      });
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));
    return candidates;
  }, [employeeProfiles]);

  function computeDefaultHelpersForTech(techUid: string) {
    const uid = techUid.trim();
    if (!uid) return [];
    return employeeProfiles
      .filter((p) => (p.employmentStatus || "current").toLowerCase() === "current")
      .filter((p) => ["helper", "apprentice"].includes(normalizeRole(p.laborRole)))
      .filter((p) => String(p.defaultPairedTechUid || "").trim() === uid)
      .map((p) => String(p.userUid || "").trim())
      .filter(Boolean);
  }

  function helperNamesFromUids(uids: string[]) {
    const profileMap = new Map<string, string>();
    for (const p of employeeProfiles) {
      const uid = String(p.userUid || "").trim();
      if (!uid) continue;
      if (p.displayName) profileMap.set(uid, p.displayName);
    }
    return uids.map((uid) => profileMap.get(uid) || uid);
  }

  function findTechName(uid: string) {
    const tech = technicians.find((t) => t.uid === uid);
    return tech?.displayName || "";
  }

  // -----------------------------
  // Load Project
  // -----------------------------
  useEffect(() => {
    async function loadProject() {
      try {
        const resolvedParams = await params;
        const id = resolvedParams.projectId;
        setProjectId(id);

        const projectRef = doc(db, "projects", id);
        const snap = await getDoc(projectRef);

        if (!snap.exists()) {
          setError("Project not found.");
          setLoading(false);
          return;
        }

        const data = snap.data();

        const item: Project = {
          id: snap.id,
          customerId: data.customerId ?? "",
          customerDisplayName: data.customerDisplayName ?? "",
          serviceAddressId: data.serviceAddressId ?? undefined,
          serviceAddressLabel: data.serviceAddressLabel ?? undefined,
          serviceAddressLine1: data.serviceAddressLine1 ?? "",
          serviceAddressLine2: data.serviceAddressLine2 ?? undefined,
          serviceCity: data.serviceCity ?? "",
          serviceState: data.serviceState ?? "",
          servicePostalCode: data.servicePostalCode ?? "",
          projectName: data.projectName ?? "",
          projectType: data.projectType ?? "other",
          description: data.description ?? undefined,
          bidStatus: data.bidStatus ?? "draft",
          totalBidAmount: data.totalBidAmount ?? 0,
          roughIn: data.roughIn ?? {
            status: "not_started",
            billed: false,
            billedAmount: 0,
          },
          topOutVent: data.topOutVent ?? {
            status: "not_started",
            billed: false,
            billedAmount: 0,
          },
          trimFinish: data.trimFinish ?? {
            status: "not_started",
            billed: false,
            billedAmount: 0,
          },

          // legacy (keep)
          assignedTechnicianId: data.assignedTechnicianId ?? undefined,
          assignedTechnicianName: data.assignedTechnicianName ?? undefined,

          // project default crew (optional)
          primaryTechnicianId: data.primaryTechnicianId ?? undefined,
          secondaryTechnicianId: data.secondaryTechnicianId ?? undefined,
          helperIds: Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : undefined,

          internalNotes: data.internalNotes ?? undefined,
          active: data.active ?? true,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        } as any;

        setProject(item);
        setBidStatus(item.bidStatus);

        // project default seed: prefer new primary, else legacy assigned
        const seededProjectPrimary =
          (data.primaryTechnicianId as string | undefined) ||
          item.assignedTechnicianId ||
          "";

        setProjectPrimaryUid(seededProjectPrimary);
        setProjectSecondaryUid((data.secondaryTechnicianId as string | undefined) || "");
        setProjectHelperUids(
          Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : []
        );

        // stage seeds
        const stageStaffing = (stage: any): StageStaffing | undefined => {
          return stage?.staffing ? stage.staffing : undefined;
        };

        const roughStaff = stageStaffing(item.roughIn);
        const topStaff = stageStaffing(item.topOutVent);
        const trimStaff = stageStaffing(item.trimFinish);

        setRoughInAssign({
          primaryUid: roughStaff?.primaryTechnicianId || "",
          secondaryUid: roughStaff?.secondaryTechnicianId || "",
          helperUids: Array.isArray(roughStaff?.helperIds) ? roughStaff!.helperIds! : [],
          useDefaultHelper: true,
          overrideEnabled: Boolean(roughStaff),
        });

        setTopOutAssign({
          primaryUid: topStaff?.primaryTechnicianId || "",
          secondaryUid: topStaff?.secondaryTechnicianId || "",
          helperUids: Array.isArray(topStaff?.helperIds) ? topStaff!.helperIds! : [],
          useDefaultHelper: true,
          overrideEnabled: Boolean(topStaff),
        });

        setTrimAssign({
          primaryUid: trimStaff?.primaryTechnicianId || "",
          secondaryUid: trimStaff?.secondaryTechnicianId || "",
          helperUids: Array.isArray(trimStaff?.helperIds) ? trimStaff!.helperIds! : [],
          useDefaultHelper: true,
          overrideEnabled: Boolean(trimStaff),
        });

        // stage status/dates
        setRoughInStatus(item.roughIn.status);
        setRoughInScheduledDate(item.roughIn.scheduledDate ?? "");
        setRoughInScheduledEndDate((item.roughIn as any).scheduledEndDate ?? "");
        setRoughInCompletedDate(item.roughIn.completedDate ?? "");

        setTopOutVentStatus(item.topOutVent.status);
        setTopOutVentScheduledDate(item.topOutVent.scheduledDate ?? "");
        setTopOutVentScheduledEndDate((item.topOutVent as any).scheduledEndDate ?? "");
        setTopOutVentCompletedDate(item.topOutVent.completedDate ?? "");

        setTrimFinishStatus(item.trimFinish.status);
        setTrimFinishScheduledDate(item.trimFinish.scheduledDate ?? "");
        setTrimFinishScheduledEndDate((item.trimFinish as any).scheduledEndDate ?? "");
        setTrimFinishCompletedDate(item.trimFinish.completedDate ?? "");

        setInternalNotes(item.internalNotes ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load project.");
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [params]);

  // -----------------------------
  // Load Technicians
  // -----------------------------
  useEffect(() => {
    async function loadTechnicians() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: TechnicianOption[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              uid: data.uid ?? docSnap.id,
              displayName: data.displayName ?? "Unnamed Technician",
              active: data.active ?? false,
              role: data.role ?? "technician",
            };
          })
          .filter((user) => user.role === "technician" && user.active);

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setTechnicians(items);
      } catch (err: unknown) {
        setTechError(err instanceof Error ? err.message : "Failed to load technicians.");
      } finally {
        setTechLoading(false);
      }
    }

    loadTechnicians();
  }, []);

  // -----------------------------
  // Load Employee Profiles
  // -----------------------------
  useEffect(() => {
    async function loadProfiles() {
      setProfilesLoading(true);
      setProfilesError("");

      try {
        const snap = await getDocs(collection(db, "employeeProfiles"));
        const items: EmployeeProfileOption[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userUid: d.userUid ?? null,
            displayName: d.displayName ?? undefined,
            employmentStatus: d.employmentStatus ?? "current",
            laborRole: d.laborRole ?? "other",
            defaultPairedTechUid: d.defaultPairedTechUid ?? null,
          };
        });

        setEmployeeProfiles(items);
      } catch (err: unknown) {
        setProfilesError(err instanceof Error ? err.message : "Failed to load employee profiles.");
      } finally {
        setProfilesLoading(false);
      }
    }

    loadProfiles();
  }, []);

  // -----------------------------
  // Auto default helpers (project-level)
  // -----------------------------
  useEffect(() => {
    if (!projectUseDefaultHelper) return;

    const techUid = projectPrimaryUid.trim();
    if (!techUid) {
      setProjectHelperUids([]);
      return;
    }

    setProjectHelperUids(Array.from(new Set(computeDefaultHelpersForTech(techUid))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPrimaryUid, projectUseDefaultHelper, employeeProfiles]);

  // -----------------------------
  // Auto default helpers (stage-level)
  // only when overrideEnabled + useDefaultHelper
  // -----------------------------
  useEffect(() => {
    if (!roughInAssign.overrideEnabled || !roughInAssign.useDefaultHelper) return;
    const techUid = roughInAssign.primaryUid.trim();
    if (!techUid) {
      setRoughInAssign((p) => ({ ...p, helperUids: [] }));
      return;
    }
    setRoughInAssign((p) => ({
      ...p,
      helperUids: Array.from(new Set(computeDefaultHelpersForTech(techUid))),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roughInAssign.primaryUid,
    roughInAssign.overrideEnabled,
    roughInAssign.useDefaultHelper,
    employeeProfiles,
  ]);

  useEffect(() => {
    if (!topOutAssign.overrideEnabled || !topOutAssign.useDefaultHelper) return;
    const techUid = topOutAssign.primaryUid.trim();
    if (!techUid) {
      setTopOutAssign((p) => ({ ...p, helperUids: [] }));
      return;
    }
    setTopOutAssign((p) => ({
      ...p,
      helperUids: Array.from(new Set(computeDefaultHelpersForTech(techUid))),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    topOutAssign.primaryUid,
    topOutAssign.overrideEnabled,
    topOutAssign.useDefaultHelper,
    employeeProfiles,
  ]);

  useEffect(() => {
    if (!trimAssign.overrideEnabled || !trimAssign.useDefaultHelper) return;
    const techUid = trimAssign.primaryUid.trim();
    if (!techUid) {
      setTrimAssign((p) => ({ ...p, helperUids: [] }));
      return;
    }
    setTrimAssign((p) => ({
      ...p,
      helperUids: Array.from(new Set(computeDefaultHelpersForTech(techUid))),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trimAssign.primaryUid,
    trimAssign.overrideEnabled,
    trimAssign.useDefaultHelper,
    employeeProfiles,
  ]);

  // -----------------------------
  // UI helpers
  // -----------------------------
  function toggleHelperForProject(uid: string) {
    setProjectUseDefaultHelper(false);
    setProjectHelperUids((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  }

  function toggleHelperForStage(stage: StageKey, uid: string) {
    if (stage === "roughIn") {
      setRoughInAssign((p) => {
        const next = p.helperUids.includes(uid)
          ? p.helperUids.filter((x) => x !== uid)
          : [...p.helperUids, uid];
        return { ...p, helperUids: next, useDefaultHelper: false };
      });
      return;
    }
    if (stage === "topOutVent") {
      setTopOutAssign((p) => {
        const next = p.helperUids.includes(uid)
          ? p.helperUids.filter((x) => x !== uid)
          : [...p.helperUids, uid];
        return { ...p, helperUids: next, useDefaultHelper: false };
      });
      return;
    }
    setTrimAssign((p) => {
      const next = p.helperUids.includes(uid)
        ? p.helperUids.filter((x) => x !== uid)
        : [...p.helperUids, uid];
      return { ...p, helperUids: next, useDefaultHelper: false };
    });
  }

  function getEffectiveCrewForStage(stageKey: StageKey): { primary: string; secondary: string; helpers: string[] } {
    const stageState =
      stageKey === "roughIn"
        ? roughInAssign
        : stageKey === "topOutVent"
          ? topOutAssign
          : trimAssign;

    if (stageState.overrideEnabled) {
      return {
        primary: stageState.primaryUid,
        secondary: stageState.secondaryUid,
        helpers: stageState.helperUids,
      };
    }

    return {
      primary: projectPrimaryUid,
      secondary: projectSecondaryUid,
      helpers: projectHelperUids,
    };
  }

  // -----------------------------
  // Save
  // -----------------------------
  async function handleSaveUpdates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!project) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      // project-level crew
      const projPrimary = projectPrimaryUid.trim() || null;
      const projSecondary = projectSecondaryUid.trim() || null;
      const projHelpers = projectHelperUids;

      const projHelperNames = projHelpers.length ? helperNamesFromUids(projHelpers) : [];

      // stage-level staffing payload builder
      function buildStageStaffingPayload(stage: StageAssignmentState): StageStaffing | null {
        if (!stage.overrideEnabled) return null;

        const primaryUid = stage.primaryUid.trim();
        const secondaryUid = stage.secondaryUid.trim();
        const helpers = stage.helperUids;

        const primaryName = primaryUid ? findTechName(primaryUid) : "";
        const secondaryName = secondaryUid ? findTechName(secondaryUid) : "";
        const names = helpers.length ? helperNamesFromUids(helpers) : [];

        const staffing: StageStaffing = {
          primaryTechnicianId: primaryUid || undefined,
          primaryTechnicianName: primaryName || undefined,
          secondaryTechnicianId: secondaryUid || undefined,
          secondaryTechnicianName: secondaryName || undefined,
          helperIds: helpers.length ? helpers : undefined,
          helperNames: helpers.length ? names : undefined,
        };

        return staffing;
      }

      const roughStaff = buildStageStaffingPayload(roughInAssign);
      const topStaff = buildStageStaffingPayload(topOutAssign);
      const trimStaff = buildStageStaffingPayload(trimAssign);

      function staffingToFirestore(staff: StageStaffing | null) {
        if (!staff) return null;
        return {
          primaryTechnicianId: staff.primaryTechnicianId || null,
          primaryTechnicianName: staff.primaryTechnicianName || null,
          secondaryTechnicianId: staff.secondaryTechnicianId || null,
          secondaryTechnicianName: staff.secondaryTechnicianName || null,
          helperIds: staff.helperIds && staff.helperIds.length ? staff.helperIds : null,
          helperNames: staff.helperNames && staff.helperNames.length ? staff.helperNames : null,
        };
      }

      const nextRoughIn = {
        ...project.roughIn,
        status: roughInStatus,
        scheduledDate: roughInScheduledDate || null,
        scheduledEndDate: roughInScheduledEndDate || null,
        completedDate: roughInCompletedDate || null,
        staffing: staffingToFirestore(roughStaff),
      };

      const nextTopOut = {
        ...project.topOutVent,
        status: topOutVentStatus,
        scheduledDate: topOutVentScheduledDate || null,
        scheduledEndDate: topOutVentScheduledEndDate || null,
        completedDate: topOutVentCompletedDate || null,
        staffing: staffingToFirestore(topStaff),
      };

      const nextTrim = {
        ...project.trimFinish,
        status: trimFinishStatus,
        scheduledDate: trimFinishScheduledDate || null,
        scheduledEndDate: trimFinishScheduledEndDate || null,
        completedDate: trimFinishCompletedDate || null,
        staffing: staffingToFirestore(trimStaff),
      };

      await updateDoc(doc(db, "projects", project.id), {
        bidStatus,

        // Project-level default crew + legacy fields
        primaryTechnicianId: projPrimary,
        primaryTechnicianName: projPrimary ? findTechName(projPrimary) || null : null,
        secondaryTechnicianId: projSecondary,
        secondaryTechnicianName: projSecondary ? findTechName(projSecondary) || null : null,
        helperIds: projHelpers.length ? projHelpers : null,
        helperNames: projHelpers.length ? projHelperNames : null,

        assignedTechnicianId: projPrimary,
        assignedTechnicianName: projPrimary ? findTechName(projPrimary) || null : null,

        roughIn: nextRoughIn,
        topOutVent: nextTopOut,
        trimFinish: nextTrim,

        internalNotes: internalNotes.trim() || null,
        updatedAt: nowIso,
      });

      const nextProject: Project = {
        ...project,
        bidStatus,

        primaryTechnicianId: projPrimary || undefined,
        primaryTechnicianName: projPrimary ? findTechName(projPrimary) || undefined : undefined,
        secondaryTechnicianId: projSecondary || undefined,
        secondaryTechnicianName: projSecondary ? findTechName(projSecondary) || undefined : undefined,
        helperIds: projHelpers.length ? projHelpers : undefined,
        helperNames: projHelpers.length ? projHelperNames : undefined,

        assignedTechnicianId: projPrimary || undefined,
        assignedTechnicianName: projPrimary ? findTechName(projPrimary) || undefined : undefined,

        roughIn: {
          ...project.roughIn,
          status: roughInStatus,
          scheduledDate: roughInScheduledDate || undefined,
          scheduledEndDate: roughInScheduledEndDate || undefined,
          completedDate: roughInCompletedDate || undefined,
          staffing: roughStaff || undefined,
        } as any,

        topOutVent: {
          ...project.topOutVent,
          status: topOutVentStatus,
          scheduledDate: topOutVentScheduledDate || undefined,
          scheduledEndDate: topOutVentScheduledEndDate || undefined,
          completedDate: topOutVentCompletedDate || undefined,
          staffing: topStaff || undefined,
        } as any,

        trimFinish: {
          ...project.trimFinish,
          status: trimFinishStatus,
          scheduledDate: trimFinishScheduledDate || undefined,
          scheduledEndDate: trimFinishScheduledEndDate || undefined,
          completedDate: trimFinishCompletedDate || undefined,
          staffing: trimStaff || undefined,
        } as any,

        internalNotes: internalNotes.trim() || undefined,
        updatedAt: nowIso,
      } as any;

      setProject(nextProject);
      setSaveSuccess("Project updates saved successfully.");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save project updates.");
    } finally {
      setSaving(false);
    }
  }

  // Snapshot display
  const projectHelperNames = useMemo(
    () => helperNamesFromUids(projectHelperUids),
    [projectHelperUids, employeeProfiles]
  );
  const projectPrimaryName = projectPrimaryUid ? findTechName(projectPrimaryUid) : "";
  const projectSecondaryName = projectSecondaryUid ? findTechName(projectSecondaryUid) : "";

  const stageSummary = useMemo(() => {
    function stageLine(stageKey: StageKey) {
      const crew = getEffectiveCrewForStage(stageKey);
      const primary = crew.primary ? findTechName(crew.primary) : "Unassigned";
      const secondary = crew.secondary ? findTechName(crew.secondary) : "—";
      const helpers = crew.helpers.length ? helperNamesFromUids(crew.helpers).join(", ") : "—";
      const overridden =
        stageKey === "roughIn"
          ? roughInAssign.overrideEnabled
          : stageKey === "topOutVent"
            ? topOutAssign.overrideEnabled
            : trimAssign.overrideEnabled;

      return { primary, secondary, helpers, overridden };
    }

    return {
      roughIn: stageLine("roughIn"),
      topOutVent: stageLine("topOutVent"),
      trimFinish: stageLine("trimFinish"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectPrimaryUid,
    projectSecondaryUid,
    projectHelperUids,
    roughInAssign,
    topOutAssign,
    trimAssign,
    technicians,
    employeeProfiles,
  ]);

  return (
    <ProtectedPage fallbackTitle="Project Detail">
      <AppShell appUser={appUser}>
        {loading ? <p>Loading project...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && project ? (
          <div style={{ display: "grid", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
                  {project.projectName}
                </h1>
                <p style={{ marginTop: "6px", color: "#666" }}>Project ID: {projectId}</p>
              </div>

              <Link
                href="/projects"
                style={{
                  padding: "8px 14px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                Back to Projects
              </Link>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Customer
              </h2>
              <p>
                <strong>Customer Name:</strong> {project.customerDisplayName}
              </p>
              <p>
                <strong>Customer ID:</strong> {project.customerId}
              </p>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Project Address
              </h2>
              <p>
                <strong>Label:</strong> {project.serviceAddressLabel || "—"}
              </p>
              <p>{project.serviceAddressLine1}</p>
              <p>{project.serviceAddressLine2 || ""}</p>
              <p>
                {project.serviceCity}, {project.serviceState} {project.servicePostalCode}
              </p>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                Project Overview
              </h2>
              <p>
                <strong>Project Type:</strong> {project.projectType}
              </p>
              <p>
                <strong>Bid Status:</strong> {formatBidStatus(project.bidStatus)}
              </p>
              <p>
                <strong>Total Bid:</strong> ${project.totalBidAmount.toFixed(2)}
              </p>

              <p style={{ marginTop: "10px", marginBottom: "6px", fontWeight: 700 }}>
                Default Crew
              </p>
              <p>
                <strong>Primary Tech:</strong> {projectPrimaryName || "Unassigned"}
              </p>
              <p>
                <strong>Secondary Tech:</strong> {projectSecondaryName || "—"}
              </p>
              <p>
                <strong>Helper/Apprentice:</strong>{" "}
                {projectHelperNames.length ? projectHelperNames.join(", ") : "—"}
              </p>

              <p style={{ marginTop: "10px" }}>
                <strong>Description:</strong>
              </p>
              <p>{project.description || "No description yet."}</p>
            </div>

            {/* Stage cards with summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              {(
                [
                  ["roughIn", "Rough-In", project.roughIn],
                  ["topOutVent", "Top-Out / Vent", project.topOutVent],
                  ["trimFinish", "Trim / Finish", project.trimFinish],
                ] as const
              ).map(([key, label, stage]) => {
                const sum = stageSummary[key];
                const start = stage.scheduledDate || "";
                const end = (stage as any).scheduledEndDate || "";
                const scheduleText = start
                  ? end && end !== start
                    ? `${start} → ${end}`
                    : start
                  : "—";

                return (
                  <div
                    key={key}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "12px",
                      padding: "16px",
                    }}
                  >
                    <h3 style={{ marginTop: 0, marginBottom: "10px" }}>{label}</h3>
                    <p>
                      <strong>Status:</strong> {formatStageStatus(stage.status)}
                    </p>
                    <p>
                      <strong>Scheduled:</strong> {scheduleText}
                    </p>
                    <p>
                      <strong>Completed:</strong> {stage.completedDate || "—"}
                    </p>
                    <p>
                      <strong>Billing:</strong> ${stage.billedAmount.toFixed(2)}
                    </p>
                    <p>
                      <strong>Billed:</strong> {String(stage.billed)}
                    </p>

                    <div
                      style={{
                        marginTop: "10px",
                        borderTop: "1px solid #eee",
                        paddingTop: "10px",
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 700, fontSize: "13px" }}>
                        {sum.overridden ? "Stage Crew (override)" : "Stage Crew (using default)"}
                      </p>
                      <p style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                        <strong>Primary:</strong> {sum.primary}
                        <br />
                        <strong>Secondary:</strong> {sum.secondary}
                        <br />
                        <strong>Helper:</strong> {sum.helpers}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>
                Update Project
              </h2>

              {techLoading ? <p>Loading technicians...</p> : null}
              {techError ? <p style={{ color: "red" }}>{techError}</p> : null}
              {profilesLoading ? <p>Loading employee profiles...</p> : null}
              {profilesError ? <p style={{ color: "red" }}>{profilesError}</p> : null}

              <form
                onSubmit={handleSaveUpdates}
                style={{ display: "grid", gap: "12px", maxWidth: "900px" }}
              >
                <div>
                  <label>Bid Status</label>
                  <select
                    value={bidStatus}
                    onChange={(e) =>
                      setBidStatus(e.target.value as "draft" | "submitted" | "won" | "lost")
                    }
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  >
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                {/* Project default crew */}
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "10px",
                    padding: "12px",
                    background: "#fafafa",
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>
                    Default Crew (Project-level)
                  </h3>

                  <div>
                    <label>Primary Technician</label>
                    <select
                      value={projectPrimaryUid}
                      onChange={(e) => setProjectPrimaryUid(e.target.value)}
                      disabled={!canEdit}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    >
                      <option value="">Unassigned</option>
                      {technicians.map((tech) => (
                        <option key={tech.uid} value={tech.uid}>
                          {tech.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Secondary Technician (Optional)</label>
                    <select
                      value={projectSecondaryUid}
                      onChange={(e) => setProjectSecondaryUid(e.target.value)}
                      disabled={!canEdit || !projectPrimaryUid}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    >
                      <option value="">— None —</option>
                      {technicians
                        .filter((t) => t.uid !== projectPrimaryUid)
                        .map((tech) => (
                          <option key={tech.uid} value={tech.uid}>
                            {tech.displayName}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div
                    style={{
                      marginTop: "12px",
                      borderTop: "1px solid #eee",
                      paddingTop: "12px",
                    }}
                  >
                    <label style={{ display: "block", fontWeight: 700 }}>
                      Helper / Apprentice
                    </label>

                    <label
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        marginTop: "8px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={projectUseDefaultHelper}
                        onChange={(e) => setProjectUseDefaultHelper(e.target.checked)}
                        disabled={!canEdit}
                      />
                      Use default helper pairing (recommended)
                    </label>

                    <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                      {helperCandidates.length === 0 ? (
                        <p style={{ fontSize: "12px", color: "#666" }}>
                          No helper/apprentice profiles found. Set laborRole + pairing in Employee
                          Profiles.
                        </p>
                      ) : (
                        helperCandidates.map((h) => {
                          const checked = projectHelperUids.includes(h.uid);
                          return (
                            <label
                              key={h.uid}
                              style={{
                                display: "flex",
                                gap: "10px",
                                alignItems: "center",
                                border: "1px solid #eee",
                                borderRadius: "10px",
                                padding: "8px",
                                background: "white",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleHelperForProject(h.uid)}
                                disabled={!canEdit}
                              />
                              <div style={{ fontSize: "13px" }}>
                                <strong>{h.name}</strong>{" "}
                                <span style={{ color: "#777" }}>({h.laborRole})</span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Stage controls */}
                {(
                  [
                    [
                      "roughIn",
                      "Rough-In",
                      roughInAssign,
                      setRoughInAssign,
                      roughInStatus,
                      setRoughInStatus,
                      roughInScheduledDate,
                      setRoughInScheduledDate,
                      roughInScheduledEndDate,
                      setRoughInScheduledEndDate,
                      roughInCompletedDate,
                      setRoughInCompletedDate,
                    ],
                    [
                      "topOutVent",
                      "Top-Out / Vent",
                      topOutAssign,
                      setTopOutAssign,
                      topOutVentStatus,
                      setTopOutVentStatus,
                      topOutVentScheduledDate,
                      setTopOutVentScheduledDate,
                      topOutVentScheduledEndDate,
                      setTopOutVentScheduledEndDate,
                      topOutVentCompletedDate,
                      setTopOutVentCompletedDate,
                    ],
                    [
                      "trimFinish",
                      "Trim / Finish",
                      trimAssign,
                      setTrimAssign,
                      trimFinishStatus,
                      setTrimFinishStatus,
                      trimFinishScheduledDate,
                      setTrimFinishScheduledDate,
                      trimFinishScheduledEndDate,
                      setTrimFinishScheduledEndDate,
                      trimFinishCompletedDate,
                      setTrimFinishCompletedDate,
                    ],
                  ] as const
                ).map(
                  ([
                    stageKey,
                    label,
                    stageState,
                    setStageState,
                    stageStatus,
                    setStageStatus,
                    sched,
                    setSched,
                    schedEnd,
                    setSchedEnd,
                    comp,
                    setComp,
                  ]) => (
                    <div
                      key={stageKey}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: "10px",
                        padding: "12px",
                      }}
                    >
                      <h3 style={{ marginTop: 0, marginBottom: "12px" }}>{label}</h3>

                      <label
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          marginBottom: "10px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={stageState.overrideEnabled}
                          onChange={(e) =>
                            setStageState((p) => ({
                              ...p,
                              overrideEnabled: e.target.checked,
                            }))
                          }
                          disabled={!canEdit}
                        />
                        Override staffing for this stage (otherwise uses project default crew)
                      </label>

                      {stageState.overrideEnabled ? (
                        <div style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
                          <div>
                            <label>Stage Primary Technician</label>
                            <select
                              value={stageState.primaryUid}
                              onChange={(e) =>
                                setStageState((p) => ({
                                  ...p,
                                  primaryUid: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "8px",
                                marginTop: "4px",
                              }}
                            >
                              <option value="">Unassigned</option>
                              {technicians.map((tech) => (
                                <option key={tech.uid} value={tech.uid}>
                                  {tech.displayName}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label>Stage Secondary Technician (Optional)</label>
                            <select
                              value={stageState.secondaryUid}
                              onChange={(e) =>
                                setStageState((p) => ({
                                  ...p,
                                  secondaryUid: e.target.value,
                                }))
                              }
                              disabled={!canEdit || !stageState.primaryUid}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "8px",
                                marginTop: "4px",
                              }}
                            >
                              <option value="">— None —</option>
                              {technicians
                                .filter((t) => t.uid !== stageState.primaryUid)
                                .map((tech) => (
                                  <option key={tech.uid} value={tech.uid}>
                                    {tech.displayName}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div style={{ borderTop: "1px solid #eee", paddingTop: "10px" }}>
                            <label style={{ display: "block", fontWeight: 700 }}>
                              Stage Helpers
                            </label>

                            <label
                              style={{
                                display: "flex",
                                gap: "8px",
                                alignItems: "center",
                                marginTop: "8px",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={stageState.useDefaultHelper}
                                onChange={(e) =>
                                  setStageState((p) => ({
                                    ...p,
                                    useDefaultHelper: e.target.checked,
                                  }))
                                }
                                disabled={!canEdit}
                              />
                              Use default helper pairing (recommended)
                            </label>

                            <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                              {helperCandidates.length === 0 ? (
                                <p style={{ fontSize: "12px", color: "#666" }}>
                                  No helper/apprentice profiles found.
                                </p>
                              ) : (
                                helperCandidates.map((h) => {
                                  const checked = stageState.helperUids.includes(h.uid);
                                  return (
                                    <label
                                      key={h.uid}
                                      style={{
                                        display: "flex",
                                        gap: "10px",
                                        alignItems: "center",
                                        border: "1px solid #eee",
                                        borderRadius: "10px",
                                        padding: "8px",
                                        background: "white",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleHelperForStage(stageKey as StageKey, h.uid)}
                                        disabled={!canEdit}
                                      />
                                      <div style={{ fontSize: "13px" }}>
                                        <strong>{h.name}</strong>{" "}
                                        <span style={{ color: "#777" }}>({h.laborRole})</span>
                                      </div>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <label>Status</label>
                        <select
                          value={stageStatus}
                          onChange={(e) =>
                            setStageStatus(
                              e.target.value as
                                | "not_started"
                                | "scheduled"
                                | "in_progress"
                                | "complete"
                            )
                          }
                          disabled={!canEdit}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "8px",
                            marginTop: "4px",
                          }}
                        >
                          <option value="not_started">Not Started</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="in_progress">In Progress</option>
                          <option value="complete">Complete</option>
                        </select>
                      </div>

                      <div style={{ marginTop: "10px" }}>
                        <label>Scheduled Start Date</label>
                        <input
                          type="date"
                          value={sched}
                          onChange={(e) => setSched(e.target.value)}
                          disabled={!canEdit}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "8px",
                            marginTop: "4px",
                          }}
                        />
                      </div>

                      <div style={{ marginTop: "10px" }}>
                        <label>Scheduled End Date (optional)</label>
                        <input
                          type="date"
                          value={schedEnd}
                          onChange={(e) => setSchedEnd(e.target.value)}
                          disabled={!canEdit}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "8px",
                            marginTop: "4px",
                          }}
                        />
                        <p style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                          Leave blank for a single-day stage. If set, this stage blocks the crew across the full date range.
                        </p>
                      </div>

                      <div style={{ marginTop: "10px" }}>
                        <label>Completed Date</label>
                        <input
                          type="date"
                          value={comp}
                          onChange={(e) => setComp(e.target.value)}
                          disabled={!canEdit}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "8px",
                            marginTop: "4px",
                          }}
                        />
                      </div>
                    </div>
                  )
                )}

                <div>
                  <label>Internal Notes</label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    disabled={!canEdit}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                {saveError ? <p style={{ color: "red" }}>{saveError}</p> : null}
                {saveSuccess ? <p style={{ color: "green" }}>{saveSuccess}</p> : null}

                <button
                  type="submit"
                  disabled={saving || !canEdit}
                  style={{
                    padding: "10px 16px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    width: "fit-content",
                  }}
                >
                  {saving ? "Saving..." : canEdit ? "Save Project Updates" : "Read Only"}
                </button>
              </form>
            </div>

            <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
                System
              </h2>
              <p>
                <strong>Active:</strong> {String(project.active)}
              </p>
              <p>
                <strong>Created At:</strong> {project.createdAt || "—"}
              </p>
              <p>
                <strong>Updated At:</strong> {project.updatedAt || "—"}
              </p>
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}