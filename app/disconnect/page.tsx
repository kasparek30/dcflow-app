// app/disconnect/page.tsx
import Link from "next/link";

export default function DisconnectPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          border: "1px solid #ddd",
          borderRadius: "16px",
          padding: "24px",
          background: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: 900, marginTop: 0 }}>
          QuickBooks Disconnected
        </h1>

        <p style={{ color: "#555", lineHeight: 1.5 }}>
          Your QuickBooks connection has been cleared from this browser session.
        </p>

        <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            href="/settings/integrations/quickbooks"
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
            Back to QuickBooks Settings
          </Link>

          <Link
            href="/login"
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
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  );
}