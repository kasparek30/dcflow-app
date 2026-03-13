// app/api/qbo/_lib.ts
import { adminDb } from "./admin-db";

type QboTokenDoc = {
  realmId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string; // ISO
  updatedAt?: string;

  // optional metadata
  scopes?: string;
  connectedAt?: string;
  refreshTokenExpiresAt?: string | null;
  source?: string;
};

type AttemptValue = "original" | "refreshed";

function nowIso() {
  return new Date().toISOString();
}

function addSecondsToIso(seconds: number) {
  const d = new Date();
  d.setSeconds(d.getSeconds() + seconds);
  return d.toISOString();
}

function isExpired(expiresAtIso?: string) {
  if (!expiresAtIso) return true;
  const t = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(t)) return true;

  // refresh a bit early
  const skewMs = 60_000;
  return Date.now() + skewMs >= t;
}

/**
 * Shared company-wide QBO connection doc.
 * integrations/qbo
 */
async function getSharedQboTokens(): Promise<QboTokenDoc> {
  const db = adminDb();
  const ref = db.collection("integrations").doc("qbo");
  const snap = await ref.get();
  return (snap.exists ? (snap.data() as QboTokenDoc) : {}) || {};
}

async function setSharedQboTokens(patch: Partial<QboTokenDoc>) {
  const db = adminDb();
  const ref = db.collection("integrations").doc("qbo");
  await ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
}

export function getQboApiBaseUrl() {
  return "https://quickbooks.api.intuit.com";
}

/**
 * Backward-compatible name used across routes.
 * Now reads the shared integration doc (NOT per-user cookies).
 */
export async function getQboCookieValues(): Promise<{ realmId: string | null }> {
  const shared = await getSharedQboTokens();
  const realmId = String(shared.realmId || "").trim();
  return { realmId: realmId || null };
}

export function getQboCompanyUiBaseUrl() {
  return "https://qbo.intuit.com";
}

/**
 * ✅ EXPORT THIS (your build error is because it wasn't exported)
 * Refresh tokens using Intuit OAuth endpoint.
 * Uses env vars:
 * - QBO_CLIENT_ID
 * - QBO_CLIENT_SECRET
 */
export async function refreshQboAccessToken(refreshToken: string) {
  const clientId =
    process.env.QBO_CLIENT_ID || process.env.NEXT_PUBLIC_QBO_CLIENT_ID || "";
  const clientSecret = process.env.QBO_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing QBO_CLIENT_ID or QBO_CLIENT_SECRET environment variables."
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
      cache: "no-store",
    }
  );

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      (body as any)?.error_description ||
      (body as any)?.error ||
      "Token refresh failed.";
    throw new Error(`QBO token refresh failed: ${msg}`);
  }

  const accessToken = String((body as any)?.access_token || "");
  const newRefreshToken = String((body as any)?.refresh_token || "");
  const expiresIn = Number((body as any)?.expires_in || 0);

  if (!accessToken || !newRefreshToken || !expiresIn) {
    throw new Error(
      "QBO refresh response missing access_token/refresh_token/expires_in."
    );
  }

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresAt: addSecondsToIso(expiresIn),
  };
}

/**
 * Shared fetch wrapper:
 * - reads shared tokens from Firestore
 * - refreshes if expired
 * - retries once automatically
 */
export async function qboFetchWithAutoRefresh(
  url: string,
  init?: RequestInit
): Promise<{ res: Response; body: any; intuitTid?: string; attempt: AttemptValue }> {
  const shared = await getSharedQboTokens();

  const realmId = String(shared.realmId || "").trim();
  const accessToken = String(shared.accessToken || "").trim();
  const refreshToken = String(shared.refreshToken || "").trim();

  if (!realmId) {
    throw new Error("Not connected to QuickBooks (missing realmId).");
  }
  if (!accessToken || !refreshToken) {
    throw new Error("Not connected to QuickBooks (missing access/refresh token).");
  }

  async function doFetch(token: string) {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const intuitTid = res.headers.get("intuit_tid") || undefined;
    const body = await res.json().catch(() => ({}));
    return { res, body, intuitTid };
  }

  // refresh first if expired
  if (isExpired(shared.expiresAt)) {
    const refreshed = await refreshQboAccessToken(refreshToken);
    await setSharedQboTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    });

    const { res, body, intuitTid } = await doFetch(refreshed.accessToken);
    return { res, body, intuitTid, attempt: "refreshed" };
  }

  // try original token
  const first = await doFetch(accessToken);

  // if unauthorized, refresh once and retry
  if (first.res.status === 401) {
    const refreshed = await refreshQboAccessToken(refreshToken);
    await setSharedQboTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    });

    const second = await doFetch(refreshed.accessToken);
    return { ...second, attempt: "refreshed" };
  }

  return { ...first, attempt: "original" };
}

/**
 * ✅ Convenience for /api/qbo/refresh route
 */
export async function forceRefreshSharedQboTokens() {
  const shared = await getSharedQboTokens();
  const realmId = String(shared.realmId || "").trim();
  const refreshToken = String(shared.refreshToken || "").trim();

  if (!realmId) throw new Error("Not connected to QuickBooks (missing realmId).");
  if (!refreshToken) throw new Error("Not connected to QuickBooks (missing refresh token).");

  const refreshed = await refreshQboAccessToken(refreshToken);

  await setSharedQboTokens({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  });

  return {
    realmId,
    expiresAt: refreshed.expiresAt,
  };
}