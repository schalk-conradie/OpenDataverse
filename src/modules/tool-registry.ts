import {
  Braces,
  Boxes,
  BotMessageSquare,
  FileCode2,
  MessageSquareText,
  Puzzle,
} from "lucide-react"

import type { ToolId } from "@/core/dataverse/schemas"
import type { ToolDefinition } from "@/modules/types"

export const toolRegistry: ToolDefinition[] = [
  {
    id: "autopublisher",
    title: "Webresource Management",
    description: "Web resource editing, bindings, and publish runs",
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
    id: "ai-agent-experimental",
    title: "AI Agent (Experimental)",
    description: "Unsafe Dataverse changes",
    icon: BotMessageSquare,
    status: "ready",
  },
  {
    id: "fetchxml-builder",
    title: "FetchXML Builder",
    description: "Query builder workspace",
    icon: Braces,
    status: "ready",
  },
  {
    id: "plugin-registration",
    title: "Plugin Registration",
    description: "Unmanaged assemblies, steps, images, and endpoints",
    icon: Puzzle,
    status: "ready",
  },
  {
    id: "solution-explorer",
    title: "Solution Explorer",
    description: "Solutions and components",
    icon: Boxes,
    status: "ready",
  },
]

export function getToolDefinition(toolId: ToolId) {
  return toolRegistry.find((tool) => tool.id === toolId) ?? toolRegistry[0]
}
