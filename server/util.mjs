/**
 * Shared utilities for the StockPulse API server: a paced/circuit-broken fetch
 * layer (Yahoo rate-limits aggressively — see the 429s we hit while probing),
 * plus a TTL cache with stale-serve and single-flight request coalescing.
 */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------- stats */
export const stats = {
  startedAt: Date.now(),
  upstreamRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rateLimited: 0,
  upstreamErrors: 0,
  lastUpstreamAt: 0,
  lastRateLimitAt: 0,
  coolingDownUntil: 0
};

/* ------------------------------------------------------------------- cache */
const store = new Map();

export function cacheGet(key, { allowStale = true } = {}) {
  const hit = store.get(key);
  if (!hit) return null;
  const fresh = Date.now() < hit.expiresAt;
  if (!fresh && !allowStale) { store.delete(key); return null; }
  if (fresh) stats.cacheHits++;
  return { value: hit.value, stale: !fresh, age: Date.now() - hit.at, ttl: hit.ttl };
}

export function cacheSet(key, value, ttl) {
  store.set(key, { value, ttl, at: Date.now(), expiresAt: Date.now() + ttl });
}

export const cacheStats = () => ({ size: store.size, ...stats });

/** Single-flight: concurrent callers share one in-flight promise. */
const inflight = new Map();
export async function cached(key, ttl, fn, { ttlOnFail = 15000 } = {}) {
  const hit = cacheGet(key);
  if (hit) return { ...hit.value, _meta: { stale: hit.stale, age: hit.age, fromCache: true } };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await fn();
      cacheSet(key, value, typeof ttl === "function" ? ttl(value) : ttl);
      return { ...value, _meta: { stale: false, age: 0, fromCache: false } };
    } catch (err) {
      // Serve stale on failure when we have it — the UI must never go blank.
      const stale = cacheGet(key);
      if (stale) return { ...stale.value, _meta: { stale: true, age: stale.age, fromCache: true, upstreamError: String(err.message || err) } };
      cacheSet(key, { __error: String(err.message || err) }, ttlOnFail);
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/* ------------------------------------------------- paced upstream fetching */
let lastRequestAt = 0;
const MIN_GAP_MS = 650;         // ≤ ~1.5 req/s keeps us under Yahoo's burst limit
const COOLDOWN_MS = 45000;      // backoff window after a 429

// One line per upstream call — indispensable when hunting down whose 429 it was.
const logUpstream = (url, status, note) => {
  if (!process.env.QUIET) {
    let short = url;
    try { const u = new URL(url); short = u.host + u.pathname + (u.search ? "?" + u.search.slice(1, 60) : ""); } catch { /* keep */ }
    console.log(`[up] ${status} ${short}${note ? " — " + note : ""}`);
  }
};

/* Cooldowns are SCOPED to an endpoint (host + first path segments), because we
   observed spark getting 429 while chart/search were still fine — a global
   circuit would let one endpoint's throttle poison every other provider call. */
const cooldowns = new Map();
const keyOf = (url) => {
  try { const u = new URL(url); return u.host + u.pathname.split("/").slice(0, 3).join("/"); }
  catch { return "unknown"; }
};
const openCooldown = (key, ms) => {
  const until = Date.now() + ms;
  if ((cooldowns.get(key) || 0) < until) cooldowns.set(key, until);
  stats.coolingDownUntil = Math.max(stats.coolingDownUntil, until);
  return until - Date.now();
};
const coolingLeft = (key) => Math.max(0, (cooldowns.get(key) || 0) - Date.now());

export async function upstream(url, { cookie, timeoutMs = 9000, tries = 3, headers = {}, anyStatus = false, noThrow = false } = {}) {
  const key = keyOf(url);
  // This endpoint is cooling down? Fail fast so callers can serve stale/sample
  // data (or try a different endpoint) instead of parking the HTTP request.
  const left = coolingLeft(key);
  if (left > 0) {
    const e = new Error(`endpoint cooling down after rate limit (${key})`);
    e.code = 429;
    e.coolingDownMs = left;
    throw e;
  }
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    // Global pacing with a little jitter so we never look metronomic.
    const wait = MIN_GAP_MS + Math.random() * 350 - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      stats.upstreamRequests++;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
        redirect: "manual",
        signal: ctrl.signal
      });
      const text = await res.text();

      // Callers that need the response BODY to report errors accurately opt out
      // of the retry/cooldown machinery (`noThrow`). Twelve Data returns its own
      // {"status":"error"} envelope, and retrying a spent credit quota is
      // pointless — it only resets on the minute boundary.
      if (noThrow) {
        stats.lastUpstreamAt = Date.now();
        logUpstream(url, res.status, "");
        return { text, status: res.status, cookie: res.headers.get("set-cookie"), headers: res.headers };
      }

      if (res.status === 429) {
        stats.rateLimited++;
        stats.lastRateLimitAt = Date.now();
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        // Yahoo's 429 here is PROBABILISTIC: identical requests measured 429 → 200
        // seconds apart. So back off briefly with jitter and retry; only after
        // repeated 429s do we open the endpoint cooldown (fail-fast for others).
        if (attempt < tries - 1) {
          const wait = 1200 + Math.random() * 2800 + attempt * 2500;
          logUpstream(url, res.status, `throttled — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${tries})`);
          await sleep(wait);
          continue;
        }
        const ms = Math.max(COOLDOWN_MS, retryAfter * 1000);
        const coolingMs = openCooldown(key, ms);
        logUpstream(url, res.status, `endpoint cooldown ${Math.round(ms / 1000)}s (${key})`);
        const e = new Error("upstream rate limited (429)");
        e.code = 429;
        e.coolingDownMs = coolingMs;
        throw e;                                  // give up: callers serve stale/sample
      }
      if (res.status === 401 || res.status === 403) {
        const e = new Error(`upstream auth ${res.status} (stale crumb?)`);
        e.code = res.status;
        throw e;
      }
      if (res.status >= 500) {
        stats.upstreamErrors++;
        lastErr = new Error(`upstream ${res.status}`);
        lastErr.code = res.status;
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (res.status !== 200 && !anyStatus) {
        const e = new Error(`upstream ${res.status}: ${text.slice(0, 120)}`);
        e.code = res.status;
        throw e;
      }
      stats.lastUpstreamAt = Date.now();
      logUpstream(url, res.status, "");
      return { text, status: res.status, cookie: res.headers.get("set-cookie"), headers: res.headers };
    } catch (err) {
      if (err.code === 401 || err.code === 403 || err.code === 429) throw err;
      if (!err.code) {
        stats.upstreamErrors++;
        lastErr = err;
        lastErr.code = 503;
      } else lastErr = err;
      if (attempt === tries - 1) throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Bounded concurrency for multi-symbol fetches (kept small on purpose). */
export async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
