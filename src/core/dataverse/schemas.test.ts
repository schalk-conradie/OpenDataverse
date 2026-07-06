import { describe, expect, it } from "vitest"

import {
  sortEnvironmentsByName,
  userSettingsSchema,
} from "@/core/dataverse/schemas"

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

describe("sortEnvironmentsByName", () => {
  it("orders environments alphabetically by name without mutating the source", () => {
    const environments = [
      {
        id: "environment-3",
        name: "STS Dev",
        url: "https://sts.crm.dynamics.com",
        authState: "connected" as const,
      },
      {
        id: "environment-1",
        name: "agi - QA",
        url: "https://agiqa.crm.dynamics.com",
        authState: "connected" as const,
      },
      {
        id: "environment-2",
        name: "AGI - Dev",
        url: "https://agidev.crm.dynamics.com",
        authState: "connected" as const,
      },
    ]

    const sorted = sortEnvironmentsByName(environments)

    expect(sorted.map((environment) => environment.name)).toEqual([
      "AGI - Dev",
      "agi - QA",
      "STS Dev",
    ])
    expect(environments.map((environment) => environment.name)).toEqual([
      "STS Dev",
      "agi - QA",
      "AGI - Dev",
    ])
  })
})
