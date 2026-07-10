import {
  dataverseEnvironmentSchema,
  normalizeEnvironmentUrl,
  type AppConfig,
  type DataverseEnvironment,
  type ToolWindow,
  type WebResourceBinding,
} from "@/core/dataverse/schemas"

export type EnvironmentInput = {
  name: string
  url: string
}

export type ValidEnvironmentInput = {
  name: string
  url: string
}

export type EnvironmentInputResult =
  | { ok: true; data: ValidEnvironmentInput }
  | { ok: false; error: string }

export type WorkspaceWindowState = {
  openWindows: ToolWindow[]
  activeWindowId?: string
}

export type EnvironmentUpdateState = WorkspaceWindowState & {
  config: AppConfig
  urlChanged: boolean
}

export type EnvironmentRemovalState = WorkspaceWindowState & {
  config: AppConfig
}

export type WebResourceBindingChanges = {
  environmentId?: string
  localPath?: string
  webResourceName?: string
  webResourceId?: string
  lastKnownVersion?: string
  autoPublish?: boolean
}

export type BindingUpsertState = {
  config: AppConfig
  existingBinding: boolean
}

export type BindingRemovalState = {
  config: AppConfig
  removedBinding?: WebResourceBinding
}

export function validateEnvironmentInput(
  config: AppConfig,
  input: EnvironmentInput,
  currentEnvironmentId?: string,
): EnvironmentInputResult {
  const name = input.name.trim()
  const url = normalizeEnvironmentUrl(input.url)

  if (name.length === 0) {
    return { ok: false, error: "Name is required" }
  }

  const parsed = dataverseEnvironmentSchema.safeParse({
    id: currentEnvironmentId ?? "environment-validation",
    name,
    url,
    authState: "disconnected",
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid environment",
    }
  }

  const duplicateName = config.environments.some(
    (environment) =>
      environment.id !== currentEnvironmentId &&
      environment.name.trim().toLowerCase() === name.toLowerCase(),
  )

  if (duplicateName) {
    return { ok: false, error: "Environment name already exists" }
  }

  const duplicateUrl = config.environments.some(
    (environment) =>
      environment.id !== currentEnvironmentId &&
      normalizeEnvironmentUrl(environment.url).toLowerCase() ===
        url.toLowerCase(),
  )

  if (duplicateUrl) {
    return { ok: false, error: "Environment URL already exists" }
  }

  return { ok: true, data: { name, url } }
}

export function applyEnvironmentAuthState(
  config: AppConfig,
  environmentId: string,
  authState: DataverseEnvironment["authState"],
): AppConfig {
  return {
    ...config,
    environments: config.environments.map((environment) =>
      environment.id === environmentId
        ? { ...environment, authState }
        : environment,
    ),
  }
}

export function applyEnvironmentUpdate(
  config: AppConfig,
  openWindows: ToolWindow[],
  activeWindowId: string | undefined,
  environment: DataverseEnvironment,
  input: ValidEnvironmentInput,
): EnvironmentUpdateState {
  const urlChanged =
    normalizeEnvironmentUrl(environment.url).toLowerCase() !==
    input.url.toLowerCase()
  const nextConfig: AppConfig = {
    ...config,
    environments: config.environments.map((item) =>
      item.id === environment.id
        ? {
            ...item,
            name: input.name,
            url: input.url,
            authState: urlChanged ? "disconnected" : item.authState,
          }
        : item,
    ),
    bindings: urlChanged
      ? config.bindings.filter(
          (binding) => binding.environmentId !== environment.id,
        )
      : config.bindings,
  }
  const nextWindows = urlChanged
    ? openWindows.filter((window) => window.environmentId !== environment.id)
    : openWindows

  return {
    config: nextConfig,
    openWindows: nextWindows,
    activeWindowId: nextActiveWindowId(nextWindows, activeWindowId),
    urlChanged,
  }
}

export function removeEnvironmentFromWorkspace(
  config: AppConfig,
  openWindows: ToolWindow[],
  activeWindowId: string | undefined,
  environmentId: string,
): EnvironmentRemovalState {
  const currentEnvironmentId =
    config.currentEnvironmentId === environmentId
      ? nextEnvironmentIdAfterDelete(config, environmentId)
      : config.currentEnvironmentId
  const nextWindows = openWindows.filter(
    (window) => window.environmentId !== environmentId,
  )

  return {
    config: {
      ...config,
      currentEnvironmentId,
      environments: config.environments.filter(
        (environment) => environment.id !== environmentId,
      ),
      bindings: config.bindings.filter(
        (binding) => binding.environmentId !== environmentId,
      ),
    },
    openWindows: nextWindows,
    activeWindowId: nextActiveWindowId(nextWindows, activeWindowId),
  }
}

export function closeToolWindow(
  openWindows: ToolWindow[],
  activeWindowId: string | undefined,
  windowId: string,
): WorkspaceWindowState {
  const nextWindows = openWindows.filter((window) => window.id !== windowId)

  return {
    openWindows: nextWindows,
    activeWindowId:
      activeWindowId === windowId ? nextWindows.at(-1)?.id : activeWindowId,
  }
}

export function updateToolWindowState(
  openWindows: ToolWindow[],
  windowId: string,
  state: NonNullable<ToolWindow["state"]>,
): ToolWindow[] {
  return openWindows.map((window) =>
    window.id === windowId
      ? {
          ...window,
          state: {
            ...window.state,
            ...state,
          },
        }
      : window,
  )
}

export function upsertWebResourceBinding(
  config: AppConfig,
  binding: Omit<WebResourceBinding, "id">,
  newBindingId: string,
): BindingUpsertState {
  const existingBinding = config.bindings.find(
    (item) =>
      item.environmentId === binding.environmentId &&
      item.webResourceId === binding.webResourceId,
  )

  return {
    config: {
      ...config,
      bindings: existingBinding
        ? config.bindings.map((item) =>
            item.id === existingBinding.id
              ? { ...binding, id: existingBinding.id }
              : item,
          )
        : [...config.bindings, { ...binding, id: newBindingId }],
    },
    existingBinding: Boolean(existingBinding),
  }
}

export function updateWebResourceBinding(
  config: AppConfig,
  bindingId: string,
  changes: WebResourceBindingChanges,
): AppConfig {
  return {
    ...config,
    bindings: config.bindings.map((binding) =>
      binding.id === bindingId ? { ...binding, ...changes } : binding,
    ),
  }
}

export function removeWebResourceBinding(
  config: AppConfig,
  bindingId: string,
): BindingRemovalState {
  const removedBinding = config.bindings.find(
    (binding) => binding.id === bindingId,
  )

  return {
    config: removedBinding
      ? {
          ...config,
          bindings: config.bindings.filter(
            (binding) => binding.id !== bindingId,
          ),
        }
      : config,
    removedBinding,
  }
}

function nextEnvironmentIdAfterDelete(
  config: AppConfig,
  environmentId: string,
): string | undefined {
  const environmentIndex = config.environments.findIndex(
    (environment) => environment.id === environmentId,
  )

  if (environmentIndex === -1) {
    return config.currentEnvironmentId
  }

  const nextEnvironments = config.environments.filter(
    (environment) => environment.id !== environmentId,
  )

  return (
    nextEnvironments[environmentIndex]?.id ??
    nextEnvironments[environmentIndex - 1]?.id
  )
}

function nextActiveWindowId(
  openWindows: ToolWindow[],
  activeWindowId: string | undefined,
): string | undefined {
  return openWindows.some((window) => window.id === activeWindowId)
    ? activeWindowId
    : openWindows.at(-1)?.id
}
