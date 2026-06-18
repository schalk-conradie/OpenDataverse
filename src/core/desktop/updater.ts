import { relaunch } from "@tauri-apps/plugin-process"
import { check, type Update } from "@tauri-apps/plugin-updater"

import { isTauriRuntime } from "@/core/desktop/bridge"

export type AvailableAppUpdate = {
  version: string
  currentVersion: string
  date?: string
  body?: string
}

export type AppUpdateProgress = {
  downloaded: number
  contentLength?: number
  percentage?: number
}

function toAvailableAppUpdate(update: Update): AvailableAppUpdate {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
  }
}

export async function checkForAppUpdate() {
  if (!isTauriRuntime()) {
    return null
  }

  const update = await check()
  if (!update) {
    return null
  }

  const availableUpdate = toAvailableAppUpdate(update)
  await update.close().catch(() => undefined)
  return availableUpdate
}

export async function installLatestAppUpdate(
  onProgress?: (progress: AppUpdateProgress) => void,
  onUpdateFound?: (update: AvailableAppUpdate) => void,
) {
  if (!isTauriRuntime()) {
    return false
  }

  const update = await check()
  if (!update) {
    return false
  }

  onUpdateFound?.(toAvailableAppUpdate(update))

  let downloaded = 0
  let contentLength: number | undefined

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength ?? undefined
        downloaded = 0
      }

      if (event.event === "Progress") {
        downloaded += event.data.chunkLength
      }

      onProgress?.({
        downloaded,
        contentLength,
        percentage: contentLength
          ? Math.min(100, Math.round((downloaded / contentLength) * 100))
          : undefined,
      })
    })
  } finally {
    await update.close().catch(() => undefined)
  }

  await relaunch()
  return true
}
