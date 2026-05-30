"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authHeader } from "../../lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FORM_DESCRIPTIONS: Record<string, string> = {
  "10-K":    "Annual Report — full-year business, financial statements, risk factors",
  "10-K/A":  "Amended Annual Report — restated or corrected 10-K",
  "10-Q":    "Quarterly Report — three-month financials and MD&A update",
  "10-Q/A":  "Amended Quarterly Report — restated or corrected 10-Q",
  "8-K":     "Current Report — material event (earnings, M&A, leadership change, guidance)",
  "8-K/A":   "Amended Current Report",
  "DEF 14A": "Proxy Statement — shareholder vote, executive compensation, governance",
  "DEFA14A": "Additional Proxy Materials",
  "SC 13D":  "Schedule 13D — activist or strategic investor holds >5% of shares",
  "SC 13G":  "Schedule 13G — passive investor holds >5% of shares",
  "SC 13D/A":"Amended Schedule 13D",
  "SC 13G/A":"Amended Schedule 13G",
  "S-1":     "IPO Registration — new share issuance, potential dilution",
  "S-3":     "Shelf Registration — secondary offering of existing shares",
  "424B3":   "Prospectus Supplement — final terms of a public offering",
  "424B2":   "Prospectus Supplement — preliminary offering terms",
  "424B4":   "Prospectus Supplement — final IPO prospectus",
  "NT 10-K": "Late Filing Notice — annual report delayed ⚠ red flag",
  "NT 10-Q": "Late Filing Notice — quarterly report delayed ⚠ red flag",
  "13F-HR":  "Institutional Holdings — 13F quarterly position disclosure",
  "4":       "Form 4 — insider transaction (buy or sell)",
  "3":       "Form 3 — initial insider ownership report",
  "5":       "Form 5 — annual insider ownership changes",
};

const FORM_COLORS: Record<string, string> = {
  "10-K": "#6b7aff", "10-K/A": "#6b7aff",
  "10-Q": "#22c55e", "10-Q/A": "#22c55e",
  "8-K":  "#eab308", "8-K/A":  "#eab308",
  "DEF 14A": "#a78bfa", "DEFA14A": "#a78bfa",
  "SC 13D": "#f97316", "SC 13G": "#f97316",
  "SC 13D/A": "#f97316", "SC 13G/A": "#f97316",
  "S-1": "#ec4899", "S-3": "#ec4899",
  "424B2": "#ec4899", "424B3": "#ec4899", "424B4": "#ec4899",
  "NT 10-K": "#ef4444", "NT 10-Q": "#ef4444",
};

type FilingAnalysis = {
  filing_summary?: string;
  key_findings?: string[];
  key_metrics?: Record<string, string | number>;
  risks?: string[];
  outlook?: string;
  red_flags?: string[];
  investment_implication?: string;
  /* legacy keys — still accepted */
  summary?: string;
  error?: string;
};

function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#0d0d17", border: "1px solid #1e1e2e", borderRadius: 10,
      padding: "1rem 1.2rem",
      borderLeft: accent ? `3px solid ${accent}` : "1px solid #1e1e2e",
    }}>
      <div style={{ fontFamily: "monospace", fontSize: 10,
        color: accent || "#6b7aff", letterSpacing: 1.2,
        marginBottom: 10, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

function BulletList({ items, color, icon }: { items: string[]; color: string; icon: string }) {
  if (!items?.length) return (
    <p style={{ fontFamily: "monospace", fontSize: 12, color: "#33334d", fontStyle: "italic" }}>
      None identified
    </p>
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

function FilingInner() {
  const params     = useSearchParams();
  const ticker     = params.get("ticker")?.toUpperCase() ?? "";
  const url        = params.get("url") ?? "";
  const form       = params.get("form") ?? "";
  const company    = params.get("company") ?? ticker;

  const [analysis, setAnalysis] = useState<FilingAnalysis | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (ticker && url && form) runAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAnalysis() {
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { ...await authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, document_url: url, form_type: form }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAnalysis(data.analysis ?? data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const formColor  = FORM_COLORS[form] || "#6b7aff";
  const formDesc   = FORM_DESCRIPTIONS[form] || form;

  /* Normalise summary — prefer new key, fall back to old */
  const summaryText = analysis?.filing_summary || analysis?.summary || "";

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>

      {/* Header */}
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #1a1a2e",
        background: "#0a0a0f", display: "flex", alignItems: "center", gap: 14 }}>
        <Link href={`/?ticker=${ticker}`} style={{
          fontFamily: "monospace", fontSize: 11, color: "#44445a",
          textDecoration: "none", padding: "5px 10px",
          border: "1px solid #2a2a3e", borderRadius: 6,
        }}>← Back</Link>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: formColor + "22", border: `1px solid ${formColor}55`,
              color: formColor, fontFamily: "monospace", fontSize: 13,
              fontWeight: "bold", padding: "3px 12px", borderRadius: 8,
            }}>{form}</span>
            <span style={{ fontFamily: "monospace", fontSize: 13, color: "#e8e8f0" }}>
              {company} ({ticker})
            </span>
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
            margin: "4px 0 0", lineHeight: 1.4 }}>{formDesc}</p>
        </div>
        <a href={url} target="_blank" rel="noreferrer" style={{
          marginLeft: "auto", fontFamily: "monospace", fontSize: 10, color: "#44445a",
          textDecoration: "none", padding: "5px 10px",
          border: "1px solid #2a2a3e", borderRadius: 6,
        }}>
          Raw Filing ↗
        </a>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem",
        display: "flex", flexDirection: "column", gap: "1.2rem" }}>

        {/* Error */}
        {error && (
          <div style={{ background: "#2e1015", border: "1px solid #5a2020",
            padding: "0.75rem 1.25rem", borderRadius: 8,
            fontFamily: "monospace", fontSize: 13, color: "#f08080" }}>
            ⚠ {error}
            <button onClick={runAnalysis} style={{
              marginLeft: 14, background: "#5a2020", border: "1px solid #8a3030",
              color: "#f08080", padding: "3px 12px", borderRadius: 5,
              fontFamily: "monospace", fontSize: 11, cursor: "pointer",
            }}>Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 14, padding: "5rem 0" }}>
            <div style={{ width: 28, height: 28, border: `2px solid ${formColor}`,
              borderTopColor: "transparent", borderRadius: "50%",
              animation: "spin 0.8s linear infinite" }}/>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: formColor }}>
              Reading {form} filing and generating analysis…
            </p>
            <p style={{ fontFamily: "monospace", fontSize: 10, color: "#33334d" }}>
              This takes 15–30 seconds
            </p>
          </div>
        )}

        {/* Analysis */}
        {analysis && !loading && (
          <>
            {/* Investment implication banner */}
            {analysis.investment_implication && (
              <div style={{
                background: "#0a0f1a", border: "1px solid #1e3a5f",
                borderLeft: `4px solid ${formColor}`,
                borderRadius: 10, padding: "1rem 1.4rem",
              }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: formColor,
                  letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                  Investment Implication
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.85,
                  color: "#d0d8ff", fontStyle: "italic" }}>
                  {analysis.investment_implication}
                </p>
              </div>
            )}

            {/* Summary */}
            {summaryText && (
              <Card title={`${form} Summary · ${company}`} accent={formColor}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.85, color: "#c0c0d8" }}>
                  {summaryText}
                </p>
              </Card>
            )}

            {/* Key findings */}
            {(analysis.key_findings?.length ?? 0) > 0 && (
              <Card title="Key Findings">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {analysis.key_findings!.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ color: "#6b7aff", fontFamily: "monospace", fontSize: 12,
                        flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                      <span style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.6 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Key metrics */}
            {analysis.key_metrics && Object.keys(analysis.key_metrics).length > 0 && (
              <Card title="Key Metrics · From SEC XBRL Data" accent="#22c55e">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                  {Object.entries(analysis.key_metrics)
                    .filter(([, v]) => v && v !== "N/A")
                    .map(([k, v]) => (
                      <div key={k} style={{ background: "#13131f", border: "1px solid #1e1e2e",
                        borderRadius: 7, padding: "8px 12px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10,
                          color: "#6666aa", marginBottom: 3 }}>{k}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 13,
                          color: "#22c55e", fontWeight: "bold" }}>{String(v)}</div>
                      </div>
                    ))}
                </div>
              </Card>
            )}

            {/* Outlook */}
            {analysis.outlook && (
              <Card title="Outlook">
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: "#b0b0cc",
                  fontStyle: "italic" }}>
                  {analysis.outlook}
                </p>
              </Card>
            )}

            {/* Risks + Red Flags */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2rem" }}>
              <Card title="Risks Disclosed" accent="#f97316">
                <BulletList items={analysis.risks ?? []} color="#f97316" icon="⚠"/>
              </Card>
              <Card title="Red Flags" accent="#ef4444">
                <BulletList items={analysis.red_flags ?? []} color="#ef4444" icon="⛔"/>
              </Card>
            </div>
          </>
        )}

        {/* Empty / pre-load state */}
        {!loading && !analysis && !error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
            gap: 12, padding: "4rem 0" }}>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#33334d" }}>
              No analysis loaded yet
            </p>
            <button onClick={runAnalysis} style={{
              background: formColor, border: "none", color: "#fff",
              padding: "9px 22px", borderRadius: 7, fontSize: 13,
              fontFamily: "monospace", cursor: "pointer",
            }}>
              Analyze {form}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}

export default function FilingPage() {
  return (
    <Suspense fallback={null}>
      <FilingInner />
    </Suspense>
  );
}
