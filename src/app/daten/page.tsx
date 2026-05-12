import DealsTable from "@/components/DealsTable";
import NewDealForm from "@/components/NewDealForm";
import DatenSearchBar from "@/components/DatenSearchBar";
import DatenPagination from "@/components/DatenPagination";
import { listDeals, listEmployees } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

interface DatenSearchParams {
  q?: string;
  page?: string;
  size?: string;
}

function parsePageSize(raw: string | undefined): PageSize {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSize) : 50;
}

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

export default async function DatenPage({
  searchParams,
}: {
  searchParams: Promise<DatenSearchParams>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const size = parsePageSize(sp.size);

  const [allDeals, employees] = await Promise.all([
    listDeals(),
    listEmployees(),
  ]);

  // Members only see their own deals; admins see everything.
  const scoped = ctx.isAdmin
    ? allDeals
    : allDeals.filter((d) => d.mitarbeiter_id === ctx.ownerId);

  // Suche über Vorname / Nachname / Mitarbeiter / E-Mail / hubspot_deal_id.
  const needle = q.toLowerCase();
  const filtered = needle
    ? scoped.filter((d) => {
        return (
          matches(d.vorname, needle) ||
          matches(d.nachname, needle) ||
          matches(`${d.vorname} ${d.nachname}`, needle) ||
          matches(d.mitarbeiter_name, needle) ||
          (d.email ? matches(d.email, needle) : false) ||
          (d.hubspot_deal_id ? matches(d.hubspot_deal_id, needle) : false)
        );
      })
    : scoped;

  // Neueste oben (created_at desc).
  const sorted = [...filtered].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const requestedPage = Math.max(1, Number(sp.page) || 1);
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * size;
  const visible = sorted.slice(start, start + size);

  // For the "create new deal" picker: admins can pick any member, members can
  // only pick themselves.
  const mitarbeiter = ctx.isAdmin
    ? employees
        .filter((e) => e.role === "member")
        .map((e) => ({ id: e.hubspot_owner_id ?? e.id, name: e.name }))
    : [{ id: ctx.ownerId, name: ctx.employee.name }];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daten</h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Alle Verkäufe, neueste zuerst. HubSpot pusht neue Deals
            automatisch — Startdatum, Anzahl Raten und Intervall trägst du
            hier ein.
          </p>
        </div>
        <NewDealForm mitarbeiter={mitarbeiter} />
      </div>

      <DatenSearchBar
        defaultValue={q}
        defaultSize={size}
        sizes={PAGE_SIZES as readonly number[]}
        total={total}
      />

      <section className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <DealsTable deals={visible} isAdmin={ctx.isAdmin} searchQuery={q} />
        <DatenPagination
          page={page}
          totalPages={totalPages}
          size={size}
          total={total}
          q={q}
        />
      </section>
    </div>
  );
}
