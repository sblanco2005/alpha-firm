import { useEffect, useState, useCallback, useRef } from "react";
import Constants from "expo-constants";

// When running in Expo Go on a physical phone, the JS bundle is served from the
// Mac's LAN IP — reuse that host to reach the Express API on :3001, so the app
// "just works" on-device with no manual IP editing. Override with EXPO_PUBLIC_API_BASE.
function resolveBase(): string {
  if (process.env.EXPO_PUBLIC_API_BASE) return process.env.EXPO_PUBLIC_API_BASE;
  const hostUri = Constants.expoConfig?.hostUri || "";
  const host = String(hostUri).split(":")[0];
  return host ? `http://${host}:3001` : "http://localhost:3001";
}

export const API_BASE = resolveBase();

// Optional bearer token baked in at build time (EXPO_PUBLIC_API_TOKEN) to match the
// VPS's API_TOKEN. Empty in local dev → no header sent.
const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || "";
function authHeaders(): Record<string, string> {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path, { headers: { Accept: "application/json", ...authHeaders() } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `${path} → ${res.status}`);
  return json as T;
}

export function useApi<T = any>(path: string, opts: { pollMs?: number } = {}) {
  const { pollMs = 0 } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const json = await apiGet<T>(path);
      if (alive.current) { setData(json); setError(null); }
    } catch (e) {
      if (alive.current) setError(e as Error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    load();
    let t: ReturnType<typeof setInterval> | undefined;
    if (pollMs) t = setInterval(load, pollMs);
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, pollMs]);

  return { data, error, loading, reload: load };
}
