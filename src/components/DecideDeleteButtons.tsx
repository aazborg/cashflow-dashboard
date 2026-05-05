"use client";

import { useTransition } from "react";
import { decideDeleteAction } from "@/lib/actions";

export default function DecideDeleteButtons({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "denied") {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("decision", decision);
    startTransition(() => decideDeleteAction(fd));
  }

  return (
    <div className="flex gap-1">
      <button
        onClick={() => decide("approved")}
        disabled={pending}
        className="text-xs px-3 py-1 rounded bg-[color:var(--brand-orange)] text-white font-medium disabled:opacity-50"
      >
        Löschen freigeben
      </button>
      <button
        onClick={() => decide("denied")}
        disabled={pending}
        className="text-xs px-3 py-1 rounded border border-[color:var(--border)] disabled:opacity-50"
      >
        Ablehnen
      </button>
    </div>
  );
}
