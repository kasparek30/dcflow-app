// components/ProtectedPage.tsx
"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../src/context/auth-context";

type ProtectedPageProps = {
  children: ReactNode;
  fallbackTitle?: string;
  allowedRoles?: string[];
};

export default function ProtectedPage({
  children,
  fallbackTitle = "Protected Page",
  allowedRoles,
}: ProtectedPageProps) {
  const router = useRouter();
  const { appUser, loading } = useAuthContext();

  useEffect(() => {
    if (loading) return;

    if (!appUser) {
      router.replace("/login");
      return;
    }

    if (
      allowedRoles &&
      allowedRoles.length > 0 &&
      !allowedRoles.includes(appUser.role)
    ) {
      router.replace("/dashboard");
    }
  }, [appUser, loading, allowedRoles, router]);

  if (loading) {
    return <main style={{ padding: "24px" }}>Loading {fallbackTitle}...</main>;
  }

  if (!appUser) {
    return <main style={{ padding: "24px" }}>Redirecting to login...</main>;
  }

  if (
    allowedRoles &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(appUser.role)
  ) {
    return <main style={{ padding: "24px" }}>Redirecting...</main>;
  }

  return <>{children}</>;
}