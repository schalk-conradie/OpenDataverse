export function parseJsonOrUndefined(value: string): unknown | undefined {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
