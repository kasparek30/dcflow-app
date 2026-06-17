// app/material-orders/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
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
import { alpha, useTheme } from "@mui/material/styles";
import AddTaskRoundedIcon from "@mui/icons-material/AddTaskRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContactPhoneRoundedIcon from "@mui/icons-material/ContactPhoneRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import type { ServiceAddress } from "../../../src/types/customer";
import type { MaterialOrderPickupLocationType } from "../../../src/types/material-order";

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

function nowIso() {
  return new Date().toISOString();
}

function safeStr(x: unknown) {
  return String(x ?? "").trim();
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

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPickupLocationTypeLabel(value: MaterialOrderPickupLocationType) {
  if (value === "office_pickup") return "Customer Pickup at Office";
  if (value === "customer_site") return "Customer / Facility Location";
  return "Other";
}

export default function NewMaterialOrderPage() {
  const router = useRouter();
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [customersLoading, setCustomersLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersError, setCustomersError] = useState("");

  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState<DcflowUserOption[]>([]);
  const [usersError, setUsersError] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedServiceAddressId, setSelectedServiceAddressId] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [pickupLocationType, setPickupLocationType] =
    useState<MaterialOrderPickupLocationType>("office_pickup");
  const [pickupLocationNotes, setPickupLocationNotes] = useState(
    "Customer will pick up from our office."
  );

  const [requestSummary, setRequestSummary] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [targetPickupDate, setTargetPickupDate] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [orderedByUid, setOrderedByUid] = useState("");
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
                  id: addr.id ?? "",
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
        setCustomersError(
          err instanceof Error ? err.message : "Failed to load customers."
        );
      } finally {
        setCustomersLoading(false);
      }
    }

    loadCustomers();
  }, []);

  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await getDocs(collection(db, "users"));

        const items: DcflowUserOption[] = snap.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            uid: String(data.uid ?? docSnap.id),
            displayName: String(data.displayName ?? ""),
            email: data.email ?? undefined,
            role: data.role ?? undefined,
            active: data.active ?? true,
          };
        });

        items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsers(items);
      } catch (err: unknown) {
        setUsersError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setUsersLoading(false);
      }
    }

    loadUsers();
  }, []);

  useEffect(() => {
    if (orderedByUid) return;

    const uid = String(appUser?.uid || "").trim();
    if (uid) {
      setOrderedByUid(uid);
    }
  }, [appUser?.uid, orderedByUid]);

  const searchReady = customerSearch.trim().length >= 2;

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();

    if (!searchReady) return [];

    return customers
      .filter((customer) => getCustomerSearchText(customer).includes(search))
      .slice(0, 6);
  }, [customers, customerSearch, searchReady]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  }, [customers, selectedCustomerId]);

  const availableServiceAddresses = useMemo<AvailableServiceAddressOption[]>(() => {
    if (!selectedCustomer) return [];

    const activeAddresses = selectedCustomer.serviceAddresses.filter(
      (addr) => addr.active !== false
    );

    if (activeAddresses.length === 0) {
      const hasBillingAddress =
        selectedCustomer.billingAddressLine1 ||
        selectedCustomer.billingCity ||
        selectedCustomer.billingState ||
        selectedCustomer.billingPostalCode;

      if (!hasBillingAddress) return [];

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
        },
      ];
    }

    return [...activeAddresses].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedServiceAddressId) return;

    const stillExists = availableServiceAddresses.some(
      (addr) => addr.id === selectedServiceAddressId
    );

    if (!stillExists) {
      setSelectedServiceAddressId("");
    }
  }, [availableServiceAddresses, selectedServiceAddressId]);

  const selectedServiceAddress = useMemo(() => {
    if (!selectedServiceAddressId) return null;

    return (
      availableServiceAddresses.find((addr) => addr.id === selectedServiceAddressId) ??
      null
    );
  }, [availableServiceAddresses, selectedServiceAddressId]);

  const activeUserOptions = useMemo(() => {
    return users
      .filter((user) => user.active !== false)
      .filter((user) => user.role !== "office_display")
      .filter((user) => Boolean(user.uid && user.displayName))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users]);

  const orderedByUser = useMemo(() => {
    return activeUserOptions.find((user) => user.uid === orderedByUid) ?? null;
  }, [activeUserOptions, orderedByUid]);

  function handleSelectCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId) ?? null;

    setSelectedCustomerId(customerId);
    setSelectedServiceAddressId("");
    setError("");

    if (customer) {
      if (!contactPhone.trim() && customer.phonePrimary) {
        setContactPhone(customer.phonePrimary);
      }

      if (!contactEmail.trim() && customer.email) {
        setContactEmail(customer.email);
      }
    }
  }

  function handleClearSelectedCustomer() {
    setSelectedCustomerId("");
    setSelectedServiceAddressId("");
    setCustomerSearch("");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setError("");
  }

  function getFallbackAppUserName() {
    return (
      String((appUser as any)?.displayName || "").trim() ||
      String(appUser?.email || "").trim() ||
      "Current User"
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedCustomer) {
      setError("Please search for and select a billing party / customer account.");
      return;
    }

    if (!contactName.trim()) {
      setError("Please enter a contact person for this material order.");
      return;
    }

    if (!contactPhone.trim()) {
      setError("Please enter a contact phone number for this material order.");
      return;
    }

    if (!requestSummary.trim()) {
      setError("Please enter a material request summary.");
      return;
    }

    const finalOrderedByUid = orderedByUid.trim() || String(appUser?.uid || "").trim();
    const finalOrderedByName =
      orderedByUser?.displayName ||
      (finalOrderedByUid === appUser?.uid ? getFallbackAppUserName() : "");

    if (!finalOrderedByUid || !finalOrderedByName) {
      setError("Please select the employee who placed or is handling this material order.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const timestamp = nowIso();

      const orderRef = doc(collection(db, "materialOrders"));

      await setDoc(orderRef, {
        // Billing party / customer account
        customerId: selectedCustomer.id,
        customerDisplayName: selectedCustomer.displayName,

        // Contact / requester
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim() || null,

        // Optional address context
        serviceAddressId:
          selectedServiceAddress && !selectedServiceAddress.isBillingFallback
            ? selectedServiceAddress.id
            : null,
        serviceAddressLabel: selectedServiceAddress?.label ?? null,
        serviceAddressLine1: selectedServiceAddress?.addressLine1 ?? null,
        serviceAddressLine2: selectedServiceAddress?.addressLine2 ?? null,
        serviceCity: selectedServiceAddress?.city ?? null,
        serviceState: selectedServiceAddress?.state ?? null,
        servicePostalCode: selectedServiceAddress?.postalCode ?? null,

        // Pickup / delivery context
        pickupLocationType,
        pickupLocationNotes: pickupLocationNotes.trim() || null,

        requestSummary: requestSummary.trim(),
        requestDetails: requestDetails.trim() || null,
        internalNotes: internalNotes.trim() || null,

        status: "draft",
        active: true,

        targetPickupDate: targetPickupDate || null,

        pickup: {
          status: "not_ready",
          readyForPickupAt: null,
          readyForPickupByUid: null,
          readyForPickupByName: null,
          pickedUpAt: null,
          pickedUpByName: null,
          markedPickedUpByUid: null,
          markedPickedUpByName: null,
          pickupNotes: null,
        },

        poNumbers: [],
        purchaseOrders: [],
        supplierInvoices: [],
        lineItems: [],

        supplierCostTotal: null,
        customerPriceTotal: null,

        billing: {
          status: "not_ready",
          readyToBillAt: null,
          readyToBillByUid: null,
          readyToBillByName: null,
          qboInvoiceId: null,
          qboInvoiceNumber: null,
          qboInvoiceUrl: null,
          invoicedAt: null,
          invoiceFailedAt: null,
          invoiceError: null,
        },

        materialOrderCode: null,
        materialOrderNumber: null,
        nextPoIndex: 0,

        createdByUid: appUser?.uid || null,
        createdByName: getFallbackAppUserName(),

        orderedByUid: finalOrderedByUid,
        orderedByName: finalOrderedByName,
        orderedAt: timestamp,

        receivedByUid: null,
        receivedByName: null,
        receivedAt: null,

        updatedByUid: appUser?.uid || null,
        updatedByName: getFallbackAppUserName(),

        createdAt: timestamp,
        updatedAt: timestamp,
        cancelledAt: null,
        cancelReason: null,
      });

      router.push("/material-orders");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create material order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="New Material Order">
      <AppShell appUser={appUser}>
        <Box sx={{ maxWidth: 980, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                <Chip
                  icon={<Inventory2RoundedIcon />}
                  label="Material Order"
                  color="primary"
                  variant="outlined"
                  sx={{ borderRadius: 99, fontWeight: 800 }}
                />
                <Chip
                  icon={<ShoppingCartRoundedIcon />}
                  label="No trip / no schedule"
                  variant="outlined"
                  sx={{ borderRadius: 99, fontWeight: 700 }}
                />
                <Chip
                  icon={<StorefrontRoundedIcon />}
                  label="Office pickup by default"
                  variant="outlined"
                  sx={{ borderRadius: 99, fontWeight: 700 }}
                />
              </Stack>

              <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.4 }}>
                New Material Order
              </Typography>
              <Typography variant="body1" sx={{ color: "text.secondary", mt: 1 }}>
                Create a lightweight customer material order for parts-only requests.
                The customer account is the billing party. Address context is optional because
                many customers pick up materials from the office.
              </Typography>
            </Box>

            {customersLoading || usersLoading ? (
              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent sx={{ py: 5 }}>
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary">
                      Loading customers and employees…
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : null}

            {customersError ? <Alert severity="error">{customersError}</Alert> : null}
            {usersError ? <Alert severity="error">{usersError}</Alert> : null}

            {!customersLoading && !usersLoading && !customersError && !usersError ? (
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
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Billing Party
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Select the customer account that will be billed for this material order.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            label="Search billing party / customer account"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="Start typing customer, school, facility, phone, email, or address"
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
                                borderRadius: 3,
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
                                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                        {selectedCustomer.displayName}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        Billing party / customer account
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
                                      sx={{ borderRadius: 99, fontWeight: 700 }}
                                    >
                                      Change billing party
                                    </Button>
                                  </Stack>

                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip label="Billing party selected" color="primary" />
                                    <Chip label="Materials-only order" variant="outlined" />
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
                                    <CardActionArea
                                      onClick={() => handleSelectCustomer(customer.id)}
                                    >
                                      <CardContent>
                                        <Stack spacing={0.75}>
                                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
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
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <ContactPhoneRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Contact Person
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Person we should call when materials are ready or if there is a question.
                              </Typography>
                            </Box>
                          </Stack>

                          <Box
                            sx={{
                              display: "grid",
                              gap: 2,
                              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            }}
                          >
                            <TextField
                              label="Contact person"
                              value={contactName}
                              onChange={(e) => setContactName(e.target.value)}
                              fullWidth
                              required
                              placeholder="Ex: Nicole, John, Maintenance Dept"
                            />

                            <TextField
                              label="Contact phone"
                              value={contactPhone}
                              onChange={(e) => setContactPhone(e.target.value)}
                              fullWidth
                              required
                              placeholder="Ex: 979-555-1234"
                            />
                          </Box>

                          <TextField
                            label="Contact email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            fullWidth
                            placeholder="Optional"
                          />
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <HomeWorkRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Pickup / Location Context
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Office pickup is the default. Address context is optional.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            select
                            label="Pickup / location type"
                            value={pickupLocationType}
                            onChange={(e) =>
                              setPickupLocationType(
                                e.target.value as MaterialOrderPickupLocationType
                              )
                            }
                            fullWidth
                            helperText="Most material-only orders should stay as customer pickup at office."
                          >
                            <MenuItem value="office_pickup">
                              Customer Pickup at Office
                            </MenuItem>
                            <MenuItem value="customer_site">
                              Customer / Facility Location
                            </MenuItem>
                            <MenuItem value="other">Other</MenuItem>
                          </TextField>

                          <TextField
                            label="Pickup / location notes"
                            value={pickupLocationNotes}
                            onChange={(e) => setPickupLocationNotes(e.target.value)}
                            fullWidth
                            multiline
                            minRows={2}
                            placeholder="Ex: Customer will pick up from our office."
                          />

                          <TextField
                            select
                            label="Optional address context"
                            value={selectedServiceAddressId}
                            onChange={(e) => setSelectedServiceAddressId(e.target.value)}
                            fullWidth
                            disabled={!selectedCustomer || availableServiceAddresses.length === 0}
                            helperText={
                              selectedCustomer
                                ? availableServiceAddresses.length > 0
                                  ? "Optional only. Leave blank if customer will pick up from the office."
                                  : "This billing party has no saved address context available."
                                : "Select a billing party first."
                            }
                          >
                            <MenuItem value="">No address needed / office pickup</MenuItem>

                            {availableServiceAddresses.map((addr) => (
                              <MenuItem key={addr.id} value={addr.id}>
                                {addr.label ? `${addr.label} — ` : ""}
                                {addr.addressLine1}, {addr.city}, {addr.state}{" "}
                                {addr.postalCode}
                                {addr.isPrimary ? " (Primary)" : ""}
                                {addr.isBillingFallback ? " (Billing)" : ""}
                              </MenuItem>
                            ))}
                          </TextField>

                          {selectedServiceAddress ? (
                            <Card
                              variant="outlined"
                              sx={{ borderRadius: 1, bgcolor: "background.default" }}
                            >
                              <CardContent sx={{ py: 2 }}>
                                <Stack spacing={0.75}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                    Selected address context
                                  </Typography>
                                  <Typography variant="body2">
                                    {selectedServiceAddress.label || "Customer Address"}
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
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <Inventory2RoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Material Request
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Describe what the billing party/customer wants ordered.
                              </Typography>
                            </Box>
                          </Stack>

                          <TextField
                            label="Material request summary"
                            value={requestSummary}
                            onChange={(e) => setRequestSummary(e.target.value)}
                            fullWidth
                            required
                            placeholder="Ex: Customer needs Delta shower cartridge and trim plate"
                          />

                          <TextField
                            label="Material request details"
                            value={requestDetails}
                            onChange={(e) => setRequestDetails(e.target.value)}
                            fullWidth
                            multiline
                            minRows={4}
                            placeholder="Add part numbers, brand, size, color, supplier preference, customer notes, or anything needed before ordering."
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
                              label="Employee who placed / is handling order"
                              value={orderedByUid}
                              onChange={(e) => setOrderedByUid(e.target.value)}
                              fullWidth
                              required
                              helperText="Used for tracking who handled the materials-only request."
                            >
                              <MenuItem value="">Select employee…</MenuItem>

                              {activeUserOptions.map((user) => (
                                <MenuItem key={user.uid} value={user.uid}>
                                  {user.displayName}
                                  {user.role ? ` — ${user.role}` : ""}
                                </MenuItem>
                              ))}
                            </TextField>

                            <TextField
                              label="Target pickup date"
                              type="date"
                              value={targetPickupDate}
                              onChange={(e) => setTargetPickupDate(e.target.value)}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              inputProps={{ min: isoTodayLocal() }}
                              helperText="Optional. Use when customer expects pickup by a certain date."
                            />
                          </Box>

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip
                              icon={<ShoppingCartRoundedIcon />}
                              label="Status: Draft"
                              variant="outlined"
                              sx={{ borderRadius: 99 }}
                            />
                            <Chip
                              icon={<ReceiptLongRoundedIcon />}
                              label="PO will be generated from order detail"
                              variant="outlined"
                              sx={{ borderRadius: 99 }}
                            />
                            <Chip
                              icon={<StorefrontRoundedIcon />}
                              label={getPickupLocationTypeLabel(pickupLocationType)}
                              variant="outlined"
                              sx={{ borderRadius: 99 }}
                            />
                          </Stack>
                        </Stack>
                      </Box>

                      <Box sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2.5}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <NotesRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Internal Notes
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Office-only notes, reminders, pricing notes, pickup details, or
                                supplier instructions.
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
                            placeholder="Ex: Call customer before ordering, customer wants OEM only, collect payment before pickup, etc."
                          />

                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1.5,
                              borderRadius: 1,
                              bgcolor: alpha(theme.palette.primary.main, 0.03),
                            }}
                          >
                            <Stack spacing={1}>
                              <Typography variant="subtitle2" fontWeight={800}>
                                Lite Flow Summary
                              </Typography>

                              <Typography variant="body2" color="text.secondary">
                                Billing Party:{" "}
                                <strong>{selectedCustomer?.displayName || "—"}</strong>
                              </Typography>

                              <Typography variant="body2" color="text.secondary">
                                Contact:{" "}
                                <strong>{contactName.trim() || "—"}</strong>
                                {contactPhone.trim() ? ` • ${contactPhone.trim()}` : ""}
                              </Typography>

                              <Typography variant="body2" color="text.secondary">
                                Pickup:{" "}
                                <strong>{getPickupLocationTypeLabel(pickupLocationType)}</strong>
                              </Typography>

                              <Typography variant="body2" color="text.secondary">
                                Next steps after creation: generate PO, order materials,
                                receive/match supplier invoice, mark ready for pickup, then send
                                to Ready to Bill.
                              </Typography>
                            </Stack>
                          </Paper>
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
                    boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.08)}`,
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
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          Ready to create this material order?
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          This will not create a service ticket, scheduled trip, crew assignment,
                          MyDay card, or timer.
                        </Typography>
                      </Box>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          type="button"
                          variant="outlined"
                          onClick={() => router.push("/material-orders")}
                          disabled={saving}
                          sx={{ borderRadius: 99, fontWeight: 700 }}
                        >
                          Cancel
                        </Button>

                        <Button
                          type="submit"
                          variant="contained"
                          disabled={saving}
                          startIcon={
                            saving ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : (
                              <AddTaskRoundedIcon />
                            )
                          }
                          sx={{ borderRadius: 99, fontWeight: 800 }}
                        >
                          {saving ? "Creating…" : "Create Material Order"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                {selectedCustomer && requestSummary.trim() ? (
                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mt: 2 }}
                  >
                    <Chip
                      icon={<CheckCircleRoundedIcon />}
                      label={`Billing: ${selectedCustomer.displayName}`}
                      color="primary"
                      variant="outlined"
                      sx={{ borderRadius: 99 }}
                    />
                    <Chip
                      icon={<ContactPhoneRoundedIcon />}
                      label={`${contactName.trim() || "Contact"}${
                        contactPhone.trim() ? ` • ${contactPhone.trim()}` : ""
                      }`}
                      variant="outlined"
                      sx={{ borderRadius: 99 }}
                    />
                    <Chip
                      icon={<Inventory2RoundedIcon />}
                      label={requestSummary.trim()}
                      variant="outlined"
                      sx={{ borderRadius: 99 }}
                    />
                  </Stack>
                ) : null}
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}