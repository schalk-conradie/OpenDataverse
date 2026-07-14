use super::super::dataverse::{
    json_bool, json_expanded_string, json_i32, json_lookup_id, json_string,
};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginOptionSummary {
    value: i32,
    label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginEditableState {
    can_edit: bool,
    can_delete: bool,
    reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginAssemblySummary {
    id: String,
    name: String,
    version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    culture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    public_key_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size_bytes: Option<i64>,
    isolation_mode: i32,
    isolation_mode_label: String,
    source_type: i32,
    source_type_label: String,
    is_managed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_customizable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_name: Option<String>,
    editable: PluginEditableState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginPackageSummary {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_type: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_type_label: Option<String>,
    is_managed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    editable: PluginEditableState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginTypeSummary {
    id: String,
    assembly_id: String,
    assembly_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_name: Option<String>,
    name: String,
    friendly_name: String,
    type_name: String,
    is_workflow_activity: bool,
    is_managed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_customizable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    editable: PluginEditableState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginStepSummary {
    id: String,
    name: String,
    handler_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    plugin_type_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    plugin_type_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    service_endpoint_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    service_endpoint_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assembly_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assembly_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_name: Option<String>,
    message_id: String,
    message_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message_filter_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    primary_entity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secondary_entity: Option<String>,
    stage: i32,
    stage_label: String,
    mode: i32,
    mode_label: String,
    rank: i32,
    supported_deployment: i32,
    supported_deployment_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    async_auto_delete: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    filtering_attributes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    configuration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secure_config_id: Option<String>,
    has_secure_config: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    impersonating_user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    impersonating_user_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    is_managed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_customizable: Option<bool>,
    state_code: i32,
    status_code: i32,
    status_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    editable: PluginEditableState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginStepImageSummary {
    id: String,
    step_id: String,
    step_name: String,
    name: String,
    entity_alias: String,
    image_type: i32,
    image_type_label: String,
    message_property_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    attributes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    is_managed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_customizable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    editable: PluginEditableState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginMessageSummary {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginMessageFilterSummary {
    id: String,
    message_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    primary_entity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secondary_entity: Option<String>,
    is_custom_processing_step_allowed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginServiceEndpointSummary {
    id: String,
    name: String,
    contract: i32,
    contract_label: String,
    auth_type: i32,
    auth_type_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    namespace_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message_format: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message_format_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_auth_value_set: Option<bool>,
    is_managed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_on: Option<String>,
    editable: PluginEditableState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginSystemUserSummary {
    id: String,
    full_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain_name: Option<String>,
    is_disabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::backend) struct PluginRegistrationSnapshot {
    pub(super) assemblies: Vec<PluginAssemblySummary>,
    pub(super) packages: Vec<PluginPackageSummary>,
    pub(super) types: Vec<PluginTypeSummary>,
    pub(super) steps: Vec<PluginStepSummary>,
    pub(super) images: Vec<PluginStepImageSummary>,
    pub(super) messages: Vec<PluginMessageSummary>,
    pub(super) endpoints: Vec<PluginServiceEndpointSummary>,
    pub(super) users: Vec<PluginSystemUserSummary>,
    pub(super) stage_options: Vec<PluginOptionSummary>,
    pub(super) mode_options: Vec<PluginOptionSummary>,
    pub(super) deployment_options: Vec<PluginOptionSummary>,
    pub(super) isolation_mode_options: Vec<PluginOptionSummary>,
    pub(super) source_type_options: Vec<PluginOptionSummary>,
    pub(super) image_type_options: Vec<PluginOptionSummary>,
    pub(super) endpoint_contract_options: Vec<PluginOptionSummary>,
    pub(super) endpoint_auth_type_options: Vec<PluginOptionSummary>,
    pub(super) warnings: Vec<String>,
}

fn plugin_option(value: i32, label: &str) -> PluginOptionSummary {
    PluginOptionSummary {
        value,
        label: label.to_string(),
    }
}

fn plugin_stage_label(value: i32) -> &'static str {
    match value {
        5 => "Initial Pre-operation",
        10 => "Pre-validation",
        15 => "Internal Pre-operation Before External Plugins",
        20 => "Pre-operation",
        25 => "Internal Pre-operation After External Plugins",
        30 => "Main Operation",
        35 => "Internal Post-operation Before External Plugins",
        40 => "Post-operation",
        45 => "Internal Post-operation After External Plugins",
        50 => "Post-operation Deprecated",
        55 => "Final Post-operation",
        80 => "Pre-Commit",
        90 => "Post-Commit",
        _ => "Unknown",
    }
}

fn plugin_mode_label(value: i32) -> &'static str {
    match value {
        0 => "Synchronous",
        1 => "Asynchronous",
        _ => "Unknown",
    }
}

fn plugin_deployment_label(value: i32) -> &'static str {
    match value {
        0 => "Server Only",
        1 => "Outlook Only",
        2 => "Both",
        _ => "Unknown",
    }
}

fn plugin_isolation_label(value: i32) -> &'static str {
    match value {
        1 => "None",
        2 => "Sandbox",
        _ => "Unknown",
    }
}

fn plugin_source_type_label(value: i32) -> &'static str {
    match value {
        0 => "Database",
        1 => "Disk",
        2 => "Normal",
        _ => "Unknown",
    }
}

fn plugin_image_type_label(value: i32) -> &'static str {
    match value {
        0 => "PreImage",
        1 => "PostImage",
        2 => "Both",
        _ => "Unknown",
    }
}

fn plugin_endpoint_contract_label(value: i32) -> &'static str {
    match value {
        1 => "OneWay",
        2 => "Queue",
        3 => "Rest",
        4 => "TwoWay",
        5 => "Topic",
        6 => "Queue (Persistent)",
        7 => "Event Hub",
        8 => "Webhook",
        9 => "Event Grid",
        10 => "Managed Data Lake",
        11 => "Container Storage",
        _ => "Unknown",
    }
}

fn plugin_endpoint_auth_type_label(value: i32) -> &'static str {
    match value {
        0 => "Not Specified",
        1 => "ACS",
        2 => "SAS Key",
        3 => "SAS Token",
        4 => "Webhook Key",
        5 => "Http Header",
        6 => "Http Query String",
        7 => "Connection String",
        8 => "Access Key",
        9 => "Managed Identity",
        _ => "Unknown",
    }
}

fn plugin_message_format_label(value: i32) -> &'static str {
    match value {
        1 => "Binary XML",
        2 => "Json",
        3 => "Text XML",
        _ => "Unknown",
    }
}

fn plugin_status_label(state_code: i32, status_code: i32) -> &'static str {
    match (state_code, status_code) {
        (0, 1) => "Enabled",
        (1, 2) => "Disabled",
        _ => "Unknown",
    }
}

pub(super) fn plugin_options_stage() -> Vec<PluginOptionSummary> {
    [10, 20, 40]
        .into_iter()
        .map(|value| plugin_option(value, plugin_stage_label(value)))
        .collect()
}

pub(super) fn plugin_options_mode() -> Vec<PluginOptionSummary> {
    [0, 1]
        .into_iter()
        .map(|value| plugin_option(value, plugin_mode_label(value)))
        .collect()
}

pub(super) fn plugin_options_deployment() -> Vec<PluginOptionSummary> {
    [0, 1, 2]
        .into_iter()
        .map(|value| plugin_option(value, plugin_deployment_label(value)))
        .collect()
}

pub(super) fn plugin_options_isolation() -> Vec<PluginOptionSummary> {
    [1, 2]
        .into_iter()
        .map(|value| plugin_option(value, plugin_isolation_label(value)))
        .collect()
}

pub(super) fn plugin_options_source_type() -> Vec<PluginOptionSummary> {
    [0, 1, 2]
        .into_iter()
        .map(|value| plugin_option(value, plugin_source_type_label(value)))
        .collect()
}

pub(super) fn plugin_options_image_type() -> Vec<PluginOptionSummary> {
    [0, 1, 2]
        .into_iter()
        .map(|value| plugin_option(value, plugin_image_type_label(value)))
        .collect()
}

pub(super) fn plugin_options_endpoint_contract() -> Vec<PluginOptionSummary> {
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
        .into_iter()
        .map(|value| plugin_option(value, plugin_endpoint_contract_label(value)))
        .collect()
}

pub(super) fn plugin_options_endpoint_auth_type() -> Vec<PluginOptionSummary> {
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        .into_iter()
        .map(|value| plugin_option(value, plugin_endpoint_auth_type_label(value)))
        .collect()
}

fn plugin_editable_state(
    is_managed: bool,
    is_customizable: Option<bool>,
    name: &str,
) -> PluginEditableState {
    let mut reasons = Vec::new();
    let lower = name.to_lowercase();

    if is_managed {
        reasons.push("Managed component".to_string());
    }

    if is_customizable == Some(false) {
        reasons.push("Component is not customizable".to_string());
    }

    if ["microsoft", "msdyn", "mscrm"]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
    {
        reasons.push("Microsoft component".to_string());
    }

    PluginEditableState {
        can_edit: reasons.is_empty(),
        can_delete: reasons.is_empty(),
        reasons,
    }
}
pub(super) fn plugin_assembly_from_value(value: &Value) -> Option<PluginAssemblySummary> {
    let id = json_string(value, "pluginassemblyid")?;
    let name = json_string(value, "name").unwrap_or_else(|| "Assembly".to_string());
    let isolation_mode = json_i32(value, "isolationmode").unwrap_or(2);
    let source_type = json_i32(value, "sourcetype").unwrap_or(0);
    let is_managed = json_bool(value, "ismanaged").unwrap_or(false);
    let is_customizable = json_bool(value, "iscustomizable");
    let package_id = json_lookup_id(value, "packageid");
    let package_name = json_expanded_string(value, "packageid", "name")
        .or_else(|| json_expanded_string(value, "PackageId", "name"));
    let editable = plugin_editable_state(is_managed, is_customizable, &name);

    Some(PluginAssemblySummary {
        id,
        name,
        version: json_string(value, "version").unwrap_or_default(),
        culture: json_string(value, "culture"),
        public_key_token: json_string(value, "publickeytoken"),
        file_name: json_string(value, "path"),
        file_hash: json_string(value, "sourcehash"),
        size_bytes: None,
        isolation_mode,
        isolation_mode_label: plugin_isolation_label(isolation_mode).to_string(),
        source_type,
        source_type_label: plugin_source_type_label(source_type).to_string(),
        is_managed,
        is_customizable,
        description: json_string(value, "description"),
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        package_id,
        package_name,
        editable,
    })
}

pub(super) fn plugin_package_from_value(value: &Value) -> Option<PluginPackageSummary> {
    let id = json_string(value, "pluginpackageid")?;
    let name = json_string(value, "name").unwrap_or_else(|| "Package".to_string());
    let is_managed = json_bool(value, "ismanaged").unwrap_or(false);
    let is_customizable = json_bool(value, "iscustomizable");
    let package_type = json_i32(value, "plugintype");
    let editable = plugin_editable_state(is_managed, is_customizable, &name);

    Some(PluginPackageSummary {
        id,
        name,
        version: json_string(value, "version"),
        file_name: json_string(value, "package_name"),
        package_type,
        package_type_label: package_type.map(|value| format!("Type {value}")),
        is_managed,
        description: json_string(value, "description"),
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        editable,
    })
}

pub(super) fn plugin_type_from_value(value: &Value) -> Option<PluginTypeSummary> {
    let id = json_string(value, "plugintypeid")?;
    let type_name = json_string(value, "typename")
        .or_else(|| json_string(value, "name"))
        .unwrap_or_else(|| "Plugin Type".to_string());
    let name = json_string(value, "name").unwrap_or_else(|| type_name.clone());
    let friendly_name = json_string(value, "friendlyname").unwrap_or_else(|| name.clone());
    let assembly_id = json_lookup_id(value, "pluginassemblyid").unwrap_or_default();
    let assembly_name = json_expanded_string(value, "pluginassemblyid", "name")
        .unwrap_or_else(|| "Assembly".to_string());
    let package_id = value
        .get("pluginassemblyid")
        .and_then(|assembly| json_lookup_id(assembly, "packageid"));
    let package_name = value.get("pluginassemblyid").and_then(|assembly| {
        json_expanded_string(assembly, "packageid", "name")
            .or_else(|| json_expanded_string(assembly, "PackageId", "name"))
    });
    let is_managed = json_bool(value, "ismanaged").unwrap_or(false);
    let is_customizable = json_bool(value, "iscustomizable");
    let editable = plugin_editable_state(is_managed, is_customizable, &type_name);

    Some(PluginTypeSummary {
        id,
        assembly_id,
        assembly_name,
        package_id,
        package_name,
        name,
        friendly_name,
        type_name,
        is_workflow_activity: json_bool(value, "isworkflowactivity").unwrap_or(false),
        is_managed,
        is_customizable,
        description: json_string(value, "description"),
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        editable,
    })
}

pub(super) fn plugin_step_from_value(value: &Value) -> Option<PluginStepSummary> {
    let id = json_string(value, "sdkmessageprocessingstepid")?;
    let name = json_string(value, "name").unwrap_or_else(|| "Step".to_string());
    let event_handler_id = json_lookup_id(value, "eventhandler");
    let plugin_type_id = json_lookup_id(value, "plugintypeid")
        .or_else(|| {
            value
                .get("eventhandler_plugintype")
                .and_then(|item| json_string(item, "plugintypeid"))
        })
        .or_else(|| event_handler_id.clone());
    let service_endpoint_id = value
        .get("eventhandler_serviceendpoint")
        .and_then(|item| json_string(item, "serviceendpointid"));
    let handler_type = if service_endpoint_id.is_some() {
        "serviceendpoint"
    } else {
        "plugintype"
    }
    .to_string();
    let plugin_type_name = value
        .get("plugintypeid")
        .and_then(|item| {
            json_string(item, "friendlyname").or_else(|| json_string(item, "typename"))
        })
        .or_else(|| {
            value.get("eventhandler_plugintype").and_then(|item| {
                json_string(item, "friendlyname").or_else(|| json_string(item, "typename"))
            })
        });
    let service_endpoint_name = value
        .get("eventhandler_serviceendpoint")
        .and_then(|item| json_string(item, "name"));
    let plugin_type_value = value
        .get("plugintypeid")
        .or_else(|| value.get("eventhandler_plugintype"));
    let assembly_id = plugin_type_value.and_then(|item| json_lookup_id(item, "pluginassemblyid"));
    let assembly_name =
        plugin_type_value.and_then(|item| json_expanded_string(item, "pluginassemblyid", "name"));
    let package_id = plugin_type_value
        .and_then(|item| item.get("pluginassemblyid"))
        .and_then(|assembly| json_lookup_id(assembly, "packageid"));
    let package_name = plugin_type_value
        .and_then(|item| item.get("pluginassemblyid"))
        .and_then(|assembly| {
            json_expanded_string(assembly, "packageid", "name")
                .or_else(|| json_expanded_string(assembly, "PackageId", "name"))
        });
    let message_id = json_lookup_id(value, "sdkmessageid").unwrap_or_default();
    let message_name = json_expanded_string(value, "sdkmessageid", "name")
        .unwrap_or_else(|| "Message".to_string());
    let message_filter_id = json_lookup_id(value, "sdkmessagefilterid");
    let filter_value = value.get("sdkmessagefilterid");
    let stage = json_i32(value, "stage").unwrap_or(20);
    let mode = json_i32(value, "mode").unwrap_or(0);
    let supported_deployment = json_i32(value, "supporteddeployment").unwrap_or(0);
    let state_code = json_i32(value, "statecode").unwrap_or(0);
    let status_code = json_i32(value, "statuscode").unwrap_or(if state_code == 0 { 1 } else { 2 });
    let is_managed = json_bool(value, "ismanaged").unwrap_or(false);
    let is_customizable = json_bool(value, "iscustomizable");
    let editable = plugin_editable_state(is_managed, is_customizable, &name);
    let secure_config_id = json_lookup_id(value, "sdkmessageprocessingstepsecureconfigid");
    let impersonating_user_id = json_lookup_id(value, "impersonatinguserid");
    let impersonating_user_name = json_expanded_string(value, "impersonatinguserid", "fullname");

    Some(PluginStepSummary {
        id,
        name,
        handler_type,
        plugin_type_id,
        plugin_type_name,
        service_endpoint_id,
        service_endpoint_name,
        assembly_id,
        assembly_name,
        package_id,
        package_name,
        message_id,
        message_name,
        message_filter_id,
        primary_entity: filter_value.and_then(|item| json_string(item, "primaryobjecttypecode")),
        secondary_entity: filter_value
            .and_then(|item| json_string(item, "secondaryobjecttypecode")),
        stage,
        stage_label: plugin_stage_label(stage).to_string(),
        mode,
        mode_label: plugin_mode_label(mode).to_string(),
        rank: json_i32(value, "rank").unwrap_or(1),
        supported_deployment,
        supported_deployment_label: plugin_deployment_label(supported_deployment).to_string(),
        async_auto_delete: json_bool(value, "asyncautodelete"),
        filtering_attributes: json_string(value, "filteringattributes"),
        configuration: json_string(value, "configuration"),
        secure_config_id: secure_config_id.clone(),
        has_secure_config: secure_config_id.is_some(),
        impersonating_user_id,
        impersonating_user_name,
        description: json_string(value, "description"),
        is_managed,
        is_customizable,
        state_code,
        status_code,
        status_label: plugin_status_label(state_code, status_code).to_string(),
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        editable,
    })
}

pub(super) fn plugin_step_image_from_value(value: &Value) -> Option<PluginStepImageSummary> {
    let id = json_string(value, "sdkmessageprocessingstepimageid")?;
    let name = json_string(value, "name").unwrap_or_else(|| "Image".to_string());
    let step_id = json_lookup_id(value, "sdkmessageprocessingstepid").unwrap_or_default();
    let step_name = json_expanded_string(value, "sdkmessageprocessingstepid", "name")
        .unwrap_or_else(|| "Step".to_string());
    let image_type = json_i32(value, "imagetype").unwrap_or(0);
    let is_managed = json_bool(value, "ismanaged").unwrap_or(false);
    let is_customizable = json_bool(value, "iscustomizable");
    let editable = plugin_editable_state(is_managed, is_customizable, &name);

    Some(PluginStepImageSummary {
        id,
        step_id,
        step_name,
        name,
        entity_alias: json_string(value, "entityalias").unwrap_or_else(|| "Image".to_string()),
        image_type,
        image_type_label: plugin_image_type_label(image_type).to_string(),
        message_property_name: json_string(value, "messagepropertyname")
            .unwrap_or_else(|| "Target".to_string()),
        attributes: json_string(value, "attributes"),
        description: json_string(value, "description"),
        is_managed,
        is_customizable,
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        editable,
    })
}

pub(super) fn plugin_message_from_value(value: &Value) -> Option<PluginMessageSummary> {
    Some(PluginMessageSummary {
        id: json_string(value, "sdkmessageid")?,
        name: json_string(value, "name").unwrap_or_else(|| "Message".to_string()),
    })
}

pub(super) fn plugin_message_filter_from_value(
    value: &Value,
) -> Option<PluginMessageFilterSummary> {
    Some(PluginMessageFilterSummary {
        id: json_string(value, "sdkmessagefilterid")?,
        message_id: json_lookup_id(value, "sdkmessageid").unwrap_or_default(),
        primary_entity: json_string(value, "primaryobjecttypecode"),
        secondary_entity: json_string(value, "secondaryobjecttypecode"),
        is_custom_processing_step_allowed: json_bool(value, "iscustomprocessingstepallowed")
            .unwrap_or(false),
    })
}

pub(super) fn plugin_endpoint_from_value(value: &Value) -> Option<PluginServiceEndpointSummary> {
    let id = json_string(value, "serviceendpointid")?;
    let name = json_string(value, "name").unwrap_or_else(|| "Service Endpoint".to_string());
    let contract = json_i32(value, "contract").unwrap_or(8);
    let auth_type = json_i32(value, "authtype").unwrap_or(0);
    let message_format = json_i32(value, "messageformat");
    let is_managed = json_bool(value, "ismanaged").unwrap_or(false);
    let is_customizable = json_bool(value, "iscustomizable");
    let editable = plugin_editable_state(is_managed, is_customizable, &name);

    Some(PluginServiceEndpointSummary {
        id,
        name,
        contract,
        contract_label: plugin_endpoint_contract_label(contract).to_string(),
        auth_type,
        auth_type_label: plugin_endpoint_auth_type_label(auth_type).to_string(),
        url: json_string(value, "url"),
        path: json_string(value, "path"),
        namespace_address: json_string(value, "namespaceaddress"),
        message_format,
        message_format_label: message_format
            .map(|value| plugin_message_format_label(value).to_string()),
        is_auth_value_set: json_bool(value, "isauthvalueset"),
        is_managed,
        description: json_string(value, "description"),
        created_on: json_string(value, "createdon"),
        modified_on: json_string(value, "modifiedon"),
        editable,
    })
}

pub(super) fn plugin_user_from_value(value: &Value) -> Option<PluginSystemUserSummary> {
    Some(PluginSystemUserSummary {
        id: json_string(value, "systemuserid")?,
        full_name: json_string(value, "fullname").unwrap_or_else(|| "User".to_string()),
        domain_name: json_string(value, "domainname"),
        is_disabled: json_bool(value, "isdisabled").unwrap_or(false),
    })
}

pub(super) fn reject_read_only_component(value: &Value, display_name: &str) -> Result<(), String> {
    let is_managed = json_bool(value, "ismanaged").unwrap_or(false);
    let is_customizable = json_bool(value, "iscustomizable");
    let editable = plugin_editable_state(is_managed, is_customizable, display_name);

    if editable.can_edit && editable.can_delete {
        return Ok(());
    }

    Err(format!(
        "{} cannot be changed: {}",
        display_name,
        editable.reasons.join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        plugin_editable_state, plugin_endpoint_contract_label, plugin_image_type_label,
        plugin_mode_label, plugin_stage_label,
    };

    #[test]
    fn maps_core_option_labels() {
        assert_eq!(plugin_stage_label(20), "Pre-operation");
        assert_eq!(plugin_mode_label(1), "Asynchronous");
        assert_eq!(plugin_image_type_label(2), "Both");
        assert_eq!(plugin_endpoint_contract_label(8), "Webhook");
    }

    #[test]
    fn marks_managed_components_read_only() {
        let editable = plugin_editable_state(true, Some(true), "Contoso.Plugin");

        assert!(!editable.can_edit);
        assert!(!editable.can_delete);
        assert!(editable
            .reasons
            .iter()
            .any(|reason| reason == "Managed component"));
    }
}
