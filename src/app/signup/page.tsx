
"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setMessage("");
  setLoading(true);

  const supabase = createClient();

  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });

  setLoading(false);

  if (error) {
    setMessage(error.message);
    return;
  }

  setMessage(
    "Signup successful! Check your email to confirm your account."
  );
}

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSignup}>
        <Link href="/" className="auth-brand">contri<span>.</span></Link>
        <p className="auth-eyebrow">GET STARTED FOR FREE</p>
        <h1>Create your account</h1>
        <p className="auth-description">
          Split expenses, manage groups, and keep everyone in sync.
        </p>

        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Create account →"}
        </button>

        {message && <p className="auth-message" role="status">{message}</p>}

        <p className="auth-switch">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}
