import { NextResponse, type NextRequest } from "next/server";
import { buildRechnerDigest } from "@/lib/rechner-digest";
import { sendMail } from "@/lib/mailer";
import { listRechnerEventsSince } from "@/lib/store";
import { getSessionContext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

function fromHeader(): string {
  const name = process.env.PROVISIONS_FROM_NAME ?? "Closing Dashboard";
  const email = process.env.PROVISIONS_FROM_EMAIL ?? process.env.SMTP_USER;
  if (!email)
    throw new Error("PROVISIONS_FROM_EMAIL oder SMTP_USER muss gesetzt sein.");
  return `${name} <${email}>`;
}

/**
 * Preview (GET):
 *   /api/rechner-digest?hours=24&send=test
 *
 * Liefert per Default die letzten 24h als JSON-Preview. Mit ?send=test wird
 * der Digest tatsächlich an den Admin (PROVISIONS_TEST_RECIPIENT bzw.
 * RECHNER_DIGEST_RECIPIENT) verschickt.
 *
 * Nur Admins.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx?.isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const hours = Math.max(
    1,
    Math.min(168, Number.parseInt(url.searchParams.get("hours") ?? "24", 10) || 24),
  );
  const sendMode = url.searchParams.get("send"); // "test" | null
  const until = new Date();
  const since = new Date(until.getTime() - hours * 3_600_000);
  const events = await listRechnerEventsSince(since);
  const digest = buildRechnerDigest(events, since, until);

  if (sendMode === "test") {
    const recipient =
      process.env.RECHNER_DIGEST_RECIPIENT ??
      process.env.PROVISIONS_TEST_RECIPIENT ??
      process.env.PROVISIONS_FROM_EMAIL ??
      process.env.SMTP_USER;
    if (!recipient) {
      return NextResponse.json(
        { ok: false, error: "Kein Empfänger konfiguriert." },
        { status: 500 },
      );
    }
    try {
      const info = await sendMail({
        from: fromHeader(),
        to: recipient,
        subject: `[TEST] ${digest.subject}`,
        text: digest.textBody,
        html: digest.htmlBody,
      });
      return NextResponse.json({
        ok: true,
        sent: true,
        recipient,
        messageId: info.messageId,
        digest: { ...digest, htmlBody: undefined },
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          digest,
        },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({
    ok: true,
    since: since.toISOString(),
    until: until.toISOString(),
    events_count: events.length,
    digest: { ...digest, htmlBody: undefined },
  });
}

/**
 * Cron-Pfad (POST). Sendet den 24-h-Digest an den konfigurierten
 * RECHNER_DIGEST_RECIPIENT (Default: mario.grabner@mynlp.at).
 *
 * Authorization: Bearer CRON_SECRET
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    const ctx = await getSessionContext();
    if (!ctx?.isAdmin) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const recipient =
    process.env.RECHNER_DIGEST_RECIPIENT ?? "mario.grabner@mynlp.at";
  const until = new Date();
  const since = new Date(until.getTime() - 24 * 3_600_000);
  const events = await listRechnerEventsSince(since);
  const digest = buildRechnerDigest(events, since, until);

  // Bei 0 Events optional skip — der User hat darum gebeten, "wenn die
  // Mitarbeiter den Rechner nutzen". Leere Mails sind also nicht gewünscht.
  if (digest.totalEvents === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Keine Rechner-Aktivität in den letzten 24h.",
    });
  }
  try {
    const info = await sendMail({
      from: fromHeader(),
      to: recipient,
      subject: digest.subject,
      text: digest.textBody,
      html: digest.htmlBody,
    });
    return NextResponse.json({
      ok: true,
      sent: true,
      recipient,
      messageId: info.messageId,
      events_count: digest.totalEvents,
      unique_employees: digest.uniqueEmployees,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
