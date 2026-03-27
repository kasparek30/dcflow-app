// components/LogoutButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import React, { useState } from "react";
import { Button } from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
    <Button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      fullWidth
      variant="outlined"
      startIcon={<LogoutRoundedIcon />}
      sx={{
        justifyContent: "flex-start",
        minHeight: 52,
        borderRadius: 3.5,
        px: 1.5,
        fontWeight: 900,
        color: "#ff6b73",
        borderColor: "rgba(255, 107, 115, 0.34)",
        backgroundColor: "rgba(255, 42, 54, 0.08)",
        "&:hover": {
          borderColor: "rgba(255, 107, 115, 0.5)",
          backgroundColor: "rgba(255, 42, 54, 0.14)",
        },
        "&.Mui-disabled": {
          color: "rgba(255,255,255,0.4)",
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.04)",
        },
      }}
      aria-label="Log out"
    >
      {busy ? "Logging out..." : "Log Out"}
    </Button>
  );
}