import { Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { WebResource } from "@/core/dataverse/schemas"

export type DeleteWebResourceTarget = {
  kind: "root" | "folder" | "file"
  label: string
  resources: WebResource[]
}

type DeleteWebResourceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target?: DeleteWebResourceTarget
  deleting: boolean
  boundResourceIds: Set<string>
  onConfirm: () => void
}

export function DeleteWebResourceDialog({
  open,
  onOpenChange,
  target,
  deleting,
  boundResourceIds,
  onConfirm,
}: DeleteWebResourceDialogProps) {
  const managedCount =
    target?.resources.filter((resource) => resource.isManaged).length ?? 0
  const boundCount =
    target?.resources.filter((resource) => boundResourceIds.has(resource.id))
      .length ?? 0
  const deleteDisabled =
    deleting || !target || target.resources.length === 0 || managedCount > 0
  const targetLabel =
    target?.kind === "root"
      ? "root"
      : target?.kind === "folder"
        ? "folder"
        : "file"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {targetLabel}</DialogTitle>
          <DialogDescription>
            This removes web resources from Dataverse. This action cannot be
            undone from OpenDataverse.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium">{target.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {target.resources.length} web resource
                {target.resources.length === 1 ? "" : "s"} selected for delete
              </div>
            </div>

            {managedCount > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {managedCount} managed web resource
                {managedCount === 1 ? "" : "s"} cannot be deleted from this
                flow.
              </div>
            )}

            {boundCount > 0 && managedCount === 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-800">
                {boundCount} local binding{boundCount === 1 ? "" : "s"} will
                be removed after delete.
              </div>
            )}

            {target.resources.some((resource) => resource.isManaged) ? null : (
              <div className="max-h-44 overflow-auto rounded-lg border border-border">
                {target.resources.slice(0, 12).map((resource) => (
                  <div
                    key={resource.id}
                    className="border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="truncate font-mono text-xs">
                      {resource.name}
                    </div>
                  </div>
                ))}
                {target.resources.length > 12 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    and {target.resources.length - 12} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            disabled={deleteDisabled}
            onClick={onConfirm}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
