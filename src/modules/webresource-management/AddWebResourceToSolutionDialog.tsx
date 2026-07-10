import { useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  WebResource,
} from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import { addExistingWebResourceToSolution } from "@/modules/solution-explorer/gateway"
import { useWorkspaceStore } from "@/store/workspace-store"

type AddWebResourceToSolutionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  resource?: WebResource
  solutions: SolutionSummary[]
  solutionsLoading: boolean
  solutionsError?: unknown
}

export function AddWebResourceToSolutionDialog({
  open,
  onOpenChange,
  environment,
  resource,
  solutions,
  solutionsLoading,
  solutionsError,
}: AddWebResourceToSolutionDialogProps) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const [solutionUniqueName, setSolutionUniqueName] = useState("")
  const selectedSolution =
    solutions.find((solution) => solution.uniqueName === solutionUniqueName) ??
    solutions[0]

  const mutation = useMutation({
    mutationFn: (uniqueName: string) =>
      addExistingWebResourceToSolution(
        environment,
        uniqueName,
        resource?.id ?? "",
      ),
    onSuccess: async (result) => {
      setLastMessage(result.message)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["solutions", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solution-components", environment.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResourceActivity", environment.id],
        }),
      ])
      handleOpenChange(false)
    },
    onError: (error) => {
      showError("Add to Solution failed", error, "Add failed")
    },
  })

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSolutionUniqueName("")
      mutation.reset()
    }

    onOpenChange(nextOpen)
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!resource || !selectedSolution) {
      setLastMessage("Select a web resource and unmanaged solution.")
      return
    }

    mutation.mutate(selectedSolution.uniqueName)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Solution</DialogTitle>
          <DialogDescription>{environment.name}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submitAdd}>
          <div className="space-y-1">
            <Label>Web Resource</Label>
            <div className="truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {resource?.name ?? "No web resource selected"}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-add-solution">Solution</Label>
            <Select
              value={selectedSolution?.uniqueName}
              onValueChange={setSolutionUniqueName}
              disabled={solutionsLoading || solutions.length === 0}
            >
              <SelectTrigger id="web-resource-add-solution" className="w-full">
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

          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            This adds the existing web resource to the selected unmanaged
            solution. It does not change the web resource content.
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
            >
              Close
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !resource ||
                resource.isManaged ||
                !selectedSolution
              }
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
