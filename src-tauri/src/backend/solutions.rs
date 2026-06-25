use super::web_resources::{
    is_microsoft_web_resource_name, map_resource_type, publish_web_resource_by_id,
    resource_type_code, web_resource_type_filter,
};
use super::*;
use std::{
    collections::{HashMap, HashSet},
    path::Component,
    time::Duration,
};
use tokio::task::JoinSet;

const SOLUTION_COMPONENT_LIMIT: usize = 500;
const SOLUTION_COMPONENT_DETAIL_BATCH_SIZE: usize = 40;
const SOLUTION_COMPONENT_DETAIL_TIMEOUT: Duration = Duration::from_secs(8);

#[cfg(test)]
const DOCUMENTED_SOLUTION_COMPONENT_TYPES: &[i32] = &[
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 29, 31,
    32, 33, 34, 35, 36, 37, 38, 39, 44, 45, 46, 47, 48, 49, 50, 52, 53, 55, 59, 60, 61, 62, 63, 64,
    65, 66, 68, 70, 71, 90, 91, 92, 93, 95, 150, 151, 152, 153, 154, 155, 161, 162, 165, 166, 201,
    202, 203, 204, 205, 206, 207, 208, 210, 300, 371, 372, 380, 381, 400, 401, 402, 430, 431, 432,
];

#[cfg(test)]
const COMPONENT_LAYER_FALLBACK_COMPONENT_TYPES: &[i32] = &[
    2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18, 21, 22, 23, 25, 31, 32, 33, 34, 35, 36,
    37, 38, 39, 44, 45, 46, 47, 48, 49, 50, 52, 53, 55, 63, 64, 65, 71, 150, 151, 152, 153, 154,
    155, 161, 162, 165, 166, 203, 204, 205, 206, 207, 208, 210, 400, 401, 402, 430, 431, 432,
    10075,
];

#[cfg(test)]
const LIVE_OBSERVED_SOLUTION_COMPONENT_TYPES: &[i32] = &[80, 10072, 10075, 10121];

const COMPONENT_JSON_NAME_KEYS: &[&str] = &[
    "DisplayName",
    "displayName",
    "LocalizedName",
    "localizedName",
    "Name",
    "name",
    "SchemaName",
    "schemaName",
    "LogicalName",
    "logicalName",
    "Title",
    "title",
    "Label",
    "label",
    "sitemapname",
    "sitemapnameunique",
    "primaryentitytypecode",
    "primaryEntityTypeCode",
    "objecttypecode",
    "objectTypeCode",
    "returnedtypecode",
    "returnedTypeCode",
];

const TABLE_COMPONENT_TYPE: i32 = 1;
const SYSTEM_FORM_COMPONENT_TYPE: i32 = 60;
const WEB_RESOURCE_COMPONENT_TYPE: i32 = 61;

const TABLE_COMPONENT_TYPES: &[i32] = &[TABLE_COMPONENT_TYPE];
const CHOICE_COMPONENT_TYPES: &[i32] = &[9];
const ROLE_COMPONENT_TYPES: &[i32] = &[20];
const SYSTEM_FORM_COMPONENT_TYPES: &[i32] = &[24, SYSTEM_FORM_COMPONENT_TYPE];
const VIEW_COMPONENT_TYPES: &[i32] = &[26];
const PROCESS_COMPONENT_TYPES: &[i32] = &[29];
const WEB_RESOURCE_COMPONENT_TYPES: &[i32] = &[WEB_RESOURCE_COMPONENT_TYPE];
const MODEL_DRIVEN_APP_COMPONENT_TYPES: &[i32] = &[80];
const CANVAS_APP_COMPONENT_TYPES: &[i32] = &[300];
const ENV_VAR_DEFINITION_COMPONENT_TYPES: &[i32] = &[380];
const ENV_VAR_VALUE_COMPONENT_TYPES: &[i32] = &[381];
const CHART_COMPONENT_TYPES: &[i32] = &[59];
const SITE_MAP_COMPONENT_TYPES: &[i32] = &[62];
const CUSTOM_CONTROL_COMPONENT_TYPES: &[i32] = &[66];
const CUSTOM_CONTROL_DEFAULT_CONFIG_COMPONENT_TYPES: &[i32] = &[68];
const FIELD_SECURITY_PROFILE_COMPONENT_TYPES: &[i32] = &[70];
const PLUGIN_TYPE_COMPONENT_TYPES: &[i32] = &[90];
const PLUGIN_ASSEMBLY_COMPONENT_TYPES: &[i32] = &[91];
const PLUGIN_STEP_COMPONENT_TYPES: &[i32] = &[92];
const PLUGIN_STEP_IMAGE_COMPONENT_TYPES: &[i32] = &[93];
const SERVICE_ENDPOINT_COMPONENT_TYPES: &[i32] = &[95];
const SDK_MESSAGE_COMPONENT_TYPES: &[i32] = &[201];
const SDK_MESSAGE_FILTER_COMPONENT_TYPES: &[i32] = &[202];
const CONNECTOR_COMPONENT_TYPES: &[i32] = &[371, 372];
const APP_ELEMENT_COMPONENT_TYPES: &[i32] = &[10072];
const CONNECTION_REFERENCE_COMPONENT_TYPES: &[i32] = &[10121];

const ROLE_DISPLAY_KEYS: &[&str] = &["name"];
const ROLE_LOGICAL_KEYS: &[&str] = &["name"];
const EMPTY_KEYS: &[&str] = &[];
const SYSTEM_FORM_DISPLAY_KEYS: &[&str] = &["name"];
const SYSTEM_FORM_LOGICAL_KEYS: &[&str] = &["objecttypecode"];
const VIEW_DISPLAY_KEYS: &[&str] = &["name"];
const VIEW_LOGICAL_KEYS: &[&str] = &["returnedtypecode"];
const PROCESS_DISPLAY_KEYS: &[&str] = &["name"];
const PROCESS_LOGICAL_KEYS: &[&str] = &["uniquename"];
const WEB_RESOURCE_DISPLAY_KEYS: &[&str] = &["displayname", "name"];
const WEB_RESOURCE_LOGICAL_KEYS: &[&str] = &["name"];
const WEB_RESOURCE_SCHEMA_KEYS: &[&str] = &["name"];
const MODEL_DRIVEN_APP_DISPLAY_KEYS: &[&str] = &["name"];
const MODEL_DRIVEN_APP_LOGICAL_KEYS: &[&str] = &["uniquename", "name"];
const CANVAS_APP_DISPLAY_KEYS: &[&str] = &["displayname", "name"];
const CANVAS_APP_LOGICAL_KEYS: &[&str] = &["name"];
const ENV_VAR_DEFINITION_DISPLAY_KEYS: &[&str] = &["displayname", "schemaname"];
const ENV_VAR_DEFINITION_LOGICAL_KEYS: &[&str] = &["schemaname"];
const ENV_VAR_DEFINITION_SCHEMA_KEYS: &[&str] = &["schemaname"];
const ENV_VAR_VALUE_DISPLAY_KEYS: &[&str] = &["value"];
const ENV_VAR_VALUE_LOGICAL_KEYS: &[&str] = &["_environmentvariabledefinitionid_value"];
const CHART_DISPLAY_KEYS: &[&str] = &["name"];
const CHART_LOGICAL_KEYS: &[&str] = &["primaryentitytypecode"];
const SITE_MAP_DISPLAY_KEYS: &[&str] = &["sitemapname", "sitemapnameunique"];
const SITE_MAP_LOGICAL_KEYS: &[&str] = &["sitemapnameunique", "sitemapname"];
const CUSTOM_CONTROL_DISPLAY_KEYS: &[&str] = &["name"];
const CUSTOM_CONTROL_LOGICAL_KEYS: &[&str] = &["name"];
const CUSTOM_CONTROL_DEFAULT_CONFIG_DISPLAY_KEYS: &[&str] =
    &["primaryentitytypecode", "customcontroldefaultconfigid"];
const CUSTOM_CONTROL_DEFAULT_CONFIG_LOGICAL_KEYS: &[&str] = &["primaryentitytypecode"];
const FIELD_SECURITY_PROFILE_DISPLAY_KEYS: &[&str] = &["name"];
const FIELD_SECURITY_PROFILE_LOGICAL_KEYS: &[&str] = &["name"];
const PLUGIN_TYPE_DISPLAY_KEYS: &[&str] = &["friendlyname", "typename", "name"];
const PLUGIN_TYPE_LOGICAL_KEYS: &[&str] = &["typename", "name"];
const PLUGIN_ASSEMBLY_DISPLAY_KEYS: &[&str] = &["name"];
const PLUGIN_ASSEMBLY_LOGICAL_KEYS: &[&str] = &["name"];
const PLUGIN_STEP_DISPLAY_KEYS: &[&str] = &["name"];
const PLUGIN_STEP_LOGICAL_KEYS: &[&str] = &["name"];
const PLUGIN_STEP_IMAGE_DISPLAY_KEYS: &[&str] = &["name", "entityalias"];
const PLUGIN_STEP_IMAGE_LOGICAL_KEYS: &[&str] = &["name", "entityalias"];
const SERVICE_ENDPOINT_DISPLAY_KEYS: &[&str] = &["name"];
const SERVICE_ENDPOINT_LOGICAL_KEYS: &[&str] = &["name"];
const SDK_MESSAGE_DISPLAY_KEYS: &[&str] = &["name"];
const SDK_MESSAGE_LOGICAL_KEYS: &[&str] = &["name"];
const SDK_MESSAGE_FILTER_DISPLAY_KEYS: &[&str] =
    &["primaryobjecttypecode", "secondaryobjecttypecode"];
const SDK_MESSAGE_FILTER_LOGICAL_KEYS: &[&str] =
    &["primaryobjecttypecode", "secondaryobjecttypecode"];
const CONNECTOR_DISPLAY_KEYS: &[&str] = &["displayname", "name"];
const CONNECTOR_LOGICAL_KEYS: &[&str] = &["name"];
const APP_ELEMENT_DISPLAY_KEYS: &[&str] = &["name"];
const APP_ELEMENT_LOGICAL_KEYS: &[&str] = &["uniquename", "name"];
const CONNECTION_REFERENCE_DISPLAY_KEYS: &[&str] = &["connectionreferencedisplayname"];
const CONNECTION_REFERENCE_LOGICAL_KEYS: &[&str] = &["connectionreferencelogicalname"];

#[derive(Clone, Copy)]
enum ComponentDetailKind {
    TableMetadata,
    Row {
        display_keys: &'static [&'static str],
        logical_keys: &'static [&'static str],
        schema_keys: &'static [&'static str],
        entity_logical_name: &'static str,
    },
}

#[derive(Clone, Copy)]
struct ComponentDetailSpec {
    component_types: &'static [i32],
    path: &'static str,
    id_key: &'static str,
    select: &'static str,
    kind: ComponentDetailKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionSummary {
    id: String,
    unique_name: String,
    friendly_name: String,
    version: String,
    is_managed: bool,
    is_visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_unique_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    component_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionComponentSummary {
    id: String,
    solution_id: String,
    object_id: String,
    component_type: i32,
    component_type_label: String,
    group: String,
    display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    logical_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    schema_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_managed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_component_behavior: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_component_behavior_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_solution_component_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    related_entity_logical_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    related_record_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layer_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionDependencyItem {
    id: String,
    dependency_type: i32,
    dependency_type_label: String,
    dependent_component_type: i32,
    dependent_component_type_label: String,
    dependent_component_object_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    dependent_component_parent_id: Option<String>,
    required_component_type: i32,
    required_component_type_label: String,
    required_component_object_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    required_component_parent_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionDependencyReport {
    required: Vec<SolutionDependencyItem>,
    dependents: Vec<SolutionDependencyItem>,
    delete_blockers: Vec<SolutionDependencyItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionLayer {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    component_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    solution_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publisher_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    overwrite_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    changes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionWebResourceCandidate {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
    #[serde(rename = "type")]
    resource_type: String,
    type_code: i32,
    is_managed: bool,
    in_solution: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateWebResourceInput {
    solution_unique_name: String,
    name: String,
    display_name: String,
    description: String,
    #[serde(rename = "type")]
    resource_type: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicBindingInput {
    event_name: String,
    event_label: String,
    attribute_logical_name: Option<String>,
    handler: String,
    pass_execution_context: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicWebResourceInput {
    solution_unique_name: String,
    name: String,
    display_name: String,
    description: String,
    #[serde(rename = "type")]
    resource_type: String,
    content: String,
    entity_logical_name: String,
    form_id: String,
    form_name: String,
    bindings: Vec<FormLogicBindingInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ImportWebResourcesInput {
    solution_unique_name: String,
    source_paths: Vec<String>,
    target_root: String,
    description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SolutionWriteResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    web_resource_id: Option<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FormLogicPublishResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    web_resource_id: Option<String>,
    form_id: String,
    form_name: String,
    applied_bindings: usize,
    message: String,
}

fn add_solution_component_payload(
    component_id: &str,
    component_type: i32,
    solution_unique_name: &str,
    do_not_include_subcomponents: Option<bool>,
) -> Value {
    let mut payload = serde_json::json!({
      "ComponentId": component_id,
      "ComponentType": component_type,
      "SolutionUniqueName": solution_unique_name,
      "AddRequiredComponents": false
    });

    if let Some(do_not_include_subcomponents) = do_not_include_subcomponents {
        payload["DoNotIncludeSubcomponents"] = serde_json::json!(do_not_include_subcomponents);
    }

    payload
}

fn add_table_solution_component_payload(
    table_metadata_id: &str,
    solution_unique_name: &str,
) -> Value {
    add_solution_component_payload(
        table_metadata_id,
        TABLE_COMPONENT_TYPE,
        solution_unique_name,
        Some(true),
    )
}

fn add_form_solution_component_payload(form_id: &str, solution_unique_name: &str) -> Value {
    add_solution_component_payload(
        form_id,
        SYSTEM_FORM_COMPONENT_TYPE,
        solution_unique_name,
        None,
    )
}

fn add_web_resource_solution_component_payload(
    web_resource_id: &str,
    solution_unique_name: &str,
) -> Value {
    add_solution_component_payload(
        web_resource_id,
        WEB_RESOURCE_COMPONENT_TYPE,
        solution_unique_name,
        None,
    )
}

fn remove_solution_component_payload(
    component_object_id: &str,
    component_type: i32,
    solution_unique_name: &str,
) -> Value {
    serde_json::json!({
      "SolutionComponent": {
        "solutioncomponentid": component_object_id
      },
      "ComponentType": component_type,
      "SolutionUniqueName": solution_unique_name
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResourceImportItem {
    source_path: String,
    name: String,
    #[serde(rename = "type")]
    resource_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    web_resource_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResourceImportSkip {
    source_path: String,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WebResourcesImportResult {
    imported: Vec<WebResourceImportItem>,
    skipped: Vec<WebResourceImportSkip>,
    message: String,
}

#[derive(Debug, Clone)]
struct WebResourceImportFile {
    path: PathBuf,
    relative_path: String,
}

pub(super) fn solution_component_type_label(component_type: i32) -> &'static str {
    match component_type {
        1 => "Table",
        2 => "Column",
        3 => "Relationship",
        4 => "Column Choice Value",
        5 => "Column Lookup Value",
        6 => "View Column",
        7 => "Localized Label",
        8 => "Relationship Extra Condition",
        9 => "Choice",
        10 => "Table Relationship",
        11 => "Table Relationship Role",
        12 => "Table Relationship Relationship",
        13 => "Managed Property",
        14 => "Table Key",
        16 => "Privilege",
        17 => "Privilege Object Type",
        18 => "Index",
        20 => "Security Role",
        21 => "Role Privilege",
        22 => "Display String",
        23 => "Display String Map",
        24 => "Form",
        25 => "Organization",
        26 => "View",
        29 => "Process",
        31 => "Report",
        32 => "Report Table",
        33 => "Report Category",
        34 => "Report Visibility",
        35 => "Attachment",
        36 => "Email Template",
        37 => "Contract Template",
        38 => "KB Article Template",
        39 => "Mail Merge Template",
        44 => "Duplicate Rule",
        45 => "Duplicate Rule Condition",
        46 => "Table Map",
        47 => "Column Map",
        48 => "Ribbon Command",
        49 => "Ribbon Context Group",
        50 => "Ribbon Customization",
        52 => "Ribbon Rule",
        53 => "Ribbon Tab To Command Map",
        55 => "Ribbon Diff",
        59 => "Chart",
        60 => "System Form",
        61 => "Web Resource",
        90 => "Plug-in Type",
        91 => "Plug-in Assembly",
        92 => "SDK Message Processing Step",
        93 => "SDK Message Processing Step Image",
        95 => "Service Endpoint",
        62 => "Site Map",
        63 => "Connection Role",
        64 => "Complex Control",
        65 => "Hierarchy Rule",
        66 => "Custom Control",
        68 => "Custom Control Default Config",
        70 => "Field Security Profile",
        71 => "Field Permission",
        80 => "Model-driven App",
        150 => "Routing Rule",
        151 => "Routing Rule Item",
        152 => "SLA",
        153 => "SLA Item",
        154 => "Convert Rule",
        155 => "Convert Rule Item",
        161 => "Mobile Offline Profile",
        162 => "Mobile Offline Profile Item",
        165 => "Similarity Rule",
        166 => "Data Source Mapping",
        201 => "SDK Message",
        202 => "SDK Message Filter",
        203 => "SDK Message Pair",
        204 => "SDK Message Request",
        205 => "SDK Message Request Field",
        206 => "SDK Message Response",
        207 => "SDK Message Response Field",
        208 => "Import Map",
        210 => "Web Wizard",
        300 => "Canvas App",
        371 | 372 => "Connector",
        380 => "Environment Variable Definition",
        381 => "Environment Variable Value",
        400 => "AI Project Type",
        401 => "AI Project",
        402 => "AI Configuration",
        430 => "Table Analytics Configuration",
        431 => "Column Image Configuration",
        432 => "Table Image Configuration",
        10072 => "App Element",
        10075 => "App Component",
        10121 => "Connection Reference",
        _ => "Component",
    }
}

pub(super) fn solution_component_group(component_type: i32) -> &'static str {
    match component_type {
        1 => "Tables",
        2 => "Columns",
        3 | 10 | 11 | 12 => "Relationships",
        4 | 5 | 9 => "Choices",
        14 | 18 => "Keys and Indexes",
        20 | 21 | 70 | 71 => "Security",
        24 | 60 => "Forms",
        26 => "Views",
        29 => "Processes",
        31 | 32 | 33 | 34 => "Reports",
        48 | 49 | 50 | 52 | 53 | 55 => "Ribbon",
        59 => "Charts",
        61 => "Web Resources",
        62 => "Site Maps",
        64 | 66 | 68 => "Custom Controls",
        90 | 91 | 92 | 93 | 95 | 201 | 202 | 203 | 204 | 205 | 206 | 207 => "Developer Extensions",
        80 | 300 | 10072 | 10075 => "Apps",
        371 | 372 | 10121 => "Connectors",
        380 | 381 => "Environment Variables",
        400..=402 => "AI",
        _ => "Other",
    }
}

pub(super) fn dependency_type_label(dependency_type: i32) -> &'static str {
    match dependency_type {
        1 => "Solution Internal",
        2 => "Published",
        4 => "Unpublished",
        _ => "None",
    }
}

pub(super) fn root_component_behavior_label(value: Option<i32>) -> Option<String> {
    value.map(|behavior| {
        match behavior {
            0 => "Include subcomponents",
            1 => "Do not include subcomponents",
            2 => "Include as shell only",
            _ => "Unknown",
        }
        .to_string()
    })
}

pub(super) fn dataverse_record_url(
    environment: &DataverseEnvironment,
    entity: &str,
    object_id: &str,
) -> String {
    let mut query = form_urlencoded::Serializer::new(String::new());
    query.append_pair("pagetype", "entityrecord");
    query.append_pair("etn", entity);
    query.append_pair("id", object_id);

    format!(
        "{}/main.aspx?{}",
        normalize_org_url(&environment.url),
        query.finish()
    )
}

pub(super) fn solution_from_value(
    value: &Value,
    component_count: Option<usize>,
) -> SolutionSummary {
    let id = json_string(value, "solutionid").unwrap_or_default();
    let publisher = value.get("publisherid").unwrap_or(&Value::Null);

    SolutionSummary {
        id,
        unique_name: json_string(value, "uniquename").unwrap_or_default(),
        friendly_name: json_string(value, "friendlyname")
            .or_else(|| json_string(value, "uniquename"))
            .unwrap_or_else(|| "Solution".to_string()),
        version: json_string(value, "version").unwrap_or_default(),
        is_managed: json_bool(value, "ismanaged").unwrap_or(false),
        is_visible: json_bool(value, "isvisible").unwrap_or(true),
        publisher_id: json_string(value, "_publisherid_value")
            .or_else(|| json_string(publisher, "publisherid")),
        publisher_name: json_string(publisher, "friendlyname"),
        publisher_unique_name: json_string(publisher, "uniquename"),
        publisher_prefix: json_string(publisher, "customizationprefix"),
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        component_count,
    }
}

pub(super) fn solution_managed_filter(value: Option<&str>) -> Result<&'static str, String> {
    match value.unwrap_or("unmanaged") {
        "all" => Ok("isvisible eq true"),
        "managed" => Ok("isvisible eq true and ismanaged eq true"),
        "unmanaged" => Ok("isvisible eq true and ismanaged eq false"),
        other => Err(format!("Unsupported solution filter: {other}")),
    }
}

pub(super) async fn solution_component_values(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_id: &str,
) -> Result<Vec<Value>, String> {
    dataverse_get_collection_values_with_headers(
    app,
    environment,
    "/solutioncomponents",
    vec![
      (
        "$select".to_string(),
        "solutioncomponentid,_solutionid_value,componenttype,objectid,ismetadata,rootcomponentbehavior,rootsolutioncomponentid,createdon,modifiedon,versionnumber".to_string(),
      ),
      (
        "$filter".to_string(),
        format!("_solutionid_value eq {solution_id}"),
      ),
      ("$orderby".to_string(), "componenttype asc,modifiedon desc".to_string()),
      (
        "$top".to_string(),
        SOLUTION_COMPONENT_LIMIT.to_string(),
      ),
    ],
    &[("Prefer", "odata.include-annotations=\"OData.Community.Display.V1.FormattedValue\"".to_string())],
  )
  .await
}

fn formatted_value_key(key: &str) -> String {
    format!("{key}@OData.Community.Display.V1.FormattedValue")
}

fn json_formatted_string(value: &Value, key: &str) -> Option<String> {
    json_string(value, &formatted_value_key(key))
}

pub(super) fn solution_component_from_value(value: &Value) -> Option<SolutionComponentSummary> {
    let id = json_string(value, "solutioncomponentid")?;
    let object_id = json_string(value, "objectid")?;
    let solution_id = json_string(value, "_solutionid_value").unwrap_or_default();
    let component_type = json_i32(value, "componenttype").unwrap_or_default();
    let root_component_behavior = json_i32(value, "rootcomponentbehavior");
    let component_type_label = json_formatted_string(value, "componenttype")
        .unwrap_or_else(|| solution_component_type_label(component_type).to_string());

    Some(SolutionComponentSummary {
        id,
        solution_id,
        object_id: object_id.clone(),
        component_type,
        component_type_label: component_type_label.clone(),
        group: solution_component_group(component_type).to_string(),
        display_name: format!(
            "{component_type_label} {}",
            &object_id[..object_id.len().min(8)]
        ),
        logical_name: None,
        schema_name: None,
        is_managed: None,
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        root_component_behavior,
        root_component_behavior_label: root_component_behavior_label(root_component_behavior),
        root_solution_component_id: json_string(value, "rootsolutioncomponentid"),
        version: json_i64(value, "versionnumber").map(|version| version.to_string()),
        related_entity_logical_name: None,
        related_record_url: None,
        layer_name: None,
    })
}

pub(super) fn apply_table_detail(component: &mut SolutionComponentSummary, value: &Value) {
    let logical_name = json_string(value, "LogicalName");
    let schema_name = json_string(value, "SchemaName");
    let display_name = localized_label(
        value,
        "DisplayName",
        logical_name.as_deref().unwrap_or(&component.display_name),
    );

    component.display_name = display_name;
    component.logical_name = logical_name.clone();
    component.schema_name = schema_name;
    component.is_managed = json_bool(value, "IsManaged");
    component.modified_on =
        json_string(value, "ModifiedOn").or_else(|| component.modified_on.clone());
    component.layer_name = logical_name;
}

pub(super) fn apply_choice_detail(component: &mut SolutionComponentSummary, value: &Value) {
    let name = json_string(value, "Name");
    component.display_name = localized_label(
        value,
        "DisplayName",
        name.as_deref().unwrap_or(&component.display_name),
    );
    component.logical_name = name.clone();
    component.schema_name = name.clone();
    component.is_managed = json_bool(value, "IsManaged");
    component.layer_name = name;
}

pub(super) fn apply_table_row_detail(
    component: &mut SolutionComponentSummary,
    value: &Value,
    display_keys: &[&str],
    logical_keys: &[&str],
    schema_keys: &[&str],
    entity_logical_name: &str,
    environment: &DataverseEnvironment,
) {
    if let Some(display_name) = display_keys.iter().find_map(|key| json_string(value, key)) {
        component.display_name = display_name;
    }

    component.logical_name = logical_keys.iter().find_map(|key| json_string(value, key));
    component.schema_name = schema_keys.iter().find_map(|key| json_string(value, key));
    component.is_managed = json_bool(value, "ismanaged");
    component.modified_on =
        json_string(value, "modifiedon").or_else(|| component.modified_on.clone());
    component.related_entity_logical_name = Some(entity_logical_name.to_string());
    component.related_record_url = Some(dataverse_record_url(
        environment,
        entity_logical_name,
        &component.object_id,
    ));
    component.layer_name = component
        .logical_name
        .clone()
        .or_else(|| component.schema_name.clone())
        .or_else(|| Some(component.display_name.clone()));
}

fn component_detail_specs() -> [ComponentDetailSpec; 25] {
    [
        ComponentDetailSpec {
            component_types: TABLE_COMPONENT_TYPES,
            path: "/EntityDefinitions",
            id_key: "MetadataId",
            select: "MetadataId,LogicalName,SchemaName,DisplayName,IsManaged,ModifiedOn",
            kind: ComponentDetailKind::TableMetadata,
        },
        ComponentDetailSpec {
            component_types: ROLE_COMPONENT_TYPES,
            path: "/roles",
            id_key: "roleid",
            select: "roleid,name,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: ROLE_DISPLAY_KEYS,
                logical_keys: ROLE_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "role",
            },
        },
        ComponentDetailSpec {
            component_types: SYSTEM_FORM_COMPONENT_TYPES,
            path: "/systemforms",
            id_key: "formid",
            select: "formid,name,objecttypecode,type,ismanaged",
            kind: ComponentDetailKind::Row {
                display_keys: SYSTEM_FORM_DISPLAY_KEYS,
                logical_keys: SYSTEM_FORM_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "systemform",
            },
        },
        ComponentDetailSpec {
            component_types: VIEW_COMPONENT_TYPES,
            path: "/savedqueries",
            id_key: "savedqueryid",
            select: "savedqueryid,name,returnedtypecode,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: VIEW_DISPLAY_KEYS,
                logical_keys: VIEW_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "savedquery",
            },
        },
        ComponentDetailSpec {
            component_types: PROCESS_COMPONENT_TYPES,
            path: "/workflows",
            id_key: "workflowid",
            select: "workflowid,name,uniquename,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: PROCESS_DISPLAY_KEYS,
                logical_keys: PROCESS_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "workflow",
            },
        },
        ComponentDetailSpec {
            component_types: WEB_RESOURCE_COMPONENT_TYPES,
            path: "/webresourceset",
            id_key: "webresourceid",
            select: "webresourceid,name,displayname,webresourcetype,ismanaged,createdon,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: WEB_RESOURCE_DISPLAY_KEYS,
                logical_keys: WEB_RESOURCE_LOGICAL_KEYS,
                schema_keys: WEB_RESOURCE_SCHEMA_KEYS,
                entity_logical_name: "webresource",
            },
        },
        ComponentDetailSpec {
            component_types: MODEL_DRIVEN_APP_COMPONENT_TYPES,
            path: "/appmodules",
            id_key: "appmoduleid",
            select: "appmoduleid,name,uniquename,ismanaged,createdon,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: MODEL_DRIVEN_APP_DISPLAY_KEYS,
                logical_keys: MODEL_DRIVEN_APP_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "appmodule",
            },
        },
        ComponentDetailSpec {
            component_types: CANVAS_APP_COMPONENT_TYPES,
            path: "/canvasapps",
            id_key: "canvasappid",
            select: "canvasappid,displayname,name,ismanaged",
            kind: ComponentDetailKind::Row {
                display_keys: CANVAS_APP_DISPLAY_KEYS,
                logical_keys: CANVAS_APP_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "canvasapp",
            },
        },
        ComponentDetailSpec {
            component_types: ENV_VAR_DEFINITION_COMPONENT_TYPES,
            path: "/environmentvariabledefinitions",
            id_key: "environmentvariabledefinitionid",
            select: "environmentvariabledefinitionid,schemaname,displayname,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: ENV_VAR_DEFINITION_DISPLAY_KEYS,
                logical_keys: ENV_VAR_DEFINITION_LOGICAL_KEYS,
                schema_keys: ENV_VAR_DEFINITION_SCHEMA_KEYS,
                entity_logical_name: "environmentvariabledefinition",
            },
        },
        ComponentDetailSpec {
            component_types: ENV_VAR_VALUE_COMPONENT_TYPES,
            path: "/environmentvariablevalues",
            id_key: "environmentvariablevalueid",
            select:
                "environmentvariablevalueid,value,_environmentvariabledefinitionid_value,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: ENV_VAR_VALUE_DISPLAY_KEYS,
                logical_keys: ENV_VAR_VALUE_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "environmentvariablevalue",
            },
        },
        ComponentDetailSpec {
            component_types: CHART_COMPONENT_TYPES,
            path: "/savedqueryvisualizations",
            id_key: "savedqueryvisualizationid",
            select: "savedqueryvisualizationid,name,primaryentitytypecode,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: CHART_DISPLAY_KEYS,
                logical_keys: CHART_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "savedqueryvisualization",
            },
        },
        ComponentDetailSpec {
            component_types: SITE_MAP_COMPONENT_TYPES,
            path: "/sitemaps",
            id_key: "sitemapid",
            select: "sitemapid,sitemapname,sitemapnameunique,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: SITE_MAP_DISPLAY_KEYS,
                logical_keys: SITE_MAP_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "sitemap",
            },
        },
        ComponentDetailSpec {
            component_types: CUSTOM_CONTROL_COMPONENT_TYPES,
            path: "/customcontrols",
            id_key: "customcontrolid",
            select: "customcontrolid,name,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: CUSTOM_CONTROL_DISPLAY_KEYS,
                logical_keys: CUSTOM_CONTROL_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "customcontrol",
            },
        },
        ComponentDetailSpec {
            component_types: CUSTOM_CONTROL_DEFAULT_CONFIG_COMPONENT_TYPES,
            path: "/customcontroldefaultconfigs",
            id_key: "customcontroldefaultconfigid",
            select: "customcontroldefaultconfigid,primaryentitytypecode,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: CUSTOM_CONTROL_DEFAULT_CONFIG_DISPLAY_KEYS,
                logical_keys: CUSTOM_CONTROL_DEFAULT_CONFIG_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "customcontroldefaultconfig",
            },
        },
        ComponentDetailSpec {
            component_types: FIELD_SECURITY_PROFILE_COMPONENT_TYPES,
            path: "/fieldsecurityprofiles",
            id_key: "fieldsecurityprofileid",
            select: "fieldsecurityprofileid,name,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: FIELD_SECURITY_PROFILE_DISPLAY_KEYS,
                logical_keys: FIELD_SECURITY_PROFILE_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "fieldsecurityprofile",
            },
        },
        ComponentDetailSpec {
            component_types: PLUGIN_TYPE_COMPONENT_TYPES,
            path: "/plugintypes",
            id_key: "plugintypeid",
            select: "plugintypeid,name,friendlyname,typename,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: PLUGIN_TYPE_DISPLAY_KEYS,
                logical_keys: PLUGIN_TYPE_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "plugintype",
            },
        },
        ComponentDetailSpec {
            component_types: PLUGIN_ASSEMBLY_COMPONENT_TYPES,
            path: "/pluginassemblies",
            id_key: "pluginassemblyid",
            select: "pluginassemblyid,name,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: PLUGIN_ASSEMBLY_DISPLAY_KEYS,
                logical_keys: PLUGIN_ASSEMBLY_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "pluginassembly",
            },
        },
        ComponentDetailSpec {
            component_types: PLUGIN_STEP_COMPONENT_TYPES,
            path: "/sdkmessageprocessingsteps",
            id_key: "sdkmessageprocessingstepid",
            select: "sdkmessageprocessingstepid,name,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: PLUGIN_STEP_DISPLAY_KEYS,
                logical_keys: PLUGIN_STEP_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "sdkmessageprocessingstep",
            },
        },
        ComponentDetailSpec {
            component_types: PLUGIN_STEP_IMAGE_COMPONENT_TYPES,
            path: "/sdkmessageprocessingstepimages",
            id_key: "sdkmessageprocessingstepimageid",
            select: "sdkmessageprocessingstepimageid,name,entityalias,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: PLUGIN_STEP_IMAGE_DISPLAY_KEYS,
                logical_keys: PLUGIN_STEP_IMAGE_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "sdkmessageprocessingstepimage",
            },
        },
        ComponentDetailSpec {
            component_types: SERVICE_ENDPOINT_COMPONENT_TYPES,
            path: "/serviceendpoints",
            id_key: "serviceendpointid",
            select: "serviceendpointid,name,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: SERVICE_ENDPOINT_DISPLAY_KEYS,
                logical_keys: SERVICE_ENDPOINT_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "serviceendpoint",
            },
        },
        ComponentDetailSpec {
            component_types: SDK_MESSAGE_COMPONENT_TYPES,
            path: "/sdkmessages",
            id_key: "sdkmessageid",
            select: "sdkmessageid,name",
            kind: ComponentDetailKind::Row {
                display_keys: SDK_MESSAGE_DISPLAY_KEYS,
                logical_keys: SDK_MESSAGE_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "sdkmessage",
            },
        },
        ComponentDetailSpec {
            component_types: SDK_MESSAGE_FILTER_COMPONENT_TYPES,
            path: "/sdkmessagefilters",
            id_key: "sdkmessagefilterid",
            select: "sdkmessagefilterid,primaryobjecttypecode,secondaryobjecttypecode",
            kind: ComponentDetailKind::Row {
                display_keys: SDK_MESSAGE_FILTER_DISPLAY_KEYS,
                logical_keys: SDK_MESSAGE_FILTER_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "sdkmessagefilter",
            },
        },
        ComponentDetailSpec {
            component_types: CONNECTOR_COMPONENT_TYPES,
            path: "/connectors",
            id_key: "connectorid",
            select: "connectorid,name,displayname,ismanaged,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: CONNECTOR_DISPLAY_KEYS,
                logical_keys: CONNECTOR_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "connector",
            },
        },
        ComponentDetailSpec {
            component_types: APP_ELEMENT_COMPONENT_TYPES,
            path: "/appelements",
            id_key: "appelementid",
            select: "appelementid,name,uniquename,componentidunique,ismanaged,createdon,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: APP_ELEMENT_DISPLAY_KEYS,
                logical_keys: APP_ELEMENT_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "appelement",
            },
        },
        ComponentDetailSpec {
            component_types: CONNECTION_REFERENCE_COMPONENT_TYPES,
            path: "/connectionreferences",
            id_key: "connectionreferenceid",
            select: "connectionreferenceid,connectionreferencedisplayname,connectionreferencelogicalname,componentidunique,ismanaged,createdon,modifiedon",
            kind: ComponentDetailKind::Row {
                display_keys: CONNECTION_REFERENCE_DISPLAY_KEYS,
                logical_keys: CONNECTION_REFERENCE_LOGICAL_KEYS,
                schema_keys: EMPTY_KEYS,
                entity_logical_name: "connectionreference",
            },
        },
    ]
}

fn normalized_component_id(value: &str) -> String {
    value.to_ascii_lowercase()
}

fn component_indexes_by_object_id(
    components: &[SolutionComponentSummary],
) -> HashMap<String, Vec<usize>> {
    let mut indexes = HashMap::<String, Vec<usize>>::new();

    for (index, component) in components.iter().enumerate() {
        indexes
            .entry(normalized_component_id(&component.object_id))
            .or_default()
            .push(index);
    }

    indexes
}

fn component_object_ids_for_types(
    components: &[SolutionComponentSummary],
    component_types: &[i32],
) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut ids = Vec::new();

    for component in components {
        if !component_types.contains(&component.component_type) {
            continue;
        }

        let normalized = normalized_component_id(&component.object_id);
        if seen.insert(normalized) {
            ids.push(component.object_id.clone());
        }
    }

    ids
}

fn guid_or_filter(id_key: &str, ids: &[String]) -> String {
    ids.iter()
        .map(|id| format!("{id_key} eq {id}"))
        .collect::<Vec<_>>()
        .join(" or ")
}

fn string_or_filter(field: &str, ids: &[String]) -> String {
    ids.iter()
        .map(|id| format!("{field} eq '{}'", odata_string_literal(id)))
        .collect::<Vec<_>>()
        .join(" or ")
}

fn apply_component_detail(
    component: &mut SolutionComponentSummary,
    value: &Value,
    kind: ComponentDetailKind,
    environment: &DataverseEnvironment,
) {
    match kind {
        ComponentDetailKind::TableMetadata => apply_table_detail(component, value),
        ComponentDetailKind::Row {
            display_keys,
            logical_keys,
            schema_keys,
            entity_logical_name,
        } => apply_table_row_detail(
            component,
            value,
            display_keys,
            logical_keys,
            schema_keys,
            entity_logical_name,
            environment,
        ),
    }
}

fn fallback_display_name(component: &SolutionComponentSummary) -> String {
    format!(
        "{} {}",
        component.component_type_label,
        &component.object_id[..component.object_id.len().min(8)]
    )
}

fn component_needs_display_name(component: &SolutionComponentSummary) -> bool {
    component.display_name == fallback_display_name(component)
}

fn looks_like_guid(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn normalized_json_name_candidate(value: &str) -> Option<String> {
    let candidate = value.trim();
    if candidate.is_empty()
        || candidate.eq_ignore_ascii_case("null")
        || looks_like_guid(candidate)
        || candidate.starts_with('{')
        || candidate.starts_with('[')
    {
        return None;
    }

    Some(candidate.to_string())
}

fn labelish_json_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 6 {
        return None;
    }

    match value {
        Value::String(value) => normalized_json_name_candidate(value),
        Value::Object(map) => {
            for key in [
                "Label",
                "label",
                "Value",
                "value",
                "DisplayName",
                "displayName",
                "Name",
                "name",
            ] {
                if let Some(candidate) = map
                    .get(key)
                    .and_then(|item| labelish_json_value(item, depth + 1))
                {
                    return Some(candidate);
                }
            }

            map.get("UserLocalizedLabel")
                .and_then(|item| labelish_json_value(item, depth + 1))
                .or_else(|| {
                    map.get("LocalizedLabels")
                        .and_then(|item| labelish_json_value(item, depth + 1))
                })
        }
        Value::Array(items) => items
            .iter()
            .find_map(|item| labelish_json_value(item, depth + 1)),
        _ => None,
    }
}

fn component_json_display_name(value: &Value, depth: usize) -> Option<String> {
    if depth > 8 {
        return None;
    }

    let Value::Object(map) = value else {
        return labelish_json_value(value, depth);
    };

    for key in COMPONENT_JSON_NAME_KEYS {
        if let Some(candidate) = map
            .get(*key)
            .and_then(|item| labelish_json_value(item, depth + 1))
        {
            return Some(candidate);
        }
    }

    map.values()
        .find_map(|item| component_json_display_name(item, depth + 1))
}

fn layer_component_json_display_name(value: &Value) -> Option<String> {
    let component_json = json_string(value, "msdyn_componentjson")?;
    serde_json::from_str::<Value>(&component_json)
        .ok()
        .and_then(|json| component_json_display_name(&json, 0))
}

fn layer_display_name(value: &Value) -> Option<String> {
    json_string(value, "msdyn_solutioncomponentname")
        .and_then(|name| normalized_json_name_candidate(&name))
        .or_else(|| layer_component_json_display_name(value))
        .or_else(|| {
            json_string(value, "msdyn_name").and_then(|name| normalized_json_name_candidate(&name))
        })
        .filter(|name| !name.trim().is_empty())
}

fn component_layer_query(filter: String) -> Vec<(String, String)> {
    vec![
        (
            "$select".to_string(),
            "msdyn_componentid,msdyn_name,msdyn_solutioncomponentname,msdyn_componentjson,msdyn_solutionname,msdyn_order"
                .to_string(),
        ),
        ("$filter".to_string(), filter),
        ("$orderby".to_string(), "msdyn_order asc".to_string()),
    ]
}

async fn component_layer_values_for_single_ids(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    ids: Vec<String>,
) -> Vec<Value> {
    let mut values = Vec::new();

    for object_id in ids {
        let filter = string_or_filter("msdyn_componentid", std::slice::from_ref(&object_id));
        let query = component_layer_query(filter);
        match tokio::time::timeout(
            SOLUTION_COMPONENT_DETAIL_TIMEOUT,
            dataverse_get_collection_values(app, environment, "/msdyn_componentlayers", query),
        )
        .await
        {
            Ok(Ok(component_values)) => values.extend(component_values),
            Ok(Err(error)) => {
                log::warn!(
                    "Could not enrich solution component {object_id} from component layers: {error}"
                );
            }
            Err(_) => {
                log::warn!(
                    "Timed out enriching solution component {object_id} from component layers after {:?}",
                    SOLUTION_COMPONENT_DETAIL_TIMEOUT
                );
            }
        }
    }

    values
}

pub(super) async fn enrich_choice_components(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    components: &mut [SolutionComponentSummary],
) {
    let indexes_by_object_id = component_indexes_by_object_id(components);
    let ids = component_object_ids_for_types(components, CHOICE_COMPONENT_TYPES);
    let mut choices = JoinSet::new();

    for object_id in ids {
        let app = app.clone();
        let environment = environment.clone();
        choices.spawn(async move {
            let path = format!("/GlobalOptionSetDefinitions({object_id})");
            let value = match tokio::time::timeout(
                SOLUTION_COMPONENT_DETAIL_TIMEOUT,
                dataverse_get_json_value(
                    &app,
                    &environment,
                    &path,
                    &[("$select", "MetadataId,Name,DisplayName,IsManaged")],
                ),
            )
            .await
            {
                Ok(Ok(value)) => Some(value),
                Ok(Err(error)) => {
                    log::warn!("Could not enrich global choice {object_id}: {error}");
                    None
                }
                Err(_) => {
                    log::warn!(
                        "Timed out enriching global choice {object_id} after {:?}",
                        SOLUTION_COMPONENT_DETAIL_TIMEOUT
                    );
                    None
                }
            };

            (object_id, value)
        });
    }

    while let Some(result) = choices.join_next().await {
        let Ok((object_id, Some(value))) = result else {
            continue;
        };
        let Some(indexes) = indexes_by_object_id.get(&normalized_component_id(&object_id)) else {
            continue;
        };

        for index in indexes {
            let component = &mut components[*index];
            if CHOICE_COMPONENT_TYPES.contains(&component.component_type) {
                apply_choice_detail(component, &value);
            }
        }
    }
}

pub(super) async fn enrich_component_layers(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    components: &mut [SolutionComponentSummary],
) {
    let indexes_by_object_id = component_indexes_by_object_id(components);
    let mut seen = HashSet::new();
    let unresolved_ids = components
        .iter()
        .filter(|component| component_needs_display_name(component))
        .filter_map(|component| {
            let normalized = normalized_component_id(&component.object_id);
            seen.insert(normalized).then(|| component.object_id.clone())
        })
        .collect::<Vec<_>>();

    if unresolved_ids.is_empty() {
        return;
    }

    let mut layer_batches = JoinSet::new();

    for chunk in unresolved_ids.chunks(SOLUTION_COMPONENT_DETAIL_BATCH_SIZE) {
        let app = app.clone();
        let environment = environment.clone();
        let ids = chunk.to_vec();
        let filter = string_or_filter("msdyn_componentid", &ids);
        let query = component_layer_query(filter);

        layer_batches.spawn(async move {
            match tokio::time::timeout(
                SOLUTION_COMPONENT_DETAIL_TIMEOUT,
                dataverse_get_collection_values(
                    &app,
                    &environment,
                    "/msdyn_componentlayers",
                    query,
                ),
            )
            .await
            {
                Ok(Ok(values)) => values,
                Ok(Err(error)) => {
                    log::warn!(
                        "Could not enrich solution components from component layers batch: {error}"
                    );
                    component_layer_values_for_single_ids(&app, &environment, ids).await
                }
                Err(_) => {
                    log::warn!(
                        "Timed out enriching solution components from component layers batch after {:?}",
                        SOLUTION_COMPONENT_DETAIL_TIMEOUT
                    );
                    component_layer_values_for_single_ids(&app, &environment, ids).await
                }
            }
        });
    }

    while let Some(result) = layer_batches.join_next().await {
        let Ok(values) = result else {
            continue;
        };

        for value in values {
            let Some(component_id) = json_string(&value, "msdyn_componentid") else {
                continue;
            };
            let Some(display_name) = layer_display_name(&value) else {
                continue;
            };
            let Some(indexes) = indexes_by_object_id.get(&normalized_component_id(&component_id))
            else {
                continue;
            };

            for index in indexes {
                let component = &mut components[*index];
                if component_needs_display_name(component) {
                    component.display_name = display_name.clone();
                    if component.logical_name.is_none() {
                        component.logical_name = Some(display_name.clone());
                    }
                    component.layer_name = Some(display_name.clone());
                }
            }
        }
    }
}

pub(super) fn enrich_components_from_roots(components: &mut [SolutionComponentSummary]) {
    let root_names = components
        .iter()
        .filter(|component| !component_needs_display_name(component))
        .map(|component| {
            (
                normalized_component_id(&component.id),
                (
                    component.display_name.clone(),
                    component
                        .logical_name
                        .clone()
                        .or_else(|| component.schema_name.clone())
                        .or_else(|| component.layer_name.clone()),
                ),
            )
        })
        .collect::<HashMap<_, _>>();

    for component in components {
        if !component_needs_display_name(component) {
            continue;
        }

        let Some(root_solution_component_id) = component.root_solution_component_id.as_deref()
        else {
            continue;
        };
        let Some((root_display_name, root_logical_name)) =
            root_names.get(&normalized_component_id(root_solution_component_id))
        else {
            continue;
        };

        let child_label = if component.component_type_label == "Component" {
            "Subcomponent"
        } else {
            component.component_type_label.as_str()
        };
        component.display_name = format!("{root_display_name} {child_label}");
        if component.logical_name.is_none() {
            component.logical_name = root_logical_name.clone();
        }
        component.layer_name = Some(root_display_name.clone());
    }
}

pub(super) async fn enrich_solution_components(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    components: &mut [SolutionComponentSummary],
) {
    let indexes_by_object_id = component_indexes_by_object_id(components);
    let mut batches = JoinSet::new();

    for spec in component_detail_specs() {
        let ids = component_object_ids_for_types(components, spec.component_types);

        for chunk in ids.chunks(SOLUTION_COMPONENT_DETAIL_BATCH_SIZE) {
            let app = app.clone();
            let environment = environment.clone();
            let filter = guid_or_filter(spec.id_key, chunk);
            let query = vec![
                ("$select".to_string(), spec.select.to_string()),
                ("$filter".to_string(), filter),
            ];

            batches.spawn(async move {
                let values = match tokio::time::timeout(
                    SOLUTION_COMPONENT_DETAIL_TIMEOUT,
                    dataverse_get_collection_values(&app, &environment, spec.path, query),
                )
                .await
                {
                    Ok(Ok(values)) => values,
                    Ok(Err(error)) => {
                        log::warn!(
                            "Could not enrich solution components from {}: {error}",
                            spec.path
                        );
                        Vec::new()
                    }
                    Err(_) => {
                        log::warn!(
                            "Timed out enriching solution components from {} after {:?}",
                            spec.path,
                            SOLUTION_COMPONENT_DETAIL_TIMEOUT
                        );
                        Vec::new()
                    }
                };

                (spec, values)
            });
        }
    }

    while let Some(result) = batches.join_next().await {
        let Ok((spec, values)) = result else {
            continue;
        };

        for value in values {
            let Some(detail_id) = json_string(&value, spec.id_key) else {
                continue;
            };
            let Some(indexes) = indexes_by_object_id.get(&normalized_component_id(&detail_id))
            else {
                continue;
            };

            for index in indexes {
                let component = &mut components[*index];
                if spec.component_types.contains(&component.component_type) {
                    apply_component_detail(component, &value, spec.kind, environment);
                }
            }
        }
    }

    enrich_choice_components(app, environment, components).await;
    enrich_component_layers(app, environment, components).await;
    enrich_components_from_roots(components);
}

pub(super) fn dependency_item_from_value(value: &Value) -> Option<SolutionDependencyItem> {
    let dependent_component_type = json_i32(value, "dependentcomponenttype").unwrap_or_default();
    let required_component_type = json_i32(value, "requiredcomponenttype").unwrap_or_default();
    let dependency_type = json_i32(value, "dependencytype").unwrap_or_default();

    Some(SolutionDependencyItem {
        id: json_string(value, "dependencyid")?,
        dependency_type,
        dependency_type_label: dependency_type_label(dependency_type).to_string(),
        dependent_component_type,
        dependent_component_type_label: solution_component_type_label(dependent_component_type)
            .to_string(),
        dependent_component_object_id: json_string(value, "dependentcomponentobjectid")?,
        dependent_component_parent_id: json_string(value, "dependentcomponentparentid"),
        required_component_type,
        required_component_type_label: solution_component_type_label(required_component_type)
            .to_string(),
        required_component_object_id: json_string(value, "requiredcomponentobjectid")?,
        required_component_parent_id: json_string(value, "requiredcomponentparentid"),
    })
}

pub(super) async fn dependency_function_items(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    function_name: &str,
    object_id: &str,
    component_type: i32,
) -> Result<Vec<SolutionDependencyItem>, String> {
    let path = format!(
        "/{function_name}(ObjectId=@ObjectId,ComponentType=@ComponentType)?@ObjectId={object_id}&@ComponentType={component_type}"
    );
    let response = dataverse_get_json_value(app, environment, &path, &[]).await?;

    Ok(response
        .get("value")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(dependency_item_from_value)
                .collect()
        })
        .unwrap_or_default())
}
pub(super) fn solution_layer_from_value(value: &Value) -> Option<SolutionLayer> {
    Some(SolutionLayer {
        id: json_string(value, "msdyn_componentlayerid")?,
        name: json_string(value, "msdyn_name").unwrap_or_else(|| "Layer".to_string()),
        component_name: json_string(value, "msdyn_solutioncomponentname"),
        solution_name: json_string(value, "msdyn_solutionname"),
        publisher_name: json_string(value, "msdyn_publishername"),
        order: json_i32(value, "msdyn_order"),
        overwrite_time: json_string(value, "msdyn_overwritetime"),
        changes: json_string(value, "msdyn_changes"),
    })
}
#[tauri::command]
pub(super) async fn list_solutions(
    app: AppHandle,
    environment: DataverseEnvironment,
    managed_filter: Option<String>,
) -> Result<Vec<SolutionSummary>, String> {
    let filter = solution_managed_filter(managed_filter.as_deref())?;
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/solutions",
    vec![
      (
        "$select".to_string(),
        "solutionid,uniquename,friendlyname,version,ismanaged,isvisible,createdon,modifiedon,_publisherid_value".to_string(),
      ),
      ("$filter".to_string(), filter.to_string()),
      ("$expand".to_string(), "publisherid($select=publisherid,uniquename,friendlyname,customizationprefix)".to_string()),
      ("$orderby".to_string(), "createdon desc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .map(|value| solution_from_value(value, None))
        .collect())
}

#[tauri::command]
pub(super) async fn list_solution_components(
    app: AppHandle,
    environment: DataverseEnvironment,
    solution_id: String,
) -> Result<Vec<SolutionComponentSummary>, String> {
    let values = solution_component_values(&app, &environment, &solution_id).await?;
    let mut components = values
        .iter()
        .filter_map(solution_component_from_value)
        .collect::<Vec<_>>();

    enrich_solution_components(&app, &environment, &mut components).await;

    components.sort_by(|left, right| {
        left.group
            .cmp(&right.group)
            .then_with(|| {
                left.display_name
                    .to_lowercase()
                    .cmp(&right.display_name.to_lowercase())
            })
            .then_with(|| left.object_id.cmp(&right.object_id))
    });

    Ok(components)
}

#[tauri::command]
pub(super) async fn get_solution_component_dependencies(
    app: AppHandle,
    environment: DataverseEnvironment,
    object_id: String,
    component_type: i32,
) -> Result<SolutionDependencyReport, String> {
    let required = dependency_function_items(
        &app,
        &environment,
        "RetrieveRequiredComponents",
        &object_id,
        component_type,
    )
    .await?;
    let dependents = dependency_function_items(
        &app,
        &environment,
        "RetrieveDependentComponents",
        &object_id,
        component_type,
    )
    .await?;
    let delete_blockers = dependency_function_items(
        &app,
        &environment,
        "RetrieveDependenciesForDelete",
        &object_id,
        component_type,
    )
    .await?;

    Ok(SolutionDependencyReport {
        required,
        dependents,
        delete_blockers,
    })
}

#[tauri::command]
pub(super) async fn get_solution_component_layers(
    app: AppHandle,
    environment: DataverseEnvironment,
    object_id: String,
    component_name: String,
) -> Result<Vec<SolutionLayer>, String> {
    let trimmed_name = component_name.trim();
    if trimmed_name.is_empty() {
        return Ok(Vec::new());
    }

    let filter = format!(
        "msdyn_componentid eq '{}' and msdyn_solutioncomponentname eq '{}'",
        odata_string_literal(&object_id),
        odata_string_literal(trimmed_name)
    );
    let values = dataverse_get_collection_values(
    &app,
    &environment,
    "/msdyn_componentlayers",
    vec![
      (
        "$select".to_string(),
        "msdyn_componentlayerid,msdyn_name,msdyn_componentid,msdyn_solutioncomponentname,msdyn_solutionname,msdyn_publishername,msdyn_order,msdyn_overwritetime,msdyn_changes".to_string(),
      ),
      ("$filter".to_string(), filter),
      ("$orderby".to_string(), "msdyn_order desc".to_string()),
    ],
  )
  .await?;

    Ok(values
        .iter()
        .filter_map(solution_layer_from_value)
        .collect())
}

#[tauri::command]
pub(super) async fn list_solution_web_resource_candidates(
    app: AppHandle,
    environment: DataverseEnvironment,
    solution_id: String,
) -> Result<Vec<SolutionWebResourceCandidate>, String> {
    let component_values = solution_component_values(&app, &environment, &solution_id).await?;
    let solution_web_resource_ids = component_values
        .iter()
        .filter(|value| json_i32(value, "componenttype") == Some(61))
        .filter_map(|value| json_string(value, "objectid"))
        .collect::<HashSet<_>>();

    let values = dataverse_get_collection_values(
        &app,
        &environment,
        "/webresourceset",
        vec![
            (
                "$select".to_string(),
                "webresourceid,name,displayname,webresourcetype,ismanaged,modifiedon".to_string(),
            ),
            (
                "$filter".to_string(),
                format!("ismanaged eq false and ({})", web_resource_type_filter()),
            ),
            ("$orderby".to_string(), "name asc".to_string()),
        ],
    )
    .await?;

    Ok(values
        .iter()
        .filter_map(|value| {
            let id = json_string(value, "webresourceid")?;
            let type_code = json_i32(value, "webresourcetype").unwrap_or(4);

            let name = json_string(value, "name").unwrap_or_default();
            if is_microsoft_web_resource_name(&name) {
                return None;
            }

            Some(SolutionWebResourceCandidate {
                in_solution: solution_web_resource_ids.contains(&id),
                id,
                name,
                display_name: json_string(value, "displayname"),
                resource_type: map_resource_type(Some(type_code)),
                type_code,
                is_managed: false,
                modified_on: json_string(value, "modifiedon"),
            })
        })
        .collect())
}

async fn ensure_unmanaged_solution(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_unique_name: &str,
) -> Result<String, String> {
    let values = dataverse_get_collection_values(
        app,
        environment,
        "/solutions",
        vec![
            (
                "$select".to_string(),
                "solutionid,uniquename,friendlyname,ismanaged".to_string(),
            ),
            (
                "$filter".to_string(),
                format!(
                    "uniquename eq '{}' and isvisible eq true",
                    odata_string_literal(solution_unique_name)
                ),
            ),
            ("$top".to_string(), "1".to_string()),
        ],
    )
    .await?;

    let Some(solution) = values.first() else {
        return Err(format!("Could not find solution {solution_unique_name}."));
    };
    let solution_id = json_string(solution, "solutionid")
        .ok_or_else(|| format!("Solution {solution_unique_name} did not include an id."))?;

    if json_bool(solution, "ismanaged").unwrap_or(false) {
        let name = json_string(solution, "friendlyname")
            .or_else(|| json_string(solution, "uniquename"))
            .unwrap_or_else(|| solution_unique_name.to_string());

        return Err(format!("Managed solution {name} cannot be changed."));
    }

    Ok(solution_id)
}

async fn add_web_resource_to_solution(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_unique_name: &str,
    web_resource_id: &str,
) -> Result<SolutionWriteResult, String> {
    ensure_unmanaged_solution(app, environment, solution_unique_name).await?;

    let resource = dataverse_get_json_value(
        app,
        environment,
        &format!("/webresourceset({web_resource_id})"),
        &[("$select", "webresourceid,name,ismanaged")],
    )
    .await?;
    let resource_name = json_string(&resource, "name").unwrap_or_default();

    if json_bool(&resource, "ismanaged").unwrap_or(false) {
        return Err("Managed web resources cannot be added to solutions.".to_string());
    }

    if is_microsoft_web_resource_name(&resource_name) {
        return Err("Microsoft web resources cannot be added to solutions.".to_string());
    }

    dataverse_json_request(
        app,
        environment,
        reqwest::Method::POST,
        "/AddSolutionComponent",
        &add_web_resource_solution_component_payload(web_resource_id, solution_unique_name),
    )
    .await?;

    Ok(SolutionWriteResult {
        web_resource_id: Some(web_resource_id.to_string()),
        message: format!("Added web resource to {solution_unique_name}"),
    })
}

#[tauri::command]
pub(super) async fn add_existing_web_resource_to_solution(
    app: AppHandle,
    environment: DataverseEnvironment,
    solution_unique_name: String,
    web_resource_id: String,
) -> Result<SolutionWriteResult, String> {
    let solution_unique_name = validate_logical_name(&solution_unique_name)?;
    add_web_resource_to_solution(&app, &environment, &solution_unique_name, &web_resource_id).await
}

#[tauri::command]
pub(super) async fn remove_solution_component_from_solution(
    app: AppHandle,
    environment: DataverseEnvironment,
    solution_unique_name: String,
    component_object_id: String,
    component_type: i32,
    display_name: String,
) -> Result<SolutionWriteResult, String> {
    let solution_unique_name = validate_logical_name(&solution_unique_name)?;
    ensure_unmanaged_solution(&app, &environment, &solution_unique_name).await?;

    dataverse_json_request(
        &app,
        &environment,
        reqwest::Method::POST,
        "/RemoveSolutionComponent",
        &remove_solution_component_payload(
            &component_object_id,
            component_type,
            &solution_unique_name,
        ),
    )
    .await?;

    let label = display_name.trim();
    let label = if label.is_empty() { "component" } else { label };

    Ok(SolutionWriteResult {
        web_resource_id: None,
        message: format!("Removed {label} from {solution_unique_name}"),
    })
}

fn normalize_web_resource_path(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .split('/')
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn validate_web_resource_name(value: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err("Web resource name is required.".to_string());
    }

    if value.len() > 256 {
        return Err(format!(
            "Web resource name must be 256 characters or fewer: {value}"
        ));
    }

    if value.starts_with('/') || value.ends_with('/') || value.contains("//") {
        return Err(format!(
            "Web resource name cannot start, end, or contain consecutive slashes: {value}"
        ));
    }

    if value
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace())
    {
        return Err(format!(
            "Web resource name cannot contain whitespace or control characters: {value}"
        ));
    }

    if value.contains('\\') {
        return Err(format!(
            "Web resource name must use forward slashes, not backslashes: {value}"
        ));
    }

    Ok(())
}

fn relative_file_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(root).map_err(|error| {
        format!(
            "Could not calculate relative path for {}: {error}",
            path.display()
        )
    })?;

    path_components_to_web_resource_path(relative)
}

fn file_name_path(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(ToString::to_string)
        .ok_or_else(|| format!("Could not read file name for {}", path.display()))
}

fn path_components_to_web_resource_path(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();

    for component in path.components() {
        match component {
            Component::Normal(value) => {
                let value = value
                    .to_str()
                    .ok_or_else(|| format!("Path is not valid UTF-8: {}", path.display()))?;
                parts.push(value.to_string());
            }
            Component::CurDir => {}
            _ => {
                return Err(format!(
                    "Path contains unsupported traversal component: {}",
                    path.display()
                ));
            }
        }
    }

    let relative_path = parts.join("/");
    if relative_path.is_empty() {
        return Err(format!(
            "Path did not contain a file name: {}",
            path.display()
        ));
    }

    Ok(relative_path)
}

fn web_resource_type_code_for_path(path: &Path) -> Option<i32> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();

    match extension.as_str() {
        "html" | "htm" => Some(1),
        "css" => Some(2),
        "js" | "ts" => Some(3),
        "xml" | "json" => Some(4),
        "png" => Some(5),
        "jpg" | "jpeg" => Some(6),
        "gif" => Some(7),
        "xsl" | "xslt" => Some(9),
        "ico" => Some(10),
        "svg" => Some(11),
        "resx" => Some(12),
        _ => None,
    }
}

fn collect_directory_import_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<WebResourceImportFile>,
    skipped: &mut Vec<WebResourceImportSkip>,
) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Could not read directory {}: {error}", directory.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Could not read directory entry in {}: {error}",
                directory.display()
            )
        })?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Could not inspect {}: {error}", path.display()))?;

        if file_type.is_dir() {
            collect_directory_import_files(root, &path, files, skipped)?;
            continue;
        }

        if !file_type.is_file() {
            skipped.push(WebResourceImportSkip {
                source_path: path.display().to_string(),
                reason: "Skipped non-file entry.".to_string(),
            });
            continue;
        }

        if entry.file_name().to_string_lossy() == ".DS_Store" {
            skipped.push(WebResourceImportSkip {
                source_path: path.display().to_string(),
                reason: "Skipped macOS metadata file.".to_string(),
            });
            continue;
        }

        files.push(WebResourceImportFile {
            relative_path: relative_file_path(root, &path)?,
            path,
        });
    }

    Ok(())
}

fn collect_import_files(
    source_paths: &[String],
) -> Result<(Vec<WebResourceImportFile>, Vec<WebResourceImportSkip>), String> {
    let mut files = Vec::new();
    let mut skipped = Vec::new();

    for source_path in source_paths {
        let path = PathBuf::from(source_path);
        if path.is_file() {
            files.push(WebResourceImportFile {
                relative_path: file_name_path(&path)?,
                path,
            });
        } else if path.is_dir() {
            collect_directory_import_files(&path, &path, &mut files, &mut skipped)?;
        } else {
            skipped.push(WebResourceImportSkip {
                source_path: source_path.clone(),
                reason: "Source path does not exist.".to_string(),
            });
        }
    }

    if files.is_empty() && skipped.is_empty() {
        return Err("Choose at least one file or folder to import.".to_string());
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok((files, skipped))
}

fn import_file_plan(
    source_paths: &[String],
    target_root: &str,
) -> Result<
    (
        Vec<(WebResourceImportFile, String, i32)>,
        Vec<WebResourceImportSkip>,
    ),
    String,
> {
    let (files, mut skipped) = collect_import_files(source_paths)?;
    let target_root = normalize_web_resource_path(target_root);
    validate_web_resource_name(&target_root)?;

    let mut names = HashSet::new();
    let mut plan = Vec::new();

    for file in files {
        let Some(type_code) = web_resource_type_code_for_path(&file.path) else {
            skipped.push(WebResourceImportSkip {
                source_path: file.path.display().to_string(),
                reason: "Skipped unsupported web resource extension.".to_string(),
            });
            continue;
        };

        let relative_path = normalize_web_resource_path(&file.relative_path);
        let name = normalize_web_resource_path(&format!("{target_root}/{relative_path}"));
        validate_web_resource_name(&name)?;

        if !names.insert(name.clone()) {
            return Err(format!("Multiple selected files map to {name}."));
        }

        plan.push((file, name, type_code));
    }

    if plan.is_empty() {
        return Err("No supported web resource files were selected.".to_string());
    }

    Ok((plan, skipped))
}

async fn create_web_resource_record(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_unique_name: &str,
    name: &str,
    display_name: &str,
    description: &str,
    type_code: i32,
    bytes: &[u8],
) -> Result<Option<String>, String> {
    let content = BASE64.encode(bytes);
    let mut payload = serde_json::json!({
      "name": name,
      "webresourcetype": type_code,
      "content": content,
    });

    if !display_name.trim().is_empty() {
        payload["displayname"] = Value::String(display_name.trim().to_string());
    }

    if !description.trim().is_empty() {
        payload["description"] = Value::String(description.trim().to_string());
    }

    let (body, entity_id) = dataverse_post_json_with_headers(
        app,
        environment,
        "/webresourceset",
        &payload,
        &[
            ("MSCRM.SolutionUniqueName", solution_unique_name.to_string()),
            ("Prefer", "return=representation".to_string()),
        ],
    )
    .await?;

    Ok(serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| json_string(&value, "webresourceid"))
        .or_else(|| entity_id.as_deref().and_then(guid_from_entity_id)))
}

fn xml_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\'', "&apos;")
}

fn handler_xml(binding: &FormLogicBindingInput, library_name: &str) -> String {
    format!(
        r#"<Handler functionName="{}" libraryName="{}" handlerUniqueId="{{{}}}" enabled="true" parameters="" passExecutionContext="{}" />"#,
        xml_attr(&binding.handler),
        xml_attr(library_name),
        Uuid::new_v4(),
        if binding.pass_execution_context {
            "true"
        } else {
            "false"
        }
    )
}

fn ensure_form_library(form_xml: &str, web_resource_name: &str) -> String {
    let library_name = format!("$webresource:{web_resource_name}");
    if form_xml.contains(&format!(r#"name="{}""#, xml_attr(&library_name)))
        || form_xml.contains(&format!(r#"name="{}""#, xml_attr(web_resource_name)))
    {
        return form_xml.to_string();
    }

    let library = format!(
        r#"<Library name="{}" libraryUniqueId="{{{}}}" />"#,
        xml_attr(&library_name),
        Uuid::new_v4()
    );

    if let Some(index) = form_xml.find("</formLibraries>") {
        let mut updated = form_xml.to_string();
        updated.insert_str(index, &library);
        return updated;
    }

    let Some(form_open_end) = form_xml.find('>') else {
        return form_xml.to_string();
    };
    let mut updated = form_xml.to_string();
    updated.insert_str(
        form_open_end + 1,
        &format!("<formLibraries>{library}</formLibraries>"),
    );
    updated
}

fn ensure_event_handler_in_events_xml(
    events_xml: &str,
    binding: &FormLogicBindingInput,
    library_name: &str,
) -> String {
    if events_xml.contains(&format!(r#"functionName="{}""#, xml_attr(&binding.handler)))
        && events_xml.contains(&format!(r#"libraryName="{}""#, xml_attr(library_name)))
    {
        return events_xml.to_string();
    }

    let handler = handler_xml(binding, library_name);
    let event_marker = format!(r#"<event name="{}""#, xml_attr(&binding.event_name));

    if let Some(event_start) = events_xml.find(&event_marker) {
        let event_tail = &events_xml[event_start..];
        if let Some(event_end_offset) = event_tail.find("</event>") {
            let event_end = event_start + event_end_offset;
            let event_slice = &events_xml[event_start..event_end];
            let mut updated = events_xml.to_string();

            if let Some(handlers_end_offset) = event_slice.find("</Handlers>") {
                updated.insert_str(event_start + handlers_end_offset, &handler);
            } else {
                updated.insert_str(event_end, &format!("<Handlers>{handler}</Handlers>"));
            }

            return updated;
        }
    }

    let event = format!(
        r#"<event name="{}" application="false"><Handlers>{handler}</Handlers></event>"#,
        xml_attr(&binding.event_name)
    );
    let mut updated = events_xml.to_string();
    if let Some(index) = updated.find("</events>") {
        updated.insert_str(index, &event);
    }
    updated
}

fn ensure_root_event_handler(
    form_xml: &str,
    binding: &FormLogicBindingInput,
    library_name: &str,
) -> String {
    if let Some(events_start) = form_xml.find("<events>") {
        if let Some(events_end_offset) = form_xml[events_start..].find("</events>") {
            let events_end = events_start + events_end_offset + "</events>".len();
            let updated_events = ensure_event_handler_in_events_xml(
                &form_xml[events_start..events_end],
                binding,
                library_name,
            );
            let mut updated = form_xml.to_string();
            updated.replace_range(events_start..events_end, &updated_events);
            return updated;
        }
    }

    let handler = handler_xml(binding, library_name);
    let events = format!(
        r#"<events><event name="{}" application="false"><Handlers>{handler}</Handlers></event></events>"#,
        xml_attr(&binding.event_name)
    );
    let mut updated = form_xml.to_string();
    if let Some(form_end) = updated.find("</form>") {
        updated.insert_str(form_end, &events);
    }
    updated
}

fn ensure_control_event_handler(
    form_xml: &str,
    binding: &FormLogicBindingInput,
    library_name: &str,
) -> Result<Option<String>, String> {
    let Some(attribute_name) = binding.attribute_logical_name.as_deref() else {
        return Ok(None);
    };
    let markers = [
        format!(r#"datafieldname="{}""#, xml_attr(attribute_name)),
        format!("datafieldname='{}'", xml_attr(attribute_name)),
        format!(r#"id="{}""#, xml_attr(attribute_name)),
        format!("id='{}'", xml_attr(attribute_name)),
    ];
    let Some(marker_index) = markers.iter().find_map(|marker| form_xml.find(marker)) else {
        return Ok(None);
    };
    let Some(control_start) = form_xml[..marker_index].rfind("<control") else {
        return Ok(None);
    };
    let control_tail = &form_xml[control_start..];
    let Some(open_end_offset) = control_tail.find('>') else {
        return Err(format!(
            "The {attribute_name} control is not editable in the selected form XML."
        ));
    };
    let opening_tag = &control_tail[..=open_end_offset];
    let opening_tag_body = opening_tag.trim_end_matches('>').trim_end();
    let is_self_closing = opening_tag_body.ends_with('/');
    let handler = handler_xml(binding, library_name);
    let events = format!(
        r#"<events><event name="{}" application="false"><Handlers>{handler}</Handlers></event></events>"#,
        xml_attr(&binding.event_name)
    );

    if is_self_closing {
        let control_end = control_start + open_end_offset + 1;
        let control_open = opening_tag_body.trim_end_matches('/').trim_end();
        let mut updated = form_xml.to_string();
        updated.replace_range(
            control_start..control_end,
            &format!("{control_open}>{events}</control>"),
        );
        return Ok(Some(updated));
    }

    let Some(control_end_offset) = control_tail.find("</control>") else {
        return Err(format!(
            "The {attribute_name} control is not editable in the selected form XML."
        ));
    };
    let control_end = control_start + control_end_offset + "</control>".len();
    let control_xml = &form_xml[control_start..control_end];

    let updated_control = if let Some(events_start_offset) = control_xml.find("<events>") {
        if let Some(events_end_offset) = control_xml[events_start_offset..].find("</events>") {
            let events_start = events_start_offset;
            let events_end = events_start_offset + events_end_offset + "</events>".len();
            let updated_events = ensure_event_handler_in_events_xml(
                &control_xml[events_start..events_end],
                binding,
                library_name,
            );
            let mut updated = control_xml.to_string();
            updated.replace_range(events_start..events_end, &updated_events);
            updated
        } else {
            control_xml.to_string()
        }
    } else {
        control_xml.replacen("</control>", &format!("{events}</control>"), 1)
    };

    let mut updated = form_xml.to_string();
    updated.replace_range(control_start..control_end, &updated_control);
    Ok(Some(updated))
}

fn apply_form_logic_bindings(
    form_xml: &str,
    web_resource_name: &str,
    bindings: &[FormLogicBindingInput],
) -> Result<(String, usize), String> {
    let library_name = format!("$webresource:{web_resource_name}");
    let mut updated = form_xml.to_string();
    let mut applied = 0;

    for binding in bindings {
        match binding.event_name.as_str() {
            "onload" => {
                updated = ensure_root_event_handler(&updated, binding, &library_name);
                applied += 1;
            }
            "onchange" => {
                if let Some(next_xml) =
                    ensure_control_event_handler(&updated, binding, &library_name)?
                {
                    updated = next_xml;
                    applied += 1;
                }
            }
            _ => {
                return Err(format!(
                    "Unsupported form event handler: {}.",
                    binding.event_label
                ));
            }
        }
    }

    if applied > 0 {
        updated = ensure_form_library(&updated, web_resource_name);
    }

    Ok((updated, applied))
}

async fn resolve_form_logic_form(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    input: &FormLogicWebResourceInput,
) -> Result<Value, String> {
    if Uuid::parse_str(&input.form_id).is_ok() {
        return dataverse_get_json_value(
            app,
            environment,
            &format!("/systemforms({})", input.form_id),
            &[(
                "$select",
                "formid,name,objecttypecode,type,formxml,ismanaged",
            )],
        )
        .await;
    }

    let filter = format!(
        "objecttypecode eq '{}' and name eq '{}' and (type eq 2 or type eq 7 or type eq 12)",
        odata_string_literal(&input.entity_logical_name),
        odata_string_literal(&input.form_name)
    );
    let values = dataverse_get_collection_values(
        app,
        environment,
        "/systemforms",
        vec![
            (
                "$select".to_string(),
                "formid,name,objecttypecode,type,formxml,ismanaged".to_string(),
            ),
            ("$filter".to_string(), filter),
            ("$top".to_string(), "1".to_string()),
        ],
    )
    .await?;

    if let Some(form) = values.into_iter().next() {
        return Ok(form);
    }

    let fallback_filter = format!(
        "objecttypecode eq '{}' and formactivationstate eq 1 and (type eq 2 or type eq 7 or type eq 12)",
        odata_string_literal(&input.entity_logical_name)
    );
    let values = dataverse_get_collection_values(
        app,
        environment,
        "/systemforms",
        vec![
            (
                "$select".to_string(),
                "formid,name,objecttypecode,type,formxml,ismanaged".to_string(),
            ),
            ("$filter".to_string(), fallback_filter),
            ("$orderby".to_string(), "type asc,name asc".to_string()),
            ("$top".to_string(), "1".to_string()),
        ],
    )
    .await?;

    values.into_iter().next().ok_or_else(|| {
        format!(
            "Could not find an active main or quick create form for {}.",
            input.entity_logical_name
        )
    })
}

async fn add_form_to_solution(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_id: &str,
    solution_unique_name: &str,
    form_id: &str,
) -> Result<(), String> {
    if solution_contains_component(
        app,
        environment,
        solution_id,
        form_id,
        SYSTEM_FORM_COMPONENT_TYPE,
    )
    .await?
    {
        return Ok(());
    }

    dataverse_json_request(
        app,
        environment,
        reqwest::Method::POST,
        "/AddSolutionComponent",
        &add_form_solution_component_payload(form_id, solution_unique_name),
    )
    .await
}

async fn add_table_to_solution(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_id: &str,
    solution_unique_name: &str,
    entity_logical_name: &str,
) -> Result<(), String> {
    let table = dataverse_get_json_value(
        app,
        environment,
        &format!(
            "/EntityDefinitions(LogicalName='{}')",
            odata_string_literal(entity_logical_name)
        ),
        &[("$select", "MetadataId,LogicalName")],
    )
    .await?;
    let table_metadata_id = json_string(&table, "MetadataId")
        .ok_or_else(|| format!("Table {entity_logical_name} did not include a metadata id."))?;

    if solution_contains_component(
        app,
        environment,
        solution_id,
        &table_metadata_id,
        TABLE_COMPONENT_TYPE,
    )
    .await?
    {
        return Ok(());
    }

    dataverse_json_request(
        app,
        environment,
        reqwest::Method::POST,
        "/AddSolutionComponent",
        &add_table_solution_component_payload(&table_metadata_id, solution_unique_name),
    )
    .await
}

async fn solution_contains_component(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    solution_id: &str,
    component_id: &str,
    component_type: i32,
) -> Result<bool, String> {
    let values = dataverse_get_collection_values(
        app,
        environment,
        "/solutioncomponents",
        vec![
            ("$select".to_string(), "solutioncomponentid".to_string()),
            (
                "$filter".to_string(),
                format!(
                    "_solutionid_value eq {solution_id} and componenttype eq {component_type} and objectid eq {component_id}"
                ),
            ),
            ("$top".to_string(), "1".to_string()),
        ],
    )
    .await?;

    Ok(!values.is_empty())
}

async fn publish_form_logic_customizations(
    app: &AppHandle,
    environment: &DataverseEnvironment,
    entity_logical_name: &str,
    web_resource_id: &str,
) -> Result<(), String> {
    let parameter_xml = format!(
        "<importexportxml><entities><entity>{}</entity></entities><webresources><webresource>{}</webresource></webresources></importexportxml>",
        xml_attr(entity_logical_name),
        xml_attr(web_resource_id)
    );

    dataverse_json_request(
        app,
        environment,
        reqwest::Method::POST,
        "/PublishXml",
        &serde_json::json!({ "ParameterXml": parameter_xml }),
    )
    .await
}

#[tauri::command]
pub(super) async fn create_web_resource_in_solution(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: CreateWebResourceInput,
) -> Result<SolutionWriteResult, String> {
    let solution_unique_name = validate_logical_name(&input.solution_unique_name)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Web resource name is required.".to_string());
    }

    if name.len() > 256 {
        return Err("Web resource name must be 256 characters or fewer.".to_string());
    }

    let type_code = resource_type_code(&input.resource_type)?;
    let display_name = input.display_name.trim();
    let description = input.description.trim();
    let web_resource_id = create_web_resource_record(
        &app,
        &environment,
        &solution_unique_name,
        name,
        display_name,
        description,
        type_code,
        input.content.as_bytes(),
    )
    .await?;

    Ok(SolutionWriteResult {
        web_resource_id,
        message: format!("Created {name} in {solution_unique_name}"),
    })
}

#[tauri::command]
pub(super) async fn create_form_logic_web_resource(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: FormLogicWebResourceInput,
) -> Result<FormLogicPublishResult, String> {
    let solution_unique_name = validate_logical_name(&input.solution_unique_name)?;
    let entity_logical_name = validate_logical_name(&input.entity_logical_name)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Web resource name is required.".to_string());
    }

    if name.len() > 256 {
        return Err("Web resource name must be 256 characters or fewer.".to_string());
    }

    if input.bindings.is_empty() {
        return Err("Select at least one form event handler.".to_string());
    }

    let solution_id = ensure_unmanaged_solution(&app, &environment, &solution_unique_name).await?;
    let form_record = resolve_form_logic_form(&app, &environment, &input).await?;
    let form_id = json_string(&form_record, "formid")
        .ok_or_else(|| "Selected form did not include a form id.".to_string())?;
    let form_name = json_string(&form_record, "name").unwrap_or_else(|| input.form_name.clone());
    let form_xml = json_string(&form_record, "formxml")
        .ok_or_else(|| "Selected form did not include FormXml.".to_string())?;
    let type_code = resource_type_code(&input.resource_type)?;
    let display_name = input.display_name.trim();
    let description = input.description.trim();

    add_table_to_solution(
        &app,
        &environment,
        &solution_id,
        &solution_unique_name,
        &entity_logical_name,
    )
    .await
    .map_err(|error| {
        format!("Could not add table {entity_logical_name} to {solution_unique_name}: {error}")
    })?;
    add_form_to_solution(
        &app,
        &environment,
        &solution_id,
        &solution_unique_name,
        &form_id,
    )
    .await
    .map_err(|error| {
        format!("Could not add form {form_name} to {solution_unique_name}: {error}")
    })?;

    let web_resource_id = create_web_resource_record(
        &app,
        &environment,
        &solution_unique_name,
        name,
        display_name,
        description,
        type_code,
        input.content.as_bytes(),
    )
    .await?
    .ok_or_else(|| "Dataverse did not return the created web resource id.".to_string())?;

    let (updated_form_xml, applied_bindings) =
        apply_form_logic_bindings(&form_xml, name, &input.bindings)?;
    let selected_bindings = input.bindings.len();
    let handler_summary = if applied_bindings == selected_bindings {
        format!(
            "applied {applied_bindings} handler{}",
            if applied_bindings == 1 { "" } else { "s" }
        )
    } else {
        format!("applied {applied_bindings} of {selected_bindings} selected handlers")
    };
    let skipped_note = if applied_bindings == selected_bindings {
        ""
    } else {
        " Field handlers whose controls are not on the form were skipped."
    };

    dataverse_json_request(
        &app,
        &environment,
        reqwest::Method::PATCH,
        &format!("/systemforms({form_id})"),
        &serde_json::json!({ "formxml": updated_form_xml }),
    )
    .await?;

    publish_web_resource_by_id(&app, &environment, &web_resource_id).await?;
    publish_form_logic_customizations(&app, &environment, &entity_logical_name, &web_resource_id)
        .await?;

    Ok(FormLogicPublishResult {
        web_resource_id: Some(web_resource_id),
        form_id,
        form_name: form_name.clone(),
        applied_bindings,
        message: format!(
            "Created {name}, added {entity_logical_name} and {form_name} to {solution_unique_name}, {handler_summary}, and published customizations.{skipped_note}"
        ),
    })
}

#[tauri::command]
pub(super) async fn import_web_resources_in_solution(
    app: AppHandle,
    environment: DataverseEnvironment,
    input: ImportWebResourcesInput,
) -> Result<WebResourcesImportResult, String> {
    let solution_unique_name = validate_logical_name(&input.solution_unique_name)?;
    let (plan, skipped) = import_file_plan(&input.source_paths, &input.target_root)?;
    let mut imported = Vec::new();

    for (file, name, type_code) in plan {
        let bytes = fs::read(&file.path)
            .map_err(|error| format!("Could not read {}: {error}", file.path.display()))?;
        let display_name = file_name_path(&file.path)?;
        let web_resource_id = create_web_resource_record(
            &app,
            &environment,
            &solution_unique_name,
            &name,
            &display_name,
            &input.description,
            type_code,
            &bytes,
        )
        .await
        .map_err(|error| format!("Could not create {name}: {error}"))?;

        imported.push(WebResourceImportItem {
            source_path: file.path.display().to_string(),
            name,
            resource_type: map_resource_type(Some(type_code)),
            web_resource_id,
        });
    }

    let imported_count = imported.len();
    let skipped_count = skipped.len();
    let message = match (imported_count, skipped_count) {
        (1, 0) => format!("Imported 1 web resource into {solution_unique_name}"),
        (_, 0) => format!("Imported {imported_count} web resources into {solution_unique_name}"),
        (1, _) => {
            format!("Imported 1 web resource into {solution_unique_name}; skipped {skipped_count}")
        }
        _ => format!(
            "Imported {imported_count} web resources into {solution_unique_name}; skipped {skipped_count}"
        ),
    };

    Ok(WebResourcesImportResult {
        imported,
        skipped,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_resource_import_paths_are_normalized() {
        assert_eq!(
            normalize_web_resource_path(" /AG_/CustomWebresource//index.html "),
            "AG_/CustomWebresource/index.html"
        );
        assert_eq!(
            normalize_web_resource_path("AG_\\CustomWebresource\\index.js"),
            "AG_/CustomWebresource/index.js"
        );
    }

    #[test]
    fn web_resource_import_type_is_inferred_from_extension() {
        assert_eq!(
            web_resource_type_code_for_path(Path::new("index.html")),
            Some(1)
        );
        assert_eq!(
            web_resource_type_code_for_path(Path::new("index.css")),
            Some(2)
        );
        assert_eq!(
            web_resource_type_code_for_path(Path::new("index.js")),
            Some(3)
        );
        assert_eq!(
            web_resource_type_code_for_path(Path::new("icon.svg")),
            Some(11)
        );
        assert_eq!(
            web_resource_type_code_for_path(Path::new(".DS_Store")),
            None
        );
    }

    #[test]
    fn web_resource_import_names_reject_ambiguous_slashes() {
        assert!(validate_web_resource_name("AG_/CustomWebresource/index.html").is_ok());
        assert!(validate_web_resource_name("/AG_/index.html").is_err());
        assert!(validate_web_resource_name("AG_//index.html").is_err());
        assert!(validate_web_resource_name("AG_/index.html ").is_err());
    }

    #[test]
    fn add_existing_web_resource_omits_subcomponent_flag() {
        let payload = add_web_resource_solution_component_payload(
            "29ec6966-af51-f011-877b-6045bd8f4b2e",
            "CoreCustomizations",
        );

        assert_eq!(payload["ComponentType"], WEB_RESOURCE_COMPONENT_TYPE);
        assert_eq!(payload["AddRequiredComponents"], false);
        assert!(payload.get("DoNotIncludeSubcomponents").is_none());
    }

    #[test]
    fn form_logic_solution_components_target_table_form_and_web_resource() {
        let solution_unique_name = "CoreCustomizations";
        let table_payload = add_table_solution_component_payload(
            "f0b2b9ab-358e-f011-b4cb-7c1e5274b002",
            solution_unique_name,
        );
        let form_payload = add_form_solution_component_payload(
            "1f0f1d88-6d6a-4f72-a634-4d5f5e9f4211",
            solution_unique_name,
        );
        let web_resource_payload = add_web_resource_solution_component_payload(
            "29ec6966-af51-f011-877b-6045bd8f4b2e",
            solution_unique_name,
        );

        assert_eq!(table_payload["ComponentType"], TABLE_COMPONENT_TYPE);
        assert_eq!(table_payload["DoNotIncludeSubcomponents"], true);
        assert_eq!(form_payload["ComponentType"], SYSTEM_FORM_COMPONENT_TYPE);
        assert!(form_payload.get("DoNotIncludeSubcomponents").is_none());
        assert_eq!(
            web_resource_payload["ComponentType"],
            WEB_RESOURCE_COMPONENT_TYPE
        );
        assert!(web_resource_payload
            .get("DoNotIncludeSubcomponents")
            .is_none());
    }

    #[test]
    fn remove_solution_component_uses_component_object_reference() {
        let payload = remove_solution_component_payload(
            "741f8aae-e86e-f111-ab0e-7ced8d0c921c",
            61,
            "CoreCustomizations",
        );

        assert_eq!(
            payload["SolutionComponent"]["solutioncomponentid"],
            "741f8aae-e86e-f111-ab0e-7ced8d0c921c"
        );
        assert_eq!(payload["ComponentType"], 61);
        assert_eq!(payload["SolutionUniqueName"], "CoreCustomizations");
        assert!(payload.get("ComponentId").is_none());
    }

    fn unresolved_component(component_type: i32, object_id: &str) -> SolutionComponentSummary {
        let component_type_label = solution_component_type_label(component_type).to_string();

        SolutionComponentSummary {
            id: format!("component-{object_id}"),
            solution_id: "solution".to_string(),
            object_id: object_id.to_string(),
            component_type,
            component_type_label: component_type_label.clone(),
            group: solution_component_group(component_type).to_string(),
            display_name: format!(
                "{component_type_label} {}",
                &object_id[..object_id.len().min(8)]
            ),
            logical_name: None,
            schema_name: None,
            is_managed: None,
            created_on: None,
            modified_on: None,
            root_component_behavior: None,
            root_component_behavior_label: None,
            root_solution_component_id: None,
            version: None,
            related_entity_logical_name: None,
            related_record_url: None,
            layer_name: None,
        }
    }

    #[test]
    fn choice_detail_uses_localized_display_name() {
        let mut component = unresolved_component(9, "f0b2b9ab-358e-f011-b4cb-7c1e5274b002");
        let value = serde_json::json!({
          "MetadataId": "f0b2b9ab-358e-f011-b4cb-7c1e5274b002",
          "Name": "new_priority",
          "DisplayName": {
            "UserLocalizedLabel": {
              "Label": "Priority Choice"
            }
          },
          "IsManaged": false
        });

        apply_choice_detail(&mut component, &value);

        assert_eq!(component.display_name, "Priority Choice");
        assert_eq!(component.logical_name.as_deref(), Some("new_priority"));
        assert_eq!(component.schema_name.as_deref(), Some("new_priority"));
        assert_eq!(component.is_managed, Some(false));
    }

    #[test]
    fn solution_component_uses_formatted_component_type_label() {
        let value = serde_json::json!({
          "solutioncomponentid": "34256d77-168e-f011-b4cc-000d3abecbb6",
          "_solutionid_value": "833837cc-138b-f011-b4cc-6045bda046d5",
          "objectid": "32256d77-168e-f011-b4cc-000d3abecbb6",
          "componenttype": 10121,
          "componenttype@OData.Community.Display.V1.FormattedValue": "Connection Reference",
          "rootcomponentbehavior": 0
        });

        let component = solution_component_from_value(&value).expect("component");

        assert_eq!(component.component_type_label, "Connection Reference");
        assert_eq!(component.group, "Connectors");
    }

    #[test]
    fn component_layer_name_replaces_guid_fallback() {
        let mut component = unresolved_component(300, "12d32574-be85-4776-8649-770e5f5ab70d");
        let value = serde_json::json!({
          "msdyn_componentid": "12d32574-be85-4776-8649-770e5f5ab70d",
          "msdyn_solutioncomponentname": "Inspection Canvas App",
          "msdyn_name": "Canvas App 12d32574"
        });

        assert!(component_needs_display_name(&component));
        if let Some(display_name) = layer_display_name(&value) {
            component.display_name = display_name.clone();
            component.logical_name = Some(display_name.clone());
            component.layer_name = Some(display_name);
        }

        assert_eq!(component.display_name, "Inspection Canvas App");
        assert_eq!(
            component.logical_name.as_deref(),
            Some("Inspection Canvas App")
        );
        assert!(!component_needs_display_name(&component));
    }

    #[test]
    fn component_layer_fallback_repairs_visible_name_when_logical_name_exists() {
        let mut component = unresolved_component(64, "12d32574-be85-4776-8649-770e5f5ab70d");
        component.logical_name = Some("new_component_library".to_string());
        let value = serde_json::json!({
          "msdyn_componentid": "12d32574-be85-4776-8649-770e5f5ab70d",
          "msdyn_solutioncomponentname": "Inspection Component Library",
          "msdyn_name": "Complex Control 12d32574"
        });

        assert!(component_needs_display_name(&component));
        if let Some(display_name) = layer_display_name(&value) {
            component.display_name = display_name.clone();
            if component.logical_name.is_none() {
                component.logical_name = Some(display_name.clone());
            }
            component.layer_name = Some(display_name);
        }

        assert_eq!(component.display_name, "Inspection Component Library");
        assert_eq!(
            component.logical_name.as_deref(),
            Some("new_component_library")
        );
        assert_eq!(
            component.layer_name.as_deref(),
            Some("Inspection Component Library")
        );
        assert!(!component_needs_display_name(&component));
    }

    #[test]
    fn component_layer_name_reads_component_json_display_name() {
        let value = serde_json::json!({
          "msdyn_componentid": "12d32574-be85-4776-8649-770e5f5ab70d",
          "msdyn_name": "Canvas App 12d32574",
          "msdyn_componentjson": serde_json::json!({
            "component": {
              "DisplayName": {
                "UserLocalizedLabel": {
                  "Label": "Inspection Canvas App"
                }
              },
              "LogicalName": "inspection_canvas_app"
            }
          }).to_string()
        });

        assert_eq!(
            layer_display_name(&value).as_deref(),
            Some("Inspection Canvas App")
        );
    }

    #[test]
    fn root_component_name_repairs_unresolved_child_name() {
        let mut root = unresolved_component(80, "d81796a9-c08b-f011-b4cc-6045bd9a4052");
        root.id = "df1796a9-c08b-f011-b4cc-6045bd9a4052".to_string();
        root.display_name = "Task Management".to_string();
        root.logical_name = Some("sc_taskmanagement".to_string());

        let mut child = unresolved_component(10075, "d91796a9-c08b-f011-b4cc-6045bd9a4052");
        child.root_solution_component_id = Some("df1796a9-c08b-f011-b4cc-6045bd9a4052".to_string());

        let mut components = vec![root, child];
        enrich_components_from_roots(&mut components);

        assert_eq!(components[1].display_name, "Task Management App Component");
        assert_eq!(
            components[1].logical_name.as_deref(),
            Some("sc_taskmanagement")
        );
        assert_eq!(components[1].layer_name.as_deref(), Some("Task Management"));
    }

    #[test]
    fn form_logic_bindings_add_library_and_handlers() {
        let form_xml = r#"<form><tabs><tab><columns><column><sections><section><rows><row><cell><control id="statuscode" datafieldname="statuscode"></control></cell></row></rows></section></sections></column></columns></tab></tabs></form>"#;
        let bindings = vec![
            FormLogicBindingInput {
                event_name: "onload".to_string(),
                event_label: "Form OnLoad".to_string(),
                attribute_logical_name: None,
                handler: "OpenDataverse.AccountFormLogic.onLoad".to_string(),
                pass_execution_context: true,
            },
            FormLogicBindingInput {
                event_name: "onchange".to_string(),
                event_label: "OnChange".to_string(),
                attribute_logical_name: Some("statuscode".to_string()),
                handler: "OpenDataverse.AccountFormLogic.onStatusChange".to_string(),
                pass_execution_context: true,
            },
        ];

        let (updated, applied) =
            apply_form_logic_bindings(form_xml, "new_accountformlogic.js", &bindings)
                .expect("bindings should patch form xml");

        assert_eq!(applied, 2);
        assert!(updated
            .contains(r#"<formLibraries><Library name="$webresource:new_accountformlogic.js""#));
        assert!(updated.contains(r#"<event name="onload" application="false"><Handlers><Handler functionName="OpenDataverse.AccountFormLogic.onLoad""#));
        assert!(updated.contains(r#"<control id="statuscode" datafieldname="statuscode"><events><event name="onchange" application="false"><Handlers><Handler functionName="OpenDataverse.AccountFormLogic.onStatusChange""#));
    }

    #[test]
    fn form_logic_bindings_skip_onchange_when_field_is_not_on_form() {
        let form_xml = r#"<form><tabs><tab><columns><column><sections><section><rows><row><cell><control id="name" datafieldname="name"></control></cell></row></rows></section></sections></column></columns></tab></tabs></form>"#;
        let bindings = vec![
            FormLogicBindingInput {
                event_name: "onload".to_string(),
                event_label: "Form OnLoad".to_string(),
                attribute_logical_name: None,
                handler: "OpenDataverse.AccountFormLogic.onLoad".to_string(),
                pass_execution_context: true,
            },
            FormLogicBindingInput {
                event_name: "onchange".to_string(),
                event_label: "OnChange".to_string(),
                attribute_logical_name: Some("statuscode".to_string()),
                handler: "OpenDataverse.AccountFormLogic.onStatusChange".to_string(),
                pass_execution_context: true,
            },
        ];

        let (updated, applied) =
            apply_form_logic_bindings(form_xml, "new_accountformlogic.js", &bindings)
                .expect("missing field controls should be skipped");

        assert_eq!(applied, 1);
        assert!(updated.contains(r#"<event name="onload" application="false"><Handlers><Handler functionName="OpenDataverse.AccountFormLogic.onLoad""#));
        assert!(!updated.contains("OpenDataverse.AccountFormLogic.onStatusChange"));
    }

    #[test]
    fn form_logic_bindings_expand_self_closing_controls_for_onchange() {
        let form_xml = r#"<form><tabs><tab><columns><column><sections><section><rows><row><cell><control id="statuscode" datafieldname="statuscode" /></cell></row></rows></section></sections></column></columns></tab></tabs></form>"#;
        let bindings = vec![FormLogicBindingInput {
            event_name: "onchange".to_string(),
            event_label: "OnChange".to_string(),
            attribute_logical_name: Some("statuscode".to_string()),
            handler: "OpenDataverse.AccountFormLogic.onStatusChange".to_string(),
            pass_execution_context: true,
        }];

        let (updated, applied) =
            apply_form_logic_bindings(form_xml, "new_accountformlogic.js", &bindings)
                .expect("self-closing controls should be expanded");

        assert_eq!(applied, 1);
        assert!(updated.contains(r#"<control id="statuscode" datafieldname="statuscode"><events><event name="onchange" application="false"><Handlers><Handler functionName="OpenDataverse.AccountFormLogic.onStatusChange""#));
    }

    #[test]
    fn documented_component_types_have_resolution_strategy() {
        let specs = component_detail_specs();
        let covered_types = specs
            .iter()
            .flat_map(|spec| spec.component_types.iter().copied())
            .collect::<HashSet<_>>();
        let documented_types = DOCUMENTED_SOLUTION_COMPONENT_TYPES
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        let mut strategy_types = covered_types.clone();
        strategy_types.extend(CHOICE_COMPONENT_TYPES.iter().copied());
        strategy_types.extend(COMPONENT_LAYER_FALLBACK_COMPONENT_TYPES.iter().copied());

        for component_type in DOCUMENTED_SOLUTION_COMPONENT_TYPES {
            assert_ne!(
                solution_component_type_label(*component_type),
                "Component",
                "missing label for documented component type {component_type}"
            );
            assert!(
                strategy_types.contains(component_type),
                "missing resolver strategy for documented component type {component_type}"
            );
        }

        for component_type in LIVE_OBSERVED_SOLUTION_COMPONENT_TYPES {
            assert_ne!(
                solution_component_type_label(*component_type),
                "Component",
                "missing label for live-observed component type {component_type}"
            );
            assert!(
                strategy_types.contains(component_type),
                "missing resolver strategy for live-observed component type {component_type}"
            );
        }

        assert!(documented_types.is_subset(&strategy_types));
    }
}
