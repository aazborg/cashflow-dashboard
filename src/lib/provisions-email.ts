import type { Deal, Employee } from "./types";
import { expandPayments } from "./cashflow";
import { SETTER_TARIFFS } from "./setter-tiers";
import { monthLabelDe } from "./business-days";

export interface EmployeeProvision {
  mitarbeiter_id: string;
  nachname: string;
  fixumMonatlich: number; // Fixum-Satz (immer einfach, ohne Jun/Nov-Doppel)
  provisionEur: number; // variable Provision für den Monat (auf Basis betrag)
}

/**
 * Berechnet je Mitarbeiter Fixum-Satz und variable Provision für einen Monat
 * im Format YYYY-MM. Liefert NUR Mitarbeiter mit irgendeinem Auszahlungsanteil.
 *
 * Wichtig:
 *   - Fixum wird einfach ausgewiesen, auch in Juni/November
 *     (die Steuerberatung kennt den doppelten Sonderzahlungs-Monat ohnehin).
 *   - Berücksichtigt employment_start / employment_end — außerhalb dieses
 *     Zeitraums kein Fixum.
 *   - Provision = provision_pct × Summe der monatlichen Raten des
 *     Mitarbeiters auf Basis betrag (nicht betrag_original).
 */
export function computeMonthlyProvisions(
  month: string,
  deals: Deal[],
  employees: Employee[],
): EmployeeProvision[] {
  const monthDate = parseMonth(month);
  if (!monthDate) return [];

  // Lookup-Maps: mitarbeiter_id auf der Deal-Seite kann hubspot_owner_id oder
  // employee.id sein — beide ablegen.
  const provisionByMit = new Map<string, number>();
  const nachnameByMit = new Map<string, string>();
  const fixumByMit = new Map<string, number>();
  const startByMit = new Map<string, string>();
  const endByMit = new Map<string, string>();
  for (const e of employees) {
    if (!e.active) continue;
    const setterFix = e.setter_hours
      ? SETTER_TARIFFS[e.setter_hours]?.fixum ?? 0
      : 0;
    const closerFix = e.closer_fixum_eur ?? 0;
    const fix = setterFix + closerFix;
    const nachname = inferNachname(e.name);
    const keys = e.hubspot_owner_id ? [e.hubspot_owner_id, e.id] : [e.id];
    for (const k of keys) {
      nachnameByMit.set(k, nachname);
      if (e.provision_pct != null) provisionByMit.set(k, e.provision_pct);
      if (fix > 0) fixumByMit.set(k, fix);
      if (e.employment_start) startByMit.set(k, e.employment_start);
      if (e.employment_end) endByMit.set(k, e.employment_end);
    }
  }

  // Variable Provision pro Mitarbeiter: Summe der Monats-Raten × Pct
  const variableByMit = new Map<string, number>();
  for (const d of deals) {
    if (d.pending_delete) continue;
    const pct = provisionByMit.get(d.mitarbeiter_id);
    if (pct == null) continue;
    let monthlyBase = 0;
    for (const p of expandPayments(d)) {
      if (
        p.date.getFullYear() === monthDate.year &&
        p.date.getMonth() === monthDate.monthIndex
      ) {
        monthlyBase += p.amount;
      }
    }
    if (monthlyBase > 0) {
      const prov = (monthlyBase * pct) / 100;
      variableByMit.set(
        d.mitarbeiter_id,
        (variableByMit.get(d.mitarbeiter_id) ?? 0) + prov,
      );
    }
  }

  // Set aller relevanten Mitarbeiter-IDs (Fixum-Empfänger + Provision-Empfänger)
  const mitIds = new Set<string>([
    ...variableByMit.keys(),
    ...fixumByMit.keys(),
  ]);

  // Dedupliziere — falls hubspot_owner_id und employee.id beide drin sind,
  // bevorzuge die hubspot_owner_id-Variante (so kommen Deal-Provisionen rein).
  const seenNachname = new Set<string>();
  const result: EmployeeProvision[] = [];
  for (const mitId of mitIds) {
    const nachname = nachnameByMit.get(mitId);
    if (!nachname) continue;
    if (seenNachname.has(nachname)) continue;
    seenNachname.add(nachname);

    // Fixum nur, wenn der Monat innerhalb des Dienstverhältnisses liegt.
    const fixCfg = fixumByMit.get(mitId) ?? 0;
    let fixum = fixCfg;
    const start = startByMit.get(mitId);
    if (start && month < start.slice(0, 7)) fixum = 0;
    const end = endByMit.get(mitId);
    if (end && month > end.slice(0, 7)) fixum = 0;

    const provision = variableByMit.get(mitId) ?? 0;
    if (fixum <= 0 && provision <= 0) continue;
    result.push({
      mitarbeiter_id: mitId,
      nachname,
      fixumMonatlich: fixum,
      provisionEur: provision,
    });
  }

  // Stabile Sortierung — höchste Auszahlung zuerst.
  result.sort(
    (a, b) =>
      b.fixumMonatlich + b.provisionEur - (a.fixumMonatlich + a.provisionEur),
  );
  return result;
}

export interface ProvisionsEmail {
  subject: string;
  /** Reiner Text (utf-8). Mailclient kümmert sich um Plain-Rendering. */
  textBody: string;
  /** HTML-Version mit minimalem Markup für Vorschau. */
  htmlBody: string;
}

export function buildProvisionsEmail(
  month: string,
  provisions: EmployeeProvision[],
  options: { followUpAnnouncement?: boolean } = {},
): ProvisionsEmail {
  const monLabel = monthLabelDe(month);
  const subject = `Provisionen ${monLabel}`;
  const lines = provisions.map(formatLine);
  const greeting = "Sehr geehrte Frau Plank";
  const intro = "Bitte folgende Provisionen abrechnen:";
  const followUp = options.followUpAnnouncement
    ? "Eine weitere E-Mail mit den übrigen Mitarbeitern folgt."
    : "";
  const sign = "Herzliche Grüße,\nMario Grabner";

  const text = [
    greeting,
    "",
    intro,
    "",
    ...lines,
    "",
    followUp,
    followUp ? "" : null,
    sign,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const htmlLines = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(intro)}</p>
      <div>${htmlLines}</div>
      ${followUp ? `<p>${escapeHtml(followUp)}</p>` : ""}
      <p>${escapeHtml(sign).replace(/\n/g, "<br>")}</p>
    </div>
  `.trim();

  return { subject, textBody: text, htmlBody: html };
}

function formatLine(p: EmployeeProvision): string {
  const f = p.fixumMonatlich;
  const v = p.provisionEur;
  if (f > 0 && v > 0) {
    return `${p.nachname}: ${formatNumber(f)}+${formatNumber(v)}`;
  }
  if (f > 0) {
    return `${p.nachname}: Fixum (${formatNumber(f)})`;
  }
  return `${p.nachname}: ${formatNumber(v)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function inferNachname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return fullName;
  return parts[parts.length - 1];
}

function parseMonth(month: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number.parseInt(m[1], 10);
  const monthNum = Number.parseInt(m[2], 10);
  if (year < 2000 || year > 2100 || monthNum < 1 || monthNum > 12) return null;
  return { year, monthIndex: monthNum - 1 };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
