import { PageHeader } from "@/components/BuchhaltungUiBits";
import RechnungenTabs from "@/components/RechnungenTabs";

export const dynamic = "force-dynamic";

export default function RechnungenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungen"
        subtitle="Eingangs- und Ausgangsrechnungen — vom KI-Parser strukturiert."
      />
      <RechnungenTabs />
    </div>
  );
}
