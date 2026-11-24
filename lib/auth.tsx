"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { API_URL, api, deviceHeader, getToken, setToken } from "./api";
import { clearApiCache } from "./hooks";
import { isNetworkError, persistClear, persistGet, persistSet } from "./offline";
import { hasPerm, type Permission } from "./permissions";
import type { Role } from "./types";
import { clearSavedBills } from "./cart";

/**
 * POSTs to the API directly: it answers a wrong password with 401, which the shared client treats as an
 * expired session (and signs the user out). Here a typo only throws an error to show.
 */
async function postAuth<T>(path: string, body: unknown, token: string | null = getToken()): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...deviceHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data as T;
}

/** Changes the signed-in user's password */
export async function changePassword(currentPassword: string, newPassword: string) {
  await postAuth("/auth/change-password", { currentPassword, newPassword });
}

/** Changes a password from the sign-in screen in one call (no session; nothing is signed in) */
export async function forgotPassword(email: string, currentPassword: string, newPassword: string) {
  await postAuth("/auth/forgot-password", { email, currentPassword, newPassword }, null);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** What this user may do (see lib/permissions.ts); administrators may do everything */
  permissions: string[];
  /** Custom role name, when the user was given one */
  roleTemplate?: { name: string; level?: "L1" | "L2" | "L3" | null } | null;
}

/** A supplier portal sign-in: sees only their own stock (/supplier); never a staff user */
export interface SupplierSession {
  kind: "vendor";
  id: string;
  name: string;
  email: string;
  vendorName: string;
}

type MeResponse = SessionUser | SupplierSession;

/** Sign-in needs this device registered first (device lock: up to `max` devices per user) */
export interface DeviceCapture {
  slot: number;
  max: number;
  suggestedName: string;
}
const isSupplier = (u: MeResponse | null | undefined): u is SupplierSession => !!u && "kind" in u && u.kind === "vendor";

/** Where each kind of session starts */
export const homeFor = (supplier: SupplierSession | null) => (supplier ? "/supplier" : "/dashboard");

interface AuthState {
  /** Staff user; always null for a supplier session, so no ERP page treats a supplier as staff */
  user: SessionUser | null;
  /** Supplier portal session, when the person signed in is a supplier */
  supplier: SupplierSession | null;
  loading: boolean;
  /** Signs in and says which kind of account it was, or that this device must be registered first */
  login: (email: string, password: string, device?: { capture: true; name?: string }) => Promise<"staff" | "vendor" | { deviceCapture: DeviceCapture }>;
  logout: () => void;
  /** True when the user holds any of these permissions (administrators always do) */
  can: (...perms: Permission[]) => boolean;
  /** Owner / administrator: the few things that cannot be delegated by ticking a permission */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [supplier, setSupplier] = useState<SupplierSession | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((u: MeResponse | null) => {
    if (isSupplier(u)) {
      setSupplier(u);
      setUser(null);
    } else {
      setSupplier(null);
      setUser(u);
    }
  }, []);

  useEffect(() => {
    // Restore the session from a saved token, if any
    const restore = getToken() ? api.get<MeResponse>("/auth/me") : Promise.resolve(null);
    restore
      .then((u) => {
        apply(u);
        // Only staff sessions are kept for offline use (the POS); a supplier session always asks the server
        if (u && !isSupplier(u)) persistSet("/auth/me", u);
      })
      .catch((e) => {
        // No network: keep the last known staff session so the POS can keep billing offline
        const saved = isNetworkError(e) ? persistGet<SessionUser>("/auth/me") : null;
        if (saved && !isSupplier(saved)) setUser(saved);
        else setToken(null);
      })
      .finally(() => setLoading(false));
  }, [apply]);

  const login = useCallback(
    async (email: string, password: string, device?: { capture: true; name?: string }) => {
      const res = await api.post<{ token: string; user: MeResponse } | { deviceCapture: DeviceCapture }>("/auth/login", {
        email,
        password,
        ...(device ? { captureDevice: true, deviceName: device.name?.trim() || undefined } : {}),
      });
      // A new device for a locked account: the user confirms it before a session starts
      if ("deviceCapture" in res) return { deviceCapture: res.deviceCapture };
      clearApiCache();
      setToken(res.token);
      if (!isSupplier(res.user)) persistSet("/auth/me", res.user);
      apply(res.user);
      return isSupplier(res.user) ? ("vendor" as const) : ("staff" as const);
    },
    [apply],
  );

  const logout = useCallback(() => {
    const finish = () => {
      setToken(null);
      persistClear();
      clearSavedBills();
      setUser(null);
      setSupplier(null);
      window.location.href = "/login";
    };
    // A supplier session is also ended on the server, so the token can't be used again
    if (supplier) postAuth("/vendor-portal/logout", {}).catch(() => {}).finally(finish);
    else finish();
  }, [supplier]);

  const can = useCallback((...perms: Permission[]) => hasPerm(user, ...perms), [user]);
  const isAdmin = !!user && user.role === "ADMIN";

  return <AuthContext.Provider value={{ user, supplier, loading, login, logout, can, isAdmin }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
