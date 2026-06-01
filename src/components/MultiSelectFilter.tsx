/**
 * Drop-in Multi-Select-Filter.
 *
 * Ueberall im /zahlungen-Tab als Ersatz fuer normale single-value
 * <select>-Dropdowns -- damit User mehrere Werte gleichzeitig
 * filtern kann (z.B. 'Bestaetigt + Geplant', 'mahnung_1 + mahnung_2').
 *
 * Konvention:
 *   selected = leeres Set -> 'kein Filter' (alle Zeilen passen).
 *   selected nicht leer    -> nur Zeilen wo Wert IN dem Set ist.
 *
 * UI: Button mit Summary, Click oeffnet Popover mit Checkbox-Liste.
 * Outside-Click oder ESC schliesst.
 */
"use client";

import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  /** Anzeige-Text wenn nichts ausgewaehlt. Default 'Alle'. */
  allLabel?: string;
  /** Optional: Tooltip auf dem Button */
  title?: string;
}

export default function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  allLabel = "Alle",
  title,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary =
    selected.size === 0
      ? allLabel
      : selected.size === 1
        ? options.find((o) => o.value === [...selected][0])?.label ??
          "1 Filter"
        : `${selected.size} Filter`;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm bg-white text-left min-w-[140px] flex items-center justify-between gap-1"
        title={title}
      >
        <span
          className={
            selected.size === 0
              ? "text-[color:var(--muted)]"
              : "font-medium text-[color:var(--foreground)]"
          }
        >
          {summary}
        </span>
        <span className="text-[10px] text-[color:var(--muted)]">▾</span>
      </button>
      {open ? (
        <div
          className="absolute z-20 mt-1 bg-white border border-[color:var(--border)] rounded shadow-lg p-1 min-w-[200px] max-h-[280px] overflow-y-auto"
          role="listbox"
        >
          <button
            type="button"
            onClick={clearAll}
            className="w-full text-left px-2 py-1 text-[11px] text-[color:var(--brand-orange)] hover:bg-[color:var(--surface)] rounded"
          >
            ✕ Auswahl zurücksetzen ({allLabel})
          </button>
          <div className="border-t border-[color:var(--border)] my-1" />
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-2 py-1 hover:bg-[color:var(--surface)] cursor-pointer text-xs rounded"
            >
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={() => toggle(o.value)}
                className="cursor-pointer"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
