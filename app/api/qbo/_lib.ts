// app/api/qbo/_lib.ts
import { cookies } from "next/headers";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
};

export async function getQboCookieValues() {
  const store = await cookies();
  const accessToken = store.get("dcflow_qbo_access_token")?.value || "";
  const refreshToken = store.get("dcflow_qbo_refresh_token")?.value || "";
  const realmId = store.get("dcflow_qbo_realm_id")?.value || "";
  const connectedAt = store.get("dcflow_qbo_connected_at")?.value || "";
  const scopes = store.get("dcflow_qbo_scopes")?.value || "";

  return { accessToken, refreshToken, realmId, connectedAt, scopes };
}

export function getQboApiBaseUrl() {
  return process.env.QBO_API_BASE_URL || "https://quickbooks.api.intuit.com";
}

export async function refreshQboAccessToken() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const tokenUrl =
    process.env.QBO_TOKEN_URL ||
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

  if (!clientId || !clientSecret) {
    throw new Error("Missing QBO_CLIENT_ID or QBO_CLIENT_SECRET in env vars.");
  }

  const { refreshToken } = await getQboCookieValues();

  if (!refreshToken) {
    throw new Error("No refresh token found. Reconnect QuickBooks.");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
    cache: "no-store",
  });

  const raw = await res.text();
  let body: TokenResponse | { [k: string]: unknown };

  try {
    body = JSON.parse(raw);
  } catch {
    body = { raw };
  }

  if (!res.ok) {
    const tid = res.headers.get("intuit_tid") || "";
    throw new Error(
      `Token refresh failed (status ${res.status}). intuit_tid=${tid || "n/a"}`
    );
  }

  const access_token =
    "access_token" in body && typeof body.access_token === "string"
      ? body.access_token
      : "";
  const refresh_token =
    "refresh_token" in body && typeof body.refresh_token === "string"
      ? body.refresh_token
      : undefined;
  const expires_in =
    "expires_in" in body && typeof body.expires_in === "number"
      ? body.expires_in
      : 3600;
  const refresh_expires_in =
    "x_refresh_token_expires_in" in body &&
    typeof body.x_refresh_token_expires_in === "number"
      ? body.x_refresh_token_expires_in
      : 60 * 60 * 24 * 100;

  if (!access_token) {
    throw new Error("Token refresh succeeded but no access_token returned.");
  }

  // Update cookies (HTTP-only, secure)
  const store = await cookies();
  store.set("dcflow_qbo_access_token", access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: expires_in,
  });

  // Intuit sometimes rotates refresh tokens. If returned, store it.
  if (refresh_token) {
    store.set("dcflow_qbo_refresh_token", refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: refresh_expires_in,
    });
  }

  return {
    accessToken: access_token,
    refreshToken: refresh_token || refreshToken,
    expiresIn: expires_in,
    refreshExpiresIn: refresh_expires_in,
    intuitTid: res.headers.get("intuit_tid") || "",
  };
}

export async function qboFetchWithAutoRefresh(url: string, init?: RequestInit) {
  const { accessToken } = await getQboCookieValues();
  if (!accessToken) {
    throw new Error("Not connected to QuickBooks (missing access token).");
  }

  const doFetch = async (token: string) => {
    const res = await fetch(url, {
      ...(init || {}),
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }

    return {
      res,
      body: json,
      intuitTid: res.headers.get("intuit_tid") || "",
    };
  };

  // First attempt
  let first = await doFetch(accessToken);

  // If unauthorized, refresh once and retry
  if (first.res.status === 401) {
    const refreshed = await refreshQboAccessToken();
    const second = await doFetch(refreshed.accessToken);
    return { attempt: "refreshed", ...second };
  }

  return { attempt: "original", ...first };
}