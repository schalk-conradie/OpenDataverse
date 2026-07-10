import type {
  Dispatch,
  FormEventHandler,
  ReactElement,
  SetStateAction,
} from "react"

import type {
  PluginMessageFilterSummary,
  PluginRegistrationSnapshot,
} from "@/core/dataverse/schemas"
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
import type { StepForm } from "./registration-forms"

type StepRegistrationDialogProps = {
  open: boolean
  form: StepForm
  setForm: Dispatch<SetStateAction<StepForm>>
  snapshot: PluginRegistrationSnapshot
  messageFilters: readonly PluginMessageFilterSummary[]
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export function StepRegistrationDialog({
  open,
  form,
  setForm,
  snapshot,
  messageFilters,
  saving,
  onOpenChange,
  onSubmit,
}: StepRegistrationDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{form.stepId ? "Edit Step" : "Register Step"}</DialogTitle>
            <DialogDescription className="sr-only">
              Register or edit a Dataverse processing step.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="plugin-step-name">Name</Label>
              <Input
                id="plugin-step-name"
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
              <Label>Handler</Label>
              <Select
                value={form.handlerType}
                onValueChange={(value) => {
                  if (value === "plugintype" || value === "serviceendpoint") {
                    setForm((current) => ({
                      ...current,
                      handlerType: value,
                    }))
                  }
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plugintype">Plug-in Type</SelectItem>
                  <SelectItem value="serviceendpoint">Service Endpoint</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.handlerType === "plugintype" ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label>Plug-in Type</Label>
                <Select
                  value={form.pluginTypeId}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, pluginTypeId: value }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.friendlyName || type.typeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-2 sm:col-span-2">
                <Label>Service Endpoint</Label>
                <Select
                  value={form.serviceEndpointId}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      serviceEndpointId: value,
                    }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select endpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.endpoints.map((endpoint) => (
                      <SelectItem key={endpoint.id} value={endpoint.id}>
                        {endpoint.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Message</Label>
              <Select
                value={form.messageId}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    messageId: value,
                    messageFilterId: "__none__",
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select message" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.messages.map((message) => (
                    <SelectItem key={message.id} value={message.id}>
                      {message.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Entity</Label>
              <Select
                value={form.messageFilterId}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    messageFilterId: value,
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Global" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Global</SelectItem>
                  {messageFilters.map((filter) => (
                    <SelectItem key={filter.id} value={filter.id}>
                      {filter.primaryEntity ?? "global"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Stage</Label>
              <Select
                value={String(form.stage)}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, stage: Number(value) }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.stageOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Select
                value={String(form.mode)}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, mode: Number(value) }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.modeOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-step-rank">Rank</Label>
              <Input
                id="plugin-step-rank"
                type="number"
                min={1}
                value={form.rank}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rank: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Run As</Label>
              <Select
                value={form.impersonatingUserId}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    impersonatingUserId: value,
                  }))
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__calling-user__">Calling User</SelectItem>
                  {snapshot.users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="plugin-step-filtering">Filtering Attributes</Label>
              <Input
                id="plugin-step-filtering"
                value={form.filteringAttributes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    filteringAttributes: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-step-config">Unsecure Configuration</Label>
              <textarea
                id="plugin-step-config"
                className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={form.configuration}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    configuration: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plugin-step-secure-config">Secure Configuration</Label>
              <textarea
                id="plugin-step-secure-config"
                className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={form.secureConfiguration}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    secureConfiguration: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              Save Step
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
