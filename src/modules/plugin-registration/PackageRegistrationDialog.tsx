import type { FormEventHandler, ReactElement } from "react"
import { FileSearch, Loader2 } from "lucide-react"

import type { PluginPackageInspection, PluginPackageSummary, SolutionSummary } from "@/core/dataverse/schemas"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type PackageRegistrationDialogProps = {
  open: boolean
  target?: PluginPackageSummary
  localPath: string
  solutionUniqueName: string
  solutions: readonly SolutionSummary[]
  solutionsLoading: boolean
  solutionsError?: string
  inspection?: PluginPackageInspection
  inspecting: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onChooseFile: () => void
  onSolutionChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function PackageRegistrationDialog({
  open, target, localPath, solutionUniqueName, solutions, solutionsLoading, solutionsError,
  inspection, inspecting, saving,
  onOpenChange, onChooseFile, onSolutionChange, onSubmit,
}: PackageRegistrationDialogProps): ReactElement {
  const identityMatches = !target || !inspection || (
    target.name === inspection?.name && target.version === inspection?.version
  )
  const selectedSolution = solutions.find(
    (solution) => solution.uniqueName === solutionUniqueName,
  )
  const requiredPrefix = selectedSolution?.publisherPrefix?.trim()
  const prefixMatches = !inspection || !selectedSolution || Boolean(
    requiredPrefix && inspection.name.toLowerCase().startsWith(`${requiredPrefix.toLowerCase()}_`),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{target ? "Update plug-in package" : "Register plug-in package"}</DialogTitle>
            <DialogDescription>
              Select a NuGet package. Dataverse registers its plug-in assemblies and types.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="plugin-package-file">NuGet package</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input id="plugin-package-file" value={localPath} readOnly placeholder="Select a .nupkg file" />
              <Button type="button" variant="outline" onClick={onChooseFile} disabled={inspecting}>
                {inspecting ? <Loader2 className="animate-spin" /> : <FileSearch />}
                Select
              </Button>
            </div>
          </div>
          {inspection && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Package</span><p className="break-all font-medium">{inspection.name}</p></div>
                <div><span className="text-muted-foreground">Version</span><p>{inspection.version}</p></div>
              </div>
              <p className="mt-3 text-muted-foreground">Assemblies</p>
              {inspection.assemblyFiles.map((file) => (
                <p key={file} className="break-all font-mono">{file}</p>
              ))}
            </div>
          )}
          {!identityMatches && (
            <p className="text-xs text-destructive">
              Package id and version must match the existing registration.
            </p>
          )}
          {!target && !prefixMatches && (
            <p className="text-xs text-destructive">
              The NuGet package id must start with "{requiredPrefix}_". Rebuild the package with that prefix.
            </p>
          )}
          {!target && (
            <div className="grid gap-2">
              <Label>Unmanaged solution</Label>
              <Select value={solutionUniqueName} onValueChange={onSolutionChange}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={solutionsLoading ? "Loading solutions" : "Select solution"} />
                </SelectTrigger>
                <SelectContent>
                  {solutions.filter((solution) => solution.publisherPrefix).map((solution) => (
                    <SelectItem key={solution.id} value={solution.uniqueName}>
                      {solution.friendlyName} · {solution.publisherPrefix}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The package unique name uses this solution's publisher prefix.
              </p>
              {solutionsError && <p className="text-xs text-destructive">{solutionsError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving || inspecting || !inspection || !identityMatches || !prefixMatches || (!target && !solutionUniqueName)}>
              {target ? "Update package" : "Register package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
