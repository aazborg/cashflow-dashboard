import type { Metadata } from "next";
import "./globals.css";
import { getSessionContext } from "@/lib/supabase-server";
import { signOut } from "@/lib/auth-actions";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "AAZB Closing Dashboard",
  description: "Cashflow-Berechnung & Verkaufs-Dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getSessionContext();
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[color:var(--surface)] overflow-x-hidden">
        <SiteHeader
          isAuthed={!!ctx}
          email={ctx?.user.email ?? null}
          isAdmin={!!ctx?.isAdmin}
          signOutAction={signOut}
        />
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
