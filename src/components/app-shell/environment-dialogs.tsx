import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  Loader2,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  sortEnvironmentsByName,
  type DataverseEnvironment,
} from "@/core/dataverse/schemas"
import { validateEnvironmentInput } from "@/store/workspace-state"
import { useWorkspaceStore } from "@/store/workspace-store"

type EnvironmentFormDialogProps = {
  mode: "add" | "edit"
  environment?: DataverseEnvironment
  trigger: ReactNode
}

export function EnvironmentFormDialog({
  mode,
  environment,
  trigger,
}: EnvironmentFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const config = useWorkspaceStore((state) => state.config)
  const addEnvironment = useWorkspaceStore((state) => state.addEnvironment)
  const updateEnvironment = useWorkspaceStore(
    (state) => state.updateEnvironment,
  )

  function resetForm() {
    setName(environment?.name ?? "")
    setUrl(environment?.url ?? "")
    setError(undefined)
    setSubmitting(false)
  }

  async function submitEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validation = validateEnvironmentInput(
      config,
      { name, url },
      environment?.id,
    )
    if (!validation.ok) {
      setError(validation.error)
      return
    }

    setSubmitting(true)

    if (mode === "edit" && environment) {
      const updated = await updateEnvironment(environment.id, {
        name: validation.data.name,
        url: validation.data.url,
      })

      if (!updated) {
        setSubmitting(false)
        setError("Could not update environment")
        return
      }
    } else {
      addEnvironment(validation.data)
    }

    setName("")
    setUrl("")
    setError(undefined)
    setSubmitting(false)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          resetForm()
        }
        setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submitEnvironment} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit Environment" : "Add Environment"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {mode === "edit"
                ? "Edit a saved Dataverse environment."
                : "Add a Dataverse environment by name and organization URL."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="environment-name">Name</Label>
            <Input
              id="environment-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="environment-url">URL</Label>
            <Input
              id="environment-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://org.crm.dynamics.com"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {mode === "edit" ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ManageEnvironmentsDialog() {
  const config = useWorkspaceStore((state) => state.config)
  const connectEnvironment = useWorkspaceStore(
    (state) => state.connectEnvironment,
  )
  const deleteEnvironment = useWorkspaceStore(
    (state) => state.deleteEnvironment,
  )
  const sortedEnvironments = useMemo(
    () => sortEnvironmentsByName(config.environments),
    [config.environments],
  )
  const [deleteTarget, setDeleteTarget] = useState<DataverseEnvironment>()
  const [reconnectingId, setReconnectingId] = useState<string>()
  const [deleting, setDeleting] = useState(false)

  async function reconnect(environmentId: string) {
    setReconnectingId(environmentId)
    try {
      await connectEnvironment(environmentId)
    } finally {
      setReconnectingId(undefined)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return
    }

    setDeleting(true)
    const deleted = await deleteEnvironment(deleteTarget.id)
    setDeleting(false)

    if (deleted) {
      setDeleteTarget(undefined)
    }
  }

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <SlidersHorizontal />
            Manage
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Environments</DialogTitle>
            <DialogDescription>
              Edit, reconnect, or delete saved Dataverse environments.
            </DialogDescription>
          </DialogHeader>

          {sortedEnvironments.length === 0 ? (
            <div className="border bg-background p-6 text-center text-xs text-muted-foreground">
              No environments saved.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEnvironments.map((environment) => {
                  const reconnecting =
                    reconnectingId === environment.id ||
                    environment.authState === "connecting"

                  return (
                    <TableRow key={environment.id}>
                      <TableCell className="font-medium">
                        {environment.name}
                      </TableCell>
                      <TableCell className="max-w-72 truncate font-mono text-[11px] text-muted-foreground">
                        {environment.url}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {environment.authState}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <EnvironmentFormDialog
                            mode="edit"
                            environment={environment}
                            trigger={
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                title={`Edit ${environment.name}`}
                              >
                                <Pencil />
                                <span className="sr-only">Edit</span>
                              </Button>
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            title={`Reconnect ${environment.name}`}
                            disabled={reconnecting}
                            onClick={() => void reconnect(environment.id)}
                          >
                            {reconnecting ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RefreshCw />
                            )}
                            <span className="sr-only">Reconnect</span>
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon-xs"
                            title={`Delete ${environment.name}`}
                            disabled={reconnecting}
                            onClick={() => setDeleteTarget(environment)}
                          >
                            <Trash2 />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(undefined)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Environment</DialogTitle>
            <DialogDescription>
              Delete {deleteTarget?.name} from local OpenDataverse state.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(undefined)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
