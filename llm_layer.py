import os, json, glob
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


# ── Sector frameworks ────────────────────────────────────────────────────────
# Each entry drives: (a) what metrics to emphasise, (b) what valuation
# multiples apply, (c) what the LLM should watch for, and (d) how scoring
# weights should shift from the generic defaults.

SECTOR_FRAMEWORKS: dict[str, dict] = {
    "energy": {
        "name": "Energy / Oil & Gas",
        "key_metrics": "EBITDAX, Debt/EBITDAX, FCF yield, CapEx/Revenue, reserve replacement",
        "valuation": (
            "EV/EBITDAX (E&P comps trade 4-8x; integrated majors 5-9x). "
            "FCF yield on enterprise value. Price/NAV for reserve-rich names. "
            "Do NOT use EV/Revenue or P/S — commodity revenue swings with price, not volume."
        ),
        "scoring_notes": (
            "FCF and balance sheet matter more than revenue growth in cyclical commodity businesses. "
            "Debt/EBITDAX above 3x is a yellow flag; above 4x is a red flag. "
            "EBITDAX margin compression during a commodity upcycle is a serious warning sign. "
            "A company with rising production but falling FCF is spending itself into trouble."
        ),
        "red_flags": (
            "Debt/EBITDAX above 3x, negative FCF during commodity price upswings, "
            "CapEx consistently exceeding operating cash flow, exploration write-downs, "
            "reserve life index below 7 years."
        ),
    },
    "banks": {
        "name": "Banking / Financial Services",
        "key_metrics": "Net Interest Margin (NIM), Efficiency Ratio, ROE, Tier 1 Capital, Book Value/share",
        "valuation": (
            "Price/Book (P/B): quality banks at 1.5-2.5x; median at 1-1.5x. "
            "P/E on normalised earnings. Dividend yield. "
            "Standard operating margin and FCF are MEANINGLESS for banks — do not use them."
        ),
        "scoring_notes": (
            "ROE above 12% consistently is excellent; below 8% is poor. "
            "NIM compression from rate environment is a structural headwind. "
            "Efficiency ratio below 55% is well-run; above 65% signals cost bloat. "
            "Rising provision for credit losses is an early warning of deteriorating loan quality."
        ),
        "red_flags": (
            "NIM compressing more than 20 bps in a rising rate environment, "
            "NPL ratio rising above 1%, CET1 ratio below 10%, "
            "loan growth far outpacing deposit growth (funding risk), "
            "efficiency ratio deteriorating year-over-year."
        ),
    },
    "reit": {
        "name": "Real Estate Investment Trust (REIT)",
        "key_metrics": "FFO/share, AFFO/share, Dividend yield, Debt/EBITDA, Occupancy rate",
        "valuation": (
            "P/FFO (quality REITs 16-22x; value names 10-15x). "
            "P/AFFO (stricter; adjust for recurring CapEx). "
            "NAV premium/discount. Dividend yield relative to 10-yr Treasury. "
            "Net income is DISTORTED by real estate depreciation — always prefer FFO/AFFO."
        ),
        "scoring_notes": (
            "AFFO payout ratio above 90% leaves no room for reinvestment or a cushion. "
            "Debt/EBITDA above 7x is aggressive for a REIT; below 5x is conservative. "
            "Same-property NOI growth is the cleanest organic growth indicator. "
            "Lease expiry schedule and tenant concentration are existential risk factors."
        ),
        "red_flags": (
            "AFFO payout ratio above 100% (dividend not covered), "
            "occupancy declining more than 2pp year-over-year, "
            "debt/EBITDA above 7x, heavy floating-rate debt exposure, "
            "anchor tenant departures or major lease non-renewals."
        ),
    },
    "tech": {
        "name": "Technology / Software",
        "key_metrics": "Revenue growth rate, Gross margin, Rule of 40 (growth% + FCF margin%), Operating leverage",
        "valuation": (
            "EV/Revenue for high-growth (>30%/yr) pre-profit names. "
            "EV/EBITDA for profitable software (20-35x for best-in-class). "
            "P/FCF for mature cash generators. Rule of 40 ≥ 40 is the quality threshold. "
            "Hardware/semiconductor names trade at lower multiples than pure software."
        ),
        "scoring_notes": (
            "Gross margin below 60% for software is a structural concern — check if it's hardware mix. "
            "Revenue growth decelerating from >30% to <15% in two years is a major de-rating trigger. "
            "Positive and growing FCF margin matters more than GAAP profitability for SaaS. "
            "High R&D as % of revenue is GOOD for tech — it's investment, not waste."
        ),
        "red_flags": (
            "Revenue growth decelerating sharply without margin expansion to compensate, "
            "gross margin below 50% for pure software, "
            "negative FCF with no identifiable path to profitability, "
            "customer concentration above 20% in a single account, "
            "rising SG&A as % of revenue (loss of operating leverage)."
        ),
    },
    "healthcare": {
        "name": "Healthcare / Pharmaceuticals / Biotech",
        "key_metrics": "R&D/Revenue ratio, Gross margin, Revenue concentration by drug/product, Pipeline coverage",
        "valuation": (
            "EV/EBITDA for large-cap pharma (8-14x). "
            "P/E on 'cash EPS' (add back amortisation of acquired IP). "
            "Sum-of-parts DCF on patent-protected revenues for diversified portfolios. "
            "For pre-revenue biotech: cash runway, probability-adjusted pipeline NPV."
        ),
        "scoring_notes": (
            "A single drug generating >40% of revenue is binary risk — patent cliff or generic threat changes everything. "
            "R&D declining as % of revenue in big pharma signals pipeline neglect. "
            "Gross margin above 70% is normal for branded pharmaceuticals. "
            "FDA approval timelines and competitive approvals in the same indication are key catalysts."
        ),
        "red_flags": (
            "Revenue from top product >50% of total with patent expiry within 5 years, "
            "R&D/revenue ratio declining below 12% for an innovative pharma company, "
            "clinical trial failures in lead pipeline programmes, "
            "generic competition entering a key market, going-concern language in a biotech."
        ),
    },
    "retail": {
        "name": "Retail / Consumer Discretionary",
        "key_metrics": "Same-store (comp) sales growth, Gross margin, Inventory turnover, EBITDA margin",
        "valuation": (
            "EV/EBITDA (4-10x for physical retail; 12-20x for dominant omnichannel). "
            "P/E normalised for lease accounting (IFRS 16 / ASC 842 distorts EBITDA). "
            "EV/Sales for pre-profitable growth retail."
        ),
        "scoring_notes": (
            "Comp sales growth is the single most important metric — aggregate revenue can grow via new stores while the core business deteriorates. "
            "Gross margin below 30% for non-grocery retail is a structural weakness. "
            "Inventory building faster than revenue growth signals demand slowdown or poor buying decisions. "
            "E-commerce penetration and digital growth rate are forward-looking quality signals."
        ),
        "red_flags": (
            "Negative comp sales for two or more consecutive quarters, "
            "inventory/revenue ratio rising above historical norms, "
            "gross margin compressing >200 bps in a single year, "
            "store closure announcements, "
            "heavy debt load with cyclical revenue exposure."
        ),
    },
    "industrials": {
        "name": "Industrials / Manufacturing / Defense",
        "key_metrics": "Operating margin, EBITDA margin, Order backlog, Book-to-bill ratio, CapEx/Revenue",
        "valuation": (
            "EV/EBITDA (7-13x for quality industrials). "
            "P/E. EV/EBIT for asset-light sub-sectors. "
            "Backlog/Revenue multiple as a forward visibility indicator."
        ),
        "scoring_notes": (
            "Backlog growth above revenue growth signals accelerating demand — a leading indicator. "
            "Operating leverage is the key quality test: margin should expand as revenue grows. "
            "CapEx intensity (CapEx/Revenue) is sector-normal at 3-6%; above 10% requires justification. "
            "Defense contractors have government contract visibility; cyclical industrials are macro-sensitive."
        ),
        "red_flags": (
            "Backlog declining faster than revenue (demand deterioration), "
            "margin compression on volume growth (pricing or cost problem), "
            "working capital building significantly (receivables or inventory), "
            "rising debt with CapEx that doesn't grow capacity."
        ),
    },
    "utilities": {
        "name": "Utilities",
        "key_metrics": "Dividend yield, Regulated ROE, Rate base growth, Debt/EBITDA, Payout ratio",
        "valuation": (
            "P/E (15-20x for regulated utilities in stable rate environments). "
            "EV/EBITDA (8-12x). "
            "Dividend yield relative to 10-yr Treasury (spread typically 100-200 bps for regulated names). "
            "Rate base multiple (enterprise value as a multiple of regulated rate base)."
        ),
        "scoring_notes": (
            "Rate base growth is the engine of earnings growth in regulated utilities. "
            "Dividend sustainability: payout ratio below 75% of regulated earnings provides a cushion. "
            "Debt/EBITDA above 6x is aggressive; utilities carry more debt than most sectors by design. "
            "Unregulated segments introduce commodity and volume risk — size matters."
        ),
        "red_flags": (
            "Dividend payout ratio exceeding 80% without rate base growth, "
            "debt/EBITDA above 6.5x, "
            "regulatory rate cases with adverse outcomes, "
            "large unregulated segment underperforming, "
            "deteriorating credit ratings approaching investment-grade floor."
        ),
    },
    "general": {
        "name": "General / Diversified",
        "key_metrics": "Revenue growth, Operating margin, FCF margin, Debt/Equity, ROIC",
        "valuation": (
            "EV/EBITDA (sector-dependent but 8-15x is a reasonable starting range). "
            "P/E on normalised earnings. FCF yield. EV/Revenue for pre-profit names."
        ),
        "scoring_notes": (
            "ROIC above WACC consistently is the single best indicator of a quality business. "
            "FCF conversion (FCF/net income) above 80% indicates high earnings quality. "
            "Revenue growth with stable or improving margins is the clearest positive signal."
        ),
        "red_flags": (
            "FCF consistently below reported net income (earnings quality concern), "
            "rising debt without commensurate asset or cash flow growth, "
            "revenue growth driven entirely by price (volume declining), "
            "multiple restatements or auditor changes."
        ),
    },
}


def _detect_sector(sic: str, sic_desc: str) -> dict:
    """
    Map SIC code + description to the appropriate sector framework.
    SIC codes take precedence; description keywords are the fallback.
    """
    try:
        sic_num = int(sic) if sic and str(sic).strip().isdigit() else 0
    except Exception:
        sic_num = 0
    desc = (sic_desc or "").lower()

    # Energy / Oil & Gas
    if (1000 <= sic_num <= 1499
            or sic_num in {2911, 2990, 4922, 4923, 4924, 4925, 4941, 5171, 5172}
            or any(k in desc for k in [
                "petroleum", "natural gas", "oil", "crude", "drilling",
                "refin", "pipeline", "coal", "mining", "extraction",
            ])):
        return SECTOR_FRAMEWORKS["energy"]

    # Banks / Financial
    if (6000 <= sic_num <= 6199
            or any(k in desc for k in [
                "bank", "savings institution", "credit union",
                "mortgage", "thrift", "federal reserve",
            ])):
        return SECTOR_FRAMEWORKS["banks"]

    # REITs
    if (sic_num == 6798
            or 6500 <= sic_num <= 6552
            or any(k in desc for k in ["real estate", "reit", "real property"])):
        return SECTOR_FRAMEWORKS["reit"]

    # Tech / Software / Semiconductors
    if (3674 <= sic_num <= 3674          # semiconductors
            or 7370 <= sic_num <= 7379   # computer services / software
            or any(k in desc for k in [
                "software", "semiconductor", "computer", "internet",
                "electronic data", "prepackaged", "cloud", "cybersecurity",
            ])):
        return SECTOR_FRAMEWORKS["tech"]

    # Healthcare / Pharma / Biotech
    if (2833 <= sic_num <= 2836
            or 3841 <= sic_num <= 3842
            or 8000 <= sic_num <= 8099
            or any(k in desc for k in [
                "pharmaceutical", "drug", "biotech", "biologics",
                "medical device", "hospital", "health service", "clinical",
            ])):
        return SECTOR_FRAMEWORKS["healthcare"]

    # Utilities
    if (4900 <= sic_num <= 4939
            or any(k in desc for k in [
                "electric service", "gas distribution", "water supply",
                "utility", "power generation",
            ])):
        return SECTOR_FRAMEWORKS["utilities"]

    # Retail / Consumer
    if (5200 <= sic_num <= 5999
            or any(k in desc for k in [
                "retail", "department store", "grocery", "apparel",
                "restaurant", "food service", "specialty store",
            ])):
        return SECTOR_FRAMEWORKS["retail"]

    # Industrials / Aerospace / Defense
    if (3400 <= sic_num <= 3599
            or 3710 <= sic_num <= 3720
            or 3760 <= sic_num <= 3769   # guided missiles / defense
            or any(k in desc for k in [
                "aerospace", "defense", "machinery", "manufacturing",
                "industrial", "construction equipment", "fabricated metal",
            ])):
        return SECTOR_FRAMEWORKS["industrials"]

    return SECTOR_FRAMEWORKS["general"]


def _load_knowledge() -> str:
    """Load every .md and .txt file from the knowledge/ directory."""
    knowledge_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge")
    if not os.path.exists(knowledge_dir):
        return ""
    parts = []
    for pattern in ("*.md", "*.txt"):
        for path in sorted(glob.glob(os.path.join(knowledge_dir, pattern))):
            try:
                with open(path, "r") as f:
                    parts.append(f"=== {os.path.basename(path)} ===\n{f.read()}")
            except Exception:
                pass
    return "\n\n".join(parts)


def _build_system_prompt() -> str:
    # Keep the system prompt short to stay within Groq's token-per-minute limits.
    # The knowledge base (27 KB) is intentionally excluded here — including it
    # pushed each request to ~15 K tokens, reliably hitting the 6 K TPM free-tier cap.
    return (
        "You are a brutally honest, senior Wall Street equity analyst with 20+ years of experience. "
        "Your job is to protect investors from bad investments, not to sell them on stocks.\n\n"

        "DATA RULES (strictly enforced):\n"
        "- Use ONLY numbers from the XBRL DATA or VERIFIED METRICS blocks. Never invent or estimate figures.\n"
        "- Filing text (MD&A, Risk Factors) is qualitative context ONLY — never extract dollar amounts from it.\n"
        "- If a metric is missing, write N/A. Do not fabricate.\n\n"

        "ANALYSIS RULES:\n"
        "- Analyze the FULL multi-year trend, not just the most recent year. "
        "A single good year after years of decline is NOT a recovery — call it out.\n"
        "- Always cite the specific fiscal year for every number (e.g. FY2022, FY2023, FY2024).\n"
        "- Look for deteriorating trends: margin compression, slowing growth, rising debt, FCF decline.\n"
        "- A 'Buy' rating (70+) requires strong evidence across MULTIPLE years — not just the latest.\n"
        "- If trends are mixed or deteriorating, default to 'Hold' (50-69) or lower.\n"
        "- Red flags must be specific: name the year, the metric, and the direction.\n\n"

        "SCORING GUIDE:\n"
        "- 85-100 Strong Buy: consistent multi-year revenue+margin growth, strong FCF, low debt\n"
        "- 70-84 Buy: solid fundamentals with minor concerns, positive trend over 3+ years\n"
        "- 50-69 Hold: mixed signals, flat/slowing growth, margin pressure, or high debt\n"
        "- 30-49 Sell: declining revenue or margins, weak FCF, rising debt load\n"
        "- 0-29 Strong Sell: multiple years of deterioration, existential risks\n"
    )


class SECAnalyzer:
    def __init__(self, model: str = "llama-3.3-70b-versatile"):
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise ValueError("GROQ_API_KEY not set — add it to .env")
        self.client = Groq(api_key=key)
        self.model = model
        self.system_prompt = _build_system_prompt()

    # ── helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _fv(v) -> str:
        """Format a raw dollar value for display."""
        if v is None:
            return "N/A"
        try:
            v = float(v)
            if abs(v) >= 1e12: return f"${v/1e12:.3f}T"
            if abs(v) >= 1e9:  return f"${v/1e9:.2f}B"
            if abs(v) >= 1e6:  return f"${v/1e6:.1f}M"
            return f"{v:.2f}"
        except Exception:
            return str(v)

    def _fmt_facts(self, facts: dict) -> str:
        labels = {
            "revenue":             "Revenue",
            "net_income":          "Net Income",
            "operating_income":    "Operating Income",
            "gross_profit":        "Gross Profit",
            "eps_basic":           "EPS Basic",
            "eps_diluted":         "EPS Diluted",
            "total_assets":        "Total Assets",
            "total_equity":        "Stockholders Equity",
            "long_term_debt":      "Long-Term Debt",
            "cash":                "Cash & Equivalents",
            "operating_cash_flow": "Operating Cash Flow",
            "capex":               "CapEx",
            "current_assets":      "Current Assets",
            "current_liabilities": "Current Liabilities",
            "research_development":"R&D Expense",
        }
        fv = self._fv
        lines = []
        for key, label in labels.items():
            if key in facts and isinstance(facts[key], list) and facts[key]:
                pts = []
                for dp in facts[key]:
                    v, y = dp["value"], dp["year"]
                    if abs(v) >= 1e9:      pts.append(f"FY{y}: ${v/1e9:.2f}B")
                    elif abs(v) >= 1e6:    pts.append(f"FY{y}: ${v/1e6:.1f}M")
                    else:                  pts.append(f"FY{y}: {v:.2f}")
                lines.append(f"{label}: {' | '.join(pts)}")

        # Append TTM block — most current data available
        ttm = facts.get("_ttm", {})
        ttm_through = facts.get("_ttm_through", "")
        if ttm:
            through_label = f" (through {ttm_through})" if ttm_through else ""
            lines.append(f"\n=== TTM — TRAILING TWELVE MONTHS{through_label} (most current) ===")
            for k, v in ttm.items():
                label = labels.get(k, k.replace("_", " ").title())
                lines.append(f"  {label} TTM: {fv(v)}")

        return "\n".join(lines) or "No structured XBRL data available."

    def display_metrics(self, computed: dict) -> dict:
        """
        Convert raw computed values into display-ready strings.
        These are shown directly in the UI — no LLM involvement.
        """
        out = {}
        labels = {
            "revenue_latest":      ("Latest Revenue",       "money"),
            "revenue_growth_yoy":  ("Revenue Growth YoY",   "pct_signed"),
            "revenue_cagr_3yr":    ("Revenue CAGR (3yr)",   "pct_signed"),
            "net_margin":          ("Net Margin",            "pct"),
            "operating_margin":    ("Operating Margin",      "pct"),
            "gross_margin":        ("Gross Margin",          "pct"),
            "ebitda":              ("EBITDA",                "money"),
            "ebitda_margin":       ("EBITDA Margin",         "pct"),
            "ebitdax":             ("EBITDAX",               "money"),
            "ebitdax_margin":      ("EBITDAX Margin",        "pct"),
            "interest_coverage":   ("Interest Coverage",     "ratio"),
            "debt_to_equity":      ("Debt / Equity",         "ratio"),
            "current_ratio":       ("Current Ratio",         "ratio"),
            "roe":                 ("Return on Equity",      "pct"),
            "roa":                 ("Return on Assets",      "pct"),
            "fcf_margin":          ("FCF Margin",            "pct"),
            "free_cash_flow":      ("Free Cash Flow",        "money"),
            "eps_growth_yoy":      ("EPS Growth YoY",        "pct_signed"),
            "eps_latest":          ("EPS (Diluted)",         "eps"),
        }
        for key, (label, fmt) in labels.items():
            v = computed.get(key)
            if v is None:
                continue
            try:
                if fmt == "money":
                    out[label] = self._fv(v)
                elif fmt == "pct":
                    out[label] = f"{float(v):.1f}%"
                elif fmt == "pct_signed":
                    out[label] = f"{float(v):+.1f}%"
                elif fmt == "ratio":
                    out[label] = f"{float(v):.2f}x"
                elif fmt == "eps":
                    out[label] = f"${float(v):.2f}"
            except Exception:
                pass
        yr = computed.get("revenue_year")
        if yr:
            out["Data Through"] = f"FY{yr}"
        years = computed.get("data_years")
        if years and len(years) > 1:
            out["Years of Data"] = f"{years[0]}–{years[-1]}"
        # TTM metrics
        ttm_thru = computed.get("ttm_through", "")
        ttm_label = f" TTM ({ttm_thru[:7]})" if ttm_thru else " TTM"
        if "revenue_ttm" in computed:
            out[f"Revenue{ttm_label}"] = self._fv(computed["revenue_ttm"])
        if "net_margin_ttm" in computed:
            out[f"Net Margin{ttm_label}"] = f"{computed['net_margin_ttm']:.1f}%"
        if "operating_margin_ttm" in computed:
            out[f"Op Margin{ttm_label}"] = f"{computed['operating_margin_ttm']:.1f}%"
        if "gross_margin_ttm" in computed:
            out[f"Gross Margin{ttm_label}"] = f"{computed['gross_margin_ttm']:.1f}%"
        if "fcf_margin_ttm" in computed:
            out[f"FCF Margin{ttm_label}"] = f"{computed['fcf_margin_ttm']:.1f}%"
        return out

    def _compute_metrics(self, facts: dict) -> dict:
        """
        Compute all financial ratios from XBRL data in Python.
        These numbers are mathematically exact — the LLM must use them as-is.
        """
        def s(key):
            d = facts.get(key)
            return sorted(d, key=lambda x: x["year"]) if isinstance(d, list) and d else []

        def lv(series): return series[-1]["value"] if series else None
        def ly(series): return series[-1]["year"]  if series else None

        def yoy(series):
            if len(series) >= 2:
                prev, curr = series[-2]["value"], series[-1]["value"]
                if prev and prev != 0:
                    return round((curr - prev) / abs(prev) * 100, 1)
            return None

        rev  = s("revenue");         r  = lv(rev)
        inc  = s("net_income");      i  = lv(inc)
        op   = s("operating_income");o  = lv(op)
        gp   = s("gross_profit");    g  = lv(gp)
        eq   = s("total_equity");    e  = lv(eq)
        ld   = s("long_term_debt");  d  = lv(ld)
        ca   = s("current_assets");  ca_v = lv(ca)
        cl   = s("current_liabilities"); cl_v = lv(cl)
        ocf  = s("operating_cash_flow"); ocf_v = lv(ocf)
        cx   = s("capex");           cx_v = lv(cx)
        ass  = s("total_assets");    a  = lv(ass)
        eps  = s("eps_diluted") or s("eps_basic")
        da   = s("depreciation_amortization"); da_v = lv(da)
        ie   = s("interest_expense");           ie_v = lv(ie)
        ex   = s("exploration_expense");        ex_v = lv(ex)

        m = {
            "data_years": [dp["year"] for dp in rev],
            "earliest_year": rev[0]["year"]  if rev else None,
            "latest_year":   rev[-1]["year"] if rev else None,
        }

        if r:
            m["revenue_latest"]      = r
            m["revenue_year"]        = ly(rev)
            m["revenue_growth_yoy"]  = yoy(rev)
            m["revenue_trend"]       = [{"year": dp["year"], "value": dp["value"]} for dp in rev]
            # CAGR: look up the data point whose year is exactly latest_year-3,
            # not the 4th-from-last index (which breaks when years have gaps).
            latest_yr = ly(rev)
            base3 = next((dp for dp in rev if dp["year"] == latest_yr - 3), None)
            if base3 and base3["value"]:
                try:
                    cagr = ((r / base3["value"]) ** (1/3) - 1) * 100
                    m["revenue_cagr_3yr"] = round(cagr, 1)
                except Exception:
                    pass

        # Align revenue and income/profit to the same year before computing
        # margins — prevents cross-year division when series have different lengths.
        def aligned_pair(s1, s2):
            """Latest year present in both series; returns (v1, v2) or (None, None)."""
            by_yr1 = {dp["year"]: dp["value"] for dp in s1}
            by_yr2 = {dp["year"]: dp["value"] for dp in s2}
            common = sorted(set(by_yr1) & set(by_yr2))
            if not common:
                return None, None
            yr = common[-1]
            return by_yr1[yr], by_yr2[yr]

        r_ni, i_ni = aligned_pair(rev, inc)
        r_op, o_op = aligned_pair(rev, op)
        r_gp, g_gp = aligned_pair(rev, gp)

        if r_ni and i_ni is not None:  m["net_margin"]       = round(i_ni / r_ni * 100, 1)
        if r_op and o_op is not None:  m["operating_margin"] = round(o_op / r_op * 100, 1)
        if r_gp and g_gp is not None:  m["gross_margin"]     = round(g_gp / r_gp * 100, 1)
        if e and e != 0 and d is not None: m["debt_to_equity"] = round(d / e, 2)
        if ca_v and cl_v and cl_v != 0:    m["current_ratio"]  = round(ca_v / cl_v, 2)
        if e and e != 0 and i is not None: m["roe"]            = round(i / e * 100, 1)
        if a and a != 0 and i is not None: m["roa"]            = round(i / a * 100, 1)
        if ocf_v and cx_v is not None:
            fcf = ocf_v - abs(cx_v)
            m["free_cash_flow"] = fcf
            if r: m["fcf_margin"] = round(fcf / r * 100, 1)
        m["eps_growth_yoy"] = yoy(eps)
        if eps: m["eps_latest"] = eps[-1]["value"]

        # EBITDA = Operating Income + D&A
        # Use aligned pair so D&A and operating income are from same year
        if da_v is not None and o is not None:
            by_yr_da  = {dp["year"]: dp["value"] for dp in da}
            by_yr_op  = {dp["year"]: dp["value"] for dp in op}
            common_da = sorted(set(by_yr_da) & set(by_yr_op))
            if common_da:
                yr_da = common_da[-1]
                ebitda = by_yr_op[yr_da] + by_yr_da[yr_da]
                m["ebitda"] = ebitda
                # Align with revenue for margin
                if r:
                    by_yr_rev = {dp["year"]: dp["value"] for dp in rev}
                    if yr_da in by_yr_rev and by_yr_rev[yr_da]:
                        m["ebitda_margin"] = round(ebitda / by_yr_rev[yr_da] * 100, 1)
                # EBITDAX = EBITDA + Exploration Expenses (oil & gas)
                if ex_v is not None:
                    by_yr_ex = {dp["year"]: dp["value"] for dp in ex}
                    if yr_da in by_yr_ex:
                        ebitdax = ebitda + abs(by_yr_ex[yr_da])
                        m["ebitdax"] = ebitdax
                        if r and yr_da in by_yr_rev and by_yr_rev[yr_da]:
                            m["ebitdax_margin"] = round(ebitdax / by_yr_rev[yr_da] * 100, 1)

        # Interest coverage = Operating Income / Interest Expense
        if ie_v and ie_v != 0 and o is not None:
            by_yr_ie  = {dp["year"]: dp["value"] for dp in ie}
            by_yr_op2 = {dp["year"]: dp["value"] for dp in op}
            common_ie = sorted(set(by_yr_ie) & set(by_yr_op2))
            if common_ie:
                yr_ie = common_ie[-1]
                ie_aligned = by_yr_ie[yr_ie]
                op_aligned = by_yr_op2[yr_ie]
                if ie_aligned and ie_aligned != 0:
                    m["interest_coverage"] = round(op_aligned / abs(ie_aligned), 1)

        # ── TTM overlay — supersede annual where quarterly is more current ──
        ttm      = facts.get("_ttm", {})
        ttm_thru = facts.get("_ttm_through", "")
        if ttm:
            m["ttm_available"] = True
            m["ttm_through"]   = ttm_thru
            # TTM revenue — replace annual revenue_latest if TTM is newer
            if "revenue" in ttm:
                ttm_rev = ttm["revenue"]
                m["revenue_ttm"] = ttm_rev
                # TTM growth vs last full-year revenue
                if r:
                    m["revenue_growth_ttm"] = round((ttm_rev - r) / abs(r) * 100, 1) if r else None
            # TTM income → TTM net margin
            if "net_income" in ttm and "revenue" in ttm and ttm["revenue"]:
                m["net_margin_ttm"] = round(ttm["net_income"] / ttm["revenue"] * 100, 1)
            if "operating_income" in ttm and "revenue" in ttm and ttm["revenue"]:
                m["operating_margin_ttm"] = round(ttm["operating_income"] / ttm["revenue"] * 100, 1)
            if "gross_profit" in ttm and "revenue" in ttm and ttm["revenue"]:
                m["gross_margin_ttm"] = round(ttm["gross_profit"] / ttm["revenue"] * 100, 1)
            # TTM FCF
            if "operating_cash_flow" in ttm and "capex" in ttm:
                ttm_fcf = ttm["operating_cash_flow"] - abs(ttm["capex"])
                m["free_cash_flow_ttm"] = ttm_fcf
                if "revenue" in ttm and ttm["revenue"]:
                    m["fcf_margin_ttm"] = round(ttm_fcf / ttm["revenue"] * 100, 1)

        return {k: v for k, v in m.items() if v is not None}

    def _compute_yearly_trends(self, facts: dict) -> str:
        """
        Build a year-by-year table of key metrics — computed entirely in Python.
        This is passed to the LLM as locked ground-truth data it must not contradict.
        """
        def s(key):
            d = facts.get(key)
            return sorted(d, key=lambda x: x["year"]) if isinstance(d, list) and d else []

        rev  = s("revenue")
        inc  = s("net_income")
        gp   = s("gross_profit")
        op   = s("operating_income")
        ocf  = s("operating_cash_flow")
        cx   = s("capex")
        eps  = s("eps_diluted") or s("eps_basic")

        # Detect duplicate values (data quality flag)
        def has_duplicates(series):
            vals = [d["value"] for d in series]
            return len(set(vals)) < len(vals) and len(vals) > 1

        warnings = []
        if has_duplicates(rev):
            warnings.append("⚠ WARNING: Revenue series contains duplicate values across years — possible XBRL tagging issue. Use YoY% figures cautiously.")

        # Build FCF series
        fcf_by_year = {}
        ocf_by_yr = {d["year"]: d["value"] for d in ocf}
        cx_by_yr  = {d["year"]: d["value"] for d in cx}
        for yr in set(ocf_by_yr) & set(cx_by_yr):
            fcf_by_year[yr] = ocf_by_yr[yr] - abs(cx_by_yr[yr])

        def pct_change(a, b):
            if a and a != 0:
                return f"{((b - a) / abs(a) * 100):+.1f}%"
            return "N/A"

        fv = self._fv

        # Year-by-year revenue table
        lines = ["=== PYTHON-COMPUTED YEAR-BY-YEAR FACTS (ground truth — LLM must not contradict) ==="]
        if warnings:
            lines += warnings

        lines.append("\nREVENUE by fiscal year:")
        for i, d in enumerate(rev):
            yr, val = d["year"], d["value"]
            chg = pct_change(rev[i-1]["value"], val) if i > 0 else "base"
            lines.append(f"  FY{yr}: {fv(val)}  (YoY: {chg})")

        lines.append("\nNET INCOME by fiscal year:")
        inc_by_yr = {d["year"]: d["value"] for d in inc}
        rev_by_yr = {d["year"]: d["value"] for d in rev}
        for i, d in enumerate(inc):
            yr, val = d["year"], d["value"]
            chg = pct_change(inc[i-1]["value"], val) if i > 0 else "base"
            margin = f" | net margin: {val/rev_by_yr[yr]*100:.1f}%" if yr in rev_by_yr and rev_by_yr[yr] else ""
            lines.append(f"  FY{yr}: {fv(val)}  (YoY: {chg}{margin})")

        lines.append("\nGROSS MARGIN by fiscal year:")
        gp_by_yr = {d["year"]: d["value"] for d in gp}
        for yr in sorted(set(gp_by_yr) & set(rev_by_yr)):
            if rev_by_yr[yr]:
                lines.append(f"  FY{yr}: {gp_by_yr[yr]/rev_by_yr[yr]*100:.1f}%")

        lines.append("\nOPERATING MARGIN by fiscal year:")
        op_by_yr = {d["year"]: d["value"] for d in op}
        for yr in sorted(set(op_by_yr) & set(rev_by_yr)):
            if rev_by_yr[yr]:
                lines.append(f"  FY{yr}: {op_by_yr[yr]/rev_by_yr[yr]*100:.1f}%")

        lines.append("\nFREE CASH FLOW by fiscal year:")
        for yr in sorted(fcf_by_year):
            val = fcf_by_year[yr]
            margin = f" | FCF margin: {val/rev_by_yr[yr]*100:.1f}%" if yr in rev_by_yr and rev_by_yr[yr] else ""
            lines.append(f"  FY{yr}: {fv(val)}{margin}")

        if eps:
            lines.append("\nEPS (diluted) by fiscal year:")
            for i, d in enumerate(eps):
                yr, val = d["year"], d["value"]
                chg = pct_change(eps[i-1]["value"], val) if i > 0 else "base"
                lines.append(f"  FY{yr}: ${val:.2f}  (YoY: {chg})")

        # Scoring hints based purely on Python math
        lines.append("\n=== PYTHON SCORING CONSTRAINTS (enforce these — do not override) ===")

        if rev and len(rev) >= 2:
            recent_yoy = (rev[-1]["value"] - rev[-2]["value"]) / abs(rev[-2]["value"]) * 100 if rev[-2]["value"] else 0
            if recent_yoy < 0:
                lines.append(f"REVENUE DECLINING ({recent_yoy:+.1f}% YoY) — revenue_growth sub-score MUST be ≤ 8/20")
            elif recent_yoy < 3:
                lines.append(f"REVENUE FLAT ({recent_yoy:+.1f}% YoY) — revenue_growth sub-score MUST be ≤ 12/20")
            elif recent_yoy < 8:
                lines.append(f"REVENUE MODERATE GROWTH ({recent_yoy:+.1f}% YoY) — revenue_growth sub-score MUST be ≤ 15/20")

        # Check for margin compression over last 3 years
        if len(inc) >= 3 and len(rev) >= 3:
            margins = []
            for d in inc[-3:]:
                yr = d["year"]
                if yr in rev_by_yr and rev_by_yr[yr]:
                    margins.append(d["value"] / rev_by_yr[yr] * 100)
            if len(margins) == 3 and margins[-1] < margins[0]:
                lines.append(f"NET MARGIN COMPRESSION over 3 years ({margins[0]:.1f}% → {margins[-1]:.1f}%) — profitability sub-score MUST be ≤ 13/20")

        # Check 3-yr revenue CAGR
        if len(rev) >= 4:
            base = rev[-4]["value"]
            curr = rev[-1]["value"]
            if base and base > 0:
                cagr = ((curr / base) ** (1/3) - 1) * 100
                if cagr < 2:
                    lines.append(f"3-YEAR REVENUE CAGR is {cagr:.1f}% (near-zero) — overall rating MUST be ≤ 72")
                elif cagr < 5:
                    lines.append(f"3-YEAR REVENUE CAGR is {cagr:.1f}% (low) — overall rating MUST be ≤ 80")

        return "\n".join(lines)

    def _metrics_str(self, computed: dict) -> str:
        fv = self._fv
        lines = [
            f"Data covers fiscal years: {computed.get('data_years', 'unknown')}",
            f"Latest Annual Revenue: {fv(computed.get('revenue_latest'))} (FY{computed.get('revenue_year','?')})",
            f"Revenue Growth YoY: {computed.get('revenue_growth_yoy', 'N/A')}%",
            f"Revenue 3-yr CAGR: {computed.get('revenue_cagr_3yr', 'N/A')}%",
            f"Net Margin (annual): {computed.get('net_margin', 'N/A')}%",
            f"Operating Margin (annual): {computed.get('operating_margin', 'N/A')}%",
            f"Gross Margin (annual): {computed.get('gross_margin', 'N/A')}%",
            f"Debt/Equity: {computed.get('debt_to_equity', 'N/A')}",
            f"Current Ratio: {computed.get('current_ratio', 'N/A')}",
            f"Return on Equity: {computed.get('roe', 'N/A')}%",
            f"Return on Assets: {computed.get('roa', 'N/A')}%",
            f"Free Cash Flow Margin: {computed.get('fcf_margin', 'N/A')}%",
            f"EPS Growth YoY: {computed.get('eps_growth_yoy', 'N/A')}%",
            f"Latest EPS: {computed.get('eps_latest', 'N/A')}",
        ]
        base = "\n".join(l for l in lines if "N/A" not in l or "Data covers" in l)

        # TTM block — appears prominently so LLM treats it as the most current data
        ttm_thru = computed.get("ttm_through", "")
        ttm_lines = []
        if computed.get("ttm_available"):
            through = f" (most recent quarter ending {ttm_thru})" if ttm_thru else ""
            ttm_lines.append(f"\nTTM METRICS — TRAILING TWELVE MONTHS{through}:")
            if "revenue_ttm" in computed:
                ttm_lines.append(f"  Revenue TTM: {fv(computed['revenue_ttm'])}")
            if "revenue_growth_ttm" in computed:
                ttm_lines.append(f"  Revenue TTM vs Last Annual: {computed['revenue_growth_ttm']:+.1f}%")
            if "net_margin_ttm" in computed:
                ttm_lines.append(f"  Net Margin TTM: {computed['net_margin_ttm']:.1f}%")
            if "operating_margin_ttm" in computed:
                ttm_lines.append(f"  Operating Margin TTM: {computed['operating_margin_ttm']:.1f}%")
            if "gross_margin_ttm" in computed:
                ttm_lines.append(f"  Gross Margin TTM: {computed['gross_margin_ttm']:.1f}%")
            if "fcf_margin_ttm" in computed:
                ttm_lines.append(f"  FCF Margin TTM: {computed['fcf_margin_ttm']:.1f}%")
            if "free_cash_flow_ttm" in computed:
                ttm_lines.append(f"  Free Cash Flow TTM: {fv(computed['free_cash_flow_ttm'])}")

        return base + "\n".join(ttm_lines)

    # ── risk models ──────────────────────────────────────────────────

    def _compute_altman_z(self, facts: dict) -> dict | None:
        """
        Altman Z-Score (book-value variant) computed from SEC XBRL data.
        Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
        Uses book value of equity for X4 (no market cap available from XBRL).
        Safe >2.99 | Grey 1.81–2.99 | Distress <1.81
        """
        def by_yr(key):
            d = facts.get(key)
            return {dp["year"]: dp["value"] for dp in d} if isinstance(d, list) and d else {}

        ca = by_yr("current_assets");   cl = by_yr("current_liabilities")
        ta = by_yr("total_assets");     re = by_yr("retained_earnings")
        op = by_yr("operating_income"); eq = by_yr("total_equity")
        tl = by_yr("total_liabilities");rv = by_yr("revenue")

        common = set(ca) & set(cl) & set(ta) & set(op) & set(eq) & set(tl) & set(rv)
        if not common:
            return None
        yr = max(common)

        try:
            ta_v = ta[yr]
            if not ta_v:
                return None
            x1 = (ca[yr] - cl[yr]) / ta_v
            x2 = re[yr]   / ta_v if yr in re else None
            x3 = op[yr]   / ta_v
            x4 = eq[yr]   / tl[yr] if yr in tl and tl[yr] else None
            x5 = rv[yr]   / ta_v

            if x4 is None:
                return None

            if x2 is not None:
                z = 1.2*x1 + 1.4*x2 + 3.3*x3 + 0.6*x4 + 1.0*x5
                model = "5-factor"
            else:
                z = 1.2*x1 + 3.3*x3 + 0.6*x4 + 1.0*x5
                model = "4-factor (retained earnings unavailable)"

            zone = "Safe" if z > 2.99 else "Grey Zone" if z > 1.81 else "Distress"

            comp = {
                "X1_working_capital_ratio": round(x1, 3),
                "X3_ebit_to_assets":        round(x3, 3),
                "X4_equity_to_liabilities": round(x4, 3),
                "X5_asset_turnover":        round(x5, 3),
            }
            if x2 is not None:
                comp["X2_retained_earnings_ratio"] = round(x2, 3)

            return {
                "score": round(z, 2),
                "zone":  zone,
                "components": comp,
                "data_year": yr,
                "model": model,
                "thresholds": "Safe >2.99 | Grey 1.81–2.99 | Distress <1.81",
            }
        except Exception:
            return None

    def _compute_beneish_m(self, facts: dict) -> dict | None:
        """
        Beneish M-Score (5-variable simplified model).
        Flags statistical probability of earnings manipulation.
        Requires two consecutive years of XBRL data.
        Low Risk <-2.22 | Grey -2.22 to -1.78 | High Risk >-1.78
        """
        def by_yr(key):
            d = facts.get(key)
            return {dp["year"]: dp["value"] for dp in d} if isinstance(d, list) and d else {}

        rv  = by_yr("revenue");          gp  = by_yr("gross_profit")
        ta  = by_yr("total_assets");     ca  = by_yr("current_assets")
        ppe = by_yr("property_plant_equipment")
        da  = by_yr("depreciation_amortization")
        ar  = by_yr("accounts_receivable")

        # Find latest year that has a prior year in revenue
        pairs = [(y, y-1) for y in sorted(rv, reverse=True) if (y-1) in rv and y in ta and (y-1) in ta]
        if not pairs:
            return None
        yr, yr_p = pairs[0]

        try:
            comp = {}

            # DSRI – Days Sales Receivable Index
            if yr in ar and yr_p in ar and rv.get(yr) and rv.get(yr_p):
                dsri = (ar[yr] / rv[yr]) / (ar[yr_p] / rv[yr_p])
                comp["DSRI"] = round(dsri, 3)

            # GMI – Gross Margin Index
            if yr in gp and yr_p in gp and rv.get(yr) and rv.get(yr_p):
                gm_t = gp[yr]  / rv[yr]
                gm_p = gp[yr_p] / rv[yr_p]
                if gm_t:
                    comp["GMI"] = round(gm_p / gm_t, 3)

            # AQI – Asset Quality Index
            if yr in ppe and yr_p in ppe and ta.get(yr) and ta.get(yr_p):
                aq_t = (ta[yr]  - ca.get(yr,  0) - ppe[yr])  / ta[yr]
                aq_p = (ta[yr_p] - ca.get(yr_p, 0) - ppe[yr_p]) / ta[yr_p]
                if aq_p:
                    comp["AQI"] = round(aq_t / aq_p, 3)

            # SGI – Sales Growth Index
            if rv.get(yr_p):
                comp["SGI"] = round(rv[yr] / rv[yr_p], 3)

            # DEPI – Depreciation Index
            if yr in da and yr_p in da and yr in ppe and yr_p in ppe:
                denom_t = da[yr]  + ppe[yr]
                denom_p = da[yr_p] + ppe[yr_p]
                if denom_t and denom_p:
                    depi = (da[yr_p] / denom_p) / (da[yr] / denom_t)
                    comp["DEPI"] = round(depi, 3)

            if len(comp) < 3:
                return None  # insufficient data

            weights = {"DSRI": 0.823, "GMI": 0.906, "AQI": 0.593, "SGI": 0.717, "DEPI": 0.107}
            m = -6.065 + sum(weights[k] * v for k, v in comp.items() if k in weights)

            risk = ("High Risk of Manipulation" if m > -1.78
                    else "Grey Zone" if m > -2.22
                    else "Low Risk of Manipulation")

            return {
                "score": round(m, 2),
                "risk_level": risk,
                "components": comp,
                "components_used": list(comp.keys()),
                "data_year": yr,
                "thresholds": "Low Risk <-2.22 | Grey -2.22 to -1.78 | High Risk >-1.78",
            }
        except Exception:
            return None

    def analyze_risk_signals(self, altman: dict, beneish: dict,
                             computed: dict, company: str, ticker: str) -> str:
        """LLM interprets Altman Z and Beneish M scores in company-specific context."""
        parts = []
        if altman:
            parts.append(
                f"Altman Z-Score: {altman['score']} | Zone: {altman['zone']} "
                f"({altman['thresholds']}) | Components: {altman['components']}"
            )
        if beneish:
            parts.append(
                f"Beneish M-Score: {beneish['score']} | Risk: {beneish['risk_level']} "
                f"({beneish['thresholds']}) | Components: {beneish['components']}"
            )
        fv = self._fv
        ctx = [f"{lbl}: {fv(computed[k])}" for k, lbl in [
            ("revenue_latest","Revenue"), ("ebitda","EBITDA"),
            ("free_cash_flow","FCF"), ("debt_to_equity","D/E"),
            ("current_ratio","Current Ratio"), ("net_margin","Net Margin"),
        ] if k in computed]

        prompt = (
            f"Interpret these risk model results for {company} ({ticker}).\n\n"
            "MATHEMATICALLY COMPUTED SCORES (from SEC XBRL data):\n"
            + "\n".join(parts) + "\n\n"
            "FINANCIAL CONTEXT:\n" + " | ".join(ctx) + "\n\n"
            "Write 3-4 sentences interpreting what these scores mean specifically for this company. "
            "Reference the exact score numbers. Explain bankruptcy risk (Z-Score) and earnings quality "
            "(M-Score) implications. Be direct — institutional analyst tone. "
            "Do NOT use any numbers not listed above."
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content":
                     "You are a quantitative risk analyst. Be precise, cite exact numbers, and be direct."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=280,
            )
            return resp.choices[0].message.content.strip()
        except Exception:
            return ""

    def analyze_management_tone(self, sections: dict, ticker: str, company: str) -> dict | None:
        """
        Detect MD&A language drift across multiple years.
        Identifies tone shifts, new risk themes, and language changes
        that precede fundamental deterioration.
        """
        mda_by_year: dict[str, str] = {}
        for k, v in sections.items():
            if "mda" not in k.lower() or not v:
                continue
            label = "latest" if k == "mda" else k.rsplit("_", 1)[-1]
            mda_by_year[label] = v[:2000]

        if len(mda_by_year) < 2:
            return None

        mda_block = "\n\n".join(
            f"=== MD&A {yr.upper()} ===\n{text}"
            for yr, text in sorted(mda_by_year.items(), reverse=True)
        )

        prompt = (
            f"Analyze management tone CHANGES across {len(mda_by_year)} years of "
            f"{company} ({ticker}) MD&A sections.\n\n"
            f"{mda_block}\n\n"
            "Return JSON with EXACTLY these keys:\n"
            '{"trend": <"Improving"|"Stable"|"Cautious"|"Deteriorating">, '
            '"trend_score": <integer -3 to 3>, '
            '"notable_changes": [<up to 3 specific language shifts, each stating which year and exact phrasing changed>], '
            '"new_risk_themes": [<up to 3 new risks in the latest year not present in prior years>], '
            '"recurring_strengths": [<up to 2 consistent positive themes across all years>], '
            '"ai_analysis": <2-3 sentences on what the tone evolution signals about management confidence and forward outlook>}'
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content":
                     "Expert in corporate communication analysis. Focus on specific language changes, not summaries."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
                max_tokens=350,
            )
            result = json.loads(resp.choices[0].message.content)
            result["years_analyzed"] = len(mda_by_year)
            return result
        except Exception:
            return None

    # ── analysis ─────────────────────────────────────────────────────

    def analyze_comprehensive(self, data: dict, ticker: str) -> dict:
        info     = data.get("company_info", {})
        company  = info.get("name", ticker)
        industry = info.get("sicDescription", "")
        sic      = str(info.get("sic", ""))
        facts    = data.get("financial_facts", {})
        sections = data.get("filing_sections", {})
        filings  = data.get("filings", [])
        pf       = data.get("primary_filing", {})
        sector   = _detect_sector(sic, industry)

        computed     = self._compute_metrics(facts)
        fin_str      = self._fmt_facts(facts)
        metrics_str  = self._metrics_str(computed)
        trends_str   = self._compute_yearly_trends(facts)

        earliest = computed.get("earliest_year", "N/A")
        latest   = computed.get("latest_year",   "N/A")

        filing_list = ", ".join(f"{f['form_type']} ({f['filed_date']})" for f in filings[:14])
        pf_label    = f"{pf.get('form_type','N/A')} filed {pf.get('filed_date','N/A')}"

        # Build sections string from all available filing types.
        # Priority: 10-K latest → 10-K prior years → 10-Q → 8-K events → proxy.
        ANNUAL_KEYS = {"business", "risk_factors", "mda", "financial_statements"}

        def _section_label_and_limit(k: str) -> tuple:
            kl = k.lower()
            if kl.startswith("8k_"):
                date_part = kl[3:13].rstrip("_0123456789").strip("_")
                return f"8-K MATERIAL EVENT ({date_part})", 1_800
            if "10q" in kl:
                base = kl.split("_10q")[0].upper().replace("_", " ")
                period = kl.rsplit("_", 1)[-1] if "_" in kl.rsplit("10q", 1)[-1] else ""
                return f"10-Q {base} ({period})", 2_500
            if "proxy" in kl:
                return "DEF 14A — EXECUTIVE COMPENSATION & GOVERNANCE", 2_500
            if kl.startswith("sc13_"):
                # e.g. "sc13_SC13D_2024-10-01"
                parts = kl.split("_")
                form  = parts[1].upper() if len(parts) > 1 else "SC 13D/G"
                dated = parts[2] if len(parts) > 2 else ""
                return f"{form} — MAJOR SHAREHOLDER FILING ({dated})", 2_000
            if kl.startswith("offering_"):
                parts = kl.split("_")
                form  = parts[1].upper() if len(parts) > 1 else "OFFERING"
                dated = parts[2] if len(parts) > 2 else ""
                return f"{form} — EQUITY OFFERING / DILUTION RISK ({dated})", 2_000
            if kl in ANNUAL_KEYS:
                return f"{k.upper().replace('_', ' ')} (10-K LATEST)", 3_500
            for yr in range(2018, 2028):
                if kl.endswith(f"_{yr}"):
                    base = kl.rsplit(f"_{yr}", 1)[0].upper().replace("_", " ")
                    return f"{base} (10-K {yr})", 2_000
            return k.upper().replace("_", " "), 1_500

        def _section_priority(k: str) -> int:
            kl = k.lower()
            if kl in ANNUAL_KEYS:                                        return 0
            if any(kl.endswith(f"_{y}") for y in range(2018, 2028)):    return 1
            if "10q" in kl:                                              return 2
            if kl.startswith("8k_"):                                     return 3
            if "proxy" in kl:                                            return 4
            if kl.startswith("sc13_"):                                   return 5
            if kl.startswith("offering_"):                               return 6
            return 7

        text_parts = []
        for k, v in sections.items():
            if not v:
                continue
            label, limit = _section_label_and_limit(k)
            text_parts.append((_section_priority(k), f"=== {label} ===\n{v[:limit]}"))
        text_parts.sort(key=lambda x: x[0])
        sections_str = "\n\n".join(t for _, t in text_parts[:8])

        ttm_thru   = facts.get("_ttm_through", "")
        ttm_notice = (f"NOTE: TTM data is available through {ttm_thru} — "
                      "prefer TTM figures over annual for current-state assessment."
                      if ttm_thru else "")

        prompt = f"""Analyze {company} ({ticker}) — {industry}.

SECTOR: {sector['name']}
SECTOR-APPROPRIATE VALUATION: {sector['valuation']}
SECTOR SCORING NOTES: {sector['scoring_notes']}
SECTOR RED FLAGS TO WATCH: {sector['red_flags']}
KEY METRICS FOR THIS SECTOR: {sector['key_metrics']}

{ttm_notice}

FILINGS: {filing_list}
PRIMARY: {pf_label}

PYTHON-COMPUTED YEAR-BY-YEAR TRENDS (ground truth — highest priority):
{trends_str}

SUMMARY METRICS (FY{earliest}–FY{latest}, including TTM where available):
{metrics_str}

RAW XBRL DATA (use if not in TRENDS above):
{fin_str}

SEC FILING TEXT (10-K annual, 10-Q quarterly, 8-K events, DEF 14A proxy — qualitative context; do NOT extract dollar figures from here):
{sections_str[:8000]}

REQUIREMENTS:
1. Discuss every fiscal year FY{earliest}–FY{latest} with specific figures. If TTM is available, also comment on the TTM trend vs the last full year.
2. Apply SECTOR-APPROPRIATE valuation and metrics from the SECTOR block above — not generic P/E if this is an energy or bank name.
3. red_flags must be non-empty if any metric deteriorated over any 2-year stretch.
4. Only cite numbers from XBRL DATA or VERIFIED METRICS above.
5. If the FILINGS list contains NT 10-K or NT 10-Q → flag as late-filing red flag.
6. If the FILINGS list contains 10-K/A or 10-Q/A → flag as restatement red flag.
7. If SC 13D or offering sections are present → address activist/dilution implications.
8. Write like an investor writing for investors — tell the story of this business, not just a list of numbers. Explain WHY the numbers moved the way they did.

Return a single JSON object with EXACTLY these keys:
{{
  "company_name": "<full legal company name>",
  "rating_score": <integer 0-100>,
  "rating_verdict": <"Strong Buy"|"Buy"|"Hold"|"Sell"|"Strong Sell">,
  "confidence": <"High"|"Medium"|"Low">,
  "sub_scores": {{
    "revenue_growth": <integer 0-20>,
    "profitability": <integer 0-20>,
    "balance_sheet": <integer 0-20>,
    "earnings_quality": <integer 0-15>,
    "outlook": <integer 0-15>,
    "risk_profile": <integer 0-10>
  }},
  "investment_thesis": "<2-3 sentences: the core reason to own or avoid this stock — state the thesis plainly (e.g. 'X is a dominant franchise with durable pricing power and accelerating FCF — the case for owning it is straightforward' OR 'X is a structurally declining business burning cash — avoid until management demonstrates a credible path to profitability'). Ground every claim in the multi-year data.>",
  "trend_summary": "<one sentence per year FY{earliest}–FY{latest}: key metric + direction, e.g. 'FY2021: revenue $Xbn, margins expanding; FY2022: ...'>",
  "summary": "<3 sentences: (1) what this business does, what market it serves, and what drives its revenue; (2) the multi-year financial trajectory in plain English with the most important number — e.g. revenue grew from $X in FY{earliest} to $X in FY{latest} but net margin compressed from X% to X%; (3) the single most important thing an investor deciding whether to buy today must understand>",
  "justification": "<4-5 paragraphs telling the investment story: P1=narrate what drove this business across FY{earliest}–FY{latest} — what tailwinds or headwinds shaped performance, cite revenue and income each year; P2=financial quality — are the margins genuine and expanding or being squeezed, does FCF confirm reported earnings, does the debt load threaten or amplify the thesis; P3=competitive position — why do customers choose this company over alternatives, what is the moat (brand, switching costs, network effects, cost advantage), and what threatens it; P4=the honest bull case vs. the bear case — what specific things must go right for the bull case to play out, and what realistic scenario justifies selling; P5=what concrete triggers — specific metric thresholds, product cycles, macro events — would upgrade or downgrade this rating>",
  "positives": ["<strength with year+figure>", "<strength>", "<strength>"],
  "risks": ["<risk with year+figure>", "<risk>", "<risk>"],
  "red_flags": ["<deteriorating metric with years, e.g. gross margin fell X% FY2021→FY2023>"],
  "outlook": "<2 sentences: what the trend trajectory — not just the last data point — implies for this business over the next 12-24 months, and what a meaningful inflection would look like>"
}}"""

        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
                max_tokens=3500,
            )
            result = json.loads(resp.choices[0].message.content)
            result["filings_analyzed"] = filings
            result["_computed"]        = computed
            result["sector_framework"] = sector["name"]

            # ── Altman Z-Score + Beneish M-Score (pure math, no LLM for numbers) ──
            altman  = self._compute_altman_z(facts)
            beneish = self._compute_beneish_m(facts)
            if altman or beneish:
                try:
                    risk_ai = self.analyze_risk_signals(
                        altman or {}, beneish or {}, computed, company, ticker
                    )
                except Exception:
                    risk_ai = ""
                result["risk_signals"] = {
                    "altman_z":          altman,
                    "beneish_m":         beneish,
                    "ai_interpretation": risk_ai,
                }

            # ── MD&A Sentiment Drift ──────────────────────────────────────────────
            try:
                tone = self.analyze_management_tone(sections, ticker, company)
                if tone:
                    result["management_tone"] = tone
            except Exception:
                pass

            return result
        except Exception as e:
            # Always preserve _computed so verified_metrics still render
            # even when the LLM call fails or returns malformed JSON.
            return {"error": str(e), "_computed": computed}

    def analyze_filing(self, text: str, form: str, ticker: str, facts: dict | None = None) -> dict:
        facts_block = self._fmt_facts(facts) if facts else "Not available — use N/A for all financial metrics."
        computed_block = self._metrics_str(self._compute_metrics(facts)) if facts else ""
        prompt = (
            f"Analyze this {form} SEC filing for {ticker}.\n\n"
            "XBRL FINANCIAL DATA (machine-readable, authoritative — use ONLY these numbers):\n"
            f"{facts_block}\n\n"
            + (f"VERIFIED COMPUTED METRICS:\n{computed_block}\n\n" if computed_block else "")
            + "QUALITATIVE FILING TEXT (context only — do NOT extract financial figures from this):\n"
            f"{text[:18000]}\n\n"
            "Return JSON with EXACTLY these keys:\n"
            "  filing_summary: 2-3 sentences — what this specific filing reveals about the business and "
            "  why it matters to an investor (not just what type of form it is).\n"
            "  key_findings: list of 3-5 bullet strings — the most important factual disclosures or "
            "  data points in this filing, each written as a complete sentence.\n"
            "  key_metrics: dict of metric_name:value — from XBRL DATA only; use N/A if not available.\n"
            "  risks: list of 2-4 specific risks explicitly disclosed or implied by this filing.\n"
            "  outlook: 2 sentences — what this filing tells investors about the near-term trajectory "
            "  and whether the business is on track, accelerating, or deteriorating.\n"
            "  red_flags: list of any warning signs found (late filing, restatements, going-concern "
            "  language, auditor changes, material weaknesses, sudden revenue/margin step-downs).\n"
            "  investment_implication: 1-2 sentences — net impact of this filing on the investment "
            "  thesis: is it a positive, negative, or neutral datapoint and why?\n"
            "key_metrics values must come exclusively from the XBRL DATA block above."
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            return {"error": str(e)}

    def query_comprehensive(self, fin_str: str, sections_str: str,
                            computed_str: str, ticker: str, company: str, question: str) -> str:
        prompt = (
            f"You are analyzing {company} ({ticker}).\n\n"
            f"VERIFIED METRICS:\n{computed_str}\n\n"
            f"MULTI-YEAR FINANCIAL DATA:\n{fin_str}\n\n"
            f"FILING CONTENT:\n{sections_str[:12000]}\n\n"
            f"Question: {question}\n\n"
            "Answer with specific numbers from the data above. Do not invent any figure."
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.2,
            )
            return resp.choices[0].message.content
        except Exception as e:
            return f"Error: {e}"

    def query_filing(self, text: str, form: str, ticker: str, question: str,
                     facts: dict | None = None) -> str:
        facts_block = self._fmt_facts(facts) if facts else "Not available."
        computed_block = self._metrics_str(self._compute_metrics(facts)) if facts else ""
        prompt = (
            f"You have the {form} SEC filing for {ticker}.\n\n"
            "XBRL FINANCIAL DATA (authoritative source — use ONLY these numbers for any financial figures):\n"
            f"{facts_block}\n\n"
            + (f"VERIFIED COMPUTED METRICS:\n{computed_block}\n\n" if computed_block else "")
            + "QUALITATIVE FILING TEXT (context only — do NOT extract financial figures from this):\n"
            f"{text[:16000]}\n\n"
            f"Question: {question}\n\n"
            "Answer using XBRL data for any numbers. If the metric is not in the XBRL data, say N/A."
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.2,
            )
            return resp.choices[0].message.content
        except Exception as e:
            return f"Error: {e}"
