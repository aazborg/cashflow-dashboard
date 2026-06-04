"use client";
import { useState } from "react";
import SeminarvorbereitungClient from "@/components/SeminarvorbereitungClient";
import KalenderHistorieClient from "@/components/KalenderHistorieClient";

type Tab = "vorbereitung" | "historie";

export default function SeminarmanagementTabs() {
  const [tab, setTab] = useState<Tab>("vorbereitung");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-[color:var(--card-border)]">
        <TabButton
          active={tab === "vorbereitung"}
          onClick={() => setTab("vorbereitung")}
          label="Seminarvorbereitung"
        />
        <TabButton
          active={tab === "historie"}
          onClick={() => setTab("historie")}
          label="Kalender-Historie"
        />
      </div>
      {tab === "vorbereitung" ? (
        <SeminarvorbereitungClient />
      ) : (
        <KalenderHistorieClient />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition " +
        (active
          ? "border-[color:var(--foreground)] text-[color:var(--foreground)]"
          : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]")
      }
    >
      {label}
    </button>
  );
}
