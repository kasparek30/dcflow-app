// app/service-tickets/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
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
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddHomeRoundedIcon from "@mui/icons-material/AddHomeRounded";
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
import AddressAutocompleteField from "../../../components/AddressAutocompleteField";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceAddress } from "../../../src/types/customer";

type ServiceAddressSource =
  | "manual"
  | "google_places"
  | "qbo_ship"
  | "qbo_bill"
  | "legacy";

type ServiceAddressOption = Omit<ServiceAddress, "source"> & {
  source?: ServiceAddressSource | null;
};

type AvailableServiceAddressOption = ServiceAddressOption & {
  isBillingFallback?: boolean;
};

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
  serviceAddresses: ServiceAddressOption[];
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

type GoogleAddressSelectionLike = {
  placeId?: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  source?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function safeStr(x: unknown) {
  return String(x ?? "").trim();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id_${Math.random().toString(36).slice(2, 11)}`;
}

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
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  const line1 = [params.addressLine1, params.addressLine2]
    .map((x) => safeStr(x))
    .filter(Boolean)
    .join(", ");

  const line2 = [params.city, params.state, params.postalCode]
    .map((x) => safeStr(x))
    .filter(Boolean)
    .join(" ");

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
  const [estimatedDurationHours, setEstimatedDurationHours] = useState("4");
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

  const [quickAddServiceLocationOpen, setQuickAddServiceLocationOpen] = useState(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState("");
  const [quickServiceLabel, setQuickServiceLabel] = useState("");
  const [quickServiceAddressSearch, setQuickServiceAddressSearch] = useState("");
  const [quickServiceAddressLine1, setQuickServiceAddressLine1] = useState("");
  const [quickServiceAddressLine2, setQuickServiceAddressLine2] = useState("");
  const [quickServiceCity, setQuickServiceCity] = useState("");
  const [quickServiceState, setQuickServiceState] = useState("");
  const [quickServicePostalCode, setQuickServicePostalCode] = useState("");
  const [quickServiceNotes, setQuickServiceNotes] = useState("");
  const [quickServiceAddressSource, setQuickServiceAddressSource] =
    useState<ServiceAddressSource>("manual");

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
            displayName:
              data.displayName ??
              data.customerDisplayName ??
              data.qboDisplayName ??
              "",
            phonePrimary: data.phonePrimary ?? data.phone ?? "",
            phoneSecondary: data.phoneSecondary ?? undefined,
            email: data.email ?? undefined,
            billingAddressLine1:
              data.billingAddressLine1 ?? data.billAddrLine1 ?? "",
            billingAddressLine2:
              data.billingAddressLine2 ??
              data.billAddrLine2 ??
              data.billAddrLine3 ??
              undefined,
            billingCity: data.billingCity ?? data.billAddrCity ?? "",
            billingState: data.billingState ?? data.billAddrState ?? "",
            billingPostalCode:
              data.billingPostalCode ?? data.billAddrPostalCode ?? "",
            serviceAddresses: Array.isArray(data.serviceAddresses)
              ? data.serviceAddresses.map((addr: any) => ({
                  id: addr.id ?? createId(),
                  label: addr.label ?? undefined,
                  addressLine1: addr.addressLine1 ?? "",
                  addressLine2: addr.addressLine2 ?? undefined,
                  city: addr.city ?? "",
                  state: addr.state ?? "",
                  postalCode: addr.postalCode ?? "",
                  notes: addr.notes ?? undefined,
                  active: addr.active ?? true,
                  isPrimary: addr.isPrimary ?? false,
source:
  addr.source === "manual" ||
  addr.source === "google_places" ||
  addr.source === "qbo_ship" ||
  addr.source === "qbo_bill" ||
  addr.source === "legacy"
    ? addr.source
    : undefined,
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

  const searchReady = customerSearch.trim().length >= 2;

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!searchReady) {
      return [];
    }

    return customers
      .filter((customer) => getCustomerSearchText(customer).includes(search))
      .slice(0, 6);
  }, [customers, customerSearch, searchReady]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const activeServiceAddressCount = useMemo(() => {
    return selectedCustomer?.serviceAddresses.filter((addr) => addr.active !== false).length ?? 0;
  }, [selectedCustomer]);

const availableServiceAddresses = useMemo<AvailableServiceAddressOption[]>(() => {
      if (!selectedCustomer) return [];

    const activeAddresses = selectedCustomer.serviceAddresses.filter(
      (addr) => addr.active !== false
    );

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
  isBillingFallback: true,
} satisfies AvailableServiceAddressOption,
      ];
    }

    const sorted = [...activeAddresses].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });

return sorted;
  }, [selectedCustomer]);

  useEffect(() => {
    if (availableServiceAddresses.length > 0) {
      const stillExists = availableServiceAddresses.some(
        (addr) => addr.id === selectedServiceAddressId
      );

      if (!stillExists) {
        setSelectedServiceAddressId(availableServiceAddresses[0].id);
      }
    } else {
      setSelectedServiceAddressId("");
    }
  }, [availableServiceAddresses, selectedServiceAddressId]);

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setQuickAddServiceLocationOpen(false);
    resetQuickAddServiceLocationForm();
    setError("");
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomerId("");
    setSelectedServiceAddressId("");
    setCustomerSearch("");
    setQuickAddServiceLocationOpen(false);
    resetQuickAddServiceLocationForm();
    setError("");
  }

  function resetQuickAddServiceLocationForm() {
    setQuickAddError("");
    setQuickServiceLabel("");
    setQuickServiceAddressSearch("");
    setQuickServiceAddressLine1("");
    setQuickServiceAddressLine2("");
    setQuickServiceCity("");
    setQuickServiceState("");
    setQuickServicePostalCode("");
    setQuickServiceNotes("");
    setQuickServiceAddressSource("manual");
  }

  function markQuickServiceAddressManual() {
    setQuickServiceAddressSource((current) =>
      current === "google_places" ? "manual" : current
    );
  }

  function handleQuickServiceGoogleAddressSelected(
    selection: GoogleAddressSelectionLike
  ) {
    setQuickServiceAddressSearch(selection.formattedAddress || "");
    setQuickServiceAddressLine1(selection.addressLine1 || "");
    setQuickServiceAddressLine2(selection.addressLine2 || "");
    setQuickServiceCity(selection.city || "");
    setQuickServiceState(selection.state || "");
    setQuickServicePostalCode(selection.postalCode || "");
    setQuickServiceAddressSource("google_places");
  }

  async function handleQuickAddServiceLocation() {
    if (!selectedCustomer) {
      setQuickAddError("Select a customer first.");
      return;
    }

    const addressLine1 = quickServiceAddressLine1.trim();
    const city = quickServiceCity.trim();
    const state = quickServiceState.trim();
    const postalCode = quickServicePostalCode.trim();

    if (!addressLine1) {
      setQuickAddError("Address line 1 is required.");
      return;
    }

    if (!city) {
      setQuickAddError("City is required.");
      return;
    }

    if (!state) {
      setQuickAddError("State is required.");
      return;
    }

    if (!postalCode) {
      setQuickAddError("Postal code is required.");
      return;
    }

    setQuickAddError("");
    setQuickAddSaving(true);

    try {
      const timestamp = nowIso();

      const activeExisting = selectedCustomer.serviceAddresses.filter(
        (addr) => addr.active !== false
      );

      const nextAddress: ServiceAddressOption = {
        id: createId(),
        label: quickServiceLabel.trim() || undefined,
        addressLine1,
        addressLine2: quickServiceAddressLine2.trim() || undefined,
        city,
        state,
        postalCode,
        notes: quickServiceNotes.trim() || undefined,
        active: true,
        isPrimary: activeExisting.length === 0,
        source: quickServiceAddressSource,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const nextServiceAddresses = [
        ...selectedCustomer.serviceAddresses,
        nextAddress,
      ];

      const nextServiceAddressesForFirestore = nextServiceAddresses.map((addr) => ({
        ...addr,
        label: addr.label ?? null,
        addressLine2: addr.addressLine2 ?? null,
        notes: addr.notes ?? null,
        source: addr.source ?? null,
      }));

      await updateDoc(doc(db, "customers", selectedCustomer.id), {
        serviceAddresses: nextServiceAddressesForFirestore,
        updatedAt: timestamp,
      });

      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === selectedCustomer.id
            ? {
                ...customer,
                serviceAddresses: nextServiceAddresses,
              }
            : customer
        )
      );

      setSelectedServiceAddressId(nextAddress.id);
      setQuickAddServiceLocationOpen(false);
      resetQuickAddServiceLocationForm();
    } catch (err: unknown) {
      setQuickAddError(
        err instanceof Error ? err.message : "Failed to add service location."
      );
    } finally {
      setQuickAddSaving(false);
    }
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

    const hours = Number(estimatedDurationHours);

    if (!Number.isFinite(hours) || hours < 1) {
      setError("Estimated duration must be at least 1 hour.");
      return;
    }

    if (!Number.isInteger(hours * 2)) {
      setError("Estimated duration must use 0.5 hour increments.");
      return;
    }

    if ((status === "scheduled" || status === "in_progress") && !primaryTechnicianId.trim()) {
      setError("Please select a primary technician for scheduled or in-progress tickets.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const timestamp = nowIso();

      const primaryUid = primaryTechnicianId.trim() || null;
      const teamUids =
        primaryUid && assignedTechnicianIds.length
          ? assignedTechnicianIds
          : primaryUid
            ? [primaryUid]
            : [];

      const estimatedDurationMinutes = Math.round(hours * 60);

      const docRef = await addDoc(collection(db, "serviceTickets"), {
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

serviceAddressId: chosenAddress.isBillingFallback ? null : chosenAddress.id,
        serviceAddressLabel: chosenAddress.label ?? null,
        serviceAddressLine1: chosenAddress.addressLine1,
        serviceAddressLine2: chosenAddress.addressLine2 ?? null,
        serviceCity: chosenAddress.city,
        serviceState: chosenAddress.state,
        servicePostalCode: chosenAddress.postalCode,

        issueSummary: issueSummary.trim(),
        issueDetails: issueDetails.trim() || null,

        status,
        estimatedDurationMinutes,

        scheduledDate: scheduledDate || null,
        scheduledStartTime: scheduledStartTime || null,
        scheduledEndTime: scheduledEndTime || null,

        assignedTechnicianId: primaryUid,
        assignedTechnicianName: primaryTechnician ? primaryTechnician.displayName : null,

        primaryTechnicianId: primaryUid,
        assignedTechnicianIds: teamUids.length ? teamUids : null,

        internalNotes: internalNotes.trim() || null,

        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
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
        <Box sx={{ maxWidth: 940, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.4 }}>
                New Service Ticket
              </Typography>
              <Typography variant="body1" sx={{ color: "text.secondary", mt: 1 }}>
                Create the ticket first, then optionally assign and schedule it now.
              </Typography>
            </Box>

            {customersLoading ? (
              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ py: 5 }}>
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary">
                      Loading customers…
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {customersError ? <Alert severity="error">{customersError}</Alert> : null}

            {!customersLoading && !customersError ? (
              <Box component="form" onSubmit={handleSubmit}>
                <Card variant="outlined" sx={{ borderRadius: 4, overflow: "hidden" }}>
                  <CardContent sx={{ p: 0 }}>
                    <Stack divider={<Divider />} spacing={0}>
                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          {error ? <Alert severity="error">{error}</Alert> : null}

                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <PersonSearchRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Customer
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Search by customer name, phone, email, or address.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            label="Search customer"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="Start typing to find a customer"
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
                                borderRadius: 1,
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
                                      label={`${activeServiceAddressCount} saved service location${
                                        activeServiceAddressCount === 1 ? "" : "s"
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
                                    }) || "—"}
                                  </Typography>
                                </Stack>
                              </CardContent>
                            </Card>
                          ) : searchReady ? (
                            filteredCustomers.length === 0 ? (
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
                              <Stack spacing={1.25}>
                                {filteredCustomers.map((customer) => (
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
                                            <Typography variant="caption" color="text.secondary">
                                              {customer.email}
                                            </Typography>
                                          ) : null}
                                          <Typography variant="caption" color="text.secondary">
                                            {formatAddress({
                                              addressLine1: customer.billingAddressLine1,
                                              addressLine2: customer.billingAddressLine2,
                                              city: customer.billingCity,
                                              state: customer.billingState,
                                              postalCode: customer.billingPostalCode,
                                            }) || "No billing address"}
                                          </Typography>
                                        </Stack>
                                      </CardContent>
                                    </CardActionArea>
                                  </Card>
                                ))}
                              </Stack>
                            )
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Type at least 2 characters to search.
                            </Typography>
                          )}

                          <Stack spacing={1.5} sx={{ pt: 1 }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                              <HomeWorkRoundedIcon color="primary" />
                              <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                  Service Location
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Choose where the work will be performed, or quick add a new
                                  location for this customer.
                                </Typography>
                              </Box>
                            </Stack>

                            <TextField
  select
  label="Service address"
  value={selectedServiceAddressId}
  onChange={(e) => {
    const nextValue = String(e.target.value);

    if (nextValue === "__quick_add__") {
      setQuickAddServiceLocationOpen(true);
      setQuickAddError("");
      return;
    }

    setSelectedServiceAddressId(nextValue);
  }}
  fullWidth
  required
  disabled={!selectedCustomer}
  helperText={
    selectedCustomer
      ? "Choose an existing location, or quick add a new one from this list."
      : "Select a customer first."
  }
>
  <MenuItem value="">
    {selectedCustomer
      ? "Select a service address"
      : "Select a customer first"}
  </MenuItem>

  {availableServiceAddresses.map((addr) => (
    <MenuItem key={addr.id} value={addr.id}>
      {addr.label ? `${addr.label} — ` : ""}
      {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
      {addr.isPrimary ? " (Primary)" : ""}
    </MenuItem>
  ))}

  {selectedCustomer ? (
    <MenuItem
      value="__quick_add__"
      sx={{
        mt: 0.5,
        borderTop: "1px solid",
        borderColor: "divider",
        color: "primary.main",
        fontWeight: 800,
      }}
    >
      + Quick Add Service Location
    </MenuItem>
  ) : null}
</TextField>

                            {selectedServiceAddress ? (
                              <Card
                                variant="outlined"
                                sx={{ borderRadius: 1, bgcolor: "background.default" }}
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
                                      }) || "—"}
                                    </Typography>
                                  </Stack>
                                </CardContent>
                              </Card>
                            ) : null}

                            {selectedCustomer ? (
                              <Stack spacing={1.5}>
                                {quickAddServiceLocationOpen ? (
                                  <Paper
                                    variant="outlined"
                                    sx={{
                                      p: { xs: 2, sm: 2.5 },
                                      borderRadius: 4,
                                      bgcolor: "background.default",
                                    }}
                                  >
                                    <Stack spacing={2}>
                                      <Box>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                          Quick Add Service Location
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                          Add a new service location to this customer, then use it
                                          for this ticket.
                                        </Typography>
                                      </Box>

                                      <TextField
                                        label="Label"
                                        value={quickServiceLabel}
                                        onChange={(e) => setQuickServiceLabel(e.target.value)}
                                        fullWidth
                                        placeholder="Home, Rental House, Shop, Weekend House..."
                                        disabled={quickAddSaving}
                                      />

                                      <AddressAutocompleteField
                                        label="Search address"
                                        value={quickServiceAddressSearch}
                                        onChange={(value) => {
                                          setQuickServiceAddressSearch(value);
                                          markQuickServiceAddressManual();
                                        }}
                                        onSelectAddress={handleQuickServiceGoogleAddressSelected}
                                        helperText="Start typing to search for a real address, or keep entering it manually below."
                                        placeholder="Start typing a service address..."
                                        disabled={quickAddSaving}
                                      />

                                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Chip
                                          size="small"
                                          label={
                                            quickServiceAddressSource === "google_places"
                                              ? "Google suggested"
                                              : "Manual entry"
                                          }
                                          color={
                                            quickServiceAddressSource === "google_places"
                                              ? "primary"
                                              : "default"
                                          }
                                          variant={
                                            quickServiceAddressSource === "google_places"
                                              ? "filled"
                                              : "outlined"
                                          }
                                          sx={{ borderRadius: 99, fontWeight: 700 }}
                                        />
                                      </Stack>

                                      <TextField
                                        label="Address line 1"
                                        value={quickServiceAddressLine1}
                                        onChange={(e) => {
                                          setQuickServiceAddressLine1(e.target.value);
                                          markQuickServiceAddressManual();
                                        }}
                                        required
                                        fullWidth
                                        disabled={quickAddSaving}
                                      />

                                      <TextField
                                        label="Address line 2"
                                        value={quickServiceAddressLine2}
                                        onChange={(e) => {
                                          setQuickServiceAddressLine2(e.target.value);
                                          markQuickServiceAddressManual();
                                        }}
                                        fullWidth
                                        disabled={quickAddSaving}
                                      />

                                      <Box
                                        sx={{
                                          display: "grid",
                                          gridTemplateColumns: {
                                            xs: "1fr",
                                            sm: "repeat(3, minmax(0, 1fr))",
                                          },
                                          gap: 2,
                                        }}
                                      >
                                        <TextField
                                          label="City"
                                          value={quickServiceCity}
                                          onChange={(e) => {
                                            setQuickServiceCity(e.target.value);
                                            markQuickServiceAddressManual();
                                          }}
                                          required
                                          fullWidth
                                          disabled={quickAddSaving}
                                        />

                                        <TextField
                                          label="State"
                                          value={quickServiceState}
                                          onChange={(e) => {
                                            setQuickServiceState(e.target.value);
                                            markQuickServiceAddressManual();
                                          }}
                                          required
                                          fullWidth
                                          disabled={quickAddSaving}
                                        />

                                        <TextField
                                          label="Postal code"
                                          value={quickServicePostalCode}
                                          onChange={(e) => {
                                            setQuickServicePostalCode(e.target.value);
                                            markQuickServiceAddressManual();
                                          }}
                                          required
                                          fullWidth
                                          disabled={quickAddSaving}
                                        />
                                      </Box>

                                      <TextField
                                        label="Notes"
                                        value={quickServiceNotes}
                                        onChange={(e) => setQuickServiceNotes(e.target.value)}
                                        multiline
                                        minRows={3}
                                        fullWidth
                                        disabled={quickAddSaving}
                                        placeholder="Gate code, unit note, access details, etc."
                                      />

                                      {quickAddError ? (
                                        <Alert severity="error">{quickAddError}</Alert>
                                      ) : null}

                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1.5}
                                        justifyContent="flex-end"
                                      >
                                        <Button
                                          type="button"
                                          variant="outlined"
                                          onClick={() => {
                                            setQuickAddServiceLocationOpen(false);
                                            resetQuickAddServiceLocationForm();
                                          }}
                                          disabled={quickAddSaving}
                                        >
                                          Cancel
                                        </Button>

                                        <Button
                                          type="button"
                                          variant="contained"
                                          startIcon={
                                            quickAddSaving ? (
                                              <CircularProgress size={18} color="inherit" />
                                            ) : (
                                              <AddHomeRoundedIcon />
                                            )
                                          }
                                          onClick={handleQuickAddServiceLocation}
                                          disabled={quickAddSaving}
                                        >
                                          {quickAddSaving ? "Saving..." : "Add & Use Location"}
                                        </Button>
                                      </Stack>
                                    </Stack>
                                  </Paper>
                                ) : null}
                              </Stack>
                            ) : null}
                          </Stack>
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <BuildCircleRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Work Order Details
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Add the core issue and current ticket status.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            label="Issue summary"
                            value={issueSummary}
                            onChange={(e) => setIssueSummary(e.target.value)}
                            fullWidth
                            required
                            placeholder="Ex: Water heater not heating"
                          />

                          <TextField
                            label="Issue details"
                            value={issueDetails}
                            onChange={(e) => setIssueDetails(e.target.value)}
                            fullWidth
                            multiline
                            minRows={4}
                            placeholder="Add symptoms, prior history, access info, or anything the field crew should know."
                          />

                          <Box
                            sx={{
                              display: "grid",
                              gap: 2,
                              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            }}
                          >
                            <TextField
                              select
                              label="Ticket status"
                              value={status}
                              onChange={(e) => setStatus(e.target.value as TicketStatus)}
                              fullWidth
                              helperText="Usually New when first creating a ticket."
                            >
                              <MenuItem value="new">New</MenuItem>
                              <MenuItem value="scheduled">Scheduled</MenuItem>
                              <MenuItem value="in_progress">In Progress</MenuItem>
                              <MenuItem value="follow_up">Follow Up</MenuItem>
                              <MenuItem value="completed">Completed</MenuItem>
                              <MenuItem value="cancelled">Cancelled</MenuItem>
                            </TextField>

                            <TextField
                              label="Estimated duration (hours)"
                              type="number"
                              inputProps={{ min: 1, step: 0.5 }}
                              value={estimatedDurationHours}
                              onChange={(e) => setEstimatedDurationHours(e.target.value)}
                              fullWidth
                              required
                              helperText="Minimum 1 hour. Use 0.5 hour increments."
                            />
                          </Box>

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`Status: ${getStatusLabel(status)}`} variant="outlined" />
                            {requiresAssignment ? (
                              <Chip color="warning" label="Tech required for this status" />
                            ) : (
                              <Chip variant="outlined" label="Can be created without assignment" />
                            )}
                          </Stack>
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <AssignmentIndRoundedIcon color="primary" />
                            <CalendarMonthRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Dispatch Setup (Optional)
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Assign a tech and schedule now, or leave blank and create the ticket
                                first.
                              </Typography>
                            </Box>
                          </Stack>

                          {assignmentError ? <Alert severity="error">{assignmentError}</Alert> : null}

                          {staffLoading ? (
                            <Stack direction="row" spacing={2} alignItems="center">
                              <CircularProgress size={20} />
                              <Typography variant="body2" color="text.secondary">
                                Loading employee roster…
                              </Typography>
                            </Stack>
                          ) : (
                            <Stack spacing={2}>
                              <TextField
                                select
                                label="Primary technician"
                                value={primaryTechnicianId}
                                onChange={(e) => {
                                  setPrimaryTechnicianId(e.target.value);
                                  setError("");
                                }}
                                fullWidth
                                helperText={
                                  requiresAssignment
                                    ? "Required because the ticket status is Scheduled or In Progress."
                                    : "Optional for new tickets."
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
                                sx={{ borderRadius: 1, bgcolor: "background.default" }}
                              >
                                <CardContent sx={{ py: 2 }}>
                                  <Stack spacing={1.25}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      Assigned team preview
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

                                    <Typography variant="caption" color="text.secondary">
                                      Helpers and apprentices are auto-added from Employee Profile
                                      default pairings.
                                    </Typography>
                                  </Stack>
                                </CardContent>
                              </Card>

                              <Box
                                sx={{
                                  display: "grid",
                                  gap: 2,
                                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
                                }}
                              >
                                <TextField
                                  label="Scheduled date"
                                  type="date"
                                  value={scheduledDate}
                                  onChange={(e) => setScheduledDate(e.target.value)}
                                  fullWidth
                                  InputLabelProps={{ shrink: true }}
                                />

                                <TextField
                                  label="Start time"
                                  type="time"
                                  value={scheduledStartTime}
                                  onChange={(e) => setScheduledStartTime(e.target.value)}
                                  fullWidth
                                  InputLabelProps={{ shrink: true }}
                                />

                                <TextField
                                  label="End time"
                                  type="time"
                                  value={scheduledEndTime}
                                  onChange={(e) => setScheduledEndTime(e.target.value)}
                                  fullWidth
                                  InputLabelProps={{ shrink: true }}
                                />
                              </Box>

                              <Typography variant="body2" color="text.secondary">
                                Leave these blank if the office wants to create the ticket first and
                                handle dispatch later.
                              </Typography>
                            </Stack>
                          )}
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <NotesRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Internal Notes
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Office-only notes, reminders, or special handling details.
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
                            placeholder="Ex: Customer prefers afternoon arrival, gate code, special follow-up needed, waiting on parts, etc."
                          />
                        </Stack>
                      </Box>
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
                    mt: 2,
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
                          Review customer, service location, and issue summary before saving.
                        </Typography>
                      </Box>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          type="button"
                          variant="outlined"
                          onClick={() => router.push("/service-tickets")}
                          disabled={saving || quickAddSaving}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={saving || quickAddSaving}
                          startIcon={
                            saving ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : (
                              <AddTaskRoundedIcon />
                            )
                          }
                        >
                          {saving ? "Creating…" : "Create Service Ticket"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}