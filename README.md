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

