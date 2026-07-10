import type { JSX } from "react"
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  FileCode2,
  FileSymlink,
  Folder,
  FolderPlus,
  FolderOpen,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TabsContent } from "@/components/ui/tabs"
import { formatErrorMessage } from "@/core/errors"
import type {
  WebResource,
  WebResourceBinding,
} from "@/core/dataverse/schemas"
import { cn } from "@/lib/utils"
import { DownloadStatusPanel } from "./DownloadStatusPanel"
import type { DownloadJob } from "./download-job"
import { webResourceTypeLabel } from "./resource-presentation"
import {
  collectFolderFileResources,
  isRootFolder,
  type ResourceTreeFolder,
  type ResourceTreeRow,
} from "./tree-model"

type ResourcesTabProps = {
  bindings: readonly WebResourceBinding[]
  downloadJob?: DownloadJob
  downloadNow: number
  downloadRunning: boolean
  error: unknown
  expandedFolderIds: ReadonlySet<string>
  loading: boolean
  publishingIds: ReadonlySet<string>
  query: string
  resources: readonly WebResource[]
  rows: readonly ResourceTreeRow[]
  searchActive: boolean
  selectedResourceId?: string
  solutionsAvailable: boolean
  solutionsLoading: boolean
  onAddFolder: (parentPath: string) => void
  onAddToSolution: (resource: WebResource) => void
  onBind: (resource: WebResource) => void
  onDeleteFolder: (folder: ResourceTreeFolder) => void
  onDeleteResource: (resource: WebResource) => void
  onDismissDownload: () => void
  onDownloadFolder: (folder: ResourceTreeFolder) => void
  onDownloadResource: (resource: WebResource) => void
  onOpenResource: (resource: WebResource) => void
  onRefresh: () => void
  onToggleFolder: (folderId: string) => void
  onUnbind: (binding: WebResourceBinding) => void
  onUploadFiles: (folder: ResourceTreeFolder) => void
}

function formatResourceCount(count: number): string {
  return count === 1 ? "1 item" : `${count} items`
}

export function ResourcesTab({
  bindings,
  downloadJob,
  downloadNow,
  downloadRunning,
  error,
  expandedFolderIds,
  loading,
  publishingIds,
  query,
  resources,
  rows,
  searchActive,
  selectedResourceId,
  solutionsAvailable,
  solutionsLoading,
  onAddFolder,
  onAddToSolution,
  onBind,
  onDeleteFolder,
  onDeleteResource,
  onDismissDownload,
  onDownloadFolder,
  onDownloadResource,
  onOpenResource,
  onRefresh,
  onToggleFolder,
  onUnbind,
  onUploadFiles,
}: ResourcesTabProps): JSX.Element {
  return (
    <TabsContent
      value="resources"
      className="min-h-0 flex-1 overflow-hidden p-0"
    >
      {error != null && (
        <div className="border-b border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {formatErrorMessage(error, "Could not load web resources")}
        </div>
      )}

      <div className="h-full min-h-0 overflow-auto p-3">
        {downloadJob && (
          <DownloadStatusPanel
            job={downloadJob}
            now={downloadNow}
            onDismiss={onDismissDownload}
          />
        )}

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
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center">
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading web resources
                  </span>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              rows.map((row) => {
                if (row.type === "folder") {
                  const expanded =
                    searchActive || expandedFolderIds.has(row.folder.id)
                  const downloadableResourceCount =
                    collectFolderFileResources(row.folder).length

                  return (
                    <ContextMenu key={row.folder.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow
                          aria-expanded={expanded}
                          className={cn(
                            "bg-muted/30 font-medium",
                            !searchActive && "cursor-pointer",
                          )}
                          onClick={() => {
                            if (!searchActive) {
                              onToggleFolder(row.folder.id)
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
                                  onToggleFolder(row.folder.id)
                                }}
                                disabled={searchActive}
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
                              <span className="text-xs text-muted-foreground">
                                {row.folder.boundCount} bound
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Unbound
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" />
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onSelect={() => onAddFolder(row.folder.path)}
                        >
                          <FolderPlus className="size-4" />
                          Add Folder
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => onUploadFiles(row.folder)}
                        >
                          <Upload className="size-4" />
                          Upload Files To Folder
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={
                            downloadableResourceCount === 0 || downloadRunning
                          }
                          onSelect={() => onDownloadFolder(row.folder)}
                        >
                          <Download className="size-4" />
                          Download {isRootFolder(row.folder) ? "Root" : "Folder"}
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => onDeleteFolder(row.folder)}
                        >
                          <Trash2 className="size-4" />
                          Delete {isRootFolder(row.folder) ? "Root" : "Folder"}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                }

                const resource = row.file.resource
                const binding = bindings.find(
                  (item) => item.webResourceId === resource.id,
                )
                const selected = selectedResourceId === resource.id
                const ResourceIcon =
                  resource.type === "image" ? ImageIcon : FileCode2

                return (
                  <ContextMenu key={resource.id}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        className={cn(
                          "cursor-pointer",
                          selected && "bg-primary/5 hover:bg-primary/5",
                        )}
                        onClick={() => onOpenResource(resource)}
                      >
                        <TableCell className="max-w-96">
                          <div
                            className="flex min-w-0 items-center gap-1.5"
                            style={{
                              paddingLeft: `${row.depth * 1.25 + 1.75}rem`,
                            }}
                            title={resource.name}
                          >
                            <ResourceIcon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-mono text-xs">
                              {row.file.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {webResourceTypeLabel(resource)}
                          </Badge>
                        </TableCell>
                        <TableCell>{resource.version || "-"}</TableCell>
                        <TableCell>
                          {binding ? (
                            <Badge
                              className="border-emerald-400/50 bg-emerald-50/70 text-emerald-700"
                              variant="outline"
                            >
                              Bound
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Unbound
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`View ${resource.name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                onOpenResource(resource)
                              }}
                            >
                              <Code2 className="size-3.5" />
                            </Button>
                            {binding ? (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Unbind ${resource.name}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onUnbind(binding)
                                }}
                                disabled={publishingIds.has(binding.id)}
                              >
                                <Unlink className="size-3.5" />
                                Unbind
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onBind(resource)
                                }}
                              >
                                <FileSymlink className="size-3.5" />
                                Bind
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={(event) => {
                                event.stopPropagation()
                                onDeleteResource(resource)
                              }}
                              disabled={resource.isManaged}
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => onOpenResource(resource)}>
                        <Code2 className="size-4" />
                        View File
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={
                          resource.isManaged ||
                          solutionsLoading ||
                          !solutionsAvailable
                        }
                        onSelect={() => onAddToSolution(resource)}
                      >
                        <Plus className="size-4" />
                        Add to Solution
                      </ContextMenuItem>
                      {binding ? (
                        <ContextMenuItem
                          disabled={publishingIds.has(binding.id)}
                          onSelect={() => onUnbind(binding)}
                        >
                          <Unlink className="size-4" />
                          Unbind
                        </ContextMenuItem>
                      ) : (
                        <ContextMenuItem onSelect={() => onBind(resource)}>
                          <FileSymlink className="size-4" />
                          Bind
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem
                        disabled={downloadRunning}
                        onSelect={() => onDownloadResource(resource)}
                      >
                        <Download className="size-4" />
                        Download File
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={resource.isManaged}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onDeleteResource(resource)}
                      >
                        <Trash2 className="size-4" />
                        Delete File
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}

            {!loading && resources.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/60">
                      <Search className="size-4" />
                    </div>
                    <div className="text-sm">
                      No web resources found
                      {query.trim() ? " for this search" : ""}
                    </div>
                    {!query.trim() && (
                      <Button variant="outline" size="sm" onClick={onRefresh}>
                        <RefreshCw className="size-3.5" />
                        Refresh
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </TabsContent>
  )
}
