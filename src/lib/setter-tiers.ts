import type { SetterHours } from "./types";

export interface SetterTier {
  /** Anzahl erschienener Termine, ab der dieser Tier greift. */
  from: number;
  /** Provision pro erschienenem Beratungsgespräch (€). */
  perBg: number;
  /** Status-Bezeichnung mit Emoji. */
  label: string;
}

export interface SetterTariff {
  hours: SetterHours;
  fixum: number;
  /** Schwelle, ab der die Cold Zone verlassen wird (= erste Tier-from). */
  coldZoneUpTo: number;
  tiers: SetterTier[];
}

/**
 * Default-Tariftabellen aus „Setter-Provisionstabelle.xlsx".
 * Können später (Iteration 2) pro Setter im Admin überschrieben werden.
 */
export const SETTER_TARIFFS: Record<SetterHours, SetterTariff> = {
  "20h": {
    hours: "20h",
    fixum: 900,
    coldZoneUpTo: 24,
    tiers: [
      { from: 25, perBg: 15.0, label: "⚡ Active Performer" },
      { from: 38, perBg: 22.5, label: "🔥 High Performer" },
      { from: 50, perBg: 32.5, label: "🏆 Elite Performer" },
      { from: 60, perBg: 45.0, label: "💎 Master Performer" },
      { from: 70, perBg: 53.0, label: "⭐ Grandmaster" },
      { from: 80, perBg: 55.0, label: "🚀 Ultimate Legend" },
    ],
  },
  "25h": {
    hours: "25h",
    fixum: 1125,
    coldZoneUpTo: 34,
    tiers: [
      { from: 35, perBg: 15.0, label: "⚡ Active Performer" },
      { from: 47, perBg: 29.25, label: "🔥 High Performer" },
      { from: 60, perBg: 39.25, label: "🏆 Elite Performer" },
      { from: 75, perBg: 50.0, label: "💎 Master Performer" },
      { from: 85, perBg: 55.0, label: "⭐ Grandmaster" },
      { from: 100, perBg: 60.0, label: "🚀 Ultimate Legend" },
    ],
  },
  "30h": {
    hours: "30h",
    fixum: 1350,
    coldZoneUpTo: 44,
    tiers: [
      { from: 45, perBg: 15.0, label: "⚡ Active Performer" },
      { from: 56, perBg: 38.4, label: "🔥 High Performer" },
      { from: 70, perBg: 48.4, label: "🏆 Elite Performer" },
      { from: 85, perBg: 55.0, label: "💎 Master Performer" },
      { from: 100, perBg: 60.0, label: "⭐ Grandmaster" },
      { from: 120, perBg: 65.0, label: "🚀 Ultimate Legend" },
    ],
  },
  "35h": {
    hours: "35h",
    fixum: 1575,
    coldZoneUpTo: 54,
    tiers: [
      { from: 55, perBg: 15.0, label: "⚡ Active Performer" },
      { from: 65, perBg: 38.85, label: "🔥 High Performer" },
      { from: 80, perBg: 48.85, label: "🏆 Elite Performer" },
      { from: 100, perBg: 58.0, label: "💎 Master Performer" },
      { from: 120, perBg: 63.0, label: "⭐ Grandmaster" },
      { from: 140, perBg: 68.0, label: "🚀 Ultimate Legend" },
    ],
  },
  "40h": {
    hours: "40h",
    fixum: 1800,
    coldZoneUpTo: 64,
    tiers: [
      { from: 65, perBg: 15.0, label: "⚡ Active Performer" },
      { from: 74, perBg: 40.85, label: "🔥 High Performer" },
      { from: 90, perBg: 50.85, label: "🏆 Elite Performer" },
      { from: 110, perBg: 60.0, label: "💎 Master Performer" },
      { from: 130, perBg: 65.0, label: "⭐ Grandmaster" },
      { from: 160, perBg: 70.0, label: "🚀 Ultimate Legend" },
    ],
  },
};

export interface SetterCalc {
  bgs: number;
  fixum: number;
  perBg: number;
  variableEur: number;
  bruttogehalt: number;
  /** Aktiver Tier oder null (Cold Zone). */
  activeTier: SetterTier | null;
}

export function calcSetterPayout(
  tariff: SetterTariff,
  bgs: number,
): SetterCalc {
  const sortedDesc = [...tariff.tiers].sort((a, b) => b.from - a.from);
  const activeTier = sortedDesc.find((t) => bgs >= t.from) ?? null;
  const perBg = activeTier?.perBg ?? 0;
  const variableEur = perBg * bgs;
  return {
    bgs,
    fixum: tariff.fixum,
    perBg,
    variableEur,
    bruttogehalt: tariff.fixum + variableEur,
    activeTier,
  };
}
