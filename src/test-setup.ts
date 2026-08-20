/**
 * vitest setup — runs before every unit test file.
 *
 * Node 26 ships an experimental `globalThis.localStorage` that stays inert
 * unless the process was started with `--localstorage-file`. vitest's jsdom
 * environment deliberately does not overwrite globals Node already defines, so
 * jsdom's own `Storage` never lands and app code that touches `localStorage`
 * gets `undefined`. Install a plain in-memory Storage in that case so tests see
 * browser behaviour.
 */

function createMemoryStorage(): Storage {
  let store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear() { store = new Map() },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null },
    key(index: number) { return Array.from(store.keys())[index] ?? null },
    removeItem(key: string) { store.delete(key) },
    setItem(key: string, value: string) { store.set(key, String(value)) },
  } as Storage
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const existing = (globalThis as Partial<Record<typeof name, Storage>>)[name]
  if (!existing || typeof existing.getItem !== 'function') {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      writable: true,
      configurable: true,
    })
  }
}
