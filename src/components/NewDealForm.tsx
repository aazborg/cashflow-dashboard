"use client";

import { useState, useTransition } from "react";
import { createDealAction } from "@/lib/actions";
import { INTERVALL_OPTIONS } from "@/lib/types";

export default function NewDealForm({
  mitarbeiter,
}: {
  mitarbeiter: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      await createDealAction(formData);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-[color:var(--brand-blue)] text-white px-3 py-1.5 rounded text-sm font-medium"
      >
        + Neuer Deal
      </button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-4 gap-3"
    >
      <input
        name="vorname"
        placeholder="Vorname *"
        required
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
      />
      <input
        name="nachname"
        placeholder="Nachname *"
        required
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
      />
      <input
        name="email"
        type="email"
        placeholder="E-Mail Kontakt"
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
      />
      <select
        name="mitarbeiter_id"
        required
        defaultValue=""
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
      >
        <option value="" disabled>
          Mitarbeiter *
        </option>
        {mitarbeiter.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        name="betrag"
        type="number"
        step="0.01"
        placeholder="Betrag (€) *"
        required
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white text-right tabular-nums"
      />
      <input
        name="start_datum"
        type="date"
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
      />
      <input
        name="anzahl_raten"
        type="number"
        min="1"
        placeholder="Anzahl Raten"
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white text-right tabular-nums"
      />
      <select
        name="intervall"
        defaultValue=""
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white"
      >
        <option value="">Intervall</option>
        {INTERVALL_OPTIONS.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <input type="hidden" name="mitarbeiter_name" value="" id="mb-name" />
      <div className="sm:col-span-4 flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm px-3 py-1.5 rounded border border-[color:var(--border)]"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={pending}
          onClick={(e) => {
            const form = e.currentTarget.closest("form")!;
            const sel = form.querySelector<HTMLSelectElement>(
              'select[name="mitarbeiter_id"]',
            );
            const hidden = form.querySelector<HTMLInputElement>(
              'input[name="mitarbeiter_name"]',
            );
            if (sel && hidden) {
              hidden.value =
                sel.options[sel.selectedIndex]?.text ?? sel.value;
            }
          }}
          className="bg-[color:var(--brand-green)] text-white text-sm px-3 py-1.5 rounded font-medium disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
