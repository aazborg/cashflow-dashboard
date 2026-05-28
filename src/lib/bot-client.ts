/**
 * Helper für client-side Calls an den Rechnungs-Bot-Proxy.
 *
 * Berücksichtigt den Next.js basePath ("/cashflow") aus next.config.ts.
 * Ohne den Prefix landen Client-Component-Fetches auf 404, weil
 * Vercel das Dashboard unter dashboard.aazb.org/cashflow/* ausliefert
 * (nicht unter dashboard.aazb.org/*).
 */

// Wenn du den basePath irgendwann änderst, hier mit-aktualisieren.
// (Wir können next.config.ts nicht direkt aus Client Components
// importieren — daher hardcoded.)
export const BASE_PATH = "/cashflow";

/** Konstruiert die volle Dashboard-Bot-URL aus einem Pfad-Fragment.
 *  Beispiel: botUrl("articles") -> "/cashflow/api/bot/articles" */
export function botUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return `${BASE_PATH}/api/bot/${clean}`;
}
