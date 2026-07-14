import { create } from "zustand"
import { openUrl } from "@tauri-apps/plugin-opener"

import {
  checkDataverseConnection,
  completeBrowserAuth,
  deleteEnvironmentToken,
  loadAppConfig,
  loadUserSettings,
  saveAppConfig,
  saveUserSettings,
  startBrowserAuth,
} from "@/core/desktop/workspace-gateway"
import { isTauriRuntime } from "@/core/desktop/runtime"
import { formatErrorDetails, formatErrorMessage } from "@/core/errors"
import {
  type AppearanceMode,
  type AppearanceThemeId,
} from "@/core/appearance/themes"
import {
  createId,
  defaultAppConfig,
  defaultUserSettings,
  getEnvironmentById,
  type AppConfig,
  type DataverseEnvironment,
  type ToolId,
  type ToolWindow,
  type UserSettings,
  type WebResourceBinding,
} from "@/core/dataverse/schemas"
import { getToolDefinition } from "@/modules/tool-registry"
import {
  applyEnvironmentAuthState,
  applyEnvironmentUpdate,
  closeToolWindow,
  removeEnvironmentFromWorkspace,
  removeWebResourceBinding,
  updateToolWindowState,
  updateWebResourceBinding,
  upsertWebResourceBinding,
  validateEnvironmentInput,
  type EnvironmentInput,
  type WebResourceBindingChanges,
} from "@/store/workspace-state"

type LoadState = "idle" | "loading" | "ready" | "error"

export type AppNotificationSeverity = "info" | "success" | "error"

export type AppNotification = {
  id: string
  title?: string
  message: string
  details?: string
  severity: AppNotificationSeverity
  createdAt: string
}

type OpenToolOptions = {
  newWindow?: boolean
}

type SetLastMessageOptions = {
  title?: string
  details?: string
  severity?: AppNotificationSeverity
}

type WorkspaceStore = {
  config: AppConfig
  userSettings: UserSettings
  loadState: LoadState
  openWindows: ToolWindow[]
  activeWindowId?: string
  lastMessage?: string
  lastNotification?: AppNotification
  hydrate: () => Promise<void>
  addEnvironment: (input: EnvironmentInput) => void
  updateEnvironment: (
    environmentId: string,
    input: EnvironmentInput,
  ) => Promise<boolean>
  deleteEnvironment: (environmentId: string) => Promise<boolean>
  selectEnvironment: (environmentId: string) => void
  connectEnvironment: (environmentId: string) => Promise<void>
  heartbeatEnvironment: (environmentId: string) => Promise<void>
  setEnvironmentAuthState: (
    environmentId: string,
    authState: DataverseEnvironment["authState"],
    message?: string,
  ) => void
  setLastMessage: (message?: string, options?: SetLastMessageOptions) => void
  showError: (title: string, error: unknown, fallback: string) => string
  dismissNotification: (notificationId?: string) => void
  setDarkMode: (enabled: boolean) => void
  setAppearanceMode: (mode: AppearanceMode) => void
  setAppearanceTheme: (themeId: AppearanceThemeId) => void
  setExperimentalAiAgentEnabled: (enabled: boolean) => void
  openTool: (toolId: ToolId, options?: OpenToolOptions) => void
  closeWindow: (windowId: string) => void
  activateWindow: (windowId: string) => void
  updateWindowState: (
    windowId: string,
    state: NonNullable<ToolWindow["state"]>,
  ) => void
  addBinding: (binding: Omit<WebResourceBinding, "id">) => void
  updateBinding: (
    bindingId: string,
    changes: WebResourceBindingChanges,
  ) => void
  removeBinding: (bindingId: string) => void
}

const activeConnectionChecks = new Set<string>()

function makeNotification(
  message: string,
  options?: SetLastMessageOptions,
): AppNotification {
  return {
    id: createId("notification"),
    title: options?.title,
    message,
    details: options?.details,
    severity: options?.severity ?? inferNotificationSeverity(message),
    createdAt: new Date().toISOString(),
  }
}

function inferNotificationSeverity(message: string): AppNotificationSeverity {
  const normalized = message.toLowerCase()
  if (
    normalized.includes("failed") ||
    normalized.includes("could not") ||
    normalized.includes("error") ||
    normalized.includes("invalid") ||
    normalized.includes("not found") ||
    normalized.includes("required")
  ) {
    return "error"
  }

  if (
    normalized.includes("added") ||
    normalized.includes("created") ||
    normalized.includes("completed") ||
    normalized.includes("updated")
  ) {
    return "success"
  }

  return "info"
}

function notificationState(
  message?: string,
  options?: SetLastMessageOptions,
): Pick<WorkspaceStore, "lastMessage" | "lastNotification"> {
  return {
    lastMessage: message,
    lastNotification: message ? makeNotification(message, options) : undefined,
  }
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

function persistConfig(
  config: AppConfig,
  set: (state: Partial<WorkspaceStore>) => void,
) {
  void saveAppConfig(config).catch((error: unknown) => {
    const fallback = "Could not save app config"
    set({
      ...notificationState(formatErrorMessage(error, fallback), {
        title: "Save failed",
        details: formatErrorDetails(error, fallback),
        severity: "error",
      }),
    })
  })
}

function persistUserSettings(
  settings: UserSettings,
  set: (state: Partial<WorkspaceStore>) => void,
) {
  void saveUserSettings(settings).catch((error: unknown) => {
    const fallback = "Could not save user settings"
    set({
      ...notificationState(formatErrorMessage(error, fallback), {
        title: "Save failed",
        details: formatErrorDetails(error, fallback),
        severity: "error",
      }),
    })
  })
}

function authStateForConnectionError(
  error: unknown,
): DataverseEnvironment["authState"] {
  const message = formatErrorMessage(error, "")
  const lower = message.toLowerCase()

  if (
    lower.includes("token was not found") ||
    lower.includes("no refresh token") ||
    lower.includes("sign in again") ||
    lower.includes("invalid_grant") ||
    lower.includes("token refresh failed")
  ) {
    return "expired"
  }

  return "error"
}

async function updateEnvironmentConnection(
  environmentId: string,
  options: {
    get: () => WorkspaceStore
    set: (state: Partial<WorkspaceStore>) => void
    interactive: boolean
    showConnecting: boolean
    forceBrowserAuth?: boolean
  },
) {
  if (activeConnectionChecks.has(environmentId)) {
    return
  }

  const { get, set, interactive, showConnecting, forceBrowserAuth } = options
  const environment = getEnvironmentById(get().config, environmentId)
  if (!environment) {
    return
  }

  activeConnectionChecks.add(environmentId)

  if (showConnecting) {
    const connectingConfig = applyEnvironmentAuthState(
      get().config,
      environmentId,
      "connecting",
    )
    set({
      config: connectingConfig,
      lastMessage: "Checking Dataverse connection",
    })
    persistConfig(connectingConfig, set)
  }

  try {
    if (!forceBrowserAuth) {
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
        return
      } catch (checkError) {
        if (!interactive) {
          const currentEnvironment = getEnvironmentById(
            get().config,
            environmentId,
          )
          const nextState = authStateForConnectionError(checkError)
          const nextConfig = applyEnvironmentAuthState(
            get().config,
            environmentId,
            nextState,
          )

          set({
            config: nextConfig,
            lastMessage:
              currentEnvironment?.authState === "connected" ||
              currentEnvironment?.authState === "connecting"
                ? formatErrorMessage(checkError, "Dataverse heartbeat failed")
                : get().lastMessage,
          })
          persistConfig(nextConfig, set)
          return
        }
      }
    }

    try {
      const browserAuth = await startBrowserAuth(environment)
      set({ lastMessage: "Opening browser sign-in" })

      if (isTauriRuntime()) {
        await openUrl(browserAuth.authUrl)
      }

      const session = await completeBrowserAuth(
        environment,
        browserAuth.sessionId,
      )
      const nextConfig = applyEnvironmentAuthState(
        get().config,
        environmentId,
        "connected",
      )
      set({ config: nextConfig, lastMessage: session.message })
      persistConfig(nextConfig, set)
    } catch (authError) {
      const nextConfig = applyEnvironmentAuthState(
        get().config,
        environmentId,
        authStateForConnectionError(authError),
      )
      set({
        config: nextConfig,
        lastMessage: formatErrorMessage(authError, "Sign-in failed"),
      })
      persistConfig(nextConfig, set)
    }
  } finally {
    activeConnectionChecks.delete(environmentId)
  }
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  config: defaultAppConfig,
  userSettings: defaultUserSettings,
  loadState: "idle",
  openWindows: [],
  activeWindowId: undefined,
  lastMessage: undefined,
  lastNotification: undefined,

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

      set({
        config: currentEnvironment
          ? loadedConfig
          : { ...loadedConfig, currentEnvironmentId: undefined },
        userSettings: loadedUserSettings,
        loadState: "ready",
        openWindows: [],
        activeWindowId: undefined,
        lastMessage: undefined,
        lastNotification: undefined,
      })
    } catch (error) {
      const fallback = "Could not load app config"
      set({
        loadState: "error",
        config: defaultAppConfig,
        userSettings: defaultUserSettings,
        ...notificationState(formatErrorMessage(error, fallback), {
          title: "Load failed",
          details: formatErrorDetails(error, fallback),
          severity: "error",
        }),
      })
    }
  },

  addEnvironment(input) {
    const config = get().config
    const result = validateEnvironmentInput(config, input)

    if (!result.ok) {
      set({ lastMessage: result.error })
      return
    }

    const environment = {
      id: createId("environment"),
      name: result.data.name,
      url: result.data.url,
      authState: "disconnected" as const,
    } satisfies DataverseEnvironment
    const nextConfig = {
      ...config,
      currentEnvironmentId: environment.id,
      environments: [...config.environments, environment],
    }

    set({
      config: nextConfig,
      activeWindowId: undefined,
      lastMessage: "Environment added",
    })
    persistConfig(nextConfig, set)
    void updateEnvironmentConnection(environment.id, {
      get,
      set,
      interactive: true,
      showConnecting: true,
    })
  },

  async updateEnvironment(environmentId, input) {
    const config = get().config
    const environment = getEnvironmentById(config, environmentId)

    if (!environment) {
      set({ lastMessage: "Environment was not found" })
      return false
    }

    const result = validateEnvironmentInput(config, input, environmentId)

    if (!result.ok) {
      set({ lastMessage: result.error })
      return false
    }

    const update = applyEnvironmentUpdate(
      config,
      get().openWindows,
      get().activeWindowId,
      environment,
      result.data,
    )

    if (update.urlChanged && activeConnectionChecks.has(environmentId)) {
      set({
        lastMessage: "Wait for sign-in to finish before changing the URL",
      })
      return false
    }

    if (update.urlChanged) {
      try {
        await deleteEnvironmentToken(environmentId)
      } catch (error) {
        set({
          lastMessage: formatErrorMessage(
            error,
            "Could not remove environment token",
          ),
        })
        return false
      }
    }

    set({
      config: update.config,
      openWindows: update.openWindows,
      activeWindowId: update.activeWindowId,
      lastMessage: update.urlChanged
        ? "Environment updated. Reconnect to use the new URL."
        : "Environment updated",
    })
    persistConfig(update.config, set)
    return true
  },

  async deleteEnvironment(environmentId) {
    const config = get().config
    const environment = getEnvironmentById(config, environmentId)

    if (!environment) {
      set({ lastMessage: "Environment was not found" })
      return false
    }

    if (activeConnectionChecks.has(environmentId)) {
      set({
        lastMessage:
          "Wait for sign-in to finish before deleting this environment",
      })
      return false
    }

    try {
      await deleteEnvironmentToken(environmentId)
    } catch (error) {
      set({
        lastMessage: formatErrorMessage(
          error,
          "Could not remove environment token",
        ),
      })
      return false
    }

    const removal = removeEnvironmentFromWorkspace(
      config,
      get().openWindows,
      get().activeWindowId,
      environmentId,
    )

    set({
      config: removal.config,
      openWindows: removal.openWindows,
      activeWindowId: removal.activeWindowId,
      lastMessage: `Deleted ${environment.name}`,
    })
    persistConfig(removal.config, set)
    return true
  },

  selectEnvironment(environmentId) {
    const config = get().config

    if (!getEnvironmentById(config, environmentId)) {
      return
    }

    const nextConfig = { ...config, currentEnvironmentId: environmentId }
    set({
      config: nextConfig,
      activeWindowId: undefined,
      lastMessage: undefined,
    })
    persistConfig(nextConfig, set)
    void updateEnvironmentConnection(environmentId, {
      get,
      set,
      interactive: true,
      showConnecting: true,
    })
  },

  async connectEnvironment(environmentId) {
    await updateEnvironmentConnection(environmentId, {
      get,
      set,
      interactive: true,
      showConnecting: true,
      forceBrowserAuth: true,
    })
  },

  async heartbeatEnvironment(environmentId) {
    await updateEnvironmentConnection(environmentId, {
      get,
      set,
      interactive: false,
      showConnecting: false,
    })
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

  setLastMessage(message, options) {
    set(notificationState(message, options))
  },

  showError(title, error, fallback) {
    const message = formatErrorMessage(error, fallback)
    set(
      notificationState(message, {
        title,
        details: formatErrorDetails(error, fallback),
        severity: "error",
      }),
    )
    return message
  },

  dismissNotification(notificationId) {
    const notification = get().lastNotification
    if (!notification || (notificationId && notification.id !== notificationId)) {
      return
    }

    set({ lastNotification: undefined })
  },

  setDarkMode(enabled) {
    get().setAppearanceMode(enabled ? "dark" : "light")
  },

  setAppearanceMode(mode) {
    const settings = get().userSettings
    const nextSettings = {
      ...settings,
      appearance: {
        ...settings.appearance,
        mode,
        darkMode: mode === "dark",
      },
    }

    set({ userSettings: nextSettings, lastMessage: undefined })
    persistUserSettings(nextSettings, set)
  },

  setAppearanceTheme(themeId) {
    const settings = get().userSettings
    const nextSettings = {
      ...settings,
      appearance: {
        ...settings.appearance,
        theme: themeId,
      },
    }

    set({ userSettings: nextSettings, lastMessage: undefined })
    persistUserSettings(nextSettings, set)
  },

  setExperimentalAiAgentEnabled(enabled) {
    const settings = get().userSettings
    const nextSettings = {
      ...settings,
      dangerZone: {
        ...settings.dangerZone,
        experimentalAiAgentEnabled: enabled,
      },
    }
    const nextWindows = enabled
      ? get().openWindows
      : get().openWindows.filter(
          (window) => window.toolId !== "ai-agent-experimental",
        )
    const activeWindowStillOpen = nextWindows.some(
      (window) => window.id === get().activeWindowId,
    )

    set({
      userSettings: nextSettings,
      openWindows: nextWindows,
      activeWindowId: activeWindowStillOpen
        ? get().activeWindowId
        : nextWindows.at(-1)?.id,
      lastMessage: enabled ? undefined : "AI Agent (Experimental) disabled",
    })
    persistUserSettings(nextSettings, set)
  },

  openTool(toolId, options) {
    const config = get().config
    const environment = getEnvironmentById(config, config.currentEnvironmentId)

    if (!environment) {
      set({ lastMessage: "Select an environment before opening a tool" })
      return
    }

    if (
      toolId === "ai-agent-experimental" &&
      !get().userSettings.dangerZone.experimentalAiAgentEnabled
    ) {
      set({
        lastMessage:
          "Enable AI Agent (Experimental) in Settings > Danger Zone first",
      })
      return
    }

    const tool = getToolDefinition(toolId)

    if (tool.status === "planned") {
      set({ lastMessage: `${tool.title} is planned` })
      return
    }

    if (!options?.newWindow) {
      const existingWindow = get().openWindows.find(
        (window) =>
          window.toolId === toolId && window.environmentId === environment.id,
      )

      if (existingWindow) {
        set({ activeWindowId: existingWindow.id, lastMessage: undefined })
        return
      }
    }

    const window = createToolWindow(toolId, environment.id)
    set({
      openWindows: [...get().openWindows, window],
      activeWindowId: window.id,
      lastMessage: undefined,
    })
  },

  closeWindow(windowId) {
    set(closeToolWindow(get().openWindows, get().activeWindowId, windowId))
  },

  activateWindow(windowId) {
    set({ activeWindowId: windowId })
  },

  updateWindowState(windowId, state) {
    set({
      openWindows: updateToolWindowState(get().openWindows, windowId, state),
    })
  },

  addBinding(binding) {
    const config = get().config
    const upsert = upsertWebResourceBinding(
      config,
      binding,
      createId("binding"),
    )
    set({
      config: upsert.config,
      lastMessage: upsert.existingBinding ? "Binding updated" : "Binding added",
    })
    persistConfig(upsert.config, set)
  },

  updateBinding(bindingId, changes) {
    const nextConfig = updateWebResourceBinding(
      get().config,
      bindingId,
      changes,
    )
    set({ config: nextConfig, lastMessage: "Binding updated" })
    persistConfig(nextConfig, set)
  },

  removeBinding(bindingId) {
    const removal = removeWebResourceBinding(get().config, bindingId)

    if (!removal.removedBinding) {
      return
    }

    set({
      config: removal.config,
      lastMessage: `Unbound ${removal.removedBinding.webResourceName}`,
    })
    persistConfig(removal.config, set)
  },
}))
