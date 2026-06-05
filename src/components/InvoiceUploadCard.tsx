"use client";
/**
 * Wiederverwendbare Upload-Karte für Rechnungs-PDFs.
 * Wird in 3 Pages eingebunden: Schnell-Upload, Rechnungen, Kontoauszüge.
 *
 * Drag & Drop ODER File-Picker. Mehrere Files möglich (sequenziell hochladen).
 * Progress-Balken pro Datei. Bei Erfolg Hinweis mit Lieferant + Betrag.
 */
import { useCallback, useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string; progress: number; stage: string }
  | { kind: "ok"; lieferant?: string; brutto?: number; driveUrl?: string; status: string; filename: string }
  | { kind: "err"; filename: string; msg: string };

function eur(v: number | undefined | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(v));
}

export default function InvoiceUploadCard({
  source = "schnell_upload",
  onSuccess,
  compact = false,
}: {
  source?: "schnell_upload" | "rechnungen" | "kontoauszuege";
  onSuccess?: () => void;
  compact?: boolean;
}) {
  const [recent, setRecent] = useState<Status[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadOne = useCallback(
    (file: File): Promise<void> =>
      new Promise((resolve) => {
        const local: Status = {
          kind: "uploading",
          filename: file.name,
          progress: 0,
          stage: "Hochladen…",
        };
        setRecent((r) => [local, ...r].slice(0, 8));

        const fd = new FormData();
        fd.append("file", file);
        fd.append("source", source);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/cashflow/api/buchhaltung/invoice/upload");
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setRecent((r) =>
              r.map((item, i) =>
                i === 0
                  ? { ...item, kind: "uploading", progress: pct, stage: pct >= 100 ? "Claude parst…" : "Hochladen…", filename: file.name }
                  : item,
              ),
            );
          }
        });
        xhr.addEventListener("load", () => {
          try {
            const j = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && j.ok) {
              const next: Status = {
                kind: "ok",
                filename: file.name,
                status: j.status ?? "parsed",
                lieferant: j.lieferant,
                brutto: j.brutto,
                driveUrl: j.drive_url,
              };
              setRecent((r) => [next, ...r.slice(1)].slice(0, 8));
              onSuccess?.();
            } else {
              const errItem: Status = { kind: "err", filename: file.name, msg: j.error ?? `HTTP ${xhr.status}` };
              setRecent((r) => [errItem, ...r.slice(1)].slice(0, 8));
            }
          } catch {
            const errItem: Status = { kind: "err", filename: file.name, msg: `HTTP ${xhr.status}` };
            setRecent((r) => [errItem, ...r.slice(1)].slice(0, 8));
          }
          resolve();
        });
        xhr.addEventListener("error", () => {
          const errItem: Status = { kind: "err", filename: file.name, msg: "Netzwerkfehler" };
          setRecent((r) => [errItem, ...r.slice(1)].slice(0, 8));
          resolve();
        });
        xhr.send(fd);
      }),
    [source, onSuccess],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length === 0) {
        alert("Bitte nur PDFs hochladen.");
        return;
      }
      setBusy(true);
      try {
        for (const f of pdfs) {
          await uploadOne(f);
        }
      } finally {
        setBusy(false);
      }
    },
    [uploadOne],
  );

  return (
    <div
      className={
        "bg-white border-2 rounded-lg p-4 transition " +
        (dragOver
          ? "border-[color:var(--brand-orange)] bg-[color:var(--brand-orange)]/5"
          : "border-dashed border-[color:var(--border)]")
      }
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
      }}
    >
      <div className={"flex items-center gap-4 " + (compact ? "" : "flex-wrap")}>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            📄 Rechnung hochladen — Drag & Drop oder Klick
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            PDF wird mit Claude-Vision geparst, in Drive abgelegt und ans Match gegeben.
            Du kannst auch mehrere gleichzeitig droppen.
          </div>
        </div>
        <label className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-sm font-medium cursor-pointer disabled:opacity-50">
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
          {busy ? "Lädt…" : "PDF wählen"}
        </label>
      </div>

      {recent.length > 0 && (
        <div className="mt-3 space-y-1 max-h-48 overflow-y-auto text-xs">
          {recent.map((r, i) => (
            <div
              key={i}
              className={
                "px-2 py-1 rounded border " +
                (r.kind === "ok"
                  ? "border-emerald-200 bg-emerald-50"
                  : r.kind === "err"
                    ? "border-red-200 bg-red-50"
                    : "border-[color:var(--border)] bg-[color:var(--surface)]")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{r.kind === "uploading" || r.kind === "ok" || r.kind === "err" ? r.filename : ""}</span>
                <span className="whitespace-nowrap">
                  {r.kind === "uploading" && `${r.stage} ${r.progress}%`}
                  {r.kind === "ok" && r.status === "parsed" && (
                    <>
                      ✅ {r.lieferant ?? "—"} · {eur(r.brutto)}{" "}
                      {r.driveUrl && (
                        <a
                          href={r.driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-700 underline ml-2"
                        >
                          Drive
                        </a>
                      )}
                    </>
                  )}
                  {r.kind === "ok" && r.status === "duplikat" && (
                    <span className="text-amber-700">↺ Duplikat</span>
                  )}
                  {r.kind === "ok" && r.status === "rejected" && (
                    <span className="text-[color:var(--muted)]">⛔ verworfen (keine Eingangsrechnung)</span>
                  )}
                  {r.kind === "err" && <span className="text-red-700">❌ {r.msg.slice(0, 80)}</span>}
                </span>
              </div>
              {r.kind === "uploading" && (
                <div className="h-1 w-full rounded-full bg-white mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--brand-orange)] transition-all duration-150"
                    style={{ width: `${r.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
