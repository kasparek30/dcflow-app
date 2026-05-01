export function formatServiceTicketAddress(args: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  return [
    String(args.line1 || "").trim(),
    String(args.line2 || "").trim(),
    [args.city, args.state, args.postalCode]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildTelHref(phone?: string | null) {
  const raw = String(phone || "").trim();
  if (!raw) return "";

  const normalized = raw.startsWith("+")
    ? `+${raw.slice(1).replace(/[^\d]/g, "")}`
    : raw.replace(/[^\d]/g, "");

  return normalized ? `tel:${normalized}` : "";
}

export function detectAppleMapsPreference() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function buildPreferredMapsHref(
  address: string,
  preferAppleMaps: boolean
) {
  const encoded = encodeURIComponent(String(address || "").trim());
  if (!encoded) return "";

  return preferAppleMaps
    ? `http://maps.apple.com/?q=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

export function buildGoogleMapsEmbedSrc(address: string) {
  const encoded = encodeURIComponent(String(address || "").trim());
  if (!encoded) return "";

  return `https://www.google.com/maps?q=${encoded}&z=13&output=embed`;
}