import type { LucideIcon } from "lucide-react"
import type { ComponentType, LazyExoticComponent } from "react"

import type { ToolId, ToolWindow } from "@/core/dataverse/schemas"

export type ToolStatus = "ready" | "planned"

export type ToolModuleProps = {
  window: ToolWindow
}

export type ToolDefinition = {
  id: ToolId
  title: string
  description: string
  icon: LucideIcon
  status: ToolStatus
  component:
    | ComponentType<ToolModuleProps>
    | LazyExoticComponent<ComponentType<ToolModuleProps>>
}
