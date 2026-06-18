import type {
  PluginAssemblyInspection,
  PluginAssemblySummary,
  PluginDependencyReport,
  PluginEditableState,
  PluginMessageFilterSummary,
  PluginMessageSummary,
  PluginOptionSummary,
  PluginPackageSummary,
  PluginRegistrationSnapshot,
  PluginServiceEndpointSummary,
  PluginStepImageSummary,
  PluginStepSummary,
  PluginSystemUserSummary,
  PluginTypeSummary,
} from "@/core/dataverse/schemas"

const editable: PluginEditableState = {
  canEdit: true,
  canDelete: true,
  reasons: [],
}

const managed: PluginEditableState = {
  canEdit: false,
  canDelete: false,
  reasons: ["Managed component"],
}

export const mockStageOptions: PluginOptionSummary[] = [
  { value: 10, label: "Pre-validation" },
  { value: 20, label: "Pre-operation" },
  { value: 40, label: "Post-operation" },
]

export const mockModeOptions: PluginOptionSummary[] = [
  { value: 0, label: "Synchronous" },
  { value: 1, label: "Asynchronous" },
]

export const mockDeploymentOptions: PluginOptionSummary[] = [
  { value: 0, label: "Server Only" },
  { value: 1, label: "Outlook Only" },
  { value: 2, label: "Both" },
]

export const mockIsolationModeOptions: PluginOptionSummary[] = [
  { value: 1, label: "None" },
  { value: 2, label: "Sandbox" },
]

export const mockSourceTypeOptions: PluginOptionSummary[] = [
  { value: 0, label: "Database" },
  { value: 1, label: "Disk" },
  { value: 2, label: "Normal" },
]

export const mockImageTypeOptions: PluginOptionSummary[] = [
  { value: 0, label: "PreImage" },
  { value: 1, label: "PostImage" },
  { value: 2, label: "Both" },
]

export const mockEndpointContractOptions: PluginOptionSummary[] = [
  { value: 1, label: "OneWay" },
  { value: 2, label: "Queue" },
  { value: 3, label: "Rest" },
  { value: 8, label: "Webhook" },
  { value: 9, label: "Event Grid" },
]

export const mockEndpointAuthTypeOptions: PluginOptionSummary[] = [
  { value: 0, label: "Not Specified" },
  { value: 2, label: "SAS Key" },
  { value: 4, label: "Webhook Key" },
  { value: 5, label: "Http Header" },
  { value: 9, label: "Managed Identity" },
]

export const mockPluginPackages: PluginPackageSummary[] = [
  {
    id: "594dd46e-0000-4000-9000-000000000001",
    name: "Contoso.Plugins.Package",
    version: "1.4.0",
    fileName: "Contoso.Plugins.1.4.0.nupkg",
    packageType: 0,
    packageTypeLabel: "NuGet",
    isManaged: false,
    description: "Package holding plug-ins with dependent assemblies.",
    createdOn: "2026-06-14T09:12:00Z",
    modifiedOn: "2026-06-17T16:25:00Z",
    editable,
  },
]

export const mockPluginAssemblies: PluginAssemblySummary[] = [
  {
    id: "7b41a314-0000-4000-9000-000000000001",
    name: "Contoso.AccountPlugins",
    version: "1.4.0.0",
    culture: "neutral",
    publicKeyToken: "null",
    fileName: "Contoso.AccountPlugins.dll",
    fileHash: "4a5c42a0f150d7d7a39d5e620b1efb28",
    sizeBytes: 74240,
    isolationMode: 2,
    isolationModeLabel: "Sandbox",
    sourceType: 0,
    sourceTypeLabel: "Database",
    isManaged: false,
    isCustomizable: true,
    description: "Account validation and enrichment handlers",
    createdOn: "2026-06-14T09:15:00Z",
    modifiedOn: "2026-06-17T16:25:00Z",
    packageId: mockPluginPackages[0].id,
    packageName: mockPluginPackages[0].name,
    editable,
  },
  {
    id: "7b41a314-0000-4000-9000-000000000002",
    name: "Northwind.OrderPlugins",
    version: "2.1.3.0",
    culture: "neutral",
    publicKeyToken: "4f2a7d3b1c9e8f00",
    fileName: "Northwind.OrderPlugins.dll",
    isolationMode: 2,
    isolationModeLabel: "Sandbox",
    sourceType: 0,
    sourceTypeLabel: "Database",
    isManaged: true,
    isCustomizable: false,
    description: "Managed order fulfillment extensions",
    createdOn: "2026-05-22T11:30:00Z",
    modifiedOn: "2026-06-06T10:05:00Z",
    editable: managed,
  },
]

export const mockPluginTypes: PluginTypeSummary[] = [
  {
    id: "34e53920-0000-4000-9000-000000000001",
    assemblyId: mockPluginAssemblies[0].id,
    assemblyName: mockPluginAssemblies[0].name,
    packageId: mockPluginPackages[0].id,
    packageName: mockPluginPackages[0].name,
    name: "Contoso.Plugins.AccountPreValidation",
    friendlyName: "Account Pre Validation",
    typeName: "Contoso.Plugins.AccountPreValidation",
    isWorkflowActivity: false,
    isManaged: false,
    isCustomizable: true,
    description: "Validates account data before save.",
    createdOn: "2026-06-14T09:17:00Z",
    modifiedOn: "2026-06-17T16:25:00Z",
    editable,
  },
  {
    id: "34e53920-0000-4000-9000-000000000002",
    assemblyId: mockPluginAssemblies[0].id,
    assemblyName: mockPluginAssemblies[0].name,
    packageId: mockPluginPackages[0].id,
    packageName: mockPluginPackages[0].name,
    name: "Contoso.Plugins.AccountPostCreate",
    friendlyName: "Account Post Create",
    typeName: "Contoso.Plugins.AccountPostCreate",
    isWorkflowActivity: false,
    isManaged: false,
    isCustomizable: true,
    createdOn: "2026-06-14T09:18:00Z",
    modifiedOn: "2026-06-17T16:25:00Z",
    editable,
  },
  {
    id: "34e53920-0000-4000-9000-000000000003",
    assemblyId: mockPluginAssemblies[1].id,
    assemblyName: mockPluginAssemblies[1].name,
    name: "Northwind.Plugins.OrderSubmit",
    friendlyName: "Order Submit",
    typeName: "Northwind.Plugins.OrderSubmit",
    isWorkflowActivity: false,
    isManaged: true,
    isCustomizable: false,
    createdOn: "2026-05-22T11:32:00Z",
    modifiedOn: "2026-06-06T10:05:00Z",
    editable: managed,
  },
]

export const mockPluginMessages: PluginMessageSummary[] = [
  { id: "a1f35f90-0000-4000-9000-000000000001", name: "Create" },
  { id: "a1f35f90-0000-4000-9000-000000000002", name: "Update" },
  { id: "a1f35f90-0000-4000-9000-000000000003", name: "Delete" },
  { id: "a1f35f90-0000-4000-9000-000000000004", name: "Associate" },
  { id: "a1f35f90-0000-4000-9000-000000000005", name: "Disassociate" },
]

export const mockPluginMessageFilters: PluginMessageFilterSummary[] = [
  {
    id: "cf5d7c4a-0000-4000-9000-000000000001",
    messageId: mockPluginMessages[0].id,
    primaryEntity: "account",
    isCustomProcessingStepAllowed: true,
  },
  {
    id: "cf5d7c4a-0000-4000-9000-000000000002",
    messageId: mockPluginMessages[1].id,
    primaryEntity: "account",
    isCustomProcessingStepAllowed: true,
  },
  {
    id: "cf5d7c4a-0000-4000-9000-000000000003",
    messageId: mockPluginMessages[1].id,
    primaryEntity: "contact",
    isCustomProcessingStepAllowed: true,
  },
  {
    id: "cf5d7c4a-0000-4000-9000-000000000004",
    messageId: mockPluginMessages[2].id,
    primaryEntity: "account",
    isCustomProcessingStepAllowed: true,
  },
]

export const mockPluginServiceEndpoints: PluginServiceEndpointSummary[] = [
  {
    id: "be84f087-0000-4000-9000-000000000001",
    name: "Contoso Account Webhook",
    contract: 8,
    contractLabel: "Webhook",
    authType: 4,
    authTypeLabel: "Webhook Key",
    url: "https://hooks.contoso.test/dataverse/account",
    messageFormat: 2,
    messageFormatLabel: "Json",
    isAuthValueSet: true,
    isManaged: false,
    description: "Receives account pipeline events.",
    createdOn: "2026-06-13T08:00:00Z",
    modifiedOn: "2026-06-17T12:20:00Z",
    editable,
  },
]

export const mockPluginUsers: PluginSystemUserSummary[] = [
  {
    id: "f0d44254-0000-4000-9000-000000000001",
    fullName: "Application User",
    domainName: "app@contoso.test",
    isDisabled: false,
  },
  {
    id: "f0d44254-0000-4000-9000-000000000002",
    fullName: "Schalk",
    domainName: "schalk@contoso.test",
    isDisabled: false,
  },
]

export const mockPluginSteps: PluginStepSummary[] = [
  {
    id: "f4d8252e-0000-4000-9000-000000000001",
    name: "Account: Update of creditlimit",
    handlerType: "plugintype",
    pluginTypeId: mockPluginTypes[0].id,
    pluginTypeName: mockPluginTypes[0].friendlyName,
    assemblyId: mockPluginTypes[0].assemblyId,
    assemblyName: mockPluginTypes[0].assemblyName,
    packageId: mockPluginPackages[0].id,
    packageName: mockPluginPackages[0].name,
    messageId: mockPluginMessages[1].id,
    messageName: "Update",
    messageFilterId: mockPluginMessageFilters[1].id,
    primaryEntity: "account",
    stage: 20,
    stageLabel: "Pre-operation",
    mode: 0,
    modeLabel: "Synchronous",
    rank: 1,
    supportedDeployment: 0,
    supportedDeploymentLabel: "Server Only",
    asyncAutoDelete: false,
    filteringAttributes: "creditlimit,paymenttermscode",
    configuration: "{\"threshold\":10000}",
    secureConfigId: "a4f6d6b5-0000-4000-9000-000000000001",
    hasSecureConfig: true,
    impersonatingUserId: mockPluginUsers[0].id,
    impersonatingUserName: mockPluginUsers[0].fullName,
    description: "Validates credit settings before save.",
    isManaged: false,
    isCustomizable: true,
    stateCode: 0,
    statusCode: 1,
    statusLabel: "Enabled",
    createdOn: "2026-06-14T09:22:00Z",
    modifiedOn: "2026-06-17T16:25:00Z",
    editable,
  },
  {
    id: "f4d8252e-0000-4000-9000-000000000002",
    name: "Account: Create enrichment",
    handlerType: "plugintype",
    pluginTypeId: mockPluginTypes[1].id,
    pluginTypeName: mockPluginTypes[1].friendlyName,
    assemblyId: mockPluginTypes[1].assemblyId,
    assemblyName: mockPluginTypes[1].assemblyName,
    packageId: mockPluginPackages[0].id,
    packageName: mockPluginPackages[0].name,
    messageId: mockPluginMessages[0].id,
    messageName: "Create",
    messageFilterId: mockPluginMessageFilters[0].id,
    primaryEntity: "account",
    stage: 40,
    stageLabel: "Post-operation",
    mode: 1,
    modeLabel: "Asynchronous",
    rank: 1,
    supportedDeployment: 0,
    supportedDeploymentLabel: "Server Only",
    asyncAutoDelete: true,
    hasSecureConfig: false,
    isManaged: false,
    isCustomizable: true,
    stateCode: 1,
    statusCode: 2,
    statusLabel: "Disabled",
    createdOn: "2026-06-14T09:26:00Z",
    modifiedOn: "2026-06-17T16:25:00Z",
    editable,
  },
  {
    id: "f4d8252e-0000-4000-9000-000000000003",
    name: "Account webhook fan-out",
    handlerType: "serviceendpoint",
    serviceEndpointId: mockPluginServiceEndpoints[0].id,
    serviceEndpointName: mockPluginServiceEndpoints[0].name,
    messageId: mockPluginMessages[1].id,
    messageName: "Update",
    messageFilterId: mockPluginMessageFilters[1].id,
    primaryEntity: "account",
    stage: 40,
    stageLabel: "Post-operation",
    mode: 1,
    modeLabel: "Asynchronous",
    rank: 10,
    supportedDeployment: 0,
    supportedDeploymentLabel: "Server Only",
    asyncAutoDelete: true,
    hasSecureConfig: false,
    isManaged: false,
    isCustomizable: true,
    stateCode: 0,
    statusCode: 1,
    statusLabel: "Enabled",
    createdOn: "2026-06-17T12:22:00Z",
    modifiedOn: "2026-06-17T12:22:00Z",
    editable,
  },
]

export const mockPluginStepImages: PluginStepImageSummary[] = [
  {
    id: "3e68ee02-0000-4000-9000-000000000001",
    stepId: mockPluginSteps[0].id,
    stepName: mockPluginSteps[0].name,
    name: "PreAccount",
    entityAlias: "PreAccount",
    imageType: 0,
    imageTypeLabel: "PreImage",
    messagePropertyName: "Target",
    attributes: "creditlimit,paymenttermscode",
    description: "Fields used for credit validation.",
    isManaged: false,
    isCustomizable: true,
    createdOn: "2026-06-14T09:23:00Z",
    modifiedOn: "2026-06-17T16:25:00Z",
    editable,
  },
]

const isUnmanaged = <T extends { isManaged?: boolean }>(item: T) =>
  item.isManaged !== true

export const mockUnmanagedPluginPackages =
  mockPluginPackages.filter(isUnmanaged)

export const mockUnmanagedPluginAssemblies =
  mockPluginAssemblies.filter(isUnmanaged)

export const mockUnmanagedPluginTypes = mockPluginTypes.filter(
  (pluginType) =>
    isUnmanaged(pluginType) &&
    mockUnmanagedPluginAssemblies.some(
      (assembly) => assembly.id === pluginType.assemblyId,
    ),
)

export const mockUnmanagedPluginSteps = mockPluginSteps.filter(isUnmanaged)

export const mockUnmanagedPluginStepImages =
  mockPluginStepImages.filter(isUnmanaged)

export const mockUnmanagedPluginServiceEndpoints =
  mockPluginServiceEndpoints.filter(isUnmanaged)

export const mockPluginAssemblyInspection: PluginAssemblyInspection = {
  localPath: "/workspace/bin/Contoso.Plugins.dll",
  fileName: "Contoso.Plugins.dll",
  sizeBytes: 74240,
  fileHash: "4a5c42a0f150d7d7a39d5e620b1efb28f27b9281d42b772c8bb1a8ef",
  assemblyName: "Contoso.AccountPlugins",
  version: "1.4.0.0",
  culture: "neutral",
  publicKeyToken: "null",
  targetFramework: ".NETFramework,Version=v4.6.2",
  strongNameSigned: false,
  clrMetadataVersion: "v4.0.30319",
  discoveredTypes: [
    {
      fullName: "Contoso.Plugins.AccountPreValidation",
      name: "AccountPreValidation",
      namespace: "Contoso.Plugins",
      kind: "plugin",
      isAbstract: false,
      isPublic: true,
      implementsIPlugin: true,
    },
    {
      fullName: "Contoso.Plugins.AccountPostCreate",
      name: "AccountPostCreate",
      namespace: "Contoso.Plugins",
      kind: "plugin",
      isAbstract: false,
      isPublic: true,
      implementsIPlugin: true,
    },
  ],
  warnings: ["Assembly is not strong-name signed."],
}

export const mockPluginDependencyReport: PluginDependencyReport = {
  required: [],
  dependents: [
    {
      id: "dependency-1",
      dependencyType: 2,
      dependencyTypeLabel: "Published",
      dependentComponentType: 92,
      dependentComponentTypeLabel: "SDK Message Processing Step",
      dependentComponentObjectId: mockPluginSteps[0].id,
      requiredComponentType: 90,
      requiredComponentTypeLabel: "Plug-in Type",
      requiredComponentObjectId: mockPluginTypes[0].id,
    },
  ],
  deleteBlockers: [],
}

export const mockPluginRegistrationSnapshot: PluginRegistrationSnapshot = {
  assemblies: mockUnmanagedPluginAssemblies,
  packages: mockUnmanagedPluginPackages,
  types: [],
  steps: [],
  images: [],
  messages: mockPluginMessages,
  endpoints: mockUnmanagedPluginServiceEndpoints,
  users: mockPluginUsers,
  stageOptions: mockStageOptions,
  modeOptions: mockModeOptions,
  deploymentOptions: mockDeploymentOptions,
  isolationModeOptions: mockIsolationModeOptions,
  sourceTypeOptions: mockSourceTypeOptions,
  imageTypeOptions: mockImageTypeOptions,
  endpointContractOptions: mockEndpointContractOptions,
  endpointAuthTypeOptions: mockEndpointAuthTypeOptions,
  warnings: [],
}
