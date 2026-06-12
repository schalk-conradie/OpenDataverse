import { create } from "zustand"

import {
  checkDataverseConnection,
  loadAppConfig,
  loadUserSettings,
  saveAppConfig,
  saveUserSettings,
} from "@/core/desktop/bridge"
import {
  createId,
  dataverseEnvironmentSchema,
  defaultAppConfig,
  defaultUserSettings,
  getEnvironmentById,
  normalizeEnvironmentUrl,
  type AppConfig,
  type DataverseEnvironment,
  type ToolId,
  type ToolWindow,
  type UserSettings,
  type WebResourceBinding,
} from "@/core/dataverse/schemas"
import { getToolDefinition } from "@/modules/tool-registry"

type LoadState = "idle" | "loading" | "ready" | "error"

type NewEnvironmentInput = {
  name: string
  url: string
}

type WorkspaceStore = {
  config: AppConfig
  userSettings: UserSettings
  loadState: LoadState
  openWindows: ToolWindow[]
  activeWindowId?: string
  lastMessage?: string
  hydrate: () => Promise<void>
  addEnvironment: (input: NewEnvironmentInput) => void
  selectEnvironment: (environmentId: string) => void
  connectEnvironment: (environmentId: string) => Promise<void>
  setEnvironmentAuthState: (
    environmentId: string,
    authState: DataverseEnvironment["authState"],
    message?: string,
  ) => void
  setLastMessage: (message?: string) => void
  setDarkMode: (enabled: boolean) => void
  openTool: (toolId: ToolId) => void
  closeWindow: (windowId: string) => void
  activateWindow: (windowId: string) => void
  addBinding: (binding: Omit<WebResourceBinding, "id">) => void
  updateBinding: (
    bindingId: string,
    changes: Partial<Omit<WebResourceBinding, "id">>,
  ) => void
  removeBinding: (bindingId: string) => void
}

function createToolWindow(toolId: ToolId, environmentId?: string): ToolWindow {
  const tool = getToolDefinition(toolId)

  return {
    id: createId("window"),
    toolId,
    environmentId,
    title: tool.title,
    createdAt: new Date().toISOString(),
  }
}

function persistConfig(config: AppConfig, set: (state: Partial<WorkspaceStore>) => void) {
  void saveAppConfig(config).catch((error: unknown) => {
    set({
      lastMessage:
        error instanceof Error ? error.message : "Could not save app config",
    })
  })
}

function persistUserSettings(
  settings: UserSettings,
  set: (state: Partial<WorkspaceStore>) => void,
) {
  void saveUserSettings(settings).catch((error: unknown) => {
    set({
      lastMessage:
        error instanceof Error ? error.message : "Could not save user settings",
    })
  })
}

function applyEnvironmentAuthState(
  config: AppConfig,
  environmentId: string,
  authState: DataverseEnvironment["authState"],
) {
  return {
    ...config,
    environments: config.environments.map((environment) =>
      environment.id === environmentId
        ? { ...environment, authState }
        : environment,
    ),
  }
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  config: defaultAppConfig,
  userSettings: defaultUserSettings,
  loadState: "idle",
  openWindows: [],
  activeWindowId: undefined,
  lastMessage: undefined,

  async hydrate() {
    set({ loadState: "loading" })

    try {
      const [loadedConfig, loadedUserSettings] = await Promise.all([
        loadAppConfig(),
        loadUserSettings(),
      ])
      const currentEnvironment = getEnvironmentById(
        loadedConfig,
        loadedConfig.currentEnvironmentId,
      )
      const firstWindow = createToolWindow(
        "autopublisher",
        currentEnvironment?.id,
      )

      set({
        config: currentEnvironment
          ? loadedConfig
          : { ...loadedConfig, currentEnvironmentId: undefined },
        userSettings: loadedUserSettings,
        loadState: "ready",
        openWindows: [firstWindow],
        activeWindowId: firstWindow.id,
        lastMessage: undefined,
      })
    } catch (error) {
      set({
        loadState: "error",
        config: defaultAppConfig,
        userSettings: defaultUserSettings,
        lastMessage:
          error instanceof Error ? error.message : "Could not load app config",
      })
    }
  },

  addEnvironment(input) {
    const config = get().config
    const name = input.name.trim()

    if (config.environments.some((environment) => environment.name === name)) {
      set({ lastMessage: "Environment name already exists" })
      return
    }

    const parsed = dataverseEnvironmentSchema.safeParse({
      id: createId("environment"),
      name,
      url: normalizeEnvironmentUrl(input.url),
      authState: "disconnected",
    })

    if (!parsed.success) {
      set({ lastMessage: parsed.error.issues[0]?.message })
      return
    }

    const nextConfig = {
      ...config,
      currentEnvironmentId: parsed.data.id,
      environments: [...config.environments, parsed.data],
    }

    set({ config: nextConfig, lastMessage: "Environment added" })
    persistConfig(nextConfig, set)
  },

  selectEnvironment(environmentId) {
    const config = get().config

    if (!getEnvironmentById(config, environmentId)) {
      return
    }

    const nextConfig = { ...config, currentEnvironmentId: environmentId }
    set({ config: nextConfig, lastMessage: undefined })
    persistConfig(nextConfig, set)
  },

  async connectEnvironment(environmentId) {
    const environment = getEnvironmentById(get().config, environmentId)
    if (!environment) {
      return
    }

    const connectingConfig = applyEnvironmentAuthState(
      get().config,
      environmentId,
      "connecting",
    )
    set({ config: connectingConfig, lastMessage: "Opening browser sign-in" })
    persistConfig(connectingConfig, set)

    try {
      const session = await checkDataverseConnection(environment)
      const nextState =
        session.status === "connected" ? "connected" : "disconnected"
      const nextConfig = applyEnvironmentAuthState(
        get().config,
        environmentId,
        nextState,
      )
      set({ config: nextConfig, lastMessage: session.message })
      persistConfig(nextConfig, set)
    } catch (error) {
      const nextConfig = applyEnvironmentAuthState(
        get().config,
        environmentId,
        "error",
      )
      set({
        config: nextConfig,
        lastMessage:
          error instanceof Error ? error.message : "Could not start sign-in",
      })
      persistConfig(nextConfig, set)
    }
  },

  setEnvironmentAuthState(environmentId, authState, message) {
    const nextConfig = applyEnvironmentAuthState(
      get().config,
      environmentId,
      authState,
    )
    set({ config: nextConfig, lastMessage: message })
    persistConfig(nextConfig, set)
  },

  setLastMessage(message) {
    set({ lastMessage: message })
  },

  setDarkMode(enabled) {
    const settings = get().userSettings
    const nextSettings = {
      ...settings,
      appearance: {
        ...settings.appearance,
        darkMode: enabled,
      },
    }

    set({ userSettings: nextSettings, lastMessage: undefined })
    persistUserSettings(nextSettings, set)
  },

  openTool(toolId) {
    const tool = getToolDefinition(toolId)

    if (tool.status === "planned") {
      set({ lastMessage: `${tool.title} is planned` })
      return
    }

    const window = createToolWindow(toolId, get().config.currentEnvironmentId)
    set({
      openWindows: [...get().openWindows, window],
      activeWindowId: window.id,
      lastMessage: undefined,
    })
  },

  closeWindow(windowId) {
    const openWindows = get().openWindows
    const nextWindows = openWindows.filter((window) => window.id !== windowId)
    const closingActiveWindow = get().activeWindowId === windowId
    const nextActiveWindow = closingActiveWindow
      ? nextWindows.at(-1)?.id
      : get().activeWindowId

    set({
      openWindows: nextWindows,
      activeWindowId: nextActiveWindow,
    })
  },

  activateWindow(windowId) {
    set({ activeWindowId: windowId })
  },

  addBinding(binding) {
    const config = get().config
    const existingBinding = config.bindings.find(
      (item) =>
        item.environmentId === binding.environmentId &&
        item.webResourceId === binding.webResourceId,
    )
    const nextConfig = {
      ...config,
      bindings: existingBinding
        ? config.bindings.map((item) =>
            item.id === existingBinding.id ? { ...binding, id: item.id } : item,
          )
        : [...config.bindings, { ...binding, id: createId("binding") }],
    }
    set({
      config: nextConfig,
      lastMessage: existingBinding ? "Binding updated" : "Binding added",
    })
    persistConfig(nextConfig, set)
  },

  updateBinding(bindingId, changes) {
    const config = get().config
    const nextConfig = {
      ...config,
      bindings: config.bindings.map((binding) =>
        binding.id === bindingId ? { ...binding, ...changes } : binding,
      ),
    }
    set({ config: nextConfig, lastMessage: "Binding updated" })
    persistConfig(nextConfig, set)
  },

  removeBinding(bindingId) {
    const config = get().config
    const binding = config.bindings.find((item) => item.id === bindingId)

    if (!binding) {
      return
    }

    const nextConfig = {
      ...config,
      bindings: config.bindings.filter((item) => item.id !== bindingId),
    }

    set({
      config: nextConfig,
      lastMessage: `Unbound ${binding.webResourceName}`,
    })
    persistConfig(nextConfig, set)
  },
}))
