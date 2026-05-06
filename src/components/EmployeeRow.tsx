"use client";

import { useState, useTransition } from "react";
import { updateEmployeeAction } from "@/lib/actions";
import { formatEUR } from "@/lib/cashflow";
import type { Employee } from "@/lib/types";

const ADMIN_COL_COUNT = 6;

export default function EmployeeRow({ employee }: { employee: Employee }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(employee.name);
  const [ownerId, setOwnerId] = useState(employee.hubspot_owner_id ?? "");
  const [role, setRole] = useState<"admin" | "member">(employee.role);
  const [provision, setProvision] = useState(
    employee.provision_pct != null ? String(employee.provision_pct) : "",
  );
  const [qualis, setQualis] = useState(
    employee.default_qualis != null ? String(employee.default_qualis) : "",
  );
  const [showup, setShowup] = useState(
    employee.default_showup_rate != null
      ? String(employee.default_showup_rate)
      : "",
  );
  const [quote, setQuote] = useState(
    employee.default_close_rate != null
      ? String(employee.default_close_rate)
      : "",
  );
  const [avg, setAvg] = useState(
    employee.default_avg_contract != null
      ? String(employee.default_avg_contract)
      : "",
  );
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(employee.name);
    setOwnerId(employee.hubspot_owner_id ?? "");
    setRole(employee.role);
    setProvision(
      employee.provision_pct != null ? String(employee.provision_pct) : "",
    );
    setQualis(
      employee.default_qualis != null ? String(employee.default_qualis) : "",
    );
    setShowup(
      employee.default_showup_rate != null
        ? String(employee.default_showup_rate)
        : "",
    );
    setQuote(
      employee.default_close_rate != null
        ? String(employee.default_close_rate)
        : "",
    );
    setAvg(
      employee.default_avg_contract != null
        ? String(employee.default_avg_contract)
        : "",
    );
  }

  const [error, setError] = useState<string | null>(null);

  function save() {
    const fd = new FormData();
    fd.set("id", employee.id);
    fd.set("name", name);
    fd.set("hubspot_owner_id", ownerId);
    fd.set("role", role);
    fd.set("provision_pct", provision);
    fd.set("default_qualis", qualis);
    fd.set("default_showup_rate", showup);
    fd.set("default_close_rate", quote);
    fd.set("default_avg_contract", avg);
    setError(null);
    startTransition(async () => {
      try {
        await updateEmployeeAction(fd);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <>
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
            <span className="font-medium">{employee.name}</span>
          )}
        </td>
        <td className="px-3 py-2 text-[color:var(--muted)]">{employee.email}</td>
        <td className="px-3 py-2 tabular-nums">
          {editing ? (
            <input
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder="z. B. 30911203"
              className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-32 text-right tabular-nums"
            />
          ) : (
            <span className="text-[color:var(--muted)]">
              {employee.hubspot_owner_id ?? "—"}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {editing ? (
            <div className="inline-flex items-center gap-1">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={provision}
                onChange={(e) => setProvision(e.target.value)}
                placeholder="0"
                className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-20 text-right tabular-nums"
              />
              <span className="text-[color:var(--muted)]">%</span>
            </div>
          ) : employee.provision_pct != null ? (
            <span className="text-[color:var(--brand-green)] font-medium">
              {employee.provision_pct.toLocaleString("de-AT", {
                maximumFractionDigits: 2,
              })} %
            </span>
          ) : (
            <span className="text-[color:var(--muted)]">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {editing ? (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className="border border-[color:var(--border)] rounded px-2 py-1 text-sm bg-white"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          ) : (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                employee.role === "admin"
                  ? "bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)]"
                  : "bg-[color:var(--brand-grey)] text-[color:var(--muted)]"
              }`}
            >
              {employee.role}
            </span>
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
                  setError(null);
                }}
                disabled={pending}
                className="text-xs px-3 py-1 rounded border border-[color:var(--border)]"
              >
                Abbrechen
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2 py-1 rounded border border-[color:var(--border)] hover:bg-[color:var(--surface)]"
            >
              Bearbeiten
            </button>
          )}
        </td>
      </tr>
      {error ? (
        <tr className="bg-red-50 border-b border-red-200">
          <td colSpan={ADMIN_COL_COUNT} className="px-3 py-1.5 text-xs text-red-700">
            ⚠️ {error}
          </td>
        </tr>
      ) : null}
      <tr className="bg-[color:var(--surface)]/50 border-b border-[color:var(--border)]">
        <td colSpan={ADMIN_COL_COUNT} className="px-3 py-2 text-xs">
          {editing ? (
            <div className="flex flex-wrap items-center gap-3 pl-1">
              <span className="text-[color:var(--muted)]">
                Funnel-Defaults (HubSpot überschreibt diese später):
              </span>
              <label className="inline-flex items-center gap-1">
                <span>Qualis vereinbart/Mo</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={qualis}
                  onChange={(e) => setQualis(e.target.value)}
                  placeholder="20"
                  className="border border-[color:var(--border)] rounded px-2 py-1 w-16 text-right tabular-nums bg-white"
                />
              </label>
              <label className="inline-flex items-center gap-1">
                <span>Showup-Rate</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={showup}
                  onChange={(e) => setShowup(e.target.value)}
                  placeholder="70"
                  className="border border-[color:var(--border)] rounded px-2 py-1 w-16 text-right tabular-nums bg-white"
                />
                <span className="text-[color:var(--muted)]">%</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <span>Closing-Rate</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  placeholder="25"
                  className="border border-[color:var(--border)] rounded px-2 py-1 w-16 text-right tabular-nums bg-white"
                />
                <span className="text-[color:var(--muted)]">%</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <span>Ø Verkaufspreis €</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={avg}
                  onChange={(e) => setAvg(e.target.value)}
                  placeholder="5000"
                  className="border border-[color:var(--border)] rounded px-2 py-1 w-24 text-right tabular-nums bg-white"
                />
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1 text-[color:var(--muted)]">
              <span>
                Qualis vereinbart/Monat:{" "}
                <span className="text-[color:var(--foreground)] font-medium tabular-nums">
                  {employee.default_qualis ?? "—"}
                </span>
              </span>
              <span>
                Showup-Rate:{" "}
                <span className="text-[color:var(--foreground)] font-medium tabular-nums">
                  {employee.default_showup_rate != null
                    ? `${employee.default_showup_rate} %`
                    : "—"}
                </span>
              </span>
              <span>
                Closing-Rate:{" "}
                <span className="text-[color:var(--foreground)] font-medium tabular-nums">
                  {employee.default_close_rate != null
                    ? `${employee.default_close_rate} %`
                    : "—"}
                </span>
              </span>
              <span>
                Ø Verkaufspreis:{" "}
                <span className="text-[color:var(--foreground)] font-medium tabular-nums">
                  {employee.default_avg_contract != null
                    ? formatEUR(employee.default_avg_contract)
                    : "—"}
                </span>
              </span>
            </div>
          )}
        </td>
      </tr>
    </>
  );
}
