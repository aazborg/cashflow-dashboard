/**
 * Seminarmanagement: Tabs fuer Seminarvorbereitung + Kalender-Historie.
 */
import { getSessionContext } from "@/lib/supabase-server";
import { canSeeSeminarmanagement } from "@/lib/permissions";
import { redirect } from "next/navigation";
import SeminarmanagementTabs from "@/components/SeminarmanagementTabs";

export const dynamic = "force-dynamic";

export default async function SeminarmanagementPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!canSeeSeminarmanagement(ctx)) redirect("/");
  return (
    <main className="min-h-screen bg-[color:var(--background)] px-4 py-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--foreground)]">
            Seminarmanagement
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Vorbereitung & Lieferungen + tägliche Kalender-Historie.
          </p>
        </div>
        <SeminarmanagementTabs />
      </div>
    </main>
  );
}
