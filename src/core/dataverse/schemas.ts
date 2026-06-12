import { z } from "zod"

export const dataverseUrlPattern =
  /^https:\/\/[a-zA-Z0-9-]+\.crm[0-9]*\.dynamics\.com$/

export const authStateSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "expired",
  "error",
])

export const dataverseEnvironmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z
    .string()
    .regex(
      dataverseUrlPattern,
      "Use a Dataverse URL like https://org.crm.dynamics.com",
    ),
  authState: authStateSchema,
  tokenOutputDir: z.string().nullable().optional(),
})

export const webResourceBindingSchema = z.object({
  id: z.string().min(1),
  environmentId: z.string().min(1),
  localPath: z.string().min(1),
  webResourceName: z.string().min(1),
  webResourceId: z.string().min(1),
  lastKnownVersion: z.string(),
  autoPublish: z.boolean(),
})

export const appConfigSchema = z.object({
  currentEnvironmentId: z.string().optional(),
  publisherPrefix: z.string().min(1),
  environments: z.array(dataverseEnvironmentSchema),
  bindings: z.array(webResourceBindingSchema),
})

export const userSettingsSchema = z.object({
  appearance: z.object({
    darkMode: z.boolean(),
  }),
})

export const defaultAppConfig: AppConfig = {
  currentEnvironmentId: undefined,
  publisherPrefix: "new",
  environments: [],
  bindings: [],
}

export const defaultUserSettings: UserSettings = {
  appearance: {
    darkMode: false,
  },
}

export type AuthState = z.infer<typeof authStateSchema>
export type DataverseEnvironment = z.infer<typeof dataverseEnvironmentSchema>
export type WebResourceBinding = z.infer<typeof webResourceBindingSchema>
export type AppConfig = z.infer<typeof appConfigSchema>
export type UserSettings = z.infer<typeof userSettingsSchema>

export type WebResource = {
  id: string
  name: string
  type: "html" | "css" | "js" | "xml" | "image" | "resx"
  version: string
  isManaged: boolean
  solution: string
}

export type WebResourceContent = {
  id: string
  name: string
  type: WebResource["type"]
  language: string
  content: string
}

export type BrowserAuthStart = {
  sessionId: string
  authUrl: string
  redirectUri: string
  expiresAt: number
}

export type AuthSession = {
  environmentId: string
  status: "connected" | "disconnected" | "pending" | "error"
  message: string
}

export type PublishResult = {
  webResourceId: string
  webResourceName: string
  message: string
}

export type ToolId =
  | "autopublisher"
  | "fetchxml-builder"
  | "solution-explorer"

export type ToolWindow = {
  id: string
  toolId: ToolId
  environmentId?: string
  title: string
  createdAt: string
}

export function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`
}

export function normalizeEnvironmentUrl(value: string) {
  return value.trim().replace(/\/+$/, "")
}

export function getEnvironmentById(
  config: AppConfig,
  environmentId?: string,
) {
  return config.environments.find((environment) => environment.id === environmentId)
}

export function getBindingsForEnvironment(
  config: AppConfig,
  environmentId?: string,
) {
  if (!environmentId) {
    return []
  }

  return config.bindings.filter(
    (binding) => binding.environmentId === environmentId,
  )
}
