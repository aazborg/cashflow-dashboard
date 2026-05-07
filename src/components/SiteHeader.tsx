"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface SiteHeaderProps {
  email: string | null;
  isAdmin: boolean;
  isSetter: boolean;
  isAuthed: boolean;
  signOutAction: () => Promise<void>;
}

export function SiteHeader({
  email,
  isAdmin,
  isSetter,
  isAuthed,
  signOutAction,
}: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="bg-[color:var(--brand-yellow)] border-b border-[color:var(--brand-orange)]/30">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-base sm:text-lg min-w-0">
          <Image
            src="/aazb-logo.jpg"
            alt="AAZB"
            width={32}
            height={32}
            priority
            className="rounded shrink-0"
          />
          <span className="text-[color:var(--foreground)] truncate">Closing Dashboard</span>
        </Link>

        {isAuthed ? (
          <>
            <nav className="hidden md:flex gap-1 text-sm flex-1 ml-4">
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/daten">Daten</NavLink>
              <NavLink href="/rechner">Rechner</NavLink>
              {isSetter || isAdmin ? <NavLink href="/setter">Setter</NavLink> : null}
              {isAdmin ? <NavLink href="/ziele">Ziele</NavLink> : null}
              {isAdmin ? <NavLink href="/admin">Admin</NavLink> : null}
            </nav>
            <div className="hidden md:flex items-center gap-3 text-xs text-[color:var(--foreground)]/70">
              {email ? <span className="truncate max-w-[200px]">{email}</span> : null}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="px-2 py-1 rounded border border-[color:var(--foreground)]/20 hover:bg-[color:var(--brand-orange)]/30"
                >
                  Logout
                </button>
              </form>
            </div>
            <button
              type="button"
              aria-label="Menü"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md border border-[color:var(--foreground)]/20 hover:bg-[color:var(--brand-orange)]/30"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {open ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </>
        ) : null}
      </div>

      {isAuthed && open ? (
        <div className="md:hidden border-t border-[color:var(--brand-orange)]/30 bg-[color:var(--brand-yellow)]">
          <nav className="max-w-[1400px] mx-auto px-4 py-3 flex flex-col gap-1 text-sm">
            <MobileNavLink href="/">Dashboard</MobileNavLink>
            <MobileNavLink href="/daten">Daten</MobileNavLink>
            <MobileNavLink href="/rechner">Rechner</MobileNavLink>
            {isSetter || isAdmin ? <MobileNavLink href="/setter">Setter</MobileNavLink> : null}
            {isAdmin ? <MobileNavLink href="/ziele">Ziele</MobileNavLink> : null}
            {isAdmin ? <MobileNavLink href="/admin">Admin</MobileNavLink> : null}
            <div className="mt-2 pt-3 border-t border-[color:var(--foreground)]/10 flex items-center justify-between gap-3 text-xs text-[color:var(--foreground)]/70">
              {email ? <span className="truncate">{email}</span> : <span />}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded border border-[color:var(--foreground)]/20 hover:bg-[color:var(--brand-orange)]/30"
                >
                  Logout
                </button>
              </form>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
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

function MobileNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md hover:bg-[color:var(--brand-orange)]/30 transition-colors text-[color:var(--foreground)]"
    >
      {children}
    </Link>
  );
}
