import {
  Braces,
  Boxes,
  BotMessageSquare,
  FileCode2,
  MessageSquareText,
  Puzzle,
  WandSparkles,
} from "lucide-react"
import { createElement, lazy } from "react"

import type { ToolId } from "@/core/dataverse/schemas"
import type { ToolDefinition, ToolModuleProps } from "@/modules/types"

const AiChatModule = lazy(() =>
  import("@/modules/ai-chat/AiChatModule").then((module) => ({
    default: module.AiChatModule,
  })),
)
const FetchXmlBuilderModule = lazy(() =>
  import("@/modules/fetchxml-builder/FetchXmlBuilderModule").then((module) => ({
    default: module.FetchXmlBuilderModule,
  })),
)
const FormLogicCopilotModule = lazy(() =>
  import("@/modules/form-logic-copilot/FormLogicCopilotModule").then(
    (module) => ({
      default: module.FormLogicCopilotModule,
    }),
  ),
)
const PluginRegistrationModule = lazy(() =>
  import("@/modules/plugin-registration/PluginRegistrationModule").then(
    (module) => ({
      default: module.PluginRegistrationModule,
    }),
  ),
)
const SolutionExplorerModule = lazy(() =>
  import("@/modules/solution-explorer/SolutionExplorerModule").then(
    (module) => ({
      default: module.SolutionExplorerModule,
    }),
  ),
)
const WebResourceManagementModule = lazy(() =>
  import("@/modules/webresource-management/WebResourceManagementModule").then(
    (module) => ({
      default: module.WebResourceManagementModule,
    }),
  ),
)

function ExperimentalAiAgentModule({ window }: ToolModuleProps) {
  return createElement(AiChatModule, {
    window,
    mode: "experimental-agent",
  })
}

export const toolRegistry: ToolDefinition[] = [
  {
    id: "autopublisher",
    title: "Webresource Management",
    description: "Web resource editing, bindings, and publish runs",
    icon: FileCode2,
    status: "ready",
    component: WebResourceManagementModule,
  },
  {
    id: "ai-chat",
    title: "AI Chat",
    description: "Ask Dataverse questions",
    icon: MessageSquareText,
    status: "ready",
    component: AiChatModule,
  },
  {
    id: "ai-agent-experimental",
    title: "AI Agent (Experimental)",
    description: "Unsafe Dataverse changes",
    icon: BotMessageSquare,
    status: "ready",
    component: ExperimentalAiAgentModule,
  },
  {
    id: "form-logic-copilot",
    title: "Form Logic Copilot",
    description: "Generate form scripts",
    icon: WandSparkles,
    status: "ready",
    component: FormLogicCopilotModule,
  },
  {
    id: "fetchxml-builder",
    title: "FetchXML Builder",
    description: "Query builder workspace",
    icon: Braces,
    status: "ready",
    component: FetchXmlBuilderModule,
  },
  {
    id: "plugin-registration",
    title: "Plugin Registration",
    description: "Unmanaged assemblies, steps, images, and endpoints",
    icon: Puzzle,
    status: "ready",
    component: PluginRegistrationModule,
  },
  {
    id: "solution-explorer",
    title: "Solution Explorer",
    description: "Solutions and components",
    icon: Boxes,
    status: "ready",
    component: SolutionExplorerModule,
  },
]

export function getToolDefinition(toolId: ToolId) {
  const tool = toolRegistry.find((definition) => definition.id === toolId)
  if (!tool) {
    throw new Error(`Tool definition was not found for ${toolId}`)
  }

  return tool
}
