import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { TableCell } from "@/components/ui/table"
import type {
  DataverseEnvironment,
  WebResourceBinding,
} from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import { cn } from "@/lib/utils"
import { checkWebResourceBinding } from "./gateway"

type BindingStatusCellsProps = {
  binding: WebResourceBinding
  environment: DataverseEnvironment
  publishing: boolean
}

function formatModifiedOn(value: string | number | undefined) {
  if (value === undefined) return "Unavailable"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unavailable"
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function BindingStatusCells({
  binding,
  environment,
  publishing,
}: BindingStatusCellsProps) {
  const query = useQuery({
    queryKey: [
      "webResourceBindingStatus",
      environment.id,
      binding.webResourceId,
      binding.localPath,
    ],
    queryFn: () => checkWebResourceBinding(environment, binding),
    enabled: !publishing,
    refetchInterval: 30_000,
    staleTime: 0,
    retry: false,
  })
  const status = query.isError ? undefined : query.data
  const checking = publishing || query.isFetching || query.isPending
  const label = publishing
    ? "Publishing"
    : checking
      ? "Checking"
      : query.isError
        ? "Cannot check"
        : status?.state === "upToDate"
          ? "Up to date"
          : status?.state === "outOfDate"
            ? "Out of date"
            : "Local file missing"
  const detail = query.isError
    ? formatErrorMessage(query.error, "Could not compare published content.")
    : status?.state === "outOfDate"
      ? "Published content differs from the bound local file. Review before publishing."
      : status?.state === "missingLocal"
        ? "The bound local file could not be found. Restore the file or bind its new location."
        : "Published content matches the bound local file."

  return (
    <>
      <TableCell title="Current published Dataverse version">
        {status?.publishedVersion ?? "-"}
      </TableCell>
      <TableCell className="text-xs">
        <div title={status?.publishedModifiedOn}>
          <span className="text-muted-foreground">Dataverse: </span>
          {formatModifiedOn(status?.publishedModifiedOn)}
        </div>
        <div
          className="mt-1"
          title={status?.localModifiedOn === undefined
            ? undefined : new Date(status.localModifiedOn).toLocaleString()}
        >
          <span className="text-muted-foreground">Local: </span>
          {formatModifiedOn(status?.localModifiedOn)}
        </div>
      </TableCell>
      <TableCell>
        <span
          tabIndex={0}
          title={checking
            ? "Comparing the bound file with published Dataverse content."
            : `${detail} Checked ${formatModifiedOn(query.isError ? query.errorUpdatedAt : query.dataUpdatedAt)}.`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs",
            checking
              ? "bg-muted/30 text-muted-foreground"
              : query.isError || status?.state === "missingLocal"
                ? "bg-destructive/10 text-destructive"
                : status?.state === "outOfDate"
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
          )}
        >
          {checking ? (
            <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
          {label}
        </span>
        {query.isError && (
          <p className="mt-1 max-w-48 whitespace-normal break-words text-xs text-destructive">
            {detail}
          </p>
        )}
      </TableCell>
    </>
  )
}
