import type { WebResource } from "@/core/dataverse/schemas"

type DownloadJobStatus = "running" | "completed" | "failed"

export type DownloadJobItemStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"

export type DownloadJobItem = {
  id: string
  name: string
  status: DownloadJobItemStatus
  error?: string
}

export type DownloadJob = {
  id: string
  label: string
  targetPath: string
  total: number
  completed: number
  status: DownloadJobStatus
  items: DownloadJobItem[]
  startedAt: number
  completedAt?: number
  current?: string
  error?: string
}

export function createDownloadJob(
  label: string,
  targetPath: string,
  resources: WebResource[],
): DownloadJob {
  const startedAt = Date.now()

  return {
    id: `download:${startedAt}:${Math.random().toString(36).slice(2)}`,
    label,
    targetPath,
    total: resources.length,
    completed: 0,
    status: "running",
    startedAt,
    items: resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      status: "pending",
    })),
  }
}

export function formatDownloadDuration(
  startedAt: number,
  completedAt: number | undefined,
  now: number,
) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor(((completedAt ?? now) - startedAt) / 1000),
  )

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }

  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`
  }

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
