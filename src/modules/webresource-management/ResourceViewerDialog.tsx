import { useState } from "react"
import Editor from "@monaco-editor/react"
import {
  Copy,
  ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Upload,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { WebResource, WebResourceContent } from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import { cn } from "@/lib/utils"
import {
  configureWebResourceIntellisense,
  editorLanguageForWebResource,
  editorPathForWebResource,
} from "./intellisense"
import { webResourceTypeLabel } from "./resource-presentation"

export type ResourceContentSaveAction = "save" | "publish"

type ResourceDraftState = {
  resourceId: string
  content: string
}

type ResourceActionError = {
  resourceId: string
  message: string
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

export function ResourceViewerDialog({
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
  const contentEncoding = content?.contentEncoding ?? "text"
  const isBinaryContent = contentEncoding === "base64"
  const imagePreviewSrc =
    content && isBinaryContent
      ? `data:${content.mimeType ?? "application/octet-stream"};base64,${content.content}`
      : undefined
  const draftContent =
    !isBinaryContent && draftState && draftState.resourceId === resourceId
      ? draftState.content
      : savedContent
  const dirty = !isBinaryContent && draftContent !== savedContent
  const isSaving = Boolean(savingAction)
  const canEdit = Boolean(
    content && !isBinaryContent && !loading && !error && !resource?.isManaged,
  )
  const editMode = editResourceId === resourceId && canEdit
  const actionErrorMessage =
    actionError && actionError.resourceId === resourceId
      ? actionError.message
      : undefined
  const editorLanguage = editorLanguageForWebResource(content)
  const editorPath = editorPathForWebResource(content)

  async function copyContent() {
    if (!draftContent || isBinaryContent) {
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
      setActionError({
        resourceId: content.id,
        message: formatErrorMessage(error, "Could not save web resource"),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid h-[min(900px,calc(100vh-3rem))] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:w-[calc(100vw-4rem)] sm:max-w-[calc(100vw-4rem)] 2xl:w-[1480px] 2xl:max-w-[1480px]">
        <DialogHeader className="border-b border-border px-4 py-3 pr-12">
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
                  <Badge variant="secondary">
                    {webResourceTypeLabel(resource)}
                  </Badge>
                )}
                {resource?.isManaged && (
                  <Badge variant="outline">Managed</Badge>
                )}
                {content?.language && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {content.language}
                  </span>
                )}
                {content?.mimeType && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {content.mimeType}
                  </span>
                )}
                {dirty && (
                  <Badge
                    variant="outline"
                    className="border-amber-400/70 bg-amber-50/80 text-amber-700"
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
                  "flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground",
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
                disabled={!draftContent || isBinaryContent}
              >
                <Copy className="size-3.5" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={revertDraft}
                disabled={!dirty || isSaving}
              >
                <RotateCcw className="size-3.5" />
                Revert
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                <X className="size-3.5" />
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveDraft(false)}
                disabled={!canEdit || !dirty || isSaving}
              >
                {savingAction === "save" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                onClick={() => void saveDraft(true)}
                disabled={!canEdit || isSaving}
              >
                {savingAction === "publish" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Save & Publish
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
          <div>
            {Boolean(error) && (
              <div className="m-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {formatErrorMessage(error, "Could not load web resource")}
              </div>
            )}

            {actionErrorMessage && (
              <div className="m-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
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
              {imagePreviewSrc ? (
                <div className="flex h-full min-h-0 items-center justify-center bg-muted/20 p-6">
                  <div className="flex max-h-full max-w-full flex-col items-center gap-3">
                    <img
                      src={imagePreviewSrc}
                      alt={content?.name ?? "Web resource image"}
                      className="max-h-[calc(100vh-14rem)] max-w-full rounded-lg border border-border bg-background object-contain shadow-sm"
                    />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ImageIcon className="size-3.5" />
                      Preview only. Use Bind and Publish to replace binary image
                      content.
                    </div>
                  </div>
                </div>
              ) : (
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
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
