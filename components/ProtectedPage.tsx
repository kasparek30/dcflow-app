// components/ProtectedPage.tsx
"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthContext } from "../src/context/auth-context";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
  allowedRoles?: string[]; // ✅ add support for role gating
};

export default function ProtectedPage({
  children,
  fallbackTitle = "Page",
  allowedRoles,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { authUser, appUser } = useAuthContext();

  // If appUser hasn't loaded yet, don't hang forever.
  // We'll allow a short grace period, then render anyway (AppShell supports null appUser).
  const [graceExpired, setGraceExpired] = useState(false);

  useEffect(() => {
    setGraceExpired(false);
    const t = window.setTimeout(() => setGraceExpired(true), 2500);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const isLoggedIn = Boolean(authUser?.uid);

  useEffect(() => {
    // If no auth user, bounce to login.
    // Preserve where they were trying to go.
    if (!isLoggedIn) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [isLoggedIn, router, pathname]);

  const roleAllowed = useMemo(() => {
    if (!allowedRoles || allowedRoles.length === 0) return true; // no gating
    const role = String(appUser?.role || "").trim();
    return role && allowedRoles.includes(role);
  }, [allowedRoles, appUser?.role]);

  useEffect(() => {
    // If role gating is enabled and we have an appUser role, enforce it.
    // (We wait until appUser exists so we don't incorrectly redirect during load.)
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (!appUser) return;

    if (!roleAllowed) {
      router.replace("/dashboard");
    }
  }, [allowedRoles, appUser, roleAllowed, router]);

  const showLoading = useMemo(() => {
    // Show loader only while:
    // - user is logged in AND
    // - we haven't loaded appUser yet AND
    // - grace window has not expired
    return isLoggedIn && !appUser && !graceExpired;
  }, [isLoggedIn, appUser, graceExpired]);

  if (!isLoggedIn) {
    // Redirecting...
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Redirecting…</h1>
      </div>
    );
  }

  if (showLoading) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>
          {`Loading ${fallbackTitle}…`}
        </h1>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          Loading your profile…
        </div>
      </div>
    );
  }

  // If role gating is enabled but appUser is still null after grace,
  // show a friendly message rather than rendering a restricted page.
  if (allowedRoles && allowedRoles.length > 0 && !appUser && graceExpired) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>
          {fallbackTitle}
        </h1>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          Your profile is still loading. Please refresh if this persists.
        </div>
      </div>
    );
  }

  // If role gating is enabled and we know the role is not allowed, avoid flashing content.
  if (allowedRoles && allowedRoles.length > 0 && appUser && !roleAllowed) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Access denied</h1>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          You don’t have permission to view this page.
        </div>
      </div>
    );
  }

  // ✅ Important: render the page even if appUser is still null after grace period,
  // unless role gating is enabled (handled above).
  return <>{children}</>;
}