/**
 * Customer Happiness > Teilnehmer-Management.
 *
 * Platzhalter -- Instruktionen folgen.
 */
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TeilnehmerManagementPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return (
    <main className="min-h-screen bg-[color:var(--background)] px-4 py-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--foreground)]">
            Teilnehmer-Management
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Customer Happiness. Inhalt folgt.
          </p>
        </div>
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-8 text-sm text-[color:var(--muted)]">
          Diese Seite ist noch leer.
        </div>
      </div>
    </main>
  );
}
