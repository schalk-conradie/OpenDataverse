import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Editor from "@monaco-editor/react"
import {
  BotMessageSquare,
  CheckCircle2,
  Copy,
  FileCode2,
  Loader2,
  RefreshCw,
  SendHorizontal,
  ShieldCheck,
  WandSparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  createFormLogicWebResource,
  isTauriRuntime,
  listSolutions,
} from "@/core/desktop/bridge"
import {
  sendAiChatMessage,
  startAiChatThread,
} from "@/core/desktop/ai-bridge"
import {
  createId,
  getEnvironmentById,
  type DataverseEnvironment,
  type SolutionSummary,
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

type ContextReference = {
  logicalName: string
  displayName: string
  reason: string
}

type FormTarget = {
  id: string
  name: string
  type: string
  description: string
  defaultPrompt: string
  namespaceName: string
  statusField: ContextReference
  targetField: ContextReference
  targetTab: ContextReference
  inactiveStatusValue: number
}

type EntityTarget = {
  logicalName: string
  displayName: string
  forms: FormTarget[]
}

type BindingSuggestion = {
  id: string
  target: string
  eventLabel: string
  eventName: "onload" | "onchange"
  attributeLogicalName?: string
  handler: string
  status: "ready" | "review"
}

type EditorChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type StatusPillTone = "success" | "warning" | "muted"

type WizardStepId = "target" | "generate" | "create"

const wizardSteps: Array<{
  id: WizardStepId
  title: string
  description: string
}> = [
  {
    id: "target",
    title: "Prompt",
    description: "Choose context and generate.",
  },
  {
    id: "generate",
    title: "Script",
    description: "Review and refine the script.",
  },
  {
    id: "create",
    title: "Publish",
    description: "Save and bind to the form.",
  },
]

const entityTargets: EntityTarget[] = [
  {
    logicalName: "account",
    displayName: "Account",
    forms: [
      {
        id: "account-main",
        name: "Main account",
        type: "Main",
        description: "Primary account form used by the sales team.",
        defaultPrompt:
          "When Status is Inactive, hide Billing and make Credit Limit not required.",
        namespaceName: "AccountFormLogic",
        statusField: {
          logicalName: "statuscode",
          displayName: "Status",
          reason: "Controls whether the Billing tab is visible.",
        },
        targetField: {
          logicalName: "creditlimit",
          displayName: "Credit Limit",
          reason: "Required level changes when the account is active.",
        },
        targetTab: {
          logicalName: "billing",
          displayName: "Billing",
          reason: "Hidden when Status is Inactive.",
        },
        inactiveStatusValue: 2,
      },
      {
        id: "account-quick-create",
        name: "Account quick create",
        type: "Quick Create",
        description: "Compact account creation form.",
        defaultPrompt:
          "When Status is Inactive, make Credit Limit optional and hide Billing.",
        namespaceName: "AccountQuickCreateLogic",
        statusField: {
          logicalName: "statuscode",
          displayName: "Status",
          reason: "Controls optional account setup fields.",
        },
        targetField: {
          logicalName: "creditlimit",
          displayName: "Credit Limit",
          reason: "Required level changes after status changes.",
        },
        targetTab: {
          logicalName: "billing",
          displayName: "Billing",
          reason: "Hidden when the row is inactive.",
        },
        inactiveStatusValue: 2,
      },
    ],
  },
  {
    logicalName: "contact",
    displayName: "Contact",
    forms: [
      {
        id: "contact-main",
        name: "Main contact",
        type: "Main",
        description: "Primary contact form.",
        defaultPrompt:
          "When Status is Inactive, hide Details and make Email optional.",
        namespaceName: "ContactFormLogic",
        statusField: {
          logicalName: "statuscode",
          displayName: "Status",
          reason: "Controls inactive contact behavior.",
        },
        targetField: {
          logicalName: "emailaddress1",
          displayName: "Email",
          reason: "Required level changes when the contact is inactive.",
        },
        targetTab: {
          logicalName: "details",
          displayName: "Details",
          reason: "Hidden when Status is Inactive.",
        },
        inactiveStatusValue: 2,
      },
    ],
  },
]

function defaultEntity() {
  return entityTargets[0]
}

function firstFormForEntity(entity: EntityTarget) {
  return entity.forms[0]
}

function getEntity(logicalName: string) {
  return (
    entityTargets.find((entity) => entity.logicalName === logicalName) ??
    defaultEntity()
  )
}

function getForm(entity: EntityTarget, formId: string) {
  return entity.forms.find((form) => form.id === formId) ?? firstFormForEntity(entity)
}

function libraryObjectName(entity: EntityTarget) {
  const name = entity.displayName || entity.logicalName
  const pascalName = name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")

  return `${pascalName || "Form"}Library`
}

function normalizedPublisherPrefix(prefix: string | undefined) {
  const trimmed = prefix?.trim()

  return trimmed || "new"
}

function withPublisherPrefix(name: string, prefix: string | undefined) {
  const normalizedPrefix = normalizedPublisherPrefix(prefix)
  const trimmed = name.trim().replace(/^\/+/, "")

  if (!trimmed) {
    return ""
  }

  if (
    trimmed.startsWith(`${normalizedPrefix}_`) ||
    trimmed.startsWith(`${normalizedPrefix}_/`)
  ) {
    return trimmed
  }

  const withoutExistingPrefix = trimmed.replace(
    /^[a-zA-Z][a-zA-Z0-9]{1,7}_/,
    "",
  )

  return `${normalizedPrefix}_${withoutExistingPrefix}`
}

function webResourceDefaults(
  entity: EntityTarget,
  form: FormTarget,
  publisherPrefix = "new",
) {
  const formToken = form.type === "Quick Create" ? "quickcreate" : "form"
  const logicalName = withPublisherPrefix(
    `${entity.logicalName}${formToken}logic.js`,
    publisherPrefix,
  )

  return {
    logicalName,
    displayName: `${entity.displayName} ${form.type} Logic`,
    description: `Form logic for ${entity.displayName} ${form.name}`,
  }
}

function sourceForContext(entity: EntityTarget, form: FormTarget) {
  const libraryName = libraryObjectName(entity)

  return `var ${libraryName} = ${libraryName} || {};

${libraryName}.onLoad = function (executionContext) {
  var formContext = executionContext.getFormContext();
  ${libraryName}.updateFormState(formContext);
};

${libraryName}.updateFormState = function (formContext) {
  var targetTab = formContext.ui.tabs.get("${form.targetTab.logicalName}");
  if (targetTab) {
    targetTab.setVisible(true);
  }
};`
}

function bindingSuggestionsForContext(
  entity: EntityTarget,
  form: FormTarget,
): BindingSuggestion[] {
  const namespace = libraryObjectName(entity)

  return [
    {
      id: `${entity.logicalName}-${form.id}-onload`,
      target: `${form.name} form`,
      eventLabel: "Form OnLoad",
      eventName: "onload",
      handler: `${namespace}.onLoad`,
      status: "ready",
    },
  ]
}

function selectedSolution(
  solutions: SolutionSummary[] | undefined,
  uniqueName: string,
) {
  return (
    solutions?.find((solution) => solution.uniqueName === uniqueName) ??
    solutions?.[0]
  )
}

function buildGenerationPrompt(input: {
  entity: EntityTarget
  form: FormTarget
  request: string
}) {
  const libraryName = libraryObjectName(input.entity)

  return `Generate Dataverse model-driven app form JavaScript for this request.

Request:
${input.request}

Known form context:
- Table logical name: ${input.entity.logicalName}
- Table display name: ${input.entity.displayName}
- Form name: ${input.form.name}
- Form type: ${input.form.type}
- Available fields: ${input.form.statusField.logicalName} (${input.form.statusField.displayName}), ${input.form.targetField.logicalName} (${input.form.targetField.displayName})
- Available tab or section: ${input.form.targetTab.logicalName} (${input.form.targetTab.displayName})
- Default binding: ${libraryName}.onLoad on form OnLoad

Return only a compact JSON object with these string properties:
- logicalName
- displayName
- description
- source

Return valid JSON only. Do not include a provider name, explanation, markdown fence, or any text before or after the JSON object.

The source must be production-oriented JavaScript for a Dataverse web resource. Follow YAGNI: implement only the requested behavior, prefer the smallest clear script, and do not add speculative helpers, abstractions, configuration, event handlers, or defensive wrappers. Use normal Dataverse client API calls such as executionContext.getFormContext() directly. Do not wrap Dataverse APIs in typeof function checks. Use simple null checks only for returned attributes, controls, tabs, or sections before calling methods on them. Declare var ${libraryName} = ${libraryName} || {}, and expose only the handlers needed by the request directly on ${libraryName}. Create ${libraryName}.onLoad by default. Do not create OnChange handlers unless the request explicitly needs logic to run when a field value changes. Avoid markdown.`
}

function buildRevisionPrompt(input: {
  entity: EntityTarget
  form: FormTarget
  currentSource: string
  changeRequest: string
}) {
  const libraryName = libraryObjectName(input.entity)

  return `Revise this Dataverse form JavaScript web resource.

Table: ${input.entity.logicalName}
Form: ${input.form.name}
Requested change:
${input.changeRequest}

Current source:
${input.currentSource}

Return only a compact JSON object with:
- source: the full revised JavaScript source
- response: one short sentence explaining the change

Return valid JSON only. Do not include a provider name, explanation, markdown fence, or any text before or after the JSON object.

Follow YAGNI: make the smallest clear change, preserve existing structure where possible, and do not add speculative helpers, abstractions, configuration, event handlers, or defensive wrappers. Keep executionContext.getFormContext(), do not add typeof function checks around Dataverse APIs, use simple null checks only for returned form objects, keep handlers exposed directly on ${libraryName}, and do not add new event handlers unless the requested change needs them. Avoid markdown.`
}

function browserPreviewGeneratedDraft(entity: EntityTarget, form: FormTarget) {
  return {
    ...webResourceDefaults(entity, form),
    source: sourceForContext(entity, form),
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

function MetadataField({
  id,
  label,
  value,
  onChange,
  readOnly,
}: {
  id: string
  label: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        className={cn(readOnly && "bg-muted/40 text-muted-foreground")}
      />
    </div>
  )
}

function SolutionSelect({
  solutions,
  selectedUniqueName,
  loading,
  onChange,
}: {
  solutions: SolutionSummary[] | undefined
  selectedUniqueName: string
  loading: boolean
  onChange: (uniqueName: string) => void
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor="form-logic-solution">Unmanaged solution</Label>
      <Select
        value={selectedUniqueName}
        onValueChange={onChange}
        disabled={loading || !solutions?.length}
      >
        <SelectTrigger id="form-logic-solution" className="w-full">
          <SelectValue
            placeholder={loading ? "Loading solutions" : "Select solution"}
          />
        </SelectTrigger>
        <SelectContent>
          {solutions?.map((solution) => (
            <SelectItem key={solution.id} value={solution.uniqueName}>
              {solution.friendlyName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
          create a web resource.
        </p>
      </div>
    </section>
  )
}

export function FormLogicCopilotModule({ window }: FormLogicCopilotModuleProps) {
  const queryClient = useQueryClient()
  const config = useWorkspaceStore((state) => state.config)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const showError = useWorkspaceStore((state) => state.showError)
  const appearanceMode = useWorkspaceStore(
    (state) => state.userSettings.appearance.mode,
  )
  const environment = getEnvironmentById(
    config,
    window.environmentId ?? config.currentEnvironmentId,
  )
  const initialEntity = defaultEntity()
  const initialForm = firstFormForEntity(initialEntity)
  const initialDefaults = webResourceDefaults(initialEntity, initialForm)
  const [wizardStep, setWizardStep] = useState<WizardStepId>("target")
  const [entityLogicalName, setEntityLogicalName] = useState(
    initialEntity.logicalName,
  )
  const entity = getEntity(entityLogicalName)
  const [formId, setFormId] = useState(initialForm.id)
  const form = getForm(entity, formId)
  const [request, setRequest] = useState("")
  const [aiProvider, setAiProvider] = useState<AiChatProvider>("codex")
  const [aiModel, setAiModel] = useState<AiChatModel>(
    defaultModelByProvider.codex,
  )
  const [reasoningEffort, setReasoningEffort] = useState<AiReasoningEffort>(
    defaultReasoningByProvider.codex,
  )
  const [logicalName, setLogicalName] = useState(initialDefaults.logicalName)
  const [displayName, setDisplayName] = useState(initialDefaults.displayName)
  const [description, setDescription] = useState(initialDefaults.description)
  const [solutionUniqueName, setSolutionUniqueName] = useState("")
  const [source, setSource] = useState(sourceForContext(initialEntity, initialForm))
  const [hasGenerated, setHasGenerated] = useState(false)
  const bindingSuggestions = useMemo(
    () => bindingSuggestionsForContext(entity, form),
    [entity, form],
  )
  const [includedBindingIds, setIncludedBindingIds] = useState(
    () => new Set(bindingSuggestions.map((binding) => binding.id)),
  )
  const [copied, setCopied] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<EditorChatMessage[]>([])

  const solutionsQuery = useQuery({
    queryKey: ["solutions", environment?.id, "unmanaged"],
    enabled: Boolean(environment),
    queryFn: () => listSolutions(environment as DataverseEnvironment, "unmanaged"),
  })
  const chosenSolution = selectedSolution(
    solutionsQuery.data,
    solutionUniqueName,
  )
  const selectedSolutionUniqueName = chosenSolution?.uniqueName ?? ""
  const publisherPrefix = normalizedPublisherPrefix(
    chosenSolution?.publisherPrefix,
  )
  const prefixedLogicalName = withPublisherPrefix(logicalName, publisherPrefix)
  const includedBindings = useMemo(
    () =>
      bindingSuggestions.filter((binding) =>
        includedBindingIds.has(binding.id),
      ),
    [bindingSuggestions, includedBindingIds],
  )
  const canCreate = Boolean(
    environment &&
      selectedSolutionUniqueName &&
      prefixedLogicalName.trim() &&
      displayName.trim() &&
      source.trim() &&
      includedBindings.length > 0,
  )
  const editorTheme = appearanceMode === "dark" ? "vs-dark" : "vs"
  const providerLabel =
    providerOptions.find((option) => option.value === aiProvider)?.label ??
    "Codex"
  const activeStepIndex = wizardSteps.findIndex((step) => step.id === wizardStep)
  const canProceedToCreate = hasGenerated && source.trim().length > 0

  function resetDraftForContext(nextEntity: EntityTarget, nextForm: FormTarget) {
    const defaults = webResourceDefaults(nextEntity, nextForm, publisherPrefix)

    setRequest("")
    setLogicalName(defaults.logicalName)
    setDisplayName(defaults.displayName)
    setDescription(defaults.description)
    setSource(sourceForContext(nextEntity, nextForm))
    setHasGenerated(false)
    setIncludedBindingIds(
      new Set(
        bindingSuggestionsForContext(nextEntity, nextForm).map(
          (binding) => binding.id,
        ),
      ),
    )
    setChatInput("")
    setChatMessages([])
  }

  function handleEntityChange(nextLogicalName: string) {
    const nextEntity = getEntity(nextLogicalName)
    const nextForm = firstFormForEntity(nextEntity)

    setEntityLogicalName(nextEntity.logicalName)
    setFormId(nextForm.id)
    resetDraftForContext(nextEntity, nextForm)
  }

  function handleFormChange(nextFormId: string) {
    const nextForm = getForm(entity, nextFormId)

    setFormId(nextForm.id)
    resetDraftForContext(entity, nextForm)
  }

  function handleProviderChange(nextProvider: AiChatProvider) {
    setAiProvider(nextProvider)
    setAiModel(defaultModelByProvider[nextProvider])
    setReasoningEffort(defaultReasoningByProvider[nextProvider])
  }

  function goToPreviousStep() {
    if (wizardStep === "generate") {
      setWizardStep("target")
      return
    }

    if (wizardStep === "create") {
      setWizardStep("generate")
    }
  }

  function goToNextStep() {
    if (wizardStep === "target" && canProceedToCreate) {
      setWizardStep("generate")
      return
    }

    if (wizardStep === "generate" && canProceedToCreate) {
      setWizardStep("create")
    }
  }

  function applyGeneratedDraft(draft: GeneratedDraft) {
    setSource(draft.source)
    if (draft.logicalName) {
      setLogicalName(withPublisherPrefix(draft.logicalName, publisherPrefix))
    }
    if (draft.displayName) {
      setDisplayName(draft.displayName)
    }
    if (draft.description) {
      setDescription(draft.description)
    }
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!environment) {
        throw new Error("Select an environment before generating form logic.")
      }

      if (!isTauriRuntime()) {
        return browserPreviewGeneratedDraft(entity, form)
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
        message: buildGenerationPrompt({ entity, form, request }),
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
          entity,
          form,
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

  const createMutation = useMutation({
    mutationFn: () =>
      createFormLogicWebResource(environment as DataverseEnvironment, {
        solutionUniqueName: selectedSolutionUniqueName,
        name: prefixedLogicalName,
        displayName: displayName.trim(),
        description: description.trim(),
        type: "js",
        content: source,
        entityLogicalName: entity.logicalName,
        formId: form.id,
        formName: form.name,
        bindings: includedBindings.map((binding) => ({
          eventName: binding.eventName,
          eventLabel: binding.eventLabel,
          attributeLogicalName: binding.attributeLogicalName,
          handler: binding.handler,
          passExecutionContext: true,
        })),
      }),
    onSuccess: async (result) => {
      setLastMessage(
        result.message,
        {
          title: "Saved and published",
          severity: "success",
        },
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["webResources", environment?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solutions", environment?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["solution-components", environment?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["webResourceActivity", environment?.id],
        }),
      ])
    },
    onError: (error) => {
      showError("Save and publish failed", error, "Publish failed")
    },
  })

  async function copySource() {
    await navigator.clipboard.writeText(source)
    setCopied(true)
    globalThis.setTimeout(() => setCopied(false), 1600)
  }

  function toggleBinding(bindingId: string, enabled: boolean) {
    setIncludedBindingIds((current) => {
      const next = new Set(current)
      if (enabled) {
        next.add(bindingId)
      } else {
        next.delete(bindingId)
      }
      return next
    })
  }

  function publishWebResource() {
    if (!canCreate) {
      setLastMessage("Complete web resource details and select at least one handler.", {
        severity: "error",
      })
      return
    }

    createMutation.mutate()
  }

  function submitWebResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    publishWebResource()
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
              Generate, refine, and create Dynamics form JavaScript.
            </p>
          </div>
        </div>

        <span className="inline-flex h-8 max-w-[260px] items-center gap-2 truncate rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate">{environment.name}</span>
        </span>
      </header>

      <div className="border-b border-border bg-muted/20 px-4 py-3">
        <div className="grid gap-2 md:grid-cols-3">
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
            <div className="mx-auto grid w-full max-w-4xl gap-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="form-logic-entity">Entity</Label>
                    <Select
                      value={entity.logicalName}
                      onValueChange={handleEntityChange}
                    >
                      <SelectTrigger id="form-logic-entity" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {entityTargets.map((target) => (
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
                    <Select value={form.id} onValueChange={handleFormChange}>
                      <SelectTrigger id="form-logic-form" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {entity.forms.map((targetForm) => (
                          <SelectItem key={targetForm.id} value={targetForm.id}>
                            {targetForm.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium">{form.name}</span>
                    <StatusPill tone="muted">{form.type}</StatusPill>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {entity.logicalName}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.description}
                  </p>
                </div>
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
                  placeholder="What would you like to do?"
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
                      disabled={generateMutation.isPending || !request.trim()}
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
                    The original prompt is locked here. Go back to regenerate
                    from a different prompt.
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

            <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
                <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs">
                      {prefixedLogicalName || "new_formlogic.js"}
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
                      path={`file:///opendataverse/form-logic/${prefixedLogicalName || "new_formlogic.js"}`}
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
                    · {includedBindings.length} bindings selected
                  </span>
                </div>
              </div>

              <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-t border-border bg-muted/20 xl:border-l xl:border-t-0">
                <div className="border-b border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Script chat</h2>
                    <StatusPill tone="muted">{providerLabel}</StatusPill>
                  </div>
                </div>

                <div className="min-h-0 overflow-auto p-3">
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

        {wizardStep === "create" && (
          <form
            id="form-logic-web-resource"
            className="h-full overflow-auto p-4"
            onSubmit={submitWebResource}
          >
            <div className="mx-auto grid w-full max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">
                      Save and Publish
                    </h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Add the script, table, and form changes to the selected solution.
                    </p>
                  </div>
                  <StatusPill tone="muted">Script (JScript)</StatusPill>
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  <MetadataField
                    id="form-logic-logical-name"
                    label="Web resource logical name"
                    value={prefixedLogicalName}
                    onChange={setLogicalName}
                  />
                  <MetadataField
                    id="form-logic-display-name"
                    label="Display name"
                    value={displayName}
                    onChange={setDisplayName}
                  />
                  <SolutionSelect
                    solutions={solutionsQuery.data}
                    selectedUniqueName={selectedSolutionUniqueName}
                    loading={solutionsQuery.isLoading}
                    onChange={setSolutionUniqueName}
                  />
                  <MetadataField
                    id="form-logic-publisher-prefix"
                    label="Publisher prefix"
                    value={publisherPrefix}
                    readOnly
                  />
                  <MetadataField
                    id="form-logic-description"
                    label="Description"
                    value={description}
                    onChange={setDescription}
                  />
                  <MetadataField
                    id="form-logic-type"
                    label="Type"
                    value="Script (JScript)"
                    readOnly
                  />
                  <MetadataField
                    id="form-logic-language"
                    label="Language"
                    value="English"
                    readOnly
                  />
                </div>

                {solutionsQuery.error && (
                  <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {solutionsQuery.error instanceof Error
                      ? solutionsQuery.error.message
                      : "Could not load unmanaged solutions"}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Bindings</h2>
                  <span className="text-xs text-muted-foreground">
                    Apply to form
                  </span>
                </div>

                <div className="space-y-2">
                  {bindingSuggestions.map((binding) => (
                    <div
                      key={binding.id}
                      className="rounded-lg border border-border bg-muted/20 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">
                              {binding.eventLabel}
                            </span>
                            <StatusPill tone={statusPillTone(binding.status)}>
                              {binding.status === "ready" ? "Ready" : "Review"}
                            </StatusPill>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {binding.target}
                          </p>
                        </div>
                        <Switch
                          checked={includedBindingIds.has(binding.id)}
                          onCheckedChange={(enabled) =>
                            toggleBinding(binding.id, enabled)
                          }
                          aria-label={`Include ${binding.eventLabel}`}
                          size="sm"
                        />
                      </div>
                      <div className="mt-2 truncate rounded-md bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                        {binding.handler}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-2.5">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <div className="font-medium">Binding check</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Adds the table and form to this solution, applies the
                        available handlers, and publishes the customizations.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </form>
        )}
      </div>

      <footer className="flex min-w-0 items-center justify-between gap-3 border-t border-border bg-background px-4 py-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {wizardSteps[activeStepIndex]?.title} screen
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
          {wizardStep === "create" ? (
            <Button
              type="button"
              onClick={publishWebResource}
              disabled={!canCreate || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileCode2 className="size-4" />
              )}
              Save and Publish
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goToNextStep}
              disabled={!canProceedToCreate}
            >
              {wizardStep === "target"
                ? "Review Script"
                : "Configure Publish"}
            </Button>
          )}
        </div>
      </footer>
    </section>
  )
}
