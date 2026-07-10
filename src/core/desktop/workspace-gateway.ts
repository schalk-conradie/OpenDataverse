import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/runtime"

import {
  appConfigSchema,
  type AuthSession,
  type BrowserAuthStart,
  type AppConfig,
  type DataverseEnvironment,
  defaultAppConfig,
  defaultUserSettings,
  userSettingsSchema,
  type UserSettings,
} from "@/core/dataverse/schemas"
import { loadStoredJsonOrDefault } from "@/core/storage/safe-json"
const storageKey = "opendataverse.config"
const userSettingsStorageKey = "opendataverse.user-settings"

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
