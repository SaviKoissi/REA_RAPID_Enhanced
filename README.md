# RAPID WAVE — Regional Biosecurity & Epidemiological Decision-Support Platform

[![Framework: Next.js 16](https://img.shields.io/badge/Framework-Next.js_16_(Turbopack)-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Language: TypeScript & Python](https://img.shields.io/badge/Stack-TypeScript_%7C_Python_3-3178C6?style=flat-square&logo=typescript&logoColor=white)]()
[![Database: PostgreSQL / PostGIS & Cloudflare KV](https://img.shields.io/badge/Storage-PostGIS_%7C_Cloudflare_KV-F38020?style=flat-square&logo=cloudflare&logoColor=white)]()
[![Inference: Spatial SEIR-IBM & ABC-SMC](https://img.shields.io/badge/Inference-Spatial_SEIR--IBM_%7C_ABC--SMC-6A1B9A?style=flat-square)]()
[![Baseline Layer: MapSPAM (Nature Sci Data)](https://img.shields.io/badge/Host_Layer-MapSPAM_(10.1038%2Fs41597--020--0501--z)-2E7D32?style=flat-square)](https://www.nature.com/articles/s41597-020-0501-z)
[![Sampling Optimization: PLOS ONE](https://img.shields.io/badge/Surveillance-PLOS_ONE_0304656-00838F?style=flat-square)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0304656)
[![Pathosystems: CBSD & BBTD](https://img.shields.io/badge/Pathosystems-CBSD_(Nigeria)_%7C_BBTD_(Benin)-C62828?style=flat-square)]()

---

## 1. Overview

**RAPID WAVE** is a modular, credential-based plant biosecurity web platform designed for real-time surveillance, data assimilation, spatial epidemic forecasting, and economic intervention analysis across West and Central Africa.

Built to operationalize field observatory data for high-consequence plant diseases—including **Cassava Brown Streak Disease (CBSD)** in Nigeria and **Banana Bunchy Top Disease (BBTD)** in Benin—the platform guides epidemiologists and policy decision-makers across five analytical phases:

1. **Phase 1 — Initial Detection & Situational Awareness:** Real-time mapping of index cases, diagnostic confidence, and proximity to high-density host production clusters.
2. **Phase 2A — Optimal Delimitation Surveillance Design:** Resource-constrained spatial sampling optimization maximizing detection probability and information gain (*PLOS ONE*, `10.1371/journal.pone.0304656`).
3. **Phase 2B — Data Assimilation & Epidemic State Estimation:** Parameterization of a spatially explicit **SEIR Individual-Based Model (IBM)** via **Approximate Bayesian Computation Sequential Monte Carlo (ABC-SMC)** to quantify current prevalence and 95% credible intervals.
4. **Phase 3A — Forward Spread Forecasting & Intervention Evaluation:** Stochastic ensemble projections comparing *Status Quo (No Control)* against management portfolios (roguing, clean planting material, quarantine zones, vector control, intensified surveillance).
5. **Phase 3B — Economic Impact & Cost-Effectiveness:** Coupling physical yield-loss trajectories with **FAO / FAOSTAT** valuation methodologies to rank interventions by Net Present Value (NPV), Benefit-Cost Ratio (BCR), and Marginal Cost per Hectare Protected.

---

## 2. Repository Structure

```text
REA_RAPID_Enhanced/
├── AGENTS.md                        # Agentic engineering & architectural conventions
├── eslint.config.mjs                # ESLint flat configuration
├── next.config.ts                   # Next.js 16 + Turbopack configuration
├── package.json                     # Node.js dependencies and scripts
├── tsconfig.json                    # TypeScript compiler configuration
├── README.md                        # Project documentation
│
├── public/                          # Static assets and vector icons
│
├── scripts/                         # Geospatial & data preparation utilities
│   └── fetch_host_layer.py          # Clips & reprojects MapSPAM host rasters (s41597-020-0501-z)
│
└── src/
    ├── app/                         # Next.js App Router (UI pages & REST API endpoints)
    │   ├── api/
    │   │   ├── auth/login/route.ts          # Credential-based authentication & RBAC session issuance
    │   │   ├── dashboards/
    │   │   │   ├── route.ts                 # List & create analytical dashboard cards
    │   │   │   └── [key]/route.ts           # Retrieve, update, or delete specific dashboard KV entries
    │   │   ├── epi/
    │   │   │   ├── abc-smc/route.ts         # Trigger & query ABC-SMC posterior inference jobs
    │   │   │   ├── scenario/route.ts        # Run counterfactual spread & FAO economic simulations
    │   │   │   └── uncertainty/route.ts     # Serve spatial credible intervals & exceedance probabilities
    │   │   ├── files/route.ts               # Upload & version survey datasets, rasters, and model artifacts
    │   │   ├── observatory/
    │   │   │   ├── route.ts                 # Query standardized field observatory records
    │   │   │   └── ingest/route.ts          # Validate & ingest CSV/GeoJSON field surveillance batches
    │   │   └── organisations/route.ts       # Multi-tenant organization & permission management
    │   │
    │   ├── dashboards/
    │   │   ├── page.tsx                     # Searchable 9-card bilingual analytical gallery
    │   │   ├── [dashboardId]/page.tsx       # Interactive map, uncertainty layers & scenario sandbox
    │   │   ├── module-1/page.tsx            # Phase 1: Initial detection & situational awareness view
    │   │   └── module-2/page.tsx            # Phase 2A: Optimal delimitation sampling planner
    │   │
    │   ├── files/page.tsx                   # Dataset & spatial layer repository manager
    │   ├── organisation/page.tsx            # Organization members & RBAC role administration
    │   ├── globals.css                      # Tailwind CSS 4 theme & Leaflet overrides
    │   ├── layout.tsx                       # Root layout & bilingual shell wrapper
    │   └── page.tsx                         # Entry redirect & authentication gate
    │
    ├── components/
    │   ├── dashboards/
    │   │   ├── dashboard-card.tsx           # Phase card with live spatial thumbnail & metadata
    │   │   └── dashboard-grid.tsx           # Searchable grid & "+ Create dashboard" trigger
    │   ├── map/
    │   │   ├── map-preview.tsx              # Lightweight Leaflet thumbnail renderer
    │   │   └── map-view.tsx                 # Full interactive multi-layer geospatial map
    │   ├── nav/
    │   │   └── top-nav.tsx                  # Workspace navigation (Dashboards | Files | Organisation)
    │   ├── shell.tsx                        # Authenticated workspace layout shell
    │   └── ui/                              # Reusable accessible UI primitives (Radix / Tailwind)
    │
    ├── lib/
    │   ├── auth/
    │   │   ├── credentials.ts               # RBAC role definitions (Field Scout, Epidemiologist, Policy Maker)
    │   │   └── session.ts                   # Session validation & permission checks
    │   ├── epi/                             # Quantitative epidemiological modeling engines
    │   │   ├── engine.ts                    # Core spatial SEIR-IBM stochastic simulator
    │   │   ├── module1_detection.ts         # Index case metrics & host proximity calculator
    │   │   ├── module2_surveillance.ts      # PLOS ONE 0304656 optimal sampling priority scorer
    │   │   └── module3_assimilation.ts      # ABC-SMC particle filter & posterior summary generator
    │   ├── persistence/                     # Dual-adapter cloud & relational storage layer
    │   │   ├── adapter.ts                   # Storage interface contract
    │   │   ├── factory.ts                   # Runtime adapter selector (KV vs. PostGIS)
    │   │   ├── kv-adapter.ts                # Cloudflare Workers KV REST & local seeded store
    │   │   ├── postgres-adapter.ts          # PostgreSQL + PostGIS spatial persistence adapter
    │   │   └── schema.sql                   # PostGIS tables, GIST spatial indexes & JSONB schemas
    │   ├── i18n.ts                          # Bilingual English / French dictionary
    │   └── utils.ts                         # Shared formatting and validation helpers
    │
    └── types/
        └── index.ts                         # Shared TypeScript interfaces for dashboards, epi & GeoJSON
