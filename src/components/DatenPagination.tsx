import Link from "next/link";

export default function DatenPagination({
  page,
  totalPages,
  size,
  total,
  q,
}: {
  page: number;
  totalPages: number;
  size: number;
  total: number;
  q: string;
}) {
  function buildHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("size", String(size));
    if (targetPage > 1) params.set("page", String(targetPage));
    return `?${params.toString()}`;
  }

  const start = total === 0 ? 0 : (page - 1) * size + 1;
  const end = Math.min(page * size, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="px-4 py-3 border-t border-[color:var(--border)] flex items-center justify-between flex-wrap gap-3 text-sm">
      <div className="text-xs text-[color:var(--muted)]">
        {total === 0
          ? "0 Einträge"
          : `Zeige ${start.toLocaleString("de-AT")}–${end.toLocaleString("de-AT")} von ${total.toLocaleString("de-AT")}`}
      </div>
      <div className="flex items-center gap-2">
        {canPrev ? (
          <Link
            href={buildHref(page - 1)}
            className="px-3 py-1.5 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
          >
            ← Zurück
          </Link>
        ) : (
          <span className="px-3 py-1.5 rounded border border-[color:var(--border)] opacity-40 cursor-not-allowed">
            ← Zurück
          </span>
        )}
        <span className="text-xs text-[color:var(--muted)] tabular-nums">
          Seite {page} / {totalPages}
        </span>
        {canNext ? (
          <Link
            href={buildHref(page + 1)}
            className="px-3 py-1.5 rounded bg-[color:var(--brand-blue)] text-white font-medium hover:opacity-90"
          >
            Weiter →
          </Link>
        ) : (
          <span className="px-3 py-1.5 rounded border border-[color:var(--border)] opacity-40 cursor-not-allowed">
            Weiter →
          </span>
        )}
      </div>
    </div>
  );
}
