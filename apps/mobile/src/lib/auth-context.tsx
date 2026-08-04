import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  // Distinguishes "haven't checked yet" from "checked, no session" — the
  // (auth)/(app) route groups both need this to avoid a flash-redirect
  // (briefly bouncing to /login before the initial session check
  // resolves, then bouncing right back once it turns out a session did
  // exist all along).
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, isLoading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, isLoading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
