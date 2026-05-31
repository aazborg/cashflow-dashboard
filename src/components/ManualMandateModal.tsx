/**
 * Modal zum manuellen Anlegen eines SEPA-Mandats ohne Vertrag-PDF.
 *
 * Mario erfasst alle Daten direkt (Customer, Bank, Ratenplan) und
 * bestaetigt per Checkbox, dass er das signierte SEPA-Mandat in
 * Papierform/Digital hat (rechtliche Pflicht).
 *
 * POST /cashflow/api/bot/gocardless/create-mandate-manual
 */
"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

type RatenMode = "regular" | "individuell";

interface IndRate {
  date: string;
  betragEur: string;
}

const eurNumber = (s: string): number => {
  const n = parseFloat((s ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

export default function ManualMandateModal({ onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<"form" | "submitting" | "success" | "error">("form");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    customer_id: string;
    mandate_id: string;
    subscription_id: string;
  } | null>(null);

  // Stammdaten
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [kontoinhaber, setKontoinhaber] = useState("");
  const [hauptartikel, setHauptartikel] = useState("");

  // Adresse (optional)
  const [addrLine1, setAddrLine1] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [countryCode, setCountryCode] = useState("AT");

  // Ratenplan
  const [mode, setMode] = useState<RatenMode>("regular");
  const [betragEur, setBetragEur] = useState("");
  const [intervallMonate, setIntervallMonate] = useState("4");
  const [anzahlRaten, setAnzahlRaten] = useState("");
  const [startDate, setStartDate] = useState("");
  const [individualRates, setIndividualRates] = useState<IndRate[]>([
    { date: "", betragEur: "" },
  ]);

  // Klausel-Bestaetigung
  const [klausel, setKlausel] = useState(false);

  const ibanValid = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban.replace(/\s+/g, ""));
  const baseRequired = vorname.trim() && nachname.trim() && email.trim() && ibanValid && klausel;
  const regularValid =
    eurNumber(betragEur) > 0 &&
    parseInt(intervallMonate, 10) > 0 &&
    parseInt(anzahlRaten, 10) > 0 &&
    !!startDate;
  const indAllValid =
    individualRates.length > 0 &&
    individualRates.every((r) => r.date && eurNumber(r.betragEur) > 0);
  const ratenValid = mode === "regular" ? regularValid : indAllValid;
  const canSubmit = !!baseRequired && ratenValid;

  const indSum = individualRates.reduce(
    (acc, r) => acc + eurNumber(r.betragEur),
    0,
  );
  const regularGesamt =
    eurNumber(betragEur) * (parseInt(anzahlRaten, 10) || 0);

  async function submit() {
    setPhase("submitting");
    setError("");
    try {
      const body: Record<string, unknown> = {
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        iban: iban.replace(/\s+/g, "").toUpperCase(),
        klausel_bestaetigt: true,
      };
      if (bic) body.bic = bic.replace(/\s+/g, "").toUpperCase();
      if (kontoinhaber) body.kontoinhaber = kontoinhaber.trim();
      if (hauptartikel) body.hauptartikel = hauptartikel.trim();
      if (addrLine1) body.address_line1 = addrLine1;
      if (city) body.city = city;
      if (postal) body.postal_code = postal;
      if (countryCode) body.country_code = countryCode;

      const rp: Record<string, unknown> = {};
      if (mode === "regular") {
        rp.betrag_cents = Math.round(eurNumber(betragEur) * 100);
        rp.intervall_monate = parseInt(intervallMonate, 10);
        rp.anzahl_raten = parseInt(anzahlRaten, 10);
        rp.start_date = startDate;
      } else {
        rp.custom_instalments = individualRates.map((r) => ({
          amount_cents: Math.round(eurNumber(r.betragEur) * 100),
          charge_date: r.date,
        }));
      }
      body.ratenplan = rp;

      const res = await fetch(
        "/cashflow/api/bot/gocardless/create-mandate-manual",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || `HTTP ${res.status}`);
        setPhase("error");
        return;
      }
      setResult(j);
      setPhase("success");
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[color:var(--border)] sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">Neues Mandat anlegen</h2>
            <div className="text-xs text-[color:var(--muted)]">
              Manuell, ohne Vertrag-PDF · GoCardless
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--muted)] hover:text-[color:var(--foreground)] p-1"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {phase === "success" && result ? (
            <div className="space-y-3">
              <div className="rounded p-3 bg-green-50 border border-green-300 text-green-900 text-sm">
                ✅ Mandat erfolgreich angelegt.
              </div>
              <div className="text-xs font-mono space-y-1 bg-gray-50 rounded p-3 border border-gray-200">
                <div>Customer: {result.customer_id}</div>
                <div>Mandate: {result.mandate_id}</div>
                <div>Subscription: {result.subscription_id}</div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-xs"
                >
                  Schließen
                </button>
              </div>
            </div>
          ) : phase === "error" ? (
            <div className="rounded p-3 bg-red-50 border border-red-300 text-red-900 text-sm space-y-2">
              <div>Fehler: {error}</div>
              <button
                type="button"
                onClick={() => setPhase("form")}
                className="text-xs underline"
              >
                Zurück zum Formular
              </button>
            </div>
          ) : (
            <>
              {/* Stammdaten */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase text-[color:var(--muted)]">
                  Stammdaten
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <Inp label="Vorname *" value={vorname} onChange={setVorname} />
                  <Inp label="Nachname *" value={nachname} onChange={setNachname} />
                  <Inp label="Email *" value={email} onChange={setEmail} type="email" wide />
                </div>
              </fieldset>

              {/* Bank */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase text-[color:var(--muted)]">
                  Bank-Daten
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <Inp label="Kontoinhaber" value={kontoinhaber}
                       onChange={setKontoinhaber}
                       placeholder={`${vorname} ${nachname}`.trim() || "wie oben"} wide />
                  <Inp label="IBAN *" value={iban}
                       onChange={(v) => setIban(v.toUpperCase())}
                       placeholder="AT00 0000 0000 0000 0000"
                       fontMono error={iban.length > 0 && !ibanValid ? "Format ungültig" : ""} />
                  <Inp label="BIC" value={bic}
                       onChange={(v) => setBic(v.toUpperCase())}
                       placeholder="BANKAT12XXX" fontMono />
                </div>
              </fieldset>

              {/* Adresse (optional) */}
              <details className="rounded border border-[color:var(--border)] p-2">
                <summary className="text-xs font-semibold uppercase text-[color:var(--muted)] cursor-pointer">
                  Adresse (optional)
                </summary>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Inp label="Straße + Nr" value={addrLine1} onChange={setAddrLine1} wide />
                  <Inp label="PLZ" value={postal} onChange={setPostal} />
                  <Inp label="Ort" value={city} onChange={setCity} />
                  <Inp label="Land" value={countryCode}
                       onChange={(v) => setCountryCode(v.toUpperCase())}
                       placeholder="AT" />
                </div>
              </details>

              {/* Plan-Name */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase text-[color:var(--muted)]">
                  Plan-Beschreibung
                </legend>
                <Inp label="Hauptartikel / Produkt"
                     value={hauptartikel}
                     onChange={setHauptartikel}
                     placeholder="z.B. Lebens- und Sozialberater:in"
                     wide />
              </fieldset>

              {/* Ratenplan */}
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase text-[color:var(--muted)]">
                  Ratenplan
                </legend>
                <div className="flex gap-2 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={mode === "regular"}
                           onChange={() => setMode("regular")} />
                    Regulär (gleiche Beträge)
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={mode === "individuell"}
                           onChange={() => setMode("individuell")} />
                    Individuell
                  </label>
                </div>
                {mode === "regular" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Inp label="Betrag pro Rate (EUR) *" value={betragEur}
                         onChange={setBetragEur} placeholder="1875,44" />
                    <Inp label="Intervall (Monate) *" value={intervallMonate}
                         onChange={setIntervallMonate} type="number" />
                    <Inp label="Anzahl Raten *" value={anzahlRaten}
                         onChange={setAnzahlRaten} type="number" />
                    <Inp label="Startdatum 1. Rate *" value={startDate}
                         onChange={setStartDate} type="date" />
                    {regularGesamt > 0 ? (
                      <div className="col-span-2 text-xs text-blue-900 bg-blue-50 border border-blue-300 rounded px-2 py-1">
                        Gesamt: {regularGesamt.toLocaleString("de-AT", {
                          style: "currency", currency: "EUR",
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {individualRates.map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="w-6 text-right text-[color:var(--muted)]">
                          {i + 1}.
                        </span>
                        <input type="date" value={r.date}
                               onChange={(e) => {
                                 const v = e.target.value;
                                 setIndividualRates((rs) => rs.map(
                                   (x, j) => j === i ? { ...x, date: v } : x));
                               }}
                               className="border border-[color:var(--border)] rounded px-2 py-1" />
                        <input type="text" inputMode="decimal"
                               placeholder="Betrag" value={r.betragEur}
                               onChange={(e) => {
                                 const v = e.target.value;
                                 setIndividualRates((rs) => rs.map(
                                   (x, j) => j === i ? { ...x, betragEur: v } : x));
                               }}
                               className="border border-[color:var(--border)] rounded px-2 py-1 w-24 text-right" />
                        <span className="text-[color:var(--muted)]">€</span>
                        <button type="button"
                                onClick={() => setIndividualRates((rs) => rs.filter((_, j) => j !== i))}
                                className="text-red-600 hover:text-red-800 px-1">
                          ✕
                        </button>
                      </div>
                    ))}
                    <button type="button"
                            onClick={() => setIndividualRates((rs) => [...rs, { date: "", betragEur: "" }])}
                            className="text-[11px] text-[color:var(--brand-orange)] hover:underline">
                      + Rate hinzufügen
                    </button>
                    {indSum > 0 ? (
                      <div className="text-xs text-blue-900 bg-blue-50 border border-blue-300 rounded px-2 py-1">
                        Summe: {indSum.toLocaleString("de-AT", { style: "currency", currency: "EUR" })}
                      </div>
                    ) : null}
                  </div>
                )}
              </fieldset>

              {/* SEPA-Klausel Bestaetigung */}
              <div className="rounded p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={klausel}
                         onChange={(e) => setKlausel(e.target.checked)}
                         className="mt-0.5" />
                  <span>
                    <b>Ich bestätige</b>, dass mir vom Kunden ein
                    signiertes SEPA-Lastschriftmandat (Papier oder
                    digital) vorliegt. Ohne diese Bestätigung kann
                    das Mandat rechtlich nicht angelegt werden.
                  </span>
                </label>
              </div>

              {/* Submit */}
              <div className="flex gap-2 justify-end pt-2 border-t border-[color:var(--border)]">
                <button type="button" onClick={onClose}
                        className="px-3 py-1.5 text-xs rounded border border-[color:var(--border)] hover:bg-gray-50">
                  Abbrechen
                </button>
                <button type="button" onClick={submit}
                        disabled={!canSubmit || phase === "submitting"}
                        className="px-3 py-1.5 text-xs rounded bg-[color:var(--brand-orange)] text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                  {phase === "submitting" ? "Lege an…" : "Mandat anlegen"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Inp({
  label, value, onChange, type = "text", placeholder, fontMono, error, wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  fontMono?: boolean;
  error?: string;
  wide?: boolean;
}) {
  return (
    <label className={"flex flex-col gap-0.5 " + (wide ? "col-span-2" : "")}>
      <span className="text-[10px] uppercase text-[color:var(--muted)]">
        {label}
      </span>
      <input type={type} value={value}
             onChange={(e) => onChange(e.target.value)}
             placeholder={placeholder}
             className={
               "border rounded px-2 py-1 text-xs " +
               (fontMono ? "font-mono " : "") +
               (error ? "border-red-400" : "border-[color:var(--border)]")
             } />
      {error ? <span className="text-[10px] text-red-700">{error}</span> : null}
    </label>
  );
}
