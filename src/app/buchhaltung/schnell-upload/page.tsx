import { PageHeader } from "@/components/BuchhaltungUiBits";
import InvoiceUploadCard from "@/components/InvoiceUploadCard";

export const dynamic = "force-dynamic";

export default function SchnellUploadPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Schnell-Upload"
        subtitle="Rechnung als PDF hochladen — Claude parst + Drive-Upload + Auto-Match."
      />
      <InvoiceUploadCard source="schnell_upload" />
      <div className="text-xs text-[color:var(--muted)]">
        Hinweis: Erkannte Rechnung landet im Tab <strong>Rechnungen</strong>.
        Wenn Claude unsicher ist (z.&nbsp;B. Zahlungsbestätigung), wird der
        Eintrag als „verworfen" markiert — sichtbar im Tab Rechnungen unter
        Filter „Verworfene".
      </div>
    </div>
  );
}
