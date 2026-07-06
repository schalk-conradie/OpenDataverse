import { z } from "zod"

import {
  appearanceModes,
  appearanceThemeIds,
  defaultAppearanceMode,
  defaultAppearanceThemeId,
} from "@/core/appearance/themes"

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

const appearanceSettingsSchema = z
  .object({
    darkMode: z.boolean().catch(false),
    mode: z.enum(appearanceModes).catch(defaultAppearanceMode).optional(),
    theme: z
      .enum(appearanceThemeIds)
      .catch(defaultAppearanceThemeId)
      .default(defaultAppearanceThemeId),
  })
  .default({
    darkMode: false,
    mode: defaultAppearanceMode,
    theme: defaultAppearanceThemeId,
  })
  .transform((appearance) => {
    const mode =
      appearance.mode ?? (appearance.darkMode ? "dark" : defaultAppearanceMode)

    return {
      ...appearance,
      mode,
      darkMode: mode === "dark",
    }
  })

export const userSettingsSchema = z.object({
  appearance: appearanceSettingsSchema,
  dangerZone: z
    .object({
      experimentalAiAgentEnabled: z.boolean().catch(false),
    })
    .default({ experimentalAiAgentEnabled: false }),
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
    mode: defaultAppearanceMode,
    theme: defaultAppearanceThemeId,
  },
  dangerZone: {
    experimentalAiAgentEnabled: false,
  },
}

export type AuthState = z.infer<typeof authStateSchema>
export type DataverseEnvironment = z.infer<typeof dataverseEnvironmentSchema>
export type WebResourceBinding = z.infer<typeof webResourceBindingSchema>
export type AppConfig = z.infer<typeof appConfigSchema>
export type UserSettings = z.infer<typeof userSettingsSchema>

const environmentNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export function sortEnvironmentsByName(
  environments: readonly DataverseEnvironment[],
) {
  return [...environments].sort(
    (a, b) =>
      environmentNameCollator.compare(a.name, b.name) ||
      environmentNameCollator.compare(a.id, b.id),
  )
}

export type WebResource = {
  id: string
  name: string
  type: "html" | "css" | "js" | "xml" | "image" | "resx"
  version: string
  isManaged: boolean
  isCustomizable?: boolean
  solution: string
  modifiedOn?: string
  modifiedBy?: {
    id?: string
    name: string
    domainName?: string
  }
}

export type WebResourceContent = {
  id: string
  name: string
  type: WebResource["type"]
  language: string
  content: string
  contentEncoding: "text" | "base64"
  mimeType?: string
}

export type DeleteWebResourcesResult = {
  deleted: number
  message: string
}

export type DownloadWebResourcesResult = {
  downloaded: number
  targetPath: string
  message: string
}

export type WebResourceActivity = {
  id: string
  webResourceId?: string
  webResourceName: string
  occurredOn: string
  actorName: string
  actorDomain?: string
  action: string
  operation: string
  kind: "change" | "publish" | "create" | "delete"
  changedAttributes: string[]
  detail: string
}

export type FetchXmlEntitySummary = {
  logicalName: string
  entitySetName: string
  displayName: string
  primaryNameAttribute?: string
  primaryIdAttribute?: string
}

export type FetchXmlOptionValue = {
  value: number
  label: string
}

export type FetchXmlAttributeSummary = {
  logicalName: string
  displayName: string
  attributeType: string
  isValidForRead: boolean
  optionValues?: FetchXmlOptionValue[]
}

export type FetchXmlRelationshipSummary = {
  id: string
  schemaName: string
  relationshipType: "many-to-one" | "one-to-many" | "many-to-many"
  fromEntity: string
  toEntity: string
  fromAttribute?: string
  toAttribute?: string
  displayName: string
}

export type FetchXmlEntityMetadata = FetchXmlEntitySummary & {
  attributes: FetchXmlAttributeSummary[]
  relationships: FetchXmlRelationshipSummary[]
}

export type FetchXmlQueryResult = {
  rows: Record<string, unknown>[]
  columns: string[]
  entitySetName: string
  webApiUrl: string
}

export type FormLogicEntitySummary = {
  logicalName: string
  entitySetName: string
  displayName: string
  primaryNameAttribute?: string
  primaryIdAttribute?: string
}

export type FormLogicFormSummary = {
  id: string
  name: string
  typeCode: number
  typeLabel: string
  description: string
  isDefault: boolean
  isManaged: boolean
  formActivationState: number
}

export type FormLogicOptionValue = {
  value: number
  label: string
}

export type FormLogicAttributeMetadata = {
  logicalName: string
  displayName: string
  attributeType: string
  requiredLevel?: string
  isValidForRead: boolean
  lookupTargets?: string[]
  optionValues?: FormLogicOptionValue[]
}

export type FormLogicFormContext = {
  entity: FormLogicEntitySummary
  form: FormLogicFormSummary
  formXml: string
  attributes: FormLogicAttributeMetadata[]
  source: "dataverse" | "browser-preview"
}

export type SolutionSummary = {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  isManaged: boolean
  isVisible: boolean
  publisherId?: string
  publisherName?: string
  publisherUniqueName?: string
  publisherPrefix?: string
  createdOn?: string
  modifiedOn?: string
  componentCount?: number
}

export type SolutionComponentSummary = {
  id: string
  solutionId: string
  objectId: string
  componentType: number
  componentTypeLabel: string
  group: string
  displayName: string
  logicalName?: string
  schemaName?: string
  isManaged?: boolean
  createdOn?: string
  modifiedOn?: string
  rootComponentBehavior?: number
  rootComponentBehaviorLabel?: string
  rootSolutionComponentId?: string
  version?: string
  relatedEntityLogicalName?: string
  relatedRecordUrl?: string
  layerName?: string
}

export type SolutionDependencyItem = {
  id: string
  dependencyType: number
  dependencyTypeLabel: string
  dependentComponentType: number
  dependentComponentTypeLabel: string
  dependentComponentObjectId: string
  dependentComponentParentId?: string
  requiredComponentType: number
  requiredComponentTypeLabel: string
  requiredComponentObjectId: string
  requiredComponentParentId?: string
}

export type SolutionDependencyReport = {
  required: SolutionDependencyItem[]
  dependents: SolutionDependencyItem[]
  deleteBlockers: SolutionDependencyItem[]
}

export type SolutionLayer = {
  id: string
  name: string
  componentName?: string
  solutionName?: string
  publisherName?: string
  order?: number
  overwriteTime?: string
  changes?: string
}

export type SolutionWebResourceCandidate = {
  id: string
  name: string
  displayName?: string
  type: WebResource["type"]
  typeCode: number
  isManaged: boolean
  inSolution: boolean
  modifiedOn?: string
}

export type SolutionWriteResult = {
  webResourceId?: string
  message: string
}

export type WebResourceImportItem = {
  sourcePath: string
  name: string
  type: WebResource["type"]
  webResourceId?: string
}

export type WebResourceImportSkip = {
  sourcePath: string
  reason: string
}

export type WebResourceImportResult = {
  imported: WebResourceImportItem[]
  skipped: WebResourceImportSkip[]
  message: string
}

export type PluginOptionSummary = {
  value: number
  label: string
}

export type PluginEditableState = {
  canEdit: boolean
  canDelete: boolean
  reasons: string[]
}

export type PluginAssemblySummary = {
  id: string
  name: string
  version: string
  culture?: string
  publicKeyToken?: string
  fileName?: string
  fileHash?: string
  sizeBytes?: number
  isolationMode: number
  isolationModeLabel: string
  sourceType: number
  sourceTypeLabel: string
  isManaged: boolean
  isCustomizable?: boolean
  description?: string
  createdOn?: string
  modifiedOn?: string
  packageId?: string
  packageName?: string
  editable: PluginEditableState
}

export type PluginPackageSummary = {
  id: string
  name: string
  version?: string
  fileName?: string
  packageType?: number
  packageTypeLabel?: string
  isManaged: boolean
  description?: string
  createdOn?: string
  modifiedOn?: string
  editable: PluginEditableState
}

export type PluginTypeSummary = {
  id: string
  assemblyId: string
  assemblyName: string
  packageId?: string
  packageName?: string
  name: string
  friendlyName: string
  typeName: string
  isWorkflowActivity: boolean
  isManaged: boolean
  isCustomizable?: boolean
  description?: string
  createdOn?: string
  modifiedOn?: string
  editable: PluginEditableState
}

export type PluginStepSummary = {
  id: string
  name: string
  handlerType: "plugintype" | "serviceendpoint"
  pluginTypeId?: string
  pluginTypeName?: string
  serviceEndpointId?: string
  serviceEndpointName?: string
  assemblyId?: string
  assemblyName?: string
  packageId?: string
  packageName?: string
  messageId: string
  messageName: string
  messageFilterId?: string
  primaryEntity?: string
  secondaryEntity?: string
  stage: number
  stageLabel: string
  mode: number
  modeLabel: string
  rank: number
  supportedDeployment: number
  supportedDeploymentLabel: string
  asyncAutoDelete?: boolean
  filteringAttributes?: string
  configuration?: string
  secureConfigId?: string
  hasSecureConfig: boolean
  impersonatingUserId?: string
  impersonatingUserName?: string
  description?: string
  isManaged: boolean
  isCustomizable?: boolean
  stateCode: number
  statusCode: number
  statusLabel: string
  createdOn?: string
  modifiedOn?: string
  editable: PluginEditableState
}

export type PluginStepImageSummary = {
  id: string
  stepId: string
  stepName: string
  name: string
  entityAlias: string
  imageType: number
  imageTypeLabel: string
  messagePropertyName: string
  attributes?: string
  description?: string
  isManaged: boolean
  isCustomizable?: boolean
  createdOn?: string
  modifiedOn?: string
  editable: PluginEditableState
}

export type PluginMessageSummary = {
  id: string
  name: string
}

export type PluginMessageFilterSummary = {
  id: string
  messageId: string
  primaryEntity?: string
  secondaryEntity?: string
  isCustomProcessingStepAllowed: boolean
}

export type PluginServiceEndpointSummary = {
  id: string
  name: string
  contract: number
  contractLabel: string
  authType: number
  authTypeLabel: string
  url?: string
  path?: string
  namespaceAddress?: string
  messageFormat?: number
  messageFormatLabel?: string
  isAuthValueSet?: boolean
  isManaged: boolean
  description?: string
  stateCode?: number
  statusCode?: number
  createdOn?: string
  modifiedOn?: string
  editable: PluginEditableState
}

export type PluginSystemUserSummary = {
  id: string
  fullName: string
  domainName?: string
  isDisabled: boolean
}

export type PluginRegistrationSnapshot = {
  assemblies: PluginAssemblySummary[]
  packages: PluginPackageSummary[]
  types: PluginTypeSummary[]
  steps: PluginStepSummary[]
  images: PluginStepImageSummary[]
  messages: PluginMessageSummary[]
  endpoints: PluginServiceEndpointSummary[]
  users: PluginSystemUserSummary[]
  stageOptions: PluginOptionSummary[]
  modeOptions: PluginOptionSummary[]
  deploymentOptions: PluginOptionSummary[]
  isolationModeOptions: PluginOptionSummary[]
  sourceTypeOptions: PluginOptionSummary[]
  imageTypeOptions: PluginOptionSummary[]
  endpointContractOptions: PluginOptionSummary[]
  endpointAuthTypeOptions: PluginOptionSummary[]
  warnings: string[]
}

export type PluginDependencyItem = {
  id: string
  dependencyType: number
  dependencyTypeLabel: string
  dependentComponentType: number
  dependentComponentTypeLabel: string
  dependentComponentObjectId: string
  dependentComponentParentId?: string
  requiredComponentType: number
  requiredComponentTypeLabel: string
  requiredComponentObjectId: string
  requiredComponentParentId?: string
}

export type PluginDependencyReport = {
  required: PluginDependencyItem[]
  dependents: PluginDependencyItem[]
  deleteBlockers: PluginDependencyItem[]
}

export type PluginDiscoveredType = {
  fullName: string
  name: string
  namespace?: string
  kind: "plugin" | "workflow" | "unknown"
  isAbstract: boolean
  isPublic: boolean
  implementsIPlugin: boolean
  baseType?: string
}

export type PluginAssemblyInspection = {
  localPath: string
  fileName: string
  sizeBytes: number
  fileHash: string
  assemblyName: string
  version: string
  culture: string
  publicKeyToken: string
  targetFramework?: string
  strongNameSigned: boolean
  clrMetadataVersion?: string
  discoveredTypes: PluginDiscoveredType[]
  warnings: string[]
}

export const registerPluginAssemblyInputSchema = z.object({
  localPath: z.string().trim().min(1, "Select a compiled plug-in assembly"),
  name: z.string().trim().min(1, "Assembly name is required"),
  version: z.string().trim().min(1, "Assembly version is required"),
  culture: z.string().trim().default("neutral"),
  publicKeyToken: z.string().trim().default("null"),
  isolationMode: z.number().int().default(2),
  sourceType: z.number().int().default(0),
  description: z.string().trim().optional(),
  typeNames: z
    .array(z.string().trim().min(1))
    .min(1, "Select at least one plug-in type"),
  solutionUniqueName: z.string().trim().optional(),
})

export const updatePluginAssemblyInputSchema =
  registerPluginAssemblyInputSchema.extend({
    assemblyId: z.string().trim().min(1, "Assembly is required"),
  })

export type RegisterPluginAssemblyInput = z.infer<
  typeof registerPluginAssemblyInputSchema
>

export type UpdatePluginAssemblyInput = z.infer<
  typeof updatePluginAssemblyInputSchema
>

export const createPluginTypeInputSchema = z.object({
  assemblyId: z.string().trim().min(1, "Assembly is required"),
  typeName: z.string().trim().min(1, "Type name is required"),
  friendlyName: z.string().trim().optional(),
  description: z.string().trim().optional(),
  isWorkflowActivity: z.boolean().default(false),
  solutionUniqueName: z.string().trim().optional(),
})

export type CreatePluginTypeInput = z.infer<typeof createPluginTypeInputSchema>

export const registerPluginStepInputSchema = z
  .object({
    stepId: z.string().trim().optional(),
    handlerType: z
      .enum(["plugintype", "serviceendpoint"])
      .default("plugintype"),
    pluginTypeId: z.string().trim().optional(),
    serviceEndpointId: z.string().trim().optional(),
    messageId: z.string().trim().min(1, "Message is required"),
    messageFilterId: z.string().trim().optional(),
    name: z.string().trim().min(1, "Step name is required"),
    stage: z.number().int(),
    mode: z.number().int(),
    rank: z.number().int().min(1),
    supportedDeployment: z.number().int(),
    asyncAutoDelete: z.boolean().optional(),
    filteringAttributes: z.string().trim().optional(),
    configuration: z.string().optional(),
    secureConfiguration: z.string().optional(),
    description: z.string().trim().optional(),
    impersonatingUserId: z.string().trim().optional(),
    enabled: z.boolean(),
    solutionUniqueName: z.string().trim().optional(),
  })
  .refine(
    (input) =>
      input.handlerType === "plugintype"
        ? Boolean(input.pluginTypeId)
        : Boolean(input.serviceEndpointId),
    "Select a plug-in type or service endpoint handler",
  )

export type RegisterPluginStepInput = z.infer<
  typeof registerPluginStepInputSchema
>

export const registerPluginStepImageInputSchema = z.object({
  imageId: z.string().trim().optional(),
  stepId: z.string().trim().min(1, "Step is required"),
  name: z.string().trim().min(1, "Image name is required"),
  entityAlias: z.string().trim().min(1, "Alias is required"),
  imageType: z.number().int(),
  messagePropertyName: z.string().trim().min(1, "Message property is required"),
  attributes: z.string().trim().optional(),
  description: z.string().trim().optional(),
  solutionUniqueName: z.string().trim().optional(),
})

export type RegisterPluginStepImageInput = z.infer<
  typeof registerPluginStepImageInputSchema
>

export const registerPluginServiceEndpointInputSchema = z.object({
  endpointId: z.string().trim().optional(),
  name: z.string().trim().min(1, "Endpoint name is required"),
  contract: z.number().int(),
  authType: z.number().int(),
  url: z.string().trim().optional(),
  path: z.string().trim().optional(),
  namespaceAddress: z.string().trim().optional(),
  messageFormat: z.number().int().optional(),
  authValue: z.string().optional(),
  description: z.string().trim().optional(),
  solutionUniqueName: z.string().trim().optional(),
})

export type RegisterPluginServiceEndpointInput = z.infer<
  typeof registerPluginServiceEndpointInputSchema
>

export const pluginExportInputSchema = z.object({
  localPath: z.string().trim().min(1, "Export path is required"),
  includeManaged: z.boolean().default(false),
  componentIds: z.array(z.string().trim().min(1)).default([]),
})

export type PluginExportInput = z.infer<typeof pluginExportInputSchema>

export type PluginWriteResult = {
  id?: string
  message: string
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
  | "ai-chat"
  | "ai-agent-experimental"
  | "form-logic-copilot"
  | "fetchxml-builder"
  | "plugin-registration"
  | "solution-explorer"

export type ToolWindow = {
  id: string
  toolId: ToolId
  environmentId?: string
  title: string
  createdAt: string
  state?: Record<string, unknown>
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

export function getEnvironmentById(config: AppConfig, environmentId?: string) {
  return config.environments.find(
    (environment) => environment.id === environmentId,
  )
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
