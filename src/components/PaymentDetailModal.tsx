/**
 * Detail-Modal fuer einen Kunden in /zahlungen:
 * - Stammdaten aus deal
 * - Alle GC-Payments mit Status, Datum, Betrag, Beschreibung
 * - Instalment-Schedule-Info (Plan-Name, Total)
 *
 * Fetcht /cashflow/api/bot/gocardless/customer-payments?customer_id=X
 * im open-state. Read-only.
 */
"use client";

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/types";

interface Payment {
  id: string;
  amount_cents: number | null;
  currency?: string | null;
  status: string | null;
  charge_date: string | null;
  description: string | null;
  reference: string | null;
  created_at: string | null;
  mandate_id?: string | null;
  subscription_id?: string | null;
  instalment_schedule_id?: string | null;
}

interface InstalmentSchedule {
  id: string;
  name: string | null;
  status: string | null;
  total_amount: number | null;
  currency?: string | null;
}

interface Response {
  customer_id: string;
  env: string;
  payments: Payment[];
  instalment_schedules: InstalmentSchedule[];
}

interface Props {
  deal: Deal;
  onClose: () => void;
}

function DunningBtns({ dealId }: { dealId: string }) {
  const [busy, setBusy] = useState<"1" | "2" | "ink" | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  async function trigger(stufe: 1 | 2) {
    const label = stufe === 1 ? "1. Mahnung" : "2. Mahnung";
    if (!window.confirm(
      `${label} jetzt auslösen?\n\n` +
      `Es wird:\n` +
      `  • eine 30,00 € Rückbuchungsgebühr via GoCardless eingezogen\n` +
      `  • eine ${label}-Email an den Kunden gesendet\n` +
      `  • der Status auf 'mahnung_${stufe}' gesetzt` +
      (stufe === 2 ? `\n  • Inkasso-Frist auf +7 Tage gesetzt` : "")
    )) return;
    setBusy(String(stufe) as "1" | "2");
    setErr(""); setMsg("");
    try {
      const res = await fetch("/cashflow/api/bot/dunning/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId, stufe }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || `HTTP ${res.status}`);
      } else {
        setMsg(`✓ ${label} ausgelöst (Fee-Payment: ${j.fee_payment_id ?? "—"}, Email: ${j.email_message_id ? "OK" : "FAIL"})`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function triggerInkasso(testMode: boolean) {
    const confirmMsg = testMode
      ? "Inkasso-Test versenden?\n\nEmail geht an deine Adresse (nicht an Ergo)."
      : "Inkasso jetzt an Ergo Versicherung versenden?\n\n" +
        "Dies leitet die offene Forderung an die Inkassostelle weiter.\n" +
        "Email mit Vertrag + Rechnung als Anhang geht an:\n" +
        "  rechtsservice-inkasso@ergo-versicherung.at";
    if (!window.confirm(confirmMsg)) return;
    setBusy("ink"); setErr(""); setMsg("");
    try {
      const body: Record<string, unknown> = { deal_id: dealId };
      if (testMode) body.test_to_override = "mario.grabner@mynlp.at";
      const res = await fetch("/cashflow/api/bot/dunning/inkasso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || `HTTP ${res.status}`);
      } else {
        const att: string = (j.attachments ?? []).join(", ") || "(keine)";
        const tag = testMode ? "TEST" : "INKASSO";
        setMsg(`✓ ${tag} an ${j.to} versendet. Anhänge: ${att}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded p-2 bg-amber-50 border border-amber-300 space-y-2">
      <div className="text-[10px] font-semibold uppercase text-amber-900/80">
        Mahnungs-Workflow
      </div>
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <button
          type="button"
          onClick={() => trigger(1)}
          disabled={busy !== null}
          className="px-2 py-1 rounded border border-amber-500 text-amber-900 hover:bg-amber-200 disabled:opacity-40"
        >
          {busy === "1" ? "…" : "1. Mahnung + 30 € Gebühr"}
        </button>
        <button
          type="button"
          onClick={() => trigger(2)}
          disabled={busy !== null}
          className="px-2 py-1 rounded border border-red-500 text-red-900 hover:bg-red-100 disabled:opacity-40"
        >
          {busy === "2" ? "…" : "2. Mahnung + 30 € Gebühr"}
        </button>
        <button
          type="button"
          onClick={() => triggerInkasso(true)}
          disabled={busy !== null}
          className="px-2 py-1 rounded border border-gray-500 text-gray-900 hover:bg-gray-200 disabled:opacity-40"
          title="Inkasso-Test (Email an dich statt Ergo)"
        >
          {busy === "ink" ? "…" : "Inkasso-TEST"}
        </button>
        <button
          type="button"
          onClick={() => triggerInkasso(false)}
          disabled={busy !== null}
          className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
          title="Inkasso an Ergo Versicherung – IRREVERSIBEL"
        >
          {busy === "ink" ? "…" : "🚨 Inkasso an Ergo"}
        </button>
      </div>
      {msg ? <div className="text-xs text-green-700">{msg}</div> : null}
      {err ? <div className="text-xs text-red-700">Fehler: {err}</div> : null}
    </div>
  );
}

function CancelMandateBtn({
  mandateId,
  mandateStatus,
}: {
  mandateId: string;
  mandateStatus: string | null | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string>("");

  const inactive =
    mandateStatus === "cancelled" ||
    mandateStatus === "expired" ||
    mandateStatus === "blocked";
  if (inactive) {
    return (
      <span className="text-xs text-[color:var(--muted)]">
        Mandat ist bereits {mandateStatus}
      </span>
    );
  }

  async function cancel() {
    const reason =
      window.prompt(
        "Mandat unwiderruflich stornieren?\n\nGrund (optional, max 50 Zeichen):",
        "",
      );
    if (reason === null) return; // abgebrochen
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/cashflow/api/bot/gocardless/cancel-mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandate_id: mandateId, reason }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || `HTTP ${res.status}`);
        return;
      }
      setDone(j.status ?? "cancelled");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="text-xs text-green-700">
        ✓ Storniert (Status: {done}). Seite neu laden um zu aktualisieren.
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
        title="Mandat unwiderruflich stornieren"
      >
        {busy ? "storniere…" : "Mandat stornieren"}
      </button>
      {err ? <span className="text-xs text-red-700">{err}</span> : null}
    </div>
  );
}

const eur = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("de-AT", {
    style: "currency",
    currency: "EUR",
  });

const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("de-AT") : "—";

const formatDateTime = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("de-AT", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function statusBadge(status: string | null): {
  cls: string;
  label: string;
} {
  const s = status ?? "—";
  if (s === "confirmed" || s === "paid_out") {
    return {
      cls: "bg-green-100 text-green-900 border-green-300",
      label: "✓ " + s,
    };
  }
  if (
    s === "pending_submission" ||
    s === "submitted" ||
    s === "pending_customer_approval"
  ) {
    return {
      cls: "bg-amber-100 text-amber-900 border-amber-300",
      label: "⏳ " + s,
    };
  }
  if (
    s === "failed" ||
    s === "charged_back" ||
    s === "cancelled" ||
    s === "customer_approval_denied"
  ) {
    return {
      cls: "bg-red-100 text-red-900 border-red-300",
      label: "✗ " + s,
    };
  }
  return {
    cls: "bg-gray-100 text-gray-700 border-gray-300",
    label: s,
  };
}

export default function PaymentDetailModal({ deal, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<Response | null>(null);

  useEffect(() => {
    const customerId = deal.gocardless_customer_id;
    if (!customerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(
          `/cashflow/api/bot/gocardless/customer-payments?customer_id=${encodeURIComponent(
            customerId,
          )}`,
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const j = (await res.json()) as Response;
        setData(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [deal.gocardless_customer_id]);

  const paid = (data?.payments ?? []).filter(
    (p) => p.status === "confirmed" || p.status === "paid_out",
  );
  const paidCents = paid.reduce((acc, p) => acc + (p.amount_cents ?? 0), 0);
  const totalCents = (data?.payments ?? []).reduce(
    (acc, p) => acc + (p.amount_cents ?? 0),
    0,
  );
  const openCents = totalCents - paidCents;

  const isSandbox = data?.env === "sandbox";
  const sbx = isSandbox ? " (SBX)" : "";

  // Sort payments: future first (oldest charge_date last for past)
  const sorted = (data?.payments ?? []).slice().sort((a, b) => {
    const da = a.charge_date ?? "9999-99-99";
    const db = b.charge_date ?? "9999-99-99";
    return da.localeCompare(db);
  });

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[color:var(--border)] sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">
              {deal.nachname}
              {deal.vorname ? `, ${deal.vorname}` : ""}
            </h2>
            <div className="text-xs text-[color:var(--muted)]">
              {deal.email} · {deal.mitarbeiter_name}
              {data?.customer_id ? ` · GC ${data.customer_id}` : ""}
              {sbx}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] p-1"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {!deal.gocardless_customer_id ? (
            <div className="rounded p-3 text-sm bg-amber-50 border border-amber-300 text-amber-900">
              Kein GoCardless-Customer für diesen Deal hinterlegt. Mandat
              muss noch angelegt werden (siehe Deal-Zeile in /daten).
            </div>
          ) : loading ? (
            <div className="text-sm text-[color:var(--muted)] py-8 text-center">
              Lade Zahlungen aus GoCardless …
            </div>
          ) : error ? (
            <div className="rounded p-3 text-sm bg-red-50 border border-red-300 text-red-900">
              Fehler: {error}
            </div>
          ) : data ? (
            <>
              {/* Summen */}
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-blue-50 rounded border border-blue-300 p-2">
                  <div className="text-[10px] uppercase text-blue-900/70">
                    Geplant (Total)
                  </div>
                  <div className="font-semibold tabular-nums text-blue-900">
                    {eur(totalCents)}
                  </div>
                  <div className="text-[10px] text-blue-900/60">
                    {sorted.length} Zahlungen
                  </div>
                </div>
                <div className="bg-green-50 rounded border border-green-300 p-2">
                  <div className="text-[10px] uppercase text-green-900/70">
                    Bezahlt
                  </div>
                  <div className="font-semibold tabular-nums text-green-900">
                    {eur(paidCents)}
                  </div>
                  <div className="text-[10px] text-green-900/60">
                    {paid.length}×
                  </div>
                </div>
                <div className="bg-amber-50 rounded border border-amber-300 p-2">
                  <div className="text-[10px] uppercase text-amber-900/70">
                    Offen
                  </div>
                  <div className="font-semibold tabular-nums text-amber-900">
                    {eur(openCents)}
                  </div>
                </div>
              </div>

              {/* Instalment-Schedule-Info */}
              {data.instalment_schedules.length > 0 ? (
                <div className="rounded p-3 text-xs bg-gray-50 border border-gray-200 space-y-1">
                  {data.instalment_schedules.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[color:var(--muted)]">
                        {s.id}
                      </span>
                      <span className="font-medium">{s.name}</span>
                      <span className="ml-auto tabular-nums">
                        {eur(s.total_amount)}
                      </span>
                      <span
                        className={
                          "text-[10px] px-1.5 py-0.5 rounded uppercase " +
                          (s.status === "active"
                            ? "bg-green-200 text-green-900"
                            : "bg-gray-200 text-gray-700")
                        }
                      >
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Zahlungs-Liste */}
              <div className="border border-[color:var(--border)] rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[color:var(--surface)] text-xs uppercase">
                    <tr className="text-left">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Datum</th>
                      <th className="px-3 py-2 text-right">Betrag</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Beschreibung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-sm text-[color:var(--muted)]"
                        >
                          Noch keine Zahlungen bei GoCardless angelegt.
                        </td>
                      </tr>
                    ) : (
                      sorted.map((p, i) => {
                        const stat = statusBadge(p.status);
                        return (
                          <tr
                            key={p.id}
                            className="border-t border-[color:var(--border)]"
                          >
                            <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                              {i + 1}
                            </td>
                            <td className="px-3 py-2">
                              {formatDate(p.charge_date)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {eur(p.amount_cents)}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border " +
                                  stat.cls
                                }
                                title={`Erstellt: ${formatDateTime(p.created_at)}`}
                              >
                                {stat.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                              {p.description || "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Aktionen */}
              {deal.gocardless_mandate_id ? (
                <div className="space-y-2 pt-2 border-t border-[color:var(--border)]">
                  <DunningBtns dealId={deal.id} />
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <CancelMandateBtn
                      mandateId={deal.gocardless_mandate_id}
                      mandateStatus={deal.gocardless_mandate_status}
                    />
                    <a
                      href={`https://manage${isSandbox ? "-sandbox" : ""}.gocardless.com/customers/${data.customer_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[color:var(--brand-orange)] hover:underline"
                    >
                      In GoCardless öffnen ↗
                    </a>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
