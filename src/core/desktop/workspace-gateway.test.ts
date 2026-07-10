import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultAppConfig } from "@/core/dataverse/schemas"
import {
  loadAppConfig,
  saveAppConfig,
} from "@/core/desktop/workspace-gateway"

function memoryStorage() {
  const values = new Map<string, string>()

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      values.set(key, value)
    },
    removeItem(key: string): void {
      values.delete(key)
    },
  }
}

describe("browser workspace gateway", () => {
  const localStorage = memoryStorage()

  beforeEach(() => {
    localStorage.removeItem("opendataverse.config")
    vi.stubGlobal("window", { localStorage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("round-trips validated application config", async () => {
    const config = {
      ...defaultAppConfig,
      currentEnvironmentId: "dev",
      environments: [
        {
          id: "dev",
          name: "Development",
          url: "https://dev.crm.dynamics.com",
          authState: "connected" as const,
        },
      ],
    }

    await saveAppConfig(config)

    await expect(loadAppConfig()).resolves.toEqual(config)
  })

  it("recovers from invalid persisted config", async () => {
    localStorage.setItem("opendataverse.config", "{not-json")

    await expect(loadAppConfig()).resolves.toEqual(defaultAppConfig)
    expect(localStorage.getItem("opendataverse.config")).toBeNull()
  })
})
