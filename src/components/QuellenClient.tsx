"use client";
/**
 * Rechnungs-Quellen-Tab.
 *
 * Bestandteile:
 *   1) Monatsabgleich (Soll vs Ist im laufenden Monat)
 *   2) Quellen-Tabelle mit Status, last_sync, Credentials
 *   3) "+ Neue Quelle"-Modal
 *   4) "Anlernen"-Modal (Playwright-Codegen pasten)
 *   5) "Credentials"-Modal (api_token, username, password setzen)
 *
 * Defensiv gegen Vercel-HTML-Errors.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const API = "/cashflow/api/buchhaltung";

type Source = {
  id: string;
  slug: string;
  name: string;
  login_type: "api" | "browser" | "email_only";
  status: "learning" | "testing" | "active" | "paused" | "error";
  expected_per_month: number;
  login_url: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_sync_invoices_found: number | null;
  credential_kinds: string[];
  notes: string | null;
};

type AbgleichRow = {
  source_id: string;
  slug: string;
  name: string;
  status: Source["status"];
  expected: number;
  actual: number;
  fehlt: number;
  ueberzaehlig: number;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

type CodegenStep = Record<string, string | number | null>;
type CodegenConfig = {
  version: number;
  login_url: string | null;
  steps: CodegenStep[];
  required_credentials: string[];
};

const STATUS_LABELS: Record<Source["status"], { label: string; tone: string }> = {
  learning: { label: "Anlernen", tone: "bg-amber-100 text-amber-800" },
  testing: { label: "Test", tone: "bg-sky-100 text-sky-800" },
  active: { label: "Aktiv", tone: "bg-emerald-100 text-emerald-800" },
  paused: { label: "Pausiert", tone: "bg-gray-200 text-gray-700" },
  error: { label: "Fehler", tone: "bg-red-100 text-red-800" },
};

const LOGIN_TYPE_LABELS: Record<Source["login_type"], string> = {
  api: "API",
  browser: "Browser (Playwright)",
  email_only: "nur Email",
};

async function safeJson<T>(res: Response): Promise<{ ok: boolean; data?: T; error?: string }> {
  const raw = await res.text();
  try {
    const j = JSON.parse(raw) as T & { ok?: boolean; error?: string };
    return { ok: res.ok && j.ok !== false, data: j, error: j.error };
  } catch {
    const head = raw.replace(/\s+/g, " ").trim().slice(0, 120);
    return { ok: false, error: `HTTP ${res.status} (keine JSON-Antwort) — ${head}` };
  }
}

export default function QuellenClient() {
  const [sources, setSources] = useState<Source[]>([]);
  const [abgleich, setAbgleich] = useState<{ rows: AbgleichRow[]; year: number; month: number; summe_fehlt: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showTeach, setShowTeach] = useState<Source | null>(null);
  const [showCreds, setShowCreds] = useState<Source | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resSources, resAbgleich] = await Promise.all([
        fetch(`${API}/sources`, { cache: "no-store" }),
        fetch(`${API}/sources/monatsabgleich`, { cache: "no-store" }),
      ]);
      const s = await safeJson<{ sources?: Source[] }>(resSources);
      const a = await safeJson<{ rows?: AbgleichRow[]; year: number; month: number; summe_fehlt: number }>(resAbgleich);
      if (!s.ok) {
        setError(s.error ?? "Quellen-Load fehlgeschlagen");
      } else {
        setSources((s.data?.sources ?? []) as Source[]);
      }
      if (a.ok && a.data) {
        setAbgleich({
          rows: (a.data.rows ?? []) as AbgleichRow[],
          year: a.data.year,
          month: a.data.month,
          summe_fehlt: a.data.summe_fehlt ?? 0,
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const triggerSync = useCallback(
    async (s: Source) => {
      const now = new Date();
      setSyncMsg((m) => ({ ...m, [s.id]: "⏳ Sync läuft…" }));
      try {
        const res = await fetch(`${API}/sources/${s.id}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: now.getFullYear(),
            month: now.getMonth() + 1,
          }),
        });
        const j = await safeJson<{
          status?: string;
          invoices_found?: number;
          invoices_imported?: number;
          error?: string;
        }>(res);
        if (!j.ok) {
          setSyncMsg((m) => ({ ...m, [s.id]: `❌ ${j.error ?? "Fehler"}` }));
          return;
        }
        const d = j.data!;
        setSyncMsg((m) => ({
          ...m,
          [s.id]: `✅ ${d.status} · ${d.invoices_found ?? 0} gefunden / ${d.invoices_imported ?? 0} importiert`,
        }));
        await load();
      } catch (e) {
        setSyncMsg((m) => ({ ...m, [s.id]: `❌ ${String(e)}` }));
      }
    },
    [load],
  );

  const counts = useMemo(() => {
    const c = { total: sources.length, active: 0, learning: 0, error: 0 };
    for (const s of sources) {
      if (s.status === "active") c.active++;
      else if (s.status === "learning" || s.status === "testing") c.learning++;
      else if (s.status === "error") c.error++;
    }
    return c;
  }, [sources]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold">
            {counts.total} Quellen · {counts.active} aktiv · {counts.learning} im Aufbau · {counts.error} mit Fehler
          </div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">
            Pro Plattform ein Connector. Anlern-Modus: Playwright-Codegen ins „↻ Anlernen“-Modal pasten.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-sm font-medium"
        >
          + Neue Quelle
        </button>
      </div>

      {/* Monatsabgleich */}
      {abgleich && (
        <div className="bg-white border border-[color:var(--border)] rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-semibold">
                Monatsabgleich {String(abgleich.month).padStart(2, "0")}/{abgleich.year}
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                {abgleich.summe_fehlt > 0
                  ? `${abgleich.summe_fehlt} Rechnung${abgleich.summe_fehlt === 1 ? "" : "en"} fehlen noch`
                  : "Alle erwarteten Rechnungen sind da"}
              </div>
            </div>
          </div>
          {abgleich.rows.filter((r) => r.fehlt > 0).length > 0 && (
            <table className="w-full text-xs mt-3">
              <thead className="text-left text-[color:var(--muted)]">
                <tr>
                  <th className="py-1">Quelle</th>
                  <th className="py-1 text-right">Erwartet</th>
                  <th className="py-1 text-right">Aktuell</th>
                  <th className="py-1 text-right">Fehlt</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {abgleich.rows
                  .filter((r) => r.fehlt > 0)
                  .map((r) => {
                    const src = sources.find((s) => s.id === r.source_id);
                    return (
                      <tr key={r.source_id} className="border-t border-[color:var(--border)]">
                        <td className="py-1">{r.name}</td>
                        <td className="py-1 text-right tabular-nums">{r.expected}</td>
                        <td className="py-1 text-right tabular-nums">{r.actual}</td>
                        <td className="py-1 text-right tabular-nums text-amber-700 font-medium">{r.fehlt}</td>
                        <td className="py-1 text-right">
                          {src && (
                            <button
                              type="button"
                              onClick={() => triggerSync(src)}
                              className="px-2 py-0.5 rounded border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)]"
                            >
                              ↻ holen
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tabelle */}
      <div className="bg-white border border-[color:var(--border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Typ</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Soll/Mo</th>
                <th className="px-3 py-2 font-medium">Letzter Sync</th>
                <th className="px-3 py-2 font-medium">Credentials</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-red-600">
                    {error}
                  </td>
                </tr>
              )}
              {!error && loading && sources.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    Lade…
                  </td>
                </tr>
              )}
              {!error && !loading && sources.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[color:var(--muted)]">
                    Noch keine Quellen angelegt. Klick „+ Neue Quelle“ um die erste Plattform anzulernen.
                  </td>
                </tr>
              )}
              {sources.map((s) => {
                const stat = STATUS_LABELS[s.status];
                const msg = syncMsg[s.id];
                return (
                  <tr key={s.id} className="border-t border-[color:var(--border)] align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-[color:var(--muted)] font-mono">{s.slug}</div>
                      {s.notes && (
                        <div className="text-xs text-[color:var(--muted)] mt-0.5 line-clamp-1">{s.notes}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[color:var(--muted)]">{LOGIN_TYPE_LABELS[s.login_type]}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${stat.tone}`}>{stat.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.expected_per_month}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.last_synced_at ? (
                        <>
                          <div>{new Date(s.last_synced_at).toLocaleString("de-AT")}</div>
                          <div className="text-[color:var(--muted)]">
                            {s.last_sync_status} · {s.last_sync_invoices_found ?? 0}
                          </div>
                          {s.last_sync_error && (
                            <div className="text-red-700 line-clamp-1" title={s.last_sync_error}>
                              {s.last_sync_error}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[color:var(--muted)]">noch nie</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.credential_kinds.length > 0 ? (
                        <span className="text-emerald-700">✓ {s.credential_kinds.join(", ")}</span>
                      ) : (
                        <span className="text-amber-700">— nicht gesetzt</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => triggerSync(s)}
                        className="text-xs px-2 py-1 rounded border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)]"
                        title="Diesen Monat von der Plattform holen"
                      >
                        ↻ Holen
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreds(s)}
                        className="text-xs px-2 py-1 rounded border border-[color:var(--border)]"
                        title="Login-Daten verschluesselt hinterlegen"
                      >
                        🔑 Login
                      </button>
                      {s.login_type === "browser" && (
                        <button
                          type="button"
                          onClick={() => setShowTeach(s)}
                          className="text-xs px-2 py-1 rounded border border-[color:var(--brand-orange)] text-[color:var(--brand-orange)]"
                          title="Playwright-Codegen pasten"
                        >
                          🎓 Anlernen
                        </button>
                      )}
                      {msg && <div className="text-xs mt-1">{msg}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddSourceModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); void load(); }} />}
      {showTeach && <TeachModal source={showTeach} onClose={() => setShowTeach(null)} onSaved={() => { setShowTeach(null); void load(); }} />}
      {showCreds && <CredentialsModal source={showCreds} onClose={() => setShowCreds(null)} onSaved={() => { void load(); }} />}
    </div>
  );
}

// -----------------------------------------------------------------------------

function AddSourceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [loginType, setLoginType] = useState<"api" | "browser" | "email_only">("api");
  const [loginUrl, setLoginUrl] = useState("");
  const [expected, setExpected] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          login_type: loginType,
          login_url: loginUrl.trim() || null,
          expected_per_month: Number(expected) || 1,
        }),
      });
      const j = await safeJson(res);
      if (!j.ok) {
        setErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onCreated();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Neue Rechnungs-Quelle" onClose={onClose}>
      <Field label="Anzeige-Name" hint="z.B. „Anthropic API“">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-[color:var(--border)] rounded px-2 py-1.5" />
      </Field>
      <Field label="Slug" hint="URL-safe, eindeutig. z.B. „anthropic“">
        <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="w-full border border-[color:var(--border)] rounded px-2 py-1.5 font-mono" placeholder="anthropic" />
      </Field>
      <Field label="Login-Typ" hint="API = REST/Token · Browser = Playwright · nur Email = passiv">
        <select value={loginType} onChange={(e) => setLoginType(e.target.value as typeof loginType)} className="w-full border border-[color:var(--border)] rounded px-2 py-1.5">
          <option value="api">API (REST/Token)</option>
          <option value="browser">Browser (Playwright-Codegen)</option>
          <option value="email_only">nur Email (passiv)</option>
        </select>
      </Field>
      <Field label="Login-URL" hint="optional, fuer „direkt öffnen“-Link">
        <input value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} className="w-full border border-[color:var(--border)] rounded px-2 py-1.5" placeholder="https://..." />
      </Field>
      <Field label="Erwartete Rechnungen/Monat" hint="1 = monatliches Abo · 0 = gelegentlich (kein Soll-Abgleich)">
        <input type="number" min="0" value={expected} onChange={(e) => setExpected(e.target.value)} className="w-24 border border-[color:var(--border)] rounded px-2 py-1.5 text-right tabular-nums" />
      </Field>
      {err && <div className="text-red-700 text-xs">{err}</div>}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded border border-[color:var(--border)] text-sm">Abbrechen</button>
        <button type="button" onClick={save} disabled={busy || !slug.trim() || !name.trim()} className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-sm font-medium disabled:opacity-50">
          {busy ? "Speichert…" : "Anlegen"}
        </button>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function TeachModal({ source, onClose, onSaved }: { source: Source; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [parsed, setParsed] = useState<CodegenConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function preview() {
    setBusy(true);
    setErr(null);
    setParsed(null);
    try {
      const res = await fetch(`${API}/sources/parse-codegen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await safeJson<{ config?: CodegenConfig; error?: string }>(res);
      if (!j.ok) {
        setErr(j.error ?? "Parse fehlgeschlagen");
        return;
      }
      setParsed((j.data?.config ?? null) as CodegenConfig | null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!parsed) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      const j = await safeJson(res);
      if (!j.ok) {
        setErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Anlernen: ${source.name}`} onClose={onClose} wide>
      <div className="text-xs text-[color:var(--muted)] mb-2">
        Im Terminal: <code className="font-mono bg-[color:var(--surface)] px-1 py-0.5 rounded">playwright codegen {source.login_url ?? "https://..."}</code><br />
        Klicke dich durch Login → Rechnungs-Liste → Download einer Beispiel-Rechnung. Den ausgegebenen Python-Code hier einfügen.
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={12}
        placeholder="from playwright.sync_api import Playwright, sync_playwright

def run(playwright: Playwright):
    browser = playwright.chromium.launch(...)
    ..."
        className="w-full font-mono text-xs border border-[color:var(--border)] rounded p-2"
      />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={preview} disabled={busy || !code.trim()} className="px-3 py-1.5 rounded border border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] text-sm disabled:opacity-50">
          {busy ? "Parst…" : "Vorschau"}
        </button>
        {parsed && (
          <button type="button" onClick={save} disabled={busy} className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-sm font-medium">
            Speichern
          </button>
        )}
      </div>
      {err && <div className="text-red-700 text-xs mt-2 whitespace-pre-wrap">{err}</div>}
      {parsed && (
        <div className="mt-3 border-t border-[color:var(--border)] pt-3 space-y-2">
          <div className="text-xs">
            <strong>Login-URL:</strong> {parsed.login_url ?? "—"}
          </div>
          <div className="text-xs">
            <strong>Erwartete Credentials:</strong>{" "}
            {parsed.required_credentials.length > 0
              ? parsed.required_credentials.join(", ")
              : "keine"}
          </div>
          <div className="text-xs">
            <strong>{parsed.steps.length} Schritte erkannt:</strong>
          </div>
          <pre className="text-[10px] font-mono bg-[color:var(--surface)] p-2 rounded max-h-48 overflow-y-auto">
            {JSON.stringify(parsed.steps, null, 2)}
          </pre>
        </div>
      )}
    </Modal>
  );
}

// -----------------------------------------------------------------------------

type CredentialKind = "username" | "password" | "totp_secret" | "storage_state" | "api_token" | "magic_link_email";

const CRED_HINTS: Record<CredentialKind, { label: string; hint: string; placeholder?: string; multiline?: boolean }> = {
  username: { label: "Email / Benutzername", hint: "Login-Email der Plattform", placeholder: "mario@firma.at" },
  password: { label: "Passwort", hint: "Verschlüsselt gespeichert — nur Bot kann entschlüsseln" },
  totp_secret: { label: "TOTP-Secret (2FA)", hint: "Base32-Secret aus dem Authenticator-Setup (QR-Code → 'Schlüssel manuell eingeben')", placeholder: "JBSWY3DPEHPK3PXP" },
  storage_state: { label: "Storage-State JSON", hint: "Komplettes Playwright-State-File aus dem Login-Helper", multiline: true },
  api_token: { label: "API-Token", hint: "Bearer-Token für REST-API-Connectors" },
  magic_link_email: { label: "Magic-Link-Email", hint: "Optional, default: rechnung@mynlp.at — wo die Login-Mail ankommt", placeholder: "rechnung@mynlp.at" },
};

function CredentialsModal({ source, onClose, onSaved }: { source: Source; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<CredentialKind>("username");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const hint = CRED_HINTS[kind];

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`${API}/sources/${source.id}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      const j = await safeJson(res);
      if (!j.ok) {
        setErr(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setMsg(`✓ ${kind} verschlüsselt gespeichert`);
      setValue("");
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Credentials: ${source.name}`} onClose={onClose}>
      <div className="text-xs text-[color:var(--muted)] mb-2">
        Werte werden AES-GCM-verschlüsselt im Bot abgelegt. Klartext verlässt deinen Browser einmal — danach nie mehr lesbar.
        <br />
        Bereits gesetzt: <strong>{source.credential_kinds.join(", ") || "keine"}</strong>
      </div>
      <Field label="Typ" hint="Auswahl für Auto-Login">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as CredentialKind)}
          className="w-full border border-[color:var(--border)] rounded px-2 py-1.5"
        >
          <option value="username">Email / Benutzername</option>
          <option value="password">Passwort</option>
          <option value="totp_secret">TOTP-Secret (2FA)</option>
          <option value="storage_state">Storage-State (Login-Capture)</option>
          <option value="api_token">API-Token</option>
          <option value="magic_link_email">Magic-Link-Email</option>
        </select>
      </Field>
      <Field label={hint.label} hint={hint.hint}>
        {hint.multiline ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border border-[color:var(--border)] rounded px-2 py-1.5 font-mono text-xs"
            rows={6}
            placeholder={hint.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <input
            type={kind === "username" || kind === "magic_link_email" ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hint.placeholder}
            className="w-full border border-[color:var(--border)] rounded px-2 py-1.5 font-mono"
            autoComplete="new-password"
          />
        )}
      </Field>
      {err && <div className="text-red-700 text-xs">{err}</div>}
      {msg && <div className="text-emerald-700 text-xs">{msg}</div>}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded border border-[color:var(--border)] text-sm">Schließen</button>
        <button type="button" onClick={save} disabled={busy || !value} className="px-3 py-1.5 rounded bg-[color:var(--brand-orange)] text-white text-sm font-medium disabled:opacity-50">
          {busy ? "Speichert…" : "Speichern"}
        </button>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className={`bg-white rounded-lg shadow-xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} p-5 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-3">{title}</h2>
        <div className="space-y-3 text-sm">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium mb-0.5">{label}</div>
      {hint && <div className="text-[10px] text-[color:var(--muted)] mb-1">{hint}</div>}
      {children}
    </div>
  );
}
