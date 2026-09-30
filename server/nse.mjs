/**
 * Official NSE index feed — https://www.nseindia.com/api/allIndices
 *
 * Surprisingly reachable from here even though NSE's equity endpoints are
 * Akamai-blocked: it returns ~139 indices (incl. every sector index) with
 * last/prevClose/high/low. Used for the ticker strip and Sectors panel;
 * Yahoo + the static universe cover it when this fails.
 */
import { upstream, cached } from "./util.mjs";
import { isMarketOpen } from "./yahoo.mjs";

const HEADERS = {
  Referer: "https://www.nseindia.com/",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "application/json"
};
let cookie = null;

async function ensureCookie() {
  if (cookie) return cookie;
  const r = await upstream("https://www.nseindia.com/", {
    anyStatus: true, tries: 1, timeoutMs: 7000,
    headers: { Accept: "text/html,application/xhtml+xml" }
  }).catch(() => null);
  if (r?.cookie) cookie = r.cookie.split(";")[0];
  return cookie;
}

/** All NSE indices, normalized: [{name, value, change, changePct, prevClose, high, low, yearHigh, yearLow}] */
export async function fetchAllIndices() {
  const ttl = isMarketOpen() ? 45000 : 600000;
  return cached("nse:allIndices", ttl, async () => {
    await ensureCookie();
    const r = await upstream("https://www.nseindia.com/api/allIndices", {
      anyStatus: true, cookie, headers: HEADERS, tries: 2, timeoutMs: 9000
    });
    if (r.status !== 200) {
      const e = new Error(`nse allIndices ${r.status}`);
      e.code = r.status;
      throw e;
    }
    const rows = JSON.parse(r.text)?.data || [];
    if (!rows.length) { const e = new Error("nse empty"); e.code = 502; throw e; }
    return {
      rows: rows.map((r) => ({
        name: r.index,
        value: r.last,
        change: r.variation,
        changePct: r.percentChange,
        prevClose: r.previousClose,
        open: r.open, high: r.high, low: r.low,
        yearHigh: r.yearHigh, yearLow: r.yearLow
      })),
      fetchedAt: Date.now()
    };
  }, { ttlOnFail: 30000 });
}

/** Find the first matching index row (exact, then prefix-insensitive). */
export function pickIndex(rows, candidates) {
  if (!rows) return null;
  for (const c of candidates) {
    const hit = rows.find((r) => r.name.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = rows.find((r) => r.name.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}
