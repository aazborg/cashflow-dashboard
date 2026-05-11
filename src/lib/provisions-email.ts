import type { Deal, Employee } from "./types";
import { expandPayments } from "./cashflow";
import { SETTER_TARIFFS, calcSetterPayout } from "./setter-tiers";
import { monthLabelDe } from "./business-days";

/**
 * Eintrag für einen Closer im Provisions-Mail.
 * Format-Schema: <Nachname>: <fixum>+<provision>  bzw.
 *                <Nachname>: <provision>           (kein Fixum)
 *                <Nachname>: Fixum (<fixum>)      (keine Provision)
 */
export interface CloserProvision {
  mitarbeiter_id: string;
  nachname: string;
  fixumMonatlich: number; // einfaches Fixum, auch in Jun/Nov nicht verdoppelt
  provisionEur: number; // betrag-basiert, ohne Original-Differenz
}

/**
 * Eintrag für einen Setter im Provisions-Mail.
 * Format-Schema: <Nachname>: <total>
 * total = Fixum (aus setter_hours-Tier) + Anzahl-Qualis × perBg-der-aktiven-Stufe
 * Berechnungsdetails werden nicht in der Mail ausgewiesen — die Steuerberatung
 * bekommt nur den Auszahlungsbetrag.
 */
export interface SetterPayout {
  mitarbeiter_id: string;
  nachname: string;
  fixumMonatlich: number;
  qualis: number;
  variableEur: number;
  totalEur: number;
}

export function computeMonthlyClosers(
  month: string,
  deals: Deal[],
  employees: Employee[],
): CloserProvision[] {
  const monthDate = parseMonth(month);
  if (!monthDate) return [];

  const closerIds = new Map<string, Employee>(); // mitId -> employee
  for (const e of employees) {
    if (!e.active) continue;
    if (!e.is_closer) continue;
    if (e.is_setter) continue; // Setter werden separat behandelt
    if (isTestUser(e)) continue;
    if (e.hubspot_owner_id) closerIds.set(e.hubspot_owner_id, e);
    closerIds.set(e.id, e);
  }

  // Variable Provision pro Mitarbeiter
  const variableByMit = new Map<string, number>();
  for (const d of deals) {
    if (d.pending_delete) continue;
    const emp = closerIds.get(d.mitarbeiter_id);
    if (!emp || emp.provision_pct == null) continue;
    let base = 0;
    for (const p of expandPayments(d)) {
      if (
        p.date.getFullYear() === monthDate.year &&
        p.date.getMonth() === monthDate.monthIndex
      ) {
        base += p.amount;
      }
    }
    if (base > 0) {
      const prov = (base * emp.provision_pct) / 100;
      variableByMit.set(
        d.mitarbeiter_id,
        (variableByMit.get(d.mitarbeiter_id) ?? 0) + prov,
      );
    }
  }

  // Dedupliziere pro Employee (eine Zeile pro Person).
  const seen = new Set<string>();
  const out: CloserProvision[] = [];
  for (const e of employees) {
    if (!e.active || !e.is_closer || e.is_setter) continue;
    if (isTestUser(e)) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);

    // Fixum (setter_hours-Tarif + closer_fixum_eur), eingeschränkt durch
    // employment_start / employment_end.
    const setterFix = e.setter_hours
      ? SETTER_TARIFFS[e.setter_hours]?.fixum ?? 0
      : 0;
    const closerFix = e.closer_fixum_eur ?? 0;
    let fix = setterFix + closerFix;
    if (e.employment_start && month < e.employment_start.slice(0, 7)) fix = 0;
    if (e.employment_end && month > e.employment_end.slice(0, 7)) fix = 0;

    const mitKeys = e.hubspot_owner_id ? [e.hubspot_owner_id, e.id] : [e.id];
    const provision = mitKeys.reduce(
      (s, k) => s + (variableByMit.get(k) ?? 0),
      0,
    );

    if (fix <= 0 && provision <= 0) continue;
    out.push({
      mitarbeiter_id: e.hubspot_owner_id ?? e.id,
      nachname: inferNachname(e.name),
      fixumMonatlich: fix,
      provisionEur: provision,
    });
  }

  out.sort(
    (a, b) =>
      b.fixumMonatlich + b.provisionEur - (a.fixumMonatlich + a.provisionEur),
  );
  return out;
}

/**
 * Liefert aktive Setter, für die im gegebenen Monat noch KEIN Qualis-Eintrag
 * in der DB existiert. "0 eingetragen" gilt als bewusst (Eintrag vorhanden);
 * komplett fehlende Zeile ist die Erinnerung wert.
 */
export interface MissingQualisSetter {
  mitarbeiter_id: string;
  name: string;
  setter_hours: string | null;
}

export function findMissingQualisSetters(
  employees: Employee[],
  qualisHasEntryByMit: Set<string>,
): MissingQualisSetter[] {
  const out: MissingQualisSetter[] = [];
  for (const e of employees) {
    if (!e.active || !e.is_setter) continue;
    if (isTestUser(e)) continue;
    if (!e.setter_hours) continue;
    const keys = e.hubspot_owner_id ? [e.hubspot_owner_id, e.id] : [e.id];
    const present = keys.some((k) => qualisHasEntryByMit.has(k));
    if (!present) {
      out.push({
        mitarbeiter_id: e.hubspot_owner_id ?? e.id,
        name: e.name,
        setter_hours: e.setter_hours,
      });
    }
  }
  return out;
}

export interface ReminderEmail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export function buildQualisReminderEmail(
  month: string,
  missing: MissingQualisSetter[],
  adminUrl: string,
): ReminderEmail {
  const monLabel = monthLabelDe(month);
  const subject = `Erinnerung: Qualis für ${monLabel} eintragen`;
  const greeting = "Hallo Mario";
  const intro =
    `bevor die Provisions-Mail an die Steuerberatung rausgeht, fehlen für ` +
    `${monLabel} noch Qualis-Einträge für folgende Setter:`;
  const lines = missing.map(
    (m) => `• ${m.name}${m.setter_hours ? ` (${m.setter_hours})` : ""}`,
  );
  const outro =
    `Bitte trage die Anzahl der erschienenen Qualis pro Setter im Admin-` +
    `Bereich ein und klicke anschließend auf „Provisions-Mail jetzt senden":\n${adminUrl}`;
  const sign = "Automatischer Hinweis vom Closing Dashboard.";

  const text = [greeting, "", intro, "", ...lines, "", outro, "", sign].join("\n");
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">
      <p>${escapeHtml(greeting)},</p>
      <p>${escapeHtml(intro)}</p>
      <ul>${missing
        .map(
          (m) =>
            `<li>${escapeHtml(m.name)}${
              m.setter_hours ? ` (${escapeHtml(m.setter_hours)})` : ""
            }</li>`,
        )
        .join("")}</ul>
      <p>Bitte trage die Anzahl der erschienenen Qualis pro Setter im Admin-Bereich ein und klicke anschließend auf „Provisions-Mail jetzt senden":</p>
      <p><a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a></p>
      <p style="color:#6b7280;font-size:12px">${escapeHtml(sign)}</p>
    </div>
  `.trim();

  return { subject, textBody: text, htmlBody: html };
}

export function computeMonthlySetters(
  month: string,
  employees: Employee[],
  qualisByMit: Map<string, number>,
): SetterPayout[] {
  const out: SetterPayout[] = [];
  for (const e of employees) {
    if (!e.active || !e.is_setter) continue;
    if (isTestUser(e)) continue;
    const tariff = e.setter_hours ? SETTER_TARIFFS[e.setter_hours] : null;
    if (!tariff) continue;

    // Anzahl Qualis aus DB-Map (Schlüssel: hubspot_owner_id ODER employee.id).
    const keys = e.hubspot_owner_id ? [e.hubspot_owner_id, e.id] : [e.id];
    let qualis = 0;
    for (const k of keys) qualis = Math.max(qualis, qualisByMit.get(k) ?? 0);

    let fix = tariff.fixum;
    if (e.employment_start && month < e.employment_start.slice(0, 7)) fix = 0;
    if (e.employment_end && month > e.employment_end.slice(0, 7)) fix = 0;

    const calc = calcSetterPayout(tariff, qualis);
    // Wenn Fixum durch employment-Filter wegfällt, dann auch im Total fallenlassen.
    const variableEur = fix > 0 ? calc.variableEur : 0;
    const totalEur = fix + variableEur;
    if (totalEur <= 0) continue;
    out.push({
      mitarbeiter_id: e.hubspot_owner_id ?? e.id,
      nachname: inferNachname(e.name),
      fixumMonatlich: fix,
      qualis,
      variableEur,
      totalEur,
    });
  }
  out.sort((a, b) => b.totalEur - a.totalEur);
  return out;
}

export interface ProvisionsEmail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export function buildProvisionsEmail(
  month: string,
  closers: CloserProvision[],
  setters: SetterPayout[],
): ProvisionsEmail {
  const monLabel = monthLabelDe(month);
  const subject = `Provisionen ${monLabel}`;
  const greeting = "Sehr geehrte Frau Plank";
  const intro = "Bitte folgende Provisionen abrechnen:";
  const sign = "Herzliche Grüße,\nMario Grabner";

  const closerLines = closers.map(formatCloserLine);
  const setterLines = setters.map(formatSetterLine);

  // Geblockt: erst Closer, dann Setter mit Leerzeile dazwischen. Wenn eine
  // Gruppe leer ist, dann nur die andere ohne extra Leerzeile.
  const body: string[] = [];
  if (closerLines.length > 0) body.push(...closerLines);
  if (closerLines.length > 0 && setterLines.length > 0) body.push("");
  if (setterLines.length > 0) body.push(...setterLines);

  const text = [greeting, "", intro, "", ...body, "", sign].join("\n");

  const htmlBlocks: string[] = [];
  for (const l of body) {
    if (l === "") htmlBlocks.push("<div>&nbsp;</div>");
    else htmlBlocks.push(`<div>${escapeHtml(l)}</div>`);
  }
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(intro)}</p>
      <div>${htmlBlocks.join("")}</div>
      <p>${escapeHtml(sign).replace(/\n/g, "<br>")}</p>
    </div>
  `.trim();

  return { subject, textBody: text, htmlBody: html };
}

function formatCloserLine(c: CloserProvision): string {
  const f = c.fixumMonatlich;
  const v = c.provisionEur;
  if (f > 0 && v > 0) {
    return `${c.nachname}: ${formatNumber(f)}+${formatNumber(v)}`;
  }
  if (f > 0) {
    return `${c.nachname}: Fixum (${formatNumber(f)})`;
  }
  return `${c.nachname}: ${formatNumber(v)}`;
}

function formatSetterLine(s: SetterPayout): string {
  // Steuerberatung will nur den Gesamtbetrag — keine Quali-Anzahl, kein Fixum-Detail.
  return `${s.nachname}: ${formatNumber(s.totalEur)}`;
}

function formatNumber(n: number): string {
  // de-DE statt de-AT — Tausender mit Punkt statt geschütztem Leerzeichen,
  // damit die Zahlen in Mail-Clients kompakt bleiben (5.509,81 statt 5 509,81).
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function isTestUser(e: Employee): boolean {
  const n = e.name.trim().toLowerCase();
  return n === "test" || n.startsWith("test ");
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
