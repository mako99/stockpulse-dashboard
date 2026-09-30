// StockPulse — stock detail data module.
//
// Market figures mirror the supplied StockPulse reference screen (Reliance
// Industries Ltd, 26 Sep 2025). Because this demo has no market-data provider,
// the OHLC series is generated with a seeded PRNG: the path is stable across
// renders (no random flicker) and is tuned so the computed moving averages and
// the 1-year return land on the reference figures. Swap buildDailySeries() for
// a real feed and every panel keeps working unchanged.

/* ------------------------------------------------------------------ helpers */

export function groupIN(value, decimals = 0) {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  const neg = n < 0;
  const abs = Math.abs(n).toFixed(decimals);
  const [int, frac] = abs.split(".");
  let out;
  if (int.length <= 3) out = int;
  else {
    const tail = int.slice(-3);
    const head = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = head + "," + tail;
  }
  return (neg ? "-" : "") + out + (frac ? "." + frac : "");
}

// 2912.4 -> "2,912.40" | 639692 -> "6,39,692"
export const num = (v, d = 2) => groupIN(v, d);

// 1.842e7 -> "1.84 Cr" | 1842000 -> "18.42 L"
export function compactIN(v, d = 2) {
  const n = Math.abs(v);
  if (n >= 1e7) return (v / 1e7).toFixed(d) + " Cr";
  if (n >= 1e5) return (v / 1e5).toFixed(d) + " L";
  if (n >= 1e3) return (v / 1e3).toFixed(d) + " K";
  return String(v);
}

export const signed = (v, d = 2) => (v >= 0 ? "+" : "") + v.toFixed(d);
export const signedPct = (v, d = 2) => signed(v, d) + "%";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------- meta */

export const RELIANCE = {
  symbol: "RELIANCE",
  name: "Reliance Industries Ltd",
  badges: ["RELIANCE", "NSE", "BSE"],
  tags: ["Oil & Gas", "Large Cap", "NIFTY 50"],
  price: 2912.4,
  change: 35.4,
  changePct: 1.23,
  asOf: "As of 26 Sep, 03:30 PM IST",
  quote: [
    ["Open", "2,880.00"],
    ["High", "2,928.90", "up"],
    ["Low", "2,865.15", "down"],
    ["Prev Close", "2,877.00"],
    ["Volume", "1.84 Cr"],
    ["Avg. Volume", "1.52 Cr"],
    ["Market Cap", "₹19.72 LCr"],
    ["P/E Ratio", "26.4"],
    ["Dividend Yield", "0.68%"],
    ["52W High", "3,217.45"],
    ["52W Low", "2,220.30"],
    ["Beta", "0.89"]
  ],
  tabs: [
    "Overview", "Chart", "Financials", "Ratios", "Shareholding", "Peers", "News",
    "Analysis", "Forecasts", "Technicals", "Options", "Corporate Actions", "Documents"
  ],
  // Crore shares outstanding — drives the Price / Market Cap axis toggle.
  sharesCr: 677.4,
  returns: [
    ["1 Day", "+1.23%"], ["1 Week", "+2.15%"], ["1 Month", "+4.32%"],
    ["3 Months", "+7.18%"], ["6 Months", "+12.45%"], ["1 Year", "+18.62%"],
    ["3 Years", "+42.18%"], ["5 Years", "+96.34%"], ["All Time", "+412.20%"]
  ],
  keyMetrics: [
    ["Market Cap", "₹19.72 LCr"], ["Enterprise Value", "₹20.14 LCr"],
    ["P/E Ratio", "26.4"], ["P/B Ratio", "2.3"],
    ["ROE", "9.8%"], ["ROCE", "11.4%"],
    ["Dividend Yield", "0.68%"], ["Debt to Equity", "0.32"],
    ["EPS (TTM)", "110.4"], ["Face Value", "10"]
  ],
  consensus: {
    analysts: 32,
    rating: "BUY",
    buckets: [
      { label: "Buy", pct: 69, count: 22, color: "#16d889" },
      { label: "Hold", pct: 25, count: 8, color: "#e8a23c" },
      { label: "Sell", pct: 6, count: 2, color: "#ff5968" }
    ],
    target: {
      price: "₹3,290.50",
      upside: "(+13.0%)",
      high: "3,640.00",
      average: "3,290.50",
      low: "2,780.00"
    }
  },
  profile: {
    about: "Reliance Industries Limited (RIL) is one of India's largest private sector companies, with interests across hydrocarbons, retail, digital services, and new energy. It is a constituent of NIFTY 50 and BSE Sensex.",
    facts: [
      ["Founded", "1966"], ["Chairman", "Shri Mukesh D. Ambani"], ["Headquarters", "Mumbai, India"],
      ["Industry", "Oil & Gas"], ["Employees", "236,000+"], ["Website", "www.ril.com", "link"]
    ],
    segments: [
      { name: "Oil to Chemicals", pct: 52, color: "#3f8df7" },
      { name: "Retail", pct: 28, color: "#e8845d" },
      { name: "Digital Services", pct: 12, color: "#9d4ee7" },
      { name: "New Energy", pct: 6, color: "#29cb91" },
      { name: "Others", pct: 2, color: "#6f7c88" }
    ]
  },
  financials: {
    // ₹ Crore, consolidated. `chart` copies are in ₹ lakh crore for the plot.
    annual: {
      labels: ["FY2021", "FY2022", "FY2023", "FY2024", "FY2025"],
      revenue: [639692, 792756, 890795, 964481, 1032498],
      ebitda: [106758, 139759, 163554, 178921, 192440],
      netProfit: [60596, 67845, 75943, 78420, 83407],
      eps: [48.2, 54.1, 60.8, 69.4, 110.4],
      chart: [
        { label: "FY2021", revenue: 6.4, netProfit: 0.61, ebitda: 1.07 },
        { label: "FY2022", revenue: 7.93, netProfit: 0.68, ebitda: 1.4 },
        { label: "FY2023", revenue: 8.91, netProfit: 0.76, ebitda: 1.64 },
        { label: "FY2024", revenue: 9.64, netProfit: 0.78, ebitda: 1.79 },
        { label: "FY2025", revenue: 10.32, netProfit: 0.83, ebitda: 1.92 }
      ]
    },
    quarterly: {
      labels: ["Q1 FY24", "Q2 FY24", "Q3 FY24", "Q4 FY24", "Q1 FY25", "Q2 FY25", "Q3 FY25", "Q4 FY25"],
      revenue: [219392, 238728, 248160, 264480, 236217, 258027, 267330, 274860],
      ebitda: [41760, 45028, 47810, 50254, 44238, 48946, 52190, 55086],
      netProfit: [17096, 18474, 19641, 20422, 17748, 19766, 21432, 22618],
      eps: [12.6, 13.7, 14.5, 15.1, 13.1, 14.6, 15.8, 16.7],
      chart: [
        { label: "Q1 FY24", revenue: 2.19, netProfit: 0.17, ebitda: 0.42 },
        { label: "Q2 FY24", revenue: 2.39, netProfit: 0.18, ebitda: 0.45 },
        { label: "Q3 FY24", revenue: 2.48, netProfit: 0.2, ebitda: 0.48 },
        { label: "Q4 FY24", revenue: 2.64, netProfit: 0.2, ebitda: 0.5 },
        { label: "Q1 FY25", revenue: 2.36, netProfit: 0.18, ebitda: 0.44 },
        { label: "Q2 FY25", revenue: 2.58, netProfit: 0.2, ebitda: 0.49 },
        { label: "Q3 FY25", revenue: 2.67, netProfit: 0.21, ebitda: 0.52 },
        { label: "Q4 FY25", revenue: 2.75, netProfit: 0.23, ebitda: 0.55 }
      ]
    }
  },
  news: [
    ["RBI keeps repo rate unchanged at 6.50%, maintains neutral stance", "5 minutes ago • Economic Times"],
    ["Reliance to invest ₹75,000 crore in new energy and AI infrastructure", "28 minutes ago • Moneycontrol"],
    ["Global markets rally as Fed hints at possible rate cuts", "1 hour ago • Bloomberg"],
    ["RIL retail arm to expand store count by 20% in FY26", "2 hours ago • Business Standard"],
    ["Jio sees strong subscriber additions in Q2, ARPU improves", "3 hours ago • Mint"]
  ],
  peers: [
    ["RELIANCE", "2,912.40", "19,72,498", "26.4", "9.8%", "+18.6%"],
    ["ONGC", "278.40", "3,49,210", "6.9", "12.4%", "+22.3%"],
    ["IOC", "175.20", "2,47,931", "8.1", "11.2%", "+14.9%"],
    ["BPCL", "302.10", "1,30,882", "7.8", "13.1%", "+26.7%"],
    ["HPCL", "412.30", "89,442", "9.2", "12.2%", "+16.2%"]
  ]
};

/* ------------------------------------------------- OHLC series (demo feed) */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SESSIONS = 1300;                    // ≈5.2 years of NSE sessions
const LAST_DAY = new Date(2025, 8, 26);   // Fri 26 Sep 2025
const LAST_OHLC = { o: 2880.0, h: 2928.9, l: 2865.15, c: 2912.4 };

// Price knots [session index, price]. Solved against the reference figures:
// close 2,912.40, 2,455.24 a year ago (+18.62%), MA50 2,842.61, MA200 2,676.33
// (see the tuner notes in the README). The path reads as: Dec dip → spring
// recovery → mid-year plateau → August dip → September rally.
const KNOTS = [
  [0, 1250], [120, 1420], [250, 1600], [380, 1385], [500, 1310], [620, 1620],
  [740, 1760], [860, 1905], [950, 2055], [1000, 2095],
  [1048, 2457.09], [1075, 2404.09], [1108, 2408.59], [1138, 2512.59], [1168, 2636.59],
  [1192, 2758.59], [1215, 2684.59], [1235, 2750.59], [1252, 2854.96], [1264, 2762.96],
  [1274, 2820.96], [1286, 2876.96], [1292, 2930.96], [1299, LAST_OHLC.c]
];

function pathAt(i) {
  let a = KNOTS[0];
  let b = KNOTS[KNOTS.length - 1];
  for (let k = 0; k < KNOTS.length - 1; k++) {
    if (i >= KNOTS[k][0] && i <= KNOTS[k + 1][0]) { a = KNOTS[k]; b = KNOTS[k + 1]; break; }
  }
  const span = b[0] - a[0] || 1;
  const t = Math.min(1, Math.max(0, (i - a[0]) / span));
  const s = t * t * (3 - 2 * t); // smoothstep — rounded turns instead of corners
  return a[1] + (b[1] - a[1]) * s;
}

function sessionsBack(count) {
  const days = [];
  const d = new Date(LAST_DAY);
  while (days.length < count) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return days.reverse();
}

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function buildDailySeries() {
  const dates = sessionsBack(SESSIONS);
  const rnd = mulberry32(20250926);
  const base = [];
  let noise = 0;
  for (let i = 0; i < SESSIONS; i++) {
    noise = noise * 0.55 + (rnd() - 0.5) * 15;
    base.push(pathAt(i) + noise);
  }
  const shift = LAST_OHLC.c - base[SESSIONS - 1];

  const bars = [];
  let prevClose = null;
  for (let i = 0; i < SESSIONS; i++) {
    const close = base[i] + shift;
    let open = i === 0 ? close : prevClose + (rnd() - 0.5) * (prevClose * 0.004);
    const swing = rnd();
    const high = Math.max(open, close) + swing * close * 0.0055;
    const low = Math.min(open, close) - (1 - swing) * close * 0.0055;
    bars.push({ t: dates[i], o: open, h: high, l: low, c: close, v: (0.75 + rnd() * 0.6) * 1.45e7 });
    prevClose = close;
  }

  const last = bars[bars.length - 1];
  last.o = LAST_OHLC.o;
  last.h = LAST_OHLC.h;
  last.l = LAST_OHLC.l;
  last.c = LAST_OHLC.c;
  last.v = 1.842e7;

  const closes = bars.map((b) => b.c);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  bars.forEach((b, i) => { b.ma50 = ma50[i]; b.ma200 = ma200[i]; });
  return bars;
}

// 75 five-minute bars, 09:15 → 15:30, ending on the day's OHLC.
function buildIntradaySeries() {
  const rnd = mulberry32(713);
  const shape = [];
  for (let i = 0; i < 75; i++) {
    const v = i / 74;
    shape.push(
      Math.sin(v * Math.PI * 1.35 + 0.35) * 0.72 +
      Math.sin(v * Math.PI * 5.2) * 0.12 +
      (rnd() - 0.5) * 0.1
    );
  }
  const lo = Math.min(...shape);
  const hi = Math.max(...shape);
  const price = shape.map((s) => LAST_OHLC.l + ((s - lo) / (hi - lo)) * (LAST_OHLC.h - LAST_OHLC.l));
  for (let i = 71; i < 75; i++) price[i] += (LAST_OHLC.c - price[73]) * ((i - 70) / 4);
  price[73] = LAST_OHLC.c;

  return price.map((p, i) => {
    const open = i === 0 ? LAST_OHLC.o : price[i - 1];
    const close = i === 0 ? LAST_OHLC.o + 1.4 : p;
    const t = new Date(2025, 8, 26, 9, 15 + i * 5);
    return {
      t,
      o: open,
      h: Math.max(open, close) + rnd() * 3.4,
      l: Math.min(open, close) - rnd() * 3.4,
      c: close,
      v: (0.35 + rnd()) * 1.1e6,
      ma50: null,
      ma200: null
    };
  });
}

function aggregate(dailyBars, size) {
  const out = [];
  for (let i = 0; i < dailyBars.length; i += size) {
    const chunk = dailyBars.slice(i, i + size);
    if (!chunk.length) break;
    out.push({
      t: chunk[chunk.length - 1].t,
      o: chunk[0].o,
      h: Math.max(...chunk.map((b) => b.h)),
      l: Math.min(...chunk.map((b) => b.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, b) => s + b.v, 0),
      ma50: chunk[chunk.length - 1].ma50,
      ma200: chunk[chunk.length - 1].ma200
    });
  }
  return out;
}

const daily = buildDailySeries();
const intraday = buildIntradaySeries();

// The current session's bar — drives the chart legend OHLC line.
export const LAST_BAR = daily[daily.length - 1];

// Moving-average snapshot used by the chart legend.
export const SERIES_MA = {
  ma50: LAST_BAR.ma50,
  ma200: LAST_BAR.ma200
};

// An intraday chart sits on the daily 50/200 levels, so those plot as
// near-flat lines instead of vanishing when the 1D range is selected.
intraday.forEach((bar) => {
  bar.ma50 = SERIES_MA.ma50;
  bar.ma200 = SERIES_MA.ma200;
});

// Visible bar windows per range button. `axis` selects the x-axis label style.
export const TIMEFRAMES = {
  "1D": { bars: intraday, axis: "time" },
  "1W": { bars: daily.slice(-5), axis: "day" },
  "1M": { bars: daily.slice(-21), axis: "day" },
  "3M": { bars: daily.slice(-63), axis: "day" },
  "6M": { bars: daily.slice(-126), axis: "day" },
  "1Y": { bars: daily.slice(-252), axis: "month" },
  "5Y": { bars: aggregate(daily, 5), axis: "year" },
  Max: { bars: aggregate(daily, 21), axis: "year" }
};

export const TIMEFRAME_KEYS = Object.keys(TIMEFRAMES);
export const DEFAULT_TIMEFRAME = "1Y";

/* ------------------------------------------------------- axis tick helpers */

// "nice" step (1, 2, 2.5 or 5 × 10^n) for gridline spacing
function niceStep(range, target) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function priceTicks(min, max, count = 8) {
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

// Volume axis ticks, e.g. peak 1.842e7 -> [0, 6.14e6, 1.23e7, 1.84e7]
export function volumeTicks(max) {
  return [0, max / 3, (max * 2) / 3, max];
}

// Evenly spaced x-axis labels, formatted for the selected range.
export function axisTicks(bars, axis, wanted = 9) {
  if (!bars.length) return [];
  const n = bars.length;

  // Year/month axes label period boundaries rather than fixed offsets, so
  // every month (or year) in the window gets a tick exactly once.
  if (axis === "month" || axis === "year") {
    const seen = new Set();
    const ticks = [];
    bars.forEach((bar, i) => {
      const d = bar.t;
      const key = axis === "year" ? d.getFullYear() : d.getFullYear() * 12 + d.getMonth();
      if (seen.has(key)) return;
      seen.add(key);
      ticks.push({
        i,
        label: axis === "year"
          ? String(d.getFullYear())
          : d.getMonth() === 0 ? String(d.getFullYear()) : MONTHS[d.getMonth()]
      });
    });
    if (ticks.length <= 14) return ticks;
    const thin = Math.ceil(ticks.length / 12);
    return ticks.filter((_, k) => k % thin === 0);
  }

  const count = Math.max(2, Math.min(wanted, n));
  const step = (n - 1) / (count - 1);
  const seen = new Set();
  const ticks = [];
  for (let k = 0; k < count; k++) {
    const i = Math.round(k * step);
    const d = bars[i].t;
    const label = axis === "time"
      ? pad2(d.getHours()) + ":" + pad2(d.getMinutes())
      : d.getDate() + " " + MONTHS[d.getMonth()];
    if (seen.has(label)) continue;
    seen.add(label);
    ticks.push({ i, label });
  }
  return ticks;
}

// Tooltip / crosshair timestamp.
export function stampOf(bar, axis) {
  const d = bar.t;
  if (axis === "time") return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  if (axis === "year") return String(d.getFullYear());
  if (axis === "month") return MONTHS[d.getMonth()] + " " + d.getFullYear();
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}
