import type { WebResource } from "@/core/dataverse/schemas"

const createdWebResources: WebResource[] = []
const deletedWebResourceIds = new Set<string>()
const removedSolutionComponentIds = new Set<string>()

export function getCreatedWebResources(): readonly WebResource[] {
  return createdWebResources
}

export function addCreatedWebResource(resource: WebResource): void {
  createdWebResources.push(resource)
}

export function removeCreatedWebResource(webResourceId: string): void {
  const index = createdWebResources.findIndex(
    (resource) => resource.id === webResourceId,
  )
  if (index >= 0) {
    createdWebResources.splice(index, 1)
  }
}

export function markWebResourceDeleted(webResourceId: string): void {
  deletedWebResourceIds.add(webResourceId)
}

export function isWebResourceDeleted(webResourceId: string): boolean {
  return deletedWebResourceIds.has(webResourceId)
}

export function markSolutionComponentRemoved(componentId: string): void {
  removedSolutionComponentIds.add(componentId)
}

export function isSolutionComponentRemoved(componentId: string): boolean {
  return removedSolutionComponentIds.has(componentId)
}
