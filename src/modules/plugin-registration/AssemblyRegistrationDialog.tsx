import type {
  Dispatch,
  FormEventHandler,
  ReactElement,
  SetStateAction,
} from "react"
import { AlertTriangle, FileSearch, Loader2 } from "lucide-react"

import type {
  PluginAssemblyInspection,
  PluginAssemblySummary,
} from "@/core/dataverse/schemas"
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
import { cn } from "@/lib/utils"
import type { AssemblyForm } from "./registration-forms"

type AssemblyRegistrationDialogProps = {
  open: boolean
  target?: PluginAssemblySummary
  form: AssemblyForm
  setForm: Dispatch<SetStateAction<AssemblyForm>>
  inspection?: PluginAssemblyInspection
  selectedTypeNames: readonly string[]
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
  inspecting,
  saving,
  onOpenChange,
  onChooseFile,
  onToggleType,
  onSubmit,
}: AssemblyRegistrationDialogProps): ReactElement {
  const registerableTypes =
    inspection?.discoveredTypes.filter(
      (type) => type.kind !== "unknown" && !type.isAbstract && type.isPublic,
    ) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {target ? "Update Assembly" : "Register Assembly"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {target
                ? "Select a replacement assembly and choose its registerable types."
                : "Register a Dataverse plug-in assembly."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="plugin-assembly-file">Assembly</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                id="plugin-assembly-file"
                value={form.localPath}
                placeholder="Select a compiled assembly"
                readOnly
              />
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
                Select
              </Button>
            </div>
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

          {inspection && (
            <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
              <div><span className="text-muted-foreground">Name</span><p className="break-all font-medium">{inspection.assemblyName}</p></div>
              <div><span className="text-muted-foreground">Version</span><p>{inspection.version}</p></div>
              <div><span className="text-muted-foreground">Public key token</span><p className="font-mono">{inspection.publicKeyToken}</p></div>
              <div><span className="text-muted-foreground">Registration</span><p>Sandbox · Database</p></div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="plugin-assembly-description">Description</Label>
            <Input
              id="plugin-assembly-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Plug-ins and workflow activities</Label>
            <div className="max-h-40 overflow-auto rounded-lg border border-border bg-background p-2">
              {registerableTypes.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  Inspect an assembly to select registerable types.
                </p>
              ) : (
                <div className="grid gap-1">
                  {registerableTypes.map((type) => (
                    <label
                      key={type.fullName}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                        selectedTypeNames.includes(type.fullName)
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:bg-muted/60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={selectedTypeNames.includes(type.fullName)}
                        onChange={() => onToggleType(type.fullName)}
                      />
                      <span className="min-w-0 flex-1 truncate">{type.fullName}</span>
                      <Badge variant="outline">
                        {type.kind === "workflow" ? "Workflow" : "Plug-in"}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={
                saving ||
                inspecting ||
                !inspection ||
                !inspection.strongNameSigned ||
                selectedTypeNames.length === 0
              }
            >
              {target ? "Update assembly" : "Register selected plug-ins"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
