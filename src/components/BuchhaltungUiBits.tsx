/**
 * Geteilte UI-Bausteine für den Buchhaltung-Bereich.
 */
export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="border-b border-[color:var(--border)] pb-3">
      <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--foreground)]">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-[color:var(--muted)] mt-1">{subtitle}</p>
      )}
    </div>
  );
}

export function ComingSoon({
  title,
  what,
}: {
  title: string;
  what: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-white p-10 text-center">
      <div className="text-base font-medium text-[color:var(--foreground)]">
        {title}
      </div>
      <p className="text-sm text-[color:var(--muted)] mt-2 max-w-md mx-auto">
        {what}
      </p>
      <p className="text-xs text-[color:var(--muted)] mt-4">
        Sukzessive Ausbau — sag Bescheid welche Funktion als nächstes
        kommen soll.
      </p>
    </div>
  );
}
