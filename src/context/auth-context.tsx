// src/context/auth-context.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { AppUser } from "../types/app-user";

type AuthContextValue = {
  loading: boolean;
  authUser: User | null;
  appUser: AppUser | null;
  error: string;
};

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  authUser: null,
  appUser: null,
  error: "",
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setError("");
      setAuthUser(user);
      setAppUser(null);

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          setError(
            `No matching DCFlow user profile found at users/${user.uid}.`
          );
          setAppUser(null);
          setLoading(false);
          return;
        }

        const data = snap.data() as any;

        // Ensure uid is always present on appUser
        const hydrated: AppUser = {
          uid: data.uid ?? snap.id,
          ...data,
        } as AppUser;

        setAppUser(hydrated);
      } catch (err: unknown) {
        setAppUser(null);
        setError(err instanceof Error ? err.message : "Failed to load user profile.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({
      loading,
      authUser,
      appUser,
      error,
    }),
    [loading, authUser, appUser, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}