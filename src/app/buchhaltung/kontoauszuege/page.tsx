import { PageHeader } from "@/components/BuchhaltungUiBits";
import KontoauszuegeClient from "@/components/KontoauszuegeClient";
import InvoiceUploadCard from "@/components/InvoiceUploadCard";
import MonatsabschlussBox from "@/components/MonatsabschlussBox";

export const dynamic = "force-dynamic";

export default function KontoauszuegePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Kontoauszüge"
        subtitle="Bank-Auszüge importieren + Auto-Match mit Rechnungen."
      />
      <InvoiceUploadCard source="kontoauszuege" compact />
      <MonatsabschlussBox />
      <KontoauszuegeClient />
    </div>
  );
}
