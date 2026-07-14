import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/runtime"
import {
  addCreatedWebResource,
  isSolutionComponentRemoved,
  markSolutionComponentRemoved,
} from "@/core/desktop/preview-workspace"
import type {
  DataverseEnvironment,
  SolutionComponentSummary,
  SolutionDependencyReport,
  SolutionLayer,
  SolutionSummary,
  SolutionWebResourceCandidate,
  SolutionWriteResult,
  WebResource,
  WebResourceImportResult,
} from "@/core/dataverse/schemas"

function isMicrosoftWebResourceName(name: string) {
  const lowerName = name.trim().toLowerCase()

  return ["msdyn", "microsoft", "mscrm", "mspp", "adx_", "cc_"].some(
    (prefix) => lowerName.startsWith(prefix),
  )
}

export type SolutionManagedFilter = "all" | "unmanaged" | "managed"

export async function listSolutions(
  environment: DataverseEnvironment,
  managedFilter: SolutionManagedFilter,
): Promise<SolutionSummary[]> {
  if (isTauriRuntime()) {
    return invoke<SolutionSummary[]>("list_solutions", {
      environment,
      managedFilter,
    })
  }

  const { mockSolutions } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockSolutions
    .filter((solution) => {
      if (managedFilter === "managed") {
        return solution.isManaged
      }

      if (managedFilter === "unmanaged") {
        return !solution.isManaged
      }

      return true
    })
    .sort((left, right) =>
      (right.createdOn ?? "").localeCompare(left.createdOn ?? ""),
    )
}

export async function listSolutionComponents(
  environment: DataverseEnvironment,
  solutionId: string,
): Promise<SolutionComponentSummary[]> {
  if (isTauriRuntime()) {
    return invoke<SolutionComponentSummary[]>("list_solution_components", {
      environment,
      solutionId,
    })
  }

  const { mockSolutionComponents } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockSolutionComponents.filter(
    (component) =>
      component.solutionId === solutionId &&
      !isSolutionComponentRemoved(component.id),
  )
}

export async function getSolutionComponentDependencies(
  environment: DataverseEnvironment,
  component: SolutionComponentSummary,
): Promise<SolutionDependencyReport> {
  if (isTauriRuntime()) {
    return invoke<SolutionDependencyReport>(
      "get_solution_component_dependencies",
      {
        environment,
        objectId: component.objectId,
        componentType: component.componentType,
      },
    )
  }

  const { mockDependencyReport } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockDependencyReport
}

export async function getSolutionComponentLayers(
  environment: DataverseEnvironment,
  component: SolutionComponentSummary,
): Promise<SolutionLayer[]> {
  if (isTauriRuntime()) {
    return invoke<SolutionLayer[]>("get_solution_component_layers", {
      environment,
      objectId: component.objectId,
      componentName: component.layerName ?? component.logicalName ?? component.displayName,
    })
  }

  const { mockSolutionLayers } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockSolutionLayers
}

export async function listSolutionWebResourceCandidates(
  environment: DataverseEnvironment,
  solutionId: string,
): Promise<SolutionWebResourceCandidate[]> {
  if (isTauriRuntime()) {
    return invoke<SolutionWebResourceCandidate[]>(
      "list_solution_web_resource_candidates",
      {
        environment,
        solutionId,
      },
    )
  }

  const { mockWebResourceCandidates } = await import(
    "@/modules/solution-explorer/mock-data"
  )
  return mockWebResourceCandidates.filter(
    (candidate) =>
      !candidate.isManaged && !isMicrosoftWebResourceName(candidate.name),
  )
}

export async function addExistingWebResourceToSolution(
  environment: DataverseEnvironment,
  solutionUniqueName: string,
  webResourceId: string,
): Promise<SolutionWriteResult> {
  if (isTauriRuntime()) {
    return invoke<SolutionWriteResult>("add_existing_web_resource_to_solution", {
      environment,
      solutionUniqueName,
      webResourceId,
    })
  }

  if (webResourceId === "preview-add-existing-error") {
    throw new Error(
      "Browser preview simulated AddSolutionComponent failure: the selected web resource is already managed by another solution layer.",
    )
  }

  return {
    webResourceId,
    message: "Browser preview added the web resource to the solution.",
  } satisfies SolutionWriteResult
}

export async function removeSolutionComponentFromSolution(
  environment: DataverseEnvironment,
  solutionUniqueName: string,
  component: SolutionComponentSummary,
): Promise<SolutionWriteResult> {
  if (isTauriRuntime()) {
    return invoke<SolutionWriteResult>("remove_solution_component_from_solution", {
      environment,
      solutionUniqueName,
      componentObjectId: component.objectId,
      componentType: component.componentType,
      displayName: component.displayName,
    })
  }

  markSolutionComponentRemoved(component.id)

  return {
    message: `Browser preview removed ${component.displayName} from ${solutionUniqueName}.`,
  } satisfies SolutionWriteResult
}

export async function createWebResourceInSolution(
  environment: DataverseEnvironment,
  input: {
    solutionUniqueName: string
    name: string
    displayName: string
    description: string
    type: WebResource["type"]
    content: string
  },
): Promise<SolutionWriteResult> {
  if (isTauriRuntime()) {
    return invoke<SolutionWriteResult>("create_web_resource_in_solution", {
      environment,
      input,
    })
  }

  const webResourceId = `browser-${Date.now().toString(36)}`
  addCreatedWebResource({
    id: webResourceId,
    name: input.name,
    type: input.type,
    version: "Browser preview",
    isManaged: false,
    solution: input.solutionUniqueName,
    modifiedOn: new Date().toISOString(),
    modifiedBy: {
      name: "Browser preview user",
    },
  })

  return {
    webResourceId,
    message: `Browser preview created ${input.name} in ${input.solutionUniqueName}.`,
  } satisfies SolutionWriteResult
}

export async function importWebResourcesInSolution(
  environment: DataverseEnvironment,
  input: {
    solutionUniqueName: string
    sourcePaths: string[]
    targetRoot: string
    description: string
  },
): Promise<WebResourceImportResult> {
  if (isTauriRuntime()) {
    return invoke<WebResourceImportResult>("import_web_resources_in_solution", {
      environment,
      input,
    })
  }

  const targetRoot = input.targetRoot.replace(/^\/+|\/+$/g, "")
  const imported = input.sourcePaths.map((sourcePath, index) => {
    const fileName = sourcePath.split(/[\\/]/).filter(Boolean).at(-1) ?? `file-${index}`

    return {
      sourcePath,
      name: targetRoot ? `${targetRoot}/${fileName}` : fileName,
      type: fileName.endsWith(".css")
        ? "css"
        : fileName.endsWith(".html") || fileName.endsWith(".htm")
          ? "html"
          : "js",
      webResourceId: `browser-import-${index}`,
    } satisfies WebResourceImportResult["imported"][number]
  })

  return {
    imported,
    skipped: [],
    message: `Browser preview imported ${imported.length} web resources.`,
  } satisfies WebResourceImportResult
}
