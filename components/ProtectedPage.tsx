"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../src/lib/firebase";
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

  // Redirect to /login ONLY when we are sure auth is settled and still not logged in
  useEffect(() => {
    if (isLoginRoute) return;
    if (!authGraceExpired) return;
    if (loading) return;
    if (isLoggedIn) return;

    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [isLoginRoute, authGraceExpired, loading, isLoggedIn, router, pathname]);

  // Role gating
  const roleAllowed = useMemo(() => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const role = String(appUser?.role || "").trim();
    return Boolean(role) && allowedRoles.includes(role);
  }, [allowedRoles, appUser?.role]);

  useEffect(() => {
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (loading) return;
    if (!isLoggedIn) return;
    if (!appUser) return; // wait for profile
    if (!roleAllowed) router.replace("/dashboard");
  }, [allowedRoles, loading, isLoggedIn, appUser, roleAllowed, router]);

  // Allow login page to render freely
  if (isLoginRoute) return <>{children}</>;

  // Show loading while auth is settling OR profile fetch is still in progress
  if (!authGraceExpired || loading) {
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

  // If not logged in after grace + loading complete, show redirecting screen
  if (!isLoggedIn) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Redirecting…</h1>
      </div>
    );
  }

  // Logged in but appUser missing OR error occurred: show the real problem (NO infinite loading)
  if (!appUser) {
    return (
      <div style={{ padding: 24, maxWidth: 760 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>
          Account setup required
        </h1>

        <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          You’re authenticated, but DCFlow can’t load your user profile from Firestore.
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fafafa",
            fontSize: 13,
            color: "#333",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Details</div>
          <div><strong>Auth UID:</strong> {authUser?.uid || "—"}</div>
          <div style={{ marginTop: 6 }}>
            <strong>Error:</strong> {error || "No appUser returned."}
          </div>
          <div style={{ marginTop: 10, color: "#555" }}>
            Fix: create a Firestore document at{" "}
            <strong>users/&lt;your-auth-uid&gt;</strong> with at least:
            <div style={{ marginTop: 8, paddingLeft: 14 }}>
              <div>uid: (same as auth uid)</div>
              <div>displayName: "Name"</div>
              <div>role: "admin" | "dispatcher" | "manager" | "technician" | ...</div>
              <div>active: true</div>
            </div>
          </div>
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
            Sign out
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

  // If role gated and not allowed, avoid flashing protected content
  if (allowedRoles && allowedRoles.length > 0 && !roleAllowed) {
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