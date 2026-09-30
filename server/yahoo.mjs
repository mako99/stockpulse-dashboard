/**
 * Upstream market-data provider (Yahoo Finance — no API key, live NSE data).
 *
 * Design notes, from hard experience while building this:
 *  - Yahoo 429s aggressively, so ALL requests go through the paced, circuit-
 *    breaking `upstream()` helper in util.mjs (≤1.5 req/s, fail-fast cooldown).
 *  - Two hosts are rotated (query1/query2) as a cheap load spread.
 *  - Quotes use a 3-tier strategy: batch `v7/quote` (needs cookie+crumb),
 *    then `v7/spark` chunks, then per-symbol `v8/chart`. Only the first
 *    strategy that works is used; the others keep working if Yahoo changes
 *    their mind about crumb auth (they do).
 *  - Every result is cached with a TTL and served stale on failure.
 */
import { upstream, cached, pool, stats } from "./util.mjs";
import { RANGES, yahooSymbol } from "./universe.mjs";

const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
let hostIdx = 0;
const host = () => HOSTS[hostIdx];
const flipHost = () => { hostIdx = (hostIdx + 1) % HOSTS.length; };
const u = (path) => `https://${host()}${path}`;

const isErr = (e, code) => e && (e.code === code || String(e.message).includes(code));

/* ---------------------------------------------------------------- crumb auth
   Batch quotes + fundamentals need a cookie/crumb pair, refreshed lazily. */
let cookie = null, crumb = null, crumbAt = 0;

async function ensureCrumb(force = false) {
  if (!force && crumb && Date.now() - crumbAt < 30 * 60 * 1000) return crumb;
  const setCookie = await upstream("https://fc.yahoo.com/", { anyStatus: true, tries: 1, timeoutMs: 7000 })
    .then((r) => r.cookie)
    .catch(() => null);
  if (setCookie) cookie = setCookie.split(";")[0];
  const r = await upstream(u("/v1/test/getcrumb"), { cookie, anyStatus: true, tries: 1, timeoutMs: 7000 });
  if (r.status !== 200 || !r.text || r.text.length > 40 || r.text.includes("<")) {
    const e = new Error("crumb unavailable");
    e.code = 401;
    throw e;
  }
  crumb = r.text.trim();
  crumbAt = Date.now();
  return crumb;
}

/* ------------------------------------------------------------------ helpers */
const num = (v) => (typeof v === "number" && isFinite(v) ? v
  : (v && typeof v === "object" && typeof v.raw === "number" ? v.raw : null));

const jget = async (path, { cookie: ck, anyStatus } = {}) => {
  const r = await upstream(path, { cookie: ck, anyStatus });
  try { return { status: r.status, data: JSON.parse(r.text) }; }
  catch { const e = new Error("bad json from upstream"); e.code = 502; throw e; }
};

/** Normalize any of the three quote shapes into one object. */
function normQuote(sym, raw, source) {
  const price = num(raw.regularMarketPrice);
  const prev = num(raw.previousClose) ?? num(raw.chartPreviousClose);
  if (price == null) return null;
  const changePct = num(raw.regularMarketChangePercent);
  const change = num(raw.regularMarketChange) ?? (prev != null ? price - prev : null);
  return {
    sym,
    yahoo: raw.symbol || yahooSymbol(sym),
    name: raw.shortName || raw.longName || sym,
    price,
    prevClose: prev,
    change: change != null ? +change.toFixed(4) : null,
    changePct: changePct != null ? +changePct.toFixed(4)
      : (prev != null ? +(((price - prev) / prev) * 100).toFixed(4) : null),
    open: num(raw.regularMarketOpen),
    high: num(raw.regularMarketDayHigh),
    low: num(raw.regularMarketDayLow),
    volume: num(raw.regularMarketVolume),
    mcap: num(raw.marketCap),
    currency: raw.currency || "INR",
    exchange: raw.fullExchangeName || raw.exchangeName || "NSE",
    marketState: raw.marketState || null,
    asOf: raw.regularMarketTime || null,
    source
  };
}

const chunkOf = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

/* ------------------------------------------------------------------ quotes */
async function quotesViaBatch(symbols) {
  const c = await ensureCrumb();
  const qs = symbols.map((s) => encodeURIComponent(yahooSymbol(s))).join(",");
  const { data } = await jget(u(`/v7/finance/quote?symbols=${qs}&crumb=${encodeURIComponent(c)}`), { cookie });
  const res = data?.quoteResponse?.result;
  if (!res || !res.length) throw Object.assign(new Error("empty quoteResponse"), { code: 502 });
  return symbols.map((s) => normQuote(s, res.find((r) => r.symbol === yahooSymbol(s)) || {}, "yahoo-batch")).filter(Boolean);
}

async function quotesViaSpark(symbols) {
  const out = [];
  for (const chunk of chunkOf(symbols, 15)) {
    const qs = chunk.map((s) => encodeURIComponent(yahooSymbol(s))).join(",");
    const { data } = await jget(u(`/v7/finance/spark?symbols=${qs}&range=1d&interval=1d`));
    const res = data?.spark?.result || [];
    for (const s of chunk) {
      const meta = res.find((r) => r.symbol === yahooSymbol(s))?.response?.[0]?.meta;
      if (meta) { const q = normQuote(s, meta, "yahoo-spark"); if (q) out.push(q); }
    }
  }
  if (!out.length) throw Object.assign(new Error("empty spark"), { code: 502 });
  return out;
}

async function quotesViaChart(symbols) {
  const out = await pool(symbols, 2, async (s) => {
    try { const { meta } = await chartRaw(yahooSymbol(s), "1d", "5m"); return normQuote(s, meta, "yahoo-chart"); }
    catch (e) { if (isErr(e, 429)) throw e; return null; }   // a 429 must abort the batch
  });
  const got = out.filter(Boolean);
  if (!got.length) throw Object.assign(new Error("no quotes"), { code: 502 });
  return got;
}

/** Live quotes for NSE tickers (pass `RELIANCE` style symbols).
 *  Strategy order matters: `spark` needs NO cookie/crumb (the crumb endpoint is
 *  the thing Yahoo rate-limits hardest), so it goes first; the crumb-authed
 *  batch is the last resort. */
export async function fetchQuotes(symbols) {
  const key = "q:" + symbols.slice().sort().join(",");
  const ttl = isMarketOpen() ? 20000 : 300000;
  return cached(key, ttl, async () => {
    let out;
    // Each tier uses a DIFFERENT endpoint, and cooldowns are endpoint-scoped —
    // so a spark 429 must not stop us from trying chart (and vice versa).
    try { out = await quotesViaSpark(symbols); }
    catch (e) {
      flipHost();
      try { out = await quotesViaChart(symbols); }
      catch (e2) {
        try { out = await quotesViaBatch(symbols); }
        catch (e3) {
          // Prefer whichever error tells the truth about the live providers:
          // a 429 (endpoint throttled) beats a generic failure.
          throw isErr(e2, 429) ? e2 : (isErr(e, 429) ? e : e3);
        }
      }
    }
    return { quotes: out, source: out[0]?.source || "yahoo" };
  });
}

/* ------------------------------------------------------------------- charts */
async function chartRaw(yahoo, range, interval) {
  const { data } = await jget(u(`/v8/finance/chart/${encodeURIComponent(yahoo)}?range=${range}&interval=${interval}`));
  const res = data?.chart?.result?.[0];
  if (!res) throw Object.assign(new Error(data?.chart?.error?.description || "no chart"), { code: 502 });
  return res;
}

/** OHLC bars for a display range: { bars:[{t,o,h,l,c,v}], meta } */
export async function fetchChart(sym, rangeKey = "1Y") {
  const cfg = RANGES[rangeKey] || RANGES["1Y"];
  const ttl = cfg.interval.includes("m") || cfg.interval === "1h" ? 60000 : 600000;
  return cached(`c:${sym}:${rangeKey}`, ttl, async () => {
    const res = await chartRaw(yahooSymbol(sym), cfg.range, cfg.interval);
    const q = res.indicators?.quote?.[0] || {};
    const bars = [];
    for (let i = 0; i < (res.timestamp || []).length; i++) {
      const c = q.close?.[i];
      if (c == null) continue;
      bars.push({
        t: res.timestamp[i] * 1000,
        o: q.open?.[i] ?? c, h: q.high?.[i] ?? c, l: q.low?.[i] ?? c, c,
        v: q.volume?.[i] ?? 0
      });
    }
    if (!bars.length) throw Object.assign(new Error("empty series"), { code: 502 });
    return { bars, meta: res.meta, range: rangeKey, granularity: res.meta.dataGranularity };
  });
}

/* -------------------------------------------------------------- market state */
export function isMarketOpen(now = new Date()) {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins <= 930;                        // 09:15–15:30 IST
}

/* -------------------------------------------------------------- fundamentals
   One bundled quoteSummary call per symbol (6h TTL) instead of one per module —
   fewer requests means fewer 429s. */
const SUMMARY_MODULES = "financialData,defaultKeyStatistics,assetProfile,summaryProfile,price,incomeStatementHistory,incomeStatementHistoryQuarterly";

export async function fetchSummary(sym) {
  return cached(`s:${sym}`, 6 * 3600 * 1000, async () => {
    const c = await ensureCrumb();
    const { data } = await jget(
      u(`/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol(sym))}?modules=${SUMMARY_MODULES}&crumb=${encodeURIComponent(c)}`),
      { cookie }
    );
    const r = data?.quoteSummary?.result?.[0];
    if (!r) throw Object.assign(new Error("no summary"), { code: 502 });
    return r;
  });
}

/* ------------------------------------------------------------------- search */
export async function fetchSearch(q) {
  return cached(`se:${q.toLowerCase()}`, 600000, async () => {
    const { data } = await jget(u(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=6`));
    return {
      quotes: (data?.quotes || [])
        .filter((x) => x.symbol)
        .map((x) => ({
          symbol: x.symbol,
          name: x.shortname || x.longname || x.symbol,
          exchange: x.exchDisp || x.exchange || "",
          type: x.quoteType || "",
          nse: x.symbol.endsWith(".NS") ? x.symbol.replace(/\.NS$/, "") : null
        })),
      news: (data?.news || []).map((n) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        published: n.providerPublishTime ? n.providerPublishTime * 1000 : null
      }))
    };
  });
}

export async function fetchNews(q = "") {
  const key = `n:${q.toLowerCase()}`;
  return cached(key, 600000, async () => {
    const url = q
      ? u(`/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=10`)
      : u(`/v1/finance/search?q=indian%20stock%20market&newsCount=10`);
    const { data } = await jget(url);
    return (data?.news || []).map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      published: n.providerPublishTime ? n.providerPublishTime * 1000 : null
    }));
  });
}

export const providerInfo = () => ({ host: host(), ...stats });
/* END */


