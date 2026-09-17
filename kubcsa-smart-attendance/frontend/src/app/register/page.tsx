"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function RegisterGateway() {
  return <main className="gateway-page"><div className="gateway-shell"><div className="gateway-brand"><span className="brand-mark">K</span><div><strong>KUBCSA</strong><span>ATTENDANCE SYSTEM</span></div></div><p className="eyebrow">WELCOME TO KUBCSA</p><h1>Start with the right access.</h1><p className="gateway-intro">Choose your role to continue. Students can register and check in. Administrators can create events and manage attendance.</p><div className="role-grid"><Link className="role-card student-role" href="/check-in"><span className="role-icon">✓</span><div><span className="role-kicker">FOR STUDENTS</span><h2>Register & sign attendance</h2><p>Enter your student details, verify your location, and scan the event code.</p></div><span className="role-arrow">→</span></Link><Link className="role-card admin-role" href="/admin-register"><span className="role-icon">▣</span><div><span className="role-kicker">FOR OFFICIALS</span><h2>Set up admin access</h2><p>Create an account to manage events, QR codes, attendance, and reports.</p></div><span className="role-arrow">→</span></Link></div><div className="gateway-trust"><span>✓ Secure registration</span><span>⌖ GPS verified</span><span>▦ QR protected</span></div><p className="gateway-footer">Already an administrator? <Link href="/login">Sign in to dashboard</Link></p></div></main>;
}

export function AdminRegistrationForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); setLoading(true); try { const response = await fetch(`${apiUrl}/api/auth/register-admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to create account"); setCreated(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create account"); } finally { setLoading(false); } }
  if (created) return <main className="auth-page"><div className="auth-card success-state"><div className="success-mark">✓</div><p className="eyebrow">ACCOUNT CREATED</p><h1>Admin registration complete.</h1><p>Your account is ready. Sign in to open the KUBCSA dashboard.</p><Link className="primary-button checkin-button" href="/login">Go to admin login</Link></div></main>;
  return <main className="auth-page"><div className="auth-card"><Link className="checkin-brand" href="/register"><span className="brand-mark">K</span><strong>KUBCSA</strong></Link><p className="eyebrow">ADMIN ACCESS REQUEST</p><h1>Request admin access</h1><p className="auth-intro">Submit your details for approval by an existing KUBCSA administrator. You will not be able to sign in until approved.</p><form onSubmit={submit}><label>Full name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>{error && <div className="form-error">{error}</div>}<button className="primary-button auth-submit" disabled={loading}>{loading ? "Submitting request..." : "Submit approval request"}</button></form><p className="auth-note">Only approved administrators can access the dashboard.</p></div></main>;
}
