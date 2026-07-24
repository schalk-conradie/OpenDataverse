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
  type PluginRegistrationSnapshot,
  type PluginServiceEndpointSummary,
  type PluginStepSummary,
  type PluginStepImageSummary,
  type PluginSystemUserSummary,
  type PluginTypeSummary,
  type PluginWriteResult,
  type RegisterPluginAssemblyInput,
  type RegisterPluginServiceEndpointInput,
  type RegisterPluginStepInput,
  type RegisterPluginStepImageInput,
  type UpdatePluginAssemblyInput,
  createPluginTypeInputSchema,
  pluginExportInputSchema,
  registerPluginAssemblyInputSchema,
  registerPluginServiceEndpointInputSchema,
  registerPluginStepImageInputSchema,
  registerPluginStepInputSchema,
  updatePluginAssemblyInputSchema,
} from "@/core/dataverse/schemas"

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
  return mockPluginRegistrationSnapshot
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

  return {
    id: `browser-assembly-${Date.now().toString(36)}`,
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

  return {
    id: parsed.stepId ?? `browser-step-${Date.now().toString(36)}`,
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

  return {
    id: parsed.imageId ?? `browser-image-${Date.now().toString(36)}`,
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

  return {
    id: parsed.endpointId ?? `browser-endpoint-${Date.now().toString(36)}`,
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
