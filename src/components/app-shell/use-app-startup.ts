import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"

import { appVersion } from "@/core/build-info"
import {
  getChangelogBuildId,
  markChangelogBuildSeen,
  shouldShowChangelogForBuild,
} from "@/core/changelog"
import { getRunningAppVersion } from "@/core/desktop/app-version"
import { useWorkspaceStore } from "@/store/workspace-store"

type AppStartupState = {
  runningAppVersion: string
  changelogOpen: boolean
  setChangelogOpen: Dispatch<SetStateAction<boolean>>
}

export function useAppStartup(): AppStartupState {
  const hydrate = useWorkspaceStore((state) => state.hydrate)
  const [runningAppVersion, setRunningAppVersion] = useState(appVersion)
  const [changelogOpen, setChangelogOpen] = useState(false)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    let cancelled = false

    async function syncChangelogState() {
      const version = await getRunningAppVersion()
      if (cancelled) {
        return
      }

      setRunningAppVersion(version)

      const buildId = getChangelogBuildId(version)
      if (shouldShowChangelogForBuild(buildId)) {
        markChangelogBuildSeen(buildId)
        setChangelogOpen(true)
      }
    }

    void syncChangelogState()

    return () => {
      cancelled = true
    }
  }, [])

  return { runningAppVersion, changelogOpen, setChangelogOpen }
}
