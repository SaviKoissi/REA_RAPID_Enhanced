import { KVAdapter } from "./kv-adapter"
import { PostgresAdapter } from "./postgres-adapter"
import { PersistenceAdapter } from "./adapter"

export function createAdapter(): PersistenceAdapter {
  const usePostgres = process.env.USE_POSTGRES === "true" || !!process.env.DATABASE_URL
  if (usePostgres) {
    return new PostgresAdapter()
  }
  return new KVAdapter()
}

export const schemaSql = `
-- Run against PostgreSQL + PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS dashboards (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ GENERATED ALWAYS AS ((payload->>'updatedAt')) STORED
);
CREATE INDEX IF NOT EXISTS idx_dashboards_org ON dashboards ((payload->>'orgId'));
CREATE INDEX IF NOT EXISTS idx_dashboards_pathosystem ON dashboards ((payload->>'metadata'->>'pathosystem'));
CREATE INDEX IF NOT EXISTS idx_dashboards_phase ON dashboards ((payload->>'metadata'->>'phase'));

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users ((payload->>'email'));

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_org ON files ((payload->>'orgId'));

CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  sample_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  host_crop TEXT NOT NULL,
  diagnostic_status TEXT NOT NULL,
  vector_density DOUBLE PRECISION NOT NULL DEFAULT 0,
  survey_effort DOUBLE PRECISION NOT NULL DEFAULT 1,
  org_id TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  notes TEXT,
  geom geometry(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_observations_org ON observations(org_id);
CREATE INDEX IF NOT EXISTS idx_observations_date ON observations(date);
CREATE INDEX IF NOT EXISTS idx_observations_geom ON observations USING GIST(geom);
`
