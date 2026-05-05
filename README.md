# Cashflow Dashboard

Web-App-Nachbau der `Cashflow Berechnung.xlsx`. Mitarbeiter tragen pro Verkauf
Startdatum, Anzahl Raten und Intervall ein — der Cashflow pro Monat und pro
Mitarbeiter wird daraus automatisch berechnet. HubSpot pusht neue Deals per
Webhook in Echtzeit.

## Lokal starten

```bash
nvm use 20            # Node 20 erforderlich
npm install
npm run dev
# http://localhost:3000  (oder 3737, je nach Launch-Konfiguration)
```

Beim ersten Start wird `data/seed.json` automatisch nach `data/db.json` kopiert.
Das ist der lokale Daten-Store. Er enthält die 138 Deals aus der Original-xlsx.

Seed neu erzeugen (z. B. nach einer xlsx-Aktualisierung):

```bash
python3 scripts/seed-from-xlsx.py
rm data/db.json   # damit der Seed beim nächsten Start neu geladen wird
```

## Routen

| Route                     | Zweck                                                     |
| ------------------------- | --------------------------------------------------------- |
| `/`                       | Dashboard: KPIs, monatlicher Cashflow gesamt + Mitarbeiter|
| `/daten`                  | Daten-Tab: alle Deals, inline editieren, neuer Deal       |
| `/admin`                  | Lösch-Anfragen freigeben, Mitarbeiter einladen            |
| `/api/webhooks/hubspot`   | HubSpot-Webhook-Endpoint (POST)                           |

## HubSpot-Webhook

POST an `https://<deine-domain>/api/webhooks/hubspot` mit Body:

```json
{
  "hubspot_deal_id": "12345",
  "vorname": "Maria",
  "nachname": "Müller",
  "email": "maria@example.com",
  "betrag": 4900,
  "owner_id": "30911203",
  "owner_email": "owner@mynlp.at"
}
```

Optional: setze `HUBSPOT_WEBHOOK_SECRET` als Env-Var. Dann muss jeder Request
den Header `x-webhook-secret: <secret>` mitschicken (in HubSpot Workflows als
Custom Header eintragen).

`upsert` per `hubspot_deal_id`: derselbe Deal wird beim erneuten Push aktualisiert,
nicht dupliziert. Mitarbeiter wird über `owner_id` (HubSpot Owner-ID auf dem
`employees`-Eintrag) oder hilfsweise über `owner_email` gemappt.

## Cashflow-Logik

Pro Deal:

- `betrag` (Gesamtbetrag, von HubSpot)
- `start_datum` (erste Rate)
- `anzahl_raten` (Anzahl Zahlungen)
- `intervall` (Einmalzahlung, monatlich, alle 2 Monate, vierteljährlich, alle
  4 Monate, halbjährlich, jährlich)

Daraus:

- `rate = betrag / anzahl_raten`
- Zahlungstermine = `start_datum + i * intervall_monate`, für i = 0..anzahl_raten-1
- Aggregation auf Monatsbasis (`YYYY-MM`), summiert pro Mitarbeiter und gesamt.

Quellcode: [src/lib/cashflow.ts](src/lib/cashflow.ts).

## Architektur

- Next.js 16 App Router, TypeScript, Tailwind v4
- Datenlogik: Server Functions (`"use server"`) in `src/lib/actions.ts`
- Aktueller Store: lokales JSON-File in `data/db.json`
  ([src/lib/store.ts](src/lib/store.ts))
- Ziel-Store: Supabase Postgres
  ([supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql))

Der Store hat eine schmale Funktions-API (`listDeals`, `updateDeal`,
`createDeal`, `upsertDealByHubspotId`, etc.). Beim Wechsel auf Supabase wird
nur die Implementierung dieser Funktionen ausgetauscht — UI und Actions
bleiben unverändert.

## Brand-Farben

```
Gelb    #ffd857
Orange  #f28a26
Blau    #449dd7   (Primary)
Grün    #53b684   (Erfolg/positive Werte)
Grau    #eae9e4   (Borders/Hintergrund)
```

In `globals.css` als CSS-Variablen + Tailwind-Theme-Tokens
(`bg-[color:var(--brand-blue)]`).

## Auf eigene Domain deployen (Production-Setup)

So läuft die App 24/7 unabhängig vom Laptop:

### 1. Supabase-Projekt anlegen

1. https://supabase.com → New Project (Region Frankfurt empfohlen).
2. SQL Editor → Inhalt von `supabase/migrations/0001_init.sql` einfügen → Run.
3. Settings → API: kopiere
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` Secret → `SUPABASE_SERVICE_ROLE_KEY` (nur server-seitig!)
4. Authentication → Providers: aktiviere "Email" mit Magic-Link.
5. Authentication → URL Configuration: Site URL = `https://cashflow.mynlp.at`.

### 2. Datenmigration vom lokalen Store nach Supabase

(folgt — Migrations-Skript ist noch zu schreiben, sobald Keys vorhanden sind)

### 3. GitHub-Repo anlegen

```bash
cd ~/cashflow-dashboard
git add -A && git commit -m "Initial commit"
gh repo create mynlp/cashflow-dashboard --private --source=. --push
```

### 4. Vercel deployen

1. https://vercel.com → New Project → Import GitHub-Repo.
2. Environment Variables setzen (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HUBSPOT_WEBHOOK_SECRET` (eigenes Geheimnis)
   - `ADMIN_EMAIL=mario.grabner@mynlp.at`
3. Deploy.

### 5. Eigene Domain anbinden

1. In Vercel → Project → Settings → Domains: `cashflow.mynlp.at` hinzufügen.
2. Vercel zeigt dir einen `CNAME`-Zielwert. Im DNS-Provider von `mynlp.at`
   einen `CNAME`-Eintrag erstellen: `cashflow` → `cname.vercel-dns.com`.
3. Nach 1–10 Minuten ist `https://cashflow.mynlp.at` live (SSL automatisch).

### 6. HubSpot-Workflow anlegen

1. HubSpot → Workflows → Create workflow → Trigger: Deal-Stage = "Closed Won".
2. Action → Send a webhook:
   - Method: `POST`
   - URL: `https://cashflow.mynlp.at/api/webhooks/hubspot`
   - Authentication: Custom Header `x-webhook-secret: <HUBSPOT_WEBHOOK_SECRET>`
   - Body als JSON mit den Feldern siehe oben.

### Laufende Kosten

Vercel + Supabase Free-Tier reicht für < 10 Mitarbeiter und < ~10k Deals.
Wenn ihr wachst: max. ~45 €/Monat (Vercel Pro $20 + Supabase Pro $25).

## Offene Punkte (für die Cloud-Phase)

- [ ] Magic-Link Auth verdrahten (Supabase Auth ist im Schema schon vorbereitet)
- [ ] Store-Implementierung von JSON-File auf Supabase umstellen
- [ ] Realtime-Updates per Supabase Channels (Dashboard live)
- [ ] E-Mail-Notification an Admin bei neuer Lösch-Anfrage
- [ ] Migrations-Script: lokales `db.json` → Supabase
