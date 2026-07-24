import type {
  Dispatch,
  FormEventHandler,
  ReactElement,
  SetStateAction,
} from "react"
import { useState } from "react"
import { ListFilter } from "lucide-react"

import type {
  DataverseEnvironment,
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
import { cn } from "@/lib/utils"
import {
  getFilteringAttributeSupport,
  parseFilteringAttributes,
} from "./filtering-attributes"
import { FilteringAttributesDialog } from "./FilteringAttributesDialog"
import {
  filterPluginMessages,
  findPluginMessageByName,
} from "./message-autocomplete"
import type { StepForm } from "./registration-forms"

type StepRegistrationDialogProps = {
  open: boolean
  environment: DataverseEnvironment
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
  environment,
  form,
  setForm,
  snapshot,
  messageFilters,
  saving,
  onOpenChange,
  onSubmit,
}: StepRegistrationDialogProps): ReactElement {
  const selectedMessage = snapshot.messages.find(
    (message) => message.id === form.messageId,
  )
  const matchedMessage = findPluginMessageByName(
    snapshot.messages,
    form.messageText,
  )
  const filteredMessages = filterPluginMessages(
    snapshot.messages,
    form.messageText,
  )
  const [messageOptionsOpen, setMessageOptionsOpen] = useState(false)
  const [activeMessageIndex, setActiveMessageIndex] = useState(0)
  const [filteringAttributesOpen, setFilteringAttributesOpen] = useState(false)
  const filteringAttributeSupport = getFilteringAttributeSupport(
    snapshot.messages,
    form.messageId,
    messageFilters,
    form.messageFilterId,
  )

  function selectMessage(message: (typeof snapshot.messages)[number]) {
    setForm((current) => ({
      ...current,
      messageText: message.name,
      messageId: message.id,
      messageFilterId:
        message.id === current.messageId ? current.messageFilterId : "__none__",
      filteringAttributes:
        message.id === current.messageId ? current.filteringAttributes : "",
    }))
    setMessageOptionsOpen(false)
  }

  function moveActiveMessage(nextIndex: number) {
    if (filteredMessages.length === 0) {
      return
    }

    const boundedIndex = Math.max(
      0,
      Math.min(nextIndex, filteredMessages.length - 1),
    )
    setActiveMessageIndex(boundedIndex)
    window.requestAnimationFrame(() => {
      document
        .getElementById(`plugin-step-message-option-${boundedIndex}`)
        ?.scrollIntoView({ block: "nearest" })
    })
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setMessageOptionsOpen(false)
            setFilteringAttributesOpen(false)
          }
          onOpenChange(nextOpen)
        }}
      >
      <DialogContent className="sm:max-w-3xl">
        <form
          onSubmit={(event) => {
            if (!matchedMessage) {
              event.preventDefault()
              return
            }

            onSubmit(event)
          }}
          className="grid gap-4"
        >
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
              <Label htmlFor="plugin-step-message">Message</Label>
              <div className="relative">
                <Input
                  id="plugin-step-message"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={messageOptionsOpen}
                  aria-controls="plugin-step-message-options"
                  aria-activedescendant={
                    messageOptionsOpen && filteredMessages.length > 0
                      ? `plugin-step-message-option-${activeMessageIndex}`
                      : undefined
                  }
                  value={form.messageText}
                  placeholder={`Search ${snapshot.messages.length} messages`}
                  autoComplete="off"
                  onFocus={() => {
                    setActiveMessageIndex(0)
                    setMessageOptionsOpen(true)
                  }}
                  onChange={(event) => {
                    const value = event.target.value
                    const message = findPluginMessageByName(
                      snapshot.messages,
                      value,
                    )

                    setActiveMessageIndex(0)
                    setMessageOptionsOpen(true)
                    setForm((current) => {
                      if (message && message.id !== current.messageId) {
                        return {
                          ...current,
                          messageText: value,
                          messageId: message.id,
                          messageFilterId: "__none__",
                          filteringAttributes: "",
                        }
                      }

                      return {
                        ...current,
                        messageText: value,
                      }
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      setMessageOptionsOpen(true)
                      moveActiveMessage(activeMessageIndex + 1)
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault()
                      setMessageOptionsOpen(true)
                      moveActiveMessage(activeMessageIndex - 1)
                    } else if (
                      event.key === "Enter" &&
                      messageOptionsOpen &&
                      filteredMessages[activeMessageIndex]
                    ) {
                      event.preventDefault()
                      selectMessage(filteredMessages[activeMessageIndex])
                    } else if (event.key === "Escape") {
                      setMessageOptionsOpen(false)
                    }
                  }}
                  onBlur={() => {
                    setMessageOptionsOpen(false)
                    if (!matchedMessage) {
                      setForm((current) => ({
                        ...current,
                        messageText: selectedMessage?.name ?? "",
                      }))
                    }
                  }}
                />
                {messageOptionsOpen && (
                  <div
                    id="plugin-step-message-options"
                    role="listbox"
                    className="absolute top-full left-0 z-[60] mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg shadow-black/10"
                  >
                    {filteredMessages.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        No messages match your search.
                      </p>
                    ) : (
                      filteredMessages.map((message, index) => (
                        <button
                          key={message.id}
                          id={`plugin-step-message-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={message.id === form.messageId}
                          className={cn(
                            "flex w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                            index === activeMessageIndex && "bg-muted",
                            message.id === form.messageId &&
                              "font-medium text-primary",
                          )}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveMessageIndex(index)}
                          onClick={() => selectMessage(message)}
                        >
                          {message.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Entity</Label>
              <Select
                value={form.messageFilterId}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    messageFilterId: value,
                    filteringAttributes:
                      value === current.messageFilterId
                        ? current.filteringAttributes
                        : "",
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
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  id="plugin-step-filtering"
                  value={form.filteringAttributes}
                  readOnly
                  placeholder="All attributes"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!filteringAttributeSupport.supported}
                  onClick={() => setFilteringAttributesOpen(true)}
                >
                  <ListFilter className="size-4" />
                  Select attributes
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {filteringAttributeSupport.supported
                  ? form.filteringAttributes
                    ? `${parseFilteringAttributes(form.filteringAttributes).length} attributes selected.`
                    : "No attributes selected; the step will run for every update."
                  : filteringAttributeSupport.message}
              </p>
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
            <Button type="submit" disabled={saving || !matchedMessage}>
              Save Step
            </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>
      {filteringAttributesOpen && filteringAttributeSupport.supported ? (
        <FilteringAttributesDialog
          environment={environment}
          entityLogicalName={filteringAttributeSupport.entityLogicalName}
          initialValue={form.filteringAttributes}
          onOpenChange={setFilteringAttributesOpen}
          onApply={(filteringAttributes) =>
            setForm((current) => ({ ...current, filteringAttributes }))
          }
        />
      ) : null}
    </>
  )
}
