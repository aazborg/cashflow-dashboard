import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node < 22 has no global WebSocket. Supabase-js spins up a realtime client
// even when we never use it, so polyfill before any client construction.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WS }).WebSocket = WS;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
}
if (!secret) {
  throw new Error("SUPABASE_SECRET_KEY is not set in .env.local");
}

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client. Uses the secret key and bypasses RLS — only
 * import this in server components, server actions, and API routes. Never
 * expose to the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!cached) {
    cached = createClient(url!, secret!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
