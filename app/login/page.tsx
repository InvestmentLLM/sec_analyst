"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

type Mode = "password" | "magic" | "reset";

export default function LoginPage() {
  const [mode,     setMode]     = useState<Mode>("password");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [sent,     setSent]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message);
      else window.location.href = "/dashboard";

    } else if (mode === "magic" || mode === "reset") {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
      else setSent(true);
    }
    setLoading(false);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 1.5rem" }}>

        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div>
            <span style={{ fontSize: 30, color: "#e8e8f0", fontWeight: 700 }}>SEC</span>
            <span style={{ fontSize: 30, fontStyle: "italic", color: "#6b7aff", fontWeight: 700 }}>Lens</span>
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#33334d", marginTop: 8, letterSpacing: 1.5 }}>
            AI-POWERED SEC FILING ANALYZER
          </p>
        </div>

        <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e", borderRadius: 12, padding: "1.8rem" }}>

          {/* Email sent confirmation */}
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 38, marginBottom: 16 }}>✉</div>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: "#c0c0d8", lineHeight: 1.8, marginBottom: 6 }}>
                {mode === "reset" ? "Password reset link sent to" : "Sign-in link sent to"}
              </p>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: "#6b7aff", marginBottom: 16 }}>
                {email}
              </p>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a", lineHeight: 1.7 }}>
                Check your inbox and click the link.<br/>It expires in 1 hour.
              </p>
              <button onClick={() => { setSent(false); setEmail(""); setMode("password"); }}
                style={{ marginTop: 20, background: "transparent", border: "none",
                  color: "#6b7aff", fontFamily: "monospace", fontSize: 12,
                  cursor: "pointer", textDecoration: "underline" }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
                letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 18 }}>
                {mode === "password" ? "Sign In" : mode === "magic" ? "New User" : "Forgot Password"}
              </p>

              <form onSubmit={handleSubmit}>
                <label style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
                  display: "block", marginBottom: 6, letterSpacing: 0.5 }}>EMAIL</label>
                <input
                  type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ width: "100%", background: "#13131f", border: "1px solid #2a2a3e",
                    color: "#e8e8f0", padding: "10px 12px", borderRadius: 7,
                    fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
                />

                {mode === "password" && (
                  <>
                    <label style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
                      display: "block", marginTop: 12, marginBottom: 6, letterSpacing: 0.5 }}>PASSWORD</label>
                    <input
                      type="password" required value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Your password"
                      style={{ width: "100%", background: "#13131f", border: "1px solid #2a2a3e",
                        color: "#e8e8f0", padding: "10px 12px", borderRadius: 7,
                        fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
                    />
                  </>
                )}

                {error && (
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: "#ef4444", marginTop: 8 }}>
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading || !email.trim()}
                  style={{ marginTop: 16, width: "100%", background: "#6b7aff",
                    border: "none", color: "#fff", padding: "11px", borderRadius: 7,
                    fontSize: 14, fontWeight: "bold",
                    cursor: loading || !email.trim() ? "not-allowed" : "pointer",
                    opacity: loading || !email.trim() ? 0.6 : 1 }}>
                  {loading ? "…" : mode === "password" ? "Sign In" : "Send link"}
                </button>
              </form>

              {/* Footer links */}
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                {mode === "password" && (
                  <>
                    <button onClick={() => { setMode("magic"); setError(""); setPassword(""); }}
                      style={{ background: "transparent", border: "none", color: "#44445a",
                        fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
                      New user? Sign up with magic link
                    </button>
                    <button onClick={() => { setMode("reset"); setError(""); setPassword(""); }}
                      style={{ background: "transparent", border: "none", color: "#44445a",
                        fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
                      Forgot password?
                    </button>
                  </>
                )}
                {(mode === "magic" || mode === "reset") && (
                  <button onClick={() => { setMode("password"); setError(""); }}
                    style={{ background: "transparent", border: "none", color: "#44445a",
                      fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
                    ← Back to sign in
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
