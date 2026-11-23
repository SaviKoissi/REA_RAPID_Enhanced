import { KVAdapter } from "./kv-adapter"
import type { PersistenceAdapter } from "./adapter"

let singleton: PersistenceAdapter | null = null

export function createAdapter(): PersistenceAdapter {
  if (!singleton) {
    singleton = new KVAdapter()
  }
  return singleton
}
