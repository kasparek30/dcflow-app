// app/material-orders/[id]/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContactPhoneRoundedIcon from "@mui/icons-material/ContactPhoneRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import { generatePurchaseOrderForMaterialOrder } from "../../../src/lib/purchase-orders";
import type {
  MaterialOrder,
  MaterialOrderStatus,
} from "../../../src/types/material-order";

type SavingAction =
  | ""
  | "pricing"
  | "ordered"
  | "received"
  | "ready_for_pickup"
  | "picked_up"
  | "ready_to_bill"
  | "cancelled";

type MaterialOrderDoc = MaterialOrder & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

function nowIso() {
  return new Date().toISOString();
}

function normalize(s: unknown) {
  return String(s || "").trim().toLowerCase();
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

function formatDateTime(value: unknown) {
  const parsed = dateFromUnknown(value);
  if (!parsed) return "—";

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function getStatusTone(status?: string) {
  const s = normalize(status);

  if (s === "cancelled") {
    return {
      color: "#FFE1E4",
      backgroundColor: "rgba(255,42,54,0.10)",
      border: "1px solid rgba(255,42,54,0.20)",
    };
  }

  if (s === "received") {
    return {
      color: "#FFEDD5",
      backgroundColor: "rgba(245,158,11,0.10)",
      border: "1px solid rgba(245,158,11,0.22)",
    };
  }

  if (
    s === "ready_for_pickup" ||
    s === "ready_to_bill" ||
    s === "invoiced"
  ) {
    return {
      color: "#DFF7E7",
      backgroundColor: "rgba(52,199,89,0.12)",
      border: "1px solid rgba(52,199,89,0.24)",
    };
  }

  if (s === "picked_up") {
    return {
      color: "#E6DCFF",
      backgroundColor: "rgba(139,92,246,0.12)",
      border: "1px solid rgba(139,92,246,0.24)",
    };
  }

  if (s === "po_created" || s === "ordered") {
    return {
      color: "#DCEBFF",
      backgroundColor: "rgba(13,126,242,0.10)",
      border: "1px solid rgba(13,126,242,0.22)",
    };
  }

  return {
    color: "#E2E8F0",
    backgroundColor: "rgba(148,163,184,0.12)",
    border: "1px solid rgba(148,163,184,0.20)",
  };
}

function getPickupLocationTypeLabel(value?: string | null) {
  const normalized = normalize(value);

  if (normalized === "office_pickup") return "Customer Pickup at Office";
  if (normalized === "customer_site") return "Customer / Facility Location";
  if (normalized === "other") return "Other";

  return "Customer Pickup at Office";
}

function getBillingStatusLabel(value?: string | null) {
  const normalized = normalize(value);

  if (normalized === "ready_to_bill") return "Ready to Bill";
  if (normalized === "creating_invoice") return "Creating Invoice";
  if (normalized === "invoice_failed") return "Invoice Failed";
  if (normalized === "invoiced") return "Invoiced";

  return "Not Ready";
}

function getPrimaryPoNumber(order: MaterialOrderDoc) {
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

function mapMaterialOrder(id: string, data: any): MaterialOrderDoc {
  return {
    id,

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
    purchaseOrders: Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [],
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

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      {icon ? (
        <Box sx={{ color: "text.secondary", mt: "2px", flexShrink: 0 }}>{icon}</Box>
      ) : null}

      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.primary",
            fontWeight: 650,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {value || "—"}
        </Typography>
      </Box>
    </Stack>
  );
}

export default function MaterialOrderDetailPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const { appUser } = useAuthContext();

  const orderId = useMemo(() => {
    const raw = (params as any)?.id;
    if (Array.isArray(raw)) return raw[0] || "";
    return String(raw || "");
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<MaterialOrderDoc | null>(null);
  const [error, setError] = useState("");

  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [savingAction, setSavingAction] = useState<SavingAction>("");

  const [customerPriceInput, setCustomerPriceInput] = useState("");
  const [pickedUpByName, setPickedUpByName] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [poVendorName, setPoVendorName] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poGenerating, setPoGenerating] = useState(false);
  const [poError, setPoError] = useState("");
  const [poOk, setPoOk] = useState("");

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setError("Missing material order ID.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const snap = await getDoc(doc(db, "materialOrders", orderId));

      if (!snap.exists()) {
        setOrder(null);
        setError("Material order not found.");
        return;
      }

      const nextOrder = mapMaterialOrder(snap.id, snap.data());
      setOrder(nextOrder);

      setCustomerPriceInput(
        typeof nextOrder.customerPriceTotal === "number"
          ? String(nextOrder.customerPriceTotal)
          : ""
      );
      setPickedUpByName(nextOrder.pickup?.pickedUpByName || "");
      setPickupNotes(nextOrder.pickup?.pickupNotes || "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load material order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  function getUserName() {
    return (
      String((appUser as any)?.displayName || "").trim() ||
      String(appUser?.email || "").trim() ||
      "Current User"
    );
  }

  async function copyPurchaseOrderCode(poCode: string) {
    const clean = String(poCode || "").trim().toUpperCase();
    if (!clean) return;

    try {
      await navigator.clipboard.writeText(clean);
    } catch {
      // Non-blocking clipboard fallback.
    }
  }

  function openGeneratePoDialog() {
    setPoVendorName("");
    setPoNotes("");
    setPoError("");
    setPoOk("");
    setPoDialogOpen(true);
  }

  function closeGeneratePoDialog() {
    if (poGenerating) return;
    setPoDialogOpen(false);
    setPoError("");
  }

  async function handleGeneratePo() {
    if (!order?.id) return;

    const vendorName = poVendorName.trim();

    if (!vendorName) {
      setPoError("Supplier / vendor name is required.");
      return;
    }

    setPoGenerating(true);
    setPoError("");
    setPoOk("");
    setActionError("");
    setActionOk("");

    try {
      const record = await generatePurchaseOrderForMaterialOrder({
        db,
        materialOrderId: order.id,
        vendorName,
        notes: poNotes.trim() || null,
        requestedByUid: appUser?.uid || null,
        requestedByName: getUserName(),
      });

      await copyPurchaseOrderCode(record.poCode);

      setPoOk(`Generated PO #${record.poCode}. Copied to clipboard.`);
      setActionOk(`Generated PO #${record.poCode}.`);
      setPoDialogOpen(false);
      setPoVendorName("");
      setPoNotes("");

      await loadOrder();
    } catch (err: unknown) {
      setPoError(err instanceof Error ? err.message : "Failed to generate PO.");
    } finally {
      setPoGenerating(false);
    }
  }

  async function updateOrder(payload: Record<string, unknown>, action: SavingAction) {
    if (!order) return;

    setActionError("");
    setActionOk("");
    setSavingAction(action);

    try {
      await updateDoc(doc(db, "materialOrders", order.id), {
        ...payload,
        updatedAt: nowIso(),
        updatedByUid: appUser?.uid || null,
        updatedByName: getUserName(),
      });

      await loadOrder();
      setActionOk("Material order updated.");
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update material order."
      );
    } finally {
      setSavingAction("");
    }
  }

  async function handleSavePricing() {
    if (!order) return;

    const trimmed = customerPriceInput.trim();

    if (!trimmed) {
      await updateOrder(
        {
          customerPriceTotal: null,
        },
        "pricing"
      );
      return;
    }

    const amount = Number(trimmed);

    if (!Number.isFinite(amount) || amount < 0) {
      setActionError("Customer price must be a valid number.");
      return;
    }

    await updateOrder(
      {
        customerPriceTotal: Math.round(amount * 100) / 100,
      },
      "pricing"
    );
  }

  async function handleMarkOrdered() {
    if (!order) return;

    await updateOrder(
      {
        status: "ordered" satisfies MaterialOrderStatus,
        orderedAt: order.orderedAt || nowIso(),
        orderedByUid: order.orderedByUid || appUser?.uid || null,
        orderedByName: order.orderedByName || getUserName(),
      },
      "ordered"
    );
  }

  async function handleMarkReceived() {
    if (!order) return;

    await updateOrder(
      {
        status: "received" satisfies MaterialOrderStatus,
        receivedAt: nowIso(),
        receivedByUid: appUser?.uid || null,
        receivedByName: getUserName(),
      },
      "received"
    );
  }

  async function handleMarkReadyForPickup() {
    if (!order) return;

    await updateOrder(
      {
        status: "ready_for_pickup" satisfies MaterialOrderStatus,
        pickup: {
          ...(order.pickup || {}),
          status: "ready_for_pickup",
          readyForPickupAt: nowIso(),
          readyForPickupByUid: appUser?.uid || null,
          readyForPickupByName: getUserName(),
        },
      },
      "ready_for_pickup"
    );
  }

  async function handleMarkPickedUp() {
    if (!order) return;

    if (!pickedUpByName.trim()) {
      setActionError("Enter who picked up the materials before marking picked up.");
      return;
    }

    await updateOrder(
      {
        status: "picked_up" satisfies MaterialOrderStatus,
        pickup: {
          ...(order.pickup || {}),
          status: "picked_up",
          pickedUpAt: nowIso(),
          pickedUpByName: pickedUpByName.trim(),
          markedPickedUpByUid: appUser?.uid || null,
          markedPickedUpByName: getUserName(),
          pickupNotes: pickupNotes.trim() || null,
        },
      },
      "picked_up"
    );
  }

  async function handleSendToReadyToBill() {
    if (!order) return;

    await updateOrder(
      {
        status: "ready_to_bill" satisfies MaterialOrderStatus,
        billing: {
          ...(order.billing || {}),
          status: "ready_to_bill",
          readyToBillAt: nowIso(),
          readyToBillByUid: appUser?.uid || null,
          readyToBillByName: getUserName(),
        },
      },
      "ready_to_bill"
    );
  }

  async function handleCancelOrder() {
    if (!order) return;

    if (!cancelReason.trim()) {
      setActionError("Enter a cancel reason before cancelling this material order.");
      return;
    }

    await updateOrder(
      {
        status: "cancelled" satisfies MaterialOrderStatus,
        active: false,
        cancelledAt: nowIso(),
        cancelReason: cancelReason.trim(),
      },
      "cancelled"
    );
  }

  const statusChipSx = order ? getStatusTone(order.status) : {};

  const contactText = useMemo(() => {
    if (!order) return "—";

    const parts = [order.contactName, order.contactPhone]
      .map((x) => safeStr(x))
      .filter(Boolean);

    return parts.length ? parts.join(" • ") : "—";
  }, [order]);

  const addressText = useMemo(() => {
    if (!order) return "—";

    return (
      formatAddress({
        addressLine1: order.serviceAddressLine1,
        addressLine2: order.serviceAddressLine2,
        city: order.serviceCity,
        state: order.serviceState,
        postalCode: order.servicePostalCode,
      }) || "No address needed / office pickup"
    );
  }, [order]);

  const supplierCostTotal = useMemo(() => {
    if (!order) return null;

    if (typeof order.supplierCostTotal === "number") {
      return order.supplierCostTotal;
    }

    if (Array.isArray(order.supplierInvoices) && order.supplierInvoices.length > 0) {
      const total = order.supplierInvoices.reduce((sum, invoice) => {
        const value = Number(invoice.total || 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

      return total > 0 ? total : null;
    }

    if (Array.isArray(order.lineItems) && order.lineItems.length > 0) {
      const total = order.lineItems.reduce((sum, item) => {
        const value = Number(item.totalCost || 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

      return total > 0 ? total : null;
    }

    return null;
  }, [order]);

  const canGeneratePo =
    Boolean(order) &&
    normalize(order?.status) !== "cancelled" &&
    normalize(order?.status) !== "invoiced";

  return (
    <ProtectedPage fallbackTitle="Material Order">
      <AppShell appUser={appUser}>
        <Dialog
          open={poDialogOpen}
          onClose={closeGeneratePoDialog}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Generate Purchase Order</DialogTitle>

          <DialogContent dividers>
            <Stack spacing={2}>
              {poError ? <Alert severity="error">{poError}</Alert> : null}

              <Alert severity="info" variant="outlined">
                This creates another PO under the same material order. Use one PO per
                supplier when multiple vendors are needed.
              </Alert>

              <TextField
                label="Supplier / Vendor"
                value={poVendorName}
                onChange={(e) => setPoVendorName(e.target.value)}
                fullWidth
                required
                autoFocus
                placeholder="Ex: Ferguson, Moore Supply, Farmers Lumber"
                disabled={poGenerating}
              />

              <TextField
                label="PO Notes"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                multiline
                minRows={4}
                fullWidth
                placeholder="Optional notes about what is being ordered from this supplier."
                disabled={poGenerating}
              />

              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                <Stack spacing={0.75}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
                    Current Material Order
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Billing Party: {order?.customerDisplayName || "—"}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Request: {order?.requestSummary || "—"}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Existing POs:{" "}
                    {Array.isArray(order?.poNumbers) && order.poNumbers.length > 0
                      ? order.poNumbers.join(", ")
                      : "None yet"}
                  </Typography>
                </Stack>
              </Paper>
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={closeGeneratePoDialog} disabled={poGenerating}>
              Cancel
            </Button>

            <Button
              variant="contained"
              onClick={handleGeneratePo}
              disabled={poGenerating}
              startIcon={
                poGenerating ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <ShoppingCartRoundedIcon />
                )
              }
            >
              {poGenerating ? "Generating..." : "Generate PO"}
            </Button>
          </DialogActions>
        </Dialog>

        <Box sx={{ width: "100%", maxWidth: 1280, mx: "auto" }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
            >
              <Button
                component={Link}
                href="/material-orders"
                variant="outlined"
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ borderRadius: 2 }}
              >
                Back to Material Orders
              </Button>

              <Button
                type="button"
                variant="outlined"
                onClick={() => loadOrder()}
                sx={{ borderRadius: 2 }}
              >
                Refresh
              </Button>
            </Stack>

            {loading ? (
              <SectionSurface>
                <Box sx={{ p: 3 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <CircularProgress size={20} thickness={5} />
                    <Typography variant="body2" color="text.secondary">
                      Loading material order...
                    </Typography>
                  </Stack>
                </Box>
              </SectionSurface>
            ) : null}

            {error ? (
              <Alert severity="error" variant="outlined" icon={<ErrorOutlineRoundedIcon />}>
                {error}
              </Alert>
            ) : null}

            {!loading && !error && order ? (
              <>
                <SectionSurface>
                  <Box sx={{ p: { xs: 2, md: 2.75 } }}>
                    <Stack
                      direction={{ xs: "column", lg: "row" }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", lg: "center" }}
                    >
                      <Stack spacing={1.1} sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip
                            icon={<Inventory2RoundedIcon />}
                            label={order.materialOrderCode || "Material Order"}
                            color="primary"
                            variant="outlined"
                            sx={{ borderRadius: 99, fontWeight: 800 }}
                          />

                          <Chip
                            label={getStatusLabel(order.status)}
                            sx={{
                              borderRadius: 99,
                              fontWeight: 800,
                              ...statusChipSx,
                            }}
                          />

                          <Chip
                            icon={<PaidRoundedIcon />}
                            label={getBillingStatusLabel(order.billing?.status)}
                            variant="outlined"
                            sx={{ borderRadius: 99, fontWeight: 800 }}
                          />
                        </Stack>

                        <Typography
                          variant="h4"
                          sx={{
                            fontSize: { xs: "1.55rem", md: "2.05rem" },
                            lineHeight: 1.05,
                            fontWeight: 850,
                            letterSpacing: "-0.035em",
                          }}
                        >
                          {order.requestSummary || "Material Order"}
                        </Typography>

                        <Typography
                          variant="body2"
                          sx={{
                            color: "text.secondary",
                            fontWeight: 600,
                          }}
                        >
                          Billing Party:{" "}
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ color: "text.primary", fontWeight: 850 }}
                          >
                            {order.customerDisplayName || "—"}
                          </Typography>
                        </Typography>
                      </Stack>

                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={{ xs: "stretch", sm: "center" }}
                      >
                        <Button
                          type="button"
                          variant="contained"
                          disabled={!canGeneratePo || poGenerating}
                          startIcon={
                            poGenerating ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : (
                              <ShoppingCartRoundedIcon />
                            )
                          }
                          onClick={openGeneratePoDialog}
                          sx={{ borderRadius: 2, minHeight: 40 }}
                        >
                          Generate PO
                        </Button>

                        {Array.isArray(order.poNumbers) && order.poNumbers.length > 0 ? (
                          <Button
                            type="button"
                            variant="outlined"
                            startIcon={<ContentCopyRoundedIcon />}
                            onClick={() => copyPurchaseOrderCode(order.poNumbers?.[0] || "")}
                            sx={{ borderRadius: 2, minHeight: 40 }}
                          >
                            Copy First PO
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Box>
                </SectionSurface>

                {actionError ? (
                  <Alert severity="error" variant="outlined" icon={<ErrorOutlineRoundedIcon />}>
                    {actionError}
                  </Alert>
                ) : null}

                {actionOk ? (
                  <Alert severity="success" variant="outlined">
                    {actionOk}
                  </Alert>
                ) : null}

                {poOk ? (
                  <Alert severity="success" variant="outlined">
                    {poOk}
                  </Alert>
                ) : null}

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      lg: "1.1fr 0.9fr",
                    },
                    gap: 2,
                  }}
                >
                  <Stack spacing={2}>
                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <ContactPhoneRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Billing Party & Contact
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Customer account is the billing party. Contact is who to call.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: {
                                xs: "1fr",
                                md: "1fr 1fr",
                              },
                              gap: 2,
                            }}
                          >
                            <InfoRow
                              label="Billing Party"
                              value={order.customerDisplayName || "—"}
                              icon={<PaidRoundedIcon fontSize="small" />}
                            />

                            <InfoRow
                              label="Contact"
                              value={contactText}
                              icon={<ContactPhoneRoundedIcon fontSize="small" />}
                            />

                            <InfoRow
                              label="Contact Email"
                              value={order.contactEmail || "—"}
                              icon={<ContactPhoneRoundedIcon fontSize="small" />}
                            />

                            <InfoRow
                              label="Created"
                              value={`${formatDateTime(order.createdAt)} by ${
                                order.createdByName || "—"
                              }`}
                              icon={<CheckCircleRoundedIcon fontSize="small" />}
                            />
                          </Box>
                        </Stack>
                      </Box>
                    </SectionSurface>

                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <StorefrontRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Pickup / Location
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Most material-only orders are customer pickup at the office.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: {
                                xs: "1fr",
                                md: "1fr 1fr",
                              },
                              gap: 2,
                            }}
                          >
                            <InfoRow
                              label="Pickup Type"
                              value={getPickupLocationTypeLabel(order.pickupLocationType)}
                              icon={<StorefrontRoundedIcon fontSize="small" />}
                            />

                            <InfoRow
                              label="Target Pickup Date"
                              value={formatShortDate(order.targetPickupDate)}
                              icon={<LocalShippingRoundedIcon fontSize="small" />}
                            />

                            <InfoRow
                              label="Address Context"
                              value={addressText}
                              icon={<PlaceRoundedIcon fontSize="small" />}
                            />

                            <InfoRow
                              label="Pickup Notes"
                              value={order.pickupLocationNotes || "—"}
                              icon={<NotesRoundedIcon fontSize="small" />}
                            />
                          </Box>
                        </Stack>
                      </Box>
                    </SectionSurface>

                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <Inventory2RoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Material Request
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Original customer request and internal office notes.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          <InfoRow label="Summary" value={order.requestSummary || "—"} />

                          <InfoRow
                            label="Details"
                            value={order.requestDetails || "No material details entered."}
                          />

                          <InfoRow
                            label="Internal Notes"
                            value={order.internalNotes || "No internal notes entered."}
                          />
                        </Stack>
                      </Box>
                    </SectionSurface>

                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <ShoppingCartRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Purchase Orders
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Create one PO per supplier. Multiple POs can belong to this same
                                material order.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          {Array.isArray(order.purchaseOrders) &&
                          order.purchaseOrders.length > 0 ? (
                            <Stack spacing={1.25}>
                              {order.purchaseOrders.map((po) => (
                                <Paper
                                  key={po.poNumber}
                                  variant="outlined"
                                  sx={{ p: 1.5, borderRadius: 1 }}
                                >
                                  <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1}
                                    justifyContent="space-between"
                                  >
                                    <Box>
                                      <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        flexWrap="wrap"
                                        useFlexGap
                                      >
                                        <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
                                          {po.poNumber}
                                        </Typography>

                                        <Button
                                          size="small"
                                          variant="text"
                                          startIcon={<ContentCopyRoundedIcon />}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            void copyPurchaseOrderCode(po.poNumber);
                                          }}
                                        >
                                          Copy
                                        </Button>
                                      </Stack>

                                      <Typography variant="body2" color="text.secondary">
                                        Supplier: {po.supplierName || "—"}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        Generated: {formatDateTime(po.generatedAt)}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        Generated By: {po.generatedByName || "—"}
                                      </Typography>
                                    </Box>

                                    <Chip
                                      label={
                                        po.supplierInvoiceNumber
                                          ? `Invoice #${po.supplierInvoiceNumber}`
                                          : "No invoice matched"
                                      }
                                      variant="outlined"
                                      sx={{ borderRadius: 99, fontWeight: 700 }}
                                    />
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          ) : (
                            <Alert severity="info" variant="outlined">
                              No purchase orders have been generated for this material order yet.
                            </Alert>
                          )}
                        </Stack>
                      </Box>
                    </SectionSurface>

                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <ReceiptLongRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Supplier Invoices & Materials
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Supplier invoice matching will populate this section after PO
                                parser support is connected for M-series POs.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          {Array.isArray(order.supplierInvoices) &&
                          order.supplierInvoices.length > 0 ? (
                            <Stack spacing={1.25}>
                              {order.supplierInvoices.map((invoice, index) => (
                                <Paper
                                  key={`${invoice.invoiceNumber || index}`}
                                  variant="outlined"
                                  sx={{ p: 1.5, borderRadius: 1 }}
                                >
                                  <Stack spacing={0.75}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
                                      {invoice.supplierName || "Supplier Invoice"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      PO: {invoice.poNumber || "—"} • Invoice:{" "}
                                      {invoice.invoiceNumber || "—"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      Total: {formatMoney(invoice.total)}
                                    </Typography>
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          ) : (
                            <Alert severity="info" variant="outlined">
                              No supplier invoices are attached to this material order yet.
                            </Alert>
                          )}

                          {Array.isArray(order.lineItems) && order.lineItems.length > 0 ? (
                            <Stack spacing={1.25}>
                              {order.lineItems.map((item) => (
                                <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                                  <Stack spacing={0.5}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>
                                      {item.description}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      Qty: {item.quantity ?? "—"} • Cost:{" "}
                                      {formatMoney(item.totalCost)}
                                    </Typography>
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          ) : null}
                        </Stack>
                      </Box>
                    </SectionSurface>
                  </Stack>

                  <Stack spacing={2}>
                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <PaidRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Pricing & Billing
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Set customer price before sending to Ready to Bill.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 1.25,
                            }}
                          >
                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                Supplier Cost
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                {formatMoney(supplierCostTotal)}
                              </Typography>
                            </Paper>

                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                Customer Price
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                {formatMoney(order.customerPriceTotal)}
                              </Typography>
                            </Paper>
                          </Box>

                          <TextField
                            label="Customer price total"
                            value={customerPriceInput}
                            onChange={(e) => setCustomerPriceInput(e.target.value)}
                            type="number"
                            inputProps={{ min: 0, step: 0.01 }}
                            fullWidth
                            helperText="This is the amount billing should invoice the customer for the material order."
                          />

                          <Button
                            type="button"
                            variant="outlined"
                            onClick={handleSavePricing}
                            disabled={savingAction === "pricing"}
                            startIcon={
                              savingAction === "pricing" ? (
                                <CircularProgress size={18} />
                              ) : (
                                <PaidRoundedIcon />
                              )
                            }
                            sx={{ borderRadius: 2, fontWeight: 800 }}
                          >
                            {savingAction === "pricing" ? "Saving..." : "Save Pricing"}
                          </Button>

                          <Divider />

                          <InfoRow
                            label="Billing Status"
                            value={getBillingStatusLabel(order.billing?.status)}
                          />

                          <InfoRow
                            label="Ready to Bill"
                            value={formatDateTime(order.billing?.readyToBillAt)}
                          />

                          <InfoRow
                            label="QBO Invoice"
                            value={order.billing?.qboInvoiceNumber || "—"}
                          />
                        </Stack>
                      </Box>
                    </SectionSurface>

                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <CheckCircleRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Workflow Actions
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Move this material order through the lite flow.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          <Button
                            type="button"
                            variant="outlined"
                            onClick={handleMarkOrdered}
                            disabled={
                              savingAction !== "" ||
                              normalize(order.status) === "ordered" ||
                              normalize(order.status) === "cancelled" ||
                              normalize(order.status) === "invoiced"
                            }
                            startIcon={
                              savingAction === "ordered" ? (
                                <CircularProgress size={18} />
                              ) : (
                                <ShoppingCartRoundedIcon />
                              )
                            }
                            sx={{ borderRadius: 2, fontWeight: 800 }}
                          >
                            Mark Ordered
                          </Button>

                          <Button
                            type="button"
                            variant="outlined"
                            onClick={handleMarkReceived}
                            disabled={
                              savingAction !== "" ||
                              normalize(order.status) === "received" ||
                              normalize(order.status) === "cancelled" ||
                              normalize(order.status) === "invoiced"
                            }
                            startIcon={
                              savingAction === "received" ? (
                                <CircularProgress size={18} />
                              ) : (
                                <ReceiptLongRoundedIcon />
                              )
                            }
                            sx={{ borderRadius: 2, fontWeight: 800 }}
                          >
                            Mark Received
                          </Button>

                          <Button
                            type="button"
                            variant="outlined"
                            onClick={handleMarkReadyForPickup}
                            disabled={
                              savingAction !== "" ||
                              normalize(order.status) === "ready_for_pickup" ||
                              normalize(order.status) === "cancelled" ||
                              normalize(order.status) === "invoiced"
                            }
                            startIcon={
                              savingAction === "ready_for_pickup" ? (
                                <CircularProgress size={18} />
                              ) : (
                                <StorefrontRoundedIcon />
                              )
                            }
                            sx={{ borderRadius: 2, fontWeight: 800 }}
                          >
                            Mark Ready for Pickup
                          </Button>

                          <Divider />

                          <TextField
                            label="Picked up by"
                            value={pickedUpByName}
                            onChange={(e) => setPickedUpByName(e.target.value)}
                            fullWidth
                            placeholder="Name of person who picked up materials"
                          />

                          <TextField
                            label="Pickup notes"
                            value={pickupNotes}
                            onChange={(e) => setPickupNotes(e.target.value)}
                            fullWidth
                            multiline
                            minRows={2}
                            placeholder="Optional pickup notes"
                          />

                          <Button
                            type="button"
                            variant="contained"
                            onClick={handleMarkPickedUp}
                            disabled={
                              savingAction !== "" ||
                              normalize(order.status) === "picked_up" ||
                              normalize(order.status) === "cancelled" ||
                              normalize(order.status) === "invoiced"
                            }
                            startIcon={
                              savingAction === "picked_up" ? (
                                <CircularProgress size={18} color="inherit" />
                              ) : (
                                <CheckCircleRoundedIcon />
                              )
                            }
                            sx={{ borderRadius: 2, fontWeight: 850 }}
                          >
                            Mark Picked Up
                          </Button>

                          <Button
                            type="button"
                            variant="contained"
                            color="success"
                            onClick={handleSendToReadyToBill}
                            disabled={
                              savingAction !== "" ||
                              normalize(order.billing?.status) === "ready_to_bill" ||
                              normalize(order.status) === "cancelled" ||
                              normalize(order.status) === "invoiced"
                            }
                            startIcon={
                              savingAction === "ready_to_bill" ? (
                                <CircularProgress size={18} color="inherit" />
                              ) : (
                                <PaidRoundedIcon />
                              )
                            }
                            sx={{ borderRadius: 2, fontWeight: 850 }}
                          >
                            Send to Ready to Bill
                          </Button>
                        </Stack>
                      </Box>
                    </SectionSurface>

                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={2.25}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <WarningAmberRoundedIcon color="warning" />
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 850 }}>
                                Cancel Order
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Use this if the customer no longer wants the materials.
                              </Typography>
                            </Box>
                          </Stack>

                          <Divider />

                          <TextField
                            label="Cancel reason"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            fullWidth
                            multiline
                            minRows={2}
                            placeholder="Reason for cancelling this material order"
                            disabled={
                              normalize(order.status) === "cancelled" ||
                              normalize(order.status) === "invoiced"
                            }
                          />

                          <Button
                            type="button"
                            variant="outlined"
                            color="error"
                            onClick={handleCancelOrder}
                            disabled={
                              savingAction !== "" ||
                              normalize(order.status) === "cancelled" ||
                              normalize(order.status) === "invoiced"
                            }
                            startIcon={
                              savingAction === "cancelled" ? (
                                <CircularProgress size={18} />
                              ) : (
                                <WarningAmberRoundedIcon />
                              )
                            }
                            sx={{ borderRadius: 2, fontWeight: 850 }}
                          >
                            Cancel Material Order
                          </Button>

                          {order.cancelReason ? (
                            <Alert severity="warning" variant="outlined">
                              Cancelled reason: {order.cancelReason}
                            </Alert>
                          ) : null}
                        </Stack>
                      </Box>
                    </SectionSurface>

                    <SectionSurface>
                      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
                        <Stack spacing={1.5}>
                          <Typography variant="h6" sx={{ fontWeight: 850 }}>
                            Quick Summary
                          </Typography>

                          <Divider />

                          <InfoRow
                            label="Material Order Code"
                            value={order.materialOrderCode || "Not assigned until first PO"}
                            icon={<Inventory2RoundedIcon fontSize="small" />}
                          />

                          <InfoRow
                            label="Primary PO"
                            value={getPrimaryPoNumber(order)}
                            icon={<ShoppingCartRoundedIcon fontSize="small" />}
                          />

                          <InfoRow
                            label="All POs"
                            value={
                              Array.isArray(order.poNumbers) && order.poNumbers.length > 0
                                ? order.poNumbers.join(", ")
                                : "—"
                            }
                          />

                          <InfoRow
                            label="Ordered By"
                            value={`${order.orderedByName || "—"} • ${formatDateTime(
                              order.orderedAt
                            )}`}
                          />

                          <InfoRow
                            label="Received By"
                            value={`${order.receivedByName || "—"} • ${formatDateTime(
                              order.receivedAt
                            )}`}
                          />

                          <InfoRow
                            label="Pickup Status"
                            value={getStatusLabel(order.pickup?.status)}
                          />

                          <InfoRow
                            label="Picked Up"
                            value={`${order.pickup?.pickedUpByName || "—"} • ${formatDateTime(
                              order.pickup?.pickedUpAt
                            )}`}
                          />
                        </Stack>
                      </Box>
                    </SectionSurface>
                  </Stack>
                </Box>
              </>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}