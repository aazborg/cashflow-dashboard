import { PageHeader } from "@/components/BuchhaltungUiBits";
import QuellenClient from "@/components/QuellenClient";

export const dynamic = "force-dynamic";

export default function QuellenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungs-Quellen"
        subtitle="Plattformen wie Anthropic, Vercel, Zoom — Bot zieht monatlich die Rechnungen via API oder Headless-Browser."
      />
      <QuellenClient />
    </div>
  );
}
