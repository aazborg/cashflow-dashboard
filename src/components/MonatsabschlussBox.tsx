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
};

function prevMonth() {
  // Beim Monatsabschluss schliesst man i.d.R. den VERGANGENEN Monat.
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonatsabschlussBox() {
  const [open, setOpen] = useState(false);
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
    if (
      off > 0 &&
      !confirm(
        `Achtung: ${off} Rechnung(en) sind noch OFFEN (nicht gematcht/abgehakt). ` +
          `Diese bleiben im Hauptordner. Trotzdem Monatsabschluss starten?`,
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
      setRunMsg(
        `✅ ${j.moved_total ?? 0} Rechnungen in Konto-Ordner verschoben` +
          (parts.length ? ` (${parts.join(", ")})` : "") +
          (j.skipped ? ` · ${j.skipped} ohne Konto/PDF übersprungen` : ""),
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
          {status && (
            <span className="ml-2 text-xs font-normal text-[color:var(--muted)]">
              {status.invoices.matched}/{status.invoices.total} gematcht
            </span>
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

          {status && (
            <>
              {/* Rechnungs-Status */}
              <div className="text-xs text-[color:var(--muted)]">
                Eingangsrechnungen diesen Monat:{" "}
                <span className="text-emerald-700 font-medium">
                  {status.invoices.matched} gematcht
                </span>
                {status.invoices.offen > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-700 font-medium">
                      {status.invoices.offen} offen
                    </span>
                  </>
                )}
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
                  {status.ready
                    ? "Pflicht-Auszüge vollständig."
                    : "Erste, Erste KK & PayPal müssen vorhanden sein."}
                </div>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={!status.ready || running}
                  className="text-sm px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white font-medium disabled:opacity-50"
                  title="Gematchte Rechnungen in Konto-Unterordner verschieben"
                >
                  {running ? "läuft…" : "Monatsabschluss starten"}
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
