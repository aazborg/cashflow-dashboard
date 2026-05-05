#!/usr/bin/env python3
"""Seed Caroline's monthly funnel snapshots into data/db.json."""
import json
import uuid
from pathlib import Path

DB = Path(__file__).parent.parent / "data" / "db.json"

SNAPSHOTS = [
    {"month": "2026-01", "qualis": 18, "showup_rate": 72, "close_rate": 30},
    {"month": "2026-02", "qualis": 29, "showup_rate": 48, "close_rate": 25},
    {"month": "2026-03", "qualis": 55, "showup_rate": 64, "close_rate": 24},
    {"month": "2026-04", "qualis": 27, "showup_rate": 63, "close_rate": 29},
]


def main():
    data = json.loads(DB.read_text())
    caroline = next(
        (e for e in data["employees"] if "Caroline" in e["name"]),
        None,
    )
    if not caroline:
        raise SystemExit("Caroline not found in employees")
    mit_id = caroline.get("hubspot_owner_id") or caroline["id"]

    data.setdefault("monthly_snapshots", [])
    # Drop existing entries for Caroline
    data["monthly_snapshots"] = [
        s for s in data["monthly_snapshots"] if s["mitarbeiter_id"] != mit_id
    ]
    for s in SNAPSHOTS:
        data["monthly_snapshots"].append(
            {
                "id": str(uuid.uuid4()),
                "mitarbeiter_id": mit_id,
                "month": s["month"],
                "qualis": s["qualis"],
                "showup_rate": s["showup_rate"],
                "close_rate": s["close_rate"],
                "avg_contract": None,
            }
        )

    DB.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"seeded {len(SNAPSHOTS)} snapshots for {caroline['name']} (mit_id={mit_id})")


if __name__ == "__main__":
    main()
