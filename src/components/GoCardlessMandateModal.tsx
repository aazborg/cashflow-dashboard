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
    start_date_source?: "vertrag_ratenplan" | "leistungsbeginn" | "gc_default" | "auto_7d";
    termine?: string[];
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
  /** Entweder vorlageId ODER dealId muss gesetzt sein. */
  vorlageId?: string;
  dealId?: string;
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
  dealId,
  suchname,
  email,
  actedByEmail,
}: Props) {
  const [phase, setPhase] = useState<"loading" | "preview" | "submitting" | "success" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<VertragPreview | null>(null);
  const [result, setResult] = useState<MandateResult | null>(null);
  const [showFullIban, setShowFullIban] = useState(false);
  // Manuelle Overrides wenn Parser was nicht gefunden hat / unklar.
  const [override, setOverride] = useState<{
    betragEur?: string;
    intervallMonate?: string;
    anzahlRaten?: string;
    startDate?: string;
    iban?: string;
    bic?: string;
    kontoinhaber?: string;
  }>({});
  const [showSepaEdit, setShowSepaEdit] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("loading");
    setError("");
    setPreview(null);
    setResult(null);
    setShowFullIban(false);
    setOverride({});
    setShowSepaEdit(false);

    (async () => {
      try {
        const res = await fetch("/cashflow/api/bot/gocardless/parse-vertrag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            suchname,
            vorlage_id: vorlageId,
            deal_id: dealId,
          }),
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
  }, [open, suchname, vorlageId, dealId]);

  async function submitMandate() {
    setPhase("submitting");
    setError("");
    try {
      // Override-Payload nur senden wenn der User was eingegeben hat
      const ovBetrag = override.betragEur
        ? Math.round(parseFloat(override.betragEur.replace(",", ".")) * 100)
        : 0;
      const ovInt = override.intervallMonate
        ? parseInt(override.intervallMonate, 10) : 0;
      const ovAnz = override.anzahlRaten
        ? parseInt(override.anzahlRaten, 10) : 0;
      const ovPayload: Record<string, unknown> = {};
      if (ovBetrag) ovPayload.betrag_cents = ovBetrag;
      if (ovInt) ovPayload.intervall_monate = ovInt;
      if (ovAnz) ovPayload.anzahl_raten = ovAnz;
      if (override.startDate) ovPayload.start_date = override.startDate;
      if (override.iban) ovPayload.iban = override.iban.replace(/\s+/g, "");
      if (override.bic) ovPayload.bic = override.bic.replace(/\s+/g, "");
      if (override.kontoinhaber) ovPayload.kontoinhaber = override.kontoinhaber;

      const res = await fetch("/cashflow/api/bot/gocardless/create-mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vorlage_id: vorlageId,
          deal_id: dealId,
          suchname,
          email: email ?? undefined,
          acted_by_email: actedByEmail ?? undefined,
          override: Object.keys(ovPayload).length ? ovPayload : undefined,
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

  // canSubmit beruecksichtigt Overrides: wenn der Parser was nicht
  // findet, kann der User es manuell ergaenzen und der Submit ist
  // wieder erlaubt sobald die Override-Felder vollstaendig sind.
  const ovBetragOk = override.betragEur
    && parseFloat(override.betragEur.replace(",", ".")) > 0;
  const ovIntOk = override.intervallMonate
    && parseInt(override.intervallMonate, 10) > 0;
  const ovAnzOk = override.anzahlRaten
    && parseInt(override.anzahlRaten, 10) > 0;
  const ovStartOk = !!override.startDate;
  const allOverridesPresent = ovBetragOk && ovIntOk && ovAnzOk && ovStartOk;
  const ratenplanOk = !!preview?.ratenplan && !preview?.ratenplan_error;
  const ibanOk = !!(preview?.sepa.iban || override.iban);
  const kontoOk = !!(preview?.sepa.kontoinhaber || override.kontoinhaber);
  const canSubmit = !!(
    preview &&
    preview.sepa.klausel_present &&
    ibanOk &&
    kontoOk &&
    (ratenplanOk || allOverridesPresent)
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
                <div className="col-span-2 mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSepaEdit((v) => !v)}
                    className="text-[10px] text-[color:var(--brand-orange)] hover:underline"
                  >
                    {showSepaEdit ? "✕ Korrektur ausblenden" : "✏ Kontoinhaber/IBAN/BIC korrigieren"}
                  </button>
                </div>
                {showSepaEdit ? (
                  <div className="col-span-2 mt-1 grid grid-cols-1 gap-1.5 bg-white border border-amber-300 rounded p-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-amber-900/80 text-[10px]">Kontoinhaber (Override)</span>
                      <input type="text" placeholder={preview.sepa.kontoinhaber || "Vorname Nachname"}
                        value={override.kontoinhaber ?? ""}
                        onChange={(e) => setOverride((o) => ({ ...o, kontoinhaber: e.target.value }))}
                        className="border border-amber-400 rounded px-2 py-1 text-amber-900 text-xs" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-amber-900/80 text-[10px]">IBAN (Override)</span>
                      <input type="text" placeholder={preview.sepa.iban || "ATxx xxxx xxxx xxxx xxxx"}
                        value={override.iban ?? ""}
                        onChange={(e) => setOverride((o) => ({ ...o, iban: e.target.value.toUpperCase() }))}
                        className="border border-amber-400 rounded px-2 py-1 text-amber-900 text-xs font-mono" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-amber-900/80 text-[10px]">BIC (optional)</span>
                      <input type="text" placeholder={preview.sepa.bic || "BANKAT12XXX"}
                        value={override.bic ?? ""}
                        onChange={(e) => setOverride((o) => ({ ...o, bic: e.target.value.toUpperCase() }))}
                        className="border border-amber-400 rounded px-2 py-1 text-amber-900 text-xs font-mono" />
                    </label>
                    <div className="text-[10px] text-amber-900/70">
                      Leer lassen = Wert aus Vertrag verwenden. Befüllt = Override (wird vor Mandat-Anlage verwendet).
                    </div>
                  </div>
                ) : null}
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
                          {new Date(preview.ratenplan.start_date)
                            .toLocaleDateString("de-AT")}
                          {preview.ratenplan.start_date_source && (
                            <span className={
                              "ml-1.5 text-[10px] " +
                              (preview.ratenplan.start_date_source === "auto_7d"
                                ? "text-amber-700 font-semibold"
                                : "text-blue-900/60")
                            }>
                              ({{
                                vertrag_ratenplan: "aus Vertrag-Ratenplan",
                                leistungsbeginn: "aus Leistungsbeginn",
                                gc_default: "GC-Default ~2 Tage",
                                auto_7d: "⚠ auto: heute + 7 Tage (kein Datum im Vertrag)",
                              }[preview.ratenplan.start_date_source]})
                            </span>
                          )}
                        </div>
                      </>
                    )}
                    {!preview.ratenplan.start_date && (
                      <>
                        <div className="text-blue-900/70">Start</div>
                        <div className="font-medium text-amber-700">
                          ⚠ kein Datum im Vertrag — GC waehlt ~2 Werktage
                        </div>
                      </>
                    )}
                  </div>
                  {preview.ratenplan.termine
                    && preview.ratenplan.termine.length > 0 ? (
                    <div className="mt-2.5 pt-2 border-t border-blue-300/50">
                      <div className="text-[11px] text-blue-900/70 mb-1">
                        Faelligkeiten ({preview.ratenplan.termine.length}):
                      </div>
                      <div className="text-[11px] text-blue-900 leading-relaxed">
                        {preview.ratenplan.termine.map((t, i) => (
                          <span key={i} className="inline-block mr-2">
                            <span className="text-blue-900/50 mr-0.5">
                              {i + 1}.
                            </span>
                            {new Date(t).toLocaleDateString("de-AT")}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : preview.ratenplan_error ? (
                <div className="rounded p-3 text-sm bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
                  <div>
                    ⚠ Ratenplan konnte nicht eindeutig geparst werden: {preview.ratenplan_error}
                  </div>
                  <div className="text-[11px] text-amber-900/70">
                    Original-Text: {preview.raten_info}
                  </div>
                  <div className="mt-2 pt-2 border-t border-amber-300 grid grid-cols-2 gap-2 text-xs">
                    <div className="col-span-2 font-semibold text-amber-900">
                      Manuell ergänzen:
                    </div>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-amber-900/80 text-[11px]">Betrag pro Rate (EUR)</span>
                      <input type="text" inputMode="decimal" placeholder="1875,44"
                        value={override.betragEur ?? ""}
                        onChange={(e) => setOverride((o) => ({ ...o, betragEur: e.target.value }))}
                        className="border border-amber-400 rounded px-2 py-1 text-amber-900 bg-white" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-amber-900/80 text-[11px]">Intervall (Monate)</span>
                      <input type="number" min="1" max="24" placeholder="4"
                        value={override.intervallMonate ?? ""}
                        onChange={(e) => setOverride((o) => ({ ...o, intervallMonate: e.target.value }))}
                        className="border border-amber-400 rounded px-2 py-1 text-amber-900 bg-white" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-amber-900/80 text-[11px]">Anzahl Raten</span>
                      <input type="number" min="1" max="60" placeholder="6"
                        value={override.anzahlRaten ?? ""}
                        onChange={(e) => setOverride((o) => ({ ...o, anzahlRaten: e.target.value }))}
                        className="border border-amber-400 rounded px-2 py-1 text-amber-900 bg-white" />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-amber-900/80 text-[11px]">Startdatum 1. Rate</span>
                      <input type="date"
                        value={override.startDate ?? ""}
                        onChange={(e) => setOverride((o) => ({ ...o, startDate: e.target.value }))}
                        className="border border-amber-400 rounded px-2 py-1 text-amber-900 bg-white" />
                    </label>
                    {(ovBetragOk && ovIntOk && ovAnzOk && ovStartOk) ? (
                      <div className="col-span-2 mt-1 text-[11px] text-green-800 bg-green-50 border border-green-300 rounded px-2 py-1">
                        ✅ Alle Werte gesetzt – Mandat kann angelegt werden ({parseInt(override.anzahlRaten ?? "0", 10)}x {override.betragEur} € alle {override.intervallMonate} Monate ab {override.startDate})
                      </div>
                    ) : (
                      <div className="col-span-2 text-[11px] text-amber-900/70">
                        Alle 4 Felder ausfüllen, dann wird der Button aktiv.
                      </div>
                    )}
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
