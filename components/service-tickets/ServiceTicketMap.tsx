"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Box, Button, Chip, CircularProgress, Divider, Stack, Typography } from "@mui/material";

export type TicketPin = {
  id: string;
  customerDisplayName: string;
  issueSummary: string;
  status: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string;
  preferredCustomer: boolean;
  estimatedDurationMinutes: number;
  assignedTechnicianName: string;
  scheduledTrip?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    timeWindow: string;
    status: string;
    crewNames: string[];
  } | null;
};

type Props = { tickets: TicketPin[] };
type Coordinate = { lat: number; lng: number };
type MapWindow = Window & { google?: any };
type LocatedGroup = { address: string; tickets: TicketPin[]; coords: Coordinate };

const GOOGLE_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

let mapsLoadPromise: Promise<any> | null = null;
function loadGoogleMaps(): Promise<any> {
  const browser = window as MapWindow;
  if (browser.google?.maps?.Geocoder) return Promise.resolve(browser.google.maps);
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.dcflowTicketMap = "true";
    script.onload = () => {
      if (browser.google?.maps?.Geocoder) resolve(browser.google.maps);
      else reject(new Error("Google Maps loaded but is unavailable. Check API settings."));
    };
    script.onerror = () => reject(new Error("Unable to load Google Maps. Verify your API key, billing, and domain restrictions."));
    document.head.appendChild(script);
  }).catch((error) => { mapsLoadPromise = null; throw error; });
  return mapsLoadPromise;
}

function addressFor(ticket: TicketPin) {
  return [ticket.serviceAddressLine1, ticket.serviceCity, ticket.serviceState, ticket.servicePostalCode]
    .map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}
function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case "follow_up": return "#f59e0b";
    case "scheduled": return "#38bdf8";
    case "in_progress": return "#22c55e";
    default: return "#2563eb";
  }
}
function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "follow_up": return "Follow Up";
    case "scheduled": return "Scheduled";
    case "in_progress": return "In Progress";
    default: return "New";
  }
}
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c,
  );
}
function cacheGet(address: string): Coordinate | null {
  try {
    const json = sessionStorage.getItem(`dcflow_map_location_v1:${address.toLowerCase()}`);
    if (!json) return null;
    const coordinate = JSON.parse(json) as Coordinate;
    return Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng) ? coordinate : null;
  } catch { return null; }
}
function cachePut(address: string, coords: Coordinate) {
  try { sessionStorage.setItem(`dcflow_map_location_v1:${address.toLowerCase()}`, JSON.stringify(coords)); }
  catch { /* Storage is optional. */ }
}
function delay(ms: number) { return new Promise<void>((resolve) => window.setTimeout(resolve, ms)); }
function formatDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || "Date unavailable";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}
function formatClock(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return "";
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}
function tripTimeLabel(trip: NonNullable<TicketPin["scheduledTrip"]>) {
  if (trip.timeWindow === "all_day") return "All day";
  if (trip.timeWindow === "am") return "AM (8 AM–12 PM)";
  if (trip.timeWindow === "pm") return "PM (1 PM–5 PM)";
  const start = formatClock(trip.startTime);
  const end = formatClock(trip.endTime);
  return start && end ? `${start} – ${end}` : "Time not set";
}
function distanceMiles(a: Coordinate, b: Coordinate) {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function isPending(ticket: TicketPin) {
  return ticket.status === "new" || (ticket.status === "follow_up" && !ticket.scheduledTrip);
}
function isScheduled(ticket: TicketPin) {
  return Boolean(ticket.scheduledTrip) && (ticket.status === "scheduled" || ticket.status === "follow_up" || ticket.status === "in_progress");
}

export default function ServiceTicketMap({ tickets }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const firstFitRef = useRef(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [mappedCount, setMappedCount] = useState(0);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [locatedGroups, setLocatedGroups] = useState<LocatedGroup[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [radius, setRadius] = useState(10);

  const addressGroups = useMemo(() => {
    const byAddress = new Map<string, { address: string; tickets: TicketPin[] }>();
    const noAddress: string[] = [];
    for (const ticket of tickets) {
      const address = addressFor(ticket);
      if (!ticket.serviceAddressLine1.trim() || !ticket.serviceCity.trim() || !ticket.serviceState.trim()) {
        noAddress.push(`${ticket.customerDisplayName || ticket.id} — incomplete service address`);
        continue;
      }
      const key = address.toLowerCase().replace(/\s+/g, " ");
      const existing = byAddress.get(key);
      if (existing) existing.tickets.push(ticket);
      else byAddress.set(key, { address, tickets: [ticket] });
    }
    return { groups: Array.from(byAddress.values()), noAddress };
  }, [tickets]);

  const selected = useMemo(() => {
    if (!selectedTicketId) return null;
    for (const group of locatedGroups) {
      const ticket = group.tickets.find((item) => item.id === selectedTicketId);
      if (ticket) return { ticket, coords: group.coords, address: group.address };
    }
    return null;
  }, [locatedGroups, selectedTicketId]);

  const nearby = useMemo(() => {
    if (!selected || !isScheduled(selected.ticket)) return [];
    return locatedGroups.flatMap((group) => group.tickets
      .filter((ticket) => ticket.id !== selected.ticket.id && isPending(ticket))
      .map((ticket) => ({ ticket, miles: distanceMiles(selected.coords, group.coords), address: group.address })))
      .filter((item) => item.miles <= radius)
      .sort((a, b) => a.miles - b.miles || a.ticket.customerDisplayName.localeCompare(b.ticket.customerDisplayName));
  }, [locatedGroups, selected, radius]);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      setError("");
      setBusy(true);
      setMappedCount(0);
      setUnmapped(addressGroups.noAddress);
      setLocatedGroups([]);
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      if (!GOOGLE_KEY) {
        setError("Google Maps API key is missing. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local and restart Next.js.");
        setBusy(false);
        return;
      }
      if (!containerRef.current) { setBusy(false); return; }
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: { lat: 29.9055, lng: -96.8766 }, zoom: 10,
            mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
          });
        }
        const map = mapRef.current;
        const geocoder = new maps.Geocoder();
        const bounds = new maps.LatLngBounds();
        infoRef.current?.close();
        infoRef.current = new maps.InfoWindow();
        const failed = [...addressGroups.noAddress];
        const located: LocatedGroup[] = [];
        let plottedTickets = 0;

        for (const group of addressGroups.groups) {
          if (cancelled) return;
          let coords = cacheGet(group.address);
          if (!coords) {
            try {
              const result = await geocoder.geocode({ address: group.address, region: "US" });
              if (cancelled) return;
              const loc = result.results?.[0]?.geometry?.location;
              if (loc) {
                coords = { lat: loc.lat(), lng: loc.lng() };
                cachePut(group.address, coords);
              }
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : String(cause);
              if (message.includes("REQUEST_DENIED")) {
                throw new Error("Google rejected geocoding. Enable Geocoding API and Maps JavaScript API, and check API key restrictions.");
              }
              if (message.includes("OVER_QUERY_LIMIT")) await delay(1200);
            }
            await delay(120);
          }
          if (!coords) {
            failed.push(`${group.address} (${group.tickets.length} ticket${group.tickets.length === 1 ? "" : "s"})`);
            continue;
          }
          located.push({ address: group.address, tickets: group.tickets, coords });
          const sorted = [...group.tickets].sort((a, b) =>
            ["follow_up", "new", "scheduled", "in_progress"].indexOf(a.status.toLowerCase()) -
            ["follow_up", "new", "scheduled", "in_progress"].indexOf(b.status.toLowerCase())
          );
          const marker = new maps.Marker({
            map, position: coords,
            title: `${group.tickets.length} ticket(s) — ${group.address}`,
            label: group.tickets.length > 1 ? { text: String(group.tickets.length), color: "#ffffff", fontWeight: "bold" } : undefined,
            icon: {
              path: maps.SymbolPath.CIRCLE, scale: group.tickets.length > 1 ? 15 : 11,
              fillColor: statusColor(sorted[0]?.status || "new"), fillOpacity: 1,
              strokeColor: "#ffffff", strokeWeight: 2.5,
            },
          });
          marker.addListener("click", () => {
            const focus = sorted.find(isScheduled);
            setSelectedTicketId(focus?.id || null);
            const itemHtml = sorted.map((ticket) => {
              const trip = ticket.scheduledTrip;
              return `<div style="border-top:1px solid #e5e7eb;padding:9px 0;line-height:1.5">
                <div><strong>${escapeHtml(ticket.issueSummary || "Service Ticket")}</strong>${ticket.preferredCustomer ? ' <span title="Preferred customer">★</span>' : ""}</div>
                <div style="font-size:13px">${escapeHtml(ticket.customerDisplayName)}</div>
                <div style="font-size:12px;color:#475569">${escapeHtml(statusLabel(ticket.status))} · ${ticket.estimatedDurationMinutes ? `${escapeHtml((ticket.estimatedDurationMinutes / 60).toFixed(1))} hrs` : "Duration not set"}</div>
                ${trip ? `<div style="font-size:12px;margin-top:5px"><b>Trip:</b> ${escapeHtml(formatDate(trip.date))}<br />${escapeHtml(tripTimeLabel(trip))}<br /><b>Crew:</b> ${escapeHtml(trip.crewNames.join(", ") || ticket.assignedTechnicianName || "Not assigned")}</div>` : ticket.status === "scheduled" ? '<div style="font-size:12px;color:#b45309">Active trip details unavailable</div>' : ""}
                <div style="display:flex;gap:12px;align-items:center;margin-top:5px">
                  <a style="font-size:13px;font-weight:700;color:#2563eb" href="/service-tickets/${encodeURIComponent(ticket.id)}">Open ticket</a>
                  ${isScheduled(ticket) ? `<button type="button" data-nearby-ticket="${escapeHtml(ticket.id)}" style="font-size:12px;color:#2563eb;border:1px solid #bfdbfe;border-radius:5px;background:white;cursor:pointer;padding:4px 7px">Nearby tickets</button>` : ""}
                </div>
              </div>`;
            }).join("");
            const wrapper = document.createElement("div");
            wrapper.style.cssText = "color:#0f172a;max-width:320px;max-height:315px;overflow:auto;font-family:Arial,sans-serif";
            wrapper.innerHTML = `<div style="font-weight:700;margin-bottom:4px">${escapeHtml(group.address)}</div>${itemHtml}`;
            wrapper.querySelectorAll<HTMLButtonElement>("button[data-nearby-ticket]").forEach((button) => {
              button.addEventListener("click", () => setSelectedTicketId(button.dataset.nearbyTicket || null));
            });
            infoRef.current?.setContent(wrapper);
            infoRef.current?.open({ map, anchor: marker });
          });
          markersRef.current.push(marker);
          bounds.extend(coords);
          plottedTickets += group.tickets.length;
          setMappedCount(plottedTickets);
        }
        if (cancelled) return;
        setLocatedGroups(located);
        setUnmapped(failed);
        // Re-filtering and selecting tickets must NOT reset a dispatcher's zoom.
        if (firstFitRef.current && located.length > 0) {
          if (located.length > 1) map.fitBounds(bounds, 58);
          else { map.setCenter(bounds.getCenter()); map.setZoom(13); }
          firstFitRef.current = false;
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to initialize the map.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void draw();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [addressGroups]);

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "background.paper" }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} sx={{ p: 1.5 }} alignItems="center">
        <Chip size="small" label={`${mappedCount} mapped tickets`} />
        <Chip size="small" label={`${unmapped.length} unmapped locations`} color={unmapped.length ? "warning" : "default"} variant="outlined" />
        {(["new", "follow_up", "scheduled", "in_progress"] as const).map((status) => (
          <Stack key={status} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: statusColor(status) }} />
            <Typography variant="caption">{statusLabel(status)}</Typography>
          </Stack>
        ))}
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {tickets.length === 0 ? <Alert severity="info">No open service tickets match the selected filters.</Alert> : null}
      <Box sx={{ display: "grid", gridTemplateColumns: selected && isScheduled(selected.ticket) ? { xs: "1fr", lg: "minmax(0, 1fr) 330px" } : "1fr" }}>
        <Box sx={{ position: "relative", minWidth: 0 }}>
          <Box ref={containerRef} sx={{ width: "100%", height: { xs: 460, md: 620 }, bgcolor: "grey.900" }} />
          {busy && !error ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ position: "absolute", top: 12, left: 12, bgcolor: "background.paper", p: 1.5, borderRadius: 1, boxShadow: 2 }}>
              <CircularProgress size={18} /><Typography variant="body2">Locating service addresses...</Typography>
            </Stack>
          ) : null}
        </Box>
        {selected && isScheduled(selected.ticket) ? (
          <Box sx={{ p: 2, borderLeft: { lg: "1px solid" }, borderColor: "divider", maxHeight: { lg: 620 }, overflowY: "auto" }}>
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={800}>Nearby pending tickets</Typography>
                  <Typography variant="body2" color="text.secondary">Near: {selected.ticket.customerDisplayName}</Typography>
                </Box>
                <Button size="small" onClick={() => setSelectedTicketId(null)}>Close</Button>
              </Stack>
              <Typography variant="body2" fontWeight={700}>{selected.ticket.issueSummary || "Scheduled Service"}</Typography>
              {selected.ticket.scheduledTrip ? (
                <Box>
                  <Typography variant="body2">{formatDate(selected.ticket.scheduledTrip.date)} · {tripTimeLabel(selected.ticket.scheduledTrip)}</Typography>
                  <Typography variant="caption" color="text.secondary">{selected.ticket.scheduledTrip.crewNames.join(", ") || "Crew unavailable"}</Typography>
                </Box>
              ) : null}
              <Divider />
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Within</Typography>
                {[5, 10, 15, 20].map((miles) => (
                  <Chip key={miles} size="small" label={`${miles} mi`} clickable onClick={() => setRadius(miles)} color={radius === miles ? "primary" : "default"} variant={radius === miles ? "filled" : "outlined"} />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary">{nearby.length} pending ticket{nearby.length === 1 ? "" : "s"} · Straight-line distance</Typography>
              {nearby.length === 0 ? <Alert severity="info" variant="outlined">No pending tickets within {radius} miles. Try a larger radius.</Alert> : null}
              {nearby.map(({ ticket, miles, address }) => (
                <Box key={ticket.id} sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
                  <Stack spacing={0.5}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="body2" fontWeight={800}>{ticket.issueSummary || "Service Ticket"}</Typography>
                      <Chip size="small" label={`${miles.toFixed(1)} mi`} />
                    </Stack>
                    <Typography variant="body2">{ticket.customerDisplayName}</Typography>
                    <Typography variant="caption" color="text.secondary">{address}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">{statusLabel(ticket.status)} · {ticket.estimatedDurationMinutes ? `${(ticket.estimatedDurationMinutes / 60).toFixed(1)} hr estimated` : "Duration not set"}</Typography>
                      <Button component={Link} href={`/service-tickets/${encodeURIComponent(ticket.id)}`} size="small">Open</Button>
                    </Stack>
                  </Stack>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary">Distances are straight-line estimates, not driving mileage or travel time. Scheduling continues on each ticket.</Typography>
            </Stack>
          </Box>
        ) : null}
      </Box>
      {unmapped.length > 0 ? (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2">Addresses needing review ({unmapped.length})</Typography>
          {unmapped.map((item, index) => <Typography key={`${item}-${index}`} variant="caption" display="block" color="text.secondary">{item}</Typography>)}
        </Box>
      ) : null}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, py: 1.5 }}>
        Select a scheduled pin to find nearby pending jobs without leaving the map. Pins show service locations, not live technician positions.
      </Typography>
    </Box>
  );
}
