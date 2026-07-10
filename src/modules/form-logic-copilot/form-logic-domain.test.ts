import { describe, expect, it } from "vitest"

import type { FormLogicFormContext } from "@/core/dataverse/schemas"
import {
  bindingSuggestionsForContext,
  browserPreviewGeneratedDraft,
  buildGenerationPrompt,
  buildRevisionPrompt,
  compactPromptContext,
  libraryObjectName,
  parseFormXml,
  webResourceDefaults,
  type FormXmlDocument,
  type FormXmlElement,
} from "@/modules/form-logic-copilot/form-logic-domain"

class TestXmlElement implements FormXmlElement {
  readonly children: TestXmlElement[] = []
  readonly tagName: string
  parentElement: TestXmlElement | null = null
  private readonly attributes: ReadonlyMap<string, string>

  constructor(
    tagName: string,
    attributes: ReadonlyMap<string, string>,
  ) {
    this.tagName = tagName
    this.attributes = attributes
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }
}

class TestXmlDocument implements FormXmlDocument {
  private readonly roots: readonly TestXmlElement[]

  constructor(roots: readonly TestXmlElement[]) {
    this.roots = roots
  }

  querySelector(selector: string): FormXmlElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FormXmlElement[] {
    const matches: FormXmlElement[] = []
    const normalizedSelector = selector.toLowerCase()

    const visit = (element: TestXmlElement): void => {
      if (element.tagName.toLowerCase() === normalizedSelector) {
        matches.push(element)
      }
      for (const child of element.children) {
        visit(child)
      }
    }

    for (const root of this.roots) {
      visit(root)
    }
    return matches
  }
}

function parseTestXml(formXml: string): FormXmlDocument {
  const roots: TestXmlElement[] = []
  const stack: TestXmlElement[] = []
  const tags = formXml.matchAll(/<\s*(\/?)([a-zA-Z0-9:_-]+)([^>]*)>/g)

  for (const tag of tags) {
    const tagName = tag[2]
    if (!tagName) {
      continue
    }

    if (tag[1] === "/") {
      stack.pop()
      continue
    }

    const attributeText = tag[3] ?? ""
    const attributes = new Map<string, string>()
    for (const attribute of attributeText.matchAll(
      /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g,
    )) {
      const name = attribute[1]
      const value = attribute[2]
      if (name && value !== undefined) {
        attributes.set(name, value)
      }
    }

    const element = new TestXmlElement(tagName, attributes)
    const parent = stack.at(-1)
    if (parent) {
      element.parentElement = parent
      parent.children.push(element)
    } else {
      roots.push(element)
    }

    if (!/\/\s*$/.test(attributeText)) {
      stack.push(element)
    }
  }

  return new TestXmlDocument(roots)
}

const formXml = `<form>
  <events>
    <event name="onload">
      <Handlers>
        <Handler libraryName="new_/account.js" functionName="AccountLibrary.onLoad" />
      </Handlers>
    </event>
  </events>
  <tabs>
    <tab name="general">
      <labels>
        <label description="General" languagecode="1033" />
      </labels>
      <columns>
        <column>
          <sections>
            <section name="account_information">
              <labels>
                <label description="Account Information" languagecode="1033" />
              </labels>
              <rows>
                <row>
                  <cell>
                    <labels>
                      <label description="Account Name" languagecode="1033" />
                    </labels>
                    <control id="name-control" datafieldname="name" />
                  </cell>
                  <cell>
                    <labels>
                      <label description="Status" languagecode="1033" />
                    </labels>
                    <control id="status-control" datafieldname="statuscode">
                      <events>
                        <event name="onchange">
                          <Handlers>
                            <Handler libraryName="new_/account.js" functionName="AccountLibrary.onStatuscodeChange" />
                          </Handlers>
                        </event>
                      </events>
                    </control>
                  </cell>
                </row>
              </rows>
            </section>
          </sections>
        </column>
      </columns>
    </tab>
  </tabs>
</form>`

const optionValues = Array.from({ length: 35 }, (_, index) => ({
  value: index + 1,
  label: `Status ${index + 1}`,
}))

const formContext: FormLogicFormContext = {
  entity: {
    logicalName: "account",
    entitySetName: "accounts",
    displayName: "Account",
    primaryNameAttribute: "name",
    primaryIdAttribute: "accountid",
  },
  form: {
    id: "account-main-form",
    name: "Account main information",
    typeCode: 2,
    typeLabel: "Main",
    description: "Main account form",
    isDefault: true,
    isManaged: false,
    formActivationState: 1,
  },
  formXml,
  source: "dataverse",
  attributes: [
    {
      logicalName: "name",
      displayName: "Account Name",
      attributeType: "String",
      requiredLevel: "ApplicationRequired",
      isValidForRead: true,
    },
    {
      logicalName: "statuscode",
      displayName: "Status",
      attributeType: "Status",
      requiredLevel: "None",
      isValidForRead: true,
      optionValues,
    },
    {
      logicalName: "primarycontactid",
      displayName: "Primary Contact",
      attributeType: "Lookup",
      requiredLevel: "None",
      isValidForRead: true,
      lookupTargets: ["contact"],
    },
  ],
}

describe("Form Logic domain", () => {
  it("maps representative FormXML into tabs, sections, controls, events, and fields", () => {
    const context = parseFormXml(formContext, parseTestXml)

    expect(context.tabs).toEqual([{ name: "general", label: "General" }])
    expect(context.sections).toEqual([
      {
        name: "account_information",
        label: "Account Information",
        tabName: "general",
        tabLabel: "General",
      },
    ])
    expect(context.controls).toEqual([
      {
        id: "name-control",
        fieldLogicalName: "name",
        label: "Account Name",
        sectionName: "account_information",
        sectionLabel: "Account Information",
        tabName: "general",
        tabLabel: "General",
      },
      {
        id: "status-control",
        fieldLogicalName: "statuscode",
        label: "Status",
        sectionName: "account_information",
        sectionLabel: "Account Information",
        tabName: "general",
        tabLabel: "General",
      },
    ])
    expect(context.events).toEqual([
      {
        ownerType: "form",
        owner: "Account main information",
        eventName: "onload",
        handlers: ["new_/account.js AccountLibrary.onLoad"],
      },
      {
        ownerType: "control",
        owner: "statuscode",
        eventName: "onchange",
        handlers: ["new_/account.js AccountLibrary.onStatuscodeChange"],
      },
    ])
    expect(context.fields).toMatchObject([
      {
        logicalName: "name",
        controlIds: ["name-control"],
        tabName: "general",
        sectionName: "account_information",
      },
      {
        logicalName: "statuscode",
        controlIds: ["status-control"],
        tabName: "general",
        sectionName: "account_information",
      },
      {
        logicalName: "primarycontactid",
        controlIds: [],
      },
    ])
  })

  it("derives stable library, web-resource, and browser-preview defaults", () => {
    const mainContext = parseFormXml(formContext, parseTestXml)
    const quickCreateContext = parseFormXml(
      {
        ...formContext,
        form: {
          ...formContext.form,
          name: "Account quick create",
          typeCode: 7,
          typeLabel: "Quick Create",
        },
      },
      parseTestXml,
    )

    expect(libraryObjectName(mainContext)).toBe("AccountLibrary")
    expect(webResourceDefaults(mainContext)).toEqual({
      logicalName: "accountformlogic.js",
      displayName: "Account Main Logic",
      description: "Form logic for Account Account main information",
    })
    expect(webResourceDefaults(quickCreateContext).logicalName).toBe(
      "accountquickcreatelogic.js",
    )
    expect(browserPreviewGeneratedDraft(mainContext)).toMatchObject({
      logicalName: "accountformlogic.js",
      displayName: "Account Main Logic",
      description: "Form logic for Account Account main information",
      source: expect.stringContaining(
        'formContext.ui.tabs.get("general")',
      ),
    })
  })

  it("compacts prompt context and limits option metadata", () => {
    const context = parseFormXml(formContext, parseTestXml)
    const compact = compactPromptContext(context)
    const serialized = JSON.stringify(compact)

    expect(compact.fields[1]?.options).toHaveLength(30)
    expect(compact.fields[2]).toMatchObject({
      logicalName: "primarycontactid",
      lookupTargets: ["contact"],
      controlIds: [],
    })
    expect(compact.controls[0]).toEqual({
      id: "name-control",
      fieldLogicalName: "name",
      label: "Account Name",
      tab: "general",
      section: "account_information",
    })
    expect(serialized).not.toContain("<form>")
    expect(serialized).not.toContain("isValidForRead")

    const generationPrompt = buildGenerationPrompt({
      context,
      request: "Hide the status field for new records.",
    })
    const revisionPrompt = buildRevisionPrompt({
      context,
      currentSource: "var AccountLibrary = AccountLibrary || {};",
      changeRequest: "Keep the field visible for administrators.",
    })

    expect(generationPrompt).toContain(
      "Hide the status field for new records.",
    )
    expect(generationPrompt).toContain("AccountLibrary.onLoad")
    expect(generationPrompt).not.toContain("<form>")
    expect(revisionPrompt).toContain(
      "Keep the field visible for administrators.",
    )
    expect(revisionPrompt).toContain(
      "var AccountLibrary = AccountLibrary || {};",
    )
  })

  it("suggests one OnLoad binding and at most four unique OnChange bindings", () => {
    const context = parseFormXml(formContext, parseTestXml)
    const suggestions = bindingSuggestionsForContext({
      ...context,
      events: [
        ...context.events,
        {
          ownerType: "control",
          owner: "statuscode",
          eventName: "onchange",
          handlers: [],
        },
        {
          ownerType: "control",
          owner: "primarycontactid",
          eventName: "onchange",
          handlers: [],
        },
        {
          ownerType: "control",
          owner: "credit-limit",
          eventName: "onchange",
          handlers: [],
        },
        {
          ownerType: "control",
          owner: "address1_city",
          eventName: "onchange",
          handlers: [],
        },
        {
          ownerType: "control",
          owner: "name",
          eventName: "onchange",
          handlers: [],
        },
      ],
    })

    expect(bindingSuggestionsForContext()).toEqual([])
    expect(suggestions).toEqual([
      {
        id: "account-main-form-onload",
        target: "Account main information form",
        eventLabel: "Form OnLoad",
        handler: "AccountLibrary.onLoad",
        status: "ready",
      },
      {
        id: "account-main-form-statuscode-onchange",
        target: "statuscode",
        eventLabel: "Field OnChange",
        handler: "AccountLibrary.onStatuscodeChange",
        status: "review",
      },
      {
        id: "account-main-form-primarycontactid-onchange",
        target: "primarycontactid",
        eventLabel: "Field OnChange",
        handler: "AccountLibrary.onPrimarycontactidChange",
        status: "review",
      },
      {
        id: "account-main-form-credit-limit-onchange",
        target: "credit-limit",
        eventLabel: "Field OnChange",
        handler: "AccountLibrary.onCreditLimitChange",
        status: "review",
      },
      {
        id: "account-main-form-address1_city-onchange",
        target: "address1_city",
        eventLabel: "Field OnChange",
        handler: "AccountLibrary.onAddress1CityChange",
        status: "review",
      },
    ])
  })
})
