import { ComingSoon, PageHeader } from "@/components/BuchhaltungUiBits";

export const dynamic = "force-dynamic";

export default function RechnungenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungen"
        subtitle="Alle eingegangenen Rechnungen mit Status."
      />
      <ComingSoon
        title="Rechnungs-Liste"
        what="Vollständige Übersicht aller Belege mit Filter (Lieferant, Datum, Status: offen / zugeordnet / bezahlt), Such-Bar, Bulk-Aktionen und Detail-Drawer für jede einzelne Rechnung."
      />
    </div>
  );
}
