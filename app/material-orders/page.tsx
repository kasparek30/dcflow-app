// app/material-orders/page.tsx
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
  CircularProgress,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { alpha, useTheme } from "@mui/material/styles";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import ContactPhoneRoundedIcon from "@mui/icons-material/ContactPhoneRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type {
  MaterialOrder,
  MaterialOrderStatus,
} from "../../src/types/material-order";

type StatusFilter = "all" | MaterialOrderStatus;

type MaterialOrderListItem = MaterialOrder & {
  createdAt?: unknown;
  updatedAt?: unknown;
  readyForPickupAt?: unknown;
  pickedUpAt?: unknown;
};

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
            mt: 0.5,
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

function SectionSurface({ children }: { children: React.ReactNode }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        overflow: "hidden",
        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      {children}
    </Card>
  );
}

function normalize(s: unknown) {
  return String(s || "").trim().toLowerCase();
}

function safeStr(x: unknown) {
  return String(x ?? "");
}

function dateFromUnknown(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [yearRaw, monthRaw, dayRaw] = trimmed.split("-");
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      const day = Number(dayRaw);

      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        Number.isFinite(day)
      ) {
        const parsed = new Date(year, month - 1, day);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
      }
    }

    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };

    if (typeof maybeTimestamp.toDate === "function") {
      const parsed = maybeTimestamp.toDate();
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    const seconds =
      typeof maybeTimestamp.seconds === "number"
        ? maybeTimestamp.seconds
        : typeof maybeTimestamp._seconds === "number"
          ? maybeTimestamp._seconds
          : null;

    if (seconds !== null) {
      const parsed = new Date(seconds * 1000);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
  }

  return null;
}

function formatShortDate(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "—";

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value: unknown) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "—";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function getStatusLabel(status?: string) {
  switch (normalize(status)) {
    case "draft":
      return "Draft";
    case "po_created":
      return "PO Created";
    case "ordered":
      return "Ordered";
    case "received":
      return "Received";
    case "ready_for_pickup":
      return "Ready for Pickup";
    case "picked_up":
      return "Picked Up";
    case "ready_to_bill":
      return "Ready to Bill";
    case "invoiced":
      return "Invoiced";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function statusRankForSort(status: string) {
  const s = normalize(status);

  if (s === "ready_to_bill") return 0;
  if (s === "ready_for_pickup") return 1;
  if (s === "received") return 2;
  if (s === "picked_up") return 3;
  if (s === "ordered") return 4;
  if (s === "po_created") return 5;
  if (s === "draft") return 6;
  if (s === "invoiced") return 7;
  if (s === "cancelled") return 8;

  return 99;
}

function statusTone(status?: string) {
  const s = normalize(status);

  if (s === "draft") {
    return {
      label: "Draft",
      sx: {
        color: "#E2E8F0",
        backgroundColor: "rgba(148,163,184,0.12)",
        border: "1px solid rgba(148,163,184,0.20)",
      },
    };
  }

  if (s === "po_created") {
    return {
      label: "PO Created",
      sx: {
        color: "#DCEBFF",
        backgroundColor: "rgba(13,126,242,0.10)",
        border: "1px solid rgba(13,126,242,0.22)",
      },
    };
  }

  if (s === "ordered") {
    return {
      label: "Ordered",
      sx: {
        color: "#D8F0FF",
        backgroundColor: "rgba(71,184,255,0.12)",
        border: "1px solid rgba(71,184,255,0.24)",
      },
    };
  }

  if (s === "received") {
    return {
      label: "Received",
      sx: {
        color: "#FFEDD5",
        backgroundColor: "rgba(245,158,11,0.10)",
        border: "1px solid rgba(245,158,11,0.22)",
      },
    };
  }

  if (s === "ready_for_pickup") {
    return {
      label: "Ready for Pickup",
      sx: {
        color: "#DFF7E7",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "1px solid rgba(52,199,89,0.24)",
      },
    };
  }

  if (s === "picked_up") {
    return {
      label: "Picked Up",
      sx: {
        color: "#E6DCFF",
        backgroundColor: "rgba(139,92,246,0.12)",
        border: "1px solid rgba(139,92,246,0.24)",
      },
    };
  }

  if (s === "ready_to_bill") {
    return {
      label: "Ready to Bill",
      sx: {
        color: "#DFF7E7",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "1px solid rgba(52,199,89,0.24)",
      },
    };
  }

  if (s === "invoiced") {
    return {
      label: "Invoiced",
      sx: {
        color: "#DFF7E7",
        backgroundColor: "rgba(52,199,89,0.12)",
        border: "1px solid rgba(52,199,89,0.24)",
      },
    };
  }

  if (s === "cancelled") {
    return {
      label: "Cancelled",
      sx: {
        color: "#FFE1E4",
        backgroundColor: "rgba(255,42,54,0.10)",
        border: "1px solid rgba(255,42,54,0.20)",
      },
    };
  }

  return {
    label: getStatusLabel(status),
    sx: {
      color: "#E2E8F0",
      backgroundColor: "rgba(148,163,184,0.12)",
      border: "1px solid rgba(148,163,184,0.20)",
    },
  };
}

function isClosedOrder(order: MaterialOrderListItem) {
  const status = normalize(order.status);
  return status === "invoiced" || status === "cancelled";
}

function isActionNeeded(order: MaterialOrderListItem) {
  const status = normalize(order.status);

  return (
    status === "received" ||
    status === "ready_for_pickup" ||
    status === "picked_up" ||
    status === "ready_to_bill"
  );
}

function getPrimaryPoNumber(order: MaterialOrderListItem) {
  if (Array.isArray(order.poNumbers) && order.poNumbers.length > 0) {
    return order.poNumbers[0];
  }

  if (Array.isArray(order.purchaseOrders) && order.purchaseOrders.length > 0) {
    return order.purchaseOrders[0]?.poNumber || "—";
  }

  if (Array.isArray(order.supplierInvoices) && order.supplierInvoices.length > 0) {
    return order.supplierInvoices[0]?.poNumber || "—";
  }

  return "—";
}

function getAllPoNumbers(order: MaterialOrderListItem) {
  const values = new Set<string>();

  if (Array.isArray(order.poNumbers)) {
    order.poNumbers.forEach((po) => {
      if (po) values.add(po);
    });
  }

  if (Array.isArray(order.purchaseOrders)) {
    order.purchaseOrders.forEach((po) => {
      if (po?.poNumber) values.add(po.poNumber);
    });
  }

  if (Array.isArray(order.supplierInvoices)) {
    order.supplierInvoices.forEach((invoice) => {
      if (invoice?.poNumber) values.add(invoice.poNumber);
    });
  }

  return Array.from(values);
}

function getSupplierText(order: MaterialOrderListItem) {
  const values = new Set<string>();

  if (Array.isArray(order.purchaseOrders)) {
    order.purchaseOrders.forEach((po) => {
      if (po?.supplierName) values.add(po.supplierName);
    });
  }

  if (Array.isArray(order.supplierInvoices)) {
    order.supplierInvoices.forEach((invoice) => {
      if (invoice?.supplierName) values.add(invoice.supplierName);
    });
  }

  const suppliers = Array.from(values);
  if (suppliers.length === 0) return "—";
  if (suppliers.length === 1) return suppliers[0];

  return `${suppliers[0]} +${suppliers.length - 1}`;
}

function getSupplierInvoiceText(order: MaterialOrderListItem) {
  if (!Array.isArray(order.supplierInvoices) || order.supplierInvoices.length === 0) {
    return "—";
  }

  const invoices = order.supplierInvoices
    .map((invoice) => invoice.invoiceNumber)
    .filter(Boolean);

  if (invoices.length === 0) return "Matched";
  if (invoices.length === 1) return `Invoice #${invoices[0]}`;

  return `${invoices.length} invoices`;
}

function getPickupText(order: MaterialOrderListItem) {
  const pickup = order.pickup;

  if (!pickup) return "Not Ready";

  if (pickup.status === "picked_up") {
    return `Picked up ${formatShortDate(pickup.pickedUpAt)}`;
  }

  if (pickup.status === "ready_for_pickup") {
    return `Ready ${formatShortDate(pickup.readyForPickupAt)}`;
  }

  return "Not Ready";
}

function getBillingText(order: MaterialOrderListItem) {
  const status = normalize(order.billing?.status);

  if (status === "ready_to_bill") return "Ready to Bill";
  if (status === "creating_invoice") return "Creating Invoice";
  if (status === "invoice_failed") return "Invoice Failed";
  if (status === "invoiced") {
    return order.billing?.qboInvoiceNumber
      ? `Invoiced #${order.billing.qboInvoiceNumber}`
      : "Invoiced";
  }

  return "Not Ready";
}

function getPickupLocationTypeLabel(value?: string | null) {
  const normalized = normalize(value);

  if (normalized === "office_pickup") return "Office Pickup";
  if (normalized === "customer_site") return "Customer / Facility";
  if (normalized === "other") return "Other";

  return "Office Pickup";
}

function getContactText(order: MaterialOrderListItem) {
  const name = String(order.contactName || "").trim();
  const phone = String(order.contactPhone || "").trim();

  if (name && phone) return `${name} • ${phone}`;
  if (name) return name;
  if (phone) return phone;

  return "—";
}

export default function MaterialOrdersPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<MaterialOrderListItem[]>([]);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [hideClosed, setHideClosed] = useState<boolean>(true);
  const [actionNeededOnly, setActionNeededOnly] = useState<boolean>(false);

  useEffect(() => {
    async function loadOrders() {
      try {
        const q = query(collection(db, "materialOrders"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const items: MaterialOrderListItem[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            id: docSnap.id,

            customerId: data.customerId ?? "",
            customerDisplayName: data.customerDisplayName ?? "",

            contactName: data.contactName ?? undefined,
            contactPhone: data.contactPhone ?? undefined,
            contactEmail: data.contactEmail ?? undefined,

            serviceAddressId: data.serviceAddressId ?? undefined,
            serviceAddressLabel: data.serviceAddressLabel ?? undefined,
            serviceAddressLine1: data.serviceAddressLine1 ?? undefined,
            serviceAddressLine2: data.serviceAddressLine2 ?? undefined,
            serviceCity: data.serviceCity ?? undefined,
            serviceState: data.serviceState ?? undefined,
            servicePostalCode: data.servicePostalCode ?? undefined,

            pickupLocationType: data.pickupLocationType ?? "office_pickup",
            pickupLocationNotes: data.pickupLocationNotes ?? undefined,

            requestSummary: data.requestSummary ?? "",
            requestDetails: data.requestDetails ?? undefined,
            internalNotes: data.internalNotes ?? undefined,

            status: data.status ?? "draft",
            active: data.active ?? true,

            targetPickupDate: data.targetPickupDate ?? undefined,

            pickup: data.pickup ?? {
              status: "not_ready",
            },

            poNumbers: Array.isArray(data.poNumbers) ? data.poNumbers : [],
            purchaseOrders: Array.isArray(data.purchaseOrders)
              ? data.purchaseOrders
              : [],
            supplierInvoices: Array.isArray(data.supplierInvoices)
              ? data.supplierInvoices
              : [],
            lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],

            supplierCostTotal: data.supplierCostTotal ?? undefined,
            customerPriceTotal: data.customerPriceTotal ?? undefined,

            billing: data.billing ?? {
              status: "not_ready",
            },

            materialOrderCode: data.materialOrderCode ?? null,
            materialOrderNumber: data.materialOrderNumber ?? null,
            nextPoIndex: data.nextPoIndex ?? 0,

            createdByUid: data.createdByUid ?? "",
            createdByName: data.createdByName ?? undefined,

            orderedByUid: data.orderedByUid ?? undefined,
            orderedByName: data.orderedByName ?? undefined,
            orderedAt: data.orderedAt ?? undefined,

            receivedByUid: data.receivedByUid ?? undefined,
            receivedByName: data.receivedByName ?? undefined,
            receivedAt: data.receivedAt ?? undefined,

            updatedByUid: data.updatedByUid ?? undefined,
            updatedByName: data.updatedByName ?? undefined,

            createdAt: data.createdAt ?? undefined,
            updatedAt: data.updatedAt ?? undefined,

            cancelledAt: data.cancelledAt ?? undefined,
            cancelReason: data.cancelReason ?? undefined,
          };
        });

        setOrders(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load material orders.");
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const base = orders.filter((order) => {
      const s = normalize(order.status);

      if (hideClosed && isClosedOrder(order)) return false;

      if (actionNeededOnly && !isActionNeeded(order)) return false;

      if (statusFilter !== "all" && s !== statusFilter) return false;

      if (!normalizedSearch) return true;

      const poNumbers = getAllPoNumbers(order);

      const haystack = [
        order.id,
        order.materialOrderCode,
        order.customerDisplayName,
        order.customerId,
        order.contactName,
        order.contactPhone,
        order.contactEmail,
        order.serviceAddressLabel,
        order.serviceAddressLine1,
        order.serviceAddressLine2,
        order.serviceCity,
        order.serviceState,
        order.servicePostalCode,
        order.pickupLocationType,
        order.pickupLocationNotes,
        order.requestSummary,
        order.requestDetails,
        order.internalNotes,
        order.status,
        order.createdByName,
        order.orderedByName,
        order.receivedByName,
        order.pickup?.pickedUpByName,
        getStatusLabel(order.status),
        getPickupLocationTypeLabel(order.pickupLocationType),
        getPickupText(order),
        getBillingText(order),
        getSupplierText(order),
        getSupplierInvoiceText(order),
        ...poNumbers,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    const sorted = [...base].sort((a, b) => {
      const ra = statusRankForSort(a.status);
      const rb = statusRankForSort(b.status);
      if (ra !== rb) return ra - rb;

      const at = safeStr(a.targetPickupDate);
      const bt = safeStr(b.targetPickupDate);
      if (at && bt && at !== bt) return at.localeCompare(bt);
      if (at && !bt) return -1;
      if (!at && bt) return 1;

      const ac = safeStr(a.createdAt);
      const bc = safeStr(b.createdAt);
      return bc.localeCompare(ac);
    });

    return sorted;
  }, [orders, searchText, statusFilter, hideClosed, actionNeededOnly]);

  function clearFilters() {
    setSearchText("");
    setStatusFilter("all");
    setHideClosed(false);
    setActionNeededOnly(false);
  }

  return (
    <ProtectedPage fallbackTitle="Material Orders">
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={4}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", lg: "center" }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    icon={<Inventory2RoundedIcon sx={{ fontSize: 16 }} />}
                    label="Material Orders"
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
                    fontSize: { xs: "1.65rem", md: "2.1rem" },
                    lineHeight: 1.05,
                    fontWeight: 800,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Material orders
                </Typography>

                <Typography
                  sx={{
                    mt: 0.9,
                    color: "text.secondary",
                    fontSize: { xs: 13, md: 14 },
                    fontWeight: 500,
                    maxWidth: 960,
                  }}
                >
                  Manage parts-only customer requests. The selected customer is the billing
                  party, while contact person and phone track who should be called for pickup
                  or questions.
                </Typography>
              </Box>

              <Button
                component={Link}
                href="/material-orders/new"
                variant="contained"
                startIcon={<AddRoundedIcon />}
                sx={{ minHeight: 40, borderRadius: 2 }}
              >
                New Material Order
              </Button>
            </Stack>

            <SectionSurface>
              <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={2.25}>
                  <SectionHeader
                    title="Filters"
                    subtitle="Search by billing party, contact person, phone, PO number, supplier, invoice, pickup status, billing status, or employee who handled the order."
                  />

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "2fr 1fr",
                        xl: "2fr 1fr 1fr",
                      },
                      gap: 1.5,
                    }}
                  >
                    <TextField
                      label="Search"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Billing party, contact, phone, PO#, supplier, material..."
                      size="small"
                      fullWidth
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchRoundedIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <FormControl size="small" fullWidth>
                      <InputLabel>Status</InputLabel>
                      <Select
                        label="Status"
                        value={statusFilter}
                        onChange={(e: SelectChangeEvent) =>
                          setStatusFilter(e.target.value as StatusFilter)
                        }
                      >
                        <MenuItem value="all">All Statuses</MenuItem>
                        <MenuItem value="draft">Draft</MenuItem>
                        <MenuItem value="po_created">PO Created</MenuItem>
                        <MenuItem value="ordered">Ordered</MenuItem>
                        <MenuItem value="received">Received</MenuItem>
                        <MenuItem value="ready_for_pickup">
                          Ready for Pickup
                        </MenuItem>
                        <MenuItem value="picked_up">Picked Up</MenuItem>
                        <MenuItem value="ready_to_bill">Ready to Bill</MenuItem>
                        <MenuItem value="invoiced">Invoiced</MenuItem>
                        <MenuItem value="cancelled">Cancelled</MenuItem>
                      </Select>
                    </FormControl>

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <Chip
                        size="small"
                        label={`Showing ${filteredOrders.length} of ${orders.length}`}
                        variant="outlined"
                        sx={{
                          borderRadius: 1.5,
                          fontWeight: 700,
                          minHeight: 32,
                        }}
                      />

                      <Button
                        type="button"
                        onClick={clearFilters}
                        variant="outlined"
                        sx={{ borderRadius: 2, minHeight: 36 }}
                      >
                        Clear Filters
                      </Button>
                    </Stack>
                  </Box>

                  <Divider />

                  <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "flex-start", lg: "center" }}
                    justifyContent="space-between"
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.85,
                          borderRadius: 4,
                          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                          backgroundColor: alpha("#FFFFFF", 0.02),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TuneRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Action Needed
                          </Typography>
                          <Switch
                            size="small"
                            checked={actionNeededOnly}
                            onChange={(e) => setActionNeededOnly(e.target.checked)}
                          />
                        </Stack>
                      </Box>

                      <Box
                        sx={{
                          px: 1.25,
                          py: 0.85,
                          borderRadius: 4,
                          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                          backgroundColor: alpha("#FFFFFF", 0.02),
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CheckCircleRoundedIcon
                            sx={{ fontSize: 18, color: "text.secondary" }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Hide Closed
                          </Typography>
                          <Switch
                            size="small"
                            checked={hideClosed}
                            onChange={(e) => setHideClosed(e.target.checked)}
                          />
                        </Stack>
                      </Box>
                    </Stack>

                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.secondary",
                        fontWeight: 500,
                        maxWidth: 720,
                      }}
                    >
                      This is the lite customer-material flow: billing party, contact person,
                      PO, supplier invoice, office pickup, and billing — no scheduling.
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
            </SectionSurface>

            {error ? (
              <Alert severity="error" variant="outlined" icon={<ErrorOutlineRoundedIcon />}>
                {error}
              </Alert>
            ) : null}

            {loading ? (
              <SectionSurface>
                <Box sx={{ p: 3 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <CircularProgress size={20} thickness={5} />
                    <Typography variant="body2" color="text.secondary">
                      Loading material orders...
                    </Typography>
                  </Stack>
                </Box>
              </SectionSurface>
            ) : null}

            {!loading && !error && filteredOrders.length === 0 ? (
              <SectionSurface>
                <Box sx={{ p: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    No matching material orders found.
                  </Typography>
                </Box>
              </SectionSurface>
            ) : null}

            {!loading && !error && filteredOrders.length > 0 ? (
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
                {filteredOrders.map((order) => {
                  const tone = statusTone(order.status);
                  const primaryPo = getPrimaryPoNumber(order);
                  const supplierText = getSupplierText(order);
                  const invoiceText = getSupplierInvoiceText(order);
                  const pickupText = getPickupText(order);
                  const billingText = getBillingText(order);
                  const contactText = getContactText(order);

                  return (
                    <Card
                      key={order.id}
                      elevation={0}
                      sx={{
                        height: "100%",
                        borderRadius: 1,
                        overflow: "hidden",
                        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
                        backgroundColor: "background.paper",
                        transition:
                          "border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
                        "&:hover": {
                          boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
                        },
                      }}
                    >
                      <CardActionArea
                        component={Link}
                        href={`/material-orders/${order.id}`}
                        sx={{ height: "100%", display: "block" }}
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
                                  <Inventory2RoundedIcon sx={{ fontSize: 22 }} />
                                </Box>

                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography
                                    variant="subtitle1"
                                    sx={{
                                      fontWeight: 800,
                                      lineHeight: 1.2,
                                      letterSpacing: "-0.01em",
                                    }}
                                  >
                                    {order.requestSummary || "Material Order"}
                                  </Typography>

                                  <Typography
                                    variant="body2"
                                    sx={{
                                      mt: 0.45,
                                      color: "text.secondary",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Billing: {order.customerDisplayName || "—"}
                                  </Typography>
                                </Box>
                              </Stack>

                              <Chip
                                size="small"
                                label={tone.label}
                                sx={{
                                  borderRadius: 1.5,
                                  fontWeight: 700,
                                  ...tone.sx,
                                }}
                              />
                            </Stack>

                            <Divider />

                            <Stack spacing={1.1}>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <PersonRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "text.secondary",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Billing Party:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {order.customerDisplayName || "—"}
                                  </Typography>
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <ContactPhoneRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "text.secondary",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Contact:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {contactText}
                                  </Typography>
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <StorefrontRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                  Pickup Type:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {getPickupLocationTypeLabel(order.pickupLocationType)}
                                  </Typography>
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <PlaceRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "text.secondary",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {order.serviceAddressLine1 || "No address needed / office pickup"}
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <ShoppingCartRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                  PO:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 800 }}
                                  >
                                    {primaryPo}
                                  </Typography>
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <ReceiptLongRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Supplier:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {supplierText}
                                  </Typography>
                                  {" "}• {invoiceText}
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <EventAvailableRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                  Pickup Status:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {pickupText}
                                  </Typography>
                                </Typography>
                              </Stack>

                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <PaidRoundedIcon
                                  sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                  Billing:{" "}
                                  <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ color: "text.primary", fontWeight: 700 }}
                                  >
                                    {billingText}
                                  </Typography>
                                </Typography>
                              </Stack>
                            </Stack>

                            <Divider />

                            <Box
                              sx={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 1,
                              }}
                            >
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "text.secondary",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  Supplier Cost
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                  {formatMoney(order.supplierCostTotal)}
                                </Typography>
                              </Box>

                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: "text.secondary",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  Customer Price
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                  {formatMoney(order.customerPriceTotal)}
                                </Typography>
                              </Box>
                            </Box>

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
                                Open material order
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