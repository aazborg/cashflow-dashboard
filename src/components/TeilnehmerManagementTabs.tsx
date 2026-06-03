"use client";

import { useState } from "react";
import ContactSearch from "./ContactSearch";
import UmbuchungenList from "./UmbuchungenList";
import ZertifikateList from "./ZertifikateList";

type Tab = "teilnehmer" | "umbuchungen" | "zertifikate";

export default function TeilnehmerManagementTabs() {
  const [tab, setTab] = useState<Tab>("teilnehmer");
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-[color:var(--border)]">
        <TabButton active={tab === "teilnehmer"} onClick={() => setTab("teilnehmer")}>
          Teilnehmer
        </TabButton>
        <TabButton
          active={tab === "umbuchungen"}
          onClick={() => setTab("umbuchungen")}
        >
          Umbuchungen
        </TabButton>
        <TabButton
          active={tab === "zertifikate"}
          onClick={() => setTab("zertifikate")}
        >
          Zertifikate
        </TabButton>
      </nav>
      {tab === "teilnehmer" ? (
        <ContactSearch />
      ) : tab === "umbuchungen" ? (
        <UmbuchungenList />
      ) : (
        <ZertifikateList />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px " +
        (active
          ? "border-[color:var(--brand-orange)] text-[color:var(--foreground)]"
          : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
      }
    >
      {children}
    </button>
  );
}
