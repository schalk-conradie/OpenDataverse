import { describe, expect, it } from "vitest"

import { parseJsonOrUndefined } from "@/core/storage/safe-json"

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
