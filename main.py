from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sec_fetcher import SECFetcher
from llm_layer import SECAnalyzer
from market_data import get_market_data, compute_valuation_verdict
from app_data import SCREENER_STOCKS
from dotenv import load_dotenv
import cache as disk_cache
import auth
import os

load_dotenv()

_STRIPE_WEBHOOK_SECRET  = os.getenv("STRIPE_WEBHOOK_SECRET", "")
_STRIPE_PAYMENT_LINK    = os.getenv("STRIPE_PAYMENT_LINK", "")

app = FastAPI(title="SEC Analyzer API", version="3.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

_text_cache: dict = {}
_comprehensive_cache: dict = {}   # ticker → {fin_str, sections_str, computed_str, company}
_insider_cache: dict = {}         # ticker → [transactions]


def _get_text(fetcher, url):
    cache_key = f"text_{url}"
    hit = disk_cache.get(cache_key, disk_cache.TTL_TEXT)
    if hit is not None:
        return hit
    text = fetcher.get_filing_text(url)
    disk_cache.put(cache_key, text)
    _text_cache[url] = text
    return text


class AnalyzeReq(BaseModel):
    ticker: str
    document_url: str
    form_type: str


class QueryReq(BaseModel):
    ticker: str
    document_url: str
    form_type: str
    question: str


class AskReq(BaseModel):
    ticker: str
    question: str

class CompareAskReq(BaseModel):
    tickers: list[str]
    question: str


@app.get("/")
def root():
    return {"status": "running", "version": "3.1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/filings/{ticker}")
def get_filings(ticker: str, count: int = 5):
    try:
        fetcher = SECFetcher(ticker.upper())
        filings = fetcher.get_recent_filings(count=count)
        if not filings:
            raise HTTPException(404, f"No filings found for {ticker.upper()}")
        return {"ticker": ticker.upper(), "filings": filings}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/comprehensive/{ticker}")
def get_comprehensive(ticker: str, refresh: bool = False,
                      authorization: str = Header(None)):
    """
    Fetch all key SEC filings + XBRL data, pre-compute exact metrics,
    then run LLM analysis with a 0-100 buy/sell rating.

    Pass ?refresh=true to bypass cache and re-fetch live data.
    Results are cached to disk for 24 hours.

    Auth: Bearer token in Authorization header (Supabase JWT).
    Rate limit: 3 fresh analyses/month for free users, unlimited for Pro.
    Cache hits never count against usage.
    """
    t = ticker.upper()
    cache_key = f"{t}_comprehensive"

    # ── Authenticate (non-fatal — anonymous access allowed) ──────────────
    user = None
    try:
        user = auth.get_current_user(authorization)
        if user:
            auth.ensure_user_record(user["id"], user.get("email", ""))
    except HTTPException:
        pass   # invalid token → treat as anonymous

    # ── Cache check — hits are always free ───────────────────────────────
    if not refresh:
        cached = disk_cache.get(cache_key, disk_cache.TTL_ANALYSIS)
        if cached is not None:
            # Cache hit — no usage counted
            _comprehensive_cache[t] = cached.get("_ask_cache", {})
            cached.pop("_ask_cache", None)
            return cached

    # ── Rate limit check (only for fresh / refresh requests) ─────────────
    if user:
        result = auth.check_and_increment(user["id"])
        if not result["allowed"]:
            raise HTTPException(
                status_code=429,
                detail={
                    "error":        "rate_limit",
                    "message":      f"You've used all {result['limit']} free analyses this month.",
                    "used":         result["used"],
                    "limit":        result["limit"],
                    "upgrade_url":  _STRIPE_PAYMENT_LINK,
                }
            )

    try:
        fetcher  = SECFetcher(t)
        analyzer = SECAnalyzer()

        data     = fetcher.get_comprehensive_data()
        analysis = analyzer.analyze_comprehensive(data, t)

        facts    = data.get("financial_facts", {})
        sections = data.get("filing_sections", {})
        computed = analysis.pop("_computed", {})

        fin_str      = analyzer._fmt_facts(facts)
        computed_str = analyzer._metrics_str(computed)
        sections_str = "\n\n".join(
            f"=== {k.upper()} ===\n{v[:4000]}"
            for k, v in list(sections.items())[:3]
        )

        ask_cache = {
            "fin_str":      fin_str,
            "sections_str": sections_str,
            "computed_str": computed_str,
            "company":      analysis.get("company_name", t),
        }
        _comprehensive_cache[t] = ask_cache

        # Build verified_metrics from Python computation — never from LLM.
        # This always works even when the LLM call failed, because computed
        # is derived directly from XBRL facts in Python.
        analysis["verified_metrics"] = analyzer.display_metrics(computed)
        analysis["financial_data"]   = facts
        analysis["company_info"]     = data.get("company_info", {})

        result = {"ticker": t, **analysis}

        # ── Attach live market data + valuation verdict ───────────────
        try:
            market = get_market_data(t)
            if "error" not in market:
                fcf   = computed.get("free_cash_flow_ttm") or computed.get("free_cash_flow")
                rev   = computed.get("revenue_ttm")        or computed.get("revenue_latest")
                sector_name = analysis.get("sector_framework", "General / Diversified")
                valuation   = compute_valuation_verdict(market, sector_name, fcf, rev)
                result["market_data"] = market
                result["valuation"]   = valuation

                # ── Recompute Altman Z with live market cap (much more accurate) ──
                # The initial computation in analyze_comprehensive uses book equity for X4
                # because market cap isn't available from XBRL.  Now that we have it,
                # recompute with the original market-cap formula and update risk_signals.
                mktcap = market.get("market_cap")
                if mktcap and result.get("risk_signals") is not None:
                    altman_mkt = analyzer._compute_altman_z(
                        facts, mktcap=mktcap, sector_framework=sector_name
                    )
                    if altman_mkt:
                        result["risk_signals"]["altman_z"] = altman_mkt
                        # Refresh AI interpretation with updated score
                        try:
                            beneish = result["risk_signals"].get("beneish_m") or {}
                            company_name = analysis.get("company_name", t)
                            result["risk_signals"]["ai_interpretation"] = (
                                analyzer.analyze_risk_signals(
                                    altman_mkt, beneish, computed, company_name, t
                                )
                            )
                        except Exception:
                            pass
        except Exception:
            pass   # never let market data failure break the main analysis

        # Only cache successful analyses — never cache LLM errors, otherwise
        # zeros get served from cache for 24 hours on every subsequent request.
        if "error" not in analysis:
            disk_cache.put(cache_key, {**result, "_ask_cache": ask_cache})
        else:
            result["llm_error"] = analysis.get("error", "Unknown LLM error")
        return result

    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/ask")
def ask(req: AskReq):
    """Ask a question grounded in the cached comprehensive data."""
    t = req.ticker.upper()
    try:
        analyzer = SECAnalyzer()
        cached   = _comprehensive_cache.get(t)

        # Fall back to disk cache if the process restarted since last analysis
        if not cached:
            disk_hit = disk_cache.get(f"{t}_comprehensive", disk_cache.TTL_ANALYSIS)
            if disk_hit:
                cached = disk_hit.get("_ask_cache")
                if cached:
                    _comprehensive_cache[t] = cached

        if cached:
            fin_str      = cached["fin_str"]
            sections_str = cached["sections_str"]
            computed_str = cached["computed_str"]
            company      = cached["company"]
        else:
            fetcher      = SECFetcher(t)
            data         = fetcher.get_comprehensive_data()
            facts        = data.get("financial_facts", {})
            sections     = data.get("filing_sections", {})
            computed     = analyzer._compute_metrics(facts)
            fin_str      = analyzer._fmt_facts(facts)
            computed_str = analyzer._metrics_str(computed)
            sections_str = "\n\n".join(
                f"=== {k.upper()} ===\n{v[:4000]}"
                for k, v in list(sections.items())[:3]
            )
            company = data.get("company_info", {}).get("name", t)

        answer = analyzer.query_comprehensive(
            fin_str, sections_str, computed_str, t, company, req.question
        )
        return {"ticker": t, "question": req.question, "answer": answer}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/insiders/{ticker}")
def get_insiders(ticker: str, refresh: bool = False):
    """
    Recent Form 4 open-market insider buy/sell transactions.
    Excludes option exercises, grants, and gifts — real money only.
    Cached 24 hours.
    """
    t = ticker.upper()
    cache_key = f"{t}_insiders"

    if not refresh:
        cached = disk_cache.get(cache_key, disk_cache.TTL_ANALYSIS)
        if cached is not None:
            return {"ticker": t, **cached}

    try:
        from datetime import datetime, timedelta
        fetcher      = SECFetcher(t)
        transactions = fetcher.get_insider_transactions(count=25)

        cutoff  = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        recent  = [tx for tx in transactions if tx["date"] >= cutoff]
        buys    = [tx for tx in recent if tx["type"] == "Buy"]
        sells   = [tx for tx in recent if tx["type"] == "Sell"]
        buy_val = sum(tx["value"] for tx in buys)
        sel_val = sum(tx["value"] for tx in sells)

        if len(buys) > len(sells) * 1.5:
            sentiment = "Bullish"
        elif len(sells) > len(buys) * 1.5:
            sentiment = "Bearish"
        else:
            sentiment = "Mixed"

        summary = {
            "total_transactions": len(transactions),
            "transactions_90d":   len(recent),
            "buys_90d":           len(buys),
            "sells_90d":          len(sells),
            "buy_value_90d":      buy_val,
            "sell_value_90d":     sel_val,
            "net_value_90d":      buy_val - sel_val,
            "net_sentiment":      sentiment,
        }

        payload = {"transactions": transactions, "summary": summary}
        disk_cache.put(cache_key, payload)
        _insider_cache[t] = payload
        return {"ticker": t, **payload}

    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/compare-ask")
def compare_ask(req: CompareAskReq):
    """Ask a comparative question across multiple companies using their cached SEC data."""
    tickers = [t.strip().upper() for t in req.tickers[:5] if t.strip()]
    if not tickers:
        raise HTTPException(400, "Provide at least one ticker.")
    try:
        analyzer = SECAnalyzer()
        contexts = []
        missing  = []

        for t in tickers:
            cached = _comprehensive_cache.get(t)
            if not cached:
                disk_hit = disk_cache.get(f"{t}_comprehensive", disk_cache.TTL_ANALYSIS)
                if disk_hit:
                    cached = disk_hit.get("_ask_cache")
                    if cached:
                        _comprehensive_cache[t] = cached

            if cached:
                company = cached.get("company", t)
                contexts.append(
                    f"=== {company} ({t}) ===\n"
                    f"FINANCIALS:\n{cached['fin_str']}\n\n"
                    f"COMPUTED METRICS:\n{cached['computed_str']}\n\n"
                    f"FILING EXCERPTS:\n{cached['sections_str'][:2500]}"
                )
            else:
                missing.append(t)

        if not contexts:
            raise HTTPException(404, "No cached data found. Analyze each company first.")

        note = f"\n\nNote: No data available for: {', '.join(missing)}." if missing else ""
        prompt = (
            "You are comparing multiple companies side-by-side based on their SEC filings "
            "and verified XBRL financial data. Be analytical, use specific numbers, and "
            "compare directly.\n\n"
            + "\n\n".join(contexts)
            + note
            + f"\n\nQUESTION: {req.question}"
        )

        resp = analyzer.client.chat.completions.create(
            model=analyzer.model,
            messages=[
                {"role": "system", "content": analyzer.system_prompt},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.2,
            max_tokens=1800,
        )
        return {
            "tickers":  tickers,
            "question": req.question,
            "answer":   resp.choices[0].message.content.strip(),
            "missing":  missing,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


class MarketBatchReq(BaseModel):
    tickers: list[str]


@app.get("/market/{ticker}")
def get_market(ticker: str):
    """Live price, valuation multiples, and analyst data for a single ticker."""
    t    = ticker.upper()
    data = get_market_data(t)
    if "error" in data:
        raise HTTPException(502, f"Market data unavailable for {t}: {data['error']}")
    return data


@app.post("/market-batch")
def get_market_batch(req: MarketBatchReq):
    """Live market data for up to 20 tickers (screener use)."""
    tickers = [t.strip().upper() for t in req.tickers[:20] if t.strip()]
    results = {}
    for t in tickers:
        try:
            results[t] = get_market_data(t)
        except Exception as e:
            results[t] = {"ticker": t, "error": str(e)}
    return {"results": results}


@app.get("/screener/{sector}")
def get_screener_data(sector: str):
    """
    Returns market data + any cached AI ratings for every stock in the
    requested sector.  Used by the screener page to show live prices
    and pre-loaded analysis ratings without running new LLM calls.
    """
    stocks = SCREENER_STOCKS.get(sector, [])
    results = []
    for s in stocks:
        t      = s["ticker"]
        market = get_market_data(t)
        # Pull cached rating from disk if available (no LLM call)
        cached_analysis = disk_cache.get(f"{t}_comprehensive", disk_cache.TTL_ANALYSIS)
        rating = None
        if cached_analysis:
            rating = {
                "score":   cached_analysis.get("rating_score"),
                "verdict": cached_analysis.get("rating_verdict"),
            }
        results.append({**s, "market": market, "rating": rating})
    return {"sector": sector, "stocks": results}


@app.delete("/cache/{ticker}")
def clear_cache(ticker: str):
    """Force-expire all cached data for a ticker (use before a manual refresh)."""
    removed = disk_cache.evict_ticker(ticker.upper())
    _comprehensive_cache.pop(ticker.upper(), None)
    return {"ticker": ticker.upper(), "evicted": removed}


@app.post("/analyze")
def analyze(req: AnalyzeReq):
    try:
        fetcher  = SECFetcher(req.ticker.upper())
        analyzer = SECAnalyzer()
        text     = _get_text(fetcher, req.document_url)
        facts    = fetcher.get_company_facts()
        result   = analyzer.analyze_filing(text, req.form_type, req.ticker.upper(), facts=facts)
        return {"ticker": req.ticker.upper(), "form_type": req.form_type, "analysis": result}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/query")
def query(req: QueryReq):
    try:
        fetcher  = SECFetcher(req.ticker.upper())
        analyzer = SECAnalyzer()
        text     = _get_text(fetcher, req.document_url)
        facts    = fetcher.get_company_facts()
        answer   = analyzer.query_filing(text, req.form_type, req.ticker.upper(), req.question, facts=facts)
        return {"ticker": req.ticker.upper(), "question": req.question, "answer": answer}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Usage / plan ─────────────────────────────────────────────────────────────

@app.get("/usage")
def get_usage(authorization: str = Header(None)):
    """Return the authenticated user's plan and analysis usage for this month."""
    user = None
    try:
        user = auth.get_current_user(authorization)
    except HTTPException:
        pass
    if not user:
        return {"plan": "free", "analyses_used": 0, "analyses_limit": auth.FREE_LIMIT}
    try:
        return auth.get_usage(user["id"])
    except Exception:
        return {"plan": "free", "analyses_used": 0, "analyses_limit": auth.FREE_LIMIT}


# ── Stripe webhook ───────────────────────────────────────────────────────────

@app.post("/stripe/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None, alias="stripe-signature")):
    """
    Receives Stripe events.  On checkout.session.completed, marks the user's
    Supabase record as is_paid=True so they get unlimited analyses.

    Configure in Stripe Dashboard → Webhooks → Add endpoint:
      URL: https://your-backend.railway.app/stripe/webhook
      Events: checkout.session.completed, customer.subscription.deleted
    """
    if not _STRIPE_WEBHOOK_SECRET:
        raise HTTPException(500, "STRIPE_WEBHOOK_SECRET not configured on server")

    payload = await request.body()
    try:
        import stripe as _stripe
        event = _stripe.Webhook.construct_event(
            payload, stripe_signature, _STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        raise HTTPException(400, f"Stripe signature invalid: {e}")

    evt_type = event["type"]
    obj      = event["data"]["object"]

    if evt_type == "checkout.session.completed":
        email      = (obj.get("customer_email")
                      or obj.get("customer_details", {}).get("email", ""))
        cust_id    = obj.get("customer", "")
        if email:
            auth.mark_paid(email, stripe_customer_id=cust_id)

    elif evt_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        # Downgrade back to free when subscription is cancelled
        cust_id = obj.get("customer", "")
        if cust_id and auth._available and auth.supabase:
            try:
                auth.supabase.table("users").update({"is_paid": False}) \
                    .eq("stripe_customer_id", cust_id).execute()
            except Exception:
                pass

    return {"received": True}
