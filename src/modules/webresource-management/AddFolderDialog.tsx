import { useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FolderPlus, Loader2 } from "lucide-react"

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
import { formatErrorMessage } from "@/core/errors"
import { createWebResourceInSolution } from "@/modules/solution-explorer/gateway"
import { useWorkspaceStore } from "@/store/workspace-store"
import {
  folderMarkerContent,
  folderMarkerFileName,
  normalizeWebResourcePath,
} from "./tree-model"

type AddFolderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  solutions: SolutionSummary[]
  solutionsLoading: boolean
  solutionsError?: unknown
  parentPath: string
  existingFolderPaths: Set<string>
  onFolderCreated: (folderPath: string) => void
}

function validateFolderName(value: string) {
  const folderName = value.trim()

  if (!folderName) {
    return "Folder name is required."
  }

  if (folderName.includes("/") || folderName.includes("\\")) {
    return "Folder name cannot contain slashes."
  }

  if (
    /\s/.test(folderName) ||
    Array.from(folderName).some((char) => {
      const codePoint = char.codePointAt(0) ?? 0

      return codePoint < 32 || codePoint === 127
    })
  ) {
    return "Folder name cannot contain whitespace or control characters."
  }

  return undefined
}

function validateRootName(value: string) {
  const folderValidation = validateFolderName(value)
  if (folderValidation) {
    return folderValidation.replace("Folder", "Root").replace("folder", "root")
  }

  if (!value.trim().includes("_")) {
    return "Root name must contain an underscore."
  }

  return undefined
}

export function AddFolderDialog({
  open,
  onOpenChange,
  environment,
  solutions,
  solutionsLoading,
  solutionsError,
  parentPath,
  existingFolderPaths,
  onFolderCreated,
}: AddFolderDialogProps) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const [folderName, setFolderName] = useState("")
  const [solutionUniqueName, setSolutionUniqueName] = useState("")
  const [validationMessage, setValidationMessage] = useState<string>()
  const selectedSolution =
    solutions.find((solution) => solution.uniqueName === solutionUniqueName) ??
    solutions[0]
  const normalizedParentPath = normalizeWebResourcePath(parentPath)
  const normalizedFolderName = normalizeWebResourcePath(folderName)
  const creatingRoot = !normalizedParentPath
  const folderPath = normalizeWebResourcePath(
    normalizedParentPath
      ? `${normalizedParentPath}/${normalizedFolderName}`
      : normalizedFolderName,
  )
  const displayFolderPath = folderPath
    ? creatingRoot
      ? `${folderPath}/`
      : folderPath
    : ""
  const markerName = folderPath
    ? `${folderPath}/${folderMarkerFileName}`
    : folderMarkerFileName

  const mutation = useMutation({
    mutationFn: () =>
      createWebResourceInSolution(environment, {
        solutionUniqueName: selectedSolution?.uniqueName ?? "",
        name: markerName,
        displayName: folderName.trim(),
        description: "OpenDataverse folder marker",
        type: "xml",
        content: folderMarkerContent,
      }),
    onSuccess: async (result) => {
      setLastMessage(
        selectedSolution
          ? `Created ${creatingRoot ? "root" : "folder"} ${displayFolderPath} in ${selectedSolution.uniqueName}.`
          : result.message,
      )
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
      onFolderCreated(folderPath)
      handleOpenChange(false)
    },
    onError: (error) => {
      setLastMessage(formatErrorMessage(error, "Create folder failed"))
    },
  })

  function resetForm() {
    setFolderName("")
    setSolutionUniqueName("")
    setValidationMessage(undefined)
    mutation.reset()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm()
    }

    onOpenChange(nextOpen)
  }

  function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationError = creatingRoot
      ? validateRootName(folderName)
      : validateFolderName(folderName)
    if (validationError) {
      setValidationMessage(validationError)
      return
    }

    if (!selectedSolution) {
      setValidationMessage(
        creatingRoot
          ? "Select an unmanaged solution before creating a root."
          : "Select an unmanaged solution before creating a folder.",
      )
      return
    }

    if (existingFolderPaths.has(folderPath)) {
      setValidationMessage(
        `${creatingRoot ? "Root" : "Folder"} already exists: ${displayFolderPath}`,
      )
      return
    }

    setValidationMessage(undefined)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{creatingRoot ? "Add Root" : "Add Folder"}</DialogTitle>
          <DialogDescription>
            {normalizedParentPath
              ? `Create a folder under ${normalizedParentPath}.`
              : "Create a publisher-style root such as sc_/ for new web resources."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submitFolder}>
          <div className="space-y-1">
            <Label htmlFor="web-resource-folder-name">
              {creatingRoot ? "Root Name" : "Folder Name"}
            </Label>
            <Input
              id="web-resource-folder-name"
              placeholder={creatingRoot ? "sc_" : "AccountsView"}
              value={folderName}
              onChange={(event) => {
                setFolderName(event.target.value)
                setValidationMessage(undefined)
              }}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-folder-solution">Solution</Label>
            <Select
              value={selectedSolution?.uniqueName}
              onValueChange={setSolutionUniqueName}
              disabled={solutionsLoading || solutions.length === 0}
            >
              <SelectTrigger id="web-resource-folder-solution" className="w-full">
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
            <Label>Web Resource Path</Label>
            <div className="truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {displayFolderPath ||
                (creatingRoot ? "Enter a root name" : "Enter a folder name")}
            </div>
          </div>

          {validationMessage && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {validationMessage}
            </div>
          )}

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
                !folderName.trim() ||
                !selectedSolution ||
                !folderPath
              }
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderPlus className="size-4" />
              )}
              {creatingRoot ? "Add Root" : "Add Folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
