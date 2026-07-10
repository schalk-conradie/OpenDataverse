import { useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FolderOpen, Loader2, Upload } from "lucide-react"

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
import type {
  DataverseEnvironment,
  SolutionSummary,
} from "@/core/dataverse/schemas"
import {
  chooseWebResourceImportFiles,
  chooseWebResourceImportFolder,
} from "@/core/desktop/file-dialog"
import { formatErrorMessage } from "@/core/errors"
import { importWebResourcesInSolution } from "@/modules/solution-explorer/gateway"
import { useWorkspaceStore } from "@/store/workspace-store"

type ImportWebResourcesForm = {
  sourcePaths: string[]
  solutionUniqueName: string
  targetRoot: string
  description: string
}

type ImportWebResourcesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  solutions: SolutionSummary[]
  solutionsLoading: boolean
  solutionsError?: unknown
  initialSourcePaths?: string[]
  initialTargetRoot?: string
  title?: string
  submitLabel?: string
}

function defaultWebResourceRoot(solution?: SolutionSummary) {
  const prefix = solution?.publisherPrefix?.trim() || "new"

  return `${prefix}_/CustomWebresource`
}

function formatSelectedSource(paths: string[]) {
  if (paths.length === 0) {
    return "No source selected"
  }

  if (paths.length === 1) {
    return paths[0]
  }

  return `${paths.length} files selected`
}

export function ImportWebResourcesDialog({
  open,
  onOpenChange,
  environment,
  solutions,
  solutionsLoading,
  solutionsError,
  initialSourcePaths = [],
  initialTargetRoot,
  title = "Import Web Resources",
  submitLabel = "Import",
}: ImportWebResourcesDialogProps) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [form, setForm] = useState<ImportWebResourcesForm>({
    sourcePaths: initialSourcePaths,
    solutionUniqueName: "",
    targetRoot: initialTargetRoot ?? "",
    description: "",
  })
  const selectedSolution =
    solutions.find((solution) => solution.uniqueName === form.solutionUniqueName) ??
    solutions[0]
  const targetRoot = form.targetRoot.trim() || defaultWebResourceRoot(selectedSolution)

  const mutation = useMutation({
    mutationFn: (input: ImportWebResourcesForm) =>
      importWebResourcesInSolution(environment, {
        solutionUniqueName: input.solutionUniqueName,
        sourcePaths: input.sourcePaths,
        targetRoot: input.targetRoot,
        description: input.description,
      }),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["webResources", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solutions", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResourceActivity", environment.id],
        }),
      ])
      onOpenChange(false)
      resetForm()
    },
    onError: (error) => {
      setLastMessage(formatErrorMessage(error, "Import failed"))
    },
  })

  function resetForm() {
    setForm({
      sourcePaths: initialSourcePaths,
      solutionUniqueName: "",
      targetRoot: initialTargetRoot ?? "",
      description: "",
    })
    mutation.reset()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
    }

    onOpenChange(nextOpen)
  }

  function updateField<Key extends keyof ImportWebResourcesForm>(
    key: Key,
    value: ImportWebResourcesForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function selectSolution(solutionUniqueName: string) {
    const previousDefault = defaultWebResourceRoot(selectedSolution)
    const nextSolution = solutions.find(
      (solution) => solution.uniqueName === solutionUniqueName,
    )

    setForm((current) => ({
      ...current,
      solutionUniqueName,
      targetRoot:
        current.targetRoot.trim() === "" || current.targetRoot === previousDefault
          ? defaultWebResourceRoot(nextSolution)
          : current.targetRoot,
    }))
  }

  async function selectFiles() {
    const sourcePaths = await chooseWebResourceImportFiles()
    if (sourcePaths.length === 0) {
      return
    }

    updateField("sourcePaths", sourcePaths)
  }

  async function selectFolder() {
    const sourcePath = await chooseWebResourceImportFolder()
    if (!sourcePath) {
      return
    }

    updateField("sourcePaths", [sourcePath])
  }

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedSolution) {
      setLastMessage("Select an unmanaged solution before importing web resources.")
      return
    }

    mutation.mutate({
      ...form,
      solutionUniqueName: selectedSolution.uniqueName,
      targetRoot,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{environment.name}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submitImport}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void selectFiles()}
            >
              <Upload className="size-4" />
              Files
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void selectFolder()}
            >
              <FolderOpen className="size-4" />
              Folder
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Source</Label>
            <div className="truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {formatSelectedSource(form.sourcePaths)}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-solution">Solution</Label>
            <Select
              value={selectedSolution?.uniqueName}
              onValueChange={selectSolution}
              disabled={solutionsLoading || solutions.length === 0}
            >
              <SelectTrigger id="web-resource-import-solution" className="w-full">
                <SelectValue
                  placeholder={
                    solutionsLoading ? "Loading solutions" : "Select solution"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {solutions.map((solution) => (
                  <SelectItem key={solution.id} value={solution.uniqueName}>
                    {solution.friendlyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {solutionsError ? (
              <p className="text-xs text-destructive">
                {formatErrorMessage(solutionsError, "Could not load solutions.")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-root">Web Resource Root</Label>
            <Input
              id="web-resource-import-root"
              placeholder="AG_/CustomWebresource"
              value={targetRoot}
              onChange={(event) => updateField("targetRoot", event.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-description">Description</Label>
            <Input
              id="web-resource-import-description"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                form.sourcePaths.length === 0 ||
                !selectedSolution ||
                !targetRoot.trim()
              }
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
