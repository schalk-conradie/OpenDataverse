import { describe, expect, it } from "vitest"

import type { WebResource } from "@/core/dataverse/schemas"
import { isWebResourceEditable } from "./resource-presentation"

function resource(overrides: Partial<WebResource> = {}): WebResource {
  return {
    id: "resource-id",
    name: "new_/scripts/main.js",
    type: "js",
    version: "1",
    isManaged: false,
    solution: "OpenDataverse",
    ...overrides,
  }
}

describe("isWebResourceEditable", () => {
  it("allows customizable managed resources", () => {
    expect(
      isWebResourceEditable(resource({ isManaged: true, isCustomizable: true })),
    ).toBe(true)
  })

  it("keeps non-customizable managed resources read-only", () => {
    expect(
      isWebResourceEditable(resource({ isManaged: true, isCustomizable: false })),
    ).toBe(false)
    expect(isWebResourceEditable(resource({ isManaged: true }))).toBe(false)
  })

  it("allows unmanaged resources", () => {
    expect(isWebResourceEditable(resource())).toBe(true)
  })
})
