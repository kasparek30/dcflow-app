// app/settings/integrations/quickbooks/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../../components/AppShell";
import ProtectedPage from "../../../../components/ProtectedPage";
import { useAuthContext } from "../../../../src/context/auth-context";

type QBOStatusResponse = {
  connected: boolean;
  realmId?: string;
  connectedAt?: string;
  scopes?: string;
};

export default function QuickBooksIntegrationPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<QBOStatusResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch("/api/qbo/status", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await res.json()) as QBOStatusResponse & { error?: string };

        if (!res.ok) {
          setError(data.error || "Failed to load QuickBooks connection status.");
          return;
        }

        setStatus(data);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load QuickBooks connection status.");
        }
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, []);

  return (
    <ProtectedPage fallbackTitle="QuickBooks Integration">
      <AppShell appUser={appUser}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0 }}>
              QuickBooks Integration
            </h1>
            <p style={{ marginTop: "6px", color: "#666", fontSize: "13px" }}>
              Connect DCFlow to your live QuickBooks Online company.
            </p>
          </div>

          <Link
            href="/admin"
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "10px",
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            Back to Admin
          </Link>
        </div>

        {loading ? <p>Loading QuickBooks status...</p> : null}
        {error ? <p style={{ color: "red" }}>{error}</p> : null}

        {!loading && !error ? (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "16px",
              background: "#fafafa",
              maxWidth: "860px",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: "18px" }}>
              Connection Status
            </div>

            <div style={{ fontSize: "14px", color: "#444" }}>
              Connected: <strong>{status?.connected ? "Yes" : "No"}</strong>
            </div>

            <div style={{ fontSize: "14px", color: "#444" }}>
              Realm ID: <strong>{status?.realmId || "—"}</strong>
            </div>

            <div style={{ fontSize: "14px", color: "#444" }}>
              Connected At: <strong>{status?.connectedAt || "—"}</strong>
            </div>

            <div style={{ fontSize: "14px", color: "#444" }}>
              Scopes: <strong>{status?.scopes || "—"}</strong>
            </div>

            <div style={{ fontSize: "12px", color: "#666" }}>
              For this first production pass, the QuickBooks connection is stored in secure HTTP-only cookies so we can prove the OAuth flow works end-to-end.
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <a
                href="/api/qbo/connect"
                style={{
                  padding: "10px 14px",
                  border: "1px solid #ccc",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "inherit",
                  background: "white",
                  fontWeight: 800,
                }}
              >
                {status?.connected ? "Reconnect QuickBooks" : "Connect QuickBooks"}
              </a>

              {status?.connected ? (
                <a
                  href="/api/qbo/disconnect"
                  style={{
                    padding: "10px 14px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    textDecoration: "none",
                    color: "inherit",
                    background: "white",
                    fontWeight: 800,
                  }}
                >
                  Disconnect QuickBooks
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}