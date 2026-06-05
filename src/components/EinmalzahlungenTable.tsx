"use client";
/**
 * Tabelle: alle Einmalzahlungs-Deals mit Bezahl-Status aus
 * Bank-Auszug-Match (deals.payment_status). Pro Zeile ein 🔗-Button
 * fuer manuelles Match falls Auto-Match nicht griff.
 */
import { useMemo, useState } from "react";
import type { Deal } from "@/lib/types";
import DealMatchBankModal from "./DealMatchBankModal";

function eur(v: number | null | undefined, w = "EUR") {
  if (v == null) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: w || "EUR",
  }).format(Number(v));
}

const STATUS_FILTERS: { k: string; l: string }[] = [
  { k: "", l: "Alle" },
  { k: "open", l: "Offen" },
  { k: "paid", l: "Bezahlt" },
  { k: "partial", l: "Teilbezahlt" },
];

function isEinmalzahlung(d: Deal): boolean {
  // anzahl_raten == 1 ODER intervall in ("einmalig", "einmal", null & anzahl_raten<=1)
  if (d.anzahl_raten && d.anzahl_raten > 1) return false;
  if (d.intervall === "einmalig" || d.intervall === null) {
    if (!d.anzahl_raten || d.anzahl_raten <= 1) return true;
  }
  if (d.zahlungsmodell === "einmal") return true;
  return (!d.anzahl_raten || d.anzahl_raten <= 1) && d.intervall === null;
}

export default function EinmalzahlungenTable({ deals }: { deals: Deal[] }) {
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [openMatch, setOpenMatch] = useState<Deal | null>(null);

  const einmal = useMemo(
    () => deals.filter((d) => !d.is_shadow && isEinmalzahlung(d)),
    [deals],
  );

  const rows = useMemo(() => {
    let r = einmal;
    if (status) r = r.filter((d) => (d.payment_status ?? "open") === status);
    if (q.trim()) {
      const qLow = q.toLowerCase();
      r = r.filter(
        (d) =>
          (d.vorname ?? "").toLowerCase().includes(qLow) ||
          (d.nachname ?? "").toLowerCase().includes(qLow) ||
          (d.email ?? "").toLowerCase().includes(qLow),
      );
    }
    return r;
  }, [einmal, status, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, paid: 0, partial: 0 };
    for (const d of einmal) {
      const s = d.payment_status ?? "open";
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [einmal]);

  const sumBrutto = rows.reduce(
    (s, d) => s + Number(d.betrag_original ?? d.betrag ?? 0),
    0,
  );
  const sumPaid = rows.reduce(
    (s, d) => s + Number(d.amount_paid ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* Karten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card label="Offen" value={counts.open ?? 0} tone="amber" />
        <Card label="Teilbezahlt" value={counts.partial ?? 0} tone="sky" />
        <Card label="Bezahlt" value={counts.paid ?? 0} tone="emerald" />
      </div>

      {/* Filter */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
        <div className="flex flex-wrap gap-2 items-end justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setStatus(f.k)}
                className={
                  "text-xs px-2 py-1 rounded border transition " +
                  (status === f.k
                    ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)] text-white"
                    : "border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
                }
              >
                {f.l}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche Name / E-Mail…"
            className="px-2 py-1 rounded border border-[color:var(--border)] bg-white text-sm w-64"
          />
        </div>
        <div className="text-xs text-[color:var(--muted)] mt-2">
          {rows.length} Rechnungen · Brutto-Summe {eur(sumBrutto)} · davon
          bezahlt {eur(sumPaid)}
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Rechnung ab</th>
                <th className="px-3 py-2 font-medium">Kunde</th>
                <th className="px-3 py-2 font-medium">Mitarbeiter</th>
                <th className="px-3 py-2 font-medium text-right">Betrag</th>
                <th className="px-3 py-2 font-medium text-right">Bezahlt</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-[color:var(--muted)]"
                  >
                    Keine Einmalzahlungen in dieser Sicht.
                  </td>
                </tr>
              )}
              {rows.map((d) => {
                const betrag = Number(d.betrag_original ?? d.betrag ?? 0);
                const paid = Number(d.amount_paid ?? 0);
                const ps = d.payment_status ?? "open";
                return (
                  <tr
                    key={d.id}
                    className="border-t border-[color:var(--border)] align-top"
                  >
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                      {d.start_datum ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div>
                        {d.vorname} {d.nachname}
                      </div>
                      {d.email && (
                        <div className="text-xs text-[color:var(--muted)]">
                          {d.email}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                      {d.mitarbeiter_name}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">
                      {eur(betrag)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {paid > 0 ? (
                        <span className="text-emerald-700">{eur(paid)}</span>
                      ) : (
                        <span className="text-[color:var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {ps === "paid" ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-700 text-white font-semibold uppercase">
                          ✓ Bezahlt
                        </span>
                      ) : ps === "partial" ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500 text-white font-semibold uppercase">
                          ◐ Teilbez.
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                          offen
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {ps !== "paid" && (
                        <button
                          type="button"
                          onClick={() => setOpenMatch(d)}
                          className="text-xs px-2 py-1 rounded border border-[color:var(--border)] text-[color:var(--brand-blue)] hover:bg-[color:var(--surface)]"
                          title="Bank-Buchung manuell zuordnen"
                        >
                          🔗 Bezahlt?
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openMatch && (
        <DealMatchBankModal
          deal={openMatch}
          onClose={() => setOpenMatch(null)}
          onSuccess={() => {
            setOpenMatch(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "sky";
}) {
  const colors: Record<string, string> = {
    emerald: "border-emerald-300 bg-emerald-50",
    amber: "border-amber-300 bg-amber-50",
    sky: "border-sky-300 bg-sky-50",
  };
  return (
    <div className={"rounded-lg border p-5 " + colors[tone]}>
      <div className="text-xs text-[color:var(--muted)]">{label}</div>
      <div className="text-3xl font-semibold text-[color:var(--foreground)] mt-2">
        {value}
      </div>
    </div>
  );
}
