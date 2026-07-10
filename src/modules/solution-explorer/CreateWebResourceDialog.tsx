import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FilePlus2, Loader2 } from "lucide-react"

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
  WebResource,
} from "@/core/dataverse/schemas"
import { useWorkspaceStore } from "@/store/workspace-store"

import { createWebResourceInSolution } from "./gateway"

type CreateWebResourceForm = {
  name: string
  displayName: string
  description: string
  type: WebResource["type"]
  content: string
}

type CreateWebResourceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  environment: DataverseEnvironment
  solution?: SolutionSummary
}

const webResourceTypes: Array<{
  value: WebResource["type"]
  label: string
}> = [
  { value: "js", label: "JavaScript" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "resx", label: "RESX" },
]

const emptyForm: CreateWebResourceForm = {
  name: "",
  displayName: "",
  description: "",
  type: "js",
  content: "",
}

export function CreateWebResourceDialog({
  open,
  onOpenChange,
  environment,
  solution,
}: CreateWebResourceDialogProps) {
  const queryClient = useQueryClient()
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const [form, setForm] = useState<CreateWebResourceForm>(emptyForm)
  const [errorMessage, setErrorMessage] = useState<string>()

  const mutation = useMutation({
    mutationFn: (input: CreateWebResourceForm) =>
      createWebResourceInSolution(environment, {
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
      ])
      onOpenChange(false)
    },
    onError: (error) => {
      setErrorMessage(
        showError("Create Web Resource failed", error, "Create failed"),
      )
    },
  })

  function updateField<Key extends keyof CreateWebResourceForm>(
    key: Key,
    value: CreateWebResourceForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setForm(emptyForm)
      setErrorMessage(undefined)
      mutation.reset()
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Web Resource</DialogTitle>
          <DialogDescription>
            {solution?.friendlyName ?? "Selected solution"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate(form)
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-1">
              <Label htmlFor="web-resource-name">Name</Label>
              <Input
                id="web-resource-name"
                placeholder="new_/scripts/account-form.js"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="web-resource-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  updateField("type", value as WebResource["type"])
                }
              >
                <SelectTrigger id="web-resource-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {webResourceTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-display-name">Display Name</Label>
            <Input
              id="web-resource-display-name"
              value={form.displayName}
              onChange={(event) =>
                updateField("displayName", event.target.value)
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-description">Description</Label>
            <Input
              id="web-resource-description"
              value={form.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="web-resource-content">Content</Label>
            <textarea
              id="web-resource-content"
              className="h-48 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
              value={form.content}
              onChange={(event) => updateField("content", event.target.value)}
              spellCheck={false}
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !form.name.trim()}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FilePlus2 className="size-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
