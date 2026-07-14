import { useEffect, useState } from "react"

import {
  checkForAppUpdate,
  installLatestAppUpdate,
  type AvailableAppUpdate,
  type AppUpdateProgress,
} from "@/core/desktop/updater"
import { useWorkspaceStore } from "@/store/workspace-store"

type AppUpdaterState = {
  availableUpdate: AvailableAppUpdate | null
  installingUpdate: boolean
  updateProgress?: AppUpdateProgress
  installUpdate: () => Promise<void>
}

export function useAppUpdater(): AppUpdaterState {
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableAppUpdate | null>(null)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<AppUpdateProgress>()

  useEffect(() => {
    let cancelled = false

    async function refreshAvailableUpdate() {
      try {
        const update = await checkForAppUpdate()
        if (cancelled) {
          return
        }

        setAvailableUpdate(update)
      } catch {
        if (!cancelled) {
          setAvailableUpdate(null)
        }
      }
    }

    void refreshAvailableUpdate()
    const interval = window.setInterval(refreshAvailableUpdate, 30 * 60 * 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  async function installUpdate() {
    if (installingUpdate) {
      return
    }

    setInstallingUpdate(true)
    setUpdateProgress(undefined)
    setLastMessage("Checking for the latest OpenDataverse update")

    try {
      const installed = await installLatestAppUpdate(
        setUpdateProgress,
        (update) => {
          setAvailableUpdate(update)
          setLastMessage(`Installing OpenDataverse ${update.version}`)
        },
      )
      if (!installed) {
        setAvailableUpdate(null)
        setLastMessage("OpenDataverse is up to date")
      }
    } catch (error) {
      setInstallingUpdate(false)
      showError("Update failed", error, "Could not install update")
    }
  }

  return {
    availableUpdate,
    installingUpdate,
    updateProgress,
    installUpdate,
  }
}
