import { describe, expect, it } from "vitest"

import type {
  PluginMessageFilterSummary,
  PluginMessageSummary,
} from "@/core/dataverse/schemas"
import {
  getFilteringAttributeSupport,
  parseFilteringAttributes,
  serializeFilteringAttributes,
} from "./filtering-attributes"

const messages: PluginMessageSummary[] = [
  { id: "create", name: "Create" },
  { id: "update", name: "Update" },
]
const filters: PluginMessageFilterSummary[] = [
  {
    id: "update-account",
    messageId: "update",
    primaryEntity: "account",
    isCustomProcessingStepAllowed: true,
  },
]

describe("plug-in step filtering attributes", () => {
  it("supports Update for a specific entity", () => {
    expect(
      getFilteringAttributeSupport(
        messages,
        "update",
        filters,
        "update-account",
      ),
    ).toEqual({
      supported: true,
      entityLogicalName: "account",
    })
  })

  it("explains unsupported messages and global registrations", () => {
    expect(
      getFilteringAttributeSupport(messages, "create", filters, "__none__"),
    ).toEqual({
      supported: false,
      message: "Create does not support filtering attributes.",
    })
    expect(
      getFilteringAttributeSupport(messages, "update", filters, "__none__"),
    ).toEqual({
      supported: false,
      message:
        "Select a specific entity for Update to configure filtering attributes.",
    })
  })

  it("normalizes comma-separated selections", () => {
    expect(parseFilteringAttributes("name, revenue, name,")).toEqual([
      "name",
      "revenue",
    ])
    expect(serializeFilteringAttributes(["revenue", "name", "name"])).toBe(
      "name,revenue",
    )
  })
})
