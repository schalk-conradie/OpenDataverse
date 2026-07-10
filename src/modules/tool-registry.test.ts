import { describe, expect, it } from "vitest"

import { getToolDefinition, toolRegistry } from "@/modules/tool-registry"

describe("tool registry", () => {
  it("owns one renderable definition for every registered tool id", () => {
    const ids = toolRegistry.map((tool) => tool.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (const tool of toolRegistry) {
      expect(getToolDefinition(tool.id)).toBe(tool)
      expect(tool.component).toBeDefined()
      expect(tool.title.length).toBeGreaterThan(0)
    }
  })
})
