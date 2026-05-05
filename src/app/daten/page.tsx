import DealRow from "@/components/DealRow";
import NewDealForm from "@/components/NewDealForm";
import { listDeals, listEmployees } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DatenPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const [allDeals, employees] = await Promise.all([listDeals(), listEmployees()]);
  // Members only see their own deals; admins see everything.
  const deals = ctx.isAdmin
    ? allDeals
    : allDeals.filter((d) => d.mitarbeiter_id === ctx.ownerId);
  // For the "create new deal" picker: admins can pick any member, members can
  // only pick themselves.
  const mitarbeiter = ctx.isAdmin
    ? employees
        .filter((e) => e.role === "member")
        .map((e) => ({ id: e.hubspot_owner_id ?? e.id, name: e.name }))
    : [{ id: ctx.ownerId, name: ctx.employee.name }];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daten</h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Alle Verkäufe. HubSpot pusht neue Deals automatisch — Startdatum,
            Anzahl Raten und Intervall trägst du hier ein.
          </p>
        </div>
        <NewDealForm mitarbeiter={mitarbeiter} />
      </div>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Kontakt</th>
                <th className="px-3 py-2 font-medium">Mitarbeiter</th>
                <th className="px-3 py-2 font-medium text-right">Betrag</th>
                <th className="px-3 py-2 font-medium">Startdatum</th>
                <th className="px-3 py-2 font-medium text-right">Raten</th>
                <th className="px-3 py-2 font-medium">Intervall</th>
                <th className="px-3 py-2 font-medium text-right">Rate</th>
                <th className="px-3 py-2 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-12 text-center text-[color:var(--muted)]"
                  >
                    Noch keine Deals. Lege manuell einen an oder warte auf den
                    nächsten HubSpot-Push.
                  </td>
                </tr>
              ) : (
                deals.map((d) => <DealRow key={d.id} deal={d} />)
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-[color:var(--border)] text-xs text-[color:var(--muted)] flex justify-between">
          <span>{deals.length} Einträge</span>
          <span>
            Gelb hinterlegt = ausstehende Lösch-Anfrage beim Admin.
          </span>
        </div>
      </section>
    </div>
  );
}
