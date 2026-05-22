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
