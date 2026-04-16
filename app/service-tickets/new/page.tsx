// app/service-tickets/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
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
  FormControl,
  FormHelperText,
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddTaskRoundedIcon from "@mui/icons-material/AddTaskRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import BuildCircleRoundedIcon from "@mui/icons-material/BuildCircleRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceAddress } from "../../../src/types/customer";

type CustomerOption = {
  id: string;
  displayName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  email?: string;
  billingAddressLine1: string;
  billingAddressLine2?: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  serviceAddresses: ServiceAddress[];
};

type DcflowUserOption = {
  uid: string;
  displayName: string;
  email?: string;
  role?: string;
  active?: boolean;
};

type EmployeeProfileOption = {
  id: string;
  userUid?: string | null;
  displayName?: string;
  employmentStatus?: string;
  laborRole?: string;
  defaultPairedTechUid?: string | null;
};

type TicketStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "follow_up"
  | "completed"
  | "cancelled";

function getCustomerSearchText(customer: CustomerOption) {
  return [
    customer.displayName,
    customer.phonePrimary,
    customer.phoneSecondary,
    customer.email,
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

function normalizeRole(role?: string) {
  return (role || "").trim().toLowerCase();
}

function formatAddress(params: {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}) {
  const line1 = [params.addressLine1, params.addressLine2].filter(Boolean).join(", ");
  const line2 = [params.city, params.state, params.postalCode].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(" • ");
}

function getStatusLabel(status: TicketStatus) {
  switch (status) {
    case "new":
      return "New";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "follow_up":
      return "Follow Up";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export default function NewServiceTicketPage() {
  const router = useRouter();
  const { appUser } = useAuthContext();

  const [customersLoading, setCustomersLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersError, setCustomersError] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedServiceAddressId, setSelectedServiceAddressId] = useState("");

  const [issueSummary, setIssueSummary] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [status, setStatus] = useState<TicketStatus>("new");
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState("240");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [staffLoading, setStaffLoading] = useState(true);
  const [users, setUsers] = useState<DcflowUserOption[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileOption[]>([]);
  const [primaryTechnicianId, setPrimaryTechnicianId] = useState("");
  const [assignedTechnicianIds, setAssignedTechnicianIds] = useState<string[]>([]);
  const [assignmentError, setAssignmentError] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        const snap = await getDocs(collection(db, "customers"));

        const items: CustomerOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            displayName: data.displayName ?? "",
            phonePrimary: data.phonePrimary ?? "",
            phoneSecondary: data.phoneSecondary ?? undefined,
            email: data.email ?? undefined,
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
        if (err instanceof Error) {
          setCustomersError(err.message);
        } else {
          setCustomersError("Failed to load customers.");
        }
      } finally {
        setCustomersLoading(false);
      }
    }

    loadCustomers();
  }, []);

  useEffect(() => {
    async function loadStaff() {
      setStaffLoading(true);
      setAssignmentError("");

      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const usersItems: DcflowUserOption[] = usersSnap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: docSnap.id,
            displayName: d.displayName ?? "",
            email: d.email ?? undefined,
            role: d.role ?? undefined,
            active: d.active ?? true,
          };
        });

        usersItems.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsers(usersItems);

        const profilesSnap = await getDocs(collection(db, "employeeProfiles"));
        const profileItems: EmployeeProfileOption[] = profilesSnap.docs.map((docSnap) => {
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

        profileItems.sort((a, b) =>
          String(a.displayName || "").localeCompare(String(b.displayName || ""))
        );
        setEmployeeProfiles(profileItems);
      } catch (err: unknown) {
        setAssignmentError(err instanceof Error ? err.message : "Failed to load staff roster.");
      } finally {
        setStaffLoading(false);
      }
    }

    loadStaff();
  }, []);

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!search) {
      return customers.slice(0, 12);
    }

    return customers
      .filter((customer) => getCustomerSearchText(customer).includes(search))
      .slice(0, 20);
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const availableServiceAddresses = useMemo(() => {
    if (!selectedCustomer) return [];

    const activeAddresses = selectedCustomer.serviceAddresses.filter((addr) => addr.active);

    if (activeAddresses.length === 0) {
      return [
        {
          id: "billing-fallback",
          label: "Billing Address",
          addressLine1: selectedCustomer.billingAddressLine1,
          addressLine2: selectedCustomer.billingAddressLine2,
          city: selectedCustomer.billingCity,
          state: selectedCustomer.billingState,
          postalCode: selectedCustomer.billingPostalCode,
          active: true,
          isPrimary: true,
        },
      ];
    }

    const sorted = [...activeAddresses].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return 0;
    });

    return sorted;
  }, [selectedCustomer]);

  useEffect(() => {
    if (availableServiceAddresses.length > 0) {
      setSelectedServiceAddressId(availableServiceAddresses[0].id);
    } else {
      setSelectedServiceAddressId("");
    }
  }, [availableServiceAddresses]);

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setError("");
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomerId("");
    setSelectedServiceAddressId("");
    setError("");
  }

  const currentTechnicians = useMemo(() => {
    const currentUids = new Set<string>();

    for (const p of employeeProfiles) {
      if ((p.employmentStatus || "current") !== "current") continue;
      const uid = String(p.userUid || "").trim();
      if (uid) currentUids.add(uid);
    }

    return users
      .filter((u) => u.active !== false)
      .filter((u) => currentUids.has(u.uid))
      .filter((u) => normalizeRole(u.role) === "technician")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users, employeeProfiles]);

  const defaultHelperUids = useMemo(() => {
    const techUid = primaryTechnicianId.trim();
    if (!techUid) return [];

    return employeeProfiles
      .filter((p) => (p.employmentStatus || "current") === "current")
      .filter((p) => ["helper", "apprentice"].includes(normalizeRole(p.laborRole)))
      .filter((p) => String(p.defaultPairedTechUid || "").trim() === techUid)
      .map((p) => String(p.userUid || "").trim())
      .filter(Boolean);
  }, [employeeProfiles, primaryTechnicianId]);

  useEffect(() => {
    const techUid = primaryTechnicianId.trim();
    if (!techUid) {
      setAssignedTechnicianIds([]);
      return;
    }

    const combined = [techUid, ...defaultHelperUids];
    const unique = Array.from(new Set(combined));
    setAssignedTechnicianIds(unique);
  }, [primaryTechnicianId, defaultHelperUids]);

  const assignedTeamNames = useMemo(() => {
    const map = new Map(users.map((u) => [u.uid, u.displayName]));
    return assignedTechnicianIds.map((uid) => map.get(uid) || uid);
  }, [assignedTechnicianIds, users]);

  const primaryTechnician = useMemo(() => {
    const uid = primaryTechnicianId.trim();
    if (!uid) return null;
    return users.find((u) => u.uid === uid) || null;
  }, [primaryTechnicianId, users]);

  const selectedServiceAddress = useMemo(() => {
    return (
      availableServiceAddresses.find((addr) => addr.id === selectedServiceAddressId) ??
      availableServiceAddresses[0] ??
      null
    );
  }, [availableServiceAddresses, selectedServiceAddressId]);

  const requiresAssignment = status === "scheduled" || status === "in_progress";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedCustomer) {
      setError("Please search for and select a customer.");
      return;
    }

    const chosenAddress =
      availableServiceAddresses.find((addr) => addr.id === selectedServiceAddressId) ??
      availableServiceAddresses[0];

    if (!chosenAddress) {
      setError("Please select a service address.");
      return;
    }

    if (!issueSummary.trim()) {
      setError("Please enter an issue summary.");
      return;
    }

    if ((status === "scheduled" || status === "in_progress") && !primaryTechnicianId.trim()) {
      setError("Please select a primary technician for scheduled or in-progress tickets.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const nowIso = new Date().toISOString();

      const primaryUid = primaryTechnicianId.trim() || null;
      const teamUids =
        primaryUid && assignedTechnicianIds.length
          ? assignedTechnicianIds
          : primaryUid
            ? [primaryUid]
            : [];

      const docRef = await addDoc(collection(db, "serviceTickets"), {
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

        serviceAddressId: chosenAddress.id === "billing-fallback" ? null : chosenAddress.id,
        serviceAddressLabel: chosenAddress.label ?? null,
        serviceAddressLine1: chosenAddress.addressLine1,
        serviceAddressLine2: chosenAddress.addressLine2 ?? null,
        serviceCity: chosenAddress.city,
        serviceState: chosenAddress.state,
        servicePostalCode: chosenAddress.postalCode,

        issueSummary: issueSummary.trim(),
        issueDetails: issueDetails.trim() || null,

        status,
        estimatedDurationMinutes: Number(estimatedDurationMinutes),

        scheduledDate: scheduledDate || null,
        scheduledStartTime: scheduledStartTime || null,
        scheduledEndTime: scheduledEndTime || null,

        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryTechnician ? primaryTechnician.displayName : null,

        primaryTechnicianId: primaryUid,
        assignedTechnicianIds: teamUids.length ? teamUids : null,

        internalNotes: internalNotes.trim() || null,

        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      router.push(`/service-tickets/${docRef.id}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create service ticket.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Service Ticket">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 980, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.4 }}>
                New Service Ticket
              </Typography>
              <Typography
  variant="body1"
  sx={{ fontSize: "1rem", lineHeight: 1.5 }}
>
                Create a new ticket with a clear customer, job summary, assignment, and schedule.
              </Typography>
            </Box>

            {customersLoading ? (
              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ py: 5 }}>
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
                    <CircularProgress size={24} />
                    <Typography color="text.secondary">Loading customers…</Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {customersError ? <Alert severity="error">{customersError}</Alert> : null}

            {!customersLoading && !customersError ? (
              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={3}>
                  {error ? <Alert severity="error">{error}</Alert> : null}

                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <PersonSearchRoundedIcon color="primary" />
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Customer
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Search by name, phone, email, or address.
                            </Typography>
                          </Box>
                        </Stack>

                        <TextField
                          label="Search customer"
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          placeholder="Ex: Smith, 979…, Main Street…"
                          fullWidth
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchRoundedIcon />
                              </InputAdornment>
                            ),
                          }}
                        />

                        {selectedCustomer ? (
                          <Card
                            variant="outlined"
                            sx={{
                              borderRadius: 4,
                              bgcolor: "action.hover",
                              borderColor: "primary.main",
                            }}
                          >
                            <CardContent>
                              <Stack spacing={1.5}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={1.5}
                                  justifyContent="space-between"
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                >
                                  <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                      {selectedCustomer.displayName}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {selectedCustomer.phonePrimary || "No primary phone"}
                                    </Typography>
                                    {selectedCustomer.email ? (
                                      <Typography variant="body2" color="text.secondary">
                                        {selectedCustomer.email}
                                      </Typography>
                                    ) : null}
                                  </Box>

                                  <Button
                                    type="button"
                                    variant="text"
                                    onClick={handleClearSelectedCustomer}
                                  >
                                    Change customer
                                  </Button>
                                </Stack>

                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Chip label="Customer selected" color="primary" />
                                  <Chip
                                    label={`${availableServiceAddresses.length} service location${
                                      availableServiceAddresses.length === 1 ? "" : "s"
                                    }`}
                                    variant="outlined"
                                  />
                                </Stack>

                                <Typography variant="body2" color="text.secondary">
                                  Billing address:{" "}
                                  {formatAddress({
                                    addressLine1: selectedCustomer.billingAddressLine1,
                                    addressLine2: selectedCustomer.billingAddressLine2,
                                    city: selectedCustomer.billingCity,
                                    state: selectedCustomer.billingState,
                                    postalCode: selectedCustomer.billingPostalCode,
                                  })}
                                </Typography>
                              </Stack>
                            </CardContent>
                          </Card>
                        ) : (
                          <Stack spacing={1.25}>
                            {filteredCustomers.length === 0 ? (
                              <Card
                                variant="outlined"
                                sx={{
                                  borderRadius: 4,
                                  borderStyle: "dashed",
                                  bgcolor: "background.default",
                                }}
                              >
                                <CardContent>
                                  <Typography variant="body2" color="text.secondary">
                                    No matching customers found.
                                  </Typography>
                                </CardContent>
                              </Card>
                            ) : (
                              filteredCustomers.map((customer) => (
                                <Card
                                  key={customer.id}
                                  variant="outlined"
                                  sx={{ borderRadius: 4, overflow: "hidden" }}
                                >
                                  <CardActionArea onClick={() => handleSelectCustomer(customer.id)}>
                                    <CardContent>
                                      <Stack spacing={0.75}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                          {customer.displayName}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                          {customer.phonePrimary || "No phone"}
                                        </Typography>
                                        {customer.email ? (
                                          <Typography variant="body2" color="text.secondary">
                                            {customer.email}
                                          </Typography>
                                        ) : null}
                                        <Typography variant="body2" color="text.secondary">
                                          {formatAddress({
                                            addressLine1: customer.billingAddressLine1,
                                            addressLine2: customer.billingAddressLine2,
                                            city: customer.billingCity,
                                            state: customer.billingState,
                                            postalCode: customer.billingPostalCode,
                                          })}
                                        </Typography>
                                      </Stack>
                                    </CardContent>
                                  </CardActionArea>
                                </Card>
                              ))
                            )}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <HomeWorkRoundedIcon color="primary" />
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Service Location
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Choose where the work will be performed.
                            </Typography>
                          </Box>
                        </Stack>

                        <TextField
                          select
                          label="Service address"
                          value={selectedServiceAddressId}
                          onChange={(e) => setSelectedServiceAddressId(e.target.value)}
                          fullWidth
                          required
                          disabled={!selectedCustomer}
                          helperText={
                            selectedCustomer
                              ? "Primary service address is selected by default when available."
                              : "Select a customer first."
                          }
                        >
                          <MenuItem value="">
                            {selectedCustomer ? "Select a service address" : "Select a customer first"}
                          </MenuItem>
                          {availableServiceAddresses.map((addr) => (
                            <MenuItem key={addr.id} value={addr.id}>
                              {addr.label ? `${addr.label} — ` : ""}
                              {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
                              {addr.isPrimary ? " (Primary)" : ""}
                            </MenuItem>
                          ))}
                        </TextField>

                        {selectedServiceAddress ? (
                          <Card
                            variant="outlined"
                            sx={{ borderRadius: 4, bgcolor: "background.default" }}
                          >
                            <CardContent sx={{ py: 2 }}>
                              <Stack spacing={0.75}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                  Selected location
                                </Typography>
                                <Typography variant="body2">
                                  {selectedServiceAddress.label || "Service Address"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {formatAddress({
                                    addressLine1: selectedServiceAddress.addressLine1,
                                    addressLine2: selectedServiceAddress.addressLine2,
                                    city: selectedServiceAddress.city,
                                    state: selectedServiceAddress.state,
                                    postalCode: selectedServiceAddress.postalCode,
                                  })}
                                </Typography>
                              </Stack>
                            </CardContent>
                          </Card>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <BuildCircleRoundedIcon color="primary" />
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Job Details
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Keep the summary short and easy for dispatch and field review.
                            </Typography>
                          </Box>
                        </Stack>

                        <TextField
                          label="Issue summary"
                          value={issueSummary}
                          onChange={(e) => setIssueSummary(e.target.value)}
                          fullWidth
                          required
                          placeholder="Ex: Kitchen sink backed up / water heater not heating / leak under slab"
                        />

                        <TextField
                          label="Issue details"
                          value={issueDetails}
                          onChange={(e) => setIssueDetails(e.target.value)}
                          fullWidth
                          multiline
                          minRows={4}
                          placeholder="Add additional context, symptoms, access details, prior history, or customer notes."
                        />

                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              select
                              label="Ticket status"
                              value={status}
                              onChange={(e) => setStatus(e.target.value as TicketStatus)}
                              fullWidth
                              helperText="Usually New unless this ticket is already being scheduled."
                            >
                              <MenuItem value="new">New</MenuItem>
                              <MenuItem value="scheduled">Scheduled</MenuItem>
                              <MenuItem value="in_progress">In Progress</MenuItem>
                              <MenuItem value="follow_up">Follow Up</MenuItem>
                              <MenuItem value="completed">Completed</MenuItem>
                              <MenuItem value="cancelled">Cancelled</MenuItem>
                            </TextField>
                          </Grid>

                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              label="Estimated duration (minutes)"
                              type="number"
                              inputProps={{ min: 1 }}
                              value={estimatedDurationMinutes}
                              onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
                              fullWidth
                              required
                              helperText="Example: 60, 120, 240"
                            />
                          </Grid>
                        </Grid>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={`Status: ${getStatusLabel(status)}`} variant="outlined" />
                          {requiresAssignment ? (
                            <Chip color="warning" label="Primary technician required" />
                          ) : (
                            <Chip variant="outlined" label="Assignment optional for now" />
                          )}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <AssignmentIndRoundedIcon color="primary" />
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Assignment
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Select a primary technician. Default helper pairing is added automatically.
                            </Typography>
                          </Box>
                        </Stack>

                        {staffLoading ? (
                          <Stack direction="row" spacing={2} alignItems="center">
                            <CircularProgress size={20} />
                            <Typography color="text.secondary">Loading employee roster…</Typography>
                          </Stack>
                        ) : null}

                        {assignmentError ? <Alert severity="error">{assignmentError}</Alert> : null}

                        <TextField
                          select
                          label="Primary technician"
                          value={primaryTechnicianId}
                          onChange={(e) => {
                            setPrimaryTechnicianId(e.target.value);
                            setError("");
                          }}
                          fullWidth
                          disabled={staffLoading}
                          helperText={
                            requiresAssignment
                              ? "Required for scheduled and in-progress tickets."
                              : "Optional while the ticket is still new."
                          }
                        >
                          <MenuItem value="">Not assigned yet</MenuItem>
                          {currentTechnicians.map((t) => (
                            <MenuItem key={t.uid} value={t.uid}>
                              {t.displayName}
                              {t.email ? ` — ${t.email}` : ""}
                            </MenuItem>
                          ))}
                        </TextField>

                        <Card
                          variant="outlined"
                          sx={{ borderRadius: 4, bgcolor: "background.default" }}
                        >
                          <CardContent sx={{ py: 2 }}>
                            <Stack spacing={1.25}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                Assigned team
                              </Typography>

                              {assignedTeamNames.length ? (
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {assignedTeamNames.map((name) => (
                                    <Chip key={name} label={name} />
                                  ))}
                                </Stack>
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  No team assigned yet.
                                </Typography>
                              )}

                              <Typography variant="body2" color="text.secondary">
                                Helpers and apprentices are auto-added from Employee Profile default
                                pairings.
                              </Typography>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <CalendarMonthRoundedIcon color="primary" />
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Scheduling
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Add a date and time if this ticket is ready to schedule.
                            </Typography>
                          </Box>
                        </Stack>

                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              label="Scheduled date"
                              type="date"
                              value={scheduledDate}
                              onChange={(e) => setScheduledDate(e.target.value)}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>

                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              label="Start time"
                              type="time"
                              value={scheduledStartTime}
                              onChange={(e) => setScheduledStartTime(e.target.value)}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>

                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              label="End time"
                              type="time"
                              value={scheduledEndTime}
                              onChange={(e) => setScheduledEndTime(e.target.value)}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>

                        <Typography variant="body2" color="text.secondary">
                          Tip: leave scheduling blank if the ticket is being created for triage first.
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <Stack spacing={2.5}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <NotesRoundedIcon color="primary" />
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              Internal Notes
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Office-only context, dispatch notes, special handling, or follow-up reminders.
                            </Typography>
                          </Box>
                        </Stack>

                        <TextField
                          label="Internal notes"
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                          fullWidth
                          multiline
                          minRows={3}
                          placeholder="Ex: Customer prefers afternoon arrival, gate code, office follow-up needed, waiting on parts, etc."
                        />
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card
                    variant="outlined"
                    sx={{
                      borderRadius: 4,
                      position: "sticky",
                      bottom: 16,
                      zIndex: 2,
                      bgcolor: "background.paper",
                    }}
                  >
                    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        alignItems={{ xs: "stretch", sm: "center" }}
                        justifyContent="space-between"
                      >
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            Ready to create this ticket?
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Review customer, service address, and issue summary before saving.
                          </Typography>
                        </Box>

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <Button
                            type="button"
                            variant="outlined"
                            onClick={() => router.push("/service-tickets")}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            variant="contained"
                            disabled={saving}
                            startIcon={
                              saving ? <CircularProgress size={18} color="inherit" /> : <AddTaskRoundedIcon />
                            }
                          >
                            {saving ? "Creating…" : "Create Service Ticket"}
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}