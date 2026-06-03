"use client";

/**
 * Modal zum Umbuchen einer Person in einen anderen Termin desselben
 * Seminars. Sucht in /api/seminars/search nach exakt gleichem Namen,
 * filtert aktuelles event_id raus.
 */
import { useCallback, useEffect, useState } from "react";

interface SeminarHit {
  id: number;
  name: string;
  typ: "reihe" | "event";
  von: string | null;
  bis: string | null;
  termine_count?: number;
  belegung?: {
    aktive: number;
    max: number | null;
    frei: number | null;
    voll: boolean;
    loading?: boolean;
  };
}

interface Snapshot {
  ok?: boolean;
  event_id?: number;
  event_name?: string;
  max_registration?: number;
  aktive?: number;
  frei?: number | null;
  voll?: boolean;
  error?: string;
}

interface LsbStatus {
  is_lsb_praxis: boolean;
  prev_count: number;
  free_remaining: number;
  free_total: number;
  is_gebuehrenpflichtig: boolean;
  gebuehr_eur: number;
}

export default function SeminarRebookingModal({
  personId,
  personName,
  oldEventId,
  oldEventName,
  oldVon,
  oldBis,
  open,
  onClose,
  onSuccess,
}: {
  personId: number;
  personName: string;
  oldEventId: number;
  oldEventName: string;
  oldVon: string;
  oldBis: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [alternatives, setAlternatives] = useState<SeminarHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SeminarHit | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lsbStatus, setLsbStatus] = useState<LsbStatus | null>(null);
  const [lsbLoading, setLsbLoading] = useState(false);
  const [kostenlos, setKostenlos] = useState(false);
  const [kundeInformiert, setKundeInformiert] = useState(false);
  const [allowOverbook, setAllowOverbook] = useState(false);

  // Reset bei oeffnen
  useEffect(() => {
    if (open) {
      setSelected(null);
      setSnapshot(null);
      setReason("");
      setError(null);
      setLsbStatus(null);
      setKostenlos(false);
      setKundeInformiert(false);
      setAllowOverbook(false);
      void loadAlternatives();
      void loadLsbStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadLsbStatus = useCallback(async () => {
    setLsbLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("old_event_name", oldEventName);
      const res = await fetch(
        `/cashflow/api/contacts/${personId}/umbuchung-status?${params}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as LsbStatus & {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && json.ok !== false) setLsbStatus(json);
    } catch {
      /* best-effort */
    } finally {
      setLsbLoading(false);
    }
  }, [personId, oldEventName]);

  const loadAlternatives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("q", oldEventName);
      params.set("limit", "100");
      const res = await fetch(`/cashflow/api/seminars/search?${params}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        seminars?: SeminarHit[];
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const all = json.seminars ?? [];
      const targetName = oldEventName.trim().toLowerCase();
      // Modul-Namen koennen Untertitel anhaengen
      // ("Spezifische Interventionen I" vs
      //  "Spezifische Interventionen I: Reframing ..."). Wir
      // matchen alles, bei dem ein Name das Praefix des anderen
      // ist (case-insensitiv) und nicht das aktuelle Event.
      const filtered = all
        .filter((s) => {
          if (s.id === oldEventId) return false;
          const a = s.name.trim().toLowerCase();
          if (!a) return false;
          return a === targetName ||
            a.startsWith(targetName) ||
            targetName.startsWith(a);
        })
        .sort((x, y) => {
          // Exakte Matches oben, dann nach Datum
          const xExact =
            x.name.trim().toLowerCase() === targetName ? 0 : 1;
          const yExact =
            y.name.trim().toLowerCase() === targetName ? 0 : 1;
          if (xExact !== yExact) return xExact - yExact;
          return (x.von || "").localeCompare(y.von || "");
        });
      // Mark as loading
      setAlternatives(
        filtered.map((s) => ({
          ...s,
          belegung: s.typ === "event" ? { aktive: 0, max: null, frei: null, voll: false, loading: true } : undefined,
        })),
      );
      // Parallel Belegung laden (nur Events)
      void (async () => {
        const eventHits = filtered.filter((s) => s.typ === "event");
        await Promise.all(
          eventHits.map(async (s) => {
            try {
              const r = await fetch(
                `/cashflow/api/seminars/${s.id}/snapshot`,
                { cache: "no-store" },
              );
              const sn = (await r.json()) as Snapshot;
              setAlternatives((prev) =>
                prev.map((p) =>
                  p.id === s.id
                    ? {
                        ...p,
                        belegung: {
                          aktive: sn.aktive ?? 0,
                          max: sn.max_registration ?? null,
                          frei: sn.frei ?? null,
                          voll: !!sn.voll,
                          loading: false,
                        },
                      }
                    : p,
                ),
              );
            } catch {
              setAlternatives((prev) =>
                prev.map((p) =>
                  p.id === s.id
                    ? { ...p, belegung: { aktive: 0, max: null, frei: null, voll: false, loading: false } }
                    : p,
                ),
              );
            }
          }),
        );
      })();
    } catch (err) {
      setError((err as Error).message);
      setAlternatives([]);
    } finally {
      setLoading(false);
    }
  }, [oldEventName, oldEventId]);

  // Belegungs-Snapshot fuer ausgewaehltes Alternativ-Seminar
  useEffect(() => {
    setSnapshot(null);
    setAllowOverbook(false);
    setError(null);  // Reset Fehler aus vorherigem Submit
    if (!selected || selected.typ !== "event") return;
    void (async () => {
      setSnapLoading(true);
      try {
        const res = await fetch(
          `/cashflow/api/seminars/${selected.id}/snapshot`,
          { cache: "no-store" },
        );
        setSnapshot((await res.json()) as Snapshot);
      } catch (err) {
        setSnapshot({ ok: false, error: (err as Error).message });
      } finally {
        setSnapLoading(false);
      }
    })();
  }, [selected]);

  const submit = useCallback(async () => {
    if (!selected) return;
    if (reason.trim().length < 5) {
      setError("Bitte einen Grund (mind. 5 Zeichen) angeben.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/cashflow/api/contacts/${personId}/umbuchen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_event_id: oldEventId,
          new_event_id: selected.id,
          reason: reason.trim(),
          kostenlos_erlassen: lsbStatus?.is_lsb_praxis && kostenlos,
          kunde_informiert: kundeInformiert,
          allow_overbook: allowOverbook,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [selected, reason, personId, oldEventId, onSuccess, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">In anderen Termin umbuchen</h2>
            <p className="text-xs text-[color:var(--muted)] mt-0.5">
              {personName} (PersonID {personId})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] text-xl"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* Aktueller Termin */}
          <div className="rounded border border-[color:var(--border)] bg-red-50/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-red-700 font-semibold">
              wird storniert
            </div>
            <div className="font-semibold text-sm mt-0.5">{oldEventName}</div>
            <div className="text-xs text-[color:var(--muted)] mt-0.5 tabular-nums">
              {oldVon} – {oldBis} · ID {oldEventId}
            </div>
          </div>

          <div className="text-center text-xs text-[color:var(--muted)]">
            ↓
          </div>

          {/* Alternativen */}
          {error ? (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          {selected ? (
            <div className="rounded border border-[color:var(--border)] bg-emerald-50/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
                    neu einbuchen
                  </div>
                  <div className="font-semibold text-sm mt-0.5">
                    {selected.name}
                  </div>
                  <div className="text-xs text-[color:var(--muted)] mt-0.5 tabular-nums">
                    {fmtDate(selected.von) || "?"} –{" "}
                    {fmtDate(selected.bis) || "?"} · ID {selected.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs underline text-[color:var(--brand-blue)]"
                >
                  Andere wählen
                </button>
              </div>
              {selected.typ === "event" ? (
                <div className="mt-3 space-y-2">
                  {snapLoading ? (
                    <div className="text-xs text-[color:var(--muted)]">
                      Belegung wird geladen …
                    </div>
                  ) : snapshot?.ok ? (
                    <>
                      <BelegungsBadge snap={snapshot} />
                      {snapshot.voll ? (
                        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs">
                          <div className="font-semibold text-red-800 mb-1">
                            ⚠ Seminar ist ausgebucht (
                            {snapshot.aktive ?? "?"} /{" "}
                            {snapshot.max_registration ?? "?"} angemeldet)
                          </div>
                          <label className="inline-flex items-start gap-2 cursor-pointer text-red-700">
                            <input
                              type="checkbox"
                              checked={allowOverbook}
                              onChange={(e) =>
                                setAllowOverbook(e.target.checked)
                              }
                              className="accent-red-600 mt-0.5"
                            />
                            <span>
                              Trotzdem buchen (Überbuchung in Kauf nehmen).
                              Mir ist bewusst dass das Seminar
                              überbucht wird.
                            </span>
                          </label>
                        </div>
                      ) : null}
                    </>
                  ) : snapshot && !snapshot.ok ? (
                    <div className="text-xs text-amber-700">
                      Belegung nicht ladbar: {snapshot.error}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <div className="text-xs uppercase tracking-wide text-[color:var(--muted)] mb-2">
                Alternativ-Termine ({alternatives.length})
              </div>
              <div className="border border-[color:var(--border)] rounded-md max-h-64 overflow-auto divide-y divide-[color:var(--border)]">
                {loading ? (
                  <div className="py-6 text-center text-xs text-[color:var(--muted)]">
                    Suche Alternativen …
                  </div>
                ) : alternatives.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[color:var(--muted)]">
                    Keine weiteren Termine für „{oldEventName}" gefunden.
                  </div>
                ) : (
                  alternatives.map((s) => {
                    const nameDiff =
                      s.name.trim().toLowerCase() !==
                      oldEventName.trim().toLowerCase();
                    const b = s.belegung;
                    const isVoll = !!b?.voll;
                    return (
                      <button
                        key={`${s.typ}-${s.id}`}
                        type="button"
                        onClick={() => setSelected(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-[color:var(--brand-yellow)]/20"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm tabular-nums">
                            {fmtDate(s.von) || "?"} – {fmtDate(s.bis) || "?"}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {b?.loading ? (
                              <span className="text-[10px] text-[color:var(--muted)]">
                                Belegung …
                              </span>
                            ) : isVoll ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                                AUSGEBUCHT {b?.aktive}/{b?.max ?? "?"}
                              </span>
                            ) : b && b.frei != null ? (
                              <span
                                className={
                                  "text-[10px] px-1.5 py-0.5 rounded font-semibold " +
                                  (b.frei <= 3
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-green-100 text-green-700")
                                }
                              >
                                {b.frei} frei
                              </span>
                            ) : null}
                            <span className="text-[10px] text-[color:var(--muted)]">
                              ID {s.id}
                            </span>
                          </div>
                        </div>
                        {nameDiff ? (
                          <div className="text-[11px] text-[color:var(--brand-orange)] mt-0.5 truncate">
                            {s.name}
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* LSB-Praxis-Status */}
          {selected && lsbStatus?.is_lsb_praxis ? (
            <LsbStatusPanel
              status={lsbStatus}
              kostenlos={kostenlos}
              setKostenlos={setKostenlos}
              kundeInformiert={kundeInformiert}
              setKundeInformiert={setKundeInformiert}
            />
          ) : selected && lsbLoading ? (
            <div className="text-xs text-[color:var(--muted)]">
              Prüfe LSB-Umbuchungsstatus …
            </div>
          ) : null}

          {/* Grund */}
          {selected ? (
            <div>
              <label className="text-xs uppercase tracking-wide text-[color:var(--muted)] block mb-1">
                Grund (Audit-Log) *
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z. B. Terminkollision / Kundenwunsch"
                autoFocus
                className={
                  "block w-full border rounded-md px-3 py-2 text-sm outline-none " +
                  (reason.trim().length >= 5
                    ? "border-[color:var(--border)] focus:border-[color:var(--brand-blue)]"
                    : "border-amber-300 focus:border-amber-500 bg-amber-50/40")
                }
              />
              {reason.trim().length < 5 ? (
                <div className="text-[11px] text-amber-700 mt-1">
                  Pflichtfeld · mindestens 5 Zeichen (
                  {reason.trim().length}/5)
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="px-5 py-3 border-t border-[color:var(--border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded border border-[color:var(--border)] text-sm"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={(() => {
              if (!selected || submitting) return true;
              if (reason.trim().length < 5) return true;
              if (
                lsbStatus?.is_lsb_praxis &&
                lsbStatus.is_gebuehrenpflichtig &&
                !kostenlos &&
                !kundeInformiert
              )
                return true;
              if (snapshot?.voll && !allowOverbook) return true;
              return false;
            })()}
            className={
              "px-4 py-1.5 rounded text-sm font-semibold " +
              (!selected ||
              submitting ||
              reason.trim().length < 5 ||
              (lsbStatus?.is_lsb_praxis &&
                lsbStatus.is_gebuehrenpflichtig &&
                !kostenlos &&
                !kundeInformiert) ||
              (snapshot?.voll && !allowOverbook)
                ? "bg-[color:var(--border)] text-[color:var(--muted)] cursor-not-allowed"
                : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
            }
          >
            {submitting ? "Umbuche …" : "Umbuchen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LsbStatusPanel({
  status,
  kostenlos,
  setKostenlos,
  kundeInformiert,
  setKundeInformiert,
}: {
  status: LsbStatus;
  kostenlos: boolean;
  setKostenlos: (b: boolean) => void;
  kundeInformiert: boolean;
  setKundeInformiert: (b: boolean) => void;
}) {
  const effectivelyKostenpflichtig =
    status.is_gebuehrenpflichtig && !kostenlos;
  const palette = effectivelyKostenpflichtig
    ? "border-red-300 bg-red-50/60"
    : "border-emerald-300 bg-emerald-50/60";
  return (
    <div className={"rounded border p-3 " + palette}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--muted)]">
            LSB-Praxismodul · Umbuchungs-Sonderregel
          </div>
          <div className="text-sm font-semibold mt-0.5">
            {status.prev_count} / {status.free_total} kostenfreie
            Umbuchungen genutzt
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            {effectivelyKostenpflichtig
              ? `Diese Umbuchung wäre kostenpflichtig (${status.gebuehr_eur.toFixed(0)}€).`
              : status.free_remaining > 0
              ? `Diese Umbuchung wäre kostenfrei (${status.free_remaining} verbleiben).`
              : "Diese Umbuchung ist die letzte kostenfreie."}
          </div>
        </div>
      </div>

      {/* Bei Gebühr: Häkchen Kunde informiert */}
      {status.is_gebuehrenpflichtig ? (
        <div className="mt-3 flex flex-col gap-2 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={kostenlos}
              onChange={(e) => setKostenlos(e.target.checked)}
              className="accent-[color:var(--brand-orange)]"
            />
            <span>
              Trotzdem <strong>kostenfrei</strong> durchführen (Override)
            </span>
          </label>
          {!kostenlos ? (
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={kundeInformiert}
                onChange={(e) => setKundeInformiert(e.target.checked)}
                className="accent-[color:var(--brand-orange)]"
              />
              <span>
                Kunde wurde über die Gebühr informiert *
              </span>
            </label>
          ) : null}
        </div>
      ) : (
        // Nicht gebührenpflichtig: trotzdem optional Override
        // anbieten falls Mario später "kostenlos vermerken" will
        <div className="mt-3 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer text-[color:var(--muted)]">
            <input
              type="checkbox"
              checked={kostenlos}
              onChange={(e) => setKostenlos(e.target.checked)}
              className="accent-[color:var(--brand-orange)]"
            />
            <span>
              Diese Umbuchung nicht in den Zähler aufnehmen (Kulanz)
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function BelegungsBadge({ snap }: { snap: Snapshot }) {
  const max = snap.max_registration ?? 0;
  const akt = snap.aktive ?? 0;
  const frei = snap.frei;
  const voll = !!snap.voll;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[color:var(--muted)]">Belegung:</span>
      <span className="font-medium tabular-nums">
        {akt}/{max || "?"}
      </span>
      {voll ? (
        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
          AUSGEBUCHT
        </span>
      ) : frei != null && frei <= 3 && frei > 0 ? (
        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
          {frei} frei
        </span>
      ) : frei != null && frei > 0 ? (
        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">
          {frei} frei
        </span>
      ) : null}
    </div>
  );
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}
