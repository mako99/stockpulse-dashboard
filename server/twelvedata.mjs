/**
 * Twelve Data provider adapter — keyed and credit-metered.
 *
 * WHY THIS EXISTS: Yahoo rate-limits datacenter IPs hard (we see 429s in
 * production while the same code is fine on a home connection). When
 * TWELVEDATA_API_KEY is set, the server prefers this adapter for live quotes
 * and charts, and silently falls back to Yahoo for anything it can't serve
 * (indices/forex symbols, news, fundamentals) or when the credit budget for
 * the current minute is spent.
 *
 * THE BINDING CONSTRAINT IS CREDITS, NOT REQUESTS. On the free plan every
 * /quote and /time_series call costs 1 credit PER SYMBOL; the minute quota is
 * small and the Basic plan also caps credits per day (resetting at 00:00 UTC).
 * So the adapter:
 *   - reserves the whole symbol set UP FRONT and refuses rather than
 *     half-fetching, so a budget shortfall never wastes credits or returns a
 *     partial answer — the caller just uses Yahoo instead;
 *   - chunks requests to TWELVEDATA_BATCH symbols (default 8);
 *   - caches aggressively (TWELVEDATA_QUOTE_TTL_MS) because every refresh is
 *     paid for in credits;
 *   - surfaces api-credits-used / api-credits-left from the response headers.
 *
 * Everything is env-tunable, so upgrading the plan is a config change:
 *   TWELVEDATA_API_KEY, TWELVEDATA_CREDITS_PER_MIN, TWELVEDATA_CREDITS_PER_DAY,
 *   TWELVEDATA_BATCH, TWELVEDATA_QUOTE_TTL_MS, TWELVEDATA_CHART_TTL_MS.
 */
import { upstream, cached } from "./util.mjs";

const base = () => process.env.TWELVEDATA_API_URL || "https://api.twelvedata.com";
export const hasKey = () => Boolean(process.env.TWELVEDATA_API_KEY);

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const chunkOf = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

const cfg = () => ({
  perMinute: Math.max(1, Number(process.env.TWELVEDATA_CREDITS_PER_MIN || 8)),
  perDay: Math.max(1, Number(process.env.TWELVEDATA_CREDITS_PER_DAY || 800)),
  batch: Math.max(1, Number(process.env.TWELVEDATA_BATCH || 8)),
  quoteTtlMs: Math.max(5000, Number(process.env.TWELVEDATA_QUOTE_TTL_MS || 60000)),
  chartTtlMs: Math.max(30000, Number(process.env.TWELVEDATA_CHART_TTL_MS || 600000))
});

/* ------------------------------------------------------------ credit budget */
const minute = { at: 0, used: 0 };
const day = { at: 0, used: 0 };
let lastCredits = { used: null, left: null };

function roll() {
  const now = Date.now();
  if (now - minute.at >= 60000) { minute.at = now; minute.used = 0; }
  if (now - day.at >= 86400000) { day.at = now; day.used = 0; }
}

export function creditState() {
  roll();
  const { perMinute, perDay } = cfg();
  return {
    perMinute, usedThisMinute: minute.used, leftThisMinute: Math.max(0, perMinute - minute.used),
    perDay, usedToday: day.used, leftToday: Math.max(0, perDay - day.used),
    apiCreditsUsed: lastCredits.used, apiCreditsLeft: lastCredits.left
  };
}

const budgetError = (need, have) => {
  const e = new Error(`twelvedata credit budget short: need ${need}, ${have} left this minute`);
  e.code = 429;
  e.budget = { need, have };
  return e;
};

/** Reserve `n` credits up front, or throw — never half-fetch a symbol set. */
function reserve(n) {
  roll();
  const { perMinute, perDay } = cfg();
  const have = Math.min(perMinute - minute.used, perDay - day.used);
  if (n > have) throw budgetError(n, have);
  minute.used += n;
  day.used += n;
}

/* ------------------------------------------------------------------ fetching */
async function getJSON(pathAndQuery) {
  const key = process.env.TWELVEDATA_API_KEY;
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `${base()}${pathAndQuery}${sep}apikey=${encodeURIComponent(key)}`;
  // noThrow: we need the body of error responses (a spent credit quota comes
  // back as {"code":429,...,"status":"error"}), and retrying within the minute
  // cannot succeed. tries:1 because transients are the caller's fallback's job.
  const r = await upstream(url, { tries: 1, timeoutMs: 12000, noThrow: true });
  const used = r.headers?.get("api-credits-used");
  const left = r.headers?.get("api-credits-left");
  if (used != null || left != null) lastCredits = { used: Number(used), left: Number(left) };
  let data;
  try { data = JSON.parse(r.text); }
  catch { throw Object.assign(new Error(`twelvedata: bad json (http ${r.status})`), { code: 502 }); }
  if (data && data.status === "error") {
    const raw = Number(data.code) || r.status || 502;
    const e = new Error(`twelvedata ${raw}: ${String(data.message || "error").slice(0, 160)}`);
    // 401/403 here means a bad or missing key — our config problem, not an outage.
    e.code = raw === 401 || raw === 403 ? 502 : raw;
    throw e;
  }
  if (r.status !== 200) {
    throw Object.assign(new Error(`twelvedata: http ${r.status}`), { code: r.status >= 500 ? 502 : r.status });
  }
  return data;
}

/* --------------------------------------------------------------- normalising */
/** Map a Twelve Data quote onto the dashboard's quote shape (values arrive as
 *  strings; `close` is the latest price). */
function normQuote(sym, raw, source = "twelvedata") {
  const price = num(raw.close) ?? num(raw.price);
  if (price === null) return null;
  const prev = num(raw.previous_close);
  const change = num(raw.change) ?? (prev !== null ? price - prev : null);
  const pct = num(raw.percent_change)
    ?? (prev ? ((price - prev) / prev) * 100 : null);
  return {
    sym,
    yahoo: raw.symbol || sym,
    name: raw.name || sym,
    price,
    prevClose: prev,
    change: change !== null ? +change.toFixed(4) : null,
    changePct: pct !== null ? +pct.toFixed(4) : null,
    open: num(raw.open),
    high: num(raw.high),
    low: num(raw.low),
    volume: num(raw.volume),
    mcap: null,
    currency: raw.currency || "INR",
    exchange: raw.exchange || "NSE",
    marketState: raw.is_market_open ? "REGULAR" : "CLOSED",
    asOf: num(raw.timestamp) ? num(raw.timestamp) * 1000 : null,
    source
  };
}


/* ------------------------------------------------------------------ symbols */
/** Twelve Data can't serve Yahoo index/forex tickers (^NSEI, USDINR=X). Refuse
 *  them so the provider layer falls back to Yahoo instead of burning a request. */
const isIndexLike = (s) => s.startsWith("^") || s.includes("=");

/* ------------------------------------------------------------------- quotes */
/** Unpack either a multi-symbol response (object keyed by ticker) or a single
 *  quote object. Twelve Data returns both shapes from the same endpoint. */
function unpack(chunk, data) {
  const pairs = [];
  if (data && typeof data === "object" && data.symbol == null) {
    for (const sym of chunk) {
      const raw = data[sym];
      if (raw && typeof raw === "object" && raw.status !== "error") pairs.push([sym, raw]);
    }
    return pairs;
  }
  if (chunk.length === 1 && data && data.symbol) pairs.push([chunk[0], data]);
  return pairs;
}

/** Live quotes for NSE tickers (pass `RELIANCE`-style symbols). */
export async function fetchQuotes(symbols) {
  const syms = symbols.map((s) => String(s).toUpperCase());
  if (!hasKey()) throw Object.assign(new Error("twelvedata: no TWELVEDATA_API_KEY"), { code: 501 });
  if (syms.some(isIndexLike)) {
    throw Object.assign(new Error("twelvedata: index/forex symbols unsupported"), { code: 501 });
  }
  const { batch, quoteTtlMs } = cfg();
  const key = `td:q:${syms.slice().sort().join(",")}`;
  return cached(key, quoteTtlMs, async () => {
    reserve(syms.length);                       // all-or-nothing, before any I/O
    const out = [];
    for (const chunk of chunkOf(syms, batch)) {
      const qs = chunk.map(encodeURIComponent).join(",");
      const data = await getJSON(`/quote?symbol=${qs}&exchange=NSE`);
      for (const [sym, raw] of unpack(chunk, data)) {
        const q = normQuote(sym, raw);
        if (q) out.push(q);
      }
    }
    if (!out.length) throw Object.assign(new Error("twelvedata: no quotes"), { code: 502 });
    return { quotes: out, source: "twelvedata" };
  });
}

/* ------------------------------------------------------------------- charts */
/** Display range -> Twelve Data interval/outputsize. `2Y` (520 daily bars) is
 *  internal-only; it feeds the MA50/MA200 overlay in the chart builder. */
const CHART = {
  "1D":  { interval: "5min",   outputsize: 78 },
  "1W":  { interval: "15min",  outputsize: 130 },
  "1M":  { interval: "1day",   outputsize: 22 },
  "3M":  { interval: "1day",   outputsize: 66 },
  "6M":  { interval: "1day",   outputsize: 130 },
  "1Y":  { interval: "1day",   outputsize: 260 },
  "2Y":  { interval: "1day",   outputsize: 520 },
  "5Y":  { interval: "1week",  outputsize: 260 },
  "Max": { interval: "1month", outputsize: 240 }
};

/** "2024-08-22 15:04:05" / "2024-08-22" -> epoch ms. Twelve Data returns naive
 *  exchange-local datetimes, and NSE is IST (+05:30). Values that already carry
 *  an offset are parsed as-is. */
function tsOf(dt) {
  const s = String(dt || "").trim();
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00+05:30`);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(s);
  return Date.parse(`${s.replace(" ", "T")}+05:30`);
}

/** OHLC bars for a display range: { bars:[{t,o,h,l,c,v}], meta }, chronological. */
export async function fetchChart(sym, rangeKey = "1Y") {
  const s = String(sym).toUpperCase();
  if (!hasKey()) throw Object.assign(new Error("twelvedata: no TWELVEDATA_API_KEY"), { code: 501 });
  if (isIndexLike(s)) {
    throw Object.assign(new Error("twelvedata: index/forex symbols unsupported"), { code: 501 });
  }
  const c = CHART[rangeKey] || CHART["1Y"];
  const { chartTtlMs } = cfg();
  return cached(`td:c:${s}:${rangeKey}`, chartTtlMs, async () => {
    reserve(1);
    // order=asc gives us oldest-first, matching the chart builder's expectation.
    const data = await getJSON(
      `/time_series?symbol=${encodeURIComponent(s)}&exchange=NSE&interval=${c.interval}&outputsize=${c.outputsize}&order=asc`
    );
    const values = Array.isArray(data.values) ? data.values : [];
    const bars = [];
    for (const v of values) {
      const t = tsOf(v.datetime);
      const close = num(v.close);
      if (close === null || !Number.isFinite(t)) continue;
      bars.push({ t, o: num(v.open) ?? close, h: num(v.high) ?? close, l: num(v.low) ?? close, c: close, v: num(v.volume) ?? 0 });
    }
    if (!bars.length) throw Object.assign(new Error("twelvedata: empty series"), { code: 502 });
    // Never trust upstream ordering: sort ourselves so a changed/ignored `order`
    // param can't silently reverse the chart (and the MA50/MA200 maths with it).
    bars.sort((a, b) => a.t - b.t);
    const m = data.meta || {};
    return {
      bars,
      range: rangeKey,
      granularity: m.interval || c.interval,
      source: "twelvedata",
      meta: {
        symbol: m.symbol || s, shortName: m.symbol || s,
        currency: m.currency, exchange: m.exchange, fullExchangeName: m.exchange,
        dataGranularity: m.interval || c.interval,
        regularMarketPrice: bars.at(-1)?.c ?? null,
        chartPreviousClose: bars.at(-2)?.c ?? null
      }
    };
  });
}
