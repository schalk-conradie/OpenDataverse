import type { LucideIcon } from "lucide-react"

import type { ToolId } from "@/core/dataverse/schemas"

export type ToolStatus = "ready" | "planned"

export type ToolDefinition = {
  id: ToolId
  title: string
  description: string
  icon: LucideIcon
  status: ToolStatus
}
