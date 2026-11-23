# RAPID WAVE Biosecurity Platform — Architecture & Implementation Notes

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Pathosystems](https://img.shields.io/badge/Pathosystems-CBSD%20%28Nigeria%29%20%7C%20BBTD%20%28Benin%29-2E7D32)](#3-seeded-analytical-views-cbsd-nigeria--bbtd-benin)
[![Views](https://img.shields.io/badge/Analytical%20Views-9-0F766E)](#3-seeded-analytical-views-cbsd-nigeria--bbtd-benin)

## 1. Overview

**RAPID WAVE** is a biosecurity analytics and surveillance web application built on **Next.js 16 (App Router, Turbopack)**, **React**, and **TypeScript**, paired with analytical and seeding workflows across five core capabilities:

1. **Observatory Ingest & Surveillance (`/api/observatory`, `/api/observatory/ingest`)**: Ingestion and retrieval of georeferenced field survey observations (such as `CBSD-NG-*` in Nigeria and `BBTD-BJ-*` in Benin), host crop metadata (`cassava`, `banana`, `plantain`, `other`), diagnostic status (`Susceptible`, `Exposed`, `Infectious`, `Removed`), and vector density metrics.
2. **ABC-SMC Data Assimilation (`/api/epi/abc-smc`)**: Approximate Bayesian Computation — Sequential Monte Carlo inference over epidemiological parameters and posterior sample distributions conditioned on field observations and spatial kernels.
3. **Scenario Modeling (`/api/epi/scenario`)**: Multi-scenario projection comparing baseline unmitigated spread (`no_control`) against intervention strategies (`clean_seed_roguing`, buffer roguing, clean seed adoption, vector control efficacy) over multi-month horizons.
4. **FAO Economics & Impact Assessment**: Translation of epidemiological spread and suppression outputs into agricultural impact indicators such as infected hectares, yield loss, suppression percentages, program costs, and economic deltas.
5. **Uncertainty Cartography (`/api/epi/uncertainty`)**: Spatial interpolation and uncertainty surfaces (kriging mean, variance, and confidence bounds) paired with host crop rasters (`CassavaMap` / `MapSPAM`) and administrative layers.

---

## 2. System Architecture

### Frontend & Dashboard Layer (`src/app`, `src/components`)
- **Dashboard Index (`/dashboards`)**: Renders the multi-view analytical catalog across **CBSD (Nigeria)** and **BBTD (Benin)**, supporting light/dark appearance modes and navigation into individual view configurations.
- **Analytical View & Map Layer**: Each dashboard entry (`DashboardEntry`) encapsulates `metadata` (name, pathosystem, country, phase, description), `permissions` (`orgId`, `ownerId`, `visibility`), `layers` (host rasters, survey points, boundaries, kriging/uncertainty and scenario layers), and `modelState` (viewport center/zoom, active pathosystem/phase, uncertainty cartography and scenario comparison flags).
- **Resilient Client Fetching**: Frontend fetch handlers read response text first, check `res.ok`, and safely fall back to empty structures rather than letting empty or error responses trigger `JSON.parse` / `Response.json()` syntax errors across browsers.

### API Route Layer (`src/app/api/**`)
- **Dashboard CRUD (`/api/dashboards`, `/api/dashboards/[dashboardId]`)**: Lists, creates, retrieves, updates, and deletes `DashboardEntry` records via the configured persistence adapter.
- **Epidemiological & Spatial Endpoints (`/api/observatory/ingest`, `/api/epi/abc-smc`, `/api/epi/scenario`, `/api/epi/uncertainty`)**: Accept observation batches, inference parameters, scenario definitions, and confidence thresholds, returning structured analytical results or safe fallbacks when upstream data is sparse.

### Persistence Layer (`src/lib/persistence`)
- **Adapter Contract (`adapter.ts`) & Factory (`factory.ts`)**: Exposes a singleton persistence interface (`createAdapter()`) used across API routes so dashboard entries, field observations, inference runs, scenarios, and uncertainty fields share a consistent contract.
- **JSON Store Adapter (`kv-adapter.ts`)**: Persists structured collections (`dashboards`, `observations`, `inferenceRuns`, `scenarios`, `uncertaintyFields`) to disk outside `.next/` (e.g., `.data/rapid-kv-store.json`) with safe empty-store fallbacks on missing or malformed files.

---

## 3. Seeded Analytical Views (CBSD Nigeria & BBTD Benin)

| Pathosystem & Region | Phase / View | Analytical Focus | Typical Layers & Capabilities |
| :--- | :--- | :--- | :--- |
| **CBSD (Nigeria)** | Phase 1 | CBSD initial detection | Host density raster, sentinel sites, initial ABC-SMC inference |
| **CBSD (Nigeria)** | Phase 2 | CBSD delimitation surveys | Survey points (`CBSD-NG-*`), host layer, boundaries |
| **CBSD (Nigeria)** | Phase 3 | CBSD risk map | Spatial uncertainty cartography (`mean`, `variance`, bounds) |
| **CBSD (Nigeria)** | Phase 4 | CBSD no intervention scenario | Unmitigated baseline spread and yield/area impact |
| **CBSD (Nigeria)** | Phase 5 | CBSD management interventions | Clean seed + roguing + vector control vs. baseline & economics |
| **BBTD (Benin)** | Survey | BBTD delimiting surveys | *Musa* spp. survey records (`BBTD-BJ-*`) & host layer |
| **BBTD (Benin)** | Current | BBTD Current spread | Active foci, host layer, and spatial uncertainty |
| **BBTD (Benin)** | Forecast (Baseline) | BBTD Future spread, no control | Baseline spread projection and economic impact |
| **BBTD (Benin)** | Forecast (Control) | BBTD Future spread, controls | Controlled spread trajectory and suppression comparison |

---

## 4. What Building & Stabilizing This Entailed

1. **Restoring Domain Persistence Methods**: Reconciling route calls (`listDashboards`, `createDashboard`, `getDashboard`, `saveDashboard`, `deleteDashboard`, `listObservations`, `saveObservations`, etc.) with `KVAdapter` so API routes do not fail with missing-method runtime errors.
2. **Safe JSON Parsing & Error Boundaries**: Guarding `Response.json()` calls against empty `500` or non-JSON bodies so clients do not throw unhandled JSON syntax errors.
3. **Separating Runtime State from Build/Watch Directories**: Keeping the KV store outside `.next/` (in `.data/rapid-kv-store.json`) and excluding `.data/` and `.next/` from Git commits to avoid Turbopack file-watch loops and repository bloat.
4. **End-to-End Pipeline & Dashboard Seeding**: Coordinating `scripts/seed_dummy_pipeline.py` (which posts observations, ABC-SMC runs, scenarios, and uncertainty fields) with `DashboardEntry` creation so `GET /api/dashboards` returns the full set of populated views.
