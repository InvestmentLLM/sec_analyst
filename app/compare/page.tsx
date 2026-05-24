"use client";
import { useState, useRef, useEffect } from "react";
import { authHeader } from "../../lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type SubScores = { revenue_growth: number; profitability: number; balance_sheet: number; earnings_quality: number; outlook: number; risk_profile: number };
type CompData = {
  company_name: string; rating_score: number; rating_verdict: string; confidence: string;
  sub_scores: SubScores; summary: string; positives: string[]; risks: string[]; red_flags: string[];
  verified_metrics: Record<string, string>;
};
type Msg = { role: "user" | "assistant"; text: string };

const VERDICT_COLORS: Record<string, string> = {
  "Strong Buy": "#22c55e", "Buy": "#84cc16", "Hold": "#eab308", "Sell": "#f97316", "Strong Sell": "#ef4444",
};

/* Metric rows: label, key in verified_metrics, whether higher = better */
const METRIC_ROWS: { label: string; key: string; higherBetter: boolean; section?: string }[] = [
  /* Growth */
  { label: "Latest Revenue",      key: "Latest Revenue",      higherBetter: true,  section: "Growth" },
  { label: "Revenue Growth YoY",  key: "Revenue Growth YoY",  higherBetter: true },
  { label: "Revenue CAGR (3yr)",  key: "Revenue CAGR (3yr)",  higherBetter: true },
  { label: "EPS (Diluted)",       key: "EPS (Diluted)",        higherBetter: true },
  { label: "EPS Growth YoY",      key: "EPS Growth YoY",      higherBetter: true },
  /* Profitability */
  { label: "Gross Margin",        key: "Gross Margin",         higherBetter: true,  section: "Profitability" },
  { label: "Operating Margin",    key: "Operating Margin",     higherBetter: true },
  { label: "Net Margin",          key: "Net Margin",           higherBetter: true },
  { label: "EBITDA",              key: "EBITDA",               higherBetter: true },
  { label: "EBITDA Margin",       key: "EBITDA Margin",        higherBetter: true },
  { label: "EBITDAX",             key: "EBITDAX",              higherBetter: true },
  { label: "EBITDAX Margin",      key: "EBITDAX Margin",       higherBetter: true },
  /* Cash & Returns */
  { label: "Free Cash Flow",      key: "Free Cash Flow",       higherBetter: true,  section: "Cash & Returns" },
  { label: "FCF Margin",          key: "FCF Margin",           higherBetter: true },
  { label: "Return on Equity",    key: "Return on Equity",     higherBetter: true },
  { label: "Return on Assets",    key: "Return on Assets",     higherBetter: true },
  /* Balance Sheet */
  { label: "Debt / Equity",       key: "Debt / Equity",        higherBetter: false, section: "Balance Sheet" },
  { label: "Current Ratio",       key: "Current Ratio",        higherBetter: true },
  { label: "Interest Coverage",   key: "Interest Coverage",    higherBetter: true },
];

function parseForRank(str: string): number | null {
  if (!str || str === "N/A") return null;
  const s = str.replace(/[$,]/g, "");
  const mult = s.includes("T") ? 1e12 : s.includes("B") ? 1e9 : s.includes("M") ? 1e6 : 1;
  const n = parseFloat(s.replace(/[TBMx%+]/g, ""));
  return isNaN(n) ? null : n * mult;
}

function rankColor(rank: number, total: number, higherBetter: boolean): string {
  if (total <= 1) return "#c0c0d8";
  const best = higherBetter ? 1 : total;
  const worst = higherBetter ? total : 1;
  if (rank === best)  return "#22c55e";
  if (rank === worst) return "#ef4444";
  return "#eab308";
}

function scoreColor(s: number) {
  if (s >= 75) return "#22c55e";
  if (s >= 55) return "#84cc16";
  if (s >= 40) return "#eab308";
  if (s >= 25) return "#f97316";
  return "#ef4444";
}

function MiniGauge({ score }: { score: number }) {
  const r = 38, cx = 50, cy = 46;
  const angle = Math.PI * (1 - score / 100);
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);
  const c = scoreColor(score);
  const largeArc = score > 50 ? 1 : 0;
  return (
    <svg viewBox="0 0 100 62" width={100} height={62}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`}
        fill="none" stroke="#1e1e2e" strokeWidth={8} strokeLinecap="round"/>
      {score > 0 && (
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 0 ${nx.toFixed(1)} ${ny.toFixed(1)}`}
          fill="none" stroke={c} strokeWidth={8} strokeLinecap="round"/>
      )}
      <line x1={cx} y1={cy} x2={nx.toFixed(1)} y2={ny.toFixed(1)}
        stroke="#e8e8f0" strokeWidth={2} strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={3} fill="#e8e8f0"/>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={18} fontWeight="bold"
        fill={c} fontFamily="Georgia,serif">{score}</text>
    </svg>
  );
}

export default function ComparePage() {
  const [inputVal,      setInputVal]      = useState("");
  const [tickers,       setTickers]       = useState<string[]>([]);
  const [companies,     setCompanies]     = useState<Record<string, CompData>>({});
  const [loadingSet,    setLoadingSet]    = useState<Set<string>>(new Set());
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [question,      setQuestion]      = useState("");
  const [messages,      setMessages]      = useState<Msg[]>([]);
  const [chatLoading,   setChatLoading]   = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function addTicker() {
    const parts = inputVal.toUpperCase().split(/[\s,]+/).filter(Boolean);
    const next = [...new Set([...tickers, ...parts])].slice(0, 5);
    setTickers(next);
    setInputVal("");
    parts.forEach(t => { if (!companies[t] && !loadingSet.has(t)) fetchTicker(t); });
  }

  function removeTicker(t: string) {
    setTickers(prev => prev.filter(x => x !== t));
    setCompanies(prev => { const c = { ...prev }; delete c[t]; return c; });
    setErrors(prev => { const e = { ...prev }; delete e[t]; return e; });
  }

  async function fetchTicker(t: string) {
    setLoadingSet(prev => new Set([...prev, t]));
    setErrors(prev => { const e = { ...prev }; delete e[t]; return e; });
    try {
      const res = await fetch(`${API}/comprehensive/${t}`, { headers: await authHeader() });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      const data = await res.json();
      setCompanies(prev => ({ ...prev, [t]: data }));
    } catch (e: unknown) {
      setErrors(prev => ({ ...prev, [t]: e instanceof Error ? e.message : "Error" }));
    } finally {
      setLoadingSet(prev => { const s = new Set(prev); s.delete(t); return s; });
    }
  }

  async function sendQuestion() {
    if (!question.trim() || tickers.length === 0) return;
    const q = question.trim(); setQuestion("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setChatLoading(true);
    try {
      const loadedTickers = tickers.filter(t => companies[t]);
      const res = await fetch(`${API}/compare-ask`, {
        method: "POST",
        headers: { ...await authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: loadedTickers, question: q }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", text: data.answer || data.detail || "No answer" }]);
    } catch (e: unknown) {
      setMessages(m => [...m, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : "Unknown"}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function generateVerdict() {
    const q = "Rank these companies from best to worst investment opportunity. Give a clear winner with reasoning, and identify the biggest risk for each.";
    setMessages(m => [...m, { role: "user", text: "Generate AI investment verdict & ranking" }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/compare-ask`, {
        method: "POST",
        headers: { ...await authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: tickers.filter(t => companies[t]), question: q }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", text: data.answer || data.detail || "No answer" }]);
    } catch (e: unknown) {
      setMessages(m => [...m, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : "Unknown"}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  const loadedTickers = tickers.filter(t => companies[t]);

  /* Compute per-row rankings */
  function getRankings(key: string, higherBetter: boolean): Record<string, number> {
    const vals: { t: string; n: number }[] = [];
    loadedTickers.forEach(t => {
      const v = companies[t]?.verified_metrics?.[key];
      const n = v ? parseForRank(v) : null;
      if (n !== null) vals.push({ t, n });
    });
    if (vals.length <= 1) return {};
    vals.sort((a, b) => higherBetter ? b.n - a.n : a.n - b.n);
    const out: Record<string, number> = {};
    vals.forEach((x, i) => { out[x.t] = i + 1; });
    return out;
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0", paddingBottom: "4rem" }}>

      {/* Header */}
      <div style={{ padding: "1.2rem 1.5rem", borderBottom: "1px solid #1a1a2e", background: "#0a0a0f" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff", letterSpacing: 1.5,
            textTransform: "uppercase", marginBottom: 10 }}>
            Compare Companies · Side-by-Side SEC Analysis
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && addTicker()}
              placeholder="Add tickers: AAPL, MSFT, NVDA (up to 5)"
              style={{ width: 340, background: "#13131f", border: "1px solid #2a2a3e",
                color: "#e8e8f0", padding: "8px 14px", borderRadius: 7,
                fontSize: 13, fontFamily: "monospace", outline: "none" }}
            />
            <button onClick={addTicker}
              style={{ background: "#6b7aff", border: "none", color: "#fff",
                padding: "8px 18px", borderRadius: 7, fontSize: 13, fontWeight: "bold", cursor: "pointer" }}>
              Add
            </button>

            {/* Ticker chips */}
            {tickers.map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 6,
                background: companies[t] ? "#1a1a3a" : loadingSet.has(t) ? "#1a1a2e" : "#2e1015",
                border: `1px solid ${companies[t] ? "#3a3a6a" : loadingSet.has(t) ? "#2a2a3e" : "#5a2020"}`,
                borderRadius: 20, padding: "4px 10px 4px 12px" }}>
                <span style={{ fontFamily: "monospace", fontSize: 12,
                  color: companies[t] ? "#c0c0d8" : loadingSet.has(t) ? "#6666aa" : "#f08080" }}>
                  {loadingSet.has(t) ? `${t} …` : errors[t] ? `${t} ✗` : t}
                </span>
                <button onClick={() => removeTicker(t)}
                  style={{ background: "none", border: "none", color: "#44445a",
                    cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}

            {loadedTickers.length >= 2 && (
              <button onClick={generateVerdict} disabled={chatLoading}
                style={{ marginLeft: "auto", background: "#22c55e22", border: "1px solid #22c55e44",
                  color: "#22c55e", padding: "7px 16px", borderRadius: 7, fontSize: 12,
                  fontFamily: "monospace", cursor: chatLoading ? "not-allowed" : "pointer",
                  opacity: chatLoading ? 0.6 : 1 }}>
                ⚖ AI Verdict
              </button>
            )}
          </div>

          {/* Errors */}
          {Object.entries(errors).map(([t, err]) => (
            <p key={t} style={{ fontFamily: "monospace", fontSize: 11, color: "#f08080",
              marginTop: 8 }}>
              {t}: {err}
            </p>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "1.5rem" }}>

        {/* Empty state */}
        {tickers.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: 320, gap: 12, color: "#33334d" }}>
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#2a2a40" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            <p style={{ fontFamily: "monospace", fontSize: 13, color: "#33334d" }}>
              Add 2–5 tickers to compare them side by side
            </p>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#22223a" }}>
              e.g. AAPL, MSFT, GOOGL — or try energy names: XOM, CVX, RRC for EBITDAX
            </p>
          </div>
        )}

        {loadedTickers.length >= 1 && (
          <>
            {/* ── Rating overview cards ── */}
            <div style={{ display: "grid", gap: "1rem",
              gridTemplateColumns: `repeat(${loadedTickers.length}, minmax(0, 1fr))`,
              marginBottom: "1.5rem" }}>
              {loadedTickers.map(t => {
                const c = companies[t];
                const vcolor = VERDICT_COLORS[c.rating_verdict] || "#6b7aff";
                return (
                  <div key={t} style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
                    borderRadius: 10, padding: "1rem", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7aff",
                      letterSpacing: 1, marginBottom: 4 }}>{t}</div>
                    <div style={{ fontSize: 12, color: "#8888b0", marginBottom: 8, minHeight: 32 }}>
                      {c.company_name}
                    </div>
                    <MiniGauge score={c.rating_score}/>
                    <div style={{ marginTop: 6, display: "inline-block",
                      background: vcolor + "22", border: `1px solid ${vcolor}44`,
                      color: vcolor, fontFamily: "monospace", fontSize: 11,
                      padding: "3px 12px", borderRadius: 12 }}>
                      {c.rating_verdict}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
                      marginTop: 4 }}>{c.confidence} confidence</div>
                  </div>
                );
              })}
            </div>

            {/* ── Metrics comparison table ── */}
            <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
              borderRadius: 10, overflow: "hidden", marginBottom: "1.5rem" }}>

              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: `220px repeat(${loadedTickers.length}, 1fr)`,
                background: "#13131f", borderBottom: "1px solid #1e1e2e", padding: "10px 16px" }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
                  letterSpacing: 1, textTransform: "uppercase" }}>Metric</div>
                {loadedTickers.map(t => (
                  <div key={t} style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7aff",
                    textAlign: "center", letterSpacing: 0.5 }}>{t}</div>
                ))}
              </div>

              {/* Table rows */}
              {METRIC_ROWS.map((row, ri) => {
                const ranks = getRankings(row.key, row.higherBetter);
                const total = Object.keys(ranks).length;
                const hasAny = loadedTickers.some(t => companies[t]?.verified_metrics?.[row.key]);
                if (!hasAny) return null;
                return (
                  <div key={row.key}>
                    {row.section && (
                      <div style={{ padding: "6px 16px 2px", fontFamily: "monospace",
                        fontSize: 9, color: "#33334d", letterSpacing: 1.5,
                        textTransform: "uppercase", background: "#0a0a0f",
                        borderTop: ri > 0 ? "1px solid #13131f" : "none" }}>
                        {row.section}
                      </div>
                    )}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: `220px repeat(${loadedTickers.length}, 1fr)`,
                      padding: "8px 16px",
                      background: ri % 2 === 0 ? "#0d0d17" : "#0b0b15",
                      borderBottom: "1px solid #13131f",
                      alignItems: "center",
                    }}>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#6666aa" }}>
                        {row.label}
                      </div>
                      {loadedTickers.map(t => {
                        const val = companies[t]?.verified_metrics?.[row.key];
                        const rank = ranks[t];
                        const color = rank ? rankColor(rank, total, row.higherBetter) : "#c0c0d8";
                        return (
                          <div key={t} style={{ textAlign: "center" }}>
                            {val ? (
                              <span style={{ fontFamily: "monospace", fontSize: 12,
                                color, fontWeight: rank === 1 ? "bold" : "normal" }}>
                                {val}
                                {rank === 1 && total > 1 && (
                                  <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>▲</span>
                                )}
                              </span>
                            ) : (
                              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#2a2a3e" }}>—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Positives / Risks grid ── */}
            {loadedTickers.length >= 2 && (
              <div style={{ display: "grid", gap: "1rem",
                gridTemplateColumns: `repeat(${Math.min(loadedTickers.length, 3)}, minmax(0, 1fr))`,
                marginBottom: "1.5rem" }}>
                {loadedTickers.map(t => {
                  const c = companies[t];
                  return (
                    <div key={t} style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
                      borderRadius: 10, padding: "1rem" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
                        letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
                        {t} · {c.company_name}
                      </div>
                      {c.positives?.slice(0, 3).map((p, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#22c55e", marginBottom: 5,
                          display: "flex", gap: 6 }}>
                          <span>+</span><span style={{ color: "#c0c0d8" }}>{p}</span>
                        </div>
                      ))}
                      {c.red_flags?.slice(0, 2).map((r, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#ef4444", marginBottom: 5,
                          marginTop: i === 0 ? 8 : 0, display: "flex", gap: 6 }}>
                          <span>!</span><span style={{ color: "#f08080" }}>{r}</span>
                        </div>
                      ))}
                      {!c.red_flags?.length && (
                        <div style={{ fontSize: 11, color: "#33334d", fontFamily: "monospace",
                          marginTop: 8, fontStyle: "italic" }}>No red flags identified</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Multi-company AI Chat ── */}
            <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
              borderRadius: 10, padding: "1.2rem" }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
                letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>
                Ask AI About All Companies
              </div>

              {/* Suggested questions */}
              {messages.length === 0 && loadedTickers.length >= 2 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {[
                    "Which has the strongest balance sheet?",
                    "Compare revenue growth trends",
                    "Which is most exposed to recession risk?",
                    "Which has the best capital allocation?",
                  ].map(q => (
                    <button key={q} onClick={() => { setQuestion(q); }}
                      style={{ background: "#13131f", border: "1px solid #2a2a3e",
                        color: "#6666aa", padding: "5px 12px", borderRadius: 20,
                        fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {messages.length > 0 && (
                <div style={{ maxHeight: 380, overflowY: "auto", marginBottom: 12,
                  display: "flex", flexDirection: "column", gap: 10 }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "88%",
                      background: m.role === "user" ? "#1e1e40" : "#14142a",
                      border: `1px solid ${m.role === "user" ? "#3a3a60" : "#1e1e2e"}`,
                      borderRadius: 10, padding: "0.7rem 1rem",
                      fontSize: 13, lineHeight: 1.7, color: "#c0c0d8", whiteSpace: "pre-wrap" }}>
                      {m.text}
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ alignSelf: "flex-start", background: "#14142a",
                      border: "1px solid #1e1e2e", borderRadius: 10,
                      padding: "0.7rem 1rem", fontSize: 13, color: "#6b7aff",
                      fontFamily: "monospace" }}>thinking…</div>
                  )}
                  <div ref={chatEnd}/>
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !chatLoading && sendQuestion()}
                  placeholder={loadedTickers.length >= 2
                    ? `Ask about ${loadedTickers.join(", ")}…`
                    : "Load at least 2 companies to compare…"}
                  disabled={chatLoading || loadedTickers.length < 1}
                  style={{ flex: 1, background: "#13131f", border: "1px solid #2a2a3e",
                    color: "#e8e8f0", padding: "9px 14px", borderRadius: 8,
                    fontSize: 14, outline: "none", fontFamily: "Georgia, serif",
                    opacity: loadedTickers.length < 1 ? 0.5 : 1 }}
                />
                <button onClick={sendQuestion}
                  disabled={chatLoading || !question.trim() || loadedTickers.length < 1}
                  style={{ background: "#6b7aff", border: "none", color: "#fff",
                    padding: "9px 20px", borderRadius: 8, fontSize: 14,
                    cursor: chatLoading || !question.trim() ? "not-allowed" : "pointer",
                    opacity: chatLoading || !question.trim() ? 0.5 : 1 }}>
                  Ask
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
