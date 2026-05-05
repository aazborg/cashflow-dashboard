import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AAZB Closing Dashboard",
  description: "Cashflow-Berechnung & Verkaufs-Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
              <nav className="flex gap-1 text-sm">
                <NavLink href="/">Dashboard</NavLink>
                <NavLink href="/daten">Daten</NavLink>
                <NavLink href="/rechner">Rechner</NavLink>
                <NavLink href="/ziele">Ziele</NavLink>
                <NavLink href="/admin">Admin</NavLink>
              </nav>
            </div>
            <div className="text-xs text-[color:var(--foreground)]/70">
              mario.grabner@mynlp.at
            </div>
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
