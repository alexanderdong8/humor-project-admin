"use client";

import { useState, useTransition } from "react";
import { checkSignup } from "./actions";
import ui from "@/components/ui.module.css";

/** Try an address against the current domain list and whitelist. */
export function SignupChecker() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ email: string; allowed?: boolean; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className={ui.card} style={{ marginBottom: "1rem" }}>
      <div className={ui.cardHead}>
        <div>
          <h2 className={ui.cardTitle}>Check an address</h2>
          <p className={ui.cardSub}>Runs the same database check Supabase runs when a new account is created.</p>
        </div>
      </div>
      <form
        className={ui.search}
        style={{ width: "min(100%, 460px)" }}
        onSubmit={(e) => {
          e.preventDefault();
          const value = email;
          startTransition(async () => {
            const r = await checkSignup(value);
            setResult({ email: value.trim().toLowerCase(), allowed: r.allowed, message: r.ok ? undefined : r.message });
          });
        }}
      >
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="someone@columbia.edu"
          aria-label="Email address to check"
          required
        />
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Checking…" : "Check"}
        </button>
      </form>
      {result && (
        <p style={{ marginTop: "0.75rem" }} role="status">
          {result.message ? (
            <span className={ui.error}>{result.message}</span>
          ) : result.allowed ? (
            <span className="pill pill-good">✓ Can sign up</span>
          ) : (
            <span className="pill pill-warn">✕ Would be turned away</span>
          )}{" "}
          {!result.message && <span className="mono">{result.email}</span>}
        </p>
      )}
    </section>
  );
}
