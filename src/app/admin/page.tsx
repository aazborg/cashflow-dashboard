import DecideDeleteButtons from "@/components/DecideDeleteButtons";
import EmployeeRow from "@/components/EmployeeRow";
import HubspotSyncButton from "@/components/HubspotSyncButton";
import InviteForm from "@/components/InviteForm";
import NewProductForm from "@/components/NewProductForm";
import ProductRow from "@/components/ProductRow";
import {
  getDeal,
  listDeleteRequests,
  listEmployees,
  listProducts,
} from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/");
  const [requests, employees, products] = await Promise.all([
    listDeleteRequests(),
    listEmployees(),
    listProducts(),
  ]);
  const requestsWithDeals = await Promise.all(
    requests.map(async (r) => ({ ...r, deal: await getDeal(r.deal_id) })),
  );
  const pending = requestsWithDeals.filter((r) => r.status === "pending");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Lösch-Anfragen freigeben und Mitarbeiter einladen.
        </p>
      </div>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <h2 className="font-semibold">HubSpot-Synchronisation</h2>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Won-Deals aus der Pipeline „Neukunden". Webhook-Events kommen sofort,
            der Cron alle 30 Min ist Sicherheitsnetz.
          </p>
        </div>
        <div className="px-4 py-3">
          <HubspotSyncButton />
        </div>
      </section>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[color:var(--border)] flex justify-between items-center">
          <h2 className="font-semibold">Offene Lösch-Anfragen</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              pending.length > 0
                ? "bg-[color:var(--brand-yellow)] text-[color:var(--foreground)]"
                : "bg-[color:var(--brand-grey)] text-[color:var(--muted)]"
            }`}
          >
            {pending.length} offen
          </span>
        </div>
        {pending.length === 0 ? (
          <div className="px-4 py-8 text-sm text-[color:var(--muted)] text-center">
            Aktuell keine offenen Lösch-Anfragen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Deal</th>
                <th className="px-3 py-2 font-medium">Angefragt von</th>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-t border-[color:var(--border)]">
                  <td className="px-3 py-2">
                    {r.deal
                      ? `${r.deal.vorname} ${r.deal.nachname} — ${r.deal.mitarbeiter_name}`
                      : "(Deal nicht mehr vorhanden)"}
                  </td>
                  <td className="px-3 py-2 text-[color:var(--muted)]">
                    {r.requested_by_email}
                  </td>
                  <td className="px-3 py-2 text-[color:var(--muted)]">
                    {new Date(r.requested_at).toLocaleString("de-AT")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DecideDeleteButtons id={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <h2 className="font-semibold">Mitarbeiter</h2>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Nur eingeladene Personen können sich später einloggen.
          </p>
        </div>
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <InviteForm />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)] text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">E-Mail</th>
              <th className="px-3 py-2 font-medium">HubSpot Owner-ID</th>
              <th className="px-3 py-2 font-medium text-right">Provision</th>
              <th className="px-3 py-2 font-medium">Rolle</th>
              <th className="px-3 py-2 font-medium text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <EmployeeRow key={e.id} employee={e} />
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <h2 className="font-semibold">Produktkatalog</h2>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Basis für den Sales-Ziele-Rechner. Preise und Default-Raten dienen der Cashflow-Schätzung.
          </p>
        </div>
        <div className="px-4 py-3 border-b border-[color:var(--border)]">
          <NewProductForm />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)] text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium text-right">Preis</th>
              <th className="px-3 py-2 font-medium text-right">Raten</th>
              <th className="px-3 py-2 font-medium">Intervall</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
