import { NextResponse, type NextRequest } from "next/server";
import { isSecondToLastWorkingDayOfMonth } from "@/lib/business-days";
import {
  buildProvisionsEmail,
  buildQualisReminderEmail,
  computeMonthlyClosers,
  computeMonthlySetters,
  findMissingQualisSetters,
} from "@/lib/provisions-email";
import { sendMail } from "@/lib/mailer";
import {
  getSetterQualisForMonth,
  listDeals,
  listEmployees,
} from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

function defaultMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fromHeader(): string {
  const name = process.env.PROVISIONS_FROM_NAME ?? "Dr. Mario Grabner";
  const email = process.env.PROVISIONS_FROM_EMAIL ?? process.env.SMTP_USER;
  if (!email) throw new Error("PROVISIONS_FROM_EMAIL oder SMTP_USER muss gesetzt sein.");
  return `${name} <${email}>`;
}

/**
 * Preview / Test-Modus (GET):
 *   /api/provisions-email?month=2026-04            → JSON-Preview ohne Versand
 *   /api/provisions-email?month=2026-04&send=test  → echte Mail nur an Admin
 *                                                    (PROVISIONS_FROM_EMAIL),
 *                                                    nicht an Plank.
 * Nur Admin-Session.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx?.isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || defaultMonth();
  const sendMode = url.searchParams.get("send"); // "test" | null
  const [deals, employees, qualisMap] = await Promise.all([
    listDeals(),
    listEmployees(),
    getSetterQualisForMonth(month),
  ]);
  const closers = computeMonthlyClosers(month, deals, employees);
  const setters = computeMonthlySetters(month, employees, qualisMap);
  const email = buildProvisionsEmail(month, closers, setters);

  if (sendMode === "test") {
    const testRecipient =
      process.env.PROVISIONS_TEST_RECIPIENT ??
      process.env.PROVISIONS_FROM_EMAIL ??
      process.env.SMTP_USER;
    if (!testRecipient) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Kein Test-Empfänger konfiguriert. Setze PROVISIONS_TEST_RECIPIENT oder PROVISIONS_FROM_EMAIL.",
        },
        { status: 500 },
      );
    }
    try {
      const info = await sendMail({
        from: fromHeader(),
        to: testRecipient,
        subject: `[TEST] ${email.subject}`,
        text: email.textBody,
        html: email.htmlBody,
      });
      return NextResponse.json({
        ok: true,
        sent: true,
        mode: "test",
        recipient: testRecipient,
        messageId: info.messageId,
        accepted: info.accepted,
        month,
        closerCount: closers.length,
        setterCount: setters.length,
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          month,
          email,
        },
        { status: 500 },
      );
    }
  }

  // Reine Preview ohne Versand.
  return NextResponse.json({
    ok: true,
    month,
    closerCount: closers.length,
    setterCount: setters.length,
    closers,
    setters,
    email,
    note:
      "Preview-Modus. Mit ?send=test schicke ich dir die Mail testweise an PROVISIONS_TEST_RECIPIENT bzw. PROVISIONS_FROM_EMAIL. Echte Plank-Mail erfolgt nur über POST + CRON_SECRET + PROVISIONS_EMAIL_LIVE=true.",
  });
}

/**
 * Cron-Modus (POST):
 *   Authorization: Bearer <CRON_SECRET>
 * Wird täglich um 07:00 UTC (≈ 09:00 Wien) gerufen. Sendet die Mail
 * tatsächlich an PROVISIONS_TO_EMAIL mit PROVISIONS_CC_EMAIL in CC, NUR wenn
 * heute der zweitletzte Werktag des Monats ist UND PROVISIONS_EMAIL_LIVE=true.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    const ctx = await getSessionContext();
    if (!ctx?.isAdmin) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const today = new Date();
  if (!force && !isSecondToLastWorkingDayOfMonth(today)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Heute ist nicht der zweitletzte Werktag des Monats.",
    });
  }
  if (process.env.PROVISIONS_EMAIL_LIVE !== "true") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason:
        "PROVISIONS_EMAIL_LIVE ist nicht aktiviert. Setze die ENV-Variable auf 'true', um echte Mails zu senden.",
    });
  }
  const toEmail = process.env.PROVISIONS_TO_EMAIL;
  if (!toEmail) {
    return NextResponse.json(
      {
        ok: false,
        error: "PROVISIONS_TO_EMAIL ist nicht gesetzt.",
      },
      { status: 500 },
    );
  }
  const ccEmail = process.env.PROVISIONS_CC_EMAIL;

  const month = url.searchParams.get("month") || defaultMonth();
  const [deals, employees, qualisMap] = await Promise.all([
    listDeals(),
    listEmployees(),
    getSetterQualisForMonth(month),
  ]);

  // Fehlen Qualis-Einträge für einen aktiven Setter? Dann erst Reminder an
  // Mario, nicht die echte Mail an Plank.
  const presenceSet = new Set(qualisMap.keys());
  const missing = findMissingQualisSetters(employees, presenceSet);
  if (missing.length > 0) {
    const reminderRecipient =
      process.env.PROVISIONS_FROM_EMAIL ??
      process.env.PROVISIONS_TEST_RECIPIENT ??
      process.env.SMTP_USER;
    if (!reminderRecipient) {
      return NextResponse.json(
        { ok: false, error: "Kein Reminder-Empfänger konfiguriert." },
        { status: 500 },
      );
    }
    const adminUrl =
      process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/admin`
        : new URL("/admin", req.url).toString().replace("/cashflow", "");
    const reminder = buildQualisReminderEmail(month, missing, adminUrl);
    try {
      const info = await sendMail({
        from: fromHeader(),
        to: reminderRecipient,
        subject: reminder.subject,
        text: reminder.textBody,
        html: reminder.htmlBody,
      });
      return NextResponse.json({
        ok: true,
        sent: true,
        mode: "reminder",
        messageId: info.messageId,
        accepted: info.accepted,
        month,
        missingSetters: missing,
        note:
          "Provisions-Mail an Plank wurde NICHT gesendet — fehlende Qualis-Einträge. Reminder ging an Mario.",
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          mode: "reminder",
          month,
        },
        { status: 500 },
      );
    }
  }

  const closers = computeMonthlyClosers(month, deals, employees);
  const setters = computeMonthlySetters(month, employees, qualisMap);
  const email = buildProvisionsEmail(month, closers, setters);

  try {
    const info = await sendMail({
      from: fromHeader(),
      to: toEmail,
      cc: ccEmail,
      subject: email.subject,
      text: email.textBody,
      html: email.htmlBody,
    });
    return NextResponse.json({
      ok: true,
      sent: true,
      mode: "live",
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      month,
      closerCount: closers.length,
      setterCount: setters.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        month,
      },
      { status: 500 },
    );
  }
}
