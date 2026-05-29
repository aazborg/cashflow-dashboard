"use client";

import { useState, useTransition, useEffect } from "react";
import {
  requestDeleteAction,
  updateDealAction,
} from "@/lib/actions";
import { INTERVALL_OPTIONS, type Deal } from "@/lib/types";
import { formatEURPrecise } from "@/lib/cashflow";
import RechnungsEditor from "./RechnungsEditor";

interface Props {
  deal: Deal;
  isAdmin: boolean;
  /** Rechnungs-Bot (Beta) freigeschaltet? Steuert "Rechnung erstellen"-
   *  Button. Wird in der page.tsx via canUseRechnungsBot ermittelt. */
  canCreateRechnung?: boolean;
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
  // Lookup: gibt es fuer diese Deal-Email schon eine Rechnung
  // in unserer DB? Status 'draft'|'sent'|null. Steuert Button-Farbe.
  const [rechnungInfo, setRechnungInfo] = useState<{
    rechnung_id: number | null;
    rechnung_status: "draft" | "sent" | null;
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
        let v: { rechnung_id?: number | null;
                  rechnung_status?: "draft" | "sent" | null } | undefined;
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
        if (v?.rechnung_id) {
          setRechnungInfo({
            rechnung_id: v.rechnung_id,
            rechnung_status: v.rechnung_status ?? "draft",
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
          ) : null}
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
                      return base + "border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/10";
                    })()}
                    title={(() => {
                      const st = rechnungInfo?.rechnung_status;
                      const id = rechnungInfo?.rechnung_id;
                      if (st === "sent")
                        return `Rechnung #${id} versendet — klicken zum Anzeigen`;
                      if (st === "draft")
                        return `Rechnung #${id} als Draft angelegt — klicken zum Prüfen + Versenden`;
                      return "SimplyOrg-Rechnung für diesen Deal erstellen (Beta)";
                    })()}
                  >
                    {rechnungInfo?.rechnung_status === "sent"
                      ? "Rechnung ✓"
                      : rechnungInfo?.rechnung_status === "draft"
                      ? "Rechnung (Draft)"
                      : "Rechnung"}
                  </button>
                ) : null}
                <button
                  onClick={requestDelete}
                  disabled={pending}
                  className="text-xs px-2 py-1 rounded text-[color:var(--brand-orange)] hover:bg-[color:var(--brand-yellow)]/30 disabled:opacity-50"
                >
                  Löschen
                </button>
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
    </tr>
  );
}
