"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

const API = "/cashflow/api/buchhaltung";

type InboxInvoice = {
  id: string;
  lieferant_name: string | null;
  brutto: number | null;
  waehrung: string | null;
  rechnung_nr: string | null;
  rechnungsdatum: string | null;
  status: string;
  drive_file_url: string | null;
};

type Mail = {
  id: string;
  gmail_message_id: string;
  received_at: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  attachment_count: number;
  status: string;
  last_error: string | null;
  rechnung_link_url: string | null;
  processed_at: string | null;
  invoices?: InboxInvoice[] | null;
};

function eur(v: number | null | undefined, w = "EUR") {
  if (v == null) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: w || "EUR",
  }).format(Number(v));
}

const INV_STATUS_TONE: Record<string, string> = {
  bezahlt: "bg-emerald-100 text-emerald-800",
  offen: "bg-amber-100 text-amber-800",
  duplikat: "bg-gray-100 text-gray-500",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: "wartend", tone: "bg-gray-100 text-gray-700" },
  parsed: { label: "Rechnung", tone: "bg-emerald-100 text-emerald-800" },
  no_pdf: { label: "ohne PDF", tone: "bg-gray-100 text-gray-500" },
  link_found: { label: "Link", tone: "bg-sky-100 text-sky-800" },
  text_only: { label: "Text-Rechnung", tone: "bg-violet-100 text-violet-800" },
  self_sent: { label: "eigene Mail", tone: "bg-gray-50 text-gray-400" },
  rejected: { label: "verworfen", tone: "bg-amber-100 text-amber-800" },
  error: { label: "Fehler", tone: "bg-red-100 text-red-800" },
};

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Alle" },
  { key: "parsed", label: "Rechnungen" },
  { key: "link_found", label: "Link gefunden" },
  { key: "text_only", label: "Text-Rechnungen" },
  { key: "pending", label: "Wartend" },
  { key: "error", label: "Fehler" },
  { key: "no_pdf", label: "ohne PDF" },
  { key: "self_sent", label: "eigene Mails" },
  { key: "rejected", label: "Verworfen" },
];

export default function PosteingangClient() {
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [polling, setPolling] = useState(false);
  const [pollMsg, setPollMsg] = useState<string | null>(null);
  // Re-Process pro Mail-ID: { kind: 'loading' | 'ok' | 'err', msg }
  const [reprocess, setReprocess] = useState<Record<
    string,
    { kind: "loading" | "ok" | "err"; msg: string }
  >>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: "200" });
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`${API}/mails?${qs.toString()}`, { cache: "no-store" });
      // Defensiv: Vercel kann bei Function-Timeout / Crash HTML statt JSON
      // liefern. Vorher als Text lesen, dann JSON-Parse versuchen — sonst
      // sehen wir nur "SyntaxError: Unexpected token 'A'" ohne Kontext.
      const raw = await res.text();
      let j: { ok?: boolean; mails?: Mail[]; error?: string } | null = null;
      try { j = JSON.parse(raw); } catch { /* siehe unten */ }
      if (!j) {
        const head = raw.replace(/\s+/g, " ").trim().slice(0, 120);
        setError(`HTTP ${res.status} (keine JSON-Antwort) — ${head || "leer"}`);
        setMails([]);
        return;
      }
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        setMails([]);
        return;
      }
      setMails(j.mails ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const triggerPoll = useCallback(async () => {
    setPolling(true);
    setPollMsg(null);
    try {
      const res = await fetch(`${API}/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Limit 200 (vorher 50) — self_sent-Flut konnte sonst echte
        // Eingangsrechnungen aus dem 50-Mail-Window draengen.
        body: JSON.stringify({ limit_mails: 200 }),
      });
      const raw = await res.text();
      let j: { ok?: boolean; summary?: Record<string, unknown>; error?: string } | null = null;
      try { j = JSON.parse(raw); } catch { /* HTML-Fehlerseite o.ae. */ }
      if (!j) {
        const head = raw.replace(/\s+/g, " ").trim().slice(0, 120);
        setPollMsg(`Fehler: HTTP ${res.status} (keine JSON-Antwort) — ${head || "leer"}`);
        return;
      }
      if (!res.ok || !j.ok) {
        setPollMsg(`Fehler: ${j.error ?? res.status}`);
      } else {
        const s = (j.summary ?? {}) as Record<string, unknown>;
        setPollMsg(
          `OK — ${(s.mails_seen ?? "?") as number} Mails geprüft, ${(s.invoices_parsed ?? 0) as number} Rechnungen.`,
        );
        await load();
      }
    } catch (e) {
      setPollMsg(`Fehler: ${String(e)}`);
    } finally {
      setPolling(false);
    }
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of mails) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [mails]);

  // Manueller "Erneut verarbeiten"-Trigger fuer EINE Mail.
  // Nuetzlich wenn der Bot eine echte Rechnung faelschlich als
  // self_sent / no_pdf / rejected klassifiziert hat (z.B. iPhone-Scan
  // mit Subject "Zahlungsbestaetigung").
  const reprocessOne = useCallback(
    async (mailId: string) => {
      setReprocess((r) => ({
        ...r,
        [mailId]: { kind: "loading", msg: "Claude parst…" },
      }));
      try {
        const res = await fetch(
          `${API}/inbox/${mailId}/reprocess`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // force=true: ueberspringt self_sent/auto_reject-Filter
            body: JSON.stringify({ force: true }),
          },
        );
        const raw = await res.text();
        let j:
          | {
              ok?: boolean;
              error?: string;
              result?: { status?: string; invoices?: number };
            }
          | null = null;
        try {
          j = JSON.parse(raw);
        } catch {}
        if (!j || !res.ok || !j.ok) {
          const head = raw.replace(/\s+/g, " ").trim().slice(0, 120);
          setReprocess((r) => ({
            ...r,
            [mailId]: {
              kind: "err",
              msg: j?.error ?? `HTTP ${res.status} ${head}`,
            },
          }));
          return;
        }
        const result = j.result ?? {};
        const st = result.status ?? "fertig";
        const inv = result.invoices ?? 0;
        setReprocess((r) => ({
          ...r,
          [mailId]: {
            kind: "ok",
            msg: `→ ${st}${inv ? ` (${inv} Rechnung${inv > 1 ? "en" : ""})` : ""}`,
          },
        }));
        // Liste neu laden damit der Status sichtbar wird
        await load();
      } catch (e) {
        setReprocess((r) => ({
          ...r,
          [mailId]: { kind: "err", msg: String(e) },
        }));
      }
    },
    [load],
  );

  return (
    <div className="space-y-4">
      {/* Trigger + Filter */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold">
              {mails.length} Mails im Posteingang
            </div>
            <div className="text-xs text-[color:var(--muted)]">
              Polling alle 15 Min automatisch — manueller Trigger jederzeit.
            </div>
          </div>
          <button
            type="button"
            onClick={triggerPoll}
            disabled={polling}
            className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-sm font-medium disabled:opacity-50"
          >
            {polling ? "Polling läuft…" : "Jetzt prüfen"}
          </button>
        </div>
        {pollMsg && (
          <div className="text-xs text-[color:var(--muted)]">{pollMsg}</div>
        )}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => {
            const c = f.key ? counts[f.key] ?? 0 : mails.length;
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={
                  "text-xs px-2 py-1 rounded border transition " +
                  (active
                    ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)] text-white"
                    : "border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
                }
              >
                {f.label}
                {f.key && ` (${c})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Empfangen</th>
                <th className="px-3 py-2 font-medium">Von</th>
                <th className="px-3 py-2 font-medium">Betreff</th>
                <th className="px-3 py-2 font-medium">📎</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-red-600">
                    {error}
                  </td>
                </tr>
              )}
              {!error && loading && mails.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Lade…
                  </td>
                </tr>
              )}
              {!error && !loading && mails.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Keine Mails (mit Filter „{statusFilter || "Alle"}").
                  </td>
                </tr>
              )}
              {mails.map((m) => {
                const lab = STATUS_LABELS[m.status] ?? {
                  label: m.status,
                  tone: "bg-gray-100 text-gray-700",
                };
                return (
                  <tr key={m.id} className="border-t border-[color:var(--border)] align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-[color:var(--muted)]">
                      {m.received_at?.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2">
                      <div>{m.from_name ?? m.from_email}</div>
                      {m.from_name && (
                        <div className="text-xs text-[color:var(--muted)]">
                          {m.from_email}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div>{m.subject ?? "—"}</div>
                      {m.snippet && (
                        <div className="text-xs text-[color:var(--muted)] mt-0.5 line-clamp-1">
                          {m.snippet}
                        </div>
                      )}
                      {m.invoices && m.invoices.length > 0 && (
                        <div className="flex flex-col gap-1 mt-1.5">
                          {m.invoices.map((inv) => {
                            const tone =
                              INV_STATUS_TONE[inv.status] ??
                              "bg-gray-100 text-gray-600";
                            const inner = (
                              <>
                                <span className="font-medium">
                                  {inv.drive_file_url ? "📄 " : ""}
                                  {inv.lieferant_name ?? "Rechnung"}
                                </span>{" "}
                                <span className="tabular-nums">
                                  {eur(inv.brutto, inv.waehrung ?? "EUR")}
                                </span>
                                <span
                                  className={
                                    "ml-1.5 px-1.5 py-0.5 rounded text-[11px] " +
                                    tone
                                  }
                                >
                                  {inv.status}
                                </span>
                              </>
                            );
                            return inv.drive_file_url ? (
                              <a
                                key={inv.id}
                                href={inv.drive_file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Rechnung als PDF öffnen"
                                className="text-xs text-sky-800 hover:underline w-fit"
                              >
                                {inner}
                              </a>
                            ) : (
                              <span key={inv.id} className="text-xs w-fit">
                                {inner}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {m.rechnung_link_url && (
                        <div className="text-xs mt-1">
                          <a
                            href={m.rechnung_link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-700 underline break-all"
                          >
                            🔗 {m.rechnung_link_url.slice(0, 80)}
                          </a>
                        </div>
                      )}
                      {m.last_error && (
                        <div className="text-xs text-red-700 mt-0.5 line-clamp-1">
                          ⚠️ {m.last_error}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {m.attachment_count > 0 ? `${m.attachment_count}` : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={"text-xs px-2 py-0.5 rounded " + lab.tone}>
                        {lab.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {(() => {
                        const rp = reprocess[m.id];
                        if (rp?.kind === "loading") {
                          return (
                            <span className="text-xs text-[color:var(--muted)]">
                              {rp.msg}
                            </span>
                          );
                        }
                        const showButton =
                          m.attachment_count > 0 ||
                          m.status === "link_found" ||
                          m.status === "text_only";
                        return (
                          <div className="flex flex-col items-end gap-1">
                            {showButton && (
                              <button
                                type="button"
                                onClick={() => void reprocessOne(m.id)}
                                title="Mail neu durch Claude parsen — z.B. wenn der Bot eine echte Rechnung als Zahlungsbestätigung verworfen hat"
                                className="text-xs px-2 py-0.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                              >
                                ↻ neu parsen
                              </button>
                            )}
                            {rp?.kind === "ok" && (
                              <span className="text-xs text-emerald-700">
                                {rp.msg}
                              </span>
                            )}
                            {rp?.kind === "err" && (
                              <span className="text-xs text-red-700">
                                {rp.msg.slice(0, 80)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
