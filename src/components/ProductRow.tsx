"use client";

import { useState, useTransition } from "react";
import {
  deleteProductAction,
  updateProductAction,
} from "@/lib/actions";
import { formatEUR } from "@/lib/cashflow";
import { INTERVALL_OPTIONS, type Product } from "@/lib/types";

export default function ProductRow({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [raten, setRaten] = useState(
    product.default_anzahl_raten != null ? String(product.default_anzahl_raten) : "",
  );
  const [intervall, setIntervall] = useState(product.default_intervall ?? "");
  const [active, setActive] = useState(product.active);
  const [upsell, setUpsell] = useState(product.is_upsell ?? false);
  const [pending, startTransition] = useTransition();

  function save() {
    const fd = new FormData();
    fd.set("id", product.id);
    fd.set("name", name);
    fd.set("price", price);
    fd.set("default_anzahl_raten", raten);
    fd.set("default_intervall", intervall);
    fd.set("active", active ? "true" : "false");
    fd.set("is_upsell", upsell ? "true" : "false");
    startTransition(async () => {
      await updateProductAction(fd);
      setEditing(false);
    });
  }

  function reset() {
    setName(product.name);
    setPrice(String(product.price));
    setRaten(
      product.default_anzahl_raten != null ? String(product.default_anzahl_raten) : "",
    );
    setIntervall(product.default_intervall ?? "");
    setActive(product.active);
    setUpsell(product.is_upsell ?? false);
  }

  function remove() {
    if (!confirm(`Produkt „${product.name}" wirklich löschen?`)) return;
    const fd = new FormData();
    fd.set("id", product.id);
    startTransition(() => deleteProductAction(fd));
  }

  return (
    <tr className="border-t border-[color:var(--border)]">
      <td className="px-3 py-2">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-full"
            autoFocus
          />
        ) : (
          <span className={product.active ? "font-medium" : "font-medium text-[color:var(--muted)] line-through"}>
            {product.name}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {editing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-28 text-right tabular-nums"
          />
        ) : (
          formatEUR(product.price)
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {editing ? (
          <input
            type="number"
            min="1"
            step="1"
            value={raten}
            onChange={(e) => setRaten(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-20 text-right tabular-nums"
          />
        ) : (
          <span className="text-[color:var(--muted)]">{product.default_anzahl_raten ?? "—"}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <select
            value={intervall}
            onChange={(e) => setIntervall(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">—</option>
            {INTERVALL_OPTIONS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        ) : (
          <span className="text-[color:var(--muted)]">{product.default_intervall ?? "—"}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex flex-col gap-1 text-xs">
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Aktiv
            </label>
            <label className="inline-flex items-center gap-1" title="Upsell innerhalb einer laufenden Beratung — kein eigenes Beratungsgespräch nötig.">
              <input
                type="checkbox"
                checked={upsell}
                onChange={(e) => setUpsell(e.target.checked)}
              />
              Upsell
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span
              className={`text-xs px-2 py-0.5 rounded-full w-fit ${
                product.active
                  ? "bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green)]"
                  : "bg-[color:var(--brand-grey)] text-[color:var(--muted)]"
              }`}
            >
              {product.active ? "Aktiv" : "Inaktiv"}
            </span>
            {product.is_upsell ? (
              <span className="text-xs px-2 py-0.5 rounded-full w-fit bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)]">
                Upsell
              </span>
            ) : null}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {editing ? (
          <>
            <button
              onClick={save}
              disabled={pending}
              className="bg-[color:var(--brand-blue)] text-white text-xs px-3 py-1 rounded mr-1 disabled:opacity-50"
            >
              {pending ? "…" : "Speichern"}
            </button>
            <button
              onClick={() => {
                reset();
                setEditing(false);
              }}
              disabled={pending}
              className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
            >
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)] mr-1"
            >
              Bearbeiten
            </button>
            <button
              onClick={remove}
              disabled={pending}
              className="text-xs px-2 py-1 rounded border border-[color:var(--border)] text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Löschen
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
