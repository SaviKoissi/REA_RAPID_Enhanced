# Installation & Deployment Guide — RAPID WAVE

[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.6-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5_20.x-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-%E2%89%A5_3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![PostGIS & Cloudflare KV](https://img.shields.io/badge/Storage-PostGIS_%7C_Cloudflare_KV-F38020?style=flat-square&logo=cloudflare&logoColor=white)]()

This guide covers local installation, baseline spatial data preparation, database configuration, and production deployment for the **RAPID WAVE** biosecurity decision-support platform (`REA_RAPID_Enhanced`).

---

## 1. Prerequisites

Ensure the following tools are installed on your machine:

* **Node.js** `>= 20.0` and **npm** `>= 10.0`
* **Python** `>= 3.11` (for baseline MapSPAM raster clipping and scientific scripts)
* **Git**
* *(Optional for Production/Persistent Storage)* **PostgreSQL 15+ with PostGIS** and **Redis**, or a **Cloudflare Workers KV** namespace (`rapid_dashboards_kv`)

---

## 2. Clone & Install Dependencies

```bash
# 1. Clone the repository
git clone [https://github.com/SaviKoissi/REA_RAPID_Enhanced.git](https://github.com/SaviKoissi/REA_RAPID_Enhanced.git)
cd REA_RAPID_Enhanced

# 2. Install Node.js frontend & API dependencies
npm install

# 3. (Optional) Set up Python environment for host crop raster processing
python3 -m venv .venv
source .venv/bin/activate
pip install numpy scipy rasterio geopandas requests≈
