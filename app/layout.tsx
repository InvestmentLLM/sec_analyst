import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Nav from "../components/Nav";

export const metadata: Metadata = {
  title: "SEC Lens — AI Stock Analysis",
  description: "Get a Buy / Sell verdict on any stock in 30 seconds. AI analysis of real SEC filings — financials, red flags, insider activity, and valuation vs. sector peers.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <Nav />
        </Suspense>
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
