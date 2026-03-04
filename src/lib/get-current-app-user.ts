import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { AppUser } from "../types/app-user";

export function waitForAuthUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

export async function getCurrentAppUser(): Promise<{
  authUser: User | null;
  appUser: AppUser | null;
}> {
  const authUser = await waitForAuthUser();

  if (!authUser) {
    return { authUser: null, appUser: null };
  }

  const userRef = doc(db, "users", authUser.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    return { authUser, appUser: null };
  }

  return {
    authUser,
    appUser: snap.data() as AppUser,
  };
}