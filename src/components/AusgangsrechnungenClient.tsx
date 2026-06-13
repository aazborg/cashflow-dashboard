"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

const API = "/cashflow/api/buchhaltung";

type Row = {
  id: string;
  kunde_name: string | null;
  rechnung_nr: string | null;
  rechnung_nr_num: number | null;
  rechnungsdatum: string | null;
  brutto: number | null;
  waehrung: string | null;
  typ: string;
  drive_file_url: string | null;
};

function eur(v: number | null | undefined, w = "EUR") {
  if (v == null) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: w || "EUR",
  }).format(Number(v));
}

export default function AusgangsrechnungenClient({
  view = "rechnung",
}: {
  view?: "rechnung" | "storno";
}) {
  const [month, setMonth] = useState(""); // "" = alle
  const [rows, setRows] = useState<Row[]>([]);
  const [luecken, setLuecken] = useState<number[]>([]);
  const [gesamt, setGesamt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = month ? `?month=${month}` : "";
      const j = await fetch(`${API}/ausgangsrechnungen${qs}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (j?.ok) {
        setRows(j.rechnungen ?? []);
        setLuecken(j.luecken ?? []);
        setGesamt(j.anzahl_gesamt ?? 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sequenziell hochladen (kein Ordner-Race im Drive).
  const upload = useCallback(
    async (typ: "rechnung" | "storno", files: File[]) => {
      setUploading(typ);
      let dup = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          setUploading(
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
            if (!j.ok) alert(`Fehler bei ${files[i].name}: ${j.error ?? r.status}`);
            else if (j.status === "duplikat") dup++;
          } catch (e) {
            alert(`Fehler bei ${files[i].name}: ${String(e)}`);
          }
        }
        if (dup > 0) alert(`${dup} schon vorhanden (übersprungen).`);
        await load();
      } finally {
        setUploading(null);
      }
    },
    [load],
  );

  const rechnungenRows = useMemo(
    () => rows.filter((r) => r.typ !== "storno"),
    [rows],
  );
  const stornoRows = useMemo(
    () => rows.filter((r) => r.typ === "storno"),
    [rows],
  );
  // Echter Umsatz = Rechnungen − Stornos (Storno-Betrag als Abzug, Vorzeichen
  // egal). Storno-Summe immer als positiver Abzugsbetrag fuehren.
  const summeRechnung = useMemo(
    () => rechnungenRows.reduce((s, r) => s + (r.brutto ?? 0), 0),
    [rechnungenRows],
  );
  const summeStorno = useMemo(
    () => stornoRows.reduce((s, r) => s + Math.abs(r.brutto ?? 0), 0),
    [stornoRows],
  );
  const echterUmsatz = summeRechnung - summeStorno;

  const filtered = useMemo(() => {
    const base = view === "storno" ? stornoRows : rechnungenRows;
    const n = q.trim().toLowerCase();
    const sorted = [...base].sort(
      (a, b) => (a.rechnung_nr_num ?? 0) - (b.rechnung_nr_num ?? 0),
    );
    if (!n) return sorted;
    return sorted.filter(
      (r) =>
        (r.kunde_name ?? "").toLowerCase().includes(n) ||
        (r.rechnung_nr ?? "").toLowerCase().includes(n),
    );
  }, [rechnungenRows, stornoRows, view, q]);

  return (
    <div className="space-y-4">
      {/* Aktionen */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {view === "storno" ? (
            <div className="text-sm">
              <span className="font-semibold">
                {stornoRows.length} Stornorechnung
                {stornoRows.length === 1 ? "" : "en"}
              </span>
              <span className="ml-2 text-[color:var(--muted)]">
                Summe {eur(summeStorno)} · wird vom Umsatz abgezogen
              </span>
            </div>
          ) : (
            <div className="text-sm">
              <div>
                <span className="font-semibold">
                  {rechnungenRows.length} Rechnung
                  {rechnungenRows.length === 1 ? "" : "en"}
                </span>
                <span className="ml-2 font-semibold">
                  Umsatz {eur(echterUmsatz)}
                </span>
                <span className="ml-2 text-[color:var(--muted)]">
                  {gesamt} gesamt im System
                </span>
              </div>
              {summeStorno > 0 && (
                <div className="text-xs text-[color:var(--muted)] mt-0.5">
                  Brutto {eur(summeRechnung)} − Storno {eur(summeStorno)} ={" "}
                  <span className="font-medium text-[color:var(--foreground)]">
                    {eur(echterUmsatz)}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            {view === "rechnung" ? (
              <label className="text-xs px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white font-medium cursor-pointer disabled:opacity-50 whitespace-nowrap">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  disabled={uploading === "rechnung"}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) void upload("rechnung", files);
                    e.target.value = "";
                  }}
                />
                {uploading?.startsWith("rechnung")
                  ? `lädt… ${uploading.replace("rechnung", "")}`
                  : "+ Rechnungen hochladen"}
              </label>
            ) : (
              <label className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-800 font-medium cursor-pointer hover:bg-amber-50 whitespace-nowrap">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  disabled={uploading === "storno"}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) void upload("storno", files);
                    e.target.value = "";
                  }}
                />
                {uploading?.startsWith("storno")
                  ? `lädt… ${uploading.replace("storno", "")}`
                  : "+ Storno hochladen"}
              </label>
            )}
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[color:var(--muted)]">Monat</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-sm px-2 py-1 rounded border border-[color:var(--border)]"
          />
          {month && (
            <button
              type="button"
              onClick={() => setMonth("")}
              className="text-xs text-[color:var(--brand-blue)] underline"
            >
              alle
            </button>
          )}
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name oder Re-Nr…"
            className="text-sm px-2 py-1 rounded border border-[color:var(--border)] flex-1 min-w-[160px]"
          />
          {loading && (
            <span className="text-xs text-[color:var(--muted)]">lädt…</span>
          )}
        </div>

        {view === "rechnung" && luecken.length > 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 rounded p-2">
            ⚠️ Lücke in der Nummerierung — fehlende Nummer(n):{" "}
            <span className="font-mono">{luecken.join(", ")}</span>. Sind alle
            Rechnungen hochgeladen?
          </div>
        )}
      </div>

      {/* Tabelle */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Re-Nr</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium text-right">Betrag</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    {view === "storno"
                      ? "Keine Stornorechnungen."
                      : "Keine Ausgangsrechnungen. Lade welche hoch."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-[color:var(--border)]">
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    {r.rechnung_nr ?? "—"}
                    {r.typ === "storno" && (
                      <span className="ml-1 text-[10px] px-1 rounded bg-amber-100 text-amber-800">
                        Storno
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.kunde_name ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                    {r.rechnungsdatum ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {eur(r.brutto, r.waehrung ?? "EUR")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.drive_file_url && (
                      <a
                        href={r.drive_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-700 hover:underline"
                      >
                        📄 PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
