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
  const { authUser, appUser } = useAuthContext();

  // ✅ Give Firebase auth a chance to rehydrate on page load
  // (prevents redirect loops back to /login immediately after deploy)
  const [authGraceExpired, setAuthGraceExpired] = useState(false);

  useEffect(() => {
    setAuthGraceExpired(false);
    const t = window.setTimeout(() => setAuthGraceExpired(true), 3000);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const isLoginRoute = useMemo(() => {
    return (pathname || "").startsWith("/login");
  }, [pathname]);

  const isLoggedIn = Boolean(authUser?.uid);

  // ✅ Only redirect to /login if:
  // - we are NOT already on /login
  // - auth grace period expired
  // - still not logged in
  useEffect(() => {
    if (isLoginRoute) return;
    if (!authGraceExpired) return;
    if (isLoggedIn) return;

    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [isLoginRoute, authGraceExpired, isLoggedIn, router, pathname]);

  // Role gating
  const roleAllowed = useMemo(() => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const role = String(appUser?.role || "").trim();
    return Boolean(role) && allowedRoles.includes(role);
  }, [allowedRoles, appUser?.role]);

  useEffect(() => {
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (!appUser) return; // wait for profile
    if (!roleAllowed) router.replace("/dashboard");
  }, [allowedRoles, appUser, roleAllowed, router]);

  // Loading UX:
  // - show loading while auth is not settled yet OR appUser not loaded yet
  const showLoading = useMemo(() => {
    if (isLoginRoute) return false;
    if (!authGraceExpired && !isLoggedIn) return true; // auth still settling
    if (isLoggedIn && !appUser) return true; // profile still loading
    return false;
  }, [isLoginRoute, authGraceExpired, isLoggedIn, appUser]);

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

  // If we’re on login route, always allow rendering login page
  if (isLoginRoute) return <>{children}</>;

  // If auth grace expired and still no authUser, we’re redirecting (avoid flash)
  if (authGraceExpired && !isLoggedIn) {
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