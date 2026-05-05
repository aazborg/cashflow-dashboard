"use client";

import { useTransition, useRef } from "react";
import { inviteEmployeeAction } from "@/lib/actions";

export default function InviteForm() {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(fd) =>
        startTransition(async () => {
          await inviteEmployeeAction(fd);
          ref.current?.reset();
        })
      }
      className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
    >
      <input
        name="name"
        placeholder="Name"
        required
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
      />
      <input
        name="email"
        type="email"
        placeholder="E-Mail"
        required
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
      />
      <input
        name="hubspot_owner_id"
        placeholder="HubSpot Owner-ID (optional)"
        className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="bg-[color:var(--brand-blue)] text-white text-sm px-3 py-1.5 rounded font-medium disabled:opacity-50"
      >
        {pending ? "Sende…" : "Einladen"}
      </button>
    </form>
  );
}
