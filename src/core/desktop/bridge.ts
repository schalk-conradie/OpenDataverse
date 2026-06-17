import { invoke } from "@tauri-apps/api/core"

import {
  appConfigSchema,
  type AuthSession,
  type BrowserAuthStart,
  type AppConfig,
  type DataverseEnvironment,
  type PublishResult,
  type SolutionComponentSummary,
  type SolutionDependencyReport,
  type SolutionLayer,
  type SolutionSummary,
  type SolutionWebResourceCandidate,
  type SolutionWriteResult,
  type WebResource,
  type WebResourceBinding,
  type WebResourceContent,
  defaultAppConfig,
  defaultUserSettings,
  userSettingsSchema,
  type UserSettings,
} from "@/core/dataverse/schemas"

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

const storageKey = "opendataverse.config"
const userSettingsStorageKey = "opendataverse.user-settings"

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

  return appConfigSchema.catch(defaultAppConfig).parse(JSON.parse(stored))
}

export async function saveAppConfig(config: AppConfig) {
  const parsed = appConfigSchema.parse(config)

  if (isTauriRuntime()) {
    await invoke("save_config", { config: parsed })
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(parsed, null, 2))
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

  return userSettingsSchema.catch(defaultUserSettings).parse(JSON.parse(stored))
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
  return mockWebResources.filter(
    (resource) => includeManaged || !resource.isManaged,
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
  const resource = mockWebResources.find((item) => item.id === webResourceId)
  return {
    id: webResourceId,
    name: resource?.name ?? "new_/scripts/account-form.js",
    type: resource?.type ?? "js",
    language: resource?.type === "css" ? "css" : resource?.type === "html" ? "html" : "javascript",
    content: `function onLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  const accountName = formContext.getAttribute("name")?.getValue();

  if (accountName) {
    console.log("Account loaded", accountName);
  }
}`,
  } satisfies WebResourceContent
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

export async function listSolutions(environment: DataverseEnvironment) {
  if (isTauriRuntime()) {
    return invoke<SolutionSummary[]>("list_solutions", { environment })
  }

  const { mockSolutions } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockSolutions
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
    (component) => component.solutionId === solutionId,
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
  return mockWebResourceCandidates
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

  return {
    webResourceId,
    message: "Browser preview added the web resource to the solution.",
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

  return {
    webResourceId: `browser-${Date.now().toString(36)}`,
    message: `Browser preview created ${input.name} in ${input.solutionUniqueName}.`,
  } satisfies SolutionWriteResult
}
