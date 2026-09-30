# StockPulse Dashboard

A React + Vite implementation inspired by the supplied StockPulse dashboard reference.

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Build

```bash
npm run build
```

## Stock detail page

Open it from the sidebar (**Stocks**) or by clicking any stock row on the dashboard
(gainers, losers, trending, watchlist, or the Reliance preview panel). Breadcrumb
"Stocks" returns to the dashboard.

Implemented from the reference screen, all wired and interactive:

- **Header** — logo, title, ticker/exchange badges, sector line, watchlist toggle, Compare, Trade.
- **Quote strip** — price with day change, timestamp, and 12 session stats.
- **Chart** — 1D/1W/1M/3M/6M/1Y/5Y/Max ranges, Price ⇄ Market Cap axis, candlestick /
  line / area / baseline modes, an Indicators menu (MA 50, MA 200, volume), fullscreen
  (Esc to exit) and a hover crosshair with an OHLC tooltip.
- **Panels** — analyst consensus, key metrics, returns ladder, company overview with a
  segment donut, financial performance (annual/quarterly chart + table), latest news and
  a peers comparison table.
- **Tabs** — Overview, Chart, Financials, Peers, News and Analysis have real views; the
  remaining tabs render a placeholder panel ready to be filled in.

Charting note: the candlestick and volume series are drawn with hand-rolled SVG because
Recharts has no candle series and a second charting library wasn't worth the dependency.
Recharts still powers the market/financial bar charts.

## Market data providers

The server layers providers so no single upstream can blank a panel:

| Source | Used for | Key needed |
|---|---|---|
| **NSE** (`server/nse.mjs`) | Index + sector rows | no |
| **Twelve Data** (`server/twelvedata.mjs`) | Live quotes, charts | `TWELVEDATA_API_KEY` |
| **Yahoo** (`server/yahoo.mjs`) | Quotes, charts, search, news, fundamentals | no |

Yahoo needs no key but **rate-limits datacenter IPs hard** — the same code that
works on a home connection returns `429` from a cloud host. Setting
`TWELVEDATA_API_KEY` puts a keyed API in front of it, which fixes that.

`server/provider.mjs` owns the choice: Twelve Data is tried first for quotes and
charts, and *any* failure falls back to Yahoo — so a spent credit quota degrades
to slower/labelled-sample data rather than an error. Yahoo remains the only
source for news and fundamentals (Twelve Data has no free equivalent).

### Enabling it

Get a free key at <https://twelvedata.com/pricing>, then:

```bash
TWELVEDATA_API_KEY=your_key_here npm run dev:all      # locally
railway variable set TWELVEDATA_API_KEY --stdin       # on Railway (paste key)
```

Tuning knobs (all optional, sane defaults shown):

```bash
TWELVEDATA_CREDITS_PER_MIN=8      # free plan = 8; raise if you upgrade
TWELVEDATA_CREDITS_PER_DAY=800    # free plan resets to 800 at 00:00 UTC
TWELVEDATA_BATCH=8                # symbols per request (each costs 1 credit)
TWELVEDATA_QUOTE_TTL_MS=60000     # every refresh is paid for in credits
TWELVEDATA_CHART_TTL_MS=600000
TWELVEDATA_API_URL=https://api.twelvedata.com   # override for testing
```

**Why the budget logic matters:** `/quote` and `/time_series` cost **1 credit per
symbol**, the quota resets each minute, and the free plan also caps the day. The
adapter therefore reserves the whole symbol set *before* any request and refuses
rather than half-fetching, so a shortfall never wastes credits or returns a
partial answer. Because the full NIFTY-50 list needs ~50 credits, those panels
keep using Yahoo/NSE on the free plan — the budget protects the watchlist and
stock-detail quotes that matter most. Raise `TWELVEDATA_CREDITS_PER_MIN` on a paid
plan and the panels move over automatically.

`GET /api/health` reports what's in play, including live credit usage:

```json
{ "provider": { "active": "twelvedata+yahoo",
                "twelvedata": { "perMinute": 8, "usedThisMinute": 4, "leftThisMinute": 4 } } }
```

## Notes
- The UI is responsive and includes mobile navigation.
- Charts use Recharts (plus the custom SVG candlestick chart noted above).
- Navigation switches between the dashboard and placeholder modules so you can wire each section to real APIs.
- Market figures in this demo are static sample data and should be replaced with a live market-data provider before production.
- `src/stockData.js` holds the stock-page dataset and the demo OHLC generator. The series
  comes from a seeded PRNG (stable between renders), and its price knots were solved so the
  chart-derived figures match the reference screen: 1-year return +18.62%, MA 50 2,842.61,
  MA 200 2,676.33, average volume 1.52 Cr. Swap `buildDailySeries()` for a real feed and the
  chart, moving averages and volume panel keep working unchanged.
- Two caveats on the sample figures: the 52-week high/low and beta chips are the literal
  values from the reference image (they don't reconcile with its own +18.62% 1-year return),
  and the reference screenshot's TradingView watermark is intentionally not reproduced.

