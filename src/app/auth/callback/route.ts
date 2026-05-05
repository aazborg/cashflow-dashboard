import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Magic-link callback. Supabase redirects here with `?code=...`
 * (PKCE flow used by signInWithOtp + emailRedirectTo).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message ?? "exchange_failed")}`, url.origin),
    );
  }

  // Defense in depth: only employees may stay logged in.
  const email = data.user.email?.toLowerCase();
  if (email) {
    const { data: emp } = await supabaseAdmin()
      .from("employees")
      .select("active")
      .ilike("email", email)
      .maybeSingle();
    if (!emp || !emp.active) {
      await sb.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=not_authorized", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
