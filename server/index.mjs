/**
 * StockPulse API server — zero-dependency Node HTTP server (node:http + fetch).
 *
 *   GET /api/health                  provider/cache/market status
 *   GET /api/indices                 ticker + Market Overview index rows
 *   GET /api/sectors                 Sectors Performance rows
 *   GET /api/lists?watch=A,B         gainers / losers / trending / watchlist
 *   GET /api/quotes?symbols=A,B      batch live quotes
 *   GET /api/chart/:sym?range=1Y     OHLC bars + MA50/MA200 + axis style
 *   GET /api/stock/:sym              full detail payload (RELIANCE-shaped)
 *   GET /api/peers/:sym              peers comparison rows
 *   GET /api/search?q=               symbol search
 *   GET /api/news?q=                 headlines
 *   GET /api/stream?symbols=A,B      SSE live quote push
 *
 * Every endpoint answers `{source: "yahoo"|"nse"|"sample"}` so the UI can show
 * an honest LIVE/DEMO badge; if both upstreams fail we serve the reference
 * sample data (flagged) instead of an error — the dashboard never blanks.
 */
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELIANCE, TIMEFRAMES, num, signed, signedPct, groupIN, compactIN } from "../src/stockData.js";
import { NIFTY50, SECTORS, PEERS, FALLBACK_LISTS, INDICES, RANGES } from "./universe.mjs";
import { fetchQuotes, fetchChart, fetchSummary, fetchSearch, fetchNews, isMarketOpen, providerInfo } from "./provider.mjs";
import { fetchAllIndices, pickIndex } from "./nse.mjs";
import { cacheStats } from "./util.mjs";

const PORT = Number(process.env.PORT || 8787);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");

const dirOf = (pct) => (pct >= 0 ? "up" : "down");
const priceStr = (p) => (p == null ? "—" : num(p, 2));
const pctStr = (p) => (p == null ? "—" : signedPct(p));

function fmtIST(ms) {
  if (!ms) return "As of —";
  const d = new Date(ms + 19800000);                 // render in IST
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const h12 = ((h + 11) % 12) + 1;
  return `As of ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad2(h12)}:${pad2(m)} ${h < 12 ? "AM" : "PM"} IST`;
}

function relTime(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

/* ------------------------------------------------------------ sample tiers */
const SAMPLE_INDICES = [
  ["NIFTY 50", "24,924.70", "+0.82%", "up"],
  ["SENSEX", "81,186.44", "+0.79%", "up"],
  ["BANK NIFTY", "52,347.10", "+1.12%", "up"],
  ["NIFTY IT", "38,220.55", "-0.34%", "down"],
  ["NIFTY FMCG", "58,441.30", "+0.21%", "up"],
  ["NIFTY PHARMA", "22,118.90", "-0.18%", "down"]
];
const SAMPLE_SECTORS = [
  ["Banking", "+1.12%", "up"], ["IT", "-0.34%", "down"], ["FMCG", "+0.21%", "up"],
  ["Energy", "+1.05%", "up"], ["Auto", "+0.62%", "up"], ["Pharma", "-0.18%", "down"],
  ["Metal", "+1.43%", "up"], ["Realty", "+0.98%", "up"], ["Infra", "+1.21%", "up"],
  ["Media", "-0.46%", "down"], ["PSU", "+0.87%", "up"], ["Consumer Durables", "+0.39%", "up"],
  ["Financial Services", "+1.02%", "up"], ["Telecom", "-0.12%", "down"], ["Services", "+0.55%", "up"]
];

/** Sector panel: NSE official sector index, else computed from live universe
 *  quotes, else the reference sample. */
const SECTOR_INDEX_CANDIDATES = {
  "Banking": ["NIFTY BANK"], "IT": ["NIFTY IT"], "FMCG": ["NIFTY FMCG"],
  "Energy": ["NIFTY ENERGY"], "Auto": ["NIFTY AUTO"], "Pharma": ["NIFTY PHARMA"],
  "Metal": ["NIFTY METAL"], "Realty": ["NIFTY REALTY"], "Infra": ["NIFTY INFRASTRUCTURE"],
  "Media": ["NIFTY MEDIA"], "PSU": ["NIFTY PSU BANK"],
  "Consumer Durables": ["NIFTY CONSUMER DURABLES"],
  "Financial Services": ["NIFTY FINANCIAL SERVICES"],
  "Telecom": ["NIFTY TELECOM", "NIFTY MIDSMALL IT & TELECOM"],
  "Services": ["NIFTY SERVICES SECTOR", "NIFTY SERVICES"]
};

async function buildIndices() {
  let live = "sample";
  let out = null;
  try {
    const { rows } = await fetchAllIndices();
    const nseOut = INDICES.map((ix) => {
      const hit = pickIndex(rows, ix.nse);              // NSE display names
      return hit ? [ix.key, priceStr(hit.value), pctStr(hit.changePct), dirOf(hit.changePct)] : null;
    });
    if (nseOut.some(Boolean)) { out = nseOut; live = "nse"; }
    if (out && !out[1]) {                          // SENSEX isn't on NSE's list — use the
      out[1] = SAMPLE_INDICES[1];                  // sample row rather than spending the
      live = "nse";                                // Yahoo circuit on one ticker
    }
  } catch { /* NSE unreachable */ }
  if (!out) {                                          // tier 2: Yahoo index quotes
    try {
      const q = await fetchQuotes(INDICES.flatMap((ix) => ix.yahoo.slice(0, 1)));
      const yahooOut = INDICES.map((ix) => {
        const quote = q.quotes.find((x) => x.yahoo === ix.yahoo[0]);
        return quote ? [ix.key, priceStr(quote.price), pctStr(quote.changePct), dirOf(quote.changePct ?? 0)] : null;
      });
      if (yahooOut.some(Boolean)) { out = yahooOut; live = "yahoo"; }
    } catch { /* fall through */ }
  }
  if (!out) return { source: "sample", indices: SAMPLE_INDICES };
  // Any row still missing keeps its sample value — but only that row.
  out = out.map((row, i) => row || SAMPLE_INDICES[i]);
  return { source: live, indices: out };
}

async function buildSectors() {
  try {
    const { rows } = await fetchAllIndices();
    const out = SECTORS.map(([name], i) => {
      const hit = pickIndex(rows, SECTOR_INDEX_CANDIDATES[name] || [name]);
      return hit ? [name, pctStr(hit.changePct), dirOf(hit.changePct)] : SAMPLE_SECTORS[i];
    });
    const live = SECTORS.filter(([name]) =>
      pickIndex(rows, SECTOR_INDEX_CANDIDATES[name] || [name])).length;
    if (live >= SECTORS.length - 2) return { source: "nse", sectors: out };
  } catch { /* fall through */ }
  try {                                                // tier 2: average live member quotes
    const members = [...new Set(SECTORS.flatMap(([, syms]) => syms))];
    const { quotes, source: qSrc } = await fetchQuotes(members);
    const bySym = new Map(quotes.map((q) => [q.sym, q]));
    let live = 0;
    const out = SECTORS.map(([name, syms], i) => {
      const ps = syms.map((s) => bySym.get(s)?.changePct).filter((v) => v != null);
      if (!ps.length) return SAMPLE_SECTORS[i];
      live++;
      const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
      return [name, pctStr(+avg.toFixed(2)), dirOf(avg)];
    });
    if (live >= SECTORS.length - 4) return { source: qSrc || "yahoo", sectors: out };
  } catch { /* fall through */ }
  return { source: "sample", sectors: SAMPLE_SECTORS };
}

/* ------------------------------------------------------------- lists/gainers */
const toRow = (q) => [q.sym, priceStr(q.price), pctStr(q.changePct), dirOf(q.changePct ?? 0)];
const toWatchRow = (q) => [q.sym, priceStr(q.price), signed(q.change ?? 0), pctStr(q.changePct), dirOf(q.changePct ?? 0)];

async function buildLists(watch) {
  const watchSyms = (watch && watch.trim() ? watch.split(",") : FALLBACK_LISTS.watchlist.map((r) => r[0]))
    .map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
  try {
    const { quotes, source } = await fetchQuotes(NIFTY50);
    const byPct = quotes.filter((q) => q.changePct != null)
      .sort((a, b) => b.changePct - a.changePct);
    const gainers = byPct.slice(0, 5).map(toRow);
    const losers = [...byPct].reverse().slice(0, 5).map(toRow);
    const trending = [...quotes].filter((q) => q.changePct != null)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5).map(toRow);
    const wq = await fetchQuotes(watchSyms);
    const seen = new Set();
    const watchlist = watchSyms
      .map((s) => wq.quotes.find((q) => q.sym === s))
      .filter((q) => q && !seen.has(q.sym) && seen.add(q.sym))
      .map(toWatchRow);
    return { source, gainers, losers, trending, watchlist: watchlist.length ? watchlist : FALLBACK_LISTS.watchlist };
  } catch {
    const known = FALLBACK_LISTS.watchlist;
    return {
      source: "sample", ...FALLBACK_LISTS,
      watchlist: [...known.filter((r) => watchSyms.includes(r[0])),
                  ...known.filter((r) => !watchSyms.includes(r[0]))].slice(0, Math.max(watchSyms.length, 5))
    };
  }
}

/* ------------------------------------------------------------------- charts */
const sma = (vals, period) => {
  const out = new Array(vals.length).fill(null);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= period) sum -= vals[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
};
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** 2y of daily bars — feeds MA overlays, avg volume, 52w range and returns. */
const dailyHistory = (sym) => fetchChart(sym, "2Y");

async function buildChart(sym, rangeKey) {
  const cfg = RANGES[rangeKey] || RANGES["1Y"];
  try {
    const [main, hist] = await Promise.all([fetchChart(sym, rangeKey), dailyHistory(sym)]);
    const closes = hist.bars.map((b) => b.c);
    const ma50h = sma(closes, 50);
    const ma200h = sma(closes, 200);
    const maByKey = new Map(hist.bars.map((b, i) => [dayKey(b.t), { ma50: ma50h[i], ma200: ma200h[i] }]));
    const lastMa = { ma50: ma50h.at(-1), ma200: ma200h.at(-1) };
    const intraday = cfg.interval.includes("m") || cfg.interval === "1h";
    const bars = main.bars.map((b) => {
      const m = intraday ? lastMa : (maByKey.get(dayKey(b.t)) || null);
      return { ...b, t: new Date(b.t), ma50: m?.ma50 ?? null, ma200: m?.ma200 ?? null };
    });
    const m = main.meta || {};
    return {
      source: main.source || "yahoo", symbol: sym, range: rangeKey, axis: cfg.axis, bars,
      meta: {
        price: m.regularMarketPrice, prevClose: m.previousClose ?? m.chartPreviousClose,
        high52: m.fiftyTwoWeekHigh, low52: m.fiftyTwoWeekLow,
        name: m.shortName, exchange: m.fullExchangeName, granularity: m.dataGranularity
      },
      _meta: main._meta
    };
  } catch (e) {
    if (sym.toUpperCase() === "RELIANCE" && TIMEFRAMES[rangeKey]) {
      return { source: "sample", symbol: sym, range: rangeKey, axis: TIMEFRAMES[rangeKey].axis, bars: TIMEFRAMES[rangeKey].bars, meta: {}, _meta: { fallback: String(e.message || e) } };
    }
    throw e;
  }
}

/** Real returns ladder computed from history — zero extra requests. */
function computeReturns(histBars, maxBars, quote) {
  const c = histBars.map((b) => b.c);
  const at = (back) => (c.length - 1 - back >= 0 ? c[c.length - 1 - back] : null);
  const last = c.at(-1);
  const pct = (from) => (from && last ? +(((last - from) / from) * 100).toFixed(2) : null);
  const monthly = (maxBars || []).map((b) => b.c);
  const mAt = (back) => (monthly.length - 1 - back >= 0 ? monthly[monthly.length - 1 - back] : null);
  const mpct = (from) => (from && monthly.at(-1) ? +(((monthly.at(-1) - from) / from) * 100).toFixed(2) : null);
  return [
    ["1 Day", quote?.changePct != null ? +quote.changePct.toFixed(2) : null],
    ["1 Week", pct(at(5))],
    ["1 Month", pct(at(21))],
    ["3 Months", pct(at(63))],
    ["6 Months", pct(at(126))],
    ["1 Year", pct(at(252))],
    ["3 Years", mpct(mAt(36))],
    ["5 Years", mpct(mAt(60))],
    ["All Time", monthly.length ? mpct(monthly[0]) : null]
  ];
}

/* --------------------------------------------------------------- stock page */
const TABS = ["Overview", "Chart", "Financials", "Ratios", "Shareholding", "Peers", "News",
  "Analysis", "Forecasts", "Technicals", "Options", "Corporate Actions", "Documents"];
const EMPTY_FIN = { labels: [], revenue: [], ebitda: [], netProfit: [], eps: [], chart: [] };

const capBucket = (mcap) => (mcap == null ? null : mcap >= 2e11 ? "Large Cap" : mcap >= 5e10 ? "Mid Cap" : "Small Cap");
const siteOf = (url) => (url ? url.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null);
const lcr = (v) => (v == null ? "—" : "₹" + (v / 1e12).toFixed(2) + " LCr");
const fracPct = (v, d = 1) => (v == null ? "—" : (v > 0 && v < 0.05 ? v * 100 : v).toFixed(d) + "%");
const ratioPct = (v) => (v == null ? "—" : (v * 100).toFixed(1) + "%");
const fyLabel = (end) => {
  const m = /^(\d{4})-(\d{2})/.exec(end || "");
  if (!m) return "FY";
  const year = Number(m[1]);
  return "FY" + (Number(m[2]) >= 7 ? year + 1 : year);   // FY ends Mar–Jun for NSE cos
};
const raw = (v) => (v == null ? null : typeof v === "object" ? v.raw ?? null : v);

function financialsFrom(summary, quarterly) {
  const rows = quarterly
    ? (summary.incomeStatementHistoryQuarterly?.incomeStatementHistoryQuarterly || [])
    : (summary.incomeStatementHistory?.incomeStatementHistory || []);
  if (!rows.length) return null;
  const list = [...rows].reverse();                       // Yahoo returns newest first
  const series = (pick) => list.map((r) => raw(pick(r)));
  const labels = list.map((r) => fyLabel(r.fiscalEndDate));
  const revenue = series((r) => r.totalRevenue);
  const ebitda = series((r) => r.ebitda);
  const netProfit = series((r) => r.netIncome);
  const eps = list.map((r) => raw(r.dilutedEPS) ?? raw(r.basicEPS));
  const lc = (v) => (v == null ? null : +(v / 1e5).toFixed(2));   // ₹ Cr → ₹ lakh Cr
  return {
    labels, revenue, ebitda, netProfit, eps,
    chart: labels.map((label, i) => ({
      label, revenue: lc(revenue[i]), netProfit: lc(netProfit[i]), ebitda: lc(ebitda[i])
    }))
  };
}

async function buildStock(sym) {
  const [qR, sR, hR, mR, nR] = await Promise.allSettled([
    fetchQuotes([sym]), fetchSummary(sym), dailyHistory(sym), fetchChart(sym, "Max"), fetchNews(sym)
  ]);
  if (qR.status !== "fulfilled") throw qR.reason;          // a quote is mandatory
  const q = qR.value.quotes[0];
  if (!q) { const e = new Error("symbol not found"); e.code = 404; throw e; }

  const summary = sR.status === "fulfilled" ? sR.value : {};
  const hist = hR.status === "fulfilled" ? hR.value.bars : [];
  const maxBars = mR.status === "fulfilled" ? mR.value.bars : [];
  const news = nR.status === "fulfilled" ? nR.value : [];
  const fd = summary.financialData || {};
  const dk = summary.defaultKeyStatistics || {};
  const ap = summary.assetProfile || {};
  const sp = summary.summaryProfile || {};
  const pr = summary.price || {};

  const mcap = raw(pr.marketCap) ?? q.mcap;
  const today = hist.at(-1);
  const avgVol20 = hist.length
    ? hist.slice(-20).reduce((a, b) => a + (b.v || 0), 0) / Math.min(20, hist.length)
    : null;
  const last252 = hist.slice(-252);
  const high52 = raw(pr.fiftyTwoWeekHigh) ?? (last252.length ? Math.max(...last252.map((b) => b.h)) : null);
  const low52 = raw(pr.fiftyTwoWeekLow) ?? (last252.length ? Math.min(...last252.map((b) => b.l)) : null);

  /* quote strip ---------------------------------------------------------- */
  const quoteStrip = [
    ["Open", priceStr(q.open ?? today?.o)],
    ["High", priceStr(q.high ?? today?.h), "up"],
    ["Low", priceStr(q.low ?? today?.l), "down"],
    ["Prev Close", priceStr(q.prevClose)],
    ["Volume", q.volume != null ? compactIN(q.volume) : "—"],
    ["Avg. Volume", avgVol20 != null ? compactIN(avgVol20) : "—"],
    ["Market Cap", lcr(mcap)],
    ["P/E Ratio", raw(fd.trailingPE) != null ? raw(fd.trailingPE).toFixed(1) : "—"],
    ["Dividend Yield", fd.dividendYield != null ? fracPct(fd.dividendYield, 2) : "—"],
    ["52W High", priceStr(high52)],
    ["52W Low", priceStr(low52)],
    ["Beta", raw(dk.beta) != null ? raw(dk.beta).toFixed(2) : "—"]
  ];

  /* key metrics ---------------------------------------------------------- */
  const keyMetrics = [
    ["Market Cap", lcr(mcap)],
    ["Enterprise Value", lcr(raw(dk.enterpriseValue))],
    ["P/E Ratio", raw(fd.trailingPE) != null ? raw(fd.trailingPE).toFixed(1) : "—"],
    ["P/B Ratio", raw(dk.priceToBook) != null ? raw(dk.priceToBook).toFixed(1) : "—"],
    ["ROE", fd.returnOnEquity != null ? ratioPct(fd.returnOnEquity) : "—"],
    ["ROA", fd.returnOnAssets != null ? ratioPct(fd.returnOnAssets) : "—"],
    ["Dividend Yield", fd.dividendYield != null ? fracPct(fd.dividendYield, 2) : "—"],
    ["Debt to Equity", fd.debtToEquity != null
      ? (raw(fd.debtToEquity) > 5 ? (raw(fd.debtToEquity) / 100) : raw(fd.debtToEquity)).toFixed(2) : "—"],
    ["EPS (TTM)", raw(dk.trailingEps) != null ? raw(dk.trailingEps).toFixed(1) : "—"],
    ["Beta", raw(dk.beta) != null ? raw(dk.beta).toFixed(2) : "—"]
  ];

  /* analyst consensus ---------------------------------------------------- */
  const trend = (summary.recommendationTrend || [])[0] || null;
  const buy = trend ? trend.strongBuy + trend.buy : null;
  const hold = trend ? trend.hold : null;
  const sell = trend ? trend.sell + trend.strongSell : null;
  const total = buy != null ? buy + hold + sell : 0;
  const share = (n) => (total ? Math.round((n / total) * 100) : 0);
  const meanPrice = raw(fd.targetMeanPrice);
  const consensus = {
    analysts: raw(fd.numberOfAnalystOpinions) ?? (trend ? total : null),
    rating: (fd.recommendationKey || "").toUpperCase().replace("_", " ") || "—",
    buckets: [
      { label: "Buy", pct: share(buy ?? 0), count: buy, color: "#16d889" },
      { label: "Hold", pct: share(hold ?? 0), count: hold, color: "#e8a23c" },
      { label: "Sell", pct: share(sell ?? 0), count: sell, color: "#ff5968" }
    ],
    target: {
      price: meanPrice != null ? "₹" + num(meanPrice, 2) : "—",
      upside: meanPrice != null && q.price ? `(${signed(((meanPrice - q.price) / q.price) * 100)}%)` : "(—)",
      high: raw(fd.targetHighPrice) != null ? num(raw(fd.targetHighPrice), 2) : "—",
      average: meanPrice != null ? num(meanPrice, 2) : "—",
      low: raw(fd.targetLowPrice) != null ? num(raw(fd.targetLowPrice), 2) : "—"
    }
  };

  /* profile + revenue-split donut --------------------------------------- */
  const fin = financialsFrom(summary, false);
  const lastFY = fin?.labels?.at(-1);
  const rev = fin?.revenue?.at(-1), eb = fin?.ebitda?.at(-1), np = fin?.netProfit?.at(-1);
  const segments = rev && eb && np != null && eb >= np && eb <= rev
    ? [
        { name: "Net Profit", pct: +((np / rev) * 100).toFixed(1), color: "#3f8df7" },
        { name: "Depreciation & Interest", pct: +(((eb - np) / rev) * 100).toFixed(1), color: "#e8845d" },
        { name: "Operating Costs", pct: +(((rev - eb) / rev) * 100).toFixed(1), color: "#9d4ee7" }
      ].filter((s) => s.pct > 0)
    : [];
  const listedYear = hist.length ? new Date(hist[0].t).getFullYear() : null;
  const site = siteOf(ap.website || sp.website);
  const profile = {
    about: sp.businessSummary || ap.businessSummary || (sym === "RELIANCE" ? RELIANCE.profile.about : ""),
    facts: [
      ["Sector", ap.sector || "—"],
      ["Industry", ap.industry || "—"],
      ["Employees", ap.fullTimeEmployees ? groupIN(ap.fullTimeEmployees) : "—"],
      ["Headquarters", [ap.city, ap.country].filter(Boolean).join(", ") || "—"],
      ["Website", site || "—", site ? "link" : ""],
      ["Listed", listedYear ? String(listedYear) : "—"]
    ],
    segments,
    segmentsTitle: segments.length ? `Revenue split (${lastFY || "latest FY"})` : "Business Segments"
  };

  const returns = computeReturns(hist, maxBars, q).map(([label, pct]) =>
    [label, pct == null ? "—" : signedPct(pct)]);

  return {
    source: qR.value.source || "yahoo",
    symbol: sym,
    name: q.name,
    badges: [sym, "NSE", "BSE"],
    tags: [ap.sector || ap.industry, capBucket(mcap), NIFTY50.includes(sym) ? "NIFTY 50" : null].filter(Boolean),
    price: q.price,
    change: q.change,
    changePct: q.changePct,
    asOf: fmtIST((q.asOf || Date.now() / 1000) * 1000),
    quote: quoteStrip,
    tabs: TABS,
    sharesCr: raw(dk.sharesOutstanding) != null ? +(raw(dk.sharesOutstanding) / 1e7).toFixed(2) : null,
    returns,
    keyMetrics,
    consensus,
    profile,
    financials: {
      annual: fin || EMPTY_FIN,
      quarterly: financialsFrom(summary, true) || EMPTY_FIN
    },
    news: news.slice(0, 6).map((n) => {
      const rel = relTime(n.published);
      return [n.title, [rel, n.publisher].filter(Boolean).join(rel && n.publisher ? " • " : "")];
    }),
    _meta: qR.value._meta
  };
}

/* ------------------------------------------------------------------ peers */
async function buildPeers(sym) {
  const syms = (PEERS[sym] || PEERS._default).slice(0, 5);
  try {
    const { quotes, source } = await fetchQuotes(syms);
    const rows = [];
    for (const s of syms) {
      const quote = quotes.find((x) => x.sym === s);
      if (!quote) continue;
      let mcapStr = "—", pe = "—", roe = "—", ret = "—";
      try {
        const sum = await fetchSummary(s);
        const m = raw(sum.price?.marketCap) ?? quote.mcap;
        mcapStr = m != null ? groupIN(Math.round(m / 1e7)) : "—";
        pe = raw(sum.financialData?.trailingPE)?.toFixed(1) ?? "—";
        roe = sum.financialData?.returnOnEquity != null ? ratioPct(sum.financialData.returnOnEquity) : "—";
      } catch { /* leave blanks */ }
      try {
        const c = (await fetchChart(s, "1Y")).bars.map((b) => b.c);
        if (c.length && c[0]) ret = signedPct(((c.at(-1) - c[0]) / c[0]) * 100);
      } catch { /* leave blank */ }
      rows.push([s, priceStr(quote.price), mcapStr, pe, roe, ret]);
    }
    if (rows.length) return { source, peers: rows };
  } catch { /* fall through */ }
  if (sym === "RELIANCE") return { source: "sample", peers: RELIANCE.peers };
  return { source: "sample", peers: [] };
}

/* ------------------------------------------------------------- SSE streaming */
const sseClients = new Set();
const sseSend = (res, obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* gone */ } };

async function streamTick() {
  if (!sseClients.size) return;
  const symbols = [...new Set([...sseClients].flatMap((c) => [...c.symbols]))].slice(0, 80);
  if (!symbols.length) return;
  try {
    const { quotes, source } = await fetchQuotes(symbols);
    for (const c of sseClients) {
      const mine = quotes.filter((q) => c.symbols.has(q.sym));
      if (mine.length) sseSend(c.res, { type: "quotes", source, at: Date.now(), quotes: mine });
    }
  } catch (e) {
    for (const c of sseClients) sseSend(c.res, { type: "stale", code: e.code || 500, at: Date.now() });
  }
}

const pollMs = () => (isMarketOpen() ? 15000 : 60000);
setInterval(() => { streamTick(); }, pollMs()).unref?.();
setInterval(() => { for (const c of sseClients) try { c.res.write(": ping\n\n"); } catch { /* gone */ } }, 25000).unref?.();

function handleStream(req, res, url) {
  const syms = (url.searchParams.get("symbols") || "RELIANCE")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 80);
  res.writeHead(200, {
    ...CORS,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 4000\n\n");
  const client = { res, symbols: new Set(syms) };
  sseClients.add(client);
  sseSend(res, { type: "hello", marketOpen: isMarketOpen(), at: Date.now() });
  fetchQuotes(syms)
    .then(({ quotes, source }) => sseSend(res, { type: "quotes", source, at: Date.now(), quotes }))
    .catch((e) => sseSend(res, { type: "stale", code: e.code || 500, at: Date.now() }));
  req.on("close", () => sseClients.delete(client));
}

/* ------------------------------------------------------ static (dist/) */
// In production the same origin must serve the built SPA and the /api routes —
// that keeps every relative fetch/EventSource path in api.js unchanged.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(APP_ROOT, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

/** Serve files from dist/ with an SPA fallback to index.html. Returns false when
 *  the request isn't a GET/HEAD, escapes dist/, or dist/ isn't built yet. */
async function serveStatic(req, res, urlPath) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { decoded = urlPath; }
  let rel = decoded.replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  const filePath = path.normalize(path.join(DIST_DIR, rel));
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) return false;
  const candidates = [];
  try {
    const st = await fs.stat(filePath);
    candidates.push(st.isDirectory() ? path.join(filePath, "index.html") : filePath);
  } catch { /* try the SPA fallback below */ }
  candidates.push(path.join(DIST_DIR, "index.html"));
  for (const candidate of candidates) {
    try {
      const data = await fs.readFile(candidate);
      const type = MIME[path.extname(candidate).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        ...CORS,
        "Content-Type": type,
        "Content-Length": data.length,
        "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=31536000, immutable"
      });
      res.end(req.method === "HEAD" ? undefined : data);
      return true;
    } catch { /* try the next candidate */ }
  }
  return false;
}

/* -------------------------------------------------------------------- router */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

const statusFor = (e) =>
  e?.code === 404 ? 404 : e?.code === 429 ? 503 :
  e?.code === 401 || e?.code === 403 || e?.code === 502 || e?.code === 503 ? 502 : 500;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (!path.startsWith("/api/")) {
    if (await serveStatic(req, res, path)) return;
    res.writeHead(404, { ...CORS, "Content-Type": "text/html; charset=utf-8" });
    res.end("Not found");
    return;
  }
  try {
    if (path === "/api/health") {
      return send(res, 200, {
        ok: true, uptimeSec: Math.round(process.uptime()), marketOpen: isMarketOpen(),
        provider: providerInfo(), cache: cacheStats(), sseClients: sseClients.size
      });
    }
    if (path === "/api/indices") return send(res, 200, await buildIndices());
    if (path === "/api/sectors") return send(res, 200, await buildSectors());
    if (path === "/api/lists") return send(res, 200, await buildLists(url.searchParams.get("watch") || ""));
    if (path === "/api/quotes") {
      const syms = (url.searchParams.get("symbols") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (!syms.length) return send(res, 400, { error: "symbols= required" });
      const r = await fetchQuotes(syms);
      return send(res, 200, { source: r.source, quotes: r.quotes, _meta: r._meta });
    }
    if (path.startsWith("/api/chart/")) {
      const sym = decodeURIComponent(path.slice(11)).toUpperCase();
      if (!sym) return send(res, 400, { error: "symbol required" });
      return send(res, 200, await buildChart(sym, (url.searchParams.get("range") || "1Y").toUpperCase()));
    }
    if (path.startsWith("/api/stock/")) {
      const sym = decodeURIComponent(path.slice(11)).toUpperCase();
      if (!sym) return send(res, 400, { error: "symbol required" });
      return send(res, 200, await buildStock(sym));
    }
    if (path.startsWith("/api/peers/")) {
      const sym = decodeURIComponent(path.slice(11)).toUpperCase();
      if (!sym) return send(res, 400, { error: "symbol required" });
      return send(res, 200, await buildPeers(sym));
    }
    if (path === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return send(res, 200, { source: "sample", quotes: [], news: [] });
      try { return send(res, 200, await fetchSearch(q)); }
      catch { return send(res, 200, { source: "sample", quotes: [], news: [] }); }
    }
    if (path === "/api/news") {
      const q = (url.searchParams.get("q") || "").trim();
      try {
        const news = await fetchNews(q);
        return send(res, 200, {
          source: "yahoo",
          news: news.map((n) => [n.title, [relTime(n.published), n.publisher].filter(Boolean)
            .join(relTime(n.published) && n.publisher ? " • " : "")])
        });
      } catch { return send(res, 200, { source: "sample", news: [] }); }
    }
    if (path === "/api/stream") return handleStream(req, res, url);
    return send(res, 404, { error: `no route: ${path}` });
  } catch (e) {
    const status = statusFor(e);
    send(res, status, { error: String(e.message || e), code: e.code || status, coolingDownMs: e.coolingDownMs });
  }
});

server.listen(PORT, () => {
  console.log(`[stockpulse-api] listening on http://localhost:${PORT}`);
  console.log(`[stockpulse-api] market is ${isMarketOpen() ? "OPEN" : "closed"} — poll ${pollMs() / 1000}s`);
  // Warm the NSE index cache (one request) so the first user request is fast.
  fetchAllIndices()
    .then((r) => console.log(`[stockpulse-api] NSE indices warmed (${r.rows.length} rows)`))
    .catch((e) => console.log(`[stockpulse-api] NSE warmup failed (will retry on demand): ${e.message}`));
});






