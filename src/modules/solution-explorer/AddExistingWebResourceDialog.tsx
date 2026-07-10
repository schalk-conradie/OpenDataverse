import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  FileCode2,
  Loader2,
  Plus,
  Search,
} from "lucide-react"

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
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
  DataverseEnvironment,
  SolutionSummary,
} from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/store/workspace-store"

import {
  addExistingWebResourceToSolution,
  listSolutionWebResourceCandidates,
} from "./gateway"
import { filterWebResourceCandidates } from "./solution-model"

type AddExistingWebResourceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  solution?: SolutionSummary
}

export function AddExistingWebResourceDialog({
  open,
  onOpenChange,
  environment,
  solution,
}: AddExistingWebResourceDialogProps) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [errorMessage, setErrorMessage] = useState<string>()

  const candidatesQuery = useQuery({
    queryKey: ["solution-web-resource-candidates", environment.id, solution?.id],
    enabled: Boolean(open && solution),
    queryFn: () =>
      listSolutionWebResourceCandidates(environment, solution?.id ?? ""),
  })

  const candidates = candidatesQuery.data ?? []
  const filteredCandidates = filterWebResourceCandidates(candidates, search)

  const mutation = useMutation({
    mutationFn: (webResourceId: string) =>
      addExistingWebResourceToSolution(
        environment,
        solution?.uniqueName ?? "",
        webResourceId,
      ),
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
      ])
      onOpenChange(false)
    },
    onError: (error) => {
      setErrorMessage(
        showError("Add Existing Web Resource failed", error, "Add failed"),
      )
    },
  })

  const selectedCandidate = candidates.find((item) => item.id === selectedId)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSearch("")
      setSelectedId("")
      setErrorMessage(undefined)
      mutation.reset()
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Existing Web Resource</DialogTitle>
          <DialogDescription>
            {solution?.friendlyName ?? "Selected solution"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search web resources"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <ScrollArea className="h-72 rounded-lg border">
            {candidatesQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading
              </div>
            ) : candidatesQuery.isError ? (
              <div className="flex h-40 items-center justify-center gap-2 p-4 text-center text-xs text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {formatErrorMessage(
                  candidatesQuery.error,
                  "Could not load available web resources.",
                )}
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <FileCode2 className="size-5 text-muted-foreground/50" />
                No available web resources.
              </div>
            ) : (
              <div className="divide-y">
                {filteredCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      selectedId === candidate.id && "bg-muted",
                    )}
                    onClick={() => setSelectedId(candidate.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {candidate.displayName || candidate.name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {candidate.name}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[11px] font-normal"
                      >
                        {candidate.type}
                      </Badge>
                      {selectedId === candidate.id && (
                        <Check className="size-4 text-primary" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {errorMessage && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-mono text-[11px] break-words whitespace-pre-wrap text-destructive">
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!selectedCandidate || mutation.isPending}
            onClick={() =>
              selectedCandidate && mutation.mutate(selectedCandidate.id)
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
      </DialogContent>
    </Dialog>
  )
}
