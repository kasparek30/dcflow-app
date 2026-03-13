"use client";

import React, {
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
  // True while we are determining auth + loading profile
  loading: boolean;

  // True once Firebase has fired at least once (auth state known)
  initialized: boolean;

  authUser: User | null;
  appUser: AppUser | null;

  // If signed in but no user profile doc exists, this becomes true
  missingProfile: boolean;

  error: string;

  // Handy helper if you want a manual refresh later
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  initialized: false,
  authUser: null,
  appUser: null,
  missingProfile: false,
  error: "",
  reloadProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  const [missingProfile, setMissingProfile] = useState(false);
  const [error, setError] = useState("");

  async function loadProfileForUser(user: User) {
    setError("");
    setMissingProfile(false);
    setAppUser(null);

    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        setMissingProfile(true);
        setError("No matching DCFlow user profile found.");
        setAppUser(null);
        return;
      }

      // Ensure uid is present even if doc doesn't include it
      const data = snap.data() as AppUser;
      const normalized: AppUser = {
        ...data,
        uid: (data as any)?.uid ?? user.uid,
        email: (data as any)?.email ?? user.email ?? "",
        displayName: (data as any)?.displayName ?? user.displayName ?? "User",
      } as AppUser;

      setAppUser(normalized);
    } catch (err: unknown) {
      setMissingProfile(false);
      setAppUser(null);
      setError(err instanceof Error ? err.message : "Failed to load user profile.");
    }
  }

  const reloadProfile = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    await loadProfileForUser(auth.currentUser);
    setLoading(false);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setInitialized(true);

      setAuthUser(user);
      setAppUser(null);
      setMissingProfile(false);
      setError("");

      if (!user) {
        setLoading(false);
        return;
      }

      await loadProfileForUser(user);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({
      loading,
      initialized,
      authUser,
      appUser,
      missingProfile,
      error,
      reloadProfile,
    }),
    [loading, initialized, authUser, appUser, missingProfile, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}