import type { Monaco } from "@monaco-editor/react"
import xrmClientApiTypes from "../../../node_modules/@types/xrm/index.d.ts?raw"

import type { WebResourceContent } from "@/core/dataverse/schemas"

const XRM_CLIENT_API_DTS_PATH =
  "file:///opendataverse/types/definitelytyped-xrm.d.ts"
const WEBRESOURCE_GLOBALS_DTS_PATH =
  "file:///opendataverse/types/webresource-globals.d.ts"

const WEBRESOURCE_GLOBALS_DTS = `
declare const executionContext: Xrm.Events.EventContext;
declare const formContext: Xrm.FormContext;
`

type CompletionSpec = {
  label: string
  insertText: string
  detail: string
  documentation?: string
}

let configured = false

const executionContextCompletions: CompletionSpec[] = [
  method("getFormContext()", "getFormContext()", "Xrm.Events.EventContext"),
  method("getEventArgs()", "getEventArgs()", "Xrm.Events.EventContext"),
  method("getEventSource()", "getEventSource()", "Xrm.Events.EventContext"),
  method("getDepth()", "getDepth()", "Xrm.Events.EventContext"),
  method("getSharedVariable()", "getSharedVariable(${1:key})", "Xrm.Events.EventContext"),
  method(
    "setSharedVariable()",
    "setSharedVariable(${1:key}, ${2:value})",
    "Xrm.Events.EventContext",
  ),
]

const formContextCompletions: CompletionSpec[] = [
  property("data", "Form data and entity API"),
  property("ui", "Form UI API"),
  method(
    "getAttribute()",
    'getAttribute("${1:logicalname}")',
    "Xrm.FormContext",
  ),
  method("getControl()", 'getControl("${1:name}")', "Xrm.FormContext"),
]

const formDataCompletions: CompletionSpec[] = [
  property("entity", "Current row API"),
  property("attributes", "Form attributes collection"),
  property("process", "Business process flow API"),
  method("save()", "save()", "Xrm.Data"),
  method("refresh()", "refresh(${1:false})", "Xrm.Data"),
]

const formUiCompletions: CompletionSpec[] = [
  property("controls", "Form controls collection"),
  property("tabs", "Form tabs collection"),
  method(
    "setFormNotification()",
    'setFormNotification("${1:message}", "${2|INFO,WARNING,ERROR|}", "${3:notificationId}")',
    "Xrm.Ui",
  ),
  method("clearFormNotification()", 'clearFormNotification("${1:notificationId}")', "Xrm.Ui"),
  method("refreshRibbon()", "refreshRibbon(${1:false})", "Xrm.Ui"),
]

const xrmCompletions: CompletionSpec[] = [
  property("App", "App-level API"),
  property("Device", "Mobile device capability API"),
  property("Encoding", "String encoding API"),
  property("Navigation", "Dialog, form, and URL navigation API"),
  property("Panel", "Side pane API"),
  property("Utility", "Global context and utility API"),
  property("WebApi", "Dataverse Web API helpers"),
  property("Page", "Legacy form context"),
]

const webApiCompletions: CompletionSpec[] = [
  method(
    "retrieveRecord()",
    'retrieveRecord("${1:entityLogicalName}", "${2:id}", "${3:query}")',
    "Xrm.WebApi",
  ),
  method(
    "retrieveMultipleRecords()",
    'retrieveMultipleRecords("${1:entityLogicalName}", "${2:query}")',
    "Xrm.WebApi",
  ),
  method(
    "createRecord()",
    'createRecord("${1:entityLogicalName}", ${2:data})',
    "Xrm.WebApi",
  ),
  method(
    "updateRecord()",
    'updateRecord("${1:entityLogicalName}", "${2:id}", ${3:data})',
    "Xrm.WebApi",
  ),
  method(
    "deleteRecord()",
    'deleteRecord("${1:entityLogicalName}", "${2:id}")',
    "Xrm.WebApi",
  ),
  method("execute()", "execute(${1:request})", "Xrm.WebApi"),
  method("executeMultiple()", "executeMultiple(${1:requests})", "Xrm.WebApi"),
]

const navigationCompletions: CompletionSpec[] = [
  method(
    "openAlertDialog()",
    'openAlertDialog({ text: "${1:message}" })',
    "Xrm.Navigation",
  ),
  method(
    "openConfirmDialog()",
    'openConfirmDialog({ text: "${1:message}" })',
    "Xrm.Navigation",
  ),
  method("openErrorDialog()", "openErrorDialog(${1:errorOptions})", "Xrm.Navigation"),
  method("openFile()", "openFile(${1:file}, ${2:options})", "Xrm.Navigation"),
  method("openForm()", "openForm(${1:options})", "Xrm.Navigation"),
  method("openUrl()", 'openUrl("${1:url}")', "Xrm.Navigation"),
  method("navigateTo()", "navigateTo(${1:pageInput}, ${2:navigationOptions})", "Xrm.Navigation"),
]

const utilityCompletions: CompletionSpec[] = [
  method("getGlobalContext()", "getGlobalContext()", "Xrm.Utility"),
  method(
    "getEntityMetadata()",
    'getEntityMetadata("${1:entityLogicalName}")',
    "Xrm.Utility",
  ),
  method("getResourceString()", 'getResourceString("${1:webResourceName}", "${2:key}")', "Xrm.Utility"),
  method(
    "showProgressIndicator()",
    'showProgressIndicator("${1:message}")',
    "Xrm.Utility",
  ),
  method("closeProgressIndicator()", "closeProgressIndicator()", "Xrm.Utility"),
  method("lookupObjects()", "lookupObjects(${1:lookupOptions})", "Xrm.Utility"),
]

const snippetCompletions: CompletionSpec[] = [
  snippet(
    "onLoad handler",
    [
      "/**",
      " * @param {Xrm.Events.EventContext} executionContext",
      " */",
      "function onLoad(executionContext) {",
      "  const formContext = executionContext.getFormContext();",
      "  $0",
      "}",
    ].join("\n"),
    "Dataverse form onLoad handler",
  ),
  snippet(
    "onSave handler",
    [
      "/**",
      " * @param {Xrm.Events.EventContext} executionContext",
      " */",
      "function onSave(executionContext) {",
      "  const formContext = executionContext.getFormContext();",
      "  const eventArgs = executionContext.getEventArgs();",
      "  $0",
      "}",
    ].join("\n"),
    "Dataverse form onSave handler",
  ),
  snippet(
    "get attribute",
    'const ${1:attribute} = formContext.getAttribute("${2:logicalname}");',
    "Read a Dataverse form attribute",
  ),
  snippet(
    "retrieve record",
    'const ${1:record} = await Xrm.WebApi.retrieveRecord("${2:entityLogicalName}", "${3:id}", "${4:query}");',
    "Retrieve one Dataverse row",
  ),
]

export function configureWebResourceIntellisense(monaco: Monaco) {
  if (configured) {
    return
  }

  configured = true
  configureTypeScriptDefaults(monaco)
  registerDataverseCompletionProvider(monaco)
}

export function editorLanguageForWebResource(content?: WebResourceContent) {
  if (!content) {
    return "plaintext"
  }

  if (content.type === "js") {
    return "javascript"
  }

  if (content.type === "resx") {
    return "xml"
  }

  return content.language || "plaintext"
}

export function editorPathForWebResource(content?: WebResourceContent) {
  if (!content) {
    return undefined
  }

  const name = content.name
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `file:///opendataverse/webresources/${content.id}/${name || content.id}`
}

function configureTypeScriptDefaults(monaco: Monaco) {
  const compilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    checkJs: true,
    noEmit: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
  }

  for (const defaults of [
    monaco.languages.typescript.javascriptDefaults,
    monaco.languages.typescript.typescriptDefaults,
  ]) {
    defaults.setCompilerOptions({
      ...defaults.getCompilerOptions(),
      ...compilerOptions,
    })
    defaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    })
    defaults.addExtraLib(xrmClientApiTypes, XRM_CLIENT_API_DTS_PATH)
    defaults.addExtraLib(WEBRESOURCE_GLOBALS_DTS, WEBRESOURCE_GLOBALS_DTS_PATH)
  }
}

function registerDataverseCompletionProvider(monaco: Monaco) {
  monaco.languages.registerCompletionItemProvider("javascript", {
    triggerCharacters: [".", "X", "e", "f", "o", "r"],
    provideCompletionItems(model, position) {
      const range = getCurrentWordRange(monaco, model, position)
      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: Math.max(1, position.column - 120),
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const memberCompletions = completionsForMemberExpression(linePrefix)
      if (memberCompletions) {
        return {
          suggestions: memberCompletions.map((completion) =>
            toMonacoCompletion(monaco, completion, range),
          ),
        }
      }

      if (isMemberExpression(linePrefix)) {
        return { suggestions: [] }
      }

      return {
        suggestions: snippetCompletions.map((completion) =>
          toMonacoCompletion(monaco, completion, range),
        ),
      }
    },
  })
}

function completionsForMemberExpression(linePrefix: string) {
  const expression = memberExpression(linePrefix)

  if (expression === "executionContext") {
    return executionContextCompletions
  }

  if (expression === "formContext") {
    return formContextCompletions
  }

  if (expression === "formContext.data") {
    return formDataCompletions
  }

  if (expression === "formContext.ui") {
    return formUiCompletions
  }

  if (expression === "Xrm") {
    return xrmCompletions
  }

  if (expression === "Xrm.WebApi") {
    return webApiCompletions
  }

  if (expression === "Xrm.Navigation") {
    return navigationCompletions
  }

  if (expression === "Xrm.Utility") {
    return utilityCompletions
  }

  return undefined
}

function isMemberExpression(linePrefix: string) {
  return Boolean(memberExpression(linePrefix))
}

function memberExpression(linePrefix: string) {
  return linePrefix.match(
    /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.$/,
  )?.[1]
}

function getCurrentWordRange(
  monaco: Monaco,
  model: Parameters<
    Parameters<typeof monaco.languages.registerCompletionItemProvider>[1]["provideCompletionItems"]
  >[0],
  position: Parameters<
    Parameters<typeof monaco.languages.registerCompletionItemProvider>[1]["provideCompletionItems"]
  >[1],
) {
  const word = model.getWordUntilPosition(position)

  return new monaco.Range(
    position.lineNumber,
    word.startColumn,
    position.lineNumber,
    word.endColumn,
  )
}

function toMonacoCompletion(
  monaco: Monaco,
  completion: CompletionSpec,
  range: ReturnType<typeof getCurrentWordRange>,
) {
  return {
    label: completion.label,
    kind: monaco.languages.CompletionItemKind.Method,
    insertText: completion.insertText,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: completion.detail,
    documentation: completion.documentation,
    range,
  }
}

function method(label: string, insertText: string, detail: string) {
  return { label, insertText, detail } satisfies CompletionSpec
}

function property(label: string, detail: string) {
  return { label, insertText: label, detail } satisfies CompletionSpec
}

function snippet(label: string, insertText: string, detail: string) {
  return { label, insertText, detail } satisfies CompletionSpec
}
