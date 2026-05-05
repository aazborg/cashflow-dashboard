"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  mitarbeiter: { id: string; name: string }[];
  current: string | null;
}

export default function MitarbeiterFilter({ mitarbeiter, current }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setMitarbeiter(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("mitarbeiter", value);
    else params.delete("mitarbeiter");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="inline-flex items-center gap-2 bg-white border border-[color:var(--border)] rounded-lg px-3 py-1.5">
      <label className="text-xs text-[color:var(--muted)]">Mitarbeiter</label>
      <select
        value={current ?? ""}
        onChange={(e) => setMitarbeiter(e.target.value)}
        className="text-sm bg-transparent border-0 focus:outline-none pr-2"
      >
        <option value="">Alle</option>
        {mitarbeiter.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
