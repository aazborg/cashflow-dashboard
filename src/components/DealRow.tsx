"use client";

import { useState, useTransition, useEffect } from "react";
import {
  blockHubspotImportAction,
  requestDeleteAction,
  updateDealAction,
} from "@/lib/actions";
import { INTERVALL_OPTIONS, type Deal } from "@/lib/types";
import { formatEURPrecise } from "@/lib/cashflow";
import RechnungsEditor from "./RechnungsEditor";
import GoCardlessMandateModal from "./GoCardlessMandateModal";
import DealMatchBankModal from "./DealMatchBankModal";

interface Props {
  deal: Deal;
  isAdmin: boolean;
  /** Rechnungs-Bot (Beta) freigeschaltet? Steuert "Rechnung erstellen"-
   *  Button. Wird in der page.tsx via canUseRechnungsBot ermittelt. */
  canCreateRechnung?: boolean;
  currentOwnerId?: string;
  /** Wird nur gerendert, wenn definiert — schaltet die Checkbox-Spalte ein. */
  selected?: boolean;
  onToggleSelect?: () => void;
}

export default function DealRow({
  deal,
  isAdmin,
  canCreateRechnung,
  selected,
  onToggleSelect,
}: Props) {
  const [rechnungsModalOpen, setRechnungsModalOpen] = useState(false);
  const [mandateModalOpen, setMandateModalOpen] = useState(false);
  const [bankMatchOpen, setBankMatchOpen] = useState(false);
  const [vertragSyncing, setVertragSyncing] = useState(false);
  // Lokaler Overlay nach manuellem "Vertrag-parsen"-Klick. Damit die
  // frischen Werte sofort im UI auftauchen, ohne Page-Reload.
  const [vertragOverlay, setVertragOverlay] = useState<{
    zahlungsmodell?: "einmal" | "raten" | null;
    raten_info?: string | null;
    vertrag_not_found?: boolean;
    vertrag_synced_at?: string | null;
  } | null>(null);
  // Reload-Trigger: nach Mandate-Anlage wird incrementiert, damit der
  // notiz-vorlagen-Lookup neu ausgefuehrt wird und der GC-Badge updated.
  const [reloadKey, setReloadKey] = useState(0);
  // Lookup: gibt es fuer diese Deal-Email schon eine Rechnung
  // in unserer DB? Status 'draft'|'sent'|null. Steuert Button-Farbe.
  const [rechnungInfo, setRechnungInfo] = useState<{
    vorlage_id?: string | null;
    rechnung_id: number | null;
    rechnung_status: "draft" | "sent" | "cancelled" | null;
    zahlungsmodell?: "einmal" | "raten" | null;
    raten_info?: string | null;
    gocardless_mandate_id?: string | null;
    gocardless_mandate_status?: string | null;
    gocardless_subscription_status?: string | null;
    gocardless_paid_count?: number | null;
    gocardless_paid_amount_cents?: number | null;
    gocardless_next_payment_date?: string | null;
    gocardless_next_payment_amount_cents?: number | null;
    gocardless_last_failure_at?: string | null;
    gocardless_last_failure_reason?: string | null;
    gocardless_env?: string | null;
  } | null>(null);
  useEffect(() => {
    if (!canCreateRechnung) return;
    const hasEmail = !!deal.email;
    // Fuer den Substring-Fallback nur den NACHNAMEN nehmen --
    // 'Pilgerstorfer' matched in 'a_k.pilgerstorfer@gmx.at',
    // 'Leutner' in 'eva.leutner@aon.at'. Voller Name 'Andrea
    // Pilgerstorfer' wuerde mit ilike %Andrea Pilgerstorfer% NUR
    // matchen wenn die name-Spalte gesetzt waere -- die meisten
    // Vorlagen haben aber name=null (Mario tippt im NotizGenerator
    // den Namen meist nicht ein).
    const nachname = (deal.nachname ?? "").trim();
    if (!hasEmail && !nachname) return;
    let cancelled = false;
    void (async () => {
      try {
        // 1) Lookup via Deal-Email (exakter Match). Greift wenn
        //    HubSpot fuer den Deal eine Email gespeichert hat und
        //    die mit der Vorlage uebereinstimmt.
        let v: {
          id?: string;
          rechnung_id?: number | null;
          rechnung_status?: "draft" | "sent" | "cancelled" | null;
          zahlungsmodell?: "einmal" | "raten" | null;
          raten_info?: string | null;
          gocardless_mandate_id?: string | null;
          gocardless_mandate_status?: string | null;
          gocardless_subscription_status?: string | null;
          gocardless_paid_count?: number | null;
          gocardless_paid_amount_cents?: number | null;
          gocardless_next_payment_date?: string | null;
          gocardless_next_payment_amount_cents?: number | null;
          gocardless_last_failure_at?: string | null;
          gocardless_last_failure_reason?: string | null;
          gocardless_env?: string | null;
        } | undefined;
        if (hasEmail) {
          const r = await fetch(
            `/cashflow/api/notiz-vorlagen?email=${encodeURIComponent(deal.email ?? "")}`,
          );
          if (cancelled) return;
          const j = await r.json();
          v = (j.data || [])[0];
        }
        // 2) Fallback: Substring-Suche auf Name UND Email. Faengt
        //    Faelle ab wo deal.email leer ist oder eine andere
        //    Adresse als die Vorlage hat (z.B. HubSpot-Email vs.
        //    SimplyOrg-Email). Wie im RechnungsEditor.
        if (!v?.rechnung_id && nachname) {
          const r2 = await fetch(
            `/cashflow/api/notiz-vorlagen?q=${encodeURIComponent(nachname)}&limit=1`,
          );
          if (cancelled) return;
          const j2 = await r2.json();
          v = (j2.data || [])[0];
        }
        if (v?.rechnung_id || v?.zahlungsmodell || v?.gocardless_mandate_status) {
          setRechnungInfo({
            vorlage_id: v.id ?? null,
            rechnung_id: v.rechnung_id ?? null,
            rechnung_status: v.rechnung_status ?? null,
            zahlungsmodell: v.zahlungsmodell ?? null,
            raten_info: v.raten_info ?? null,
            gocardless_mandate_id: v.gocardless_mandate_id ?? null,
            gocardless_mandate_status: v.gocardless_mandate_status ?? null,
            gocardless_paid_count: v.gocardless_paid_count ?? null,
            gocardless_paid_amount_cents: v.gocardless_paid_amount_cents ?? null,
            gocardless_next_payment_date: v.gocardless_next_payment_date ?? null,
            gocardless_next_payment_amount_cents:
              v.gocardless_next_payment_amount_cents ?? null,
            gocardless_last_failure_at: v.gocardless_last_failure_at ?? null,
            gocardless_last_failure_reason:
              v.gocardless_last_failure_reason ?? null,
            gocardless_env: v.gocardless_env ?? null,
          });
        } else {
          setRechnungInfo(null);
        }
      } catch {
        // ignore -- Button bleibt im Default-State
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    canCreateRechnung,
    deal.email,
    deal.vorname,
    deal.nachname,
    rechnungsModalOpen,
    reloadKey,
  ]);
  const showCheckbox = typeof selected === "boolean" && !!onToggleSelect;
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [betrag, setBetrag] = useState(String(deal.betrag));
  const [betragOriginal, setBetragOriginal] = useState(
    deal.betrag_original != null ? String(deal.betrag_original) : "",
  );
  const [email, setEmail] = useState(deal.email ?? "");
  const [start, setStart] = useState(deal.start_datum ?? "");
  const [raten, setRaten] = useState(
    deal.anzahl_raten != null ? String(deal.anzahl_raten) : "",
  );
  const [intervall, setIntervall] = useState(deal.intervall ?? "");

  function save() {
    const fd = new FormData();
    fd.set("id", deal.id);
    fd.set("betrag", betrag);
    if (isAdmin) fd.set("betrag_original", betragOriginal);
    fd.set("start_datum", start);
    if (raten) fd.set("anzahl_raten", raten);
    if (intervall) fd.set("intervall", intervall);
    fd.set("email", email.trim());
    startTransition(async () => {
      await updateDealAction(fd);
      setEditing(false);
    });
  }

  function requestDelete() {
    if (
      !confirm(
        "Lösch-Anfrage an Admin senden? Die Zeile wird erst nach Freigabe entfernt.",
      )
    )
      return;
    const fd = new FormData();
    fd.set("id", deal.id);
    startTransition(() => requestDeleteAction(fd));
  }

  function blockImport() {
    const who = `${deal.vorname} ${deal.nachname}`.trim() || "diesen Kontakt";
    const matchInfo = deal.email
      ? `\n\nGesperrt wird per E-Mail "${deal.email}" — alle künftigen Deals dieser Adresse werden blockiert.`
      : `\n\nGesperrt wird per Name "${who}" (keine E-Mail vorhanden) — alle künftigen Deals mit diesem Namen werden blockiert.`;
    if (
      !confirm(
        `${who} dauerhaft vom HubSpot-Import ausschließen?` +
          matchInfo +
          "\n\nDer aktuelle Eintrag wird ebenfalls gelöscht. Aufhebbar im Admin → Import-Sperrliste.",
      )
    )
      return;
    const reason = prompt("Grund (optional, für die Sperrliste):") ?? "";
    const fd = new FormData();
    fd.set("id", deal.id);
    if (reason.trim()) fd.set("reason", reason.trim());
    startTransition(() => blockHubspotImportAction(fd));
  }

  const rate =
    deal.anzahl_raten && deal.anzahl_raten > 0
      ? deal.betrag / deal.anzahl_raten
      : null;

  return (
    <tr
      className={`border-t border-[color:var(--border)] ${
        deal.pending_delete ? "bg-[color:var(--brand-yellow)]/20" : ""
      } ${selected ? "bg-[color:var(--brand-blue)]/10" : ""}`}
    >
      {showCheckbox ? (
        <td className="px-3 py-2 w-8">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            disabled={deal.pending_delete}
            className="accent-[color:var(--brand-blue)] cursor-pointer"
            aria-label={`Auswählen: ${deal.vorname} ${deal.nachname}`}
          />
        </td>
      ) : null}
      <td className="px-3 py-2">
        <div className="font-medium flex items-center gap-2 flex-wrap">
          <span>
            {deal.vorname} {deal.nachname}
          </span>
          {/* Status-Badge: 'auf einen Blick' sichtbar dass eine
              Rechnung existiert und in welchem Zustand. */}
          {rechnungInfo?.rechnung_status === "sent" ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-green-600 text-white"
              title={`Rechnung #${rechnungInfo.rechnung_id} versendet`}
            >
              ✓ Versendet
            </span>
          ) : rechnungInfo?.rechnung_status === "draft" ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-[color:var(--brand-orange)] text-white"
              title={`Rechnung #${rechnungInfo.rechnung_id} angelegt, noch nicht versendet`}
            >
              ● Draft
            </span>
          ) : rechnungInfo?.rechnung_status === "cancelled" ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-600 text-white"
              title={`Rechnung #${rechnungInfo.rechnung_id} storniert — Gutschrift in SimplyOrg`}
            >
              ⛔ Storniert
            </span>
          ) : null}
          {/* Bezahlt-Badge: aus Bank-Auszug-Match. Unabhaengig vom
              gocardless_* Status (Lastschrift), erfasst auch klassische
              Ueberweisungen. */}
          {deal.payment_status === "paid" ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-emerald-700 text-white"
              title={
                deal.paid_at
                  ? `bezahlt am ${deal.paid_at.slice(0, 10)}`
                  : "bezahlt"
              }
            >
              💶 Bezahlt
            </span>
          ) : deal.payment_status === "partial" ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-500 text-white"
              title={
                deal.amount_paid != null
                  ? `teilbezahlt: ${new Intl.NumberFormat("de-AT", {
                      style: "currency",
                      currency: "EUR",
                    }).format(Number(deal.amount_paid))}`
                  : "teilbezahlt"
              }
            >
              ◐ Teilbezahlt
            </span>
          ) : null}
          {(() => {
            // Vertrag-Zahlungsmodell: bevorzugt frisch geparst
            // (Overlay nach Button-Klick), dann aus deal (Background-
            // Sync), fallback auf Notiz-Vorlage.
            const zm = vertragOverlay?.zahlungsmodell
              ?? deal.zahlungsmodell
              ?? rechnungInfo?.zahlungsmodell;
            const info = vertragOverlay?.raten_info
              ?? deal.raten_info
              ?? rechnungInfo?.raten_info;
            const notFound = vertragOverlay?.vertrag_not_found
              ?? deal.vertrag_not_found;
            const syncedAt = vertragOverlay?.vertrag_synced_at
              ?? deal.vertrag_synced_at;
            const fileId = deal.vertrag_file_id;
            const fileName = deal.vertrag_file_name;
            const driveUrl = fileId
              ? `https://drive.google.com/file/d/${fileId}/view`
              : undefined;
            const wrap = (
              body: React.ReactNode,
              title: string,
              colorCls: string,
            ) =>
              driveUrl ? (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${colorCls} hover:opacity-80`}
                  title={`${title}\n${fileName ?? ""}\n(Klick = Vertrag in Drive öffnen)`}
                >
                  {body}
                </a>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${colorCls}`}
                  title={title}
                >
                  {body}
                </span>
              );
            if (zm === "raten") {
              return wrap(
                <>💳 Raten</>,
                info || "Ratenzahlung laut Vertrag",
                "bg-amber-100 text-amber-900 border-amber-300",
              );
            }
            if (zm === "einmal") {
              return wrap(
                <>💰 Einmal</>,
                "Einmalzahlung laut Vertrag",
                "bg-blue-100 text-blue-900 border-blue-300",
              );
            }
            if (notFound) {
              return (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-300"
                  title={
                    `Kein Vertrag in Drive gefunden (zuletzt geprüft: ${
                      syncedAt?.slice(0, 10) ?? "—"
                    })`
                  }
                >
                  ⚠ Kein Vertrag
                </span>
              );
            }
            return null;
          })()}
          {/* GC-Status-Badge wurde entfernt -- Status wird jetzt
              direkt am 'GC-Mandat anlegen'-Button im Aktion-Bereich
              durch Farbe + Label angezeigt. */}
        </div>
        {editing ? (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@beispiel.com"
            className="mt-1 w-full border border-[color:var(--border)] rounded px-2 py-1 text-xs"
            title="Email-Adresse — Schlüssel für den Rechnungs-Workflow (matcht gegen die Notiz-Vorlagen)"
          />
        ) : deal.email ? (
          <div className="text-xs text-[color:var(--muted)]">{deal.email}</div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-[color:var(--brand-orange)] hover:underline"
            title="Email ergänzen, damit der Rechnungs-Workflow die Vorlage findet"
          >
            ⚠ Email fehlt — klick zum Eintragen
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
        {deal.mitarbeiter_name}
      </td>
      {editing ? (
        <>
          <td className="px-3 py-2">
            <div className="flex flex-col items-end gap-1.5">
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                Mitarbeiter
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={betrag}
                  onChange={(e) => setBetrag(e.target.value)}
                  className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-28 text-right tabular-nums normal-case tracking-normal text-[color:var(--foreground)]"
                  title="Provisions-relevanter Betrag — vom Mitarbeiter editierbar"
                />
              </label>
              {isAdmin ? (
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[color:var(--brand-orange)]">
                  HubSpot
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={betragOriginal}
                    onChange={(e) => setBetragOriginal(e.target.value)}
                    className="border border-[color:var(--brand-orange)]/50 rounded px-2 py-1 text-sm w-28 text-right tabular-nums normal-case tracking-normal text-[color:var(--foreground)] bg-[color:var(--brand-yellow)]/10"
                    title="Original-Dealbetrag aus HubSpot — wird beim nächsten Sync mit dem aktuellen HubSpot-Wert überschrieben"
                  />
                </label>
              ) : null}
            </div>
          </td>
          <td className="px-3 py-2">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-full"
            />
          </td>
          <td className="px-3 py-2">
            <input
              type="number"
              min="1"
              step="1"
              value={raten}
              onChange={(e) => setRaten(e.target.value)}
              className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-20 text-right tabular-nums"
            />
          </td>
          <td className="px-3 py-2">
            <select
              value={intervall}
              onChange={(e) => setIntervall(e.target.value)}
              className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-full"
            >
              <option value="">—</option>
              {INTERVALL_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-[color:var(--muted)]">
            {raten && Number(raten) > 0 && betrag
              ? formatEURPrecise(Number(betrag) / Number(raten))
              : "—"}
          </td>
          <td className="px-3 py-2 text-right whitespace-nowrap">
            <button
              onClick={save}
              disabled={pending}
              className="bg-[color:var(--brand-blue)] text-white text-xs px-3 py-1 rounded mr-1 disabled:opacity-50"
            >
              {pending ? "…" : "Speichern"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={pending}
              className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
            >
              Abbrechen
            </button>
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2 text-right tabular-nums font-medium">
            <div>{formatEURPrecise(deal.betrag)}</div>
            {isAdmin && deal.betrag_original != null ? (
              <div
                className={`text-[10px] font-normal tabular-nums ${
                  deal.betrag_original !== deal.betrag
                    ? "text-[color:var(--brand-orange)]"
                    : "text-[color:var(--muted)]"
                }`}
                title={
                  deal.betrag_original !== deal.betrag
                    ? "Mitarbeiter-Betrag weicht vom HubSpot-Original ab"
                    : "Original-Betrag aus HubSpot"
                }
              >
                HubSpot: {formatEURPrecise(deal.betrag_original)}
              </div>
            ) : null}
          </td>
          <td className="px-3 py-2 text-sm">
            {deal.start_datum
              ? new Date(deal.start_datum).toLocaleDateString("de-AT")
              : "—"}
          </td>
          <td className="px-3 py-2 text-right tabular-nums">
            {deal.anzahl_raten ?? "—"}
          </td>
          <td className="px-3 py-2 text-sm">{deal.intervall ?? "—"}</td>
          <td className="px-3 py-2 text-right tabular-nums text-[color:var(--muted)]">
            {rate != null ? formatEURPrecise(rate) : "—"}
          </td>
          <td className="px-3 py-2 text-right whitespace-nowrap">
            {deal.pending_delete ? (
              <span className="text-xs text-[color:var(--brand-orange)] font-medium">
                Lösch-Anfrage offen
              </span>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)] mr-1"
                >
                  Bearbeiten
                </button>
                {canCreateRechnung && deal.nachname ? (
                  <button
                    onClick={async () => {
                      if (vertragSyncing) return;
                      setVertragSyncing(true);
                      try {
                        const r = await fetch("/cashflow/api/bot/vertrag/sync-deal", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            deal_id: deal.id,
                            suchname: `${deal.vorname ?? ""} ${deal.nachname ?? ""}`.trim(),
                          }),
                        });
                        const j = await r.json();
                        if (!r.ok) {
                          alert(`Fehler: ${j.error || r.status}`);
                        } else if (!j.found) {
                          setVertragOverlay({
                            zahlungsmodell: null,
                            raten_info: null,
                            vertrag_not_found: true,
                            vertrag_synced_at: new Date().toISOString(),
                          });
                        } else {
                          setVertragOverlay({
                            zahlungsmodell: j.zahlungsmodell,
                            raten_info: j.raten_info,
                            vertrag_not_found: false,
                            vertrag_synced_at: new Date().toISOString(),
                          });
                        }
                        setReloadKey((k) => k + 1);
                      } catch (e) {
                        alert(`Fehler: ${e instanceof Error ? e.message : e}`);
                      } finally {
                        setVertragSyncing(false);
                      }
                    }}
                    disabled={vertragSyncing}
                    className="text-xs px-1.5 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)] mr-1 disabled:opacity-40"
                    title={
                      deal.vertrag_synced_at
                        ? `Vertrag neu aus Drive parsen (zuletzt ${deal.vertrag_synced_at.slice(0,10)})`
                        : "Vertrag aus Drive parsen (zahlungsmodell, Raten-Info)"
                    }
                  >
                    {vertragSyncing ? "…" : "↻ Vertrag"}
                  </button>
                ) : null}
                {canCreateRechnung ? (
                  <button
                    onClick={() => setRechnungsModalOpen(true)}
                    className={(() => {
                      const base = "text-xs px-2 py-1 rounded mr-1 ";
                      const st = rechnungInfo?.rechnung_status;
                      if (st === "sent") {
                        return base + "bg-green-600 text-white hover:bg-green-700";
                      }
                      if (st === "draft") {
                        return base + "bg-[color:var(--brand-orange)] text-white hover:opacity-90";
                      }
                      if (st === "cancelled") {
                        return base + "bg-red-600 text-white hover:bg-red-700";
                      }
                      return base + "border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/10";
                    })()}
                    title={(() => {
                      const st = rechnungInfo?.rechnung_status;
                      const id = rechnungInfo?.rechnung_id;
                      if (st === "sent")
                        return `Rechnung #${id} versendet — klicken zum Anzeigen oder Stornieren`;
                      if (st === "draft")
                        return `Rechnung #${id} als Draft angelegt — klicken zum Prüfen + Versenden`;
                      if (st === "cancelled")
                        return `Rechnung #${id} storniert (Gutschrift in SimplyOrg) — klicken zum Anzeigen`;
                      return "SimplyOrg-Rechnung für diesen Deal erstellen (Beta)";
                    })()}
                  >
                    {rechnungInfo?.rechnung_status === "sent"
                      ? "Rechnung ✓"
                      : rechnungInfo?.rechnung_status === "draft"
                      ? "Rechnung (Draft)"
                      : rechnungInfo?.rechnung_status === "cancelled"
                      ? "Rechnung (storniert)"
                      : "Rechnung"}
                  </button>
                ) : null}
                {canCreateRechnung && deal.email ? (
                  (() => {
                    // 4 Button-Zustaende, alle 4 zeigen denselben
                    // Button (Mario will keinen extra Status-Badge):
                    //   - kein Mandat        -> lila Outline (anlegen)
                    //   - pending/submitted  -> amber (wartet auf Bank)
                    //   - active + ok        -> gruen (Mandat laeuft)
                    //   - failed/cancelled   -> rot
                    // WICHTIG: Status ausschliesslich deal-basiert.
                    // Vorher gab es einen Fallback auf rechnungInfo
                    // (Lookup via Email aus notiz_vorlagen). Das ist
                    // falsch wenn ein Kunde MEHRERE Deals hat: das
                    // Mandat des einen Deals wurde dann auch beim
                    // zweiten Deal als "aktiv" angezeigt -> man konnte
                    // kein eigenes Mandat fuer den zweiten Deal anlegen.
                    // Jetzt: nur deal.gocardless_* zaehlt. Wenn ein
                    // Deal kein eigenes Mandat hat, erscheint der
                    // "GC-Mandat anlegen"-Button (auch wenn der Kunde
                    // schon ein Mandat fuer einen anderen Deal hat).
                    const ms = deal.gocardless_mandate_status;
                    const mandateId = deal.gocardless_mandate_id;
                    const env = deal.gocardless_env;
                    const failed = !!deal.gocardless_last_failure_at;
                    const isSandbox = env === "sandbox";
                    const sbx = isSandbox ? " (SBX)" : "";
                    const base = "text-xs px-2 py-1 rounded mr-1 ";
                    let cls = "";
                    let label = "";
                    let tooltip = "";
                    if (!ms) {
                      cls = "border border-purple-600 text-purple-600 hover:bg-purple-600/10";
                      label = "GC-Mandat anlegen";
                      tooltip = "SEPA-Mandat bei GoCardless anlegen — auch bei Einmalzahlung moeglich (Vertrag wird aus Drive geladen, kann aber leer bleiben)";
                    } else if (ms === "active" && !failed) {
                      cls = "bg-green-600 text-white hover:bg-green-700";
                      label = "GC ✓ aktiv" + sbx;
                      tooltip = "Mandat aktiv, läuft regulär. Klick → in GoCardless öffnen.";
                    } else if (ms === "active" && failed) {
                      cls = "bg-red-600 text-white hover:bg-red-700";
                      label = "GC ⚠ Fehler" + sbx;
                      tooltip = `Mandat aktiv, ABER letzte Lastschrift fehlgeschlagen: ${deal.gocardless_last_failure_reason ?? "—"}`;
                    } else if (ms === "pending_submission" || ms === "submitted"
                                || ms === "pending_customer_approval") {
                      cls = "bg-amber-500 text-white hover:bg-amber-600";
                      label = "GC ⏳ wird eingereicht" + sbx;
                      tooltip = `Mandat angelegt, wartet auf Bank-Bestätigung (${ms}). Klick → in GoCardless öffnen.`;
                    } else if (ms === "failed" || ms === "cancelled"
                                || ms === "expired" || ms === "blocked") {
                      cls = "bg-red-600 text-white hover:bg-red-700";
                      label = `GC ❌ ${ms}` + sbx;
                      tooltip = `Mandat ${ms}. Klick → in GoCardless öffnen.`;
                    } else {
                      cls = "bg-gray-400 text-white";
                      label = `GC ${ms}` + sbx;
                      tooltip = `Mandat-Status: ${ms}`;
                    }
                    const gcUrl = mandateId
                      ? `https://manage${isSandbox ? "-sandbox" : ""}.gocardless.com/mandates/${mandateId}`
                      : null;
                    if (gcUrl) {
                      return (
                        <a
                          href={gcUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={base + cls}
                          title={tooltip}
                        >
                          {label}
                        </a>
                      );
                    }
                    return (
                      <button
                        onClick={() => setMandateModalOpen(true)}
                        className={base + cls}
                        title={tooltip}
                      >
                        {label}
                      </button>
                    );
                  })()
                ) : null}
                {deal.payment_status !== "paid" && (
                  <button
                    onClick={() => setBankMatchOpen(true)}
                    disabled={pending}
                    title="Bank-Buchung manuell als Bezahlung zuordnen"
                    className="text-xs px-2 py-1 rounded text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/10 disabled:opacity-50"
                  >
                    🔗 Bezahlt?
                  </button>
                )}
                <button
                  onClick={requestDelete}
                  disabled={pending}
                  className="text-xs px-2 py-1 rounded text-[color:var(--brand-orange)] hover:bg-[color:var(--brand-yellow)]/30 disabled:opacity-50"
                >
                  Löschen
                </button>
                {isAdmin && deal.hubspot_deal_id ? (
                  <button
                    onClick={blockImport}
                    disabled={pending}
                    title="Diesen Kontakt dauerhaft vom HubSpot-Import ausschließen"
                    className="text-xs px-2 py-1 rounded text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Nicht mehr importieren
                  </button>
                ) : null}
              </>
            )}
          </td>
        </>
      )}
      {canCreateRechnung && rechnungsModalOpen ? (
        // key=open-State erzwingt Remount bei jedem Oeffnen, damit
        // Form-State sauber zurueckgesetzt ist (vgl. RechnungsEditor
        // -- lazy initial state aus deal.vorname/nachname).
        <RechnungsEditor
          key={`${deal.id}-${rechnungsModalOpen}`}
          deal={deal}
          open={rechnungsModalOpen}
          onClose={() => setRechnungsModalOpen(false)}
        />
      ) : null}
      {canCreateRechnung && mandateModalOpen ? (
        <GoCardlessMandateModal
          key={`mandate-${deal.id}-${mandateModalOpen}`}
          open={mandateModalOpen}
          onClose={() => setMandateModalOpen(false)}
          onSuccess={() => setReloadKey((k) => k + 1)}
          vorlageId={rechnungInfo?.vorlage_id ?? undefined}
          dealId={deal.id}
          suchname={`${deal.vorname ?? ""} ${deal.nachname ?? ""}`.trim()}
          email={deal.email}
        />
      ) : null}
      {bankMatchOpen && (
        <DealMatchBankModal
          deal={deal}
          onClose={() => setBankMatchOpen(false)}
          onSuccess={() => {
            setBankMatchOpen(false);
            // Hard reload damit der payment_status aktualisiert ist
            window.location.reload();
          }}
        />
      )}
    </tr>
  );
}
