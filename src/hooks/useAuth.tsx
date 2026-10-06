"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { UserRole } from '@/types/user';

export interface AppUser {
  uid: string;
  id: string;
  email?: string;
  displayName?: string;
  phone?: string;
}

interface AuthContextType {
  user: AppUser | null;
  role: UserRole | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isOwner: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
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
  signOut: async () => {},
  getIdToken: async () => null,
  authFetch: async (input, init) => fetch(input, init)
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveUserRole = useCallback(async (userId: string): Promise<UserRole> => {
    try {
      // 1. Check profiles table in Supabase
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.role) {
        return profile.role as UserRole;
      }

      // 2. Check owners table
      const { data: owner } = await supabase
        .from('owners')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (owner) {
        return 'Owner';
      }

      return 'Passenger';
    } catch (err) {
      console.error("Failed to resolve user role:", err);
      return 'Passenger';
    }
  }, []);

  const refreshRole = async () => {
    if (!user) return;
    const resolvedRole = await resolveUserRole(user.uid);
    setRole(resolvedRole);
  };

  const getIdToken = async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch (err) {
      console.error("Failed to get Supabase session token:", err);
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
    let isMounted = true;

    // 1. Initial session load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;

      if (session?.user) {
        const u = session.user;
        const appUser: AppUser = {
          uid: u.id,
          id: u.id,
          email: u.email || undefined,
          displayName: (u.user_metadata?.name || u.user_metadata?.displayName || u.user_metadata?.full_name) as string | undefined,
          phone: u.phone || (u.user_metadata?.phone as string | undefined)
        };
        setUser(appUser);
        const resolvedRole = await resolveUserRole(u.id);
        if (isMounted) setRole(resolvedRole);
      } else {
        setUser(null);
        setRole(null);
      }
      if (isMounted) setLoading(false);
    }).catch(err => {
      console.error("Error getting Supabase session:", err);
      if (isMounted) setLoading(false);
    });

    // 2. Real-time auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;

      if (session?.user) {
        const u = session.user;
        const appUser: AppUser = {
          uid: u.id,
          id: u.id,
          email: u.email || undefined,
          displayName: (u.user_metadata?.name || u.user_metadata?.displayName || u.user_metadata?.full_name) as string | undefined,
          phone: u.phone || (u.user_metadata?.phone as string | undefined)
        };
        setUser(appUser);
        const resolvedRole = await resolveUserRole(u.id);
        if (isMounted) setRole(resolvedRole);
      } else {
        setUser(null);
        setRole(null);
      }
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [resolveUserRole]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
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
        signOut,
        getIdToken,
        authFetch
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
