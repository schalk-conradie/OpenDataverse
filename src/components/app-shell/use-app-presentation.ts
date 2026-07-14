import { useEffect } from "react"

import {
  appearanceThemes,
  getAppearanceThemeClassName,
} from "@/core/appearance/themes"
import { appWindowTitle } from "@/core/build-info"
import { useWorkspaceStore } from "@/store/workspace-store"

const appearanceThemeClassNames = appearanceThemes.map((theme) =>
  getAppearanceThemeClassName(theme.id),
)

export function useAppPresentation(): void {
  const appearanceThemeId = useWorkspaceStore(
    (state) => state.userSettings.appearance.theme,
  )
  const appearanceMode = useWorkspaceStore(
    (state) => state.userSettings.appearance.mode,
  )

  useEffect(() => {
    const root = document.documentElement

    root.classList.remove(...appearanceThemeClassNames)
    root.classList.add(getAppearanceThemeClassName(appearanceThemeId))
    root.classList.toggle("dark", appearanceMode === "dark")
    root.dataset.appearanceTheme = appearanceThemeId
    root.dataset.appearanceMode = appearanceMode
  }, [appearanceMode, appearanceThemeId])

  useEffect(() => {
    document.title = appWindowTitle

    if (!("__TAURI_INTERNALS__" in window)) {
      return
    }

    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().setTitle(appWindowTitle),
      )
      .catch(() => undefined)
  }, [])
}
