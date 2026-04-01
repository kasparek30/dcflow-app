// components/ProtectedPage.tsx
"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../src/lib/firebase";
import { useAuthContext } from "../src/context/auth-context";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
  allowedRoles?: string[];
};

function normalizeRole(role: unknown) {
  return String(role ?? "").trim().toLowerCase();
}

function getDefaultRouteForRole(role: string) {
  if (
    [
      "admin",
      "dispatcher",
      "manager",
      "billing",
      "office_display",
    ].includes(role)
  ) {
    return "/dashboard";
  }

  if (["technician", "helper", "apprentice"].includes(role)) {
    return "/technician/my-day";
  }

  return "/login";
}

export default function ProtectedPage({
  children,
  fallbackTitle = "Page",
  allowedRoles,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const { loading, error, authUser, appUser } = useAuthContext();

  const isLoginRoute = (pathname || "").startsWith("/login");
  const isLoggedIn = Boolean(authUser?.uid);

  const normalizedRole = normalizeRole(appUser?.role);
  const normalizedAllowedRoles = (allowedRoles || [])
    .map((r) => normalizeRole(r))
    .filter(Boolean);

  const requiresRoleCheck = normalizedAllowedRoles.length > 0;

  const roleAllowed = !requiresRoleCheck
    ? true
    : Boolean(normalizedRole) && normalizedAllowedRoles.includes(normalizedRole);

  const unauthorizedRedirectTo = getDefaultRouteForRole(normalizedRole);

  useEffect(() => {
    if (isLoginRoute) return;
    if (loading) return;

    if (!isLoggedIn) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
      return;
    }

    if (authUser && !appUser) {
      return;
    }

    if (requiresRoleCheck && appUser && !roleAllowed) {
      router.replace(unauthorizedRedirectTo);
    }
  }, [
    isLoginRoute,
    loading,
    isLoggedIn,
    pathname,
    router,
    authUser,
    appUser,
    requiresRoleCheck,
    roleAllowed,
    unauthorizedRedirectTo,
  ]);

  if (isLoginRoute) return <>{children}</>;

  if (loading) {
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

  if (!isLoggedIn) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>Redirecting…</h1>
      </div>
    );
  }

  if (isLoggedIn && !appUser) {
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>
          Couldn’t load your DCFlow user profile
        </h1>

        <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
          Firebase login succeeded, but DCFlow couldn’t read your profile doc in
          Firestore:
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
          Fix: ensure Firestore allows reading users/{"{uid}"} and that a
          document exists for this UID:
          {"\n"}
          <strong>{`users/${authUser?.uid}`}</strong>
        </div>

        <div
          style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}
        >
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

  if (requiresRoleCheck && appUser && !roleAllowed) {
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