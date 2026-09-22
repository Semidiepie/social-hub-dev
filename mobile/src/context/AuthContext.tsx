import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api, clearToken, getToken, setToken, UserPublic } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

interface AuthCtx {
  user: UserPublic | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithPin: (identifier: string, pin: string) => Promise<void>;
  register: (email: string, username: string, password: string, displayName: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

const PUSH_TOKEN_CACHE_KEY = "postmeplex.pushtoken";
const LAST_ACCOUNT_KEY = "postmeplex.lastAccount";

export interface LastAccount {
  identifier: string;
  display_name: string;
  avatar_url: string;
}

export async function getLastAccount(): Promise<LastAccount | null> {
  try {
    return await storage.getItem<LastAccount | null>(LAST_ACCOUNT_KEY, null);
  } catch {
    return null;
  }
}
async function rememberAccount(u: UserPublic) {
  try {
    await storage.setItem(LAST_ACCOUNT_KEY, {
      identifier: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url || "",
    });
  } catch {
    // ignore
  }
}
export async function forgetAccount() {
  try {
    await storage.removeItem(LAST_ACCOUNT_KEY);
  } catch {
    // ignore
  }
}

/** Small helper: sleep for `ms` milliseconds. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Grab the native APNs/FCM device token with retries.
 *
 * On iOS, `getDevicePushTokenAsync()` can race with APNs registration on
 * cold start — the OS may not have handed the token to the JS runtime yet.
 * Retrying a few times with backoff makes this deterministic on real hardware.
 */
async function fetchDeviceTokenWithRetry(): Promise<string | null> {
  const delays = [0, 500, 1500, 3000]; // ~5s total worst case
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);
    try {
      const t = await Notifications.getDevicePushTokenAsync();
      if (t?.data) return String(t.data);
      console.log(`[push] token attempt ${attempt + 1}: empty, retrying…`);
    } catch (e) {
      console.log(`[push] token attempt ${attempt + 1} threw:`, e);
    }
  }
  return null;
}

/**
 * Ensure the current device is registered with our backend for this user.
 *
 * - Web / simulator: no-op.
 * - Permission not granted (and cannot ask again): no-op — we don't nag.
 * - Token acquisition retried up to 4 times to handle iOS APNs race conditions.
 * - Result cached to AsyncStorage so we skip redundant network calls when the
 *   token hasn't changed and the user hasn't switched accounts.
 */
async function registerPush(userId: string, force = false) {
  if (Platform.OS === "web") {
    console.log("[push] skipped: web platform");
    return;
  }
  if (!Device.isDevice) {
    console.log("[push] skipped: not a physical device");
    return;
  }
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted" && existing.canAskAgain !== false) {
      const req = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      status = req.status;
    }
    if (status !== "granted") {
      console.log(`[push] permission not granted (status=${status})`);
      return;
    }
    const token = await fetchDeviceTokenWithRetry();
    if (!token) {
      console.warn("[push] failed to obtain device token after retries");
      return;
    }
    // Skip re-registration when nothing has changed. This still runs the
    // upstream call on every fresh install / logout-login / token rotation.
    const cachedRaw = await storage.getItem<string>(PUSH_TOKEN_CACHE_KEY, "");
    let cached: { userId: string; token: string; at: number } | null = null;
    if (cachedRaw) {
      try {
        cached = JSON.parse(cachedRaw);
      } catch {
        cached = null;
      }
    }
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const isFresh =
      cached &&
      cached.userId === userId &&
      cached.token === token &&
      Date.now() - cached.at < oneWeekMs;
    if (isFresh && !force) {
      console.log(`[push] token cache hit, skipping backend register (userId=${userId})`);
      return;
    }
    console.log(
      `[push] registering ${Platform.OS} device token (${token.slice(0, 12)}…) for user=${userId}`,
    );
    const result = await api.post<{ status: string; reason?: string }>(
      "/register-push",
      { user_id: userId, platform: Platform.OS, device_token: token },
      true,
    );
    console.log(`[push] register-push result:`, result);
    if (result?.status === "registered" || result?.status === "skipped") {
      await storage.setItem(
        PUSH_TOKEN_CACHE_KEY,
        JSON.stringify({ userId, token, at: Date.now() }),
      );
    }
  } catch (e) {
    console.warn("[push] register failed (non-blocking)", e);
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.get<UserPublic>("/auth/me");
      setUser(me);
      // Re-register on every app open — device tokens can rotate.
      registerPush(me.id);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Re-register the push token when the app comes back to the foreground.
  // iOS can rotate tokens between sessions; refreshing on each foreground
  // ensures we never drift.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active" && user?.id) {
        registerPush(user.id);
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    const resp = await api.post<{ access_token: string; user: UserPublic }>(
      "/auth/login",
      { email, password },
      false,
    );
    await setToken(resp.access_token);
    setUser(resp.user);
    await rememberAccount(resp.user);
    registerPush(resp.user.id, true);
  }, []);

  const loginWithPin = useCallback(async (identifier: string, pin: string) => {
    const resp = await api.post<{ access_token: string; user: UserPublic }>(
      "/auth/login-pin",
      { identifier: identifier.trim().toLowerCase(), pin },
      false,
    );
    await setToken(resp.access_token);
    setUser(resp.user);
    await rememberAccount(resp.user);
    registerPush(resp.user.id, true);
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string, displayName: string, pin: string) => {
      const resp = await api.post<{ access_token: string; user: UserPublic }>(
        "/auth/register",
        { email, username, password, display_name: displayName, pin },
        false,
      );
      await setToken(resp.access_token);
      setUser(resp.user);
      await rememberAccount(resp.user);
      registerPush(resp.user.id, true);
    },
    [],
  );

  const logout = useCallback(async () => {
    // Clear the cached push registration so the next user gets a fresh
    // upstream register call (rather than a false "cache hit").
    try {
      await storage.removeItem(PUSH_TOKEN_CACHE_KEY);
    } catch {
      // ignore
    }
    await clearToken();
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithPin, register, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
