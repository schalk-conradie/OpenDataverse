export function parseJsonOrUndefined(value: string): unknown | undefined {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export type JsonStorage = Pick<Storage, "getItem" | "removeItem">

export function loadStoredJsonOrDefault<TValue>(
  storage: JsonStorage,
  key: string,
  parse: (value: unknown) => TValue,
  fallback: TValue,
) {
  const stored = storage.getItem(key)
  if (!stored) {
    return fallback
  }

  const parsed = parseJsonOrUndefined(stored)
  if (parsed === undefined) {
    storage.removeItem(key)
    return fallback
  }

  return parse(parsed)
}
