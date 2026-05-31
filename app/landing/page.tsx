"use client";

const STRIPE_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "/login";

const C = {
  bg:      "#08080e",
  surface: "#0d0d17",
  border:  "#1e1e2e",
  accent:  "#6b7aff",
  green:   "#22c55e",
  text:    "#e8e8f0",
  muted:   "#6666aa",
  dim:     "#33334d",
};

function NavBar() {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100,
      background: C.bg + "ee", backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${C.border}`,
      padding: "0.9rem 1.5rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 22, color: C.text, fontWeight: 700 }}>SEC</span>
          <span style={{ fontSize: 22, fontStyle: "italic", color: C.accent, fontWeight: 700 }}>Lens</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/login" style={{ fontFamily: "monospace", fontSize: 12,
            color: C.muted, textDecoration: "none", padding: "6px 14px" }}>Sign in</a>
          <a href="/login" style={{ fontFamily: "monospace", fontSize: 12,
            background: C.accent, color: "#fff", textDecoration: "none",
            padding: "7px 18px", borderRadius: 7, fontWeight: "bold" }}>
            Get Started Free
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section style={{ padding: "6rem 1.5rem 5rem", textAlign: "center" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div style={{ display: "inline-block", fontFamily: "monospace", fontSize: 11,
          color: C.accent, background: C.accent + "15", border: `1px solid ${C.accent}33`,
          padding: "4px 16px", borderRadius: 20, marginBottom: "1.8rem",
          letterSpacing: 1.4 }}>
          AI-POWERED SEC FILING ANALYSIS
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.6rem)", fontWeight: 800,
          color: C.text, lineHeight: 1.15, margin: "0 0 1.5rem" }}>
          Institutional-grade research<br/>
          <span style={{ color: C.accent }}>on any public company</span>
        </h1>
        <p style={{ fontSize: "clamp(1rem, 2vw, 1.2rem)", color: C.muted,
          lineHeight: 1.8, maxWidth: 600, margin: "0 auto 2.8rem" }}>
          SECLens reads the full 10-K, 10-Qs, and 8-Ks — not just summaries —
          and delivers a scored, data-verified analysis in under a minute.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/login" style={{ background: C.accent, color: "#fff",
            padding: "13px 32px", borderRadius: 9, fontSize: 15, fontWeight: "bold",
            textDecoration: "none", display: "inline-block" }}>
            Analyze a stock free →
          </a>
          <a href="#how" style={{ background: "transparent", color: C.muted,
            padding: "13px 24px", borderRadius: 9, fontSize: 14,
            border: `1px solid ${C.border}`, textDecoration: "none", display: "inline-block" }}>
            See how it works
          </a>
        </div>
        <p style={{ fontFamily: "monospace", fontSize: 11, color: C.dim, marginTop: 22 }}>
          Free tier: 3 analyses/month · No credit card required
        </p>
      </div>

      {/* Dashboard preview */}
      <div style={{ maxWidth: 900, margin: "4rem auto 0",
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: "1.2rem", boxShadow: `0 0 80px ${C.accent}18` }}>
        <div style={{ display: "flex", gap: 6, marginBottom: "1rem" }}>
          {["#ef4444","#eab308","#22c55e"].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }}/>
          ))}
        </div>
        {/* Mock analysis output */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "1rem" }}>
          <div style={{ background: C.bg, borderRadius: 8, padding: "1rem",
            border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: C.accent,
              letterSpacing: 1.2, marginBottom: 10 }}>INVESTMENT RATING</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <svg viewBox="0 0 200 128" width={160} height={100}>
                <defs>
                  <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444"/>
                    <stop offset="50%" stopColor="#eab308"/>
                    <stop offset="100%" stopColor="#22c55e"/>
                  </linearGradient>
                </defs>
                <path d="M 34 80 A 66 66 0 0 0 166 80" fill="none" stroke="#1e1e2e" strokeWidth={12} strokeLinecap="round"/>
                <path d="M 34 80 A 66 66 0 0 0 138 33" fill="none" stroke="url(#lg)" strokeWidth={12} strokeLinecap="round"/>
                <line x1="100" y1="80" x2={138} y2={33} stroke="#e8e8f0" strokeWidth={2.5} strokeLinecap="round"/>
                <circle cx={100} cy={80} r={4.5} fill="#e8e8f0"/>
                <text x={100} y={106} textAnchor="middle" fontSize={26} fontWeight="bold" fill="#22c55e" fontFamily="Georgia,serif">78</text>
                <text x={100} y={120} textAnchor="middle" fontSize={9} fill="#555570" fontFamily="monospace" letterSpacing={1}>OUT OF 100</text>
              </svg>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span style={{ background: "#22c55e22", border: "1px solid #22c55e",
                color: "#22c55e", fontFamily: "monospace", fontSize: 12,
                fontWeight: "bold", padding: "4px 16px", borderRadius: 20 }}>Buy</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <div style={{ background: C.bg, borderRadius: 8, padding: "0.9rem",
              border: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: C.accent,
                letterSpacing: 1.2, marginBottom: 8 }}>SCORE BREAKDOWN</div>
              {[
                ["Revenue Growth",   16, 20, "#22c55e"],
                ["Profitability",    14, 20, "#84cc16"],
                ["Balance Sheet",    15, 20, "#22c55e"],
                ["Earnings Quality", 11, 15, "#eab308"],
              ].map(([lbl, s, mx, clr]) => (
                <div key={lbl as string} style={{ display: "flex", alignItems: "center",
                  gap: 8, marginBottom: 5 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: C.muted,
                    width: 120, flexShrink: 0 }}>{lbl}</span>
                  <div style={{ flex: 1, background: "#1a1a2e", borderRadius: 3, height: 6 }}>
                    <div style={{ width: `${(s as number)/(mx as number)*100}%`, height: "100%",
                      background: clr as string, borderRadius: 3 }}/>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#c0c0d8",
                    width: 34, textAlign: "right" }}>{s}/{mx}</span>
                </div>
              ))}
            </div>
            <div style={{ background: C.bg, borderRadius: 8, padding: "0.9rem",
              border: `1px solid ${C.border}`, flex: 1 }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#22c55e",
                letterSpacing: 1.2, marginBottom: 8 }}>KEY METRICS · VERIFIED FROM SEC XBRL</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                {[
                  ["Revenue (TTM)", "$394.3B"],
                  ["Gross Margin", "46.2%"],
                  ["Net Margin", "25.3%"],
                  ["P/E Ratio", "28.4×"],
                  ["Free Cash Flow", "$111.4B"],
                  ["Debt/Equity", "1.87×"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>{k}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#c0c0d8" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: "📄",
      title: "Full Filing Analysis",
      desc: "Reads the complete 10-K, 10-Qs, and 8-Ks — not press release summaries. Management discussion, risk factors, and footnotes included.",
    },
    {
      icon: "📊",
      title: "Verified XBRL Metrics",
      desc: "Every number pulled directly from SEC EDGAR's structured XBRL data. Revenue trends, margins, FCF — all sourced from official filings, not estimates.",
    },
    {
      icon: "🔢",
      title: "0–100 Investment Score",
      desc: "A composite rating across 6 dimensions: revenue growth, profitability, balance sheet strength, earnings quality, outlook, and risk profile.",
    },
    {
      icon: "📈",
      title: "Multi-Year Trend Charts",
      desc: "Revenue, net income, and margin trend charts built from 5+ years of XBRL history. See the trajectory at a glance.",
    },
    {
      icon: "🚨",
      title: "Risk Signal Models",
      desc: "Altman Z-Score for bankruptcy risk and Beneish M-Score for earnings manipulation — the same models used by institutional analysts.",
    },
    {
      icon: "🧑‍💼",
      title: "Insider Sentiment",
      desc: "Recent Form 4 open-market transactions by executives and directors. Real money moves only — option exercises and grants excluded.",
    },
  ];
  return (
    <section style={{ padding: "5rem 1.5rem", background: C.surface, borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 700,
            color: C.text, margin: "0 0 0.8rem" }}>
            Everything analysts look for, automated
          </h2>
          <p style={{ color: C.muted, fontSize: 16, maxWidth: 520, margin: "0 auto" }}>
            Built on the same SEC data used by hedge funds — now accessible without a Bloomberg terminal.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
          gap: "1.2rem" }}>
          {items.map(item => (
            <div key={item.title} style={{ background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "1.4rem 1.5rem" }}>
              <div style={{ fontSize: 26, marginBottom: 12 }}>{item.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, margin: 0 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Enter a ticker",     desc: "Type any US-listed stock ticker — AAPL, NVDA, TSLA, JPM, or 7,000 others." },
    { n: "02", title: "We read the filings", desc: "SECLens fetches the latest 10-K, 10-Qs, 8-Ks, and 5+ years of XBRL financial history directly from SEC EDGAR." },
    { n: "03", title: "AI builds the report", desc: "Our AI synthesizes everything into a structured analysis: score, verdict, verified metrics, risks, red flags, and a full written breakdown." },
    { n: "04", title: "Ask follow-up questions", desc: "Chat with the AI analyst about the company — every answer is grounded in the actual SEC filings, not hallucination." },
  ];
  return (
    <section id="how" style={{ padding: "5rem 1.5rem" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 700,
            color: C.text, margin: "0 0 0.8rem" }}>
            How it works
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, width: 48, height: 48,
                background: C.accent + "18", border: `1px solid ${C.accent}44`,
                borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "monospace", fontSize: 12, color: C.accent, fontWeight: "bold" }}>
                {s.n}
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, margin: 0 }}>
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section style={{ padding: "5rem 1.5rem", background: C.surface, borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 700,
          color: C.text, margin: "0 0 0.8rem" }}>
          Simple pricing
        </h2>
        <p style={{ color: C.muted, fontSize: 16, marginBottom: "3rem" }}>
          Start free. Upgrade when you need more.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem", maxWidth: 680, margin: "0 auto" }}>

          {/* Free */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "2rem 1.8rem", textAlign: "left" }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: C.muted,
              letterSpacing: 1.2, marginBottom: 12 }}>FREE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: C.text }}>$0</span>
              <span style={{ color: C.muted, fontSize: 14 }}>/month</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: "1.8rem", lineHeight: 1.6 }}>
              Get started at no cost.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "2rem" }}>
              {[
                "3 analyses per month",
                "Full scoring & metrics",
                "Revenue & margin charts",
                "Risk signal models",
                "Ask questions via chat",
              ].map(f => (
                <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: C.green, fontSize: 13, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: C.muted }}>{f}</span>
                </div>
              ))}
            </div>
            <a href="/login" style={{ display: "block", textAlign: "center",
              background: "transparent", border: `1px solid ${C.border}`,
              color: C.muted, padding: "11px", borderRadius: 8,
              fontSize: 13, fontFamily: "monospace", textDecoration: "none" }}>
              Get started free
            </a>
          </div>

          {/* Pro */}
          <div style={{ background: C.accent + "0e", border: `1px solid ${C.accent}55`,
            borderRadius: 12, padding: "2rem 1.8rem", textAlign: "left",
            boxShadow: `0 0 40px ${C.accent}15` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 12 }}>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: C.accent,
                letterSpacing: 1.2 }}>PRO</span>
              <span style={{ fontFamily: "monospace", fontSize: 10, background: C.accent,
                color: "#fff", padding: "2px 10px", borderRadius: 20 }}>MOST POPULAR</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: C.text }}>$29</span>
              <span style={{ color: C.muted, fontSize: 14 }}>/month</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: "1.8rem", lineHeight: 1.6 }}>
              For serious investors and traders.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "2rem" }}>
              {[
                "Unlimited analyses",
                "Everything in Free",
                "Watchlist tracking",
                "Management tone analysis",
                "Insider transaction feed",
                "Multi-company comparison",
                "Priority support",
              ].map(f => (
                <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: C.accent, fontSize: 13, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: "#c0c0d8" }}>{f}</span>
                </div>
              ))}
            </div>
            <a href={STRIPE_LINK} style={{ display: "block", textAlign: "center",
              background: C.accent, color: "#fff",
              padding: "11px", borderRadius: 8, fontSize: 13,
              fontFamily: "monospace", textDecoration: "none", fontWeight: "bold" }}>
              Upgrade to Pro →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section style={{ padding: "5rem 1.5rem", textAlign: "center" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 700,
          color: C.text, margin: "0 0 1rem" }}>
          Your next stock pick starts with the filing
        </h2>
        <p style={{ fontSize: 16, color: C.muted, marginBottom: "2.2rem", lineHeight: 1.7 }}>
          Join investors who skip the noise and go straight to the source.
        </p>
        <a href="/login" style={{ background: C.accent, color: "#fff",
          padding: "14px 36px", borderRadius: 9, fontSize: 16, fontWeight: "bold",
          textDecoration: "none", display: "inline-block" }}>
          Analyze your first stock — free
        </a>
        <p style={{ fontFamily: "monospace", fontSize: 11, color: C.dim, marginTop: 16 }}>
          No credit card · Takes 30 seconds to set up
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, padding: "2rem 1.5rem",
      background: C.bg }}>
      <div style={{ maxWidth: 1100, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12 }}>
        <div>
          <span style={{ fontSize: 16, color: C.text, fontWeight: 700 }}>SEC</span>
          <span style={{ fontSize: 16, fontStyle: "italic", color: C.accent, fontWeight: 700 }}>Lens</span>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: C.dim,
            marginLeft: 10, letterSpacing: 1.2 }}>AI-POWERED SEC ANALYSIS</span>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: C.dim, lineHeight: 1.8, textAlign: "right" }}>
          <p style={{ margin: 0 }}>Data sourced from SEC EDGAR public filings.</p>
          <p style={{ margin: 0 }}>For informational purposes only. Not investment advice.</p>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <NavBar/>
      <Hero/>
      <Features/>
      <HowItWorks/>
      <Pricing/>
      <CTA/>
      <Footer/>
    </main>
  );
}
