"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from "../../lib/watchlist";

const SECTORS = [
  { label: "Technology",             color: "#6b7aff" },
  { label: "Healthcare",             color: "#22c55e" },
  { label: "Financials",             color: "#eab308" },
  { label: "Energy",                 color: "#f97316" },
  { label: "Consumer Discretionary", color: "#ec4899" },
  { label: "Consumer Staples",       color: "#10b981" },
  { label: "Industrials",            color: "#64748b" },
  { label: "Communication Services", color: "#8b5cf6" },
  { label: "Materials",              color: "#f59e0b" },
  { label: "Utilities",              color: "#06b6d4" },
  { label: "Real Estate",            color: "#84cc16" },
];

function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#0d0d17", border: "1px solid #1e1e2e", borderRadius: 10,
      padding: "1.2rem", borderLeft: accent ? `3px solid ${accent}` : "1px solid #1e1e2e",
    }}>
      <div style={{ fontFamily: "monospace", fontSize: 10, color: accent || "#6b7aff",
        letterSpacing: 1.2, marginBottom: 14, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type UsageData = { plan: string; analyses_used: number; analyses_limit: number | null };

export default function DashboardPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [email,     setEmail]     = useState("");
  const [dbError,   setDbError]   = useState(false);
  const [usage,     setUsage]     = useState<UsageData | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user }, } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");

      // Load usage from backend
      try {
        const session = await supabase.auth.getSession();
        const token   = session.data.session?.access_token;
        const res = await fetch(`${API}/usage`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setUsage(await res.json());
      } catch { /* ignore */ }

      try {
        const items = await getWatchlist();
        setWatchlist(items);
      } catch {
        setDbError(true);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleRemove(id: string) {
    await removeFromWatchlist(id);
    setWatchlist(w => w.filter(x => x.id !== id));
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0", padding: "1.5rem" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.8rem", display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, color: "#e8e8f0", marginBottom: 4,
              fontFamily: "Georgia, serif" }}>Dashboard</h1>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a", margin: 0 }}>{email}</p>
          </div>

          {/* Plan + usage pill */}
          {usage && (
            <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
              borderRadius: 10, padding: "12px 18px", minWidth: 220 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontFamily: "monospace", fontSize: 10,
                  background: usage.plan === "pro" ? "#6b7aff22" : "#1a1a2e",
                  border: `1px solid ${usage.plan === "pro" ? "#6b7aff" : "#2a2a3e"}`,
                  color: usage.plan === "pro" ? "#6b7aff" : "#6666aa",
                  padding: "2px 10px", borderRadius: 10, fontWeight: "bold",
                  textTransform: "uppercase", letterSpacing: 1,
                }}>
                  {usage.plan === "pro" ? "✓ Pro" : "Free"}
                </span>
                {usage.plan === "free" && (
                  <a href={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "/landing#pricing"}
                    style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
                      textDecoration: "none" }}>
                    Upgrade →
                  </a>
                )}
              </div>
              {usage.plan === "free" && usage.analyses_limit != null && (
                <>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6666aa",
                    marginBottom: 5 }}>
                    Analyses this month: {usage.analyses_used} / {usage.analyses_limit}
                  </div>
                  <div style={{ background: "#1a1a2e", borderRadius: 4, height: 5, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(100, (usage.analyses_used / usage.analyses_limit) * 100)}%`,
                      height: "100%", borderRadius: 4,
                      background: usage.analyses_used >= usage.analyses_limit ? "#ef4444" : "#6b7aff",
                      transition: "width 0.4s ease",
                    }}/>
                  </div>
                </>
              )}
              {usage.plan === "pro" && (
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#6666aa" }}>
                  Unlimited analyses
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem" }}>

          {/* Watchlist */}
          <Card title="Watchlist">
            {dbError && (
              <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: 8,
                padding: "1rem", marginBottom: 12, fontFamily: "monospace", fontSize: 12, color: "#6666aa" }}>
                ⚠ Watchlist table not set up yet.{" "}
                <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
                  style={{ color: "#6b7aff" }}>
                  Run the SQL setup →
                </a>
              </div>
            )}

            {!dbError && loading && (
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#44445a" }}>Loading…</p>
            )}

            {!dbError && !loading && watchlist.length === 0 && (
              <div style={{ textAlign: "center", padding: "2.5rem 0" }}>
                <p style={{ fontFamily: "monospace", fontSize: 13, color: "#33334d", marginBottom: 14 }}>
                  Your watchlist is empty
                </p>
                <Link href="/screener" style={{
                  background: "#6b7aff", color: "#fff", padding: "8px 22px",
                  borderRadius: 7, fontSize: 13, textDecoration: "none", fontFamily: "monospace",
                }}>
                  Browse Screener
                </Link>
              </div>
            )}

            {!dbError && !loading && watchlist.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {watchlist.map(item => (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", background: "#13131f",
                    border: "1px solid #1e1e2e", borderRadius: 8,
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: 14, color: "#e8e8f0",
                      fontWeight: "bold", width: 68, flexShrink: 0 }}>
                      {item.ticker}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6666aa", flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.company_name || ""}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#2a2a40", flexShrink: 0 }}>
                      {new Date(item.added_at).toLocaleDateString()}
                    </span>
                    <Link href={`/?ticker=${item.ticker}`} style={{
                      background: "#6b7aff22", border: "1px solid #6b7aff44",
                      color: "#6b7aff", padding: "4px 12px", borderRadius: 5,
                      fontSize: 11, fontFamily: "monospace", textDecoration: "none", flexShrink: 0,
                    }}>
                      Analyze
                    </Link>
                    <button onClick={() => handleRemove(item.id)} style={{
                      background: "transparent", border: "none", color: "#44445a",
                      cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0,
                    }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Quick Analyze */}
            <Card title="Analyzer">
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#6666aa", marginBottom: 12, lineHeight: 1.6 }}>
                Deep SEC filing analysis. AI reads the full 10-K, 10-Qs, and 8-Ks.
              </p>
              <Link href="/" style={{
                display: "block", textAlign: "center", background: "#6b7aff",
                color: "#fff", padding: "9px", borderRadius: 7,
                fontSize: 13, fontFamily: "monospace", textDecoration: "none", fontWeight: "bold",
              }}>
                Open Analyzer →
              </Link>
            </Card>

            {/* Sectors */}
            <Card title="Browse by Sector">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {SECTORS.map(({ label, color }) => (
                  <Link key={label} href={`/screener?sector=${encodeURIComponent(label)}`} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 6,
                    background: "#13131f", border: "1px solid #1e1e2e",
                    textDecoration: "none", fontSize: 11, fontFamily: "monospace", color: "#c0c0d8",
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%",
                      background: color, flexShrink: 0 }}/>
                    {label}
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
