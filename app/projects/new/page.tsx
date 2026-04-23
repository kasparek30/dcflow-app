"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDoc, collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceAddress } from "../../../src/types/customer";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

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

function formatCurrency(value: number | string) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
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

  return {
    roughIn: 0,
    topOutVent: 0,
    trimFinish: 0,
  };
}

function uid() {
  return Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

function getProjectTypeLabel(projectType: ProjectType) {
  switch (projectType) {
    case "new_construction":
      return "New Construction";
    case "remodel":
      return "Remodel";
    case "time_materials":
      return "Time + Materials";
    default:
      return "Project";
  }
}

function getBidStatusLabel(status: "draft" | "submitted" | "won" | "lost") {
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

export default function NewProjectPage() {
  const router = useRouter();
  const theme = useTheme();
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

  const [jobStreet1, setJobStreet1] = useState("");
  const [jobStreet2, setJobStreet2] = useState("");
  const [jobCity, setJobCity] = useState("");
  const [jobState, setJobState] = useState("TX");
  const [jobZip, setJobZip] = useState("");

  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [uploadingPlans, setUploadingPlans] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        setCustomersLoading(true);
        setCustomersError("");

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

  const totalBidNumber = useMemo(() => Number(totalBidAmount) || 0, [totalBidAmount]);

  const stagePreview = useMemo(() => {
    return buildStageBilledAmounts(projectType, totalBidNumber);
  }, [projectType, totalBidNumber]);

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setError("");
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomerId("");
  }

  function onPickPlans(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
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
    }
  }

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

      const baseStage = (billedAmount: number) => ({
        status: "not_started",
        scheduledDate: null,
        scheduledEndDate: null,
        completedDate: null,
        billed: false,
        billedAmount,
        staffing: null,
      });

      const docRef = await addDoc(collection(db, "projects"), {
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

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

        planFiles: [],

        internalNotes: internalNotes.trim() || null,
        active: true,
        createdAt: now,
        updatedAt: now,
      });

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

  return (
    <ProtectedPage fallbackTitle="New Project">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 1080, mx: "auto", pb: 10 }}>
          <Stack spacing={3}>
            <Box
              sx={{
                borderRadius: 4,
                p: { xs: 2, sm: 3 },
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
              }}
            >
              <Stack spacing={2}>
                <Box>
                  <Button
                    component={Link}
                    href="/projects"
                    startIcon={<ArrowBackRoundedIcon />}
                    sx={{ mb: 1, ml: -1, borderRadius: 99 }}
                  >
                    Back to Projects
                  </Button>

                  <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.4 }}>
                    New Project
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ mt: 0.75, maxWidth: 760 }}
                  >
                    Create a project for a contractor or GC, set the job site address,
                    choose the workflow type, and optionally attach plans before moving
                    into scheduling and field execution.
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip
                    icon={<BusinessRoundedIcon />}
                    label={selectedCustomer ? selectedCustomer.displayName : "Select customer"}
                    color={selectedCustomer ? "primary" : "default"}
                    variant={selectedCustomer ? "filled" : "outlined"}
                  />
                  <Chip
                    icon={<WorkRoundedIcon />}
                    label={getProjectTypeLabel(projectType)}
                    variant="outlined"
                  />
                  <Chip
                    icon={<PaidRoundedIcon />}
                    label={getBidStatusLabel(bidStatus)}
                    variant="outlined"
                  />
                </Stack>
              </Stack>
            </Box>

            <form onSubmit={handleSubmit}>
              <Stack spacing={3}>
                {customersError ? <Alert severity="error">{customersError}</Alert> : null}
                {error ? <Alert severity="error">{error}</Alert> : null}

                <Card
                  sx={{
                    borderRadius: 4,
                    boxShadow: "none",
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <PersonSearchRoundedIcon color="primary" />
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Customer (GC / Contractor)
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Search and select the customer this project belongs to.
                          </Typography>
                        </Box>
                      </Stack>

                      <TextField
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search by name, phone, billing address..."
                        fullWidth
                        size="small"
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchRoundedIcon fontSize="small" />
                            </InputAdornment>
                          ),
                        }}
                      />

                      {customersLoading ? (
                        <Stack spacing={1.5}>
                          {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton
                              key={index}
                              variant="rounded"
                              height={82}
                              sx={{ borderRadius: 3 }}
                            />
                          ))}
                        </Stack>
                      ) : selectedCustomer ? (
                        <Box
                          sx={{
                            borderRadius: 3,
                            p: 2,
                            backgroundColor: alpha(theme.palette.primary.main, 0.05),
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.14)}`,
                          }}
                        >
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={2}
                            justifyContent="space-between"
                            alignItems={{ xs: "flex-start", sm: "center" }}
                          >
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {selectedCustomer.displayName}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {selectedCustomer.phonePrimary || "No phone"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {selectedCustomer.billingAddressLine1}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {selectedCustomer.billingCity}, {selectedCustomer.billingState}{" "}
                                {selectedCustomer.billingPostalCode}
                              </Typography>
                            </Box>

                            <Button
                              type="button"
                              onClick={handleClearSelectedCustomer}
                              variant="outlined"
                              sx={{ borderRadius: 99 }}
                            >
                              Change Customer
                            </Button>
                          </Stack>
                        </Box>
                      ) : filteredCustomers.length === 0 ? (
                        <Box
                          sx={{
                            borderRadius: 3,
                            p: 2,
                            border: `1px dashed ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.text.primary, 0.02),
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            No matching customers found.
                          </Typography>
                        </Box>
                      ) : (
                        <Box sx={{ display: "grid", gap: 1.25 }}>
                          {filteredCustomers.map((customer) => (
                            <Card
                              key={customer.id}
                              sx={{
                                borderRadius: 3,
                                boxShadow: "none",
                                border: `1px solid ${theme.palette.divider}`,
                              }}
                            >
                              <CardActionArea onClick={() => handleSelectCustomer(customer.id)}>
                                <CardContent sx={{ p: 2 }}>
                                  <Stack spacing={0.5}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                      {customer.displayName}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {customer.phonePrimary || "No phone"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {customer.billingAddressLine1}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {customer.billingCity}, {customer.billingState}{" "}
                                      {customer.billingPostalCode}
                                    </Typography>
                                  </Stack>
                                </CardContent>
                              </CardActionArea>
                            </Card>
                          ))}
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 4,
                    boxShadow: "none",
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <LocationOnRoundedIcon color="primary" />
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Job Site Address
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            This is the actual service location for the project.
                          </Typography>
                        </Box>
                      </Stack>

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                          gap: 2,
                        }}
                      >
                        <TextField
                          label="Street Address"
                          value={jobStreet1}
                          onChange={(e) => setJobStreet1(e.target.value)}
                          placeholder="123 Main St"
                          fullWidth
                          disabled={!selectedCustomer}
                          sx={{ gridColumn: { xs: "1 / -1", sm: "1 / -1" } }}
                        />

                        <TextField
                          label="Address Line 2"
                          value={jobStreet2}
                          onChange={(e) => setJobStreet2(e.target.value)}
                          placeholder="Unit, suite, lot, etc."
                          fullWidth
                          disabled={!selectedCustomer}
                          sx={{ gridColumn: { xs: "1 / -1", sm: "1 / -1" } }}
                        />

                        <TextField
                          label="City"
                          value={jobCity}
                          onChange={(e) => setJobCity(e.target.value)}
                          placeholder="La Grange"
                          fullWidth
                          disabled={!selectedCustomer}
                        />

                        <TextField
                          label="State"
                          value={jobState}
                          onChange={(e) => setJobState(e.target.value)}
                          placeholder="TX"
                          fullWidth
                          disabled={!selectedCustomer}
                        />

                        <TextField
                          label="Zip"
                          value={jobZip}
                          onChange={(e) => setJobZip(e.target.value)}
                          placeholder="78945"
                          fullWidth
                          disabled={!selectedCustomer}
                        />
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 4,
                    boxShadow: "none",
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <WorkRoundedIcon color="primary" />
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Project Basics
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Set the name, project type, and a short description.
                          </Typography>
                        </Box>
                      </Stack>

                      <TextField
                        label="Project Name"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Example: Dees Project"
                        required
                        fullWidth
                        disabled={!selectedCustomer}
                      />

                      <TextField
                        select
                        label="Project Type"
                        value={projectType}
                        onChange={(e) => setProjectType(e.target.value as ProjectType)}
                        fullWidth
                        disabled={!selectedCustomer}
                      >
                        <MenuItem value="new_construction">New Construction</MenuItem>
                        <MenuItem value="remodel">Remodel</MenuItem>
                        <MenuItem value="time_materials">Time + Materials</MenuItem>
                      </TextField>

                      <Box
                        sx={{
                          borderRadius: 3,
                          p: 1.5,
                          backgroundColor: alpha(theme.palette.primary.main, 0.05),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Workflow preview
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                          {projectType === "new_construction"
                            ? "New Construction uses 3 stages: Rough-In, Top-Out / Vent, and Trim / Finish."
                            : projectType === "remodel"
                              ? "Remodel uses 2 stages: Rough-In and Trim / Finish."
                              : "Time + Materials does not use stage billing. Work will flow through trips and billing review."}
                        </Typography>
                      </Box>

                      <TextField
                        label="Project Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        multiline
                        minRows={4}
                        fullWidth
                        disabled={!selectedCustomer}
                      />
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 4,
                    boxShadow: "none",
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={2.5}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <PaidRoundedIcon color="primary" />
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Bid & Admin
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Set the bid status, total amount, and internal notes.
                          </Typography>
                        </Box>
                      </Stack>

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                          gap: 2,
                        }}
                      >
                        <TextField
                          select
                          label="Bid Status"
                          value={bidStatus}
                          onChange={(e) =>
                            setBidStatus(e.target.value as "draft" | "submitted" | "won" | "lost")
                          }
                          fullWidth
                          disabled={!selectedCustomer}
                        >
                          <MenuItem value="draft">Draft</MenuItem>
                          <MenuItem value="submitted">Submitted</MenuItem>
                          <MenuItem value="won">Won</MenuItem>
                          <MenuItem value="lost">Lost</MenuItem>
                        </TextField>

                        <TextField
                          label="Total Bid Amount"
                          type="number"
                          inputProps={{ min: 0, step: "0.01" }}
                          value={totalBidAmount}
                          onChange={(e) => setTotalBidAmount(e.target.value)}
                          fullWidth
                          disabled={!selectedCustomer}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">$</InputAdornment>
                            ),
                          }}
                        />
                      </Box>

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            md: projectType === "time_materials" ? "1fr" : "repeat(3, minmax(0, 1fr))",
                          },
                          gap: 1.5,
                        }}
                      >
                        {projectType !== "time_materials" ? (
                          <>
                            <Card
                              sx={{
                                borderRadius: 3,
                                boxShadow: "none",
                                border: `1px solid ${theme.palette.divider}`,
                              }}
                            >
                              <CardContent>
                                <Typography variant="subtitle2" color="text.secondary">
                                  Rough-In
                                </Typography>
                                <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
                                  {formatCurrency(stagePreview.roughIn)}
                                </Typography>
                              </CardContent>
                            </Card>

                            {projectType === "new_construction" ? (
                              <Card
                                sx={{
                                  borderRadius: 3,
                                  boxShadow: "none",
                                  border: `1px solid ${theme.palette.divider}`,
                                }}
                              >
                                <CardContent>
                                  <Typography variant="subtitle2" color="text.secondary">
                                    Top-Out / Vent
                                  </Typography>
                                  <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
                                    {formatCurrency(stagePreview.topOutVent)}
                                  </Typography>
                                </CardContent>
                              </Card>
                            ) : null}

                            <Card
                              sx={{
                                borderRadius: 3,
                                boxShadow: "none",
                                border: `1px solid ${theme.palette.divider}`,
                              }}
                            >
                              <CardContent>
                                <Typography variant="subtitle2" color="text.secondary">
                                  Trim / Finish
                                </Typography>
                                <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
                                  {formatCurrency(stagePreview.trimFinish)}
                                </Typography>
                              </CardContent>
                            </Card>
                          </>
                        ) : (
                          <Box
                            sx={{
                              borderRadius: 3,
                              p: 2,
                              backgroundColor: alpha(theme.palette.success.main, 0.08),
                              border: `1px solid ${alpha(theme.palette.success.main, 0.16)}`,
                            }}
                          >
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              Time + Materials billing
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                              This project type does not pre-split billing into staged bid amounts.
                              Billing will be driven by trip labor, materials, and later billing review.
                            </Typography>
                          </Box>
                        )}
                      </Box>

                      <TextField
                        label="Internal Notes"
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        multiline
                        minRows={3}
                        fullWidth
                        disabled={!selectedCustomer}
                      />
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 4,
                    boxShadow: "none",
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <AttachFileRoundedIcon color="primary" />
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Plans / Attachments
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Attach plans, PDFs, photos, or notes provided by the contractor.
                          </Typography>
                        </Box>
                      </Stack>

                      <Box>
                        <Button
                          component="label"
                          variant="outlined"
                          startIcon={<AttachFileRoundedIcon />}
                          disabled={!selectedCustomer || saving || uploadingPlans}
                          sx={{ borderRadius: 99 }}
                        >
                          Add Files
                          <input
                            hidden
                            type="file"
                            multiple
                            onChange={(e) => onPickPlans(e.target.files)}
                          />
                        </Button>

                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Files upload after the project record is created.
                        </Typography>
                      </Box>

                      {planFiles.length ? (
                        <Stack spacing={1.25}>
                          {planFiles.map((f, idx) => (
                            <Card
                              key={`${f.name}-${idx}`}
                              sx={{
                                borderRadius: 3,
                                boxShadow: "none",
                                border: `1px solid ${theme.palette.divider}`,
                              }}
                            >
                              <CardContent sx={{ p: 2 }}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1.5}
                                  justifyContent="space-between"
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                >
                                  <Stack direction="row" spacing={1.25} alignItems="center">
                                    <DescriptionRoundedIcon color="action" />
                                    <Box>
                                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                        {f.name}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        {(f.size / 1024 / 1024).toFixed(2)} MB • {f.type || "file"}
                                      </Typography>
                                    </Box>
                                  </Stack>

                                  <Button
                                    type="button"
                                    onClick={() => removePlanAt(idx)}
                                    variant="outlined"
                                    color="inherit"
                                    startIcon={<DeleteOutlineRoundedIcon />}
                                    disabled={saving || uploadingPlans}
                                    sx={{ borderRadius: 99 }}
                                  >
                                    Remove
                                  </Button>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      ) : (
                        <Box
                          sx={{
                            borderRadius: 3,
                            p: 2,
                            border: `1px dashed ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.text.primary, 0.02),
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            No attachments selected.
                          </Typography>
                        </Box>
                      )}

                      {uploadStatus ? (
                        <Alert severity="info" icon={<AttachFileRoundedIcon fontSize="inherit" />}>
                          {uploadStatus}
                        </Alert>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    position: "sticky",
                    bottom: 16,
                    zIndex: 5,
                    borderRadius: 4,
                    boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.12)}`,
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.14)}`,
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", md: "center" }}
                    >
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Ready to create project
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Customer: {selectedCustomer?.displayName || "Not selected"} • Type:{" "}
                          {getProjectTypeLabel(projectType)} • Bid: {formatCurrency(totalBidAmount)}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1.25}>
                        <Button
                          component={Link}
                          href="/projects"
                          variant="outlined"
                          color="inherit"
                          sx={{ borderRadius: 99 }}
                          disabled={saving || uploadingPlans}
                        >
                          Cancel
                        </Button>

                        <Button
                          type="submit"
                          variant="contained"
                          sx={{ borderRadius: 99, minWidth: 164, boxShadow: "none" }}
                          disabled={saving || uploadingPlans || customersLoading}
                          startIcon={
                            saving || uploadingPlans ? (
                              <CircularProgress color="inherit" size={18} />
                            ) : undefined
                          }
                        >
                          {saving ? "Creating..." : uploadingPlans ? "Uploading..." : "Create Project"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </form>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}