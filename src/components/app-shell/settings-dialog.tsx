import { Palette, Settings, ShieldAlert, SunMoon } from "lucide-react"

import { ChangelogContent } from "@/components/changelog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  appearanceModes,
  appearanceThemes,
  getAppearanceTheme,
  type AppearanceMode,
  type AppearanceThemeId,
} from "@/core/appearance/themes"
import { useWorkspaceStore } from "@/store/workspace-store"

const appearanceModeLabels: Record<AppearanceMode, string> = {
  light: "Light",
  dark: "Dark",
}

export function SettingsDialog({ appVersion }: { appVersion: string }) {
  const appearanceThemeId = useWorkspaceStore(
    (state) => state.userSettings.appearance.theme,
  )
  const appearanceMode = useWorkspaceStore(
    (state) => state.userSettings.appearance.mode,
  )
  const experimentalAiAgentEnabled = useWorkspaceStore(
    (state) => state.userSettings.dangerZone.experimentalAiAgentEnabled,
  )
  const setAppearanceTheme = useWorkspaceStore(
    (state) => state.setAppearanceTheme,
  )
  const setAppearanceMode = useWorkspaceStore(
    (state) => state.setAppearanceMode,
  )
  const setExperimentalAiAgentEnabled = useWorkspaceStore(
    (state) => state.setExperimentalAiAgentEnabled,
  )
  const selectedTheme = getAppearanceTheme(appearanceThemeId)

  function changeTheme(value: string) {
    setAppearanceTheme(value as AppearanceThemeId)
  }

  function changeMode(value: string) {
    setAppearanceMode(value as AppearanceMode)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start" size="sm">
          <Settings />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="grid h-[min(680px,calc(100vh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Configure OpenDataverse settings.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="appearance" className="min-h-0">
          <TabsList variant="line" className="w-full justify-start">
            <TabsTrigger value="appearance" className="flex-none px-2">
              Appearance
            </TabsTrigger>
            <TabsTrigger value="danger-zone" className="flex-none px-2">
              Danger Zone
            </TabsTrigger>
            <TabsTrigger value="changelog" className="flex-none px-2">
              Changelog
            </TabsTrigger>
          </TabsList>
          <TabsContent value="appearance" className="min-h-0 pt-3">
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
                <div className="flex min-h-8 items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <Palette className="size-4 shrink-0 text-muted-foreground" />
                    <Label
                      htmlFor="settings-appearance-theme"
                      className="text-sm font-medium"
                    >
                      Theme
                    </Label>
                  </div>
                  <Select
                    value={appearanceThemeId}
                    onValueChange={changeTheme}
                  >
                    <SelectTrigger
                      id="settings-appearance-theme"
                      className="w-44"
                    >
                      <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent>
                      {appearanceThemes.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          {theme.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-1.5 pl-6" aria-hidden="true">
                  {selectedTheme.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="size-4 rounded-sm border border-border"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border bg-background p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <SunMoon className="size-4 shrink-0 text-muted-foreground" />
                  <Label
                    htmlFor="settings-appearance-mode"
                    className="text-sm font-medium"
                  >
                    Mode
                  </Label>
                </div>
                <Select value={appearanceMode} onValueChange={changeMode}>
                  <SelectTrigger
                    id="settings-appearance-mode"
                    className="w-32"
                  >
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {appearanceModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {appearanceModeLabels[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="danger-zone" className="min-h-0 pt-3">
            <div className="flex min-h-20 items-start justify-between gap-4 border border-destructive/40 bg-destructive/10 px-3 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <Label
                    htmlFor="settings-experimental-ai-agent"
                    className="text-sm font-medium"
                  >
                    AI Agent (Experimental)
                  </Label>
                  <p className="mt-1 text-xs leading-5 text-destructive">
                    Unsafe module. It can make Dataverse changes, and serious
                    harm could come to an environment.
                  </p>
                </div>
              </div>
              <Switch
                id="settings-experimental-ai-agent"
                checked={experimentalAiAgentEnabled}
                onCheckedChange={setExperimentalAiAgentEnabled}
              />
            </div>
          </TabsContent>
          <TabsContent
            value="changelog"
            className="min-h-0 overflow-hidden pt-3"
          >
            <ChangelogContent appVersion={appVersion} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
