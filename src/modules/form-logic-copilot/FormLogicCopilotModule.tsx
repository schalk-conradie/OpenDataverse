import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import Editor from "@monaco-editor/react"
import {
  BotMessageSquare,
  CheckCircle2,
  Copy,
  Database,
  FileCode2,
  Loader2,
  RefreshCw,
  SendHorizontal,
  WandSparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getFormLogicFormContext,
  isTauriRuntime,
  listFormLogicEntities,
  listFormLogicForms,
} from "@/core/desktop/bridge"
import {
  sendAiChatMessage,
  startAiChatThread,
} from "@/core/desktop/ai-bridge"
import { formatErrorMessage } from "@/core/errors"
import {
  createId,
  getEnvironmentById,
  type DataverseEnvironment,
  type FormLogicAttributeMetadata,
  type FormLogicFormContext,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import {
  defaultModelByProvider,
  defaultReasoningByProvider,
  modelOptionsByProvider,
  providerOptions,
  reasoningOptionsByProvider,
} from "@/modules/ai-chat/options"
import type {
  AiChatModel,
  AiChatProvider,
  AiReasoningEffort,
} from "@/modules/ai-chat/types"
import {
  parseGeneratedDraft,
  type GeneratedDraft,
} from "@/modules/form-logic-copilot/generated-draft"
import { configureWebResourceIntellisense } from "@/modules/webresource-management/intellisense"
import { useWorkspaceStore } from "@/store/workspace-store"

type FormLogicCopilotModuleProps = {
  window: ToolWindow
}

type ParsedTab = {
  name: string
  label: string
}

type ParsedSection = {
  name: string
  label: string
  tabName?: string
  tabLabel?: string
}

type ParsedControl = {
  id: string
  label: string
  fieldLogicalName?: string
  sectionName?: string
  sectionLabel?: string
  tabName?: string
  tabLabel?: string
}

type ParsedEvent = {
  ownerType: "form" | "control"
  owner: string
  eventName: string
  handlers: string[]
}

type StructuredField = FormLogicAttributeMetadata & {
  controlIds: string[]
  sectionName?: string
  sectionLabel?: string
  tabName?: string
  tabLabel?: string
}

type StructuredFormContext = {
  raw: FormLogicFormContext
  tabs: ParsedTab[]
  sections: ParsedSection[]
  controls: ParsedControl[]
  events: ParsedEvent[]
  fields: StructuredField[]
}

type BindingSuggestion = {
  id: string
  target: string
  eventLabel: string
  handler: string
  status: "ready" | "review"
}

type EditorChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type StatusPillTone = "success" | "warning" | "muted"
type WizardStepId = "target" | "generate"

const browserPreviewEnvironment: DataverseEnvironment = {
  id: "browser-preview",
  name: "Browser preview",
  url: "https://preview.crm.dynamics.com",
  authState: "connected",
}

const wizardSteps: Array<{
  id: WizardStepId
  title: string
  description: string
}> = [
  {
    id: "target",
    title: "Form",
    description: "Choose metadata and prompt.",
  },
  {
    id: "generate",
    title: "Script",
    description: "Review, refine, and copy.",
  },
]

function directChild(element: Element, name: string) {
  return Array.from(element.children).find(
    (child) => child.tagName.toLowerCase() === name,
  )
}

function labelFromElement(element: Element, fallback: string) {
  const labels = directChild(element, "labels")
  const label = labels
    ? Array.from(labels.children).find(
        (child) => child.tagName.toLowerCase() === "label",
      )
    : undefined

  return (
    label?.getAttribute("description")?.trim() ||
    element.getAttribute("label")?.trim() ||
    fallback
  )
}

function closestByTag(element: Element, tagName: string) {
  let current: Element | null = element.parentElement
  while (current) {
    if (current.tagName.toLowerCase() === tagName) {
      return current
    }
    current = current.parentElement
  }
  return undefined
}

function uniqueByName<T extends { name: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.name, item])).values())
}

function parseFormXml(context: FormLogicFormContext): StructuredFormContext {
  const parser = new DOMParser()
  const document = parser.parseFromString(context.formXml, "application/xml")
  const hasParseError = document.querySelector("parsererror")
  if (hasParseError) {
    return {
      raw: context,
      tabs: [],
      sections: [],
      controls: [],
      events: [],
      fields: context.attributes.map((attribute) => ({
        ...attribute,
        controlIds: [],
      })),
    }
  }

  const tabs = uniqueByName(
    Array.from(document.querySelectorAll("tab")).map((tab, index) => {
      const name = tab.getAttribute("name")?.trim() || `tab-${index + 1}`
      return {
        name,
        label: labelFromElement(tab, name),
      }
    }),
  )

  const sections = uniqueByName(
    Array.from(document.querySelectorAll("section")).map((section, index) => {
      const tab = closestByTag(section, "tab")
      const tabName = tab?.getAttribute("name")?.trim()
      const sectionName =
        section.getAttribute("name")?.trim() || `section-${index + 1}`
      return {
        name: sectionName,
        label: labelFromElement(section, sectionName),
        tabName,
        tabLabel: tab ? labelFromElement(tab, tabName ?? "Tab") : undefined,
      }
    }),
  )

  const controls = Array.from(document.querySelectorAll("control")).map(
    (control, index) => {
      const section = closestByTag(control, "section")
      const tab = closestByTag(control, "tab")
      const fieldLogicalName = control.getAttribute("datafieldname")?.trim()
      const id =
        control.getAttribute("id")?.trim() ||
        fieldLogicalName ||
        `control-${index + 1}`
      const sectionName = section?.getAttribute("name")?.trim()
      const tabName = tab?.getAttribute("name")?.trim()
      const cell = closestByTag(control, "cell")

      return {
        id,
        fieldLogicalName,
        label: cell ? labelFromElement(cell, fieldLogicalName ?? id) : id,
        sectionName,
        sectionLabel: section
          ? labelFromElement(section, sectionName ?? "Section")
          : undefined,
        tabName,
        tabLabel: tab ? labelFromElement(tab, tabName ?? "Tab") : undefined,
      }
    },
  )

  const events = Array.from(document.querySelectorAll("event")).map((event) => {
    const control = closestByTag(event, "control")
    const owner =
      control?.getAttribute("datafieldname")?.trim() ||
      control?.getAttribute("id")?.trim() ||
      context.form.name
    const handlers = Array.from(event.children)
      .filter((child) => child.tagName.toLowerCase() === "handlers")
      .flatMap((handlersNode) => Array.from(handlersNode.children))
      .filter((child) => child.tagName.toLowerCase() === "handler")
      .map((handler) => {
        const functionName = handler.getAttribute("functionName")?.trim()
        const libraryName = handler.getAttribute("libraryName")?.trim()
        return [libraryName, functionName].filter(Boolean).join(" ")
      })
      .filter(Boolean)

    return {
      ownerType: control ? "control" : "form",
      owner,
      eventName: event.getAttribute("name")?.trim() || "event",
      handlers,
    } satisfies ParsedEvent
  })

  const controlsByField = new Map<string, ParsedControl[]>()
  for (const control of controls) {
    if (!control.fieldLogicalName) {
      continue
    }
    const current = controlsByField.get(control.fieldLogicalName) ?? []
    current.push(control)
    controlsByField.set(control.fieldLogicalName, current)
  }

  const fields = context.attributes.map((attribute) => {
    const fieldControls = controlsByField.get(attribute.logicalName) ?? []
    const firstControl = fieldControls[0]

    return {
      ...attribute,
      controlIds: fieldControls.map((control) => control.id),
      sectionName: firstControl?.sectionName,
      sectionLabel: firstControl?.sectionLabel,
      tabName: firstControl?.tabName,
      tabLabel: firstControl?.tabLabel,
    }
  })

  return {
    raw: context,
    tabs,
    sections,
    controls,
    events,
    fields,
  }
}

function pascalToken(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")
}

function libraryObjectName(context: StructuredFormContext) {
  const token =
    pascalToken(context.raw.entity.displayName) ||
    pascalToken(context.raw.entity.logicalName) ||
    "Form"

  return `${token}Library`
}

function webResourceDefaults(context: StructuredFormContext) {
  const formToken =
    context.raw.form.typeLabel === "Quick Create" ? "quickcreate" : "form"

  return {
    logicalName: `${context.raw.entity.logicalName}${formToken}logic.js`,
    displayName: `${context.raw.entity.displayName} ${context.raw.form.typeLabel} Logic`,
    description: `Form logic for ${context.raw.entity.displayName} ${context.raw.form.name}`,
  }
}

function sourceForContext(context: StructuredFormContext) {
  const libraryName = libraryObjectName(context)
  const firstTabName = context.tabs[0]?.name

  return `var ${libraryName} = ${libraryName} || {};

${libraryName}.onLoad = function (executionContext) {
  var formContext = executionContext.getFormContext();
  ${libraryName}.updateFormState(formContext);
};

${libraryName}.updateFormState = function (formContext) {
  ${firstTabName ? `var tab = formContext.ui.tabs.get("${firstTabName}");` : "var tab = null;"}
  if (tab) {
    tab.setVisible(true);
  }
};`
}

function compactPromptContext(context: StructuredFormContext) {
  return {
    source: context.raw.source,
    entity: {
      logicalName: context.raw.entity.logicalName,
      displayName: context.raw.entity.displayName,
      entitySetName: context.raw.entity.entitySetName,
      primaryNameAttribute: context.raw.entity.primaryNameAttribute,
      primaryIdAttribute: context.raw.entity.primaryIdAttribute,
    },
    form: {
      id: context.raw.form.id,
      name: context.raw.form.name,
      type: context.raw.form.typeLabel,
      isDefault: context.raw.form.isDefault,
      isManaged: context.raw.form.isManaged,
    },
    fields: context.fields.map((field) => ({
      logicalName: field.logicalName,
      displayName: field.displayName,
      type: field.attributeType,
      requiredLevel: field.requiredLevel,
      controlIds: field.controlIds,
      tab: field.tabName,
      section: field.sectionName,
      lookupTargets: field.lookupTargets,
      options: field.optionValues?.slice(0, 30),
    })),
    tabs: context.tabs,
    sections: context.sections,
    controls: context.controls.map((control) => ({
      id: control.id,
      fieldLogicalName: control.fieldLogicalName,
      label: control.label,
      tab: control.tabName,
      section: control.sectionName,
    })),
    events: context.events.map((event) => ({
      ownerType: event.ownerType,
      owner: event.owner,
      eventName: event.eventName,
      handlers: event.handlers,
    })),
  }
}

function buildGenerationPrompt(input: {
  context: StructuredFormContext
  request: string
}) {
  const libraryName = libraryObjectName(input.context)

  return `Generate Dataverse model-driven app form JavaScript for this request.

Request:
${input.request}

The following context was derived from the selected Dataverse table metadata and selected form definition. Use only fields, controls, tabs, sections, options, lookup targets, and events listed here. Do not invent logical names.

${JSON.stringify(compactPromptContext(input.context), null, 2)}

Default manual binding note: register ${libraryName}.onLoad on the form OnLoad event unless the request clearly requires a different exposed handler.

Return only a compact JSON object with these string properties:
- logicalName
- displayName
- description
- source

Return valid JSON only. Do not include a provider name, explanation, markdown fence, or any text before or after the JSON object.

The source must be production-oriented JavaScript for a Dataverse web resource. Follow YAGNI: implement only the requested behavior, prefer the smallest clear script, and do not add speculative helpers, abstractions, configuration, event handlers, or defensive wrappers. Use normal Dataverse client API calls such as executionContext.getFormContext() directly. Do not wrap Dataverse APIs in typeof function checks. Use simple null checks only for returned attributes, controls, tabs, or sections before calling methods on them. Declare var ${libraryName} = ${libraryName} || {}, and expose only the handlers needed by the request directly on ${libraryName}. Create ${libraryName}.onLoad by default. Do not create OnChange handlers unless the request explicitly needs logic to run when a field value changes. Avoid markdown.`
}

function buildRevisionPrompt(input: {
  context: StructuredFormContext
  currentSource: string
  changeRequest: string
}) {
  const libraryName = libraryObjectName(input.context)

  return `Revise this Dataverse form JavaScript web resource.

Requested change:
${input.changeRequest}

Selected form context:
${JSON.stringify(compactPromptContext(input.context), null, 2)}

Current source:
${input.currentSource}

Return only a compact JSON object with:
- source: the full revised JavaScript source
- response: one short sentence explaining the change

Return valid JSON only. Do not include a provider name, explanation, markdown fence, or any text before or after the JSON object.

Follow YAGNI: make the smallest clear change, preserve existing structure where possible, use only form context fields/controls/tabs/sections listed above, and do not add speculative helpers, abstractions, configuration, event handlers, or defensive wrappers. Keep executionContext.getFormContext(), do not add typeof function checks around Dataverse APIs, use simple null checks only for returned form objects, keep handlers exposed directly on ${libraryName}, and do not add new event handlers unless the requested change needs them. Avoid markdown.`
}

function bindingSuggestionsForContext(
  context?: StructuredFormContext,
): BindingSuggestion[] {
  if (!context) {
    return []
  }

  const namespace = libraryObjectName(context)
  const suggestions: BindingSuggestion[] = [
    {
      id: `${context.raw.form.id}-onload`,
      target: `${context.raw.form.name} form`,
      eventLabel: "Form OnLoad",
      handler: `${namespace}.onLoad`,
      status: "ready",
    },
  ]
  const onchangeOwners = context.events
    .filter(
      (event) => event.ownerType === "control" && event.eventName === "onchange",
    )
    .map((event) => event.owner)

  for (const owner of Array.from(new Set(onchangeOwners)).slice(0, 4)) {
    suggestions.push({
      id: `${context.raw.form.id}-${owner}-onchange`,
      target: owner,
      eventLabel: "Field OnChange",
      handler: `${namespace}.on${pascalToken(owner)}Change`,
      status: "review",
    })
  }

  return suggestions
}

function browserPreviewGeneratedDraft(context: StructuredFormContext) {
  return {
    ...webResourceDefaults(context),
    source: sourceForContext(context),
  } satisfies GeneratedDraft
}

function statusPillTone(status: BindingSuggestion["status"]): StatusPillTone {
  return status === "ready" ? "success" : "warning"
}

function StatusPill({
  tone,
  children,
}: {
  tone: StatusPillTone
  children: string
}) {
  const styles: Record<StatusPillTone, string> = {
    success:
      "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300",
    warning:
      "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300",
    muted:
      "border-slate-300/70 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-900/50 dark:text-slate-300",
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
        styles[tone],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

function EmptyEnvironment() {
  return (
    <section className="flex h-full items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border border-border bg-muted/30 p-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background">
          <FileCode2 className="size-5 text-muted-foreground" />
        </div>
        <h2 className="mt-3 text-sm font-semibold">Select an environment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Form Logic Copilot needs an active Dataverse environment before it can
          generate a script.
        </p>
      </div>
    </section>
  )
}

function MetadataLoadState({
  loading,
  error,
}: {
  loading: boolean
  error: unknown
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
        <h2 className="mt-3 text-sm font-semibold">Loading metadata</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reading table metadata, forms, and the selected form definition.
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {formatErrorMessage(error, "Could not load metadata.")}
      </div>
    )
  }

  return null
}

export function FormLogicCopilotModule({ window }: FormLogicCopilotModuleProps) {
  const config = useWorkspaceStore((state) => state.config)
  const showError = useWorkspaceStore((state) => state.showError)
  const appearanceMode = useWorkspaceStore(
    (state) => state.userSettings.appearance.mode,
  )
  const configuredEnvironment = getEnvironmentById(
    config,
    window.environmentId ?? config.currentEnvironmentId,
  )
  const environment =
    configuredEnvironment ?? (!isTauriRuntime() ? browserPreviewEnvironment : undefined)
  const [wizardStep, setWizardStep] = useState<WizardStepId>("target")
  const [entityLogicalName, setEntityLogicalName] = useState("")
  const [formId, setFormId] = useState("")
  const [request, setRequest] = useState("")
  const [aiProvider, setAiProvider] = useState<AiChatProvider>("codex")
  const [aiModel, setAiModel] = useState<AiChatModel>(
    defaultModelByProvider.codex,
  )
  const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>(
    defaultReasoningByProvider.codex,
  )
  const [logicalName, setLogicalName] = useState("formlogic.js")
  const [source, setSource] = useState("")
  const [hasGenerated, setHasGenerated] = useState(false)
  const [copied, setCopied] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<EditorChatMessage[]>([])

  const entitiesQuery = useQuery({
    queryKey: ["form-logic-entities", environment?.id],
    enabled: Boolean(environment),
    queryFn: () => listFormLogicEntities(environment as DataverseEnvironment),
  })
  const activeEntityLogicalName =
    entityLogicalName || entitiesQuery.data?.[0]?.logicalName || ""
  const formsQuery = useQuery({
    queryKey: ["form-logic-forms", environment?.id, activeEntityLogicalName],
    enabled: Boolean(environment && activeEntityLogicalName),
    queryFn: () =>
      listFormLogicForms(
        environment as DataverseEnvironment,
        activeEntityLogicalName,
      ),
  })
  const activeFormId =
    formId && formsQuery.data?.some((form) => form.id === formId)
      ? formId
      : formsQuery.data?.[0]?.id || ""
  const contextQuery = useQuery({
    queryKey: [
      "form-logic-form-context",
      environment?.id,
      activeEntityLogicalName,
      activeFormId,
    ],
    enabled: Boolean(environment && activeEntityLogicalName && activeFormId),
    queryFn: () =>
      getFormLogicFormContext(
        environment as DataverseEnvironment,
        activeEntityLogicalName,
        activeFormId,
      ),
  })

  const structuredContext = useMemo(
    () => (contextQuery.data ? parseFormXml(contextQuery.data) : undefined),
    [contextQuery.data],
  )
  const selectedEntity = entitiesQuery.data?.find(
    (entity) => entity.logicalName === activeEntityLogicalName,
  )
  const selectedForm = formsQuery.data?.find((form) => form.id === activeFormId)
  const bindingSuggestions = useMemo(
    () => bindingSuggestionsForContext(structuredContext),
    [structuredContext],
  )
  const defaultDraft = structuredContext
    ? webResourceDefaults(structuredContext)
    : undefined
  const effectiveLogicalName = hasGenerated
    ? logicalName
    : defaultDraft?.logicalName ?? logicalName
  const editorTheme = appearanceMode === "dark" ? "vs-dark" : "vs"
  const providerLabel =
    providerOptions.find((option) => option.value === aiProvider)?.label ??
    "Codex"
  const activeStepIndex = wizardSteps.findIndex((step) => step.id === wizardStep)
  const canReviewScript = hasGenerated && source.trim().length > 0
  const canGenerate =
    Boolean(structuredContext) && request.trim().length > 0 && !contextQuery.isLoading

  function handleEntityChange(nextLogicalName: string) {
    setEntityLogicalName(nextLogicalName)
    setFormId("")
    setRequest("")
    setHasGenerated(false)
    setSource("")
  }

  function handleFormChange(nextFormId: string) {
    setFormId(nextFormId)
    setHasGenerated(false)
    setSource("")
  }

  function handleProviderChange(nextProvider: AiChatProvider) {
    setAiProvider(nextProvider)
    setAiModel(defaultModelByProvider[nextProvider])
    setReasoningEffort(defaultReasoningByProvider[nextProvider])
  }

  function goToPreviousStep() {
    if (wizardStep === "generate") {
      setWizardStep("target")
    }
  }

  function goToNextStep() {
    if (wizardStep === "target" && canReviewScript) {
      setWizardStep("generate")
    }
  }

  function applyGeneratedDraft(draft: GeneratedDraft) {
    setSource(draft.source)
    if (draft.logicalName) {
      setLogicalName(draft.logicalName)
    }
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!environment) {
        throw new Error("Select an environment before generating form logic.")
      }
      if (!structuredContext) {
        throw new Error("Select a table and form before generating form logic.")
      }

      if (!isTauriRuntime()) {
        return browserPreviewGeneratedDraft(structuredContext)
      }

      const thread = await startAiChatThread({
        environmentId: environment.id,
        mode: "chat",
        provider: aiProvider,
        model: aiModel,
        reasoningEffort,
      })
      const messages = await sendAiChatMessage({
        threadId: thread.id,
        environmentId: environment.id,
        mode: "chat",
        message: buildGenerationPrompt({
          context: structuredContext,
          request,
        }),
        provider: aiProvider,
        model: aiModel,
        reasoningEffort,
        providerThreadId: thread.providerThreadId ?? thread.codexThreadId,
        codexThreadId: thread.codexThreadId,
      })
      const assistantMessage = messages
        .filter((message) => message.role === "assistant")
        .at(-1)

      if (!assistantMessage?.content) {
        throw new Error("AI did not return a form logic draft.")
      }

      return parseGeneratedDraft(assistantMessage.content)
    },
    onSuccess: (draft) => {
      applyGeneratedDraft(draft)
      setHasGenerated(true)
      setChatMessages([])
      setWizardStep("generate")
    },
    onError: (error) => {
      showError("Generate form logic failed", error, "Generate failed")
    },
  })

  const revisionMutation = useMutation({
    mutationFn: async (changeRequest: string) => {
      if (!environment) {
        throw new Error("Select an environment before revising form logic.")
      }
      if (!structuredContext) {
        throw new Error("Load form metadata before revising form logic.")
      }

      if (!isTauriRuntime()) {
        return {
          source,
          response: "Browser preview noted the requested change.",
        } satisfies GeneratedDraft
      }

      const thread = await startAiChatThread({
        environmentId: environment.id,
        mode: "chat",
        provider: aiProvider,
        model: aiModel,
        reasoningEffort,
      })
      const messages = await sendAiChatMessage({
        threadId: thread.id,
        environmentId: environment.id,
        mode: "chat",
        message: buildRevisionPrompt({
          context: structuredContext,
          currentSource: source,
          changeRequest,
        }),
        provider: aiProvider,
        model: aiModel,
        reasoningEffort,
        providerThreadId: thread.providerThreadId ?? thread.codexThreadId,
        codexThreadId: thread.codexThreadId,
      })
      const assistantMessage = messages
        .filter((message) => message.role === "assistant")
        .at(-1)

      if (!assistantMessage?.content) {
        throw new Error("AI did not return a revised script.")
      }

      return parseGeneratedDraft(assistantMessage.content)
    },
    onSuccess: (draft, changeRequest) => {
      applyGeneratedDraft(draft)
      setChatMessages((current) => [
        ...current,
        {
          id: createId("form-logic-chat"),
          role: "user",
          content: changeRequest,
        },
        {
          id: createId("form-logic-chat"),
          role: "assistant",
          content: draft.response ?? "Updated the script draft.",
        },
      ])
      setChatInput("")
    },
    onError: (error) => {
      showError("Revise script failed", error, "Revision failed")
    },
  })

  async function copySource() {
    await navigator.clipboard.writeText(source)
    setCopied(true)
    globalThis.setTimeout(() => setCopied(false), 1600)
  }

  function submitRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const changeRequest = chatInput.trim()
    if (!changeRequest || revisionMutation.isPending) {
      return
    }

    revisionMutation.mutate(changeRequest)
  }

  if (!environment) {
    return <EmptyEnvironment />
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-background">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
            <WandSparkles className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              Form Logic Copilot
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Generate, refine, and copy Dynamics form JavaScript.
            </p>
          </div>
        </div>

        <span className="inline-flex h-8 max-w-[260px] items-center gap-2 truncate rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate">{environment.name}</span>
        </span>
      </header>

      <div className="border-b border-border bg-muted/20 px-4 py-3">
        <div className="grid gap-2 md:grid-cols-2">
          {wizardSteps.map((step, index) => {
            const isActive = step.id === wizardStep
            const isComplete = index < activeStepIndex

            return (
              <div
                key={step.id}
                className={cn(
                  "rounded-lg border border-border bg-background p-3",
                  isActive && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : isComplete
                          ? "border-emerald-400/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {step.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {step.description}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 overflow-hidden">
        {wizardStep === "target" && (
          <section className="h-full overflow-auto p-4">
            <div className="mx-auto grid w-full max-w-5xl gap-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="form-logic-entity">Table</Label>
                    <Select
                      value={activeEntityLogicalName}
                      onValueChange={handleEntityChange}
                      disabled={entitiesQuery.isLoading}
                    >
                      <SelectTrigger id="form-logic-entity" className="w-full">
                        <SelectValue placeholder="Select table" />
                      </SelectTrigger>
                      <SelectContent>
                        {(entitiesQuery.data ?? []).map((target) => (
                          <SelectItem
                            key={target.logicalName}
                            value={target.logicalName}
                          >
                            {target.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="form-logic-form">Form</Label>
                    <Select
                      value={activeFormId}
                      onValueChange={handleFormChange}
                      disabled={!activeEntityLogicalName || formsQuery.isLoading}
                    >
                      <SelectTrigger id="form-logic-form" className="w-full">
                        <SelectValue placeholder="Select form" />
                      </SelectTrigger>
                      <SelectContent>
                        {(formsQuery.data ?? []).map((targetForm) => (
                          <SelectItem key={targetForm.id} value={targetForm.id}>
                            {targetForm.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4">
                  <MetadataLoadState
                    loading={
                      entitiesQuery.isLoading ||
                      formsQuery.isLoading ||
                      contextQuery.isLoading
                    }
                    error={
                      entitiesQuery.error ??
                      formsQuery.error ??
                      contextQuery.error
                    }
                  />
                </div>

                {structuredContext && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {structuredContext.raw.form.name}
                      </span>
                      <StatusPill tone="muted">
                        {structuredContext.raw.form.typeLabel}
                      </StatusPill>
                      <StatusPill
                        tone={
                          structuredContext.raw.source === "dataverse"
                            ? "success"
                            : "warning"
                        }
                      >
                        {structuredContext.raw.source === "dataverse"
                          ? "Dataverse metadata"
                          : "Browser mock"}
                      </StatusPill>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {structuredContext.raw.entity.logicalName}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                      <div className="rounded-md border border-border bg-background p-2">
                        <div className="text-muted-foreground">Fields</div>
                        <div className="mt-1 font-medium">
                          {structuredContext.fields.length}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background p-2">
                        <div className="text-muted-foreground">Controls</div>
                        <div className="mt-1 font-medium">
                          {structuredContext.controls.length}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background p-2">
                        <div className="text-muted-foreground">Tabs</div>
                        <div className="mt-1 font-medium">
                          {structuredContext.tabs.length}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background p-2">
                        <div className="text-muted-foreground">Events</div>
                        <div className="mt-1 font-medium">
                          {structuredContext.events.length}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
                      {structuredContext.fields.slice(0, 12).map((field) => (
                        <span
                          key={field.logicalName}
                          className="max-w-full truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground"
                        >
                          {field.logicalName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!formsQuery.isLoading &&
                  !formsQuery.error &&
                  activeEntityLogicalName &&
                  (formsQuery.data ?? []).length === 0 && (
                    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-6 text-center">
                      <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                        <Database className="size-5 text-muted-foreground" />
                      </div>
                      <h2 className="mt-3 text-sm font-semibold">
                        No active forms
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Select another table with active model-driven app forms.
                      </p>
                    </div>
                  )}
              </div>

              <form
                className="rounded-lg border border-border bg-background p-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  generateMutation.mutate()
                }}
              >
                <Label htmlFor="form-logic-request">Prompt</Label>
                <textarea
                  id="form-logic-request"
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  className="mt-2 h-40 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="What would you like to do on this form?"
                />

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(140px,1fr)_minmax(210px,1.4fr)_minmax(140px,1fr)_auto]">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="form-logic-provider">AI</Label>
                    <Select
                      value={aiProvider}
                      onValueChange={(value) =>
                        handleProviderChange(value as AiChatProvider)
                      }
                      disabled={generateMutation.isPending}
                    >
                      <SelectTrigger id="form-logic-provider" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providerOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="form-logic-model">Model</Label>
                    <Select
                      value={aiModel}
                      onValueChange={setAiModel}
                      disabled={generateMutation.isPending}
                    >
                      <SelectTrigger id="form-logic-model" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {modelOptionsByProvider[aiProvider].map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="form-logic-effort">Effort</Label>
                    <Select
                      value={reasoningEffort}
                      onValueChange={(value) =>
                        setReasoningEffort(value as AiReasoningEffort)
                      }
                      disabled={generateMutation.isPending}
                    >
                      <SelectTrigger id="form-logic-effort" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {reasoningOptionsByProvider[aiProvider].map(
                          (option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="submit"
                      className="w-full md:w-auto"
                      disabled={generateMutation.isPending || !canGenerate}
                    >
                      {generateMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Generate
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        )}

        {wizardStep === "generate" && (
          <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <div className="border-b border-border bg-background p-3">
              <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="text-sm font-semibold">Generated script</h2>
                    <StatusPill tone="muted">{providerLabel}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The script was generated from the selected form metadata.
                    Go back to choose another table or form.
                  </p>
                </div>

                <div className="w-full min-w-0 space-y-1 sm:w-64">
                  <Label htmlFor="form-logic-revision-model">Revision model</Label>
                  <Select
                    value={aiModel}
                    onValueChange={setAiModel}
                    disabled={revisionMutation.isPending}
                  >
                    <SelectTrigger id="form-logic-revision-model" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptionsByProvider[aiProvider].map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 overflow-auto xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
              <div className="grid min-h-[26rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden xl:min-h-0">
                <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs">
                      {effectiveLogicalName || "formlogic.js"}
                    </div>
                    <StatusPill tone={hasGenerated ? "success" : "muted"}>
                      {hasGenerated ? "Script ready" : "Not generated"}
                    </StatusPill>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copySource()}
                    disabled={!hasGenerated}
                  >
                    <Copy className="size-3.5" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>

                <div className="min-h-0">
                  {hasGenerated ? (
                    <Editor
                      beforeMount={configureWebResourceIntellisense}
                      height="100%"
                      language="javascript"
                      path={`file:///opendataverse/form-logic/${effectiveLogicalName || "formlogic.js"}`}
                      value={source}
                      onChange={(value) => setSource(value ?? "")}
                      loading={
                        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          Loading editor
                        </div>
                      }
                      options={{
                        minimap: { enabled: true },
                        fontSize: 13,
                        lineNumbersMinChars: 3,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        wordWrap: "on",
                        renderLineHighlight: "line",
                        tabCompletion: "on",
                        quickSuggestions: {
                          other: true,
                          comments: false,
                          strings: false,
                        },
                        suggestOnTriggerCharacters: true,
                        parameterHints: { enabled: true, cycle: true },
                        hover: { enabled: true },
                      }}
                      theme={editorTheme}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted/20 p-6">
                      <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
                        <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-muted/30">
                          <FileCode2 className="size-5 text-muted-foreground" />
                        </div>
                        <h2 className="mt-3 text-sm font-semibold">
                          No generated script
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Go back to the prompt screen and generate a script for
                          this form.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                    Uses executionContext.getFormContext()
                  </span>
                  <span className="truncate font-mono">
                    {hasGenerated
                      ? `${source.split("\n").length} lines`
                      : "Waiting for generation"}{" "}
                    · {bindingSuggestions.length} suggested handler
                    {bindingSuggestions.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <aside className="grid min-h-[24rem] grid-rows-[auto_minmax(0,1fr)_auto] border-t border-border bg-muted/20 xl:min-h-0 xl:border-l xl:border-t-0">
                <div className="border-b border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Script chat</h2>
                    <StatusPill tone="muted">{providerLabel}</StatusPill>
                  </div>
                </div>

                <div className="min-h-0 space-y-3 overflow-auto p-3">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Manual deploy</h3>
                      <StatusPill tone="muted">Script only</StatusPill>
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="min-w-0 rounded-md border border-border bg-muted/30 p-2">
                        <div className="text-muted-foreground">
                          Suggested file
                        </div>
                        <div className="mt-1 truncate font-mono">
                          {effectiveLogicalName || "formlogic.js"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {bindingSuggestions.map((binding) => (
                        <div
                          key={binding.id}
                          className="rounded-lg border border-border bg-muted/20 p-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-xs font-medium">
                              {binding.eventLabel}
                            </span>
                            <StatusPill tone={statusPillTone(binding.status)}>
                              {binding.status === "ready"
                                ? "Suggested"
                                : "Review"}
                            </StatusPill>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {binding.target}
                          </p>
                          <div className="mt-2 truncate rounded-md bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                            {binding.handler}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {chatMessages.length === 0 ? (
                    <div className="rounded-lg border border-border bg-background p-3 text-center">
                      <BotMessageSquare className="mx-auto size-4 text-muted-foreground" />
                      <h3 className="mt-2 text-sm font-semibold">
                        No edits yet
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ask for a focused change after the script is generated.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {chatMessages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            "rounded-lg border border-border p-2.5 text-xs",
                            message.role === "user"
                              ? "bg-primary/5"
                              : "bg-background",
                          )}
                        >
                          <div className="mb-1 font-medium">
                            {message.role === "user" ? "You" : providerLabel}
                          </div>
                          <p className="text-muted-foreground">
                            {message.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form
                  className="border-t border-border bg-background p-3"
                  onSubmit={submitRevision}
                >
                  <textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    className="h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    placeholder="Request a script change"
                    disabled={!hasGenerated}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="mt-2 w-full"
                    disabled={
                      !hasGenerated ||
                      !chatInput.trim() ||
                      revisionMutation.isPending
                    }
                  >
                    {revisionMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <SendHorizontal className="size-4" />
                    )}
                    Send
                  </Button>
                </form>
              </aside>
            </div>
          </section>
        )}
      </div>

      <footer className="flex min-w-0 items-center justify-between gap-3 border-t border-border bg-background px-4 py-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {wizardSteps[activeStepIndex]?.title} screen
          {selectedEntity ? ` · ${selectedEntity.displayName}` : ""}
          {selectedForm ? ` · ${selectedForm.name}` : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={goToPreviousStep}
            disabled={wizardStep === "target"}
          >
            Previous
          </Button>
          {wizardStep === "generate" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void copySource()}
              disabled={!hasGenerated}
            >
              <Copy className="size-4" />
              {copied ? "Copied" : "Copy Script"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goToNextStep}
              disabled={!canReviewScript}
            >
              Review Script
            </Button>
          )}
        </div>
      </footer>
    </section>
  )
}
