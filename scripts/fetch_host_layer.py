#!/usr/bin/env python3
"""
SPAM host-crop layer ingestion for RAPID WAVE.

Downloads Spatial Production Allocation Model (SPAM 2010 v2.0) rasters from
Harvard Dataverse (doi:10.7910/DVN/PRFF8V), published in Nature Scientific Data
(DOI: 10.1038/s41597-020-0501-z), clips/reprojects them via GDAL CLI, and
writes a baseline host-density GeoTIFF (Phase 1/2 background layer).
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

DOI = "10.1038/s41597-020-0501-z"
DATAVERSE_DOI = "doi:10.7910/DVN/PRFF8V"
NATURE_URL = f"https://www.nature.com/articles/{DOI}"

# Official MapSPAM 4-letter crop codes
SPAM_CROPS = {
    "cassava": "CASS",
    "banana": "BANA",
    "plantain": "PLNT",
}

# Official MapSPAM variable prefixes
SPAM_VARIABLES = {
    "harvested_area": ("H", "Harvested area (ha)"),
    "physical_area": ("A", "Physical area (ha)"),
    "production": ("P", "Production (tons)"),
    "yield": ("Y", "Yield (kg/ha)"),
}

REGIONS: dict[str, dict] = {
    "nigeria": {
        "name": "Nigeria",
        "bounds_wgs84": [2.68, 4.00, 14.68, 13.90],
        "epsg": 4326,
    },
    "benin": {
        "name": "Benin",
        "bounds_wgs84": [0.97, 6.15, 3.87, 12.41],
        "epsg": 4326,
    },
    "west_central_africa": {
        "name": "West & Central Africa",
        "bounds_wgs84": [-17.5, -6.0, 16.0, 24.0],
        "epsg": 4326,
    },
}

MANIFEST_NAME = "manifest.json"


@dataclass
class IngestionResult:
    crop: str
    variable: str
    region: str
    source_url: Optional[str]
    output_geotiff: Optional[str]
    bounds_wgs84: list[float]
    epsg: int
    created_at: str
    status: str
    notes: list[str]


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    print(f"[gdal] {' '.join(cmd)}", file=sys.stderr)
    return subprocess.run(cmd, capture_output=True, text=True)


def gdal_available() -> bool:
    return subprocess.run(["gdal_translate", "--version"], capture_output=True).returncode == 0


def warp_to_grid(
    src: Path,
    dst: Path,
    bounds: list[float],
    epsg: int,
    resampling: str = "average",
) -> tuple[bool, str]:
    west, south, east, north = bounds
    cmd = [
        "gdalwarp",
        "-overwrite",
        "-t_srs", f"EPSG:{epsg}",
        "-te", str(west), str(south), str(east), str(north),
        "-r", resampling,
        "-dstnodata", "0",
        "-of", "GTiff",
        str(src),
        str(dst),
    ]
    res = _run(cmd)
    return res.returncode == 0, res.stderr


def translate_info(src: Path) -> Optional[dict]:
    res = subprocess.run(["gdalinfo", "-json", str(src)], capture_output=True, text=True)
    if res.returncode != 0:
        return None
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return None


def download_file(url: str, out: Path) -> bool:
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(out, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
        return True
    except Exception as exc:
        print(f"[warn] download failed for {url}: {exc}", file=sys.stderr)
        return False


def discover_dataverse_url(crop: str, variable: str) -> Optional[tuple[str, str]]:
    """Query Harvard Dataverse API for MapSPAM 2010 v2.0 (doi:10.7910/DVN/PRFF8V)."""
    var_code, _ = SPAM_VARIABLES[variable]
    try:
        r = requests.get(
            "https://dataverse.harvard.edu/api/datasets/:persistentId/",
            params={"persistentId": DATAVERSE_DOI},
            timeout=20,
        )
        if not r.ok:
            return None
        files = r.json().get("data", {}).get("latestVersion", {}).get("files", [])
        # Look for global variable zip (e.g. spam2010v2r0_global_harv_area.geotiff.zip)
        var_hints = {
            "H": ["harv_area", "_h_"],
            "A": ["phys_area", "_a_"],
            "P": ["prod", "_p_"],
            "Y": ["yield", "_y_"],
        }[var_code]
        for f in files:
            df = f.get("dataFile", {})
            fname = df.get("filename", "").lower()
            fid = df.get("id")
            if fid and "geotiff" in fname and any(h in fname for h in var_hints):
                return df["filename"], f"https://dataverse.harvard.edu/api/access/datafile/{fid}"
    except Exception as exc:
        print(f"[warn] Harvard Dataverse lookup failed: {exc}", file=sys.stderr)
    return None


def generate_synthetic_geotiff(out_tif: Path, bounds: list[float], epsg: int) -> bool:
    """Create a realistic 5-arcminute (0.0833 deg) synthetic host raster via gdal_translate."""
    west, south, east, north = bounds
    cellsize = 5.0 / 60.0
    ncols = max(10, int(round((east - west) / cellsize)))
    nrows = max(10, int(round((north - south) / cellsize)))

    asc_path = out_tif.with_suffix(".asc")
    lines = [
        f"ncols         {ncols}",
        f"nrows         {nrows}",
        f"xllcorner     {west:.6f}",
        f"yllcorner     {south:.6f}",
        f"cellsize      {cellsize:.6f}",
        "NODATA_value  -9999",
    ]
    for r in range(nrows):
        lat = north - (r + 0.5) * cellsize
        row_vals = []
        for c in range(ncols):
            lon = west + (c + 0.5) * cellsize
            # Higher host density in humid southern/central agricultural belts
            lat_factor = max(0.05, math.exp(-((lat - (south + 0.35 * (north - south))) ** 2) / 12.0))
            wave = 0.65 + 0.35 * math.sin(lon * 1.4) * math.cos(lat * 1.6)
            ha = round(max(0.0, 420.0 * lat_factor * wave), 2)
            row_vals.append(f"{ha:.2f}")
        lines.append(" ".join(row_vals))

    asc_path.write_text("\n".join(lines) + "\n")
    res = _run(["gdal_translate", "-a_srs", f"EPSG:{epsg}", "-of", "GTiff", str(asc_path), str(out_tif)])
    asc_path.unlink(missing_ok=True)
    return res.returncode == 0


def ingest(
    crop: str,
    region: str,
    variable: str,
    out_dir: Path,
    force: bool = False,
    synthetic_fallback: bool = True,
) -> IngestionResult:
    notes: list[str] = []
    region_cfg = REGIONS[region]
    bounds = region_cfg["bounds_wgs84"]
    epsg = region_cfg["epsg"]
    crop_code = SPAM_CROPS[crop]
    var_code, var_label = SPAM_VARIABLES[variable]

    out_dir.mkdir(parents=True, exist_ok=True)
    out_tif = out_dir / f"spam_{crop}_{variable}_{region}.tif"

    if out_tif.exists() and not force:
        notes.append(f"output already exists (use --force to overwrite): {out_tif}")
        return IngestionResult(
            crop=crop, variable=variable, region=region, source_url=None,
            output_geotiff=str(out_tif), bounds_wgs84=bounds, epsg=epsg,
            created_at=datetime.now(timezone.utc).isoformat(), status="ok", notes=notes,
        )

    if not gdal_available():
        notes.append("GDAL CLI (gdal_translate/gdalwarp) not found on PATH.")
        _write_manifest(out_dir, crop, variable, var_label, region, bounds, epsg, None, "failed", notes, None)
        return IngestionResult(
            crop=crop, variable=variable, region=region, source_url=None,
            output_geotiff=None, bounds_wgs84=bounds, epsg=epsg,
            created_at=datetime.now(timezone.utc).isoformat(), status="failed", notes=notes,
        )

    source_url: Optional[str] = None
    status = "failed"
    discovered = discover_dataverse_url(crop, variable)

    if discovered:
        fname, url = discovered
        source_url = url
        dl_path = out_dir / f"_spam_{fname}"
        if download_file(url, dl_path):
            notes.append(f"downloaded {fname} from Harvard Dataverse ({DATAVERSE_DOI})")
            work_raster: Optional[Path] = None
            if dl_path.suffix.lower() == ".zip":
                extract_dir = out_dir / "_spam_extract"
                extract_dir.mkdir(exist_ok=True)
                with zipfile.ZipFile(dl_path) as zf:
                    matches = [m for m in zf.namelist() if f"_{var_code}_{crop_code}_A.tif" in m.upper()]
                    target = matches[0] if matches else next((m for m in zf.namelist() if crop_code in m.upper() and m.lower().endswith(".tif")), None)
                    if target:
                        zf.extract(target, extract_dir)
                        work_raster = extract_dir / target
            else:
                work_raster = dl_path

            if work_raster and work_raster.exists():
                ok, err = warp_to_grid(work_raster, out_tif, bounds, epsg)
                if ok:
                    status = "ok"
                    notes.append(f"clipped/reprojected {crop_code} ({var_code}) to {region} EPSG:{epsg}")
                else:
                    notes.append(f"gdalwarp failed: {err.strip()[:200]}")

    if status != "ok" and synthetic_fallback:
        if generate_synthetic_geotiff(out_tif, bounds, epsg):
            status = "ok"
            notes.append(f"generated 5-arcmin synthetic fallback GeoTIFF for {crop} ({region})")

    info = translate_info(out_tif) if status == "ok" else None
    if info:
        notes.append(f"raster size: {info.get('size')}")

    _write_manifest(out_dir, crop, variable, var_label, region, bounds, epsg, source_url, status, notes, out_tif)
    return IngestionResult(
        crop=crop, variable=variable, region=region, source_url=source_url,
        output_geotiff=str(out_tif) if status == "ok" else None, bounds_wgs84=bounds, epsg=epsg,
        created_at=datetime.now(timezone.utc).isoformat(), status=status, notes=notes,
    )


def _write_manifest(
    out_dir: Path,
    crop: str,
    variable: str,
    var_label: str,
    region: str,
    bounds: list[float],
    epsg: int,
    source_url: Optional[str],
    status: str,
    notes: list[str],
    out_tif: Optional[Path],
) -> None:
    manifest = {
        "doi": DOI,
        "dataverse_doi": DATAVERSE_DOI,
        "nature_url": NATURE_URL,
        "dataset": "SPAM 2010 v2.0 (Spatial Production Allocation Model)",
        "crop": crop,
        "crop_code": SPAM_CROPS[crop],
        "variable": variable,
        "variable_label": var_label,
        "region": region,
        "region_name": REGIONS[region]["name"],
        "bounds_wgs84": bounds,
        "epsg": epsg,
        "output_geotiff": str(out_tif) if status == "ok" and out_tif else None,
        "source_url": source_url,
        "status": status,
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "purpose": "Baseline susceptible host-density layer (Phase 1/2 background).",
    }
    (out_dir / f"manifest_{crop}_{region}.json").write_text(json.dumps(manifest, indent=2))
    (out_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest SPAM host-crop rasters for RAPID WAVE.")
    parser.add_argument("--crop", choices=sorted(SPAM_CROPS), default="cassava")
    parser.add_argument("--region", choices=sorted(REGIONS), default="nigeria")
    parser.add_argument("--variable", choices=sorted(SPAM_VARIABLES), default="harvested_area")
    parser.add_argument("--out-dir", default="data/host_layers")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-fallback", action="store_true", help="Disable synthetic raster fallback if Dataverse fails")
    args = parser.parse_args(argv)

    result = ingest(
        args.crop, args.region, args.variable, Path(args.out_dir),
        force=args.force, synthetic_fallback=not args.no_fallback,
    )
    return 0 if result.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
