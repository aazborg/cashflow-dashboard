import { PageHeader } from "@/components/BuchhaltungUiBits";
import ZuBezahlenClient from "@/components/ZuBezahlenClient";

export const dynamic = "force-dynamic";

export default function ZuBezahlenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Zu bezahlen"
        subtitle="Welche Rechnungen du noch überweisen musst — getrennt von denen, die automatisch abgebucht oder schon bezahlt sind."
      />
      <ZuBezahlenClient />
    </div>
  );
}
