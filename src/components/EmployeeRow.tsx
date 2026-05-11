"use client";

import { useState, useTransition } from "react";
import { updateEmployeeAction } from "@/lib/actions";
import { formatEUR } from "@/lib/cashflow";
import type { Employee, SetterHours } from "@/lib/types";
import { SETTER_HOURS_OPTIONS } from "@/lib/types";

const ADMIN_COL_COUNT = 6;

export default function EmployeeRow({ employee }: { employee: Employee }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(employee.name);
  const [ownerId, setOwnerId] = useState(employee.hubspot_owner_id ?? "");
  const [role, setRole] = useState<"admin" | "member">(employee.role);
  const [isSetter, setIsSetter] = useState(employee.is_setter);
  const [isCloser, setIsCloser] = useState(employee.is_closer);
  const [setterHours, setSetterHours] = useState<SetterHours | "">(
    employee.setter_hours ?? "",
  );
  const [provision, setProvision] = useState(
    employee.provision_pct != null ? String(employee.provision_pct) : "",
  );
  const [closerFixum, setCloserFixum] = useState(
    employee.closer_fixum_eur != null ? String(employee.closer_fixum_eur) : "",
  );
  const [employmentStart, setEmploymentStart] = useState(
    employee.employment_start ?? "",
  );
  const [employmentEnd, setEmploymentEnd] = useState(
    employee.employment_end ?? "",
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
    setIsSetter(employee.is_setter);
    setIsCloser(employee.is_closer);
    setSetterHours(employee.setter_hours ?? "");
    setProvision(
      employee.provision_pct != null ? String(employee.provision_pct) : "",
    );
    setCloserFixum(
      employee.closer_fixum_eur != null ? String(employee.closer_fixum_eur) : "",
    );
    setEmploymentStart(employee.employment_start ?? "");
    setEmploymentEnd(employee.employment_end ?? "");
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
    fd.set("is_setter", String(isSetter));
    fd.set("is_closer", String(isCloser));
    fd.set("setter_hours", setterHours);
    fd.set("provision_pct", provision);
    fd.set("closer_fixum_eur", closerFixum);
    fd.set("employment_start", employmentStart);
    fd.set("employment_end", employmentEnd);
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
            <div className="flex flex-col items-end gap-1">
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
              <div className="inline-flex items-center gap-1">
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={closerFixum}
                  onChange={(e) => setCloserFixum(e.target.value)}
                  placeholder="Fixum"
                  className="border border-[color:var(--border)] rounded px-2 py-1 text-sm w-20 text-right tabular-nums"
                  title="Closer-Fixum pro Monat in Euro"
                />
                <span className="text-[color:var(--muted)]">€ fix</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-0.5">
              {employee.provision_pct != null ? (
                <span className="text-[color:var(--brand-green)] font-medium">
                  {employee.provision_pct.toLocaleString("de-AT", {
                    maximumFractionDigits: 2,
                  })} %
                </span>
              ) : (
                <span className="text-[color:var(--muted)]">—</span>
              )}
              {employee.closer_fixum_eur != null && employee.closer_fixum_eur > 0 ? (
                <span className="text-xs text-[color:var(--muted)] tabular-nums">
                  + {formatEUR(employee.closer_fixum_eur)} fix
                </span>
              ) : null}
            </div>
          )}
        </td>
        <td className="px-3 py-2">
          {editing ? (
            <div className="flex flex-col gap-1">
              <label className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={role === "admin"}
                  onChange={(e) => setRole(e.target.checked ? "admin" : "member")}
                  className="accent-[color:var(--brand-blue)]"
                />
                <span>Admin</span>
              </label>
              <label className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={isCloser}
                  onChange={(e) => setIsCloser(e.target.checked)}
                  className="accent-[color:var(--brand-blue)]"
                />
                <span>Closer</span>
              </label>
              <label className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={isSetter}
                  onChange={(e) => setIsSetter(e.target.checked)}
                  className="accent-[color:var(--brand-blue)]"
                />
                <span>Setter</span>
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {employee.role === "admin" ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)]">
                  Admin
                </span>
              ) : null}
              {employee.is_closer ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green)]">
                  Closer
                </span>
              ) : null}
              {employee.is_setter ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)]">
                  Setter
                  {employee.setter_hours ? ` · ${employee.setter_hours}` : ""}
                </span>
              ) : null}
              {employee.role !== "admin" && !employee.is_closer && !employee.is_setter ? (
                <span className="text-[10px] text-[color:var(--muted)]">—</span>
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
              <span className="text-[color:var(--foreground)] font-medium">
                Dienstverhältnis:
              </span>
              <label className="inline-flex items-center gap-1">
                <span>Start</span>
                <input
                  type="date"
                  value={employmentStart}
                  onChange={(e) => setEmploymentStart(e.target.value)}
                  className="border border-[color:var(--border)] rounded px-2 py-1 tabular-nums bg-white"
                  title="Erster Tag des Dienstverhältnisses — vorher kein Fixum"
                />
              </label>
              <label className="inline-flex items-center gap-1">
                <span>Ende</span>
                <input
                  type="date"
                  value={employmentEnd}
                  onChange={(e) => setEmploymentEnd(e.target.value)}
                  className="border border-[color:var(--border)] rounded px-2 py-1 tabular-nums bg-white"
                  title="Letzter Tag mit Fixum — ab dem Folgemonat wird kein Fixum mehr addiert"
                />
              </label>
              <span className="border-l border-[color:var(--border)] h-5"></span>
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
              {isSetter ? (
                <label className="inline-flex items-center gap-1 border-l border-[color:var(--border)] pl-3 ml-1">
                  <span className="text-[color:var(--brand-orange)] font-medium">
                    Setter-Vertrag
                  </span>
                  <select
                    value={setterHours}
                    onChange={(e) =>
                      setSetterHours(e.target.value as SetterHours | "")
                    }
                    className="border border-[color:var(--border)] rounded px-2 py-1 text-sm bg-white"
                  >
                    <option value="">— bitte wählen —</option>
                    {SETTER_HOURS_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1 text-[color:var(--muted)]">
              {employee.employment_start || employee.employment_end ? (
                <span>
                  Dienstverhältnis:{" "}
                  <span className="text-[color:var(--foreground)] font-medium tabular-nums">
                    {employee.employment_start
                      ? new Date(employee.employment_start).toLocaleDateString("de-AT")
                      : "—"}
                    {" – "}
                    {employee.employment_end
                      ? new Date(employee.employment_end).toLocaleDateString("de-AT")
                      : "offen"}
                  </span>
                </span>
              ) : null}
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
