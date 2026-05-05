import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { getSessionContext } from "@/lib/supabase-server";
import { signOut } from "@/lib/auth-actions";

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
      <body className="min-h-full flex flex-col bg-[color:var(--surface)]">
        <header className="bg-[color:var(--brand-yellow)] border-b border-[color:var(--brand-orange)]/30">
          <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2.5 font-semibold text-lg">
                <Image
                  src="/aazb-logo.jpg"
                  alt="AAZB"
                  width={32}
                  height={32}
                  priority
                  className="rounded"
                />
                <span className="text-[color:var(--foreground)]">Closing Dashboard</span>
              </Link>
              {ctx ? (
                <nav className="flex gap-1 text-sm">
                  <NavLink href="/">Dashboard</NavLink>
                  <NavLink href="/daten">Daten</NavLink>
                  <NavLink href="/rechner">Rechner</NavLink>
                  {ctx.isAdmin ? <NavLink href="/ziele">Ziele</NavLink> : null}
                  {ctx.isAdmin ? <NavLink href="/admin">Admin</NavLink> : null}
                </nav>
              ) : null}
            </div>
            {ctx ? (
              <div className="flex items-center gap-3 text-xs text-[color:var(--foreground)]/70">
                <span>{ctx.user.email}</span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="px-2 py-1 rounded border border-[color:var(--foreground)]/20 hover:bg-[color:var(--brand-orange)]/30"
                  >
                    Logout
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </header>
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md hover:bg-[color:var(--brand-orange)]/30 transition-colors text-[color:var(--foreground)]"
    >
      {children}
    </Link>
  );
}
