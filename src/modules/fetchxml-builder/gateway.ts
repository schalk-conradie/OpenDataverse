import { invoke } from "@tauri-apps/api/core"

import { isTauriRuntime } from "@/core/desktop/runtime"
import type {
  DataverseEnvironment,
  FetchXmlEntityMetadata,
  FetchXmlEntitySummary,
  FetchXmlQueryResult,
} from "@/core/dataverse/schemas"

const accountMetadata: FetchXmlEntityMetadata = {
  logicalName: "account",
  entitySetName: "accounts",
  displayName: "Account",
  primaryNameAttribute: "name",
  primaryIdAttribute: "accountid",
  attributes: [
    {
      logicalName: "name",
      displayName: "Account Name",
      attributeType: "String",
      isValidForRead: true,
    },
    {
      logicalName: "accountnumber",
      displayName: "Account Number",
      attributeType: "String",
      isValidForRead: true,
    },
    {
      logicalName: "primarycontactid",
      displayName: "Primary Contact",
      attributeType: "Lookup",
      isValidForRead: true,
    },
    {
      logicalName: "statecode",
      displayName: "Status",
      attributeType: "State",
      isValidForRead: true,
      optionValues: [
        { value: 0, label: "Active" },
        { value: 1, label: "Inactive" },
      ],
    },
    {
      logicalName: "createdon",
      displayName: "Created On",
      attributeType: "DateTime",
      isValidForRead: true,
    },
  ],
  relationships: [
    {
      id: "many-to-one:account_primary_contact",
      schemaName: "account_primary_contact",
      relationshipType: "many-to-one",
      fromEntity: "contact",
      toEntity: "account",
      fromAttribute: "contactid",
      toAttribute: "primarycontactid",
      displayName: "Primary Contact (Contact)",
    },
  ],
}

const contactMetadata: FetchXmlEntityMetadata = {
  logicalName: "contact",
  entitySetName: "contacts",
  displayName: "Contact",
  primaryNameAttribute: "fullname",
  primaryIdAttribute: "contactid",
  attributes: [
    {
      logicalName: "fullname",
      displayName: "Full Name",
      attributeType: "String",
      isValidForRead: true,
    },
    {
      logicalName: "emailaddress1",
      displayName: "Email",
      attributeType: "String",
      isValidForRead: true,
    },
    {
      logicalName: "statecode",
      displayName: "Status",
      attributeType: "State",
      isValidForRead: true,
      optionValues: [
        { value: 0, label: "Active" },
        { value: 1, label: "Inactive" },
      ],
    },
  ],
  relationships: [],
}

const browserMetadata = new Map(
  [accountMetadata, contactMetadata].map((metadata) => [
    metadata.logicalName,
    metadata,
  ]),
)

function browserWebApiUrl(environment: DataverseEnvironment, fetchXml: string) {
  const entityName = fetchXml.match(/<entity\s+[^>]*name=["']([^"']+)["']/i)?.[1]
  const metadata = browserMetadata.get(entityName ?? "account") ?? accountMetadata

  return `${environment.url}/api/data/v9.2/${metadata.entitySetName}?fetchXml=${encodeURIComponent(
    fetchXml,
  )}`
}

export async function listFetchXmlEntities(
  environment: DataverseEnvironment,
): Promise<FetchXmlEntitySummary[]> {
  if (isTauriRuntime()) {
    return invoke<FetchXmlEntitySummary[]>("list_fetchxml_entities", {
      environment,
    })
  }

  return Array.from(browserMetadata.values()).map(
    ({
      logicalName,
      entitySetName,
      displayName,
      primaryNameAttribute,
      primaryIdAttribute,
    }) => ({
      logicalName,
      entitySetName,
      displayName,
      primaryNameAttribute,
      primaryIdAttribute,
    }),
  )
}

export async function getFetchXmlEntityMetadata(
  environment: DataverseEnvironment,
  logicalName: string,
): Promise<FetchXmlEntityMetadata> {
  if (isTauriRuntime()) {
    return invoke<FetchXmlEntityMetadata>("get_fetchxml_entity_metadata", {
      environment,
      logicalName,
    })
  }

  void environment
  return browserMetadata.get(logicalName) ?? accountMetadata
}

export async function executeFetchXml(
  environment: DataverseEnvironment,
  fetchXml: string,
): Promise<FetchXmlQueryResult> {
  if (isTauriRuntime()) {
    return invoke<FetchXmlQueryResult>("execute_fetchxml_query", {
      environment,
      fetchXml,
    })
  }

  return {
    rows: [
      {
        name: "A. Datum Corporation",
        accountnumber: "ACC-1001",
        statecode: 0,
        createdon: "2026-06-12T08:15:00Z",
      },
      {
        name: "Contoso Ltd.",
        accountnumber: "ACC-1002",
        statecode: 0,
        createdon: "2026-06-10T10:30:00Z",
      },
    ],
    columns: ["name", "accountnumber", "statecode", "createdon"],
    entitySetName: "accounts",
    webApiUrl: browserWebApiUrl(environment, fetchXml),
  }
}
