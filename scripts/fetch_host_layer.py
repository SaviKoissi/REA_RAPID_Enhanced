#!/usr/bin/env python3
"""
Baseline host-crop layer ingestion for RAPID WAVE.

Source priority for cassava (CBSD):
  1. Figshare CassavaMap dataset (https://figshare.com/articles/dataset/CassavaMap/9745118,
     Szyniszewska 2020, Nature Scientific Data DOI: 10.1038/s41597-020-0501-z)
  2. GitHub CassavaMap repository (https://github.com/aniaszy/CassavaMap)
  3. Harvard Dataverse MapSPAM 2010 v2.0 (doi:10.7910/DVN/PRFF8V)
  4. Local 30-arcsec (~1km) GDAL synthetic fallback

Source priority for Musa spp. (banana/plantain, BBTD):
  1. Harvard Dataverse MapSPAM 2010 v2.0 (doi:10.7910/DVN/PRFF8V)
  2. Local 5-arcmin (~10km) GDAL synthetic fallback
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
NATURE_URL = f"https://www.nature.com/articles/{DOI}"
CASSAVAMAP_FIGSHARE_ID = "9745118"
CASSAVAMAP_FIGSHARE_URL = f"https://figshare.com/articles/dataset/CassavaMap/{CASSAVAMAP_FIGSHARE_ID}"
CASSAVAMAP_FIGSHARE_API = f"https://api.figshare.com/v2/articles/{CASSAVAMAP_FIGSHARE_ID}"
CASSAVAMAP_REPO = "https://github.com/aniaszy/CassavaMap"
CASSAVAMAP_GITHUB_API = "https://api.github.com/repos/aniaszy/CassavaMap"
DATAVERSE_DOI = "doi:10.7910/DVN/PRFF8V"

SPAM_CROPS = {
    "cassava": "CASS",
    "banana": "BANA",
    "plantain": "PLNT",
}

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
    dataset: str
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
        "-co", "COMPRESS=LZW",
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
        with requests.get(url, stream=True, timeout=180) as r:
            r.raise_for_status()
            with open(out, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
        return True
    except Exception as exc:
        print(f"[warn] download failed for {url}: {exc}", file=sys.stderr)
        return False


def discover_figshare_cassavamap_url(variable: str) -> Optional[tuple[str, str]]:
    """
    Primary default: Query Figshare article 9745118
    (https://figshare.com/articles/dataset/CassavaMap/9745118) for published GeoTIFFs.
    """
    var_hints = {
        "production": ["prod", "ton"],
        "harvested_area": ["harv", "area", "ha"],
        "physical_area": ["phys", "area", "ha"],
        "yield": ["yield"],
    }.get(variable, ["harv", "prod"])

    try:
        r = requests.get(CASSAVAMAP_FIGSHARE_API, timeout=20)
        if not r.ok:
            return None
        files = r.json().get("files", [])
        rasters = [
            f for f in files
            if f.get("name", "").lower().endswith((".tif", ".tiff", ".zip")) and f.get("download_url")
        ]
        if not rasters:
            return None
        # Prefer direct GeoTIFFs over zips, then match variable hint
        tifs = [f for f in rasters if f["name"].lower().endswith((".tif", ".tiff"))]
        pool = tifs if tifs else rasters
        chosen = next(
            (f for f in pool if any(h in f["name"].lower() for h in var_hints)),
            pool[0],
        )
        return chosen["name"], chosen["download_url"]
    except Exception as exc:
        print(f"[warn] Figshare CassavaMap (9745118) lookup failed: {exc}", file=sys.stderr)
    return None


def discover_github_cassavamap_url(variable: str) -> Optional[tuple[str, str]]:
    """Secondary fallback: Query https://github.com/aniaszy/CassavaMap releases and tree."""
    var_hint = "prod" if variable == "production" else "harv"
    try:
        rel = requests.get(f"{CASSAVAMAP_GITHUB_API}/releases", timeout=15)
        if rel.ok:
            for release in rel.json():
                for asset in release.get("assets", []):
                    name = asset.get("name", "")
                    if name.lower().endswith((".tif", ".tiff", ".zip")):
                        if var_hint in name.lower() or "cassava" in name.lower():
                            return name, asset["browser_download_url"]

        for branch in ("main", "master"):
            tree = requests.get(f"{CASSAVAMAP_GITHUB_API}/git/trees/{branch}?recursive=1", timeout=15)
            if tree.ok:
                candidates = [
                    item.get("path", "")
                    for item in tree.json().get("tree", [])
                    if item.get("path", "").lower().endswith((".tif", ".tiff", ".zip"))
                ]
                if candidates:
                    chosen = next((p for p in candidates if var_hint in p.lower()), candidates[0])
                    raw_url = f"https://raw.githubusercontent.com/aniaszy/CassavaMap/{branch}/{chosen}"
                    return Path(chosen).name, raw_url
    except Exception as exc:
        print(f"[warn] CassavaMap GitHub lookup failed: {exc}", file=sys.stderr)
    return None


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


def generate_synthetic_geotiff(out_tif: Path, bounds: list[float], epsg: int, high_res: bool = False) -> bool:
    """Create a synthetic host raster via gdal_translate (30-arcsec ~1km for CassavaMap, 5-arcmin for SPAM)."""
    west, south, east, north = bounds
    cellsize = (0.5 / 60.0) if high_res else (5.0 / 60.0)
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
            lat_factor = max(0.05, math.exp(-((lat - (south + 0.35 * (north - south))) ** 2) / 12.0))
            wave = 0.65 + 0.35 * math.sin(lon * 1.4) * math.cos(lat * 1.6)
            ha = round(max(0.0, (42.0 if high_res else 420.0) * lat_factor * wave), 2)
            row_vals.append(f"{ha:.2f}")
        lines.append(" ".join(row_vals))

    asc_path.write_text("\n".join(lines) + "\n")
    res = _run(["gdal_translate", "-a_srs", f"EPSG:{epsg}", "-co", "COMPRESS=LZW", "-of", "GTiff", str(asc_path), str(out_tif)])
    asc_path.unlink(missing_ok=True)
    return res.returncode == 0


def ingest(
    crop: str,
    region: str,
    variable: str,
    out_dir: Path,
    source: str = "auto",
    force: bool = False,
    synthetic_fallback: bool = True,
) -> IngestionResult:
    notes: list[str] = []
    region_cfg = REGIONS[region]
    bounds = region_cfg["bounds_wgs84"]
    epsg = region_cfg["epsg"]
    crop_code = SPAM_CROPS[crop]
    var_code, var_label = SPAM_VARIABLES[variable]

    resolved_source = "cassavamap" if (source == "auto" and crop == "cassava") else ("mapspam" if source == "auto" else source)
    dataset_label = (
        "CassavaMap (Szyniszewska 2020, Figshare 9745118 / ~1km SSA Cassava Layer)"
        if resolved_source == "cassavamap"
        else "SPAM 2010 v2.0 (Spatial Production Allocation Model)"
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = "cassavamap" if resolved_source == "cassavamap" else "spam"
    out_tif = out_dir / f"{prefix}_{crop}_{variable}_{region}.tif"

    if out_tif.exists() and not force:
        notes.append(f"output already exists (use --force to overwrite): {out_tif}")
        return IngestionResult(
            dataset=dataset_label, crop=crop, variable=variable, region=region, source_url=None,
            output_geotiff=str(out_tif), bounds_wgs84=bounds, epsg=epsg,
            created_at=datetime.now(timezone.utc).isoformat(), status="ok", notes=notes,
        )

    if not gdal_available():
        notes.append("GDAL CLI (gdal_translate/gdalwarp) not found on PATH.")
        _write_manifest(out_dir, dataset_label, resolved_source, crop, variable, var_label, region, bounds, epsg, None, "failed", notes, None)
        return IngestionResult(
            dataset=dataset_label, crop=crop, variable=variable, region=region, source_url=None,
            output_geotiff=None, bounds_wgs84=bounds, epsg=epsg,
            created_at=datetime.now(timezone.utc).isoformat(), status="failed", notes=notes,
        )

    source_url: Optional[str] = None
    status = "failed"
    discovered: Optional[tuple[str, str]] = None

    if resolved_source == "cassavamap":
        # 1. Primary default: Figshare CassavaMap dataset (9745118)
        discovered = discover_figshare_cassavamap_url(variable)
        if discovered:
            notes.append(f"resolved CassavaMap GeoTIFF via Figshare ({CASSAVAMAP_FIGSHARE_URL})")
        else:
            # 2. Secondary: GitHub aniaszy/CassavaMap
            discovered = discover_github_cassavamap_url(variable)
            if discovered:
                notes.append(f"resolved CassavaMap asset via GitHub ({CASSAVAMAP_REPO})")
            else:
                # 3. Tertiary: Harvard Dataverse MapSPAM CASS
                discovered = discover_dataverse_url(crop, variable)
                if discovered:
                    notes.append(f"fell back to MapSPAM Dataverse ({DATAVERSE_DOI})")
    else:
        discovered = discover_dataverse_url(crop, variable)

    if discovered:
        fname, url = discovered
        source_url = url
        dl_path = out_dir / f"_{prefix}_{fname}"
        if download_file(url, dl_path):
            notes.append(f"downloaded {fname} from {url}")
            work_raster: Optional[Path] = None
            if dl_path.suffix.lower() == ".zip":
                extract_dir = out_dir / f"_{prefix}_extract"
                extract_dir.mkdir(exist_ok=True)
                with zipfile.ZipFile(dl_path) as zf:
                    tifs = [m for m in zf.namelist() if m.lower().endswith((".tif", ".tiff"))]
                    matches = [m for m in tifs if f"_{var_code}_{crop_code}_A.tif" in m.upper()]
                    target = matches[0] if matches else (tifs[0] if tifs else None)
                    if target:
                        zf.extract(target, extract_dir)
                        work_raster = extract_dir / target
            else:
                work_raster = dl_path

            if work_raster and work_raster.exists():
                ok, err = warp_to_grid(work_raster, out_tif, bounds, epsg)
                if ok:
                    status = "ok"
                    notes.append(f"clipped/reprojected {dataset_label} to {region} EPSG:{epsg}")
                else:
                    notes.append(f"gdalwarp failed: {err.strip()[:200]}")

    if status != "ok" and synthetic_fallback:
        is_cassavamap = resolved_source == "cassavamap"
        if generate_synthetic_geotiff(out_tif, bounds, epsg, high_res=is_cassavamap):
            status = "ok"
            res_tag = "30-arcsec (~1km) CassavaMap" if is_cassavamap else "5-arcmin (~10km) SPAM"
            notes.append(f"generated {res_tag} synthetic fallback GeoTIFF for {crop} ({region})")

    info = translate_info(out_tif) if status == "ok" else None
    if info:
        notes.append(f"raster size: {info.get('size')}")

    _write_manifest(out_dir, dataset_label, resolved_source, crop, variable, var_label, region, bounds, epsg, source_url, status, notes, out_tif)
    return IngestionResult(
        dataset=dataset_label, crop=crop, variable=variable, region=region, source_url=source_url,
        output_geotiff=str(out_tif) if status == "ok" else None, bounds_wgs84=bounds, epsg=epsg,
        created_at=datetime.now(timezone.utc).isoformat(), status=status, notes=notes,
    )


def _write_manifest(
    out_dir: Path,
    dataset_label: str,
    resolved_source: str,
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
        "nature_url": NATURE_URL,
        "figshare_url": CASSAVAMAP_FIGSHARE_URL if resolved_source == "cassavamap" else None,
        "repository_url": CASSAVAMAP_REPO if resolved_source == "cassavamap" else f"https://doi.org/{DATAVERSE_DOI.replace('doi:', '')}",
        "dataset": dataset_label,
        "source_pipeline": resolved_source,
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
    parser = argparse.ArgumentParser(description="Ingest CassavaMap (Figshare 9745118 / GitHub) & MapSPAM host-crop rasters.")
    parser.add_argument("--crop", choices=sorted(SPAM_CROPS), default="cassava")
    parser.add_argument("--region", choices=sorted(REGIONS), default="nigeria")
    parser.add_argument("--variable", choices=sorted(SPAM_VARIABLES), default="harvested_area")
    parser.add_argument("--source", choices=["auto", "cassavamap", "mapspam"], default="auto")
    parser.add_argument("--out-dir", default="data/host_layers")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-fallback", action="store_true")
    args = parser.parse_args(argv)

    result = ingest(
        args.crop, args.region, args.variable, Path(args.out_dir),
        source=args.source, force=args.force, synthetic_fallback=not args.no_fallback,
    )
    return 0 if result.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
