// components/ProtectedPage.tsx
"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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

  const { loading, authUser, appUser, error } = useAuthContext();

  const isLoginRoute = useMemo(() => {
    return (pathname || "").startsWith("/login");
  }, [pathname]);

  const isLoggedIn = Boolean(authUser?.uid);

  // Give Firebase a moment after deploy/hard refresh to rehydrate auth
  const [authGraceExpired, setAuthGraceExpired] = useState(false);

  useEffect(() => {
    setAuthGraceExpired(false);
    const t = window.setTimeout(() => setAuthGraceExpired(true), 3000);
    return () => window.clearTimeout(t);
  }, [pathname]);

  // Redirect to login only when auth is settled AND still not logged in
  useEffect(() => {
    if (isLoginRoute) return;
    if (!authGraceExpired) return;
    if (loading) return;
    if (isLoggedIn) return;

    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [isLoginRoute, authGraceExpired, loading, isLoggedIn, router, pathname]);

  // Role gating (once profile exists)
  const roleAllowed = useMemo(() => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const role = String(appUser?.role || "").trim();
    return Boolean(role) && allowedRoles.includes(role);
  }, [allowedRoles, appUser?.role]);

  useEffect(() => {
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (!appUser) return; // wait for profile to exist
    if (!roleAllowed) router.replace("/dashboard");
  }, [allowedRoles, appUser, roleAllowed, router]);

  // -------------------------
  // Render logic
  // -------------------------

  // Always allow login page to render
  if (isLoginRoute) return <>{children}</>;

  // Show loading while auth is still settling OR provider is still loading
  const showLoading = useMemo(() => {
    if (!authGraceExpired && !isLoggedIn) return true; // auth settling
    if (loading) return true; // context still loading auth/profile
    return false;
  }, [authGraceExpired, isLoggedIn, loading]);

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

  // If auth is settled and user is not logged in, we’re redirecting
  if (authGraceExpired && !isLoggedIn) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Redirecting…</h1>
      </div>
    );
  }

  // If logged in BUT no appUser, show a real error instead of spinning forever
  if (isLoggedIn && !appUser) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>
          Account not set up
        </h1>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          {error || "No matching DCFlow user profile found in Firestore (users/{uid})."}
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: "#666" }}>
Fix: create a Firestore document at <strong>users/&lt;your-auth-uid&gt;</strong> with fields like:          <div style={{ marginTop: 8, padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fafafa" }}>
            <div><strong>uid</strong>: (same as auth uid)</div>
            <div><strong>displayName</strong>: "Kenn"</div>
            <div><strong>role</strong>: "admin"</div>
            <div><strong>active</strong>: true</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.replace("/login")}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "white",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  // Role gated: show access denied without flashing content
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