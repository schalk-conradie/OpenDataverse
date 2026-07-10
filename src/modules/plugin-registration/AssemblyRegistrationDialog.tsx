import type {
  Dispatch,
  FormEventHandler,
  ReactElement,
  SetStateAction,
} from "react"
import { AlertTriangle, Check, FileSearch, Loader2 } from "lucide-react"

import type {
  PluginAssemblyInspection,
  PluginAssemblySummary,
  PluginRegistrationSnapshot,
} from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AssemblyForm } from "./registration-forms"

type AssemblyRegistrationDialogProps = {
  open: boolean
  target?: PluginAssemblySummary
  form: AssemblyForm
  setForm: Dispatch<SetStateAction<AssemblyForm>>
  inspection?: PluginAssemblyInspection
  selectedTypeNames: readonly string[]
  snapshot: PluginRegistrationSnapshot
  messageFilterError: Error | null
  inspecting: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onChooseFile: () => void
  onToggleType: (typeName: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function AssemblyRegistrationDialog({
  open,
  target,
  form,
  setForm,
  inspection,
  selectedTypeNames,
  snapshot,
  messageFilterError,
  inspecting,
  saving,
  onOpenChange,
  onChooseFile,
  onToggleType,
  onSubmit,
}: AssemblyRegistrationDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {target ? "Update Assembly" : "Register Assembly"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Register or update a Dataverse plug-in assembly.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input value={form.localPath} readOnly />
            <Button
              type="button"
              variant="outline"
              onClick={onChooseFile}
              disabled={inspecting}
            >
              {inspecting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileSearch />
              )}
              Inspect
            </Button>
          </div>

          {inspection?.warnings.length ? (
            <div className="grid gap-1 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
              {inspection.warnings.map((warning) => (
                <div key={warning} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="plugin-assembly-name">Name</Label>
              <Input
                id="plugin-assembly-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-assembly-version">Version</Label>
              <Input
                id="plugin-assembly-version"
                value={form.version}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    version: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Isolation</Label>
              <Select
                value={String(form.isolationMode)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    isolationMode: Number(value),
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.isolationModeOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {messageFilterError && (
                <p className="text-xs text-destructive">
                  {formatErrorMessage(
                    messageFilterError,
                    "Message filters could not be loaded.",
                  )}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Source</Label>
              <Select
                value={String(form.sourceType)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    sourceType: Number(value),
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.sourceTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-assembly-culture">Culture</Label>
              <Input
                id="plugin-assembly-culture"
                value={form.culture}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    culture: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-assembly-token">Public Key Token</Label>
              <Input
                id="plugin-assembly-token"
                value={form.publicKeyToken}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    publicKeyToken: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="plugin-assembly-description">Description</Label>
            <Input
              id="plugin-assembly-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Types</Label>
            <div className="max-h-40 overflow-auto rounded-lg border border-border bg-background p-2">
              {(inspection?.discoveredTypes ?? []).length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  Inspect an assembly to select registerable types.
                </p>
              ) : (
                <div className="grid gap-1">
                  {inspection?.discoveredTypes.map((type) => (
                    <button
                      key={type.fullName}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                        selectedTypeNames.includes(type.fullName)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:bg-muted/60",
                      )}
                      onClick={() => onToggleType(type.fullName)}
                    >
                      <span className="flex size-4 items-center justify-center rounded border border-border bg-background">
                        {selectedTypeNames.includes(type.fullName) && (
                          <Check className="size-3 text-primary" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{type.fullName}</span>
                      <Badge variant="outline">{type.kind}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {target ? "Update" : "Register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
