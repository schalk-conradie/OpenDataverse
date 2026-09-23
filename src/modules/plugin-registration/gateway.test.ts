import { describe, expect, it } from "vitest"

import type { DataverseEnvironment } from "@/core/dataverse/schemas"
import {
  getPluginRegistrationSnapshot,
  listPluginFilteringAttributes,
  listPluginStepImages,
  listPluginSteps,
  listPluginTypes,
  registerPluginPackage,
  registerPluginStep,
  setPluginComponentState,
  unregisterPluginPackage,
  unregisterPluginStep,
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

  it("shows registered packages, assemblies, and types in the browser preview", async () => {
    const registration = await registerPluginPackage(environment, {
      localPath: "/workspace/bin/new_PreviewPluginPackage.1.0.0.nupkg",
      solutionUniqueName: "PreviewSolution",
    })
    if (!registration.id) throw new Error("Preview package id is missing")

    try {
      const snapshot = await getPluginRegistrationSnapshot(environment)
      const assembly = snapshot.assemblies.find(
        (item) => item.packageId === registration.id,
      )
      if (!assembly) throw new Error("Preview package assembly is missing")
      expect(snapshot.packages.some((item) => item.id === registration.id)).toBe(true)
      expect(assembly.name).toBe("new_PreviewPluginPackage")
      expect((await listPluginTypes(environment, assembly.id)).some(
        (item) => item.packageId === registration.id,
      )).toBe(true)
    } finally {
      await unregisterPluginPackage(environment, registration.id)
    }
  })

  it("reads a newly registered step from its selected plug-in type", async () => {
    const snapshot = await getPluginRegistrationSnapshot(environment)
    const pluginType = (await listPluginTypes(environment, snapshot.assemblies[0].id))[0]
    const message = snapshot.messages.find((item) => item.name === "Create")
    if (!pluginType || !message) throw new Error("Preview registration data is missing")
    const registration = await registerPluginStep(environment, {
      handlerType: "plugintype",
      pluginTypeId: pluginType.id,
      messageId: message.id,
      name: `${pluginType.typeName}: Create of account`,
      stage: 20,
      mode: 0,
      rank: 1,
      supportedDeployment: 0,
      enabled: true,
    })
    if (!registration.id) throw new Error("Preview step id is missing")

    try {
      expect((await listPluginSteps(environment, { pluginTypeId: pluginType.id }))
        .some((item) => item.id === registration.id && item.messageName === "Create"))
        .toBe(true)
    } finally {
      await unregisterPluginStep(environment, registration.id)
    }
  })
})
