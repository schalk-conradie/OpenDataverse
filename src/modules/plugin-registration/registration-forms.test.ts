import { describe, expect, it } from "vitest"

import type { PluginRegistrationSnapshot } from "@/core/dataverse/schemas"
import {
  mockPluginAssemblies,
  mockPluginAssemblyInspection,
  mockPluginRegistrationSnapshot,
  mockPluginServiceEndpoints,
  mockPluginStepImages,
  mockPluginSteps,
  mockPluginTypes,
} from "./mock-data"
import {
  makeAssemblyForm,
  makeEndpointForm,
  makeImageForm,
  makeStepForm,
} from "./registration-forms"

const formSnapshot: PluginRegistrationSnapshot = {
  ...mockPluginRegistrationSnapshot,
  types: mockPluginTypes,
  steps: mockPluginSteps,
  images: mockPluginStepImages,
}

describe("plug-in registration form defaults", () => {
  it("creates a new assembly draft and gives inspection metadata precedence", () => {
    expect(makeAssemblyForm()).toEqual({
      localPath: "",
      name: "",
      version: "1.0.0.0",
      culture: "neutral",
      publicKeyToken: "null",
      isolationMode: 2,
      sourceType: 0,
      description: "",
      solutionUniqueName: "",
    })

    expect(
      makeAssemblyForm(mockPluginAssemblyInspection, mockPluginAssemblies[1]),
    ).toEqual({
      localPath: mockPluginAssemblyInspection.localPath,
      name: mockPluginAssemblyInspection.assemblyName,
      version: mockPluginAssemblyInspection.version,
      culture: mockPluginAssemblyInspection.culture,
      publicKeyToken: mockPluginAssemblyInspection.publicKeyToken,
      isolationMode: mockPluginAssemblies[1].isolationMode,
      sourceType: mockPluginAssemblies[1].sourceType,
      description: mockPluginAssemblies[1].description,
      solutionUniqueName: "",
    })
  })

  it("selects the first loaded handler and message for a new step", () => {
    expect(makeStepForm(formSnapshot)).toEqual({
      stepId: undefined,
      handlerType: "plugintype",
      pluginTypeId: mockPluginTypes[0].id,
      serviceEndpointId: mockPluginServiceEndpoints[0].id,
      messageId: formSnapshot.messages[0].id,
      messageFilterId: "__none__",
      name: "",
      stage: 20,
      mode: 0,
      rank: 1,
      supportedDeployment: 0,
      asyncAutoDelete: false,
      filteringAttributes: "",
      configuration: "",
      secureConfiguration: "",
      impersonatingUserId: "__calling-user__",
      description: "",
      enabled: true,
      solutionUniqueName: "",
    })
  })

  it("maps an existing step while keeping secure configuration write-only", () => {
    const step = mockPluginSteps[1]

    expect(makeStepForm(formSnapshot, step)).toMatchObject({
      stepId: step.id,
      handlerType: step.handlerType,
      pluginTypeId: step.pluginTypeId,
      messageId: step.messageId,
      messageFilterId: step.messageFilterId,
      name: step.name,
      stage: step.stage,
      mode: step.mode,
      rank: step.rank,
      asyncAutoDelete: step.asyncAutoDelete,
      secureConfiguration: "",
      impersonatingUserId: "__calling-user__",
      enabled: false,
      solutionUniqueName: "",
    })
  })

  it("creates and edits image drafts with the existing default alias and target", () => {
    expect(makeImageForm(formSnapshot)).toEqual({
      imageId: undefined,
      stepId: mockPluginSteps[0].id,
      name: "",
      entityAlias: "Image",
      imageType: 0,
      messagePropertyName: "Target",
      attributes: "",
      description: "",
      solutionUniqueName: "",
    })

    const image = mockPluginStepImages[0]
    expect(makeImageForm(formSnapshot, image)).toEqual({
      imageId: image.id,
      stepId: image.stepId,
      name: image.name,
      entityAlias: image.entityAlias,
      imageType: image.imageType,
      messagePropertyName: image.messagePropertyName,
      attributes: image.attributes,
      description: image.description,
      solutionUniqueName: "",
    })
  })

  it("uses option metadata for new endpoints and never pre-fills the auth secret", () => {
    expect(makeEndpointForm(formSnapshot)).toMatchObject({
      contract: formSnapshot.endpointContractOptions[0].value,
      authType: formSnapshot.endpointAuthTypeOptions[0].value,
      messageFormat: 2,
      authValue: "",
    })

    const withoutOptions: PluginRegistrationSnapshot = {
      ...formSnapshot,
      endpointContractOptions: [],
      endpointAuthTypeOptions: [],
    }
    expect(makeEndpointForm(withoutOptions)).toMatchObject({
      contract: 8,
      authType: 4,
    })

    const endpoint = mockPluginServiceEndpoints[0]
    expect(makeEndpointForm(formSnapshot, endpoint)).toEqual({
      endpointId: endpoint.id,
      name: endpoint.name,
      contract: endpoint.contract,
      authType: endpoint.authType,
      url: endpoint.url,
      path: "",
      namespaceAddress: "",
      messageFormat: endpoint.messageFormat,
      authValue: "",
      description: endpoint.description,
      solutionUniqueName: "",
    })
  })
})
