"use client";
import { useCallback, useEffect, useState } from "react";

const API = "/cashflow/api/buchhaltung";

type Row = {
  id: string;
  lieferant: string;
  brutto: number | null;
  waehrung: string;
  faelligkeit: string | null;
  ueberfaellig: boolean;
  iban: string | null;
  bic: string | null;
  verwendungszweck: string | null;
  rechnung_nr: string | null;
  rechnungsdatum: string | null;
  drive_url: string | null;
  zahlungsart: string;
};
type Data = {
  ok: boolean;
  today: string;
  zu_bezahlen: Row[];
  automatisch: Row[];
  unklar: Row[];
  summe_eur_zu_bezahlen: number;
  counts: { zu_bezahlen: number; automatisch: number; unklar: number };
};

function eur(n: number | null, w = "EUR") {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("de-AT", {
      style: "currency",
      currency: w || "EUR",
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${w}`;
  }
}
function dDE(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text.replace(/\s+/g, ""));
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="text-[11px] px-1.5 py-0.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)] whitespace-nowrap"
      title="IBAN kopieren"
    >
      {done ? "✓ kopiert" : "kopieren"}
    </button>
  );
}

function PayTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0)
    return (
      <div className="text-sm text-[color:var(--muted)] py-3">
        Keine Rechnungen.
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-[color:var(--muted)] border-b border-[color:var(--border)]">
            <th className="py-2 pr-3">Fällig</th>
            <th className="py-2 pr-3">Lieferant</th>
            <th className="py-2 pr-3">Re-Nr</th>
            <th className="py-2 pr-3 text-right">Betrag</th>
            <th className="py-2 pr-3">IBAN</th>
            <th className="py-2 pr-3">Verwendungszweck</th>
            <th className="py-2 pr-3">PDF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[color:var(--border)] align-top"
            >
              <td className="py-2 pr-3 whitespace-nowrap">
                {r.ueberfaellig ? (
                  <span className="text-rose-600 font-semibold">
                    {dDE(r.faelligkeit)}
                  </span>
                ) : (
                  <span>{dDE(r.faelligkeit)}</span>
                )}
                {r.ueberfaellig && (
                  <span className="ml-1 text-[10px] uppercase text-rose-600">
                    überfällig
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 font-medium">{r.lieferant}</td>
              <td className="py-2 pr-3 text-xs text-[color:var(--muted)]">
                {r.rechnung_nr || "—"}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap font-semibold">
                {eur(r.brutto, r.waehrung)}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {r.iban ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-xs">{r.iban}</span>
                    <CopyBtn text={r.iban} />
                  </span>
                ) : (
                  <span className="text-[color:var(--muted)]">—</span>
                )}
              </td>
              <td className="py-2 pr-3 text-xs text-[color:var(--muted)] max-w-[220px] truncate">
                {r.verwendungszweck || r.rechnung_nr || "—"}
              </td>
              <td className="py-2 pr-3">
                {r.drive_url ? (
                  <a
                    href={r.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 hover:underline"
                  >
                    📄
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  title,
  hint,
  rows,
  defaultOpen,
}: {
  title: string;
  hint: string;
  rows: Row[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[color:var(--surface)]"
      >
        <span className="font-semibold text-sm">
          {title}
          <span className="ml-2 text-xs font-normal text-[color:var(--muted)]">
            {rows.length} · {hint}
          </span>
        </span>
        <span className="text-[color:var(--muted)]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[color:var(--border)]">
          <PayTable rows={rows} />
        </div>
      )}
    </div>
  );
}

export default function ZuBezahlenClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${API}/zu-bezahlen`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) setErr(j.error ?? `Fehler ${r.status}`);
      else setData(j);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ueberfaellig = data?.zu_bezahlen.filter((r) => r.ueberfaellig).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Zusammenfassung */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
          <div className="text-xs text-[color:var(--muted)]">
            Noch zu bezahlen (Überweisung)
          </div>
          <div className="text-2xl font-bold mt-1">
            {data?.counts.zu_bezahlen ?? "—"}
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-1">
            Summe {data ? eur(data.summe_eur_zu_bezahlen) : "—"}
          </div>
        </div>
        <div className="bg-white border border-rose-200 rounded-lg p-4">
          <div className="text-xs text-[color:var(--muted)]">Davon überfällig</div>
          <div
            className={
              "text-2xl font-bold mt-1 " +
              (ueberfaellig > 0 ? "text-rose-600" : "")
            }
          >
            {data ? ueberfaellig : "—"}
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-1">
            Fälligkeit überschritten
          </div>
        </div>
        <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
          <div className="text-xs text-[color:var(--muted)]">
            Automatisch / bereits bezahlt
          </div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">
            {data?.counts.automatisch ?? "—"}
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-1">
            Karte / Lastschrift / PayPal
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[color:var(--muted)]">
          „Bezahlt" = einer Bank-Buchung zugeordnet oder laut Beleg/Zahlart
          automatisch abgebucht. „Zu bezahlen" = Überweisung nötig.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
        >
          {loading ? "lädt…" : "↻ Aktualisieren"}
        </button>
      </div>

      {err && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-3">
          {err}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[color:var(--border)] font-semibold text-sm">
              💸 Noch zu bezahlen
              <span className="ml-2 text-xs font-normal text-[color:var(--muted)]">
                Überweisung — sortiert nach Fälligkeit
              </span>
            </div>
            <div className="px-4 pb-4 pt-2">
              <PayTable rows={data.zu_bezahlen} />
            </div>
          </div>

          {data.unklar.length > 0 && (
            <Section
              title="❓ Unklar — bitte prüfen"
              hint="kein eindeutiges Zahlart-Signal"
              rows={data.unklar}
              defaultOpen={false}
            />
          )}

          <Section
            title="✅ Wird automatisch abgebucht / bereits bezahlt"
            hint="keine Aktion nötig"
            rows={data.automatisch}
            defaultOpen={false}
          />
        </div>
      )}
    </div>
  );
}
