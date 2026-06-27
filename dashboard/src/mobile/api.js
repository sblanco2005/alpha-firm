import { useEffect, useState, useCallback, useRef } from "react";

// In dev, Vite proxies /api → localhost:3001. In production the PWA is served by
// the same Express server, so a relative base works there too. Override with
// VITE_API_BASE if the app is hosted separately from the API.
const BASE = import.meta.env.VITE_API_BASE || "";

export async function apiGet(path) {
  const res = await fetch(BASE + path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// Fetch on mount + optional polling. The backend updates ~3×/day, so a slow poll
// keeps the app fresh without hammering the VPS.
export function useApi(path, { pollMs = 0, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const json = await apiGet(path);
      if (alive.current) { setData(json); setError(null); }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) { setLoading(false); return; }
    load();
    let t;
    if (pollMs) t = setInterval(load, pollMs);
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, pollMs, enabled]);

  return { data, error, loading, reload: load };
}
