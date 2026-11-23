# Adding a New Capability to RAPID WAVE

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Pipeline](https://img.shields.io/badge/Pipeline-Seed%20%2B%20API%20%2B%20Dashboard-0F766E)](#3-integrating-into-the-existing-pipeline)

This guide explains how to extend **RAPID WAVE** with a new analytical or operational capability—covering file creation, persistence and API wiring, pipeline integration, and running analyses.

---

## 1. Files to Create and Update

When introducing a new capability (for example, `vector_dispersal` or `climate_suitability`), create and connect the following files:

### A. Files to Create
1. **API Route Handler (`src/app/api/<capability>/route.ts`)**
   - Implements `GET` and `POST` handlers using Next.js route conventions (`export const dynamic = "force-dynamic"`).
   - Validates incoming payloads, delegates reads/writes to `createAdapter()`, and returns structured JSON (with safe fallback responses when optional fields or records are absent).
2. **Capability Analysis / Computation Module (`src/lib/epi/<capability>.ts` or `scripts/run_<capability>.py`)**
   - Houses pure/reproducible domain logic (parameter validation, spatial/temporal or economic calculations, summary statistics) isolated from HTTP request handling.
3. **Dashboard UI Panel or Layer Renderer (`src/components/dashboards/<capability>-panel.tsx`)**
   - Renders the capability's outputs (charts, metrics, raster/GeoJSON layers, or summary cards) inside dashboard views and handles empty/loading states cleanly.

### B. Files to Update
- **`src/types/index.ts`** (or your domain types file): Add TypeScript interfaces for the capability's request payload, stored record, and analytical output.
- **`src/lib/persistence/adapter.ts` & `src/lib/persistence/kv-adapter.ts`**: Add collection storage and retrieval methods (e.g., `list<Capability>Runs`, `save<Capability>Run`) on `PersistenceAdapter` and `KVAdapter` using safe JSON read/write helpers outside `.next/`.
- **`src/app/dashboards/page.tsx`** (and view detail components): Wire the capability state/layers into the dashboard view model using safe `.text()` + `JSON.parse()` guards.

---

## 2. Step-by-Step: Creating a New Capability

### Step 1: Define Types & Persistence Methods
- Declare `<Capability>Input` and `<Capability>Result` interfaces in `src/types/index.ts`.
- Add `list<Capability>Results(orgId?: string)` and `save<Capability>Result(result)` to `PersistenceAdapter` (`src/lib/persistence/adapter.ts`) and implement both in `KVAdapter` (`src/lib/persistence/kv-adapter.ts`).

### Step 2: Implement the API Endpoint (`src/app/api/<capability>/route.ts`)
- Parse request JSON safely (`await req.json().catch(() => ({}))`).
- Load any prerequisite records (such as observations via `adapter.listObservations()`) if the capability depends on field surveys.
- Compute or retrieve the result, persist it via the adapter, and return `NextResponse.json(...)` with appropriate status codes (`200` / `201`, and `400`/`500` structured errors only on invalid/unrecoverable failures).

### Step 3: Surface Outputs on the Dashboard
- Attach capability metadata, layer IDs, or result references to `DashboardEntry` (`layers` and `modelState`).
- Render a dedicated section or layer toggle in your dashboard UI so each pathosystem view (`CBSD` in Nigeria, `BBTD` in Benin) displays relevant capability outputs without causing re-render loops.

---

## 3. Integrating into the Existing Pipeline

To make a new capability part of standard local seeding and verification:

1. **Add a Seeding Step in `scripts/seed_dummy_pipeline.py`**
   - Add a helper call using `api("POST", "/api/<capability>", payload)` after observation ingestion so prerequisite records (`CBSD-NG-*`, `BBTD-BJ-*`) are already persisted.
   - Log HTTP status and key output fields (`print(f"[Capability N - ...] HTTP {code} -> ...")`) just like existing capabilities (`ABC-SMC`, `Scenario + FAO Economics`, `Uncertainty Cartography`).
2. **Attach Capability Layers / State to Seeded Dashboards**
   - Include the capability's layer identifier or `modelState` flag in the `views` definitions created via `POST /api/dashboards` so cards reflect the new capability immediately after seeding.
3. **Verify End-to-End via Bash**
   - Run `python3 scripts/seed_dummy_pipeline.py` and query `GET /api/dashboards` and `GET /api/<capability>` to confirm `HTTP 200` and non-empty payloads.

---

## 4. When Analysis Should Be Run — How to Add & Execute It

Some capabilities only store or query static/ingested data, while others require **running an analytical computation** (e.g., parameter inference, spatial kriging/interpolation, multi-horizon scenario simulation, or economic impact modeling).

### When to Trigger Analysis
- **On-Demand via API (`POST /api/<capability>`)**: When a user or pipeline submits new observations, changes parameters (`horizonMonths`, thresholds, kernels, confidence levels), or requests a fresh run.
- **Batch / Scheduled Pipeline Runs**: When processing full regional datasets (`CBSD` Nigeria / `BBTD` Benin) or running heavier numerical routines before refreshing dashboard state.

### How to Add Analysis Execution
1. **Separate Runner Logic from Route Handlers**
   - Put mathematical/statistical routines in a dedicated module (e.g., `src/lib/epi/<capability>.ts` for fast TypeScript execution or a Python worker/script invoked cleanly with explicit inputs/outputs).
2. **Define Deterministic & Bounded Execution Parameters**
   - Accept explicit run parameters (`seed`, `particles` / `iterations`, `horizonMonths`, `confidence`) with sensible defaults so runs finish reliably within request timeouts or batch steps.
3. **Persist Both Inputs/Metadata and Analytical Outputs**
   - Save each run (`id`, `pathosystem`, `parameters`, `summaryMetrics`, `createdAt`) through `KVAdapter` so dashboards can display latest results and compare runs without re-computing on every page render.
4. **Hook Analysis into the Seed & Verification Workflow**
   - Call the capability's `POST` endpoint (or analysis script) inside `scripts/seed_dummy_pipeline.py` and assert that computed fields (such as estimates, intervals, or scenario metrics) are present in the response.
