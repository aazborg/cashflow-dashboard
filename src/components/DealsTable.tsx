"use client";

import { useMemo, useState, useTransition } from "react";
import DealRow from "./DealRow";
import { bulkDeleteDealsAction } from "@/lib/actions";
import type { Deal } from "@/lib/types";

interface Props {
  deals: Deal[];
  isAdmin: boolean;
  /** Suchstring, für die "keine Treffer"-Meldung. */
  searchQuery?: string;
}

export default function DealsTable({ deals, isAdmin, searchQuery }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const eligibleIds = useMemo(
    () => deals.filter((d) => !d.pending_delete).map((d) => d.id),
    [deals],
  );
  const allSelected =
    eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
  const someSelected = !allSelected && eligibleIds.some((id) => selected.has(id));
  const colCount = isAdmin ? 9 : 8;

  function toggleAll() {
    setStatus(null);
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleIds));
    }
  }

  function toggle(id: string) {
    setStatus(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkDelete() {
    if (selected.size === 0) return;
    const ids = [...selected];
    if (
      !confirm(
        `${ids.length} Deal(s) wirklich endgültig löschen?\n\nDie Cashflows aus diesen Deals verschwinden ebenfalls. Aktion ist nicht rückgängig zu machen.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("ids", ids.join(","));
    startTransition(async () => {
      try {
        const res = await bulkDeleteDealsAction(fd);
        if (res.ok) {
          setStatus({
            kind: "ok",
            text: `${res.deleted} Deal(s) gelöscht.`,
          });
          setSelected(new Set());
        } else {
          setStatus({
            kind: "err",
            text: res.error ?? "Unbekannter Fehler.",
          });
        }
      } catch (err) {
        setStatus({
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <>
      {isAdmin && (selected.size > 0 || status) ? (
        <div
          className={`sticky top-14 z-10 px-3 py-2 flex items-center gap-3 border-b ${
            status?.kind === "err"
              ? "bg-[color:var(--brand-yellow)]/30 border-[color:var(--brand-orange)]"
              : status?.kind === "ok"
                ? "bg-[color:var(--brand-green)]/10 border-[color:var(--brand-green)]"
                : "bg-[color:var(--brand-blue)]/10 border-[color:var(--brand-blue)]"
          }`}
        >
          {selected.size > 0 ? (
            <>
              <span className="text-sm font-medium">
                {selected.size} ausgewählt
              </span>
              <button
                type="button"
                onClick={bulkDelete}
                disabled={pending}
                className="text-xs px-3 py-1 rounded bg-[color:var(--brand-orange)] text-white font-semibold disabled:opacity-50"
              >
                {pending ? "Lösche …" : "Auswahl löschen"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setStatus(null);
                }}
                disabled={pending}
                className="text-xs px-3 py-1 rounded border border-[color:var(--border)] bg-white"
              >
                Auswahl aufheben
              </button>
            </>
          ) : null}
          {status ? (
            <span className="text-sm ml-auto">{status.text}</span>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)] text-left">
            <tr>
              {isAdmin ? (
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="accent-[color:var(--brand-blue)] cursor-pointer"
                    aria-label="Alle auswählen"
                  />
                </th>
              ) : null}
              <th className="px-3 py-2 font-medium">Kontakt</th>
              <th className="px-3 py-2 font-medium">Mitarbeiter</th>
              <th className="px-3 py-2 font-medium text-right">Betrag</th>
              <th className="px-3 py-2 font-medium">Startdatum</th>
              <th className="px-3 py-2 font-medium text-right">Raten</th>
              <th className="px-3 py-2 font-medium">Intervall</th>
              <th className="px-3 py-2 font-medium text-right">Rate</th>
              <th className="px-3 py-2 font-medium text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-3 py-12 text-center text-[color:var(--muted)]"
                >
                  {searchQuery
                    ? `Keine Treffer für „${searchQuery}".`
                    : "Noch keine Deals. Lege manuell einen an oder warte auf den nächsten HubSpot-Push."}
                </td>
              </tr>
            ) : (
              deals.map((d) => (
                <DealRow
                  key={d.id}
                  deal={d}
                  isAdmin={isAdmin}
                  selected={isAdmin ? selected.has(d.id) : undefined}
                  onToggleSelect={isAdmin ? () => toggle(d.id) : undefined}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
