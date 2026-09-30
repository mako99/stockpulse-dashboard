/**
 * API client for the StockPulse backend (server/index.mjs).
 *
 * - `useApi`      generic GET hook: keeps the previous value while refreshing,
 *                 falls back to the static sample data when the API is down so
 *                 the dashboard never renders an empty shell.
 * - `useLiveQuotes` SSE subscription for live prices (server pushes every 15s
 *                 while the market is open, 60s otherwise).
 * - `withQuotes`  overlays live quotes onto the static tuple rows the dashboard
 *                 already renders ([sym, price, pct, dir] / watchlist 5-tuples).
 */
import { useEffect, useRef, useState } from "react";
import { num, signed, signedPct } from "./stockData";

export async function getJSON(path, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** GET `path` (null disables it). Returns {data, error, loading, source}.
 *  `refreshMs` re-polls on an interval (for indices/health tickers). */
export function useApi(path, fallback = null, refreshMs = 0) {
  const [state, setState] = useState({
    data: fallback, error: null, loading: Boolean(path), source: fallback ? "sample" : null
  });
  const seq = useRef(0);
  useEffect(() => {
    if (!path) { setState((s) => ({ ...s, loading: false })); return; }
    let alive = true;
    const load = (initial) => {
      const id = ++seq.current;
      if (initial) setState((s) => ({ ...s, loading: s.data == null }));
      getJSON(path)
        .then((json) => {
          if (!alive || id !== seq.current) return;
          setState({ data: json, error: null, loading: false, source: json?.source || null });
        })
        .catch((error) => {
          if (!alive || id !== seq.current) return;
          setState((s) => ({
            data: s.data ?? fallback, error, loading: false,
            source: (s.data ?? fallback) ? "sample" : null
          }));
        });
    };
    load(true);
    let timer = null;
    if (refreshMs > 0) timer = setInterval(() => load(false), refreshMs);
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [path]);
  return state;
}

/** Live quote map {SYM: quote} over SSE for the given symbols. */
export function useLiveQuotes(symbols) {
  const key = symbols.filter(Boolean).join(",");
  const [quotes, setQuotes] = useState({});
  const [status, setStatus] = useState(key ? "connecting" : "off");
  useEffect(() => {
    if (!key || typeof EventSource === "undefined") { setStatus("off"); return; }
    let closed = false;
    let es = null;
    const connect = () => {
      es = new EventSource(`/api/stream?symbols=${encodeURIComponent(key)}`);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "quotes") {
            setQuotes((prev) => {
              const next = { ...prev };
              for (const q of msg.quotes) if (q && q.sym) next[q.sym] = q;
              return next;
            });
            setStatus(msg.source === "sample" ? "sample" : "live");
          } else if (msg.type === "stale") setStatus("stale");
        } catch { /* ignore malformed frame */ }
      };
      es.onerror = () => { if (!closed) setStatus((s) => (s === "live" ? "stale" : s)); };
    };
    connect();
    return () => { closed = true; if (es) es.close(); };
  }, [key]);
  return { quotes, status };
}

const dirOf = (pct) => ((pct ?? 0) >= 0 ? "up" : "down");

/** Overlay live quotes onto dashboard tuple rows (keeps row shape stable). */
export function withQuotes(rows, quotes, kind = "row") {
  if (!rows || !quotes) return rows;
  return rows.map((r) => {
    const q = quotes[r[0]];
    if (!q || q.price == null) return r;
    if (kind === "watch") {
      return [r[0], num(q.price, 2), signed(q.change ?? 0), signedPct(q.changePct ?? 0), dirOf(q.changePct)];
    }
    return [r[0], num(q.price, 2), signedPct(q.changePct ?? 0), dirOf(q.changePct)];
  });
}
