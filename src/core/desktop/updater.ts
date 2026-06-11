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

let pendingUpdate: Update | null = null

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
    pendingUpdate = null
    return null
  }

  pendingUpdate = await check()
  return pendingUpdate ? toAvailableAppUpdate(pendingUpdate) : null
}

export async function installAvailableAppUpdate(
  onProgress?: (progress: AppUpdateProgress) => void,
) {
  if (!isTauriRuntime()) {
    return false
  }

  const update = pendingUpdate ?? (await check())
  if (!update) {
    return false
  }

  let downloaded = 0
  let contentLength: number | undefined

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

  pendingUpdate = null
  await relaunch()
  return true
}
