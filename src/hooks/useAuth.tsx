"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { app, db } from '@/lib/firebase';
import { UserRole } from '@/types/user';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isOwner: boolean;
  refreshRole: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  isAdmin: false,
  isStaff: false,
  isOwner: false,
  refreshRole: async () => {},
  getIdToken: async () => null,
  authFetch: async (input, init) => fetch(input, init)
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveUserRole = async (currentUser: User): Promise<UserRole> => {
    try {
      // 1. Check custom user claims from ID Token
      const tokenResult = await currentUser.getIdTokenResult();
      if (tokenResult.claims.role) {
        const claimRole = tokenResult.claims.role as string;
        if (claimRole === 'Admin') return 'Admin';
        if (claimRole === 'Conductor' || claimRole === 'Driver') return 'Conductor';
        if (claimRole === 'Owner') return 'Owner';
      }

      // 2. Check users/{uid} in Realtime Database
      const userSnap = await get(ref(db, `users/${currentUser.uid}`));
      if (userSnap.exists()) {
        const userData = userSnap.val();
        const rawRole = userData.role;
        if (rawRole === 'Admin') return 'Admin';
        if (rawRole === 'Conductor') return 'Conductor';
        if (rawRole === 'Owner') return 'Owner';
        if (rawRole === 'Passenger' || rawRole === 'USER') return 'Passenger';
      }

      // 3. Check owners/{uid} in Realtime Database
      const ownerSnap = await get(ref(db, `owners/${currentUser.uid}`));
      if (ownerSnap.exists()) {
        return 'Owner';
      }

      return 'Passenger';
    } catch (err) {
      console.error("Failed to resolve user role:", err);
      return 'Passenger';
    }
  };

  const refreshRole = async () => {
    if (!user) return;
    const resolvedRole = await resolveUserRole(user);
    setRole(resolvedRole);
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch (err) {
      console.error("Failed to get ID token:", err);
      return null;
    }
  };

  const authFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = await getIdToken();
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, {
      ...init,
      headers
    });
  };

  useEffect(() => {
    const auth = getAuth(app);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const resolvedRole = await resolveUserRole(currentUser);
        setRole(resolvedRole);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isAdmin = role === 'Admin';
  const isStaff = role === 'Admin' || role === 'Conductor' || role === 'Owner';
  const isOwner = role === 'Owner';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        isAdmin,
        isStaff,
        isOwner,
        refreshRole,
        getIdToken,
        authFetch
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
