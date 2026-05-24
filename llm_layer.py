import os, json, glob
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


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
    knowledge = _load_knowledge()
    base = (
        "You are a brutally honest, senior Wall Street equity analyst with 20+ years of experience. "
        "Your job is to protect investors from bad investments, not to sell them on stocks.\n\n"

        "DATA RULES (strictly enforced):\n"
        "- Use ONLY numbers from the XBRL DATA or VERIFIED METRICS blocks. Never invent or estimate figures.\n"
        "- Filing text (MD&A, Risk Factors) is qualitative context ONLY — never extract dollar amounts from it.\n"
        "- If a metric is missing, write N/A. Do not fabricate.\n\n"

        "ANALYSIS RULES:\n"
        "- You MUST analyze the FULL multi-year trend, not just the most recent year. "
        "A single good year after years of decline is NOT a recovery — call it out.\n"
        "- Always cite the specific fiscal year for every number (e.g. FY2022, FY2023, FY2024).\n"
        "- Look for deteriorating trends: margin compression, slowing growth, rising debt, FCF decline.\n"
        "- Be skeptical of one-time items, accounting changes, or sudden reversals.\n"
        "- A 'Buy' rating (70+) requires strong evidence across MULTIPLE years — not just the latest.\n"
        "- If trends are mixed or deteriorating, default to 'Hold' (50-69) or lower.\n"
        "- Red flags must be specific: name the year, the metric, and the direction of change.\n\n"

        "SCORING GUIDE (be conservative):\n"
        "- 85-100 Strong Buy: consistent multi-year revenue+margin growth, strong FCF, low debt\n"
        "- 70-84 Buy: solid fundamentals with minor concerns, positive trend over 3+ years\n"
        "- 50-69 Hold: mixed signals, flat/slowing growth, margin pressure, or high debt\n"
        "- 30-49 Sell: declining revenue or margins, weak FCF, rising debt load\n"
        "- 0-29 Strong Sell: multiple years of deterioration, existential risks\n"
    )
    if knowledge:
        base += f"\n\nANALYSIS KNOWLEDGE BASE:\n{knowledge}"
    return base


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
            f"Latest Revenue: {fv(computed.get('revenue_latest'))} (FY{computed.get('revenue_year','?')})",
            f"Revenue Growth YoY: {computed.get('revenue_growth_yoy', 'N/A')}%",
            f"Revenue 3-yr CAGR: {computed.get('revenue_cagr_3yr', 'N/A')}%",
            f"Net Margin: {computed.get('net_margin', 'N/A')}%",
            f"Operating Margin: {computed.get('operating_margin', 'N/A')}%",
            f"Gross Margin: {computed.get('gross_margin', 'N/A')}%",
            f"Debt/Equity: {computed.get('debt_to_equity', 'N/A')}",
            f"Current Ratio: {computed.get('current_ratio', 'N/A')}",
            f"Return on Equity: {computed.get('roe', 'N/A')}%",
            f"Return on Assets: {computed.get('roa', 'N/A')}%",
            f"Free Cash Flow Margin: {computed.get('fcf_margin', 'N/A')}%",
            f"EPS Growth YoY: {computed.get('eps_growth_yoy', 'N/A')}%",
            f"Latest EPS: {computed.get('eps_latest', 'N/A')}",
        ]
        return "\n".join(l for l in lines if "N/A" not in l or "Data covers" in l)

    # ── analysis ─────────────────────────────────────────────────────

    def analyze_comprehensive(self, data: dict, ticker: str) -> dict:
        info     = data.get("company_info", {})
        company  = info.get("name", ticker)
        industry = info.get("sicDescription", "")
        facts    = data.get("financial_facts", {})
        sections = data.get("filing_sections", {})
        filings  = data.get("filings", [])
        pf       = data.get("primary_filing", {})

        computed     = self._compute_metrics(facts)
        fin_str      = self._fmt_facts(facts)
        metrics_str  = self._metrics_str(computed)
        trends_str   = self._compute_yearly_trends(facts)

        earliest = computed.get("earliest_year", "N/A")
        latest   = computed.get("latest_year",   "N/A")

        filing_list = ", ".join(f"{f['form_type']} ({f['filed_date']})" for f in filings[:8])
        pf_label    = f"{pf.get('form_type','N/A')} filed {pf.get('filed_date','N/A')}"

        # Include MD&A from multiple years for trend comparison
        QUALITATIVE_KEYS = {"business", "risk_factors", "mda"}
        text_parts = []
        for k, v in sections.items():
            base_key = k.split("_")[0] if "_20" in k else k
            if base_key not in QUALITATIVE_KEYS:
                continue
            label = k.upper().replace("_", " ")
            text_parts.append(f"=== {label} ===\n{v[:6000]}")
        sections_str = "\n\n".join(text_parts[:6])  # up to 6 sections (2 years × 3 sections)

        prompt = f"""Analyze {company} ({ticker}) — {industry}.

FILINGS AVAILABLE: {filing_list}
PRIMARY FILING: {pf_label}

PYTHON-COMPUTED YEAR-BY-YEAR TRENDS (mathematically exact — highest priority source):
{trends_str}

SUMMARY METRICS (FY{earliest}–FY{latest}):
{metrics_str}

RAW XBRL DATA (secondary reference — if it conflicts with TRENDS above, trust TRENDS):
{fin_str}

SEC FILING TEXT — MD&A AND RISK FACTORS (qualitative context only):
{sections_str[:16000]}

MANDATORY ANALYSIS REQUIREMENTS:
1. You MUST explicitly discuss EVERY fiscal year from FY{earliest} to FY{latest} — not just recent years.
2. Calculate and state year-over-year changes for revenue, margins, and FCF for each year.
3. Identify if the current year is better or worse than the 3-year average.
4. Call out any year where a key metric deteriorated — even if the most recent year looks good.
5. Compare MD&A tone across years if multiple years are provided — management optimism vs actual results.
6. red_flags must be non-empty if ANY metric deteriorated over ANY 2-year stretch in the data.
7. Only cite numbers from XBRL DATA or VERIFIED METRICS — never from training knowledge.

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
  "trend_summary": "<Year-by-year breakdown: state the key metric and direction for EACH year FY{earliest}–FY{latest}>",
  "summary": "<3-4 sentences covering the full multi-year picture. Include at least one concern even for strong companies.>",
  "justification": "<6-8 paragraphs. Para 1: revenue trend FY{earliest}–FY{latest} with every year's figure. Para 2: margin trajectory. Para 3: balance sheet evolution. Para 4: cash generation trend. Para 5: what MD&A language reveals. Para 6: key risks with specific data. Para 7: what would change the rating up or down.>",
  "positives": ["<strength with specific year+figure>", "<strength>", "<strength>", "<strength>"],
  "risks": ["<risk with year+figure>", "<risk>", "<risk>", "<risk>"],
  "red_flags": ["<specific deteriorating metric with years, e.g. 'Gross margin fell from X% in FY2021 to Y% in FY2023'>"],
  "outlook": "<2-3 sentences: what the trend implies for the next 12-24 months>"
}}

Rating: 85-100=Strong Buy, 70-84=Buy, 50-69=Hold, 30-49=Sell, 0-29=Strong Sell."""

        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
                max_tokens=4096,
            )
            result = json.loads(resp.choices[0].message.content)
            result["filings_analyzed"] = filings
            result["_computed"]        = computed
            return result
        except Exception as e:
            return {"error": str(e)}

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
            "Return JSON with keys: summary, key_metrics, risks, outlook, red_flags.\n"
            "key_metrics must come exclusively from the XBRL DATA block above. "
            "If a metric has no XBRL entry, write \"N/A\"."
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
