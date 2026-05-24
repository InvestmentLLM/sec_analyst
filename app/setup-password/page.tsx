"use client";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SetupPasswordPage() {
  const [password,    setPassword]    = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPass) { setError("Passwords do not match."); return; }
    if (password.length < 8)      { setError("Password must be at least 8 characters."); return; }
    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    });

    if (error) { setError(error.message); setLoading(false); return; }
    window.location.href = "/dashboard";
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
        </div>

        <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e", borderRadius: 12, padding: "1.8rem" }}>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7aff",
            letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
            One Last Step
          </p>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#6666aa",
            marginBottom: 20, lineHeight: 1.6 }}>
            Set a password so you can sign in quickly next time.
          </p>

          <form onSubmit={handleSubmit}>
            <label style={{ fontFamily: "monospace", fontSize: 10, color: "#44445a",
              display: "block", marginBottom: 6, letterSpacing: 0.5 }}>PASSWORD</label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              style={{ width: "100%", background: "#13131f", border: "1px solid #2a2a3e",
                color: "#e8e8f0", padding: "10px 12px", borderRadius: 7,
                fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
            />

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

            {error && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#ef4444", marginTop: 8 }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || !password || !confirmPass}
              style={{ marginTop: 16, width: "100%", background: "#6b7aff",
                border: "none", color: "#fff", padding: "11px", borderRadius: 7,
                fontSize: 14, fontWeight: "bold",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading || !password || !confirmPass ? 0.6 : 1 }}>
              {loading ? "Setting password…" : "Set Password & Continue"}
            </button>
          </form>

          <button
            onClick={() => { window.location.href = "/dashboard"; }}
            style={{ marginTop: 14, width: "100%", background: "transparent", border: "none",
              color: "#33334d", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
            Skip for now
          </button>
        </div>
      </div>
    </main>
  );
}
