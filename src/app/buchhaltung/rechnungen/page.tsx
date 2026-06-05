import { PageHeader } from "@/components/BuchhaltungUiBits";
import RechnungenClient from "@/components/RechnungenClient";
import InvoiceUploadCard from "@/components/InvoiceUploadCard";

export const dynamic = "force-dynamic";

export default function RechnungenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungen"
        subtitle="Erkannte Eingangsrechnungen — vom KI-Parser strukturiert."
      />
      <InvoiceUploadCard source="rechnungen" />
      <RechnungenClient />
    </div>
  );
}
