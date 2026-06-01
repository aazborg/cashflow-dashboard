/**
 * Tabelle aller GoCardless-Payments (Kunden-uebergreifend) fuer den
 * 'Alle Zahlungen'-Tab in /zahlungen.
 *
 * Fetcht /api/bot/gocardless/all-payments im open-state.
 * - Default-Sortierung: charge_date DESC (neueste zuerst)
 * - Filter: Suche (Name/Email/Beschreibung), Status, Datumsbereich
 */
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import PaymentDetailModal from "@/components/PaymentDetailModal";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import NoteCell from "@/components/NoteCell";
import type { Deal } from "@/lib/types";

interface ApiPayment {
  id: string;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  charge_date: string | null;
  description: string | null;
  reference: string | null;
  created_at: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  mitarbeiter: string | null;
  deal_id: string | null;
  mandate_id: string | null;
  subscription_id: string | null;
  instalment_schedule_id: string | null;
  done_at?: string | null;
  done_by_email?: string | null;
  note?: string | null;
  /** Per-Payment Mahn-Status. Wenn null und die zugehoerige
   *  Deal-Zeile dunning_status hat, faellt das UI auf den Deal-Wert
   *  zurueck (Default-Annahme). Set durch /api/resolutions. */
  dunning_status?:
    | "mahnung_1"
    | "mahnung_2"
    | "inkasso"
    | "resolved"
    | null;
  customer_has_active_mandate?: boolean;
  customer_flag?: string | null;
  customer_flag_reason?: string | null;
}

type StatusFilter =
  | "all"
  | "confirmed"
  | "pending"
  | "failed"
  | "cancelled"
  | "chargeback"
  | "scheduled";

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "name_asc";

interface Props {
  /** Optionaler Vorfilter -- z.B. fuer den 'Rueckbelastungen'-Tab.
   *  Wenn gesetzt, wird der Status-Dropdown ausgeblendet. */
  defaultStatus?: StatusFilter;
  emptyMessage?: string;
  /** Deals fuer Row-Click -> Mahnungs-Modal. Optional: wenn nicht
   *  uebergeben, sind Zeilen nicht klickbar. */
  deals?: Deal[];
  /** Wer darf das Mahnungs-Modal aktiv nutzen (Buttons sichtbar)? */
  canManageDunning?: boolean;
  /** Nach Kunde gruppieren (Kunden-Zeilen mit Aufklapp-Pfeil).
   *  Genutzt im 'Stornierte Zahlungen'-Tab fuer Uebersicht. */
  groupByCustomer?: boolean;
  /** Callback wenn der User pro Zeile dunning_status setzt.
   *  Parent (ZahlungenTabs) haelt einen Override-Map damit der
   *  geaenderte Status tab-uebergreifend persistiert (z.B. landet
   *  ein 'inkasso'-Eintrag sofort im Inkasso-Tab). */
  onDealUpdate?: (
    dealId: string,
    patch: {
      dunning_status?:
        | "mahnung_1"
        | "mahnung_2"
        | "inkasso"
        | "resolved"
        | null;
    },
  ) => void;
}

const eur = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("de-AT", {
    style: "currency",
    currency: "EUR",
  });

const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("de-AT") : "—";

function statusGroup(status: string | null): "confirmed" | "pending" | "failed" | "cancelled" | "chargeback" | "scheduled" | "other" {
  const s = status ?? "";
  if (s === "confirmed" || s === "paid_out") return "confirmed";
  if (
    s === "pending_submission" ||
    s === "submitted" ||
    s === "pending_customer_approval"
  )
    return "pending";
  if (s === "charged_back") return "chargeback";
  if (s === "cancelled" || s === "customer_approval_denied") return "cancelled";
  if (s === "failed") return "failed";
  if (s === "scheduled") return "scheduled";
  return "other";
}

function dunningBadge(
  s: "mahnung_1" | "mahnung_2" | "inkasso" | "resolved" | null | undefined,
): { cls: string; label: string } | null {
  if (!s) return null;
  if (s === "mahnung_1") {
    return {
      cls: "bg-amber-100 text-amber-900 border-amber-300",
      label: "1. Mahnung",
    };
  }
  if (s === "mahnung_2") {
    return {
      cls: "bg-orange-100 text-orange-900 border-orange-300",
      label: "2. Mahnung",
    };
  }
  if (s === "inkasso") {
    return {
      cls: "bg-red-100 text-red-900 border-red-300",
      label: "Inkasso",
    };
  }
  if (s === "resolved") {
    return {
      cls: "bg-green-100 text-green-900 border-green-300",
      label: "Erledigt",
    };
  }
  return null;
}

function statusBadge(status: string | null): { cls: string; label: string } {
  const g = statusGroup(status);
  if (g === "confirmed") {
    return {
      cls: "bg-green-100 text-green-900 border-green-300",
      label: "✓ " + (status ?? ""),
    };
  }
  if (g === "pending") {
    return {
      cls: "bg-amber-100 text-amber-900 border-amber-300",
      label: "⏳ " + (status ?? ""),
    };
  }
  if (g === "failed") {
    return {
      cls: "bg-red-100 text-red-900 border-red-300",
      label: "✗ " + (status ?? ""),
    };
  }
  if (g === "cancelled") {
    return {
      cls: "bg-slate-200 text-slate-700 border-slate-300",
      label: "⊘ " + (status ?? ""),
    };
  }
  if (g === "chargeback") {
    return {
      cls: "bg-orange-100 text-orange-900 border-orange-300",
      label: "↩ " + (status ?? ""),
    };
  }
  return {
    cls: "bg-gray-100 text-gray-700 border-gray-300",
    label: status ?? "—",
  };
}

export default function AllPaymentsTable({
  defaultStatus = "all",
  emptyMessage = "Keine Zahlungen passen zu den Filtern.",
  deals,
  canManageDunning = false,
  groupByCustomer = false,
  onDealUpdate,
}: Props = {}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [env, setEnv] = useState<string>("");

  const [search, setSearch] = useState("");
  // Status-Filter ist jetzt Multi-Select. Wenn defaultStatus !== 'all'
  // (z.B. Failed-/Storno-Tab), wird initial nur dieser Wert vor-
  // selektiert und der Filter unten ausgeblendet -- Tab ist
  // ein impliziter Status-Vorfilter.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    defaultStatus === "all" ? new Set() : new Set([defaultStatus]),
  );
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const hideStatusFilter = defaultStatus !== "all";
  // Default an im 'Fehlgeschlagen'-Tab -- Mario will dort die echten
  // unbeglichenen Faelle sehen, nicht doppelte Retry-Eintraege.
  const [hideRecovered, setHideRecovered] = useState(
    defaultStatus === "failed",
  );
  // Mahn-Status-Spalte nur im Failed-Tab anzeigen (sonst zu voll).
  const showDunningCol = defaultStatus === "failed";

  // 'Mandat-Lage'-Spalte: zeigt Ampel pro Zeile, OB der Kunde aktuell
  // ueberhaupt Geld abgebucht bekommt. Sichtbar in Tabs wo es
  // typischerweise um inaktive Kunden geht: Storniert, Rueckbelastet.
  // (Failed-Tab hat Mahn-Status, da macht Doppelung wenig Sinn.)
  const showCustomerStatusCol =
    defaultStatus === "cancelled" || defaultStatus === "chargeback";
  // Lokaler Override pro customer_id fuer Optimistic UI.
  // Wert = aktuelle reason ('vertragsende'/'ueberwiesen'/'inkasso')
  // oder null wenn keine Markierung.
  type CustomerFlagValue =
    | { status: "storniert"; reason: "vertragsende" | "ueberwiesen" | "inkasso" }
    | null;
  const [localCustomerFlags, setLocalCustomerFlags] = useState<
    Map<string, CustomerFlagValue>
  >(new Map());
  function effectiveCustomerFlag(p: ApiPayment): CustomerFlagValue {
    if (!p.customer_id) return null;
    const local = localCustomerFlags.get(p.customer_id);
    if (local !== undefined) return local;
    if (
      p.customer_flag === "storniert" &&
      (p.customer_flag_reason === "vertragsende" ||
        p.customer_flag_reason === "ueberwiesen" ||
        p.customer_flag_reason === "inkasso")
    ) {
      return {
        status: "storniert",
        reason: p.customer_flag_reason,
      };
    }
    return null;
  }
  async function setCustomerFlag(
    p: ApiPayment,
    reason: "vertragsende" | "ueberwiesen" | "inkasso" | null,
  ) {
    if (!p.customer_id) return;
    const prev = effectiveCustomerFlag(p);
    const cid = p.customer_id;
    const next: CustomerFlagValue = reason
      ? { status: "storniert", reason }
      : null;
    setLocalCustomerFlags((m) => {
      const n = new Map(m);
      n.set(cid, next);
      return n;
    });
    try {
      const res = await fetch("/cashflow/api/customer-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gc_customer_id: cid,
          status: reason ? "storniert" : null,
          reason,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Bei reason='inkasso': Backend hat schon die deals auf
      // dunning_status='inkasso' gepatcht. Wir aktualisieren das
      // Frontend-State via onDealUpdate, damit Tab-Wechsel sofort
      // den Kunden im Inkasso-Tab zeigt.
      if (reason === "inkasso" && onDealUpdate && p.deal_id) {
        onDealUpdate(p.deal_id, { dunning_status: "inkasso" });
      }
    } catch (e) {
      setLocalCustomerFlags((m) => {
        const n = new Map(m);
        n.set(cid, prev);
        return n;
      });
      alert(
        "Konnte Kunden-Status nicht speichern: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  // 'Erledigt'-Workflow: User kann pro Zeile abhaken.
  // Default-Anzeige (in allen relevanten Tabs failed/cancelled/
  // chargeback) blendet Erledigtes aus. Mit Checkbox einschaltbar.
  const showDoneFeature =
    defaultStatus === "failed" ||
    defaultStatus === "cancelled" ||
    defaultStatus === "chargeback";
  const [hideDone, setHideDone] = useState(showDoneFeature);
  // Lokale 'pending updates' fuer optimistic UI
  const [localResolutions, setLocalResolutions] = useState<
    Map<string, string | null>
  >(new Map());
  // Hilfsfunktion: wird ein Payment als erledigt betrachtet?
  function isPaymentDone(p: ApiPayment): boolean {
    const local = localResolutions.get(p.id);
    if (local !== undefined) return local !== null;
    return !!p.done_at;
  }
  async function toggleDone(p: ApiPayment) {
    const currentlyDone = isPaymentDone(p);
    const next = !currentlyDone;
    // Optimistic
    setLocalResolutions((prev) => {
      const n = new Map(prev);
      n.set(p.id, next ? new Date().toISOString() : null);
      return n;
    });
    try {
      const res = await fetch("/cashflow/api/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gc_id: p.id,
          kind: "payment",
          done: next,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Rollback
      setLocalResolutions((prev) => {
        const n = new Map(prev);
        n.set(p.id, currentlyDone ? new Date().toISOString() : null);
        return n;
      });
      alert(
        "Konnte nicht speichern: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
  // Im Failed-Tab default 'Kein Mahnschritt' -- Mario sieht so nur
  // die wirklich noch unbearbeiteten. Sobald er per Dropdown den
  // Status setzt, verschwindet die Zeile aus dieser Liste und
  // taucht im 'Mahnungen/Inkasso'-Tab auf (selbe deals-Prop,
  // gepatcht via onDealUpdate).
  // Mahn-Status-Filter: Multi-Select. 'none' bedeutet 'kein
  // Mahnschritt' (null), die anderen sind die echten Statuswerte.
  // Im Failed-Tab default 'none' (Mario sieht nur Unbearbeitete).
  const [dunningFilter, setDunningFilter] = useState<Set<string>>(
    defaultStatus === "failed" ? new Set(["none"]) : new Set(),
  );
  // Einzug-Filter (Mandat-Lage / Customer-Status). Nur in den
  // Tabs aktiv die showCustomerStatusCol haben (cancelled/chargeback).
  // Werte: aktiv / kein_mandat / vertragsende / ueberwiesen / inkasso
  const [einzugFilter, setEinzugFilter] = useState<Set<string>>(
    new Set(),
  );
  // Per-Payment Mahn-Status (statt pro Deal). Ein Kunde kann mehrere
  // failed Payments haben -- die werden einzeln getrackt:
  // eine kriegt 'mahnung_1', die andere bleibt offen, eine andere
  // 'resolved' (Kunde hat die EINE Rate nachgezahlt).
  type DunningVal =
    | "mahnung_1"
    | "mahnung_2"
    | "inkasso"
    | "resolved"
    | null;
  const [localPaymentDunning, setLocalPaymentDunning] = useState<
    Map<string, DunningVal>
  >(new Map());
  // Lokaler Notes-Override pro Payment-ID (Optimistic UI)
  const [localNotes, setLocalNotes] = useState<Map<string, string | null>>(
    new Map(),
  );
  function effectiveNote(p: ApiPayment): string | null {
    const local = localNotes.get(p.id);
    if (local !== undefined) return local;
    return p.note ?? null;
  }
  function effectivePaymentDunning(p: ApiPayment): DunningVal {
    // Reihenfolge der Quellen:
    //   1. Lokaler Override (User hat in dieser Session gewaehlt)
    //   2. Per-Payment-Wert aus gocardless_resolutions
    //   3. Fallback: Status auf dem verknuepften Deal -- damit
    //      Markierungen die vor Einfuehrung des Per-Payment-Features
    //      gesetzt wurden NICHT verschwinden. Sobald der User pro
    //      Payment explizit waehlt, gewinnt der Per-Payment-Wert.
    const local = localPaymentDunning.get(p.id);
    if (local !== undefined) return local;
    if (p.dunning_status !== null && p.dunning_status !== undefined) {
      return p.dunning_status;
    }
    if (p.deal_id) {
      const dealStatus = dealsById.get(p.deal_id)?.dunning_status;
      if (dealStatus) return dealStatus as DunningVal;
    }
    return null;
  }
  async function setPaymentDunning(p: ApiPayment, status: DunningVal) {
    const prev = effectivePaymentDunning(p);
    setLocalPaymentDunning((m) => {
      const n = new Map(m);
      n.set(p.id, status);
      return n;
    });
    try {
      const res = await fetch("/cashflow/api/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gc_id: p.id,
          kind: "payment",
          dunning_status: status,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Wenn status='inkasso': cascade auch auf Deal -> erscheint im
      // Inkasso-Tab (aggregierte Sicht). Deal-Status bleibt der
      // schwerste verfuegbare.
      if (status === "inkasso" && onDealUpdate && p.deal_id) {
        onDealUpdate(p.deal_id, { dunning_status: "inkasso" });
      }
    } catch (e) {
      setLocalPaymentDunning((m) => {
        const n = new Map(m);
        n.set(p.id, prev);
        return n;
      });
      alert(
        "Konnte Mahn-Status nicht speichern: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  // Mahnungs-Modal: deal_id aus Payment -> Deal aus uebergebener Liste
  const [detailDeal, setDetailDeal] = useState<Deal | null>(null);
  const dealsById = useMemo(() => {
    const m = new Map<string, Deal>();
    for (const d of deals ?? []) m.set(d.id, d);
    return m;
  }, [deals]);

  useEffect(() => {
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(
          "/cashflow/api/payments",
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const j = (await res.json()) as {
          env: string;
          count: number;
          payments: ApiPayment[];
        };
        setPayments(j.payments);
        setEnv(j.env);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // "Doch eingezogen" oder "Duplikate": 2 Faelle:
  //  (A) Failed-Payment + spaeter confirmed/paid_out fuer selben
  //      Kunden+Betrag innerhalb 14 Tagen (echter Retry-Erfolg).
  //  (B) Mehrere failed-Payments fuer selben Kunden+Betrag+
  //      Beschreibung -> GC-Retry-Welle (z.B. Rueckbuchungs-Gebuehr).
  //      Wir behalten nur den JUENGSTEN failed -- die aelteren sind
  //      Duplikate desselben offenen Postens.
  const recoveredFailedIds = useMemo(() => {
    const recovered = new Set<string>();
    const DAYS = 1000 * 60 * 60 * 24;
    // (A) Erfolgreiche Payments pro Kunde+Betrag indexieren
    const successByKey = new Map<string, ApiPayment[]>();
    for (const p of payments) {
      if (statusGroup(p.status) !== "confirmed") continue;
      const key = `${p.customer_id ?? p.mandate_id ?? "?"}|${p.amount_cents ?? 0}`;
      const arr = successByKey.get(key) ?? [];
      arr.push(p);
      successByKey.set(key, arr);
    }
    // (B) Failed-Cluster nach Kunde+Betrag+Beschreibungs-MUSTER gruppieren.
    // Wir strippen Payment-IDs / IDs aus der Beschreibung, damit
    // "Rueckbuchung zu PM01XHD7..." und "Rueckbuchung zu PM01XH5G9..."
    // (gleiche Art Gebuehr, anderer urspruenglicher Posten) als
    // EIN Cluster behandelt werden. Sonst sieht Mario fuer denselben
    // Kunden 3x ausgleich-Gebuehr 30 EUR untereinander -- de-facto
    // einer Inkasso-Bewegung mit 90 EUR Gesamtschuld.
    const normalizeDesc = (s: string | null | undefined): string => {
      const t = (s ?? "").trim();
      // GoCardless IDs (PM/SB/MD...) durch Platzhalter ersetzen
      return t.replace(/\b[A-Z]{2,3}\d{2,}[A-Z0-9]{6,}\b/g, "<id>");
    };
    const failedByCluster = new Map<string, ApiPayment[]>();
    for (const p of payments) {
      if (statusGroup(p.status) !== "failed") continue;
      const descKey = normalizeDesc(p.description);
      const clusterKey = `${p.customer_id ?? p.mandate_id ?? "?"}|${p.amount_cents ?? 0}|${descKey}`;
      const arr = failedByCluster.get(clusterKey) ?? [];
      arr.push(p);
      failedByCluster.set(clusterKey, arr);
    }
    // Map: winner-id -> {count, totalCents} fuer "+ N weitere"-Badge
    const winnerInfo = new Map<string, { count: number; totalCents: number }>();
    // Innerhalb jedes Failed-Clusters: nur der mit dem juengsten
    // charge_date bleibt, der Rest wird ausgeblendet
    for (const cluster of failedByCluster.values()) {
      if (cluster.length < 2) continue;
      // Finde die juengste charge_date in diesem Cluster
      let newest = cluster[0];
      let newestT = newest.charge_date
        ? new Date(newest.charge_date).getTime()
        : -Infinity;
      for (const p of cluster) {
        const t = p.charge_date ? new Date(p.charge_date).getTime() : -Infinity;
        if (t > newestT) {
          newest = p;
          newestT = t;
        }
      }
      // Cluster-Info auf Winner setzen (fuer "+N weitere"-Badge)
      const totalCents = cluster.reduce(
        (s, p) => s + (p.amount_cents ?? 0),
        0,
      );
      winnerInfo.set(newest.id, {
        count: cluster.length,
        totalCents,
      });
      for (const p of cluster) {
        if (p.id !== newest.id) recovered.add(p.id);
      }
    }
    // (A) Failed mit spaeterem confirmed
    for (const p of payments) {
      if (statusGroup(p.status) !== "failed") continue;
      if (recovered.has(p.id)) continue; // schon als Duplikat markiert
      const key = `${p.customer_id ?? p.mandate_id ?? "?"}|${p.amount_cents ?? 0}`;
      const candidates = successByKey.get(key);
      if (!candidates || candidates.length === 0) continue;
      const fail = p.charge_date ? new Date(p.charge_date).getTime() : null;
      if (!fail) continue;
      for (const c of candidates) {
        if (!c.charge_date) continue;
        const ok = new Date(c.charge_date).getTime();
        const days = (ok - fail) / DAYS;
        // 14-Tage-Fenster: bei monatlichen Raten ist der naechste
        // Cycle erst nach ~30 Tagen, kann also nicht faelschlich
        // gematcht werden.
        if (days >= -14 && days <= 14) {
          recovered.add(p.id);
          break;
        }
      }
    }
    return { recovered, winnerInfo };
  }, [payments]);
  const failedClusterInfo = recoveredFailedIds.winnerInfo;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = payments.filter((p) => {
      if (hideRecovered && recoveredFailedIds.recovered.has(p.id)) return false;
      if (showDoneFeature && hideDone && isPaymentDone(p)) return false;
      if (q) {
        const hay = `${p.customer_name} ${p.customer_email ?? ""} ${p.description ?? ""} ${p.reference ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Multi-Status: leeres Set = alle erlaubt
      if (statusFilter.size > 0) {
        if (!statusFilter.has(statusGroup(p.status))) return false;
      }
      if (dateFrom && (p.charge_date ?? "") < dateFrom) return false;
      if (dateTo && (p.charge_date ?? "") > dateTo) return false;
      // Mahn-Status-Multi (Per-Payment, nur in Failed-Tab sichtbar)
      if (showDunningCol && dunningFilter.size > 0) {
        const ds = effectivePaymentDunning(p);
        const dsKey = ds === null ? "none" : ds;
        if (!dunningFilter.has(dsKey)) return false;
      }
      // Einzug-Multi (Customer-Lage)
      if (showCustomerStatusCol && einzugFilter.size > 0) {
        const hasActive = !!p.customer_has_active_mandate;
        const flag =
          p.customer_id && localCustomerFlags.has(p.customer_id)
            ? localCustomerFlags.get(p.customer_id)
            : p.customer_flag === "storniert" && p.customer_flag_reason
              ? {
                  status: "storniert" as const,
                  reason: p.customer_flag_reason as
                    | "vertragsende"
                    | "ueberwiesen"
                    | "inkasso",
                }
              : null;
        let einzugKey: string;
        if (hasActive) einzugKey = "aktiv";
        else if (flag) einzugKey = flag.reason;
        else einzugKey = "kein_mandat";
        if (!einzugFilter.has(einzugKey)) return false;
      }
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      switch (sort) {
        case "date_asc": {
          const da = a.charge_date ?? "9999-99-99";
          const db = b.charge_date ?? "9999-99-99";
          return da.localeCompare(db);
        }
        case "amount_desc":
          return (b.amount_cents ?? 0) - (a.amount_cents ?? 0);
        case "name_asc":
          return a.customer_name.localeCompare(b.customer_name, "de");
        case "date_desc":
        default: {
          const da = a.charge_date ?? "0000-00-00";
          const db = b.charge_date ?? "0000-00-00";
          return db.localeCompare(da);
        }
      }
    });
    return rows;
  }, [payments, search, statusFilter, sort, dateFrom, dateTo,
       hideRecovered, recoveredFailedIds,
       showDunningCol, dunningFilter, dealsById,
       showDoneFeature, hideDone, localResolutions, localPaymentDunning,
       showCustomerStatusCol, einzugFilter, localCustomerFlags]);

  const totals = useMemo(() => {
    let total = 0,
      paid = 0,
      pending = 0,
      failed = 0;
    for (const p of filtered) {
      const amt = p.amount_cents ?? 0;
      total += amt;
      const g = statusGroup(p.status);
      if (g === "confirmed") paid += amt;
      else if (g === "pending") pending += amt;
      else if (g === "failed") failed += amt;
    }
    return { total, paid, pending, failed };
  }, [filtered]);

  const isSandbox = env === "sandbox";

  // Gruppen pro Kunde (fuer Stornierte-Tab Uebersicht).
  // Key: customer_id oder mandate_id oder name (Fallback).
  // Sortierung: nach Gesamt-Betrag DESC (groesste Stornos zuerst).
  const groupedRows = useMemo(() => {
    if (!groupByCustomer) return [];
    const map = new Map<
      string,
      {
        key: string;
        customer_name: string;
        customer_email: string | null;
        mitarbeiter: string | null;
        deal_id: string | null;
        items: ApiPayment[];
        totalCents: number;
      }
    >();
    for (const p of filtered) {
      const key =
        p.customer_id ??
        p.mandate_id ??
        `name:${p.customer_name}|email:${p.customer_email ?? ""}`;
      const g = map.get(key);
      if (g) {
        g.items.push(p);
        g.totalCents += p.amount_cents ?? 0;
      } else {
        map.set(key, {
          key,
          customer_name: p.customer_name,
          customer_email: p.customer_email,
          mitarbeiter: p.mitarbeiter,
          deal_id: p.deal_id,
          items: [p],
          totalCents: p.amount_cents ?? 0,
        });
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => b.totalCents - a.totalCents);
    return arr;
  }, [filtered, groupByCustomer, localResolutions]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Filterleiste */}
      <div className="flex flex-wrap gap-2 items-end bg-white rounded-lg border border-[color:var(--border)] p-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Suche
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Email, Beschreibung, Referenz…"
            className="w-full border border-[color:var(--border)] rounded px-3 py-1.5 text-sm"
          />
        </div>
        {hideStatusFilter ? null : (
          <MultiSelectFilter
            label="Status"
            selected={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "confirmed", label: "Bestätigt" },
              { value: "pending", label: "In Bearbeitung" },
              { value: "failed", label: "Fehlgeschlagen" },
              { value: "cancelled", label: "Storniert" },
              { value: "chargeback", label: "Rückbelastet" },
              { value: "scheduled", label: "Geplant" },
            ]}
          />
        )}
        {showDunningCol ? (
          <MultiSelectFilter
            label="Mahn-Status"
            selected={dunningFilter}
            onChange={setDunningFilter}
            title="Filtert nach dem Mahn-Stand der Zahlung. Mehrere Werte gleichzeitig waehlbar."
            options={[
              { value: "none", label: "Kein Mahnschritt" },
              { value: "mahnung_1", label: "1. Mahnung" },
              { value: "mahnung_2", label: "2. Mahnung" },
              { value: "inkasso", label: "Inkasso" },
              { value: "resolved", label: "Erledigt" },
            ]}
          />
        ) : null}
        {showCustomerStatusCol ? (
          <MultiSelectFilter
            label="Einzug"
            selected={einzugFilter}
            onChange={setEinzugFilter}
            title="Filtert nach der aktuellen Mandat-Lage des Kunden."
            options={[
              { value: "aktiv", label: "✓ aktiv" },
              { value: "kein_mandat", label: "⚠ Kein Mandat" },
              { value: "vertragsende", label: "⊘ Vertragsende" },
              { value: "ueberwiesen", label: "💶 Überwiesen" },
              { value: "inkasso", label: "⚖ Bei Inkasso" },
            ]}
          />
        ) : null}
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Von
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Bis
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          />
        </div>
        {showDoneFeature ? (
          <div className="flex items-end pb-1">
            <label
              className="inline-flex items-center gap-1.5 text-xs text-[color:var(--muted)] cursor-pointer select-none"
              title="Versteckt alle Zeilen die du als 'erledigt' markiert hast. Toggle aus, um sie wieder zu sehen."
            >
              <input
                type="checkbox"
                checked={hideDone}
                onChange={(e) => setHideDone(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Erledigte ausblenden</span>
            </label>
          </div>
        ) : null}
        <div className="flex items-end pb-1">
          <label
            className="inline-flex items-center gap-1.5 text-xs text-[color:var(--muted)] cursor-pointer select-none"
            title="Versteckt 2 Arten von Karteileichen: (1) failed-Zahlungen wo derselbe Kunde innerhalb 14 Tagen denselben Betrag erfolgreich bezahlt hat (echter Retry-Erfolg). (2) Mehrfach-failed-Eintraege fuer denselben Posten (z.B. Rueckbuchungsgebuehr die GC mehrfach probiert) -- nur der juengste bleibt sichtbar."
          >
            <input
              type="checkbox"
              checked={hideRecovered}
              onChange={(e) => setHideRecovered(e.target.checked)}
              className="cursor-pointer"
            />
            <span>Duplikate/eingezogene ausblenden</span>
            {recoveredFailedIds.recovered.size > 0 ? (
              <span className="text-[10px] text-[color:var(--brand-orange)] font-semibold">
                ({recoveredFailedIds.recovered.size})
              </span>
            ) : null}
          </label>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase text-[color:var(--muted)] mb-0.5">
            Sortieren
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border border-[color:var(--border)] rounded px-2 py-1.5 text-sm"
          >
            <option value="date_desc">Datum (neueste)</option>
            <option value="date_asc">Datum (älteste)</option>
            <option value="amount_desc">Betrag (höchst)</option>
            <option value="name_asc">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Summen */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        <div className="bg-white rounded border border-[color:var(--border)] p-2">
          <div className="text-[10px] uppercase text-[color:var(--muted)]">
            Einträge
          </div>
          <div className="font-semibold tabular-nums">{filtered.length}</div>
        </div>
        <div className="bg-blue-50 rounded border border-blue-300 p-2">
          <div className="text-[10px] uppercase text-blue-900/70">Total</div>
          <div className="font-semibold tabular-nums text-blue-900">
            {eur(totals.total)}
          </div>
        </div>
        <div className="bg-green-50 rounded border border-green-300 p-2">
          <div className="text-[10px] uppercase text-green-900/70">
            Bestätigt
          </div>
          <div className="font-semibold tabular-nums text-green-900">
            {eur(totals.paid)}
          </div>
        </div>
        <div className="bg-amber-50 rounded border border-amber-300 p-2">
          <div className="text-[10px] uppercase text-amber-900/70">
            In Bearb.
          </div>
          <div className="font-semibold tabular-nums text-amber-900">
            {eur(totals.pending)}
          </div>
        </div>
        <div className="bg-red-50 rounded border border-red-300 p-2">
          <div className="text-[10px] uppercase text-red-900/70">
            Fehlgeschl.
          </div>
          <div className="font-semibold tabular-nums text-red-900">
            {eur(totals.failed)}
          </div>
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] overflow-x-auto">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-[color:var(--muted)]">
            Lade Zahlungen aus GoCardless …
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-red-700">Fehler: {error}</div>
        ) : groupByCustomer ? (
          /* Gruppierte Kunden-Ansicht (z.B. fuer Stornierte Zahlungen) */
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-xs uppercase">
              <tr className="text-left">
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Mitarbeiter</th>
                <th className="px-3 py-2">Einzug</th>
                <th className="px-3 py-2 text-right">Anzahl</th>
                <th className="px-3 py-2 text-right">Gesamt-Betrag</th>
                <th className="px-3 py-2">Notiz</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-[color:var(--muted)]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                groupedRows.map((g) => {
                  const open = expandedGroups.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr
                        onClick={() => toggleGroup(g.key)}
                        className="border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]/50 cursor-pointer"
                      >
                        <td className="px-3 py-2 text-[color:var(--brand-orange)] font-semibold">
                          {open ? "▼" : "▶"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{g.customer_name}</div>
                          {g.customer_email ? (
                            <div className="text-[10px] text-[color:var(--muted)]">
                              {g.customer_email}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                          {g.mitarbeiter || "—"}
                        </td>
                        <td
                          className="px-3 py-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CustomerStatusCell
                            payment={g.items[0]}
                            flag={effectiveCustomerFlag(g.items[0])}
                            onSetReason={(reason) =>
                              setCustomerFlag(g.items[0], reason)
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {g.items.length}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {eur(g.totalCents)}
                        </td>
                        <td></td>
                      </tr>
                      {open
                        ? g.items
                            .slice()
                            .sort((a, b) =>
                              (b.charge_date ?? "").localeCompare(
                                a.charge_date ?? "",
                              ),
                            )
                            .map((p) => {
                              const stat = statusBadge(p.status);
                              const done = isPaymentDone(p);
                              return (
                                <tr
                                  key={p.id}
                                  className={
                                    "border-t border-[color:var(--border)] bg-[color:var(--surface)]/20 " +
                                    (done ? "opacity-50 line-through" : "")
                                  }
                                >
                                  <td className="px-2 py-1.5 text-center">
                                    {showDoneFeature ? (
                                      <input
                                        type="checkbox"
                                        checked={done}
                                        onChange={() => toggleDone(p)}
                                        className="cursor-pointer"
                                        title={
                                          done
                                            ? `Erledigt von ${p.done_by_email ?? "—"}`
                                            : "Als erledigt markieren"
                                        }
                                      />
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">
                                    <span className="text-[color:var(--muted)]">
                                      {formatDate(p.charge_date)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">
                                    <span
                                      className={
                                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border " +
                                        stat.cls
                                      }
                                    >
                                      {stat.label}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                                    {eur(p.amount_cents)}
                                  </td>
                                  <td
                                    className="px-3 py-1.5 text-xs text-[color:var(--muted)] truncate max-w-[400px]"
                                    title={p.description ?? ""}
                                  >
                                    {p.description || "—"}
                                  </td>
                                  <td
                                    className="px-2 py-1.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <NoteCell
                                      gcId={p.id}
                                      kind="payment"
                                      initialNote={effectiveNote(p)}
                                      onChange={(n) =>
                                        setLocalNotes((m) => {
                                          const next = new Map(m);
                                          next.set(p.id, n);
                                          return next;
                                        })
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })
                        : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)] text-xs uppercase">
              <tr className="text-left">
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Mitarbeiter</th>
                <th className="px-3 py-2 text-right">Betrag</th>
                <th className="px-3 py-2">Status</th>
                {showDunningCol ? (
                  <th className="px-3 py-2">Mahn-Status</th>
                ) : null}
                {showCustomerStatusCol ? (
                  <th className="px-3 py-2" title="Wird beim Kunden aktuell Geld abgebucht?">
                    Einzug
                  </th>
                ) : null}
                <th className="px-3 py-2">Beschreibung</th>
                {showDoneFeature ? (
                  <th className="px-3 py-2 w-8 text-center" title="Erledigt-Marker">
                    ✓
                  </th>
                ) : null}
                <th className="px-3 py-2" title="Freie Notiz zu dieser Zahlung">
                  Notiz
                </th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      8 +
                      (showDunningCol ? 1 : 0) +
                      (showDoneFeature ? 1 : 0) +
                      (showCustomerStatusCol ? 1 : 0)
                    }
                    className="px-3 py-8 text-center text-sm text-[color:var(--muted)]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const stat = statusBadge(p.status);
                  const gcUrl = isSandbox
                    ? `https://manage-sandbox.gocardless.com/payments/${p.id}`
                    : `https://manage.gocardless.com/payments/${p.id}`;
                  const linkedDeal = p.deal_id
                    ? dealsById.get(p.deal_id) ?? null
                    : null;
                  const clickable = !!linkedDeal;
                  const done = isPaymentDone(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={
                        clickable
                          ? () => setDetailDeal(linkedDeal)
                          : undefined
                      }
                      title={
                        clickable
                          ? "Klick fuer Mahnung / Mandat-Storno"
                          : p.deal_id
                          ? "Deal nicht geladen"
                          : "Kein Deal verknuepft"
                      }
                      className={
                        "border-t border-[color:var(--border)] hover:bg-[color:var(--surface)]/30 " +
                        (clickable ? "cursor-pointer " : "") +
                        (done ? "opacity-50 line-through " : "")
                      }
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(p.charge_date)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.customer_name}</div>
                        {p.customer_email ? (
                          <div className="text-[10px] text-[color:var(--muted)]">
                            {p.customer_email}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                        {p.mitarbeiter || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {eur(p.amount_cents)}
                      </td>
                      <td className="px-3 py-2">
                        <a
                          href={gcUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border hover:opacity-80 " +
                            stat.cls
                          }
                          title="In GoCardless öffnen"
                        >
                          {stat.label}
                        </a>
                      </td>
                      {showDunningCol ? (
                        <td
                          className="px-3 py-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={effectivePaymentDunning(p) ?? ""}
                            onChange={(e) =>
                              setPaymentDunning(
                                p,
                                e.target.value === ""
                                  ? null
                                  : (e.target.value as
                                      | "mahnung_1"
                                      | "mahnung_2"
                                      | "inkasso"
                                      | "resolved"),
                              )
                            }
                            className="border border-[color:var(--border)] rounded px-1 py-0.5 text-[10px] bg-white"
                            title="Status fuer DIESE EINE Zahlung. Triggert keine Email. Bei 'Inkasso' wandert die Zahlung in den Inkasso-Tab."
                          >
                            <option value="">— kein Mahnschritt</option>
                            <option value="mahnung_1">1. Mahnung</option>
                            <option value="mahnung_2">2. Mahnung</option>
                            <option value="inkasso">Inkasso</option>
                            <option value="resolved">Erledigt</option>
                          </select>
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)] max-w-[280px]"
                        title={p.description ?? ""}>
                        <div className="truncate">
                          {p.description || "—"}
                        </div>
                        {(() => {
                          const info = failedClusterInfo.get(p.id);
                          if (!info || info.count < 2) return null;
                          const extra = info.count - 1;
                          return (
                            <div
                              className="mt-0.5 text-[10px] text-[color:var(--brand-orange)] font-semibold"
                              title={`${info.count} fehlgeschlagene Versuche derselben Art bei diesem Kunden (gleicher Betrag, gleiches Schema). Die ${extra} aelteren werden ausgeblendet, der juengste Versuch ist sichtbar.`}
                            >
                              + {extra} aeltere Versuche
                            </div>
                          );
                        })()}
                      </td>
                      {showCustomerStatusCol ? (
                        <td
                          className="px-3 py-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CustomerStatusCell
                            payment={p}
                            flag={effectiveCustomerFlag(p)}
                            onSetReason={(reason) =>
                              setCustomerFlag(p, reason)
                            }
                          />
                        </td>
                      ) : null}
                      {showDoneFeature ? (
                        <td
                          className="px-2 py-2 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => toggleDone(p)}
                            className="cursor-pointer"
                            title={
                              done
                                ? `Erledigt von ${p.done_by_email ?? "—"}. Haken entfernen um wieder offen zu setzen.`
                                : "Als erledigt markieren (Default ausgeblendet)"
                            }
                          />
                        </td>
                      ) : null}
                      <td
                        className="px-2 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <NoteCell
                          gcId={p.id}
                          kind="payment"
                          initialNote={effectiveNote(p)}
                          onChange={(n) =>
                            setLocalNotes((m) => {
                              const next = new Map(m);
                              next.set(p.id, n);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-[color:var(--brand-orange)] font-semibold">
                        {clickable ? "→" : ""}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {detailDeal ? (
        <PaymentDetailModal
          deal={detailDeal}
          onClose={() => setDetailDeal(null)}
          canManageDunning={canManageDunning}
          onDealChanged={(id, patch) =>
            onDealUpdate?.(
              id,
              patch as { dunning_status?: typeof detailDeal.dunning_status },
            )
          }
        />
      ) : null}
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  vertragsende: "⊘ Vertragsende",
  ueberwiesen: "💶 Überwiesen",
  inkasso: "⚖ Inkasso",
};
const REASON_CLS: Record<string, string> = {
  vertragsende: "bg-slate-200 text-slate-700 border-slate-300",
  ueberwiesen: "bg-blue-100 text-blue-900 border-blue-300",
  inkasso: "bg-purple-100 text-purple-900 border-purple-300",
};

/**
 * Mandat-Lage pro Kunden-Zeile mit Grund-Auswahl.
 *
 *  hat zukuenftige Zahlung    -> ✓ aktiv  (gruen)
 *  keine + Grund gesetzt      -> Grund-Badge (Vertragsende/
 *                                Ueberwiesen/Inkasso) + 'rück'
 *  keine + nicht markiert     -> ⚠ KEIN MANDAT + Dropdown 'Grund?'
 */
function CustomerStatusCell({
  payment,
  flag,
  onSetReason,
}: {
  payment: ApiPayment;
  flag:
    | {
        status: "storniert";
        reason: "vertragsende" | "ueberwiesen" | "inkasso";
      }
    | null;
  onSetReason: (
    reason: "vertragsende" | "ueberwiesen" | "inkasso" | null,
  ) => void;
}) {
  const hasActive = !!payment.customer_has_active_mandate;
  if (!payment.customer_id) {
    return (
      <span className="text-[10px] text-[color:var(--muted)]">—</span>
    );
  }
  if (hasActive) {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-green-100 text-green-900 border-green-300"
        title="Kunde hat zukuenftig geplante Zahlung(en) -- Einzug laeuft."
      >
        ✓ aktiv
      </span>
    );
  }
  if (flag) {
    return (
      <div className="flex items-center gap-1">
        <span
          className={
            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border " +
            (REASON_CLS[flag.reason] ?? "bg-slate-100")
          }
          title={`Markiert als '${flag.reason}' -- kein Mandat ist OK.`}
        >
          {REASON_LABEL[flag.reason] ?? flag.reason}
        </span>
        <button
          type="button"
          onClick={() => onSetReason(null)}
          className="text-[10px] text-[color:var(--brand-orange)] hover:underline"
          title="Markierung entfernen"
        >
          rück
        </button>
      </div>
    );
  }
  // No active mandate + not marked -> warning + reason-select
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border bg-red-100 text-red-900 border-red-300"
        title="ACHTUNG: Kunde hat KEIN aktives Mandat und KEINE zukuenftigen Zahlungen. Aktuell kommt kein Geld rein."
      >
        ⚠ KEIN MANDAT
      </span>
      <select
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return;
          onSetReason(
            v as "vertragsende" | "ueberwiesen" | "inkasso",
          );
        }}
        className="text-[10px] px-1 py-0.5 rounded border border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--brand-orange)]"
        title="Warum ist das OK? Bei 'Inkasso' wird der Fall automatisch in den Inkasso-Tab uebernommen."
      >
        <option value="">Grund?</option>
        <option value="vertragsende">Vertragsende</option>
        <option value="ueberwiesen">Auf Konto überwiesen</option>
        <option value="inkasso">Bei Inkasso</option>
      </select>
    </div>
  );
}
