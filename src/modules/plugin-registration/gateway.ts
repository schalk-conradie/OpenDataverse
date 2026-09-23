import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/runtime"
import {
  type CreatePluginTypeInput,
  type DataverseEnvironment,
  type PluginAssemblyInspection,
  type PluginAssemblySummary,
  type PluginDependencyReport,
  type PluginExportInput,
  type PluginFilteringAttributeSummary,
  type PluginMessageFilterSummary,
  type PluginMessageSummary,
  type PluginPackageSummary,
  type PluginPackageInspection,
  type PluginRegistrationSnapshot,
  type PluginServiceEndpointSummary,
  type PluginStepSummary,
  type PluginStepImageSummary,
  type PluginSystemUserSummary,
  type PluginTypeSummary,
  type PluginWriteResult,
  type RegisterPluginAssemblyInput,
  type RegisterPluginPackageInput,
  type RegisterPluginServiceEndpointInput,
  type RegisterPluginStepInput,
  type RegisterPluginStepImageInput,
  type SolutionSummary,
  type UpdatePluginAssemblyInput,
  type UpdatePluginPackageInput,
  createPluginTypeInputSchema,
  pluginExportInputSchema,
  registerPluginAssemblyInputSchema,
  registerPluginPackageInputSchema,
  registerPluginServiceEndpointInputSchema,
  registerPluginStepImageInputSchema,
  registerPluginStepInputSchema,
  updatePluginAssemblyInputSchema,
  updatePluginPackageInputSchema,
} from "@/core/dataverse/schemas"

export async function listPluginRegistrationSolutions(
  environment: DataverseEnvironment,
): Promise<SolutionSummary[]> {
  if (isTauriRuntime()) {
    return invoke<SolutionSummary[]>("list_solutions", {
      environment,
      managedFilter: "unmanaged",
    })
  }

  return [{
    id: "plugin-preview-solution",
    uniqueName: "PreviewSolution",
    friendlyName: "Preview solution",
    version: "1.0.0.0",
    isManaged: false,
    isVisible: true,
    publisherPrefix: "new",
  }]
}

export async function listPluginAssemblies(
  environment: DataverseEnvironment,
): Promise<PluginAssemblySummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginAssemblySummary[]>("list_plugin_assemblies", {
      environment,
    })
  }

  const { mockUnmanagedPluginAssemblies } = await import(
    "./mock-data"
  )
  return mockUnmanagedPluginAssemblies
}

export async function listPluginPackages(
  environment: DataverseEnvironment,
): Promise<PluginPackageSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginPackageSummary[]>("list_plugin_packages", {
      environment,
    })
  }

  const { mockUnmanagedPluginPackages } = await import(
    "./mock-data"
  )
  return mockUnmanagedPluginPackages
}

export async function listPluginTypes(
  environment: DataverseEnvironment,
  assemblyId?: string,
): Promise<PluginTypeSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginTypeSummary[]>("list_plugin_types", {
      environment,
      assemblyId,
    })
  }

  const { mockUnmanagedPluginTypes } = await import(
    "./mock-data"
  )
  return assemblyId
    ? mockUnmanagedPluginTypes.filter(
        (pluginType) => pluginType.assemblyId === assemblyId,
      )
    : mockUnmanagedPluginTypes
}

export async function listPluginSteps(
  environment: DataverseEnvironment,
  filters: {
    pluginTypeId?: string
    serviceEndpointId?: string
  } = {},
): Promise<PluginStepSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginStepSummary[]>("list_plugin_steps", {
      environment,
      pluginTypeId: filters.pluginTypeId,
      serviceEndpointId: filters.serviceEndpointId,
    })
  }

  const { mockUnmanagedPluginSteps } = await import(
    "./mock-data"
  )
  return mockUnmanagedPluginSteps.filter((step) => {
    if (filters.pluginTypeId) {
      return step.pluginTypeId === filters.pluginTypeId
    }
    if (filters.serviceEndpointId) {
      return step.serviceEndpointId === filters.serviceEndpointId
    }
    return true
  })
}

export async function listPluginStepImages(
  environment: DataverseEnvironment,
  stepId?: string,
): Promise<PluginStepImageSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginStepImageSummary[]>("list_plugin_step_images", {
      environment,
      stepId,
    })
  }

  const { mockUnmanagedPluginStepImages } = await import(
    "./mock-data"
  )
  return stepId
    ? mockUnmanagedPluginStepImages.filter((image) => image.stepId === stepId)
    : mockUnmanagedPluginStepImages
}

export async function listPluginMessages(
  environment: DataverseEnvironment,
): Promise<PluginMessageSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginMessageSummary[]>("list_plugin_messages", {
      environment,
    })
  }

  const { mockPluginMessages } = await import(
    "./mock-data"
  )
  return mockPluginMessages
}

export async function listPluginMessageFilters(
  environment: DataverseEnvironment,
  messageId: string,
): Promise<PluginMessageFilterSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginMessageFilterSummary[]>("list_plugin_message_filters", {
      environment,
      messageId,
    })
  }

  const { mockPluginMessageFilters } = await import(
    "./mock-data"
  )
  return mockPluginMessageFilters.filter((filter) => filter.messageId === messageId)
}

export async function listPluginFilteringAttributes(
  environment: DataverseEnvironment,
  entityLogicalName: string,
): Promise<PluginFilteringAttributeSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginFilteringAttributeSummary[]>(
      "list_plugin_filtering_attributes",
      {
        environment,
        entityLogicalName,
      },
    )
  }

  const { mockPluginFilteringAttributesByEntity } = await import(
    "./mock-data"
  )
  return mockPluginFilteringAttributesByEntity[entityLogicalName] ?? []
}

export async function listPluginServiceEndpoints(
  environment: DataverseEnvironment,
): Promise<PluginServiceEndpointSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginServiceEndpointSummary[]>(
      "list_plugin_service_endpoints",
      { environment },
    )
  }

  const { mockUnmanagedPluginServiceEndpoints } = await import(
    "./mock-data"
  )
  return mockUnmanagedPluginServiceEndpoints
}

export async function listPluginSystemUsers(
  environment: DataverseEnvironment,
): Promise<PluginSystemUserSummary[]> {
  if (isTauriRuntime()) {
    return invoke<PluginSystemUserSummary[]>("list_plugin_system_users", {
      environment,
    })
  }

  const { mockPluginUsers } = await import(
    "./mock-data"
  )
  return mockPluginUsers
}

export async function getPluginRegistrationSnapshot(
  environment: DataverseEnvironment,
): Promise<PluginRegistrationSnapshot> {
  if (isTauriRuntime()) {
    return invoke<PluginRegistrationSnapshot>(
      "get_plugin_registration_snapshot",
      { environment },
    )
  }

  const { mockPluginRegistrationSnapshot } = await import(
    "./mock-data"
  )
  return {
    ...mockPluginRegistrationSnapshot,
    assemblies: [...mockPluginRegistrationSnapshot.assemblies],
    packages: [...mockPluginRegistrationSnapshot.packages],
    endpoints: [...mockPluginRegistrationSnapshot.endpoints],
  }
}

export async function inspectPluginPackage(localPath: string): Promise<PluginPackageInspection> {
  if (isTauriRuntime()) {
    return invoke<PluginPackageInspection>("inspect_plugin_package", { localPath })
  }

  return {
    localPath,
    fileName: localPath.split("/").at(-1) ?? "new_PreviewPluginPackage.1.0.0.nupkg",
    sizeBytes: 16420,
    name: "new_PreviewPluginPackage",
    version: "1.0.0",
    assemblyFiles: ["lib/net462/new_PreviewPluginPackage.dll"],
  }
}

export async function registerPluginPackage(
  environment: DataverseEnvironment,
  input: RegisterPluginPackageInput,
): Promise<PluginWriteResult> {
  const parsed = registerPluginPackageInputSchema.parse(input)
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("register_plugin_package", { environment, input: parsed })
  }

  const {
    mockUnmanagedPluginPackages,
    mockUnmanagedPluginAssemblies,
    mockUnmanagedPluginTypes,
  } = await import("./mock-data")
  const inspection = await inspectPluginPackage(parsed.localPath)
  const solution = (await listPluginRegistrationSolutions(environment)).find(
    (item) => item.uniqueName === parsed.solutionUniqueName,
  )
  if (!solution?.publisherPrefix || !inspection.name.toLowerCase().startsWith(
    `${solution.publisherPrefix.toLowerCase()}_`,
  )) {
    throw new Error("NuGet package id must start with the selected solution's publisher prefix.")
  }
  const id = crypto.randomUUID()
  const assemblyId = crypto.randomUUID()
  const now = new Date().toISOString()
  const editable = { canEdit: true, canDelete: true, reasons: [] }
  mockUnmanagedPluginPackages.push({
    id,
    name: inspection.name,
    version: inspection.version,
    fileName: inspection.fileName,
    isManaged: false,
    createdOn: now,
    modifiedOn: now,
    editable,
  })
  mockUnmanagedPluginAssemblies.push({
    id: assemblyId,
    name: "new_PreviewPluginPackage",
    version: "1.0.0.0",
    isolationMode: 2,
    isolationModeLabel: "Sandbox",
    sourceType: 0,
    sourceTypeLabel: "Database",
    isManaged: false,
    isCustomizable: true,
    packageId: id,
    packageName: inspection.name,
    createdOn: now,
    modifiedOn: now,
    editable,
  })
  mockUnmanagedPluginTypes.push({
    id: crypto.randomUUID(),
    assemblyId,
    assemblyName: "new_PreviewPluginPackage",
    packageId: id,
    packageName: inspection.name,
    name: "new_PreviewPluginPackage.SmokePlugin",
    friendlyName: "SmokePlugin",
    typeName: "new_PreviewPluginPackage.SmokePlugin",
    isWorkflowActivity: false,
    isManaged: false,
    isCustomizable: true,
    createdOn: now,
    modifiedOn: now,
    editable,
  })
  return { id, message: `Browser preview registered ${inspection.name}.` }
}

export async function updatePluginPackage(
  environment: DataverseEnvironment,
  input: UpdatePluginPackageInput,
): Promise<PluginWriteResult> {
  const parsed = updatePluginPackageInputSchema.parse(input)
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("update_plugin_package", { environment, input: parsed })
  }

  const { mockUnmanagedPluginPackages } = await import("./mock-data")
  const inspection = await inspectPluginPackage(parsed.localPath)
  const item = mockUnmanagedPluginPackages.find((candidate) => candidate.id === parsed.packageId)
  if (!item || item.name !== inspection.name || item.version !== inspection.version) {
    throw new Error("The package id and version must match the existing registration.")
  }
  item.fileName = inspection.fileName
  item.modifiedOn = new Date().toISOString()
  return { id: item.id, message: `Browser preview updated ${item.name}.` }
}

export async function unregisterPluginPackage(
  environment: DataverseEnvironment,
  packageId: string,
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("unregister_plugin_package", { environment, packageId })
  }

  const {
    mockUnmanagedPluginPackages,
    mockUnmanagedPluginAssemblies,
    mockUnmanagedPluginTypes,
    mockUnmanagedPluginSteps,
    mockUnmanagedPluginStepImages,
  } = await import("./mock-data")
  const packageIndex = mockUnmanagedPluginPackages.findIndex((item) => item.id === packageId)
  if (packageIndex >= 0) mockUnmanagedPluginPackages.splice(packageIndex, 1)
  const assemblyIds = new Set(mockUnmanagedPluginAssemblies
    .filter((item) => item.packageId === packageId).map((item) => item.id))
  for (let index = mockUnmanagedPluginAssemblies.length - 1; index >= 0; index--) {
    if (assemblyIds.has(mockUnmanagedPluginAssemblies[index].id)) {
      mockUnmanagedPluginAssemblies.splice(index, 1)
    }
  }
  const typeIds = new Set(mockUnmanagedPluginTypes
    .filter((item) => assemblyIds.has(item.assemblyId)).map((item) => item.id))
  for (let index = mockUnmanagedPluginTypes.length - 1; index >= 0; index--) {
    if (typeIds.has(mockUnmanagedPluginTypes[index].id)) {
      mockUnmanagedPluginTypes.splice(index, 1)
    }
  }
  for (let index = mockUnmanagedPluginSteps.length - 1; index >= 0; index--) {
    if (typeIds.has(mockUnmanagedPluginSteps[index].pluginTypeId ?? "")) {
      const [step] = mockUnmanagedPluginSteps.splice(index, 1)
      for (let imageIndex = mockUnmanagedPluginStepImages.length - 1; imageIndex >= 0; imageIndex--) {
        if (mockUnmanagedPluginStepImages[imageIndex].stepId === step.id) {
          mockUnmanagedPluginStepImages.splice(imageIndex, 1)
        }
      }
    }
  }
  return { id: packageId, message: "Browser preview unregistered the package." }
}

export async function inspectPluginAssembly(
  localPath: string,
): Promise<PluginAssemblyInspection> {
  if (isTauriRuntime()) {
    return invoke<PluginAssemblyInspection>("inspect_plugin_assembly", {
      localPath,
    })
  }

  const { mockPluginAssemblyInspection } = await import(
    "./mock-data"
  )
  return {
    ...mockPluginAssemblyInspection,
    localPath,
    fileName: localPath.split("/").at(-1) ?? mockPluginAssemblyInspection.fileName,
  } satisfies PluginAssemblyInspection
}

export async function registerPluginAssembly(
  environment: DataverseEnvironment,
  input: RegisterPluginAssemblyInput,
): Promise<PluginWriteResult> {
  const parsed = registerPluginAssemblyInputSchema.parse(input)

  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("register_plugin_assembly", {
      environment,
      input: parsed,
    })
  }

  const {
    mockUnmanagedPluginAssemblies,
    mockUnmanagedPluginTypes,
    mockPluginAssemblyInspection,
  } = await import("./mock-data")
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  mockUnmanagedPluginAssemblies.push({
    id,
    name: parsed.name,
    version: parsed.version,
    culture: parsed.culture,
    publicKeyToken: parsed.publicKeyToken,
    fileName: parsed.localPath.split("/").at(-1),
    isolationMode: parsed.isolationMode,
    isolationModeLabel: "Sandbox",
    sourceType: parsed.sourceType,
    sourceTypeLabel: "Database",
    isManaged: false,
    isCustomizable: true,
    description: parsed.description,
    createdOn: now,
    modifiedOn: now,
    editable: { canEdit: true, canDelete: true, reasons: [] },
  })
  for (const typeName of parsed.typeNames) {
    const discovered = mockPluginAssemblyInspection.discoveredTypes.find(
      (item) => item.fullName === typeName,
    )
    mockUnmanagedPluginTypes.push({
      id: crypto.randomUUID(),
      assemblyId: id,
      assemblyName: parsed.name,
      name: typeName,
      friendlyName: typeName.split(".").at(-1) ?? typeName,
      typeName,
      isWorkflowActivity: discovered?.kind === "workflow",
      isManaged: false,
      isCustomizable: true,
      createdOn: now,
      modifiedOn: now,
      editable: { canEdit: true, canDelete: true, reasons: [] },
    })
  }
  return {
    id,
    message: `Browser preview registered ${parsed.name}.`,
  } satisfies PluginWriteResult
}

export async function updatePluginAssembly(
  environment: DataverseEnvironment,
  input: UpdatePluginAssemblyInput,
): Promise<PluginWriteResult> {
  const parsed = updatePluginAssemblyInputSchema.parse(input)

  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("update_plugin_assembly", {
      environment,
      input: parsed,
    })
  }

  const { mockUnmanagedPluginAssemblies } = await import("./mock-data")
  const assembly = mockUnmanagedPluginAssemblies.find(
    (item) => item.id === parsed.assemblyId,
  )
  if (assembly) {
    Object.assign(assembly, {
      version: parsed.version,
      fileName: parsed.localPath.split("/").at(-1),
      description: parsed.description,
      modifiedOn: new Date().toISOString(),
    })
  }
  return {
    id: parsed.assemblyId,
    message: `Browser preview updated ${parsed.name}.`,
  } satisfies PluginWriteResult
}

export async function unregisterPluginAssembly(
  environment: DataverseEnvironment,
  assemblyId: string,
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("unregister_plugin_assembly", {
      environment,
      assemblyId,
    })
  }

  const {
    mockUnmanagedPluginAssemblies,
    mockUnmanagedPluginTypes,
    mockUnmanagedPluginSteps,
    mockUnmanagedPluginStepImages,
  } = await import("./mock-data")
  const assemblyIndex = mockUnmanagedPluginAssemblies.findIndex(
    (item) => item.id === assemblyId,
  )
  if (assemblyIndex >= 0) {
    mockUnmanagedPluginAssemblies.splice(assemblyIndex, 1)
  }
  const typeIds = new Set(
    mockUnmanagedPluginTypes
      .filter((item) => item.assemblyId === assemblyId)
      .map((item) => item.id),
  )
  for (let index = mockUnmanagedPluginTypes.length - 1; index >= 0; index--) {
    if (typeIds.has(mockUnmanagedPluginTypes[index].id)) {
      mockUnmanagedPluginTypes.splice(index, 1)
    }
  }
  for (let index = mockUnmanagedPluginSteps.length - 1; index >= 0; index--) {
    if (typeIds.has(mockUnmanagedPluginSteps[index].pluginTypeId ?? "")) {
      const [step] = mockUnmanagedPluginSteps.splice(index, 1)
      for (let imageIndex = mockUnmanagedPluginStepImages.length - 1; imageIndex >= 0; imageIndex--) {
        if (mockUnmanagedPluginStepImages[imageIndex].stepId === step.id) {
          mockUnmanagedPluginStepImages.splice(imageIndex, 1)
        }
      }
    }
  }
  return {
    id: assemblyId,
    message: "Browser preview unregistered the assembly.",
  } satisfies PluginWriteResult
}

export async function createPluginType(
  environment: DataverseEnvironment,
  input: CreatePluginTypeInput,
): Promise<PluginWriteResult> {
  const parsed = createPluginTypeInputSchema.parse(input)

  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("create_plugin_type", {
      environment,
      input: parsed,
    })
  }

  return {
    id: `browser-type-${Date.now().toString(36)}`,
    message: `Browser preview added ${parsed.typeName}.`,
  } satisfies PluginWriteResult
}

export async function unregisterPluginType(
  environment: DataverseEnvironment,
  pluginTypeId: string,
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("unregister_plugin_type", {
      environment,
      pluginTypeId,
    })
  }

  const {
    mockUnmanagedPluginTypes,
    mockUnmanagedPluginSteps,
    mockUnmanagedPluginStepImages,
  } = await import("./mock-data")
  const index = mockUnmanagedPluginTypes.findIndex((item) => item.id === pluginTypeId)
  if (index >= 0) mockUnmanagedPluginTypes.splice(index, 1)
  for (let stepIndex = mockUnmanagedPluginSteps.length - 1; stepIndex >= 0; stepIndex--) {
    if (mockUnmanagedPluginSteps[stepIndex].pluginTypeId === pluginTypeId) {
      const [step] = mockUnmanagedPluginSteps.splice(stepIndex, 1)
      for (let imageIndex = mockUnmanagedPluginStepImages.length - 1; imageIndex >= 0; imageIndex--) {
        if (mockUnmanagedPluginStepImages[imageIndex].stepId === step.id) {
          mockUnmanagedPluginStepImages.splice(imageIndex, 1)
        }
      }
    }
  }
  return {
    id: pluginTypeId,
    message: "Browser preview unregistered the plug-in type.",
  } satisfies PluginWriteResult
}

export async function registerPluginStep(
  environment: DataverseEnvironment,
  input: RegisterPluginStepInput,
): Promise<PluginWriteResult> {
  const parsed = registerPluginStepInputSchema.parse(input)

  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("register_plugin_step", {
      environment,
      input: parsed,
    })
  }

  const {
    mockUnmanagedPluginSteps,
    mockUnmanagedPluginTypes,
    mockUnmanagedPluginServiceEndpoints,
    mockPluginMessages,
    mockPluginMessageFilters,
    mockStageOptions,
    mockModeOptions,
    mockDeploymentOptions,
  } = await import("./mock-data")
  const pluginType = mockUnmanagedPluginTypes.find(
    (item) => item.id === parsed.pluginTypeId,
  )
  const endpoint = mockUnmanagedPluginServiceEndpoints.find(
    (item) => item.id === parsed.serviceEndpointId,
  )
  const message = mockPluginMessages.find((item) => item.id === parsed.messageId)
  if (!message || (parsed.handlerType === "plugintype" && !pluginType) ||
      (parsed.handlerType === "serviceendpoint" && !endpoint)) {
    throw new Error("The selected plug-in type, endpoint, or message is unavailable.")
  }
  const filter = mockPluginMessageFilters.find(
    (item) => item.id === parsed.messageFilterId,
  )
  const id = parsed.stepId ?? crypto.randomUUID()
  const now = new Date().toISOString()
  const existing = mockUnmanagedPluginSteps.find((item) => item.id === id)
  const step: PluginStepSummary = {
    id,
    name: parsed.name,
    handlerType: parsed.handlerType,
    pluginTypeId: pluginType?.id,
    pluginTypeName: pluginType?.friendlyName,
    assemblyId: pluginType?.assemblyId,
    assemblyName: pluginType?.assemblyName,
    serviceEndpointId: endpoint?.id,
    serviceEndpointName: endpoint?.name,
    messageId: message.id,
    messageName: message.name,
    messageFilterId: filter?.id,
    primaryEntity: filter?.primaryEntity,
    stage: parsed.stage,
    stageLabel: mockStageOptions.find((item) => item.value === parsed.stage)?.label ?? "Unknown",
    mode: parsed.mode,
    modeLabel: mockModeOptions.find((item) => item.value === parsed.mode)?.label ?? "Unknown",
    rank: parsed.rank,
    supportedDeployment: parsed.supportedDeployment,
    supportedDeploymentLabel: mockDeploymentOptions.find(
      (item) => item.value === parsed.supportedDeployment,
    )?.label ?? "Unknown",
    asyncAutoDelete: parsed.asyncAutoDelete,
    filteringAttributes: parsed.filteringAttributes,
    configuration: parsed.configuration,
    secureConfigId: existing?.secureConfigId ?? (parsed.secureConfiguration ? crypto.randomUUID() : undefined),
    hasSecureConfig: existing?.hasSecureConfig || Boolean(parsed.secureConfiguration),
    impersonatingUserId: parsed.impersonatingUserId,
    description: parsed.description,
    isManaged: false,
    isCustomizable: true,
    stateCode: parsed.enabled ? 0 : 1,
    statusCode: parsed.enabled ? 1 : 2,
    statusLabel: parsed.enabled ? "Enabled" : "Disabled",
    createdOn: existing?.createdOn ?? now,
    modifiedOn: now,
    editable: { canEdit: true, canDelete: true, reasons: [] },
  }
  if (existing) {
    Object.assign(existing, step)
  } else {
    mockUnmanagedPluginSteps.push(step)
  }
  return {
    id,
    message: parsed.stepId
      ? `Browser preview updated ${parsed.name}.`
      : `Browser preview registered ${parsed.name}.`,
  } satisfies PluginWriteResult
}

export async function registerPluginStepImage(
  environment: DataverseEnvironment,
  input: RegisterPluginStepImageInput,
): Promise<PluginWriteResult> {
  const parsed = registerPluginStepImageInputSchema.parse(input)

  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("register_plugin_step_image", {
      environment,
      input: parsed,
    })
  }

  const {
    mockUnmanagedPluginStepImages,
    mockUnmanagedPluginSteps,
    mockImageTypeOptions,
  } = await import("./mock-data")
  const step = mockUnmanagedPluginSteps.find((item) => item.id === parsed.stepId)
  if (!step) {
    throw new Error("The selected step is unavailable.")
  }
  const id = parsed.imageId ?? crypto.randomUUID()
  const now = new Date().toISOString()
  const existing = mockUnmanagedPluginStepImages.find((item) => item.id === id)
  const image: PluginStepImageSummary = {
    id,
    stepId: step.id,
    stepName: step.name,
    name: parsed.name,
    entityAlias: parsed.entityAlias,
    imageType: parsed.imageType,
    imageTypeLabel: mockImageTypeOptions.find((item) => item.value === parsed.imageType)?.label ?? "Unknown",
    messagePropertyName: parsed.messagePropertyName,
    attributes: parsed.attributes,
    description: parsed.description,
    isManaged: false,
    createdOn: existing?.createdOn ?? now,
    modifiedOn: now,
    editable: { canEdit: true, canDelete: true, reasons: [] },
  }
  if (existing) {
    Object.assign(existing, image)
  } else {
    mockUnmanagedPluginStepImages.push(image)
  }
  return {
    id,
    message: parsed.imageId
      ? `Browser preview updated ${parsed.name}.`
      : `Browser preview registered ${parsed.name}.`,
  } satisfies PluginWriteResult
}

export async function setPluginStepState(
  environment: DataverseEnvironment,
  stepId: string,
  enabled: boolean,
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("set_plugin_step_state", {
      environment,
      stepId,
      enabled,
    })
  }

  const { mockUnmanagedPluginSteps } = await import("./mock-data")
  const step = mockUnmanagedPluginSteps.find((item) => item.id === stepId)
  if (step) {
    step.stateCode = enabled ? 0 : 1
    step.statusCode = enabled ? 1 : 2
    step.statusLabel = enabled ? "Enabled" : "Disabled"
  }
  return {
    id: stepId,
    message: `Browser preview ${enabled ? "enabled" : "disabled"} the step.`,
  } satisfies PluginWriteResult
}

export async function setPluginComponentState(
  environment: DataverseEnvironment,
  component: {
    componentKind: "step" | "assembly" | "type" | "endpoint"
    id: string
    enabled: boolean
  },
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("set_plugin_component_state", {
      environment,
      component,
    })
  }

  return {
    id: component.id,
    message: `Browser preview ${
      component.enabled ? "enabled" : "disabled"
    } the component.`,
  } satisfies PluginWriteResult
}

export async function unregisterPluginStep(
  environment: DataverseEnvironment,
  stepId: string,
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("unregister_plugin_step", {
      environment,
      stepId,
    })
  }

  const { mockUnmanagedPluginSteps, mockUnmanagedPluginStepImages } = await import("./mock-data")
  const index = mockUnmanagedPluginSteps.findIndex((item) => item.id === stepId)
  if (index >= 0) {
    mockUnmanagedPluginSteps.splice(index, 1)
  }
  for (let imageIndex = mockUnmanagedPluginStepImages.length - 1; imageIndex >= 0; imageIndex--) {
    if (mockUnmanagedPluginStepImages[imageIndex].stepId === stepId) {
      mockUnmanagedPluginStepImages.splice(imageIndex, 1)
    }
  }
  return {
    id: stepId,
    message: "Browser preview unregistered the step.",
  } satisfies PluginWriteResult
}

export async function unregisterPluginStepImage(
  environment: DataverseEnvironment,
  imageId: string,
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("unregister_plugin_step_image", {
      environment,
      imageId,
    })
  }

  const { mockUnmanagedPluginStepImages } = await import("./mock-data")
  const index = mockUnmanagedPluginStepImages.findIndex((item) => item.id === imageId)
  if (index >= 0) {
    mockUnmanagedPluginStepImages.splice(index, 1)
  }
  return {
    id: imageId,
    message: "Browser preview unregistered the image.",
  } satisfies PluginWriteResult
}

export async function registerPluginServiceEndpoint(
  environment: DataverseEnvironment,
  input: RegisterPluginServiceEndpointInput,
): Promise<PluginWriteResult> {
  const parsed = registerPluginServiceEndpointInputSchema.parse(input)

  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("register_plugin_service_endpoint", {
      environment,
      input: parsed,
    })
  }

  const {
    mockUnmanagedPluginServiceEndpoints,
    mockEndpointContractOptions,
    mockEndpointAuthTypeOptions,
  } = await import("./mock-data")
  const id = parsed.endpointId ?? crypto.randomUUID()
  const now = new Date().toISOString()
  const existing = mockUnmanagedPluginServiceEndpoints.find((item) => item.id === id)
  const endpoint: PluginServiceEndpointSummary = {
    id,
    name: parsed.name,
    contract: parsed.contract,
    contractLabel: mockEndpointContractOptions.find((item) => item.value === parsed.contract)?.label ?? "Unknown",
    authType: parsed.authType,
    authTypeLabel: mockEndpointAuthTypeOptions.find((item) => item.value === parsed.authType)?.label ?? "Unknown",
    url: parsed.url,
    path: parsed.path,
    namespaceAddress: parsed.namespaceAddress,
    messageFormat: parsed.messageFormat,
    isAuthValueSet: Boolean(parsed.authValue) || Boolean(existing?.isAuthValueSet),
    description: parsed.description,
    isManaged: false,
    createdOn: existing?.createdOn ?? now,
    modifiedOn: now,
    editable: { canEdit: true, canDelete: true, reasons: [] },
  }
  if (existing) {
    Object.assign(existing, endpoint)
  } else {
    mockUnmanagedPluginServiceEndpoints.push(endpoint)
  }
  return {
    id,
    message: parsed.endpointId
      ? `Browser preview updated ${parsed.name}.`
      : `Browser preview registered ${parsed.name}.`,
  } satisfies PluginWriteResult
}

export async function unregisterPluginServiceEndpoint(
  environment: DataverseEnvironment,
  endpointId: string,
): Promise<PluginWriteResult> {
  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("unregister_plugin_service_endpoint", {
      environment,
      endpointId,
    })
  }

  const { mockUnmanagedPluginServiceEndpoints, mockUnmanagedPluginSteps } = await import("./mock-data")
  const index = mockUnmanagedPluginServiceEndpoints.findIndex(
    (item) => item.id === endpointId,
  )
  if (index >= 0) {
    mockUnmanagedPluginServiceEndpoints.splice(index, 1)
  }
  for (let stepIndex = mockUnmanagedPluginSteps.length - 1; stepIndex >= 0; stepIndex--) {
    if (mockUnmanagedPluginSteps[stepIndex].serviceEndpointId === endpointId) {
      mockUnmanagedPluginSteps.splice(stepIndex, 1)
    }
  }
  return {
    id: endpointId,
    message: "Browser preview unregistered the service endpoint.",
  } satisfies PluginWriteResult
}

export async function getPluginComponentDependencies(
  environment: DataverseEnvironment,
  objectId: string,
  componentType: number,
): Promise<PluginDependencyReport> {
  if (isTauriRuntime()) {
    return invoke<PluginDependencyReport>("get_plugin_component_dependencies", {
      environment,
      objectId,
      componentType,
    })
  }

  const { mockPluginDependencyReport } = await import(
    "./mock-data"
  )
  return mockPluginDependencyReport
}

export async function exportPluginRegistration(
  environment: DataverseEnvironment,
  input: PluginExportInput,
): Promise<PluginWriteResult> {
  const parsed = pluginExportInputSchema.parse(input)

  if (isTauriRuntime()) {
    return invoke<PluginWriteResult>("export_plugin_registration", {
      environment,
      input: parsed,
    })
  }

  return {
    message: `Browser preview exported registrations to ${parsed.localPath}.`,
  } satisfies PluginWriteResult
}
