/**
 * Provider facade — one place that decides where market data comes from.
 *
 * `index.mjs` imports from here (not from yahoo.mjs directly), so swapping or
 * layering providers never touches the route handlers.
 *
 * Strategy: when TWELVEDATA_API_KEY is configured, live quotes and charts come
 * from Twelve Data (a keyed API that doesn't rate-limit datacenter IPs). ANY
 * failure — no budget left this minute, a symbol type it can't serve,
 * an upstream hiccup — transparently falls back to the Yahoo scraper. The
 * result is that the free tier's credit ceiling degrades gracefully instead of
 * blanking a panel.
 *
 * Yahoo remains the only source for news and fundamentals (Twelve Data doesn't
 * offer them on the free plan), and NSE stays the primary index/sector source.
 */
import * as yahoo from "./yahoo.mjs";
import * as td from "./twelvedata.mjs";

/** Log a fallback once per reason per minute — loud enough to debug, quiet
 *  enough not to spam a 15s SSE loop. */
const lastNotice = new Map();
function notice(reason, err) {
  const now = Date.now();
  if ((lastNotice.get(reason) || 0) > now - 60000) return;
  lastNotice.set(reason, now);
  console.log(`[provider] twelvedata unusable (${reason}) — using yahoo: ${String(err?.message || err)}`);
}

/** Try Twelve Data first, then Yahoo. `pull` receives the module to use. */
async function preferTd(pull, label) {
  if (!td.hasKey()) return pull(yahoo);
  try {
    return await pull(td);
  } catch (e) {
    if (e?.code === 501) notice(`${label}: ${e.message}`, "");
    else if (e?.budget) notice(`${label}: credit budget`, e);
    else notice(label, e);
    return pull(yahoo);
  }
}

export const isMarketOpen = yahoo.isMarketOpen;

export const fetchQuotes = (symbols) => preferTd((p) => p.fetchQuotes(symbols), "quotes");
export const fetchChart = (sym, rangeKey) => preferTd((p) => p.fetchChart(sym, rangeKey), "chart");

// Yahoo-only on purpose: no keyed equivalent on the free plan.
export const fetchSummary = (sym) => yahoo.fetchSummary(sym);
export const fetchSearch = (q) => yahoo.fetchSearch(q);
export const fetchNews = (q) => yahoo.fetchNews(q);

export function providerInfo() {
  return {
    ...yahoo.providerInfo(),
    active: td.hasKey() ? "twelvedata+yahoo" : "yahoo",
    twelvedata: td.hasKey() ? td.creditState() : null
  };
}
