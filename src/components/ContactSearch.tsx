"use client";

/**
 * Kontakt-Suche im Teilnehmer-Management.
 *
 * Quelle: GET /cashflow/api/contacts/search?q=... (Supabase-Cache).
 * Lazy-Detail: POST /cashflow/api/contacts/refresh-detail proxies zum
 * Bot, der die Adresse + Telefon live aus SimplyOrg holt und im
 * Cache speichert.
 *
 * Daten werden taeglich um 06:00 (launchd contacts-sync) + nach jeder
 * neuen Rechnung automatisch aktualisiert.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Contact {
  person_id: number;
  vorname: string;
  nachname: string;
  vollname: string;
  email: string | null;
  is_participant: boolean;
  is_trainer: boolean;
  telefon: string | null;
  mobil: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  adresse_status: "pending" | "fetched" | "missing" | "error";
  adresse_geholt_am: string | null;
  last_synced_at: string;
  detail_synced_at: string | null;
}

interface SearchResponse {
  count: number;
  q: string;
  data: Contact[];
}

const DEBOUNCE_MS = 300;

export default function ContactSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inflightRef = useRef<AbortController | null>(null);

  const selected = useMemo(
    () => results.find((r) => r.person_id === selectedId) ?? null,
    [results, selectedId],
  );

  const runSearch = useCallback(async (q: string) => {
    // Aktuellen Request abbrechen
    if (inflightRef.current) {
      inflightRef.current.abort();
    }
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("limit", "100");
      const res = await fetch(`/cashflow/api/contacts/search?${params}`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      const json = (await res.json()) as SearchResponse | { error?: string };
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      const data = (json as SearchResponse).data;
      setResults(data);
      setTotal((json as SearchResponse).count ?? data.length);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "Suche fehlgeschlagen");
      setResults([]);
      setTotal(0);
    } finally {
      if (inflightRef.current === ctrl) {
        inflightRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  // Initial-Load (juengste 50 Eintraege)
  useEffect(() => {
    void runSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced Search bei Tipp-Aenderungen
  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(query.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const refreshDetail = useCallback(async (personId: number) => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/cashflow/api/contacts/refresh-detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId }),
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: {
          telefon?: string | null;
          mobil?: string | null;
          strasse?: string | null;
          plz?: string | null;
          ort?: string | null;
          land?: string | null;
        } | null;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      // Lokal aktualisieren (ohne Roundtrip)
      const d = json.detail ?? null;
      const now = new Date().toISOString();
      setResults((prev) =>
        prev.map((c) =>
          c.person_id === personId
            ? {
                ...c,
                telefon: d?.telefon ?? null,
                mobil: d?.mobil ?? null,
                strasse: d?.strasse ?? null,
                plz: d?.plz ?? null,
                ort: d?.ort ?? null,
                land: d?.land ?? null,
                adresse_status: d ? "fetched" : "missing",
                adresse_geholt_am: now,
                detail_synced_at: now,
              }
            : c,
        ),
      );
    } catch (err) {
      setError((err as Error).message || "Detail-Refresh fehlgeschlagen");
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
      {/* Linke Spalte: Suche + Ergebnisliste */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-3 flex flex-col gap-3 min-h-[400px]">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen: Name, E-Mail, Telefon …"
            className="block w-full border border-[color:var(--border)] rounded-md pl-9 pr-3 py-2 text-sm bg-white outline-none focus:border-[color:var(--brand-blue)]"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>

        <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
          <span>
            {loading
              ? "Suche …"
              : query
              ? `${total} Treffer für „${query}"`
              : `${total} zuletzt aktualisiert`}
          </span>
        </div>

        {error ? (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <ul className="flex-1 overflow-auto divide-y divide-[color:var(--border)] -mx-1">
          {results.map((c) => {
            const active = c.person_id === selectedId;
            return (
              <li key={c.person_id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.person_id)}
                  className={
                    "w-full text-left px-3 py-2.5 transition-colors " +
                    (active
                      ? "bg-[color:var(--brand-yellow)]/40"
                      : "hover:bg-[color:var(--brand-yellow)]/20")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm text-[color:var(--foreground)] truncate">
                      {c.vollname || "(ohne Name)"}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.is_trainer ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                          Trainer
                        </span>
                      ) : null}
                      {c.is_participant ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                          TN
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {c.email ? (
                    <div className="text-xs text-[color:var(--muted)] truncate mt-0.5">
                      {c.email}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
          {results.length === 0 && !loading && !error ? (
            <li className="px-3 py-8 text-center text-xs text-[color:var(--muted)]">
              Keine Treffer.
            </li>
          ) : null}
        </ul>
      </div>

      {/* Rechte Spalte: Detail */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        {selected ? (
          <ContactDetail
            contact={selected}
            refreshing={refreshing}
            onRefresh={() => refreshDetail(selected.person_id)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-[color:var(--muted)]">
            Wähle links einen Kontakt für Details.
          </div>
        )}
      </div>
    </div>
  );
}

function ContactDetail({
  contact,
  refreshing,
  onRefresh,
}: {
  contact: Contact;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const adresseLines = [
    contact.strasse,
    [contact.plz, contact.ort].filter(Boolean).join(" ") || null,
    contact.land,
  ].filter(Boolean);

  const pendingDetail =
    contact.adresse_status === "pending" ||
    (contact.adresse_status === "fetched" && adresseLines.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-[color:var(--foreground)]">
            {contact.vollname || "(ohne Name)"}
          </h2>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            PersonID {contact.person_id}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {contact.is_trainer ? (
            <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
              Trainer
            </span>
          ) : null}
          {contact.is_participant ? (
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
              Teilnehmer
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <DetailRow label="Vorname" value={contact.vorname || "—"} />
        <DetailRow label="Nachname" value={contact.nachname || "—"} />
        <DetailRow
          label="E-Mail"
          value={
            contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="text-[color:var(--brand-blue)] hover:underline"
              >
                {contact.email}
              </a>
            ) : (
              "—"
            )
          }
        />
        <DetailRow
          label="Telefon"
          value={
            contact.telefon ? (
              <a
                href={`tel:${contact.telefon}`}
                className="text-[color:var(--brand-blue)] hover:underline"
              >
                {contact.telefon}
              </a>
            ) : (
              "—"
            )
          }
        />
        <DetailRow
          label="Mobil"
          value={
            contact.mobil ? (
              <a
                href={`tel:${contact.mobil}`}
                className="text-[color:var(--brand-blue)] hover:underline"
              >
                {contact.mobil}
              </a>
            ) : (
              "—"
            )
          }
        />
        <DetailRow
          label="Adresse"
          value={
            adresseLines.length
              ? (
                <span>
                  {adresseLines.map((l, i) => (
                    <span key={i} className="block">
                      {l}
                    </span>
                  ))}
                </span>
              )
              : "—"
          }
        />
      </div>

      <div className="border-t border-[color:var(--border)] pt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--muted)]">
        <div className="flex flex-col gap-0.5">
          <span>
            Status Adresse:{" "}
            <span className="font-medium text-[color:var(--foreground)]">
              {adresseStatusLabel(contact.adresse_status)}
            </span>
          </span>
          <span>Zuletzt synchronisiert: {fmtTs(contact.last_synced_at)}</span>
          {contact.detail_synced_at ? (
            <span>Detail synchronisiert: {fmtTs(contact.detail_synced_at)}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={
            "px-3 py-1.5 rounded-md text-sm font-semibold transition-colors " +
            (refreshing
              ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-wait"
              : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
          }
        >
          {refreshing
            ? "Lade …"
            : pendingDetail
            ? "Adresse jetzt nachladen"
            : "Adresse neu laden"}
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
        {label}
      </span>
      <span className="text-sm text-[color:var(--foreground)] break-words">
        {value}
      </span>
    </div>
  );
}

function adresseStatusLabel(s: Contact["adresse_status"]): string {
  switch (s) {
    case "fetched":
      return "geladen";
    case "missing":
      return "keine in SimplyOrg hinterlegt";
    case "error":
      return "Fehler beim Laden";
    case "pending":
    default:
      return "noch nicht geladen";
  }
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
