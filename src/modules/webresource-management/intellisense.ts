import type { Monaco } from "@monaco-editor/react"

import type { WebResourceContent } from "@/core/dataverse/schemas"

const DATAVERSE_CLIENT_API_DTS_PATH =
  "file:///opendataverse/types/dataverse-client-api.d.ts"

const DATAVERSE_CLIENT_API_DTS = `
type XrmCollectionPredicate<TItem> = (item: TItem, index: number) => void;

declare namespace Xrm {
  type NotificationLevel = "ERROR" | "WARNING" | "INFO";
  type RequiredLevel = "none" | "required" | "recommended";
  type SubmitMode = "always" | "never" | "dirty";

  interface Collection<TItem> {
    get(): TItem[];
    get(name: string): TItem | null;
    get(index: number): TItem | null;
    getLength(): number;
    forEach(callback: XrmCollectionPredicate<TItem>): void;
  }

  interface ExecutionContext<TEventSource = unknown> {
    getContext(): GlobalContext;
    getDepth(): number;
    getEventArgs(): unknown;
    getEventSource(): TEventSource;
    getFormContext(): FormContext;
    getSharedVariable<TValue = unknown>(key: string): TValue;
    setSharedVariable(key: string, value: unknown): void;
  }

  interface GlobalContext {
    client: ClientContext;
    getClientUrl(): string;
    getCurrentAppName(): Promise<string>;
    getCurrentAppProperties(): Promise<Record<string, unknown>>;
    getOrgLcid(): number;
    getOrgUniqueName(): string;
    getQueryStringParameters(): Record<string, string>;
    getUserId(): string;
    getUserLcid(): number;
    getUserName(): string;
    getUserRoles(): string[];
    getVersion(): string;
  }

  interface ClientContext {
    getClient(): "Web" | "Outlook" | "Mobile";
    getClientState(): "Online" | "Offline";
    getFormFactor(): number;
    isOffline(): boolean;
  }

  interface FormContext {
    data: FormData;
    ui: Ui;
    getAttribute<TAttribute extends Attribute = Attribute>(
      name: string,
    ): TAttribute | null;
    getControl<TControl extends Control = Control>(name: string): TControl | null;
  }

  interface FormData {
    attributes: Collection<Attribute>;
    entity: Entity;
    process: ProcessFlow;
    refresh(save?: boolean): Promise<void>;
    save(options?: SaveOptions): Promise<SaveResult>;
  }

  interface Entity {
    addOnSave(handler: (executionContext: ExecutionContext<Entity>) => void): void;
    getDataXml(): string;
    getEntityName(): string;
    getId(): string;
    getIsDirty(): boolean;
    getPrimaryAttributeValue(): string;
    removeOnSave(handler: (executionContext: ExecutionContext<Entity>) => void): void;
    save(saveMode?: "saveandclose" | "saveandnew"): void;
  }

  interface SaveOptions {
    saveMode?: number;
    useSchedulingEngine?: boolean;
  }

  interface SaveResult {
    savedEntityReference?: LookupValue[];
  }

  interface Attribute<TValue = unknown> {
    addOnChange(
      handler: (executionContext: ExecutionContext<Attribute<TValue>>) => void,
    ): void;
    controls: Collection<Control>;
    fireOnChange(): void;
    getAttributeType(): string;
    getFormat(): string | null;
    getInitialValue(): TValue | null;
    getIsDirty(): boolean;
    getName(): string;
    getParent(): FormContext;
    getRequiredLevel(): RequiredLevel;
    getSubmitMode(): SubmitMode;
    getUserPrivilege(): AttributePrivilege;
    getValue(): TValue | null;
    isValid(): boolean;
    removeOnChange(
      handler: (executionContext: ExecutionContext<Attribute<TValue>>) => void,
    ): void;
    setRequiredLevel(requirementLevel: RequiredLevel): void;
    setSubmitMode(mode: SubmitMode): void;
    setValue(value: TValue | null): void;
  }

  interface AttributePrivilege {
    canCreate: boolean;
    canRead: boolean;
    canUpdate: boolean;
  }

  interface StringAttribute extends Attribute<string> {
    getMaxLength(): number;
  }

  interface NumberAttribute extends Attribute<number> {
    getMax(): number;
    getMin(): number;
    getPrecision(): number;
  }

  interface BooleanAttribute extends Attribute<boolean> {}
  interface DateAttribute extends Attribute<Date> {}
  interface LookupAttribute extends Attribute<LookupValue[]> {}

  interface OptionSetAttribute<TValue extends number = number>
    extends Attribute<TValue> {
    getOption(value: TValue): OptionSetValue<TValue> | null;
    getOptions(): OptionSetValue<TValue>[];
    getSelectedOption(): OptionSetValue<TValue> | null;
    getText(): string | null;
  }

  interface OptionSetValue<TValue extends number = number> {
    text: string;
    value: TValue;
  }

  interface LookupValue {
    entityType: string;
    id: string;
    name?: string;
  }

  interface Control {
    addNotification(notification: ControlNotification): void;
    clearNotification(uniqueId?: string): boolean;
    getControlType(): string;
    getDisabled(): boolean;
    getLabel(): string;
    getName(): string;
    getParent(): Section | null;
    getVisible(): boolean;
    setDisabled(disabled: boolean): void;
    setFocus(): void;
    setLabel(label: string): void;
    setNotification(message: string, uniqueId?: string): boolean;
    setVisible(visible: boolean): void;
  }

  interface StandardControl<TAttribute extends Attribute = Attribute>
    extends Control {
    getAttribute(): TAttribute;
  }

  interface ControlNotification {
    actions?: ControlNotificationAction[];
    messages: string[];
    notificationLevel: "RECOMMENDATION" | "ERROR";
    uniqueId: string;
  }

  interface ControlNotificationAction {
    actions: Array<() => void>;
    message: string;
  }

  interface Ui {
    controls: Collection<Control>;
    formSelector: FormSelector;
    navigation: NavigationItems;
    tabs: Collection<Tab>;
    clearFormNotification(uniqueId: string): boolean;
    close(): void;
    getFormType(): number;
    getViewPortHeight(): number;
    getViewPortWidth(): number;
    refreshRibbon(refreshAll?: boolean): void;
    setFormNotification(
      message: string,
      level: NotificationLevel,
      uniqueId: string,
    ): boolean;
  }

  interface FormSelector {
    getCurrentItem(): FormSelectorItem | null;
    items: Collection<FormSelectorItem>;
  }

  interface FormSelectorItem {
    getId(): string;
    getLabel(): string;
    navigate(): void;
  }

  interface NavigationItems {
    items: Collection<NavigationItem>;
  }

  interface NavigationItem {
    getId(): string;
    getLabel(): string;
    getVisible(): boolean;
    setFocus(): void;
    setLabel(label: string): void;
    setVisible(visible: boolean): void;
  }

  interface Tab {
    sections: Collection<Section>;
    getDisplayState(): "expanded" | "collapsed";
    getLabel(): string;
    getName(): string;
    getParent(): Ui;
    getVisible(): boolean;
    setDisplayState(displayState: "expanded" | "collapsed"): void;
    setFocus(): void;
    setLabel(label: string): void;
    setVisible(visible: boolean): void;
  }

  interface Section {
    controls: Collection<Control>;
    getLabel(): string;
    getName(): string;
    getParent(): Tab;
    getVisible(): boolean;
    setLabel(label: string): void;
    setVisible(visible: boolean): void;
  }

  interface ProcessFlow {
    addOnStageChange(handler: (executionContext: ExecutionContext) => void): void;
    getActiveProcess(): unknown;
    getActiveStage(): unknown;
    getEnabledProcesses(callback: (processes: Record<string, string>) => void): void;
    removeOnStageChange(handler: (executionContext: ExecutionContext) => void): void;
  }

  namespace WebApi {
    interface RetrieveMultipleResponse<TRecord = Record<string, unknown>> {
      entities: TRecord[];
      nextLink?: string;
    }

    interface DeleteResponse {
      entityType: string;
      id: string;
      name?: string;
    }

    function createRecord<TRecord extends Record<string, unknown>>(
      entityLogicalName: string,
      data: TRecord,
    ): Promise<LookupValue>;
    function deleteRecord(
      entityLogicalName: string,
      id: string,
    ): Promise<DeleteResponse>;
    function execute(request: unknown): Promise<Response>;
    function executeMultiple(requests: unknown[]): Promise<Response[]>;
    function retrieveMultipleRecords<TRecord = Record<string, unknown>>(
      entityLogicalName: string,
      options?: string,
      maxPageSize?: number,
    ): Promise<RetrieveMultipleResponse<TRecord>>;
    function retrieveRecord<TRecord = Record<string, unknown>>(
      entityLogicalName: string,
      id: string,
      options?: string,
    ): Promise<TRecord>;
    function updateRecord<TRecord extends Record<string, unknown>>(
      entityLogicalName: string,
      id: string,
      data: Partial<TRecord>,
    ): Promise<LookupValue>;
  }

  namespace Navigation {
    interface AlertStrings {
      confirmButtonLabel?: string;
      text: string;
      title?: string;
    }

    interface ConfirmStrings extends AlertStrings {
      cancelButtonLabel?: string;
    }

    interface DialogOptions {
      height?: number;
      width?: number;
    }

    function openAlertDialog(
      alertStrings: AlertStrings,
      alertOptions?: DialogOptions,
    ): Promise<void>;
    function openConfirmDialog(
      confirmStrings: ConfirmStrings,
      confirmOptions?: DialogOptions,
    ): Promise<{ confirmed: boolean }>;
    function openErrorDialog(errorOptions: {
      details?: string;
      errorCode?: number;
      message?: string;
    }): Promise<void>;
    function openForm(options: Record<string, unknown>): Promise<LookupValue[]>;
    function openUrl(url: string, openUrlOptions?: DialogOptions): void;
  }

  namespace Utility {
    function closeProgressIndicator(): void;
    function getEntityMetadata(
      entityName: string,
      attributes?: string[],
    ): Promise<Record<string, unknown>>;
    function getGlobalContext(): GlobalContext;
    function lookupObjects(
      lookupOptions: Record<string, unknown>,
    ): Promise<LookupValue[]>;
    function showProgressIndicator(message: string): void;
  }
}

declare const Xrm: {
  Navigation: typeof Xrm.Navigation;
  Page: Xrm.FormContext;
  Utility: typeof Xrm.Utility;
  WebApi: typeof Xrm.WebApi;
};

declare const executionContext: Xrm.ExecutionContext;
declare const formContext: Xrm.FormContext;
`

type CompletionSpec = {
  label: string
  insertText: string
  detail: string
  documentation?: string
  kind?: number
}

let configured = false

const executionContextCompletions: CompletionSpec[] = [
  method("getFormContext()", "getFormContext()", "Xrm.ExecutionContext"),
  method("getEventArgs()", "getEventArgs()", "Xrm.ExecutionContext"),
  method("getEventSource()", "getEventSource()", "Xrm.ExecutionContext"),
  method("getDepth()", "getDepth()", "Xrm.ExecutionContext"),
  method("getSharedVariable()", "getSharedVariable(${1:key})", "Xrm.ExecutionContext"),
  method(
    "setSharedVariable()",
    "setSharedVariable(${1:key}, ${2:value})",
    "Xrm.ExecutionContext",
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
  method("save()", "save()", "Xrm.FormData"),
  method("refresh()", "refresh(${1:false})", "Xrm.FormData"),
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
  property("Navigation", "Dialog, form, and URL navigation API"),
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
  method("openForm()", "openForm(${1:options})", "Xrm.Navigation"),
  method("openUrl()", 'openUrl("${1:url}")', "Xrm.Navigation"),
]

const utilityCompletions: CompletionSpec[] = [
  method("getGlobalContext()", "getGlobalContext()", "Xrm.Utility"),
  method(
    "getEntityMetadata()",
    'getEntityMetadata("${1:entityLogicalName}")',
    "Xrm.Utility",
  ),
  method(
    "showProgressIndicator()",
    'showProgressIndicator("${1:message}")',
    "Xrm.Utility",
  ),
  method("closeProgressIndicator()", "closeProgressIndicator()", "Xrm.Utility"),
]

const snippetCompletions: CompletionSpec[] = [
  snippet(
    "onLoad handler",
    [
      "/**",
      " * @param {Xrm.ExecutionContext} executionContext",
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
      " * @param {Xrm.ExecutionContext} executionContext",
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
    [
      'const ${1:record} = await Xrm.WebApi.retrieveRecord("${2:entityLogicalName}", "${3:id}", "${4:query}");',
    ].join("\n"),
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
    defaults.addExtraLib(
      DATAVERSE_CLIENT_API_DTS,
      DATAVERSE_CLIENT_API_DTS_PATH,
    )
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
      const completions = memberCompletions ?? snippetCompletions

      return {
        suggestions: completions.map((completion) =>
          toMonacoCompletion(monaco, completion, range),
        ),
      }
    },
  })
}

function completionsForMemberExpression(linePrefix: string) {
  const expression = linePrefix.match(
    /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.$/,
  )?.[1]

  if (!expression) {
    return undefined
  }

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
    kind: completion.kind ?? monaco.languages.CompletionItemKind.Method,
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
