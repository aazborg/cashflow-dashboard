import SetterClient, {
  type SetterOption,
} from "@/components/SetterClient";
import { listEmployees } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SetterPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isSetter && !ctx.isAdmin) redirect("/");

  const all = await listEmployees();
  const setters = all.filter((e) => e.is_setter && e.active);

  // Setter sehen nur sich selbst, Admins alle Setter.
  const visible = ctx.isAdmin
    ? setters
    : setters.filter((e) => e.id === ctx.employee.id);

  const options: SetterOption[] = visible.map((e) => ({
    id: e.id,
    name: e.name,
    setter_hours: e.setter_hours,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Setter-Provisionsrechner
        </h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Fixum + variable Provision pro erschienenem Beratungsgespräch.
          Stunden-Vertrag wird vom Admin gesetzt — die Tier-Schwellen sind
          deine „Gerechtigkeits-Schwellen".
        </p>
      </div>
      {options.length === 0 ? (
        <div className="bg-white border border-[color:var(--border)] rounded-lg p-8 text-center text-sm text-[color:var(--muted)]">
          Noch kein Setter angelegt — bitte im Admin-Tab einen Mitarbeiter
          als Setter markieren und einen Stunden-Vertrag wählen.
        </div>
      ) : (
        <SetterClient setters={options} canSeeAll={ctx.isAdmin} />
      )}
    </div>
  );
}
