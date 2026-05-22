"use client";
import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";

type Filing = { form_type: string; filed_date: string; accession_number: string; document_url: string };
type Analysis = { summary?: string; trend_summary?: string; key_metrics?: Record<string, string>; risks?: string[]; outlook?: string; red_flags?: string[]; verified_metrics?: Record<string, string>; rating_score?: number; rating_verdict?: string; positives?: string[]; justification?: string; error?: string };
type Msg = { role: "user" | "assistant"; text: string };

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [ticker, setTicker] = useState("");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [selected, setSelected] = useState<Filing | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [loadingFilings, setLoadingFilings] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [error, setError] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchFilings() {
    const t = inputVal.trim().toUpperCase();
    if (!t) return;
    setError("");
    setLoadingFilings(true);
    setFilings([]);
    setSelected(null);
    setAnalysis(null);
    setMessages([]);
    try {
      const res = await fetch(`${API}/filings/${t}`);
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      const data = await res.json();
      setTicker(t);
      setFilings(data.filings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingFilings(false);
    }
  }

  async function selectFiling(f: Filing) {
    setSelected(f);
    setAnalysis(null);
    setMessages([]);
    setLoadingAnalysis(true);
    setError("");
    try {
      const res = await fetch(`${API}/comprehensive/${ticker}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed");
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingAnalysis(false);
    }
  }

  async function sendQuestion() {
    if (!question.trim() || !selected) return;
    const q = question.trim();
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoadingQuery(true);
    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, question: q }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      setMessages((m) => [...m, { role: "assistant", text: (await res.json()).answer }]);
    } catch (e: unknown) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : "Unknown"}` }]);
    } finally {
      setLoadingQuery(false);
    }
  }


  const formColors: Record<string, string> = {
    "10-K": "#1a472a",
    "10-Q": "#1e3a5f",
    "8-K": "#4a1942",
    "DEF 14A": "#5c3d11",
    "S-1": "#3b1f0e",
    "13F-HR": "#0e3d3d",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0", fontFamily: "Georgia,serif" }}>
      <header style={{ borderBottom: "1px solid #1e1e2e", padding: "1rem 2rem", display: "flex", alignItems: "center", background: "#0d0d17" }}>
        <span style={{ fontSize: 22, color: "#e8e8f0" }}>SEC</span>
        <span style={{ fontSize: 22, fontStyle: "italic", color: "#6b7aff", marginLeft: 6 }}>Lens</span>
        <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 12, color: "#555570" }}>
          SEC Analyzer
        </span>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "calc(100vh - 57px)" }}>
        <aside style={{ borderRight: "1px solid #1e1e2e", background: "#0d0d17", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "1.25rem 1rem", borderBottom: "1px solid #1e1e2e" }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555570", marginBottom: 8 }}>TICKER</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && fetchFilings()}
                placeholder="AAPL"
                style={{
                  flex: 1,
                  background: "#13131f",
                  border: "1px solid #2a2a3e",
                  color: "#e8e8f0",
                  padding: "7px 10px",
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button
                onClick={fetchFilings}
                disabled={loadingFilings}
                style={{
                  background: "#6b7aff",
                  border: "none",
                  color: "#fff",
                  padding: "7px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                  opacity: loadingFilings ? 0.6 : 1,
                }}
              >
                {loadingFilings ? "…" : "Go"}
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
            {filings.length === 0 && !loadingFilings && (
              <p style={{ padding: "1.5rem 1rem", color: "#44445a", fontSize: 13, fontFamily: "monospace" }}>Enter a ticker above.</p>
            )}
            {filings.map((f, i) => {
              const active = selected?.accession_number === f.accession_number;
              return (
                <button
                  key={i}
                  onClick={() => selectFiling(f)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: active ? "#1a1a2e" : "transparent",
                    border: "none",
                    borderLeft: active ? "2px solid #6b7aff" : "2px solid transparent",
                    padding: "0.75rem 1rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      background: formColors[f.form_type] || "#1e1e2e",
                      color: "#e8e8f0",
                      fontFamily: "monospace",
                      fontSize: 10,
                      padding: "2px 7px",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.form_type}
                  </span>
                  <span style={{ fontSize: 12, color: active ? "#a0a8ff" : "#6666aa", fontFamily: "monospace" }}>
                    {f.filed_date}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {error && (
            <div style={{ background: "#2e1015", borderBottom: "1px solid #5a2020", padding: "0.75rem 1.5rem", fontSize: 13, color: "#f08080", fontFamily: "monospace" }}>
              ⚠ {error}
            </div>
          )}

          {!selected && !loadingAnalysis && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#33334d", flexDirection: "column", gap: 12 }}>
              <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#33334d" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p style={{ fontFamily: "monospace", fontSize: 13 }}>Select a filing to analyze</p>
            </div>
          )}

          {loadingAnalysis && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 24, height: 24, border: "2px solid #6b7aff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <p style={{ fontFamily: "monospace", fontSize: 13, color: "#6b7aff" }}>Analyzing…</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {analysis && !loadingAnalysis && (
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555570" }}>
                  {ticker} · {selected?.form_type} · {selected?.filed_date}
                </div>
                {analysis.error ? (
                  <Card title="Error" accent="#e05050">
                    <p style={{ color: "#f08080", fontSize: 14, margin: 0 }}>{analysis.error}</p>
                  </Card>
                ) : (
                  <>
                    {/* Rating banner */}
                    {analysis.rating_verdict && (
                      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#0d0d17", border: "1px solid #1e1e2e", borderRadius: 10, padding: "1rem 1.25rem" }}>
                        <span style={{ fontSize: 32, fontWeight: "bold", color: analysis.rating_score! >= 70 ? "#4ade80" : analysis.rating_score! >= 50 ? "#facc15" : "#f87171" }}>
                          {analysis.rating_score}
                        </span>
                        <div>
                          <div style={{ fontSize: 16, color: "#e8e8f0", fontWeight: "bold" }}>{analysis.rating_verdict}</div>
                          <div style={{ fontSize: 12, color: "#6666aa", fontFamily: "monospace" }}>out of 100</div>
                        </div>
                      </div>
                    )}

                    {analysis.summary && (
                      <Card title="Summary">
                        <p style={{ fontSize: 15, lineHeight: 1.7, color: "#c0c0d8", margin: 0 }}>{analysis.summary}</p>
                      </Card>
                    )}

                    {analysis.trend_summary && (
                      <Card title="Year-by-Year Trend" accent="#6b7aff">
                        <p style={{ fontSize: 13, lineHeight: 1.8, color: "#c0c0d8", margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{analysis.trend_summary}</p>
                      </Card>
                    )}

                    {analysis.verified_metrics && (
                      <Card title="Verified Metrics">
                        <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                          {Object.entries(analysis.verified_metrics).map(([k, v]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <dt style={{ fontSize: 13, color: "#6666aa", fontFamily: "monospace" }}>{k}</dt>
                              <dd style={{ fontSize: 13, color: "#c0c0d8", margin: 0 }}>{v as string}</dd>
                            </div>
                          ))}
                        </dl>
                      </Card>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      {analysis.positives && analysis.positives.length > 0 && (
                        <Card title="Strengths" accent="#4ade80">
                          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: 6 }}>
                            {analysis.positives.map((p, i) => <li key={i} style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.5 }}>{p}</li>)}
                          </ul>
                        </Card>
                      )}
                      {analysis.risks && analysis.risks.length > 0 && (
                        <Card title="Risks" accent="#f87171">
                          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: 6 }}>
                            {analysis.risks.map((r, i) => <li key={i} style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.5 }}>{r}</li>)}
                          </ul>
                        </Card>
                      )}
                    </div>

                    {analysis.red_flags && analysis.red_flags.length > 0 && (
                      <Card title="Red Flags" accent="#ef4444">
                        <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: 6 }}>
                          {analysis.red_flags.map((r, i) => <li key={i} style={{ fontSize: 13, color: "#fca5a5", lineHeight: 1.5 }}>{r}</li>)}
                        </ul>
                      </Card>
                    )}

                    {analysis.justification && (
                      <Card title="Full Analysis">
                        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#c0c0d8", margin: 0, whiteSpace: "pre-wrap" }}>{analysis.justification}</p>
                      </Card>
                    )}
                  </>
                )}
              </div>

              <div style={{ borderTop: "1px solid #1e1e2e", background: "#0d0d17" }}>
                <div style={{ padding: "0.6rem 1.5rem", fontFamily: "monospace", fontSize: 10, color: "#555570", letterSpacing: 1 }}>ASK A QUESTION ABOUT THIS FILING</div>
                {messages.length > 0 && (
                  <div style={{ maxHeight: 260, overflowY: "auto", padding: "0 1.5rem 1rem", display: "flex", flexDirection: "column", gap: 12 }}>
                    {messages.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                          maxWidth: "80%",
                          background: m.role === "user" ? "#1e1e40" : "#14142a",
                          border: `1px solid ${m.role === "user" ? "#3a3a60" : "#1e1e2e"}`,
                          borderRadius: 10,
                          padding: "0.6rem 1rem",
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: "#c0c0d8",
                        }}
                      >
                        {m.text}
                      </div>
                    ))}
                    {loadingQuery && <div style={{ alignSelf: "flex-start", background: "#14142a", border: "1px solid #1e1e2e", borderRadius: 10, padding: "0.6rem 1rem", fontSize: 13, color: "#6b7aff", fontFamily: "monospace" }}>thinking…</div>}
                    <div ref={chatEnd} />
                  </div>
                )}
                <div style={{ padding: "0.75rem 1.5rem 1.25rem", display: "flex", gap: 10 }}>
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !loadingQuery && sendQuestion()}
                    placeholder="What were the main revenue drivers?"
                    disabled={loadingQuery}
                    style={{
                      flex: 1,
                      background: "#13131f",
                      border: "1px solid #2a2a3e",
                      color: "#e8e8f0",
                      padding: "9px 12px",
                      borderRadius: 8,
                      fontSize: 14,
                      outline: "none",
                      fontFamily: "Georgia,serif",
                    }}
                  />
                  <button
                    onClick={sendQuestion}
                    disabled={loadingQuery || !question.trim()}
                    style={{
                      background: "#6b7aff",
                      border: "none",
                      color: "#fff",
                      padding: "9px 18px",
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: "pointer",
                      opacity: loadingQuery || !question.trim() ? 0.5 : 1,
                    }}
                  >
                    Ask
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: "#0d0d17",
        border: "1px solid #1e1e2e",
        borderRadius: 10,
        padding: "1rem 1.25rem",
        borderLeft: accent ? `3px solid ${accent}` : "1px solid #1e1e2e",
      }}
    >
      <div style={{ fontFamily: "monospace", fontSize: 11, color: accent || "#6b7aff", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}
