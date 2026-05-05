import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Deal,
  DeleteRequest,
  Employee,
  MonthlySnapshot,
  Product,
} from "./types";

interface DB {
  deals: Deal[];
  employees: Employee[];
  delete_requests: DeleteRequest[];
  monthly_snapshots?: MonthlySnapshot[];
  products?: Product[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const SEED_PATH = path.join(DATA_DIR, "seed.json");

let cache: DB | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function loadInitial(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw) as DB;
  } catch {
    try {
      const raw = await fs.readFile(SEED_PATH, "utf8");
      const seed = JSON.parse(raw) as DB;
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DB_PATH, JSON.stringify(seed, null, 2));
      return seed;
    } catch {
      const empty: DB = {
        deals: [],
        employees: [
          {
            id: randomUUID(),
            email: "mario.grabner@mynlp.at",
            name: "Mario Grabner",
            hubspot_owner_id: null,
            role: "admin",
            invited_at: new Date().toISOString(),
            active: true,
          },
        ],
        delete_requests: [],
      };
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DB_PATH, JSON.stringify(empty, null, 2));
      return empty;
    }
  }
}

async function getDb(): Promise<DB> {
  if (!cache) cache = await loadInitial();
  return cache;
}

function persist(): Promise<void> {
  const data = cache;
  if (!data) return Promise.resolve();
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DB_PATH, JSON.stringify(data, null, 2)),
  );
  return writeQueue;
}

export async function listDeals(filter?: {
  ownerEmail?: string;
}): Promise<Deal[]> {
  const db = await getDb();
  let deals = db.deals;
  if (filter?.ownerEmail) {
    deals = deals.filter(
      (d) =>
        d.email?.toLowerCase() === filter.ownerEmail!.toLowerCase() ||
        getEmployeeByOwnerId(db, d.mitarbeiter_id)?.email.toLowerCase() ===
          filter.ownerEmail!.toLowerCase(),
    );
  }
  return [...deals].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function getEmployeeByOwnerId(db: DB, ownerId: string): Employee | undefined {
  return db.employees.find((e) => e.hubspot_owner_id === ownerId);
}

export async function getDeal(id: string): Promise<Deal | null> {
  const db = await getDb();
  return db.deals.find((d) => d.id === id) ?? null;
}

export async function createDeal(
  input: Omit<Deal, "id" | "created_at">,
): Promise<Deal> {
  const db = await getDb();
  const deal: Deal = {
    ...input,
    id: randomUUID(),
    created_at: new Date().toISOString(),
  };
  db.deals.push(deal);
  await persist();
  return deal;
}

export async function updateDeal(
  id: string,
  patch: Partial<Deal>,
): Promise<Deal | null> {
  const db = await getDb();
  const idx = db.deals.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  db.deals[idx] = { ...db.deals[idx], ...patch };
  await persist();
  return db.deals[idx];
}

export async function upsertDealByHubspotId(
  hubspot_deal_id: string,
  data: Omit<Deal, "id" | "created_at" | "hubspot_deal_id" | "source">,
): Promise<Deal> {
  const db = await getDb();
  const existing = db.deals.find((d) => d.hubspot_deal_id === hubspot_deal_id);
  if (existing) {
    Object.assign(existing, data);
    await persist();
    return existing;
  }
  return createDeal({
    ...data,
    hubspot_deal_id,
    source: "hubspot",
  });
}

export async function listEmployees(): Promise<Employee[]> {
  const db = await getDb();
  return [...db.employees];
}

export async function getEmployeeByEmail(
  email: string,
): Promise<Employee | null> {
  const db = await getDb();
  return (
    db.employees.find((e) => e.email.toLowerCase() === email.toLowerCase()) ??
    null
  );
}

export async function updateEmployee(
  id: string,
  patch: Partial<
    Pick<
      Employee,
      | "name"
      | "hubspot_owner_id"
      | "active"
      | "provision_pct"
      | "default_qualis"
      | "default_showup_rate"
      | "default_close_rate"
      | "default_avg_contract"
    >
  >,
): Promise<Employee | null> {
  const db = await getDb();
  const emp = db.employees.find((e) => e.id === id);
  if (!emp) return null;
  const oldOwnerId = emp.hubspot_owner_id;
  const oldName = emp.name;
  Object.assign(emp, patch);
  if (patch.name && patch.name !== oldName) {
    const ownerId = emp.hubspot_owner_id;
    for (const d of db.deals) {
      if (
        (ownerId && d.mitarbeiter_id === ownerId) ||
        d.mitarbeiter_id === emp.id ||
        (oldOwnerId && d.mitarbeiter_id === oldOwnerId)
      ) {
        d.mitarbeiter_name = emp.name;
      }
    }
  }
  await persist();
  return emp;
}

export async function inviteEmployee(input: {
  email: string;
  name: string;
  hubspot_owner_id?: string | null;
}): Promise<Employee> {
  const db = await getDb();
  const existing = await getEmployeeByEmail(input.email);
  if (existing) return existing;
  const emp: Employee = {
    id: randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name,
    hubspot_owner_id: input.hubspot_owner_id ?? null,
    role: "member",
    invited_at: new Date().toISOString(),
    active: true,
  };
  db.employees.push(emp);
  await persist();
  return emp;
}

export async function listMonthlySnapshots(
  mitarbeiter_id?: string,
): Promise<MonthlySnapshot[]> {
  const db = await getDb();
  const all = db.monthly_snapshots ?? [];
  const filtered = mitarbeiter_id
    ? all.filter((s) => s.mitarbeiter_id === mitarbeiter_id)
    : all;
  return [...filtered].sort((a, b) => a.month.localeCompare(b.month));
}

export async function upsertMonthlySnapshot(
  input: Omit<MonthlySnapshot, "id">,
): Promise<MonthlySnapshot> {
  const db = await getDb();
  if (!db.monthly_snapshots) db.monthly_snapshots = [];
  const existing = db.monthly_snapshots.find(
    (s) => s.mitarbeiter_id === input.mitarbeiter_id && s.month === input.month,
  );
  if (existing) {
    Object.assign(existing, input);
    await persist();
    return existing;
  }
  const created: MonthlySnapshot = { ...input, id: randomUUID() };
  db.monthly_snapshots.push(created);
  await persist();
  return created;
}

const PRODUCT_SEED: Omit<Product, "id">[] = [
  { name: "Staatlich geprüfte:r Lebensberater:in", price: 13652.64, default_anzahl_raten: 24, default_intervall: "monatlich", active: true, sort: 10 },
  { name: "Zert. Mediator:in", price: 5910, default_anzahl_raten: 12, default_intervall: "monatlich", active: true, sort: 20 },
  { name: "BPr Beratungswissenschaften", price: 5000, default_anzahl_raten: 12, default_intervall: "monatlich", active: true, sort: 30 },
  { name: "Zert. Life Coach", price: 4000, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 40 },
  { name: "Praxisstunden-Package", price: 3990, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 50, is_upsell: true },
  { name: "Zert. Epigenetik Coach", price: 3500, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 60 },
  { name: "Systemischer Coach", price: 3200, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 70 },
  { name: "Einzelselbsterfahrung für LSB", price: 2800, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 80 },
  { name: "Speaking Mastery Ausbildung", price: 2699, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 90 },
  { name: "Dipl. Trainer:in für Erwachsenenbildung", price: 2699, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 100 },
  { name: "Paarberatung", price: 2470, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 110 },
  { name: "Zert. Supervisor:in", price: 2470, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 120 },
  { name: "Trauerbegleitung", price: 2470, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 130 },
  { name: "Zert. Aufstellungsleiter:in", price: 2470, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 140 },
  { name: "Zert. Konfliktcoach Online", price: 2200, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 150 },
  { name: "Zert. NLP Practitioner Online", price: 2200, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 160 },
  { name: "Zert. Mentalcoach Online", price: 2200, default_anzahl_raten: 10, default_intervall: "monatlich", active: true, sort: 170 },
  { name: "Upgrade NLP Trainer:in", price: 1799, default_anzahl_raten: 6, default_intervall: "monatlich", active: true, sort: 180 },
  { name: "New Code Practitioner", price: 1699, default_anzahl_raten: 6, default_intervall: "monatlich", active: true, sort: 190 },
  { name: "Gruppensupervision für LSB (groß)", price: 800, default_anzahl_raten: 1, default_intervall: "Einmalzahlung", active: true, sort: 200, is_upsell: true },
  { name: "Gruppensupervision für LSB (klein)", price: 600, default_anzahl_raten: 1, default_intervall: "Einmalzahlung", active: true, sort: 210, is_upsell: true },
  { name: "8 Präsenztage NLP Practitioner", price: 500, default_anzahl_raten: 1, default_intervall: "Einmalzahlung", active: true, sort: 220 },
  { name: "8 Präsenztage Mentalcoach", price: 500, default_anzahl_raten: 1, default_intervall: "Einmalzahlung", active: true, sort: 230 },
  { name: "6 Präsenztage NLP Master", price: 400, default_anzahl_raten: 1, default_intervall: "Einmalzahlung", active: true, sort: 240 },
  { name: "ISO Zertifizierung", price: 325, default_anzahl_raten: 1, default_intervall: "Einmalzahlung", active: true, sort: 250 },
];

export async function listProducts(): Promise<Product[]> {
  const db = await getDb();
  if (!db.products) {
    db.products = PRODUCT_SEED.map((p) => ({ ...p, id: randomUUID() }));
    await persist();
  }
  return [...db.products].sort((a, b) => a.sort - b.sort);
}

export async function createProduct(
  input: Omit<Product, "id">,
): Promise<Product> {
  const db = await getDb();
  if (!db.products) db.products = [];
  const product: Product = { ...input, id: randomUUID() };
  db.products.push(product);
  await persist();
  return product;
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id">>,
): Promise<Product | null> {
  const db = await getDb();
  if (!db.products) return null;
  const p = db.products.find((x) => x.id === id);
  if (!p) return null;
  Object.assign(p, patch);
  await persist();
  return p;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db.products) return false;
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== id);
  if (db.products.length === before) return false;
  await persist();
  return true;
}

export async function listDeleteRequests(): Promise<DeleteRequest[]> {
  const db = await getDb();
  return [...db.delete_requests].sort((a, b) =>
    b.requested_at.localeCompare(a.requested_at),
  );
}

export async function createDeleteRequest(input: {
  deal_id: string;
  requested_by_email: string;
}): Promise<DeleteRequest> {
  const db = await getDb();
  const deal = db.deals.find((d) => d.id === input.deal_id);
  if (deal) deal.pending_delete = true;
  const dr: DeleteRequest = {
    id: randomUUID(),
    deal_id: input.deal_id,
    requested_by_email: input.requested_by_email.toLowerCase(),
    requested_at: new Date().toISOString(),
    status: "pending",
  };
  db.delete_requests.push(dr);
  await persist();
  return dr;
}

export async function decideDeleteRequest(
  id: string,
  decision: "approved" | "denied",
): Promise<DeleteRequest | null> {
  const db = await getDb();
  const dr = db.delete_requests.find((r) => r.id === id);
  if (!dr) return null;
  dr.status = decision;
  dr.decided_at = new Date().toISOString();
  if (decision === "approved") {
    db.deals = db.deals.filter((d) => d.id !== dr.deal_id);
  } else {
    const deal = db.deals.find((d) => d.id === dr.deal_id);
    if (deal) deal.pending_delete = false;
  }
  await persist();
  return dr;
}
