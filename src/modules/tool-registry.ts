import { Braces, Boxes, FileCode2, MessageSquareText } from "lucide-react"

import type { ToolId } from "@/core/dataverse/schemas"
import type { ToolDefinition } from "@/modules/types"

export const toolRegistry: ToolDefinition[] = [
  {
    id: "autopublisher",
    title: "Autopublisher",
    description: "Web resources, bindings, and publish runs",
    icon: FileCode2,
    status: "ready",
  },
  {
    id: "ai-chat",
    title: "AI Chat",
    description: "Ask Dataverse questions",
    icon: MessageSquareText,
    status: "ready",
  },
  {
    id: "fetchxml-builder",
    title: "FetchXML Builder",
    description: "Query builder workspace",
    icon: Braces,
    status: "planned",
  },
  {
    id: "solution-explorer",
    title: "Solution Explorer",
    description: "Solutions and components",
    icon: Boxes,
    status: "planned",
  },
]

export function getToolDefinition(toolId: ToolId) {
  return toolRegistry.find((tool) => tool.id === toolId) ?? toolRegistry[0]
}
