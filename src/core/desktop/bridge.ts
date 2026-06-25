import { invoke } from "@tauri-apps/api/core"

import {
  appConfigSchema,
  type AuthSession,
  type BrowserAuthStart,
  type AppConfig,
  type DataverseEnvironment,
  type CreatePluginTypeInput,
  type DeleteWebResourcesResult,
  type DownloadWebResourcesResult,
  type PublishResult,
  type FormLogicPublishResult,
  type FormLogicWebResourceInput,
  type PluginAssemblyInspection,
  type PluginAssemblySummary,
  type PluginDependencyReport,
  type PluginExportInput,
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
  type SolutionComponentSummary,
  type SolutionDependencyReport,
  type SolutionLayer,
  type SolutionSummary,
  type SolutionWebResourceCandidate,
  type SolutionWriteResult,
  type WebResourceImportResult,
  type WebResource,
  type WebResourceActivity,
  type WebResourceBinding,
  type WebResourceContent,
  defaultAppConfig,
  defaultUserSettings,
  pluginExportInputSchema,
  registerPluginAssemblyInputSchema,
  registerPluginServiceEndpointInputSchema,
  registerPluginStepImageInputSchema,
  registerPluginStepInputSchema,
  updatePluginAssemblyInputSchema,
  userSettingsSchema,
  type UserSettings,
} from "@/core/dataverse/schemas"
import { loadStoredJsonOrDefault } from "@/core/storage/safe-json"

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

const storageKey = "opendataverse.config"
const userSettingsStorageKey = "opendataverse.user-settings"
const browserCreatedWebResources: WebResource[] = []
const browserDeletedWebResourceIds = new Set<string>()
const browserRemovedSolutionComponentIds = new Set<string>()

function isMicrosoftWebResourceName(name: string) {
  const lowerName = name.trim().toLowerCase()

  return ["msdyn", "microsoft", "mscrm", "mspp", "adx_", "cc_"].some(
    (prefix) => lowerName.startsWith(prefix),
  )
}

function browserWebResourceContent(resource: WebResource): WebResourceContent {
  const lowerName = resource.name.toLowerCase()
  const binaryImageContentByExtension: Record<
    string,
    { content: string; mimeType: string }
  > = {
    ".png": {
      content:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      mimeType: "image/png",
    },
    ".jpg": {
      content:
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
      mimeType: "image/jpeg",
    },
    ".jpeg": {
      content:
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
      mimeType: "image/jpeg",
    },
    ".gif": {
      content: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      mimeType: "image/gif",
    },
    ".ico": {
      content:
        "AAABAAEBAQEAAAEAIiwAAABWAAAAKAAAABAAAAAgAAAAAQAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      mimeType: "image/x-icon",
    },
  }

  const imageContent = Object.entries(binaryImageContentByExtension).find(
    ([extension]) => lowerName.endsWith(extension),
  )?.[1]

  if (resource.type === "image" && imageContent) {
    return {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      language: "binary",
      content: imageContent.content,
      contentEncoding: "base64",
      mimeType: imageContent.mimeType,
    }
  }

  if (lowerName.endsWith(".xsl") || lowerName.endsWith(".xslt")) {
    return {
      id: resource.id,
      name: resource.name,
      type: "xml",
      language: "xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <section class="account-summary">
      <xsl:value-of select="/account/name" />
    </section>
  </xsl:template>
</xsl:stylesheet>`,
      contentEncoding: "text",
      mimeType: "application/xslt+xml",
    }
  }

  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    language:
      resource.type === "css"
        ? "css"
        : resource.type === "html"
          ? "html"
          : "javascript",
    content: `function onLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  const accountName = formContext.getAttribute("name")?.getValue();

  if (accountName) {
    console.log("Account loaded", accountName);
  }
}`,
    contentEncoding: "text",
    mimeType: "application/javascript",
  }
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function loadAppConfig() {
  if (isTauriRuntime()) {
    const config = await invoke<unknown>("load_config")
    return appConfigSchema.parse(config)
  }

  const stored = window.localStorage.getItem(storageKey)
  if (!stored) {
    return defaultAppConfig
  }

  return loadStoredJsonOrDefault(
    window.localStorage,
    storageKey,
    (value) => appConfigSchema.catch(defaultAppConfig).parse(value),
    defaultAppConfig,
  )
}

export async function saveAppConfig(config: AppConfig) {
  const parsed = appConfigSchema.parse(config)

  if (isTauriRuntime()) {
    await invoke("save_config", { config: parsed })
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(parsed, null, 2))
}

export async function deleteEnvironmentToken(environmentId: string) {
  if (isTauriRuntime()) {
    await invoke("delete_environment_token", { environmentId })
  }
}

export async function loadUserSettings() {
  if (isTauriRuntime()) {
    const settings = await invoke<unknown>("load_user_settings")
    return userSettingsSchema.parse(settings)
  }

  const stored = window.localStorage.getItem(userSettingsStorageKey)
  if (!stored) {
    return defaultUserSettings
  }

  return loadStoredJsonOrDefault(
    window.localStorage,
    userSettingsStorageKey,
    (value) => userSettingsSchema.catch(defaultUserSettings).parse(value),
    defaultUserSettings,
  )
}

export async function saveUserSettings(settings: UserSettings) {
  const parsed = userSettingsSchema.parse(settings)

  if (isTauriRuntime()) {
    await invoke("save_user_settings", { settings: parsed })
    return
  }

  window.localStorage.setItem(
    userSettingsStorageKey,
    JSON.stringify(parsed, null, 2),
  )
}

export async function startBrowserAuth(
  environment: DataverseEnvironment,
) {
  if (isTauriRuntime()) {
    return invoke<BrowserAuthStart>("start_browser_auth", { environment })
  }

  return {
    sessionId: "browser-dev",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    redirectUri: "http://localhost:8400",
    expiresAt: Math.floor(Date.now() / 1000) + 900,
  }
}

export async function completeBrowserAuth(
  environment: DataverseEnvironment,
  sessionId: string,
) {
  if (isTauriRuntime()) {
    return invoke<AuthSession>("complete_browser_auth", {
      environment,
      sessionId,
    })
  }

  return {
    environmentId: environment.id,
    status: "error",
    message: "Desktop auth is available when running under Tauri.",
  } satisfies AuthSession
}

export async function checkDataverseConnection(
  environment: DataverseEnvironment,
) {
  if (isTauriRuntime()) {
    return invoke<AuthSession>("check_dataverse_connection", { environment })
  }

  return {
    environmentId: environment.id,
    status: "error",
    message: "Run the Tauri app to check Dataverse connectivity.",
  } satisfies AuthSession
}

export async function listWebResources(
  environment: DataverseEnvironment,
  includeManaged: boolean,
) {
  if (isTauriRuntime()) {
    return invoke<WebResource[]>("list_web_resources", {
      environment,
      includeManaged,
    })
  }

  const { mockWebResources } = await import(
    "@/modules/webresource-management/mock-data"
  )
  return [...mockWebResources, ...browserCreatedWebResources].filter(
    (resource) =>
      !browserDeletedWebResourceIds.has(resource.id) &&
      resource.isCustomizable !== false &&
      (includeManaged || !resource.isManaged),
  )
}

export async function getWebResourceContent(
  environment: DataverseEnvironment,
  webResourceId: string,
) {
  if (isTauriRuntime()) {
    return invoke<WebResourceContent>("get_web_resource_content", {
      environment,
      webResourceId,
    })
  }

  const { mockWebResources } = await import(
    "@/modules/webresource-management/mock-data"
  )
  const resource = [...mockWebResources, ...browserCreatedWebResources].find(
    (item) => item.id === webResourceId,
  )
  if (resource) {
    return browserWebResourceContent(resource)
  }

  return {
    id: webResourceId,
    name: "new_/scripts/account-form.js",
    type: "js",
    language: "javascript",
    content: `function onLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  const accountName = formContext.getAttribute("name")?.getValue();

  if (accountName) {
    console.log("Account loaded", accountName);
  }
}`,
    contentEncoding: "text",
    mimeType: "application/javascript",
  } satisfies WebResourceContent
}

export async function listWebResourceActivity(
  environment: DataverseEnvironment,
) {
  if (isTauriRuntime()) {
    return invoke<WebResourceActivity[]>("list_web_resource_activity", {
      environment,
    })
  }

  const { mockWebResourceActivity } = await import(
    "@/modules/webresource-management/mock-data"
  )
  return mockWebResourceActivity
}

export async function deleteWebResources(
  environment: DataverseEnvironment,
  webResourceIds: string[],
) {
  if (isTauriRuntime()) {
    return invoke<DeleteWebResourcesResult>("delete_web_resources", {
      environment,
      webResourceIds,
    })
  }

  for (const webResourceId of webResourceIds) {
    browserDeletedWebResourceIds.add(webResourceId)
    const createdIndex = browserCreatedWebResources.findIndex(
      (resource) => resource.id === webResourceId,
    )
    if (createdIndex >= 0) {
      browserCreatedWebResources.splice(createdIndex, 1)
    }
  }

  return {
    deleted: webResourceIds.length,
    message: `Browser preview deleted ${webResourceIds.length} web resource${
      webResourceIds.length === 1 ? "" : "s"
    }.`,
  } satisfies DeleteWebResourcesResult
}

export async function downloadWebResources(
  environment: DataverseEnvironment,
  input: {
    webResourceIds: string[]
    targetPath: string
    preservePaths: boolean
  },
) {
  if (isTauriRuntime()) {
    return invoke<DownloadWebResourcesResult>("download_web_resources", {
      environment,
      webResourceIds: input.webResourceIds,
      targetPath: input.targetPath,
      preservePaths: input.preservePaths,
    })
  }

  return {
    downloaded: input.webResourceIds.length,
    targetPath: input.targetPath,
    message: `Browser preview downloaded ${input.webResourceIds.length} web resource${
      input.webResourceIds.length === 1 ? "" : "s"
    }.`,
  } satisfies DownloadWebResourcesResult
}

export async function publishWebResource(
  environment: DataverseEnvironment,
  binding: WebResourceBinding,
) {
  if (isTauriRuntime()) {
    return invoke<PublishResult>("publish_web_resource", {
      environment,
      binding,
    })
  }

  return {
    webResourceId: binding.webResourceId,
    webResourceName: binding.webResourceName,
    message: `Browser preview cannot publish ${binding.webResourceName}`,
  } satisfies PublishResult
}

export async function saveWebResourceContent(
  environment: DataverseEnvironment,
  content: WebResourceContent,
  publish: boolean,
) {
  if (isTauriRuntime()) {
    return invoke<PublishResult>("save_web_resource_content", {
      environment,
      webResourceId: content.id,
      webResourceName: content.name,
      content: content.content,
      publish,
    })
  }

  return {
    webResourceId: content.id,
    webResourceName: content.name,
    message: publish
      ? `Browser preview cannot publish ${content.name}`
      : `Browser preview saved ${content.name}`,
  } satisfies PublishResult
}

export type SolutionManagedFilter = "all" | "unmanaged" | "managed"

export async function listSolutions(
  environment: DataverseEnvironment,
  managedFilter: SolutionManagedFilter,
) {
  if (isTauriRuntime()) {
    return invoke<SolutionSummary[]>("list_solutions", {
      environment,
      managedFilter,
    })
  }

  const { mockSolutions } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockSolutions
    .filter((solution) => {
      if (managedFilter === "managed") {
        return solution.isManaged
      }

      if (managedFilter === "unmanaged") {
        return !solution.isManaged
      }

      return true
    })
    .sort((left, right) =>
      (right.createdOn ?? "").localeCompare(left.createdOn ?? ""),
    )
}

export async function listSolutionComponents(
  environment: DataverseEnvironment,
  solutionId: string,
) {
  if (isTauriRuntime()) {
    return invoke<SolutionComponentSummary[]>("list_solution_components", {
      environment,
      solutionId,
    })
  }

  const { mockSolutionComponents } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockSolutionComponents.filter(
    (component) =>
      component.solutionId === solutionId &&
      !browserRemovedSolutionComponentIds.has(component.id),
  )
}

export async function getSolutionComponentDependencies(
  environment: DataverseEnvironment,
  component: SolutionComponentSummary,
) {
  if (isTauriRuntime()) {
    return invoke<SolutionDependencyReport>(
      "get_solution_component_dependencies",
      {
        environment,
        objectId: component.objectId,
        componentType: component.componentType,
      },
    )
  }

  const { mockDependencyReport } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockDependencyReport
}

export async function getSolutionComponentLayers(
  environment: DataverseEnvironment,
  component: SolutionComponentSummary,
) {
  if (isTauriRuntime()) {
    return invoke<SolutionLayer[]>("get_solution_component_layers", {
      environment,
      objectId: component.objectId,
      componentName: component.layerName ?? component.logicalName ?? component.displayName,
    })
  }

  const { mockSolutionLayers } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockSolutionLayers
}

export async function listSolutionWebResourceCandidates(
  environment: DataverseEnvironment,
  solutionId: string,
) {
  if (isTauriRuntime()) {
    return invoke<SolutionWebResourceCandidate[]>(
      "list_solution_web_resource_candidates",
      {
        environment,
        solutionId,
      },
    )
  }

  const { mockWebResourceCandidates } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockWebResourceCandidates.filter(
    (candidate) =>
      !candidate.isManaged && !isMicrosoftWebResourceName(candidate.name),
  )
}

export async function addExistingWebResourceToSolution(
  environment: DataverseEnvironment,
  solutionUniqueName: string,
  webResourceId: string,
) {
  if (isTauriRuntime()) {
    return invoke<SolutionWriteResult>("add_existing_web_resource_to_solution", {
      environment,
      solutionUniqueName,
      webResourceId,
    })
  }

  if (webResourceId === "preview-add-existing-error") {
    throw new Error(
      "Browser preview simulated AddSolutionComponent failure: the selected web resource is already managed by another solution layer.",
    )
  }

  return {
    webResourceId,
    message: "Browser preview added the web resource to the solution.",
  } satisfies SolutionWriteResult
}

export async function removeSolutionComponentFromSolution(
  environment: DataverseEnvironment,
  solutionUniqueName: string,
  component: SolutionComponentSummary,
) {
  if (isTauriRuntime()) {
    return invoke<SolutionWriteResult>("remove_solution_component_from_solution", {
      environment,
      solutionUniqueName,
      componentObjectId: component.objectId,
      componentType: component.componentType,
      displayName: component.displayName,
    })
  }

  browserRemovedSolutionComponentIds.add(component.id)

  return {
    message: `Browser preview removed ${component.displayName} from ${solutionUniqueName}.`,
  } satisfies SolutionWriteResult
}

export async function createWebResourceInSolution(
  environment: DataverseEnvironment,
  input: {
    solutionUniqueName: string
    name: string
    displayName: string
    description: string
    type: WebResource["type"]
    content: string
  },
) {
  if (isTauriRuntime()) {
    return invoke<SolutionWriteResult>("create_web_resource_in_solution", {
      environment,
      input,
    })
  }

  const webResourceId = `browser-${Date.now().toString(36)}`
  browserCreatedWebResources.push({
    id: webResourceId,
    name: input.name,
    type: input.type,
    version: "Browser preview",
    isManaged: false,
    solution: input.solutionUniqueName,
    modifiedOn: new Date().toISOString(),
    modifiedBy: {
      name: "Browser preview user",
    },
  })

  return {
    webResourceId,
    message: `Browser preview created ${input.name} in ${input.solutionUniqueName}.`,
  } satisfies SolutionWriteResult
}

export async function createFormLogicWebResource(
  environment: DataverseEnvironment,
  input: FormLogicWebResourceInput,
) {
  if (isTauriRuntime()) {
    return invoke<FormLogicPublishResult>("create_form_logic_web_resource", {
      environment,
      input,
    })
  }

  const createResult = await createWebResourceInSolution(environment, {
    solutionUniqueName: input.solutionUniqueName,
    name: input.name,
    displayName: input.displayName,
    description: input.description,
    type: input.type,
    content: input.content,
  })

  return {
    webResourceId: createResult.webResourceId,
    formId: input.formId,
    formName: input.formName,
    appliedBindings: input.bindings.length,
    message: `Browser preview created ${input.name}, added ${input.entityLogicalName} and ${input.formName} to ${input.solutionUniqueName}, applied ${input.bindings.length} handler${
      input.bindings.length === 1 ? "" : "s"
    }, and published customizations.`,
  } satisfies FormLogicPublishResult
}

export async function importWebResourcesInSolution(
  environment: DataverseEnvironment,
  input: {
    solutionUniqueName: string
    sourcePaths: string[]
    targetRoot: string
    description: string
  },
) {
  if (isTauriRuntime()) {
    return invoke<WebResourceImportResult>("import_web_resources_in_solution", {
      environment,
      input,
    })
  }

  const targetRoot = input.targetRoot.replace(/^\/+|\/+$/g, "")
  const imported = input.sourcePaths.map((sourcePath, index) => {
    const fileName = sourcePath.split(/[\\/]/).filter(Boolean).at(-1) ?? `file-${index}`

    return {
      sourcePath,
      name: targetRoot ? `${targetRoot}/${fileName}` : fileName,
      type: fileName.endsWith(".css")
        ? "css"
        : fileName.endsWith(".html") || fileName.endsWith(".htm")
          ? "html"
          : "js",
      webResourceId: `browser-import-${index}`,
    } satisfies WebResourceImportResult["imported"][number]
  })

  return {
    imported,
    skipped: [],
    message: `Browser preview imported ${imported.length} web resources.`,
  } satisfies WebResourceImportResult
}

export async function listPluginAssemblies(environment: DataverseEnvironment) {
  if (isTauriRuntime()) {
    return invoke<PluginAssemblySummary[]>("list_plugin_assemblies", {
      environment,
    })
  }

  const { mockUnmanagedPluginAssemblies } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockUnmanagedPluginAssemblies
}

export async function listPluginPackages(environment: DataverseEnvironment) {
  if (isTauriRuntime()) {
    return invoke<PluginPackageSummary[]>("list_plugin_packages", {
      environment,
    })
  }

  const { mockUnmanagedPluginPackages } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockUnmanagedPluginPackages
}

export async function listPluginTypes(
  environment: DataverseEnvironment,
  assemblyId?: string,
) {
  if (isTauriRuntime()) {
    return invoke<PluginTypeSummary[]>("list_plugin_types", {
      environment,
      assemblyId,
    })
  }

  const { mockUnmanagedPluginTypes } = await import(
    "@/modules/plugin-registration/mock-data"
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
) {
  if (isTauriRuntime()) {
    return invoke<PluginStepSummary[]>("list_plugin_steps", {
      environment,
      pluginTypeId: filters.pluginTypeId,
      serviceEndpointId: filters.serviceEndpointId,
    })
  }

  const { mockUnmanagedPluginSteps } = await import(
    "@/modules/plugin-registration/mock-data"
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
) {
  if (isTauriRuntime()) {
    return invoke<PluginStepImageSummary[]>("list_plugin_step_images", {
      environment,
      stepId,
    })
  }

  const { mockUnmanagedPluginStepImages } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return stepId
    ? mockUnmanagedPluginStepImages.filter((image) => image.stepId === stepId)
    : mockUnmanagedPluginStepImages
}

export async function listPluginMessages(environment: DataverseEnvironment) {
  if (isTauriRuntime()) {
    return invoke<PluginMessageSummary[]>("list_plugin_messages", {
      environment,
    })
  }

  const { mockPluginMessages } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockPluginMessages
}

export async function listPluginMessageFilters(
  environment: DataverseEnvironment,
  messageId: string,
) {
  if (isTauriRuntime()) {
    return invoke<PluginMessageFilterSummary[]>("list_plugin_message_filters", {
      environment,
      messageId,
    })
  }

  const { mockPluginMessageFilters } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockPluginMessageFilters.filter((filter) => filter.messageId === messageId)
}

export async function listPluginServiceEndpoints(
  environment: DataverseEnvironment,
) {
  if (isTauriRuntime()) {
    return invoke<PluginServiceEndpointSummary[]>(
      "list_plugin_service_endpoints",
      { environment },
    )
  }

  const { mockUnmanagedPluginServiceEndpoints } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockUnmanagedPluginServiceEndpoints
}

export async function listPluginSystemUsers(environment: DataverseEnvironment) {
  if (isTauriRuntime()) {
    return invoke<PluginSystemUserSummary[]>("list_plugin_system_users", {
      environment,
    })
  }

  const { mockPluginUsers } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockPluginUsers
}

export async function getPluginRegistrationSnapshot(
  environment: DataverseEnvironment,
) {
  if (isTauriRuntime()) {
    return invoke<PluginRegistrationSnapshot>(
      "get_plugin_registration_snapshot",
      { environment },
    )
  }

  const { mockPluginRegistrationSnapshot } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockPluginRegistrationSnapshot
}

export async function inspectPluginAssembly(localPath: string) {
  if (isTauriRuntime()) {
    return invoke<PluginAssemblyInspection>("inspect_plugin_assembly", {
      localPath,
    })
  }

  const { mockPluginAssemblyInspection } = await import(
    "@/modules/plugin-registration/mock-data"
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
  if (isTauriRuntime()) {
    return invoke<PluginDependencyReport>("get_plugin_component_dependencies", {
      environment,
      objectId,
      componentType,
    })
  }

  const { mockPluginDependencyReport } = await import(
    "@/modules/plugin-registration/mock-data"
  )
  return mockPluginDependencyReport
}

export async function exportPluginRegistration(
  environment: DataverseEnvironment,
  input: PluginExportInput,
) {
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
