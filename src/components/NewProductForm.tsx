"use client";

import { useState, useTransition } from "react";
import { createProductAction } from "@/lib/actions";
import { INTERVALL_OPTIONS } from "@/lib/types";

export default function NewProductForm() {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [raten, setRaten] = useState("");
  const [intervall, setIntervall] = useState("monatlich");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price) return;
    const fd = new FormData();
    fd.set("name", name);
    fd.set("price", price);
    fd.set("default_anzahl_raten", raten);
    fd.set("default_intervall", intervall);
    startTransition(async () => {
      await createProductAction(fd);
      setName("");
      setPrice("");
      setRaten("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end text-sm">
      <label className="flex flex-col">
        <span className="text-xs text-[color:var(--muted)]">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Workshop XY"
          className="border border-[color:var(--border)] rounded px-2 py-1.5 w-64"
        />
      </label>
      <label className="flex flex-col">
        <span className="text-xs text-[color:var(--muted)]">Preis €</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="2470"
          className="border border-[color:var(--border)] rounded px-2 py-1.5 w-28 tabular-nums"
        />
      </label>
      <label className="flex flex-col">
        <span className="text-xs text-[color:var(--muted)]">Raten</span>
        <input
          type="number"
          min="1"
          step="1"
          value={raten}
          onChange={(e) => setRaten(e.target.value)}
          placeholder="10"
          className="border border-[color:var(--border)] rounded px-2 py-1.5 w-20 tabular-nums"
        />
      </label>
      <label className="flex flex-col">
        <span className="text-xs text-[color:var(--muted)]">Intervall</span>
        <select
          value={intervall}
          onChange={(e) => setIntervall(e.target.value)}
          className="border border-[color:var(--border)] rounded px-2 py-1.5 bg-white"
        >
          {INTERVALL_OPTIONS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending || !name.trim() || !price}
        className="bg-[color:var(--brand-blue)] text-white text-sm px-4 py-1.5 rounded disabled:opacity-50"
      >
        {pending ? "…" : "Hinzufügen"}
      </button>
    </form>
  );
}
