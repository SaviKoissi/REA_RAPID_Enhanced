#!/usr/bin/env python3
"""
Enhanced RAPID WAVE seeder (scripts/seed_enhanced_rea.py).

Populates the local KV store (`.data/rapid-kv-store.json`) via the running
Next.js dev server so that all 9 analytical views render immediately:

  CBSD (Nigeria)  - Phases 1..5  (center [7.8, 9.0], zoom 6)
  BBTD (Benin)    - Phases 1..5  (center [2.3, 7.2], zoom 7)

Creates:
  * Field observatory observations (CBSD-NG-* and BBTD-BJ-*)
  * 9 DashboardEntry records with metadata, permissions, layers, modelState
    (host-density rasters from SPAM s41597-020-0501-z, survey vectors,
     admin boundaries, ABC-SMC risk/forecast rasters, intervention layers,
     uncertainty cartography, scenario comparison)
  * ABC-SMC inference runs, scenario comparisons, and uncertainty fields
    stored as posterior/uncertainty artifacts referenced by the dashboards.

Run with the dev server already started:
    npm run dev   # in one terminal
    python scripts/seed_enhanced_rea.py   # in another
"""

from __future__ import annotations

import json
import math
import random
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

BASE_URL = "http://localhost:3000"
ORG_ID = "org_wave_001"
USER_ID = "user_admin_001"
NOW = datetime.now(timezone.utc).isoformat()

# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def api(method: str, path: str, payload: Any = None, timeout: int = 20):
    url = f"{BASE_URL}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)


def slugify(name: str) -> str:
    s = name.lower().replace(" ", "-")
    s = "".join(ch for ch in s if ch.isalnum() or ch in "-_")
    return s.strip("-_")


def uuid8() -> str:
    rng = random.Random()
    return "".join(rng.choice("0123456789abcdef") for _ in range(8))


# ---------------------------------------------------------------------------
# Synthetic spatial data builders
# ---------------------------------------------------------------------------

def host_density_grid(center_lon: float, center_lat: float, span: float, n: int,
                      base: float, seed: int, mode: str = "baseline"):
    """Build a GeoJSON FeatureCollection of square host-density cells."""
    rng = random.Random(seed)
    features = []
    step = (2 * span) / n
    for i in range(n):
        for j in range(n):
            lon0 = center_lon - span + i * step
            lat0 = center_lat - span + j * step
            cx = lon0 + step / 2
            cy = lat0 + step / 2
            dist = math.hypot(cx - center_lon, cy - center_lat)
            intensity = max(0.05, math.exp(-(dist ** 2) / (0.5 * span ** 2)))
            intensity = intensity * (0.6 + 0.4 * rng.random()) * base
            if mode == "intervention":
                intensity *= 0.35
            features.append({
                "type": "Feature",
                "properties": {
                    "value": round(min(1.0, intensity), 3),
                    "host_density": round(min(1.0, intensity), 3),
                    "uncertainty": round(0.05 + 0.15 * (1 - min(1.0, intensity)), 3),
                    "mode": mode,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [lon0, lat0], [lon0 + step, lat0],
                        [lon0 + step, lat0 + step], [lon0, lat0 + step],
                        [lon0, lat0],
                    ]],
                },
            })
    return {"type": "FeatureCollection", "features": features}


def admin_boundaries_geojson(center_lon: float, center_lat: float, span: float):
    """Simple rectangular admin boundary around the region of interest."""
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "Admin boundary", "admin_level": 1},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [center_lon - span, center_lat - span],
                    [center_lon + span, center_lat - span],
                    [center_lon + span, center_lat + span],
                    [center_lon - span, center_lat + span],
                    [center_lon - span, center_lat - span],
                ]],
            },
        }],
    }


def survey_points(records):
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "sample_id": r["sample_id"],
                "status": r["diagnostic_status"],
                "vector_density": r["vector_density"],
                "date": r["date"],
            },
            "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
        } for r in records],
    }


# ---------------------------------------------------------------------------
# Dashboard factory
# ---------------------------------------------------------------------------

def make_dashboard(idx: int, phase: int, name: str, pathosystem: str,
                   center: list[float], zoom: int,
                   layers: list[dict], active_layers: list[str],
                   posteriors: list[dict], uncertainty: dict, scenario: dict) -> dict:
    return {
        "metadata": {
            "name": name,
            "description": f"Analytical view for {name} — {pathosystem}",
            "pathosystem": pathosystem,
            "language": "en",
            "phase": phase,
        },
        "permissions": {
            "orgId": ORG_ID,
            "permissionType": "org",
            "permissionLevel": "owner",
            "userId": USER_ID,
        },
        "layers": layers,
        "modelState": {
            "viewport": {"center": center, "zoom": zoom},
            "activeLayers": active_layers,
            "posteriors": posteriors,
            "uncertaintyCartography": uncertainty,
            "scenarioComparison": scenario,
        },
        "createdAt": NOW,
        "updatedAt": NOW,
        "ownerId": USER_ID,
        "orgId": ORG_ID,
    }


def build_dashboards(cbsd_records, bbtd_records, cbsd_host, bbtd_host,
                     cbsd_admin, bbtd_admin, cbsd_surveys, bbtd_surveys):
    """Return the 9 dashboard entries with stable, deterministic keys."""
    dashes = []

    # ---- CBSD (Nigeria) ----
    cbsd_post_1 = [{"id": "post_cbsd_1", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/cbsd_detection_posterior.json",
                    "createdAt": NOW}]
    cbsd_post_3 = [{"id": "post_cbsd_3", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/cbsd_risk_posterior.json",
                    "createdAt": NOW}]
    cbsd_post_5 = [{"id": "post_cbsd_5", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/cbsd_control_posterior.json",
                    "createdAt": NOW}]

    unc_on = {"enabled": True, "method": "kriging", "confidence": 0.95}
    unc_off = {"enabled": False, "method": "kriging", "confidence": 0.95}
    scen_both = {"enabled": True, "scenarioIds": ["scen_cbsd_nocontrol", "scen_cbsd_controls"]}
    scen_ctrl = {"enabled": True, "scenarioIds": ["scen_cbsd_controls"]}

    dashes.append(make_dashboard(1, 1, "CBSD initial detection", "CBSD", center, 6,
        [cbsd_host, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_1, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(2, 2, "CBSD delimitation surveys", "CBSD", center, 7,
        [cbsd_host, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_1, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(3, 3, "CBSD risk map", "CBSD", center, 6,
        [cbsd_host, cbsd_risk, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_risk_contours", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_3, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(4, 4, "CBSD no intervention scenario", "CBSD", center, 6,
        [cbsd_host, cbsd_risk, cbsd_admin],
        ["cbsd_host_density", "cbsd_risk_contours", "admin_boundaries"],
        cbsd_post_3, unc_on, scen_both))
    dashes.append(make_dashboard(5, 5, "CBSD management interventions", "CBSD", center, 6,
        [cbsd_host, cbsd_controls, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_interventions", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_5, unc_on, scen_ctrl))

    # ---- BBTD (Benin) ----
    bcenter = [2.3, 7.2]
    bbtd_post_1 = [{"id": "post_bbtd_1", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/bbtd_delimiting_posterior.json",
                    "createdAt": NOW}]
    bbtd_post_3 = [{"id": "post_bbtd_3", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/bbtd_current_posterior.json",
                    "createdAt": NOW}]
    bbtd_post_5 = [{"id": "post_bbtd_5", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/bbtd_control_posterior.json",
                    "createdAt": NOW}]

    bscen_both = {"enabled": True, "scenarioIds": ["scen_bbtd_nocontrol", "scen_bbtd_controls"]}
    bscen_ctrl = {"enabled": True, "scenarioIds": ["scen_bbtd_controls"]}

    dashes.append(make_dashboard(6, 1, "BBTD delimiting surveys", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_surveys, bbtd_admin],
        ["bbtd_host_density", "bbtd_surveys", "admin_boundaries"],
        bbtd_post_1, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(7, 3, "BBTD Current spread", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_spread, bbtd_surveys, bbtd_admin],
        ["bbtd_host_density", "bbtd_spread", "bbtd_surveys", "admin_boundaries"],
        bbtd_post_3, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(8, 4, "BBTD Future spread, no control", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_spread, bbtd_admin],
        ["bbtd_host_density", "bbtd_spread", "admin_boundaries"],
        bbtd_post_3, unc_on, bscen_both))
    dashes.append(make_dashboard(9, 5, "BBTD Future spread, controls", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_controls, bbtd_surveys, bbtd_admin],
        ["bbtd_host_density", "bbtd_controls", "bbtd_surveys", "admin_boundaries"],
        bbtd_post_5, unc_on, bscen_ctrl))

    return dashes


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    rng = random.Random(2026)
    statuses = ["Infectious", "Exposed", "Susceptible", "Removed"]

    # ---- Observatory records ----
    cbsd_records = []
    for idx in range(1, 25):
        cbsd_records.append({
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
            "notes": f"Cassava sentinel site #{idx} (CassavaMap stratum)",
        })

    bbtd_records = []
    for idx in range(1, 19):
        bbtd_records.append({
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
        })

    all_records = cbsd_records + bbtd_records

    # ---- Spatial layers ----
    cbsd_center = [7.8, 9.0]
    bcenter = [2.3, 7.2]
    cbsd_host = host_density_grid(cbsd_center[1], cbsd_center[0], 1.6, 12, 0.55, 101, "baseline")
    bbtd_host = host_density_grid(bcenter[1], bcenter[0], 1.2, 10, 0.5, 201, "baseline")
    cbsd_admin = admin_boundaries_geojson(cbsd_center[1], cbsd_center[0], 2.0)
    bbtd_admin = admin_boundaries_geojson(bcenter[1], bcenter[0], 1.5)
    cbsd_surveys = survey_points(cbsd_records)
    bbtd_surveys = survey_points(bbtd_records)

    # Raster-style risk / forecast / control layers (rendered as GeoJSON overlays)
    cbsd_risk = host_density_grid(cbsd_center[1], cbsd_center[0], 1.6, 12, 0.45, 301, "baseline")
    cbsd_controls = host_density_grid(cbsd_center[1], cbsd_center[0], 1.6, 12, 0.2, 401, "intervention")
    bbtd_spread = host_density_grid(bcenter[1], bcenter[0], 1.2, 10, 0.4, 501, "baseline")
    bbtd_controls = host_density_grid(bcenter[1], bcenter[0], 1.2, 10, 0.15, 601, "intervention")

    # Layer refs with stable ids
    def ref(layer_id, ltype, name, url=None, visible=True, opacity=0.6):
        return {"id": layer_id, "type": ltype, "name": name, "url": url,
                "visible": visible, "opacity": opacity}

    cbsd_host_ref = ref("cbsd_host_density", "raster", "CBSD host density (cassava, SPAM)",
                        "/rasters/cbsd_host_density.tif", True, 0.55)
    cbsd_risk_ref = ref("cbsd_risk_contours", "raster", "CBSD ABC-SMC prevalence risk",
                        "/rasters/cbsd_risk.tif", False, 0.5)
    cbsd_controls_ref = ref("cbsd_interventions", "vector", "CBSD management interventions",
                            None, False, 0.7)
    cbsd_surveys_ref = ref("cbsd_surveys", "vector", "CBSD delimitation surveys",
                           None, True, 0.9)
    cbsd_admin_ref = ref("admin_boundaries", "vector", "Admin boundaries",
                         None, True, 0.3)

    bbtd_host_ref = ref("bbtd_host_density", "raster", "BBTD host density (Musa, SPAM)",
                        "/rasters/bbtd_host_density.tif", True, 0.55)
    bbtd_spread_ref = ref("bbtd_spread", "raster", "BBTD spread forecast",
                          "/rasters/bbtd_spread.tif", False, 0.5)
    bbtd_controls_ref = ref("bbtd_controls", "vector", "BBTD clean-seed/roguing controls",
                            None, False, 0.7)
    bbtd_surveys_ref = ref("bbtd_surveys", "vector", "BBTD delimiting surveys",
                           None, True, 0.9)
    bbtd_admin_ref = ref("admin_boundaries", "vector", "Admin boundaries",
                         None, True, 0.3)

    # Rebuild dashboards with proper layer refs (the make_dashboard uses refs)
    dashes = build_dashboards_refs(cbsd_host_ref, cbsd_risk_ref, cbsd_controls_ref,
                                   cbsd_surveys_ref, cbsd_admin_ref,
                                   bbtd_host_ref, bbtd_spread_ref, bbtd_controls_ref,
                                   bbtd_surveys_ref, bbtd_admin_ref)

    # 1. Ingest observations
    code, res = api("POST", "/api/observatory/ingest", all_records)
    print(f"[Observatory Ingest] HTTP {code} -> {res}")
    if code not in (200, 207):
        print("ERROR: observatory ingest failed; aborting.", file=sys.stderr)
        sys.exit(1)

    # 2. Create the 9 dashboard entries
    created = 0
    for d in dashes:
        code, res = api("POST", "/api/dashboards", d)
        if code in (200, 201):
            created += 1
        else:
            print(f"  [dashboard] {d['metadata']['name']} -> HTTP {code} {res}")
    print(f"[Dashboards] created {created}/{len(dashes)} entries")

    # 3. ABC-SMC inference runs (CBSD + BBTD)
    abc_code, abc_res = api("POST", "/api/epi/abc-smc", {
        "pathosystem": "CBSD",
        "observations": cbsd_records,
        "particles": 150,
        "generations": 4,
        "seed": 2026,
    })
    print(f"[ABC-SMC CBSD] HTTP {abc_code} -> {str(abc_res)[:120]}")

    abc_code2, abc_res2 = api("POST", "/api/epi/abc-smc", {
        "pathosystem": "BBTD",
        "observations": bbtd_records,
        "particles": 120,
        "generations": 4,
        "seed": 2027,
    })
    print(f"[ABC-SMC BBTD] HTTP {abc_code2} -> {str(abc_res2)[:120]}")

    # 4. Scenario comparison (baseline vs controls)
    scen_code, scen_res = api("POST", "/api/epi/scenario", {
        "scenarios": [
            {"id": "scen_cbsd_nocontrol", "name": "No Control (Baseline)", "pathosystem": "CBSD",
             "horizonMonths": 36, "roguingCompliance": 0.0, "cleanSeedAdoption": 0.0,
             "vectorControlEfficacy": 0.0, "bufferRadiusKm": 0},
            {"id": "scen_cbsd_controls", "name": "Clean Seed + Roguing + Vector Control",
             "pathosystem": "CBSD", "horizonMonths": 36, "roguingCompliance": 0.75,
             "cleanSeedAdoption": 0.65, "vectorControlEfficacy": 0.50, "bufferRadiusKm": 5.0},
            {"id": "scen_bbtd_nocontrol", "name": "No Control (Baseline)", "pathosystem": "BBTD",
             "horizonMonths": 36, "roguingCompliance": 0.0, "cleanSeedAdoption": 0.0,
             "vectorControlEfficacy": 0.0, "bufferRadiusKm": 0},
            {"id": "scen_bbtd_controls", "name": "Clean Seed + Roguing + Vector Control",
             "pathosystem": "BBTD", "horizonMonths": 36, "roguingCompliance": 0.70,
             "cleanSeedAdoption": 0.60, "vectorControlEfficacy": 0.45, "bufferRadiusKm": 5.0},
        ]
    })
    print(f"[Scenario Comparison] HTTP {scen_code} -> {str(scen_res)[:160]}")

    # 5. Uncertainty cartography (CBSD + BBTD)
    unc_code, unc_res = api("POST", "/api/epi/uncertainty", {
        "pathosystem": "CBSD",
        "observations": cbsd_records,
        "confidence": 0.95,
        "resolution": 24,
    })
    print(f"[Uncertainty CBSD] HTTP {unc_code} -> {str(unc_res)[:120]}")

    unc_code2, unc_res2 = api("POST", "/api/epi/uncertainty", {
        "pathosystem": "BBTD",
        "observations": bbtd_records,
        "confidence": 0.95,
        "resolution": 24,
    })
    print(f"[Uncertainty BBTD] HTTP {unc_code2} -> {str(unc_res2)[:120]}")

    print("\nSeed complete.")


def build_dashboards_refs(cbsd_host, cbsd_risk, cbsd_controls, cbsd_surveys, cbsd_admin,
                          bbtd_host, bbtd_spread, bbtd_controls, bbtd_surveys, bbtd_admin):
    """Wrapper so build_dashboards receives layer refs directly."""
    center = [7.8, 9.0]
    bcenter = [2.3, 7.2]

    cbsd_post_1 = [{"id": "post_cbsd_1", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/cbsd_detection_posterior.json",
                    "createdAt": NOW}]
    cbsd_post_3 = [{"id": "post_cbsd_3", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/cbsd_risk_posterior.json",
                    "createdAt": NOW}]
    cbsd_post_5 = [{"id": "post_cbsd_5", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/cbsd_control_posterior.json",
                    "createdAt": NOW}]

    unc_on = {"enabled": True, "method": "kriging", "confidence": 0.95}
    scen_both = {"enabled": True, "scenarioIds": ["scen_cbsd_nocontrol", "scen_cbsd_controls"]}
    scen_ctrl = {"enabled": True, "scenarioIds": ["scen_cbsd_controls"]}

    dashes = []
    dashes.append(make_dashboard(1, 1, "CBSD initial detection", "CBSD", center, 6,
        [cbsd_host, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_1, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(2, 2, "CBSD delimitation surveys", "CBSD", center, 7,
        [cbsd_host, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_1, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(3, 3, "CBSD risk map", "CBSD", center, 6,
        [cbsd_host, cbsd_risk, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_risk_contours", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_3, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(4, 4, "CBSD no intervention scenario", "CBSD", center, 6,
        [cbsd_host, cbsd_risk, cbsd_admin],
        ["cbsd_host_density", "cbsd_risk_contours", "admin_boundaries"],
        cbsd_post_3, unc_on, scen_both))
    dashes.append(make_dashboard(5, 5, "CBSD management interventions", "CBSD", center, 6,
        [cbsd_host, cbsd_controls, cbsd_surveys, cbsd_admin],
        ["cbsd_host_density", "cbsd_interventions", "cbsd_surveys", "admin_boundaries"],
        cbsd_post_5, unc_on, scen_ctrl))

    bbtd_post_1 = [{"id": "post_bbtd_1", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/bbtd_delimiting_posterior.json",
                    "createdAt": NOW}]
    bbtd_post_3 = [{"id": "post_bbtd_3", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/bbtd_current_posterior.json",
                    "createdAt": NOW}]
    bbtd_post_5 = [{"id": "post_bbtd_5", "method": "ABC-SMC",
                    "artifactUrl": "/artifacts/bbtd_control_posterior.json",
                    "createdAt": NOW}]

    bscen_both = {"enabled": True, "scenarioIds": ["scen_bbtd_nocontrol", "scen_bbtd_controls"]}
    bscen_ctrl = {"enabled": True, "scenarioIds": ["scen_bbtd_controls"]}

    dashes.append(make_dashboard(6, 1, "BBTD delimiting surveys", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_surveys, bbtd_admin],
        ["bbtd_host_density", "bbtd_surveys", "admin_boundaries"],
        bbtd_post_1, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(7, 3, "BBTD Current spread", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_spread, bbtd_surveys, bbtd_admin],
        ["bbtd_host_density", "bbtd_spread", "bbtd_surveys", "admin_boundaries"],
        bbtd_post_3, unc_on, {"enabled": False, "scenarioIds": []}))
    dashes.append(make_dashboard(8, 4, "BBTD Future spread, no control", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_spread, bbtd_admin],
        ["bbtd_host_density", "bbtd_spread", "admin_boundaries"],
        bbtd_post_3, unc_on, bscen_both))
    dashes.append(make_dashboard(9, 5, "BBTD Future spread, controls", "BBTD", bcenter, 7,
        [bbtd_host, bbtd_controls, bbtd_surveys, bbtd_admin],
        ["bbtd_host_density", "bbtd_controls", "bbtd_surveys", "bbtd_admin"],
        bbtd_post_5, unc_on, bscen_ctrl))

    return dashes


if __name__ == "__main__":
    main()
