import { PageHeader } from "@/components/BuchhaltungUiBits";
import RechnungenClient from "@/components/RechnungenClient";

export const dynamic = "force-dynamic";

export default function RechnungenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungen"
        subtitle="Erkannte Eingangsrechnungen — vom KI-Parser strukturiert."
      />
      <RechnungenClient />
    </div>
  );
}
