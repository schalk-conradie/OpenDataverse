import { describe, expect, it } from "vitest"

import { userSettingsSchema } from "@/core/dataverse/schemas"

describe("userSettingsSchema", () => {
  it("preserves appearance theme and mode settings", () => {
    const settings = userSettingsSchema.parse({
      appearance: {
        darkMode: false,
        mode: "light",
        theme: "catppuccin",
      },
      dangerZone: {
        experimentalAiAgentEnabled: true,
      },
    })

    expect(settings.appearance).toEqual({
      darkMode: false,
      mode: "light",
      theme: "catppuccin",
    })
    expect(settings.dangerZone.experimentalAiAgentEnabled).toBe(true)
  })

  it("migrates legacy dark mode settings when mode is absent", () => {
    const settings = userSettingsSchema.parse({
      appearance: {
        darkMode: true,
      },
      dangerZone: {},
    })

    expect(settings.appearance).toEqual({
      darkMode: true,
      mode: "dark",
      theme: "opendataverse",
    })
  })
})
