import { ComingSoon, PageHeader } from "@/components/BuchhaltungUiBits";

export const dynamic = "force-dynamic";

export default function KontoauszuegePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Kontoauszüge"
        subtitle="Bank-Transaktionen aus hochgeladenen CSV-Auszügen."
      />
      <ComingSoon
        title="Auszüge importieren"
        what="CSV-Upload für die Erste-Bank-Auszüge (geplant nach GoCardless-Bank-Account-Data-Discontinuation). Importierte Transaktionen werden automatisch mit Rechnungen gematched."
      />
    </div>
  );
}
