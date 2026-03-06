// app/api/qbo/pto/_util.ts

export function safeJsonPreview(value: unknown, maxChars = 3500) {
  try {
    const json = JSON.stringify(value, null, 2);
    if (json.length <= maxChars) return json;
    return json.slice(0, maxChars) + "\n...<truncated>";
  } catch {
    return String(value).slice(0, maxChars);
  }
}

export function pickKeys(obj: any, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}