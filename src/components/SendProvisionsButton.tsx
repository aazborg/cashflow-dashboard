"use client";

import { useState, useTransition } from "react";
import {
  sendProvisionsNowAction,
  type SendProvisionsResult,
} from "@/lib/actions";

function defaultMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

export default function SendProvisionsButton() {
  const [month, setMonth] = useState(defaultMonth());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SendProvisionsResult | null>(null);

  function send() {
    if (
      !confirm(
        `Provisions-Mail für ${month} JETZT an die Steuerberatung versenden?`,
      )
    )
      return;
    setResult(null);
    const fd = new FormData();
    fd.set("month", month);
    startTransition(async () => {
      try {
        const res = await sendProvisionsNowAction(fd);
        setResult(res);
      } catch (err) {
        setResult({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-[color:var(--border)]">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-[color:var(--muted)] inline-flex items-center gap-2">
          Abrechnungsmonat
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1 text-sm bg-white tabular-nums"
          />
        </label>
        <button
          type="button"
          onClick={send}
          disabled={pending || !/^\d{4}-\d{2}$/.test(month)}
          className="bg-[color:var(--brand-blue)] text-white text-sm px-4 py-1.5 rounded disabled:opacity-50"
        >
          {pending ? "Wird gesendet …" : "Provisions-Mail jetzt senden"}
        </button>
        <span className="text-xs text-[color:var(--muted)]">
          Sendet die monatliche Mail an die Steuerberatung (Plank) mit dir in CC.
        </span>
      </div>

      {result ? (
        <div
          className={`mt-3 text-sm rounded px-3 py-2 border ${
            result.ok
              ? "border-[color:var(--brand-green)]/40 bg-[color:var(--brand-green)]/10 text-[color:var(--brand-green)]"
              : "border-[color:var(--brand-orange)]/40 bg-[color:var(--brand-yellow)]/10 text-[color:var(--brand-orange)]"
          }`}
        >
          <div className="font-medium">
            {result.ok ? "✓ Versendet" : "Nicht versendet"}
          </div>
          <div className="text-[color:var(--foreground)] mt-1">
            {result.message}
          </div>
          {result.missing && result.missing.length > 0 ? (
            <ul className="mt-2 list-disc list-inside text-[color:var(--foreground)]">
              {result.missing.map((m, i) => (
                <li key={i}>
                  {m.name}
                  {m.setter_hours ? ` (${m.setter_hours})` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
