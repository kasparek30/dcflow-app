"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../src/context/auth-context";
import type { UserRole } from "../src/types/app-user";

type ProtectedPageProps = {
  children: ReactNode;
  allowedRoles?: UserRole[];
  fallbackTitle?: string;
};

export default function ProtectedPage({
  children,
  allowedRoles,
  fallbackTitle = "Access",
}: ProtectedPageProps) {
  const router = useRouter();
  const { loading, authUser, appUser, error } = useAuthContext();

  useEffect(() => {
    if (!loading && !authUser) {
      router.push("/login");
    }
  }, [loading, authUser, router]);

  if (loading) {
    return <main style={{ padding: "24px" }}>Loading...</main>;
  }

  if (!authUser) {
    return <main style={{ padding: "24px" }}>Redirecting to login...</main>;
  }

  if (error) {
    return (
      <main style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>{fallbackTitle}</h1>
        <p style={{ color: "red", marginTop: "12px" }}>{error}</p>
      </main>
    );
  }

  if (!appUser) {
    return (
      <main style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>{fallbackTitle}</h1>
        <p style={{ color: "red", marginTop: "12px" }}>
          No matching DCFlow user profile found.
        </p>
      </main>
    );
  }

  if (!appUser.active) {
    return (
      <main style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>{fallbackTitle}</h1>
        <p style={{ color: "red", marginTop: "12px" }}>
          Your account is inactive.
        </p>
      </main>
    );
  }

  if (allowedRoles && !allowedRoles.includes(appUser.role)) {
    return (
      <main style={{ padding: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>{fallbackTitle}</h1>
        <p style={{ color: "red", marginTop: "12px" }}>
          Access denied.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}