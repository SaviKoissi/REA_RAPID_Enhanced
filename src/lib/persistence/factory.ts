import { KVAdapter } from "./kv-adapter"
import { PostgresAdapter } from "./postgres-adapter"
import { PersistenceAdapter } from "./adapter"

const globalForPersistence = globalThis as unknown as {
  __rapidWaveAdapter?: PersistenceAdapter
}

export function createAdapter(): PersistenceAdapter {
  if (!globalForPersistence.__rapidWaveAdapter) {
    const usePostgres = process.env.USE_POSTGRES === "true" || !!process.env.DATABASE_URL
    globalForPersistence.__rapidWaveAdapter = usePostgres
      ? new PostgresAdapter()
      : new KVAdapter()
  }
  return globalForPersistence.__rapidWaveAdapter
}
