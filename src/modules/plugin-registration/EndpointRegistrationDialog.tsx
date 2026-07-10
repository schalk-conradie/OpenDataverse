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
import type { EndpointForm } from "./registration-forms"

type EndpointRegistrationDialogProps = {
  open: boolean
  form: EndpointForm
  setForm: Dispatch<SetStateAction<EndpointForm>>
  snapshot: PluginRegistrationSnapshot
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function EndpointRegistrationDialog({
  open,
  form,
  setForm,
  snapshot,
  saving,
  onOpenChange,
  onSubmit,
}: EndpointRegistrationDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {form.endpointId ? "Edit Endpoint" : "Register Endpoint"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Register or edit a service endpoint or webhook.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="plugin-endpoint-name">Name</Label>
              <Input
                id="plugin-endpoint-name"
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
              <Label>Contract</Label>
              <Select
                value={String(form.contract)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    contract: Number(value),
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.endpointContractOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Auth</Label>
              <Select
                value={String(form.authType)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    authType: Number(value),
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.endpointAuthTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="plugin-endpoint-url">Url</Label>
              <Input
                id="plugin-endpoint-url"
                value={form.url}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-endpoint-path">Path</Label>
              <Input
                id="plugin-endpoint-path"
                value={form.path}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    path: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-endpoint-auth-value">Auth Value</Label>
              <Input
                id="plugin-endpoint-auth-value"
                type="password"
                value={form.authValue}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    authValue: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              Save Endpoint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
