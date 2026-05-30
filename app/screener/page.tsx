"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addToWatchlist } from "../../lib/watchlist";
import { authHeader } from "../../lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SECTORS: Record<string, { color: string }> = {
  "Technology":              { color: "#6b7aff" },
  "Healthcare":              { color: "#22c55e" },
  "Financials":              { color: "#eab308" },
  "Energy":                  { color: "#f97316" },
  "Consumer Discretionary":  { color: "#ec4899" },
  "Consumer Staples":        { color: "#10b981" },
  "Industrials":             { color: "#64748b" },
  "Communication Services":  { color: "#8b5cf6" },
  "Materials":               { color: "#f59e0b" },
  "Utilities":               { color: "#06b6d4" },
  "Real Estate":             { color: "#84cc16" },
};

type MarketData = {
  ticker: string; price?: number; change_pct?: number; market_cap?: number;
  pe_trailing?: number; pe_forward?: number; ev_ebitda?: number;
  p_sales?: number; dividend_yield?: number; "52w_range_pct"?: number;
  analyst_recommendation?: string; upside_to_target?: number;
  analyst_target_mean?: number; error?: string;
};

type StockRow = {
  ticker: string; name: string;
  market: MarketData;
  rating?: { score: number; verdict: string } | null;
};

type SortKey = "ticker" | "price" | "change_pct" | "market_cap" | "pe_trailing" | "ev_ebitda" | "score";

const VERDICT_COLORS: Record<string, string> = {
  "Strong Buy": "#22c55e", "Buy": "#84cc16",
  "Hold": "#eab308", "Sell": "#f97316", "Strong Sell": "#ef4444",
};

function fmt(v: number | undefined | null, prefix = "", suffix = "", decimals = 1): string {
  if (v == null) return "—";
  if (prefix === "$" && Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (prefix === "$" && Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (prefix === "$" && Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `${prefix}${v.toFixed(decimals)}${suffix}`;
}

function RangeBar({ pct }: { pct?: number | null }) {
  if (pct == null) return <span style={{ color: "#33334d", fontSize: 10 }}>—</span>;
  const c = pct < 30 ? "#ef4444" : pct < 70 ? "#eab308" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 54, height: 5, background: "#1e1e2e", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#6666aa" }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function ScreenerInner() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const initSector    = searchParams.get("sector") ?? "Technology";

  const [activeSector, setActiveSector] = useState(initSector);
  const [stocks,       setStocks]       = useState<StockRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [saved,        setSaved]        = useState<Set<string>>(new Set());
  const [search,       setSearch]       = useState("");
  const [sortKey,      setSortKey]      = useState<SortKey>("market_cap");
  const [sortAsc,      setSortAsc]      = useState(false);

  const loadSector = useCallback(async (sector: string) => {
    setLoading(true);
    setStocks([]);
    try {
      const res  = await fetch(`${API}/screener/${encodeURIComponent(sector)}`,
        { headers: await authHeader() });
      const data = await res.json();
      setStocks(data.stocks ?? []);
    } catch {
      setStocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSector(activeSector); }, [activeSector, loadSector]);

  async function handleWatch(ticker: string, name: string) {
    try {
      await addToWatchlist(ticker, name);
      setSaved(prev => new Set(prev).add(ticker));
    } catch { /* table not set up */ }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  const color = SECTORS[activeSector]?.color ?? "#6b7aff";

  const filtered = stocks.filter(s =>
    s.ticker.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let av: number | null = null, bv: number | null = null;
    if (sortKey === "ticker")      { return sortAsc ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker); }
    if (sortKey === "price")       { av = a.market?.price ?? null;       bv = b.market?.price ?? null; }
    if (sortKey === "change_pct")  { av = a.market?.change_pct ?? null;  bv = b.market?.change_pct ?? null; }
    if (sortKey === "market_cap")  { av = a.market?.market_cap ?? null;  bv = b.market?.market_cap ?? null; }
    if (sortKey === "pe_trailing") { av = a.market?.pe_trailing ?? null; bv = b.market?.pe_trailing ?? null; }
    if (sortKey === "ev_ebitda")   { av = a.market?.ev_ebitda ?? null;   bv = b.market?.ev_ebitda ?? null; }
    if (sortKey === "score")       { av = a.rating?.score ?? null;       bv = b.rating?.score ?? null; }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortAsc ? av - bv : bv - av;
  });

  function SortHeader({ label, k, align = "right" }: { label: string; k: SortKey; align?: string }) {
    const active = sortKey === k;
    return (
      <span onClick={() => toggleSort(k)} style={{
        cursor: "pointer", userSelect: "none",
        color: active ? color : "#44445a",
        display: "flex", alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : "flex-start", gap: 3,
      }}>
        {label}
        {active && <span style={{ fontSize: 8 }}>{sortAsc ? "▲" : "▼"}</span>}
      </span>
    );
  }

  const totalStocks = Object.values(SECTORS).length;  // placeholder

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.4rem" }}>
          <h1 style={{ fontSize: 20, color: "#e8e8f0", marginBottom: 4, fontFamily: "Georgia, serif" }}>
            Stock Screener
          </h1>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a" }}>
            Live prices · AI ratings · Sector valuation — click any row to run full SEC analysis
          </p>
        </div>

        {/* Sector tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.2rem" }}>
          {Object.entries(SECTORS).map(([sector, { color: c }]) => {
            const active = sector === activeSector;
            return (
              <button key={sector}
                onClick={() => { setActiveSector(sector); setSearch(""); }}
                style={{
                  padding: "5px 13px", borderRadius: 20,
                  background: active ? c + "22" : "transparent",
                  border: `1px solid ${active ? c : "#2a2a3e"}`,
                  color: active ? c : "#6666aa",
                  fontFamily: "monospace", fontSize: 11, cursor: "pointer",
                }}>
                {sector}
              </button>
            );
          })}
        </div>

        {/* Search + refresh */}
        <div style={{ display: "flex", gap: 10, marginBottom: "1rem", alignItems: "center" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${activeSector}…`}
            style={{
              background: "#13131f", border: "1px solid #2a2a3e",
              color: "#e8e8f0", padding: "7px 12px", borderRadius: 7,
              fontSize: 13, fontFamily: "monospace", outline: "none", width: 240,
            }}
          />
          <button onClick={() => loadSector(activeSector)} style={{
            background: "transparent", border: "1px solid #2a2a3e",
            color: "#6666aa", padding: "6px 14px", borderRadius: 7,
            fontFamily: "monospace", fontSize: 11, cursor: "pointer",
          }}>↻ Refresh</button>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#33334d", marginLeft: "auto" }}>
            Prices update every hour · AI ratings from last analysis run
          </span>
        </div>

        {/* Table */}
        <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
          borderTop: `3px solid ${color}`, borderRadius: 10, overflow: "hidden" }}>

          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "84px 1fr 90px 80px 100px 72px 72px 80px 90px 110px 130px",
            padding: "9px 16px", background: "#13131f",
            borderBottom: "1px solid #1e1e2e",
            fontFamily: "monospace", fontSize: 10, color: "#44445a",
            letterSpacing: 0.8, textTransform: "uppercase",
          }}>
            <SortHeader label="Ticker"    k="ticker"      align="left" />
            <span>Company</span>
            <SortHeader label="Price"     k="price" />
            <SortHeader label="Chg %"     k="change_pct" />
            <SortHeader label="Mkt Cap"   k="market_cap" />
            <SortHeader label="P/E"       k="pe_trailing" />
            <SortHeader label="EV/EBITDA" k="ev_ebitda" />
            <span style={{ textAlign: "right" }}>52w Range</span>
            <SortHeader label="AI Score"  k="score" />
            <span style={{ textAlign: "right" }}>Analyst Target</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>

          {/* Loading skeleton */}
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "84px 1fr 90px 80px 100px 72px 72px 80px 90px 110px 130px",
              padding: "12px 16px", borderBottom: "1px solid #13131f",
              background: i % 2 === 0 ? "#0d0d17" : "#0b0b15",
            }}>
              {Array.from({ length: 11 }).map((_, j) => (
                <div key={j} style={{
                  height: 12, borderRadius: 4,
                  background: "#1a1a2e",
                  width: j === 1 ? "70%" : "60%",
                  animation: "pulse 1.5s ease-in-out infinite",
                }} />
              ))}
            </div>
          ))}

          {/* Rows */}
          {!loading && sorted.map((stock, i) => {
            const m = stock.market;
            const chgColor = (m.change_pct ?? 0) >= 0 ? "#22c55e" : "#ef4444";
            const vcolor = stock.rating ? (VERDICT_COLORS[stock.rating.verdict] ?? "#6b7aff") : null;
            return (
              <div key={stock.ticker}
                onClick={() => router.push(`/?ticker=${stock.ticker}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "84px 1fr 90px 80px 100px 72px 72px 80px 90px 110px 130px",
                  padding: "11px 16px", alignItems: "center",
                  borderBottom: i < sorted.length - 1 ? "1px solid #13131f" : "none",
                  background: i % 2 === 0 ? "#0d0d17" : "#0b0b15",
                  cursor: "pointer", transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#141428")}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#0d0d17" : "#0b0b15")}
              >
                {/* Ticker */}
                <span style={{ fontFamily: "monospace", fontSize: 13,
                  color, fontWeight: "bold" }}>{stock.ticker}</span>

                {/* Name */}
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8888b0",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  paddingRight: 8 }}>
                  {stock.name}
                </span>

                {/* Price */}
                <span style={{ fontFamily: "monospace", fontSize: 12,
                  color: "#e8e8f0", textAlign: "right" }}>
                  {fmt(m.price, "$", "", 2)}
                </span>

                {/* Change % */}
                <span style={{ fontFamily: "monospace", fontSize: 11,
                  color: chgColor, textAlign: "right" }}>
                  {m.change_pct != null
                    ? `${m.change_pct >= 0 ? "+" : ""}${m.change_pct.toFixed(2)}%`
                    : "—"}
                </span>

                {/* Market cap */}
                <span style={{ fontFamily: "monospace", fontSize: 11,
                  color: "#8888b0", textAlign: "right" }}>
                  {fmt(m.market_cap, "$")}
                </span>

                {/* P/E */}
                <span style={{ fontFamily: "monospace", fontSize: 11,
                  color: "#c0c0d8", textAlign: "right" }}>
                  {fmt(m.pe_trailing, "", "x", 1)}
                </span>

                {/* EV/EBITDA */}
                <span style={{ fontFamily: "monospace", fontSize: 11,
                  color: "#c0c0d8", textAlign: "right" }}>
                  {fmt(m.ev_ebitda, "", "x", 1)}
                </span>

                {/* 52w range bar */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <RangeBar pct={m["52w_range_pct"]} />
                </div>

                {/* AI Score */}
                <div style={{ textAlign: "right" }}>
                  {stock.rating ? (
                    <span style={{
                      background: (vcolor ?? "#6b7aff") + "22",
                      border: `1px solid ${(vcolor ?? "#6b7aff")}44`,
                      color: vcolor ?? "#6b7aff",
                      fontFamily: "monospace", fontSize: 10,
                      padding: "2px 8px", borderRadius: 10,
                    }}>
                      {stock.rating.score} · {stock.rating.verdict}
                    </span>
                  ) : (
                    <span style={{ fontFamily: "monospace", fontSize: 10,
                      color: "#2a2a3e" }}>not analyzed</span>
                  )}
                </div>

                {/* Analyst target */}
                <div style={{ textAlign: "right" }}>
                  {m.analyst_target_mean ? (
                    <div>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#c0c0d8" }}>
                        {fmt(m.analyst_target_mean, "$", "", 2)}
                      </div>
                      {m.upside_to_target != null && (
                        <div style={{ fontFamily: "monospace", fontSize: 9,
                          color: m.upside_to_target >= 0 ? "#22c55e" : "#ef4444" }}>
                          {m.upside_to_target >= 0 ? "+" : ""}{m.upside_to_target.toFixed(1)}% upside
                        </div>
                      )}
                    </div>
                  ) : <span style={{ color: "#2a2a3e", fontSize: 10 }}>—</span>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
                  onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleWatch(stock.ticker, stock.name)}
                    style={{
                      background: saved.has(stock.ticker) ? "#22c55e22" : "transparent",
                      border: `1px solid ${saved.has(stock.ticker) ? "#22c55e44" : "#2a2a3e"}`,
                      color: saved.has(stock.ticker) ? "#22c55e" : "#6666aa",
                      padding: "3px 8px", borderRadius: 5,
                      fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                    }}>
                    {saved.has(stock.ticker) ? "✓" : "+Watch"}
                  </button>
                  <button
                    onClick={() => router.push(`/?ticker=${stock.ticker}`)}
                    style={{
                      background: color + "22", border: `1px solid ${color}44`,
                      color, padding: "3px 10px", borderRadius: 5,
                      fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                    }}>
                    Analyze →
                  </button>
                </div>
              </div>
            );
          })}

          {!loading && sorted.length === 0 && (
            <div style={{ padding: "2.5rem", textAlign: "center",
              fontFamily: "monospace", fontSize: 12, color: "#33334d" }}>
              {search ? `No results for "${search}"` : "No data loaded"}
            </div>
          )}
        </div>

        <p style={{ fontFamily: "monospace", fontSize: 10, color: "#22223a", marginTop: 10 }}>
          Prices from Yahoo Finance · Updated hourly · AI scores from last SEC analysis run ·
          Click any row to run a full AI analysis using verified XBRL financial data
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </main>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100vh", background: "#0a0a0f",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "monospace", color: "#6b7aff" }}>Loading screener…</span>
      </main>
    }>
      <ScreenerInner />
    </Suspense>
  );
}
