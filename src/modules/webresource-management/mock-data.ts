import type { WebResource } from "@/core/dataverse/schemas"

export const mockWebResources: WebResource[] = [
  {
    id: "3f3c9f6a-1111-4d58-b77d-100000000001",
    name: "new_/scripts/account-form.js",
    type: "js",
    version: "1.4.2",
    isManaged: false,
    solution: "CoreCustomizations",
  },
  {
    id: "3f3c9f6a-1111-4d58-b77d-100000000002",
    name: "new_/scripts/contact-ribbon.js",
    type: "js",
    version: "1.1.8",
    isManaged: false,
    solution: "CoreCustomizations",
  },
  {
    id: "3f3c9f6a-1111-4d58-b77d-100000000003",
    name: "new_/styles/forms.css",
    type: "css",
    version: "2.0.1",
    isManaged: false,
    solution: "PortalUi",
  },
  {
    id: "3f3c9f6a-1111-4d58-b77d-100000000004",
    name: "new_/html/lookup-dialog.html",
    type: "html",
    version: "1.0.9",
    isManaged: false,
    solution: "PortalUi",
  },
  {
    id: "3f3c9f6a-1111-4d58-b77d-100000000005",
    name: "msdyn_/scripts/grid-command.js",
    type: "js",
    version: "9.2.0",
    isManaged: true,
    solution: "MicrosoftDynamics",
  },
]
