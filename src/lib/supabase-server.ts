import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import WS from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WS }).WebSocket = WS;
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Cookie-aware Supabase client for server components / server actions.
 * Reflects the current logged-in user. Use this — NOT supabaseAdmin — when
 * the action should be scoped to the user (or for reading the session).
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component — Next.js disallows mutating cookies
          // there. Middleware handles refresh, so this is safe to ignore.
        }
      },
    },
  });
}

export async function getSessionUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}
