"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import React, { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut(auth);
      router.push("/login");
    } catch (e: any) {
      alert(e?.message || "Failed to log out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(225, 29, 72, 0.55)", // red border
        background: hover ? "rgba(225, 29, 72, 0.16)" : "rgba(225, 29, 72, 0.10)",
        color: "#e11d48",
        fontWeight: 950,
        cursor: busy ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        userSelect: "none",
      }}
      title="Log out"
      aria-label="Log out"
    >
      <span style={{ fontSize: 16, lineHeight: "16px" }}>⎋</span>
      {busy ? "Logging out..." : "Log Out"}
    </button>
  );
}