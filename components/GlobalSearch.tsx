// components/Globalsearch.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  ListItemButton,
  Paper,
  Popper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import KeyboardCommandKeyRoundedIcon from "@mui/icons-material/KeyboardCommandKeyRounded";
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "../src/lib/firebase";

type GlobalSearchResultType = "project" | "customer" | "serviceTicket";

type GlobalSearchResult = {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string;
  statusLabel?: string;
  href: string;
  searchableText: string;
  sortMs?: number;
};

type LoadedSearchRow = {
  id: string;
  data: DocumentData;
};

const MAX_RESULTS_PER_GROUP = 6;
const MIN_QUERY_LENGTH = 2;

function safeTrim(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSearchText(value: unknown) {
  return safeTrim(value).toLowerCase();
}

function parseSearchDateMs(value: unknown) {
  if (!value) return 0;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    const ms = new Date(trimmed).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    const date = (value as any).toDate();
    const ms = date instanceof Date ? date.getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  return 0;
}

function getBestServiceTicketSortMs(data: DocumentData) {
  return (
    parseSearchDateMs(data.createdAt) ||
    parseSearchDateMs(data.createdDate) ||
    parseSearchDateMs(data.openedAt) ||
    parseSearchDateMs(data.ticketDate) ||
    parseSearchDateMs(data.dateCreated) ||
    parseSearchDateMs(data.updatedAt) ||
    parseSearchDateMs(data.lastUpdatedAt) ||
    0
  );
}

function formatProjectType(value: unknown) {
  const raw = normalizeSearchText(value);

  if (!raw) return "";
  if (raw === "new_construction") return "New Construction";
  if (raw === "remodel") return "Remodel";
  if (
    raw === "time_materials" ||
    raw === "time+materials" ||
    raw === "time_and_materials"
  ) {
    return "Time + Materials";
  }

  return safeTrim(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatus(value: unknown) {
  const raw = normalizeSearchText(value);

  if (!raw) return "";
  if (raw === "ready_to_bill") return "Ready to Bill";
  if (raw === "follow_up") return "Follow Up";
  if (raw === "in_progress") return "In Progress";
  if (raw === "not_started") return "Not Started";
  if (raw === "completed") return "Complete";
  if (raw === "complete") return "Complete";
  if (raw === "invoiced") return "Invoiced";
  if (raw === "new") return "New";
  if (raw === "open") return "Open";
  if (raw === "active") return "Active";
  if (raw === "inactive") return "Inactive";

  return safeTrim(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactJoin(parts: Array<string | null | undefined>, separator = " • ") {
  return parts.map(safeTrim).filter(Boolean).join(separator);
}

function resultTypeLabel(type: GlobalSearchResultType) {
  if (type === "project") return "Project";
  if (type === "customer") return "Customer";
  return "Ticket";
}

function resultGroupTitle(type: GlobalSearchResultType) {
  if (type === "project") return "Projects";
  if (type === "customer") return "Customers";
  return "Service Tickets";
}

function getBillingStatus(data: DocumentData) {
  return (
    safeTrim(data?.billing?.status) ||
    safeTrim(data?.billingStatus) ||
    safeTrim(data?.status)
  );
}

function getResultIcon(type: GlobalSearchResultType) {
  if (type === "project") return <FolderRoundedIcon fontSize="small" />;
  if (type === "customer") return <PeopleAltRoundedIcon fontSize="small" />;
  return <ReceiptLongRoundedIcon fontSize="small" />;
}

function buildProjectResult(id: string, data: DocumentData): GlobalSearchResult {
  const projectName = safeTrim(data.projectName) || "Unnamed Project";
  const customerName = safeTrim(data.customerDisplayName);
  const projectType = formatProjectType(data.projectType);

  const status = formatStatus(
    safeTrim(data.bidStatus) ||
      safeTrim(data.status) ||
      (data.active === false ? "Complete" : "Open")
  );

  const serviceAddress = compactJoin(
    [
      data.serviceAddressLine1,
      data.serviceCity,
      data.serviceState,
      data.servicePostalCode,
    ],
    ", "
  );

  const subtitle = compactJoin([customerName, projectType, serviceAddress]);

  const searchableText = [
    id,
    projectName,
    customerName,
    projectType,
    status,
    data.customerId,
    data.serviceAddressLabel,
    data.serviceAddressLine1,
    data.serviceAddressLine2,
    data.serviceCity,
    data.serviceState,
    data.servicePostalCode,
    data.description,
    data.internalNotes,
  ]
    .map(safeTrim)
    .filter(Boolean)
    .join(" ");

  return {
    id,
    type: "project",
    title: projectName,
    subtitle: subtitle || "Project",
    statusLabel: status || undefined,
    href: `/projects/${id}`,
    searchableText,
  };
}

function buildCustomerResult(id: string, data: DocumentData): GlobalSearchResult {
  const displayName =
    safeTrim(data.displayName) ||
    safeTrim(data.customerDisplayName) ||
    safeTrim(data.qboDisplayName) ||
    "Unnamed Customer";

  const billCity = safeTrim(data.billAddrCity);
  const billState = safeTrim(data.billAddrState);
  const phone = safeTrim(data.phone);
  const email = safeTrim(data.email);

  const subtitle = compactJoin([
    compactJoin([billCity, billState], ", "),
    phone,
    email,
  ]);

  const searchableText = [
    id,
    displayName,
    data.customerDisplayName,
    data.qboDisplayName,
    data.qboCustomerId,
    data.realId,
    data.phone,
    data.email,
    data.billAddrLine1,
    data.billAddrLine2,
    data.billAddrCity,
    data.billAddrState,
    data.billAddrPostalCode,
    data.shipAddrLine1,
    data.shipAddrLine2,
    data.shipAddrCity,
    data.shipAddrState,
    data.shipAddrPostalCode,
  ]
    .map(safeTrim)
    .filter(Boolean)
    .join(" ");

  return {
    id,
    type: "customer",
    title: displayName,
    subtitle: subtitle || "Customer",
    statusLabel: data.active === false ? "Inactive" : "Active",
    href: `/customers/${id}`,
    searchableText,
  };
}

function buildServiceTicketResult(
  id: string,
  data: DocumentData
): GlobalSearchResult {
  const customerName = safeTrim(data.customerDisplayName) || "Service Ticket";
  const issueSummary =
    safeTrim(data.issueSummary) ||
    safeTrim(data.issueDetails) ||
    "No issue summary";

  const status = formatStatus(getBillingStatus(data));

  const address = compactJoin(
    [
      data.serviceAddressLine1,
      data.serviceCity,
      data.serviceState,
      data.servicePostalCode,
    ],
    ", "
  );

  const subtitle = compactJoin([issueSummary, address]);

  const searchableText = [
    id,
    customerName,
    issueSummary,
    data.issueDetails,
    data.internalNotes,
    data.customerId,
    data.assignedTechnicianName,
    data.primaryTechnicianName,
    data.secondaryTechnicianName,
    data.serviceAddressLabel,
    data.serviceAddressLine1,
    data.serviceAddressLine2,
    data.serviceCity,
    data.serviceState,
    data.servicePostalCode,
    getBillingStatus(data),
    data.status,
  ]
    .map(safeTrim)
    .filter(Boolean)
    .join(" ");

return {
  id,
  type: "serviceTicket",
  title: customerName,
  subtitle: subtitle || "Service Ticket",
  statusLabel: status || undefined,
  href: `/service-tickets/${id}`,
  searchableText,
  sortMs: getBestServiceTicketSortMs(data),
};
}

function matchesSearch(result: GlobalSearchResult, search: string) {
  const haystack = normalizeSearchText(result.searchableText);
  const needle = normalizeSearchText(search);

  if (!needle) return false;

  const words = needle.split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word));
}

function scoreResult(result: GlobalSearchResult, search: string) {
  const needle = normalizeSearchText(search);
  const title = normalizeSearchText(result.title);
  const subtitle = normalizeSearchText(result.subtitle);
  const id = normalizeSearchText(result.id);

  if (title === needle) return 100;
  if (id === needle) return 96;
  if (title.startsWith(needle)) return 92;
  if (id.startsWith(needle)) return 88;
  if (title.includes(needle)) return 78;
  if (subtitle.includes(needle)) return 64;

  return 25;
}

async function loadCollectionInPages(
  collectionName: string,
  pageSize: number,
  maxDocs: number
): Promise<LoadedSearchRow[]> {
  const rows: LoadedSearchRow[] = [];
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

  while (rows.length < maxDocs) {
    const remaining = maxDocs - rows.length;
    const batchSize = Math.min(pageSize, remaining);

    let qRef: Query<DocumentData>;

    if (lastDoc) {
      qRef = query(
        collection(db, collectionName),
        orderBy(documentId()),
        startAfter(lastDoc),
        limit(batchSize)
      );
    } else {
      qRef = query(
        collection(db, collectionName),
        orderBy(documentId()),
        limit(batchSize)
      );
    }

    const snap: QuerySnapshot<DocumentData> = await getDocs(qRef);

    if (snap.empty) break;

    snap.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      rows.push({
        id: docSnap.id,
        data: docSnap.data(),
      });
    });

    const nextLastDoc = snap.docs[snap.docs.length - 1];

    if (!nextLastDoc) break;

    lastDoc = nextLastDoc;

    if (snap.size < batchSize) break;
  }

  return rows;
}

async function loadGlobalSearchResults() {
  const [projectRows, customerRows, ticketRows] = await Promise.all([
    loadCollectionInPages("projects", 500, 1500),
    loadCollectionInPages("customers", 500, 10000),
    loadCollectionInPages("serviceTickets", 500, 3000),
  ]);

  const projects = projectRows.map((row) => buildProjectResult(row.id, row.data));
  const customers = customerRows.map((row) =>
    buildCustomerResult(row.id, row.data)
  );
  const serviceTickets = ticketRows.map((row) =>
    buildServiceTicketResult(row.id, row.data)
  );

  return [...projects, ...customers, ...serviceTickets];
}

export default function GlobalSearch() {
  const router = useRouter();
  const theme = useTheme();

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allResults, setAllResults] = useState<GlobalSearchResult[]>([]);
  const [loadError, setLoadError] = useState("");

  const trimmedInput = inputValue.trim();
  const canSearch = trimmedInput.length >= MIN_QUERY_LENGTH;
  const hasLoadedResults = allResults.length > 0;

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const isSearchShortcut = key === "k" && (event.ctrlKey || event.metaKey);

      if (!isSearchShortcut) return;

      event.preventDefault();
      inputRef.current?.focus();
      setFocused(true);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!focused && !canSearch) return;
      if (hasLoadedResults) return;

      setLoading(true);
      setLoadError("");

      try {
        const results = await loadGlobalSearchResults();

        if (!cancelled) {
          setAllResults(results);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load search results."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [focused, canSearch, hasLoadedResults]);

  const groupedResults = useMemo(() => {
    if (!canSearch) {
      return {
        projects: [],
        customers: [],
        serviceTickets: [],
        total: 0,
      };
    }

const matches = allResults
  .filter((result) => matchesSearch(result, trimmedInput))
  .sort((a, b) => {
    const scoreDiff = scoreResult(b, trimmedInput) - scoreResult(a, trimmedInput);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    if (a.type === "serviceTicket" && b.type === "serviceTicket") {
      return (b.sortMs || 0) - (a.sortMs || 0);
    }

    return 0;
  });

    const projects = matches
      .filter((result) => result.type === "project")
      .slice(0, MAX_RESULTS_PER_GROUP);

    const customers = matches
      .filter((result) => result.type === "customer")
      .slice(0, MAX_RESULTS_PER_GROUP);

    const serviceTickets = matches
      .filter((result) => result.type === "serviceTicket")
      .slice(0, MAX_RESULTS_PER_GROUP);

    return {
      projects,
      customers,
      serviceTickets,
      total: projects.length + customers.length + serviceTickets.length,
    };
  }, [allResults, canSearch, trimmedInput]);

  const popperOpen =
    focused && (canSearch || loading || Boolean(loadError) || inputValue.length > 0);

  const helperLabel = useMemo(() => {
    if (loading) return "Loading";
    if (loadError) return "Needs attention";
    if (hasLoadedResults) return `${allResults.length.toLocaleString()} records`;
    return "Ctrl K";
  }, [allResults.length, hasLoadedResults, loadError, loading]);

  function handleNavigate(result: GlobalSearchResult) {
    setInputValue("");
    setFocused(false);
    router.push(result.href);
  }

  function clearSearch() {
    setInputValue("");
    inputRef.current?.focus();
    setFocused(true);
  }

  function renderTypeChip(result: GlobalSearchResult) {
    return (
      <Chip
        size="small"
        label={resultTypeLabel(result.type)}
        variant="outlined"
        sx={{
          height: 22,
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          flexShrink: 0,
          borderColor: alpha(theme.palette.primary.main, 0.24),
          color: "primary.main",
          backgroundColor: alpha(theme.palette.primary.main, 0.045),
        }}
      />
    );
  }

  function renderStatusChip(result: GlobalSearchResult) {
    if (!result.statusLabel) return null;

    const normalized = normalizeSearchText(result.statusLabel);
    const isAttention =
      normalized.includes("ready") ||
      normalized.includes("follow") ||
      normalized.includes("new");

    return (
      <Chip
        size="small"
        label={result.statusLabel}
        sx={{
          height: 22,
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          flexShrink: 0,
          backgroundColor: isAttention
            ? alpha(theme.palette.warning.main, 0.12)
            : alpha(theme.palette.text.primary, 0.055),
          color: isAttention ? "warning.main" : "text.secondary",
        }}
      />
    );
  }

  function renderResult(result: GlobalSearchResult) {
    return (
      <ListItemButton
        key={`${result.type}-${result.id}`}
        onMouseDown={(event) => {
          event.preventDefault();
          handleNavigate(result);
        }}
        sx={{
          borderRadius: 1,
          px: 1.25,
          py: 1,
          alignItems: "center",
          gap: 1.25,
          transition: theme.transitions.create(["background-color", "transform"], {
            duration: theme.transitions.duration.shortest,
          }),
          "&:hover": {
            backgroundColor: alpha(theme.palette.primary.main, 0.075),
          },
          "&:active": {
            transform: "scale(0.995)",
          },
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2.5,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            color: "primary.main",
            backgroundColor: alpha(theme.palette.primary.main, 0.11),
          }}
        >
          {getResultIcon(result.type)}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            minWidth={0}
            sx={{ mb: 0.25 }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 850,
                minWidth: 0,
                letterSpacing: "-0.01em",
              }}
              noWrap
            >
              {result.title}
            </Typography>

            {renderTypeChip(result)}
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              lineHeight: 1.35,
            }}
            noWrap
          >
            {result.subtitle}
          </Typography>
        </Box>

        {renderStatusChip(result)}

        <ArrowOutwardRoundedIcon
          fontSize="small"
          sx={{
            color: "text.disabled",
            flexShrink: 0,
          }}
        />
      </ListItemButton>
    );
  }

  function renderGroup(type: GlobalSearchResultType, results: GlobalSearchResult[]) {
    if (!results.length) return null;

    return (
      <Box>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ px: 1.25, pb: 0.75 }}
        >
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: 0.65,
            }}
          >
            {resultGroupTitle(type)}
          </Typography>

          <Chip
            size="small"
            label={results.length}
            sx={{
              height: 18,
              minWidth: 18,
              fontSize: 10,
              fontWeight: 900,
              color: "text.secondary",
              backgroundColor: alpha(theme.palette.text.primary, 0.06),
            }}
          />
        </Stack>

        <Stack spacing={0.25}>{results.map(renderResult)}</Stack>
      </Box>
    );
  }

  return (
    <Box ref={anchorRef} sx={{ width: "100%", maxWidth: 680 }}>
      <Paper
        elevation={0}
        sx={{
          height: 48,
          px: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderRadius: 999,
border: `1px solid ${
  focused || popperOpen
    ? alpha(theme.palette.primary.main, 0.58)
    : theme.palette.mode === "dark"
      ? alpha("#FFFFFF", 0.10)
      : alpha(theme.palette.divider, 0.72)
}`,
          backgroundColor:
            theme.palette.mode === "dark"
              ? alpha(theme.palette.common.white, 0.055)
              : alpha(theme.palette.common.white, 0.92),
          boxShadow:
  focused || popperOpen
    ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`
    : theme.palette.mode === "dark"
      ? `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.04)}`
      : `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.78)}`,
          transition: theme.transitions.create([
            "box-shadow",
            "border-color",
            "background-color",
          ]),
          "&:hover": {
            borderColor: alpha(theme.palette.primary.main, 0.26),
            backgroundColor:
              theme.palette.mode === "dark"
                ? alpha(theme.palette.common.white, 0.07)
                : theme.palette.common.white,
          },
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
color: focused || popperOpen ? "primary.main" : "text.secondary",
backgroundColor:
  focused || popperOpen
    ? alpha(theme.palette.primary.main, 0.1)
    : "transparent",
            transition: theme.transitions.create(["background-color", "color"]),
          }}
        >
          <SearchRoundedIcon fontSize="small" />
        </Box>

        <InputBase
          inputRef={inputRef}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 120);
          }}
          placeholder="Search projects, customers, tickets..."
          inputProps={{
            "aria-label": "Search projects, customers, and service tickets",
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 600,
            "& input::placeholder": {
              color: "text.secondary",
              opacity: 0.82,
              fontWeight: 500,
            },
          }}
        />

        {loading ? (
          <CircularProgress size={18} />
        ) : inputValue ? (
          <Tooltip title="Clear search">
            <IconButton
              size="small"
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSearch}
              sx={{
                width: 30,
                height: 30,
                color: "text.secondary",
              }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Chip
            size="small"
            icon={
              helperLabel === "Ctrl K" ? (
                <KeyboardCommandKeyRoundedIcon sx={{ fontSize: 14 }} />
              ) : undefined
            }
            label={helperLabel}
            sx={{
              height: 26,
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              color: loadError ? "error.main" : "text.secondary",
              backgroundColor: loadError
                ? alpha(theme.palette.error.main, 0.1)
                : alpha(theme.palette.text.primary, 0.06),
              "& .MuiChip-icon": {
                color: "text.secondary",
                ml: 0.75,
              },
            }}
          />
        )}
      </Paper>

      <Popper
        open={popperOpen}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        sx={{
          zIndex: theme.zIndex.modal + 1,
          width: anchorRef.current?.offsetWidth || 680,
          pt: 1.25,
        }}
      >
<Paper
  elevation={0}
  sx={{
    borderRadius: 1,
    overflow: "hidden",
    border: `1px solid ${
      theme.palette.mode === "dark"
        ? alpha("#FFFFFF", 0.12)
        : alpha(theme.palette.divider, 0.8)
    }`,
    backgroundColor:
      theme.palette.mode === "dark"
        ? alpha(theme.palette.background.paper, 0.98)
        : theme.palette.background.paper,
    backgroundImage:
      theme.palette.mode === "dark"
        ? `
          linear-gradient(180deg, ${alpha("#FFFFFF", 0.075)} 0%, ${alpha(
            "#FFFFFF",
            0.025
          )} 100%),
          radial-gradient(circle at top left, ${alpha(
            theme.palette.primary.main,
            0.16
          )} 0%, transparent 34%)
        `
        : `
          linear-gradient(180deg, ${alpha("#FFFFFF", 0.98)} 0%, ${alpha(
            "#FFFFFF",
            0.88
          )} 100%),
          radial-gradient(circle at top left, ${alpha(
            theme.palette.primary.main,
            0.08
          )} 0%, transparent 34%)
        `,
    boxShadow:
      theme.palette.mode === "dark"
        ? [
            `0 28px 80px ${alpha("#000000", 0.62)}`,
            `0 12px 28px ${alpha("#000000", 0.48)}`,
            `0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}`,
          ].join(", ")
        : [
            `0 28px 80px ${alpha("#000000", 0.18)}`,
            `0 12px 28px ${alpha("#000000", 0.12)}`,
            `0 0 0 1px ${alpha(theme.palette.primary.main, 0.05)}`,
          ].join(", "),
  }}
>
          <Box
            sx={{
              px: 1.5,
              py: 1.25,
borderBottom: `1px solid ${
  theme.palette.mode === "dark"
    ? alpha("#FFFFFF", 0.08)
    : alpha(theme.palette.divider, 0.72)
}`,
backgroundColor:
  theme.palette.mode === "dark"
    ? alpha(theme.palette.primary.main, 0.075)
    : alpha(theme.palette.primary.main, 0.035),
              }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 900,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Global Search
                </Typography>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.1 }}
                  noWrap
                >
                  Projects, customers, and service tickets
                </Typography>
              </Box>

              <Chip
                size="small"
                label={canSearch ? trimmedInput : "Type 2+ characters"}
                sx={{
                  maxWidth: 220,
                  height: 24,
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "text.secondary",
                  backgroundColor: alpha(theme.palette.text.primary, 0.06),
                }}
              />
            </Stack>
          </Box>

          <Box sx={{ p: 1, maxHeight: 560, overflow: "auto" }}>
            {!canSearch ? (
              <Box sx={{ px: 1.25, py: 2.5 }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 3,
                      display: "grid",
                      placeItems: "center",
                      color: "primary.main",
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    }}
                  >
                    <SearchRoundedIcon />
                  </Box>

                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>
                      Search across DCFlow
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Try a customer name, address, project, ticket issue, or record ID.
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ) : loading ? (
              <Stack
                direction="row"
                spacing={1.25}
                alignItems="center"
                sx={{ px: 1.25, py: 2.5 }}
              >
                <CircularProgress size={20} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 900 }}>
                    Loading searchable records
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Pulling projects, customers, and service tickets...
                  </Typography>
                </Box>
              </Stack>
            ) : loadError ? (
              <Box sx={{ px: 1.25, py: 2.5 }}>
                <Typography variant="body2" color="error" sx={{ fontWeight: 900 }}>
                  Search could not load
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {loadError}
                </Typography>
              </Box>
            ) : groupedResults.total < 1 ? (
              <Box sx={{ px: 1.25, py: 2.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>
                  No results found
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Try another customer name, project, address, ticket issue, or record ID.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={1.25}>
                {renderGroup("project", groupedResults.projects)}

                {groupedResults.projects.length > 0 &&
                (groupedResults.customers.length > 0 ||
                  groupedResults.serviceTickets.length > 0) ? (
                  <Divider />
                ) : null}

                {renderGroup("customer", groupedResults.customers)}

                {groupedResults.customers.length > 0 &&
                groupedResults.serviceTickets.length > 0 ? (
                  <Divider />
                ) : null}

                {renderGroup("serviceTicket", groupedResults.serviceTickets)}
              </Stack>
            )}
          </Box>
        </Paper>
      </Popper>
    </Box>
  );
}