"use client";

import { useState, type FormEvent } from "react";

export default function Login({ usernameRequired, configured }: { usernameRequired: boolean; configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      if (response.ok) { window.location.reload(); return; }
      setError(response.status === 401 ? "Incorrect credentials. Please try again."
        : response.status === 429 ? "Too many attempts. Try again in a minute."
        : "Sign-in is unavailable. Please contact the person who invited you.");
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    }
    setPending(false);
  }

  return <section className="login-panel my-auto py-5 mx-auto w-100">
    <h2 className="h5 mb-2">User testing</h2>
    <p className="text-body-secondary mb-4">Enter the shared password to start a conversation.</p>
    {!configured && <p role="alert" className="alert alert-secondary">Testing access is not configured yet.</p>}
    <form onSubmit={login}>
      {usernameRequired && <div className="mb-3">
        <label htmlFor="username" className="form-label">Username</label>
        <input id="username" name="username" className="form-control" autoComplete="username" required disabled={pending || !configured} />
      </div>}
      <div className="mb-3">
        <label htmlFor="password" className="form-label">Password</label>
        <input id="password" name="password" type="password" className="form-control" autoComplete="current-password" required autoFocus disabled={pending || !configured} />
      </div>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      <button className="btn btn-dark w-100" disabled={pending || !configured}>{pending ? "Signing in…" : "Enter"}</button>
    </form>
  </section>;
}
