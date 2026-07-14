import { useCallback, useEffect, useRef, useState } from "react"
import type { ClipboardEvent as ReactClipboardEvent, FormEvent } from "react"
import {
  AlertCircle,
  AlertTriangle,
  BotMessageSquare,
  Brain,
  Cpu,
  FolderOpen,
  History,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  Paperclip,
  SendHorizontal,
  Wrench,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  deleteAiChatThread,
  listAiChatThreads,
  loadAiChatThread,
  listenToAiChatEvents,
  prepareAiChatAttachments,
  renameAiChatThread,
  savePastedAiChatImage,
  startAiChatThread,
  sendAiChatMessage,
} from "@/modules/ai-chat/gateway"
import {
  chooseAiChatContextFiles,
  chooseAiChatContextFolders,
  chooseAiChatImageFiles,
} from "@/core/desktop/file-dialog"
import { formatErrorMessage } from "@/core/errors"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createId,
  getEnvironmentById,
  type DataverseEnvironment,
  type ToolWindow,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import {
  chatModeLabel,
  createChatTitle,
  createUserMessage,
  formatChatTimestamp,
  getContextUsageFromMessages,
  getLastTool,
  getMessageContextUsage,
  getProviderThreadIdFromMessages,
  pastedFileLooksLikeImage,
  pastedImageMimeType,
  upsertMessage,
} from "@/modules/ai-chat/chat-domain"
import {
  defaultAiChatState,
  getAiChatWindowState,
} from "@/modules/ai-chat/chat-state"
import {
  AttachmentList,
  ContextUsageIndicator,
  MessageBubble,
} from "@/modules/ai-chat/chat-presentation"
import type {
  AiChatMode,
  AiChatMessage,
  AiChatModel,
  AiChatProvider,
  AiChatThread,
  AiChatThreadSummary,
  AiChatWindowState,
  AiReasoningEffort,
} from "@/modules/ai-chat/types"
import {
  defaultModelByProvider,
  defaultReasoningByProvider,
  modelOptionsByProvider,
  providerOptions,
  reasoningOptionsByProvider,
} from "@/modules/ai-chat/options"
import { useWorkspaceStore } from "@/store/workspace-store"

type AiChatModuleProps = {
  window: ToolWindow
  mode?: AiChatMode
}

const starterPrompts = [
  "Who am I connected as?",
  "List entity sets related to account.",
  "Show account metadata for the primary name and created fields.",
  "Get the first 5 accounts with name and accountid.",
]

const experimentalStarterPrompts = [
  "Who am I connected as?",
  "Create a draft plan before changing this environment.",
  "Update one test account after I provide the exact row id.",
  "Explain the Dataverse Web API request you would run.",
]

const maxPastedImageBytes = 15_000_000

function imageFilesFromClipboard(
  event: ReactClipboardEvent<HTMLTextAreaElement>,
) {
  const clipboard = event.clipboardData
  const itemFiles = Array.from(clipboard.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .filter(pastedFileLooksLikeImage)

  if (itemFiles.length > 0) {
    return itemFiles
  }

  return Array.from(clipboard.files).filter(pastedFileLooksLikeImage)
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read pasted image."))
        return
      }

      const markerIndex = reader.result.indexOf(",")
      const dataBase64 =
        markerIndex === -1
          ? reader.result
          : reader.result.slice(markerIndex + 1)

      if (!dataBase64) {
        reject(new Error("Pasted image was empty."))
        return
      }

      resolve(dataBase64)
    }

    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read pasted image."))

    reader.readAsDataURL(file)
  })
}

function getStoredAiChatState(windowId: string) {
  const storedWindow = useWorkspaceStore
    .getState()
    .openWindows.find((item) => item.id === windowId)

  return storedWindow ? getAiChatWindowState(storedWindow) : defaultAiChatState
}

function statusDotColor(environment?: DataverseEnvironment) {
  if (!environment) {
    return "bg-muted-foreground"
  }

  switch (environment.authState) {
    case "connected":
      return "bg-emerald-500"
    case "connecting":
      return "bg-sky-500"
    case "error":
    case "expired":
      return "bg-destructive"
    default:
      return "bg-amber-500"
  }
}

function statusLabel(environment?: DataverseEnvironment) {
  if (!environment) {
    return "No environment"
  }

  return environment.authState === "connected"
    ? "Connected"
    : environment.authState
}

export function AiChatModule({ window, mode = "chat" }: AiChatModuleProps) {
  const config = useWorkspaceStore((state) => state.config)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const updateWindowState = useWorkspaceStore(
    (state) => state.updateWindowState,
  )
  const environment =
    getEnvironmentById(config, window.environmentId) ??
    getEnvironmentById(config, config.currentEnvironmentId)
  const aiState = getAiChatWindowState(window)
  const thread = aiState.thread
  const composerValue = aiState.composerValue
  const pendingAttachments = aiState.pendingAttachments
  const running = aiState.running
  const error = aiState.error
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [chatHistory, setChatHistory] = useState<AiChatThreadSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false)
  const [renameTarget, setRenameTarget] =
    useState<AiChatThreadSummary | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const messages = thread?.messages ?? []
  const lastTool = thread?.messages ? getLastTool(thread.messages) : undefined
  const hasPendingAttachments = Boolean(pendingAttachments?.attachments.length)
  const moduleTitle = chatModeLabel(mode)
  const isExperimentalAgent = mode === "experimental-agent"
  const prompts = isExperimentalAgent
    ? experimentalStarterPrompts
    : starterPrompts
  const canSend = Boolean(
    environment && !running && (composerValue.trim() || hasPendingAttachments),
  )
  const providerLocked = messages.length > 0
  const scopedChatHistory = environment
    ? chatHistory
        .filter((summary) => summary.environmentId === environment.id)
        .filter((summary) => (summary.mode ?? "chat") === mode)
    : []

  const persistAiState = useCallback(
    (changes: Partial<AiChatWindowState>) => {
      const current = getStoredAiChatState(window.id)
      updateWindowState(window.id, {
        aiChat: {
          ...current,
          ...changes,
        },
      })
    },
    [updateWindowState, window.id],
  )

  const refreshChatHistory = useCallback(async () => {
    if (!environment) {
      setChatHistory([])
      return
    }

    setHistoryLoading(true)
    try {
      const summaries = await listAiChatThreads(environment.id)
      setChatHistory(summaries)
    } catch (error) {
      const message = formatErrorMessage(error, "Could not load AI chat history")
      setLastMessage(message)
      persistAiState({ error: message })
    } finally {
      setHistoryLoading(false)
    }
  }, [environment, persistAiState, setLastMessage])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    void listenToAiChatEvents((event) => {
      const current = getStoredAiChatState(window.id)
      if (current.thread?.id !== event.threadId) {
        return
      }

      const nextThread: AiChatThread = {
        ...current.thread,
        contextUsage:
          getMessageContextUsage(event.message) ?? current.thread.contextUsage,
        messages: upsertMessage(current.thread.messages, event.message),
        updatedAt: new Date().toISOString(),
      }
      updateWindowState(window.id, {
        aiChat: {
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
  }, [messages.length, running])

  async function setPendingAttachmentPaths(paths: string[]) {
    if (running || paths.length === 0) {
      return
    }

    const current = getStoredAiChatState(window.id)
    const existingPaths =
      current.pendingAttachments?.attachments.map(
        (attachment) => attachment.path,
      ) ?? []
    const nextPaths = Array.from(new Set([...existingPaths, ...paths]))

    try {
      const bundle = await prepareAiChatAttachments(nextPaths)
      persistAiState({
        pendingAttachments: bundle.attachments.length > 0 ? bundle : undefined,
        error: undefined,
      })

      if (bundle.warnings.length > 0) {
        setLastMessage(bundle.warnings[0])
      }
    } catch (error) {
      const message = formatErrorMessage(
        error,
        "Could not prepare attachments",
      )
      setLastMessage(message)
      persistAiState({ error: message })
    }
  }

  async function removePendingAttachment(path: string) {
    if (running) {
      return
    }

    const current = getStoredAiChatState(window.id)
    const remainingPaths =
      current.pendingAttachments?.attachments
        .map((attachment) => attachment.path)
        .filter((attachmentPath) => attachmentPath !== path) ?? []

    if (remainingPaths.length === 0) {
      persistAiState({ pendingAttachments: undefined, error: undefined })
      return
    }

    try {
      const bundle = await prepareAiChatAttachments(remainingPaths)
      persistAiState({
        pendingAttachments: bundle.attachments.length > 0 ? bundle : undefined,
        error: undefined,
      })
    } catch (error) {
      const message = formatErrorMessage(error, "Could not update attachments")
      setLastMessage(message)
      persistAiState({ error: message })
    }
  }

  async function attachImages() {
    const paths = await chooseAiChatImageFiles()
    await setPendingAttachmentPaths(paths)
  }

  async function attachFiles() {
    const paths = await chooseAiChatContextFiles()
    await setPendingAttachmentPaths(paths)
  }

  async function attachFolders() {
    const paths = await chooseAiChatContextFolders()
    await setPendingAttachmentPaths(paths)
  }

  async function attachPastedImages(files: File[]) {
    if (running || files.length === 0) {
      return
    }

    const savedPaths: string[] = []
    const oversized = files.find((file) => file.size > maxPastedImageBytes)

    if (oversized) {
      setLastMessage(
        `${oversized.name || "Pasted image"} is larger than ${Math.round(
          maxPastedImageBytes / 1024 / 1024,
        )} MB.`,
      )
      return
    }

    try {
      for (const file of files) {
        const dataBase64 = await fileToBase64(file)
        const saved = await savePastedAiChatImage({
          name: file.name || undefined,
          mimeType: pastedImageMimeType(file),
          dataBase64,
        })
        savedPaths.push(saved.path)
      }

      await setPendingAttachmentPaths(savedPaths)
    } catch (error) {
      const message = formatErrorMessage(error, "Could not paste image")
      setLastMessage(message)
      persistAiState({ error: message })
    }
  }

  function handleComposerPaste(
    event: ReactClipboardEvent<HTMLTextAreaElement>,
  ) {
    if (!environment || running) {
      return
    }

    const files = imageFilesFromClipboard(event)
    if (files.length === 0) {
      return
    }

    event.preventDefault()
    void attachPastedImages(files)
  }

  async function clearChat() {
    if (running) {
      return
    }

    persistAiState({
      thread: undefined,
      composerValue: "",
      pendingAttachments: undefined,
      running: false,
      error: undefined,
    })
  }

  async function loadSavedChat(summary: AiChatThreadSummary) {
    if (!environment || running || summary.id === thread?.id) {
      return
    }

    persistAiState({ error: undefined })
    try {
      const savedThread = await loadAiChatThread({
        environmentId: environment.id,
        threadId: summary.id,
      })
      persistAiState({
        thread: { ...savedThread, mode },
        provider: savedThread.provider,
        model:
          savedThread.model ?? defaultModelByProvider[savedThread.provider],
        reasoningEffort:
          savedThread.reasoningEffort ??
          defaultReasoningByProvider[savedThread.provider],
        composerValue: "",
        pendingAttachments: undefined,
        running: false,
        error: undefined,
      })
    } catch (error) {
      const message = formatErrorMessage(error, "Could not load AI chat")
      setLastMessage(message)
      persistAiState({ error: message })
    }
  }

  function startRenameChat(summary: AiChatThreadSummary) {
    if (running) {
      return
    }

    setRenameTarget(summary)
    setRenameTitle(summary.title)
  }

  async function submitRenameChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!environment || !renameTarget || running) {
      return
    }

    const title = renameTitle.trim()
    if (!title) {
      const message = "Chat title is required."
      setLastMessage(message)
      persistAiState({ error: message })
      return
    }

    try {
      const updated = await renameAiChatThread({
        environmentId: environment.id,
        threadId: renameTarget.id,
        title,
      })
      setChatHistory((summaries) =>
        summaries.map((summary) =>
          summary.id === updated.id ? updated : summary,
        ),
      )

      const current = getStoredAiChatState(window.id)
      if (current.thread?.id === updated.id) {
        persistAiState({
          thread: {
            ...current.thread,
            title: updated.title,
          },
          error: undefined,
        })
      } else {
        persistAiState({ error: undefined })
      }

      setRenameTarget(null)
      setRenameTitle("")
    } catch (error) {
      const message = formatErrorMessage(error, "Could not rename AI chat")
      setLastMessage(message)
      persistAiState({ error: message })
    }
  }

  async function deleteSavedChat(
    summary: AiChatThreadSummary,
    keepHistoryMenuOpen = false,
  ) {
    if (!environment || running) {
      return
    }

    try {
      await deleteAiChatThread({
        environmentId: environment.id,
        threadId: summary.id,
      })
      setChatHistory((summaries) =>
        summaries.filter((item) => item.id !== summary.id),
      )

      const current = getStoredAiChatState(window.id)
      if (current.thread?.id === summary.id) {
        persistAiState({
          thread: undefined,
          composerValue: "",
          pendingAttachments: undefined,
          running: false,
          error: undefined,
        })
      } else {
        persistAiState({ error: undefined })
      }

      if (keepHistoryMenuOpen) {
        setHistoryMenuOpen(true)
      }
    } catch (error) {
      const message = formatErrorMessage(error, "Could not delete AI chat")
      setLastMessage(message)
      persistAiState({ error: message })
    }
  }

  async function submitMessage(
    event?: FormEvent<HTMLFormElement>,
    value?: string,
  ) {
    event?.preventDefault()

    const current = getStoredAiChatState(window.id)
    const pendingAttachments = current.pendingAttachments
    const message =
      (value ?? composerValue).trim() ||
      (pendingAttachments?.attachments.length
        ? "Use the attached context."
        : "")
    if (!message || !environment || running) {
      return
    }

    let activeThread =
      (current.thread?.mode ?? "chat") === mode ? current.thread : undefined

    if (!activeThread) {
      activeThread = await startAiChatThread({
        environmentId: environment.id,
        mode,
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
    const userMessage = createUserMessage(
      createId("ai-message"),
      message,
      now,
      pendingAttachments,
    )
    const pendingMessages: AiChatMessage[] = [
      ...activeThread.messages,
      userMessage,
    ]

    persistAiState({
      composerValue: "",
      pendingAttachments: undefined,
      running: true,
      error: undefined,
      thread: {
        ...activeThread,
        environmentId: environment.id,
        mode,
        provider: current.provider,
        model: current.model,
        reasoningEffort: current.reasoningEffort,
        title: threadTitle,
        contextUsage: activeThread.contextUsage,
        updatedAt: now,
        messages: pendingMessages,
      },
    })

    try {
      const responseMessages = await sendAiChatMessage({
        threadId: activeThread.id,
        environmentId: environment.id,
        mode,
        message,
        context: pendingAttachments?.context,
        attachments: pendingAttachments?.attachments,
        imagePaths: pendingAttachments?.imagePaths,
        provider: current.provider,
        model: current.model,
        reasoningEffort: current.reasoningEffort,
        providerThreadId:
          activeThread.providerThreadId ?? activeThread.codexThreadId,
        codexThreadId: activeThread.codexThreadId,
      })
      const providerThreadId = getProviderThreadIdFromMessages(responseMessages)
      const contextUsage =
        getContextUsageFromMessages(responseMessages) ?? activeThread.contextUsage

      persistAiState({
        running: false,
        error: undefined,
        thread: {
          ...activeThread,
          environmentId: environment.id,
          mode,
          provider: current.provider,
          providerThreadId:
            providerThreadId ??
            activeThread.providerThreadId ??
            activeThread.codexThreadId,
          codexThreadId:
            current.provider === "codex"
              ? (providerThreadId ?? activeThread.codexThreadId)
              : activeThread.codexThreadId,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
          title: threadTitle,
          contextUsage,
          updatedAt: new Date().toISOString(),
          messages: responseMessages,
        },
      })
      void refreshChatHistory()
    } catch (error) {
      const messageText = formatErrorMessage(error, "AI chat turn failed")
      setLastMessage(messageText)
      persistAiState({
        running: false,
        error: messageText,
        thread: {
          ...activeThread,
          environmentId: environment.id,
          mode,
          provider: current.provider,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
          title: threadTitle,
          contextUsage: activeThread.contextUsage,
          updatedAt: new Date().toISOString(),
          messages: [
            ...activeThread.messages,
            userMessage,
            {
              id: createId("ai-message"),
              role: "assistant",
              content: messageText,
              createdAt: new Date().toISOString(),
              status: "error",
            },
          ],
        },
      })
      void refreshChatHistory()
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
    const current = getStoredAiChatState(window.id)
    persistAiState({
      model,
      thread: current.thread
        ? { ...current.thread, provider: current.provider, model }
        : undefined,
    })
  }

  function updateReasoningEffort(reasoningEffort: AiReasoningEffort) {
    const current = getStoredAiChatState(window.id)
    persistAiState({
      reasoningEffort,
      thread: current.thread
        ? { ...current.thread, provider: current.provider, reasoningEffort }
        : undefined,
    })
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-l bg-background">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
            <BotMessageSquare className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-medium">{moduleTitle}</h2>
              {environment && (
                <Badge variant="outline" className="text-xs font-normal">
                  {environment.name}
                </Badge>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    statusDotColor(environment),
                  )}
                  aria-hidden="true"
                />
                <span className="capitalize">{statusLabel(environment)}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {environment?.url ?? "Select environment"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu
            open={historyMenuOpen}
            onOpenChange={(open) => {
              setHistoryMenuOpen(open)
              if (open) {
                void refreshChatHistory()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Chat history"
                disabled={!environment || running}
              >
                {historyLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <History />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Saved Chats</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {scopedChatHistory.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  <MessageSquareText className="mx-auto mb-2 size-5 text-muted-foreground/60" />
                  No saved chats yet
                </div>
              ) : (
                scopedChatHistory.map((summary) => (
                  <ContextMenu key={summary.id}>
                    <ContextMenuTrigger asChild>
                      <DropdownMenuItem
                        className="group/chat-history-row items-start rounded-md pr-1"
                        onSelect={(event) => {
                          const target = event.target as HTMLElement
                          if (target.closest("[data-chat-history-delete]")) {
                            event.preventDefault()
                            return
                          }

                          void loadSavedChat(summary)
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {summary.title}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground">
                            <span className="capitalize">
                              {summary.provider}
                            </span>
                            <span>{summary.messageCount} messages</span>
                            <span>{formatChatTimestamp(summary.updatedAt)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          data-chat-history-delete
                          className="ml-2 flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 outline-none transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover/chat-history-row:opacity-100"
                          aria-label={`Delete ${summary.title}`}
                          disabled={running}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void deleteSavedChat(summary, true)
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </DropdownMenuItem>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-40">
                      <ContextMenuItem
                        onSelect={() => startRenameChat(summary)}
                        disabled={running}
                      >
                        Rename
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => void deleteSavedChat(summary)}
                        disabled={running}
                      >
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog
            open={Boolean(renameTarget)}
            onOpenChange={(open) => {
              if (!open) {
                setRenameTarget(null)
                setRenameTitle("")
              }
            }}
          >
            <DialogContent>
              <form className="space-y-4" onSubmit={submitRenameChat}>
                <DialogHeader>
                  <DialogTitle>Rename Chat</DialogTitle>
                </DialogHeader>
                <Input
                  autoFocus
                  value={renameTitle}
                  maxLength={123}
                  onChange={(event) => setRenameTitle(event.target.value)}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRenameTarget(null)
                      setRenameTitle("")
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={running || renameTitle.trim().length === 0}
                  >
                    Rename
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="New chat"
            onClick={() => void clearChat()}
            disabled={messages.length === 0 || running}
          >
            <MessageSquarePlus />
          </Button>
        </div>
      </header>

      {isExperimentalAgent && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5" />
          <span>
            Unsafe module. It can make Dataverse changes, and serious harm could
            come to an environment.
          </span>
        </div>
      )}

      <div className="flex min-h-10 items-center gap-3 overflow-x-auto border-b px-4 py-2 text-xs">
        <div className="flex shrink-0 items-center gap-2">
          {running && (
            <Badge variant="outline" className="gap-1.5 font-normal">
              <Loader2 className="size-3 animate-spin" />
              Running
            </Badge>
          )}
          {lastTool && (
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <Wrench className="size-3" />
              {lastTool.toolName ?? "tool"}
            </Badge>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ContextUsageIndicator usage={thread?.contextUsage} running={running} />
          <Select
            value={aiState.provider}
            onValueChange={(value) => updateProvider(value as AiChatProvider)}
            disabled={running || providerLocked}
          >
            <SelectTrigger className="w-32 bg-background" size="sm">
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
            <SelectTrigger className="w-48 bg-background" size="sm">
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
            <SelectTrigger className="w-36 bg-background" size="sm">
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="min-h-[4.5rem] rounded-lg border bg-muted/30 px-4 py-3 text-left text-sm leading-relaxed transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => void submitMessage(undefined, prompt)}
                  disabled={!environment || running}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form className="border-t bg-background p-3" onSubmit={submitMessage}>
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {pendingAttachments?.attachments.length ? (
            <AttachmentList
              attachments={pendingAttachments.attachments}
              disabled={running}
              onRemove={(path) => void removePendingAttachment(path)}
            />
          ) : null}
          <div className="flex items-end gap-2">
            <div className="flex shrink-0 items-center gap-1 pb-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-md"
                aria-label="Attach image"
                title="Attach image"
                disabled={!environment || running}
                onClick={() => void attachImages()}
              >
                <ImagePlus />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-md"
                aria-label="Attach file"
                title="Attach file"
                disabled={!environment || running}
                onClick={() => void attachFiles()}
              >
                <Paperclip />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-md"
                aria-label="Attach folder"
                title="Attach folder"
                disabled={!environment || running}
                onClick={() => void attachFolders()}
              >
                <FolderOpen />
              </Button>
            </div>
            <div className="relative flex-1">
              <textarea
                className="min-h-[4.5rem] w-full resize-none rounded-xl border bg-background px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                value={composerValue}
                onChange={(event) =>
                  persistAiState({ composerValue: event.target.value })
                }
                onPaste={handleComposerPaste}
                placeholder={
                  environment
                    ? isExperimentalAgent
                      ? "Ask the agent to inspect or change Dataverse"
                      : "Ask about Dataverse"
                    : "Select environment"
                }
                disabled={!environment || running}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void submitMessage()
                  }
                }}
              />
            </div>
            <Button
              type="submit"
              size="icon-lg"
              className="rounded-full"
              aria-label="Send"
              disabled={!canSend}
            >
              {running ? (
                <Loader2 className="animate-spin" />
              ) : (
                <SendHorizontal />
              )}
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground/70">
            Shift + Enter for a new line
          </p>
        </div>
      </form>
    </section>
  )
}
