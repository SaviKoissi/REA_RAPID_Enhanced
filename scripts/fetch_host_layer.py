#!/usr/bin/env python3
"""
SPAM host-crop layer ingestion for RAPID WAVE.

Downloads Spatial Production Allocation Model (SPAM) rasters associated with
Nature Scientific Data s41597-020-0501-z (DOI: 10.1038/s41597-020-0501-z),
clips and reprojects them to a target regional grid, and writes a baseline
host-density GeoTIFF (Phase 1/2 background green/density layer).

Designed to run WITHOUT Python geo bindings (rasterio/geopandas). All
reprojection/clipping is delegated to the GDAL command-line tools
(gdal_translate, gdalwarp, ogr2ogr), which are expected on PATH.

Usage:
    python scripts/fetch_host_layer.py --crop cassava --region nigeria \
        --variable harvested_area --out data/host_layers
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import zipfile
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DOI = "10.1038/s41597-020-0501-z"
NATURE_URL = f"https://www.nature.com/articles/{DOI}"

# SPAM crop codes recognised by the production harvest rasters.
SPAM_CROPS = {
    "cassava": "cassava",
    "banana": "banana",
    "plantain": "plantain",
}

# Target regional grids (West / Central Africa focus).
REGIONS: dict[str, dict] = {
    "nigeria": {
        "name": "Nigeria",
        "bounds_wgs84": [2.68, 4.00, 14.68, 13.90],  # west, south, east, north
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

SPAM_VARIABLES = {
    "harvested_area": "Harvested area (ha)",
    "physical_area": "Physical area (ha)",
    "production": "Production (tons)",
    "yield": "Yield (tons/ha)",
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
    status: str  # ok | partial | failed
    notes: list[str]


# ---------------------------------------------------------------------------
# GDAL helpers (subprocess; no Python GDAL bindings required)
# ---------------------------------------------------------------------------

def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    print(f"[gdal] {' '.join(cmd)}", file=sys.stderr)
    return subprocess.run(cmd, capture_output=True, text=True)


def gdal_available() -> bool:
    return subprocess.run(
        ["gdal_translate", "--version"],
        capture_output=True,
    ).returncode == 0


def warp_to_grid(
    src: Path,
    dst: Path,
    bounds: list[float],
    epsg: int,
    resampling: str = "average",
) -> tuple[bool, str]:
    """Reproject + clip src to the target WGS84 grid via gdalwarp."""
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
    """Return gdalinfo JSON for a raster, or None."""
    res = subprocess.run(
        ["gdalinfo", "-json", str(src)],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        return None
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_file(url: str, out: Path) -> bool:
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(out, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] download failed for {url}: {exc}", file=sys.stderr)
        return False


def discover_spam_urls() -> dict[str, str]:
    """
    Best-effort discovery of SPAM raster URLs for s41597-020-0501-z.

    SPAM data is distributed via the Nature/figshare supplemental-material
    channel associated with the article. We attempt the figshare API search
    keyed by the DOI; if that fails we return an empty dict and the caller
    degrades gracefully (stub manifest + instructions).
    """
    found: dict[str, str] = {}
    try:
        # figshare articles can be searched by DOI/title.
        r = requests.get(
            "https://api.figshare.com/v2/articles/search",
            json={"search_for": "SPAM Spatial Production Allocation Model"},
            timeout=10,
        )
        if r.ok:
            for item in r.json()[:5]:
                aid = item.get("id")
                if not aid:
                    continue
                files = requests.get(
                    f"https://api.figshare.com/v2/articles/{aid}",
                    timeout=10,
                ).json()
                for f in files.get("files", []):
                    name = f.get("name", "").lower()
                    if any(crop in name for crop in SPAM_CROPS.values()) and name.endswith((".tif", ".zip", ".tiff")):
                        found.setdefault(name, f["download_url"])
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] figshare discovery unavailable: {exc}", file=sys.stderr)
    return found


# ---------------------------------------------------------------------------
# Main ingestion
# ---------------------------------------------------------------------------

def ingest(
    crop: str,
    region: str,
    variable: str,
    out_dir: Path,
    force: bool = False,
) -> IngestionResult:
    notes: list[str] = []
    region_cfg = REGIONS[region]
    bounds = region_cfg["bounds_wgs84"]
    epsg = region_cfg["epsg"]

    out_dir.mkdir(parents=True, exist_ok=True)
    safe_crop = crop.replace(" ", "_")
    out_tif = out_dir / f"spam_{safe_crop}_{variable}_{region}.tif"
    manifest_path = out_dir / MANIFEST_NAME

    if out_tif.exists() and not force:
        notes.append(f"output already exists (use --force to overwrite): {out_tif}")
        return IngestionResult(
            crop=crop,
            variable=variable,
            region=region,
            source_url=None,
            output_geotiff=str(out_tif),
            bounds_wgs84=bounds,
            epsg=epsg,
            created_at=datetime.now(timezone.utc).isoformat(),
            status="ok",
            notes=notes,
        )

    source_url: Optional[str] = None
    status = "failed"

    if not gdal_available():
        notes.append("GDAL CLI (gdal_translate/gdalwarp) not found on PATH; cannot reproject.")
        _write_stub(out_dir, crop, variable, region, bounds, epsg, notes)
        return IngestionResult(
            crop=crop, variable=variable, region=region, source_url=None,
            output_geotiff=None, bounds_wgs84=bounds, epsg=epsg,
            created_at=datetime.now(timezone.utc).isoformat(),
            status="failed", notes=notes,
        )

    # Attempt to locate/download the SPAM raster.
    discovered = discover_spam_urls()
    dl_path: Optional[Path] = None
    if discovered:
        # Prefer a file matching the requested crop/variable.
        chosen = None
        for name, url in discovered.items():
            if safe_crop in name:
                chosen = (name, url)
                break
        if not chosen:
            chosen = next(iter(discovered.items()))
        name, url = chosen
        source_url = url
        dl_path = out_dir / f"_spam_download_{Path(name).name}"
        if download_file(url, dl_path):
            notes.append(f"downloaded SPAM raster from {url}")
        else:
            dl_path = None
            notes.append("download failed; no source raster available.")

    if dl_path and dl_path.exists():
        # Unzip if needed.
        work_raster: Optional[Path] = None
        if dl_path.suffix.lower() == ".zip":
            extract_dir = out_dir / "_spam_extract"
            extract_dir.mkdir(exist_ok=True)
            with zipfile.ZipFile(dl_path) as zf:
                zf.extractall(extract_dir)
            tifs = list(extract_dir.rglob("*.tif")) + list(extract_dir.rglob("*.tiff"))
            if tifs:
                work_raster = tifs[0]
                notes.append(f"extracted raster: {work_raster.name}")
        else:
            work_raster = dl_path

        if work_raster and work_raster.exists():
            ok, err = warp_to_grid(work_raster, out_tif, bounds, epsg)
            if ok:
                status = "ok"
                notes.append(f"warped to {region} grid EPSG:{epsg} -> {out_tif.name}")
                info = translate_info(out_tif)
                if info:
                    notes.append(f"bands: {info.get('bands')}, size: {info.get('size')}")
            else:
                notes.append(f"gdalwarp failed: {err.strip()[:200]}")
        else:
            notes.append("no usable raster found in downloaded archive.")
    else:
        notes.append("no SPAM source URL discovered; wrote stub manifest only.")

    _write_manifest(out_dir, crop, variable, region, bounds, epsg, source_url, status, notes, out_tif)

    return IngestionResult(
        crop=crop,
        variable=variable,
        region=region,
        source_url=source_url,
        output_geotiff=str(out_tif) if status == "ok" else None,
        bounds_wgs84=bounds,
        epsg=epsg,
        created_at=datetime.now(timezone.utc).isoformat(),
        status=status,
        notes=notes,
    )


def _write_manifest(
    out_dir: Path,
    crop: str,
    variable: str,
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
        "nature_url": NATURE_URL,
        "dataset": "SPAM (Spatial Production Allocation Model)",
        "crop": crop,
        "variable": variable,
        "variable_label": SPAM_VARIABLES.get(variable, variable),
        "region": region,
        "region_name": REGIONS[region]["name"],
        "bounds_wgs84": bounds,  # [west, south, east, north]
        "epsg": epsg,
        "output_geotiff": str(out_tif) if out_tif else None,
        "source_url": source_url,
        "status": status,
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "purpose": "Baseline susceptible host-density layer (Phase 1/2 background).",
    }
    (out_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


def _write_stub(
    out_dir: Path,
    crop: str,
    variable: str,
    region: str,
    bounds: list[float],
    epsg: int,
    notes: list[str],
) -> None:
    manifest = {
        "doi": DOI,
        "nature_url": NATURE_URL,
        "dataset": "SPAM (Spatial Production Allocation Model)",
        "crop": crop,
        "variable": variable,
        "region": region,
        "region_name": REGIONS[region]["name"],
        "bounds_wgs84": bounds,
        "epsg": epsg,
        "output_geotiff": None,
        "source_url": None,
        "status": "failed",
        "notes": notes + [
            "Install GDAL CLI and re-run to generate the real GeoTIFF.",
            "Alternatively place a reprojected SPAM GeoTIFF at the path above.",
        ],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Ingest SPAM host-crop rasters for RAPID WAVE Phase 1/2 layers.",
    )
    parser.add_argument("--crop", choices=sorted(SPAM_CROPS), default="cassava",
                        help="Host crop (default: cassava)")
    parser.add_argument("--region", choices=sorted(REGIONS), default="nigeria",
                        help="Target region grid (default: nigeria)")
    parser.add_argument("--variable", choices=sorted(SPAM_VARIABLES),
                        default="harvested_area",
                        help="SPAM variable (default: harvested_area)")
    parser.add_argument("--out-dir", default="data/host_layers",
                        help="Output directory (default: data/host_layers)")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing output")
    args = parser.parse_args(argv)

    result = ingest(args.crop, args.region, args.variable, Path(args.out_dir), force=args.force)
    return 0 if result.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
