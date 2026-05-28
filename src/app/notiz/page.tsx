import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/supabase-server";
import { canUseRechnungsBot } from "@/lib/permissions";
import NotizGenerator from "@/components/NotizGenerator";

export const dynamic = "force-dynamic";

/**
 * Angebots-Notiz-Generator.
 *
 * Workflow: vor Vertragsannahme. Sales-Team erstellt eine Plain-Text-
 * Notiz (Liste der Module/Artikel mit Terminen), die per Email manuell
 * verschickt wird. Erst NACH Annahme wird die Rechnung erstellt
 * (via "Rechnung"-Button auf der Daten-Tab).
 *
 * Permission: dieselbe Whitelist wie der Rechnungs-Bot
 * (canUseRechnungsBot -- Beta, nur Mario via env-Var).
 */
export default async function NotizPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!canUseRechnungsBot(ctx)) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <h1 className="text-2xl font-semibold mb-3">Angebots-Notiz</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Dieses Tool ist derzeit nur für ausgewählte Admins freigeschaltet
          (Beta). Wenn du es nutzen möchtest, sprich Mario an.
        </p>
      </div>
    );
  }
  return <NotizGenerator />;
}
