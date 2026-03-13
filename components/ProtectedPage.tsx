"use client";

import React, { ReactNode, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "../src/context/auth-context";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
  allowedRoles?: string[];
};

export default function ProtectedPage({
  children,
  fallbackTitle = "Page",
  allowedRoles,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const {
    initialized,
    loading,
    authUser,
    appUser,
    missingProfile,
    error,
  } = useAuthContext();

  const isLoginRoute = useMemo(() => {
    return (pathname || "").startsWith("/login");
  }, [pathname]);

  const isLoggedIn = Boolean(authUser?.uid);

  // -----------------------------
  // Redirect unauthenticated users -> /login
  // -----------------------------
  useEffect(() => {
    if (isLoginRoute) return;

    // Wait until Firebase has fired at least once AND any profile fetch is done
    if (!initialized) return;
    if (loading) return;

    // If not logged in, go to login
    if (!isLoggedIn) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [isLoginRoute, initialized, loading, isLoggedIn, router, pathname]);

  // -----------------------------
  // Role gating
  // -----------------------------
  const roleAllowed = useMemo(() => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const role = String(appUser?.role || "").trim();
    return Boolean(role) && allowedRoles.includes(role);
  }, [allowedRoles, appUser?.role]);

  useEffect(() => {
    if (!allowedRoles || allowedRoles.length === 0) return;

    // Only decide once auth + profile are settled
    if (!initialized) return;
    if (loading) return;

    // If logged in but no profile, we show the missing profile screen below
    if (missingProfile) return;

    // If profile exists and role not allowed, bounce to dashboard
    if (appUser && !roleAllowed) {
      router.replace("/dashboard");
    }
  }, [allowedRoles, initialized, loading, missingProfile, appUser, roleAllowed, router]);

  // -----------------------------
  // Loading state
  // -----------------------------
  const showLoading = useMemo(() => {
    if (isLoginRoute) return false;
    if (!initialized) return true;
    if (loading) return true;

    // If logged in, and we *expect* a profile but it hasn't arrived yet
    if (isLoggedIn && !appUser && !missingProfile && !error) return true;

    return false;
  }, [isLoginRoute, initialized, loading, isLoggedIn, appUser, missingProfile, error]);

  if (showLoading) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>
          {`Loading ${fallbackTitle}…`}
        </h1>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          Loading your session…
        </div>
      </div>
    );
  }

  // Always allow /login to render
  if (isLoginRoute) return <>{children}</>;

  // If signed in but user profile is missing, stop redirect loops and show a clear message.
  if (isLoggedIn && missingProfile) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Account not set up</h1>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          Your Firebase login is valid, but DCFlow can’t find your user profile in Firestore.
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "red" }}>
          {error || "Missing /users/{uid} profile."}
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
          Fix: create a document in <strong>Firestore → users</strong> with ID{" "}
          <strong>{authUser?.uid}</strong> and fields like <code>role</code>,{" "}
          <code>displayName</code>, <code>active</code>.
        </div>
      </div>
    );
  }

  // If not logged in after initialization, we are redirecting (avoid flash)
  if (initialized && !loading && !isLoggedIn) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Redirecting…</h1>
      </div>
    );
  }

  // If role gated and not allowed, avoid flashing protected content
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

  return <>{children}</>;
}