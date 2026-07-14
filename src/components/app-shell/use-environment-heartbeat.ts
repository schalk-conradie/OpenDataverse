import { useEffect } from "react"

import { useWorkspaceStore } from "@/store/workspace-store"

export function useEnvironmentHeartbeat(): void {
  const environmentId = useWorkspaceStore(
    (state) => state.config.currentEnvironmentId,
  )
  const loadState = useWorkspaceStore((state) => state.loadState)
  const heartbeatEnvironment = useWorkspaceStore(
    (state) => state.heartbeatEnvironment,
  )

  useEffect(() => {
    if (loadState !== "ready" || !environmentId) {
      return
    }

    const interval = window.setInterval(() => {
      void heartbeatEnvironment(environmentId)
    }, 10 * 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [environmentId, heartbeatEnvironment, loadState])
}
