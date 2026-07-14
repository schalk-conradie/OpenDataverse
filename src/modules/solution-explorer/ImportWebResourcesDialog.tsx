import { useState } from "react"
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
import type {
  DataverseEnvironment,
  SolutionSummary,
} from "@/core/dataverse/schemas"
import {
  chooseWebResourceImportFiles,
  chooseWebResourceImportFolder,
} from "@/core/desktop/file-dialog"
import { useWorkspaceStore } from "@/store/workspace-store"

import { importWebResourcesInSolution } from "./gateway"
import {
  defaultWebResourceRoot,
  formatSelectedSource,
} from "./solution-model"

type ImportWebResourcesForm = {
  sourcePaths: string[]
  targetRoot: string
  description: string
}

type ImportWebResourcesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  solution?: SolutionSummary
}

export function ImportWebResourcesDialog({
  open,
  onOpenChange,
  environment,
  solution,
}: ImportWebResourcesDialogProps) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const [form, setForm] = useState<ImportWebResourcesForm>({
    sourcePaths: [],
    targetRoot: defaultWebResourceRoot(solution),
    description: "",
  })
  const [errorMessage, setErrorMessage] = useState<string>()

  const mutation = useMutation({
    mutationFn: (input: ImportWebResourcesForm) =>
      importWebResourcesInSolution(environment, {
        solutionUniqueName: solution?.uniqueName ?? "",
        ...input,
      }),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["solutions", environment.id] }),
        queryClient.invalidateQueries({
          queryKey: ["solution-components", environment.id, solution?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "solution-web-resource-candidates",
            environment.id,
            solution?.id,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResources", environment.id],
        }),
      ])
      onOpenChange(false)
    },
    onError: (error) => {
      setErrorMessage(
        showError("Import Web Resources failed", error, "Import failed"),
      )
    },
  })

  function resetForm() {
    setForm({
      sourcePaths: [],
      targetRoot: defaultWebResourceRoot(solution),
      description: "",
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
      setErrorMessage(undefined)
      mutation.reset()
    }

    onOpenChange(nextOpen)
  }

  function updateField<Key extends keyof ImportWebResourcesForm>(
    key: Key,
    value: ImportWebResourcesForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Web Resources</DialogTitle>
          <DialogDescription>
            {solution?.friendlyName ?? "Selected solution"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate(form)
          }}
        >
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
            <div className="truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              {formatSelectedSource(form.sourcePaths)}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-root">Web Resource Root</Label>
            <Input
              id="web-resource-import-root"
              placeholder="AG_/CustomWebresource"
              value={form.targetRoot}
              onChange={(event) => updateField("targetRoot", event.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-import-description">Description</Label>
            <Input
              id="web-resource-import-description"
              value={form.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
            />
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-mono text-[11px] break-words whitespace-pre-wrap text-destructive">
              {errorMessage}
            </div>
          )}

          <DialogFooter className="gap-2">
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
                !form.targetRoot.trim()
              }
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
