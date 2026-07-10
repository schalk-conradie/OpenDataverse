import type { ReactElement } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  BotMessageSquare,
  FileText,
  FolderOpen,
  ImagePlus,
  Loader2,
  Wrench,
  X,
} from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { isTauriRuntime } from "@/core/desktop/runtime"
import { cn } from "@/lib/utils"
import {
  attachmentTitle,
  contextUsageTitle,
  contextUsageTone,
  formatAttachmentSize,
  formatMessageTime,
  formatTokenCount,
  getMessageAttachments,
} from "@/modules/ai-chat/chat-domain"
import type {
  AiChatAttachment,
  AiChatContextUsage,
  AiChatMessage,
} from "@/modules/ai-chat/types"

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
      <blockquote className="my-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
        {children}
      </blockquote>
    )
  },
  code({ children, className }) {
    return (
      <code
        className={cn(
          "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.86em] tracking-normal",
          className,
        )}
      >
        {children}
      </code>
    )
  },
  h1({ children }) {
    return <h3 className="mb-2 mt-4 text-base font-semibold leading-tight">{children}</h3>
  },
  h2({ children }) {
    return <h3 className="mb-2 mt-4 text-sm font-semibold leading-tight">{children}</h3>
  },
  h3({ children }) {
    return <h4 className="mb-1.5 mt-3 text-sm font-semibold leading-tight">{children}</h4>
  },
  h4({ children }) {
    return <h5 className="mb-1.5 mt-2.5 text-sm font-medium leading-tight">{children}</h5>
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
    return <p className="mb-2.5 last:mb-0">{children}</p>
  },
  pre({ children }) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs leading-5 [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    )
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border">
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
    return <td className="border border-border px-2.5 py-1.5">{children}</td>
  },
  th({ children }) {
    return (
      <th className="border border-border bg-muted/70 px-2.5 py-1.5 font-medium">
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

export function ContextUsageIndicator({
  usage,
  running,
}: {
  usage?: AiChatContextUsage
  running: boolean
}): ReactElement {
  const tone = contextUsageTone(usage)
  const percent =
    usage?.percentFull === undefined
      ? undefined
      : Math.max(0, Math.min(100, usage.percentFull))
  const label = usage
    ? percent === undefined
      ? "Context"
      : `${Math.round(percent)}% context`
    : "Context pending"
  const tokenLabel = usage
    ? usage.contextWindowTokens
      ? `${formatTokenCount(usage.usedTokens)} / ${formatTokenCount(
          usage.contextWindowTokens,
        )}`
      : `${formatTokenCount(usage.usedTokens)} tokens`
    : "After first reply"

  return (
    <div
      className={cn(
        "flex min-w-44 shrink-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs",
        tone === "ok" &&
          "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100",
        tone === "warning" &&
          "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100",
        tone === "critical" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "neutral" && "text-muted-foreground",
      )}
      title={contextUsageTitle(usage)}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "ok" && "bg-emerald-500",
          tone === "warning" && "bg-amber-500",
          tone === "critical" && "bg-destructive",
          tone === "neutral" && "bg-muted-foreground",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-foreground">{label}</span>
          <span className="shrink-0 font-mono tracking-normal">
            {tokenLabel}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-200",
              tone === "ok" && "bg-emerald-500",
              tone === "warning" && "bg-amber-500",
              tone === "critical" && "bg-destructive",
              tone === "neutral" && "bg-muted-foreground/40",
            )}
            style={{ width: `${percent ?? (running ? 35 : 0)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function attachmentIcon(attachment: AiChatAttachment): ReactElement {
  if (attachment.kind === "image") {
    return <ImagePlus className="size-3.5" />
  }

  if (attachment.kind === "folder") {
    return <FolderOpen className="size-3.5" />
  }

  return <FileText className="size-3.5" />
}

function attachmentPreviewSrc(attachment: AiChatAttachment): string | undefined {
  if (attachment.kind !== "image" || !isTauriRuntime()) {
    return undefined
  }

  return convertFileSrc(attachment.path)
}

export function AttachmentList({
  attachments,
  disabled,
  onRemove,
}: {
  attachments: AiChatAttachment[]
  disabled?: boolean
  onRemove?: (path: string) => void
}): ReactElement | null {
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
              "group flex max-w-72 items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5 text-xs",
              attachment.status === "skipped" &&
                "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
            )}
            title={attachmentTitle(attachment)}
          >
            {previewSrc ? (
              <img
                alt=""
                className="size-9 shrink-0 rounded-md border object-cover"
                src={previewSrc}
              />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                {attachmentIcon(attachment)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {attachment.name}
              </span>
              <span className="block truncate text-muted-foreground">
                {detail ?? attachment.status}
              </span>
            </span>
            {onRemove && (
              <button
                type="button"
                className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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

function MarkdownMessage({ content }: { content: string }): ReactElement {
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

export function MessageBubble({
  message,
}: {
  message: AiChatMessage
}): ReactElement {
  if (message.role === "tool") {
    const statusLabel =
      message.status === "streaming"
        ? "running"
        : message.status === "error"
          ? "failed"
          : "used"

    return (
      <div className="flex justify-center py-1">
        <div className="flex max-w-[85%] items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
          {message.status === "streaming" && (
            <Loader2 className="size-3 animate-spin" />
          )}
          <Wrench className="size-3" />
          <span className="font-medium text-foreground">
            {message.toolName ?? "tool"}
          </span>
          <span className="mx-0.5">{statusLabel}</span>
          <span className="truncate font-mono tracking-normal">
            {message.content}
          </span>
        </div>
      </div>
    )
  }

  const fromUser = message.role === "user"
  const attachments = getMessageAttachments(message)

  return (
    <div
      className={cn(
        "flex gap-3",
        fromUser ? "flex-row-reverse justify-start" : "justify-start",
      )}
    >
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border",
          fromUser
            ? "border-primary/20 bg-primary text-primary-foreground"
            : "border-border bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {fromUser ? (
          <span className="text-[10px] font-semibold">You</span>
        ) : (
          <BotMessageSquare className="size-3.5" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[min(680px,80%)] rounded-2xl border px-4 py-3 shadow-sm",
          fromUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-background text-foreground",
          message.status === "error" &&
            "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        {fromUser ? (
          <div className="space-y-2">
            {attachments.length > 0 && (
              <AttachmentList attachments={attachments} />
            )}
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
