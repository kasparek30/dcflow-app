"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { Project } from "../../src/types/project";

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

function getNextStageSummary(project: Project) {
  const stages = [
    {
      label: "Rough-In",
      stage: project.roughIn,
    },
    {
      label: "Top-Out / Vent",
      stage: project.topOutVent,
    },
    {
      label: "Trim / Finish",
      stage: project.trimFinish,
    },
  ];

  const nextStage = stages.find((entry) => entry.stage.status !== "complete");

  if (!nextStage) {
    return "All stages complete";
  }

  const dateText = nextStage.stage.scheduledDate || "No date set";
  return `${nextStage.label} • ${formatStageStatus(nextStage.stage.status)} • ${dateText}`;
}

export default function ProjectsPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProjects() {
      try {
        const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const items: Project[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
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
        });

        setProjects(items);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load projects.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadProjects();
  }, []);

  return (
    <ProtectedPage fallbackTitle="Projects">
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
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
              Projects
            </h1>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "#666" }}>
              New construction, remodels, and bid-based multi-stage jobs.
            </p>
          </div>

          <Link
            href="/projects/new"
            style={{
              padding: "8px 14px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            New Project
          </Link>
        </div>

        {loading ? <p>Loading projects...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error && projects.length === 0 ? (
          <p>No projects found yet.</p>
        ) : null}

        {!loading && !error && projects.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                style={{
                  display: "block",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "12px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ fontWeight: 700 }}>{project.projectName}</div>

                <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                  Customer: {project.customerDisplayName}
                </div>

                <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                  {project.serviceAddressLine1}
                </div>

                <div style={{ marginTop: "4px", fontSize: "14px", color: "#555" }}>
                  {project.serviceCity}, {project.serviceState} {project.servicePostalCode}
                </div>

                <div style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>
                  Bid Status: {formatBidStatus(project.bidStatus)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Total Bid: ${project.totalBidAmount.toFixed(2)}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Lead Tech: {project.assignedTechnicianName || "Unassigned"}
                </div>

                <div style={{ marginTop: "4px", fontSize: "12px", color: "#777" }}>
                  Next Stage: {getNextStageSummary(project)}
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}