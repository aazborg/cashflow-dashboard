/**
 * Buchhaltung > Übersicht (Default-Tab).
 *
 * Erster Schritt: Platzhalter mit Status-Kacheln. Die echten Zahlen
 * (Rechnungen pro Monat, monatliche Ausgaben, offene Beträge) folgen
 * sobald wir den Datenfluss angeschlossen haben.
 */
import { PageHeader } from "@/components/BuchhaltungUiBits";

export const dynamic = "force-dynamic";

export default function BuchhaltungUebersichtPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Übersicht"
        subtitle="Aktueller Stand deiner Buchhaltung."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Rechnungen diesen Monat"
          value="—"
          hint="Anzahl verarbeiteter Rechnungen"
        />
        <KpiCard
          label="Monatliche Ausgaben"
          value="—"
          hint="Summe der Ausgaben dieses Monats"
        />
        <KpiCard
          label="Offener Betrag"
          value="—"
          hint="Rechnungen ohne Buchungs-Match"
        />
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-white p-6">
        <h2 className="font-semibold text-[color:var(--foreground)]">
          Datenfluss anschließen
        </h2>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Der Bereich ist als Gerüst eingerichtet. Sobald wir die
          Datenquellen (Posteingangs-E-Mail für Rechnungen,
          CSV-Upload für Kontoauszüge) angeschlossen haben, werden die
          KPI-Kacheln und Trends hier automatisch befüllt. Bis dahin
          kannst du den linken Bereich nutzen, um die Sub-Seiten als
          Platzhalter zu sehen.
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-white p-5">
      <div className="text-xs text-[color:var(--muted)]">{label}</div>
      <div className="text-3xl font-semibold text-[color:var(--foreground)] mt-2">
        {value}
      </div>
      <div className="text-xs text-[color:var(--muted)] mt-3">{hint}</div>
    </div>
  );
}
