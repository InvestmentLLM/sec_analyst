"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

type Mode = "signin" | "signup" | "reset" | "magic";

export default function LoginPage() {
  const [mode,        setMode]        = useState<Mode>("signin");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message);
      else window.location.href = "/dashboard";

    } else if (mode === "signup") {
      if (password !== confirmPass) { setError("Passwords do not match."); setLoading(false); return; }
      if (password.length < 8)      { setError("Password must be at least 8 characters."); setLoading(false); return; }
      const { error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setError(error.message);
      else setSuccess("Account created — check your email to confirm, then sign in.");

    } else if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) setError(error.message);
      else setSuccess("Password reset email sent. Check your inbox.");

    } else if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
      else setSuccess("Magic link sent. Check your inbox.");
    }
    setLoading(false);
  }

  const titles: Record<Mode, string> = {
    signin: "Sign In",
    signup: "Create Account",
    reset:  "Reset Password",
    magic:  "Magic Link",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 1.5rem" }}>

        {/* Logo */}
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

          {/* Mode tabs (only show signin/signup) */}
          {(mode === "signin" || mode === "signup") && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20,
              background: "#13131f", borderRadius: 7, padding: 3 }}>
              {(["signin", "signup"] as Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                  style={{
                    flex: 1, padding: "6px", borderRadius: 5, border: "none",
                    background: mode === m ? "#1e1e3a" : "transparent",
                    color: mode === m ? "#e8e8f0" : "#44445a",
                    fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                  }}>
                  {m === "signin" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {/* Back link for reset / magic */}
          {(mode === "reset" || mode === "magic") && (
            <button onClick={() => { setMode("signin"); setError(""); setSuccess(""); }}
              style={{ background: "transparent", border: "none", color: "#6666aa",
                fontFamily: "monospace", fontSize: 11, cursor: "pointer", marginBottom: 16,
                padding: 0, textDecoration: "underline" }}>
              ← Back to Sign In
            </button>
          )}

          {/* Title */}
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
            letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 18 }}>
            {titles[mode]}
          </p>

          {/* Success message */}
          {success && (
            <div style={{ background: "#0d2218", border: "1px solid #1a4a2e",
              borderRadius: 7, padding: "10px 12px", marginBottom: 14,
              fontFamily: "monospace", fontSize: 12, color: "#4ade80", lineHeight: 1.5 }}>
              {success}
            </div>
          )}

          {/* Form */}
          {!success && (
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

              {(mode === "signin" || mode === "signup") && (
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
                  border: "none", color: "#fff", padding: "10px", borderRadius: 7,
                  fontSize: 14, fontWeight: "bold",
                  cursor: loading || !email.trim() ? "not-allowed" : "pointer",
                  opacity: loading || !email.trim() ? 0.6 : 1 }}>
                {loading ? "…" : titles[mode]}
              </button>
            </form>
          )}

          {/* Footer links */}
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            {mode === "signin" && (
              <>
                <button onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}
                  style={{ background: "transparent", border: "none", color: "#44445a",
                    fontFamily: "monospace", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                  Forgot password?
                </button>
                <button onClick={() => { setMode("magic"); setError(""); setSuccess(""); }}
                  style={{ background: "transparent", border: "none", color: "#44445a",
                    fontFamily: "monospace", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                  Use magic link instead
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
