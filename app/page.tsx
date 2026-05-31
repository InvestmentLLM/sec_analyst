"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, authHeader } from "../lib/supabase";
import { addToWatchlist, isInWatchlist } from "../lib/watchlist";
import RiskSignals from "../components/RiskSignals";
import ManagementTone from "../components/ManagementTone";
import InsiderActivity from "../components/InsiderActivity";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Filing = { form_type: string; filed_date: string; accession_number: string; document_url: string };
type SubScores = { revenue_growth: number; profitability: number; balance_sheet: number; earnings_quality: number; outlook: number; risk_profile: number };
type DataPoint = { year: number; value: number };
type FinData = Record<string, DataPoint[]>;
type RiskSignalsData = {
  altman_z?: { score: number; zone: string; components: Record<string, number>; data_year: number; model: string; thresholds: string } | null;
  beneish_m?: { score: number; risk_level: string; components: Record<string, number>; components_used: string[]; data_year: number; thresholds: string } | null;
  ai_interpretation?: string;
};
type ToneData = { trend: string; trend_score: number; notable_changes: string[]; new_risk_themes: string[]; recurring_strengths: string[]; ai_analysis: string; years_analyzed: number };
type InsiderSummary = { total_transactions: number; transactions_90d: number; buys_90d: number; sells_90d: number; buy_value_90d: number; sell_value_90d: number; net_value_90d: number; net_sentiment: string };
type InsiderTx = { date: string; owner: string; title: string; type: "Buy" | "Sell"; shares: number; price: number; value: number; is_director: boolean; is_officer: boolean };
type MarketData = {
  ticker: string;
  price: number | null;
  change_pct: number | null;
  market_cap: number | null;
  enterprise_value: number | null;
  "52w_high": number | null;
  "52w_low": number | null;
  "52w_range_pct": number | null;
  pe_trailing: number | null;
  pe_forward: number | null;
  ev_ebitda: number | null;
  p_sales: number | null;
  p_book: number | null;
  dividend_yield: number | null;
  beta: number | null;
  short_pct: number | null;
  analyst_target_mean: number | null;
  analyst_target_high: number | null;
  analyst_target_low: number | null;
  analyst_recommendation: string | null;
  analyst_count: number | null;
  upside_to_target: number | null;
};
type ValuationMultiple = { value: number; median: number; verdict: "Cheap" | "Fair" | "Expensive"; vs_median: number };
type Valuation = {
  overall: "Cheap" | "Fair Value" | "Expensive" | "Insufficient Data";
  interpretation: string;
  multiples: Record<string, ValuationMultiple>;
  sector_medians: Record<string, number>;
  sector_used: string;
};
type CompAnalysis = {
  company_name: string; rating_score: number; rating_verdict: string; confidence: string;
  sub_scores: SubScores; summary: string; justification: string; trend_summary?: string;
  investment_thesis?: string;
  verified_metrics: Record<string, string>;
  positives: string[]; risks: string[];
  red_flags: string[]; outlook: string; financial_data: FinData; filings_analyzed: Filing[];
  risk_signals?: RiskSignalsData; management_tone?: ToneData;
  company_info?: { name: string; sicDescription?: string; stateOfIncorporation?: string };
  market_data?: MarketData;
  valuation?: Valuation;
  llm_error?: string;
};
type Msg = { role: "user" | "assistant"; text: string };

/* ── helpers ────────────────────────────────────────────────────── */
function scoreColor(s: number) {
  if (s >= 85) return "#22c55e";
  if (s >= 70) return "#84cc16";
  if (s >= 50) return "#eab308";
  if (s >= 30) return "#f97316";
  return "#ef4444";
}
function fmtVal(v: number) {
  if (Math.abs(v) >= 1e12) return `$${(v/1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9)  return `$${(v/1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6)  return `$${(v/1e6).toFixed(1)}M`;
  return v.toFixed(2);
}

/* ── Score Gauge ────────────────────────────────────────────────── */
function ScoreGauge({ score }: { score: number }) {
  const r = 66, cx = 100, cy = 80;
  // angle in standard math (y-up) convention: 0=right, π=left, score 0→π, score 100→0
  const angle    = Math.PI * (1 - score / 100);
  const nx       = cx + r * Math.cos(angle);
  const ny       = cy - r * Math.sin(angle);   // SVG y is inverted so minus
  const color    = scoreColor(score);
  const largeArc = score > 50 ? 1 : 0;

  // arc endpoints (flat bottom of D-shape)
  const lx = cx - r, rx = cx + r;

  return (
    // viewBox tall enough: arc top at cy-r=14, text bottom at cy+40=120 → height 128
    <svg viewBox="0 0 200 128" width={200} height={128}>
      <defs>
        <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ef4444"/>
          <stop offset="28%"  stopColor="#f97316"/>
          <stop offset="50%"  stopColor="#eab308"/>
          <stop offset="72%"  stopColor="#84cc16"/>
          <stop offset="100%" stopColor="#22c55e"/>
        </linearGradient>
      </defs>
      {/* background arc */}
      <path d={`M ${lx} ${cy} A ${r} ${r} 0 0 0 ${rx} ${cy}`}
        fill="none" stroke="#1e1e2e" strokeWidth={12} strokeLinecap="round"/>
      {/* coloured progress arc */}
      {score > 0 && (
        <path d={`M ${lx} ${cy} A ${r} ${r} 0 ${largeArc} 0 ${nx.toFixed(2)} ${ny.toFixed(2)}`}
          fill="none" stroke="url(#arcGrad)" strokeWidth={12} strokeLinecap="round"/>
      )}
      {/* needle */}
      <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)}
        stroke="#e8e8f0" strokeWidth={2.5} strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={4.5} fill="#e8e8f0"/>
      {/* end labels — safely below arc endpoints */}
      <text x={lx}    y={cy+16} textAnchor="middle" fontSize={9} fill="#44445a" fontFamily="monospace">0</text>
      <text x={rx}    y={cy+16} textAnchor="middle" fontSize={9} fill="#44445a" fontFamily="monospace">100</text>
      {/* score number — below pivot, well inside viewBox */}
      <text x={cx} y={cy+26} textAnchor="middle" fontSize={26} fontWeight="bold"
        fill={color} fontFamily="Georgia,serif">{score}</text>
      <text x={cx} y={cy+40} textAnchor="middle" fontSize={9} fill="#555570"
        fontFamily="monospace" letterSpacing={1}>OUT OF 100</text>
    </svg>
  );
}

/* ── Revenue / Income bar chart ─────────────────────────────────── */
function RevenueChart({ rev, income }: { rev: DataPoint[]; income: DataPoint[] }) {
  if (!rev || rev.length === 0) return (
    <p style={{ fontSize: 12, color: "#44445a", fontFamily: "monospace", padding: "1rem 0" }}>
      No multi-year revenue data available from XBRL.
    </p>
  );
  const W = 420, H = 160, PAD = { l: 56, r: 12, t: 14, b: 28 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

  const allVals = [...rev.map(d => d.value), ...(income || []).map(d => d.value)];
  const maxAbs  = Math.max(...allVals.map(Math.abs), 1);
  const minVal  = Math.min(...allVals, 0);
  const range   = maxAbs - Math.min(minVal, 0);

  const toY = (v: number) => PAD.t + iH * (1 - (v - Math.min(minVal, 0)) / range);
  const zeroY = toY(0);

  const gap  = iW / rev.length;
  const bW   = Math.min(36, gap * 0.55);
  const incByYear = Object.fromEntries((income || []).map(d => [d.year, d.value]));

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.min(minVal, 0) + range * t);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
      {ticks.map((tv, ti) => {
        const y = toY(tv);
        return (
          <g key={ti}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#1a1a2e" strokeWidth={1}/>
            <text x={PAD.l - 4} y={y + 4} textAnchor="end" fontSize={8} fill="#44445a" fontFamily="monospace">
              {fmtVal(tv)}
            </text>
          </g>
        );
      })}
      {/* zero baseline */}
      {minVal < 0 && (
        <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="#2a2a40" strokeWidth={1.5}/>
      )}
      {rev.map((d, i) => {
        const barTop = d.value >= 0 ? toY(d.value) : zeroY;
        const barH   = Math.abs(toY(d.value) - zeroY);
        const bx     = PAD.l + gap * i + (gap - bW) / 2;
        const inc    = incByYear[d.year];
        const iy     = inc != null ? toY(inc) : null;
        const incC   = inc != null && inc < 0 ? "#ef4444" : "#22c55e";
        return (
          <g key={d.year}>
            <rect x={bx} y={barTop} width={bW} height={Math.max(barH, 1)}
              fill="#6b7aff" opacity={0.75} rx={3}/>
            <text x={bx + bW/2} y={H - PAD.b + 14} textAnchor="middle"
              fontSize={9} fill="#6666aa" fontFamily="monospace">{d.year}</text>
            {iy != null && <circle cx={bx + bW/2} cy={iy} r={4} fill={incC}/>}
          </g>
        );
      })}
      {/* income connecting line */}
      {(() => {
        const pts = rev
          .map((d, i) => {
            const inc = incByYear[d.year];
            if (inc == null) return null;
            return `${PAD.l + gap * i + gap/2},${toY(inc).toFixed(2)}`;
          })
          .filter(Boolean);
        return pts.length > 1
          ? <polyline points={pts.join(" ")} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.7} strokeDasharray="4 2"/>
          : null;
      })()}
      {/* legend */}
      <rect x={PAD.l} y={2} width={9} height={9} fill="#6b7aff" opacity={0.75} rx={2}/>
      <text x={PAD.l + 13} y={10} fontSize={8} fill="#6666aa" fontFamily="monospace">Revenue</text>
      <circle cx={PAD.l + 66} cy={6} r={4} fill="#22c55e"/>
      <text x={PAD.l + 74} y={10} fontSize={8} fill="#6666aa" fontFamily="monospace">Net Income</text>
    </svg>
  );
}

/* ── Margins trend chart ─────────────────────────────────────────── */
function MarginsChart({ data }: { data: FinData }) {
  const sort = (k: string) => [...(data[k] || [])].sort((a, b) => a.year - b.year);
  const rev = sort("revenue"), gp = sort("gross_profit"),
        op  = sort("operating_income"), ni = sort("net_income");
  if (rev.length < 2) return null;
  const revByYr = Object.fromEntries(rev.map(d => [d.year, d.value]));
  const margins = (series: DataPoint[], key: string) =>
    series.filter(d => revByYr[d.year]).map(d => ({ year: d.year, value: d.value / revByYr[d.year] * 100, key }));
  const gpM = margins(gp, "gp"), opM = margins(op, "op"), niM = margins(ni, "ni");
  const allSeries = [...gpM, ...opM, ...niM];
  if (allSeries.length < 2) return null;
  const years = rev.map(d => d.year);
  const W = 460, H = 140, P = { l: 44, r: 12, t: 22, b: 24 };
  const iW = W - P.l - P.r, iH = H - P.t - P.b;
  const vals = allSeries.map(d => d.value);
  const minV = Math.min(...vals, 0) - 2, maxV = Math.max(...vals, 10) + 2;
  const range = maxV - minV;
  const toX = (yr: number) => P.l + ((years.indexOf(yr)) / Math.max(years.length - 1, 1)) * iW;
  const toY = (v: number) => P.t + iH * (1 - (v - minV) / range);
  const makePath = (pts: { year: number; value: number }[]) =>
    pts.length < 2 ? "" : pts.map((p, i) => `${i ? "L" : "M"}${toX(p.year).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const ticks = [0, .33, .67, 1].map(t => minV + range * t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, overflow: "visible" }}>
      {ticks.map((tv, i) => (
        <g key={i}>
          <line x1={P.l} y1={toY(tv)} x2={W-P.r} y2={toY(tv)} stroke="#1a1a2e" strokeWidth={.8}/>
          <text x={P.l-4} y={toY(tv)+3} textAnchor="end" fontSize={8} fill="#44445a" fontFamily="monospace">{tv.toFixed(0)}%</text>
        </g>
      ))}
      {minV < 0 && <line x1={P.l} y1={toY(0)} x2={W-P.r} y2={toY(0)} stroke="#2a2a40" strokeWidth={1.2}/>}
      {years.map((yr, i) => (
        <text key={yr} x={toX(yr)} y={H-P.b+13} textAnchor="middle" fontSize={9} fill="#44445a" fontFamily="monospace">
          {i % 2 === 0 || years.length <= 5 ? yr : ""}
        </text>
      ))}
      {gpM.length > 1 && <path d={makePath(gpM)} fill="none" stroke="#6b7aff" strokeWidth={2} strokeLinejoin="round"/>}
      {opM.length > 1 && <path d={makePath(opM)} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round"/>}
      {niM.length > 1 && <path d={makePath(niM)} fill="none" stroke="#eab308" strokeWidth={2} strokeLinejoin="round"/>}
      {gpM.length > 0 && <circle cx={toX(gpM.at(-1)!.year)} cy={toY(gpM.at(-1)!.value)} r={3.5} fill="#6b7aff"/>}
      {opM.length > 0 && <circle cx={toX(opM.at(-1)!.year)} cy={toY(opM.at(-1)!.value)} r={3.5} fill="#22c55e"/>}
      {niM.length > 0 && <circle cx={toX(niM.at(-1)!.year)} cy={toY(niM.at(-1)!.value)} r={3.5} fill="#eab308"/>}
      <circle cx={P.l} cy={P.t-9} r={4} fill="#6b7aff"/>
      <text x={P.l+9} y={P.t-5} fontSize={8} fill="#6666aa" fontFamily="monospace">Gross Margin</text>
      <circle cx={P.l+83} cy={P.t-9} r={4} fill="#22c55e"/>
      <text x={P.l+92} y={P.t-5} fontSize={8} fill="#6666aa" fontFamily="monospace">Operating Margin</text>
      <circle cx={P.l+181} cy={P.t-9} r={4} fill="#eab308"/>
      <text x={P.l+190} y={P.t-5} fontSize={8} fill="#6666aa" fontFamily="monospace">Net Margin</text>
    </svg>
  );
}

/* ── Analysis report renderer ────────────────────────────────────── */
function AnalysisReport({ text }: { text: string }) {
  if (!text) return null;
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {paras.map((para, i) => (
        <p key={i} style={{ margin: 0, fontSize: 14, lineHeight: 1.9, color: i === 0 ? "#d8d8ee" : "#b0b0cc" }}>
          {para}
        </p>
      ))}
    </div>
  );
}

/* ── Bullet list for positives / risks / red flags ───────────────── */
function BulletList({ items, color, icon }: { items: string[]; color: string; icon: string }) {
  if (!items?.length) return (
    <p style={{ fontFamily: "monospace", fontSize: 12, color: "#33334d", fontStyle: "italic" }}>None identified</p>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color, fontSize: 13, flexShrink: 0, marginTop: 1, fontWeight: "bold" }}>{icon}</span>
          <span style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.55 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Sub-score bar ───────────────────────────────────────────────── */
function SubBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const c   = scoreColor(Math.round(pct));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6666aa", width: 130, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, background: "#1a1a2e", borderRadius: 4, height: 7, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 4,
          transition: "width 0.8s ease" }}/>
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#c0c0d8", width: 38, textAlign: "right", flexShrink: 0 }}>
        {score}/{max}
      </span>
    </div>
  );
}

/* ── Card ────────────────────────────────────────────────────────── */
function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e", borderRadius: 10,
      padding: "1rem 1.2rem", borderLeft: accent ? `3px solid ${accent}` : "1px solid #1e1e2e" }}>
      <div style={{ fontFamily: "monospace", fontSize: 10, color: accent || "#6b7aff",
        letterSpacing: 1.2, marginBottom: 10, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

/* ── Verdict badge ───────────────────────────────────────────────── */
function VerdictBadge({ verdict, confidence }: { verdict: string; confidence: string }) {
  const colors: Record<string, string> = {
    "Strong Buy": "#22c55e", "Buy": "#84cc16",
    "Hold": "#eab308", "Sell": "#f97316", "Strong Sell": "#ef4444",
  };
  const c = colors[verdict] || "#6b7aff";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <span style={{ background: c + "22", border: `1px solid ${c}`, color: c,
        fontFamily: "monospace", fontSize: 14, fontWeight: "bold",
        padding: "5px 18px", borderRadius: 20 }}>{verdict}</span>
      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a" }}>
        {confidence} confidence
      </span>
    </div>
  );
}

/* ── Valuation Card ─────────────────────────────────────────────── */
function ValuationCard({ market, valuation }: { market: MarketData; valuation: Valuation }) {
  const overallColor: Record<string, string> = {
    "Cheap": "#22c55e", "Fair Value": "#eab308",
    "Expensive": "#ef4444", "Insufficient Data": "#6666aa",
  };
  const oc = overallColor[valuation.overall] ?? "#6666aa";

  const verdictColor = (v: string) =>
    v === "Cheap" ? "#22c55e" : v === "Fair" ? "#eab308" : "#ef4444";

  const fmtCap = (v: number | null) => {
    if (!v) return "—";
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
    return `$${(v / 1e6).toFixed(0)}M`;
  };

  const range = market["52w_range_pct"];
  const rangeCo = range == null ? "#6666aa" : range >= 70 ? "#22c55e" : range >= 30 ? "#eab308" : "#ef4444";
  const multEntries = Object.entries(valuation.multiples);

  return (
    <Card title="Market Valuation · Live Price vs. Sector Peers" accent={oc}>
      {/* ── top stat row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: "1.4rem 2rem",
        alignItems: "start", marginBottom: 18, flexWrap: "wrap" }}>

        {/* Price */}
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6666aa",
            letterSpacing: 1, marginBottom: 3 }}>PRICE</div>
          <div style={{ fontFamily: "monospace", fontSize: 24, color: "#e8e8f0", fontWeight: "bold",
            lineHeight: 1 }}>
            {market.price != null ? `$${market.price.toFixed(2)}` : "—"}
          </div>
          {market.change_pct != null && (
            <div style={{ fontFamily: "monospace", fontSize: 11, marginTop: 4,
              color: market.change_pct >= 0 ? "#22c55e" : "#ef4444" }}>
              {market.change_pct >= 0 ? "▲" : "▼"} {Math.abs(market.change_pct).toFixed(2)}%
            </div>
          )}
        </div>

        {/* Market Cap */}
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6666aa",
            letterSpacing: 1, marginBottom: 3 }}>MARKET CAP</div>
          <div style={{ fontFamily: "monospace", fontSize: 20, color: "#c0c0d8", fontWeight: "bold",
            lineHeight: 1 }}>
            {fmtCap(market.market_cap)}
          </div>
          {market.beta != null && (
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a", marginTop: 4 }}>
              β {market.beta.toFixed(2)}
              {market.dividend_yield ? ` · Div ${market.dividend_yield.toFixed(2)}%` : ""}
            </div>
          )}
        </div>

        {/* 52-week range */}
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6666aa",
            letterSpacing: 1, marginBottom: 6 }}>
            52-WEEK RANGE{range != null ? ` · ${range.toFixed(0)}% of range` : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a", whiteSpace: "nowrap" }}>
              {market["52w_low"] != null ? `$${market["52w_low"].toFixed(0)}` : "—"}
            </span>
            <div style={{ flex: 1, height: 8, background: "#1a1a2e", borderRadius: 4,
              position: "relative", overflow: "hidden" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${Math.min(Math.max(range ?? 0, 0), 100)}%`,
                background: rangeCo, borderRadius: 4, transition: "width 0.6s ease",
              }}/>
            </div>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a", whiteSpace: "nowrap" }}>
              {market["52w_high"] != null ? `$${market["52w_high"].toFixed(0)}` : "—"}
            </span>
          </div>
          {market.analyst_target_mean != null && (
            <div style={{ marginTop: 7, fontFamily: "monospace", fontSize: 11, color: "#8888b0" }}>
              Analyst target{" "}
              <span style={{ color: "#c0c0d8" }}>${market.analyst_target_mean}</span>
              {market.upside_to_target != null && (
                <span style={{ color: market.upside_to_target >= 0 ? "#22c55e" : "#ef4444",
                  marginLeft: 5 }}>
                  ({market.upside_to_target >= 0 ? "+" : ""}{market.upside_to_target.toFixed(1)}%)
                </span>
              )}
              {market.analyst_recommendation && (
                <span style={{ color: "#6b7aff", marginLeft: 10 }}>
                  {market.analyst_recommendation}
                  {market.analyst_count ? ` (${market.analyst_count} analysts)` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── multiples grid ── */}
      {multEntries.length > 0 && (
        <div style={{ display: "grid",
          gridTemplateColumns: `repeat(${Math.min(multEntries.length, 5)}, 1fr)`,
          gap: 10, marginBottom: 14 }}>
          {multEntries.map(([name, m]) => (
            <div key={name} style={{
              background: "#0a0a1a",
              border: `1px solid ${verdictColor(m.verdict)}33`,
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#6666aa",
                marginBottom: 5, letterSpacing: 0.8 }}>{name}</div>
              <div style={{ fontFamily: "monospace", fontSize: 17, color: "#e8e8f0",
                fontWeight: "bold", marginBottom: 2 }}>
                {m.value.toFixed(1)}×
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a",
                marginBottom: 6 }}>
                Sector: {m.median}×
              </div>
              <span style={{
                display: "inline-block",
                background: verdictColor(m.verdict) + "22",
                border: `1px solid ${verdictColor(m.verdict)}55`,
                color: verdictColor(m.verdict),
                fontFamily: "monospace", fontSize: 9, fontWeight: "bold",
                padding: "2px 7px", borderRadius: 4,
              }}>
                {m.verdict}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── overall verdict banner ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        background: oc + "10", border: `1px solid ${oc}30`,
        borderRadius: 8, padding: "10px 14px",
      }}>
        <span style={{
          flexShrink: 0,
          background: oc + "22", border: `1px solid ${oc}`,
          color: oc, fontFamily: "monospace", fontSize: 12, fontWeight: "bold",
          padding: "4px 14px", borderRadius: 6,
        }}>
          {valuation.overall}
        </span>
        <p style={{ margin: 0, fontSize: 13, color: "#b0b0cc", lineHeight: 1.55 }}>
          {valuation.interpretation}
        </p>
      </div>
    </Card>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
function HomeInner() {
  const searchParams = useSearchParams();
  const [inputVal,   setInputVal]   = useState("");
  const [ticker,     setTicker]     = useState("");
  const [analysis,   setAnalysis]   = useState<CompAnalysis | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [loadStep,   setLoadStep]   = useState("");
  const [error,      setError]      = useState("");
  const [messages,   setMessages]   = useState<Msg[]>([]);
  const [question,   setQuestion]   = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [watched,          setWatched]          = useState(false);
  const [watchMsg,         setWatchMsg]         = useState("");
  const [showWatchlistSQL, setShowWatchlistSQL] = useState(false);
  const [insiders,       setInsiders]       = useState<{ transactions: InsiderTx[]; summary: InsiderSummary } | null>(null);
  const [insidersLoading,setInsidersLoading]= useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Auto-analyze from URL param e.g. /?ticker=AAPL
  useEffect(() => {
    const t = searchParams.get("ticker")?.toUpperCase();
    if (t) { setInputVal(t); runAnalysis(t); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAnalysis(overrideTicker?: string, forceRefresh = false) {
    const t = (overrideTicker ?? inputVal).trim().toUpperCase();
    if (!t) return;
    setWatched(false); setWatchMsg("");
    setInsiders(null); setInsidersLoading(false);
    setError(""); setAnalysis(null); setMessages([]); setLoading(true); setTicker(t);

    const steps = forceRefresh
      ? ["Clearing cache…", "Fetching fresh SEC filings…", "Downloading latest XBRL data…", "Running AI analysis…"]
      : [
        "Fetching company info…",
        "Downloading XBRL financial history…",
        "Reading 10-K (MD&A, Risk Factors, Financials)…",
        "Fetching 10-Qs and 8-Ks…",
        "Running AI analysis and scoring…",
      ];
    let si = 0;
    setLoadStep(steps[0]);
    const iv = setInterval(() => { si = Math.min(si + 1, steps.length - 1); setLoadStep(steps[si]); }, 5000);

    try {
      const url = forceRefresh ? `${API}/comprehensive/${t}?refresh=true` : `${API}/comprehensive/${t}`;
      const res = await fetch(url, { headers: await authHeader() });
      if (!res.ok) throw new Error((await res.json()).detail || "Analysis failed");
      const data = await res.json();
      setAnalysis(data);
      isInWatchlist(t).then(setWatched);
      // Lazy-load insider data after main analysis
      setInsidersLoading(true);
      fetch(`${API}/insiders/${t}`, { headers: await authHeader() })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.transactions) setInsiders(d); })
        .catch(() => {})
        .finally(() => setInsidersLoading(false));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      clearInterval(iv);
      setLoading(false);
      setLoadStep("");
    }
  }

  async function handleWatchToggle() {
    if (!ticker || !analysis) return;
    try {
      await addToWatchlist(ticker, analysis.company_name);
      setWatched(true);
      setWatchMsg("Added to watchlist");
      setTimeout(() => setWatchMsg(""), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("relation") || msg.toLowerCase().includes("table") || msg.toLowerCase().includes("exist")) {
        setShowWatchlistSQL(true);
      } else if (msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("login")) {
        setWatchMsg("Sign in to use the watchlist");
        setTimeout(() => setWatchMsg(""), 3000);
      } else {
        setWatchMsg("Watchlist unavailable");
        setTimeout(() => setWatchMsg(""), 3000);
      }
    }
  }

  async function sendQuestion() {
    if (!question.trim() || !ticker) return;
    const q = question.trim(); setQuestion("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setAskLoading(true);
    try {
      const res  = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { ...await authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, question: q }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", text: data.answer || data.detail || "No answer" }]);
    } catch (e: unknown) {
      setMessages(m => [...m, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : "Unknown"}` }]);
    } finally {
      setAskLoading(false);
    }
  }

  const score = analysis?.rating_score ?? 0;
  const rev   = analysis?.financial_data?.revenue   ?? [];
  const inc   = analysis?.financial_data?.net_income ?? [];

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>

      {/* ── Search bar ── */}
      <div style={{ padding: "1.2rem 1.5rem", borderBottom: "1px solid #1a1a2e",
        background: "#0a0a0f" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && !loading && runAnalysis()}
            placeholder="Enter ticker — AAPL, NVDA, TSLA, RRC…"
            style={{ flex: 1, maxWidth: 360, background: "#13131f", border: "1px solid #2a2a3e",
              color: "#e8e8f0", padding: "8px 14px", borderRadius: 7,
              fontSize: 14, fontFamily: "monospace", outline: "none" }}
          />
          <button
            onClick={() => runAnalysis()}
            disabled={loading}
            style={{ background: "#6b7aff", border: "none", color: "#fff",
              padding: "8px 20px", borderRadius: 7, fontSize: 13, fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {loading ? "…" : "Analyze"}
          </button>
          {ticker && (
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#33334d" }}>
              ${ticker}
            </span>
          )}
          {analysis && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {watchMsg && (
                <span style={{ fontFamily: "monospace", fontSize: 11,
                  color: watchMsg.includes("Added") ? "#22c55e" : "#f97316" }}>
                  {watchMsg}
                </span>
              )}
              <button
                onClick={() => runAnalysis(ticker, true)}
                disabled={loading}
                title="Re-fetch live data and re-run AI analysis (bypasses 24h cache)"
                style={{ background: "transparent",
                  border: "1px solid #2a2a3e", color: "#6666aa",
                  padding: "5px 12px", borderRadius: 6, fontSize: 11,
                  fontFamily: "monospace", cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1 }}>
                ↺ Refresh
              </button>
              <button
                onClick={handleWatchToggle}
                disabled={watched}
                style={{ background: watched ? "#22c55e22" : "transparent",
                  border: `1px solid ${watched ? "#22c55e44" : "#2a2a3e"}`,
                  color: watched ? "#22c55e" : "#6666aa",
                  padding: "5px 14px", borderRadius: 6, fontSize: 11,
                  fontFamily: "monospace", cursor: watched ? "default" : "pointer" }}>
                {watched ? "✓ Watchlist" : "+ Watchlist"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem",
        maxWidth: 1200, margin: "0 auto" }}>

        {/* Error */}
        {error && (
          <div style={{ background: "#2e1015", border: "1px solid #5a2020",
            padding: "0.75rem 1.25rem", fontSize: 13, color: "#f08080",
            fontFamily: "monospace", borderRadius: 8 }}>
            ⚠ {error}
          </div>
        )}

        {/* Watchlist SQL setup banner */}
        {showWatchlistSQL && (
          <div style={{ background: "#0f0f1e", border: "1px solid #3a3a6e",
            borderRadius: 10, padding: "1rem 1.2rem", position: "relative" }}>
            <button onClick={() => setShowWatchlistSQL(false)}
              style={{ position: "absolute", top: 10, right: 12, background: "none",
                border: "none", color: "#6666aa", fontSize: 16, cursor: "pointer" }}>✕</button>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
              letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
              Watchlist Setup Required
            </div>
            <p style={{ fontSize: 12, color: "#8888b0", margin: "0 0 10px", fontFamily: "monospace" }}>
              Run this SQL once in your{" "}
              <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
                style={{ color: "#6b7aff" }}>Supabase dashboard</a>
              {" "}→ SQL Editor:
            </p>
            <pre style={{
              background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: 6,
              padding: "10px 14px", fontSize: 11, color: "#c0c0d8", fontFamily: "monospace",
              overflowX: "auto", margin: 0,
              userSelect: "all",
            }}>{`create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  ticker text not null,
  company_name text,
  notes text,
  added_at timestamptz default now(),
  unique(user_id, ticker)
);
alter table watchlist enable row level security;
create policy "Users manage own watchlist" on watchlist
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`}</pre>
            <p style={{ fontSize: 11, color: "#44445a", margin: "8px 0 0", fontFamily: "monospace" }}>
              Click inside the code above to select all, copy, paste into Supabase SQL Editor, and run.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 14, padding: "4rem", minHeight: 300 }}>
            <div style={{ width: 30, height: 30, border: "2px solid #6b7aff",
              borderTopColor: "transparent", borderRadius: "50%",
              animation: "spin 0.8s linear infinite" }}/>
            <p style={{ fontFamily: "monospace", fontSize: 13, color: "#6b7aff" }}>{loadStep}</p>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d" }}>
              This takes 20–40 s — reading complete SEC filings
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !analysis && !error && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 10, minHeight: 300, color: "#2a2a40" }}>
            <svg width="44" height="44" fill="none" viewBox="0 0 24 24" stroke="#2a2a40" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p style={{ fontFamily: "monospace", fontSize: 13, color: "#33334d" }}>Enter a ticker above and press Analyze</p>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#22223a" }}>
              Reads complete 10-K, 10-Qs, 8-Ks + XBRL multi-year data
            </p>
          </div>
        )}

        {/* ── Analysis ── */}
        {analysis && !loading && (() => {
          const ss = analysis.sub_scores || {} as SubScores;
          return (
            <>
              {/* LLM error banner — shown when AI analysis failed but metrics still loaded */}
              {analysis.llm_error && (
                <div style={{ background: "#1a1200", border: "1px solid #5a4000",
                  padding: "0.75rem 1.25rem", borderRadius: 8, display: "flex",
                  alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
                  <div>
                    <p style={{ fontFamily: "monospace", fontSize: 12, color: "#f0c040",
                      margin: "0 0 4px", fontWeight: "bold" }}>
                      AI analysis failed — financial data loaded, scores unavailable
                    </p>
                    <p style={{ fontFamily: "monospace", fontSize: 11, color: "#997700", margin: 0 }}>
                      {analysis.llm_error.toLowerCase().includes("rate") || analysis.llm_error.toLowerCase().includes("429")
                        ? "Groq API rate limit hit. Wait 1–2 minutes then click Analyze again."
                        : analysis.llm_error.slice(0, 200)}
                    </p>
                  </div>
                  <button onClick={() => runAnalysis(ticker)}
                    style={{ marginLeft: "auto", flexShrink: 0, background: "#5a4000",
                      border: "1px solid #8a6000", color: "#f0c040",
                      padding: "5px 14px", borderRadius: 6, fontSize: 11,
                      fontFamily: "monospace", cursor: "pointer" }}>
                    Retry
                  </button>
                </div>
              )}

              {/* Row 1: gauge + overview */}
              <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: "1.2rem" }}>
                <Card title="Investment Rating">
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <ScoreGauge score={score}/>
                    <VerdictBadge verdict={analysis.rating_verdict} confidence={analysis.confidence}/>
                  </div>
                </Card>
                <Card title={`${analysis.company_name || ticker} · Overview`}>
                  <p style={{ fontSize: 14, lineHeight: 1.8, color: "#c0c0d8", marginBottom: 12 }}>
                    {analysis.summary}
                  </p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#8888b0", fontStyle: "italic" }}>
                    {analysis.outlook}
                  </p>
                </Card>
              </div>

              {/* Investment thesis block */}
              {analysis.investment_thesis && (
                <div style={{
                  background: "#0a0f1a",
                  border: "1px solid #1e3a5f",
                  borderLeft: "4px solid #6b7aff",
                  borderRadius: 10,
                  padding: "1rem 1.4rem",
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
                    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                    Investment Thesis
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.85, color: "#d0d8ff", fontStyle: "italic" }}>
                    {analysis.investment_thesis}
                  </p>
                </div>
              )}

              {/* Valuation card */}
              {analysis.market_data && analysis.valuation && (
                <ValuationCard market={analysis.market_data} valuation={analysis.valuation}/>
              )}

              {/* Row 2: sub-scores */}
              <Card title="Score Breakdown">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2.5rem" }}>
                  <SubBar label="Revenue Growth"   score={ss.revenue_growth  ?? 0} max={20}/>
                  <SubBar label="Profitability"    score={ss.profitability   ?? 0} max={20}/>
                  <SubBar label="Balance Sheet"    score={ss.balance_sheet   ?? 0} max={20}/>
                  <SubBar label="Earnings Quality" score={ss.earnings_quality ?? 0} max={15}/>
                  <SubBar label="Outlook"          score={ss.outlook         ?? 0} max={15}/>
                  <SubBar label="Risk Profile"     score={ss.risk_profile    ?? 0} max={10}/>
                </div>
              </Card>

              {/* Row 3: revenue chart + key metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "1.2rem" }}>
                <Card title={`Revenue (bars) & Net Income (dots) · ${rev[0]?.year ?? ""}–${rev[rev.length-1]?.year ?? ""}`}>
                  <RevenueChart rev={rev} income={inc}/>
                </Card>
                <Card title="Key Metrics · Verified from SEC XBRL" accent="#22c55e">
                  <dl style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Object.entries(analysis.verified_metrics || {}).map(([label, val]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <dt style={{ fontSize: 11, color: "#6666aa", fontFamily: "monospace" }}>{label}</dt>
                        <dd style={{ fontSize: 12, color: "#c0c0d8", fontFamily: "monospace", margin: 0 }}>{val}</dd>
                      </div>
                    ))}
                    {!Object.keys(analysis.verified_metrics || {}).length && (
                      <p style={{ fontSize: 12, color: "#44445a", fontFamily: "monospace" }}>
                        No XBRL metrics available for this company.
                      </p>
                    )}
                  </dl>
                </Card>
              </div>

              {/* Row 3b: Margin Trends */}
              {(analysis.financial_data?.revenue?.length ?? 0) >= 2 && (
                <Card title="Margin Trends · Gross / Operating / Net Margin">
                  <MarginsChart data={analysis.financial_data}/>
                </Card>
              )}

              {/* Row 4: Risk Signals */}
              {analysis.risk_signals && (
                <RiskSignals data={analysis.risk_signals}/>
              )}

              {/* Row 5: Management Tone */}
              {analysis.management_tone && (
                <ManagementTone data={analysis.management_tone}/>
              )}

              {/* Row 6: justification */}
              <Card title="In-Depth Analysis">
                {analysis.trend_summary && (
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: "#6b7aff",
                    background: "#0a0a1f", padding: "8px 14px", borderRadius: 6,
                    borderLeft: "3px solid #6b7aff44", marginBottom: 18, lineHeight: 1.65 }}>
                    {analysis.trend_summary}
                  </div>
                )}
                <AnalysisReport text={analysis.justification}/>
              </Card>

              {/* Row 5: positives / risks / red flags */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.2rem" }}>
                <Card title="Positives" accent="#22c55e">
                  <BulletList items={analysis.positives} color="#22c55e" icon="✓"/>
                </Card>
                <Card title="Risks" accent="#f97316">
                  <BulletList items={analysis.risks} color="#f97316" icon="⚠"/>
                </Card>
                <Card title="Red Flags" accent="#ef4444">
                  <BulletList items={analysis.red_flags} color="#ef4444" icon="⛔"/>
                </Card>
              </div>

              {/* Insider Activity */}
              <InsiderActivity
                data={insiders}
                loading={insidersLoading}
                ticker={ticker}
              />

              {/* Chat */}
              <Card title="Ask a Question About This Company">
                {messages.length > 0 && (
                  <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12,
                    display: "flex", flexDirection: "column", gap: 10 }}>
                    {messages.map((m, i) => (
                      <div key={i} style={{
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        background: m.role === "user" ? "#1e1e40" : "#14142a",
                        border: `1px solid ${m.role === "user" ? "#3a3a60" : "#1e1e2e"}`,
                        borderRadius: 10, padding: "0.65rem 1rem",
                        fontSize: 13, lineHeight: 1.65, color: "#c0c0d8", whiteSpace: "pre-wrap" }}>
                        {m.text}
                      </div>
                    ))}
                    {askLoading && (
                      <div style={{ alignSelf: "flex-start", background: "#14142a",
                        border: "1px solid #1e1e2e", borderRadius: 10, padding: "0.65rem 1rem",
                        fontSize: 13, color: "#6b7aff", fontFamily: "monospace" }}>thinking…</div>
                    )}
                    <div ref={chatEnd}/>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !askLoading && sendQuestion()}
                    placeholder={`Ask about ${ticker || "the company"}…`}
                    disabled={askLoading}
                    style={{ flex: 1, minWidth: 0, background: "#13131f", border: "1px solid #2a2a3e",
                      color: "#e8e8f0", padding: "9px 12px", borderRadius: 8,
                      fontSize: 14, outline: "none", fontFamily: "Georgia, serif" }}/>
                  <button
                    onClick={sendQuestion}
                    disabled={askLoading || !question.trim()}
                    style={{ flexShrink: 0, background: "#6b7aff", border: "none", color: "#fff",
                      padding: "9px 20px", borderRadius: 8, fontSize: 14,
                      cursor: askLoading || !question.trim() ? "not-allowed" : "pointer",
                      opacity: askLoading || !question.trim() ? 0.5 : 1 }}>
                    Ask
                  </button>
                </div>
              </Card>

              {/* Filings analyzed — clickable cards */}
              {analysis.filings_analyzed?.length > 0 && (
                <Card title="Filings Analyzed · Click Any Filing for a Deep-Dive Summary">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {analysis.filings_analyzed.map((f, i) => {
                      const params = new URLSearchParams({
                        ticker,
                        url: f.document_url,
                        form: f.form_type,
                        company: analysis.company_name || ticker,
                      });
                      const formColor: Record<string, string> = {
                        "10-K": "#6b7aff", "10-K/A": "#6b7aff",
                        "10-Q": "#22c55e", "10-Q/A": "#22c55e",
                        "8-K":  "#eab308", "8-K/A":  "#eab308",
                        "DEF 14A": "#a78bfa", "DEFA14A": "#a78bfa",
                        "SC 13D": "#f97316", "SC 13G": "#f97316",
                        "SC 13D/A": "#f97316", "SC 13G/A": "#f97316",
                        "S-1": "#ec4899", "S-3": "#ec4899", "424B3": "#ec4899",
                        "NT 10-K": "#ef4444", "NT 10-Q": "#ef4444",
                      };
                      const color = formColor[f.form_type] || "#6666aa";
                      return (
                        <a
                          key={i}
                          href={`/filing?${params.toString()}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "flex", flexDirection: "column", gap: 3,
                            background: color + "11",
                            border: `1px solid ${color}33`,
                            borderRadius: 8, padding: "7px 13px",
                            textDecoration: "none", cursor: "pointer",
                            transition: "border-color 0.15s",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = color + "88")}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = color + "33")}
                        >
                          <span style={{ fontFamily: "monospace", fontSize: 12,
                            fontWeight: "bold", color }}>{f.form_type}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 10,
                            color: "#44445a" }}>{f.filed_date}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 9,
                            color: color + "99" }}>View analysis →</span>
                        </a>
                      );
                    })}
                  </div>
                </Card>
              )}
            </>
          );
        })()}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
