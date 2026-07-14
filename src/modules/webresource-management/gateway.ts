import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/runtime"
import {
  getCreatedWebResources,
  isWebResourceDeleted,
  markWebResourceDeleted,
  removeCreatedWebResource,
} from "@/core/desktop/preview-workspace"
import type {
  DataverseEnvironment,
  DeleteWebResourcesResult,
  DownloadWebResourcesResult,
  PublishResult,
  WebResource,
  WebResourceActivity,
  WebResourceBinding,
  WebResourceContent,
} from "@/core/dataverse/schemas"

function browserWebResourceContent(resource: WebResource): WebResourceContent {
  const lowerName = resource.name.toLowerCase()
  const binaryImageContentByExtension: Record<
    string,
    { content: string; mimeType: string }
  > = {
    ".png": {
      content:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      mimeType: "image/png",
    },
    ".jpg": {
      content:
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
      mimeType: "image/jpeg",
    },
    ".jpeg": {
      content:
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ap//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
      mimeType: "image/jpeg",
    },
    ".gif": {
      content: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      mimeType: "image/gif",
    },
    ".ico": {
      content:
        "AAABAAEBAQEAAAEAIiwAAABWAAAAKAAAABAAAAAgAAAAAQAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      mimeType: "image/x-icon",
    },
  }

  const imageContent = Object.entries(binaryImageContentByExtension).find(
    ([extension]) => lowerName.endsWith(extension),
  )?.[1]

  if (resource.type === "image" && imageContent) {
    return {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      language: "binary",
      content: imageContent.content,
      contentEncoding: "base64",
      mimeType: imageContent.mimeType,
    }
  }

  if (lowerName.endsWith(".xsl") || lowerName.endsWith(".xslt")) {
    return {
      id: resource.id,
      name: resource.name,
      type: "xml",
      language: "xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <section class="account-summary">
      <xsl:value-of select="/account/name" />
    </section>
  </xsl:template>
</xsl:stylesheet>`,
      contentEncoding: "text",
      mimeType: "application/xslt+xml",
    }
  }

  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    language:
      resource.type === "css"
        ? "css"
        : resource.type === "html"
          ? "html"
          : "javascript",
    content: `function onLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  const accountName = formContext.getAttribute("name")?.getValue();

  if (accountName) {
    console.log("Account loaded", accountName);
  }
}`,
    contentEncoding: "text",
    mimeType: "application/javascript",
  }
}

export async function listWebResources(
  environment: DataverseEnvironment,
  includeManaged: boolean,
): Promise<WebResource[]> {
  if (isTauriRuntime()) {
    return invoke<WebResource[]>("list_web_resources", {
      environment,
      includeManaged,
    })
  }

  const { mockWebResources } = await import(
    "./mock-data"
  )
  return [...mockWebResources, ...getCreatedWebResources()].filter(
    (resource) =>
      !isWebResourceDeleted(resource.id) &&
      resource.isCustomizable !== false &&
      (includeManaged || !resource.isManaged),
  )
}

export async function getWebResourceContent(
  environment: DataverseEnvironment,
  webResourceId: string,
): Promise<WebResourceContent> {
  if (isTauriRuntime()) {
    return invoke<WebResourceContent>("get_web_resource_content", {
      environment,
      webResourceId,
    })
  }

  const { mockWebResources } = await import(
    "./mock-data"
  )
  const resource = [...mockWebResources, ...getCreatedWebResources()].find(
    (item) => item.id === webResourceId,
  )
  if (resource) {
    return browserWebResourceContent(resource)
  }

  return {
    id: webResourceId,
    name: "new_/scripts/account-form.js",
    type: "js",
    language: "javascript",
    content: `function onLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  const accountName = formContext.getAttribute("name")?.getValue();

  if (accountName) {
    console.log("Account loaded", accountName);
  }
}`,
    contentEncoding: "text",
    mimeType: "application/javascript",
  } satisfies WebResourceContent
}

export async function listWebResourceActivity(
  environment: DataverseEnvironment,
): Promise<WebResourceActivity[]> {
  if (isTauriRuntime()) {
    return invoke<WebResourceActivity[]>("list_web_resource_activity", {
      environment,
    })
  }

  const { mockWebResourceActivity } = await import(
    "./mock-data"
  )
  return mockWebResourceActivity
}

export async function deleteWebResources(
  environment: DataverseEnvironment,
  webResourceIds: string[],
): Promise<DeleteWebResourcesResult> {
  if (isTauriRuntime()) {
    return invoke<DeleteWebResourcesResult>("delete_web_resources", {
      environment,
      webResourceIds,
    })
  }

  for (const webResourceId of webResourceIds) {
    markWebResourceDeleted(webResourceId)
    removeCreatedWebResource(webResourceId)
  }

  return {
    deleted: webResourceIds.length,
    message: `Browser preview deleted ${webResourceIds.length} web resource${
      webResourceIds.length === 1 ? "" : "s"
    }.`,
  } satisfies DeleteWebResourcesResult
}

export async function downloadWebResources(
  environment: DataverseEnvironment,
  input: {
    webResourceIds: string[]
    targetPath: string
    preservePaths: boolean
  },
): Promise<DownloadWebResourcesResult> {
  if (isTauriRuntime()) {
    return invoke<DownloadWebResourcesResult>("download_web_resources", {
      environment,
      webResourceIds: input.webResourceIds,
      targetPath: input.targetPath,
      preservePaths: input.preservePaths,
    })
  }

  return {
    downloaded: input.webResourceIds.length,
    targetPath: input.targetPath,
    message: `Browser preview downloaded ${input.webResourceIds.length} web resource${
      input.webResourceIds.length === 1 ? "" : "s"
    }.`,
  } satisfies DownloadWebResourcesResult
}

export async function publishWebResource(
  environment: DataverseEnvironment,
  binding: WebResourceBinding,
): Promise<PublishResult> {
  if (isTauriRuntime()) {
    return invoke<PublishResult>("publish_web_resource", {
      environment,
      binding,
    })
  }

  return {
    webResourceId: binding.webResourceId,
    webResourceName: binding.webResourceName,
    message: `Browser preview cannot publish ${binding.webResourceName}`,
  } satisfies PublishResult
}

export async function saveWebResourceContent(
  environment: DataverseEnvironment,
  content: WebResourceContent,
  publish: boolean,
): Promise<PublishResult> {
  if (isTauriRuntime()) {
    return invoke<PublishResult>("save_web_resource_content", {
      environment,
      webResourceId: content.id,
      webResourceName: content.name,
      content: content.content,
      publish,
    })
  }

  return {
    webResourceId: content.id,
    webResourceName: content.name,
    message: publish
      ? `Browser preview cannot publish ${content.name}`
      : `Browser preview saved ${content.name}`,
  } satisfies PublishResult
}
