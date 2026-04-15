// src/lib/time-format.ts
export function formatTime12h(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";

  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;

  const hours = Number(match[1]);
  const minutes = match[2];

  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return raw;

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${minutes} ${period}`;
}

export function formatTimeRange12h(start?: string | null, end?: string | null) {
  const startRaw = String(start ?? "").trim();
  const endRaw = String(end ?? "").trim();

  if (!startRaw && !endRaw) return "";

  if (startRaw && endRaw) {
    return `${formatTime12h(startRaw)} – ${formatTime12h(endRaw)}`;
  }

  if (startRaw) return `Starts ${formatTime12h(startRaw)}`;
  return `Until ${formatTime12h(endRaw)}`;
}

export function formatDateTimeRange12h(
  date?: string | null,
  start?: string | null,
  end?: string | null
) {
  const datePart = String(date ?? "").trim();
  const timePart = formatTimeRange12h(start, end);

  if (!datePart && !timePart) return "Unscheduled";
  if (datePart && timePart) return `${datePart} • ${timePart}`;
  return datePart || timePart || "Unscheduled";
}