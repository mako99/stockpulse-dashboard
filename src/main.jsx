import React, { useState, useEffect, useId, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Home, LineChart, Heart, ScanSearch, PieChart, BarChart3, Newspaper,
  BriefcaseBusiness, GitCompare, Calculator, Settings, Sun, Bell,
  Search, ChevronDown, Star, Plus, ExternalLink, ArrowUpRight,
  ArrowDownRight, Sparkles, CircleDollarSign, Menu, X,
  ChevronRight, Maximize2, Minimize2, SlidersHorizontal, CandlestickChart,
  ChartArea, Baseline, Building2, Globe, Share2, Info, Check
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip
} from "recharts";
import {
  RELIANCE, TIMEFRAMES, TIMEFRAME_KEYS, DEFAULT_TIMEFRAME,
  axisTicks, priceTicks, volumeTicks, compactIN, num, signed,
  signedPct, stampOf
} from "./stockData";
import { useApi, useLiveQuotes, withQuotes } from "./api";
import "./styles.css";


const market = [
  ["NIFTY 50","24,924.70","+0.82%","up"],
  ["SENSEX","81,186.44","+0.79%","up"],
  ["BANK NIFTY","52,347.10","+1.12%","up"]
];

const gainers = [
  ["LT","3,732.50","+5.62%","up"],
  ["ADANIPORTS","1,502.80","+4.21%","up"],
  ["HDFCBANK","1,636.40","+3.98%","up"],
  ["TATASTEEL","174.25","+3.76%","up"],
  ["MARUTI","12,481.00","+3.41%","up"]
];
const losers = [
  ["HEROMOTOCO","4,528.70","-3.21%","down"],
  ["BRITANNIA","5,924.10","-2.98%","down"],
  ["DIVISLAB","3,412.65","-2.45%","down"],
  ["TCS","4,112.30","-2.12%","down"],
  ["NESTLEIND","2,418.60","-1.96%","down"]
];
const trending = [
  ["RELIANCE","2,912.40","+1.23%","up"],
  ["HDFCBANK","1,636.40","+3.98%","up"],
  ["TCS","4,112.30","-2.12%","down"],
  ["INFY","1,542.20","-0.88%","down"],
  ["ADANIENT","3,221.10","+2.45%","up"]
];
const watchlist = [
  ["RELIANCE","2,912.40","+35.40","+1.23%","up"],
  ["TCS","4,112.30","-89.10","-2.12%","down"],
  ["HDFCBANK","1,636.40","+62.65","+3.98%","up"],
  ["INFY","1,542.20","-13.70","-0.88%","down"],
  ["LT","3,732.50","+198.60","+5.62%","up"]
];
const sectors = [
  ["Banking","+1.12%","up"],["IT","-0.34%","down"],["FMCG","+0.21%","up"],
  ["Energy","+1.05%","up"],["Auto","+0.62%","up"],["Pharma","-0.18%","down"],
  ["Metal","+1.43%","up"],["Realty","+0.98%","up"],["Infra","+1.21%","up"],
  ["Media","-0.46%","down"],["PSU","+0.87%","up"],["Consumer Durables","+0.39%","up"],
  ["Financial Services","+1.02%","up"],["Telecom","-0.12%","down"],["Services","+0.55%","up"]
];
const priceData = Array.from({length: 45}, (_, i) => ({
  x: i,
  price: 2875 + i*1.0 + Math.sin(i/1.7)*8 + (i>25 ? (i-25)*0.8 : 0)
}));
const financialData = [
  {year:"FY2021", revenue:54, profit:8, ebitda:16},
  {year:"FY2022", revenue:65, profit:10, ebitda:20},
  {year:"FY2023", revenue:82, profit:13, ebitda:26},
  {year:"FY2024", revenue:98, profit:15, ebitda:31},
  {year:"FY2025", revenue:108, profit:18, ebitda:35}
];

/* Static fallbacks used only while /api/* is unreachable — the API returns the
   exact same tuple shapes, so the markup below never has to branch. */
const MARKET_6 = market.concat([
  ["NIFTY IT","38,220.55","-0.34%","down"],
  ["NIFTY FMCG","58,441.30","+0.21%","up"],
  ["NIFTY PHARMA","22,118.90","-0.18%","down"]
]);
const DASH_NEWS = [
  ["RBI keeps repo rate unchanged at 6.50%, maintains neutral stance","5 minutes ago • Economic Times"],
  ["Reliance to invest ₹75,000 crore in new energy and AI infrastructure","28 minutes ago • Moneycontrol"],
  ["Global markets rally as Fed hints at possible rate cut","1 hour ago • Bloomberg"],
  ["IT stocks slip amid weak global cues","2 hours ago • Business Standard"]
];
const barSeries = (bars) =>
  (bars || []).map((b, i) => ({ x: i, price: typeof b.c === "number" ? b.c : b }));

function Logo(){
  return <div className="brand">
    <div className="brand-mark">
      <svg width="25" height="25" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <circle cx="15" cy="15" r="12.4" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M15 2.6 V27.4 M2.6 15 H27.4" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M6.5 10.2 H23.5 M6.5 19.8 H23.5" stroke="currentColor" strokeWidth="1" opacity=".5"/>
      </svg>
    </div>
    <div>
      <div className="wordmark">MERIDIAN</div>
      <div className="brand-sub">MARKET INTELLIGENCE TERMINAL</div>
    </div>
  </div>
}
function Sparkline({positive=true}){
  return <svg className="spark" viewBox="0 0 90 26" preserveAspectRatio="none">
    <polyline points="0,21 8,18 16,20 25,13 34,15 43,9 52,12 61,7 70,9 79,4 90,2"
      fill="none" stroke={positive ? "#3FBF83" : "#E5484D"} strokeWidth="2"/>
  </svg>
}
function Badge({children}){ return <span className="badge">{children}</span> }
function Toggle({items=["1D","1W","1M","3M","1Y","5Y"], active="1D", onPick}){
  const [a,setA]=useState(active);
  const current = onPick ? active : a;
  const pick = x => { if(onPick) onPick(x); else setA(x); };
  return <div className="toggle">{items.map(x=><button className={current===x?"active":""} onClick={()=>pick(x)} key={x}>{x}</button>)}</div>
}
function SectionTitle({children, action}){ return <div className="section-title"><h2>{children}</h2>{action}</div> }

// Type-ahead search over the live symbol universe (/api/search → Yahoo).
function SearchBox({onOpen}){
  const [q,setQ] = useState("");
  const [debounced,setDebounced] = useState("");
  const [open,setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(()=>{ const t = setTimeout(()=>setDebounced(q.trim()),250); return ()=>clearTimeout(t); },[q]);
  const {data} = useApi(debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null, null, 0);
  const results = (data?.quotes || []).filter(r => r.nse || /EQUITY/.test(r.type || ""));
  useEffect(()=>{
    const away = e => { if(wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",away);
    return ()=>document.removeEventListener("mousedown",away);
  },[]);
  const pick = sym => { if(sym){ onOpen(sym); setQ(""); setOpen(false); } };
  return <div className="search" ref={wrapRef}>
    <Search size={17}/>
    <input value={q} placeholder="Search for stocks, sectors, ETFs, indices, news... (e.g. Reliance, TCS, Nifty)"
      onChange={e=>{setQ(e.target.value); setOpen(true);}}
      onFocus={()=>setOpen(true)}
      onKeyDown={e=>{ if(e.key==="Enter" && results[0]) pick(results[0].nse || results[0].symbol); }}/>
    {open && debounced.length >= 2 && (data?.quotes?.length || 0) > 0 &&
      <div className="search-pop">
        {results.slice(0,7).map(r=>(
          <button key={r.symbol} onMouseDown={e=>{e.preventDefault(); pick(r.nse || r.symbol);}}>
            <b>{r.nse || r.symbol}</b><span>{r.name}</span><em>{r.exchange}</em>
          </button>
        ))}
        {!results.length && <div className="search-empty">No NSE symbols found</div>}
      </div>}
  </div>;
}

function FeedBadge({health, source}){
  const live = source && source !== "sample";
  return <div className={"feed-badge "+(live?"live":"demo")}
    title={live ? "Prices from the live market-data feed" : "Demo data — the API is unreachable"}>
    <i/>{live ? "LIVE" : "DEMO"}
    <span>{health?.marketOpen ? "Market open" : "Market closed"}</span>
  </div>;
}

function App(){
  const [page,setPage] = useState("Home");
  const [mobile,setMobile] = useState(false);
  const [symbol,setSymbol] = useState("RELIANCE");
  const openStock = (sym) => {
    if (typeof sym === "string" && sym) setSymbol(sym.toUpperCase());
    setPage("Stocks"); setMobile(false);
  };
  useEffect(()=>{ window.scrollTo(0,0); },[page]);
  const nav = [
    ["Home",Home],["Stocks",LineChart],["Watchlist",Heart],["Screeners",ScanSearch],
    ["Sector Analysis",PieChart],["Indices",BarChart3],["News",Newspaper],
    ["Portfolios",BriefcaseBusiness],["Compare",GitCompare],["Financial Tools",Calculator]
  ];
  const {data: idx, source: idxSrc} = useApi("/api/indices", {source:"sample", indices: MARKET_6}, 60000);
  const {data: health} = useApi("/api/health", null, 60000);
  const tickerRows = (idx?.indices?.length ? idx.indices : MARKET_6).slice(0,3);
  return <div className="app">
    <aside className={mobile?"sidebar mobile-open":"sidebar"}>
      <div className="side-top"><Logo/><button className="mobile-close" onClick={()=>setMobile(false)}><X size={18}/></button></div>
      <nav>{nav.map(([name,Icon])=><button key={name} className={page===name?"nav-item active":"nav-item"} onClick={()=>{setPage(name);setMobile(false)}}><Icon size={18}/><span>{name}</span></button>)}</nav>
      <div className="side-spacer"/>
      <button className="nav-item"><Settings size={18}/><span>Settings</span></button>
      <div className="pro-card">
        <strong>Pro</strong><p>Unlock advanced screeners, more data, export, and alerts.</p>
        <button>Upgrade</button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" onClick={()=>setMobile(true)}><Menu size={21}/></button>
        <SearchBox onOpen={openStock}/>
        <div className="market-ticker">{tickerRows.map(([n,v,c,t])=><div className="ticker" key={n}><div><b>{n}</b><span>{v} <em className={t}>{c}</em></span></div><Sparkline positive={t==="up"}/></div>)}</div>
        <FeedBadge health={health} source={idxSrc}/>
        <button className="icon-btn"><Sun size={18}/></button><button className="icon-btn bell"><Bell size={18}/><i/></button><div className="avatar">R</div>
      </header>

      {page === "Stocks" ? <StockDetail symbol={symbol} onBack={()=>setPage("Home")}/>
        : page !== "Home" ? <PlaceholderPage page={page}/>
        : <Dashboard onOpenStock={openStock}/>}
    </main>
  </div>
}

function Dashboard({onOpenStock}){
 const {data: lists} = useApi("/api/lists", {source:"sample", gainers, losers, trending, watchlist}, 60000);
 const {data: idx, source: idxSrc} = useApi("/api/indices", {source:"sample", indices: MARKET_6}, 60000);
 const {data: sect} = useApi("/api/sectors", {source:"sample", sectors}, 60000);
 const {data: news} = useApi("/api/news", {source:"sample", news: DASH_NEWS}, 300000);
 const {data: rel} = useApi("/api/stock/RELIANCE", RELIANCE, 60000);
 const {data: idxBars} = useApi(`/api/chart/${encodeURIComponent("^NSEI")}?range=1D`, null, 60000);
 const {data: relBars} = useApi("/api/chart/RELIANCE?range=1D", null, 60000);
 const symbols = [...new Set([...(lists.gainers||[]), ...(lists.losers||[]),
   ...(lists.trending||[]), ...(lists.watchlist||[])].map(r=>r[0]))].slice(0,16);
 const {quotes} = useLiveQuotes(symbols);
 const g = withQuotes(lists.gainers, quotes);
 const l = withQuotes(lists.losers, quotes);
 const tr = withQuotes(lists.trending, quotes);
 const wl = withQuotes(lists.watchlist, quotes, "watch");
 const indexRows = idx?.indices?.length ? idx.indices : MARKET_6;
 const sectRows = sect?.sectors?.length ? sect.sectors : sectors;
 const newsRows = news?.news?.length ? news.news : DASH_NEWS;
 const relStock = rel?.symbol === "RELIANCE" ? rel : RELIANCE;
 const relLive = quotes.RELIANCE;
 const overviewChart = barSeries(idxBars?.bars || priceData);
 const relChart = barSeries(relBars?.bars || priceData);
 const feedLive = [idxSrc].some(s => s && s !== "sample");
 return <div className="content">
   <div className="grid-top">
    <section className="panel overview">
      <SectionTitle>Market Overview <button className="select">NSE <ChevronDown size={14}/></button></SectionTitle>
      <Toggle/>
      <div className="overview-body">
        <div className="market-chart"><AreaChartBox data={overviewChart}/></div>
        <div className="index-list">{indexRows.map(([n,v,c,t])=><div className="index-row" key={n}><span className={"dot "+t}/><b>{n}</b><span>{v}</span><em className={t}>{c}</em></div>)}</div>
      </div>
    </section>
    <ListPanel title="Top Gainers" data={g} onOpen={onOpenStock}/>
    <ListPanel title="Top Losers" data={l} onOpen={onOpenStock}/>
   </div>

   <div className="grid-mid">
    <section className="panel sectors">
      <SectionTitle>Sectors Performance <Toggle items={["1D","1W","1M","3M","1Y"]}/></SectionTitle>
      <div className="sector-grid">{sectRows.map(([n,v,t])=><div className={"sector "+t} key={n}><b>{n}</b><strong>{v}</strong></div>)}</div>
    </section>
    <section className="panel trending">
      <SectionTitle>Trending Stocks <div className="compact-toggles"><button className="active">NSE</button><button>BSE</button><button className="active">1D</button><button>1W</button><button>1M</button></div></SectionTitle>
      <div className="table-head"><span>#</span><span>Symbol</span><span>Last</span><span>Chg</span></div>
      {tr.map((r,i)=><div className="trend-row clickable" onClick={()=>onOpenStock(r[0])} key={r[0]}><span>{i+1}</span><b>{r[0]}</b><span>{r[1]}</span><em className={r[3]}>{r[2]}</em></div>)}
    </section>
    <section className="panel market-news">
      <SectionTitle>Market News <a>View All</a></SectionTitle>
      {newsRows.map(([t,s],i)=><div className="news-row" key={t}><div className={"news-thumb n"+i}/><div><b>{t}</b><small>{s}</small></div></div>)}
    </section>
    <section className="panel watch">
      <SectionTitle>Watchlist <a>View All</a><button className="round-plus"><Plus size={15}/></button></SectionTitle>
      <div className="watch-head"><span>Symbol</span><span>Last</span><span>Chg</span><span>%Chg</span></div>
      {wl.map(r=><div className="watch-row clickable" onClick={()=>onOpenStock(r[0])} key={r[0]}><b>{r[0]}</b><span>{r[1]}</span><em className={r[4]}>{r[2]}</em><em className={r[4]}>{r[3]}</em></div>)}
      <button className="add-watch">＋ Add to Watchlist</button>
    </section>
   </div>

   <StockPanel s={relStock} live={relLive} chartData={relChart} onOpen={()=>onOpenStock("RELIANCE")}/>
 </div>
}

function ListPanel({title,data,onOpen}){
 return <section className="panel list-panel"><SectionTitle>{title}<div className="exchange"><button className="active">NSE</button><button>BSE</button></div></SectionTitle>
   {data.map((r,i)=><div className="list-row clickable" onClick={()=>onOpen(r[0])} key={r[0]}><span className="rank">{i+1}</span><div className="stock-logo">{r[0].slice(0,1)}</div><b>{r[0]}</b><span>{r[1]}</span><em className={r[3]}>{r[2]}</em></div>)}
 </section>
}

function StockPanel({s, live, chartData, onOpen}){
 const p = s || RELIANCE;
 const price = live?.price ?? p.price;
 const change = live?.change ?? p.change;
 const changePct = live?.changePct ?? p.changePct;
 const stats = p.quote || RELIANCE.quote;
 const metrics = p.keyMetrics || RELIANCE.keyMetrics;
 const fin = p.financials?.annual?.chart?.length
   ? p.financials.annual.chart.map(r=>({year:r.label, revenue:r.revenue, profit:r.netProfit, ebitda:r.ebitda}))
   : financialData;
 const about = p.profile?.about || RELIANCE.profile.about;
 const segments = p.source === "sample" || p === RELIANCE
   ? RELIANCE.profile.segments
   : (p.profile?.segments || []);
 return <section className="stock-section">
  <div className="stock-head">
    <button className="stock-title clickable" onClick={onOpen} title="Open the full stock page">
      <div className="reliance-logo">{(p.symbol||"R").slice(0,1)}</div>
      <div><h1>{(p.name||"").toUpperCase()}</h1><div className="sub">NSE: {p.symbol} {(p.tags||[]).map(t=><Badge key={t}>{t}</Badge>)}</div></div>
    </button>
    <div className="stock-actions"><button><Star size={16}/> Add to Watchlist</button><button><GitCompare size={16}/> Compare</button><button className="primary" onClick={onOpen}><Sparkles size={16}/> Analyze Stock</button><button>Trade <ExternalLink size={14}/></button></div>
  </div>
  <div className="stock-stats">
    <div className="price-big"><strong>{num(price,2)}</strong><em className={change>=0?"up":"down"}>{signed(change)} ({signedPct(changePct)})</em><small>{p.asOf}</small></div>
    {stats.map(([k,v,c])=><div className="stat" key={k}><label>{k}</label><b className={c||""}>{v}</b></div>)}
  </div>
  <div className="tabs">{["Overview","Chart","Financials","Ratios","Shareholding","Peers","News","Analysis","Forecasts","Technicals","Options","Docs"].map((x,i)=><button className={i===0?"active":""} key={x}>{x}</button>)}</div>
  <div className="stock-grid">
    <section className="panel price-panel"><SectionTitle>Price Chart <button className="expand">⛶</button></SectionTitle><Toggle items={["1D","5D","1M","3M","6M","1Y","5Y","Max"]}/><div className="big-chart"><AreaChartBox data={chartData||priceData}/></div></section>
    <section className="panel metrics"><SectionTitle>Key Metrics</SectionTitle>{metrics.slice(0,9).map(r=><div className="metric-row" key={r[0]}><span>{r[0]}</span><b>{r[1]}</b></div>)}</section>
    <section className="panel financials"><SectionTitle>Financials (Consolidated) <div className="period"><button className="active">Annual</button><button>Quarterly</button></div></SectionTitle><div className="legend"><span>■ Revenue</span><span>■ Net Profit</span><span>■ EBITDA</span></div><ResponsiveContainer width="100%" height={220}><BarChart data={fin}><CartesianGrid stroke="#20242B" vertical={false}/><XAxis dataKey="year" stroke="#63676E"/><YAxis stroke="#63676E"/><Tooltip contentStyle={{background:"#101318",border:"1px solid #2a2e36"}}/><Bar dataKey="revenue" fill="#E0A458"/><Bar dataKey="profit" fill="#3FBF83"/><Bar dataKey="ebitda" fill="#E8845D"/></BarChart></ResponsiveContainer></section>
    <section className="panel company"><SectionTitle>Company Overview</SectionTitle><p>{about}</p>{segments.length>0 && <><h3>Key Business Segments</h3>{segments.map((x,i)=><div className="segment" key={x.name||x[0]}><i className={"seg s"+i}/><span>{x.name||x[0]}</span><b>{x.pct!=null?x.pct+"%":x[1]}</b></div>)}</>}</section>
  </div>
 </section>
}

function AreaChartBox({data}){
 return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="fillPulse" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3FBF83" stopOpacity=".28"/><stop offset="100%" stopColor="#3FBF83" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="#20242B" vertical={false}/><XAxis dataKey="x" hide/><YAxis domain={["dataMin-5","dataMax+5"]} hide/><Tooltip contentStyle={{background:"#101318",border:"1px solid #2a2e36"}}/><Area type="monotone" dataKey="price" stroke="#3FBF83" fill="url(#fillPulse)" strokeWidth={2} dot={false}/></AreaChart></ResponsiveContainer>
}
function PlaceholderPage({page}){
 return <div className="placeholder"><div className="placeholder-icon"><LineChart size={30}/></div><h1>{page}</h1><p>This page is wired into the StockPulse navigation. Replace this view with the corresponding data module, table, charts and filters.</p><div className="placeholder-cards"><div/><div/><div/></div></div>
}
/* ======================= stock detail page (Stocks view) ======================= */

// Measures the chart container so the SVG can be drawn at real pixel sizes
// (crisp axis text) instead of being scaled by a viewBox.
function useWidth(){
  const ref = useRef(null);
  const [width,setWidth] = useState(0);
  useEffect(()=>{
    const el = ref.current;
    if(!el) return;
    const measure = ()=>setWidth(el.clientWidth);
    measure();
    if(typeof ResizeObserver === "undefined"){
      window.addEventListener("resize",measure);
      return ()=>window.removeEventListener("resize",measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  return [ref,width];
}

const C = {
  up:"#3FBF83", down:"#E5484D", ma50:"#E0A458", ma200:"#8E99A8",
  grid:"#20242B", axis:"#63676E", cross:"#A8A79F"
};

// Candlesticks are drawn by hand: Recharts has no candle series, and adding a
// second charting library for one panel isn't worth the dependency.
function CandleChart({bars, axis, mode, showMA50, showMA200, showVolume, mcap, sharesCr, height}){
  const [box,width] = useWidth();
  const uid = useId().replace(/[^a-zA-Z0-9]/g,"");
  const [hover,setHover] = useState(null);

  const H = height;
  const padL = 8, padR = 68, padT = 12, axisH = 20;
  const volH = showVolume ? 72 : 0, volGap = showVolume ? 12 : 0;
  const priceTop = padT;
  const priceBottom = H - axisH - (showVolume ? volH + volGap : 0);
  const volTop = H - axisH - volH, volBottom = H - axisH;

  const view = useMemo(()=>{
    const factor = mcap ? (sharesCr ?? 1) : 1; // price -> ₹ Crore market cap
    const rows = bars.map(b=>({
      t:b.t, v:b.v,
      o:b.o*factor, h:b.h*factor, l:b.l*factor, c:b.c*factor,
      m50: b.ma50!=null ? b.ma50*factor : null,
      m200: b.ma200!=null ? b.ma200*factor : null
    }));
    let min = Infinity, max = -Infinity;
    rows.forEach(r=>{
      min = Math.min(min, r.l); max = Math.max(max, r.h);
      if(showMA50 && r.m50!=null){ min = Math.min(min, r.m50); max = Math.max(max, r.m50); }
      if(showMA200 && r.m200!=null){ min = Math.min(min, r.m200); max = Math.max(max, r.m200); }
    });
    if(!isFinite(min)){ min = 0; max = 1; }
    const span = (max - min) || 1;
    min -= span*0.05; max += span*0.05;
    return { rows, min, max, ticks: priceTicks(min,max,7), vmax: rows.reduce((m,r)=>Math.max(m,r.v),0) };
  },[bars,showMA50,showMA200,mcap]);

  const n = view.rows.length;
  const innerW = Math.max(40, width - padL - padR);
  const step = innerW / (n || 1);
  const xOf = i => padL + step*(i + 0.5);
  const yOf = v => priceBottom - ((v - view.min)/((view.max - view.min) || 1))*(priceBottom - priceTop);
  const yVol = v => volBottom - (v/(view.vmax || 1))*(volBottom - volTop);
  const bodyW = Math.max(1, Math.min(13, step*0.62));
  const fmtAxis = v => mcap ? (v/1e5).toFixed(2)+"L" : num(v,2);
  const fmtTip = v => mcap ? num(v,0)+" Cr" : num(v,2);
  const move = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n-1, Math.floor((e.clientX - r.left - padL)/step)));
    setHover(prev => prev===i ? prev : i); // re-render only when crossing a bar
  };

  if(!width || !n){
    return <div className="candle-wrap" ref={box}><div className="chart-blank">Loading chart…</div></div>;
  }

  const linePts = view.rows.map((r,i)=>xOf(i).toFixed(1)+","+yOf(r.c).toFixed(1)).join(" ");
  const areaPath = "M"+xOf(0).toFixed(1)+","+priceBottom.toFixed(1)
    + view.rows.map((r,i)=>"L"+xOf(i).toFixed(1)+","+yOf(r.c).toFixed(1)).join("")
    + "L"+xOf(n-1).toFixed(1)+","+priceBottom.toFixed(1)+"Z";
  const maPath = key => {
    let d = "", pen = false;
    view.rows.forEach((r,i)=>{
      const v = r[key];
      if(v==null || !isFinite(v)){ pen = false; return; }
      d += (pen ? "L" : "M") + xOf(i).toFixed(1) + "," + yOf(v).toFixed(1);
      pen = true;
    });
    return d;
  };

  const xTicks = axisTicks(view.rows, axis);
  const vTicks = showVolume ? volumeTicks(view.vmax) : [];
  const vUnit = view.vmax >= 1e7 ? {d:1e7,s:"Cr"} : {d:1e5,s:"L"};
  const fmtVol = v => v===0 ? "0" : (v/vUnit.d).toFixed(2)+vUnit.s;
  const last = view.rows[n-1];
  const lastY = yOf(last.c);
  const baseY = yOf(view.rows[0].c);
  const bar = hover!=null ? view.rows[hover] : null;
  const tipW = 140, tipH = 100;
  const tipX = Math.min(Math.max(xOf(hover||0)+14, padL+4), Math.max(padL+4, padL+innerW-tipW-6));
  const tipY = priceTop + 6;

  return <div className="candle-wrap" ref={box}>
    <svg className="chart-svg" width={width} height={H} onMouseMove={move} onMouseLeave={()=>setHover(null)}>
      <defs>
        <linearGradient id={"g"+uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.up} stopOpacity="0.32"/>
          <stop offset="100%" stopColor={C.up} stopOpacity="0"/>
        </linearGradient>
        <clipPath id={"up"+uid}><rect x={padL} y={priceTop} width={innerW} height={Math.max(0, baseY-priceTop)}/></clipPath>
        <clipPath id={"dn"+uid}><rect x={padL} y={baseY} width={innerW} height={Math.max(0, priceBottom-baseY)}/></clipPath>
      </defs>

      {view.ticks.map(t=>{
        const y = yOf(t);
        if(y < priceTop-1 || y > priceBottom+1) return null;
        return <g key={"g"+t}>
          <line x1={padL} y1={y} x2={padL+innerW} y2={y} stroke={C.grid} strokeWidth="1"/>
          <text x={padL+innerW+8} y={y+3} fontSize="9" fill={C.axis}>{fmtAxis(t)}</text>
        </g>;
      })}
      {vTicks.map(t=><line key={"vg"+t} x1={padL} y1={yVol(t)} x2={padL+innerW} y2={yVol(t)} stroke={C.grid} strokeWidth="1"/>)}

      {mode==="candles" && view.rows.map((r,i)=>{
        const col = r.c >= r.o ? C.up : C.down;
        const yO = yOf(r.o), yC = yOf(r.c);
        return <g key={"c"+i}>
          <line x1={xOf(i)} y1={yOf(r.h)} x2={xOf(i)} y2={yOf(r.l)} stroke={col} strokeWidth="1"/>
          <rect x={xOf(i)-bodyW/2} y={Math.min(yO,yC)} width={bodyW} height={Math.max(1,Math.abs(yC-yO))} fill={col}/>
        </g>;
      })}
      {mode==="line" && <polyline points={linePts} fill="none" stroke={C.up} strokeWidth="1.6"/>}
      {mode==="area" && <g>
        <path d={areaPath} fill={"url(#g"+uid+")"}/>
        <polyline points={linePts} fill="none" stroke={C.up} strokeWidth="1.6"/>
      </g>}
      {mode==="baseline" && <g>
        <line x1={padL} y1={baseY} x2={padL+innerW} y2={baseY} stroke="#63676E" strokeWidth="1" strokeDasharray="4 4"/>
        <path d={areaPath} fill="rgba(63,191,131,.18)" clipPath={"url(#up"+uid+")"}/>
        <path d={areaPath} fill="rgba(229,72,77,.18)" clipPath={"url(#dn"+uid+")"}/>
        <polyline points={linePts} fill="none" stroke={C.up} strokeWidth="1.4"/>
      </g>}

      {showMA50 && <path d={maPath("m50")} fill="none" stroke={C.ma50} strokeWidth="1.3"/>}
      {showMA200 && <path d={maPath("m200")} fill="none" stroke={C.ma200} strokeWidth="1.3"/>}
      {showVolume && view.rows.map((r,i)=>(
        <rect key={"v"+i} x={xOf(i)-bodyW/2} y={yVol(r.v)} width={bodyW}
          height={Math.max(1, volBottom-yVol(r.v))}
          fill={r.c>=r.o ? "rgba(63,191,131,.4)" : "rgba(229,72,77,.4)"}/>
      ))}

      <line x1={padL} y1={lastY} x2={padL+innerW} y2={lastY} stroke={C.up} strokeWidth="1" strokeDasharray="3 3" opacity="0.85"/>
      <rect x={padL+innerW+2} y={lastY-8} width={padR-10} height={16} rx="3" fill={C.up}/>
      <text x={padL+innerW+7} y={lastY+4} fontSize="9" fontWeight="600" fill="#0B0D10">{fmtAxis(last.c)}</text>

      {showVolume && vTicks.map(t=>(
        <text key={"vt"+t} x={padL+innerW+8} y={yVol(t)+3} fontSize="8" fill={C.axis}>{fmtVol(t)}</text>
      ))}

      {xTicks.map(t=>(
        <text key={"x"+t.i} x={xOf(t.i)} y={H-6} fontSize="9" fill={C.axis} textAnchor="middle">{t.label}</text>
      ))}

      {bar && <g>
        <line x1={xOf(hover)} y1={priceTop} x2={xOf(hover)} y2={showVolume ? volBottom : priceBottom} stroke={C.cross} strokeWidth="1" strokeDasharray="3 3"/>
        <line x1={padL} y1={yOf(bar.c)} x2={padL+innerW} y2={yOf(bar.c)} stroke={C.cross} strokeWidth="1" strokeDasharray="3 3"/>
        <rect x={padL+innerW+2} y={yOf(bar.c)-8} width={padR-10} height={16} rx="3" fill="#20242B"/>
        <text x={padL+innerW+7} y={yOf(bar.c)+4} fontSize="9" fill="#E9E4D8">{fmtAxis(bar.c)}</text>
        <g transform={"translate("+tipX+","+tipY+")"}>
          <rect width={tipW} height={tipH} rx="6" fill="#101318" stroke="#2a2e36"/>
          <text x="9" y="17" fontSize="9" fill="#63676E">{stampOf(bar, axis)}</text>
          <text x="9" y="39" fontSize="9" fill="#A8A79F">O  {fmtTip(bar.o)}</text>
          <text x="9" y="56" fontSize="9" fill="#A8A79F">H  {fmtTip(bar.h)}</text>
          <text x="9" y="73" fontSize="9" fill="#A8A79F">L  {fmtTip(bar.l)}</text>
          <text x="9" y="90" fontSize="9" fill={bar.c>=bar.o ? C.up : C.down}>C  {fmtTip(bar.c)}</text>
        </g>
      </g>}
    </svg>
  </div>;
}

const volLabel = v => (v/1e6).toFixed(2)+"M";
const CHART_TYPES = [
  ["candles",CandlestickChart,"Candlesticks"],
  ["line",LineChart,"Line"],
  ["area",ChartArea,"Area"],
  ["baseline",Baseline,"Baseline"]
];

function ChartPanel({symbol="RELIANCE", stock}){
  const [tf,setTf] = useState(DEFAULT_TIMEFRAME);
  const [measure,setMeasure] = useState("price");   // price | mcap
  const [mode,setMode] = useState("candles");
  const [ind,setInd] = useState({ma50:true, ma200:true, volume:true});
  const [open,setOpen] = useState(false);
  const [fs,setFs] = useState(false);
  const menuRef = useRef(null);

  useEffect(()=>{
    if(!open) return;
    const clickAway = e => { if(!menuRef.current || !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",clickAway);
    return ()=>document.removeEventListener("mousedown",clickAway);
  },[open]);
  useEffect(()=>{
    if(!fs) return;
    const esc = e => { if(e.key === "Escape") setFs(false); };
    document.addEventListener("keydown",esc);
    return ()=>document.removeEventListener("keydown",esc);
  },[fs]);

  const {data: chart} = useApi(symbol ? `/api/chart/${encodeURIComponent(symbol)}?range=${tf}` : null, null);
  const view = useMemo(()=>{
    if(chart?.bars?.length){
      return {
        bars: chart.bars.map(b=>({...b, t: b.t instanceof Date ? b.t : new Date(b.t)})),
        axis: chart.axis
      };
    }
    return TIMEFRAMES[tf] || TIMEFRAMES[DEFAULT_TIMEFRAME];   // sample fallback
  },[chart,tf]);
  const mcap = measure === "mcap";
  const sharesCr = stock?.sharesCr ?? RELIANCE.sharesCr;
  const factor = mcap ? sharesCr : 1;
  const last = view.bars[view.bars.length-1] || {o:0,h:0,l:0,c:0,v:0,ma50:null,ma200:null};
  const chg = stock?.change ?? 0;
  const chgPct = stock?.changePct ?? 0;

  return <section className={"panel chart-panel"+(fs?" fs":"")}>
    <div className="chart-head">
      <Toggle items={TIMEFRAME_KEYS} active={tf} onPick={setTf}/>
      <div className="chart-modes">
        <button className={mcap?"":"active"} onClick={()=>setMeasure("price")}>Price</button>
        <button className={mcap?"active":""} onClick={()=>setMeasure("mcap")}>Market Cap</button>
      </div>
      <div className="chart-icons">
        {CHART_TYPES.map(([key,Icon,label])=>(
          <button key={key} title={label} className={"icon-toggle"+(mode===key?" active":"")} onClick={()=>setMode(key)}><Icon size={14}/></button>
        ))}
        <div className="ind-wrap" ref={menuRef}>
          <button className={"icon-toggle wide"+(open?" active":"")} onClick={()=>setOpen(!open)}><SlidersHorizontal size={14}/> Indicators</button>
          {open && <div className="ind-menu">
            <strong>Indicators</strong>
            {[["ma50","MA 50"],["ma200","MA 200"],["volume","Volume"]].map(([key,label])=>(
              <label key={key}><input type="checkbox" checked={ind[key]} onChange={()=>setInd({...ind,[key]:!ind[key]})}/>{label}</label>
            ))}
          </div>}
        </div>
        <button className="icon-toggle" title={fs?"Exit fullscreen":"Fullscreen"} onClick={()=>setFs(!fs)}>{fs ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>
      </div>
    </div>

    <div className="chart-legend">
      <div className="ohlc">
        <span>{symbol} · {tf} · NSE</span>
        <span>O <b>{num(last.o,2)}</b></span>
        <span>H <b>{num(last.h,2)}</b></span>
        <span>L <b>{num(last.l,2)}</b></span>
        <span>C <b>{num(last.c,2)}</b></span>
        <span className={chg>=0?"up":"down"}>{signed(chg)} ({signedPct(chgPct)})</span>
      </div>
      {ind.volume && <div className="ma">Volume <b>{volLabel(last.v)}</b></div>}
      {ind.ma50 && <div className="ma"><i style={{background:C.ma50}}/>MA 50 close 0 <b>{last.ma50!=null ? num(last.ma50*factor,2) : "—"}</b></div>}
      {ind.ma200 && <div className="ma"><i style={{background:C.ma200}}/>MA 200 close 0 <b>{last.ma200!=null ? num(last.ma200*factor,2) : "—"}</b></div>}
    </div>

    <CandleChart bars={view.bars} axis={view.axis} mode={mode}
      showMA50={ind.ma50} showMA200={ind.ma200} showVolume={ind.volume}
      mcap={mcap} sharesCr={sharesCr} height={fs ? Math.max(380, window.innerHeight - 210) : 352}/>
  </section>;
}

function ReturnsStrip({s}){
 const rows = (s && s.returns) || RELIANCE.returns;
 return <div className="returns">{rows.map(([label,val])=>(
    <div className="return-card" key={label}>
      <span>{label}</span>
      <b className={String(val).charAt(0)==="-"?"down":"up"}>{val}</b>
    </div>
  ))}</div>;
}

function AnalystPanel({s}){
  const c = (s && s.consensus) || RELIANCE.consensus;
  return <section className="panel">
    <SectionTitle>Analyst Consensus <Info size={13} style={{verticalAlign:"-2px",marginLeft:6,color:"#63676E"}}/></SectionTitle>
    <div className="consensus">
      <div className="consensus-top"><span>Based on {c.analysts} analysts</span></div>
      <div className="rating-row">
        <div className="rating-box">{c.rating}</div>
        <div className="rating-bar">{c.buckets.map(b=><i key={b.label} style={{width:b.pct+"%",background:b.color}}/>)}</div>
      </div>
      <div className="rating-keys">{c.buckets.map(b=>(
        <span key={b.label}><i style={{width:7,height:7,borderRadius:"50%",background:b.color,display:"inline-block"}}/>{b.label} {b.pct}% ({b.count})</span>
      ))}</div>
      <div className="target-head">
        <span>Target Price</span>
        <b>{c.target.price} <em className="up" style={{fontStyle:"normal",fontSize:10}}>{c.target.upside}</em></b>
      </div>
      <div className="target-cards">
        <div><label>High</label><b>{c.target.high}</b></div>
        <div className="avg"><label>Average</label><b>{c.target.average}</b></div>
        <div><label>Low</label><b>{c.target.low}</b></div>
      </div>
    </div>
  </section>;
}

function MetricsPanel({s}){
  const rows = (s && s.keyMetrics) || RELIANCE.keyMetrics;
  return <section className="panel metrics">
    <SectionTitle>Key Metrics</SectionTitle>
    <div className="metrics-grid">
      {rows.map(([k,v])=><div className="metric-row" key={k}><span>{k}</span><b>{v}</b></div>)}
    </div>
  </section>;
}

// Revenue-mix donut (SVG stroke-dasharray slices — no chart library needed).
function Donut({data,size=132,thickness=24}){
  const r = (size - thickness)/2;
  const circ = 2*Math.PI*r;
  let offset = 0;
  const slices = data.map(s=>{
    const len = (s.pct/100)*circ;
    const slice = {name:s.name, color:s.color, len, offset};
    offset += len;
    return slice;
  });
  return <svg width={size} height={size} viewBox={"0 0 "+size+" "+size} role="img" aria-label="Revenue mix by business segment">
    <g transform={"translate("+(size/2)+","+(size/2)+") rotate(-90)"}>
      <circle r={r} fill="none" stroke="#20242B" strokeWidth={thickness}/>
      {slices.map(s=><circle key={s.name} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
        strokeDasharray={s.len.toFixed(2)+" "+(circ-s.len).toFixed(2)} strokeDashoffset={(-s.offset).toFixed(2)}/>)}
    </g>
  </svg>;
}

function CompanyPanel({s}){
  const p = (s && s.profile) || RELIANCE.profile;
  const segments = p.segments || [];
  return <section className="panel company">
    <SectionTitle>Company Overview</SectionTitle>
    <p>{p.about}</p>
    <dl className="company-facts">
      {(p.facts || []).map(([k,v,kind])=>(
        <div key={k}>
          <dt>{k}</dt>
          <dd>{kind==="link" ? <a href={"https://"+v} target="_blank" rel="noreferrer">{v}</a> : v}</dd>
        </div>
      ))}
    </dl>
    {segments.length > 0 && <>
    <h3>{p.segmentsTitle || "Business Segments"}</h3>
    <div className="donut-wrap">
      <Donut data={segments}/>
      <div className="donut-legend">
        {segments.map(s2=><div key={s2.name}><i style={{background:s2.color}}/>{s2.name}<b>{s2.pct}%</b></div>)}
      </div>
    </div></>}
  </section>;
}

function FinancialsPanel({s}){
  const [period,setPeriod] = useState("annual");
  const f = ((s && s.financials) || RELIANCE.financials)[period] || {labels:[],revenue:[],ebitda:[],netProfit:[],eps:[],chart:[]};
  const numOrNull = (v,d=0)=> v==null ? "—" : num(v,d);
  return <section className="panel financials">
    <SectionTitle>Financial Performance (Consolidated)
      <div className="period">
        <button className={period==="annual"?"active":""} onClick={()=>setPeriod("annual")}>Annual</button>
        <button className={period==="quarterly"?"active":""} onClick={()=>setPeriod("quarterly")}>Quarterly</button>
      </div>
    </SectionTitle>
    <div className="legend"><span>■ Revenue</span><span>■ Net Profit</span><span>■ EBITDA</span></div>
    <ResponsiveContainer width="100%" height={208}>
      <BarChart data={f.chart} barGap={3} barCategoryGap="20%" margin={{top:10,right:12,left:-8,bottom:0}}>
        <CartesianGrid stroke="#20242B" vertical={false}/>
        <XAxis dataKey="label" stroke="#63676E" tick={{fontSize:9}} tickLine={false}/>
        <YAxis stroke="#63676E" tick={{fontSize:9}} tickLine={false} axisLine={false}
          ticks={[0,2,4,6,8,10,12]} tickFormatter={v=>v===0?"0":v+"L"}/>
        <Tooltip contentStyle={{background:"#101318",border:"1px solid #2a2e36",fontSize:10}} formatter={v=>[v+" L Cr"]}/>
        <Bar dataKey="revenue" fill="#E0A458"/>
        <Bar dataKey="netProfit" fill="#3FBF83"/>
        <Bar dataKey="ebitda" fill="#E8845D"/>
      </BarChart>
    </ResponsiveContainer>
    <table className="fin-table">
      <thead>
        <tr><th>₹ (in Crore)</th>{f.labels.map(l=><th key={l}>{l}</th>)}</tr>
      </thead>
      <tbody>
        <tr><td>Revenue</td>{f.revenue.map((v,i)=><td key={i}>{numOrNull(v)}</td>)}</tr>
        <tr><td>EBITDA</td>{f.ebitda.map((v,i)=><td key={i}>{numOrNull(v)}</td>)}</tr>
        <tr><td>Net Profit</td>{f.netProfit.map((v,i)=><td key={i}>{numOrNull(v)}</td>)}</tr>
        <tr><td>EPS (₹)</td>{f.eps.map((v,i)=><td key={i}>{v==null?"—":v.toFixed(1)}</td>)}</tr>
      </tbody>
    </table>
    <div className="fin-foot"><a>View Detailed Financials →</a></div>
  </section>;
}

function NewsPanel({s}){
  const rows = (s && s.news && s.news.length ? s.news : null) || RELIANCE.news;
  return <section className="panel">
    <SectionTitle>Latest News <a>View All</a></SectionTitle>
    <div className="news-list">
      {rows.map(([title,meta],i)=>(
        <div className="news-row" key={title}>
          <div className={"news-thumb n"+(i%4)}/>
          <div><b>{title}</b><small>{meta}</small></div>
        </div>
      ))}
    </div>
  </section>;
}

function PeersPanel({rows}){
  const peers = (rows && rows.length ? rows : null) || RELIANCE.peers;
  return <section className="panel">
    <SectionTitle>Peers Comparison <a>View Full Comparison →</a></SectionTitle>
    <table className="peers-table">
      <thead>
        <tr><th>Symbol</th><th>Price</th><th>Mkt Cap (₹ Cr)</th><th>P/E</th><th>ROE</th><th>1Y Return</th></tr>
      </thead>
      <tbody>
        {peers.map(row=>(
          <tr key={row[0]} className={row[0]==="RELIANCE" ? "self" : ""}>
            <td className="sym">{row[0]}</td>
            <td className="last">{row[1]}</td>
            <td>{row[2]}</td>
            <td>{row[3]}</td>
            <td>{row[4]}</td>
            <td className={row[5].charAt(0)==="-"?"down":"up"}>{row[5]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>;
}

function TabBlank({tab}){
  return <div className="tab-blank">
    <div className="tab-blank-icon"><LineChart size={26}/></div>
    <h2>{tab}</h2>
    <p>
      The {tab} module is already wired into the stock page navigation. Drop the {tab.toLowerCase()} tables,
      filters and charts for RELIANCE here — the header, quote strip and tabs above keep the live symbol context.
    </p>
  </div>;
}

// Tabs with a real view behind them; the rest render an honest placeholder.
const BUILT_TABS = ["Overview","Chart","Financials","Peers","News","Analysis"];

function StockDetail({symbol="RELIANCE", onBack}){
  const [tab,setTab] = useState("Overview");
  const [watched,setWatched] = useState(false);
  const sym = String(symbol).toUpperCase();
  const isSample = sym === "RELIANCE";
  const {data, error} = useApi(`/api/stock/${encodeURIComponent(sym)}`, isSample ? RELIANCE : null);
  const {data: peersData} = useApi(`/api/peers/${encodeURIComponent(sym)}`, null);
  const {quotes} = useLiveQuotes([sym]);
  const live = quotes[sym];
  const s = data && data.symbol === sym ? data : (isSample ? RELIANCE : null);
  useEffect(()=>{ setTab("Overview"); setWatched(false); },[sym]);

  // Flash the big price when an SSE tick changes it.
  const prevPrice = useRef(null);
  const [flash,setFlash] = useState("");
  useEffect(()=>{
    const p = live?.price;
    if(p == null) return;
    if(prevPrice.current != null && p !== prevPrice.current){
      setFlash(p > prevPrice.current ? "tick-up" : "tick-down");
      const t = setTimeout(()=>setFlash(""),900);
      prevPrice.current = p;
      return ()=>clearTimeout(t);
    }
    prevPrice.current = p;
  },[live?.price]);

  if(!s){
    return <div className="content">
      <div className="crumb">
        <button onClick={onBack}><ScanSearch size={12}/> Stocks</button>
        <ChevronRight size={12}/><b>{sym}</b>
      </div>
      <div className="tab-blank">
        <div className="tab-blank-icon"><LineChart size={26}/></div>
        <h2>{error ? "Feed unavailable" : `Loading ${sym}…`}</h2>
        <p>{error
          ? `The market-data API didn't respond for ${sym}. Make sure it is running (\`npm run api\`, port 8787) — dashboard Home still works with demo data.`
          : "Fetching the live quote, chart history and fundamentals…"}</p>
      </div>
    </div>;
  }

  const price = live?.price ?? s.price;
  const change = live?.change ?? s.change;
  const changePct = live?.changePct ?? s.changePct;
  const peersRows = peersData?.peers != null ? peersData.peers : (isSample ? RELIANCE.peers : undefined);

  return <div className="content">
    <div className="crumb">
      <button onClick={onBack}><ScanSearch size={12}/> Stocks</button>
      <ChevronRight size={12}/>
      <b>{s.name}</b>
    </div>

    <section className="stock-section stock-hero">
      <div className="stock-head">
        <div className="stock-title">
          <div className="reliance-logo">{(s.symbol||"R").slice(0,1)}</div>
          <div>
            <div className="title-row">
              <h1>{s.name}</h1>
              {(s.badges||[]).map(b=><span key={b} className={"tick-badge"+(b==="NSE"?" nse":"")}>{b}</span>)}
            </div>
            <div className="sub">
              {(s.tags||[]).map((t,i)=><React.Fragment key={t}>{i>0 && <span className="dot-sep"/>}<span>{t}</span></React.Fragment>)}
            </div>
          </div>
        </div>
        <div className="stock-actions">
          <button className={watched?"active":""} onClick={()=>setWatched(!watched)}>
            <Star size={16} fill={watched?"#E0A458":"none"} color={watched?"#E0A458":undefined}/>
            {watched ? "In Watchlist" : "Add to Watchlist"}
          </button>
          <button title="Compare with peers"><GitCompare size={16}/> Compare</button>
          <button className="primary" title="Place an order"><Check size={16}/> Trade</button>
        </div>
      </div>

      <div className="quote-strip">
        <div className="price-big">
          <div>
            <strong className={flash}>{num(price,2)}</strong>
            <em className={(change>=0?"up":"down")+(flash?" "+flash:"")}>{signed(change)} ({signedPct(changePct)})</em>
          </div>
          <small>{s.asOf}{live ? " · live" : ""}</small>
        </div>
        {(s.quote||[]).map(([k,v,c])=><div className="stat" key={k}><label>{k}</label><b className={c||""}>{v}</b></div>)}
      </div>

      <div className="tabs">
        {(s.tabs||[]).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}</button>)}
      </div>
    </section>

    {tab==="Overview" && <div className="stock-body">
      <div className="stock-col">
        <ChartPanel symbol={sym} stock={s}/>
        <ReturnsStrip s={s}/>
        <div className="stock-split"><CompanyPanel s={s}/><FinancialsPanel s={s}/></div>
      </div>
      <div className="stock-col">
        <AnalystPanel s={s}/>
        <MetricsPanel s={s}/>
        <NewsPanel s={s}/>
        <PeersPanel rows={peersRows}/>
      </div>
    </div>}

    {tab==="Chart" && <div className="stock-body">
      <div className="stock-col"><ChartPanel symbol={sym} stock={s}/><ReturnsStrip s={s}/><CompanyPanel s={s}/></div>
      <div className="stock-col"><AnalystPanel s={s}/><MetricsPanel s={s}/></div>
    </div>}

    {tab==="Financials" && <div className="stock-body">
      <div className="stock-col"><FinancialsPanel s={s}/><CompanyPanel s={s}/></div>
      <div className="stock-col"><MetricsPanel s={s}/><PeersPanel rows={peersRows}/></div>
    </div>}

    {tab==="Peers" && <div className="stock-body">
      <div className="stock-col"><PeersPanel rows={peersRows}/><NewsPanel s={s}/></div>
      <div className="stock-col"><AnalystPanel s={s}/><MetricsPanel s={s}/></div>
    </div>}

    {tab==="News" && <div className="stock-body">
      <div className="stock-col"><NewsPanel s={s}/></div>
      <div className="stock-col"><PeersPanel rows={peersRows}/><MetricsPanel s={s}/></div>
    </div>}

    {tab==="Analysis" && <div className="stock-body">
      <div className="stock-col"><AnalystPanel s={s}/><MetricsPanel s={s}/><NewsPanel s={s}/></div>
      <div className="stock-col"><ReturnsStrip s={s}/><PeersPanel rows={peersRows}/></div>
    </div>}

    {BUILT_TABS.indexOf(tab) < 0 && <TabBlank tab={tab} symbol={sym}/>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);

