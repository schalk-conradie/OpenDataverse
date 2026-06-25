import type {
  FormLogicEntitySummary,
  FormLogicFormContext,
  FormLogicFormSummary,
} from "@/core/dataverse/schemas"

export const mockFormLogicEntities: FormLogicEntitySummary[] = [
  {
    logicalName: "account",
    entitySetName: "accounts",
    displayName: "Account",
    primaryNameAttribute: "name",
    primaryIdAttribute: "accountid",
  },
  {
    logicalName: "contact",
    entitySetName: "contacts",
    displayName: "Contact",
    primaryNameAttribute: "fullname",
    primaryIdAttribute: "contactid",
  },
]

export const mockFormLogicForms: Record<string, FormLogicFormSummary[]> = {
  account: [
    {
      id: "00000000-0000-0000-0000-000000000201",
      name: "Account main information",
      typeCode: 2,
      typeLabel: "Main",
      description: "Browser-preview account form with real FormXML shape.",
      isDefault: true,
      isManaged: false,
      formActivationState: 1,
    },
    {
      id: "00000000-0000-0000-0000-000000000207",
      name: "Account quick create",
      typeCode: 7,
      typeLabel: "Quick Create",
      description: "Compact browser-preview account creation form.",
      isDefault: false,
      isManaged: false,
      formActivationState: 1,
    },
  ],
  contact: [
    {
      id: "00000000-0000-0000-0000-000000000301",
      name: "Contact main information",
      typeCode: 2,
      typeLabel: "Main",
      description: "Browser-preview contact form with status and email fields.",
      isDefault: true,
      isManaged: false,
      formActivationState: 1,
    },
  ],
}

const accountFormXml = `<form>
  <events>
    <event name="onload" application="false">
      <Handlers />
    </event>
  </events>
  <tabs>
    <tab name="general" id="{11111111-1111-1111-1111-111111111111}">
      <labels>
        <label description="General" languagecode="1033" />
      </labels>
      <columns>
        <column width="100%">
          <sections>
            <section name="account_information" id="{22222222-2222-2222-2222-222222222222}">
              <labels>
                <label description="Account Information" languagecode="1033" />
              </labels>
              <rows>
                <row>
                  <cell id="{33333333-3333-3333-3333-333333333333}">
                    <labels>
                      <label description="Account Name" languagecode="1033" />
                    </labels>
                    <control id="name" datafieldname="name" />
                  </cell>
                  <cell id="{44444444-4444-4444-4444-444444444444}">
                    <labels>
                      <label description="Status" languagecode="1033" />
                    </labels>
                    <control id="statuscode" datafieldname="statuscode">
                      <events>
                        <event name="onchange" application="false">
                          <Handlers />
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
    <tab name="billing" id="{55555555-5555-5555-5555-555555555555}">
      <labels>
        <label description="Billing" languagecode="1033" />
      </labels>
      <columns>
        <column width="100%">
          <sections>
            <section name="billing_details" id="{66666666-6666-6666-6666-666666666666}">
              <labels>
                <label description="Billing Details" languagecode="1033" />
              </labels>
              <rows>
                <row>
                  <cell id="{77777777-7777-7777-7777-777777777777}">
                    <labels>
                      <label description="Credit Limit" languagecode="1033" />
                    </labels>
                    <control id="creditlimit" datafieldname="creditlimit" />
                  </cell>
                  <cell id="{88888888-8888-8888-8888-888888888888}">
                    <labels>
                      <label description="Primary Contact" languagecode="1033" />
                    </labels>
                    <control id="primarycontactid" datafieldname="primarycontactid" />
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

const contactFormXml = `<form>
  <events>
    <event name="onload" application="false">
      <Handlers />
    </event>
  </events>
  <tabs>
    <tab name="summary" id="{aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa}">
      <labels>
        <label description="Summary" languagecode="1033" />
      </labels>
      <columns>
        <column width="100%">
          <sections>
            <section name="contact_details" id="{bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}">
              <labels>
                <label description="Contact Details" languagecode="1033" />
              </labels>
              <rows>
                <row>
                  <cell id="{cccccccc-cccc-cccc-cccc-cccccccccccc}">
                    <labels>
                      <label description="Full Name" languagecode="1033" />
                    </labels>
                    <control id="fullname" datafieldname="fullname" />
                  </cell>
                  <cell id="{dddddddd-dddd-dddd-dddd-dddddddddddd}">
                    <labels>
                      <label description="Email" languagecode="1033" />
                    </labels>
                    <control id="emailaddress1" datafieldname="emailaddress1" />
                  </cell>
                  <cell id="{eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee}">
                    <labels>
                      <label description="Status" languagecode="1033" />
                    </labels>
                    <control id="statuscode" datafieldname="statuscode" />
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

export const mockFormLogicContexts: Record<string, FormLogicFormContext> = {
  "00000000-0000-0000-0000-000000000201": {
    entity: mockFormLogicEntities[0],
    form: mockFormLogicForms.account[0],
    formXml: accountFormXml,
    source: "browser-preview",
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
        optionValues: [
          { value: 1, label: "Active" },
          { value: 2, label: "Inactive" },
        ],
      },
      {
        logicalName: "creditlimit",
        displayName: "Credit Limit",
        attributeType: "Money",
        requiredLevel: "None",
        isValidForRead: true,
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
  },
  "00000000-0000-0000-0000-000000000207": {
    entity: mockFormLogicEntities[0],
    form: mockFormLogicForms.account[1],
    formXml: accountFormXml,
    source: "browser-preview",
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
        optionValues: [
          { value: 1, label: "Active" },
          { value: 2, label: "Inactive" },
        ],
      },
      {
        logicalName: "creditlimit",
        displayName: "Credit Limit",
        attributeType: "Money",
        requiredLevel: "None",
        isValidForRead: true,
      },
    ],
  },
  "00000000-0000-0000-0000-000000000301": {
    entity: mockFormLogicEntities[1],
    form: mockFormLogicForms.contact[0],
    formXml: contactFormXml,
    source: "browser-preview",
    attributes: [
      {
        logicalName: "fullname",
        displayName: "Full Name",
        attributeType: "String",
        requiredLevel: "ApplicationRequired",
        isValidForRead: true,
      },
      {
        logicalName: "emailaddress1",
        displayName: "Email",
        attributeType: "String",
        requiredLevel: "None",
        isValidForRead: true,
      },
      {
        logicalName: "statuscode",
        displayName: "Status",
        attributeType: "Status",
        requiredLevel: "None",
        isValidForRead: true,
        optionValues: [
          { value: 1, label: "Active" },
          { value: 2, label: "Inactive" },
        ],
      },
    ],
  },
}
