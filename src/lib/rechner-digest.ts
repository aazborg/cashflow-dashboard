import type { RechnerEvent } from "./types";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtEur(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 0 })}%`;
}

export interface RechnerDigest {
  subject: string;
  textBody: string;
  htmlBody: string;
  /** Anzahl Mitarbeiter mit Aktivität im Zeitraum. */
  uniqueEmployees: number;
  totalEvents: number;
}

/**
 * Baut den Tages-Digest aus Rechner-Events. Gruppiert nach Mitarbeiter,
 * zeigt einen Eintrag pro Slider-Stop.
 */
export function buildRechnerDigest(
  events: RechnerEvent[],
  since: Date,
  until: Date,
): RechnerDigest {
  const dateLabel = since.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Gruppieren nach Mitarbeiter
  const byMit = new Map<string, RechnerEvent[]>();
  for (const e of events) {
    if (!byMit.has(e.mitarbeiter_id)) byMit.set(e.mitarbeiter_id, []);
    byMit.get(e.mitarbeiter_id)!.push(e);
  }
  // Sortierung: Mitarbeiter mit den meisten Sessions zuerst
  const groups = [...byMit.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  const subject =
    events.length === 0
      ? `Rechner-Aktivität ${dateLabel}: keine Sessions`
      : `Rechner-Aktivität ${dateLabel} · ${events.length} Session${events.length === 1 ? "" : "s"} · ${groups.length} Mitarbeiter`;

  const since_local = since.toLocaleString("de-AT");
  const until_local = until.toLocaleString("de-AT");

  if (events.length === 0) {
    const text = [
      "Hallo Mario,",
      "",
      `im Zeitraum ${since_local} bis ${until_local} hat sich kein Mitarbeiter`,
      "mit dem Zielrechner beschäftigt.",
      "",
      "Automatischer Digest vom Closing Dashboard.",
    ].join("\n");
    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">
        <p>Hallo Mario,</p>
        <p>im Zeitraum ${since_local} bis ${until_local} hat sich kein Mitarbeiter mit dem Zielrechner beschäftigt.</p>
        <p style="color:#6b7280;font-size:12px">Automatischer Digest vom Closing Dashboard.</p>
      </div>
    `.trim();
    return {
      subject,
      textBody: text,
      htmlBody: html,
      uniqueEmployees: 0,
      totalEvents: 0,
    };
  }

  const textLines: string[] = [];
  textLines.push("Hallo Mario,");
  textLines.push("");
  textLines.push(
    `im Zeitraum ${since_local} bis ${until_local} haben sich ${groups.length} Mitarbeiter`,
  );
  textLines.push(`mit dem Zielrechner beschäftigt (${events.length} Events):`);
  textLines.push("");
  for (const [, rows] of groups) {
    const name = rows[0].mitarbeiter_name;
    textLines.push(`${name} (${rows.length}× Session${rows.length === 1 ? "" : "s"}):`);
    for (const e of rows) {
      const time = fmtTime(e.created_at);
      const modeLabel = e.mode === "provision" ? "Provision" : "Umsatz";
      textLines.push(
        `  ${time}  Modus: ${modeLabel} · Qualis ${e.qualis ?? "—"} · Showup ${fmtPct(e.showup)} · Close ${fmtPct(e.close_rate)} · Ø ${fmtEur(e.avg_contract)} → erwartet ${fmtEur(e.expected_value)}`,
      );
    }
    textLines.push("");
  }
  textLines.push("Automatischer Digest vom Closing Dashboard.");

  const htmlGroups = groups
    .map(([, rows]) => {
      const name = rows[0].mitarbeiter_name;
      const lis = rows
        .map((e) => {
          const time = fmtTime(e.created_at);
          const modeLabel = e.mode === "provision" ? "Provision" : "Umsatz";
          return `<li><strong>${time}</strong> · Modus: ${modeLabel} · Qualis ${e.qualis ?? "—"} · Showup ${fmtPct(e.showup)} · Close ${fmtPct(e.close_rate)} · Ø ${fmtEur(e.avg_contract)} → <strong>${fmtEur(e.expected_value)}</strong></li>`;
        })
        .join("");
      return `<div style="margin-bottom:18px"><div style="font-weight:600;margin-bottom:4px">${name} <span style="color:#6b7280;font-weight:400">(${rows.length}× Session${rows.length === 1 ? "" : "s"})</span></div><ul style="margin:0;padding-left:20px;color:#1a1a1a">${lis}</ul></div>`;
    })
    .join("");

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;max-width:680px">
      <p>Hallo Mario,</p>
      <p>im Zeitraum <strong>${since_local}</strong> bis <strong>${until_local}</strong> haben sich <strong>${groups.length} Mitarbeiter</strong> mit dem Zielrechner beschäftigt (${events.length} Events):</p>
      ${htmlGroups}
      <p style="color:#6b7280;font-size:12px;margin-top:24px">Automatischer Digest vom Closing Dashboard.</p>
    </div>
  `.trim();

  return {
    subject,
    textBody: textLines.join("\n"),
    htmlBody: html,
    uniqueEmployees: groups.length,
    totalEvents: events.length,
  };
}
