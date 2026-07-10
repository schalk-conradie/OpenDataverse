import type { ReactElement } from "react"
import { AlertTriangle } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type PluginRegistrationError = {
  title: string
  message: string
}

export function PluginRegistrationErrorDialog({
  error,
  onClose,
}: {
  error?: PluginRegistrationError
  onClose: () => void
}): ReactElement {
  return (
    <Dialog
      open={Boolean(error)}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            {error?.title ?? "Plugin Registration error"}
          </DialogTitle>
          <DialogDescription>
            The operation did not complete. Review the details below before
            retrying.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-auto rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-mono text-[11px] break-words whitespace-pre-wrap text-destructive">
          {error?.message}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
