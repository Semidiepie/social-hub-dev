import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get("/auth/me");
      setUser(me);
    } catch (err) {
      // Only wipe the token on real auth failures (401/403). Network errors
      // shouldn't silently sign the user out on flaky connections.
      const msg = String(err?.message || "");
      if (/401|403|Not authenticated|Invalid token|User not found/i.test(msg)) {
        clearToken();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const resp = await api.post("/auth/login", { email, password }, false);
    setToken(resp.access_token);
    setUser(resp.user);
    return resp.user;
  }, []);

  const register = useCallback(async (payload) => {
    const resp = await api.post("/auth/register", payload, false);
    setToken(resp.access_token);
    setUser(resp.user);
    return resp.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const patchUser = useCallback((patch) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, patchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
