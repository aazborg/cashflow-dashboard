"use client";

import { useState, useTransition } from "react";
import { sendMagicLink } from "@/lib/auth-actions";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const fd = new FormData();
    fd.set("email", email);
    startTransition(async () => {
      const r = await sendMagicLink(fd);
      setResult(r);
      if (r.ok) setEmail("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-[color:var(--muted)]">E-Mail</span>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firma.at"
          className="mt-1 block w-full border border-[color:var(--border)] rounded px-3 py-2 text-sm bg-white"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="w-full bg-[color:var(--brand-blue)] text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
      >
        {pending ? "Sende Link…" : "Login-Link schicken"}
      </button>
      {result ? (
        <div
          className={`text-xs px-3 py-2 rounded ${
            result.ok
              ? "bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green)] border border-[color:var(--brand-green)]/40"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
