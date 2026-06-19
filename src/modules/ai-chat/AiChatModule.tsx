import { useCallback, useEffect, useRef, useState } from "react"
import type { ClipboardEvent as ReactClipboardEvent, FormEvent } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  BotMessageSquare,
  Brain,
  Circle,
  Cpu,
  FileText,
  FolderOpen,
  History,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  SendHorizontal,
  X,
} from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  listAiChatThreads,
  loadAiChatThread,
  listenToAiChatEvents,
  prepareAiChatAttachments,
  savePastedAiChatImage,
  startAiChatThread,
  sendAiChatMessage,
} from "@/core/desktop/ai-bridge"
import {
  chooseAiChatContextFiles,
  chooseAiChatContextFolders,
  chooseAiChatImageFiles,
} from "@/core/desktop/file-dialog"
import { isTauriRuntime } from "@/core/desktop/bridge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import type {
  AiChatAttachment,
  AiChatAttachmentBundle,
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
  isAiChatModel,
  isAiChatProvider,
  isAiReasoningEffort,
  modelOptionsByProvider,
  providerOptions,
  reasoningOptionsByProvider,
} from "@/modules/ai-chat/options"
import { useWorkspaceStore } from "@/store/workspace-store"

type AiChatModuleProps = {
  window: ToolWindow
}

const starterPrompts = [
  "Who am I connected as?",
  "List entity sets related to account.",
  "Show account metadata for the primary name and created fields.",
  "Get the first 5 accounts with name and accountid.",
]

const maxPastedImageBytes = 15_000_000

const markdownAllowedElements = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]

const markdownComponents: Components = {
  a({ children, href, title }) {
    return (
      <a
        className="font-medium text-primary underline underline-offset-2"
        href={href}
        rel="noreferrer"
        target="_blank"
        title={title}
      >
        {children}
      </a>
    )
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground">
        {children}
      </blockquote>
    )
  },
  code({ children, className }) {
    return (
      <code
        className={cn(
          "rounded bg-muted px-1 py-0.5 font-mono text-[0.86em] tracking-normal",
          className,
        )}
      >
        {children}
      </code>
    )
  },
  h1({ children }) {
    return <h3 className="mb-2 mt-3 text-base font-semibold">{children}</h3>
  },
  h2({ children }) {
    return <h3 className="mb-2 mt-3 text-sm font-semibold">{children}</h3>
  },
  h3({ children }) {
    return <h4 className="mb-1.5 mt-2.5 text-sm font-semibold">{children}</h4>
  },
  h4({ children }) {
    return <h5 className="mb-1.5 mt-2 text-sm font-medium">{children}</h5>
  },
  h5({ children }) {
    return <h5 className="mb-1 mt-2 text-xs font-medium">{children}</h5>
  },
  h6({ children }) {
    return (
      <h6 className="mb-1 mt-2 text-xs font-medium text-muted-foreground">
        {children}
      </h6>
    )
  },
  hr() {
    return <hr className="my-3 border-border" />
  },
  input({ checked, type }) {
    if (type !== "checkbox") {
      return null
    }

    return (
      <input
        checked={Boolean(checked)}
        className="mr-2 align-middle accent-primary"
        disabled
        readOnly
        type="checkbox"
      />
    )
  },
  li({ children }) {
    return <li className="pl-1">{children}</li>
  },
  ol({ children }) {
    return <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>
  },
  pre({ children }) {
    return (
      <pre className="my-3 overflow-x-auto border bg-muted/50 p-3 text-xs leading-5 [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    )
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          {children}
        </table>
      </div>
    )
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-border">{children}</tbody>
  },
  td({ children }) {
    return <td className="border border-border px-2 py-1.5">{children}</td>
  },
  th({ children }) {
    return (
      <th className="border border-border bg-muted/70 px-2 py-1.5 font-medium">
        {children}
      </th>
    )
  },
  thead({ children }) {
    return <thead>{children}</thead>
  },
  tr({ children }) {
    return <tr>{children}</tr>
  },
  ul({ children }) {
    return <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>
  },
}

const defaultAiChatState: AiChatWindowState = {
  provider: "codex",
  model: defaultModelByProvider.codex,
  reasoningEffort: defaultReasoningByProvider.codex,
  composerValue: "",
  pendingAttachments: undefined,
  running: false,
  settingsVersion: 5,
}

function pastedFileLooksLikeImage(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp)$/i.test(file.name)
  )
}

function pastedImageMimeType(file: File) {
  if (file.type.startsWith("image/")) {
    return file.type
  }

  if (/\.jpe?g$/i.test(file.name)) {
    return "image/jpeg"
  }

  if (/\.gif$/i.test(file.name)) {
    return "image/gif"
  }

  if (/\.webp$/i.test(file.name)) {
    return "image/webp"
  }

  return "image/png"
}

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

function getAiChatWindowState(window: ToolWindow): AiChatWindowState {
  const candidate = window.state?.aiChat as Partial<AiChatWindowState> | undefined
  const threadProvider = isAiChatProvider(candidate?.thread?.provider)
    ? candidate.thread.provider
    : undefined
  const provider =
    candidate?.thread?.messages?.length && threadProvider
      ? threadProvider
      : isAiChatProvider(candidate?.provider)
        ? candidate.provider
        : threadProvider ?? defaultAiChatState.provider
  const legacyDefaultModel =
    (candidate?.settingsVersion === undefined && candidate?.model === "gpt-5.5") ||
    (provider === "codex" &&
      (candidate?.settingsVersion ?? 0) < 5 &&
      candidate?.model === "gpt-5.4-mini")
  const model =
    isAiChatModel(provider, candidate?.model) && !legacyDefaultModel
      ? candidate.model
      : candidate?.thread?.model &&
          isAiChatModel(provider, candidate.thread.model)
        ? candidate.thread.model
        : defaultModelByProvider[provider]
  const legacyDefaultReasoning =
    candidate?.settingsVersion === undefined &&
    (candidate?.reasoningEffort === "xhigh" ||
      candidate?.reasoningEffort === "low")
  const reasoningEffort =
    isAiReasoningEffort(provider, candidate?.reasoningEffort) &&
    !legacyDefaultReasoning
      ? candidate.reasoningEffort
      : candidate?.thread?.reasoningEffort &&
          isAiReasoningEffort(provider, candidate.thread.reasoningEffort)
        ? candidate.thread.reasoningEffort
        : defaultReasoningByProvider[provider]
  const thread = candidate?.thread
    ? {
        ...candidate.thread,
        provider: isAiChatProvider(candidate.thread.provider)
          ? candidate.thread.provider
          : provider,
        providerThreadId:
          candidate.thread.providerThreadId ?? candidate.thread.codexThreadId,
        model,
        reasoningEffort,
      }
    : undefined

  return {
    ...defaultAiChatState,
    ...candidate,
    thread,
    provider,
    model,
    reasoningEffort,
    composerValue:
      typeof candidate?.composerValue === "string"
        ? candidate.composerValue
        : defaultAiChatState.composerValue,
    running: Boolean(candidate?.running),
  }
}

function getStoredAiChatState(windowId: string) {
  const storedWindow = useWorkspaceStore
    .getState()
    .openWindows.find((item) => item.id === windowId)

  return storedWindow
    ? getAiChatWindowState(storedWindow)
    : defaultAiChatState
}

function upsertMessage(messages: AiChatMessage[], message: AiChatMessage) {
  const index = messages.findIndex((item) => item.id === message.id)

  if (index === -1) {
    return [...messages, message]
  }

  return messages.map((item, itemIndex) =>
    itemIndex === index ? message : item,
  )
}

function authBadgeClass(environment?: DataverseEnvironment) {
  if (!environment) {
    return "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
  }

  if (environment.authState === "connected") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
  }

  if (environment.authState === "connecting") {
    return "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
  }

  if (environment.authState === "error" || environment.authState === "expired") {
    return "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200"
  }

  return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
}

function statusLabel(environment?: DataverseEnvironment) {
  if (!environment) {
    return "No environment"
  }

  return environment.authState === "connected" ? "Connected" : environment.authState
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function getLastTool(messages: AiChatMessage[]) {
  return messages.findLast((message) => message.role === "tool")
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
    return "Dataverse Chat"
  }

  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized
}

function isAiChatAttachment(value: unknown): value is AiChatAttachment {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<AiChatAttachment>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.name === "string" &&
    (candidate.kind === "image" ||
      candidate.kind === "file" ||
      candidate.kind === "folder")
  )
}

function getMessageAttachments(message: AiChatMessage) {
  const attachments = message.metadata?.attachments
  return Array.isArray(attachments)
    ? attachments.filter(isAiChatAttachment)
    : []
}

function createUserMessage(
  content: string,
  createdAt: string,
  pendingAttachments?: AiChatAttachmentBundle,
): AiChatMessage {
  const attachments = pendingAttachments?.attachments ?? []

  return {
    id: createId("ai-message"),
    role: "user",
    content,
    createdAt,
    status: "complete",
    metadata:
      attachments.length > 0
        ? {
            attachments,
            attachmentContextChars: pendingAttachments?.context.length ?? 0,
            imagePathCount: pendingAttachments?.imagePaths.length ?? 0,
          }
        : undefined,
  }
}

function formatAttachmentSize(value?: number) {
  if (typeof value !== "number") {
    return undefined
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function attachmentIcon(attachment: AiChatAttachment) {
  if (attachment.kind === "image") {
    return <ImagePlus className="size-3.5" />
  }

  if (attachment.kind === "folder") {
    return <FolderOpen className="size-3.5" />
  }

  return <FileText className="size-3.5" />
}

function attachmentPreviewSrc(attachment: AiChatAttachment) {
  if (attachment.kind !== "image" || !isTauriRuntime()) {
    return undefined
  }

  return convertFileSrc(attachment.path)
}

function attachmentTitle(attachment: AiChatAttachment) {
  return [
    attachment.path,
    attachment.mimeType,
    formatAttachmentSize(attachment.sizeBytes),
    attachment.reason,
  ]
    .filter(Boolean)
    .join("\n")
}

function AttachmentList({
  attachments,
  disabled,
  onRemove,
}: {
  attachments: AiChatAttachment[]
  disabled?: boolean
  onRemove?: (path: string) => void
}) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => {
        const previewSrc = attachmentPreviewSrc(attachment)
        const detail = attachment.itemCount
          ? `${attachment.itemCount} files`
          : formatAttachmentSize(attachment.sizeBytes)

        return (
          <div
            key={attachment.id}
            className={cn(
              "group flex max-w-72 items-center gap-2 border bg-muted/40 px-2 py-1 text-xs",
              attachment.status === "skipped" &&
                "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
            )}
            title={attachmentTitle(attachment)}
          >
            {previewSrc ? (
              <img
                alt=""
                className="size-9 shrink-0 border object-cover"
                src={previewSrc}
              />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center border bg-background text-muted-foreground">
                {attachmentIcon(attachment)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{attachment.name}</span>
              <span className="block truncate text-muted-foreground">
                {detail ?? attachment.status}
              </span>
            </span>
            {onRemove && (
              <button
                type="button"
                className="ml-auto flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label={`Remove ${attachment.name}`}
                title={`Remove ${attachment.name}`}
                onClick={() => onRemove(attachment.path)}
                disabled={disabled}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatChatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="break-words text-sm leading-6">
      <ReactMarkdown
        allowedElements={markdownAllowedElements}
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
        skipHtml
        unwrapDisallowed
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function MessageBubble({ message }: { message: AiChatMessage }) {
  if (message.role === "tool") {
    const statusLabel =
      message.status === "streaming"
        ? "running"
        : message.status === "error"
          ? "failed"
          : "used"

    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
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
  const attachments = getMessageAttachments(message)

  return (
    <div className={cn("flex", fromUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(760px,82%)] border px-3 py-2",
          fromUser
            ? "bg-primary text-primary-foreground"
            : "bg-background text-foreground",
          message.status === "error" &&
            "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        {fromUser ? (
          <div className="space-y-2">
            {attachments.length > 0 && <AttachmentList attachments={attachments} />}
            <div className="whitespace-pre-wrap break-words text-sm leading-6">
              {message.content}
            </div>
          </div>
        ) : (
          <MarkdownMessage content={message.content} />
        )}
        <div
          className={cn(
            "mt-2 text-[11px]",
            fromUser ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {formatMessageTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}

export function AiChatModule({ window }: AiChatModuleProps) {
  const config = useWorkspaceStore((state) => state.config)
  const setLastMessage = useWorkspaceStore((state) => state.setLastMessage)
  const updateWindowState = useWorkspaceStore((state) => state.updateWindowState)
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
  const messages = thread?.messages ?? []
  const lastTool = thread?.messages ? getLastTool(thread.messages) : undefined
  const hasPendingAttachments = Boolean(pendingAttachments?.attachments.length)
  const canSend = Boolean(
    environment && !running && (composerValue.trim() || hasPendingAttachments),
  )
  const providerLocked = messages.length > 0
  const scopedChatHistory = environment
    ? chatHistory.filter((summary) => summary.environmentId === environment.id)
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
      const message =
        error instanceof Error ? error.message : "Could not load AI chat history"
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
      current.pendingAttachments?.attachments.map((attachment) => attachment.path) ??
      []
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
      const message =
        error instanceof Error ? error.message : "Could not prepare attachments"
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
      const message =
        error instanceof Error ? error.message : "Could not update attachments"
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
      const message =
        error instanceof Error ? error.message : "Could not paste image"
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
    if (!environment || running) {
      return
    }

    persistAiState({ error: undefined })
    try {
      const savedThread = await loadAiChatThread({
        environmentId: environment.id,
        threadId: summary.id,
      })
      persistAiState({
        thread: savedThread,
        provider: savedThread.provider,
        model: savedThread.model ?? defaultModelByProvider[savedThread.provider],
        reasoningEffort:
          savedThread.reasoningEffort ??
          defaultReasoningByProvider[savedThread.provider],
        composerValue: "",
        pendingAttachments: undefined,
        running: false,
        error: undefined,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load AI chat"
      setLastMessage(message)
      persistAiState({ error: message })
    }
  }

  async function submitMessage(event?: FormEvent<HTMLFormElement>, value?: string) {
    event?.preventDefault()

    const current = getStoredAiChatState(window.id)
    const pendingAttachments = current.pendingAttachments
    const message =
      (value ?? composerValue).trim() ||
      (pendingAttachments?.attachments.length ? "Use the attached context." : "")
    if (!message || !environment || running) {
      return
    }

    let activeThread = current.thread

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
    const userMessage = createUserMessage(message, now, pendingAttachments)
    const pendingMessages: AiChatMessage[] = [...activeThread.messages, userMessage]

    persistAiState({
      composerValue: "",
      pendingAttachments: undefined,
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

    try {
      const responseMessages = await sendAiChatMessage({
        threadId: activeThread.id,
        environmentId: environment.id,
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
      void refreshChatHistory()
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "AI chat turn failed"
      setLastMessage(messageText)
      persistAiState({
        running: false,
        error: messageText,
        thread: {
          ...activeThread,
          environmentId: environment.id,
          provider: current.provider,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
          title: threadTitle,
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
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-medium">AI Chat</h2>
            {environment && <Badge variant="outline">{environment.name}</Badge>}
            <Badge
              className={cn("capitalize", authBadgeClass(environment))}
              variant="outline"
            >
              {statusLabel(environment)}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {environment?.url ?? "Select environment"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu onOpenChange={(open) => open && void refreshChatHistory()}>
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
                <DropdownMenuItem disabled>No saved chats</DropdownMenuItem>
              ) : (
                scopedChatHistory.map((summary) => (
                  <DropdownMenuItem
                    key={summary.id}
                    className="items-start"
                    onSelect={() => void loadSavedChat(summary)}
                    disabled={summary.id === thread?.id}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{summary.title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground">
                        <span className="capitalize">{summary.provider}</span>
                        <span>{summary.messageCount} messages</span>
                        <span>{formatChatTimestamp(summary.updatedAt)}</span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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

      <div className="flex min-h-10 items-center gap-2 overflow-x-auto border-b px-4 py-2 text-xs">
        <Badge className={authBadgeClass(environment)} variant="outline">
          <Circle className="size-2 fill-current" />
          {statusLabel(environment)}
        </Badge>
        {running && (
          <Badge variant="outline">
            <Loader2 className="animate-spin" />
            Running
          </Badge>
        )}
        {lastTool && (
          <Badge variant="secondary">
            <BotMessageSquare />
            {lastTool.toolName ?? "tool"}
          </Badge>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          {messages.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="min-h-14 border bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
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
            <div className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form className="border-t p-3" onSubmit={submitMessage}>
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
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
                aria-label="Attach folder"
                title="Attach folder"
                disabled={!environment || running}
                onClick={() => void attachFolders()}
              >
                <FolderOpen />
              </Button>
            </div>
            <textarea
              className="min-h-16 flex-1 resize-none border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              value={composerValue}
              onChange={(event) =>
                persistAiState({ composerValue: event.target.value })
              }
              onPaste={handleComposerPaste}
              placeholder={
                environment ? "Ask about Dataverse" : "Select environment"
              }
              disabled={!environment || running}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void submitMessage()
                }
              }}
            />
            <Button
              type="submit"
              size="icon-lg"
              aria-label="Send"
              disabled={!canSend}
            >
              {running ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
