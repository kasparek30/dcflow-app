// app/accounting/sales-tax/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";
import { db } from "../../../src/lib/firebase";
import {
  buildSalesTaxSummary,
  centsToInput,
  csvCell,
  currentPeriodKeyLocal,
  DEFAULT_USE_TAX_RATE_BPS,
  dollarsToCents,
  formatCents,
  isPaymentBalanced,
  monthLabel,
  paymentDifferenceCents,
  todayIsoDateLocal,
} from "../../../src/lib/sales-tax";
import type {
  SalesTaxPayment,
  SalesTaxPeriod,
  UntaxedPurchase,
} from "../../../src/types/sales-tax";

type PaymentForm = {
  paymentDate: string;
  customerName: string;
  reference: string;
  paymentAmount: string;
  nonTaxableLabor: string;
  nonTaxableParts: string;
  taxableLabor825: string;
  taxableParts825: string;
  cityTax825: string;
  cityPermits: string;
  taxableLabor675: string;
  taxableParts675: string;
  countyTax675: string;
  reviewed: boolean;
  notes: string;
};

type PurchaseForm = {
  purchaseDate: string;
  vendor: string;
  item: string;
  amount: string;
  taxable: boolean;
  taxRatePercent: string;
  verified: boolean;
  reference: string;
  notes: string;
};

const PAYMENT_FIELDS: Array<{
  key: keyof PaymentForm;
  label: string;
}> = [
  { key: "paymentAmount", label: "Payment Amount" },
  { key: "nonTaxableLabor", label: "Non-Taxable Labor" },
  { key: "nonTaxableParts", label: "Non-Taxable Parts" },
  { key: "taxableLabor825", label: "Taxable Labor 8.25%" },
  { key: "taxableParts825", label: "Taxable Parts 8.25%" },
  { key: "cityTax825", label: "City Tax 8.25%" },
  { key: "cityPermits", label: "City Permits" },
  { key: "taxableLabor675", label: "Taxable Labor 6.75%" },
  { key: "taxableParts675", label: "Taxable Parts 6.75%" },
  { key: "countyTax675", label: "County Tax 6.75%" },
];

function emptyPaymentForm(): PaymentForm {
  return {
    paymentDate: todayIsoDateLocal(),
    customerName: "",
    reference: "",
    paymentAmount: "0.00",
    nonTaxableLabor: "0.00",
    nonTaxableParts: "0.00",
    taxableLabor825: "0.00",
    taxableParts825: "0.00",
    cityTax825: "0.00",
    cityPermits: "0.00",
    taxableLabor675: "0.00",
    taxableParts675: "0.00",
    countyTax675: "0.00",
    reviewed: false,
    notes: "",
  };
}

function emptyPurchaseForm(): PurchaseForm {
  return {
    purchaseDate: todayIsoDateLocal(),
    vendor: "",
    item: "",
    amount: "0.00",
    taxable: true,
    taxRatePercent: "8.25",
    verified: false,
    reference: "",
    notes: "",
  };
}

function actorName(appUser: any) {
  return String(appUser?.displayName || appUser?.name || "DCFlow User").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function parseRatePercentToBps(value: string) {
  const n = Number(String(value || "").replace("%", "").trim());
  if (!Number.isFinite(n) || n < 0) return DEFAULT_USE_TAX_RATE_BPS;
  return Math.round(n * 100);
}

function periodParts(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function paymentFormToRecord(
  form: PaymentForm,
  appUser: any,
): Omit<SalesTaxPayment, "id"> {
  const stamp = nowIso();

  return {
    paymentDate: form.paymentDate,
    customerName: form.customerName.trim(),
    customerId: null,
    reference: form.reference.trim() || null,

    paymentAmountCents: dollarsToCents(form.paymentAmount),

    nonTaxableLaborCents: dollarsToCents(form.nonTaxableLabor),
    nonTaxablePartsCents: dollarsToCents(form.nonTaxableParts),

    taxableLabor825Cents: dollarsToCents(form.taxableLabor825),
    taxableParts825Cents: dollarsToCents(form.taxableParts825),
    cityTax825Cents: dollarsToCents(form.cityTax825),

    cityPermitsCents: dollarsToCents(form.cityPermits),

    taxableLabor675Cents: dollarsToCents(form.taxableLabor675),
    taxableParts675Cents: dollarsToCents(form.taxableParts675),
    countyTax675Cents: dollarsToCents(form.countyTax675),

    reviewed: form.reviewed,
    notes: form.notes.trim() || null,

    createdAt: stamp,
    createdByUid: appUser?.uid || null,
    createdByName: actorName(appUser),
    updatedAt: stamp,
    updatedByUid: appUser?.uid || null,
    updatedByName: actorName(appUser),
  };
}

function paymentToForm(payment: SalesTaxPayment): PaymentForm {
  return {
    paymentDate: payment.paymentDate || todayIsoDateLocal(),
    customerName: payment.customerName || "",
    reference: payment.reference || "",
    paymentAmount: centsToInput(payment.paymentAmountCents),
    nonTaxableLabor: centsToInput(payment.nonTaxableLaborCents),
    nonTaxableParts: centsToInput(payment.nonTaxablePartsCents),
    taxableLabor825: centsToInput(payment.taxableLabor825Cents),
    taxableParts825: centsToInput(payment.taxableParts825Cents),
    cityTax825: centsToInput(payment.cityTax825Cents),
    cityPermits: centsToInput(payment.cityPermitsCents),
    taxableLabor675: centsToInput(payment.taxableLabor675Cents),
    taxableParts675: centsToInput(payment.taxableParts675Cents),
    countyTax675: centsToInput(payment.countyTax675Cents),
    reviewed: Boolean(payment.reviewed),
    notes: payment.notes || "",
  };
}

function purchaseFormToRecord(
  form: PurchaseForm,
  appUser: any,
): Omit<UntaxedPurchase, "id"> {
  const stamp = nowIso();

  return {
    purchaseDate: form.purchaseDate,
    vendor: form.vendor.trim(),
    item: form.item.trim(),
    amountCents: dollarsToCents(form.amount),
    taxable: form.taxable,
    taxRateBps: parseRatePercentToBps(form.taxRatePercent),
    verified: form.verified,
    reference: form.reference.trim() || null,
    notes: form.notes.trim() || null,
    createdAt: stamp,
    createdByUid: appUser?.uid || null,
    createdByName: actorName(appUser),
    updatedAt: stamp,
    updatedByUid: appUser?.uid || null,
    updatedByName: actorName(appUser),
  };
}

function purchaseToForm(purchase: UntaxedPurchase): PurchaseForm {
  return {
    purchaseDate: purchase.purchaseDate || todayIsoDateLocal(),
    vendor: purchase.vendor || "",
    item: purchase.item || "",
    amount: centsToInput(purchase.amountCents),
    taxable: purchase.taxable !== false,
    taxRatePercent: (Number(purchase.taxRateBps || 825) / 100).toFixed(2),
    verified: Boolean(purchase.verified),
    reference: purchase.reference || "",
    notes: purchase.notes || "",
  };
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        backgroundColor: "background.paper",
        height: "100%",
      }}
    >
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              display: "grid",
              placeItems: "center",
              color: "primary.light",
              backgroundColor: alpha(theme.palette.primary.main, 0.12),
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", fontWeight: 750 }}
            >
              {title}
            </Typography>
            <Typography
              variant="h6"
              sx={{ mt: 0.25, fontWeight: 900, letterSpacing: "-0.025em" }}
            >
              {value}
            </Typography>
            {subtitle ? (
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", display: "block", mt: 0.25 }}
              >
                {subtitle}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      {children}
    </Card>
  );
}

export default function SalesTaxPage() {
  const { appUser } = useAuthContext();

  const [periodKey, setPeriodKey] = useState(currentPeriodKeyLocal());
  const [period, setPeriod] = useState<SalesTaxPeriod | null>(null);
  const [payments, setPayments] = useState<SalesTaxPayment[]>([]);
  const [purchases, setPurchases] = useState<UntaxedPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm());
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] =
    useState<PurchaseForm>(emptyPurchaseForm());
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);

  const [filingDialogOpen, setFilingDialogOpen] = useState(false);
  const [filingConfirmation, setFilingConfirmation] = useState("");
  const [filingNotes, setFilingNotes] = useState("");

  const canFile =
    appUser?.role === "admin" || appUser?.role === "billing";

  const isFiled = period?.status === "filed";

  useEffect(() => {
    if (!appUser?.uid) return;

    const currentUserUid = appUser.uid;
    const currentUserName = actorName(appUser);

    setLoading(true);
    setError("");

    const periodRef = doc(db, "salesTaxPeriods", periodKey);
    let unsubPeriod = () => {};
    let unsubPayments = () => {};
    let unsubPurchases = () => {};
    let cancelled = false;

    async function start() {
      try {
        const existing = await getDoc(periodRef);

        if (!existing.exists()) {
          const parts = periodParts(periodKey);
          const stamp = nowIso();

          await setDoc(periodRef, {
            periodKey,
            year: parts.year,
            month: parts.month,
            status: "open",
            useTaxRateBps: DEFAULT_USE_TAX_RATE_BPS,
            createdAt: stamp,
            createdByUid: currentUserUid,
            createdByName: currentUserName,
            updatedAt: stamp,
            updatedByUid: currentUserUid,
            updatedByName: currentUserName,
            filedAt: null,
            filedByUid: null,
            filedByName: null,
            filingConfirmation: null,
            filingNotes: null,
          });
        }

        if (cancelled) return;

        unsubPeriod = onSnapshot(
          periodRef,
          (snap) => {
            if (!snap.exists()) {
              setPeriod(null);
              return;
            }

            setPeriod({
              id: snap.id,
              ...(snap.data() as Omit<SalesTaxPeriod, "id">),
            });
          },
          (err) => setError(err.message),
        );

        unsubPayments = onSnapshot(
          query(
            collection(db, "salesTaxPeriods", periodKey, "payments"),
            orderBy("paymentDate", "asc"),
          ),
          (snap) => {
            setPayments(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<SalesTaxPayment, "id">),
              })),
            );
          },
          (err) => setError(err.message),
        );

        unsubPurchases = onSnapshot(
          query(
            collection(db, "salesTaxPeriods", periodKey, "untaxedPurchases"),
            orderBy("purchaseDate", "asc"),
          ),
          (snap) => {
            setPurchases(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<UntaxedPurchase, "id">),
              })),
            );
            setLoading(false);
          },
          (err) => {
            setError(err.message);
            setLoading(false);
          },
        );
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load sales tax.");
        setLoading(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      unsubPeriod();
      unsubPayments();
      unsubPurchases();
    };
  }, [periodKey, appUser?.uid]);

  const summary = useMemo(
    () => buildSalesTaxSummary(payments, purchases),
    [payments, purchases],
  );

  const filingBlockers = useMemo(() => {
    const blockers: string[] = [];

    if (summary.unbalancedPaymentCount > 0) {
      blockers.push(
        `${summary.unbalancedPaymentCount} payment${
          summary.unbalancedPaymentCount === 1 ? "" : "s"
        } out of balance`,
      );
    }

    const unreviewed = summary.paymentCount - summary.reviewedPaymentCount;
    if (unreviewed > 0) {
      blockers.push(
        `${unreviewed} payment${unreviewed === 1 ? "" : "s"} not reviewed`,
      );
    }

    const unverified = summary.purchaseCount - summary.verifiedPurchaseCount;
    if (unverified > 0) {
      blockers.push(
        `${unverified} purchase${unverified === 1 ? "" : "s"} not verified`,
      );
    }

    return blockers;
  }, [summary]);

  async function savePayment() {
    if (!appUser?.uid || isFiled) return;

    const customerName = paymentForm.customerName.trim();
    if (!customerName) {
      setError("Customer name is required.");
      return;
    }

    const data = paymentFormToRecord(paymentForm, appUser);

    try {
      setError("");

      if (editingPaymentId) {
        const existing = payments.find((p) => p.id === editingPaymentId);
        await updateDoc(
          doc(
            db,
            "salesTaxPeriods",
            periodKey,
            "payments",
            editingPaymentId,
          ),
          {
            ...data,
            createdAt: existing?.createdAt || data.createdAt,
            createdByUid: existing?.createdByUid || data.createdByUid,
            createdByName: existing?.createdByName || data.createdByName,
          },
        );
      } else {
        await addDoc(
          collection(db, "salesTaxPeriods", periodKey, "payments"),
          data,
        );
      }

      setPaymentDialogOpen(false);
      setEditingPaymentId(null);
      setPaymentForm(emptyPaymentForm());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save payment.");
    }
  }

  async function savePurchase() {
    if (!appUser?.uid || isFiled) return;

    if (!purchaseForm.vendor.trim() || !purchaseForm.item.trim()) {
      setError("Vendor and item are required.");
      return;
    }

    const data = purchaseFormToRecord(purchaseForm, appUser);

    try {
      setError("");

      if (editingPurchaseId) {
        const existing = purchases.find((p) => p.id === editingPurchaseId);
        await updateDoc(
          doc(
            db,
            "salesTaxPeriods",
            periodKey,
            "untaxedPurchases",
            editingPurchaseId,
          ),
          {
            ...data,
            createdAt: existing?.createdAt || data.createdAt,
            createdByUid: existing?.createdByUid || data.createdByUid,
            createdByName: existing?.createdByName || data.createdByName,
          },
        );
      } else {
        await addDoc(
          collection(db, "salesTaxPeriods", periodKey, "untaxedPurchases"),
          data,
        );
      }

      setPurchaseDialogOpen(false);
      setEditingPurchaseId(null);
      setPurchaseForm(emptyPurchaseForm());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save purchase.");
    }
  }

  async function markFiled() {
    if (!canFile || !period || filingBlockers.length > 0) return;

    try {
      setError("");
      await updateDoc(doc(db, "salesTaxPeriods", periodKey), {
        status: "filed",
        filedAt: nowIso(),
        filedByUid: appUser?.uid || null,
        filedByName: actorName(appUser),
        filingConfirmation: filingConfirmation.trim() || null,
        filingNotes: filingNotes.trim() || null,
        updatedAt: nowIso(),
        updatedByUid: appUser?.uid || null,
        updatedByName: actorName(appUser),
      });

      setFilingDialogOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to mark month filed.");
    }
  }

  async function reopenMonth() {
    if (!canFile || !period) return;

    try {
      setError("");
      await updateDoc(doc(db, "salesTaxPeriods", periodKey), {
        status: "open",
        updatedAt: nowIso(),
        updatedByUid: appUser?.uid || null,
        updatedByName: actorName(appUser),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reopen month.");
    }
  }

  function exportCsv() {
    const rows: string[][] = [];

    rows.push(["DCFlow Sales Tax", monthLabel(periodKey)]);
    rows.push([]);
    rows.push(["CUSTOMER PAYMENTS"]);
    rows.push([
      "Date",
      "Customer",
      "Reference",
      "Payment",
      "Non-Tax Labor",
      "Non-Tax Parts",
      "Taxable Labor 8.25%",
      "Taxable Parts 8.25%",
      "City Tax 8.25%",
      "City Permits",
      "Taxable Labor 6.75%",
      "Taxable Parts 6.75%",
      "County Tax 6.75%",
      "Reviewed",
      "Balance Difference",
    ]);

    for (const p of payments) {
      rows.push([
        p.paymentDate,
        p.customerName,
        p.reference || "",
        centsToInput(p.paymentAmountCents),
        centsToInput(p.nonTaxableLaborCents),
        centsToInput(p.nonTaxablePartsCents),
        centsToInput(p.taxableLabor825Cents),
        centsToInput(p.taxableParts825Cents),
        centsToInput(p.cityTax825Cents),
        centsToInput(p.cityPermitsCents),
        centsToInput(p.taxableLabor675Cents),
        centsToInput(p.taxableParts675Cents),
        centsToInput(p.countyTax675Cents),
        p.reviewed ? "Yes" : "No",
        centsToInput(paymentDifferenceCents(p)),
      ]);
    }

    rows.push([]);
    rows.push(["UNTAXED PURCHASES"]);
    rows.push([
      "Date",
      "Vendor",
      "Item",
      "Amount",
      "Taxable",
      "Tax Rate",
      "Verified",
      "Reference",
    ]);

    for (const p of purchases) {
      rows.push([
        p.purchaseDate,
        p.vendor,
        p.item,
        centsToInput(p.amountCents),
        p.taxable ? "Yes" : "No",
        `${(p.taxRateBps / 100).toFixed(2)}%`,
        p.verified ? "Yes" : "No",
        p.reference || "",
      ]);
    }

    rows.push([]);
    rows.push(["SUMMARY"]);
    rows.push(["Total Sales", centsToInput(summary.totalSalesCents)]);
    rows.push(["Taxable Sales", centsToInput(summary.taxableSalesCents)]);
    rows.push([
      "Taxable Purchases",
      centsToInput(summary.taxablePurchasesCents),
    ]);
    rows.push([
      "Use Tax on Untaxed Purchases",
      centsToInput(summary.useTaxOnPurchasesCents),
    ]);
    rows.push(["City Tax Base", centsToInput(summary.cityTaxBaseCents)]);
    rows.push(["County Tax Base", centsToInput(summary.countyTaxBaseCents)]);
    rows.push([
      "Tax Collected 8.25%",
      centsToInput(summary.cityTaxCollectedCents),
    ]);
    rows.push([
      "Tax Collected 6.75%",
      centsToInput(summary.countyTaxCollectedCents),
    ]);

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `dcflow-sales-tax-${periodKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <ProtectedPage
      fallbackTitle="Sales Tax"
      allowedRoles={["admin", "billing", "dispatcher", "manager"]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ p: { xs: 1.25, md: 2.25 }, maxWidth: 1800, mx: "auto" }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", lg: "center" }}
              spacing={1.5}
            >
              <Box>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontWeight: 750 }}
                >
                  Accounting / Sales Tax
                </Typography>
                <Typography
                  variant="h4"
                  sx={{
                    mt: 0.25,
                    fontWeight: 900,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Sales Tax
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ xs: "stretch", sm: "center" }}
              >
                <TextField
                  type="month"
                  size="small"
                  value={periodKey}
                  onChange={(e) => setPeriodKey(e.target.value)}
                  sx={{ minWidth: 175 }}
                />

                <Chip
                  icon={isFiled ? <LockRoundedIcon /> : undefined}
                  label={
                    isFiled
                      ? `Filed${
                          period?.filedByName ? ` by ${period.filedByName}` : ""
                        }`
                      : "Open — Month in Progress"
                  }
                  color={isFiled ? "default" : "success"}
                  variant={isFiled ? "outlined" : "filled"}
                  sx={{ fontWeight: 800 }}
                />

                <Button
                  variant="outlined"
                  startIcon={<FileDownloadRoundedIcon />}
                  onClick={exportCsv}
                >
                  Export CSV
                </Button>

                {canFile ? (
                  isFiled ? (
                    <Button variant="outlined" onClick={reopenMonth}>
                      Reopen Month
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={<CheckCircleRoundedIcon />}
                      disabled={filingBlockers.length > 0}
                      onClick={() => setFilingDialogOpen(true)}
                    >
                      Mark Filed
                    </Button>
                  )
                ) : null}
              </Stack>
            </Stack>

            {error ? <Alert severity="error">{error}</Alert> : null}

            {isFiled ? (
              <Alert severity="info" icon={<LockRoundedIcon />}>
                {monthLabel(periodKey)} is filed and read-only. Admin or Billing
                must reopen the month before transactions can be changed.
              </Alert>
            ) : null}

            {!isFiled && filingBlockers.length > 0 ? (
              <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
                Month-end close is blocked: {filingBlockers.join(" • ")}
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(5, minmax(0, 1fr))",
                },
                gap: 1.25,
              }}
            >
              <KpiCard
                title="Total Sales"
                value={formatCents(summary.totalSalesCents)}
                icon={<PaidRoundedIcon />}
              />
              <KpiCard
                title="Taxable Sales"
                value={formatCents(summary.taxableSalesCents)}
                icon={<ReceiptLongRoundedIcon />}
              />
              <KpiCard
                title="Untaxed Purchases"
                value={formatCents(summary.taxablePurchasesCents)}
                icon={<ShoppingCartRoundedIcon />}
              />
              <KpiCard
                title="Use Tax on Untaxed Purchases"
                value={formatCents(summary.useTaxOnPurchasesCents)}
                subtitle="Calculated from purchase-level tax rates"
                icon={<PaidRoundedIcon />}
              />
              <KpiCard
                title="Reviewed Payments"
                value={`${summary.reviewedPaymentCount} / ${summary.paymentCount}`}
                subtitle={`${summary.balancedPaymentCount} balanced`}
                icon={<TaskAltRoundedIcon />}
              />
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  xl: "minmax(0, 2.25fr) minmax(380px, 0.9fr)",
                },
                gap: 1.5,
                alignItems: "start",
              }}
            >
              <SectionCard>
                <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    spacing={1.5}
                    sx={{ p: 2 }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>
                        Customer Payments
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Allocate each payment by the same tax categories used in
                        the monthly spreadsheet. Payment must balance to $0.00.
                      </Typography>
                    </Box>

                    <Button
                      variant="contained"
                      startIcon={<AddRoundedIcon />}
                      disabled={isFiled}
                      onClick={() => {
                        setEditingPaymentId(null);
                        setPaymentForm(emptyPaymentForm());
                        setPaymentDialogOpen(true);
                      }}
                    >
                      Add Payment
                    </Button>
                  </Stack>

                  <Divider />

                  <TableContainer sx={{ maxHeight: 620 }}>
                    <Table stickyHeader size="small" sx={{ minWidth: 1500 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Customer</TableCell>
                          <TableCell align="right">Payment</TableCell>
                          <TableCell align="right">Non-Tax Labor</TableCell>
                          <TableCell align="right">Non-Tax Parts</TableCell>
                          <TableCell align="right">Tax Labor 8.25%</TableCell>
                          <TableCell align="right">Tax Parts 8.25%</TableCell>
                          <TableCell align="right">City Tax</TableCell>
                          <TableCell align="right">Permits</TableCell>
                          <TableCell align="right">Tax Labor 6.75%</TableCell>
                          <TableCell align="right">Tax Parts 6.75%</TableCell>
                          <TableCell align="right">County Tax</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {payments.map((payment) => {
                          const balanced = isPaymentBalanced(payment);
                          const difference = paymentDifferenceCents(payment);

                          return (
                            <TableRow key={payment.id} hover>
                              <TableCell>{payment.paymentDate}</TableCell>
                              <TableCell sx={{ fontWeight: 750 }}>
                                {payment.customerName}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.paymentAmountCents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.nonTaxableLaborCents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.nonTaxablePartsCents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.taxableLabor825Cents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.taxableParts825Cents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.cityTax825Cents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.cityPermitsCents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.taxableLabor675Cents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.taxableParts675Cents)}
                              </TableCell>
                              <TableCell align="right">
                                {formatCents(payment.countyTax675Cents)}
                              </TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={0.75}>
                                  <Chip
                                    size="small"
                                    label={
                                      balanced
                                        ? "Balanced"
                                        : `Off ${formatCents(difference)}`
                                    }
                                    color={balanced ? "success" : "error"}
                                    variant="outlined"
                                    sx={{ fontWeight: 800 }}
                                  />
                                  {payment.reviewed ? (
                                    <Chip
                                      size="small"
                                      label="Reviewed"
                                      color="primary"
                                      variant="outlined"
                                    />
                                  ) : null}
                                </Stack>
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title="Edit payment">
                                  <span>
                                    <IconButton
                                      size="small"
                                      disabled={isFiled}
                                      onClick={() => {
                                        setEditingPaymentId(payment.id);
                                        setPaymentForm(paymentToForm(payment));
                                        setPaymentDialogOpen(true);
                                      }}
                                    >
                                      <EditRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>

                                <Tooltip title="Delete payment">
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      disabled={isFiled}
                                      onClick={async () => {
                                        if (
                                          !window.confirm(
                                            `Delete payment for ${payment.customerName}?`,
                                          )
                                        ) {
                                          return;
                                        }

                                        await deleteDoc(
                                          doc(
                                            db,
                                            "salesTaxPeriods",
                                            periodKey,
                                            "payments",
                                            payment.id,
                                          ),
                                        );
                                      }}
                                    >
                                      <DeleteOutlineRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}

                        {!loading && payments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={14}>
                              <Typography
                                sx={{
                                  py: 4,
                                  textAlign: "center",
                                  color: "text.secondary",
                                }}
                              >
                                No customer payments entered for{" "}
                                {monthLabel(periodKey)}.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {summary.unbalancedPaymentCount > 0 ? (
                    <Alert
                      severity="error"
                      square
                      sx={{ borderRadius: 0 }}
                      icon={<WarningAmberRoundedIcon />}
                    >
                      {summary.unbalancedPaymentCount} payment
                      {summary.unbalancedPaymentCount === 1 ? "" : "s"} out of
                      balance. Net difference:{" "}
                      <strong>
                        {formatCents(summary.totalAllocationDifferenceCents)}
                      </strong>
                    </Alert>
                  ) : null}
                </CardContent>
              </SectionCard>

              <Stack spacing={1.5}>
                <SectionCard>
                  <CardContent>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      spacing={1}
                    >
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 850 }}>
                          Untaxed Purchases
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Tool/vendor purchases where sales tax was not paid.
                        </Typography>
                      </Box>

                      <Button
                        size="small"
                        startIcon={<AddRoundedIcon />}
                        disabled={isFiled}
                        onClick={() => {
                          setEditingPurchaseId(null);
                          setPurchaseForm(emptyPurchaseForm());
                          setPurchaseDialogOpen(true);
                        }}
                      >
                        Add
                      </Button>
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Stack spacing={0.75}>
                      {purchases.slice(0, 8).map((purchase) => (
                        <Box
                          key={purchase.id}
                          sx={{
                            p: 1,
                            borderRadius: 1.5,
                            border: `1px solid ${alpha("#FFFFFF", 0.07)}`,
                          }}
                        >
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            spacing={1}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                {purchase.vendor}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {purchase.purchaseDate} • {purchase.item}
                              </Typography>
                            </Box>

                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                            >
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 850, whiteSpace: "nowrap" }}
                              >
                                {formatCents(purchase.amountCents)}
                              </Typography>

                              <IconButton
                                size="small"
                                disabled={isFiled}
                                onClick={() => {
                                  setEditingPurchaseId(purchase.id);
                                  setPurchaseForm(purchaseToForm(purchase));
                                  setPurchaseDialogOpen(true);
                                }}
                              >
                                <EditRoundedIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </Stack>
                          </Stack>
                        </Box>
                      ))}

                      {purchases.length > 8 ? (
                        <Typography variant="caption" color="text.secondary">
                          + {purchases.length - 8} more purchases
                        </Typography>
                      ) : null}

                      {purchases.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No untaxed purchases entered.
                        </Typography>
                      ) : null}
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Stack spacing={0.75}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Taxable Purchase Amount
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 850 }}>
                          {formatCents(summary.taxablePurchasesCents)}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Use Tax
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>
                          {formatCents(summary.useTaxOnPurchasesCents)}
                        </Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                </SectionCard>

                <SectionCard>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 850 }}>
                      Monthly Tax Summary
                    </Typography>

                    <Divider sx={{ my: 1.5 }} />

                    {[
                      ["Total Sales", summary.totalSalesCents],
                      ["Taxable Sales", summary.taxableSalesCents],
                      ["Taxable Purchases", summary.taxablePurchasesCents],
                      ["City Tax Base", summary.cityTaxBaseCents],
                      ["County Tax Base", summary.countyTaxBaseCents],
                      ["Tax Collected 8.25%", summary.cityTaxCollectedCents],
                      ["Tax Collected 6.75%", summary.countyTaxCollectedCents],
                      ["Total Tax Collected", summary.totalTaxCollectedCents],
                      [
                        "Use Tax on Untaxed Purchases",
                        summary.useTaxOnPurchasesCents,
                      ],
                    ].map(([label, cents]) => (
                      <Stack
                        key={String(label)}
                        direction="row"
                        justifyContent="space-between"
                        spacing={2}
                        sx={{ py: 0.55 }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {String(label)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                          {formatCents(Number(cents))}
                        </Typography>
                      </Stack>
                    ))}
                  </CardContent>
                </SectionCard>

                <SectionCard>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 850 }}>
                      Month-End Checklist
                    </Typography>

                    <Divider sx={{ my: 1.5 }} />

                    <Stack spacing={1}>
                      <ChecklistRow
                        done={
                          summary.paymentCount === summary.reviewedPaymentCount
                        }
                        label="Review all customer payments"
                      />
                      <ChecklistRow
                        done={summary.unbalancedPaymentCount === 0}
                        label="Balance all payment allocations"
                      />
                      <ChecklistRow
                        done={
                          summary.purchaseCount === summary.verifiedPurchaseCount
                        }
                        label="Verify untaxed purchases"
                      />
                      <ChecklistRow
                        done={false}
                        label="Export return support"
                      />
                      <ChecklistRow
                        done={isFiled}
                        label="Mark month filed"
                      />
                    </Stack>
                  </CardContent>
                </SectionCard>
              </Stack>
            </Box>
          </Stack>
        </Box>

        <Dialog
          open={paymentDialogOpen}
          onClose={() => setPaymentDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            {editingPaymentId ? "Edit Customer Payment" : "Add Customer Payment"}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "160px 1fr 1fr" },
                  gap: 1.25,
                }}
              >
                <TextField
                  label="Payment Date"
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) =>
                    setPaymentForm((x) => ({
                      ...x,
                      paymentDate: e.target.value,
                    }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Customer"
                  value={paymentForm.customerName}
                  onChange={(e) =>
                    setPaymentForm((x) => ({
                      ...x,
                      customerName: e.target.value,
                    }))
                  }
                />
                <TextField
                  label="Reference / Check #"
                  value={paymentForm.reference}
                  onChange={(e) =>
                    setPaymentForm((x) => ({
                      ...x,
                      reference: e.target.value,
                    }))
                  }
                />
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: 1.25,
                }}
              >
                {PAYMENT_FIELDS.map((field) => (
                  <TextField
                    key={field.key}
                    label={field.label}
                    value={String(paymentForm[field.key])}
                    onChange={(e) =>
                      setPaymentForm((x) => ({
                        ...x,
                        [field.key]: e.target.value,
                      }))
                    }
                    slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  />
                ))}
              </Box>

              <TextField
                label="Notes"
                multiline
                minRows={2}
                value={paymentForm.notes}
                onChange={(e) =>
                  setPaymentForm((x) => ({ ...x, notes: e.target.value }))
                }
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={paymentForm.reviewed}
                    onChange={(e) =>
                      setPaymentForm((x) => ({
                        ...x,
                        reviewed: e.target.checked,
                      }))
                    }
                  />
                }
                label="Reviewed for month-end sales tax"
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={savePayment}>
              Save Payment
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={purchaseDialogOpen}
          onClose={() => setPurchaseDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {editingPurchaseId ? "Edit Untaxed Purchase" : "Add Untaxed Purchase"}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={1.5}>
              <TextField
                label="Purchase Date"
                type="date"
                value={purchaseForm.purchaseDate}
                onChange={(e) =>
                  setPurchaseForm((x) => ({
                    ...x,
                    purchaseDate: e.target.value,
                  }))
                }
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Vendor"
                value={purchaseForm.vendor}
                onChange={(e) =>
                  setPurchaseForm((x) => ({ ...x, vendor: e.target.value }))
                }
              />
              <TextField
                label="Item"
                value={purchaseForm.item}
                onChange={(e) =>
                  setPurchaseForm((x) => ({ ...x, item: e.target.value }))
                }
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <TextField
                  fullWidth
                  label="Amount"
                  value={purchaseForm.amount}
                  onChange={(e) =>
                    setPurchaseForm((x) => ({
                      ...x,
                      amount: e.target.value,
                    }))
                  }
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                />
                <TextField
                  fullWidth
                  label="Tax Rate %"
                  value={purchaseForm.taxRatePercent}
                  onChange={(e) =>
                    setPurchaseForm((x) => ({
                      ...x,
                      taxRatePercent: e.target.value,
                    }))
                  }
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                />
              </Stack>

              <TextField
                label="Reference / Receipt #"
                value={purchaseForm.reference}
                onChange={(e) =>
                  setPurchaseForm((x) => ({
                    ...x,
                    reference: e.target.value,
                  }))
                }
              />

              <TextField
                label="Notes"
                multiline
                minRows={2}
                value={purchaseForm.notes}
                onChange={(e) =>
                  setPurchaseForm((x) => ({ ...x, notes: e.target.value }))
                }
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={purchaseForm.taxable}
                    onChange={(e) =>
                      setPurchaseForm((x) => ({
                        ...x,
                        taxable: e.target.checked,
                      }))
                    }
                  />
                }
                label="Subject to use tax"
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={purchaseForm.verified}
                    onChange={(e) =>
                      setPurchaseForm((x) => ({
                        ...x,
                        verified: e.target.checked,
                      }))
                    }
                  />
                }
                label="Verified for month-end sales tax"
              />

              {editingPurchaseId ? (
                <Button
                  color="error"
                  startIcon={<DeleteOutlineRoundedIcon />}
                  onClick={async () => {
                    if (!window.confirm("Delete this untaxed purchase?")) return;

                    await deleteDoc(
                      doc(
                        db,
                        "salesTaxPeriods",
                        periodKey,
                        "untaxedPurchases",
                        editingPurchaseId,
                      ),
                    );
                    setPurchaseDialogOpen(false);
                    setEditingPurchaseId(null);
                  }}
                >
                  Delete Purchase
                </Button>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPurchaseDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={savePurchase}>
              Save Purchase
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={filingDialogOpen}
          onClose={() => setFilingDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Mark {monthLabel(periodKey)} Filed?</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={1.5}>
              <Alert severity="info">
                Filing locks customer payments and untaxed purchases for this
                month. Admin or Billing can reopen it later if a correction is
                necessary.
              </Alert>

              <TextField
                label="Filing Confirmation / Reference"
                value={filingConfirmation}
                onChange={(e) => setFilingConfirmation(e.target.value)}
              />

              <TextField
                label="Filing Notes"
                multiline
                minRows={3}
                value={filingNotes}
                onChange={(e) => setFilingNotes(e.target.value)}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setFilingDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={markFiled}>
              Mark Filed
            </Button>
          </DialogActions>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}

function ChecklistRow({
  done,
  label,
}: {
  done: boolean;
  label: string;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Checkbox checked={done} disabled size="small" />
      <Typography
        variant="body2"
        sx={{
          fontWeight: done ? 700 : 500,
          color: done ? "text.primary" : "text.secondary",
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}
