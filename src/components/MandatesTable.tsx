/**
 * Tabelle aller GC-Mandate mit optionalem Status-Filter.
 *
 * Default-Filter: 'cancelled,expired,blocked' (=geloeschte Mandate).
 * Sortiert nach created_at DESC.
 */
"use client";

import { useEffect, useMemo, useState } from "react";

interface ApiMandate {
  id: string;
  status: string | null;
  scheme: string | null;
  reference: string | null;
  created_at: string | null;
  next_possible_charge_date: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  mitarbeiter: string | null;
  deal_id: string | null;
  done_at?: string | null;
  done_by_email?: string | null;
}

interface Props {
  /** Komma-getrennt, z.B. 'cancelled,expired,blocked' fuer den
   *  'Mandate geloescht'-Tab. Leer = alle. */
  statusFilter?: string;
  emptyMessage?: string;
}

const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("de-AT") : "—";

const formatDateTime = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("de-AT", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function statusBadge(status: string | null): { cls: string; label: string } {
  const s = status ?? "—";
  if (s === "active") {
    return {
      cls: "bg-green-100 text-green-900 border-green-300",
      label: "✓ aktiv",
    };
  }
  if (s === "cancelled") {
    return {
      cls: "bg-red-100 text-red-900 border-red-300",
      label: "✗ storniert",
    };
  }
  if (s === "expired") {
    return {
      cls: "bg-orange-100 text-orange-900 border-orange-300",
      label: "⏰ abgelaufen",
    };
  }
  if (s === "blocked") {
    return {
      cls: "bg-red-200 text-red-900 border-red-400",
      label: "⛔ blockiert",
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
  return {
    cls: "bg-gray-100 text-gray-700 border-gray-300",
    label: s,
  };
}

export default function MandatesTable({
  statusFilter = "",
  emptyMessage = "Keine Mandate gefunden.",
}: Props = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [mandates, setMandates] = useState<ApiMandate[]>([]);
  const [env, setEnv] = useState<string>("");

  const [search, setSearch] = useState("");
  const [hideDone, setHideDone] = useState(true);
  const [localResolutions, setLocalResolutions] = useState<
    Map<string, string | null>
  >(new Map());
  function isMandateDone(m: ApiMandate): boolean {
    const local = localResolutions.get(m.id);
    if (local !== undefined) return local !== null;
    return !!m.done_at;
  }
  async function toggleDone(m: ApiMandate) {
    const cur = isMandateDone(m);
    const next = !cur;
    setLocalResolutions((prev) => {
      const n = new Map(prev);
      n.set(m.id, next ? new Date().toISOString() : null);
      return n;
    });
    try {
      const res = await fetch("/cashflow/api/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gc_id: m.id,
          kind: "mandate",
          done: next,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setLocalResolutions((prev) => {
        const n = new Map(prev);
        n.set(m.id, cur ? new Date().toISOString() : null);
        return n;
      });
      alert(
        "Konnte nicht speichern: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    (async () => {
      try {
        const q = statusFilter
          ? `?status=${encodeURIComponent(statusFilter)}`
          : "";
        const res = await fetch(`/cashflow/api/mandates${q}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const j = (await res.json()) as {
          env: string;
          count: number;
          mandates: ApiMandate[];
        };
        setMandates(j.mandates);
        setEnv(j.env);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = mandates.filter((m) => {
      if (hideDone && isMandateDone(m)) return false;
      if (!q) return true;
      const hay = `${m.customer_name} ${m.customer_email ?? ""} ${m.reference ?? ""} ${m.id}`.toLowerCase();
      return hay.includes(q);
    });
    rows = rows.slice().sort((a, b) => {
      const da = a.created_at ?? "0000-00-00";
      const db = b.created_at ?? "0000-00-00";
      return db.localeCompare(da);
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandates, search, hideDone, localResolutions]);

  const isSandbox = env === "sandbox";

  return (
    <div className="space-y-3">
      {/* Filterleiste */}
      <div className="flex flex-wrap gap-2 items-end bg-white rounded-lg border border-[color:var(--border)] p-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Suche
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Email, Referenz, Mandat-ID…"
            className="w-full border border-[color:var(--border)] rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end pb-1">
          <label
            className="inline-flex items-center gap-1.5 text-xs text-[color:var(--muted)] cursor-pointer select-none"
            title="Versteckt Mandate die du als 'erledigt' markiert hast."
          >
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="cursor-pointer"
            />
            <span>Erledigte ausblenden</span>
          </label>
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {loading ? "Lade…" : `${filtered.length} Mandate`}
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] overflow-x-auto">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-[color:var(--muted)]">
            Lade Mandate aus GoCardless …
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-red-700">Fehler: {error}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-xs uppercase">
              <tr className="text-left">
                <th className="px-3 py-2">Erstellt</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Mitarbeiter</th>
                <th className="px-3 py-2">Scheme</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Mandat-ID</th>
                <th className="px-3 py-2 w-8 text-center" title="Erledigt">
                  ✓
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-[color:var(--muted)]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const stat = statusBadge(m.status);
                  const gcUrl = isSandbox
                    ? `https://manage-sandbox.gocardless.com/mandates/${m.id}`
                    : `https://manage.gocardless.com/mandates/${m.id}`;
                  const done = isMandateDone(m);
                  return (
                    <tr
                      key={m.id}
                      className={
                        "border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]/30 " +
                        (done ? "opacity-50 line-through" : "")
                      }
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        <div>{formatDate(m.created_at)}</div>
                        <div className="text-[10px] text-[color:var(--muted)]">
                          {formatDateTime(m.created_at)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{m.customer_name}</div>
                        {m.customer_email ? (
                          <div className="text-[10px] text-[color:var(--muted)]">
                            {m.customer_email}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                        {m.mitarbeiter || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs uppercase text-[color:var(--muted)]">
                        {m.scheme || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <a
                          href={gcUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border hover:opacity-80 " +
                            stat.cls
                          }
                          title="In GoCardless öffnen"
                        >
                          {stat.label}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-[11px] font-mono text-[color:var(--muted)]">
                        {m.id}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggleDone(m)}
                          className="cursor-pointer"
                          title={
                            done
                              ? `Erledigt von ${m.done_by_email ?? "—"}`
                              : "Als erledigt markieren"
                          }
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
