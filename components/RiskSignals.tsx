"use client";

type AltmanZ = {
  score: number; zone: string; components: Record<string, number>;
  data_year: number; model: string; thresholds: string;
};
type BeneishM = {
  score: number; risk_level: string; components: Record<string, number>;
  components_used: string[]; data_year: number; thresholds: string;
};
type RiskSignalsData = {
  altman_z?: AltmanZ | null;
  beneish_m?: BeneishM | null;
  ai_interpretation?: string;
};

function zoneColor(zone: string) {
  if (zone === "Safe")      return "#22c55e";
  if (zone === "Grey Zone") return "#eab308";
  return "#ef4444";
}
function mColor(risk: string) {
  if (risk.startsWith("Low"))  return "#22c55e";
  if (risk.startsWith("Grey")) return "#eab308";
  return "#ef4444";
}

function ScoreMeter({ value, min, max, goodHigh, label, sublabel, color }:
  { value: number; min: number; max: number; goodHigh: boolean;
    label: string; sublabel: string; color: string }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const W = 200, H = 10;
  const filled = (pct / 100) * W;
  const needleX = filled;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700,
        color, marginBottom: 2 }}>{value}</div>
      <div style={{ display: "inline-block", background: color + "22",
        border: `1px solid ${color}44`, color, fontFamily: "monospace",
        fontSize: 10, padding: "2px 10px", borderRadius: 10, marginBottom: 8 }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", margin: "0 auto 6px" }}>
        <rect x={0} y={2} width={W} height={6} rx={3} fill="#1a1a2e"/>
        <rect x={0} y={2} width={Math.max(filled, 0)} height={6} rx={3} fill={color} opacity={0.7}/>
        <rect x={Math.min(needleX, W-2)} y={0} width={2} height={H} rx={1} fill={color}/>
      </svg>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a" }}>{sublabel}</div>
    </div>
  );
}

export default function RiskSignals({ data }: { data: RiskSignalsData }) {
  const { altman_z: az, beneish_m: bm, ai_interpretation } = data;

  return (
    <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
      borderRadius: 10, padding: "1rem 1.2rem" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
          letterSpacing: 1.2, textTransform: "uppercase" }}>
          Risk Signals · Computed from SEC XBRL
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 9,
          color: "#33334d", background: "#13131f", padding: "2px 8px", borderRadius: 4 }}>
          Mathematical models · Zero AI hallucination
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2rem",
        marginBottom: ai_interpretation ? 14 : 0 }}>

        {/* Altman Z-Score */}
        {az ? (
          <div style={{ background: "#0a0a0f", border: `1px solid ${zoneColor(az.zone)}22`,
            borderRadius: 8, padding: "1rem" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a",
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              Altman Z-Score · Bankruptcy Risk
            </div>
            <ScoreMeter
              value={az.score} min={0} max={5} goodHigh={true}
              label={az.zone} sublabel={az.thresholds}
              color={zoneColor(az.zone)}
            />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(az.components).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a" }}>
                    {k.replace(/_/g, " ").replace(/x\d /i, "").trim()}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#8888b0" }}>
                    {v.toFixed(3)}
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: "monospace", fontSize: 8, color: "#2a2a3e",
                marginTop: 4, borderTop: "1px solid #13131f", paddingTop: 4 }}>
                {az.model} · FY{az.data_year}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "#0a0a0f", border: "1px solid #1e1e2e",
            borderRadius: 8, padding: "1rem", display: "flex", alignItems: "center",
            justifyContent: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d" }}>
              Altman Z-Score: insufficient XBRL data
            </span>
          </div>
        )}

        {/* Beneish M-Score */}
        {bm ? (
          <div style={{ background: "#0a0a0f", border: `1px solid ${mColor(bm.risk_level)}22`,
            borderRadius: 8, padding: "1rem" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a",
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              Beneish M-Score · Earnings Manipulation
            </div>
            <ScoreMeter
              value={bm.score} min={-4} max={0} goodHigh={false}
              label={bm.risk_level} sublabel={bm.thresholds}
              color={mColor(bm.risk_level)}
            />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(bm.components).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a" }}>
                    {k === "DSRI" ? "Days Sales Recv. Index" :
                     k === "GMI"  ? "Gross Margin Index" :
                     k === "AQI"  ? "Asset Quality Index" :
                     k === "SGI"  ? "Sales Growth Index" :
                     k === "DEPI" ? "Depreciation Index" : k}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#8888b0" }}>
                    {v.toFixed(3)}
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: "monospace", fontSize: 8, color: "#2a2a3e",
                marginTop: 4, borderTop: "1px solid #13131f", paddingTop: 4 }}>
                5-variable model ({bm.components_used.length} of 5 components) · FY{bm.data_year}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "#0a0a0f", border: "1px solid #1e1e2e",
            borderRadius: 8, padding: "1rem", display: "flex", alignItems: "center",
            justifyContent: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d" }}>
              Beneish M-Score: requires 2+ years of XBRL data
            </span>
          </div>
        )}
      </div>

      {/* AI Interpretation */}
      {ai_interpretation && (
        <div style={{ background: "#0a0a0f", border: "1px solid #1e1e2e",
          borderRadius: 8, padding: "0.9rem 1rem" }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a",
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            AI Risk Interpretation
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#c0c0d8", margin: 0 }}>
            {ai_interpretation}
          </p>
        </div>
      )}
    </div>
  );
}
