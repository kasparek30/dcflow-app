"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { Project } from "../../../src/types/project";
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

  // ✅ Assignment (primary + optional secondary + helpers)
  const [primaryTechnicianUid, setPrimaryTechnicianUid] = useState("");
  const [secondaryTechnicianUid, setSecondaryTechnicianUid] = useState("");
  const [helperUids, setHelperUids] = useState<string[]>([]);
  const [useDefaultHelper, setUseDefaultHelper] = useState(true);

  const [roughInStatus, setRoughInStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [roughInScheduledDate, setRoughInScheduledDate] = useState("");
  const [roughInCompletedDate, setRoughInCompletedDate] = useState("");

  const [topOutVentStatus, setTopOutVentStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [topOutVentScheduledDate, setTopOutVentScheduledDate] = useState("");
  const [topOutVentCompletedDate, setTopOutVentCompletedDate] = useState("");

  const [trimFinishStatus, setTrimFinishStatus] = useState<
    "not_started" | "scheduled" | "in_progress" | "complete"
  >("not_started");
  const [trimFinishScheduledDate, setTrimFinishScheduledDate] = useState("");
  const [trimFinishCompletedDate, setTrimFinishCompletedDate] = useState("");

  const [internalNotes, setInternalNotes] = useState("");

  const canEdit = appUser?.role === "admin" || appUser?.role === "dispatcher";

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
          assignedTechnicianId: data.assignedTechnicianId ?? undefined,
          assignedTechnicianName: data.assignedTechnicianName ?? undefined,
          internalNotes: data.internalNotes ?? undefined,
          active: data.active ?? true,
          createdAt: data.createdAt ?? undefined,
          updatedAt: data.updatedAt ?? undefined,
        };

        setProject(item);

        setBidStatus(item.bidStatus);

        // Seed assignment values:
        // Prefer new fields if present, fallback to legacy lead tech.
        const seededPrimary =
          (data.primaryTechnicianId as string | undefined) ||
          item.assignedTechnicianId ||
          "";

        setPrimaryTechnicianUid(seededPrimary);
        setSecondaryTechnicianUid((data.secondaryTechnicianId as string | undefined) || "");

        const seededHelpers = Array.isArray(data.helperIds) ? data.helperIds.filter(Boolean) : [];
        setHelperUids(seededHelpers);

        setRoughInStatus(item.roughIn.status);
        setRoughInScheduledDate(item.roughIn.scheduledDate ?? "");
        setRoughInCompletedDate(item.roughIn.completedDate ?? "");

        setTopOutVentStatus(item.topOutVent.status);
        setTopOutVentScheduledDate(item.topOutVent.scheduledDate ?? "");
        setTopOutVentCompletedDate(item.topOutVent.completedDate ?? "");

        setTrimFinishStatus(item.trimFinish.status);
        setTrimFinishScheduledDate(item.trimFinish.scheduledDate ?? "");
        setTrimFinishCompletedDate(item.trimFinish.completedDate ?? "");

        setInternalNotes(item.internalNotes ?? "");
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load project.");
        }
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
        if (err instanceof Error) {
          setTechError(err.message);
        } else {
          setTechError("Failed to load technicians.");
        }
      } finally {
        setTechLoading(false);
      }
    }

    loadTechnicians();
  }, []);

  // -----------------------------
  // Load Employee Profiles (for helpers)
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

  const primaryTechnician = useMemo(() => {
    return technicians.find((t) => t.uid === primaryTechnicianUid) ?? null;
  }, [technicians, primaryTechnicianUid]);

  const secondaryTechnician = useMemo(() => {
    return technicians.find((t) => t.uid === secondaryTechnicianUid) ?? null;
  }, [technicians, secondaryTechnicianUid]);

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

  const defaultHelpersForPrimary = useMemo(() => {
    const techUid = primaryTechnicianUid.trim();
    if (!techUid) return [];

    return employeeProfiles
      .filter((p) => (p.employmentStatus || "current").toLowerCase() === "current")
      .filter((p) => ["helper", "apprentice"].includes(normalizeRole(p.laborRole)))
      .filter((p) => String(p.defaultPairedTechUid || "").trim() === techUid)
      .map((p) => String(p.userUid || "").trim())
      .filter(Boolean);
  }, [employeeProfiles, primaryTechnicianUid]);

  useEffect(() => {
    if (!useDefaultHelper) return;

    const techUid = primaryTechnicianUid.trim();
    if (!techUid) {
      setHelperUids([]);
      return;
    }

    setHelperUids(Array.from(new Set(defaultHelpersForPrimary)));
  }, [primaryTechnicianUid, defaultHelpersForPrimary, useDefaultHelper]);

  const helperNames = useMemo(() => {
    const profileMap = new Map<string, string>();
    for (const p of employeeProfiles) {
      const uid = String(p.userUid || "").trim();
      if (!uid) continue;
      if (p.displayName) profileMap.set(uid, p.displayName);
    }
    return helperUids.map((uid) => profileMap.get(uid) || uid);
  }, [helperUids, employeeProfiles]);

  function toggleHelper(uid: string) {
    setUseDefaultHelper(false);
    setHelperUids((prev) => {
      if (prev.includes(uid)) return prev.filter((x) => x !== uid);
      return [...prev, uid];
    });
  }

  async function handleSaveUpdates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!project) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const primaryUid = primaryTechnicianUid.trim() || null;
      const secondaryUid = secondaryTechnicianUid.trim() || null;

      // For future per-person views (optional but helpful to store now)
      const teamIds: string[] = [];
      if (primaryUid) teamIds.push(primaryUid);
      if (secondaryUid && secondaryUid !== primaryUid) teamIds.push(secondaryUid);
      for (const h of helperUids) {
        if (h && !teamIds.includes(h)) teamIds.push(h);
      }

      const nextProject: Project = {
        ...project,
        bidStatus,
        assignedTechnicianId: primaryUid || undefined,
        assignedTechnicianName: primaryUid ? primaryTechnician?.displayName || undefined : undefined,
        roughIn: {
          ...project.roughIn,
          status: roughInStatus,
          scheduledDate: roughInScheduledDate || undefined,
          completedDate: roughInCompletedDate || undefined,
        },
        topOutVent: {
          ...project.topOutVent,
          status: topOutVentStatus,
          scheduledDate: topOutVentScheduledDate || undefined,
          completedDate: topOutVentCompletedDate || undefined,
        },
        trimFinish: {
          ...project.trimFinish,
          status: trimFinishStatus,
          scheduledDate: trimFinishScheduledDate || undefined,
          completedDate: trimFinishCompletedDate || undefined,
        },
        internalNotes: internalNotes.trim() || undefined,
        updatedAt: nowIso,
      };

      await updateDoc(doc(db, "projects", project.id), {
        bidStatus,

        // Legacy lead tech fields remain the "primary tech"
        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryUid ? primaryTechnician?.displayName || null : null,

        // New staffing fields
        primaryTechnicianId: primaryUid,
        secondaryTechnicianId: secondaryUid,
        secondaryTechnicianName: secondaryUid ? secondaryTechnician?.displayName || null : null,

        helperIds: helperUids.length ? helperUids : null,
        helperNames: helperUids.length ? helperNames : null,

        // Optional team array for future per-person views
        assignedTechnicianIds: teamIds.length ? teamIds : null,

        roughIn: {
          ...project.roughIn,
          status: roughInStatus,
          scheduledDate: roughInScheduledDate || null,
          completedDate: roughInCompletedDate || null,
        },
        topOutVent: {
          ...project.topOutVent,
          status: topOutVentStatus,
          scheduledDate: topOutVentScheduledDate || null,
          completedDate: topOutVentCompletedDate || null,
        },
        trimFinish: {
          ...project.trimFinish,
          status: trimFinishStatus,
          scheduledDate: trimFinishScheduledDate || null,
          completedDate: trimFinishCompletedDate || null,
        },

        internalNotes: internalNotes.trim() || null,
        updatedAt: nowIso,
      });

      setProject(nextProject);
      setSaveSuccess("Project updates saved successfully.");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save project updates.");
    } finally {
      setSaving(false);
    }
  }

  const assignmentSnapshot = useMemo(() => {
    const primary = primaryTechnician ? primaryTechnician.displayName : project?.assignedTechnicianName || "Unassigned";
    const secondary = secondaryTechnician ? secondaryTechnician.displayName : "—";
    const helpers = helperNames.length ? helperNames.join(", ") : "—";
    return { primary, secondary, helpers };
  }, [primaryTechnician, secondaryTechnician, helperNames, project]);

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
                <p style={{ marginTop: "6px", color: "#666" }}>
                  Project ID: {projectId}
                </p>
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
              <p>
                <strong>Primary Tech:</strong> {assignmentSnapshot.primary}
              </p>
              <p>
                <strong>Secondary Tech:</strong> {assignmentSnapshot.secondary}
              </p>
              <p>
                <strong>Helper/Apprentice:</strong> {assignmentSnapshot.helpers}
              </p>
              <p style={{ marginTop: "10px" }}>
                <strong>Description:</strong>
              </p>
              <p>{project.description || "No description yet."}</p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "10px" }}>Rough-In</h3>
                <p>
                  <strong>Status:</strong> {formatStageStatus(project.roughIn.status)}
                </p>
                <p>
                  <strong>Scheduled:</strong> {project.roughIn.scheduledDate || "—"}
                </p>
                <p>
                  <strong>Completed:</strong> {project.roughIn.completedDate || "—"}
                </p>
                <p>
                  <strong>Billing:</strong> ${project.roughIn.billedAmount.toFixed(2)}
                </p>
                <p>
                  <strong>Billed:</strong> {String(project.roughIn.billed)}
                </p>
              </div>

              <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "10px" }}>Top-Out / Vent</h3>
                <p>
                  <strong>Status:</strong> {formatStageStatus(project.topOutVent.status)}
                </p>
                <p>
                  <strong>Scheduled:</strong> {project.topOutVent.scheduledDate || "—"}
                </p>
                <p>
                  <strong>Completed:</strong> {project.topOutVent.completedDate || "—"}
                </p>
                <p>
                  <strong>Billing:</strong> ${project.topOutVent.billedAmount.toFixed(2)}
                </p>
                <p>
                  <strong>Billed:</strong> {String(project.topOutVent.billed)}
                </p>
              </div>

              <div style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "16px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "10px" }}>Trim / Finish</h3>
                <p>
                  <strong>Status:</strong> {formatStageStatus(project.trimFinish.status)}
                </p>
                <p>
                  <strong>Scheduled:</strong> {project.trimFinish.scheduledDate || "—"}
                </p>
                <p>
                  <strong>Completed:</strong> {project.trimFinish.completedDate || "—"}
                </p>
                <p>
                  <strong>Billing:</strong> ${project.trimFinish.billedAmount.toFixed(2)}
                </p>
                <p>
                  <strong>Billed:</strong> {String(project.trimFinish.billed)}
                </p>
              </div>
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

                {/* ✅ Assignment */}
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "10px",
                    padding: "12px",
                    background: "#fafafa",
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Assignment</h3>

                  <div>
                    <label>Primary Technician</label>
                    <select
                      value={primaryTechnicianUid}
                      onChange={(e) => setPrimaryTechnicianUid(e.target.value)}
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

                    <p style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                      Projects are often created unassigned. Dispatch can assign later.
                    </p>
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Secondary Technician (Optional)</label>
                    <select
                      value={secondaryTechnicianUid}
                      onChange={(e) => setSecondaryTechnicianUid(e.target.value)}
                      disabled={!canEdit || !primaryTechnicianUid}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    >
                      <option value="">— None —</option>
                      {technicians
                        .filter((t) => t.uid !== primaryTechnicianUid)
                        .map((tech) => (
                          <option key={tech.uid} value={tech.uid}>
                            {tech.displayName}
                          </option>
                        ))}
                    </select>

                    <p style={{ marginTop: "6px", fontSize: "12px", color: "#666" }}>
                      Only use this for two true technicians. Helpers/apprentices belong below.
                    </p>
                  </div>

                  <div style={{ marginTop: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
                    <label style={{ display: "block", fontWeight: 700 }}>Helper / Apprentice</label>

                    <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
                      <input
                        type="checkbox"
                        checked={useDefaultHelper}
                        onChange={(e) => setUseDefaultHelper(e.target.checked)}
                        disabled={!canEdit}
                      />
                      Use default helper pairing (recommended)
                    </label>

                    <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                      {helperCandidates.length === 0 ? (
                        <p style={{ fontSize: "12px", color: "#666" }}>
                          No helper/apprentice profiles found. Set laborRole + pairing in Employee Profiles.
                        </p>
                      ) : (
                        helperCandidates.map((h) => {
                          const checked = helperUids.includes(h.uid);
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
                                onChange={() => toggleHelper(h.uid)}
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

                    <p style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                      If you manually change helpers, we automatically turn off “use default pairing” so it won’t overwrite your selection.
                    </p>
                  </div>
                </div>

                {/* Stages */}
                <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Rough-In</h3>

                  <div>
                    <label>Status</label>
                    <select
                      value={roughInStatus}
                      onChange={(e) =>
                        setRoughInStatus(
                          e.target.value as "not_started" | "scheduled" | "in_progress" | "complete"
                        )
                      }
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    >
                      <option value="not_started">Not Started</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Scheduled Date</label>
                    <input
                      type="date"
                      value={roughInScheduledDate}
                      onChange={(e) => setRoughInScheduledDate(e.target.value)}
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Completed Date</label>
                    <input
                      type="date"
                      value={roughInCompletedDate}
                      onChange={(e) => setRoughInCompletedDate(e.target.value)}
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    />
                  </div>
                </div>

                <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Top-Out / Vent</h3>

                  <div>
                    <label>Status</label>
                    <select
                      value={topOutVentStatus}
                      onChange={(e) =>
                        setTopOutVentStatus(
                          e.target.value as "not_started" | "scheduled" | "in_progress" | "complete"
                        )
                      }
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    >
                      <option value="not_started">Not Started</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Scheduled Date</label>
                    <input
                      type="date"
                      value={topOutVentScheduledDate}
                      onChange={(e) => setTopOutVentScheduledDate(e.target.value)}
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Completed Date</label>
                    <input
                      type="date"
                      value={topOutVentCompletedDate}
                      onChange={(e) => setTopOutVentCompletedDate(e.target.value)}
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    />
                  </div>
                </div>

                <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "12px" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Trim / Finish</h3>

                  <div>
                    <label>Status</label>
                    <select
                      value={trimFinishStatus}
                      onChange={(e) =>
                        setTrimFinishStatus(
                          e.target.value as "not_started" | "scheduled" | "in_progress" | "complete"
                        )
                      }
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    >
                      <option value="not_started">Not Started</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Scheduled Date</label>
                    <input
                      type="date"
                      value={trimFinishScheduledDate}
                      onChange={(e) => setTrimFinishScheduledDate(e.target.value)}
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Completed Date</label>
                    <input
                      type="date"
                      value={trimFinishCompletedDate}
                      onChange={(e) => setTrimFinishCompletedDate(e.target.value)}
                      disabled={!canEdit}
                      style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
                    />
                  </div>
                </div>

                <div>
                  <label>Internal Notes</label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                    disabled={!canEdit}
                    style={{ display: "block", width: "100%", padding: "8px", marginTop: "4px" }}
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