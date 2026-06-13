"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; primary?: boolean };

const ITEMS: Item[] = [
  { href: "/buchhaltung/schnell-upload", label: "Schnell-Upload", primary: true },
  { href: "/buchhaltung", label: "Übersicht" },
  { href: "/buchhaltung/zu-bezahlen", label: "💸 Zu bezahlen" },
  { href: "/buchhaltung/posteingang", label: "Posteingang" },
  { href: "/buchhaltung/rechnungen", label: "Rechnungen" },
  { href: "/buchhaltung/kontoauszuege", label: "Kontoauszüge" },
  { href: "/buchhaltung/monatsabschluss", label: "Monatsabschluss" },
  { href: "/buchhaltung/quellen", label: "Rechnungs-Quellen" },
];

export default function BuchhaltungSidebar() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="space-y-1">
      <div className="px-3 py-2 mb-2">
        <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
          Buchhaltung
        </div>
      </div>
      {ITEMS.map((it) => {
        const active =
          it.href === "/buchhaltung"
            ? pathname === "/buchhaltung" || pathname === "/buchhaltung/"
            : pathname.startsWith(it.href);
        if (it.primary) {
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                "block px-4 py-2 rounded-md text-sm font-medium transition " +
                (active
                  ? "bg-[color:var(--brand-orange)] text-white"
                  : "bg-[color:var(--brand-orange)] text-white hover:opacity-90")
              }
            >
              <span className="inline-flex items-center gap-2">
                <span className="text-base leading-none">＋</span>
                {it.label}
              </span>
            </Link>
          );
        }
        return (
          <Link
            key={it.href}
            href={it.href}
            className={
              "block px-4 py-2 rounded-md text-sm transition " +
              (active
                ? "bg-[color:var(--surface)] text-[color:var(--foreground)] font-medium"
                : "text-[color:var(--muted)] hover:bg-[color:var(--surface)] hover:text-[color:var(--foreground)]")
            }
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
