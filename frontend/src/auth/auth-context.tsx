import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { api, TOKEN_KEY, type User } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: {
    email: string;
    password: string;
    name: string;
    position?: string;
    department?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      await storage.secureRemove(TOKEN_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadMe();
      setIsLoading(false);
    })();
  }, [loadMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.post<{ access_token: string }>("/auth/login", {
      email: email.trim().toLowerCase(),
      password,
    });
    await storage.secureSet(TOKEN_KEY, access_token);
    const me = await api.get<User>("/auth/me");
    setUser(me);
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (payload) => {
      await api.post<User>("/auth/register", {
        ...payload,
        email: payload.email.trim().toLowerCase(),
      });
      await signIn(payload.email, payload.password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, signIn, signUp, signOut, refreshUser: loadMe }),
    [user, isLoading, signIn, signUp, signOut, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
