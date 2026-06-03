"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

interface SiteHeaderProps {
  email: string | null;
  isAdmin: boolean;
  isSetter: boolean;
  isAccounting: boolean;
  isCustomerHappiness: boolean;
  isSeminarmanagement: boolean;
  isAuthed: boolean;
  canUseRechnungsBot: boolean;
  canSeeCustomerHappiness: boolean;
  canSeeSeminarmanagement: boolean;
  signOutAction: () => Promise<void>;
}

type Section = "sales" | "accounting" | "happiness" | "seminar";

interface NavItem {
  href: string;
  label: string;
  show: boolean;
}

interface SectionDef {
  key: Section;
  label: string;
  show: boolean;
  items: NavItem[];
}

const LS_KEY = "aazb-active-section";

export function SiteHeader({
  email,
  isAdmin,
  isSetter,
  isAccounting,
  isCustomerHappiness,
  isSeminarmanagement,
  isAuthed,
  canUseRechnungsBot,
  canSeeCustomerHappiness,
  canSeeSeminarmanagement,
  signOutAction,
}: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Rollen-Logik:
  //   Sales:      alle ausser pure Accounting + pure Customer-Happiness
  //               (Admin sieht alles).
  //   Accounting: Accounting-Rolle oder Admin.
  //   Customer Happiness: customer_happiness-Rolle oder Admin.
  const showSales =
    isAdmin ||
    (!isAccounting && !isCustomerHappiness && !isSeminarmanagement);
  const showAccounting = isAdmin || isAccounting;
  const showHappiness = canSeeCustomerHappiness;
  const showSeminar = canSeeSeminarmanagement;

  const sections: SectionDef[] = useMemo(
    () => [
      {
        key: "sales",
        label: "Sales",
        show: showSales,
        items: [
          { href: "/", label: "Dashboard", show: showSales },
          { href: "/daten", label: "Daten", show: showSales },
          { href: "/rechner", label: "Rechner", show: showSales },
          {
            href: "/notiz",
            label: "Angebots-Notiz",
            show: showSales && canUseRechnungsBot,
          },
          {
            href: "/setter",
            label: "Setter",
            show: showSales && (isSetter || isAdmin),
          },
          { href: "/ziele", label: "Ziele", show: isAdmin },
          { href: "/gesamt-cashflow", label: "Gesamt", show: isAdmin },
        ],
      },
      {
        key: "accounting",
        label: "Accounting",
        show: showAccounting,
        items: [
          { href: "/daten", label: "Daten", show: showAccounting },
          { href: "/zahlungen", label: "Zahlungen", show: showAccounting },
          {
            href: "/notiz",
            label: "Angebots-Notiz",
            show: showAccounting && canUseRechnungsBot,
          },
        ],
      },
      {
        key: "happiness",
        label: "Customer Happiness",
        show: showHappiness,
        items: [
          {
            href: "/teilnehmer-management",
            label: "Teilnehmer-Management",
            show: showHappiness,
          },
        ],
      },
      {
        key: "seminar",
        label: "Seminarmanagement",
        show: showSeminar,
        items: [
          {
            href: "/seminarmanagement",
            label: "Seminarvorbereitung",
            show: showSeminar,
          },
        ],
      },
    ],
    [
      showSales, showAccounting, showHappiness, showSeminar,
      isAdmin, isSetter, canUseRechnungsBot,
    ],
  );

  // Aktive Sektion herleiten:
  //   1. localStorage (User-Wahl) wenn dort gespeicherte Sektion
  //      einen Item-Href hat, der zum aktuellen Pfad passt
  //   2. Pfad-Match (erste Sektion deren Item zum Pfad passt)
  //   3. Erste sichtbare Sektion
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  useEffect(() => {
    if (!isAuthed) return;
    const visibleSecs = sections.filter((s) => s.show);
    if (visibleSecs.length === 0) return;
    // Sektion bestimmen
    const stored =
      typeof window !== "undefined"
        ? (localStorage.getItem(LS_KEY) as Section | null)
        : null;
    const matchedSec = stored
      ? visibleSecs.find(
          (s) =>
            s.key === stored && s.items.some((it) => it.href === pathname),
        )
      : null;
    if (matchedSec) {
      setActiveSection(matchedSec.key);
      return;
    }
    // Pfad-Match
    const pathMatch = visibleSecs.find((s) =>
      s.items.some((it) => it.show && it.href === pathname),
    );
    if (pathMatch) {
      setActiveSection(pathMatch.key);
      return;
    }
    // Fallback: gespeichert + show, sonst erste sichtbare
    if (stored && visibleSecs.some((s) => s.key === stored)) {
      setActiveSection(stored);
    } else {
      setActiveSection(visibleSecs[0].key);
    }
  }, [pathname, sections, isAuthed]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const setSection = (k: Section) => {
    setActiveSection(k);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, k);
    }
  };

  const activeDef = sections.find((s) => s.key === activeSection);
  const subItems = (activeDef?.items ?? []).filter((it) => it.show);

  return (
    <header className="bg-[color:var(--brand-yellow)] border-b border-[color:var(--brand-orange)]/30">
      {/* Top-Leiste: Logo + Bereiche + User */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold text-base sm:text-lg min-w-0"
        >
          <Image
            src="/aazb-logo.jpg"
            alt="AAZB"
            width={32}
            height={32}
            priority
            className="rounded shrink-0"
          />
          <span className="text-[color:var(--foreground)] truncate">
            Closing Dashboard
          </span>
        </Link>

        {isAuthed ? (
          <>
            {/* Bereich-Tabs */}
            <nav className="hidden md:flex gap-1 text-sm flex-1 ml-4 justify-center">
              {sections
                .filter((s) => s.show)
                .map((s) => {
                  const isActive = activeSection === s.key;
                  // Wenn user den Bereich klickt: navigiere zum ersten
                  // sichtbaren Item der Sektion + speichere Section-Wahl.
                  const firstHref =
                    s.items.find((it) => it.show)?.href ?? "/";
                  return (
                    <Link
                      key={s.key}
                      href={firstHref}
                      onClick={() => setSection(s.key)}
                      className={
                        "px-3 py-1.5 rounded-md transition-colors font-semibold " +
                        (isActive
                          ? "bg-[color:var(--brand-orange)] text-white"
                          : "text-[color:var(--foreground)] hover:bg-[color:var(--brand-orange)]/30")
                      }
                    >
                      {s.label}
                    </Link>
                  );
                })}
            </nav>
            <div className="hidden md:flex items-center gap-3 text-xs text-[color:var(--foreground)]/70">
              {isAdmin ? (
                <Link
                  href="/admin"
                  className={
                    "px-3 py-1.5 rounded-md text-sm font-semibold transition-colors " +
                    (pathname.startsWith("/admin")
                      ? "bg-[color:var(--brand-orange)] text-white"
                      : "text-[color:var(--foreground)] hover:bg-[color:var(--brand-orange)]/30")
                  }
                >
                  Admin
                </Link>
              ) : null}
              {email ? (
                <span className="truncate max-w-[200px]">{email}</span>
              ) : null}
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

      {/* Sub-Leiste: Items des aktiven Bereichs (Desktop) */}
      {isAuthed && subItems.length > 0 ? (
        <div className="hidden md:block border-t border-[color:var(--brand-orange)]/30 bg-[color:var(--brand-yellow)]/70">
          <nav className="max-w-[1400px] mx-auto px-4 sm:px-6 h-10 flex items-center gap-1 text-sm overflow-x-auto">
            {subItems.map((it) => (
              <SubNavLink
                key={it.href + it.label}
                href={it.href}
                active={pathname === it.href}
              >
                {it.label}
              </SubNavLink>
            ))}
          </nav>
        </div>
      ) : null}

      {/* Mobile: aufgeklapptes Vollmenue */}
      {isAuthed && open ? (
        <div className="md:hidden border-t border-[color:var(--brand-orange)]/30 bg-[color:var(--brand-yellow)]">
          <nav className="max-w-[1400px] mx-auto px-4 py-3 flex flex-col gap-3 text-sm">
            {sections
              .filter((s) => s.show)
              .map((s) => (
                <div key={s.key}>
                  <div className="text-[10px] uppercase font-bold text-[color:var(--foreground)]/60 px-1 mb-1">
                    {s.label}
                  </div>
                  <div className="flex flex-col gap-1">
                    {s.items
                      .filter((it) => it.show)
                      .map((it) => (
                        <MobileNavLink
                          key={s.key + it.href + it.label}
                          href={it.href}
                          active={pathname === it.href}
                          onClick={() => setSection(s.key)}
                        >
                          {it.label}
                        </MobileNavLink>
                      ))}
                  </div>
                </div>
              ))}
            {isAdmin ? (
              <div>
                <div className="text-[10px] uppercase font-bold text-[color:var(--foreground)]/60 px-1 mb-1">
                  Verwaltung
                </div>
                <MobileNavLink
                  href="/admin"
                  active={pathname.startsWith("/admin")}
                >
                  Admin
                </MobileNavLink>
              </div>
            ) : null}
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

function SubNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "px-3 py-1.5 rounded-md transition-colors whitespace-nowrap " +
        (active
          ? "bg-[color:var(--brand-orange)] text-white font-semibold"
          : "text-[color:var(--foreground)] hover:bg-[color:var(--brand-orange)]/30")
      }
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={
        "px-3 py-2 rounded-md transition-colors " +
        (active
          ? "bg-[color:var(--brand-orange)] text-white font-semibold"
          : "text-[color:var(--foreground)] hover:bg-[color:var(--brand-orange)]/30")
      }
    >
      {children}
    </Link>
  );
}
