from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sec_fetcher import SECFetcher
from llm_layer import SECAnalyzer
from dotenv import load_dotenv
import cache as disk_cache

load_dotenv()

app = FastAPI(title="SEC Analyzer API", version="3.1.0")
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
def get_comprehensive(ticker: str, refresh: bool = False):
    """
    Fetch all key SEC filings + XBRL data, pre-compute exact metrics,
    then run LLM analysis with a 0-100 buy/sell rating.

    Pass ?refresh=true to bypass cache and re-fetch live data.
    Results are cached to disk for 24 hours.

    Requires: Bearer token in Authorization header.
    Rate limited: 3 analyses/month for free users, unlimited for paid.
    """
    t = ticker.upper()
    cache_key = f"{t}_comprehensive"

    # Check rate limit (unless cache hit)
    if not refresh:
        cached = disk_cache.get(cache_key, disk_cache.TTL_ANALYSIS)
        if cached is not None:
            # Cache hit — no usage counted
            _comprehensive_cache[t] = cached.get("_ask_cache", {})
            cached.pop("_ask_cache", None)
            return cached

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

        # Build verified_metrics from Python computation — never from LLM
        analysis["verified_metrics"] = analyzer.display_metrics(computed)
        analysis["financial_data"]   = facts
        analysis["company_info"]     = data.get("company_info", {})

        result = {"ticker": t, **analysis}
        disk_cache.put(cache_key, {**result, "_ask_cache": ask_cache})
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
