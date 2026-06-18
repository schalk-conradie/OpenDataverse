import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { dirname, normalize } from "@tauri-apps/api/path"
import { watch, type UnwatchFn, type WatchEvent } from "@tauri-apps/plugin-fs"
import { openUrl } from "@tauri-apps/plugin-opener"
import Editor from "@monaco-editor/react"
import {
  BotMessageSquare,
  Brain,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  Cpu,
  FileCode2,
  FileSymlink,
  Folder,
  FolderOpen,
  FolderSync,
  Loader2,
  MessageSquarePlus,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SendHorizontal,
  Sparkles,
  Unlink,
  Upload,
  X,
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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  completeBrowserAuth,
  getWebResourceContent,
  listWebResources,
  startBrowserAuth,
  publishWebResource,
  saveWebResourceContent,
} from "@/core/desktop/bridge"
import {
  listenToAiChatEvents,
  sendAiChatMessage,
  startAiChatThread,
} from "@/core/desktop/ai-bridge"
import { chooseLocalFile } from "@/core/desktop/file-dialog"
import {
  createId,
  getBindingsForEnvironment,
  getEnvironmentById,
  type BrowserAuthStart,
  type DataverseEnvironment,
  type ToolWindow,
  type WebResource,
  type WebResourceBinding,
  type WebResourceContent,
} from "@/core/dataverse/schemas"
import { isTauriRuntime } from "@/core/desktop/bridge"
import { cn } from "@/lib/utils"
import {
  defaultModelByProvider,
  defaultReasoningByProvider,
  isAiChatModel,
  isAiChatProvider,
  isAiReasoningEffort,
  modelForProvider,
  modelOptionsByProvider,
  providerOptions,
  reasoningOptionsByProvider,
} from "@/modules/ai-chat/options"
import type {
  AiChatMessage,
  AiChatModel,
  AiChatProvider,
  AiChatThread,
  AiChatWindowState,
  AiReasoningEffort,
} from "@/modules/ai-chat/types"
import { useWorkspaceStore } from "@/store/workspace-store"
import { webResourceEvents } from "./activity-events"
import {
  configureWebResourceIntellisense,
  editorLanguageForWebResource,
  editorPathForWebResource,
} from "./intellisense"

type WebResourceManagementModuleProps = {
  window: ToolWindow
}

type ResourceContentSaveAction = "save" | "publish"

type ResourceDraftState = {
  resourceId: string
  content: string
}

type ResourceActionError = {
  resourceId: string
  message: string
}

type AuthDialogState = {
  open: boolean
  browserAuth?: BrowserAuthStart
  error?: string
  waiting: boolean
}

type ResourceViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource?: WebResource
  content?: WebResourceContent
  error: unknown
  loading: boolean
  savingAction?: ResourceContentSaveAction
  onSave: (
    content: WebResourceContent,
    draftContent: string,
    publish: boolean,
  ) => Promise<void>
}

type ResourceTreeFolder = {
  type: "folder"
  id: string
  name: string
  path: string
  children: ResourceTreeNode[]
  resourceCount: number
  boundCount: number
}

type ResourceTreeFile = {
  type: "file"
  id: string
  name: string
  resource: WebResource
}

type ResourceTreeNode = ResourceTreeFolder | ResourceTreeFile

type ResourceTreeRow =
  | {
      type: "folder"
      folder: ResourceTreeFolder
      depth: number
    }
  | {
      type: "file"
      file: ResourceTreeFile
      depth: number
    }

type WatchedBinding = {
  binding: WebResourceBinding
  directoryPath: string
  localPath: string
}

type AutoPublishTimer = ReturnType<typeof globalThis.setTimeout>

function typeBadge(resource: WebResource) {
  const labels: Record<WebResource["type"], string> = {
    html: "HTML",
    css: "CSS",
    js: "JS",
    xml: "XML",
    image: "IMG",
    resx: "RESX",
  }

  return labels[resource.type]
}

function splitResourceName(name: string) {
  const parts = name.split("/").filter(Boolean)

  return parts.length > 0 ? parts : [name]
}

function sortResourceTree(nodes: ResourceTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1
    }

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  })

  for (const node of nodes) {
    if (node.type === "folder") {
      sortResourceTree(node.children)
    }
  }
}

function buildResourceTree(
  resources: WebResource[],
  boundResourceIds: Set<string>,
) {
  const root: ResourceTreeFolder = {
    type: "folder",
    id: "folder:",
    name: "",
    path: "",
    children: [],
    resourceCount: 0,
    boundCount: 0,
  }
  const folderByPath = new Map<string, ResourceTreeFolder>()

  for (const resource of resources) {
    const parts = splitResourceName(resource.name)
    const fileName = parts.at(-1) ?? resource.name
    const isBound = boundResourceIds.has(resource.id)
    let parent = root
    const pathParts: string[] = []

    root.resourceCount += 1
    if (isBound) {
      root.boundCount += 1
    }

    for (const part of parts.slice(0, -1)) {
      pathParts.push(part)
      const folderPath = pathParts.join("/")
      let folder = folderByPath.get(folderPath)

      if (!folder) {
        folder = {
          type: "folder",
          id: `folder:${folderPath}`,
          name: part,
          path: folderPath,
          children: [],
          resourceCount: 0,
          boundCount: 0,
        }
        folderByPath.set(folderPath, folder)
        parent.children.push(folder)
      }

      folder.resourceCount += 1
      if (isBound) {
        folder.boundCount += 1
      }
      parent = folder
    }

    parent.children.push({
      type: "file",
      id: `file:${resource.id}`,
      name: fileName,
      resource,
    })
  }

  sortResourceTree(root.children)

  return root.children
}

function collectFolderIds(nodes: ResourceTreeNode[]) {
  const ids: string[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      ids.push(node.id)
      ids.push(...collectFolderIds(node.children))
    }
  }

  return ids
}

function flattenResourceTree(
  nodes: ResourceTreeNode[],
  expandedFolderIds: Set<string>,
  forceExpanded: boolean,
  depth = 0,
) {
  const rows: ResourceTreeRow[] = []

  for (const node of nodes) {
    if (node.type === "folder") {
      rows.push({ type: "folder", folder: node, depth })

      if (forceExpanded || expandedFolderIds.has(node.id)) {
        rows.push(
          ...flattenResourceTree(
            node.children,
            expandedFolderIds,
            forceExpanded,
            depth + 1,
          ),
        )
      }
    } else {
      rows.push({ type: "file", file: node, depth })
    }
  }

  return rows
}

function formatResourceCount(count: number) {
  return count === 1 ? "1 item" : `${count} items`
}

function isAccessOnlyEvent(event: WatchEvent) {
  return (
    typeof event.type === "object" &&
    "access" in event.type &&
    !("create" in event.type) &&
    !("modify" in event.type) &&
    !("remove" in event.type)
  )
}

async function normalizeFilePath(path: string) {
  return normalize(path)
}

async function createWatchedBindings(bindings: WebResourceBinding[]) {
  const watchedBindings = await Promise.all(
    bindings.map(async (binding) => {
      const localPath = await normalizeFilePath(binding.localPath)

      return {
        binding,
        directoryPath: await dirname(localPath),
        localPath,
      } satisfies WatchedBinding
    }),
  )
  const bindingsByDirectory = new Map<string, WatchedBinding[]>()

  for (const watchedBinding of watchedBindings) {
    const directoryBindings =
      bindingsByDirectory.get(watchedBinding.directoryPath) ?? []

    directoryBindings.push(watchedBinding)
    bindingsByDirectory.set(watchedBinding.directoryPath, directoryBindings)
  }

  return bindingsByDirectory
}

function AuthDialog({
  authDialog,
  onOpenChange,
}: {
  authDialog: AuthDialogState
  onOpenChange: (open: boolean) => void
}) {
  async function copyRedirectUri() {
    if (!authDialog.browserAuth) {
      return
    }

    await navigator.clipboard.writeText(authDialog.browserAuth.redirectUri)
  }

  return (
    <Dialog open={authDialog.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect To Dataverse</DialogTitle>
          <DialogDescription>
            Finish Microsoft sign-in in your browser. OpenDataverse is waiting
            on the local redirect URL.
          </DialogDescription>
        </DialogHeader>

        {authDialog.browserAuth ? (
          <div className="grid gap-4">
            <div className="border bg-muted p-3">
              <div className="text-xs text-muted-foreground">Redirect URL</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="truncate font-mono text-sm tracking-normal">
                  {authDialog.browserAuth.redirectUri}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyRedirectUri()}
                >
                  <Copy />
                  Copy
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              A browser window should open automatically. After sign-in, the
              redirect page can be closed.
            </p>
            <Button
              variant="outline"
              onClick={() => void openUrl(authDialog.browserAuth!.authUrl)}
              disabled={!isTauriRuntime()}
            >
              Open Sign-In
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparing sign-in
          </div>
        )}

        {authDialog.error && (
          <p className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {authDialog.error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled>
            {authDialog.waiting && <Loader2 className="animate-spin" />}
            {authDialog.waiting ? "Waiting For Sign-In" : "Sign-In Stopped"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const defaultWebResourceAiChatState: AiChatWindowState = {
  provider: "codex",
  model: defaultModelByProvider.codex,
  reasoningEffort: defaultReasoningByProvider.codex,
  composerValue: "",
  running: false,
  settingsVersion: 2,
}

function getWebResourceAiChatState(window: ToolWindow): AiChatWindowState {
  const candidate = window.state?.webResourceAiChat as
    | Partial<AiChatWindowState>
    | undefined
  const threadProvider = isAiChatProvider(candidate?.thread?.provider)
    ? candidate.thread.provider
    : undefined
  const provider =
    candidate?.thread?.messages?.length && threadProvider
      ? threadProvider
      : isAiChatProvider(candidate?.provider)
        ? candidate.provider
        : threadProvider ?? defaultWebResourceAiChatState.provider
  const legacyDefaultModel =
    provider === "codex" &&
    (candidate?.settingsVersion ?? 0) < 2 &&
    candidate?.model === "gpt-5.4-mini"
  const model = modelForProvider(
    provider,
    legacyDefaultModel
      ? candidate?.thread?.model
      : candidate?.model ?? candidate?.thread?.model,
  )
  const reasoningEffort =
    isAiReasoningEffort(provider, candidate?.reasoningEffort)
      ? candidate.reasoningEffort
      : isAiReasoningEffort(provider, candidate?.thread?.reasoningEffort)
        ? candidate.thread.reasoningEffort
        : defaultReasoningByProvider[provider]
  const thread = candidate?.thread
    ? {
        ...candidate.thread,
        provider: threadProvider ?? provider,
        providerThreadId:
          candidate.thread.providerThreadId ?? candidate.thread.codexThreadId,
        model,
        reasoningEffort,
      }
    : undefined

  return {
    ...defaultWebResourceAiChatState,
    ...candidate,
    thread,
    provider,
    model,
    reasoningEffort,
    composerValue:
      typeof candidate?.composerValue === "string"
        ? candidate.composerValue
        : defaultWebResourceAiChatState.composerValue,
    running: Boolean(candidate?.running),
  }
}

function getStoredWebResourceAiChatState(windowId: string) {
  const storedWindow = useWorkspaceStore
    .getState()
    .openWindows.find((item) => item.id === windowId)

  return storedWindow
    ? getWebResourceAiChatState(storedWindow)
    : defaultWebResourceAiChatState
}

function upsertAiMessage(messages: AiChatMessage[], message: AiChatMessage) {
  const index = messages.findIndex((item) => item.id === message.id)

  if (index === -1) {
    return [...messages, message]
  }

  return messages.map((item, itemIndex) =>
    itemIndex === index ? message : item,
  )
}

function getProviderThreadIdFromMessages(messages: AiChatMessage[]) {
  const message = messages.findLast((item) => {
    const metadata = item.metadata
    return (
      item.role === "tool" &&
      metadata &&
      (typeof metadata.providerThreadId === "string" ||
        typeof metadata.codexThreadId === "string")
    )
  })

  const metadata = message?.metadata
  return typeof metadata?.providerThreadId === "string"
    ? metadata.providerThreadId
    : typeof metadata?.codexThreadId === "string"
      ? metadata.codexThreadId
      : undefined
}

function createChatTitle(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ")
  if (!normalized) {
    return "Webresource Chat"
  }

  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized
}

function formatChatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function buildWebResourceAiContext(input: {
  environment: DataverseEnvironment
  resource?: WebResource
  binding?: WebResourceBinding
  resourceCount: number
  bindingCount: number
}) {
  const lines = [
    "You are answering inside OpenDataverse Webresource Management.",
    `Environment: ${input.environment.name} (${input.environment.url})`,
    `Loaded web resources in the current view: ${input.resourceCount}`,
    `Local web resource bindings configured in this environment: ${input.bindingCount}`,
  ]

  if (input.resource) {
    lines.push(
      `Selected web resource: ${input.resource.name}`,
      `Selected web resource type: ${typeBadge(input.resource)}`,
      `Selected web resource version: ${input.resource.version || "unknown"}`,
      `Selected web resource managed: ${input.resource.isManaged ? "yes" : "no"}`,
      input.binding
        ? `Selected web resource local binding: ${input.binding.localPath}`
        : "Selected web resource local binding: none",
    )
  } else {
    lines.push("No individual web resource is currently selected.")
  }

  lines.push(
    "Use Dataverse read-only tools when live organization data is needed.",
    "Do not imply that a save, bind, unbind, or publish action has happened unless the user explicitly performs it in the UI.",
  )

  return lines.join("\n")
}

function CompactChatMessage({ message }: { message: AiChatMessage }) {
  if (message.role === "tool") {
    const statusLabel =
      message.status === "streaming"
        ? "running"
        : message.status === "error"
          ? "failed"
          : "used"

    return (
      <div className="flex justify-center">
        <div className="max-w-full truncate border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
          {message.status === "streaming" && (
            <Loader2 className="mr-1 inline size-3 animate-spin" />
          )}
          <span className="font-medium text-foreground">
            {message.toolName ?? "tool"}
          </span>
          <span className="mx-1">{statusLabel}</span>
          <span className="font-mono tracking-normal">{message.content}</span>
        </div>
      </div>
    )
  }

  const fromUser = message.role === "user"

  return (
    <div className={cn("flex", fromUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] border px-2.5 py-2 text-xs leading-5",
          fromUser
            ? "bg-primary text-primary-foreground"
            : "bg-background text-foreground",
          message.status === "error" &&
            "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        <div
          className={cn(
            "mt-1 text-[10px]",
            fromUser ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {formatChatTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}

function WebResourceAiChatPanel({
  window,
  environment,
  resource,
  binding,
  resourceCount,
  bindingCount,
}: {
  window: ToolWindow
  environment: DataverseEnvironment
  resource?: WebResource
  binding?: WebResourceBinding
  resourceCount: number
  bindingCount: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const updateWindowState = useWorkspaceStore((state) => state.updateWindowState)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const aiState = getWebResourceAiChatState(window)
  const thread = aiState.thread
  const messages = thread?.messages ?? []
  const running = aiState.running
  const composerValue = aiState.composerValue
  const error = aiState.error
  const providerLocked = messages.length > 0
  const canSend = Boolean(composerValue.trim() && !running)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const suggestedPrompts = resource
    ? [
        "What should I check before publishing this resource?",
        "What can you tell me about this selected web resource?",
      ]
    : [
        "Which web resources should I review first?",
        "Find web resources that may need binding or publishing attention.",
      ]

  const persistAiState = useCallback(
    (changes: Partial<AiChatWindowState>) => {
      const current = getStoredWebResourceAiChatState(window.id)
      updateWindowState(window.id, {
        webResourceAiChat: {
          ...current,
          ...changes,
        },
      })
    },
    [updateWindowState, window.id],
  )

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    void listenToAiChatEvents((event) => {
      const current = getStoredWebResourceAiChatState(window.id)
      if (current.thread?.id !== event.threadId) {
        return
      }

      const nextThread: AiChatThread = {
        ...current.thread,
        messages: upsertAiMessage(current.thread.messages, event.message),
        updatedAt: new Date().toISOString(),
      }
      updateWindowState(window.id, {
        webResourceAiChat: {
          ...current,
          thread: nextThread,
        },
      })
    }).then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }

      unlisten = dispose
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [updateWindowState, window.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, running, collapsed])

  function clearChat() {
    if (running) {
      return
    }

    persistAiState({
      thread: undefined,
      composerValue: "",
      running: false,
      error: undefined,
    })
  }

  async function submitMessage(
    event?: FormEvent<HTMLFormElement>,
    value?: string,
  ) {
    event?.preventDefault()

    const message = (value ?? composerValue).trim()
    if (!message || running) {
      return
    }

    const current = getStoredWebResourceAiChatState(window.id)
    let activeThread = current.thread

    try {
      if (!activeThread) {
        activeThread = await startAiChatThread({
          environmentId: environment.id,
          provider: current.provider,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
        })
      }

      const now = new Date().toISOString()
      const threadTitle =
        activeThread.messages.length === 0
          ? createChatTitle(message)
          : activeThread.title
      const pendingMessages: AiChatMessage[] = [
        ...activeThread.messages,
        {
          id: createId("ai-message"),
          role: "user",
          content: message,
          createdAt: now,
          status: "complete",
        },
      ]

      persistAiState({
        composerValue: "",
        running: true,
        error: undefined,
        thread: {
          ...activeThread,
          environmentId: environment.id,
          provider: current.provider,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
          title: threadTitle,
          updatedAt: now,
          messages: pendingMessages,
        },
      })

      const responseMessages = await sendAiChatMessage({
        threadId: activeThread.id,
        environmentId: environment.id,
        message,
        context: buildWebResourceAiContext({
          environment,
          resource,
          binding,
          resourceCount,
          bindingCount,
        }),
        provider: current.provider,
        model: current.model,
        reasoningEffort: current.reasoningEffort,
        providerThreadId:
          activeThread.providerThreadId ?? activeThread.codexThreadId,
        codexThreadId: activeThread.codexThreadId,
      })
      const providerThreadId = getProviderThreadIdFromMessages(responseMessages)

      persistAiState({
        running: false,
        error: undefined,
        thread: {
          ...activeThread,
          environmentId: environment.id,
          provider: current.provider,
          providerThreadId:
            providerThreadId ??
            activeThread.providerThreadId ??
            activeThread.codexThreadId,
          codexThreadId:
            current.provider === "codex"
              ? providerThreadId ?? activeThread.codexThreadId
              : activeThread.codexThreadId,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
          title: threadTitle,
          updatedAt: new Date().toISOString(),
          messages: responseMessages,
        },
      })
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "AI chat turn failed"
      setLastMessage(messageText)
      persistAiState({
        running: false,
        error: messageText,
      })
    }
  }

  function updateProvider(provider: AiChatProvider) {
    if (running || providerLocked || provider === aiState.provider) {
      return
    }

    persistAiState({
      provider,
      model: defaultModelByProvider[provider],
      reasoningEffort: defaultReasoningByProvider[provider],
      thread: undefined,
      error: undefined,
    })
  }

  function updateModel(model: AiChatModel) {
    if (!isAiChatModel(aiState.provider, model)) {
      return
    }

    const current = getStoredWebResourceAiChatState(window.id)
    persistAiState({
      model,
      thread: current.thread
        ? { ...current.thread, provider: current.provider, model }
        : undefined,
    })
  }

  function updateReasoningEffort(reasoningEffort: AiReasoningEffort) {
    if (!isAiReasoningEffort(aiState.provider, reasoningEffort)) {
      return
    }

    const current = getStoredWebResourceAiChatState(window.id)
    persistAiState({
      reasoningEffort,
      thread: current.thread
        ? { ...current.thread, provider: current.provider, reasoningEffort }
        : undefined,
    })
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="mx-auto max-w-6xl border bg-background">
        <div className="flex min-h-10 items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {resource ? "Ask about this resource" : "Ask about web resources"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {resource?.name ?? environment.name}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {running && (
              <Badge variant="outline">
                <Loader2 className="animate-spin" />
                Running
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={collapsed ? "Expand AI chat" : "Collapse AI chat"}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="hidden border-t md:block">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <Select
                value={aiState.provider}
                onValueChange={(value) => updateProvider(value as AiChatProvider)}
                disabled={running || providerLocked}
              >
                <SelectTrigger className="w-28 bg-background" size="sm">
                  <BotMessageSquare className="size-3.5" />
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
              <Select
                value={aiState.model}
                onValueChange={(value) => updateModel(value as AiChatModel)}
                disabled={running}
              >
                <SelectTrigger className="w-56 bg-background" size="sm">
                  <Cpu className="size-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptionsByProvider[aiState.provider].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={aiState.reasoningEffort}
                onValueChange={(value) =>
                  updateReasoningEffort(value as AiReasoningEffort)
                }
                disabled={running}
              >
                <SelectTrigger className="w-32 bg-background" size="sm">
                  <Brain className="size-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reasoningOptionsByProvider[aiState.provider].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="ml-auto"
                variant="outline"
                size="icon-sm"
                aria-label="New webresource AI chat"
                onClick={clearChat}
                disabled={messages.length === 0 || running}
              >
                <MessageSquarePlus />
              </Button>
            </div>

            <div className="max-h-52 min-h-24 overflow-y-auto px-3 py-3">
              <div className="flex flex-col gap-2">
                {messages.length === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="min-h-8 border bg-muted/30 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                        onClick={() => void submitMessage(undefined, prompt)}
                        disabled={running}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}

                {messages.map((message) => (
                  <CompactChatMessage key={message.id} message={message} />
                ))}

                {error && (
                  <div className="border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <form className="border-t p-2" onSubmit={submitMessage}>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 flex-1"
                  value={composerValue}
                  onChange={(event) =>
                    persistAiState({ composerValue: event.target.value })
                  }
                  placeholder={
                    resource
                      ? "Ask about this resource..."
                      : "Ask about web resources..."
                  }
                  disabled={running}
                />
                <Button
                  type="submit"
                  size="icon-sm"
                  aria-label="Send webresource AI message"
                  disabled={!canSend}
                >
                  {running ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <SendHorizontal />
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function ResourceViewerDialog({
  open,
  onOpenChange,
  resource,
  content,
  error,
  loading,
  savingAction,
  onSave,
}: ResourceViewerDialogProps) {
  const [editResourceId, setEditResourceId] = useState<string>()
  const [draftState, setDraftState] = useState<ResourceDraftState>()
  const [actionError, setActionError] = useState<ResourceActionError>()
  const resourceId = content?.id
  const savedContent = content?.content ?? ""
  const draftContent =
    draftState && draftState.resourceId === resourceId
      ? draftState.content
      : savedContent
  const dirty = draftContent !== savedContent
  const isSaving = Boolean(savingAction)
  const canEdit = Boolean(content && !loading && !error && !resource?.isManaged)
  const editMode = editResourceId === resourceId && canEdit
  const actionErrorMessage =
    actionError && actionError.resourceId === resourceId
      ? actionError.message
      : undefined
  const editorLanguage = editorLanguageForWebResource(content)
  const editorPath = editorPathForWebResource(content)

  async function copyContent() {
    if (!draftContent) {
      return
    }

    await navigator.clipboard.writeText(draftContent)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSaving && !nextOpen) {
      return
    }

    if (!nextOpen) {
      setDraftState(undefined)
      setEditResourceId(undefined)
      setActionError(undefined)
    }

    onOpenChange(nextOpen)
  }

  function handleEditModeChange(enabled: boolean) {
    if (!canEdit) {
      return
    }

    setEditResourceId(enabled ? resourceId : undefined)
  }

  function revertDraft() {
    setDraftState(undefined)
    setActionError(undefined)
  }

  async function saveDraft(publish: boolean) {
    if (!content || !canEdit) {
      return
    }

    setActionError(undefined)

    try {
      await onSave(content, draftContent, publish)
      setDraftState(undefined)
    } catch (error) {
      setActionError(
        {
          resourceId: content.id,
          message:
            error instanceof Error
              ? error.message
              : String(error ?? "Could not save web resource"),
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid h-[min(900px,calc(100vh-3rem))] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] 2xl:w-[1480px] 2xl:max-w-[1480px]">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="truncate font-mono text-sm">
                {resource?.name ?? "Web Resource"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Web resource source viewer.
              </DialogDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {resource && (
                  <Badge variant="secondary">{typeBadge(resource)}</Badge>
                )}
                {resource?.isManaged && (
                  <Badge variant="outline">Managed</Badge>
                )}
                {content?.language && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {content.language}
                  </span>
                )}
                {dirty && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700"
                  >
                    Unsaved
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {loading && (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading
                </span>
              )}
              <Label
                htmlFor="resource-editor-edit-mode"
                className={cn(
                  "flex h-7 items-center gap-2 border px-2 text-xs text-muted-foreground",
                  canEdit && "text-foreground",
                )}
              >
                Edit
                <Switch
                  id="resource-editor-edit-mode"
                  size="sm"
                  checked={editMode && canEdit}
                  onCheckedChange={handleEditModeChange}
                  disabled={!canEdit || isSaving}
                />
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyContent()}
                disabled={!draftContent}
              >
                <Copy />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={revertDraft}
                disabled={!dirty || isSaving}
              >
                <RotateCcw />
                Revert
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                <X />
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveDraft(false)}
                disabled={!canEdit || !dirty || isSaving}
              >
                {savingAction === "save" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}
                Save
              </Button>
              <Button
                size="sm"
                onClick={() => void saveDraft(true)}
                disabled={!canEdit || isSaving}
              >
                {savingAction === "publish" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Upload />
                )}
                Save & Publish
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
          <div>
            {Boolean(error) && (
              <div className="m-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error instanceof Error ? error.message : String(error)}
              </div>
            )}

            {actionErrorMessage && (
              <div className="m-4 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {actionErrorMessage}
              </div>
            )}
          </div>

          {!error && loading && !content && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading content
            </div>
          )}

          {!error && (!loading || content) && (
            <div className="min-h-0">
              <Editor
                beforeMount={configureWebResourceIntellisense}
                height="100%"
                language={editorLanguage}
                path={editorPath}
                value={draftContent}
                onChange={(value) => {
                  if (resourceId) {
                    setDraftState({ resourceId, content: value ?? "" })
                  }
                }}
                loading={
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading content
                  </div>
                }
                options={{
                  readOnly: !editMode || !canEdit || isSaving,
                  minimap: { enabled: true },
                  fontSize: 13,
                  lineNumbersMinChars: 3,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                  renderLineHighlight: "line",
                  quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false,
                  },
                  suggestOnTriggerCharacters: true,
                  tabCompletion: "on",
                  parameterHints: { enabled: true, cycle: true },
                  hover: { enabled: true },
                }}
                theme="vs"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function WebResourceManagementModule({
  window,
}: WebResourceManagementModuleProps) {
  const [query, setQuery] = useState("")
  const [includeManaged, setIncludeManaged] = useState(false)
  const [selectedResourceId, setSelectedResourceId] = useState<string>()
  const [resourceViewerOpen, setResourceViewerOpen] = useState(false)
  const [savingResourceAction, setSavingResourceAction] =
    useState<ResourceContentSaveAction>()
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set())
  const [authDialog, setAuthDialog] = useState<AuthDialogState>({
    open: false,
    waiting: false,
  })
  const config = useWorkspaceStore((state) => state.config)
  const addBinding = useWorkspaceStore((state) => state.addBinding)
  const updateBinding = useWorkspaceStore((state) => state.updateBinding)
  const removeBinding = useWorkspaceStore((state) => state.removeBinding)
  const checkConnection = useWorkspaceStore((state) => state.connectEnvironment)
  const setEnvironmentAuthState = useWorkspaceStore(
    (state) => state.setEnvironmentAuthState,
  )
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const queryClient = useQueryClient()
  const environment =
    getEnvironmentById(config, window.environmentId) ??
    getEnvironmentById(config, config.currentEnvironmentId)
  const bindings = useMemo(
    () => getBindingsForEnvironment(config, environment?.id),
    [config, environment?.id],
  )
  const autoPublishBindings = useMemo(
    () => bindings.filter((binding) => binding.autoPublish),
    [bindings],
  )
  const publishingBindingIdsRef = useRef<Set<string>>(new Set())
  const autoPublishTimersRef = useRef<Map<string, AutoPublishTimer>>(new Map())

  const resourceQuery = useQuery({
    queryKey: ["webResources", environment?.id, includeManaged],
    enabled: Boolean(environment),
    queryFn: () => listWebResources(environment as DataverseEnvironment, includeManaged),
  })
  const refetchResources = resourceQuery.refetch

  const selectedResource = useMemo(
    () =>
      (resourceQuery.data ?? []).find(
        (resource) => resource.id === selectedResourceId,
      ),
    [resourceQuery.data, selectedResourceId],
  )
  const selectedResourceBinding = useMemo(
    () =>
      selectedResource
        ? bindings.find((item) => item.webResourceId === selectedResource.id)
        : undefined,
    [bindings, selectedResource],
  )

  const resourceContentQuery = useQuery({
    queryKey: ["webResourceContent", environment?.id, selectedResourceId],
    enabled: Boolean(environment && selectedResourceId && resourceViewerOpen),
    queryFn: () =>
      getWebResourceContent(
        environment as DataverseEnvironment,
        selectedResourceId as string,
      ),
  })

  const resources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return (resourceQuery.data ?? []).filter((resource) => {
      if (!normalizedQuery) {
        return true
      }

      return resource.name.toLowerCase().includes(normalizedQuery)
    })
  }, [query, resourceQuery.data])
  const boundResourceIds = useMemo(
    () => new Set(bindings.map((binding) => binding.webResourceId)),
    [bindings],
  )
  const resourceTree = useMemo(
    () => buildResourceTree(resources, boundResourceIds),
    [boundResourceIds, resources],
  )
  const folderIds = useMemo(() => collectFolderIds(resourceTree), [resourceTree])
  const searchActive = query.trim().length > 0
  const resourceTreeRows = useMemo(
    () => flattenResourceTree(resourceTree, expandedFolderIds, searchActive),
    [expandedFolderIds, resourceTree, searchActive],
  )

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current)

      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }

      return next
    })
  }

  const setBindingPublishing = useCallback((
    bindingId: string,
    publishing: boolean,
  ) => {
    setPublishingIds((current) => {
      const next = new Set(current)

      if (publishing) {
        next.add(bindingId)
      } else {
        next.delete(bindingId)
      }

      publishingBindingIdsRef.current = next
      return next
    })
  }, [])

  async function startAuthFlow(environment: DataverseEnvironment) {
    setAuthDialog({ open: true, waiting: true })
    setEnvironmentAuthState(environment.id, "connecting", "Starting sign-in")

    try {
      const browserAuth = await startBrowserAuth(environment)
      setAuthDialog({ open: true, waiting: true, browserAuth })

      if (isTauriRuntime()) {
        await openUrl(browserAuth.authUrl)
      }

      const session = await completeBrowserAuth(
        environment,
        browserAuth.sessionId,
      )
      setEnvironmentAuthState(environment.id, "connected", session.message)
      setAuthDialog({ open: false, waiting: false })
      await refetchResources()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "Sign-in failed")
      setEnvironmentAuthState(environment.id, "error", message)
      setAuthDialog((current) => ({
        ...current,
        open: true,
        waiting: false,
        error: message,
      }))
    }
  }

  async function bindResource(resource: WebResource) {
    if (!environment) {
      return
    }

    const localPath = await chooseLocalFile()
    if (!localPath) {
      return
    }

    addBinding({
      environmentId: environment.id,
      localPath,
      webResourceName: resource.name,
      webResourceId: resource.id,
      lastKnownVersion: resource.version,
      autoPublish: true,
    })
  }

  function unbindResource(binding: WebResourceBinding) {
    const pendingTimer = autoPublishTimersRef.current.get(binding.id)

    if (pendingTimer) {
      globalThis.clearTimeout(pendingTimer)
      autoPublishTimersRef.current.delete(binding.id)
    }

    removeBinding(binding.id)
  }

  function openResourceViewer(resource: WebResource) {
    setSelectedResourceId(resource.id)
    setResourceViewerOpen(true)
  }

  const publishBinding = useCallback(async (
    binding: WebResourceBinding,
    trigger: "manual" | "auto" = "manual",
  ) => {
    if (!environment) {
      return
    }

    if (publishingBindingIdsRef.current.has(binding.id)) {
      return
    }

    setBindingPublishing(binding.id, true)
    if (trigger === "auto") {
      setLastMessage(`Auto-publishing ${binding.webResourceName}`)
    }

    try {
      const result = await publishWebResource(environment, binding)
      updateBinding(binding.id, {
        lastKnownVersion:
          resources.find((resource) => resource.id === binding.webResourceId)
            ?.version ?? binding.lastKnownVersion,
      })
      setLastMessage(
        trigger === "auto"
          ? `Auto-published ${binding.webResourceName}`
          : result.message,
      )
      await refetchResources()
    } catch (error) {
      setLastMessage(
        error instanceof Error
          ? `${trigger === "auto" ? "Auto-publish failed: " : ""}${error.message}`
          : String(error ?? "Publish failed"),
      )
    } finally {
      setBindingPublishing(binding.id, false)
    }
  }, [
    environment,
    refetchResources,
    resources,
    setBindingPublishing,
    setLastMessage,
    updateBinding,
  ])

  const queueAutoPublish = useCallback((binding: WebResourceBinding) => {
    const existingTimer = autoPublishTimersRef.current.get(binding.id)

    if (existingTimer) {
      globalThis.clearTimeout(existingTimer)
    }

    const timer = globalThis.setTimeout(() => {
      autoPublishTimersRef.current.delete(binding.id)
      void publishBinding(binding, "auto")
    }, 300)

    autoPublishTimersRef.current.set(binding.id, timer)
  }, [publishBinding])

  async function publishAllBindings() {
    for (const binding of bindings) {
      await publishBinding(binding)
    }
  }

  async function saveResourceContent(
    content: WebResourceContent,
    draftContent: string,
    publish: boolean,
  ) {
    if (!environment) {
      return
    }

    setSavingResourceAction(publish ? "publish" : "save")

    try {
      const updatedContent = { ...content, content: draftContent }
      const result = await saveWebResourceContent(
        environment,
        updatedContent,
        publish,
      )

      queryClient.setQueryData(
        ["webResourceContent", environment.id, content.id],
        updatedContent,
      )
      setLastMessage(result.message)
      await refetchResources()
    } catch (error) {
      setLastMessage(
        error instanceof Error
          ? error.message
          : String(error ?? "Could not save web resource"),
      )
      throw error
    } finally {
      setSavingResourceAction(undefined)
    }
  }

  useEffect(() => {
    const autoPublishTimers = autoPublishTimersRef.current

    return () => {
      for (const timer of autoPublishTimers.values()) {
        globalThis.clearTimeout(timer)
      }
      autoPublishTimers.clear()
    }
  }, [])

  useEffect(() => {
    if (!environment || !isTauriRuntime() || autoPublishBindings.length === 0) {
      return
    }

    let cancelled = false
    let unwatch: UnwatchFn | undefined
    const autoPublishTimers = autoPublishTimersRef.current

    async function startAutoPublishWatcher() {
      const bindingsByDirectory =
        await createWatchedBindings(autoPublishBindings)
      const directoryPaths = [...bindingsByDirectory.keys()]

      if (cancelled || directoryPaths.length === 0) {
        return
      }

      unwatch = await watch(
        directoryPaths,
        (event) => {
          if (cancelled || isAccessOnlyEvent(event)) {
            return
          }

          void (async () => {
            const changedBindings = new Map<string, WebResourceBinding>()

            for (const eventPath of event.paths) {
              const changedPath = await normalizeFilePath(eventPath)
              const changedDirectory = await dirname(changedPath)
              const directoryBindings =
                bindingsByDirectory.get(changedDirectory) ?? []

              for (const watchedBinding of directoryBindings) {
                if (watchedBinding.localPath === changedPath) {
                  changedBindings.set(
                    watchedBinding.binding.id,
                    watchedBinding.binding,
                  )
                }
              }
            }

            for (const binding of changedBindings.values()) {
              queueAutoPublish(binding)
            }
          })().catch((error: unknown) => {
            setLastMessage(
              error instanceof Error
                ? `Auto-publish watcher failed: ${error.message}`
                : "Auto-publish watcher failed",
            )
          })
        },
        {
          delayMs: 500,
          recursive: false,
        },
      )

      if (cancelled) {
        unwatch()
      }
    }

    void startAutoPublishWatcher().catch((error: unknown) => {
      setLastMessage(
        error instanceof Error
          ? `Could not start auto-publish watcher: ${error.message}`
          : "Could not start auto-publish watcher",
      )
    })

    return () => {
      cancelled = true
      unwatch?.()

      for (const binding of autoPublishBindings) {
        const timer = autoPublishTimers.get(binding.id)

        if (timer) {
          globalThis.clearTimeout(timer)
          autoPublishTimers.delete(binding.id)
        }
      }
    }
  }, [autoPublishBindings, environment, queueAutoPublish, setLastMessage])

  if (!environment) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center gap-3 border-l bg-background p-8 text-center">
        <div className="flex size-12 items-center justify-center border bg-muted">
          <FolderSync className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-medium">No Environment</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add or select a Dataverse environment to open this tool window.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-l bg-background">
      <AuthDialog
        authDialog={authDialog}
        onOpenChange={(open) =>
          setAuthDialog((current) => ({ ...current, open }))
        }
      />
      <ResourceViewerDialog
        open={resourceViewerOpen}
        onOpenChange={setResourceViewerOpen}
        resource={selectedResource}
        content={resourceContentQuery.data}
        error={resourceContentQuery.error}
        loading={resourceContentQuery.isFetching}
        savingAction={savingResourceAction}
        onSave={saveResourceContent}
      />

      <header className="flex min-h-16 items-center justify-between gap-4 border-b px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-medium">
              Webresource Management
            </h2>
            <Badge variant="outline">{environment.name}</Badge>
            <Badge
              className={cn(
                "capitalize",
                environment.authState === "connected" &&
                  "border-emerald-300 bg-emerald-50 text-emerald-700",
                environment.authState === "connecting" &&
                  "border-sky-300 bg-sky-50 text-sky-700",
                environment.authState === "error" &&
                  "border-red-300 bg-red-50 text-red-700",
              )}
              variant="outline"
            >
              {environment.authState}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {environment.url}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void startAuthFlow(environment)}
            disabled={authDialog.waiting}
          >
            {authDialog.waiting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Play />
            )}
            Connect
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void checkConnection(environment.id)}
          >
            Check
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Refresh"
            onClick={() => {
              void resourceQuery.refetch()
              if (resourceViewerOpen && selectedResourceId) {
                void resourceContentQuery.refetch()
              }
            }}
            disabled={resourceQuery.isFetching}
          >
            <RefreshCw className={cn(resourceQuery.isFetching && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            onClick={() => void publishAllBindings()}
            disabled={bindings.length === 0 || publishingIds.size > 0}
          >
            {publishingIds.size > 0 ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Play />
            )}
            Publish
          </Button>
        </div>
      </header>

      <Tabs defaultValue="resources" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <TabsList>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="bindings">Bindings</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedFolderIds(new Set(folderIds))}
                disabled={folderIds.length === 0}
              >
                <FolderOpen />
                Expand
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedFolderIds(new Set())}
                disabled={folderIds.length === 0}
              >
                <Folder />
                Collapse
              </Button>
            </div>
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              Managed
              <Switch
                checked={includeManaged}
                onCheckedChange={setIncludeManaged}
              />
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-64 pl-7"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search resources"
              />
            </div>
          </div>
        </div>

        <TabsContent value="resources" className="min-h-0 flex-1 overflow-hidden p-0">
          {resourceQuery.error && (
            <div className="border-b border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {resourceQuery.error instanceof Error
                ? resourceQuery.error.message
                : String(resourceQuery.error)}
            </div>
          )}

          <div className="h-full min-h-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48%]">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resourceQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading web resources
                      </span>
                    </TableCell>
                  </TableRow>
                )}

                {!resourceQuery.isLoading &&
                  resourceTreeRows.map((row) => {
                    if (row.type === "folder") {
                      const expanded =
                        searchActive || expandedFolderIds.has(row.folder.id)

                      return (
                        <TableRow
                          key={row.folder.id}
                          aria-expanded={expanded}
                          className={cn(
                            "bg-muted/20 font-medium",
                            !searchActive && "cursor-pointer",
                          )}
                          onClick={() => {
                            if (!searchActive) {
                              toggleFolder(row.folder.id)
                            }
                          }}
                        >
                          <TableCell className="max-w-96">
                            <div
                              className="flex min-w-0 items-center gap-1.5"
                              style={{
                                paddingLeft: `${row.depth * 1.25}rem`,
                              }}
                              title={row.folder.path}
                            >
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-expanded={expanded}
                                aria-label={`${
                                  expanded ? "Collapse" : "Expand"
                                } ${row.folder.path}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggleFolder(row.folder.id)
                                }}
                                disabled={searchActive}
                              >
                                {expanded ? <ChevronDown /> : <ChevronRight />}
                              </Button>
                              {expanded ? (
                                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <Folder className="size-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate font-mono text-xs">
                                {row.folder.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">Folder</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatResourceCount(row.folder.resourceCount)}
                          </TableCell>
                          <TableCell>
                            {row.folder.boundCount > 0 ? (
                              <span className="text-muted-foreground">
                                {row.folder.boundCount} bound
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                Unbound
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" />
                        </TableRow>
                      )
                    }

                    const resource = row.file.resource
                    const binding = bindings.find(
                      (item) => item.webResourceId === resource.id,
                    )
                    const selected = selectedResourceId === resource.id

                    return (
                      <TableRow
                        key={resource.id}
                        className={cn(
                          "cursor-pointer",
                          selected && "bg-muted/80 hover:bg-muted",
                        )}
                        onClick={() => openResourceViewer(resource)}
                      >
                        <TableCell className="max-w-96">
                          <div
                            className="flex min-w-0 items-center gap-1.5"
                            style={{
                              paddingLeft: `${row.depth * 1.25 + 1.75}rem`,
                            }}
                            title={resource.name}
                          >
                            <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-mono text-xs">
                              {row.file.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {typeBadge(resource)}
                          </Badge>
                        </TableCell>
                        <TableCell>{resource.version || "-"}</TableCell>
                        <TableCell>
                          {binding ? (
                            <Badge
                              className="border-emerald-300 bg-emerald-50 text-emerald-700"
                              variant="outline"
                            >
                              Bound
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              Unbound
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`View ${resource.name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                openResourceViewer(resource)
                              }}
                            >
                              <Code2 />
                            </Button>
                            {binding ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                aria-label={`Unbind ${resource.name}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  unbindResource(binding)
                                }}
                                disabled={publishingIds.has(binding.id)}
                              >
                                <Unlink />
                                Unbind
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void bindResource(resource)
                                }}
                              >
                                <FileSymlink />
                                Bind
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}

                {!resourceQuery.isLoading && resources.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-28 text-center text-muted-foreground"
                    >
                      No web resources loaded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bindings" className="min-h-0 flex-1 overflow-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Local File</TableHead>
                <TableHead>Web Resource</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Auto</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map((binding) => (
                <TableRow key={binding.id}>
                  <TableCell className="max-w-72 truncate font-mono text-xs">
                    {binding.localPath}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {binding.webResourceName}
                  </TableCell>
                  <TableCell>{binding.lastKnownVersion || "-"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={binding.autoPublish}
                      onCheckedChange={(autoPublish) =>
                        updateBinding(binding.id, { autoPublish })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void publishBinding(binding)}
                        disabled={publishingIds.has(binding.id)}
                      >
                        {publishingIds.has(binding.id) ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Play />
                        )}
                        Publish
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => unbindResource(binding)}
                        disabled={publishingIds.has(binding.id)}
                      >
                        <Unlink />
                        Unbind
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {bindings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-muted-foreground"
                  >
                    No bindings for {environment.name}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="activity" className="min-h-0 flex-1 overflow-auto p-4">
          <div className="max-w-3xl border">
            {webResourceEvents.map((event, index) => (
              <div key={event.id}>
                <div className="grid grid-cols-[72px_1fr] gap-4 p-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {event.time}
                  </span>
                  <div>
                    <div className="font-medium">{event.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {event.detail}
                    </div>
                  </div>
                </div>
                {index < webResourceEvents.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <WebResourceAiChatPanel
        window={window}
        environment={environment}
        resource={selectedResource}
        binding={selectedResourceBinding}
        resourceCount={resources.length}
        bindingCount={bindings.length}
      />
    </section>
  )
}
