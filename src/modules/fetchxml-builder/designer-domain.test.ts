import { describe, expect, it } from "vitest"

import type { FetchXmlEntityMetadata } from "@/core/dataverse/schemas"
import {
  removeNode,
  updateConditionNode,
  updateGroupNode,
  updateRelatedNode,
  type FilterCondition,
  type FilterGroupNode,
  type RelatedFilterNode,
} from "@/modules/fetchxml-builder/designer-domain"
import { buildDesignerFetchXml } from "@/modules/fetchxml-builder/designer-xml"

const accountMetadata: FetchXmlEntityMetadata = {
  logicalName: "account",
  entitySetName: "accounts",
  displayName: "Account",
  primaryNameAttribute: "name",
  primaryIdAttribute: "accountid",
  attributes: [
    {
      logicalName: "accountid",
      displayName: "Account",
      attributeType: "UniqueIdentifier",
      isValidForRead: true,
    },
    {
      logicalName: "name",
      displayName: "Account Name",
      attributeType: "String",
      isValidForRead: true,
    },
    {
      logicalName: "revenue",
      displayName: "Annual Revenue",
      attributeType: "Money",
      isValidForRead: true,
    },
    {
      logicalName: "statecode",
      displayName: "Status",
      attributeType: "State",
      isValidForRead: true,
    },
  ],
  relationships: [],
}

const contactMetadata: FetchXmlEntityMetadata = {
  logicalName: "contact",
  entitySetName: "contacts",
  displayName: "Contact",
  primaryNameAttribute: "fullname",
  primaryIdAttribute: "contactid",
  attributes: [
    {
      logicalName: "lastname",
      displayName: "Last Name",
      attributeType: "String",
      isValidForRead: true,
    },
  ],
  relationships: [],
}

function createNestedFilterTree(): {
  root: FilterGroupNode
  outerGroup: FilterGroupNode
  related: RelatedFilterNode
  target: FilterCondition
  sibling: FilterCondition
} {
  const target: FilterCondition = {
    type: "condition",
    id: "target-condition",
    attribute: "lastname",
    operator: "eq",
    value: "Original",
  }
  const sibling: FilterCondition = {
    type: "condition",
    id: "sibling-condition",
    attribute: "lastname",
    operator: "not-null",
    value: "",
  }
  const relatedGroup: FilterGroupNode = {
    type: "group",
    id: "related-group",
    conjunction: "and",
    children: [target, sibling],
  }
  const related: RelatedFilterNode = {
    type: "related",
    id: "related-node",
    relationshipId: "account-primary-contact",
    relatedEntity: "contact",
    relatedLabel: "Primary Contact",
    fromAttribute: "contactid",
    toAttribute: "primarycontactid",
    relationshipType: "many-to-one",
    group: relatedGroup,
  }
  const outerGroup: FilterGroupNode = {
    type: "group",
    id: "outer-group",
    conjunction: "and",
    children: [related],
  }
  const root: FilterGroupNode = {
    type: "group",
    id: "root-group",
    conjunction: "and",
    children: [outerGroup],
  }

  return { root, outerGroup, related, target, sibling }
}

describe("FetchXML designer domain", () => {
  it("generates nested filters and related-table XML with escaped values", () => {
    const rootGroup: FilterGroupNode = {
      type: "group",
      id: "root",
      conjunction: "and",
      children: [
        {
          type: "condition",
          id: "name-filter",
          attribute: "name",
          operator: "like",
          value: '  Acme & "Sons" <HQ>  ',
        },
        {
          type: "group",
          id: "financial-filter",
          conjunction: "or",
          children: [
            {
              type: "condition",
              id: "revenue-filter",
              attribute: "revenue",
              operator: "gt",
              value: "100",
            },
            {
              type: "condition",
              id: "state-filter",
              attribute: "statecode",
              operator: "null",
              value: "ignored",
            },
          ],
        },
        {
          type: "related",
          id: "contact-filter",
          relatedEntity: "contact",
          fromAttribute: "parentcustomerid",
          toAttribute: "accountid",
          group: {
            type: "group",
            id: "contact-group",
            conjunction: "and",
            children: [
              {
                type: "condition",
                id: "lastname-filter",
                attribute: "lastname",
                operator: "eq",
                value: 'O"Brien & Co',
              },
            ],
          },
        },
        {
          type: "condition",
          id: "empty-filter",
          attribute: "name",
          operator: "eq",
          value: "   ",
        },
      ],
    }

    expect(
      buildDesignerFetchXml({
        metadata: accountMetadata,
        metadataByEntity: new Map([
          [accountMetadata.logicalName, accountMetadata],
          [contactMetadata.logicalName, contactMetadata],
        ]),
        selectedColumns: ["accountid", "name"],
        rootGroup,
        rowCount: 25,
      }),
    ).toBe(`<fetch count="25">
  <entity name="account">
    <attribute name="accountid" />
    <attribute name="name" />
    <filter type="and">
      <condition attribute="name" operator="like" value="%Acme &amp; &quot;Sons&quot; &lt;HQ&gt;%" />
      <filter type="or">
        <condition attribute="revenue" operator="gt" value="100" />
        <condition attribute="statecode" operator="null" />
      </filter>
      <link-entity name="contact" from="parentcustomerid" to="accountid" link-type="inner">
        <filter type="and">
          <condition attribute="lastname" operator="eq" value="O&quot;Brien &amp; Co" />
        </filter>
      </link-entity>
    </filter>
  </entity>
</fetch>`)
  })

  it("uses the primary name column and clamps the row count for an empty design", () => {
    const rootGroup: FilterGroupNode = {
      type: "group",
      id: "root",
      conjunction: "and",
      children: [],
    }

    expect(
      buildDesignerFetchXml({
        metadata: accountMetadata,
        metadataByEntity: new Map([
          [accountMetadata.logicalName, accountMetadata],
        ]),
        selectedColumns: [],
        rootGroup,
        rowCount: 0,
      }),
    ).toBe(`<fetch count="1">
  <entity name="account">
    <attribute name="name" />
  </entity>
</fetch>`)
  })

  it("updates conditions, groups, and related nodes inside nested filters", () => {
    const { root, outerGroup, related, target, sibling } =
      createNestedFilterTree()
    const conditionUpdated = updateConditionNode(root, target.id, {
      operator: "like",
      value: "Updated",
    })
    const groupUpdated = updateGroupNode(
      conditionUpdated,
      related.group.id,
      (group) => ({ ...group, conjunction: "or" }),
    )
    const relatedUpdated = updateRelatedNode(groupUpdated, related.id, {
      relationshipId: undefined,
      relatedEntity: "lead",
      relatedLabel: "Originating Lead",
    })

    expect(relatedUpdated).toEqual({
      ...root,
      children: [
        {
          ...outerGroup,
          children: [
            {
              ...related,
              relationshipId: undefined,
              relatedEntity: "lead",
              relatedLabel: "Originating Lead",
              group: {
                ...related.group,
                conjunction: "or",
                children: [
                  { ...target, operator: "like", value: "Updated" },
                  sibling,
                ],
              },
            },
          ],
        },
      ],
    })
    expect(target).toMatchObject({ operator: "eq", value: "Original" })
    expect(related.group.conjunction).toBe("and")
  })

  it("removes a condition nested inside a related-table filter", () => {
    const { root, outerGroup, related, target, sibling } =
      createNestedFilterTree()

    expect(removeNode(root, target.id)).toEqual({
      ...root,
      children: [
        {
          ...outerGroup,
          children: [
            {
              ...related,
              group: {
                ...related.group,
                children: [sibling],
              },
            },
          ],
        },
      ],
    })
    expect(related.group.children).toEqual([target, sibling])
  })
})
