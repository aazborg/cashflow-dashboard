/**
 * NoteCell: kleine Notiz-Zelle pro Payment- oder Mandate-Zeile.
 *
 * - Leer: zeigt blasses "+ Notiz"-Pencil-Symbol
 * - Vorhanden: zeigt erste Zeile gekuerzt + Pencil-Icon zum Bearbeiten
 *
 * Klick oeffnet ein kleines Popup mit Textarea. Speichern via
 * /api/resolutions (POST mit { gc_id, kind, note }).
 *
 * Optimistic UI -- bei Server-Fehler Rollback + Alert.
 */
"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  gcId: string;
  kind: "payment" | "mandate";
  initialNote: string | null;
  onChange: (note: string | null) => void;
}

export default function NoteCell({
  gcId,
  kind,
  initialNote,
  onChange,
}: Props) {
  const [note, setNote] = useState<string | null>(initialNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync wenn parent neue Daten liefert (z.B. nach Refresh)
  useEffect(() => {
    setNote(initialNote);
  }, [initialNote]);

  // Outside-Click / ESC schliesst, ohne zu speichern
  useEffect(() => {
    if (!editing) return;
    const onDoc = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setEditing(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [editing]);

  async function save() {
    const next = draft.trim() === "" ? null : draft.trim();
    setSaving(true);
    const prev = note;
    setNote(next);
    onChange(next);
    try {
      const res = await fetch("/cashflow/api/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gc_id: gcId,
          kind,
          note: next ?? "",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing(false);
    } catch (e) {
      setNote(prev);
      onChange(prev);
      alert(
        "Konnte Notiz nicht speichern: " +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setSaving(false);
    }
  }

  const hasNote = !!note && note.trim() !== "";
  const preview =
    hasNote && note
      ? note.length > 40
        ? note.slice(0, 40) + "…"
        : note
      : "";

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setDraft(note ?? "");
          setEditing(true);
        }}
        className={
          hasNote
            ? "text-[10px] text-[color:var(--foreground)] hover:text-[color:var(--brand-orange)] hover:underline text-left max-w-[180px] truncate"
            : "text-[10px] text-[color:var(--muted)] hover:text-[color:var(--brand-orange)] opacity-70 hover:opacity-100"
        }
        title={hasNote ? note ?? "" : "Notiz hinzufügen"}
      >
        {hasNote ? `📝 ${preview}` : "+ Notiz"}
      </button>
      {editing ? (
        <div
          ref={popoverRef}
          className="absolute z-30 mt-1 right-0 bg-white border border-[color:var(--border)] rounded shadow-lg p-2 w-[320px]"
        >
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Notiz zu dieser Zahlung / diesem Mandat…"
            className="w-full text-xs border border-[color:var(--border)] rounded px-2 py-1.5 resize-none"
          />
          <div className="flex items-center justify-between mt-1.5 gap-1.5">
            <span className="text-[10px] text-[color:var(--muted)]">
              {draft.length}/500
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[11px] px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
                disabled={saving}
              >
                Abbr.
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="text-[11px] px-2 py-1 rounded bg-[color:var(--brand-orange)] text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
