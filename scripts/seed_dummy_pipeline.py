#!/usr/bin/env python3
"""
Feeds realistic dummy data across all 5 RAPID WAVE capabilities (CBSD Nigeria & BBTD Benin)
matching the exact TypeScript route schemas in src/app/api/.
"""

import json
import math
import random
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"
ORG_ID = "org_wave_001"
USER_ID = "user_admin_001"


def api(method: str, path: str, payload=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)


def make_grid_geojson(center_lon: float, center_lat: float, span: float, n: int, mode: str):
    features = []
    step = (2 * span) / n
    rng = random.Random(42)
    for i in range(n):
        for j in range(n):
            lon0 = center_lon - span + i * step
            lat0 = center_lat - span + j * step
            dist = math.hypot((lon0 + step / 2) - center_lon, (lat0 + step / 2) - center_lat)
            intensity = max(0.05, math.exp(-(dist ** 2) / (0.6 * span ** 2)) * (0.7 + 0.3 * rng.random()))
            if mode == "intervention":
                intensity *= 0.32
            features.append({
                "type": "Feature",
                "properties": {
                    "value": round(intensity, 3),
                    "uncertainty": round(0.08 + 0.15 * (1 - intensity), 3),
                    "mode": mode,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [lon0, lat0],
                        [lon0 + step, lat0],
                        [lon0 + step, lat0 + step],
                        [lon0, lat0 + step],
                        [lon0, lat0],
                    ]],
                },
            })
    return {"type": "FeatureCollection", "features": features}


def make_points_geojson(records):
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "sample_id": r["sample_id"],
                    "status": r["diagnostic_status"],
                    "vector_density": r["vector_density"],
                    "date": r["date"],
                },
                "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
            }
            for r in records
        ],
    }


def main():
    rng = random.Random(2026)
    statuses = ["Infectious", "Exposed", "Susceptible", "Removed"]

    # Note: host_crop must be lowercase "cassava" | "banana" | "plantain" | "other"
    cbsd_records = [
        {
            "sample_id": f"CBSD-NG-{idx:03d}",
            "latitude": round(7.35 + rng.uniform(-1.4, 1.8), 5),
            "longitude": round(4.20 + rng.uniform(-1.1, 2.6), 5),
            "date": f"2026-10-{(idx % 28) + 1:02d}T10:00:00Z",
            "host_crop": "cassava",
            "diagnostic_status": statuses[0] if idx <= 6 else (statuses[1] if idx <= 11 else statuses[2]),
            "vector_density": round(rng.uniform(4.0, 26.5), 1),
            "survey_effort": 1.0,
            "org_id": ORG_ID,
            "submitted_by": USER_ID,
            "notes": f"Cassava sentinel site #{idx} (CassavaMap Figshare 9745118 stratum)",
        }
        for idx in range(1, 25)
    ]

    bbtd_records = [
        {
            "sample_id": f"BBTD-BJ-{idx:03d}",
            "latitude": round(6.65 + rng.uniform(-0.4, 2.2), 5),
            "longitude": round(2.25 + rng.uniform(-0.5, 0.7), 5),
            "date": f"2026-10-{(idx % 28) + 1:02d}T09:00:00Z",
            "host_crop": "banana",
            "diagnostic_status": statuses[0] if idx <= 5 else (statuses[1] if idx <= 9 else statuses[2]),
            "vector_density": round(rng.uniform(5.0, 31.0), 1),
            "survey_effort": 1.0,
            "org_id": ORG_ID,
            "submitted_by": USER_ID,
            "notes": f"Musa spp. survey site #{idx} (MapSPAM stratum)",
        }
        for idx in range(1, 19)
    ]

    # 1. Capability 1 & 2: POST raw JSON array to /api/observatory/ingest
    all_records = cbsd_records + bbtd_records
    code, res = api("POST", "/api/observatory/ingest", all_records)
    print(f"[Capability 1 - Observatory Ingest] HTTP {code} -> accepted={res.get('accepted_count') if isinstance(res, dict) else res}")

    # 2. Capability 3: ABC-SMC Data Assimilation (/api/epi/abc-smc)
    abc_code, abc_res = api("POST", "/api/epi/abc-smc", {
        "pathosystem": "CBSD",
        "observations": cbsd_records,
        "particles": 100,
        "generations": 3,
        "kernel": "power_law",
    })
    print(f"[Capability 3 - ABC-SMC Inference] HTTP {abc_code} -> {str(abc_res)[:160]}")

    # 3. Capability 4 & 5: Scenario Comparison & FAO Economics (/api/epi/scenario)
    scen_code, scen_res = api("POST", "/api/epi/scenario", {
        "scenarios": [
            {
                "id": "no_control",
                "name": "No Control (Baseline)",
                "pathosystem": "CBSD",
                "horizonMonths": 36,
                "roguingCompliance": 0.0,
                "cleanSeedAdoption": 0.0,
                "vectorControlEfficacy": 0.0,
                "bufferRadiusKm": 0,
            },
            {
                "id": "clean_seed_roguing",
                "name": "Clean Seed + Buffer Roguing",
                "pathosystem": "CBSD",
                "horizonMonths": 36,
                "roguingCompliance": 0.75,
                "cleanSeedAdoption": 0.65,
                "vectorControlEfficacy": 0.50,
                "bufferRadiusKm": 5.0,
            },
        ]
    })
    print(f"[Capability 4 & 5 - Scenario + FAO Economics] HTTP {scen_code} -> {str(scen_res)[:160]}")

    # 4. Uncertainty Cartography (/api/epi/uncertainty)
    unc_code, unc_res = api("POST", "/api/epi/uncertainty", {
        "pathosystem": "CBSD",
        "observations": cbsd_records,
        "confidence": 0.95,
    })
    print(f"[Uncertainty Cartography] HTTP {unc_code} -> {str(unc_res)[:160]}")


if __name__ == "__main__":
    main()
