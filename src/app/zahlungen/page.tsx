/**
 * Zahlungen-Uebersicht fuer Buchhaltung.
 *
 * Im Gegensatz zur /daten-Seite (Sales-Fokus) liegt hier der Fokus
 * auf Zahlungsverkehr:
 *   - Gesamtbetrag (Vertrag) vs. bezahlt vs. offen
 *   - Naechste Faelligkeit
 *   - GC-Mandate-Status
 *   - Suche/Sortierung/Filter
 *
 * Sichtbar fuer alle eingeloggten User (Buchhaltung ist team-weit).
 */
import { listDeals, listEmployees } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import ZahlungenTabs from "@/components/ZahlungenTabs";
import { canManagePayments } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ZahlungenPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const [allDeals, employees] = await Promise.all([
    listDeals(),
    listEmployees(),
  ]);

  // Admin + Accounting sehen alle Deals, Mitglieder nur eigene
  const scoped = ctx.isAdmin || ctx.isAccounting
    ? allDeals
    : allDeals.filter((d) => d.mitarbeiter_id === ctx.ownerId);

  // Filter: nur Deals mit Closing-Status (also alle hier auflisten,
  // egal ob Email vorhanden -- Buchhaltung will Vollbild).
  return (
    <main className="min-h-screen bg-[color:var(--background)] px-4 py-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--foreground)]">
            Zahlungen
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Buchhaltungs-Übersicht: Gesamt · Bezahlt · Offen · Nächste Fälligkeiten.
            Daten aus GoCardless (alle 30 Min synchronisiert).
          </p>
        </div>
        <ZahlungenTabs
          deals={scoped}
          employees={employees}
          isAdmin={ctx.isAdmin}
          canManagePayments={canManagePayments(ctx)}
        />
      </div>
    </main>
  );
}
