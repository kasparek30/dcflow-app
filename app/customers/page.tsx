// app/customers/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PhoneRoundedIcon from "@mui/icons-material/PhoneRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { Customer } from "../../src/types/customer";

function normalizeSearchText(input: string) {
  return (input || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function digitsOnly(input: string) {
  return String(input || "").replace(/\D/g, "");
}

function buildCustomerSearchBlob(c: Customer) {
  const parts: string[] = [];

  parts.push(c.displayName || "");
  parts.push(c.phonePrimary || "");
  parts.push(c.phoneSecondary || "");
  parts.push(c.email || "");

  parts.push(c.billingAddressLine1 || "");
  parts.push(c.billingAddressLine2 || "");
  parts.push(c.billingCity || "");
  parts.push(c.billingState || "");
  parts.push(c.billingPostalCode || "");

  if (Array.isArray(c.serviceAddresses)) {
    for (const a of c.serviceAddresses) {
      parts.push(a.label || "");
      parts.push(a.addressLine1 || "");
      parts.push(a.addressLine2 || "");
      parts.push(a.city || "");
      parts.push(a.state || "");
      parts.push(a.postalCode || "");
      parts.push(a.notes || "");
    }
  }

  const phoneDigits = [digitsOnly(c.phonePrimary), digitsOnly(c.phoneSecondary || "")]
    .filter(Boolean)
    .join(" ");

  parts.push(phoneDigits);

  return normalizeSearchText(parts.join(" • "));
}

function createAddressId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `addr_${Math.random().toString(36).slice(2, 11)}`;
}

function formatAddressLines(input: {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}) {
  const line1 = input.line1?.trim() || "";
  const line2 = input.line2?.trim() || "";
  const city = input.city?.trim() || "";
  const state = input.state?.trim() || "";
  const postalCode = input.postalCode?.trim() || "";

  const cityStateZip = [city, state].filter(Boolean).join(", ");
  const cityStateZipWithPostal = [cityStateZip, postalCode].filter(Boolean).join(" ");

  return {
    line1,
    line2,
    line3: cityStateZipWithPostal,
  };
}

function getDisplayAddress(customer: Customer) {
  const primaryServiceAddress =
    customer.serviceAddresses?.find((addr) => addr.isPrimary) ?? customer.serviceAddresses?.[0];

  if (primaryServiceAddress) {
    return {
      ...formatAddressLines({
        line1: primaryServiceAddress.addressLine1,
        line2: primaryServiceAddress.addressLine2,
        city: primaryServiceAddress.city,
        state: primaryServiceAddress.state,
        postalCode: primaryServiceAddress.postalCode,
      }),
      sourceLabel: primaryServiceAddress.isPrimary ? "Primary service location" : "Service location",
    };
  }

  return {
    ...formatAddressLines({
      line1: customer.billingAddressLine1,
      line2: customer.billingAddressLine2,
      city: customer.billingCity,
      state: customer.billingState,
      postalCode: customer.billingPostalCode,
    }),
    sourceLabel: "Billing address",
  };
}

function getActiveServiceAddressCount(customer: Customer) {
  return (customer.serviceAddresses || []).filter((addr) => addr.active !== false).length;
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "default" | "primary";
}) {
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        p: 2,
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
        background:
          props.tone === "primary"
            ? alpha(theme.palette.primary.main, 0.08)
            : theme.palette.background.paper,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 3,
            display: "grid",
            placeItems: "center",
            backgroundColor:
              props.tone === "primary"
                ? alpha(theme.palette.primary.main, 0.14)
                : alpha(theme.palette.text.primary, 0.06),
            color: props.tone === "primary" ? theme.palette.primary.main : theme.palette.text.primary,
            flexShrink: 0,
          }}
        >
          {props.icon}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {props.label}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {props.value}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function LoadingCard() {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.8)}`,
      }}
    >
      <CardContent sx={{ p: 2.25 }}>
        <Stack spacing={1.25}>
          <Skeleton variant="text" width="45%" height={34} />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="72%" />
          <Skeleton variant="text" width="58%" />
          <Stack direction="row" spacing={1}>
            <Skeleton variant="rounded" width={96} height={28} />
            <Skeleton variant="rounded" width={84} height={28} />
            <Skeleton variant="rounded" width={108} height={28} />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function CustomersPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [hideAllUntilSearch, setHideAllUntilSearch] = useState(true);

  const MIN_CHARS_TO_SEARCH = 2;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    async function loadCustomers() {
      try {
        const q = query(collection(db, "customers"), orderBy("displayName"));
        const snap = await getDocs(q);

        const items: Customer[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            id: docSnap.id,
            quickbooksCustomerId: data.quickbooksCustomerId ?? undefined,
            quickbooksSyncStatus: data.quickbooksSyncStatus ?? undefined,
            lastQuickbooksSyncAt: data.lastQuickbooksSyncAt ?? undefined,
            quickbooksLastError: data.quickbooksLastError ?? undefined,
            source: data.source ?? "dcflow",
            displayName: data.displayName ?? "",
            phonePrimary: data.phonePrimary ?? "",
            phoneSecondary: data.phoneSecondary ?? undefined,
            email: data.email ?? undefined,
            billingAddressLine1: data.billingAddressLine1 ?? "",
            billingAddressLine2: data.billingAddressLine2 ?? undefined,
            billingCity: data.billingCity ?? "",
            billingState: data.billingState ?? "",
            billingPostalCode: data.billingPostalCode ?? "",
            billingAddressSource: data.billingAddressSource ?? undefined,
            serviceAddresses: Array.isArray(data.serviceAddresses)
              ? data.serviceAddresses.map((addr: any) => ({
                  id: addr.id ?? createAddressId(),
                  label: addr.label ?? undefined,
                  addressLine1: addr.addressLine1 ?? "",
                  addressLine2: addr.addressLine2 ?? undefined,
                  city: addr.city ?? "",
                  state: addr.state ?? "",
                  postalCode: addr.postalCode ?? "",
                  notes: addr.notes ?? undefined,
                  active: addr.active ?? true,
                  isPrimary: addr.isPrimary ?? false,
                  source: addr.source ?? undefined,
                  createdAt: addr.createdAt ?? undefined,
                  updatedAt: addr.updatedAt ?? undefined,
                }))
              : [],
            notes: data.notes ?? undefined,
            active: data.active ?? true,
            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,
          };
        });

        setCustomers(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load customers.");
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, []);

  const customersWithSearch = useMemo(() => {
    return customers.map((c) => ({
      customer: c,
      blob: buildCustomerSearchBlob(c),
    }));
  }, [customers]);

  const normalizedQuery = useMemo(() => normalizeSearchText(debouncedSearch), [debouncedSearch]);
  const queryDigits = useMemo(() => digitsOnly(normalizedQuery), [normalizedQuery]);

  const shouldShowResults = useMemo(() => {
    if (!hideAllUntilSearch) return true;
    return normalizedQuery.length >= MIN_CHARS_TO_SEARCH;
  }, [hideAllUntilSearch, normalizedQuery]);

  const filteredCustomers = useMemo(() => {
    if (!hideAllUntilSearch) {
      if (!normalizedQuery) return customers;

      return customersWithSearch
        .filter(({ blob, customer }) => {
          if (blob.includes(normalizedQuery)) return true;
          if (queryDigits && digitsOnly(customer.phonePrimary || "").includes(queryDigits)) return true;
          if (queryDigits && digitsOnly(customer.phoneSecondary || "").includes(queryDigits)) return true;
          return false;
        })
        .map((x) => x.customer);
    }

    if (normalizedQuery.length < MIN_CHARS_TO_SEARCH) return [];

    return customersWithSearch
      .filter(({ blob, customer }) => {
        if (blob.includes(normalizedQuery)) return true;
        if (queryDigits && digitsOnly(customer.phonePrimary || "").includes(queryDigits)) return true;
        if (queryDigits && digitsOnly(customer.phoneSecondary || "").includes(queryDigits)) return true;
        return false;
      })
      .map((x) => x.customer);
  }, [customers, customersWithSearch, hideAllUntilSearch, normalizedQuery, queryDigits]);

  const linkedCount = useMemo(
    () => customers.filter((customer) => Boolean(customer.quickbooksCustomerId)).length,
    [customers]
  );

  const multiAddressCount = useMemo(
    () => customers.filter((customer) => getActiveServiceAddressCount(customer) > 1).length,
    [customers]
  );

  const customersWithServiceLocationsCount = useMemo(
    () => customers.filter((customer) => getActiveServiceAddressCount(customer) > 0).length,
    [customers]
  );

  return (
    <ProtectedPage fallbackTitle="Customers">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1320, mx: "auto", px: { xs: 1, sm: 2 }, pb: 4 }}>
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 5,
                px: { xs: 2, sm: 3 },
                py: { xs: 2.25, sm: 3 },
                border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(
                  theme.palette.primary.main,
                  0.03
                )} 100%)`,
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.4 }}>
                    Customers
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
                    Search customers by name, phone, email, billing address, or service location. This page is now
                    structured as a cleaner Material 3 customer workspace instead of a plain list.
                  </Typography>
                </Box>

                <Button
                  component={Link}
                  href="/customers/new"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  size="large"
                  sx={{
                    borderRadius: 99,
                    px: 2.25,
                    minHeight: 48,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    boxShadow: "none",
                  }}
                >
                  New Customer
                </Button>
              </Stack>
            </Paper>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(4, minmax(0, 1fr))",
                },
                gap: 1.5,
              }}
            >
              <MetricCard
                icon={<PersonRoundedIcon fontSize="small" />}
                label="Total customers"
                value={loading ? "—" : customers.length}
                tone="primary"
              />
              <MetricCard
                icon={<SyncRoundedIcon fontSize="small" />}
                label="Linked to QBO"
                value={loading ? "—" : linkedCount}
              />
              <MetricCard
                icon={<LocationOnRoundedIcon fontSize="small" />}
                label="With service locations"
                value={loading ? "—" : customersWithServiceLocationsCount}
              />
              <MetricCard
                icon={<ApartmentRoundedIcon fontSize="small" />}
                label="Multi-property customers"
                value={loading ? "—" : multiAddressCount}
              />
            </Box>

            <Paper
              elevation={0}
              sx={{
                borderRadius: 5,
                p: { xs: 2, sm: 2.5 },
                border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
              }}
            >
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Find a customer
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Search by customer name, phone number, email, billing address, or any saved service location.
                  </Typography>
                </Box>

                <TextField
                  fullWidth
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='Try: "Tofel", "314 S Franklin", "La Grange", "9799667783", or "gmail"'
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: search ? (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="Clear search"
                          onClick={() => {
                            setSearch("");
                            setDebouncedSearch("");
                          }}
                          edge="end"
                        >
                          <ClearRoundedIcon />
                        </IconButton>
                      </InputAdornment>
                    ) : undefined,
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 4,
                    },
                  }}
                />

                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.5}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        checked={hideAllUntilSearch}
                        onChange={(e) => setHideAllUntilSearch(e.target.checked)}
                      />
                    }
                    label="Hide all customers until I start searching"
                    sx={{ m: 0 }}
                  />

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "flex-start", sm: "center" }}>
                    <Chip
                      icon={<ManageSearchRoundedIcon />}
                      label={
                        hideAllUntilSearch
                          ? normalizedQuery.length < MIN_CHARS_TO_SEARCH
                            ? `Type ${MIN_CHARS_TO_SEARCH}+ characters`
                            : `${filteredCustomers.length} result${filteredCustomers.length === 1 ? "" : "s"}`
                          : `Showing ${filteredCustomers.length} of ${customers.length}`
                      }
                      variant="outlined"
                      sx={{ borderRadius: 99 }}
                    />

                    <Button
                      variant="text"
                      onClick={() => {
                        setSearch("");
                        setDebouncedSearch("");
                      }}
                      sx={{ borderRadius: 99, fontWeight: 700 }}
                    >
                      Clear
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
            </Paper>

            {error ? (
              <Alert severity="error" sx={{ borderRadius: 4 }}>
                {error}
              </Alert>
            ) : null}

            {loading ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 2,
                }}
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <LoadingCard key={index} />
                ))}
              </Box>
            ) : null}

            {!loading && !error && customers.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 5,
                  p: 4,
                  border: `1px dashed ${alpha(theme.palette.divider, 0.9)}`,
                  textAlign: "center",
                }}
              >
                <Stack spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 4,
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      color: theme.palette.primary.main,
                    }}
                  >
                    <PersonRoundedIcon sx={{ fontSize: 32 }} />
                  </Box>

                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    No customers yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                    Create your first customer to start building your customer list, addresses, and future service
                    history inside DCFlow.
                  </Typography>

                  <Button
                    component={Link}
                    href="/customers/new"
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    sx={{ mt: 1, borderRadius: 99, fontWeight: 700 }}
                  >
                    Create First Customer
                  </Button>
                </Stack>
              </Paper>
            ) : null}

            {!loading && !error && customers.length > 0 && !shouldShowResults ? (
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 5,
                  p: 4,
                  border: `1px dashed ${alpha(theme.palette.divider, 0.9)}`,
                  textAlign: "center",
                }}
              >
                <Stack spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 4,
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      color: theme.palette.primary.main,
                    }}
                  >
                    <SearchRoundedIcon sx={{ fontSize: 32 }} />
                  </Box>

                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Start typing to search
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
                    Search by customer name, phone number, email, billing address, or any service location.
                  </Typography>
                </Stack>
              </Paper>
            ) : null}

            {!loading && !error && customers.length > 0 && shouldShowResults && filteredCustomers.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 5,
                  p: 4,
                  border: `1px dashed ${alpha(theme.palette.divider, 0.9)}`,
                  textAlign: "center",
                }}
              >
                <Stack spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 4,
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: alpha(theme.palette.warning.main, 0.12),
                      color: theme.palette.warning.dark,
                    }}
                  >
                    <ManageSearchRoundedIcon sx={{ fontSize: 32 }} />
                  </Box>

                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    No matching customers
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
                    Try a different name, address, phone number, or email.
                  </Typography>
                </Stack>
              </Paper>
            ) : null}

            {!loading && !error && shouldShowResults && filteredCustomers.length > 0 ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 2,
                }}
              >
                {filteredCustomers.map((customer) => {
                  const displayAddress = getDisplayAddress(customer);
                  const serviceAddressCount = getActiveServiceAddressCount(customer);
                  const isQboLinked = Boolean(customer.quickbooksCustomerId);

                  return (
                    <Card
                      key={customer.id}
                      elevation={0}
                      sx={{
                        borderRadius: 5,
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
                        "&:hover": {
                          transform: "translateY(-2px)",
                          boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.08)}`,
                          borderColor: alpha(theme.palette.primary.main, 0.28),
                        },
                      }}
                    >
                      <CardActionArea component={Link} href={`/customers/${customer.id}`} sx={{ borderRadius: 5 }}>
                        <CardContent sx={{ p: 2.25 }}>
                          <Stack spacing={1.5}>
                            <Stack
                              direction="row"
                              spacing={1.25}
                              justifyContent="space-between"
                              alignItems="flex-start"
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="h6"
                                  sx={{
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                    letterSpacing: -0.2,
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {customer.displayName || "Unnamed Customer"}
                                </Typography>

                                <Stack
                                  direction="row"
                                  spacing={0.75}
                                  useFlexGap
                                  flexWrap="wrap"
                                  sx={{ mt: 1 }}
                                >
                                  <Chip
                                    size="small"
                                    label={customer.active ? "Active" : "Inactive"}
                                    color={customer.active ? "success" : "default"}
                                    variant={customer.active ? "filled" : "outlined"}
                                    sx={{ borderRadius: 99 }}
                                  />

                                  <Chip
                                    size="small"
                                    label={isQboLinked ? "QBO linked" : "DCFlow only"}
                                    color={isQboLinked ? "primary" : "default"}
                                    variant={isQboLinked ? "filled" : "outlined"}
                                    icon={isQboLinked ? <SyncRoundedIcon /> : <BusinessRoundedIcon />}
                                    sx={{ borderRadius: 99 }}
                                  />

                                  <Chip
                                    size="small"
                                    label={
                                      serviceAddressCount > 0
                                        ? `${serviceAddressCount} service location${serviceAddressCount === 1 ? "" : "s"}`
                                        : "Billing-only"
                                    }
                                    variant="outlined"
                                    icon={<LocationOnRoundedIcon />}
                                    sx={{ borderRadius: 99 }}
                                  />
                                </Stack>
                              </Box>
                            </Stack>

                            <Divider />

                            <Stack spacing={1}>
                              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                <PhoneRoundedIcon sx={{ mt: "2px", color: "text.secondary", fontSize: 20 }} />
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Phone
                                  </Typography>
                                  <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
                                    {customer.phonePrimary || "—"}
                                  </Typography>
                                </Box>
                              </Stack>

                              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                <MailOutlineRoundedIcon sx={{ mt: "2px", color: "text.secondary", fontSize: 20 }} />
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Email
                                  </Typography>
                                  <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
                                    {customer.email || "—"}
                                  </Typography>
                                </Box>
                              </Stack>

                              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                                <LocationOnRoundedIcon sx={{ mt: "2px", color: "text.secondary", fontSize: 20 }} />
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {displayAddress.sourceLabel}
                                  </Typography>

                                  {displayAddress.line1 ? (
                                    <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
                                      {displayAddress.line1}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                      —
                                    </Typography>
                                  )}

                                  {displayAddress.line2 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                                      {displayAddress.line2}
                                    </Typography>
                                  ) : null}

                                  {displayAddress.line3 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                                      {displayAddress.line3}
                                    </Typography>
                                  ) : null}
                                </Box>
                              </Stack>
                            </Stack>
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Box>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}