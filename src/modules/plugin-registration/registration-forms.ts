import type {
  PluginAssemblyInspection,
  PluginAssemblySummary,
  PluginMessageFilterSummary,
  PluginRegistrationSnapshot,
  PluginServiceEndpointSummary,
  PluginStepImageSummary,
  PluginStepSummary,
} from "@/core/dataverse/schemas"

export type AssemblyForm = {
  localPath: string
  name: string
  version: string
  culture: string
  publicKeyToken: string
  isolationMode: number
  sourceType: number
  description: string
  solutionUniqueName: string
}

export type StepForm = {
  stepId?: string
  handlerType: "plugintype" | "serviceendpoint"
  pluginTypeId: string
  serviceEndpointId: string
  messageId: string
  messageText: string
  messageFilterId: string
  name: string
  stage: number
  mode: number
  rank: number
  supportedDeployment: number
  asyncAutoDelete: boolean
  filteringAttributes: string
  configuration: string
  secureConfiguration: string
  impersonatingUserId: string
  description: string
  enabled: boolean
  solutionUniqueName: string
}

export type ImageForm = {
  imageId?: string
  stepId: string
  name: string
  entityAlias: string
  imageType: number
  messagePropertyName: string
  attributes: string
  description: string
  solutionUniqueName: string
}

export type EndpointForm = {
  endpointId?: string
  name: string
  contract: number
  authType: number
  url: string
  path: string
  namespaceAddress: string
  messageFormat: number
  authValue: string
  description: string
  solutionUniqueName: string
}

export function makeAssemblyForm(
  inspection?: PluginAssemblyInspection,
  assembly?: PluginAssemblySummary,
): AssemblyForm {
  return {
    localPath: inspection?.localPath ?? "",
    name: inspection?.assemblyName ?? assembly?.name ?? "",
    version: inspection?.version ?? assembly?.version ?? "1.0.0.0",
    culture: inspection?.culture ?? assembly?.culture ?? "neutral",
    publicKeyToken:
      inspection?.publicKeyToken ?? assembly?.publicKeyToken ?? "null",
    isolationMode: 2,
    sourceType: 0,
    description: assembly?.description ?? "",
    solutionUniqueName: "",
  }
}

export function makeStepForm(
  snapshot: PluginRegistrationSnapshot,
  step?: PluginStepSummary,
): StepForm {
  return {
    stepId: step?.id,
    handlerType: step?.handlerType ?? "plugintype",
    pluginTypeId: step?.pluginTypeId ?? snapshot.types[0]?.id ?? "",
    serviceEndpointId:
      step?.serviceEndpointId ?? snapshot.endpoints[0]?.id ?? "",
    messageId: step?.messageId ?? "",
    messageText:
      step?.messageName ??
      snapshot.messages.find(
        (message) => message.id === step?.messageId,
      )?.name ??
      "",
    messageFilterId: step?.messageFilterId ?? "__none__",
    name: step?.name ?? "",
    stage: step?.stage ?? 20,
    mode: step?.mode ?? 0,
    rank: step?.rank ?? 1,
    supportedDeployment: step?.supportedDeployment ?? 0,
    asyncAutoDelete: step?.asyncAutoDelete ?? false,
    filteringAttributes: step?.filteringAttributes ?? "",
    configuration: step?.configuration ?? "",
    secureConfiguration: "",
    impersonatingUserId: step?.impersonatingUserId ?? "__calling-user__",
    description: step?.description ?? "",
    enabled: step?.stateCode !== 1,
    solutionUniqueName: "",
  }
}

export function generatedStepName(
  form: StepForm,
  snapshot: PluginRegistrationSnapshot,
  messageFilters: readonly PluginMessageFilterSummary[],
): string {
  const handler = form.handlerType === "plugintype"
    ? snapshot.types.find((type) => type.id === form.pluginTypeId)?.typeName
    : snapshot.endpoints.find((endpoint) => endpoint.id === form.serviceEndpointId)?.name
  const message = snapshot.messages.find((item) => item.id === form.messageId)?.name
  if (!handler || !message) {
    return ""
  }

  const entity = messageFilters.find((filter) => filter.id === form.messageFilterId)
    ?.primaryEntity ?? "any entity"
  return `${handler}: ${message} of ${entity}`
}

export function makeImageForm(
  snapshot: PluginRegistrationSnapshot,
  image?: PluginStepImageSummary,
): ImageForm {
  return {
    imageId: image?.id,
    stepId: image?.stepId ?? snapshot.steps[0]?.id ?? "",
    name: image?.name ?? "",
    entityAlias: image?.entityAlias ?? "Image",
    imageType: image?.imageType ?? 0,
    messagePropertyName: image?.messagePropertyName ?? "Target",
    attributes: image?.attributes ?? "",
    description: image?.description ?? "",
    solutionUniqueName: "",
  }
}

export function makeEndpointForm(
  snapshot: PluginRegistrationSnapshot,
  endpoint?: PluginServiceEndpointSummary,
): EndpointForm {
  return {
    endpointId: endpoint?.id,
    name: endpoint?.name ?? "",
    contract:
      endpoint?.contract ?? snapshot.endpointContractOptions[0]?.value ?? 8,
    authType:
      endpoint?.authType ?? snapshot.endpointAuthTypeOptions[0]?.value ?? 4,
    url: endpoint?.url ?? "",
    path: endpoint?.path ?? "",
    namespaceAddress: endpoint?.namespaceAddress ?? "",
    messageFormat: endpoint?.messageFormat ?? 2,
    authValue: "",
    description: endpoint?.description ?? "",
    solutionUniqueName: "",
  }
}
