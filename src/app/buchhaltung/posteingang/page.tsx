import { ComingSoon, PageHeader } from "@/components/BuchhaltungUiBits";

export const dynamic = "force-dynamic";

export default function PosteingangPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Posteingang"
        subtitle="Eingehende Belege, noch nicht zugeordnet."
      />
      <ComingSoon
        title="Belege im Posteingang"
        what="Eingehende Rechnungen aus der Forward-Adresse landen hier zuerst. Du kannst sie sichten, Kategorie + Lieferant zuweisen und dann in die Rechnungen-Liste verschieben."
      />
    </div>
  );
}
