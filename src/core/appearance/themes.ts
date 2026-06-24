export const appearanceThemeIds = [
  "opendataverse",
  "gruvbox",
  "rose-pine",
  "catppuccin",
] as const

export const appearanceModes = ["light", "dark"] as const

export type AppearanceThemeId = (typeof appearanceThemeIds)[number]
export type AppearanceMode = (typeof appearanceModes)[number]

export type AppearanceTheme = {
  id: AppearanceThemeId
  label: string
  swatches: readonly string[]
}

export const defaultAppearanceThemeId: AppearanceThemeId = "opendataverse"
export const defaultAppearanceMode: AppearanceMode = "light"

export const appearanceThemes: readonly AppearanceTheme[] = [
  {
    id: "opendataverse",
    label: "OpenDataverse",
    swatches: ["#ffffff", "#f4f4f6", "#7f47dd", "#292a31"],
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    swatches: ["#fbf1c7", "#ebdbb2", "#d79921", "#282828"],
  },
  {
    id: "rose-pine",
    label: "Rose Pine",
    swatches: ["#faf4ed", "#f2e9e1", "#907aa9", "#191724"],
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    swatches: ["#eff1f5", "#e6e9ef", "#8839ef", "#1e1e2e"],
  },
]

export function getAppearanceTheme(themeId: AppearanceThemeId) {
  return (
    appearanceThemes.find((theme) => theme.id === themeId) ??
    appearanceThemes[0]
  )
}

export function getAppearanceThemeClassName(themeId: AppearanceThemeId) {
  return `theme-${themeId}`
}
