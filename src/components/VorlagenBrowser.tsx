"use client";

/**
 * Vorlagen-Browser
 * ----------------
 * Modal das alle gespeicherten Notiz-Vorlagen zeigt. Suche nach
 * Name oder Email als Substring. Klick auf "Laden" befuellt den
 * NotizGenerator und schliesst das Modal.
 */

import { useEffect, useState } from "react";

interface VorlageListEntry {
  id: string;
  email: string;
  name: string | null;
  hauptprodukt: string | null;
  rechnungstitel: string | null;
  notiz_text: string | null;
  rechnung_id: number | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void | Promise<void>;
}

export default function VorlagenBrowser({ open, onClose, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<VorlageListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial-Laden: alle Vorlagen (q leer)
  useEffect(() => {
    if (!open) return;
    void search("");
  }, [open]);

  async function search(suche: string) {
    setLoading(true);
    setError(null);
    try {
      const u = new URL(
        "/cashflow/api/notiz-vorlagen",
        window.location.origin,
      );
      if (suche.trim()) u.searchParams.set("q", suche.trim());
      u.searchParams.set("limit", "100");
      const r = await fetch(u.toString());
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || r.statusText);
        setItems([]);
        return;
      }
      const j = await r.json();
      setItems(Array.isArray(j.data) ? j.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Debounced search bei Tippen
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(q), 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function handleLoad(id: string) {
    await onSelect(id);
    onClose();
  }

  async function handleDelete(id: string) {
    if (!confirm("Diese Vorlage wirklich löschen?")) return;
    try {
      const r = await fetch(`/cashflow/api/notiz-vorlagen/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(`Fehler beim Löschen: ${j.error || r.statusText}`);
        return;
      }
      // Liste neu laden
      void search(q);
    } catch (e) {
      alert(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--surface)] text-[color:var(--foreground)] rounded-lg shadow-xl max-w-3xl w-full p-5 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-semibold">Vorlagen-Bibliothek</h2>
            <p className="text-xs text-[color:var(--muted)]">
              Alle gespeicherten Angebots-Notizen. Suche nach Name
              oder Email.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-xl leading-none"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <input
          type="text"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche nach Name oder Email…"
          className="w-full border border-[color:var(--border)] rounded px-3 py-2 text-sm mb-3"
        />

        {error ? (
          <div className="text-sm text-red-700 bg-red-50 p-2 rounded mb-2">
            ❌ {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-[color:var(--muted)] py-4">
            Lade…
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-[color:var(--muted)] py-4 italic">
            {q.trim()
              ? `Keine Vorlagen passen zu „${q}".`
              : "Noch keine Vorlagen gespeichert."}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1">
            <table className="w-full text-sm">
              <thead className="text-xs text-[color:var(--muted)] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-2 py-1">Kunde</th>
                  <th className="text-left px-2 py-1">Hauptprodukt</th>
                  <th className="text-left px-2 py-1">Erstellt</th>
                  <th className="text-right px-2 py-1">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr
                    key={v.id}
                    className="border-t border-[color:var(--border)] hover:bg-[color:var(--background)]"
                  >
                    <td className="px-2 py-2">
                      <div className="font-medium">{v.name || "—"}</div>
                      <div className="text-xs text-[color:var(--muted)] truncate">
                        {v.email}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="text-sm">
                        {v.hauptprodukt || (
                          <span className="text-[color:var(--muted)] italic">
                            (keines)
                          </span>
                        )}
                      </div>
                      {v.rechnung_id ? (
                        <div className="text-[10px] text-[color:var(--brand-blue)]">
                          → Rechnung #{v.rechnung_id}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-xs text-[color:var(--muted)] whitespace-nowrap">
                      {new Date(v.created_at).toLocaleString("de-AT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleLoad(v.id)}
                        className="text-xs px-2 py-1 rounded bg-[color:var(--brand-blue)] text-white mr-1"
                      >
                        Laden
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(v.id)}
                        className="text-xs px-2 py-1 rounded text-[color:var(--brand-orange)] hover:bg-[color:var(--brand-yellow)]/30"
                        title="Vorlage löschen"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-[color:var(--muted)] mt-2 px-2">
              {items.length} {items.length === 1 ? "Vorlage" : "Vorlagen"}
              {q.trim() ? ` mit Treffer auf „${q}"` : " insgesamt"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
