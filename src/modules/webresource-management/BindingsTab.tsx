import type { JSX } from "react"
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileSymlink,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  Unlink,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TabsContent } from "@/components/ui/tabs"
import type { WebResourceBinding } from "@/core/dataverse/schemas"
import type { BindingTreeFolder, BindingTreeRow } from "./tree-model"

type BindingsTabProps = {
  bindingCount: number
  collapsedFolderIds: ReadonlySet<string>
  environmentName: string
  publishingIds: ReadonlySet<string>
  rows: readonly BindingTreeRow[]
  onPublish: (binding: WebResourceBinding) => void
  onToggleAutoPublish: (bindingId: string, autoPublish: boolean) => void
  onToggleFolder: (folderId: string) => void
  onUnbind: (binding: WebResourceBinding) => void
}

function formatBindingCount(count: number): string {
  return count === 1 ? "1 binding" : `${count} bindings`
}

function formatAutoPublishCount(count: number, total: number): string {
  if (count === 0) {
    return "Auto off"
  }

  if (count === total) {
    return "Auto on"
  }

  return `${count}/${total} auto`
}

function summarizeLocalPath(folder: BindingTreeFolder): string {
  const localDirectories = [...folder.localDirectories]

  if (localDirectories.length === 0) {
    return "-"
  }

  if (localDirectories.length === 1) {
    return localDirectories[0]
  }

  return `${localDirectories.length} local folders`
}

export function BindingsTab({
  bindingCount,
  collapsedFolderIds,
  environmentName,
  publishingIds,
  rows,
  onPublish,
  onToggleAutoPublish,
  onToggleFolder,
  onUnbind,
}: BindingsTabProps): JSX.Element {
  return (
    <TabsContent
      value="bindings"
      className="min-h-0 flex-1 overflow-auto p-3"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[38%]">Web Resource</TableHead>
            <TableHead>Local File</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Auto</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            if (row.type === "folder") {
              const expanded = !collapsedFolderIds.has(row.folder.id)
              const localPathSummary = summarizeLocalPath(row.folder)

              return (
                <TableRow
                  key={row.folder.id}
                  aria-expanded={expanded}
                  className="cursor-pointer bg-muted/30 font-medium"
                  onClick={() => onToggleFolder(row.folder.id)}
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
                          onToggleFolder(row.folder.id)
                        }}
                      >
                        {expanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </Button>
                      {expanded ? (
                        <FolderOpen className="size-4 shrink-0 text-primary" />
                      ) : (
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-mono text-xs">
                        {row.folder.name}
                      </span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {formatBindingCount(row.folder.bindingCount)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell
                    className="max-w-72 truncate font-mono text-xs text-muted-foreground"
                    title={localPathSummary}
                  >
                    {localPathSummary}
                  </TableCell>
                  <TableCell className="text-muted-foreground">-</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatAutoPublishCount(
                        row.folder.autoPublishCount,
                        row.folder.bindingCount,
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right" />
                </TableRow>
              )
            }

            const binding = row.file.binding

            return (
              <TableRow key={binding.id}>
                <TableCell className="max-w-96">
                  <div
                    className="flex min-w-0 items-center gap-1.5"
                    style={{
                      paddingLeft: `${row.depth * 1.25 + 1.75}rem`,
                    }}
                    title={binding.webResourceName}
                  >
                    <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-xs">
                      {row.file.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className="max-w-72 truncate font-mono text-xs"
                  title={binding.localPath}
                >
                  {binding.localPath}
                </TableCell>
                <TableCell>{binding.lastKnownVersion || "-"}</TableCell>
                <TableCell>
                  <Switch
                    checked={binding.autoPublish}
                    onCheckedChange={(autoPublish) =>
                      onToggleAutoPublish(binding.id, autoPublish)
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPublish(binding)}
                      disabled={publishingIds.has(binding.id)}
                    >
                      {publishingIds.has(binding.id) ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      Publish
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUnbind(binding)}
                      disabled={publishingIds.has(binding.id)}
                    >
                      <Unlink className="size-3.5" />
                      Unbind
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {bindingCount === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-40 text-center">
                <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/60">
                    <FileSymlink className="size-4" />
                  </div>
                  <div className="text-sm">
                    No local files bound to {environmentName}
                  </div>
                  <p className="max-w-xs text-xs">
                    Bind a web resource to a local file to enable auto-publish on
                    save.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TabsContent>
  )
}
