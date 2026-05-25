"use client";

type Transaction = {
  date: string; owner: string; title: string;
  type: "Buy" | "Sell"; shares: number; price: number; value: number;
  is_director: boolean; is_officer: boolean;
};
type Summary = {
  total_transactions: number; transactions_90d: number;
  buys_90d: number; sells_90d: number;
  buy_value_90d: number; sell_value_90d: number;
  net_value_90d: number; net_sentiment: string;
};
type InsiderData = { transactions: Transaction[]; summary: Summary };

function fmtVal(v: number) {
  if (Math.abs(v) >= 1e9)  return `$${(v/1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6)  return `$${(v/1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3)  return `$${(v/1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtShares(n: number) {
  if (n >= 1e6) return `${(n/1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

function sentimentColor(s: string) {
  if (s === "Bullish") return "#22c55e";
  if (s === "Bearish") return "#ef4444";
  return "#eab308";
}

export default function InsiderActivity({
  data, loading, ticker
}: { data: InsiderData | null; loading: boolean; ticker: string }) {

  if (loading) {
    return (
      <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
        borderRadius: 10, padding: "1rem 1.2rem" }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
          letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>
          Insider Activity · Form 4 Filings (SEC EDGAR)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#44445a",
          fontFamily: "monospace", fontSize: 12, padding: "1rem 0" }}>
          <div style={{ width: 14, height: 14, border: "2px solid #6b7aff",
            borderTopColor: "transparent", borderRadius: "50%",
            animation: "spin 0.8s linear infinite" }}/>
          Loading Form 4 transactions…
        </div>
      </div>
    );
  }

  if (!data || !data.transactions?.length) {
    return (
      <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
        borderRadius: 10, padding: "1rem 1.2rem" }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
          letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
          Insider Activity · Form 4 Filings (SEC EDGAR)
        </div>
        <p style={{ fontFamily: "monospace", fontSize: 12, color: "#33334d",
          fontStyle: "italic" }}>
          No open-market insider transactions found for {ticker} in recent filings.
        </p>
      </div>
    );
  }

  const { summary: s, transactions } = data;
  const sc = sentimentColor(s.net_sentiment);

  return (
    <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
      borderRadius: 10, padding: "1rem 1.2rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
          letterSpacing: 1.2, textTransform: "uppercase" }}>
          Insider Activity · Form 4 Filings (SEC EDGAR)
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 9,
          color: "#33334d", background: "#13131f", padding: "2px 8px", borderRadius: 4 }}>
          Open-market only · P & S codes
        </div>
      </div>

      {/* 90-day summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.75rem", marginBottom: 14 }}>
        {[
          { label: "90-Day Sentiment", value: s.net_sentiment, color: sc, isBadge: true },
          { label: "Buys (90d)", value: `${s.buys_90d} trades · ${fmtVal(s.buy_value_90d)}`, color: "#22c55e" },
          { label: "Sells (90d)", value: `${s.sells_90d} trades · ${fmtVal(s.sell_value_90d)}`, color: "#ef4444" },
          { label: "Net Flow (90d)", value: fmtVal(s.net_value_90d),
            color: s.net_value_90d >= 0 ? "#22c55e" : "#ef4444" },
        ].map(({ label, value, color, isBadge }) => (
          <div key={label} style={{ background: "#0a0a0f", borderRadius: 7,
            padding: "0.75rem", textAlign: "center" }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#44445a",
              marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {label}
            </div>
            {isBadge ? (
              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "bold",
                color, background: color + "15", border: `1px solid ${color}33`,
                padding: "2px 10px", borderRadius: 8 }}>{value}</span>
            ) : (
              <div style={{ fontFamily: "monospace", fontSize: 12, color, fontWeight: "bold" }}>
                {value}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Transaction table */}
      <div style={{ background: "#0a0a0f", borderRadius: 8, overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ display: "grid",
          gridTemplateColumns: "90px 1fr 120px 60px 80px 80px 90px",
          padding: "7px 12px", background: "#13131f",
          borderBottom: "1px solid #1e1e2e" }}>
          {["Date", "Insider", "Title", "Type", "Shares", "Price", "Value"].map(h => (
            <div key={h} style={{ fontFamily: "monospace", fontSize: 9,
              color: "#44445a", textTransform: "uppercase", letterSpacing: 0.8 }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {transactions.slice(0, 30).map((tx, i) => {
            const tc = tx.type === "Buy" ? "#22c55e" : "#ef4444";
            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 120px 60px 80px 80px 90px",
                padding: "7px 12px",
                background: i % 2 === 0 ? "#0a0a0f" : "#0d0d15",
                borderBottom: "1px solid #13131f",
                alignItems: "center",
              }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#6666aa" }}>
                  {tx.date}
                </span>
                <span style={{ fontSize: 12, color: "#c0c0d8", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                  {tx.owner}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 9, color: "#6666aa",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.title}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "bold",
                  color: tc }}>
                  {tx.type}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#c0c0d8" }}>
                  {fmtShares(tx.shares)}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#8888b0" }}>
                  {tx.price ? `$${tx.price.toFixed(2)}` : "—"}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10,
                  color: tc, fontWeight: "bold" }}>
                  {tx.value ? fmtVal(tx.value) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#22223a", marginTop: 8 }}>
        Source: SEC EDGAR Form 4 · {s.total_transactions} total filings · Open-market P/S codes only
      </div>
    </div>
  );
}
