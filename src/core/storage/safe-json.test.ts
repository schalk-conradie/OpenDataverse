import { describe, expect, it } from "vitest"

import {
  loadStoredJsonOrDefault,
  parseJsonOrUndefined,
  type JsonStorage,
} from "@/core/storage/safe-json"

function fakeStorage(values: Record<string, string | null>) {
  const removed: string[] = []
  const storage: JsonStorage = {
    getItem(key) {
      return values[key] ?? null
    },
    removeItem(key) {
      removed.push(key)
      values[key] = null
    },
  }

  return { removed, storage }
}

describe("parseJsonOrUndefined", () => {
  it("parses valid JSON values", () => {
    expect(parseJsonOrUndefined('{"publisherPrefix":"new"}')).toEqual({
      publisherPrefix: "new",
    })
  })

  it("returns undefined for malformed JSON", () => {
    expect(parseJsonOrUndefined("{bad json")).toBeUndefined()
  })
})

describe("loadStoredJsonOrDefault", () => {
  it("returns fallback when storage has no value", () => {
    const { removed, storage } = fakeStorage({})
    const fallback = { publisherPrefix: "new" }

    expect(
      loadStoredJsonOrDefault(storage, "config", (value) => value, fallback),
    ).toBe(fallback)
    expect(removed).toEqual([])
  })

  it("parses valid JSON through the provided parser", () => {
    const { removed, storage } = fakeStorage({
      config: '{"publisherPrefix":"abc"}',
    })

    expect(
      loadStoredJsonOrDefault(
        storage,
        "config",
        (value): { parsed: boolean; publisherPrefix?: string } => ({
          ...(value as object),
          parsed: true,
        }),
        { parsed: false, publisherPrefix: "new" },
      ),
    ).toEqual({ publisherPrefix: "abc", parsed: true })
    expect(removed).toEqual([])
  })

  it("removes malformed JSON before returning fallback", () => {
    const { removed, storage } = fakeStorage({ config: "{bad json" })
    const fallback = { publisherPrefix: "new" }

    expect(
      loadStoredJsonOrDefault(storage, "config", (value) => value, fallback),
    ).toBe(fallback)
    expect(removed).toEqual(["config"])
  })
})
