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
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
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

  const cityState = [city, state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, postalCode].filter(Boolean).join(" ");

  return {
    line1,
    line2,
    line3: cityStateZip,
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

function SectionSurface({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        overflow: "hidden",
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
        backgroundColor: "background.paper",
      }}
    >
      {children}
    </Card>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box>
      <Typography
        variant="h6"
        sx={{
          fontSize: { xs: "1rem", md: "1.05rem" },
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </Typography>

      {subtitle ? (
        <Typography
          sx={{
            mt: 0.45,
            color: "text.secondary",
            fontSize: 13,
            fontWeight: 500,
            maxWidth: 920,
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "default" | "primary";
}) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
        backgroundColor:
          props.tone === "primary"
            ? alpha(theme.palette.primary.main, 0.08)
            : theme.palette.background.paper,
      }}
    >
      <Box sx={{ p: 2 }}>
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
              color:
                props.tone === "primary"
                  ? theme.palette.primary.main
                  : theme.palette.text.primary,
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
      </Box>
    </Card>
  );
}

function LoadingCard() {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
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

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <SectionSurface>
      <Box sx={{ p: 4 }}>
        <Stack spacing={1.25} alignItems="center" textAlign="center">
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
            {icon}
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
            {description}
          </Typography>

          {action ? <Box sx={{ pt: 0.5 }}>{action}</Box> : null}
        </Stack>
      </Box>
    </SectionSurface>
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
  }, [hideAllUntilSearch, normalizedQuery, MIN_CHARS_TO_SEARCH]);

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
  }, [customers, customersWithSearch, hideAllUntilSearch, normalizedQuery, queryDigits, MIN_CHARS_TO_SEARCH]);

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
            <Box sx={{ px: { xs: 0.25, md: 0.5 }, pt: { xs: 0.5, md: 0.75 } }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Chip
                      size="small"
                      icon={<PersonRoundedIcon sx={{ fontSize: 16 }} />}
                      label="Customers"
                      sx={{
                        borderRadius: 1.5,
                        fontWeight: 600,
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
                      }}
                    />
                  </Stack>

                  <Typography
                    variant="h4"
                    sx={{
                      fontSize: { xs: "1.8rem", md: "2.15rem" },
                      lineHeight: 1.05,
                      fontWeight: 800,
                      letterSpacing: "-0.035em",
                    }}
                  >
                    Customers
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.85,
                      color: "text.secondary",
                      fontSize: { xs: 13, md: 14 },
                      fontWeight: 500,
                      maxWidth: 860,
                    }}
                  >
                    Search customers by name, phone, email, billing address, or service location.
                  </Typography>
                </Box>

                <Button
                  component={Link}
                  href="/customers/new"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  sx={{
                    minHeight: 40,
                    borderRadius: 2,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  New Customer
                </Button>
              </Stack>
            </Box>

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

            <SectionSurface>
              <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack spacing={2}>
                  <SectionHeader
                    title="Find a customer"
                    subtitle="Search by customer name, phone number, email, billing address, or any saved service location."
                  />

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

                  <Divider />

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

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "flex-start", sm: "center" }}
                    >
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
                        sx={{ borderRadius: 1.5, fontWeight: 700 }}
                      />

                      <Button
                        variant="outlined"
                        onClick={() => {
                          setSearch("");
                          setDebouncedSearch("");
                        }}
                        sx={{ borderRadius: 2, minHeight: 36 }}
                      >
                        Clear
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Box>
            </SectionSurface>

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
                  gap: 1.5,
                }}
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <LoadingCard key={index} />
                ))}
              </Box>
            ) : null}

            {!loading && !error && customers.length === 0 ? (
              <EmptyState
                icon={<PersonRoundedIcon sx={{ fontSize: 32 }} />}
                title="No customers yet"
                description="Create your first customer to start building your customer list, addresses, and future service history inside DCFlow."
                action={
                  <Button
                    component={Link}
                    href="/customers/new"
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    Create First Customer
                  </Button>
                }
              />
            ) : null}

            {!loading && !error && customers.length > 0 && !shouldShowResults ? (
              <EmptyState
                icon={<SearchRoundedIcon sx={{ fontSize: 32 }} />}
                title="Start typing to search"
                description="Search by customer name, phone number, email, billing address, or any service location."
              />
            ) : null}

            {!loading && !error && customers.length > 0 && shouldShowResults && filteredCustomers.length === 0 ? (
              <EmptyState
                icon={<ManageSearchRoundedIcon sx={{ fontSize: 32 }} />}
                title="No matching customers"
                description="Try a different name, address, phone number, or email."
              />
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
                  gap: 1.5,
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
                        borderRadius: 4,
                        overflow: "hidden",
                        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                        backgroundColor: "background.paper",
                        transition: "border-color 160ms ease, transform 160ms ease",
                        "&:hover": {
                          borderColor: alpha(theme.palette.primary.main, 0.28),
                          transform: "translateY(-1px)",
                        },
                      }}
                    >
                      <CardActionArea
                        component={Link}
                        href={`/customers/${customer.id}`}
                        sx={{ display: "block", height: "100%" }}
                      >
                        <CardContent
                          sx={{
                            p: { xs: 2, md: 2.25 },
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            "&:last-child": { pb: { xs: 2, md: 2.25 } },
                          }}
                        >
                          <Stack spacing={1.5} sx={{ height: "100%" }}>
                            <Stack
                              direction="row"
                              spacing={1.25}
                              justifyContent="space-between"
                              alignItems="flex-start"
                            >
                              <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
                                <Box
                                  sx={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 3,
                                    display: "grid",
                                    placeItems: "center",
                                    flexShrink: 0,
                                    backgroundColor: alpha(theme.palette.primary.main, 0.12),
                                    color: theme.palette.primary.light,
                                  }}
                                >
                                  <PersonRoundedIcon sx={{ fontSize: 22 }} />
                                </Box>

                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="subtitle1"
                                    sx={{
                                      fontWeight: 800,
                                      lineHeight: 1.2,
                                      letterSpacing: "-0.01em",
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
                                      sx={{ borderRadius: 1.5, fontWeight: 700 }}
                                    />

                                    <Chip
                                      size="small"
                                      label={isQboLinked ? "QBO linked" : "DCFlow only"}
                                      color={isQboLinked ? "primary" : "default"}
                                      variant={isQboLinked ? "filled" : "outlined"}
                                      icon={isQboLinked ? <SyncRoundedIcon /> : <BusinessRoundedIcon />}
                                      sx={{ borderRadius: 1.5, fontWeight: 700 }}
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
                                      sx={{ borderRadius: 1.5, fontWeight: 600 }}
                                    />
                                  </Stack>
                                </Box>
                              </Stack>
                            </Stack>

                            <Divider />

                            <Stack spacing={1.1}>
                              <Stack direction="row" spacing={1} alignItems="flex-start">
                                <PhoneRoundedIcon
                                  sx={{ mt: "2px", color: "text.secondary", fontSize: 18, flexShrink: 0 }}
                                />
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Phone
                                  </Typography>
                                  <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
                                    {customer.phonePrimary || "—"}
                                  </Typography>
                                </Box>
                              </Stack>

                              <Stack direction="row" spacing={1} alignItems="flex-start">
                                <MailOutlineRoundedIcon
                                  sx={{ mt: "2px", color: "text.secondary", fontSize: 18, flexShrink: 0 }}
                                />
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Email
                                  </Typography>
                                  <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
                                    {customer.email || "—"}
                                  </Typography>
                                </Box>
                              </Stack>

                              <Stack direction="row" spacing={1} alignItems="flex-start">
                                <LocationOnRoundedIcon
                                  sx={{ mt: "2px", color: "text.secondary", fontSize: 18, flexShrink: 0 }}
                                />
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

                            <Box sx={{ flex: 1 }} />

                            <Divider />

                            <Stack
                              direction="row"
                              spacing={0.75}
                              alignItems="center"
                              sx={{ color: "primary.light", pt: 0.25 }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 700,
                                  letterSpacing: "0.02em",
                                }}
                              >
                                Open customer
                              </Typography>
                              <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
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