"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Mode = "login" | "signup" | "reset";

function LoginContent() {
  const searchParams = useSearchParams();
  const [mode,        setMode]        = useState<Mode>("login");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [resetSent,   setResetSent]   = useState(false);

  useEffect(() => {
    // Clear any stale callback errors from the URL — no longer relevant
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message);
      else window.location.href = "/dashboard";

    } else if (mode === "signup") {
      if (password !== confirmPass) { setError("Passwords do not match."); setLoading(false); return; }
      if (password.length < 8)      { setError("Password must be at least 8 characters."); setLoading(false); return; }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { password_set: true } },
      });
      if (error) setError(error.message);
      else window.location.href = "/dashboard";

    } else if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/setup-password`,
      });
      if (error) setError(error.message);
      else setResetSent(true);
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

          {/* Password reset confirmation */}
          {resetSent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 38, marginBottom: 16 }}>✉</div>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: "#c0c0d8", lineHeight: 1.8, marginBottom: 6 }}>
                Password reset link sent to
              </p>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: "#6b7aff", marginBottom: 16 }}>
                {email}
              </p>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#44445a", lineHeight: 1.7 }}>
                Check your inbox and click the link.
              </p>
              <button onClick={() => { setResetSent(false); setEmail(""); setMode("login"); }}
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
                {mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
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

                {(mode === "login" || mode === "signup") && (
                  <>
                    <label style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
                      display: "block", marginTop: 12, marginBottom: 6, letterSpacing: 0.5 }}>PASSWORD</label>
                    <input
                      type="password" required value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "Min. 8 characters" : "Your password"}
                      style={{ width: "100%", background: "#13131f", border: "1px solid #2a2a3e",
                        color: "#e8e8f0", padding: "10px 12px", borderRadius: 7,
                        fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
                    />
                  </>
                )}

                {mode === "signup" && (
                  <>
                    <label style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
                      display: "block", marginTop: 12, marginBottom: 6, letterSpacing: 0.5 }}>CONFIRM PASSWORD</label>
                    <input
                      type="password" required value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                      placeholder="Repeat password"
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
                  {loading ? "…" : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
                </button>
              </form>

              {/* Footer links */}
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                {mode === "login" && (
                  <>
                    <button onClick={() => { setMode("signup"); setError(""); setPassword(""); setConfirmPass(""); }}
                      style={{ background: "transparent", border: "none", color: "#44445a",
                        fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
                      New user? Create account
                    </button>
                    <button onClick={() => { setMode("reset"); setError(""); setPassword(""); }}
                      style={{ background: "transparent", border: "none", color: "#44445a",
                        fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
                      Forgot password?
                    </button>
                  </>
                )}
                {(mode === "signup" || mode === "reset") && (
                  <button onClick={() => { setMode("login"); setError(""); setPassword(""); setConfirmPass(""); }}
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
