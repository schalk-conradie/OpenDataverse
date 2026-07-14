import { Suspense } from "react"
import { Loader2 } from "lucide-react"

import type { ToolWindow } from "@/core/dataverse/schemas"
import { getToolDefinition } from "@/modules/tool-registry"

function ToolWindowLoading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Loading
    </div>
  )
}

export function ToolWindowContent({ window }: { window: ToolWindow }) {
  const tool = getToolDefinition(window.toolId)
  const ToolModule = tool.component

  if (tool.status === "planned") {
    return (
      <section className="flex h-full items-center justify-center border-l bg-background p-8 text-center">
        <div>
          <tool.icon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">{tool.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Planned</p>
        </div>
      </section>
    )
  }

  return (
    <Suspense fallback={<ToolWindowLoading />}>
      <ToolModule window={window} />
    </Suspense>
  )
}
