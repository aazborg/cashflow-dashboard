import { ComingSoon, PageHeader } from "@/components/BuchhaltungUiBits";

export const dynamic = "force-dynamic";

export default function SchnellUploadPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Schnell-Upload"
        subtitle="Rechnungen oder Kontoauszüge per Drag-&-Drop hochladen."
      />
      <ComingSoon
        title="Upload-Bereich"
        what="Hier kommt der zentrale Drop-Bereich rein — eine Datei rauf, automatisch erkennen (Rechnung oder Kontoauszug) und in den richtigen Posteingang einsortieren."
      />
    </div>
  );
}
