import { PageHeader } from "@/components/BuchhaltungUiBits";
import MonatsabschlussBox from "@/components/MonatsabschlussBox";

export const dynamic = "force-dynamic";

export default function MonatsabschlussPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Monatsabschluss"
        subtitle="Kontoauszüge prüfen + gematchte Rechnungen nach Konto sortieren."
      />
      <MonatsabschlussBox defaultOpen />
    </div>
  );
}
