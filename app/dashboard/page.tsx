// app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import PauseCircleRoundedIcon from "@mui/icons-material/PauseCircleRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import PlumbingRoundedIcon from "@mui/icons-material/PlumbingRounded";
import AppShell from "../../components/AppShell";
import ProtectedPage from "../../components/ProtectedPage";
import { useAuthContext } from "../../src/context/auth-context";
import { db } from "../../src/lib/firebase";

type DashboardTicketItem = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
  serviceAddressLine1?: string;
  serviceCity?: string;
  serviceState?: string;
  updatedAt?: string | null;
  assignedTechnicianName?: string;
  assignedHelperName?: string;
  readyToBillAt?: string | null;
  status?: string;
};

type TripCrew = {
  primaryTechUid?: string | null;
  primaryTechName?: string | null;
  helperUid?: string | null;
  helperName?: string | null;
  secondaryTechUid?: string | null;
  secondaryTechName?: string | null;
  secondaryHelperUid?: string | null;
  secondaryHelperName?: string | null;
};

type TripLink = {
  serviceTicketId?: string | null;
  projectId?: string | null;
  projectStageKey?: string | null;
};

type TripDocLite = {
  id: string;
  active?: boolean | null;
  type?: "service" | "project" | string;
  status?: string | null;
  timerState?: string | null;
  date?: string;
  timeWindow?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  updatedAt?: string | null;
  crew?: TripCrew | null;
  link?: TripLink | null;
};

type ActiveWorkItem = {
  id: string;
  tripId: string;
  itemType: "service" | "project";
  href: string;
  title: string;
  subtitle: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  updatedAt?: string | null;
  status?: string | null;
  timerState?: string | null;
  assignedTechnicianName?: string;
  assignedHelperName?: string;
  secondaryTechnicianName?: string;
  secondaryHelperName?: string;
};

type MarkerEntry = {
  marker: any;
  item: ActiveWorkItem;
  address: string;
  infoHtml: string;
};

declare global {
  interface Window {
    google?: any;
    __dcflowGoogleMapsPromise?: Promise<any>;
  }
}

function safeTrim(x: unknown) {
  return String(x ?? "").trim();
}

function normalizeStatus(status?: string | null) {
  return safeTrim(status).toLowerCase();
}

function todayIsoLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasMappableAddress(item: ActiveWorkItem) {
  return Boolean(buildAddress(item));
}

function hasAssignedCrew(item: ActiveWorkItem) {
  return Boolean(buildAssignedPeople(item));
}

function isFieldVisibleStatus(status?: string | null, timerState?: string | null) {
  const normalized = normalizeStatus(status);
  const normalizedTimer = normalizeStatus(timerState);

  return (
    [
      "in_progress",
      "paused",
      "dispatched",
      "assigned",
      "on_site",
    ].includes(normalized) ||
    ["running", "paused"].includes(normalizedTimer)
  );
}

function isFieldVisibleItem(item: ActiveWorkItem) {
  return isFieldVisibleStatus(item.status, item.timerState) && hasAssignedCrew(item) && hasMappableAddress(item);
}

function formatWhen(value?: string | null) {
  const raw = safeTrim(value);
  if (!raw) return "—";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ticketSort(a: DashboardTicketItem, b: DashboardTicketItem) {
  const aTs = safeTrim(a.readyToBillAt || a.updatedAt);
  const bTs = safeTrim(b.readyToBillAt || b.updatedAt);
  return bTs.localeCompare(aTs);
}

function statusSort(a: ActiveWorkItem, b: ActiveWorkItem) {
  const aTs = safeTrim(a.updatedAt);
  const bTs = safeTrim(b.updatedAt);
  return bTs.localeCompare(aTs);
}

function buildAddress(item: {
  addressLine1?: string;
  city?: string;
  state?: string;
}) {
  return [safeTrim(item.addressLine1), safeTrim(item.city), safeTrim(item.state)]
    .filter(Boolean)
    .join(", ");
}

function buildAssignedPeople(item: {
  assignedTechnicianName?: string;
  assignedHelperName?: string;
  secondaryTechnicianName?: string;
  secondaryHelperName?: string;
}) {
  return [
    safeTrim(item.assignedTechnicianName),
    safeTrim(item.assignedHelperName),
    safeTrim(item.secondaryTechnicianName),
    safeTrim(item.secondaryHelperName),
  ]
    .filter(Boolean)
    .join(" + ");
}

function buildStaticMapUrl(items: ActiveWorkItem[]) {
  const apiKey = safeTrim(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  if (!apiKey) return "";

  const addresses = items
    .filter(isFieldVisibleItem)
    .map((item) => buildAddress(item))
    .filter(Boolean)
    .slice(0, 6);

  if (addresses.length === 0) return "";

  const base = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams();

  params.set("size", "1400x320");
  params.set("scale", "2");
  params.set("maptype", "roadmap");

  if (addresses.length === 1) {
    params.set("center", addresses[0]);
    params.set("zoom", "11");
  } else {
    addresses.forEach((address) => {
      params.append("visible", address);
    });

    addresses.forEach((address, index) => {
      const label = String(index + 1);
      params.append("markers", `size:small|color:0x1a73e8|label:${label}|${address}`);
    });

    params.set("key", apiKey);
    return `${base}?${params.toString()}`;
  }

  addresses.forEach((address, index) => {
    const label = String(index + 1);
    params.append("markers", `size:mid|color:0x1a73e8|label:${label}|${address}`);
  });

  params.set("key", apiKey);

  return `${base}?${params.toString()}`;
}

function loadGoogleMapsApi(apiKey: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser."));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (window.__dcflowGoogleMapsPromise) {
    return window.__dcflowGoogleMapsPromise;
  }

  window.__dcflowGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps="dcflow"]') as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps failed to initialize."));
      });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "dcflow";

    script.onload = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps failed to initialize."));
    };

    script.onerror = () => reject(new Error("Google Maps script failed to load."));
    document.head.appendChild(script);
  });

  return window.__dcflowGoogleMapsPromise;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function SectionCard({
  title,
  subtitle,
  icon,
  count,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  accent: "primary" | "warning" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1.2,
        border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: "background.paper",
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
        <Stack spacing={2}>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={2}
          >
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={(theme) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor:
                    accent === "warning"
                      ? alpha(theme.palette.warning.main, 0.14)
                      : accent === "primary"
                      ? alpha(theme.palette.primary.main, 0.14)
                      : alpha(theme.palette.text.primary, 0.08),
                  color:
                    accent === "warning"
                      ? theme.palette.warning.main
                      : accent === "primary"
                      ? theme.palette.primary.main
                      : theme.palette.text.primary,
                })}
              >
                {icon}
              </Box>

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              </Box>
            </Stack>

            <Chip
              size="small"
              label={count}
              color={accent === "neutral" ? "default" : accent}
              variant={accent === "neutral" ? "outlined" : "filled"}
              sx={{ fontWeight: 800, minWidth: 36 }}
            />
          </Stack>

          <Divider />

          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function TicketRow({
  item,
  mode,
}: {
  item: DashboardTicketItem;
  mode: "follow_up" | "review";
}) {
  const address = [safeTrim(item.serviceAddressLine1), safeTrim(item.serviceCity), safeTrim(item.serviceState)]
    .filter(Boolean)
    .join(", ");
  const assignedPeople = [safeTrim(item.assignedTechnicianName), safeTrim(item.assignedHelperName)]
    .filter(Boolean)
    .join(" + ");

  return (
    <Box
      sx={{
        py: 1.5,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {item.customerDisplayName || "Customer"}
            </Typography>

            <Chip
              size="small"
              label={mode === "review" ? "Needs Review" : "Follow-Up"}
              color={mode === "review" ? "primary" : "warning"}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>

          <Typography
            variant="body1"
            sx={{
              mt: 0.5,
              fontWeight: 600,
            }}
          >
            {item.issueSummary || "Service Ticket"}
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            flexWrap="wrap"
            useFlexGap
            sx={{ mt: 0.85 }}
          >
            {address ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PlaceRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {address}
                </Typography>
              </Stack>
            ) : null}

            {assignedPeople ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PersonRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {assignedPeople}
                </Typography>
              </Stack>
            ) : null}

            <Stack direction="row" spacing={0.5} alignItems="center">
              <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                {mode === "review"
                  ? `Ready ${formatWhen(item.readyToBillAt || item.updatedAt)}`
                  : `Updated ${formatWhen(item.updatedAt)}`}
              </Typography>
            </Stack>
          </Stack>
        </Box>

        <Button
          component={Link}
          href={`/service-tickets/${item.id}`}
          variant={mode === "review" ? "contained" : "outlined"}
          color={mode === "review" ? "primary" : "warning"}
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ borderRadius: 999, flexShrink: 0 }}
        >
          Open Ticket
        </Button>
      </Stack>
    </Box>
  );
}

function getFieldStatusMeta(status?: string | null, timerState?: string | null) {
  const normalized = normalizeStatus(status);
  const normalizedTimer = normalizeStatus(timerState);

  if (normalized === "paused" || normalizedTimer === "paused") {
    return {
      label: "Paused",
      color: "warning" as const,
      icon: <PauseCircleRoundedIcon sx={{ fontSize: 14 }} />,
    };
  }

  if (normalized === "dispatched" || normalized === "assigned" || normalized === "on_site") {
    return {
      label: "Assigned Today",
      color: "info" as const,
      icon: <AssignmentRoundedIcon sx={{ fontSize: 14 }} />,
    };
  }

  return {
    label: "In Progress",
    color: "success" as const,
    icon: <PlayCircleRoundedIcon sx={{ fontSize: 14 }} />,
  };
}

function ActiveWorkRow({ item }: { item: ActiveWorkItem }) {
  const statusMeta = getFieldStatusMeta(item.status, item.timerState);
  const address = buildAddress(item);
  const assignedPeople = buildAssignedPeople(item);

  return (
    <Box
      sx={{
        borderRadius: 1.2,
        border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        backgroundColor: (theme) => alpha(theme.palette.common.white, 0.02),
        px: 1.5,
        py: 1.5,
      }}
    >
      <Stack spacing={1.2}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2" fontWeight={800}>
                {item.title || (item.itemType === "project" ? "Active Project Trip" : "Active Service Ticket")}
              </Typography>

              <Chip
                size="small"
                icon={item.itemType === "project" ? <ConstructionRoundedIcon sx={{ fontSize: 14 }} /> : <PlumbingRoundedIcon sx={{ fontSize: 14 }} />}
                label={item.itemType === "project" ? "Project" : "Service"}
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {item.subtitle || (item.itemType === "project" ? "Project" : "Customer")}
            </Typography>
          </Box>

          <Chip
            size="small"
            icon={statusMeta.icon}
            label={statusMeta.label}
            color={statusMeta.color}
            variant="outlined"
            sx={{ fontWeight: 700, flexShrink: 0 }}
          />
        </Stack>

        <Stack spacing={0.8}>
          {assignedPeople ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <EngineeringRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
              <Typography variant="body2" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Crew:
                </Box>{" "}
                {assignedPeople}
              </Typography>
            </Stack>
          ) : null}

          {address ? (
            <Stack direction="row" spacing={0.75} alignItems="flex-start">
              <PlaceRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
              <Typography variant="body2" color="text.secondary">
                <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Address:
                </Box>{" "}
                {address}
              </Typography>
            </Stack>
          ) : null}

          <Stack direction="row" spacing={0.75} alignItems="flex-start">
            <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "2px" }} />
            <Typography variant="body2" color="text.secondary">
              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                Updated:
              </Box>{" "}
              {formatWhen(item.updatedAt)}
            </Typography>
          </Stack>
        </Stack>

        <Button
          component={Link}
          href={item.href}
          variant="text"
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{
            alignSelf: "flex-start",
            px: 0,
            minWidth: 0,
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          {item.itemType === "project" ? "Open Project" : "Open Ticket"}
        </Button>
      </Stack>
    </Box>
  );
}

function AreaSnapshotDialog({
  open,
  onClose,
  activeItems,
}: {
  open: boolean;
  onClose: () => void;
  activeItems: ActiveWorkItem[];
}) {
  const theme = useTheme();
  const apiKey = safeTrim(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersByItemIdRef = useRef<Record<string, MarkerEntry>>({});
  const infoWindowRef = useRef<any>(null);

  const [isLoadingMap, setIsLoadingMap] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  function openMarkerForItem(itemId: string, shouldBounce = false, shouldZoomTight = true) {
    const google = window.google;
    const entry = markersByItemIdRef.current[itemId];
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;

    if (!google || !entry || !map || !infoWindow) return;

    map.panTo(entry.marker.getPosition());

    if (shouldZoomTight) {
      const currentZoom = Number(map.getZoom?.() ?? 0);
      if (currentZoom < 13) {
        map.setZoom(13);
      }
    }

    infoWindow.setContent(entry.infoHtml);
    infoWindow.open({
      anchor: entry.marker,
      map,
    });

    if (shouldBounce && google.maps?.Animation) {
      entry.marker.setAnimation(google.maps.Animation.BOUNCE);
      window.setTimeout(() => {
        entry.marker.setAnimation(null);
      }, 1200);
    }

    setSelectedItemId(itemId);
  }

  useEffect(() => {
    if (!open) {
      setSelectedItemId("");
      return;
    }

    if (!apiKey) {
      setMapError("Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the expanded live field work map.");
      return;
    }

    const addresses = activeItems
      .filter(isFieldVisibleItem)
      .map((item) => ({
        item,
        address: buildAddress(item),
      }))
      .filter((entry) => entry.address);

    if (addresses.length === 0) {
      setMapError("No mappable active field addresses are available right now.");
      return;
    }

    let isCancelled = false;

    async function initializeMap() {
      try {
        setIsLoadingMap(true);
        setMapError("");
        setSelectedItemId("");

        const google = await loadGoogleMapsApi(apiKey);
        if (isCancelled || !mapRef.current) return;

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 29.905, lng: -96.876 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: [
            {
              featureType: "poi.business",
              stylers: [{ visibility: "off" }],
            },
          ],
        });

        mapInstanceRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
        markersByItemIdRef.current = {};

        const geocoder = new google.maps.Geocoder();
        const bounds = new google.maps.LatLngBounds();

        for (let i = 0; i < addresses.length; i += 1) {
          const { item, address } = addresses[i];

          const result = await new Promise<any>((resolve, reject) => {
            geocoder.geocode({ address }, (results: any, status: string) => {
              if (status === "OK" && results?.[0]) {
                resolve(results[0]);
              } else {
                reject(new Error(`Geocode failed for ${address}: ${status}`));
              }
            });
          }).catch(() => null);

          if (isCancelled || !result) continue;

          const position = result.geometry.location;
          bounds.extend(position);

          const marker = new google.maps.Marker({
            map,
            position,
            label: {
              text: String(i + 1),
              color: "#ffffff",
              fontWeight: "700",
            },
            title: item.title || item.subtitle || `Field item ${i + 1}`,
            animation: google.maps.Animation.DROP,
          });

          const statusMeta = getFieldStatusMeta(item.status, item.timerState);
          const infoHtml = `
            <div style="min-width:220px;max-width:280px;padding:4px 2px 2px 2px;font-family:Arial,sans-serif;">
              <div style="font-size:14px;font-weight:700;color:#111827;line-height:1.35;">
                ${escapeHtml(item.title || (item.itemType === "project" ? "Project Trip" : "Service Ticket"))}
              </div>
              <div style="font-size:13px;color:#4b5563;margin-top:4px;">
                ${escapeHtml(item.subtitle || (item.itemType === "project" ? "Project" : "Customer"))}
              </div>
              <div style="margin-top:10px;font-size:12px;color:#111827;">
                <strong>Type:</strong> ${escapeHtml(item.itemType === "project" ? "Project" : "Service")}
              </div>
              <div style="margin-top:6px;font-size:12px;color:#111827;">
                <strong>Status:</strong> ${escapeHtml(statusMeta.label)}
              </div>
              <div style="margin-top:6px;font-size:12px;color:#111827;">
                <strong>Crew:</strong> ${escapeHtml(buildAssignedPeople(item) || "Unassigned")}
              </div>
              <div style="margin-top:6px;font-size:12px;color:#111827;">
                <strong>Address:</strong> ${escapeHtml(address)}
              </div>
              <div style="margin-top:6px;font-size:12px;color:#111827;">
                <strong>Updated:</strong> ${escapeHtml(formatWhen(item.updatedAt))}
              </div>
              <div style="margin-top:10px;">
                <a
                  href="${escapeHtml(item.href)}"
                  style="font-size:12px;font-weight:700;color:#1a73e8;text-decoration:none;"
                >
                  ${escapeHtml(item.itemType === "project" ? "Open project →" : "Open ticket →")}
                </a>
              </div>
            </div>
          `;

          marker.addListener("click", () => {
            setSelectedItemId(item.id);
            if (!infoWindowRef.current) return;
            infoWindowRef.current.setContent(infoHtml);
            infoWindowRef.current.open({
              anchor: marker,
              map,
            });
          });

          markersByItemIdRef.current[item.id] = {
            marker,
            item,
            address,
            infoHtml,
          };
        }

        if (!isCancelled) {
          const markerEntries = Object.values(markersByItemIdRef.current);

          if (markerEntries.length === 1) {
            map.setCenter(bounds.getCenter());
            map.setZoom(13);
          } else if (!bounds.isEmpty()) {
            map.fitBounds(bounds, {
              top: 72,
              right: 72,
              bottom: 72,
              left: 72,
            });
          }

          if (markerEntries.length > 0) {
            const firstItemId = markerEntries[0].item.id;
            window.setTimeout(() => {
              openMarkerForItem(firstItemId, false, markerEntries.length === 1);
            }, 250);
          }
        }
      } catch {
        if (!isCancelled) {
          setMapError("Unable to load the expanded live field work map right now.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingMap(false);
        }
      }
    }

    initializeMap();

    return () => {
      isCancelled = true;
    };
  }, [open, apiKey, activeItems]);

  const visibleFieldItems = useMemo(
    () => activeItems.filter(isFieldVisibleItem),
    [activeItems]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          borderRadius: { xs: 3, md: 4 },
          backgroundColor: "background.paper",
          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle
        sx={{
          px: { xs: 2, md: 2.5 },
          py: { xs: 1.5, md: 2 },
          borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={800}>
              Live Field Work Map
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
              Larger map view of active service and project work with clickable field pins.
            </Typography>
          </Box>

          <IconButton
            onClick={onClose}
            aria-label="Close live field work map"
            sx={{
              borderRadius: 2.5,
              border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
            }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              icon={<MyLocationRoundedIcon sx={{ fontSize: 16 }} />}
              label={`${visibleFieldItems.length} active in field`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
            <Chip
              size="small"
              label="Click any pin or card for details"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Stack>

          {mapError ? (
            <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
              {mapError}
            </Alert>
          ) : null}

          <Box
            sx={{
              position: "relative",
              minHeight: { xs: 320, md: 500 },
              borderRadius: 1.2,
              overflow: "hidden",
              border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
              backgroundColor: alpha(theme.palette.common.white, 0.03),
            }}
          >
            <Box
              ref={mapRef}
              sx={{
                position: "absolute",
                inset: 0,
              }}
            />

            {isLoadingMap ? (
              <Stack
                alignItems="center"
                justifyContent="center"
                spacing={1.25}
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: alpha(theme.palette.background.paper, 0.68),
                  backdropFilter: "blur(4px)",
                }}
              >
                <CircularProgress size={28} />
                <Typography variant="body2" color="text.secondary">
                  Loading live field map…
                </Typography>
              </Stack>
            ) : null}
          </Box>

          {visibleFieldItems.length > 0 ? (
            <Box
              sx={{
                display: "grid",
                gap: 1.25,
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              }}
            >
              {visibleFieldItems.map((item, index) => {
                const address = buildAddress(item);
                const assignedPeople = buildAssignedPeople(item);
                const statusMeta = getFieldStatusMeta(item.status, item.timerState);
                const isSelected = selectedItemId === item.id;

                return (
                  <Card
                    key={item.id}
                    elevation={0}
                    sx={{
                      borderRadius: 1.2,
                      border: `1px solid ${
                        isSelected
                          ? alpha(theme.palette.primary.main, 0.45)
                          : alpha(theme.palette.common.white, 0.08)
                      }`,
                      backgroundColor: isSelected
                        ? alpha(theme.palette.primary.main, 0.12)
                        : alpha(theme.palette.common.white, 0.02),
                      transition: "all 180ms ease",
                      boxShadow: isSelected
                        ? `0 0 0 1px ${alpha(theme.palette.primary.main, 0.18)} inset`
                        : "none",
                    }}
                  >
                    <CardActionArea
                      onClick={() => openMarkerForItem(item.id, true, true)}
                      sx={{
                        borderRadius: 1.2,
                      }}
                    >
                      <Box sx={{ px: 1.5, py: 1.35 }}>
                        <Stack spacing={0.8}>
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                              <Chip
                                size="small"
                                label={index + 1}
                                color={isSelected ? "primary" : "default"}
                                sx={{ minWidth: 30, fontWeight: 800 }}
                              />
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                  <Typography variant="subtitle2" fontWeight={800} noWrap>
                                    {item.title || (item.itemType === "project" ? "Project Trip" : "Service Ticket")}
                                  </Typography>
                                  <Chip
                                    size="small"
                                    icon={item.itemType === "project" ? <ConstructionRoundedIcon sx={{ fontSize: 14 }} /> : <PlumbingRoundedIcon sx={{ fontSize: 14 }} />}
                                    label={item.itemType === "project" ? "Project" : "Service"}
                                    variant="outlined"
                                    sx={{ fontWeight: 700 }}
                                  />
                                </Stack>

                                <Typography variant="body2" color="text.secondary" noWrap>
                                  {item.subtitle || (item.itemType === "project" ? "Project" : "Customer")}
                                </Typography>
                              </Box>
                            </Stack>

                            <Chip
                              size="small"
                              icon={statusMeta.icon}
                              label={statusMeta.label}
                              color={statusMeta.color}
                              variant="outlined"
                              sx={{ fontWeight: 700, flexShrink: 0 }}
                            />
                          </Stack>

                          {assignedPeople ? (
                            <Typography variant="body2" color="text.secondary">
                              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                                Crew:
                              </Box>{" "}
                              {assignedPeople}
                            </Typography>
                          ) : null}

                          {address ? (
                            <Typography variant="body2" color="text.secondary">
                              <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                                Address:
                              </Box>{" "}
                              {address}
                            </Typography>
                          ) : null}

                          <Typography variant="body2" color="text.secondary">
                            <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                              Updated:
                            </Box>{" "}
                            {formatWhen(item.updatedAt)}
                          </Typography>

                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                            <Typography
                              variant="caption"
                              sx={{
                                color: isSelected ? "primary.main" : "text.secondary",
                                fontWeight: 700,
                              }}
                            >
                              {isSelected ? "Focused on map" : "Tap to focus on map"}
                            </Typography>

                            <Button
                              component={Link}
                              href={item.href}
                              variant="text"
                              endIcon={<ArrowForwardRoundedIcon />}
                              onClick={(event) => event.stopPropagation()}
                              sx={{
                                px: 0,
                                minWidth: 0,
                                borderRadius: 999,
                                fontWeight: 700,
                              }}
                            >
                              {item.itemType === "project" ? "Open Project" : "Open Ticket"}
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    </CardActionArea>
                  </Card>
                );
              })}
            </Box>
          ) : (
            <Alert severity="info" variant="outlined" sx={{ borderRadius: 1.2 }}>
              No active field work is showing right now.
            </Alert>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function AreaSnapshotCard({ activeItems }: { activeItems: ActiveWorkItem[] }) {
  const theme = useTheme();
  const visibleFieldItems = useMemo(
    () => activeItems.filter(isFieldVisibleItem),
    [activeItems]
  );
  const mapUrl = useMemo(() => buildStaticMapUrl(visibleFieldItems), [visibleFieldItems]);
  const [isExpandedOpen, setIsExpandedOpen] = useState(false);

  return (
    <>
      <Box
        sx={{
          borderRadius: 1.2,
          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
          overflow: "hidden",
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.16)}, ${alpha(
            theme.palette.info.light,
            0.08
          )})`,
        }}
      >
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
          }}
        >
          <Typography
            variant="overline"
            sx={{ letterSpacing: "0.12em", color: "text.secondary", fontWeight: 800 }}
          >
            Area Snapshot
          </Typography>
        </Box>

        {mapUrl ? (
          <Box sx={{ position: "relative", height: 148 }}>
            <Box
              component="img"
              src={mapUrl}
              alt="Live field work area snapshot"
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                pointerEvents: "none",
                userSelect: "none",
              }}
            />

            <Box
              sx={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(0,0,0,0.16), rgba(0,0,0,0.02))",
                pointerEvents: "none",
              }}
            />

            <Tooltip title="Expand live map">
              <IconButton
                onClick={() => setIsExpandedOpen(true)}
                aria-label="Expand live field work map"
                sx={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 36,
                  height: 36,
                  borderRadius: 2.5,
                  color: "#fff",
                  backgroundColor: "rgba(7, 12, 20, 0.58)",
                  border: `1px solid ${alpha(theme.palette.common.white, 0.18)}`,
                  backdropFilter: "blur(10px)",
                  "&:hover": {
                    backgroundColor: "rgba(7, 12, 20, 0.74)",
                  },
                }}
              >
                <OpenInFullRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box
            sx={{
              position: "relative",
              height: 148,
              backgroundImage: `
                radial-gradient(circle at 20% 25%, rgba(255,255,255,0.42), transparent 18%),
                radial-gradient(circle at 72% 62%, rgba(255,255,255,0.28), transparent 20%),
                linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))
              `,
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                opacity: 0.2,
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 16px, rgba(255,255,255,0.4) 16px 18px)",
              }}
            />

            <Box
              sx={{
                position: "absolute",
                top: 30,
                left: 40,
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: "text.primary",
                boxShadow: `0 0 0 6px ${alpha(theme.palette.common.white, 0.3)}`,
              }}
            />

            <Box
              sx={{
                position: "absolute",
                bottom: 30,
                right: 54,
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: "text.primary",
                boxShadow: `0 0 0 6px ${alpha(theme.palette.common.white, 0.3)}`,
              }}
            />

            <Tooltip title="Expand live map">
              <IconButton
                onClick={() => setIsExpandedOpen(true)}
                aria-label="Expand live field work map"
                sx={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 36,
                  height: 36,
                  borderRadius: 2.5,
                  color: "#fff",
                  backgroundColor: "rgba(7, 12, 20, 0.58)",
                  border: `1px solid ${alpha(theme.palette.common.white, 0.18)}`,
                  backdropFilter: "blur(10px)",
                  "&:hover": {
                    backgroundColor: "rgba(7, 12, 20, 0.74)",
                  },
                }}
              >
                <OpenInFullRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            <Stack
              spacing={1}
              sx={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 12,
              }}
            >
              <Alert severity="info" variant="filled" sx={{ borderRadius: 2 }}>
                Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show a real map preview and expanded live map.
              </Alert>
            </Stack>
          </Box>
        )}
      </Box>

      <AreaSnapshotDialog
        open={isExpandedOpen}
        onClose={() => setIsExpandedOpen(false)}
        activeItems={visibleFieldItems}
      />
    </>
  );
}

export default function DashboardPage() {
  const theme = useTheme();
  const { appUser } = useAuthContext();

  const [followUpTickets, setFollowUpTickets] = useState<DashboardTicketItem[]>([]);
  const [reviewTickets, setReviewTickets] = useState<DashboardTicketItem[]>([]);
  const [activeItems, setActiveItems] = useState<ActiveWorkItem[]>([]);

  useEffect(() => {
    const todayIso = todayIsoLocal();

    const followUpQuery = query(
      collection(db, "serviceTickets"),
      where("status", "==", "follow_up"),
      limit(25)
    );

    const readyToBillQuery = query(
      collection(db, "serviceTickets"),
      where("billing.status", "==", "ready_to_bill"),
      limit(25)
    );

    const activeTripsQuery = query(
      collection(db, "trips"),
      where("date", "==", todayIso),
      limit(80)
    );

    const unsubFollowUp = onSnapshot(
      followUpQuery,
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const d = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName: d.customerDisplayName ?? "",
              issueSummary: d.issueSummary ?? "",
              serviceAddressLine1: d.serviceAddressLine1 ?? "",
              serviceCity: d.serviceCity ?? "",
              serviceState: d.serviceState ?? "",
              updatedAt: d.updatedAt ?? null,
              assignedTechnicianName: d.assignedTechnicianName ?? "",
              assignedHelperName: d.assignedHelperName ?? "",
              status: d.status ?? "",
            } as DashboardTicketItem;
          })
          .sort(ticketSort);

        setFollowUpTickets(items);
      },
      () => setFollowUpTickets([])
    );

    const unsubReview = onSnapshot(
      readyToBillQuery,
      (snap) => {
        const items = snap.docs
          .map((docSnap) => {
            const d = docSnap.data() as any;
            return {
              id: docSnap.id,
              customerDisplayName: d.customerDisplayName ?? "",
              issueSummary: d.issueSummary ?? "",
              serviceAddressLine1: d.serviceAddressLine1 ?? "",
              serviceCity: d.serviceCity ?? "",
              serviceState: d.serviceState ?? "",
              updatedAt: d.updatedAt ?? null,
              assignedTechnicianName: d.assignedTechnicianName ?? "",
              assignedHelperName: d.assignedHelperName ?? "",
              readyToBillAt: d.billing?.readyToBillAt ?? null,
              status: d.status ?? "",
            } as DashboardTicketItem;
          })
          .sort(ticketSort);

        setReviewTickets(items);
      },
      () => setReviewTickets([])
    );

    const unsubActiveTrips = onSnapshot(
      activeTripsQuery,
      async (snap) => {
        try {
          const tripItems: TripDocLite[] = snap.docs
            .map((docSnap) => {
              const d = docSnap.data() as any;
              return {
                id: docSnap.id,
                active: typeof d.active === "boolean" ? d.active : true,
                type: d.type ?? "",
                status: d.status ?? "",
                timerState: d.timerState ?? "",
                date: d.date ?? "",
                timeWindow: d.timeWindow ?? "",
                startTime: d.startTime ?? "",
                endTime: d.endTime ?? "",
                updatedAt: d.updatedAt ?? null,
                crew: d.crew ?? null,
                link: d.link ?? null,
              } as TripDocLite;
            })
            .filter((trip) => trip.active !== false)
            .filter((trip) => {
              const s = normalizeStatus(trip.status);
              const ts = normalizeStatus(trip.timerState);
              return (
                ["in_progress", "paused", "dispatched", "assigned", "on_site"].includes(s) ||
                ["running", "paused"].includes(ts)
              );
            });

          const serviceIds = Array.from(
            new Set(
              tripItems
                .map((trip) => safeTrim(trip.link?.serviceTicketId))
                .filter(Boolean)
            )
          );

          const projectIds = Array.from(
            new Set(
              tripItems
                .map((trip) => safeTrim(trip.link?.projectId))
                .filter(Boolean)
            )
          );

          const [serviceDocs, projectDocs] = await Promise.all([
            Promise.all(
              serviceIds.map(async (id) => {
                try {
                  const snap = await getDoc(doc(db, "serviceTickets", id));
                  if (!snap.exists()) return null;
                  const d = snap.data() as any;
                  return {
                    id,
                    customerDisplayName: d.customerDisplayName ?? "",
                    issueSummary: d.issueSummary ?? "",
                    serviceAddressLine1: d.serviceAddressLine1 ?? "",
                    serviceCity: d.serviceCity ?? "",
                    serviceState: d.serviceState ?? "",
                  };
                } catch {
                  return null;
                }
              })
            ),
            Promise.all(
              projectIds.map(async (id) => {
                try {
                  const snap = await getDoc(doc(db, "projects", id));
                  if (!snap.exists()) return null;
                  const d = snap.data() as any;
                  return {
                    id,
                    name: d.name ?? d.projectName ?? "Project",
                    serviceAddressLine1: d.serviceAddressLine1 ?? d.addressLine1 ?? "",
                    serviceCity: d.serviceCity ?? d.city ?? "",
                    serviceState: d.serviceState ?? d.state ?? "",
                  };
                } catch {
                  return null;
                }
              })
            ),
          ]);

          const serviceMap = Object.fromEntries(
            serviceDocs.filter(Boolean).map((x: any) => [x.id, x])
          ) as Record<
            string,
            {
              id: string;
              customerDisplayName: string;
              issueSummary: string;
              serviceAddressLine1?: string;
              serviceCity?: string;
              serviceState?: string;
            }
          >;

          const projectMap = Object.fromEntries(
            projectDocs.filter(Boolean).map((x: any) => [x.id, x])
          ) as Record<
            string,
            {
              id: string;
              name: string;
              serviceAddressLine1?: string;
              serviceCity?: string;
              serviceState?: string;
            }
          >;

          const activeRows: ActiveWorkItem[] = tripItems
            .map((trip) => {
              const type = normalizeStatus(trip.type) === "project" ? "project" : "service";
              const serviceTicketId = safeTrim(trip.link?.serviceTicketId);
              const projectId = safeTrim(trip.link?.projectId);

              if (type === "project" && projectId) {
                const project = projectMap[projectId];

                return {
                  id: trip.id,
                  tripId: trip.id,
                  itemType: "project",
                  href: `/projects/${projectId}`,
                  title: safeTrim(project?.name) || "Project Trip",
                  subtitle: safeTrim(project?.name) || "Project",
                  addressLine1: project?.serviceAddressLine1 ?? "",
                  city: project?.serviceCity ?? "",
                  state: project?.serviceState ?? "",
                  updatedAt: trip.updatedAt ?? null,
                  status: trip.status ?? "",
                  timerState: trip.timerState ?? "",
                  assignedTechnicianName: trip.crew?.primaryTechName ?? "",
                  assignedHelperName: trip.crew?.helperName ?? "",
                  secondaryTechnicianName: trip.crew?.secondaryTechName ?? "",
                  secondaryHelperName: trip.crew?.secondaryHelperName ?? "",
                } as ActiveWorkItem;
              }

              const ticket = serviceMap[serviceTicketId];

              return {
                id: trip.id,
                tripId: trip.id,
                itemType: "service",
                href: serviceTicketId ? `/service-tickets/${serviceTicketId}` : "/service-tickets",
                title: safeTrim(ticket?.issueSummary) || "Service Ticket",
                subtitle: safeTrim(ticket?.customerDisplayName) || "Customer",
                addressLine1: ticket?.serviceAddressLine1 ?? "",
                city: ticket?.serviceCity ?? "",
                state: ticket?.serviceState ?? "",
                updatedAt: trip.updatedAt ?? null,
                status: trip.status ?? "",
                timerState: trip.timerState ?? "",
                assignedTechnicianName: trip.crew?.primaryTechName ?? "",
                assignedHelperName: trip.crew?.helperName ?? "",
                secondaryTechnicianName: trip.crew?.secondaryTechName ?? "",
                secondaryHelperName: trip.crew?.secondaryHelperName ?? "",
              } as ActiveWorkItem;
            })
            .filter(isFieldVisibleItem)
            .sort(statusSort);

          setActiveItems(activeRows);
        } catch {
          setActiveItems([]);
        }
      },
      () => setActiveItems([])
    );

    return () => {
      unsubFollowUp();
      unsubReview();
      unsubActiveTrips();
    };
  }, []);

  const attentionCount = useMemo(() => {
    return new Set([
      ...followUpTickets.map((x) => x.id),
      ...reviewTickets.map((x) => x.id),
    ]).size;
  }, [followUpTickets, reviewTickets]);

  const visibleCardCount = useMemo(() => {
    return reviewTickets.length + followUpTickets.length + activeItems.length;
  }, [reviewTickets.length, followUpTickets.length, activeItems.length]);

  return (
    <ProtectedPage
      fallbackTitle="Dashboard"
      allowedRoles={[
        "admin",
        "dispatcher",
        "manager",
        "billing",
        "office_display",
      ]}
    >
      <AppShell appUser={appUser}>
        <Box sx={{ width: "100%", maxWidth: 1480, mx: "auto" }}>
          <Stack spacing={3}>
            <Card
              elevation={0}
              sx={{
                borderRadius: 1.2,
                border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                backgroundColor: "background.paper",
              }}
            >
              <CardContent sx={{ p: { xs: 2.25, md: 3 }, "&:last-child": { pb: { xs: 2.25, md: 3 } } }}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                >
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip
                        icon={<DashboardRoundedIcon sx={{ fontSize: 16 }} />}
                        label="Dashboard"
                        size="small"
                        sx={{
                          borderRadius: 999,
                          fontWeight: 700,
                          backgroundColor: alpha(theme.palette.primary.main, 0.14),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.24)}`,
                          color: theme.palette.primary.main,
                        }}
                      />

                      <Chip
                        label={`${attentionCount} need attention`}
                        size="small"
                        color={attentionCount > 0 ? "warning" : "default"}
                        variant={attentionCount > 0 ? "filled" : "outlined"}
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />

                      <Chip
                        label={`${activeItems.length} active in field`}
                        size="small"
                        color={activeItems.length > 0 ? "success" : "default"}
                        variant={activeItems.length > 0 ? "filled" : "outlined"}
                        sx={{ borderRadius: 999, fontWeight: 800 }}
                      />
                    </Stack>

                    <Box>
                      <Typography
                        variant="h4"
                        sx={{
                          fontSize: { xs: "1.8rem", md: "2.35rem" },
                          lineHeight: 1.05,
                          fontWeight: 800,
                          letterSpacing: "-0.035em",
                        }}
                      >
                        Office attention center
                      </Typography>

                      <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mt: 1, maxWidth: 940 }}
                      >
                        This dashboard keeps office action items front and center while also giving
                        dispatch a compact view of live field work, current assignments, and active
                        trip status across service and project work.
                      </Typography>
                    </Box>
                  </Stack>

                  <Button
                    component={Link}
                    href="/service-tickets"
                    variant="outlined"
                    endIcon={<ArrowForwardRoundedIcon />}
                    sx={{ borderRadius: 999 }}
                  >
                    Open Service Tickets
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {attentionCount === 0 && activeItems.length === 0 ? (
              <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                Nice — there are no current office attention items or active field jobs showing right now.
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.35fr) minmax(360px, 0.95fr)" },
                alignItems: "start",
              }}
            >
              <Stack spacing={2}>
                {reviewTickets.length > 0 ? (
                  <SectionCard
                    title="Needs Review"
                    subtitle="Completed work that is ready for office review and billing follow-through."
                    icon={<AssignmentTurnedInRoundedIcon />}
                    count={reviewTickets.length}
                    accent="primary"
                  >
                    <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
                      {reviewTickets.map((item) => (
                        <TicketRow key={item.id} item={item} mode="review" />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {followUpTickets.length > 0 ? (
                  <SectionCard
                    title="Follow-Up Needed"
                    subtitle="Tickets that still have billable context but are waiting on the next action."
                    icon={<AutorenewRoundedIcon />}
                    count={followUpTickets.length}
                    accent="warning"
                  >
                    <Stack divider={<Divider flexItem sx={{ borderColor: alpha("#FFFFFF", 0.08) }} />}>
                      {followUpTickets.map((item) => (
                        <TicketRow key={item.id} item={item} mode="follow_up" />
                      ))}
                    </Stack>
                  </SectionCard>
                ) : null}

                {attentionCount > 0 ? (
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1.2,
                      border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      backgroundColor: "background.paper",
                    }}
                  >
                    <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={2}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                      >
                        <Box>
                          <Typography variant="h6" fontWeight={800}>
                            Attention summary
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Needs Review: {reviewTickets.length} • Follow-Up Needed: {followUpTickets.length}
                          </Typography>
                        </Box>

                        <Button
                          component={Link}
                          href="/service-tickets"
                          variant="contained"
                          startIcon={<ReceiptLongRoundedIcon />}
                          sx={{ borderRadius: 999 }}
                        >
                          Manage Service Workflow
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}
              </Stack>

              <Stack spacing={2}>
                <SectionCard
                  title="Live Field Work"
                  subtitle="Compact visibility into active service and project trips and who is assigned in the field."
                  icon={<MyLocationRoundedIcon />}
                  count={activeItems.length}
                  accent="neutral"
                >
                  <Stack spacing={1.25}>
                    <AreaSnapshotCard activeItems={activeItems} />

                    {activeItems.length === 0 ? (
                      <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                        No active field work is showing right now.
                      </Alert>
                    ) : (
                      <Stack spacing={1.25}>
                        {activeItems.map((item) => (
                          <ActiveWorkRow key={item.id} item={item} />
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </SectionCard>

                <SectionCard
                  title="Today at a Glance"
                  subtitle="Quick counts from what is currently surfaced on this dashboard."
                  icon={<DashboardRoundedIcon />}
                  count={visibleCardCount}
                  accent="neutral"
                >
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1.25,
                      gridTemplateColumns: "1fr 1fr",
                    }}
                  >
                    {[
                      { label: "Active Now", value: activeItems.length },
                      { label: "Needs Review", value: reviewTickets.length },
                      { label: "Follow-Up", value: followUpTickets.length },
                      { label: "Attention Total", value: attentionCount },
                    ].map((item) => (
                      <Box
                        key={item.label}
                        sx={{
                          borderRadius: 1.2,
                          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                          backgroundColor: alpha(theme.palette.common.white, 0.02),
                          px: 1.5,
                          py: 1.5,
                        }}
                      >
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 800,
                            lineHeight: 1,
                            letterSpacing: "-0.03em",
                          }}
                        >
                          {item.value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </SectionCard>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </AppShell>
    </ProtectedPage>
  );
}