"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "./supabase-server";
import { supabaseAdmin } from "./supabase";

export interface MagicLinkResult {
  ok: boolean;
  message: string;
}

export async function sendMagicLink(formData: FormData): Promise<MagicLinkResult> {
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return { ok: false, message: "Bitte eine gültige E-Mail-Adresse eingeben." };
  }

  // Only allow login for emails that are invited as employees.
  const { data: emp } = await supabaseAdmin()
    .from("employees")
    .select("email, active")
    .ilike("email", emailRaw)
    .maybeSingle();

  if (!emp) {
    return {
      ok: false,
      message: "Diese E-Mail ist nicht zum Login berechtigt. Bitte beim Admin melden.",
    };
  }
  if (!emp.active) {
    return { ok: false, message: "Dein Zugang wurde deaktiviert." };
  }

  const sb = await supabaseServer();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3737";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/cashflow";

  const { error } = await sb.auth.signInWithOtp({
    email: emailRaw,
    options: {
      emailRedirectTo: `${origin}${basePath}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, message: `Fehler beim Senden: ${error.message}` };
  }

  return {
    ok: true,
    message: "Check dein Postfach — wir haben dir einen Login-Link geschickt.",
  };
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
