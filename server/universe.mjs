/**
 * Symbol universe and static grouping metadata for the StockPulse API.
 *
 * Everything here is *configuration*, not data: quotes always come live from
 * the upstream provider. `universe()` optionally refreshes the NIFTY 50 list
 * from NSE's official constituents CSV (cached for a day) so the list stays
 * accurate without code edits; on failure we fall back to the list below.
 */

// Core NSE universe: ticker (NSE) -> Yahoo symbol. "M&M.NS" style names are
// handled automatically; `&` is URL-encoded by the provider.
export const NIFTY50 = [
  "RELIANCE","TCS","HDFCBANK","ICICIBANK","INFY","HINDUNILVR","ITC","SBIN",
  "BHARTIARTL","KOTAKBANK","LT","AXISBANK","ASIANPAINT","MARUTI","TITAN",
  "SUNPHARMA","TATAMOTORS","TATASTEEL","WIPRO","ULTRACEMCO","NTPC","POWERGRID",
  "BAJFINANCE","BAJAJFINSV","HCLTECH","ADANIENT","ADANIPORTS","ONGC","COALINDIA",
  "NESTLEIND","JSWSTEEL","TATACONSUM","M&M","HDFCLIFE","SBILIFE","BRITANNIA",
  "DIVISLAB","DRREDDY","CIPLA","APOLLOHOSP","EICHERMOT","HEROMOTOCO",
  "BAJAJ-AUTO","INDUSINDBK","GRASIM","TECHM","TRENT","SHRIRAMFIN","BAJAJHLDNG",
  "JIOFIN","DLF","VEDL"
];

// Tickers used only for specific panels (peers, sector maths) — fetched on demand.
export const EXTRA = ["IOC", "BPCL", "HPCL", "PIDILITIND", "TECHM", "MPHASIS", "PERSISTENT"];

export const yahooSymbol = (sym) => (sym.includes("^") || sym.includes("=") ? sym : `${sym}.NS`);

/** Dashboard rows the UI expects by default (used if upstream is down). */
export const FALLBACK_LISTS = {
  gainers: [["LT", "3,732.50", "+5.62%", "up"], ["ADANIPORTS", "1,502.80", "+4.21%", "up"], ["HDFCBANK", "1,636.40", "+3.98%", "up"], ["TATASTEEL", "174.25", "+3.76%", "up"], ["MARUTI", "12,481.00", "+3.41%", "up"]],
  losers: [["HEROMOTOCO", "4,528.70", "-3.21%", "down"], ["BRITANNIA", "5,924.10", "-2.98%", "down"], ["DIVISLAB", "3,412.65", "-2.45%", "down"], ["TCS", "4,112.30", "-2.12%", "down"], ["NESTLEIND", "2,418.60", "-1.96%", "down"]],
  trending: [["RELIANCE", "2,912.40", "+1.23%", "up"], ["HDFCBANK", "1,636.40", "+3.98%", "up"], ["TCS", "4,112.30", "-2.12%", "down"], ["INFY", "1,542.20", "-0.88%", "down"], ["ADANIENT", "3,221.10", "+2.45%", "up"]],
  watchlist: [["RELIANCE", "2,912.40", "+35.40", "+1.23%", "up"], ["TCS", "4,112.30", "-89.10", "-2.12%", "down"], ["HDFCBANK", "1,636.40", "+62.65", "+3.98%", "up"], ["INFY", "1,542.20", "-13.70", "-0.88%", "down"], ["LT", "3,732.50", "+198.60", "+5.62%", "up"]]
};

/** Index rows for the ticker strip and Market Overview panel.
 *  `nse`    = display names in NSE's allIndices feed (preferred source);
 *  `yahoo`  = Yahoo symbols used only when NSE is unreachable. */
export const INDICES = [
  { key: "NIFTY 50",     nse: ["NIFTY 50"],              yahoo: ["^NSEI"] },
  { key: "SENSEX",       nse: ["S&P BSE SENSEX", "SENSEX"], yahoo: ["^BSESN"] },
  { key: "BANK NIFTY",   nse: ["NIFTY BANK"],            yahoo: ["^NSEBANK", "^CNXBANK"] },
  { key: "NIFTY IT",     nse: ["NIFTY IT"],              yahoo: ["^CNXIT", "^NSEIT"] },
  { key: "NIFTY FMCG",   nse: ["NIFTY FMCG"],            yahoo: ["^CNXFMCG"] },
  { key: "NIFTY PHARMA", nse: ["NIFTY PHARMA"],          yahoo: ["^CNXPHARMA"] }
];

/** Sector performance is computed from live quotes of these constituents
 *  (static grouping, live prices). Edit freely — the UI just renders whatever
 *  this exports. */
export const SECTORS = [
  ["Banking",             ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK"]],
  ["IT",                  ["INFY", "TCS", "WIPRO", "HCLTECH", "TECHM"]],
  ["FMCG",                ["HINDUNILVR", "ITC", "NESTLEIND", "TATACONSUM", "BRITANNIA"]],
  ["Energy",              ["RELIANCE", "ONGC", "COALINDIA", "NTPC", "POWERGRID"]],
  ["Auto",                ["MARUTI", "TATAMOTORS", "M&M", "EICHERMOT", "HEROMOTOCO", "BAJAJ-AUTO"]],
  ["Pharma",              ["SUNPHARMA", "DIVISLAB", "DRREDDY", "CIPLA", "APOLLOHOSP"]],
  ["Metal",               ["TATASTEEL", "JSWSTEEL", "GRASIM", "VEDL"]],
  ["Realty",              ["DLF", "ADANIENT"]],
  ["Infra",               ["LT", "ADANIPORTS"]],
  ["PSU",                 ["SBIN", "NTPC", "POWERGRID", "ONGC", "COALINDIA"]],
  ["Consumer Durables",   ["ASIANPAINT", "TITAN", "ULTRACEMCO"]],
  ["Financial Services",  ["BAJFINANCE", "BAJAJFINSV", "HDFCLIFE", "SBILIFE", "SHRIRAMFIN", "JIOFIN"]],
  ["Telecom",             ["BHARTIARTL"]],
  ["Media",               []],
  ["Services",            ["TRENT", "GRASIM"]]
];

/** Peer table per stock (tickers, not Yahoo symbols). */
export const PEERS = {
  RELIANCE: ["RELIANCE", "ONGC", "IOC", "BPCL", "HPCL"],
  _default: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"]
};

/** What the chart ranges map to upstream. Yahoo ranges: 1d/5d/1mo/3mo/6mo/1y/2y/5y/10y/ytd/max */
export const RANGES = {
  "1D":  { range: "1d",  interval: "5m",  label: "1D",  axis: "time" },
  "1W":  { range: "5d",  interval: "15m", label: "1W",  axis: "time" },
  "1M":  { range: "1mo", interval: "1d",  label: "1M",  axis: "day" },
  "3M":  { range: "3mo", interval: "1d",  label: "3M",  axis: "day" },
  "6M":  { range: "6mo", interval: "1d",  label: "6M",  axis: "day" },
  "1Y":  { range: "1y",  interval: "1d",  label: "1Y",  axis: "month" },
  "5Y":  { range: "5y",  interval: "1wk", label: "5Y",  axis: "month" },
  "Max": { range: "max", interval: "1mo", label: "Max", axis: "year" },
  // Internal only (not a UI range): feeds the MA 50 / MA 200 overlay.
  "2Y":  { range: "2y",  interval: "1d",  label: "2Y",  axis: "month" }
};

export const NSE_CSV = "https://archives.nseindia.com/content/indices/ind_nifty50list.csv";
