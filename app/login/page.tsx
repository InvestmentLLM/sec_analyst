"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail]   = useState("");
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 1.5rem" }}>

        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div>
            <span style={{ fontSize: 28, color: "#e8e8f0" }}>SEC</span>
            <span style={{ fontSize: 28, fontStyle: "italic", color: "#6b7aff" }}>Lens</span>
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d",
            marginTop: 8, letterSpacing: 1 }}>SEC FILING ANALYZER</p>
        </div>

        <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e",
          borderRadius: 12, padding: "1.8rem" }}>
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>✉</div>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: "#c0c0d8", lineHeight: 1.8 }}>
                Check your inbox for<br/>
                <span style={{ color: "#6b7aff" }}>{email}</span>
              </p>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a", marginTop: 10 }}>
                Click the link to sign in — no password needed.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                style={{ marginTop: 20, background: "transparent", border: "none",
                  color: "#6b7aff", fontFamily: "monospace", fontSize: 12,
                  cursor: "pointer", textDecoration: "underline" }}>
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7aff",
                letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 20 }}>
                Sign In
              </p>

              <label style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a",
                display: "block", marginBottom: 7 }}>EMAIL</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ width: "100%", background: "#13131f", border: "1px solid #2a2a3e",
                  color: "#e8e8f0", padding: "10px 12px", borderRadius: 7,
                  fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
              />

              {error && (
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#ef4444", marginTop: 8 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{ marginTop: 16, width: "100%", background: "#6b7aff",
                  border: "none", color: "#fff", padding: "10px", borderRadius: 7,
                  fontSize: 14, fontWeight: "bold",
                  cursor: loading || !email.trim() ? "not-allowed" : "pointer",
                  opacity: loading || !email.trim() ? 0.6 : 1 }}>
                {loading ? "Sending…" : "Send magic link"}
              </button>

              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#33334d",
                marginTop: 14, textAlign: "center", lineHeight: 1.6 }}>
                We'll email you a sign-in link.<br/>No password needed.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
