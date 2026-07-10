import type {
  FormLogicAttributeMetadata,
  FormLogicFormContext,
  FormLogicOptionValue,
} from "@/core/dataverse/schemas"
import type { GeneratedDraft } from "@/modules/form-logic-copilot/generated-draft"

export type ParsedTab = {
  name: string
  label: string
}

export type ParsedSection = {
  name: string
  label: string
  tabName?: string
  tabLabel?: string
}

export type ParsedControl = {
  id: string
  label: string
  fieldLogicalName?: string
  sectionName?: string
  sectionLabel?: string
  tabName?: string
  tabLabel?: string
}

export type ParsedEvent = {
  ownerType: "form" | "control"
  owner: string
  eventName: string
  handlers: string[]
}

export type StructuredField = FormLogicAttributeMetadata & {
  controlIds: string[]
  sectionName?: string
  sectionLabel?: string
  tabName?: string
  tabLabel?: string
}

export type StructuredFormContext = {
  raw: FormLogicFormContext
  tabs: ParsedTab[]
  sections: ParsedSection[]
  controls: ParsedControl[]
  events: ParsedEvent[]
  fields: StructuredField[]
}

export type BindingSuggestion = {
  id: string
  target: string
  eventLabel: string
  handler: string
  status: "ready" | "review"
}

export type WebResourceDefaults = {
  logicalName: string
  displayName: string
  description: string
}

export type CompactPromptContext = {
  source: FormLogicFormContext["source"]
  entity: {
    logicalName: string
    displayName: string
    entitySetName: string
    primaryNameAttribute?: string
    primaryIdAttribute?: string
  }
  form: {
    id: string
    name: string
    type: string
    isDefault: boolean
    isManaged: boolean
  }
  fields: Array<{
    logicalName: string
    displayName: string
    type: string
    requiredLevel?: string
    controlIds: string[]
    tab?: string
    section?: string
    lookupTargets?: string[]
    options?: FormLogicOptionValue[]
  }>
  tabs: ParsedTab[]
  sections: ParsedSection[]
  controls: Array<{
    id: string
    fieldLogicalName?: string
    label: string
    tab?: string
    section?: string
  }>
  events: Array<{
    ownerType: ParsedEvent["ownerType"]
    owner: string
    eventName: string
    handlers: string[]
  }>
}

export type FormXmlElement = {
  readonly tagName: string
  readonly children: Iterable<FormXmlElement>
  readonly parentElement: FormXmlElement | null
  getAttribute(name: string): string | null
}

export type FormXmlDocument = {
  querySelector(selector: string): FormXmlElement | null
  querySelectorAll(selector: string): Iterable<FormXmlElement>
}

export type FormXmlParser = (formXml: string) => FormXmlDocument

function parseWithDomParser(formXml: string): FormXmlDocument {
  return new DOMParser().parseFromString(formXml, "application/xml")
}

function directChild(
  element: FormXmlElement,
  name: string,
): FormXmlElement | undefined {
  return Array.from(element.children).find(
    (child) => child.tagName.toLowerCase() === name,
  )
}

function labelFromElement(element: FormXmlElement, fallback: string): string {
  const labels = directChild(element, "labels")
  const label = labels
    ? Array.from(labels.children).find(
        (child) => child.tagName.toLowerCase() === "label",
      )
    : undefined

  return (
    label?.getAttribute("description")?.trim() ||
    element.getAttribute("label")?.trim() ||
    fallback
  )
}

function closestByTag(
  element: FormXmlElement,
  tagName: string,
): FormXmlElement | undefined {
  let current = element.parentElement
  while (current) {
    if (current.tagName.toLowerCase() === tagName) {
      return current
    }
    current = current.parentElement
  }
  return undefined
}

function uniqueByName<T extends { name: string }>(items: readonly T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.name, item])).values())
}

export function parseFormXml(
  context: FormLogicFormContext,
  parseXml: FormXmlParser = parseWithDomParser,
): StructuredFormContext {
  const document = parseXml(context.formXml)
  const hasParseError = document.querySelector("parsererror")
  if (hasParseError) {
    return {
      raw: context,
      tabs: [],
      sections: [],
      controls: [],
      events: [],
      fields: context.attributes.map((attribute) => ({
        ...attribute,
        controlIds: [],
      })),
    }
  }

  const tabs = uniqueByName(
    Array.from(document.querySelectorAll("tab")).map((tab, index) => {
      const name = tab.getAttribute("name")?.trim() || `tab-${index + 1}`
      return {
        name,
        label: labelFromElement(tab, name),
      }
    }),
  )

  const sections = uniqueByName(
    Array.from(document.querySelectorAll("section")).map((section, index) => {
      const tab = closestByTag(section, "tab")
      const tabName = tab?.getAttribute("name")?.trim()
      const sectionName =
        section.getAttribute("name")?.trim() || `section-${index + 1}`
      return {
        name: sectionName,
        label: labelFromElement(section, sectionName),
        tabName,
        tabLabel: tab ? labelFromElement(tab, tabName ?? "Tab") : undefined,
      }
    }),
  )

  const controls = Array.from(document.querySelectorAll("control")).map(
    (control, index) => {
      const section = closestByTag(control, "section")
      const tab = closestByTag(control, "tab")
      const fieldLogicalName = control.getAttribute("datafieldname")?.trim()
      const id =
        control.getAttribute("id")?.trim() ||
        fieldLogicalName ||
        `control-${index + 1}`
      const sectionName = section?.getAttribute("name")?.trim()
      const tabName = tab?.getAttribute("name")?.trim()
      const cell = closestByTag(control, "cell")

      return {
        id,
        fieldLogicalName,
        label: cell ? labelFromElement(cell, fieldLogicalName ?? id) : id,
        sectionName,
        sectionLabel: section
          ? labelFromElement(section, sectionName ?? "Section")
          : undefined,
        tabName,
        tabLabel: tab ? labelFromElement(tab, tabName ?? "Tab") : undefined,
      }
    },
  )

  const events = Array.from(document.querySelectorAll("event")).map((event) => {
    const control = closestByTag(event, "control")
    const owner =
      control?.getAttribute("datafieldname")?.trim() ||
      control?.getAttribute("id")?.trim() ||
      context.form.name
    const handlers = Array.from(event.children)
      .filter((child) => child.tagName.toLowerCase() === "handlers")
      .flatMap((handlersNode) => Array.from(handlersNode.children))
      .filter((child) => child.tagName.toLowerCase() === "handler")
      .map((handler) => {
        const functionName = handler.getAttribute("functionName")?.trim()
        const libraryName = handler.getAttribute("libraryName")?.trim()
        return [libraryName, functionName].filter(Boolean).join(" ")
      })
      .filter(Boolean)

    return {
      ownerType: control ? "control" : "form",
      owner,
      eventName: event.getAttribute("name")?.trim() || "event",
      handlers,
    } satisfies ParsedEvent
  })

  const controlsByField = new Map<string, ParsedControl[]>()
  for (const control of controls) {
    if (!control.fieldLogicalName) {
      continue
    }
    const current = controlsByField.get(control.fieldLogicalName) ?? []
    current.push(control)
    controlsByField.set(control.fieldLogicalName, current)
  }

  const fields = context.attributes.map((attribute) => {
    const fieldControls = controlsByField.get(attribute.logicalName) ?? []
    const firstControl = fieldControls[0]

    return {
      ...attribute,
      controlIds: fieldControls.map((control) => control.id),
      sectionName: firstControl?.sectionName,
      sectionLabel: firstControl?.sectionLabel,
      tabName: firstControl?.tabName,
      tabLabel: firstControl?.tabLabel,
    }
  })

  return {
    raw: context,
    tabs,
    sections,
    controls,
    events,
    fields,
  }
}

function pascalToken(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")
}

export function libraryObjectName(context: StructuredFormContext): string {
  const token =
    pascalToken(context.raw.entity.displayName) ||
    pascalToken(context.raw.entity.logicalName) ||
    "Form"

  return `${token}Library`
}

export function webResourceDefaults(
  context: StructuredFormContext,
): WebResourceDefaults {
  const formToken =
    context.raw.form.typeLabel === "Quick Create" ? "quickcreate" : "form"

  return {
    logicalName: `${context.raw.entity.logicalName}${formToken}logic.js`,
    displayName: `${context.raw.entity.displayName} ${context.raw.form.typeLabel} Logic`,
    description: `Form logic for ${context.raw.entity.displayName} ${context.raw.form.name}`,
  }
}

function sourceForContext(context: StructuredFormContext): string {
  const libraryName = libraryObjectName(context)
  const firstTabName = context.tabs[0]?.name

  return `var ${libraryName} = ${libraryName} || {};

${libraryName}.onLoad = function (executionContext) {
  var formContext = executionContext.getFormContext();
  ${libraryName}.updateFormState(formContext);
};

${libraryName}.updateFormState = function (formContext) {
  ${firstTabName ? `var tab = formContext.ui.tabs.get("${firstTabName}");` : "var tab = null;"}
  if (tab) {
    tab.setVisible(true);
  }
};`
}

export function compactPromptContext(
  context: StructuredFormContext,
): CompactPromptContext {
  return {
    source: context.raw.source,
    entity: {
      logicalName: context.raw.entity.logicalName,
      displayName: context.raw.entity.displayName,
      entitySetName: context.raw.entity.entitySetName,
      primaryNameAttribute: context.raw.entity.primaryNameAttribute,
      primaryIdAttribute: context.raw.entity.primaryIdAttribute,
    },
    form: {
      id: context.raw.form.id,
      name: context.raw.form.name,
      type: context.raw.form.typeLabel,
      isDefault: context.raw.form.isDefault,
      isManaged: context.raw.form.isManaged,
    },
    fields: context.fields.map((field) => ({
      logicalName: field.logicalName,
      displayName: field.displayName,
      type: field.attributeType,
      requiredLevel: field.requiredLevel,
      controlIds: field.controlIds,
      tab: field.tabName,
      section: field.sectionName,
      lookupTargets: field.lookupTargets,
      options: field.optionValues?.slice(0, 30),
    })),
    tabs: context.tabs,
    sections: context.sections,
    controls: context.controls.map((control) => ({
      id: control.id,
      fieldLogicalName: control.fieldLogicalName,
      label: control.label,
      tab: control.tabName,
      section: control.sectionName,
    })),
    events: context.events.map((event) => ({
      ownerType: event.ownerType,
      owner: event.owner,
      eventName: event.eventName,
      handlers: event.handlers,
    })),
  }
}

export function buildGenerationPrompt(input: {
  context: StructuredFormContext
  request: string
}): string {
  const libraryName = libraryObjectName(input.context)

  return `Generate Dataverse model-driven app form JavaScript for this request.

Request:
${input.request}

The following context was derived from the selected Dataverse table metadata and selected form definition. Use only fields, controls, tabs, sections, options, lookup targets, and events listed here. Do not invent logical names.

${JSON.stringify(compactPromptContext(input.context), null, 2)}

Default manual binding note: register ${libraryName}.onLoad on the form OnLoad event unless the request clearly requires a different exposed handler.

Return only a compact JSON object with these string properties:
- logicalName
- displayName
- description
- source

Return valid JSON only. Do not include a provider name, explanation, markdown fence, or any text before or after the JSON object.

The source must be production-oriented JavaScript for a Dataverse web resource. Follow YAGNI: implement only the requested behavior, prefer the smallest clear script, and do not add speculative helpers, abstractions, configuration, event handlers, or defensive wrappers. Use normal Dataverse client API calls such as executionContext.getFormContext() directly. Do not wrap Dataverse APIs in typeof function checks. Use simple null checks only for returned attributes, controls, tabs, or sections before calling methods on them. Declare var ${libraryName} = ${libraryName} || {}, and expose only the handlers needed by the request directly on ${libraryName}. Create ${libraryName}.onLoad by default. Do not create OnChange handlers unless the request explicitly needs logic to run when a field value changes. Avoid markdown.`
}

export function buildRevisionPrompt(input: {
  context: StructuredFormContext
  currentSource: string
  changeRequest: string
}): string {
  const libraryName = libraryObjectName(input.context)

  return `Revise this Dataverse form JavaScript web resource.

Requested change:
${input.changeRequest}

Selected form context:
${JSON.stringify(compactPromptContext(input.context), null, 2)}

Current source:
${input.currentSource}

Return only a compact JSON object with:
- source: the full revised JavaScript source
- response: one short sentence explaining the change

Return valid JSON only. Do not include a provider name, explanation, markdown fence, or any text before or after the JSON object.

Follow YAGNI: make the smallest clear change, preserve existing structure where possible, use only form context fields/controls/tabs/sections listed above, and do not add speculative helpers, abstractions, configuration, event handlers, or defensive wrappers. Keep executionContext.getFormContext(), do not add typeof function checks around Dataverse APIs, use simple null checks only for returned form objects, keep handlers exposed directly on ${libraryName}, and do not add new event handlers unless the requested change needs them. Avoid markdown.`
}

export function bindingSuggestionsForContext(
  context?: StructuredFormContext,
): BindingSuggestion[] {
  if (!context) {
    return []
  }

  const namespace = libraryObjectName(context)
  const suggestions: BindingSuggestion[] = [
    {
      id: `${context.raw.form.id}-onload`,
      target: `${context.raw.form.name} form`,
      eventLabel: "Form OnLoad",
      handler: `${namespace}.onLoad`,
      status: "ready",
    },
  ]
  const onchangeOwners = context.events
    .filter(
      (event) => event.ownerType === "control" && event.eventName === "onchange",
    )
    .map((event) => event.owner)

  for (const owner of Array.from(new Set(onchangeOwners)).slice(0, 4)) {
    suggestions.push({
      id: `${context.raw.form.id}-${owner}-onchange`,
      target: owner,
      eventLabel: "Field OnChange",
      handler: `${namespace}.on${pascalToken(owner)}Change`,
      status: "review",
    })
  }

  return suggestions
}

export function browserPreviewGeneratedDraft(
  context: StructuredFormContext,
): GeneratedDraft {
  return {
    ...webResourceDefaults(context),
    source: sourceForContext(context),
  }
}
