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

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [bidStatus, setBidStatus] = useState<"draft" | "submitted" | "won" | "lost">(
    "draft"
  );
  const [selectedTechnicianUid, setSelectedTechnicianUid] = useState("");

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
        setSelectedTechnicianUid(item.assignedTechnicianId ?? "");

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

  const selectedTechnician = useMemo(() => {
    return technicians.find((tech) => tech.uid === selectedTechnicianUid) ?? null;
  }, [technicians, selectedTechnicianUid]);

  async function handleSaveUpdates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!project) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const nextProject: Project = {
        ...project,
        bidStatus,
        assignedTechnicianId: selectedTechnician?.uid || undefined,
        assignedTechnicianName: selectedTechnician?.displayName || undefined,
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
        assignedTechnicianId: selectedTechnician ? selectedTechnician.uid : null,
        assignedTechnicianName: selectedTechnician
          ? selectedTechnician.displayName
          : null,
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
      if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to save project updates.");
      }
    } finally {
      setSaving(false);
    }
  }

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

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
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

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
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

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
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
                <strong>Lead Tech:</strong> {project.assignedTechnicianName || "Unassigned"}
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
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
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

              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
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

              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
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

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>
                Update Project
              </h2>

              {techLoading ? <p>Loading technicians...</p> : null}
              {techError ? <p style={{ color: "red" }}>{techError}</p> : null}

              <form
                onSubmit={handleSaveUpdates}
                style={{ display: "grid", gap: "12px", maxWidth: "900px" }}
              >
                <div>
                  <label>Bid Status</label>
                  <select
                    value={bidStatus}
                    onChange={(e) =>
                      setBidStatus(
                        e.target.value as "draft" | "submitted" | "won" | "lost"
                      )
                    }
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

                <div>
                  <label>Lead Technician</label>
                  <select
                    value={selectedTechnicianUid}
                    onChange={(e) => setSelectedTechnicianUid(e.target.value)}
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

                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "10px",
                    padding: "12px",
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Rough-In</h3>

                  <div>
                    <label>Status</label>
                    <select
                      value={roughInStatus}
                      onChange={(e) =>
                        setRoughInStatus(
                          e.target.value as
                            | "not_started"
                            | "scheduled"
                            | "in_progress"
                            | "complete"
                        )
                      }
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
                    <label>Scheduled Date</label>
                    <input
                      type="date"
                      value={roughInScheduledDate}
                      onChange={(e) => setRoughInScheduledDate(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Completed Date</label>
                    <input
                      type="date"
                      value={roughInCompletedDate}
                      onChange={(e) => setRoughInCompletedDate(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "10px",
                    padding: "12px",
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Top-Out / Vent</h3>

                  <div>
                    <label>Status</label>
                    <select
                      value={topOutVentStatus}
                      onChange={(e) =>
                        setTopOutVentStatus(
                          e.target.value as
                            | "not_started"
                            | "scheduled"
                            | "in_progress"
                            | "complete"
                        )
                      }
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
                    <label>Scheduled Date</label>
                    <input
                      type="date"
                      value={topOutVentScheduledDate}
                      onChange={(e) => setTopOutVentScheduledDate(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Completed Date</label>
                    <input
                      type="date"
                      value={topOutVentCompletedDate}
                      onChange={(e) => setTopOutVentCompletedDate(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "10px",
                    padding: "12px",
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Trim / Finish</h3>

                  <div>
                    <label>Status</label>
                    <select
                      value={trimFinishStatus}
                      onChange={(e) =>
                        setTrimFinishStatus(
                          e.target.value as
                            | "not_started"
                            | "scheduled"
                            | "in_progress"
                            | "complete"
                        )
                      }
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
                    <label>Scheduled Date</label>
                    <input
                      type="date"
                      value={trimFinishScheduledDate}
                      onChange={(e) => setTrimFinishScheduledDate(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <label>Completed Date</label>
                    <input
                      type="date"
                      value={trimFinishCompletedDate}
                      onChange={(e) => setTrimFinishCompletedDate(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px",
                        marginTop: "4px",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label>Internal Notes</label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
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
                  disabled={saving}
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
                  {saving ? "Saving..." : "Save Project Updates"}
                </button>
              </form>
            </div>

            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
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