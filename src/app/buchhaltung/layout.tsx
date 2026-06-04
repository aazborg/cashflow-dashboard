/**
 * Buchhaltung-Bereich: Layout mit linker Seitenleiste.
 *
 * Aufbau parallel zu 25Genius Finance: Schnell-Upload prominent,
 * dann die Hauptbereiche Übersicht / Posteingang / Rechnungen /
 * Kontoauszüge.
 *
 * Zugriff: Accounting-Rolle oder Admin.
 */
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/supabase-server";
import { canManagePayments } from "@/lib/permissions";
import BuchhaltungSidebar from "@/components/BuchhaltungSidebar";

export default async function BuchhaltungLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  // canManagePayments == Admin oder Accounting -- exakt der Personenkreis
  // der den Buchhaltungsbereich sehen soll.
  if (!canManagePayments(ctx)) redirect("/");
  return (
    <main className="min-h-screen bg-[color:var(--background)]">
      <div className="max-w-[1500px] mx-auto px-4 py-6 flex gap-6">
        <aside className="w-56 shrink-0">
          <BuchhaltungSidebar />
        </aside>
        <section className="flex-1 min-w-0">{children}</section>
      </div>
    </main>
  );
}
