"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@kubcsa.org");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to sign in");
      localStorage.setItem("kubcsa_access_token", body.accessToken);
      localStorage.setItem("kubcsa_refresh_token", body.refreshToken);
      localStorage.setItem("kubcsa_user", JSON.stringify(body.user));
      router.replace("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><div className="auth-card"><div className="auth-brand"><span className="brand-mark">K</span><div><strong>KUBCSA</strong><span>ATTENDANCE SYSTEM</span></div></div><p className="eyebrow">ADMIN PORTAL</p><h1>Welcome back</h1><p className="auth-intro">Sign in to manage events, attendance, and QR verification.</p><form onSubmit={submit}><label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="form-error">{error}</div>}<button className="primary-button auth-submit" disabled={loading}>{loading ? "Signing in..." : "Sign in to dashboard"}</button></form><p className="auth-note">Authorized KUBCSA administrators only.</p></div></main>;
}
