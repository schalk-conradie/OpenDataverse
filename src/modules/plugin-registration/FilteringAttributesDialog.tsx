import { useMemo, useState, type ReactElement } from "react"
import { useQuery } from "@tanstack/react-query"
import { ListFilter, Loader2, Search } from "lucide-react"

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
import type { DataverseEnvironment } from "@/core/dataverse/schemas"
import { formatErrorMessage } from "@/core/errors"
import {
  parseFilteringAttributes,
  serializeFilteringAttributes,
} from "./filtering-attributes"
import { listPluginFilteringAttributes } from "./gateway"

type FilteringAttributesDialogProps = {
  environment: DataverseEnvironment
  entityLogicalName: string
  initialValue: string
  onOpenChange: (open: boolean) => void
  onApply: (value: string) => void
}

export function FilteringAttributesDialog({
  environment,
  entityLogicalName,
  initialValue,
  onOpenChange,
  onApply,
}: FilteringAttributesDialogProps): ReactElement {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(
    () => new Set(parseFilteringAttributes(initialValue)),
  )
  const attributesQuery = useQuery({
    queryKey: [
      "plugin-filtering-attributes",
      environment.id,
      entityLogicalName,
    ],
    queryFn: () =>
      listPluginFilteringAttributes(environment, entityLogicalName),
  })
  const attributes = useMemo(
    () =>
      [...(attributesQuery.data ?? [])].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      ),
    [attributesQuery.data],
  )
  const filteredAttributes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return attributes
    }

    return attributes.filter((attribute) =>
      [
        attribute.displayName,
        attribute.logicalName,
        attribute.attributeType,
      ].some((value) => value.toLowerCase().includes(query)),
    )
  }, [attributes, search])

  function toggleAttribute(logicalName: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(logicalName)) {
        next.delete(logicalName)
      } else {
        next.add(logicalName)
      }
      return next
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Filtering Attributes</DialogTitle>
          <DialogDescription>
            Run this step only when one of the selected {entityLogicalName}{" "}
            attributes is included in an update.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="relative">
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search attributes"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {selected.size} selected · {filteredAttributes.length} shown
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(
                    new Set(attributes.map((attribute) => attribute.logicalName)),
                  )
                }
                disabled={attributes.length === 0}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {attributesQuery.isPending ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading attributes…
              </div>
            ) : attributesQuery.isError ? (
              <div className="m-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                {formatErrorMessage(
                  attributesQuery.error,
                  "Could not load filtering attributes.",
                )}
              </div>
            ) : filteredAttributes.length === 0 ? (
              <div className="m-3 grid justify-items-center gap-2 rounded-xl border border-border bg-muted/30 p-6 text-center">
                <div className="rounded-xl border border-border bg-background p-3">
                  <ListFilter className="size-5 text-muted-foreground" />
                </div>
                <p className="font-medium">No attributes found</p>
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "Try a different attribute name."
                    : "This entity has no attributes available for update filtering."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredAttributes.map((attribute) => (
                  <label
                    key={attribute.logicalName}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(attribute.logicalName)}
                      onChange={() => toggleAttribute(attribute.logicalName)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {attribute.displayName}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {attribute.logicalName}
                      </span>
                    </span>
                    <Badge variant="outline">{attribute.attributeType}</Badge>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(serializeFilteringAttributes(selected))
              onOpenChange(false)
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
