// app/admin/qbo-link-users/page.tsx
"use client";

import { useState } from "react";
import AppShell from "../../../components/AppShell";
import ProtectedPage from "../../../components/ProtectedPage";
import { useAuthContext } from "../../../src/context/auth-context";

export default function QboLinkUsersPage() {
  const { appUser } = useAuthContext();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function runLink() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/qbo/employees/link-users", {
        method: "POST",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Linking failed.");
        setResult(data);
        return;
      }

      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Linking failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedPage fallbackTitle="QBO Link Users" allowedRoles={["admin"]}>
      <AppShell appUser={appUser}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginTop: 0 }}>
          Link DCFlow Users ↔ QBO Employees (v1)
        </h1>

        <p style={{ color: "#666", marginTop: "6px" }}>
          Matches <strong>users.email</strong> to <strong>qboEmployees.email</strong> and writes
          QBO fields onto each user doc.
        </p>

        <button
          onClick={runLink}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1px solid #ccc",
            background: "white",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {loading ? "Linking..." : "Run Link Users Now"}
        </button>

        {error ? (
          <p style={{ marginTop: "16px", color: "red" }}>{error}</p>
        ) : null}

        {result ? (
          <pre
            style={{
              marginTop: "16px",
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "12px",
              background: "#fafafa",
              overflowX: "auto",
              fontSize: "12px",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </AppShell>
    </ProtectedPage>
  );
}