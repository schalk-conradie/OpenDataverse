import { describe, expect, it } from "vitest"

import type { DataverseEnvironment } from "@/core/dataverse/schemas"
import {
  getPluginRegistrationSnapshot,
  listPluginFilteringAttributes,
  listPluginStepImages,
  listPluginSteps,
  listPluginTypes,
  setPluginComponentState,
} from "@/modules/plugin-registration/gateway"

const environment: DataverseEnvironment = {
  id: "browser-preview",
  name: "Browser Preview",
  url: "https://preview.crm.dynamics.com",
  authState: "disconnected",
}

describe("plugin-registration browser-preview gateway", () => {
  it("keeps snapshot hierarchy identifiers aligned", async () => {
    const snapshot = await getPluginRegistrationSnapshot(environment)
    const assembly = snapshot.assemblies[0]
    if (!assembly) {
      throw new Error("Plugin preview assembly is missing")
    }

    const types = await listPluginTypes(environment, assembly.id)
    const pluginType = types[0]
    if (!pluginType) {
      throw new Error("Plugin preview type is missing")
    }

    const steps = await listPluginSteps(environment, {
      pluginTypeId: pluginType.id,
    })
    const step = steps[0]
    if (!step) {
      throw new Error("Plugin preview step is missing")
    }

    const images = await listPluginStepImages(environment, step.id)

    expect(types.every((item) => item.assemblyId === assembly.id)).toBe(true)
    expect(steps.every((item) => item.pluginTypeId === pluginType.id)).toBe(true)
    expect(images.every((item) => item.stepId === step.id)).toBe(true)
  })

  it("returns deterministic browser-preview state-change feedback", async () => {
    await expect(
      setPluginComponentState(environment, {
        componentKind: "assembly",
        id: "assembly-preview",
        enabled: false,
      }),
    ).resolves.toEqual({
      id: "assembly-preview",
      message: "Browser preview disabled the component.",
    })
  })

  it("provides browser-preview filtering attributes", async () => {
    await expect(
      listPluginFilteringAttributes(environment, "account"),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ logicalName: "name" }),
        expect.objectContaining({ logicalName: "revenue" }),
      ]),
    )
  })
})
