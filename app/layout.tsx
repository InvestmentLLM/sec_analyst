import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Nav from "../components/Nav";

export const metadata: Metadata = {
  title: "SEC Lens — AI-Powered SEC Filing Analyzer",
  description: "Deep AI analysis of SEC 10-K, 10-Q, and 8-K filings. Verified financial metrics from XBRL. No estimates, no guesses.",
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
