/**
 * Admin > Terminänderungen — alle erkannten Seminar-Verschiebungen aus
 * den taeglichen SimplyOrg-Snapshots.
 */
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import TerminaenderungenClient from "@/components/TerminaenderungenClient";

export const dynamic = "force-dynamic";

export default async function TerminaenderungenPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin) redirect("/");
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Terminänderungen
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Alle erkannten Seminar-Verschiebungen aus den täglichen
            SimplyOrg-Snapshots — gegen den Vortag verglichen.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm underline text-[color:var(--muted)]"
        >
          ← zurück zum Admin-Bereich
        </Link>
      </div>
      <TerminaenderungenClient />
    </div>
  );
}
