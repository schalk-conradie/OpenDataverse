import type { WebResource } from "@/core/dataverse/schemas"

export function isWebResourceEditable(resource?: WebResource) {
  if (!resource || !resource.isManaged) {
    return true
  }

  return resource.isCustomizable === true
}

export function webResourceTypeLabel(resource: WebResource) {
  const labels: Record<WebResource["type"], string> = {
    html: "HTML",
    css: "CSS",
    js: "JS",
    xml: "XML",
    image: "IMG",
    resx: "RESX",
  }

  return labels[resource.type]
}
