"use client";

/**
 * GoCardless-Mandate-Erstellungs-Modal.
 *
 * Workflow:
 *   1. Beim Open: ruft /api/bot/gocardless/parse-vertrag mit suchname auf.
 *      Bot laedt den signierten Vertrag aus Google Drive und parst die
 *      SEPA-Felder + den Ratenplan.
 *   2. Preview: zeigt extrahierte Daten -- Mario kontrolliert sie.
 *   3. Bestaetigen-Button: ruft /api/bot/gocardless/create-mandate auf.
 *      Bot legt sequenziell Customer + Bank-Account + Mandate +
 *      Subscription in GoCardless an + schreibt Status in Supabase.
 *
 * Permission: Server-Side ueber den /api/bot-Proxy (canUseRechnungsBot).
 */
import { useEffect, useState } from "react";

interface VertragPreview {
  vertrag_file_name?: string;
  zahlungsmodell: "einmal" | "raten" | string;
  raten_info?: string;
  leistungsbeginn?: string;
  teilnehmer?: string;
  gesamtbetrag?: number | null;
  sepa: {
    klausel_present: boolean;
    kontoinhaber: string;
    iban: string;
    bic: string;
    creditor_id: string;
    signature_ref: string;
  };
  ratenplan?: {
    betrag_cents: number;
    betrag_eur: number;
    intervall_monate: number;
    anzahl_raten: number;
    gesamt_eur: number;
    start_date?: string;
  };
  ratenplan_error?: string;
}

interface MandateResult {
  ok: boolean;
  env: string;
  customer_id: string;
  mandate_id: string;
  mandate_reference: string;
  mandate_status: string;
  subscription_id: string;
  subscription_status: string;
  amount_per_rate_eur: number;
  interval_monate: number;
  anzahl_raten: number;
  gesamt_eur: number;
  start_date?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  vorlageId: string;
  suchname: string;
  email?: string | null;
  actedByEmail?: string | null;
}

function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function maskIban(iban: string): string {
  if (!iban || iban.length < 8) return iban;
  const head = iban.slice(0, 4);
  const tail = iban.slice(-4);
  return `${head}${"•".repeat(iban.length - 8)}${tail}`;
}

export default function GoCardlessMandateModal({
  open,
  onClose,
  onSuccess,
  vorlageId,
  suchname,
  email,
  actedByEmail,
}: Props) {
  const [phase, setPhase] = useState<"loading" | "preview" | "submitting" | "success" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<VertragPreview | null>(null);
  const [result, setResult] = useState<MandateResult | null>(null);
  const [showFullIban, setShowFullIban] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("loading");
    setError("");
    setPreview(null);
    setResult(null);
    setShowFullIban(false);

    (async () => {
      try {
        const res = await fetch("/api/bot/gocardless/parse-vertrag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suchname, vorlage_id: vorlageId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || `HTTP ${res.status}`);
          setPhase("error");
          return;
        }
        setPreview(data);
        setPhase("preview");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();

    return () => { cancelled = true; };
  }, [open, suchname, vorlageId]);

  async function submitMandate() {
    setPhase("submitting");
    setError("");
    try {
      const res = await fetch("/api/bot/gocardless/create-mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vorlage_id: vorlageId,
          suchname,
          email: email ?? undefined,
          acted_by_email: actedByEmail ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        setPhase("error");
        return;
      }
      setResult(data as MandateResult);
      setPhase("success");
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  if (!open) return null;

  const canSubmit = !!(
    preview &&
    preview.sepa.klausel_present &&
    preview.sepa.iban &&
    preview.sepa.kontoinhaber &&
    preview.ratenplan &&
    !preview.ratenplan_error
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[color:var(--border)] sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-semibold">SEPA-Mandat anlegen</h2>
            <p className="text-xs text-[color:var(--muted)]">
              {suchname} · GoCardless {result?.env ?? "Sandbox"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-black text-xl leading-none"
            title="Schließen"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          {phase === "loading" && (
            <div className="text-sm text-[color:var(--muted)]">
              <span className="animate-pulse">Lade Vertrag aus Drive + parse SEPA-Felder…</span>
            </div>
          )}

          {phase === "error" && (
            <div className="bg-red-50 border border-red-300 rounded p-3 text-sm">
              <div className="font-semibold text-red-900 mb-1">Fehler</div>
              <div className="text-red-900 whitespace-pre-wrap">{error}</div>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 text-xs text-red-900 underline"
              >
                Schließen
              </button>
            </div>
          )}

          {phase === "preview" && preview && (
            <>
              <div className="text-xs text-[color:var(--muted)]">
                Quelle: <span className="font-mono">{preview.vertrag_file_name || "(unbekannt)"}</span>
              </div>

              {/* SEPA-Klausel-Check */}
              <div className={`rounded p-3 text-sm border ${
                preview.sepa.klausel_present
                  ? "bg-green-50 border-green-300"
                  : "bg-red-50 border-red-300"
              }`}>
                {preview.sepa.klausel_present ? (
                  <>✅ SEPA-Lastschriftklausel im Vertrag gefunden.</>
                ) : (
                  <>
                    ⛔ <b>Keine SEPA-Lastschriftklausel im Vertrag.</b> Mandat-Anlage rechtlich nicht zulässig.
                  </>
                )}
              </div>

              {/* Bank-Daten */}
              <div className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-3 text-xs bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-[color:var(--muted)]">Kontoinhaber</div>
                <div className="font-medium">{preview.sepa.kontoinhaber || "—"}</div>
                <div className="text-[color:var(--muted)]">IBAN</div>
                <div className="font-mono">
                  {showFullIban
                    ? formatIban(preview.sepa.iban)
                    : maskIban(preview.sepa.iban)}
                  {preview.sepa.iban && (
                    <button
                      type="button"
                      onClick={() => setShowFullIban(!showFullIban)}
                      className="ml-2 text-[10px] text-[color:var(--brand-orange)] hover:underline"
                    >
                      {showFullIban ? "verbergen" : "anzeigen"}
                    </button>
                  )}
                </div>
                <div className="text-[color:var(--muted)]">BIC</div>
                <div className="font-mono">{preview.sepa.bic || "—"}</div>
                <div className="text-[color:var(--muted)]">Gläubiger-ID</div>
                <div className="font-mono text-[11px]">{preview.sepa.creditor_id || "—"}</div>
                <div className="text-[color:var(--muted)]">Mandat-Ref</div>
                <div className="font-mono text-[11px]">
                  {preview.sepa.signature_ref || "(wird generiert)"}
                </div>
              </div>

              {/* Ratenplan */}
              {preview.ratenplan ? (
                <div className="rounded p-3 text-sm bg-blue-50 border border-blue-300">
                  <div className="font-semibold text-blue-900 mb-1.5">Ratenplan</div>
                  <div className="grid grid-cols-2 gap-y-1 text-xs">
                    <div className="text-blue-900/70">Pro Rate</div>
                    <div className="font-medium text-blue-900">
                      {preview.ratenplan.betrag_eur.toLocaleString("de-AT", {
                        style: "currency", currency: "EUR",
                      })}
                    </div>
                    <div className="text-blue-900/70">Intervall</div>
                    <div className="font-medium text-blue-900">
                      alle {preview.ratenplan.intervall_monate} Monate
                    </div>
                    <div className="text-blue-900/70">Anzahl Raten</div>
                    <div className="font-medium text-blue-900">
                      {preview.ratenplan.anzahl_raten}×
                    </div>
                    <div className="text-blue-900/70">Gesamt</div>
                    <div className="font-medium text-blue-900">
                      {preview.ratenplan.gesamt_eur.toLocaleString("de-AT", {
                        style: "currency", currency: "EUR",
                      })}
                    </div>
                    {preview.ratenplan.start_date && (
                      <>
                        <div className="text-blue-900/70">Start</div>
                        <div className="font-medium text-blue-900">
                          {preview.ratenplan.start_date}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : preview.ratenplan_error ? (
                <div className="rounded p-3 text-sm bg-amber-50 border border-amber-300 text-amber-900">
                  ⚠ Ratenplan konnte nicht eindeutig geparst werden: {preview.ratenplan_error}
                  <div className="mt-1 text-[11px] text-amber-900/70">
                    Original-Text: {preview.raten_info}
                  </div>
                </div>
              ) : (
                <div className="rounded p-3 text-sm bg-amber-50 border border-amber-300 text-amber-900">
                  ⚠ Zahlungsmodell laut Vertrag: <b>{preview.zahlungsmodell}</b>.
                  Mandat-Anlage ist nur bei Ratenzahlung sinnvoll.
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-2 justify-end pt-2 border-t border-[color:var(--border)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs rounded border border-[color:var(--border)] hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={submitMandate}
                  disabled={!canSubmit}
                  className="px-3 py-1.5 text-xs rounded bg-[color:var(--brand-orange)] text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={canSubmit
                    ? "Customer + Mandate + Subscription in GoCardless anlegen"
                    : "Voraussetzungen nicht erfüllt"}
                >
                  Mandat & Subscription anlegen
                </button>
              </div>
            </>
          )}

          {phase === "submitting" && (
            <div className="text-sm text-[color:var(--muted)]">
              <span className="animate-pulse">
                Lege Customer + Mandate + Subscription bei GoCardless an…
              </span>
              <div className="text-xs mt-1">
                (Sequenzielle API-Calls, ~3-5 Sekunden)
              </div>
            </div>
          )}

          {phase === "success" && result && (
            <div className="space-y-3">
              <div className="rounded p-3 text-sm bg-green-50 border border-green-300">
                <div className="font-semibold text-green-900">
                  ✅ Mandat angelegt
                </div>
                <div className="text-xs text-green-900/80 mt-0.5">
                  Subscription läuft automatisch sobald das Mandat aktiviert ist.
                </div>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-y-1.5 gap-x-3 text-xs bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-[color:var(--muted)]">Customer-ID</div>
                <div className="font-mono">{result.customer_id}</div>
                <div className="text-[color:var(--muted)]">Mandate-ID</div>
                <div className="font-mono">{result.mandate_id}</div>
                <div className="text-[color:var(--muted)]">Mandate-Ref</div>
                <div className="font-mono">{result.mandate_reference}</div>
                <div className="text-[color:var(--muted)]">Mandate-Status</div>
                <div className="font-medium">{result.mandate_status}</div>
                <div className="text-[color:var(--muted)]">Subscription</div>
                <div className="font-mono">{result.subscription_id}</div>
                <div className="text-[color:var(--muted)]">Sub-Status</div>
                <div className="font-medium">{result.subscription_status}</div>
                <div className="text-[color:var(--muted)]">Pro Rate</div>
                <div className="font-medium">
                  {result.amount_per_rate_eur.toLocaleString("de-AT", {
                    style: "currency", currency: "EUR",
                  })} (×{result.anzahl_raten}, alle {result.interval_monate} Monate)
                </div>
                <div className="text-[color:var(--muted)]">Umgebung</div>
                <div className="font-medium uppercase">{result.env}</div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs rounded bg-[color:var(--brand-orange)] text-white font-medium hover:opacity-90"
                >
                  Schließen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
