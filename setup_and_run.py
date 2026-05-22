#!/usr/bin/env python3
"""
SEC Analyzer — one-file setup & launcher.
Run this once from anywhere inside your sec-analyzer folder:

    python3 setup_and_run.py

It will:
  1. Create the correct folder layout
  2. Write every backend and frontend file
  3. Install Python dependencies
  4. Ask for your GROQ_API_KEY if not already set
  5. Start both the backend (port 8000) and frontend (port 3000)
"""

import os, sys, subprocess, signal, textwrap

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
APP_DIR  = os.path.join(FRONTEND, "app")

# ── helpers ──────────────────────────────────────────────────────────────────

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(textwrap.dedent(content).lstrip("\n"))
    print(f"  wrote  {os.path.relpath(path, ROOT)}")

def run(cmd, cwd=None):
    subprocess.run(cmd, cwd=cwd, check=True)

# ── file contents ─────────────────────────────────────────────────────────────

UTILS_PY = """
import re, time
from datetime import datetime

def clean_text(text: str) -> str:
    return re.sub(r'\\s+', ' ', text).strip()

def rate_limit(delay: float = 0.1):
    def decorator(func):
        def wrapper(*args, **kwargs):
            time.sleep(delay)
            return func(*args, **kwargs)
        return wrapper
    return decorator

def get_timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")
"""

SEC_FETCHER_PY = """
import requests, os
from bs4 import BeautifulSoup
from utils import rate_limit, clean_text

class SECFetcher:
    BASE_URL   = "https://www.sec.gov"
    USER_AGENT = os.getenv("USER_CONTACT", "SEC Analyzer <user@example.com>")
    HEADERS    = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}

    FUNDAMENTAL_FORMS = [
        "10-K","10-Q","8-K","13F-HR","13F-NT",
        "S-1","S-3","S-4","20-F","6-K","DEF 14A","4","3","5",
    ]

    def __init__(self, ticker: str):
        self.ticker = ticker.upper()
        self.cik = None

    @rate_limit(delay=0.5)
    def _get(self, url: str, timeout: int = 30):
        return requests.get(url, headers=self.HEADERS, timeout=timeout)

    def get_cik(self) -> str:
        if self.cik:
            return self.cik
        data = self._get("https://www.sec.gov/files/company_tickers.json").json()
        for entry in data.values():
            if entry["ticker"].upper() == self.ticker:
                self.cik = str(entry["cik_str"]).zfill(10)
                return self.cik
        raise ValueError(f"Ticker {self.ticker} not found in SEC database.")

    def get_recent_filings(self, form_types=None, count: int = 2):
        if form_types is None:
            form_types = self.FUNDAMENTAL_FORMS
        cik = self.get_cik()
        all_filings = []
        for form in form_types:
            url = (f"{self.BASE_URL}/cgi-bin/browse-edgar?"
                   f"action=getcompany&CIK={cik}&type={form}&owner=exclude&count={count*2}")
            resp = self._get(url)
            soup = BeautifulSoup(resp.text, "lxml")
            table = soup.find("table", class_="tableFile2")
            if not table:
                continue
            for row in table.find_all("tr")[1:count+1]:
                cols = row.find_all("td")
                if len(cols) < 4:
                    continue
                link = cols[1].find("a")
                if not link or "Archives" not in link.get("href", ""):
                    continue
                all_filings.append({
                    "form_type":        cols[0].text.strip(),
                    "filed_date":       cols[3].text.strip(),
                    "accession_number": link["href"].split("/")[-2],
                    "document_url":     self.BASE_URL + link["href"],
                })
        return all_filings

    def get_filing_text(self, document_url: str) -> str:
        try:
            index_soup = BeautifulSoup(self._get(document_url).text, "lxml")
            table = index_soup.find("table", class_="tableFile", summary="Document Format Files")
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
                if href.endswith(".htm") or href.endswith(".html"):
                    primary_doc = href
                    break
            if not primary_doc:
                return "Could not find primary filing document."
            filing_soup = BeautifulSoup(self._get(self.BASE_URL + primary_doc).text, "lxml")
            for tag in filing_soup(["script", "style", "nav"]):
                tag.decompose()
            return clean_text(filing_soup.get_text(separator=" ", strip=True))[:25000]
        except Exception as e:
            return f"Error fetching filing text: {e}"
"""

LLM_LAYER_PY = """
import os, json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

class SECAnalyzer:
    def __init__(self, model: str = "llama-3.1-8b-instant"):
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise ValueError("GROQ_API_KEY not set — add it to backend/.env")
        self.client = Groq(api_key=key)
        self.model  = model

    def analyze_filing(self, text: str, form: str, ticker: str) -> dict:
        prompt = (
            f"Analyze this {form} filing for {ticker}.\\n"
            "Return JSON ONLY with keys: summary, key_metrics, risks, outlook, red_flags.\\n\\n"
            f"Text:\\n{text[:20000]}"
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            return {"error": str(e)}

    def query_filing(self, text: str, form: str, ticker: str, question: str) -> str:
        prompt = (
            f"You are a financial analyst. You have the text of a {form} SEC filing for {ticker}.\\n"
            f"Answer this question clearly and concisely, citing specific details from the filing:\\n\\n"
            f"Question: {question}\\n\\nFiling text:\\n{text[:20000]}"
        )
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
            return resp.choices[0].message.content
        except Exception as e:
            return f"Error: {e}"
"""

MAIN_PY = """
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sec_fetcher import SECFetcher
from llm_layer import SECAnalyzer
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SEC Analyzer API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

_text_cache: dict = {}

def _get_text(fetcher, url):
    if url not in _text_cache:
        _text_cache[url] = fetcher.get_filing_text(url)
    return _text_cache[url]

class AnalyzeReq(BaseModel):
    ticker: str; document_url: str; form_type: str

class QueryReq(BaseModel):
    ticker: str; document_url: str; form_type: str; question: str

@app.get("/")
def root(): return {"status": "running"}

@app.get("/health")
def health(): return {"status": "ok"}

@app.get("/filings/{ticker}")
def get_filings(ticker: str, count: int = 5):
    try:
        fetcher  = SECFetcher(ticker.upper())
        filings  = fetcher.get_recent_filings(count=count)
        if not filings:
            raise HTTPException(404, f"No filings found for {ticker.upper()}")
        return {"ticker": ticker.upper(), "filings": filings}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/analyze")
def analyze(req: AnalyzeReq):
    try:
        fetcher  = SECFetcher(req.ticker.upper())
        analyzer = SECAnalyzer()
        text     = _get_text(fetcher, req.document_url)
        result   = analyzer.analyze_filing(text, req.form_type, req.ticker.upper())
        return {"ticker": req.ticker.upper(), "form_type": req.form_type, "analysis": result}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/query")
def query(req: QueryReq):
    try:
        fetcher  = SECFetcher(req.ticker.upper())
        analyzer = SECAnalyzer()
        text     = _get_text(fetcher, req.document_url)
        answer   = analyzer.query_filing(text, req.form_type, req.ticker.upper(), req.question)
        return {"ticker": req.ticker.upper(), "question": req.question, "answer": answer}
    except Exception as e:
        raise HTTPException(500, str(e))
"""

REQUIREMENTS_TXT = """
fastapi
uvicorn[standard]
groq
python-dotenv
requests
beautifulsoup4
lxml
pydantic
"""

PAGE_TSX = r"""
"use client";
import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";

type Filing  = { form_type: string; filed_date: string; accession_number: string; document_url: string };
type Analysis = { summary?: string; key_metrics?: Record<string,string>; risks?: string[]; outlook?: string; red_flags?: string[]; error?: string };
type Msg     = { role: "user"|"assistant"; text: string };

export default function Home() {
  const [inputVal,       setInputVal]       = useState("");
  const [ticker,         setTicker]         = useState("");
  const [filings,        setFilings]        = useState<Filing[]>([]);
  const [selected,       setSelected]       = useState<Filing|null>(null);
  const [analysis,       setAnalysis]       = useState<Analysis|null>(null);
  const [messages,       setMessages]       = useState<Msg[]>([]);
  const [question,       setQuestion]       = useState("");
  const [loadingFilings, setLoadingFilings] = useState(false);
  const [loadingAnalysis,setLoadingAnalysis]= useState(false);
  const [loadingQuery,   setLoadingQuery]   = useState(false);
  const [error,          setError]          = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  async function fetchFilings() {
    const t = inputVal.trim().toUpperCase();
    if (!t) return;
    setError(""); setLoadingFilings(true);
    setFilings([]); setSelected(null); setAnalysis(null); setMessages([]);
    try {
      const res = await fetch(`${API}/filings/${t}`);
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      const data = await res.json();
      setTicker(t); setFilings(data.filings);
    } catch(e:unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoadingFilings(false); }
  }

  async function selectFiling(f: Filing) {
    setSelected(f); setAnalysis(null); setMessages([]); setLoadingAnalysis(true); setError("");
    try {
      const res = await fetch(`${API}/analyze`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ticker, document_url: f.document_url, form_type: f.form_type }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      setAnalysis((await res.json()).analysis);
    } catch(e:unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoadingAnalysis(false); }
  }

  async function sendQuestion() {
    if (!question.trim() || !selected) return;
    const q = question.trim(); setQuestion("");
    setMessages(m => [...m, { role:"user", text:q }]); setLoadingQuery(true);
    try {
      const res = await fetch(`${API}/query`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ticker, document_url: selected.document_url, form_type: selected.form_type, question: q }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      setMessages(m => [...m, { role:"assistant", text:(await res.json()).answer }]);
    } catch(e:unknown) {
      setMessages(m => [...m, { role:"assistant", text:`Error: ${e instanceof Error ? e.message : "Unknown"}` }]);
    } finally { setLoadingQuery(false); }
  }

  const formColors: Record<string,string> = {
    "10-K":"#1a472a","10-Q":"#1e3a5f","8-K":"#4a1942","DEF 14A":"#5c3d11","S-1":"#3b1f0e","13F-HR":"#0e3d3d",
  };

  return (
    <main style={{ minHeight:"100vh", background:"#0a0a0f", color:"#e8e8f0", fontFamily:"Georgia,serif" }}>
      <header style={{ borderBottom:"1px solid #1e1e2e", padding:"1rem 2rem", display:"flex", alignItems:"center", background:"#0d0d17" }}>
        <span style={{ fontSize:22, color:"#e8e8f0" }}>SEC</span>
        <span style={{ fontSize:22, fontStyle:"italic", color:"#6b7aff", marginLeft:6 }}>Lens</span>
        <span style={{ marginLeft:"auto", fontFamily:"monospace", fontSize:12, color:"#555570" }}>{ticker ? `$${ticker}` : "no ticker"}</span>
      </header>

      <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", minHeight:"calc(100vh - 57px)" }}>
        <aside style={{ borderRight:"1px solid #1e1e2e", background:"#0d0d17", display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"1.25rem 1rem", borderBottom:"1px solid #1e1e2e" }}>
            <div style={{ fontFamily:"monospace", fontSize:11, color:"#555570", marginBottom:8 }}>TICKER</div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={inputVal} onChange={e=>setInputVal(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==="Enter"&&fetchFilings()} placeholder="AAPL"
                style={{ flex:1, background:"#13131f", border:"1px solid #2a2a3e", color:"#e8e8f0",
                  padding:"7px 10px", borderRadius:6, fontSize:14, fontFamily:"monospace", outline:"none" }} />
              <button onClick={fetchFilings} disabled={loadingFilings}
                style={{ background:"#6b7aff", border:"none", color:"#fff", padding:"7px 14px",
                  borderRadius:6, fontSize:13, cursor:"pointer", opacity:loadingFilings?0.6:1 }}>
                {loadingFilings ? "…" : "Go"}
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"0.5rem 0" }}>
            {filings.length === 0 && !loadingFilings && (
              <p style={{ padding:"1.5rem 1rem", color:"#44445a", fontSize:13, fontFamily:"monospace" }}>Enter a ticker above.</p>
            )}
            {filings.map((f,i) => {
              const active = selected?.accession_number === f.accession_number;
              return (
                <button key={i} onClick={()=>selectFiling(f)} style={{
                  width:"100%", textAlign:"left", background:active?"#1a1a2e":"transparent",
                  border:"none", borderLeft:active?"2px solid #6b7aff":"2px solid transparent",
                  padding:"0.75rem 1rem", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ background:formColors[f.form_type]||"#1e1e2e", color:"#e8e8f0",
                    fontFamily:"monospace", fontSize:10, padding:"2px 7px", borderRadius:4, whiteSpace:"nowrap" }}>
                    {f.form_type}
                  </span>
                  <span style={{ fontSize:12, color:active?"#a0a8ff":"#6666aa", fontFamily:"monospace" }}>
                    {f.filed_date}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {error && <div style={{ background:"#2e1015", borderBottom:"1px solid #5a2020", padding:"0.75rem 1.5rem", fontSize:13, color:"#f08080", fontFamily:"monospace" }}>⚠ {error}</div>}

          {!selected && !loadingAnalysis && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#33334d", flexDirection:"column", gap:12 }}>
              <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#33334d" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <p style={{ fontFamily:"monospace", fontSize:13 }}>Select a filing to analyze</p>
            </div>
          )}

          {loadingAnalysis && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
              <div style={{ width:24, height:24, border:"2px solid #6b7aff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
              <p style={{ fontFamily:"monospace", fontSize:13, color:"#6b7aff" }}>Analyzing {selected?.form_type}…</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {analysis && !loadingAnalysis && (
            <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"1.5rem", display:"flex", flexDirection:"column", gap:"1.25rem" }}>
                <div style={{ fontFamily:"monospace", fontSize:11, color:"#555570" }}>
                  {ticker} · {selected?.form_type} · {selected?.filed_date}
                </div>
                {analysis.error ? (
                  <Card title="Error" accent="#e05050"><p style={{ color:"#f08080", fontSize:14, margin:0 }}>{analysis.error}</p></Card>
                ) : (<>
                  {analysis.summary && <Card title="Summary"><p style={{ fontSize:15, lineHeight:1.7, color:"#c0c0d8", margin:0 }}>{analysis.summary}</p></Card>}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                    {analysis.key_metrics && (
                      <Card title="Key metrics">
                        <dl style={{ margin:0, display:"flex", flexDirection:"column", gap:8 }}>
                          {Object.entries(analysis.key_metrics).map(([k,v])=>(
                            <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                              <dt style={{ fontSize:13, color:"#6666aa", fontFamily:"monospace" }}>{k}</dt>
                              <dd style={{ fontSize:13, color:"#c0c0d8", margin:0 }}>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </Card>
                    )}
                    {analysis.outlook && <Card title="Outlook"><p style={{ fontSize:14, lineHeight:1.6, color:"#c0c0d8", margin:0 }}>{analysis.outlook}</p></Card>}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
                    {analysis.risks && analysis.risks.length > 0 && (
                      <Card title="Risks" accent="#f08060">
                        <ul style={{ margin:0, paddingLeft:"1.1rem", display:"flex", flexDirection:"column", gap:6 }}>
                          {analysis.risks.map((r,i)=><li key={i} style={{ fontSize:13, color:"#c0c0d8", lineHeight:1.5 }}>{r}</li>)}
                        </ul>
                      </Card>
                    )}
                    {analysis.red_flags && analysis.red_flags.length > 0 && (
                      <Card title="Red flags" accent="#e05050">
                        <ul style={{ margin:0, paddingLeft:"1.1rem", display:"flex", flexDirection:"column", gap:6 }}>
                          {analysis.red_flags.map((r,i)=><li key={i} style={{ fontSize:13, color:"#c0c0d8", lineHeight:1.5 }}>{r}</li>)}
                        </ul>
                      </Card>
                    )}
                  </div>
                </>)}
              </div>

              <div style={{ borderTop:"1px solid #1e1e2e", background:"#0d0d17" }}>
                <div style={{ padding:"0.6rem 1.5rem", fontFamily:"monospace", fontSize:10, color:"#555570", letterSpacing:1 }}>ASK A QUESTION ABOUT THIS FILING</div>
                {messages.length > 0 && (
                  <div style={{ maxHeight:260, overflowY:"auto", padding:"0 1.5rem 1rem", display:"flex", flexDirection:"column", gap:12 }}>
                    {messages.map((m,i)=>(
                      <div key={i} style={{ alignSelf:m.role==="user"?"flex-end":"flex-start", maxWidth:"80%",
                        background:m.role==="user"?"#1e1e40":"#14142a",
                        border:`1px solid ${m.role==="user"?"#3a3a60":"#1e1e2e"}`,
                        borderRadius:10, padding:"0.6rem 1rem", fontSize:13, lineHeight:1.6, color:"#c0c0d8" }}>
                        {m.text}
                      </div>
                    ))}
                    {loadingQuery && <div style={{ alignSelf:"flex-start", background:"#14142a", border:"1px solid #1e1e2e", borderRadius:10, padding:"0.6rem 1rem", fontSize:13, color:"#6b7aff", fontFamily:"monospace" }}>thinking…</div>}
                    <div ref={chatEnd}/>
                  </div>
                )}
                <div style={{ padding:"0.75rem 1.5rem 1.25rem", display:"flex", gap:10 }}>
                  <input value={question} onChange={e=>setQuestion(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&!loadingQuery&&sendQuestion()}
                    placeholder="What were the main revenue drivers?"
                    disabled={loadingQuery}
                    style={{ flex:1, background:"#13131f", border:"1px solid #2a2a3e", color:"#e8e8f0",
                      padding:"9px 12px", borderRadius:8, fontSize:14, outline:"none", fontFamily:"Georgia,serif" }}/>
                  <button onClick={sendQuestion} disabled={loadingQuery||!question.trim()}
                    style={{ background:"#6b7aff", border:"none", color:"#fff", padding:"9px 18px",
                      borderRadius:8, fontSize:14, cursor:"pointer", opacity:(loadingQuery||!question.trim())?0.5:1 }}>
                    Ask
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({ title, children, accent }: { title:string; children:React.ReactNode; accent?:string }) {
  return (
    <div style={{ background:"#0d0d17", border:"1px solid #1e1e2e", borderRadius:10,
      padding:"1rem 1.25rem", borderLeft:accent?`3px solid ${accent}`:"1px solid #1e1e2e" }}>
      <div style={{ fontFamily:"monospace", fontSize:11, color:accent||"#6b7aff", letterSpacing:1, marginBottom:10, textTransform:"uppercase" }}>{title}</div>
      {children}
    </div>
  );
}
"""

LAYOUT_TSX = """
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "SEC Lens", description: "SEC filing analyzer" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
"""

GLOBALS_CSS = """
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0f; color: #e8e8f0; }
"""

# ── main setup ────────────────────────────────────────────────────────────────

def setup():
    print("\n🔧 Setting up SEC Analyzer...\n")

    # 1. Write backend files
    write(os.path.join(BACKEND, "utils.py"),        UTILS_PY)
    write(os.path.join(BACKEND, "sec_fetcher.py"),  SEC_FETCHER_PY)
    write(os.path.join(BACKEND, "llm_layer.py"),    LLM_LAYER_PY)
    write(os.path.join(BACKEND, "main.py"),         MAIN_PY)
    write(os.path.join(BACKEND, "requirements.txt"),REQUIREMENTS_TXT)

    # 2. Write frontend files
    write(os.path.join(APP_DIR, "page.tsx"),    PAGE_TSX)
    write(os.path.join(APP_DIR, "layout.tsx"),  LAYOUT_TSX)
    write(os.path.join(APP_DIR, "globals.css"), GLOBALS_CSS)

    # 3. .env — ask for key if missing
    env_path = os.path.join(BACKEND, ".env")
    if not os.path.exists(env_path):
        print("\n🔑 GROQ_API_KEY not found.")
        key = input("   Paste your Groq API key (get one free at console.groq.com): ").strip()
        with open(env_path, "w") as f:
            f.write(f"GROQ_API_KEY={key}\n")
        print(f"  wrote  backend/.env")
    else:
        print("  exists backend/.env  (skipped)")

    # 4. Install Python deps
    print("\n📦 Installing Python dependencies...")
    pip = os.path.join(ROOT, "venv", "bin", "pip") if os.path.exists(os.path.join(ROOT, "venv")) else sys.executable.replace("python", "pip").replace("python3","pip3")
    python = os.path.join(ROOT, "venv", "bin", "python") if os.path.exists(os.path.join(ROOT, "venv")) else sys.executable
    try:
        run([python, "-m", "pip", "install", "-q", "-r", os.path.join(BACKEND, "requirements.txt"),
             "--break-system-packages"])
    except Exception:
        run([python, "-m", "pip", "install", "-q", "-r", os.path.join(BACKEND, "requirements.txt")])

    # 5. Install Node deps
    print("\n📦 Installing Node dependencies...")
    run(["npm", "install", "--silent"], cwd=FRONTEND)

    print("\n✅ Setup complete!\n")

def launch():
    print("🚀 Starting servers...\n")
    python = os.path.join(ROOT, "venv", "bin", "python") if os.path.exists(os.path.join(ROOT, "venv")) else sys.executable
    uvicorn = os.path.join(ROOT, "venv", "bin", "uvicorn") if os.path.exists(os.path.join(ROOT, "venv")) else "uvicorn"

    backend_proc  = subprocess.Popen(
        [python, "-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
        cwd=BACKEND,
    )
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND,
    )

    print("  Backend  → http://localhost:8000")
    print("  Frontend → http://localhost:3000")
    print("\n  Press Ctrl+C to stop both.\n")

    def shutdown(sig, frame):
        print("\n\nStopping...")
        backend_proc.terminate()
        frontend_proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    backend_proc.wait()

if __name__ == "__main__":
    setup()
    launch()
