/**
 * Customer Happiness > Teilnehmer-Management.
 *
 * Kontakt-Suche im SimplyOrg-Cache (alle Personen aus
 * /de/contact_list). Sync:
 *   - taeglich 06:00 (launchd com.aazb.contacts-sync)
 *   - nach jeder neuen Rechnung (Hook in /api/rechnung)
 *
 * Adresse + Telefon werden lazy beim Aufklappen geholt
 * (Button "Adresse nachladen"), damit der Full-Sweep nicht
 * pro Person einen Detail-Call braucht.
 */
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeCustomerHappiness } from "@/lib/permissions";
import { redirect } from "next/navigation";
import ContactSearch from "@/components/ContactSearch";

export const dynamic = "force-dynamic";

export default async function TeilnehmerManagementPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!canSeeCustomerHappiness(ctx)) redirect("/");
  return (
    <main className="min-h-screen bg-[color:var(--background)] px-4 py-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--foreground)]">
            Teilnehmer-Management
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Suche alle SimplyOrg-Kontakte nach Name, E-Mail oder Telefon.
            Daten werden täglich (06:00) und nach jeder neuen Rechnung
            automatisch aktualisiert.
          </p>
        </div>
        <ContactSearch />
      </div>
    </main>
  );
}
