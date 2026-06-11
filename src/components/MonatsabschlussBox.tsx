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

type AusgangRow = {
  id: string;
  kunde_name: string | null;
  rechnung_nr: string | null;
  rechnungsdatum: string | null;
  brutto: number | null;
  waehrung: string | null;
  typ: string;
  drive_file_url: string | null;
};

function prevMonth() {
  // Beim Monatsabschluss schliesst man i.d.R. den VERGANGENEN Monat.
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function eur(v: number | null | undefined, w = "EUR") {
  if (v == null) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: w || "EUR",
  }).format(Number(v));
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
  // Ausgangsrechnungen
  const [ausgang, setAusgang] = useState<AusgangRow[]>([]);
  const [luecken, setLuecken] = useState<number[]>([]);
  const [ausgUploading, setAusgUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/monatsabschluss/status?month=${month}`, {
        cache: "no-store",
      });
      const j = await r.json();
      setStatus(j?.ok ? j : null);
      const ar = await fetch(`${API}/ausgangsrechnungen?month=${month}`, {
        cache: "no-store",
      }).then((x) => x.json());
      if (ar?.ok) {
        setAusgang(ar.rechnungen ?? []);
        setLuecken(ar.luecken ?? []);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  // WICHTIG: sequenziell (await je Datei). Paralleles Hochladen erzeugte
  // sonst über die Race-Condition mehrere gleichnamige Drive-Ordner.
  const uploadAusgang = useCallback(
    async (typ: "rechnung" | "storno", files: File[]) => {
      setAusgUploading(typ);
      let dup = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          setAusgUploading(
            files.length > 1 ? `${typ} ${i + 1}/${files.length}` : typ,
          );
          const fd = new FormData();
          fd.append("file", files[i]);
          fd.append("typ", typ);
          try {
            const r = await fetch(`${API}/ausgangsrechnung/upload`, {
              method: "POST",
              body: fd,
            });
            const j = await r.json();
            if (!j.ok) {
              alert(`Fehler bei ${files[i].name}: ${j.error ?? r.status}`);
            } else if (j.status === "duplikat") {
              dup++;
            }
          } catch (e) {
            alert(`Fehler bei ${files[i].name}: ${String(e)}`);
          }
        }
        if (dup > 0)
          alert(`${dup} Datei(en) waren schon vorhanden (übersprungen).`);
        await load();
      } finally {
        setAusgUploading(null);
      }
    },
    [load],
  );

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
                Rechnungen diesen Monat:{" "}
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

              {/* Ausgangsrechnungen */}
              <div className="border-t border-[color:var(--border)] pt-2 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    Ausgangsrechnungen
                    <span className="ml-2 text-xs font-normal text-[color:var(--muted)]">
                      {ausgang.filter((a) => a.typ !== "storno").length} Rg
                      {ausgang.some((a) => a.typ === "storno") &&
                        ` · ${ausgang.filter((a) => a.typ === "storno").length} Storno`}
                    </span>
                  </span>
                  <div className="flex gap-1.5">
                    <label className="text-xs px-2 py-1 rounded border border-[color:var(--border)] cursor-pointer hover:bg-[color:var(--surface)] whitespace-nowrap">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        className="hidden"
                        disabled={ausgUploading === "rechnung"}
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length)
                            void uploadAusgang("rechnung", files);
                          e.target.value = "";
                        }}
                      />
                      {ausgUploading === "rechnung" ? "lädt…" : "+ Rechnungen"}
                    </label>
                    <label className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-800 cursor-pointer hover:bg-amber-50 whitespace-nowrap">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        className="hidden"
                        disabled={ausgUploading === "storno"}
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length) void uploadAusgang("storno", files);
                          e.target.value = "";
                        }}
                      />
                      {ausgUploading === "storno" ? "lädt…" : "+ Storno"}
                    </label>
                  </div>
                </div>

                {luecken.length > 0 && (
                  <div className="text-xs text-amber-800 bg-amber-50 rounded p-2">
                    ⚠️ Lücke in der Nummerierung — fehlende Nummer(n):{" "}
                    <span className="font-mono">{luecken.join(", ")}</span>.
                    Fehlt da eine Rechnung?
                  </div>
                )}

                {ausgang.length > 0 && (
                  <div className="max-h-44 overflow-y-auto space-y-0.5">
                    {ausgang.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 text-xs py-0.5"
                      >
                        <span className="truncate">
                          <span className="font-mono text-[color:var(--muted)]">
                            {a.rechnung_nr ?? "—"}
                          </span>{" "}
                          {a.kunde_name ?? "—"}
                          {a.typ === "storno" && (
                            <span className="ml-1 text-[10px] px-1 rounded bg-amber-100 text-amber-800">
                              Storno
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className="tabular-nums">
                            {eur(a.brutto, a.waehrung ?? "EUR")}
                          </span>
                          {a.drive_file_url && (
                            <a
                              href={a.drive_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-700 hover:underline"
                            >
                              📄
                            </a>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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
