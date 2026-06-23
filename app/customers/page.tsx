// app/customers/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  documentId,
  endAt,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PhoneRoundedIcon from "@mui/icons-material/PhoneRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";
import type { Customer } from "../../src/types/customer";

type CustomerFilter =
  | "all"
  | "active"
  | "needs_service_address"
  | "multi_property"
  | "qbo_linked"
  | "billing_only";

type RecentCustomerEntry = {
  customerId: string;
  openedAt: string;
};

const RECENT_CUSTOMERS_STORAGE_KEY = "dcflow.recentCustomers.v1";
const RECENT_CUSTOMER_LIMIT = 5;
const CUSTOMER_SEARCH_LIMIT = 30;
const CUSTOMER_FILTER_LIMIT = 50;
const MIN_SEARCH_CHARS = 2;

function normalizeSearchText(input: string) {
  return (input || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function digitsOnly(input: string) {
  return String(input || "").replace(/\D/g, "");
}

function safeDateMillis(value?: string | null) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function formatRelativeTime(value?: string | null) {
  const ms = safeDateMillis(value);
  if (!ms) return "Recently";

  const diffMs = Date.now() - ms;
  if (diffMs < 60_000) return "Just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
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

  const phoneDigits = [
    digitsOnly(c.phonePrimary),
    digitsOnly(c.phoneSecondary || ""),
  ]
    .filter(Boolean)
    .join(" ");

  parts.push(phoneDigits);

  return normalizeSearchText(parts.join(" • "));
}

function createAddressId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `addr_${Math.random().toString(36).slice(2, 11)}`;
}

function mapCustomerDoc(
  docSnap: QueryDocumentSnapshot<unknown, DocumentData>,
): Customer {
  const data = docSnap.data() as any;

  const item: Customer = {
    id: docSnap.id,
    quickbooksCustomerId:
      data.quickbooksCustomerId ?? data.qboCustomerId ?? undefined,
    quickbooksSyncStatus:
      data.quickbooksSyncStatus ?? data.qboSyncStatus ?? undefined,
    lastQuickbooksSyncAt:
      data.lastQuickbooksSyncAt ?? data.qboLastSyncedAt ?? undefined,
    quickbooksLastError:
      data.quickbooksLastError ?? data.qboLastSyncError ?? undefined,
    source: data.source ?? "dcflow",
    displayName:
      data.displayName ?? data.customerDisplayName ?? data.qboDisplayName ?? "",
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

  (item as any).activeServiceAddressCount =
    data.activeServiceAddressCount ??
    data.serviceAddressCount ??
    data.serviceLocationCount ??
    undefined;
  (item as any).hasServiceAddress =
    data.hasServiceAddress ?? data.hasServiceLocation ?? undefined;
  (item as any).billingOnly = data.billingOnly ?? undefined;
  (item as any).needsServiceAddress = data.needsServiceAddress ?? undefined;
  (item as any).isMultiProperty = data.isMultiProperty ?? undefined;
  (item as any).qboLinked = data.qboLinked ?? undefined;

  return item;
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
  const line3 = [cityState, postalCode].filter(Boolean).join(" ");

  return {
    line1,
    line2,
    line3,
    city,
    state,
  };
}

function getActiveServiceAddresses(customer: Customer) {
  return (customer.serviceAddresses || []).filter(
    (addr) => addr.active !== false,
  );
}

function getActiveServiceAddressCount(customer: Customer) {
  const activeServiceAddresses = getActiveServiceAddresses(customer);

  if (activeServiceAddresses.length > 0) {
    return activeServiceAddresses.length;
  }

  const storedCount = Number(
    (customer as any).activeServiceAddressCount ??
      (customer as any).serviceAddressCount ??
      (customer as any).serviceLocationCount,
  );

  if (Number.isFinite(storedCount) && storedCount > 0) {
    return storedCount;
  }

  const hasServiceAddress = (customer as any).hasServiceAddress ?? (customer as any).hasServiceLocation;
  if (hasServiceAddress === true) return 1;

  return 0;
}

function getPrimaryServiceAddress(customer: Customer) {
  const activeServiceAddresses = getActiveServiceAddresses(customer);
  return (
    activeServiceAddresses.find((addr) => addr.isPrimary) ??
    activeServiceAddresses[0] ??
    null
  );
}

function getDisplayAddress(customer: Customer) {
  const primaryServiceAddress = getPrimaryServiceAddress(customer);

  if (primaryServiceAddress) {
    return {
      ...formatAddressLines({
        line1: primaryServiceAddress.addressLine1,
        line2: primaryServiceAddress.addressLine2,
        city: primaryServiceAddress.city,
        state: primaryServiceAddress.state,
        postalCode: primaryServiceAddress.postalCode,
      }),
      sourceLabel: primaryServiceAddress.isPrimary
        ? "Primary service location"
        : "Service location",
      hasServiceAddress: true,
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
    sourceLabel: "Billing address only",
    hasServiceAddress: false,
  };
}

function getCustomerInitials(customer: Customer) {
  const name = String(customer.displayName || "").trim();

  if (!name) return "?";

  const words = name.split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] || "";
  const second = words.length > 1 ? words[1]?.[0] || "" : words[0]?.[1] || "";

  return `${first}${second}`.toUpperCase();
}

function getCustomerTouchMillis(customer: Customer) {
  return Math.max(
    safeDateMillis(customer.updatedAt),
    safeDateMillis(customer.createdAt),
  );
}

function readRecentCustomerEntries() {
  if (typeof window === "undefined") return [] as RecentCustomerEntry[];

  try {
    const raw = window.localStorage.getItem(RECENT_CUSTOMERS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        customerId: String(item?.customerId || item?.id || "").trim(),
        openedAt: String(
          item?.openedAt || item?.lastOpenedAt || item?.touchedAt || "",
        ).trim(),
      }))
      .filter((item) => item.customerId)
      .slice(0, RECENT_CUSTOMER_LIMIT);
  } catch {
    return [];
  }
}

function writeRecentCustomerEntries(items: RecentCustomerEntry[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      RECENT_CUSTOMERS_STORAGE_KEY,
      JSON.stringify(items.slice(0, RECENT_CUSTOMER_LIMIT)),
    );
  } catch {
    // Local storage may be unavailable in private mode. The page still works without it.
  }
}

function QuickBooksIcon() {
  return (
    <Box
      component="span"
      sx={{
        width: 30,
        height: 30,
        borderRadius: 999,
        display: "inline-grid",
        placeItems: "center",
        bgcolor: "success.main",
        color: "success.contrastText",
        fontSize: 13,
        fontWeight: 900,
        letterSpacing: -0.6,
        lineHeight: 1,
      }}
    >
      qb
    </Box>
  );
}

function SectionSurface({ children }: { children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        overflow: "hidden",
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
        backgroundColor: "background.paper",
      }}
    >
      {children}
    </Card>
  );
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  tone?: "default" | "primary" | "success";
}) {
  const theme = useTheme();

  const toneColor =
    props.tone === "success"
      ? theme.palette.success.main
      : props.tone === "primary"
        ? theme.palette.primary.main
        : theme.palette.text.primary;

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
        backgroundColor:
          props.tone === "primary"
            ? alpha(theme.palette.primary.main, 0.06)
            : props.tone === "success"
              ? alpha(theme.palette.success.main, 0.045)
              : theme.palette.background.paper,
      }}
    >
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: "grid",
              placeItems: "center",
              backgroundColor: alpha(toneColor, 0.11),
              color: toneColor,
              flexShrink: 0,
            }}
          >
            {props.icon}
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontWeight: 650 }}
            >
              {props.label}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 850, lineHeight: 1.15 }}>
              {props.value}
            </Typography>
            {props.subtitle ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                {props.subtitle}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </Box>
    </Card>
  );
}

function LoadingRow() {
  const theme = useTheme();

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Skeleton variant="circular" width={42} height={42} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" width="35%" height={28} />
            <Skeleton variant="text" width="56%" />
          </Box>
          <Skeleton variant="rounded" width={96} height={34} />
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
              borderRadius: 1,
              display: "grid",
              placeItems: "center",
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
            }}
          >
            {icon}
          </Box>

          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {title}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 560 }}
          >
            {description}
          </Typography>

          {action ? <Box sx={{ pt: 0.5 }}>{action}</Box> : null}
        </Stack>
      </Box>
    </SectionSurface>
  );
}

function StatusChips({ customer }: { customer: Customer }) {
  const serviceAddressCount = getActiveServiceAddressCount(customer);
  const isQboLinked = Boolean(customer.quickbooksCustomerId);

  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      <Chip
        size="small"
        label={customer.active ? "Active" : "Inactive"}
        color={customer.active ? "success" : "default"}
        variant={customer.active ? "filled" : "outlined"}
        sx={{ borderRadius: 1.5, fontWeight: 750 }}
      />

      {isQboLinked ? (
        <Chip
          size="small"
          label="QBO Linked"
          color="success"
          variant="outlined"
          sx={{ borderRadius: 1.5, fontWeight: 750 }}
        />
      ) : (
        <Chip
          size="small"
          label="DCFlow only"
          variant="outlined"
          icon={<BusinessRoundedIcon />}
          sx={{ borderRadius: 1.5, fontWeight: 650 }}
        />
      )}

      <Chip
        size="small"
        label={
          serviceAddressCount > 0
            ? `${serviceAddressCount} Service Location${serviceAddressCount === 1 ? "" : "s"}`
            : "Needs Service Address"
        }
        color={serviceAddressCount > 0 ? "primary" : "warning"}
        variant="outlined"
        icon={
          serviceAddressCount > 0 ? (
            <LocationOnRoundedIcon />
          ) : (
            <WarningAmberRoundedIcon />
          )
        }
        sx={{ borderRadius: 1.5, fontWeight: 700 }}
      />
    </Stack>
  );
}

function CustomerAvatar({
  customer,
  size = 42,
}: {
  customer: Customer;
  size?: number;
}) {
  const theme = useTheme();
  const initials = getCustomerInitials(customer);
  const hue = Math.abs(
    initials.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360,
  );

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        backgroundColor: `hsla(${hue}, 76%, 88%, 0.92)`,
        color:
          theme.palette.mode === "dark"
            ? "common.white"
            : `hsl(${hue}, 68%, 32%)`,
        fontSize: Math.max(12, Math.round(size * 0.36)),
        fontWeight: 900,
        letterSpacing: -0.5,
      }}
    >
      {initials}
    </Box>
  );
}

function RecentCustomerCard({
  customer,
  touchedAt,
  onOpen,
}: {
  customer: Customer;
  touchedAt?: string;
  onOpen: (customer: Customer) => void;
}) {
  const theme = useTheme();
  const displayAddress = getDisplayAddress(customer);

  return (
    <Card
      elevation={0}
      sx={{
        minWidth: { xs: 220, sm: 236 },
        maxWidth: 260,
        borderRadius: 1,
        border: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
        bgcolor: "background.paper",
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack spacing={1.2} sx={{ minHeight: 142 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={1}
          >
            <CustomerAvatar customer={customer} size={36} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {formatRelativeTime(touchedAt)}
            </Typography>
          </Stack>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 850,
                lineHeight: 1.15,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {customer.displayName || "Unnamed Customer"}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, fontWeight: 600 }}
            >
              {customer.phonePrimary || "No phone"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                mt: 0.15,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayAddress.city && displayAddress.state
                ? `${displayAddress.city}, ${displayAddress.state}`
                : displayAddress.line1 || "No service location"}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          <Button
            component={Link}
            href={`/customers/${customer.id}`}
            onClick={() => onOpen(customer)}
            size="small"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{
              alignSelf: "flex-start",
              borderRadius: 2,
              fontWeight: 800,
              px: 0,
            }}
          >
            Open
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function MobileCustomerCard({
  customer,
  onOpen,
}: {
  customer: Customer;
  onOpen: (customer: Customer) => void;
}) {
  const theme = useTheme();
  const displayAddress = getDisplayAddress(customer);

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
        bgcolor: "background.paper",
      }}
    >
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Stack spacing={1.3}>
          <Stack direction="row" spacing={1.2} alignItems="flex-start">
            <CustomerAvatar customer={customer} size={40} />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 850, lineHeight: 1.16 }}
              >
                {customer.displayName || "Unnamed Customer"}
              </Typography>
              <Box sx={{ mt: 0.8 }}>
                <StatusChips customer={customer} />
              </Box>
            </Box>

            <IconButton size="small" aria-label="Customer actions">
              <MoreVertRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack spacing={0.55}>
            <Stack direction="row" spacing={0.8} alignItems="center">
              <PhoneRoundedIcon
                sx={{ fontSize: 17, color: "text.secondary" }}
              />
              <Typography variant="body2" sx={{ fontWeight: 650 }}>
                {customer.phonePrimary || "No phone"}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={0.8} alignItems="flex-start">
              {displayAddress.hasServiceAddress ? (
                <LocationOnRoundedIcon
                  sx={{ fontSize: 17, mt: "2px", color: "text.secondary" }}
                />
              ) : (
                <WarningAmberRoundedIcon
                  sx={{ fontSize: 17, mt: "2px", color: "warning.main" }}
                />
              )}
              <Typography
                variant="body2"
                color={
                  displayAddress.hasServiceAddress
                    ? "text.secondary"
                    : "warning.main"
                }
                sx={{
                  fontWeight: displayAddress.hasServiceAddress ? 600 : 800,
                }}
              >
                {displayAddress.hasServiceAddress
                  ? [displayAddress.line1, displayAddress.line3]
                      .filter(Boolean)
                      .join(", ") || "Service location"
                  : "No service location saved"}
              </Typography>
            </Stack>
          </Stack>

          <Divider />

          <Stack direction="row" spacing={1} justifyContent="space-between">
            <Button
              component={Link}
              href={`/customers/${customer.id}`}
              onClick={() => onOpen(customer)}
              size="small"
              startIcon={<FolderOpenRoundedIcon />}
              sx={{ borderRadius: 2, fontWeight: 800 }}
            >
              Open
            </Button>
            <Button
              component={Link}
              href={`/customers/${customer.id}`}
              onClick={() => onOpen(customer)}
              size="small"
              startIcon={<AddRoundedIcon />}
              sx={{ borderRadius: 2, fontWeight: 800 }}
            >
              Create Ticket
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function DesktopCustomerRow({
  customer,
  onOpen,
}: {
  customer: Customer;
  onOpen: (customer: Customer) => void;
}) {
  const theme = useTheme();
  const displayAddress = getDisplayAddress(customer);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          md: "minmax(220px, 1.35fr) minmax(170px, 0.95fr) minmax(230px, 1.15fr) minmax(250px, 1.25fr) minmax(120px, 0.7fr) minmax(180px, 0.75fr)",
        },
        alignItems: "center",
        gap: 1.5,
        px: 1.75,
        py: 1.4,
        borderTop: `1px solid ${alpha(theme.palette.divider, 0.78)}`,
        "&:hover": {
          bgcolor: alpha(theme.palette.primary.main, 0.025),
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        alignItems="center"
        sx={{ minWidth: 0 }}
      >
        <CustomerAvatar customer={customer} size={42} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 850, lineHeight: 1.15 }}
            noWrap
          >
            {customer.displayName || "Unnamed Customer"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 650 }}
            noWrap
          >
            {customer.id}
          </Typography>
        </Box>
      </Stack>

      <StatusChips customer={customer} />

      <Stack spacing={0.35} sx={{ minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          sx={{ minWidth: 0 }}
        >
          <PhoneRoundedIcon
            sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
          />
          <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>
            {customer.phonePrimary || "—"}
          </Typography>
        </Stack>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          sx={{ minWidth: 0 }}
        >
          <MailOutlineRoundedIcon
            sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
            noWrap
          >
            {customer.email || "—"}
          </Typography>
        </Stack>
      </Stack>

      <Stack
        direction="row"
        spacing={0.8}
        alignItems="flex-start"
        sx={{ minWidth: 0 }}
      >
        {displayAddress.hasServiceAddress ? (
          <LocationOnRoundedIcon
            sx={{
              mt: "2px",
              fontSize: 16,
              color: "text.secondary",
              flexShrink: 0,
            }}
          />
        ) : (
          <WarningAmberRoundedIcon
            sx={{
              mt: "2px",
              fontSize: 16,
              color: "warning.main",
              flexShrink: 0,
            }}
          />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            color={
              displayAddress.hasServiceAddress ? "text.primary" : "warning.main"
            }
            sx={{ fontWeight: displayAddress.hasServiceAddress ? 750 : 850 }}
            noWrap
          >
            {displayAddress.hasServiceAddress
              ? displayAddress.line1 || "Service location"
              : "No service location saved"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
            noWrap
          >
            {displayAddress.hasServiceAddress
              ? displayAddress.line3 || "—"
              : "Add a service address"}
          </Typography>
        </Box>
      </Stack>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontWeight: 650 }}
        noWrap
      >
        {displayAddress.city && displayAddress.state
          ? `${displayAddress.city}, ${displayAddress.state}`
          : "—"}
      </Typography>

      <Stack
        direction="row"
        spacing={0.75}
        justifyContent="flex-end"
        alignItems="center"
      >
        <Button
          component={Link}
          href={`/customers/${customer.id}`}
          onClick={() => onOpen(customer)}
          size="small"
          sx={{ borderRadius: 2, fontWeight: 850 }}
        >
          Open
        </Button>
        <Button
          component={Link}
          href={`/customers/${customer.id}`}
          onClick={() => onOpen(customer)}
          size="small"
          sx={{ borderRadius: 2, fontWeight: 850 }}
        >
          Create Ticket
        </Button>
        <IconButton size="small" aria-label="More customer actions">
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}


type CustomerMetrics = {
  total: number | null;
  qboLinked: number | null;
};

function getMetricPercent(value: number | null, total: number | null) {
  if (value == null || total == null || total <= 0) return "—";
  return `${((value / total) * 100).toFixed(1)}% of total`;
}

function buildSearchTokens(queryText: string) {
  return normalizeSearchText(queryText)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 5);
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildCaseVariants(value: string) {
  const raw = String(value || "").trim();
  const variants = [raw, raw.toLowerCase(), raw.toUpperCase(), toTitleCase(raw)];

  return Array.from(new Set(variants.filter((item) => item.length >= MIN_SEARCH_CHARS))).slice(0, 4);
}

function customerMatchesLocalSearch(customer: Customer, normalizedQuery: string, queryDigits: string) {
  if (!normalizedQuery && !queryDigits) return true;

  const blob = buildCustomerSearchBlob(customer);
  if (normalizedQuery && blob.includes(normalizedQuery)) return true;

  if (queryDigits) {
    const customerDigits = [
      digitsOnly(customer.phonePrimary || ""),
      digitsOnly(customer.phoneSecondary || ""),
    ]
      .filter(Boolean)
      .join(" ");

    if (customerDigits.includes(queryDigits)) return true;
  }

  return false;
}

function customerPassesFilter(customer: Customer, selectedFilter: CustomerFilter) {
  const serviceAddressCount = getActiveServiceAddressCount(customer);
  const isQboLinked = Boolean(customer.quickbooksCustomerId);

  if (selectedFilter === "active") return customer.active !== false;
  if (selectedFilter === "needs_service_address") return serviceAddressCount === 0;
  if (selectedFilter === "multi_property") return serviceAddressCount > 1;
  if (selectedFilter === "qbo_linked") return isQboLinked;
  if (selectedFilter === "billing_only") return serviceAddressCount === 0;

  return true;
}

async function addCustomerQueryResults(
  target: Map<string, Customer>,
  q: ReturnType<typeof query>,
) {
  const snap = await getDocs(q);
  for (const docSnap of snap.docs) {
    const customer = mapCustomerDoc(docSnap);
    target.set(customer.id, customer);
  }
}

async function fetchFilterCustomers(selectedFilter: CustomerFilter) {
  if (selectedFilter === "all") return [] as Customer[];

  const customersRef = collection(db, "customers");
  const candidateMap = new Map<string, Customer>();
  const tasks: Array<Promise<void>> = [];

  function pushSafe(q: ReturnType<typeof query>) {
    tasks.push(addCustomerQueryResults(candidateMap, q).catch(() => undefined));
  }

  if (selectedFilter === "active") {
    pushSafe(
      query(
        customersRef,
        where("active", "==", true),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(customersRef, orderBy("displayName"), limit(CUSTOMER_FILTER_LIMIT)),
    );
  }

  if (selectedFilter === "qbo_linked") {
    pushSafe(
      query(
        customersRef,
        where("qboLinked", "==", true),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("quickbooksCustomerId", "!=", null),
        orderBy("quickbooksCustomerId"),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("qboCustomerId", "!=", null),
        orderBy("qboCustomerId"),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
  }

  if (selectedFilter === "multi_property") {
    pushSafe(
      query(
        customersRef,
        where("isMultiProperty", "==", true),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("activeServiceAddressCount", ">", 1),
        orderBy("activeServiceAddressCount"),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("serviceAddressCount", ">", 1),
        orderBy("serviceAddressCount"),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("serviceLocationCount", ">", 1),
        orderBy("serviceLocationCount"),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
  }

  if (selectedFilter === "needs_service_address") {
    pushSafe(
      query(
        customersRef,
        where("needsServiceAddress", "==", true),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
  }

  if (selectedFilter === "needs_service_address" || selectedFilter === "billing_only") {
    pushSafe(
      query(
        customersRef,
        where("activeServiceAddressCount", "==", 0),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("serviceAddressCount", "==", 0),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("serviceLocationCount", "==", 0),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("hasServiceAddress", "==", false),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("hasServiceLocation", "==", false),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
    pushSafe(
      query(
        customersRef,
        where("billingOnly", "==", true),
        limit(CUSTOMER_FILTER_LIMIT),
      ),
    );
  }

  await Promise.all(tasks);

  return Array.from(candidateMap.values())
    .filter((customer) => customerPassesFilter(customer, selectedFilter))
    .sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || "")),
    )
    .slice(0, CUSTOMER_FILTER_LIMIT);
}

export default function CustomersPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<CustomerFilter>("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [recentEntries, setRecentEntries] = useState<RecentCustomerEntry[]>([]);
  const [recentCustomerDocs, setRecentCustomerDocs] = useState<Customer[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metrics, setMetrics] = useState<CustomerMetrics>({
    total: null,
    qboLinked: null,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setRecentEntries(readRecentCustomerEntries());
  }, []);

  useEffect(() => {
    async function loadMetrics() {
      setMetricsLoading(true);

      try {
        const [totalSnap, qboSnap] = await Promise.all([
          getCountFromServer(collection(db, "customers")),
          getCountFromServer(
            query(collection(db, "customers"), where("qboLinked", "==", true)),
          ).catch(() => null),
        ]);

        setMetrics({
          total: totalSnap.data().count,
          qboLinked: qboSnap ? qboSnap.data().count : null,
        });
      } catch {
        setMetrics({ total: null, qboLinked: null });
      } finally {
        setMetricsLoading(false);
      }
    }

    loadMetrics();
  }, []);

  useEffect(() => {
    async function loadRecentCustomerDocs() {
      const recentIds = recentEntries
        .map((entry) => entry.customerId)
        .filter(Boolean)
        .slice(0, RECENT_CUSTOMER_LIMIT);

      if (recentIds.length === 0) {
        setRecentCustomerDocs([]);
        return;
      }

      try {
        const snap = await getDocs(
          query(collection(db, "customers"), where(documentId(), "in", recentIds)),
        );
        const byId = new Map(
          snap.docs.map((docSnap) => [docSnap.id, mapCustomerDoc(docSnap)]),
        );

        setRecentCustomerDocs(
          recentIds
            .map((id) => byId.get(id))
            .filter((item): item is Customer => Boolean(item)),
        );
      } catch {
        setRecentCustomerDocs([]);
      }
    }

    loadRecentCustomerDocs();
  }, [recentEntries]);

  const normalizedQuery = useMemo(
    () => normalizeSearchText(debouncedSearch),
    [debouncedSearch],
  );
  const queryDigits = useMemo(() => digitsOnly(normalizedQuery), [normalizedQuery]);
  const canSearch =
    normalizedQuery.length >= MIN_SEARCH_CHARS ||
    queryDigits.length >= MIN_SEARCH_CHARS;
  const filterOnlyMode = !canSearch && selectedFilter !== "all";
  const shouldShowResults = canSearch || filterOnlyMode;

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      if (!shouldShowResults) {
        setSearchResults([]);
        setSearchLoading(false);
        setError("");
        return;
      }

      setSearchLoading(true);
      setError("");

      try {
        if (filterOnlyMode) {
          const results = await fetchFilterCustomers(selectedFilter);
          if (!cancelled) setSearchResults(results);
          return;
        }

        const customersRef = collection(db, "customers");
        const tokens = buildSearchTokens(normalizedQuery);
        const candidateMap = new Map<string, Customer>();
        const rawSearch = debouncedSearch.trim();
        const rawSearchVariants = buildCaseVariants(rawSearch);

        async function addQuery(q: ReturnType<typeof query>) {
          await addCustomerQueryResults(candidateMap, q);
        }

        const searchTasks: Array<Promise<void>> = [];

        const rawPrefixFields = [
          "displayName",
          "customerDisplayName",
          "qboDisplayName",
          "phonePrimary",
          "phone",
          "email",
          "billingAddressLine1",
          "billAddrLine1",
          "billingCity",
          "billAddrCity",
          "billingPostalCode",
          "billAddrPostalCode",
        ];

        for (const field of rawPrefixFields) {
          for (const variant of rawSearchVariants) {
            searchTasks.push(
              addQuery(
                query(
                  customersRef,
                  orderBy(field),
                  startAt(variant),
                  endAt(`${variant}\uf8ff`),
                  limit(CUSTOMER_SEARCH_LIMIT),
                ),
              ).catch(() => undefined),
            );
          }
        }

        if (normalizedQuery) {
          searchTasks.push(
            addQuery(
              query(
                customersRef,
                orderBy("displayNameLower"),
                startAt(normalizedQuery),
                endAt(`${normalizedQuery}\uf8ff`),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );

          searchTasks.push(
            addQuery(
              query(
                customersRef,
                orderBy("customerDisplayNameLower"),
                startAt(normalizedQuery),
                endAt(`${normalizedQuery}\uf8ff`),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );

          searchTasks.push(
            addQuery(
              query(
                customersRef,
                orderBy("emailLower"),
                startAt(normalizedQuery),
                endAt(`${normalizedQuery}\uf8ff`),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );

          searchTasks.push(
            addQuery(
              query(
                customersRef,
                orderBy("billingAddressLine1Lower"),
                startAt(normalizedQuery),
                endAt(`${normalizedQuery}\uf8ff`),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );

          searchTasks.push(
            addQuery(
              query(
                customersRef,
                orderBy("billingCityLower"),
                startAt(normalizedQuery),
                endAt(`${normalizedQuery}\uf8ff`),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );

          searchTasks.push(
            addQuery(
              query(
                customersRef,
                orderBy("billingPostalCode"),
                startAt(normalizedQuery),
                endAt(`${normalizedQuery}\uf8ff`),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );

          for (const prefixField of [
            "searchPrefixes",
            "customerSearchPrefixes",
            "billingAddressSearchPrefixes",
            "serviceAddressSearchPrefixes",
          ]) {
            searchTasks.push(
              addQuery(
                query(
                  customersRef,
                  where(prefixField, "array-contains", normalizedQuery),
                  limit(CUSTOMER_SEARCH_LIMIT),
                ),
              ).catch(() => undefined),
            );
          }
        }

        for (const token of tokens) {
          for (const tokenField of [
            "searchTokens",
            "customerSearchTokens",
            "nameSearchTokens",
            "billingAddressSearchTokens",
            "serviceAddressSearchTokens",
            "emailSearchTokens",
          ]) {
            searchTasks.push(
              addQuery(
                query(
                  customersRef,
                  where(tokenField, "array-contains", token),
                  limit(CUSTOMER_SEARCH_LIMIT),
                ),
              ).catch(() => undefined),
            );
          }
        }

        if (queryDigits.length >= MIN_SEARCH_CHARS) {
          searchTasks.push(
            addQuery(
              query(
                customersRef,
                orderBy("phoneDigits"),
                startAt(queryDigits),
                endAt(`${queryDigits}\uf8ff`),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );

          searchTasks.push(
            addQuery(
              query(
                customersRef,
                where("phoneSearchTokens", "array-contains", queryDigits),
                limit(CUSTOMER_SEARCH_LIMIT),
              ),
            ).catch(() => undefined),
          );
        }

        await Promise.all(searchTasks);

        const results = Array.from(candidateMap.values())
          .filter((customer) =>
            customerMatchesLocalSearch(customer, normalizedQuery, queryDigits),
          )
          .filter((customer) => customerPassesFilter(customer, selectedFilter))
          .sort((a, b) =>
            String(a.displayName || "").localeCompare(String(b.displayName || "")),
          )
          .slice(0, CUSTOMER_SEARCH_LIMIT);

        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setSearchResults([]);
          setError(err instanceof Error ? err.message : "Customer search failed.");
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }

    runSearch();

    return () => {
      cancelled = true;
    };
  }, [
    shouldShowResults,
    filterOnlyMode,
    canSearch,
    normalizedQuery,
    queryDigits,
    selectedFilter,
    debouncedSearch,
  ]);

  const recentCustomers = useMemo(() => {
    return recentEntries
      .map((entry) => {
        const customer = recentCustomerDocs.find((item) => item.id === entry.customerId);
        if (!customer) return null;
        return { customer, touchedAt: entry.openedAt };
      })
      .filter(Boolean)
      .slice(0, RECENT_CUSTOMER_LIMIT) as Array<{
      customer: Customer;
      touchedAt: string;
    }>;
  }, [recentEntries, recentCustomerDocs]);

  function recordCustomerOpen(customer: Customer) {
    const entry: RecentCustomerEntry = {
      customerId: customer.id,
      openedAt: new Date().toISOString(),
    };

    setRecentEntries((prev) => {
      const next = [entry, ...prev.filter((item) => item.customerId !== customer.id)].slice(
        0,
        RECENT_CUSTOMER_LIMIT,
      );
      writeRecentCustomerEntries(next);
      return next;
    });

    setRecentCustomerDocs((prev) => [
      customer,
      ...prev.filter((item) => item.id !== customer.id),
    ].slice(0, RECENT_CUSTOMER_LIMIT));
  }

  const filterItems: Array<{ key: CustomerFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "needs_service_address", label: "Needs Service Address" },
    { key: "multi_property", label: "Multi-Property" },
    { key: "qbo_linked", label: "QBO Linked" },
    { key: "billing_only", label: "Billing-Only" },
  ];

  const activeFilterLabel =
    filterItems.find((item) => item.key === selectedFilter)?.label || "Filter";

  const resultCountLabel = shouldShowResults
    ? searchLoading
      ? filterOnlyMode
        ? `Loading ${activeFilterLabel}...`
        : "Searching..."
      : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
    : `Type ${MIN_SEARCH_CHARS}+ characters`;

  return (
    <ProtectedPage fallbackTitle="Customers">
      <AppShell appUser={appUser}>
        <Box
          sx={{
            width: "100%",
            maxWidth: 1480,
            mx: "auto",
            px: { xs: 1, sm: 2 },
            pb: { xs: 11, md: 4 },
          }}
        >
          <Stack spacing={2.5}>
            <Box sx={{ px: { xs: 0.25, md: 0.5 }, pt: { xs: 0.5, md: 0.75 } }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                justifyContent="space-between"
                alignItems={{ xs: "stretch", md: "center" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="h4"
                    sx={{
                      fontSize: { xs: "1.8rem", md: "2.15rem" },
                      lineHeight: 1.05,
                      fontWeight: 900,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    Customers
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.85,
                      color: "text.secondary",
                      fontSize: { xs: 13, md: 14 },
                      fontWeight: 550,
                      maxWidth: 860,
                    }}
                  >
                    Search by first name, last name, phone, email, billing address, or service location.
                  </Typography>
                </Box>

                <Button
                  component={Link}
                  href="/customers/new"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  sx={{
                    minHeight: 42,
                    borderRadius: 2,
                    fontWeight: 850,
                    whiteSpace: "nowrap",
                    display: { xs: "none", sm: "inline-flex" },
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
                  xs: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(4, minmax(0, 1fr))",
                },
                gap: 1.5,
              }}
            >
              <MetricCard
                icon={<PersonRoundedIcon fontSize="small" />}
                label="Total Customers"
                value={metricsLoading || metrics.total == null ? "—" : metrics.total}
                subtitle="All customer accounts"
                tone="primary"
              />
              <MetricCard
                icon={<QuickBooksIcon />}
                label="QBO Linked"
                value={metricsLoading || metrics.qboLinked == null ? "—" : metrics.qboLinked}
                subtitle={getMetricPercent(metrics.qboLinked, metrics.total)}
                tone="success"
              />
              <MetricCard
                icon={<SearchRoundedIcon fontSize="small" />}
                label="Search Mode"
                value={canSearch ? searchResults.length : "—"}
                subtitle="Results only load after search"
              />
              <MetricCard
                icon={<LocationOnRoundedIcon fontSize="small" />}
                label="Address Guard"
                value="On"
                subtitle="Service tickets require service address"
              />
            </Box>

            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.25}
                justifyContent="space-between"
                alignItems={{ xs: "stretch", md: "center" }}
              >
                <TextField
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, email, billing address, service address..."
                  autoComplete="off"
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
                    flex: 1,
                    maxWidth: { md: 760 },
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 1,
                      bgcolor: "background.paper",
                    },
                  }}
                />

                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent={{ xs: "space-between", md: "flex-end" }}
                >
                  <Chip
                    icon={<ManageSearchRoundedIcon />}
                    label={resultCountLabel}
                    sx={{ borderRadius: 999, fontWeight: 850 }}
                  />
                </Stack>
              </Stack>

              <Stack
                direction="row"
                spacing={0.75}
                useFlexGap
                flexWrap="wrap"
                sx={{
                  overflowX: { xs: "auto", sm: "visible" },
                  pb: { xs: 0.5, sm: 0 },
                }}
              >
                {filterItems.map((item) => (
                  <Chip
                    key={item.key}
                    label={item.label}
                    color={selectedFilter === item.key ? "primary" : "default"}
                    variant={selectedFilter === item.key ? "filled" : "outlined"}
                    onClick={() => setSelectedFilter(item.key)}
                    sx={{ borderRadius: 1.5, fontWeight: 800 }}
                  />
                ))}
              </Stack>
            </Stack>

            <Alert
              severity="info"
              sx={{ borderRadius: 1, display: { xs: "none", md: "flex" } }}
            >
              <strong>Search is the customer list.</strong>
              &nbsp;Type at least {MIN_SEARCH_CHARS} characters, or use a filter like Needs Service Address to populate a targeted list below. Service tickets still require a saved service location.
            </Alert>

            {error ? (
              <Alert severity="error" sx={{ borderRadius: 1 }}>
                {error}
              </Alert>
            ) : null}

            {recentCustomers.length > 0 ? (
              <SectionSurface>
                <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
                  <Stack spacing={1.5}>
                    <Stack
                      direction="row"
                      spacing={1}
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}
                        >
                          Recent Customers
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            fontWeight: 600,
                            display: { xs: "none", sm: "block" },
                          }}
                        >
                          Last 5 customer accounts opened on this device.
                        </Typography>
                      </Box>
                    </Stack>

                    <Box
                      sx={{
                        display: "flex",
                        gap: 1.25,
                        overflowX: "auto",
                        pb: 0.5,
                        scrollSnapType: "x proximity",
                        "& > *": { scrollSnapAlign: "start" },
                      }}
                    >
                      {recentCustomers.map((item) => (
                        <RecentCustomerCard
                          key={item.customer.id}
                          customer={item.customer}
                          touchedAt={item.touchedAt}
                          onOpen={recordCustomerOpen}
                        />
                      ))}
                    </Box>
                  </Stack>
                </Box>
              </SectionSurface>
            ) : null}

            {!shouldShowResults ? (
              <EmptyState
                icon={<SearchRoundedIcon sx={{ fontSize: 32 }} />}
                title="Search for a customer or choose a filter"
                description="No full customer list is loaded here. Search by first name, last name, phone number, email, billing address, or service location. You can also tap filters like Needs Service Address to populate a focused list below."
              />
            ) : null}

            {searchLoading ? (
              <Stack spacing={1.25}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <LoadingRow key={index} />
                ))}
              </Stack>
            ) : null}

            {!searchLoading && shouldShowResults && searchResults.length === 0 ? (
              <EmptyState
                icon={<ManageSearchRoundedIcon sx={{ fontSize: 32 }} />}
                title={filterOnlyMode ? `No ${activeFilterLabel} customers found` : "No matching customers"}
                description={
                  filterOnlyMode
                    ? "This filter uses lightweight indexed customer fields so the full customer list does not have to load. If this looks wrong, the customer search/filter index may need a backfill."
                    : "Try another spelling, phone number, email address, billing address, or service location. Service-address searching requires the customer search index fields to be populated."
                }
              />
            ) : null}

            {!searchLoading && shouldShowResults && searchResults.length > 0 ? (
              <>
                <Box sx={{ display: { xs: "block", md: "none" } }}>
                  <Stack spacing={1.25}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                      {filterOnlyMode ? activeFilterLabel : "Search Results"}
                    </Typography>
                    {searchResults.map((customer) => (
                      <MobileCustomerCard
                        key={customer.id}
                        customer={customer}
                        onOpen={recordCustomerOpen}
                      />
                    ))}
                  </Stack>
                </Box>

                <SectionSurface>
                  <Box sx={{ display: { xs: "none", md: "block" } }}>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(220px, 1.35fr) minmax(170px, 0.95fr) minmax(230px, 1.15fr) minmax(250px, 1.25fr) minmax(120px, 0.7fr) minmax(180px, 0.75fr)",
                        gap: 1.5,
                        px: 1.75,
                        py: 1.25,
                        bgcolor: alpha(theme.palette.text.primary, 0.025),
                      }}
                    >
                      {[
                        "Customer",
                        "Status",
                        "Contact",
                        "Primary Service Location",
                        "City / State",
                        "Actions",
                      ].map((label) => (
                        <Typography
                          key={label}
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            fontWeight: 900,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                          }}
                        >
                          {label}
                        </Typography>
                      ))}
                    </Box>

                    {searchResults.map((customer) => (
                      <DesktopCustomerRow
                        key={customer.id}
                        customer={customer}
                        onOpen={recordCustomerOpen}
                      />
                    ))}
                  </Box>
                </SectionSurface>
              </>
            ) : null}
          </Stack>
        </Box>

        <Paper
          elevation={8}
          sx={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 10,
            borderRadius: 3,
            overflow: "hidden",
            display: { xs: "block", sm: "none" },
          }}
        >
          <Button
            component={Link}
            href="/customers/new"
            variant="contained"
            fullWidth
            startIcon={<AddRoundedIcon />}
            sx={{ borderRadius: 0, minHeight: 54, fontWeight: 900 }}
          >
            New Customer
          </Button>
        </Paper>
      </AppShell>
    </ProtectedPage>
  );
}
