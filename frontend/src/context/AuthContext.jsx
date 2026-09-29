import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken } from "@/lib/api";

const AuthContext = createContext(null);

const LAST_ACCOUNT_KEY = "postmeplex.lastAccount";

export function getLastAccount() {
  try {
    return JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY) || "null");
  } catch {
    return null;
  }
}
function rememberAccount(u) {
  try {
    localStorage.setItem(
      LAST_ACCOUNT_KEY,
      JSON.stringify({ identifier: u.username || u.email, display_name: u.display_name, avatar_url: u.avatar_url }),
    );
  } catch {
    /* ignore */
  }
}
export function forgetAccount() {
  try {
    localStorage.removeItem(LAST_ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}

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

  // Set an authenticated session directly (used by the password-reset flow,
  // which returns a fresh token + user so the user is signed in immediately).
  const setSession = useCallback((accessToken, u) => {
    setToken(accessToken);
    setUser(u);
    setLoading(false);
  }, []);

  const loginWithPin = useCallback(async (identifier, pin) => {
    const resp = await api.post("/auth/login-pin", { identifier: identifier.trim().toLowerCase(), pin }, false);
    setToken(resp.access_token);
    setUser(resp.user);
    rememberAccount(resp.user);
    return resp.user;
  }, []);

  const register = useCallback(async (payload) => {
    const ref = (() => { try { return localStorage.getItem("postmeplex.ref") || undefined; } catch { return undefined; } })();
    const resp = await api.post("/auth/register", { ...payload, ref }, false);
    setToken(resp.access_token);
    setUser(resp.user);
    rememberAccount(resp.user);
    try { localStorage.removeItem("postmeplex.ref"); } catch { /* ignore */ }
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
    <AuthContext.Provider value={{ user, loading, login, loginWithPin, register, logout, refresh, patchUser, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
