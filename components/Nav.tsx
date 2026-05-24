"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Nav() {
  const [email, setEmail] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (pathname === "/login") return null;

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/screener",  label: "Screener"  },
    { href: "/",          label: "Analyze"   },
  ];

  return (
    <header style={{
      borderBottom: "1px solid #1e1e2e",
      background: "#0d0d17",
      padding: "0 1.5rem",
      height: 50,
      display: "flex",
      alignItems: "center",
      gap: 20,
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", gap: 1 }}>
        <span style={{ fontSize: 18, color: "#e8e8f0", fontWeight: 700 }}>SEC</span>
        <span style={{ fontSize: 18, fontStyle: "italic", color: "#6b7aff", fontWeight: 700 }}>Lens</span>
      </Link>

      <nav style={{ display: "flex", gap: 2 }}>
        {links.map(({ href, label }) => (
          <Link key={href} href={href} style={{
            padding: "4px 13px",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "monospace",
            color: pathname === href ? "#e8e8f0" : "#6666aa",
            background: pathname === href ? "#1e1e3a" : "transparent",
            textDecoration: "none",
            letterSpacing: 0.3,
          }}>
            {label}
          </Link>
        ))}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {email && (
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a" }}>
            {email}
          </span>
        )}
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
          style={{
            background: "transparent", border: "1px solid #2a2a3e", color: "#44445a",
            padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "monospace", cursor: "pointer",
          }}>
          sign out
        </button>
      </div>
    </header>
  );
}
