import type {
  Dispatch,
  FormEventHandler,
  ReactElement,
  SetStateAction,
} from "react"

import type { PluginRegistrationSnapshot } from "@/core/dataverse/schemas"
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
import type { ImageForm } from "./registration-forms"

type ImageRegistrationDialogProps = {
  open: boolean
  form: ImageForm
  setForm: Dispatch<SetStateAction<ImageForm>>
  snapshot: PluginRegistrationSnapshot
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function ImageRegistrationDialog({
  open,
  form,
  setForm,
  snapshot,
  saving,
  onOpenChange,
  onSubmit,
}: ImageRegistrationDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{form.imageId ? "Edit Image" : "Register Image"}</DialogTitle>
            <DialogDescription className="sr-only">
              Register or edit a processing step image.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Step</Label>
              <Select
                value={form.stepId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, stepId: value }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select step" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.steps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      {step.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-image-name">Name</Label>
              <Input
                id="plugin-image-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-image-alias">Alias</Label>
              <Input
                id="plugin-image-alias"
                value={form.entityAlias}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    entityAlias: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={String(form.imageType)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    imageType: Number(value),
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.imageTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-image-property">Message Property</Label>
              <Input
                id="plugin-image-property"
                value={form.messagePropertyName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    messagePropertyName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="plugin-image-attributes">Attributes</Label>
              <Input
                id="plugin-image-attributes"
                value={form.attributes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    attributes: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              Save Image
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
