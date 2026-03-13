// components/ProtectedPage.tsx
"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "../src/context/auth-context";
import { signOut } from "firebase/auth";
import { auth } from "../src/lib/firebase";

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

  const { loading, error, authUser, appUser } = useAuthContext();

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

  // Redirect if definitely not logged in
  useEffect(() => {
    if (isLoginRoute) return;
    if (!authGraceExpired) return;
    if (loading) return;
    if (isLoggedIn) return;

    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [isLoginRoute, authGraceExpired, loading, isLoggedIn, router, pathname]);

  const roleAllowed = useMemo(() => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const role = String(appUser?.role || "").trim();
    return Boolean(role) && allowedRoles.includes(role);
  }, [allowedRoles, appUser?.role]);

  useEffect(() => {
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (!loading && isLoggedIn && appUser && !roleAllowed) {
      router.replace("/dashboard");
    }
  }, [allowedRoles, loading, isLoggedIn, appUser, roleAllowed, router]);

  // ✅ Loading UX: use the ACTUAL auth-context loading flag
  if (!isLoginRoute && (loading || (!authGraceExpired && !isLoggedIn))) {
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

  // Always allow login page to render
  if (isLoginRoute) return <>{children}</>;

  // If not logged in (after grace + not loading), show redirecting
  if (authGraceExpired && !loading && !isLoggedIn) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Redirecting…</h1>
      </div>
    );
  }

  // ✅ If logged in but user profile failed to load, STOP infinite loading and show the real problem
  if (isLoggedIn && !appUser) {
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>
          Couldn’t load your DCFlow user profile
        </h1>

        <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
          Firebase login succeeded, but DCFlow couldn’t read your profile doc in Firestore:
        </div>

        <div
          style={{
            marginTop: 10,
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            background: "#fafafa",
            fontSize: 13,
            color: "#333",
            whiteSpace: "pre-wrap",
          }}
        >
          {error || "Unknown error."}
          {"\n\n"}
          Fix: ensure Firestore allows reading users/{"{uid}"} and that a document exists for this UID:
          {"\n"}
          <strong>{`users/${authUser?.uid}`}</strong>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={async () => {
              await signOut(auth);
              router.replace("/login");
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Logout
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  // Role gating (avoid flash)
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