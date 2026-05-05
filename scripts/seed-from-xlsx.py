#!/usr/bin/env python3
"""Convert the legacy 'Cashflow Berechnung.xlsx' into data/seed.json."""
import json
import sys
import uuid
from datetime import datetime
from pathlib import Path

import openpyxl

XLSX = Path.home() / "Downloads/Cashflow Berechnung.xlsx"
OUT = Path(__file__).parent.parent / "data" / "seed.json"

INTERVALL_MAP = {
    "einmalzahlung": "Einmalzahlung",
    "monatlich": "monatlich",
    "alle 2 monate": "alle 2 Monate",
    "vierteljährlich": "vierteljährlich",
    "alle 4 monate": "alle 4 Monate",
    "halbjährlich": "halbjährlich",
    "jährlich": "jährlich",
}

INTERVALL_MONATE = {
    "Einmalzahlung": 1,
    "monatlich": 1,
    "alle 2 Monate": 2,
    "vierteljährlich": 3,
    "alle 4 Monate": 4,
    "halbjährlich": 6,
    "jährlich": 12,
}


def main():
    if not XLSX.exists():
        print(f"missing: {XLSX}", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["Daten"]

    # Map Mitarbeiter ID (HubSpot owner ID) to display name. The xlsx only has
    # owner IDs, so we map them to readable names manually for the seed.
    mitarbeiter_names = {
        "30911203": "Mitarbeiter A",
        "30233227": "Mitarbeiter B",
        "29312573": "Mitarbeiter C",
        "30233233": "Mitarbeiter D",
    }

    deals = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or row[0] is None:
            continue
        vorname, nachname, mit_id, email, betrag, dauer, intervall_raw, startdatum = row[:8]
        if vorname is None or betrag is None:
            continue

        mit_id_str = str(int(mit_id)) if isinstance(mit_id, float) else str(mit_id) if mit_id else ""
        if not mit_id_str:
            continue

        intervall_key = (intervall_raw or "").strip().lower()
        intervall = INTERVALL_MAP.get(intervall_key)
        if not intervall:
            continue

        intervall_monate = INTERVALL_MONATE[intervall]
        try:
            anzahl_raten = int(round(float(dauer) / intervall_monate))
        except (TypeError, ValueError):
            anzahl_raten = 1

        if isinstance(startdatum, datetime):
            start_iso = startdatum.date().isoformat()
        else:
            start_iso = None

        is_legacy = str(vorname).strip().lower() == "cashflow alt"

        deals.append({
            "id": str(uuid.uuid4()),
            "vorname": str(vorname),
            "nachname": str(nachname) if nachname else "",
            "email": email if email else None,
            "mitarbeiter_id": mit_id_str,
            "mitarbeiter_name": mitarbeiter_names.get(mit_id_str, f"Owner {mit_id_str}"),
            "betrag": float(betrag),
            "start_datum": start_iso,
            "anzahl_raten": anzahl_raten,
            "intervall": intervall,
            "hubspot_deal_id": None,
            "source": "legacy" if is_legacy else "manual",
            "created_at": datetime.now().isoformat(),
        })

    employees = [
        {
            "id": str(uuid.uuid4()),
            "email": "mario.grabner@mynlp.at",
            "name": "Mario Grabner",
            "hubspot_owner_id": None,
            "role": "admin",
            "invited_at": datetime.now().isoformat(),
            "active": True,
        }
    ]
    for owner_id, name in mitarbeiter_names.items():
        employees.append({
            "id": str(uuid.uuid4()),
            "email": f"{name.lower().replace(' ', '.')}@mynlp.at",
            "name": name,
            "hubspot_owner_id": owner_id,
            "role": "member",
            "invited_at": datetime.now().isoformat(),
            "active": True,
        })

    seed = {
        "deals": deals,
        "employees": employees,
        "delete_requests": [],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(seed, indent=2, ensure_ascii=False))
    print(f"wrote {len(deals)} deals, {len(employees)} employees -> {OUT}")


if __name__ == "__main__":
    main()
