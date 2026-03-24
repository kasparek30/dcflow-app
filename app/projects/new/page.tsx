"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceAddress } from "../../../src/types/customer";

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

type CustomerOption = {
  id: string;
  displayName: string;
  phonePrimary: string;
  billingAddressLine1: string;
  billingAddressLine2?: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  serviceAddresses: ServiceAddress[];
};

type ProjectType = "new_construction" | "remodel" | "time_materials";

function getCustomerSearchText(customer: CustomerOption) {
  return [
    customer.displayName,
    customer.phonePrimary,
    customer.billingAddressLine1,
    customer.billingAddressLine2,
    customer.billingCity,
    customer.billingState,
    customer.billingPostalCode,
    ...customer.serviceAddresses.flatMap((addr) => [
      addr.label,
      addr.addressLine1,
      addr.addressLine2,
      addr.city,
      addr.state,
      addr.postalCode,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function money2(n: number) {
  return Number((Number(n) || 0).toFixed(2));
}

function buildStageBilledAmounts(projectType: ProjectType, totalBid: number) {
  const bid = Number(totalBid) || 0;

  if (projectType === "new_construction") {
    return {
      roughIn: money2(bid * 0.25),
      topOutVent: money2(bid * 0.5),
      trimFinish: money2(bid * 0.25),
    };
  }

  if (projectType === "remodel") {
    return {
      roughIn: money2(bid * 0.5),
      topOutVent: 0,
      trimFinish: money2(bid * 0.5),
    };
  }

  // time_materials
  return {
    roughIn: 0,
    topOutVent: 0,
    trimFinish: 0,
  };
}

function uid() {
  // good enough for filenames/keys
  return Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

export default function NewProjectPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [customersLoading, setCustomersLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersError, setCustomersError] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("new_construction");
  const [description, setDescription] = useState("");
  const [bidStatus, setBidStatus] = useState<"draft" | "submitted" | "won" | "lost">("draft");
  const [totalBidAmount, setTotalBidAmount] = useState("0");
  const [internalNotes, setInternalNotes] = useState("");

  // ✅ Job Site Address (not customer service address dropdown)
  const [jobStreet1, setJobStreet1] = useState("");
  const [jobStreet2, setJobStreet2] = useState("");
  const [jobCity, setJobCity] = useState("");
  const [jobState, setJobState] = useState("TX");
  const [jobZip, setJobZip] = useState("");

  // ✅ Plans upload
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [uploadingPlans, setUploadingPlans] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // -----------------------------
  // Load customers
  // -----------------------------
  useEffect(() => {
    async function loadCustomers() {
      try {
        const snap = await getDocs(collection(db, "customers"));

        const items: CustomerOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            id: docSnap.id,
            displayName: data.displayName ?? "",
            phonePrimary: data.phonePrimary ?? "",
            billingAddressLine1: data.billingAddressLine1 ?? "",
            billingAddressLine2: data.billingAddressLine2 ?? undefined,
            billingCity: data.billingCity ?? "",
            billingState: data.billingState ?? "",
            billingPostalCode: data.billingPostalCode ?? "",
            serviceAddresses: Array.isArray(data.serviceAddresses)
              ? data.serviceAddresses.map((addr: any) => ({
                  id: addr.id ?? crypto.randomUUID(),
                  label: addr.label ?? undefined,
                  addressLine1: addr.addressLine1 ?? "",
                  addressLine2: addr.addressLine2 ?? undefined,
                  city: addr.city ?? "",
                  state: addr.state ?? "",
                  postalCode: addr.postalCode ?? "",
                  notes: addr.notes ?? undefined,
                  active: addr.active ?? true,
                  isPrimary: addr.isPrimary ?? false,
                  createdAt: addr.createdAt ?? undefined,
                  updatedAt: addr.updatedAt ?? undefined,
                }))
              : [],
          };
        });

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setCustomers(items);
      } catch (err: unknown) {
        setCustomersError(err instanceof Error ? err.message : "Failed to load customers.");
      } finally {
        setCustomersLoading(false);
      }
    }

    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();
    if (!search) return customers.slice(0, 12);

    return customers
      .filter((customer) => getCustomerSearchText(customer).includes(search))
      .slice(0, 20);
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setError("");
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomerId("");
  }

  // -----------------------------
  // Plans upload helpers
  // -----------------------------
  function onPickPlans(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    // Keep it simple: append
    setPlanFiles((prev) => [...prev, ...list]);
  }

  function removePlanAt(idx: number) {
    setPlanFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadPlans(projectId: string) {
    if (!planFiles.length) return [];

    setUploadingPlans(true);
    setUploadStatus("Uploading plans…");
    const storage = getStorage();

    const uploadedMeta: Array<{
      name: string;
      url: string;
      path: string;
      size: number;
      contentType: string;
      uploadedAt: string;
      uploadedByUid: string | null;
    }> = [];

    try {
      for (let i = 0; i < planFiles.length; i++) {
        const f = planFiles[i];
        setUploadStatus(`Uploading ${i + 1}/${planFiles.length}: ${f.name}`);

        const safeName = f.name.replace(/[^\w.\-() ]+/g, "_");
        const path = `projectPlans/${projectId}/${uid()}_${safeName}`;
        const r = storageRef(storage, path);

        await uploadBytes(r, f, { contentType: f.type || "application/octet-stream" });
        const url = await getDownloadURL(r);

        uploadedMeta.push({
          name: f.name,
          url,
          path,
          size: f.size,
          contentType: f.type || "application/octet-stream",
          uploadedAt: nowIso(),
          uploadedByUid: appUser?.uid || null,
        });
      }

      setUploadStatus("Plans uploaded.");
      return uploadedMeta;
    } finally {
      setUploadingPlans(false);
      // keep status text visible; don’t clear immediately
    }
  }

  // -----------------------------
  // Submit
  // -----------------------------
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedCustomer) {
      setError("Please search for and select a customer (GC / contractor).");
      return;
    }

    if (!projectName.trim()) {
      setError("Project Name is required.");
      return;
    }

    // ✅ Job site address validation (light)
    if (!jobStreet1.trim() || !jobCity.trim() || !jobState.trim() || !jobZip.trim()) {
      setError("Please complete the Job Site Address (Street, City, State, Zip).");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const now = nowIso();
      const totalBid = Number(totalBidAmount) || 0;

      const stageAmounts = buildStageBilledAmounts(projectType, totalBid);

      // We keep stage objects on the doc for schema consistency,
      // even for time_materials where the UI will hide stages.
      const baseStage = (billedAmount: number) => ({
        status: "not_started",
        scheduledDate: null,
        scheduledEndDate: null,
        completedDate: null,
        billed: false,
        billedAmount: billedAmount,
        staffing: null,
      });

      const docRef = await addDoc(collection(db, "projects"), {
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

        // Job site address (NOT customer serviceAddresses)
        serviceAddressId: null,
        serviceAddressLabel: "Job Site",
        serviceAddressLine1: jobStreet1.trim(),
        serviceAddressLine2: jobStreet2.trim() || null,
        serviceCity: jobCity.trim(),
        serviceState: jobState.trim().toUpperCase() || "TX",
        servicePostalCode: jobZip.trim(),

        projectName: projectName.trim(),
        projectType,
        description: description.trim() || null,

        bidStatus,
        totalBidAmount: totalBid,

        roughIn: baseStage(stageAmounts.roughIn),
        topOutVent: baseStage(stageAmounts.topOutVent),
        trimFinish: baseStage(stageAmounts.trimFinish),

        assignedTechnicianId: null,
        assignedTechnicianName: null,

        // ✅ plans placeholder
        planFiles: [],

        internalNotes: internalNotes.trim() || null,
        active: true,
        createdAt: now,
        updatedAt: now,
      });

      // ✅ Upload plans after project exists
      let uploaded = [];
      if (planFiles.length) {
        uploaded = await uploadPlans(docRef.id);

        if (uploaded.length) {
          await updateDoc(doc(db, "projects", docRef.id), {
            planFiles: uploaded,
            updatedAt: nowIso(),
          });
        }
      }

      router.push(`/projects/${docRef.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------
  // Styling helpers (DCFlow vibe)
  // -----------------------------
  const pageWrap: React.CSSProperties = {
    display: "grid",
    gap: 14,
    maxWidth: 980,
  };

  const card: React.CSSProperties = {
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 14,
    padding: 16,
    background: "white",
    boxShadow: "0 10px 30px rgba(2,6,23,0.05)",
  };

  const cardHeader: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 950,
    margin: 0,
    marginBottom: 10,
    letterSpacing: "-0.2px",
  };

  const label: React.CSSProperties = { fontWeight: 900, fontSize: 12, color: "#0f172a" };

  const input: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    marginTop: 6,
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.14)",
    outline: "none",
  };

  const textarea: React.CSSProperties = {
    ...input,
    minHeight: 92,
    resize: "vertical",
  };

  const select: React.CSSProperties = { ...input, background: "white" };

  const primaryBtn: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(37,99,235,0.40)",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontWeight: 950,
    width: "fit-content",
    boxShadow: "0 12px 26px rgba(37,99,235,0.22)",
  };

  const secondaryBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.14)",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    width: "fit-content",
  };

  const subtle: React.CSSProperties = { fontSize: 12, color: "rgba(15,23,42,0.62)" };

  return (
    <ProtectedPage fallbackTitle="New Project">
      <AppShell appUser={appUser}>
        <div style={pageWrap}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 1000, margin: 0, letterSpacing: "-0.3px" }}>New Project</h1>
              <div style={{ marginTop: 6, ...subtle }}>
                Create a project for a contractor/GC (customer), with a separate job-site address.
              </div>
            </div>
          </div>

          {customersLoading ? <p>Loading customers…</p> : null}
          {customersError ? <p style={{ color: "#b91c1c", fontWeight: 900 }}>{customersError}</p> : null}

          {!customersLoading && !customersError ? (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
              {/* Customer */}
              <div style={card}>
                <h2 style={cardHeader}>Customer (GC / Contractor)</h2>

                <div>
                  <div style={label}>Search Customer</div>
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name, phone, billing address…"
                    style={input}
                  />
                </div>

                {selectedCustomer ? (
                  <div
                    style={{
                      marginTop: 12,
                      border: "1px solid rgba(15,23,42,0.12)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(2,6,23,0.02)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 240 }}>
                      <div style={{ fontWeight: 950 }}>{selectedCustomer.displayName}</div>
                      <div style={{ marginTop: 4, ...subtle }}>{selectedCustomer.phonePrimary || "No phone"}</div>
                      <div style={{ marginTop: 4, ...subtle }}>{selectedCustomer.billingAddressLine1}</div>
                      <div style={{ marginTop: 4, ...subtle }}>
                        {selectedCustomer.billingCity}, {selectedCustomer.billingState} {selectedCustomer.billingPostalCode}
                      </div>
                    </div>

                    <button type="button" onClick={handleClearSelectedCustomer} style={secondaryBtn}>
                      Change Customer
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {filteredCustomers.length === 0 ? (
                      <div
                        style={{
                          border: "1px dashed rgba(15,23,42,0.22)",
                          borderRadius: 12,
                          padding: 12,
                          background: "rgba(2,6,23,0.02)",
                          color: "rgba(15,23,42,0.65)",
                          fontSize: 13,
                          fontWeight: 800,
                        }}
                      >
                        No matching customers found.
                      </div>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => handleSelectCustomer(customer.id)}
                          style={{
                            textAlign: "left",
                            border: "1px solid rgba(15,23,42,0.12)",
                            borderRadius: 12,
                            padding: 12,
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 950 }}>{customer.displayName}</div>
                          <div style={{ marginTop: 4, ...subtle }}>{customer.phonePrimary || "No phone"}</div>
                          <div style={{ marginTop: 4, ...subtle }}>{customer.billingAddressLine1}</div>
                          <div style={{ marginTop: 4, ...subtle }}>
                            {customer.billingCity}, {customer.billingState} {customer.billingPostalCode}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Job Site Address */}
              <div style={card}>
                <h2 style={cardHeader}>Job Site Address</h2>
                <div style={{ ...subtle, marginTop: -2, marginBottom: 10 }}>
                  This is the service location for the project (not the customer billing/service address list).
                </div>

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={label}>Street Address</div>
                    <input
                      value={jobStreet1}
                      onChange={(e) => setJobStreet1(e.target.value)}
                      placeholder="123 Main St"
                      style={input}
                      disabled={!selectedCustomer}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={label}>Address Line 2 (optional)</div>
                    <input
                      value={jobStreet2}
                      onChange={(e) => setJobStreet2(e.target.value)}
                      placeholder="Unit, suite, lot, etc."
                      style={input}
                      disabled={!selectedCustomer}
                    />
                  </div>

                  <div>
                    <div style={label}>City</div>
                    <input
                      value={jobCity}
                      onChange={(e) => setJobCity(e.target.value)}
                      placeholder="La Grange"
                      style={input}
                      disabled={!selectedCustomer}
                    />
                  </div>

                  <div>
                    <div style={label}>State</div>
                    <input
                      value={jobState}
                      onChange={(e) => setJobState(e.target.value)}
                      placeholder="TX"
                      style={input}
                      disabled={!selectedCustomer}
                    />
                  </div>

                  <div>
                    <div style={label}>Zip</div>
                    <input
                      value={jobZip}
                      onChange={(e) => setJobZip(e.target.value)}
                      placeholder="78945"
                      style={input}
                      disabled={!selectedCustomer}
                    />
                  </div>
                </div>
              </div>

              {/* Project Basics */}
              <div style={card}>
                <h2 style={cardHeader}>Project Basics</h2>

                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <div style={label}>Project Name</div>
                    <input
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Example: Dees Project"
                      required
                      style={input}
                      disabled={!selectedCustomer}
                    />
                  </div>

                  <div>
                    <div style={label}>Project Type</div>
                    <select
                      value={projectType}
                      onChange={(e) => setProjectType(e.target.value as ProjectType)}
                      style={select}
                      disabled={!selectedCustomer}
                    >
                      <option value="new_construction">New Construction</option>
                      <option value="remodel">Remodel</option>
                      <option value="time_materials">Time + Materials</option>
                    </select>

                    <div style={{ marginTop: 8, ...subtle }}>
                      This controls the stages/layout:
                      <strong> New Construction</strong> (3 stages),
                      <strong> Remodel</strong> (2 stages),
                      <strong> Time + Materials</strong> (no stages).
                    </div>
                  </div>

                  <div>
                    <div style={label}>Project Description</div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      style={textarea}
                      disabled={!selectedCustomer}
                    />
                  </div>
                </div>
              </div>

              {/* Bid */}
              <div style={card}>
                <h2 style={cardHeader}>Bid & Admin</h2>

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                  <div>
                    <div style={label}>Bid Status</div>
                    <select
                      value={bidStatus}
                      onChange={(e) => setBidStatus(e.target.value as any)}
                      style={select}
                      disabled={!selectedCustomer}
                    >
                      <option value="draft">Draft</option>
                      <option value="submitted">Submitted</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>

                  <div>
                    <div style={label}>Total Bid Amount</div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={totalBidAmount}
                      onChange={(e) => setTotalBidAmount(e.target.value)}
                      required
                      style={input}
                      disabled={!selectedCustomer}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={label}>Internal Notes</div>
                    <textarea
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      rows={3}
                      style={textarea}
                      disabled={!selectedCustomer}
                    />
                  </div>
                </div>
              </div>

              {/* Plans */}
              <div style={card}>
                <h2 style={cardHeader}>Plans / Attachments</h2>
                <div style={subtle}>Attach any plans, PDFs, photos, or notes provided by the contractor.</div>

                <div style={{ marginTop: 12 }}>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => onPickPlans(e.target.files)}
                    disabled={!selectedCustomer || saving || uploadingPlans}
                  />
                  <div style={{ marginTop: 8, ...subtle }}>
                    Files upload after the project is created (saved under this project).
                  </div>
                </div>

                {planFiles.length ? (
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {planFiles.map((f, idx) => (
                      <div
                        key={`${f.name}-${idx}`}
                        style={{
                          border: "1px solid rgba(15,23,42,0.12)",
                          borderRadius: 12,
                          padding: 10,
                          background: "rgba(2,6,23,0.02)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 260 }}>
                          <div style={{ fontWeight: 900 }}>{f.name}</div>
                          <div style={subtle}>
                            {(f.size / 1024 / 1024).toFixed(2)} MB • {f.type || "file"}
                          </div>
                        </div>

                        <button type="button" onClick={() => removePlanAt(idx)} style={secondaryBtn} disabled={saving || uploadingPlans}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 12,
                      border: "1px dashed rgba(15,23,42,0.22)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(2,6,23,0.02)",
                      color: "rgba(15,23,42,0.65)",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    No attachments selected.
                  </div>
                )}

                {uploadStatus ? <div style={{ marginTop: 10, ...subtle }}>{uploadStatus}</div> : null}
              </div>

              {error ? <p style={{ color: "#b91c1c", fontWeight: 900 }}>{error}</p> : null}

              <button type="submit" disabled={saving || uploadingPlans} style={primaryBtn}>
                {saving ? "Creating…" : uploadingPlans ? "Uploading…" : "Create Project"}
              </button>
            </form>
          ) : null}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}