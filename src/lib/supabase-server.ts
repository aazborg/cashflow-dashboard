import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import WS from "ws";
import { supabaseAdmin } from "./supabase";
import type { Employee } from "./types";

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

export interface SessionContext {
  user: { id: string; email: string };
  employee: Employee;
  isAdmin: boolean;
  /** ID used to match the employee against `deals.mitarbeiter_id` and
   * `monthly_snapshots.mitarbeiter_id`. Falls back to the employee row id when
   * no HubSpot owner is set. */
  ownerId: string;
}

/**
 * Resolve the logged-in user to their employees row + role. Returns null when
 * no session exists, the email is not invited, or the account is inactive.
 * Use this in page/action code to scope queries and gate admin-only flows.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const user = await getSessionUser();
  if (!user?.email) return null;
  const { data } = await supabaseAdmin()
    .from("employees")
    .select("*")
    .ilike("email", user.email)
    .maybeSingle();
  if (!data || data.active === false) return null;
  const emp = data as Employee;
  return {
    user: { id: user.id, email: user.email },
    employee: emp,
    isAdmin: emp.role === "admin",
    ownerId: emp.hubspot_owner_id ?? emp.id,
  };
}
