"use client";

type ToneData = {
  trend: string;
  trend_score: number;
  notable_changes: string[];
  new_risk_themes: string[];
  recurring_strengths: string[];
  ai_analysis: string;
  years_analyzed: number;
};

function TrendArrow({ score }: { score: number }) {
  if (score >= 2)  return <span style={{ color: "#22c55e", fontSize: 16 }}>↑↑</span>;
  if (score === 1) return <span style={{ color: "#84cc16", fontSize: 16 }}>↑</span>;
  if (score === 0) return <span style={{ color: "#eab308", fontSize: 16 }}>→</span>;
  if (score === -1)return <span style={{ color: "#f97316", fontSize: 16 }}>↓</span>;
  return <span style={{ color: "#ef4444", fontSize: 16 }}>↓↓</span>;
}

function trendColor(trend: string) {
  if (trend === "Improving")    return "#22c55e";
  if (trend === "Stable")       return "#eab308";
  if (trend === "Cautious")     return "#f97316";
  if (trend === "Deteriorating")return "#ef4444";
  return "#6b7aff";
}

export default function ManagementTone({ data }: { data: ToneData }) {
  const tc = trendColor(data.trend);

  return (
    <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
      borderRadius: 10, padding: "1rem 1.2rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
          letterSpacing: 1.2, textTransform: "uppercase" }}>
          Management Tone · {data.years_analyzed}-Year MD&A Analysis
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <TrendArrow score={data.trend_score}/>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: tc,
            background: tc + "15", border: `1px solid ${tc}33`,
            padding: "2px 10px", borderRadius: 10 }}>
            {data.trend}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem",
        marginBottom: 14 }}>

        {/* Notable changes */}
        <div style={{ background: "#0a0a0f", borderRadius: 8, padding: "0.8rem" }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a",
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            Language Shifts
          </div>
          {data.notable_changes?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {data.notable_changes.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 7 }}>
                  <span style={{ color: "#f97316", fontSize: 11, flexShrink: 0 }}>△</span>
                  <span style={{ fontSize: 12, color: "#c0c0d8", lineHeight: 1.5 }}>{c}</span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d",
              fontStyle: "italic" }}>No significant shifts detected</span>
          )}
        </div>

        {/* New risk themes + recurring strengths */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <div style={{ background: "#0a0a0f", borderRadius: 8, padding: "0.8rem", flex: 1 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ef4444",
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              New Risk Themes (Latest Year)
            </div>
            {data.new_risk_themes?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {data.new_risk_themes.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <span style={{ color: "#ef4444", fontSize: 10, flexShrink: 0 }}>!</span>
                    <span style={{ fontSize: 12, color: "#f08080", lineHeight: 1.4 }}>{r}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d",
                fontStyle: "italic" }}>None identified</span>
            )}
          </div>

          <div style={{ background: "#0a0a0f", borderRadius: 8, padding: "0.8rem", flex: 1 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#22c55e",
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Recurring Strengths
            </div>
            {data.recurring_strengths?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {data.recurring_strengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <span style={{ color: "#22c55e", fontSize: 10, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 12, color: "#c0c0d8", lineHeight: 1.4 }}>{s}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d",
                fontStyle: "italic" }}>N/A</span>
            )}
          </div>
        </div>
      </div>

      {/* AI analysis */}
      {data.ai_analysis && (
        <div style={{ background: "#0a0a0f", border: "1px solid #1e1e2e",
          borderRadius: 8, padding: "0.9rem 1rem" }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a",
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            What the Tone Shift Signals
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#c0c0d8", margin: 0 }}>
            {data.ai_analysis}
          </p>
        </div>
      )}
    </div>
  );
}
