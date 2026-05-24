"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addToWatchlist } from "../../lib/watchlist";

const SECTORS: Record<string, { color: string; stocks: { ticker: string; name: string }[] }> = {
  "Technology": {
    color: "#6b7aff",
    stocks: [
      { ticker: "AAPL",  name: "Apple Inc."              },
      { ticker: "MSFT",  name: "Microsoft Corp."         },
      { ticker: "NVDA",  name: "NVIDIA Corp."            },
      { ticker: "GOOGL", name: "Alphabet Inc."           },
      { ticker: "META",  name: "Meta Platforms Inc."     },
      { ticker: "AVGO",  name: "Broadcom Inc."           },
      { ticker: "AMD",   name: "Advanced Micro Devices"  },
      { ticker: "INTC",  name: "Intel Corp."             },
      { ticker: "ORCL",  name: "Oracle Corp."            },
      { ticker: "CRM",   name: "Salesforce Inc."         },
      { ticker: "ADBE",  name: "Adobe Inc."              },
      { ticker: "CSCO",  name: "Cisco Systems"           },
      { ticker: "QCOM",  name: "QUALCOMM Inc."           },
      { ticker: "TXN",   name: "Texas Instruments"       },
      { ticker: "AMAT",  name: "Applied Materials"       },
      { ticker: "MU",    name: "Micron Technology"       },
    ],
  },
  "Healthcare": {
    color: "#22c55e",
    stocks: [
      { ticker: "UNH",   name: "UnitedHealth Group"      },
      { ticker: "LLY",   name: "Eli Lilly and Co."       },
      { ticker: "JNJ",   name: "Johnson & Johnson"       },
      { ticker: "ABBV",  name: "AbbVie Inc."             },
      { ticker: "MRK",   name: "Merck & Co."             },
      { ticker: "PFE",   name: "Pfizer Inc."             },
      { ticker: "TMO",   name: "Thermo Fisher Scientific"},
      { ticker: "ABT",   name: "Abbott Laboratories"     },
      { ticker: "DHR",   name: "Danaher Corp."           },
      { ticker: "BMY",   name: "Bristol-Myers Squibb"    },
      { ticker: "AMGN",  name: "Amgen Inc."              },
      { ticker: "ISRG",  name: "Intuitive Surgical"      },
      { ticker: "SYK",   name: "Stryker Corp."           },
      { ticker: "REGN",  name: "Regeneron Pharmaceuticals"},
      { ticker: "VRTX",  name: "Vertex Pharmaceuticals"  },
    ],
  },
  "Financials": {
    color: "#eab308",
    stocks: [
      { ticker: "JPM",   name: "JPMorgan Chase"          },
      { ticker: "V",     name: "Visa Inc."               },
      { ticker: "MA",    name: "Mastercard Inc."         },
      { ticker: "BAC",   name: "Bank of America"         },
      { ticker: "WFC",   name: "Wells Fargo"             },
      { ticker: "GS",    name: "Goldman Sachs"           },
      { ticker: "MS",    name: "Morgan Stanley"          },
      { ticker: "AXP",   name: "American Express"        },
      { ticker: "BLK",   name: "BlackRock Inc."          },
      { ticker: "SPGI",  name: "S&P Global Inc."         },
      { ticker: "C",     name: "Citigroup Inc."          },
      { ticker: "CB",    name: "Chubb Ltd."              },
      { ticker: "PNC",   name: "PNC Financial Services"  },
      { ticker: "SCHW",  name: "Charles Schwab Corp."    },
      { ticker: "ICE",   name: "Intercontinental Exchange"},
    ],
  },
  "Energy": {
    color: "#f97316",
    stocks: [
      { ticker: "XOM",   name: "Exxon Mobil Corp."       },
      { ticker: "CVX",   name: "Chevron Corp."           },
      { ticker: "COP",   name: "ConocoPhillips"          },
      { ticker: "EOG",   name: "EOG Resources"           },
      { ticker: "SLB",   name: "SLB (Schlumberger)"      },
      { ticker: "MPC",   name: "Marathon Petroleum"      },
      { ticker: "PSX",   name: "Phillips 66"             },
      { ticker: "VLO",   name: "Valero Energy"           },
      { ticker: "OXY",   name: "Occidental Petroleum"    },
      { ticker: "DVN",   name: "Devon Energy"            },
      { ticker: "HAL",   name: "Halliburton Co."         },
      { ticker: "BKR",   name: "Baker Hughes"            },
    ],
  },
  "Consumer Discretionary": {
    color: "#ec4899",
    stocks: [
      { ticker: "AMZN",  name: "Amazon.com Inc."         },
      { ticker: "TSLA",  name: "Tesla Inc."              },
      { ticker: "HD",    name: "Home Depot Inc."         },
      { ticker: "MCD",   name: "McDonald's Corp."        },
      { ticker: "NKE",   name: "Nike Inc."               },
      { ticker: "SBUX",  name: "Starbucks Corp."         },
      { ticker: "TJX",   name: "TJX Companies"           },
      { ticker: "LOW",   name: "Lowe's Companies"        },
      { ticker: "CMG",   name: "Chipotle Mexican Grill"  },
      { ticker: "GM",    name: "General Motors"          },
      { ticker: "BKNG",  name: "Booking Holdings"        },
      { ticker: "RCL",   name: "Royal Caribbean Group"   },
      { ticker: "MAR",   name: "Marriott International"  },
    ],
  },
  "Consumer Staples": {
    color: "#10b981",
    stocks: [
      { ticker: "WMT",   name: "Walmart Inc."            },
      { ticker: "COST",  name: "Costco Wholesale"        },
      { ticker: "PG",    name: "Procter & Gamble"        },
      { ticker: "KO",    name: "Coca-Cola Co."           },
      { ticker: "PEP",   name: "PepsiCo Inc."            },
      { ticker: "PM",    name: "Philip Morris Intl."     },
      { ticker: "MO",    name: "Altria Group"            },
      { ticker: "MDLZ",  name: "Mondelez International"  },
      { ticker: "CL",    name: "Colgate-Palmolive"       },
      { ticker: "GIS",   name: "General Mills"           },
    ],
  },
  "Industrials": {
    color: "#64748b",
    stocks: [
      { ticker: "GE",    name: "GE Aerospace"            },
      { ticker: "CAT",   name: "Caterpillar Inc."        },
      { ticker: "UNP",   name: "Union Pacific Corp."     },
      { ticker: "HON",   name: "Honeywell Intl."         },
      { ticker: "RTX",   name: "RTX Corp."               },
      { ticker: "BA",    name: "Boeing Co."              },
      { ticker: "LMT",   name: "Lockheed Martin"         },
      { ticker: "DE",    name: "Deere & Co."             },
      { ticker: "UPS",   name: "United Parcel Service"   },
      { ticker: "FDX",   name: "FedEx Corp."             },
      { ticker: "WM",    name: "Waste Management"        },
      { ticker: "EMR",   name: "Emerson Electric"        },
      { ticker: "GD",    name: "General Dynamics"        },
      { ticker: "NOC",   name: "Northrop Grumman"        },
    ],
  },
  "Communication Services": {
    color: "#8b5cf6",
    stocks: [
      { ticker: "GOOGL", name: "Alphabet Inc."           },
      { ticker: "META",  name: "Meta Platforms Inc."     },
      { ticker: "NFLX",  name: "Netflix Inc."            },
      { ticker: "DIS",   name: "Walt Disney Co."         },
      { ticker: "CMCSA", name: "Comcast Corp."           },
      { ticker: "T",     name: "AT&T Inc."               },
      { ticker: "VZ",    name: "Verizon Communications"  },
      { ticker: "TMUS",  name: "T-Mobile US"             },
      { ticker: "CHTR",  name: "Charter Communications"  },
    ],
  },
  "Materials": {
    color: "#f59e0b",
    stocks: [
      { ticker: "LIN",   name: "Linde PLC"               },
      { ticker: "APD",   name: "Air Products"            },
      { ticker: "SHW",   name: "Sherwin-Williams"        },
      { ticker: "FCX",   name: "Freeport-McMoRan"        },
      { ticker: "NEM",   name: "Newmont Corp."           },
      { ticker: "NUE",   name: "Nucor Corp."             },
      { ticker: "DOW",   name: "Dow Inc."                },
      { ticker: "DD",    name: "DuPont de Nemours"       },
      { ticker: "ECL",   name: "Ecolab Inc."             },
      { ticker: "PPG",   name: "PPG Industries"          },
    ],
  },
  "Utilities": {
    color: "#06b6d4",
    stocks: [
      { ticker: "NEE",   name: "NextEra Energy"          },
      { ticker: "SO",    name: "Southern Company"        },
      { ticker: "DUK",   name: "Duke Energy"             },
      { ticker: "SRE",   name: "Sempra"                  },
      { ticker: "AEP",   name: "American Electric Power" },
      { ticker: "EXC",   name: "Exelon Corp."            },
      { ticker: "XEL",   name: "Xcel Energy"             },
      { ticker: "D",     name: "Dominion Energy"         },
      { ticker: "WEC",   name: "WEC Energy Group"        },
    ],
  },
  "Real Estate": {
    color: "#84cc16",
    stocks: [
      { ticker: "PLD",   name: "Prologis Inc."           },
      { ticker: "AMT",   name: "American Tower"          },
      { ticker: "EQIX",  name: "Equinix Inc."            },
      { ticker: "CCI",   name: "Crown Castle Inc."       },
      { ticker: "PSA",   name: "Public Storage"          },
      { ticker: "SPG",   name: "Simon Property Group"    },
      { ticker: "O",     name: "Realty Income Corp."     },
      { ticker: "DLR",   name: "Digital Realty Trust"    },
      { ticker: "AVB",   name: "AvalonBay Communities"   },
      { ticker: "WY",    name: "Weyerhaeuser Co."        },
    ],
  },
};

function ScreenerInner() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const initialSector = searchParams.get("sector") ?? "Technology";
  const [activeSector, setActiveSector]   = useState(initialSector);
  const [saved,        setSaved]          = useState<Set<string>>(new Set());
  const [savingTicker, setSavingTicker]   = useState<string | null>(null);
  const [search,       setSearch]         = useState("");

  const sectorKeys   = Object.keys(SECTORS);
  const sectorData   = SECTORS[activeSector] ?? SECTORS["Technology"];
  const accentColor  = sectorData.color;

  const filteredStocks = sectorData.stocks.filter(s =>
    s.ticker.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleWatch(ticker: string, name: string) {
    setSavingTicker(ticker);
    try {
      await addToWatchlist(ticker, name);
      setSaved(prev => new Set(prev).add(ticker));
    } catch {
      /* table may not exist yet */
    }
    setSavingTicker(null);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>

        {/* Page header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: 20, color: "#e8e8f0", marginBottom: 4, fontFamily: "Georgia, serif" }}>
            Stock Screener
          </h1>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a" }}>
            {Object.values(SECTORS).reduce((n, s) => n + s.stocks.length, 0)} companies across {sectorKeys.length} sectors — click Analyze for full SEC filing analysis
          </p>
        </div>

        {/* Sector tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.5rem" }}>
          {sectorKeys.map(sector => {
            const active = sector === activeSector;
            const color  = SECTORS[sector].color;
            return (
              <button key={sector}
                onClick={() => { setActiveSector(sector); setSearch(""); }}
                style={{
                  padding: "5px 13px", borderRadius: 20,
                  background: active ? color + "22" : "transparent",
                  border: `1px solid ${active ? color : "#2a2a3e"}`,
                  color: active ? color : "#6666aa",
                  fontFamily: "monospace", fontSize: 11, cursor: "pointer",
                }}>
                {sector}
              </button>
            );
          })}
        </div>

        {/* Search within sector */}
        <div style={{ marginBottom: "1rem" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search within ${activeSector}…`}
            style={{
              background: "#13131f", border: "1px solid #2a2a3e",
              color: "#e8e8f0", padding: "7px 12px", borderRadius: 7,
              fontSize: 13, fontFamily: "monospace", outline: "none", width: 280,
            }}
          />
        </div>

        {/* Stock grid */}
        <div style={{
          background: "#0d0d17", border: `1px solid #1e1e2e`,
          borderTop: `3px solid ${accentColor}`,
          borderRadius: 10, overflow: "hidden",
        }}>
          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "90px 1fr 120px 120px",
            padding: "8px 16px", borderBottom: "1px solid #1a1a2e",
            fontFamily: "monospace", fontSize: 10, color: "#44445a",
            letterSpacing: 1, textTransform: "uppercase",
          }}>
            <span>Ticker</span>
            <span>Company</span>
            <span style={{ textAlign: "right" }}>Watchlist</span>
            <span style={{ textAlign: "right" }}>Analyze</span>
          </div>

          {filteredStocks.map((stock, i) => (
            <div key={stock.ticker} style={{
              display: "grid", gridTemplateColumns: "90px 1fr 120px 120px",
              padding: "11px 16px", alignItems: "center",
              borderBottom: i < filteredStocks.length - 1 ? "1px solid #13131f" : "none",
              background: i % 2 === 0 ? "transparent" : "#0a0a14",
            }}>
              <span style={{ fontFamily: "monospace", fontSize: 14, color: accentColor, fontWeight: "bold" }}>
                {stock.ticker}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#c0c0d8" }}>
                {stock.name}
              </span>
              <div style={{ textAlign: "right" }}>
                <button
                  onClick={() => handleWatch(stock.ticker, stock.name)}
                  disabled={savingTicker === stock.ticker}
                  style={{
                    background: saved.has(stock.ticker) ? "#22c55e22" : "transparent",
                    border: `1px solid ${saved.has(stock.ticker) ? "#22c55e44" : "#2a2a3e"}`,
                    color: saved.has(stock.ticker) ? "#22c55e" : "#6666aa",
                    padding: "4px 10px", borderRadius: 5,
                    fontSize: 11, fontFamily: "monospace", cursor: "pointer",
                  }}>
                  {saved.has(stock.ticker) ? "✓ Saved" : savingTicker === stock.ticker ? "…" : "+ Watch"}
                </button>
              </div>
              <div style={{ textAlign: "right" }}>
                <button
                  onClick={() => router.push(`/?ticker=${stock.ticker}`)}
                  style={{
                    background: "#6b7aff22", border: "1px solid #6b7aff44",
                    color: "#6b7aff", padding: "4px 12px", borderRadius: 5,
                    fontSize: 11, fontFamily: "monospace", cursor: "pointer",
                  }}>
                  Analyze →
                </button>
              </div>
            </div>
          ))}

          {filteredStocks.length === 0 && (
            <div style={{ padding: "2rem", textAlign: "center",
              fontFamily: "monospace", fontSize: 12, color: "#33334d" }}>
              No results for "{search}"
            </div>
          )}
        </div>

        <p style={{ fontFamily: "monospace", fontSize: 10, color: "#22223a", marginTop: 12 }}>
          Analysis reads complete SEC 10-K annual reports, 10-Q quarterly filings, and 8-K current reports.
          Financial metrics are verified directly from XBRL data — no estimates.
        </p>
      </div>
    </main>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "monospace", color: "#6b7aff" }}>Loading screener…</span>
      </main>
    }>
      <ScreenerInner />
    </Suspense>
  );
}
