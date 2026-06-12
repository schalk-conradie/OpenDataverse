import { useCallback, useEffect, useRef, type FormEvent } from "react"
import {
  BotMessageSquare,
  Brain,
  Circle,
  Cpu,
  Loader2,
  SendHorizontal,
  Trash2,
} from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  listenToAiChatEvents,
  startAiChatThread,
  sendAiChatMessage,
} from "@/core/desktop/ai-bridge"
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
  AiChatMessage,
  AiChatModel,
  AiChatThread,
  AiChatWindowState,
  AiReasoningEffort,
} from "@/modules/ai-chat/types"
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

const modelOptions: Array<{ value: AiChatModel; label: string }> = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
  { value: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
]

const reasoningOptions: Array<{ value: AiReasoningEffort; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
]

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
  model: "gpt-5.4-mini",
  reasoningEffort: "medium",
  composerValue: "",
  running: false,
  settingsVersion: 3,
}

function isAiChatModel(value: unknown): value is AiChatModel {
  return modelOptions.some((option) => option.value === value)
}

function isAiReasoningEffort(value: unknown): value is AiReasoningEffort {
  return reasoningOptions.some((option) => option.value === value)
}

function getAiChatWindowState(window: ToolWindow): AiChatWindowState {
  const candidate = window.state?.aiChat as Partial<AiChatWindowState> | undefined
  const legacyDefaultModel =
    candidate?.settingsVersion === undefined && candidate?.model === "gpt-5.5"
  const model =
    isAiChatModel(candidate?.model) && !legacyDefaultModel
      ? candidate.model
    : defaultAiChatState.model
  const legacyDefaultReasoning =
    candidate?.settingsVersion === undefined &&
    (candidate?.reasoningEffort === "xhigh" ||
      candidate?.reasoningEffort === "low")
  const reasoningEffort =
    isAiReasoningEffort(candidate?.reasoningEffort) && !legacyDefaultReasoning
      ? candidate.reasoningEffort
    : defaultAiChatState.reasoningEffort

  return {
    ...defaultAiChatState,
    ...candidate,
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
          <div className="whitespace-pre-wrap break-words text-sm leading-6">
            {message.content}
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
  const running = aiState.running
  const error = aiState.error
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messages = thread?.messages ?? []
  const lastTool = thread?.messages ? getLastTool(thread.messages) : undefined
  const canSend = Boolean(environment && composerValue.trim() && !running)

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

  useEffect(() => {
    let cancelled = false

    async function createThread() {
      const current = getStoredAiChatState(window.id)
      if (current.thread) {
        return
      }

      persistAiState({ error: undefined })
      try {
        const nextThread = await startAiChatThread({
          environmentId: environment?.id,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
        })
        if (!cancelled) {
          persistAiState({ thread: nextThread })
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : "Could not start AI chat"
        persistAiState({ error: message })
        setLastMessage(message)
      }
    }

    void createThread()

    return () => {
      cancelled = true
    }
  }, [environment?.id, persistAiState, setLastMessage, window.id])

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

  async function clearChat() {
    if (running) {
      return
    }

    persistAiState({ running: true, error: undefined })
    try {
      const nextThread = await startAiChatThread({
        environmentId: environment?.id,
        model: aiState.model,
        reasoningEffort: aiState.reasoningEffort,
      })
      persistAiState({
        thread: nextThread,
        composerValue: "",
        running: false,
        error: undefined,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not clear AI chat"
      persistAiState({ running: false, error: message })
      setLastMessage(message)
    }
  }

  async function submitMessage(event?: FormEvent<HTMLFormElement>, value?: string) {
    event?.preventDefault()

    const message = (value ?? composerValue).trim()
    if (!message || !environment || running) {
      return
    }

    const current = getStoredAiChatState(window.id)
    let activeThread = current.thread

    if (!activeThread) {
      activeThread = await startAiChatThread({
        environmentId: environment.id,
        model: current.model,
        reasoningEffort: current.reasoningEffort,
      })
    }

    const now = new Date().toISOString()
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
        model: current.model,
        reasoningEffort: current.reasoningEffort,
      updatedAt: now,
      messages: pendingMessages,
      },
    })

    try {
      const responseMessages = await sendAiChatMessage({
        threadId: activeThread.id,
        environmentId: environment.id,
        message,
        model: current.model,
        reasoningEffort: current.reasoningEffort,
      })

      persistAiState({
        running: false,
        error: undefined,
        thread: {
        ...activeThread,
        environmentId: environment.id,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
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
        thread: {
        ...activeThread,
        environmentId: environment.id,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
        updatedAt: new Date().toISOString(),
        messages: [
          ...activeThread.messages,
          {
            id: createId("ai-message"),
            role: "user",
            content: message,
            createdAt: now,
            status: "complete",
          },
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
    }
  }

  function updateModel(model: AiChatModel) {
    const current = getStoredAiChatState(window.id)
    persistAiState({
      model,
      thread: current.thread ? { ...current.thread, model } : undefined,
    })
  }

  function updateReasoningEffort(reasoningEffort: AiReasoningEffort) {
    const current = getStoredAiChatState(window.id)
    persistAiState({
      reasoningEffort,
      thread: current.thread
        ? { ...current.thread, reasoningEffort }
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
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Clear chat"
          onClick={() => void clearChat()}
          disabled={messages.length === 0 || running}
        >
          <Trash2 />
        </Button>
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
            value={aiState.model}
            onValueChange={(value) => updateModel(value as AiChatModel)}
            disabled={running}
          >
            <SelectTrigger className="w-44 bg-background" size="sm">
              <Cpu className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
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
              {reasoningOptions.map((option) => (
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
        <div className="mx-auto flex max-w-5xl items-end gap-2">
          <textarea
            className="min-h-16 flex-1 resize-none border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
            value={composerValue}
            onChange={(event) =>
              persistAiState({ composerValue: event.target.value })
            }
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
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={!canSend}>
            {running ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
      </form>
    </section>
  )
}
