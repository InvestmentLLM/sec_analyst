import requests, os, re
from datetime import date
from bs4 import BeautifulSoup
from utils import rate_limit, clean_text


class SECFetcher:
    BASE_URL = "https://www.sec.gov"
    DATA_URL = "https://data.sec.gov"
    USER_AGENT = os.getenv("USER_CONTACT", "SEC Analyzer research@example.com")
    HEADERS = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}

    FUNDAMENTAL_FORMS = [
        "10-K", "10-Q", "8-K", "13F-HR", "13F-NT",
        "S-1", "S-3", "S-4", "20-F", "6-K", "DEF 14A", "4", "3", "5",
    ]

    def __init__(self, ticker: str):
        self.ticker = ticker.upper()
        self.cik = None
        self._company_info = None
        self._submissions: dict = {}

    @rate_limit(delay=0.12)
    def _get(self, url: str, timeout: int = 45):
        resp = requests.get(url, headers=self.HEADERS, timeout=timeout)
        resp.raise_for_status()
        return resp

    def get_cik(self) -> str:
        if self.cik:
            return self.cik
        data = self._get("https://www.sec.gov/files/company_tickers.json").json()
        for entry in data.values():
            if entry["ticker"].upper() == self.ticker:
                self.cik = str(entry["cik_str"]).zfill(10)
                return self.cik
        raise ValueError(f"Ticker {self.ticker} not found in SEC database.")

    def get_company_info(self) -> dict:
        if self._company_info:
            return self._company_info
        cik = self.get_cik()
        try:
            data = self._get(f"{self.DATA_URL}/submissions/CIK{cik}.json").json()
            self._submissions = data
            self._company_info = {
                "name": data.get("name", self.ticker),
                "sic": data.get("sic", ""),
                "sicDescription": data.get("sicDescription", ""),
                "category": data.get("category", ""),
                "stateOfIncorporation": data.get("stateOfIncorporation", ""),
            }
        except Exception:
            self._company_info = {"name": self.ticker}
        return self._company_info

    def _get_entity_inception_date(self) -> str:
        """
        Return the period_end of the company's earliest 10-K in the submissions
        cache. Filters out pre-entity predecessor data (e.g. UTC comparatives
        filed under RTX's CIK after the 2020 merger).
        """
        if not self._submissions:
            self.get_company_info()
        try:
            recent  = self._submissions.get("filings", {}).get("recent", {})
            forms   = recent.get("form", [])
            periods = recent.get("periodOfReport", [])
            annual  = {"10-K", "10-K/A", "20-F", "20-F/A"}
            dates   = [
                periods[i] for i, f in enumerate(forms)
                if f in annual and i < len(periods) and periods[i]
            ]
            return min(dates) if dates else ""
        except Exception:
            return ""

    def get_company_facts(self) -> dict:
        """Fetch structured XBRL financial data via SEC EDGAR's Company Facts API."""
        cik = self.get_cik()
        url = f"{self.DATA_URL}/api/xbrl/companyfacts/CIK{cik}.json"
        try:
            data = self._get(url).json()
            facts = data.get("facts", {})
            us_gaap = facts.get("us-gaap", {})
            ifrs    = facts.get("ifrs-full", {})  # for foreign private issuers

            metric_map = {
                "revenue": [
                    ("us-gaap", "Revenues"),
                    ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"),
                    ("us-gaap", "SalesRevenueNet"),
                    ("us-gaap", "RevenueFromContractWithCustomerIncludingAssessedTax"),
                    ("us-gaap", "SalesRevenueGoodsNet"),
                    ("ifrs-full", "Revenue"),
                ],
                "net_income": [
                    ("us-gaap", "NetIncomeLoss"),
                    ("us-gaap", "NetIncome"),
                    ("us-gaap", "ProfitLoss"),
                    ("ifrs-full", "ProfitLoss"),
                ],
                "operating_income": [
                    ("us-gaap", "OperatingIncomeLoss"),
                    ("ifrs-full", "ProfitLossFromOperatingActivities"),
                ],
                "gross_profit": [
                    ("us-gaap", "GrossProfit"),
                    ("ifrs-full", "GrossProfit"),
                ],
                "eps_basic":    [("us-gaap", "EarningsPerShareBasic")],
                "eps_diluted":  [("us-gaap", "EarningsPerShareDiluted")],
                "total_assets": [
                    ("us-gaap", "Assets"),
                    ("ifrs-full", "Assets"),
                ],
                "total_equity": [
                    ("us-gaap", "StockholdersEquity"),
                    ("us-gaap", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"),
                    ("ifrs-full", "Equity"),
                ],
                "long_term_debt": [
                    ("us-gaap", "LongTermDebt"),
                    ("us-gaap", "LongTermDebtNoncurrent"),
                    ("ifrs-full", "NoncurrentBorrowings"),
                ],
                "cash": [
                    ("us-gaap", "CashAndCashEquivalentsAtCarryingValue"),
                    ("us-gaap", "CashCashEquivalentsAndShortTermInvestments"),
                    ("ifrs-full", "CashAndCashEquivalents"),
                ],
                "operating_cash_flow": [
                    ("us-gaap", "NetCashProvidedByUsedInOperatingActivities"),
                    ("ifrs-full", "CashFlowsFromUsedInOperatingActivities"),
                ],
                "capex": [
                    ("us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment"),
                    ("ifrs-full", "PurchaseOfPropertyPlantAndEquipment"),
                ],
                "current_assets":      [("us-gaap", "AssetsCurrent")],
                "current_liabilities": [("us-gaap", "LiabilitiesCurrent")],
                "total_liabilities":   [("us-gaap", "Liabilities")],
                "research_development":[("us-gaap", "ResearchAndDevelopmentExpense")],
            }

            result = {}
            namespace_data = {"us-gaap": us_gaap, "ifrs-full": ifrs}
            # EPS concepts report in USD/shares; everything else must use USD.
            eps_keys = {"eps_basic", "eps_diluted"}
            # Find the earliest period covered by this entity's own 10-K filings.
            # This excludes predecessor-company comparative years that get tagged
            # under the successor's CIK (e.g. UTC data in RTX's first 10-K).
            inception_date = self._get_entity_inception_date()

            for key, candidates in metric_map.items():
                want_per_share = key in eps_keys
                # merged: period_end → (entry, candidate_priority)
                # Rules:
                #   1. Higher-priority candidate (lower index) wins for same period.
                #      This prevents ProfitLoss from overwriting NetIncomeLoss.
                #   2. Same-priority candidate filed more recently wins
                #      (restatement handling within the same concept).
                #   3. Lower-priority candidate fills in years not yet seen.
                merged: dict = {}
                for priority, (ns, name) in enumerate(candidates):
                    src = namespace_data.get(ns, {})
                    if name not in src:
                        continue
                    raw_units = src[name].get("units", {})
                    if want_per_share:
                        unit_data = raw_units.get("USD/shares") or raw_units.get("shares") or []
                    else:
                        # Explicit key check — never fall through to USD/shares
                        # for dollar-denominated concepts (avoids EPS-scale values).
                        unit_data = raw_units.get("USD") or []
                    for e in unit_data:
                        end = e.get("end", "")
                        if not end:
                            continue
                        filed = e.get("filed", "")
                        existing = merged.get(end)
                        if existing is None:
                            merged[end] = (e, priority)
                        else:
                            ex_entry, ex_priority = existing
                            if priority < ex_priority:
                                # Higher-priority concept takes over
                                merged[end] = (e, priority)
                            elif priority == ex_priority and filed > ex_entry.get("filed", ""):
                                # Same concept, more recent filing (restatement)
                                merged[end] = (e, priority)
                            # Lower priority and not a restatement: skip

                if merged:
                    entries = [e for e, _ in merged.values()]
                    extracted = self._extract_annual(entries, inception_date=inception_date)
                    if extracted:
                        result[key] = extracted
            return result
        except Exception as e:
            return {"error": str(e)}

    def _extract_annual(self, entries: list, years: int = 8, inception_date: str = "") -> list:
        """
        Return deduplicated annual data points sorted ascending by year.

        Handles two fact types from XBRL:
        • Duration facts  (income statement): have start+end, span ~365 days.
        • Instant facts   (balance sheet):    have end only (no start).

        Key fix: deduplicate by `end` date, NOT by the `fy` field.
        The `fy` field = fiscal year of the FILING, so every 10-K tags its
        3 comparative years all as `fy=<current filing year>`.  Using `fy` as
        the dedup key was silently picking one random year's value and
        discarding the rest.  Using `end` date as the key gives one unique
        entry per actual fiscal year period.
        """
        def period_days(e) -> int:
            s, en = e.get("start", ""), e.get("end", "")
            if s and en:
                try:
                    return (date.fromisoformat(en) - date.fromisoformat(s)).days
                except Exception:
                    pass
            return -1  # -1 = no start date (instant fact)

        annual_forms = ("10-K", "20-F", "10-K/A", "20-F/A")

        # Partition into duration (income statement) vs instant (balance sheet)
        has_start    = [e for e in entries if e.get("start")]
        no_start     = [e for e in entries if not e.get("start")]

        if has_start:
            # Duration facts: only full-year periods (330–400 days) from 10-K filings
            annual = [e for e in has_start
                      if e.get("form") in annual_forms
                      and 330 <= period_days(e) <= 400]
            if not annual:
                # Fallback: any full-year span regardless of form type
                annual = [e for e in has_start if 330 <= period_days(e) <= 400]
        else:
            # Instant facts (balance sheet): filter to 10-K filings only
            annual = [e for e in no_start if e.get("form") in annual_forms]
            if not annual:
                annual = no_start  # last resort

        if not annual:
            return []

        # Drop data points from before this entity's own first 10-K period.
        # Filters out predecessor-company comparatives (e.g. UTC data in RTX
        # filings) while leaving established companies' full history intact.
        if inception_date:
            annual = [e for e in annual if e.get("end", "") >= inception_date]
        if not annual:
            return []

        # Deduplicate by `end` date.
        # Same end date can appear in multiple 10-Ks (comparative years);
        # keep the most recently filed version (handles restatements).
        by_end: dict = {}
        for e in annual:
            end = e.get("end", "")
            if not end:
                continue
            if end not in by_end or e.get("filed", "") > by_end[end].get("filed", ""):
                by_end[end] = e

        # Build output: year = calendar year of the period-end date.
        # If two different end dates fall in the same calendar year,
        # keep the later one (more likely to be the full-year figure).
        by_year: dict = {}
        for end_date, e in by_end.items():
            try:
                yr = int(end_date[:4])
                if yr not in by_year or end_date > by_year[yr]["period_end"]:
                    by_year[yr] = {
                        "year":       yr,
                        "value":      e.get("val", 0),
                        "filed":      e.get("filed", ""),
                        "period_end": end_date,
                    }
            except Exception:
                pass

        out = sorted(by_year.values(), key=lambda x: x["year"])
        return [{"year": d["year"], "value": d["value"], "filed": d["filed"]}
                for d in out[-years:]]

    def get_recent_filings(self, form_types=None, count: int = 2):
        if form_types is None:
            form_types = self.FUNDAMENTAL_FORMS
        cik = self.get_cik()
        all_filings = []
        for form in form_types:
            url = (f"{self.BASE_URL}/cgi-bin/browse-edgar?"
                   f"action=getcompany&CIK={cik}&type={form}&owner=exclude&count={count * 2}")
            resp = self._get(url)
            soup = BeautifulSoup(resp.text, "lxml")
            table = soup.find("table", class_="tableFile2")
            if not table:
                continue
            for row in table.find_all("tr")[1:count + 1]:
                cols = row.find_all("td")
                if len(cols) < 4:
                    continue
                link = cols[1].find("a")
                if not link or "Archives" not in link.get("href", ""):
                    continue
                all_filings.append({
                    "form_type": cols[0].text.strip(),
                    "filed_date": cols[3].text.strip(),
                    "accession_number": link["href"].split("/")[-2],
                    "document_url": self.BASE_URL + link["href"],
                })
        return all_filings

    def get_filing_text(self, document_url: str, max_chars: int = 100_000) -> str:
        try:
            index_soup = BeautifulSoup(self._get(document_url).text, "lxml")
            table = index_soup.find("table", class_="tableFile",
                                    summary="Document Format Files")
            if not table:
                return "Could not locate filing document table."

            primary_doc = None
            for row in table.find_all("tr")[1:]:
                cols = row.find_all("td")
                if len(cols) < 3:
                    continue
                link = cols[2].find("a")
                if not link:
                    continue
                href = link.get("href", "")
                if href.lower().endswith((".htm", ".html")):
                    primary_doc = href
                    break
            if not primary_doc:
                for row in table.find_all("tr")[1:]:
                    cols = row.find_all("td")
                    if len(cols) < 3:
                        continue
                    link = cols[2].find("a")
                    if not link:
                        continue
                    href = link.get("href", "")
                    if href.lower().endswith(".txt"):
                        primary_doc = href
                        break
            if not primary_doc:
                return "Could not find primary filing document."

            resp = self._get(self.BASE_URL + primary_doc)
            if primary_doc.lower().endswith((".htm", ".html")):
                soup = BeautifulSoup(resp.content, "lxml")
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                text = clean_text(soup.get_text(separator=" ", strip=True))
            else:
                text = clean_text(resp.text)
            return text[:max_chars]
        except Exception as e:
            return f"Error fetching filing text: {e}"

    def _find_section(self, text: str, patterns: list, max_len: int) -> str:
        for pattern in patterns:
            m = re.search(pattern, text)
            if m:
                return text[m.start(): m.start() + max_len]
        return ""

    def get_filing_sections(self, document_url: str) -> dict:
        full = self.get_filing_text(document_url, max_chars=500_000)
        defs = [
            ("business", [
                r"(?i)item\s+1\.?\s{0,5}business\b",
            ], 8_000),
            ("risk_factors", [
                r"(?i)item\s+1a\.?\s{0,5}risk\s+factors",
                r"(?i)risk\s+factors\b",
            ], 10_000),
            ("mda", [
                r"(?i)item\s+7\.?\s{0,5}management.{0,60}discussion",
                r"(?i)management.{0,10}discussion\s+and\s+analysis",
            ], 14_000),
            ("financial_statements", [
                r"(?i)item\s+8\.?\s{0,5}financial\s+statements",
                r"(?i)consolidated\s+statements?\s+of\s+(?:operations|income|earnings)",
            ], 10_000),
        ]
        sections = {}
        for key, patterns, max_len in defs:
            text = self._find_section(full, patterns, max_len)
            if text:
                sections[key] = text
        if not sections:
            sections["full_text"] = full[:40_000]
        return sections

    def get_comprehensive_data(self) -> dict:
        info      = self.get_company_info()
        facts     = self.get_company_facts()
        annual    = self.get_recent_filings(["10-K"], count=3)   # 3 years of 10-Ks
        quarterly = self.get_recent_filings(["10-Q"], count=4)   # last 4 quarters
        recent_8k = self.get_recent_filings(["8-K"], count=5)    # more recent events
        all_filings = annual + quarterly + recent_8k

        # Pull MD&A + risk sections from up to 3 annual filings for trend comparison
        multi_year_sections: dict[str, dict] = {}
        primary_filing = {}
        for i, filing in enumerate(annual[:3]):
            if i == 0:
                primary_filing = filing
            secs = self.get_filing_sections(filing["document_url"])
            label = filing.get("filed_date", f"year_{i}")[:4]   # e.g. "2024"
            multi_year_sections[label] = secs

        # Flatten: latest year sections are primary; older years appended with year label
        sections: dict = {}
        for year in sorted(multi_year_sections.keys(), reverse=True):
            for k, v in multi_year_sections[year].items():
                if k not in sections:
                    sections[k] = v                              # latest = primary
                else:
                    sections[f"{k}_{year}"] = v                  # older year labelled

        if not sections and quarterly:
            primary_filing = quarterly[0]
            sections["full_text"] = self.get_filing_text(
                primary_filing["document_url"], max_chars=60_000)

        return {
            "company_info":    info,
            "financial_facts": facts,
            "filings":         all_filings,
            "filing_sections": sections,
            "primary_filing":  primary_filing,
        }
