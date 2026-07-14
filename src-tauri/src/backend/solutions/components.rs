use super::super::{
    dataverse::{
        dataverse_get_collection_values, dataverse_get_collection_values_with_headers,
        dataverse_get_json_value, json_bool, json_i32, json_i64, json_string, localized_label,
        normalize_org_url, odata_string_literal,
    },
    storage::DataverseEnvironment,
};
use super::{
    SolutionComponentSummary, SolutionDependencyItem, SolutionLayer, WEB_RESOURCE_COMPONENT_TYPE,
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    time::Duration,
};
use tauri::AppHandle;
use tokio::task::JoinSet;
use url::form_urlencoded;

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

fn solution_component_type_label(component_type: i32) -> &'static str {
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

fn solution_component_group(component_type: i32) -> &'static str {
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
        31..=34 => "Reports",
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

fn dependency_type_label(dependency_type: i32) -> &'static str {
    match dependency_type {
        1 => "Solution Internal",
        2 => "Published",
        4 => "Unpublished",
        _ => "None",
    }
}

fn root_component_behavior_label(value: Option<i32>) -> Option<String> {
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

fn dataverse_record_url(
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

fn apply_table_detail(component: &mut SolutionComponentSummary, value: &Value) {
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

fn apply_choice_detail(component: &mut SolutionComponentSummary, value: &Value) {
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

fn apply_table_row_detail(
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

async fn enrich_choice_components(
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

async fn enrich_component_layers(
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

fn enrich_components_from_roots(components: &mut [SolutionComponentSummary]) {
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

fn dependency_item_from_value(value: &Value) -> Option<SolutionDependencyItem> {
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
#[cfg(test)]
mod tests {
    use super::*;

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
