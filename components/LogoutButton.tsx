"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "../src/lib/firebase";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: "8px 14px",
        border: "1px solid #ccc",
        borderRadius: "10px",
        background: "white",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      Log Out
    </button>
  );
}