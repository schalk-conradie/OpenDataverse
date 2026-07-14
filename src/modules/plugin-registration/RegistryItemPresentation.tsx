import type { ElementType, ReactElement } from "react"
import {
  Archive,
  Boxes,
  FileCode2,
  ImagePlus,
  PlugZap,
  Server,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  registryItemState,
  type RegistryItem,
  type RegistryKind,
} from "./registry-model"

const kindIcons: Record<RegistryKind, ElementType> = {
  package: Boxes,
  assembly: Archive,
  type: FileCode2,
  step: PlugZap,
  image: ImagePlus,
  endpoint: Server,
}

export function RegistryKindIcon({
  kind,
  className,
}: {
  kind: RegistryKind
  className?: string
}): ReactElement {
  const Icon = kindIcons[kind]
  return <Icon className={cn("size-4", className)} />
}

export function RegistryStateBadge({
  item,
}: {
  item: RegistryItem
}): ReactElement {
  const state = registryItemState(item)

  if (state.kind === "managed") {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2 text-[11px] font-medium text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200">
        <span className="size-1.5 rounded-full bg-amber-500" />
        {state.label}
      </span>
    )
  }

  if (state.kind === "enabled") {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-emerald-300/70 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-950/40 dark:text-emerald-200">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {state.label}
      </span>
    )
  }

  if (state.kind === "disabled") {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-slate-300/70 bg-slate-50 px-2 text-[11px] font-medium text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/40 dark:text-slate-300">
        <span className="size-1.5 rounded-full bg-slate-400" />
        {state.label}
      </span>
    )
  }

  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full bg-primary" />
      {state.label}
    </span>
  )
}
