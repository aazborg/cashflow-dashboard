/**
 * Admin > HubSpot-Import-Sperrliste — alle dauerhaft vom Import
 * ausgeschlossenen Kontakte mit Möglichkeit zum Entsperren.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { unblockHubspotImportAction } from "@/lib/actions";
import { getSessionContext } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  hubspot_deal_id: string | null;
  email: string | null;
  vorname: string | null;
  nachname: string | null;
  reason: string | null;
  blocked_at: string;
  blocked_by_email: string | null;
};

export default async function ImportBlacklistPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/");

  const { data } = await supabaseAdmin()
    .from("hubspot_import_blacklist")
    .select(
      "id,hubspot_deal_id,email,vorname,nachname,reason,blocked_at,blocked_by_email",
    )
    .order("blocked_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            HubSpot-Import-Sperrliste
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Kontakte, die nicht mehr aus HubSpot ins Dashboard importiert
            werden. Match per Deal-ID, E-Mail oder Vorname+Nachname.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm underline text-[color:var(--muted)]"
        >
          ← zurück zum Admin-Bereich
        </Link>
      </div>

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface)] text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">E-Mail</th>
              <th className="px-3 py-2 font-medium">Deal-ID</th>
              <th className="px-3 py-2 font-medium">Grund</th>
              <th className="px-3 py-2 font-medium">Gesperrt von</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                Gesperrt am
              </th>
              <th className="px-3 py-2 font-medium text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-[color:var(--muted)]"
                >
                  Sperrliste ist leer.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const name = [r.vorname, r.nachname].filter(Boolean).join(" ");
              return (
                <tr
                  key={r.id}
                  className="border-t border-[color:var(--border)] align-top"
                >
                  <td className="px-3 py-2">{name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.email ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[color:var(--muted)]">
                    {r.hubspot_deal_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.reason ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                    {r.blocked_by_email ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {new Date(r.blocked_at).toLocaleString("de-AT")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={unblockHubspotImportAction}>
                      <input type="hidden" name="blacklist_id" value={r.id} />
                      <button
                        type="submit"
                        className="text-xs px-2 py-1 rounded text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue)]/10"
                      >
                        Entsperren
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
