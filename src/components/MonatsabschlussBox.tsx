"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const API = "/cashflow/api/buchhaltung";

type StmtRef = {
  filename: string | null;
  drive_url: string | null;
  transaktionen: number | null;
};
type Slot = {
  quelle: string;
  label: string;
  bezeichnung: string;
  pflicht: boolean;
  multi: boolean;
  present: boolean;
  statements: StmtRef[];
};
type Status = {
  ok: boolean;
  month: string;
  ready: boolean;
  konten: Slot[];
  invoices: { matched: number; offen: number; total: number };
  buchungen?: { offen_ausgang: number; offen_eingang: number };
  ausgang?: { anzahl: number; luecken: number[] };
  checks?: {
    kontoauszuege: boolean;
    buchungen_zugeordnet: boolean;
    ausgangsrechnungen: boolean;
  };
  alles_ok?: boolean;
  abgeschlossen?: {
    closed_at: string;
    moved_total: number;
    positionen: number;
    mail_sent_to: string[] | null;
  } | null;
};

function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prevMonth() {
  // Beim Monatsabschluss schliesst man i.d.R. den VERGANGENEN Monat.
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function CheckRow({
  ok,
  label,
  detail,
}: {
  ok: boolean | undefined;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? "text-emerald-600" : "text-amber-600"}>
        {ok ? "✅" : "⬜"}
      </span>
      <span>{label}</span>
      {!ok && detail && (
        <span className="text-xs text-amber-700">— {detail}</span>
      )}
    </div>
  );
}

export default function MonatsabschlussBox({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [month, setMonth] = useState(prevMonth());
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/monatsabschluss/status?month=${month}`, {
        cache: "no-store",
      });
      const j = await r.json();
      setStatus(j?.ok ? j : null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const upload = useCallback(
    async (slug: string, file: File) => {
      setUploading(slug);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("month", month);
        fd.append("bank_account", slug);
        const r = await fetch(`${API}/monatsabschluss/upload`, {
          method: "POST",
          body: fd,
        });
        const j = await r.json();
        if (!j.ok) alert(`Fehler: ${j.error ?? r.status}`);
        await load();
      } catch (e) {
        alert(String(e));
      } finally {
        setUploading(null);
      }
    },
    [month, load],
  );

  const run = useCallback(async () => {
    const off = status?.invoices.offen ?? 0;
    // Achtung: verschiebt/benennt Drive-Dateien UND sendet eine Mail an
    // den Steuerberater -> immer bestätigen lassen.
    if (
      !confirm(
        `Monatsabschluss ${month} jetzt durchführen?\n\n` +
          `• Gematchte Rechnungen werden in Drive nach Konto sortiert ` +
          `und umbenannt (Lieferant_Rechnungsnummer)\n` +
          `• Eine Mail mit Excel-Liste (Rechnung ↔ Zahlung) geht an den ` +
          `Steuerberater (s.reifboeck@ataudit.at, j.pucher@ataudit.at)` +
          (off > 0
            ? `\n\n⚠️ ${off} Rechnung(en) noch offen — bleiben im Hauptordner.`
            : ""),
      )
    )
      return;
    setRunning(true);
    setRunMsg(null);
    try {
      const r = await fetch(`${API}/monatsabschluss/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const j = await r.json();
      if (!j.ok) {
        setRunMsg(`Fehler: ${j.error ?? r.status}`);
        return;
      }
      const parts = Object.entries(j.moved ?? {}).map(
        ([k, v]) => `${k}: ${v}`,
      );
      const mail = j.mail_sent_to
        ? ` · 📧 Mail an Steuerberater gesendet`
        : j.mail_error
          ? ` · ⚠️ Mail-Fehler: ${j.mail_error}`
          : "";
      setRunMsg(
        `✅ ${j.moved_total ?? 0} Rechnungen sortiert + umbenannt` +
          (parts.length ? ` (${parts.join(", ")})` : "") +
          (j.skipped ? ` · ${j.skipped} übersprungen` : "") +
          mail,
      );
      await load();
    } catch (e) {
      setRunMsg(`Fehler: ${String(e)}`);
    } finally {
      setRunning(false);
    }
  }, [month, status, load]);

  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[color:var(--surface)]"
      >
        <span className="font-semibold text-sm">
          📦 Monatsabschluss
          {status?.abgeschlossen ? (
            <span className="ml-2 text-xs font-semibold text-emerald-700">
              ✅ abgeschlossen
            </span>
          ) : (
            status && (
              <span className="ml-2 text-xs font-normal text-[color:var(--muted)]">
                {status.invoices.matched}/{status.invoices.total} gematcht
              </span>
            )
          )}
        </span>
        <span className="text-[color:var(--muted)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[color:var(--border)]">
          <div className="flex items-center gap-2 pt-3">
            <label className="text-xs text-[color:var(--muted)]">Monat</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="text-sm px-2 py-1 rounded border border-[color:var(--border)]"
            />
            {loading && (
              <span className="text-xs text-[color:var(--muted)]">lädt…</span>
            )}
          </div>

          {status?.abgeschlossen && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <span className="text-base">✅</span>
                Monatsabschluss abgeschlossen
              </div>
              <div className="text-xs text-emerald-700 mt-1 leading-relaxed">
                am {fmtDateTime(status.abgeschlossen.closed_at)} Uhr ·{" "}
                {status.abgeschlossen.moved_total} Rechnungen nach Konto
                sortiert &amp; umbenannt
                {status.abgeschlossen.mail_sent_to &&
                status.abgeschlossen.mail_sent_to.length > 0
                  ? " · 📧 Mail an Steuerberater versendet"
                  : ""}
              </div>
            </div>
          )}

          {status && (
            <>
              {/* 3-Punkte-Vorab-Prüfung */}
              <div className="space-y-1.5 rounded-md border border-[color:var(--border)] p-3">
                <div className="text-xs font-semibold text-[color:var(--muted)] uppercase tracking-wide">
                  Voraussetzungen
                </div>
                <CheckRow
                  ok={status.checks?.kontoauszuege}
                  label="Kontoauszüge vorhanden"
                  detail="Erste, Erste KK & PayPal fehlen"
                />
                <CheckRow
                  ok={status.checks?.buchungen_zugeordnet}
                  label="Buchungen zugeordnet"
                  detail={`${status.buchungen?.offen_ausgang ?? 0} offene Ausgänge noch nicht gematcht`}
                />
                <CheckRow
                  ok={status.checks?.ausgangsrechnungen}
                  label="Ausgangsrechnungen vollständig"
                  detail={
                    (status.ausgang?.anzahl ?? 0) === 0
                      ? "keine hochgeladen"
                      : (status.ausgang?.luecken?.length ?? 0) > 0
                        ? `Nummern-Lücke: ${status.ausgang?.luecken.join(", ")}`
                        : "unvollständig"
                  }
                />
                <div className="text-xs text-[color:var(--muted)] pt-1">
                  Eingangsrechnungen: {status.invoices.matched} gematcht
                  {status.invoices.offen > 0 &&
                    ` · ${status.invoices.offen} offen`}
                  {(status.buchungen?.offen_eingang ?? 0) > 0 &&
                    ` · ${status.buchungen?.offen_eingang} offene Eingänge (Kundenzahlungen)`}
                </div>
              </div>

              {/* Konto-Checkliste */}
              <div className="space-y-1.5">
                {status.konten.map((k) => (
                  <div
                    key={k.quelle}
                    className="flex items-center justify-between gap-3 text-sm py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={
                          k.present
                            ? "text-emerald-600"
                            : "text-[color:var(--muted)]"
                        }
                      >
                        {k.present ? "✅" : "⬜"}
                      </span>
                      <span className="truncate">
                        {k.bezeichnung}
                        {k.pflicht && (
                          <span className="text-[10px] text-[color:var(--muted)] ml-1">
                            (Pflicht)
                          </span>
                        )}
                      </span>
                      {k.statements.length > 0 && (
                        <span className="text-xs text-[color:var(--muted)]">
                          {k.statements.map((s, i) =>
                            s.drive_url ? (
                              <a
                                key={i}
                                href={s.drive_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-700 hover:underline ml-1"
                              >
                                📄
                              </a>
                            ) : (
                              <span key={i} className="ml-1" title={s.filename ?? ""}>
                                ·
                              </span>
                            ),
                          )}
                          {k.multi && ` (${k.statements.length})`}
                        </span>
                      )}
                    </div>
                    {/* Upload-Slot fuer GoCardless / Stripe */}
                    {(k.quelle === "gocardless" || k.quelle === "stripe") && (
                      <label className="text-xs px-2 py-1 rounded border border-[color:var(--border)] cursor-pointer hover:bg-[color:var(--surface)] whitespace-nowrap">
                        <input
                          ref={(el) => {
                            fileRefs.current[k.quelle] = el;
                          }}
                          type="file"
                          className="hidden"
                          disabled={uploading === k.quelle}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(k.quelle, f);
                            e.target.value = "";
                          }}
                        />
                        {uploading === k.quelle
                          ? "lädt…"
                          : k.multi
                            ? "+ Stripe hochladen"
                            : "+ hochladen"}
                      </label>
                    )}
                  </div>
                ))}
              </div>

              {/* Aktion */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs text-[color:var(--muted)]">
                  {status.abgeschlossen
                    ? "Bereits abgeschlossen — erneutes Durchführen aktualisiert Sortierung & Mail."
                    : status.alles_ok
                      ? "Alle Voraussetzungen erfüllt."
                      : "Erst alle Voraussetzungen oben erfüllen."}
                </div>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={(!status.alles_ok && !status.abgeschlossen) || running}
                  className="text-sm px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white font-medium disabled:opacity-50"
                  title="Gematchte Rechnungen in Konto-Unterordner verschieben"
                >
                  {running
                    ? "läuft…"
                    : status.abgeschlossen
                      ? "Erneut durchführen"
                      : "Monatsabschluss starten"}
                </button>
              </div>
              {runMsg && (
                <div className="text-xs text-[color:var(--foreground)] bg-[color:var(--surface)] rounded p-2">
                  {runMsg}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
