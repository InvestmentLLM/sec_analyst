"""
market_data.py — live market price + valuation metrics via yfinance.

Cached in-process (1-hour TTL) so repeated calls within a session
are free.  All public — no API key needed.
"""

import time
from typing import Optional
import yfinance as yf

# ── In-process price cache (ticker → {data, fetched_at}) ────────────────────
_cache: dict = {}
_CACHE_TTL   = 3600   # 1 hour


# ── Sector median multiples for cheap/fair/expensive verdict ─────────────────
# Approximate trailing-twelve-month medians for large-cap US names.
# Used to contextualise a single stock's multiples.

SECTOR_MEDIANS: dict[str, dict] = {
    "energy":      {"pe": 12,  "ev_ebitda": 6,  "p_fcf": 12, "p_sales": 1.5, "pb": 1.8},
    "banks":       {"pe": 11,  "ev_ebitda": 9,  "p_fcf": 14, "p_sales": 3.0, "pb": 1.3},
    "reit":        {"pe": 35,  "ev_ebitda": 18, "p_fcf": 22, "p_sales": 8.0, "pb": 2.1},
    "tech":        {"pe": 28,  "ev_ebitda": 22, "p_fcf": 30, "p_sales": 6.0, "pb": 7.0},
    "healthcare":  {"pe": 20,  "ev_ebitda": 14, "p_fcf": 24, "p_sales": 3.0, "pb": 4.0},
    "retail":      {"pe": 18,  "ev_ebitda": 10, "p_fcf": 16, "p_sales": 0.8, "pb": 4.5},
    "industrials": {"pe": 20,  "ev_ebitda": 13, "p_fcf": 22, "p_sales": 2.0, "pb": 4.0},
    "utilities":   {"pe": 17,  "ev_ebitda": 10, "p_fcf": 18, "p_sales": 2.5, "pb": 1.7},
    "general":     {"pe": 18,  "ev_ebitda": 13, "p_fcf": 20, "p_sales": 2.5, "pb": 3.0},
}

# Map sector framework names → median key
_SECTOR_KEY: dict[str, str] = {
    "Energy / Oil & Gas":                       "energy",
    "Banking / Financial Services":             "banks",
    "Real Estate Investment Trust (REIT)":      "reit",
    "Technology / Software":                    "tech",
    "Healthcare / Pharmaceuticals / Biotech":   "healthcare",
    "Retail / Consumer Discretionary":          "retail",
    "Industrials / Manufacturing / Defense":    "industrials",
    "Utilities":                                "utilities",
}


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if (f != f or abs(f) > 1e15) else f   # NaN / inf guard
    except Exception:
        return None


def get_market_data(ticker: str) -> dict:
    """
    Return a dict with price, valuation multiples, and analyst data.
    Cached for 1 hour per ticker.
    """
    t = ticker.upper()
    cached = _cache.get(t)
    if cached and time.time() - cached["fetched_at"] < _CACHE_TTL:
        return cached["data"]

    try:
        yft  = yf.Ticker(t)
        info = yft.info or {}
        fi   = yft.fast_info

        price      = _safe_float(getattr(fi, "last_price",  None) or info.get("currentPrice"))
        prev_close = _safe_float(getattr(fi, "previous_close", None) or info.get("previousClose"))
        mktcap     = _safe_float(getattr(fi, "market_cap",  None) or info.get("marketCap"))
        hi52       = _safe_float(getattr(fi, "year_high",   None) or info.get("fiftyTwoWeekHigh"))
        lo52       = _safe_float(getattr(fi, "year_low",    None) or info.get("fiftyTwoWeekLow"))

        change_pct = (
            round((price - prev_close) / prev_close * 100, 2)
            if price and prev_close and prev_close != 0 else None
        )

        # yfinance info keys
        pe_trailing  = _safe_float(info.get("trailingPE"))
        pe_forward   = _safe_float(info.get("forwardPE"))
        p_sales      = _safe_float(info.get("priceToSalesTrailing12Months"))
        p_book       = _safe_float(info.get("priceToBook"))
        ev_ebitda    = _safe_float(info.get("enterpriseToEbitda"))
        ev           = _safe_float(info.get("enterpriseValue"))
        div_yield    = _safe_float(info.get("dividendYield"))
        beta         = _safe_float(info.get("beta"))
        target_mean  = _safe_float(info.get("targetMeanPrice"))
        target_high  = _safe_float(info.get("targetHighPrice"))
        target_low   = _safe_float(info.get("targetLowPrice"))
        rec          = info.get("recommendationKey", "")
        analyst_cnt  = info.get("numberOfAnalystOpinions")
        shares_out   = _safe_float(getattr(fi, "shares", None) or info.get("sharesOutstanding"))
        short_pct    = _safe_float(info.get("shortPercentOfFloat"))

        # 52-week range position (0-100%)
        range_pct = None
        if hi52 and lo52 and hi52 != lo52 and price:
            range_pct = round((price - lo52) / (hi52 - lo52) * 100, 1)

        # Upside to analyst mean target
        upside_to_target = None
        if price and target_mean and price > 0:
            upside_to_target = round((target_mean - price) / price * 100, 1)

        data = {
            "ticker":            t,
            "price":             round(price, 2)    if price    else None,
            "change_pct":        change_pct,
            "market_cap":        round(mktcap)      if mktcap   else None,
            "enterprise_value":  round(ev)          if ev       else None,
            "shares_outstanding":round(shares_out)  if shares_out else None,
            "52w_high":          round(hi52, 2)     if hi52     else None,
            "52w_low":           round(lo52, 2)     if lo52     else None,
            "52w_range_pct":     range_pct,
            "pe_trailing":       round(pe_trailing, 1)  if pe_trailing  else None,
            "pe_forward":        round(pe_forward,  1)  if pe_forward   else None,
            "ev_ebitda":         round(ev_ebitda,   1)  if ev_ebitda    else None,
            "p_sales":           round(p_sales,     2)  if p_sales      else None,
            "p_book":            round(p_book,      2)  if p_book       else None,
            "dividend_yield":    round(div_yield * 100, 2) if div_yield else None,
            "beta":              round(beta, 2)     if beta      else None,
            "short_pct":         round(short_pct * 100, 1) if short_pct else None,
            "analyst_target_mean": round(target_mean, 2) if target_mean else None,
            "analyst_target_high": round(target_high, 2) if target_high else None,
            "analyst_target_low":  round(target_low,  2) if target_low  else None,
            "analyst_recommendation": rec.replace("-", " ").title() if rec else None,
            "analyst_count":     analyst_cnt,
            "upside_to_target":  upside_to_target,
        }

        _cache[t] = {"data": data, "fetched_at": time.time()}
        return data

    except Exception as e:
        return {"ticker": t, "error": str(e)}


def compute_valuation_verdict(
    market: dict,
    sector_framework_name: str,
    xbrl_fcf: float | None = None,
    xbrl_revenue: float | None = None,
) -> dict:
    """
    Compare a stock's current multiples against sector medians and
    return a cheap / fair / expensive verdict per multiple, plus an
    overall verdict and a one-sentence interpretation.
    """
    sector_key = _SECTOR_KEY.get(sector_framework_name, "general")
    medians    = SECTOR_MEDIANS.get(sector_key, SECTOR_MEDIANS["general"])

    mktcap = market.get("market_cap")
    price  = market.get("price")

    verdicts: dict[str, dict] = {}

    def _score(actual: float | None, median: float | None, lower_is_cheaper: bool = True):
        """Return (label, ratio) where ratio < 1 = cheaper than median."""
        if actual is None or median is None or median == 0:
            return None, None
        ratio = actual / median
        if lower_is_cheaper:
            if ratio < 0.75:   label = "Cheap"
            elif ratio < 1.25: label = "Fair"
            else:              label = "Expensive"
        else:
            if ratio > 1.25:   label = "Cheap"
            elif ratio > 0.75: label = "Fair"
            else:              label = "Expensive"
        return label, round(ratio, 2)

    pe = market.get("pe_trailing")
    lbl, ratio = _score(pe, medians.get("pe"))
    if lbl:
        verdicts["P/E"] = {"value": pe, "median": medians.get("pe"),
                           "verdict": lbl, "vs_median": ratio}

    ev_eb = market.get("ev_ebitda")
    lbl, ratio = _score(ev_eb, medians.get("ev_ebitda"))
    if lbl:
        verdicts["EV/EBITDA"] = {"value": ev_eb, "median": medians.get("ev_ebitda"),
                                  "verdict": lbl, "vs_median": ratio}

    ps = market.get("p_sales")
    lbl, ratio = _score(ps, medians.get("p_sales"))
    if lbl:
        verdicts["P/Sales"] = {"value": ps, "median": medians.get("p_sales"),
                                "verdict": lbl, "vs_median": ratio}

    pb = market.get("p_book")
    lbl, ratio = _score(pb, medians.get("pb"))
    if lbl:
        verdicts["P/Book"] = {"value": pb, "median": medians.get("pb"),
                               "verdict": lbl, "vs_median": ratio}

    # P/FCF from XBRL FCF + market cap (more accurate than yfinance)
    if mktcap and xbrl_fcf and xbrl_fcf > 0:
        p_fcf_xbrl = mktcap / xbrl_fcf
        lbl, ratio = _score(p_fcf_xbrl, medians.get("p_fcf"))
        if lbl:
            verdicts["P/FCF"] = {"value": round(p_fcf_xbrl, 1),
                                  "median": medians.get("p_fcf"),
                                  "verdict": lbl, "vs_median": ratio}

    # Overall verdict: majority vote across multiples
    labels = [v["verdict"] for v in verdicts.values()]
    cheap  = labels.count("Cheap")
    fair   = labels.count("Fair")
    exp    = labels.count("Expensive")
    if not labels:
        overall = "Insufficient Data"
    elif cheap > exp and cheap >= fair:
        overall = "Cheap"
    elif exp > cheap and exp >= fair:
        overall = "Expensive"
    else:
        overall = "Fair Value"

    # One-line interpretation
    upside = market.get("upside_to_target")
    rec    = market.get("analyst_recommendation", "")
    if overall == "Cheap":
        interp = f"Trading below sector medians on {cheap}/{len(labels)} multiples."
    elif overall == "Expensive":
        interp = f"Premium valuation — priced above sector medians on {exp}/{len(labels)} multiples."
    else:
        interp = f"Fairly valued relative to sector peers."
    if upside is not None:
        sign = "+" if upside >= 0 else ""
        interp += f" Analyst consensus: {sign}{upside:.1f}% to mean target."
    if rec:
        interp += f" Street rating: {rec}."

    return {
        "overall":        overall,
        "interpretation": interp,
        "multiples":      verdicts,
        "sector_medians": medians,
        "sector_used":    sector_key,
    }
